import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { apiLimiter, authLimiter, pricingLimiter, uploadLimiter } from "./middleware/rateLimiter";

import { validateConfig } from "./utils/validateConfig";
import { seedDefaultAgentConfigs } from "./routes/agents";
import { seedCommercialFormConfig } from "./routes/commercialIntake";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { seedSuperAdmins } from "./seedAdmins";
import { seedInquiryFormTemplates, registerInquiryFormRoutes } from "./routes/inquiryForms";
import { initializePIIContext, autoDecryptResponseMiddleware } from "./middleware/piiDecryption";
import { setupOrchestrationWebSocket } from "./websocket/orchestrationEvents";
const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

setupOrchestrationWebSocket(httpServer);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://unpkg.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' https:; " +
      "worker-src 'self' blob:; " +
      "frame-ancestors 'none'"
    );
  }
  next();
});

// Make db available on app.locals for middleware
app.locals.db = db;

// PII encryption middleware
app.use(initializePIIContext);
app.use(autoDecryptResponseMiddleware);

// Rate limiting - applied globally to all /api routes
app.use('/api/', apiLimiter);
// Stricter limits on auth endpoints (brute force protection)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
// Stricter limits on pricing (expensive compute)
app.use('/api/pricing/', pricingLimiter);
// Upload rate limiting
app.use((req: Request, _res: Response, next: Function) => {
  if (req.path.startsWith('/api/') && req.path.includes('/upload')) {
    return uploadLimiter(req, _res, next);
  }
  next();
});

// Landing mode guard — blocks unauthenticated API access except auth/subscribe/health
const siteMode = process.env.SITE_MODE || 'full';
if (siteMode === 'landing') {
  console.log('🚧 Site running in LANDING mode — API routes restricted');
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api')) return next();
    if (req.path === '/api/subscribe') return next();
    if (req.path === '/api/health') return next();
    if (req.path.startsWith('/api/auth/')) return next();
    if (req.path.startsWith('/api/sign/')) return next();
    if (req.path.startsWith('/api/portal/')) return next();
    if (req.path.startsWith('/api/resolve-portal/')) return next();
    if (req.path.startsWith('/api/join/')) return next();
    if (req.path.startsWith('/api/broker-portal/')) return next();
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    if (token) return next();
    return res.status(403).json({ error: 'Site is in preview mode' });
  });
}

// Health check endpoint (no auth required)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});


export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Sanitize sensitive data from logs
        const sanitized = { ...capturedJsonResponse };
        const sensitiveKeys = ['token', 'password', 'passwordHash', 'secret', 'googleAccessToken', 'googleRefreshToken', 'apiKey'];
        for (const key of sensitiveKeys) {
          if (key in sanitized) sanitized[key] = '[REDACTED]';
        }
        if (sanitized.user && typeof sanitized.user === 'object') {
          const sanitizedUser = { ...sanitized.user };
          for (const key of sensitiveKeys) {
            if (key in sanitizedUser) (sanitizedUser as any)[key] = '[REDACTED]';
          }
          sanitized.user = sanitizedUser;
        }
        const jsonStr = JSON.stringify(sanitized);
        logLine += ` :: ${jsonStr.length > 500 ? jsonStr.substring(0, 500) + '...[truncated]' : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate environment configuration before starting
  validateConfig();

  await registerRoutes(httpServer, app);

  // Auto-seed default agent configurations (master orchestration baseline)
  try {
    await seedDefaultAgentConfigs(db);
  } catch (err) {
    console.error('⚠️ Failed to auto-seed agent configs:', err);
  }

  // Seed commercial form config defaults for tenants that don't have any fields yet
  try {
    await seedCommercialFormConfig();
  } catch (err) {
    console.error('⚠️ Failed to seed commercial form config:', err);
  }

  // Register inquiry form routes and seed templates
  registerInquiryFormRoutes(app);
  try {
    await seedInquiryFormTemplates();
  } catch (err) {
    console.error('⚠️ Failed to seed inquiry form templates:', err);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    // Cache static assets with versioned filenames
    app.use('/assets', (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      next();
    });
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  await seedSuperAdmins();

  try {
    await db.execute(sql`ALTER TABLE workflow_step_definitions ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#6366f1'`);
    await db.execute(sql`ALTER TABLE program_workflow_steps ADD COLUMN IF NOT EXISTS color TEXT`);
  } catch (e) {
    // Columns may already exist
  }

  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS pricing_field_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      text_inputs JSONB,
      dropdowns JSONB,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
  } catch (e) {
    // Table may already exist
  }

  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS document_download_tokens (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  } catch (e) {
    // Table may already exist
  }

  const { backfillTenantIds } = await import('./utils/backfill-tenants');
  await backfillTenantIds();

  setTimeout(async () => {
    try {
      const { backfillEmbeddings } = await import('./services/embeddings');
      const result = await backfillEmbeddings();
      if (result.knowledgeCount > 0 || result.fundCount > 0) {
        console.log(`[Startup Embeddings] Backfilled ${result.knowledgeCount} knowledge entries, ${result.fundCount} fund descriptions (${result.errors} errors)`);
      }
    } catch (err) {
      console.warn("[Startup Embeddings] Background backfill skipped:", (err as Error).message);
    }
  }, 5000);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      import('./services/pandadocSync').then(({ startPolling }) => {
        startPolling();
      }).catch(err => {
        console.error('Failed to start PandaDoc polling:', err);
      });
      import('./services/emailDocCheck').then(({ startEmailDocCheckPolling }) => {
        startEmailDocCheckPolling();
      }).catch(err => {
        console.error('Failed to start email doc check polling:', err);
      });
    },
  );
})();

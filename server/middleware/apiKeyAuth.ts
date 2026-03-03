import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  lookupAPIKey,
  isAPIKeyValid,
  validateScopes,
  checkRateLimit,
  updateKeyLastUsed,
  logAPIKeyUsage,
  extractAPIKeyFromHeader,
} from '../utils/apiKeys';
import { logAuditAction } from '../utils/audit';

/**
 * API Key Authentication Middleware
 *
 * Authenticates API key from Authorization header and:
 * 1. Validates key format and existence
 * 2. Checks if key is revoked/expired
 * 3. Enforces rate limiting
 * 4. Logs usage for audit trail
 * 5. Sets request context (req.apiKey, req.apiKeyScopes)
 */

export interface APIKeyRequestContext {
  apiKeyId: string;
  userId: string;
  scopes: string[];
  keyPreview: string;
  requestId: string;
  startTime: number;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      apiKey?: APIKeyRequestContext;
    }
  }
}

/**
 * Authenticate API key from Authorization header
 *
 * Usage:
 *   app.use(authenticateAPIKey)
 *   app.get('/api/data', requireAPIKeyScope('data:read'), handler)
 */
export async function authenticateAPIKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const keyPlaintext = extractAPIKeyFromHeader(authHeader);

  // Continue without API key (user auth will be checked later)
  if (!keyPlaintext) {
    return next();
  }

  const requestId = uuidv4();

  try {
    // Lookup API key
    const apiKey = await lookupAPIKey(keyPlaintext);

    if (!apiKey) {
      await logAPIKeyUsage({
        apiKeyId: 'unknown',
        endpoint: `${req.method} ${req.path}`,
        method: req.method,
        statusCode: 401,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        scopeRequired: [],
        scopeGranted: [],
        authorized: false,
        errorMessage: 'Invalid API key',
        requestId,
      });

      return res.status(401).json({
        error: 'invalid_api_key',
        message: 'The provided API key is invalid or does not exist.',
        request_id: requestId,
      });
    }

    // Check if key is valid (not revoked, not expired)
    if (!isAPIKeyValid(apiKey)) {
      const reason = apiKey.revokedAt ? 'revoked' : 'expired';

      await logAPIKeyUsage({
        apiKeyId: apiKey.id,
        endpoint: `${req.method} ${req.path}`,
        method: req.method,
        statusCode: 401,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        scopeRequired: [],
        scopeGranted: apiKey.scopes,
        authorized: false,
        errorMessage: `API key is ${reason}`,
        requestId,
      });

      return res.status(401).json({
        error: 'api_key_invalid',
        message: `The API key has been ${reason}.`,
        request_id: requestId,
      });
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(apiKey.id, apiKey.rateLimitPerMinute);

    if (!rateLimitResult.allowed) {
      await logAPIKeyUsage({
        apiKeyId: apiKey.id,
        endpoint: `${req.method} ${req.path}`,
        method: req.method,
        statusCode: 429,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        scopeRequired: [],
        scopeGranted: apiKey.scopes,
        authorized: false,
        errorMessage: 'Rate limit exceeded',
        requestId,
      });

      res.set('Retry-After', String(rateLimitResult.retryAfter || 60));

      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `API key rate limit exceeded. Limit: ${apiKey.rateLimitPerMinute} requests/minute.`,
        retry_after: rateLimitResult.retryAfter,
        request_id: requestId,
      });
    }

    // Set API key context on request
    req.apiKey = {
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      scopes: apiKey.scopes,
      keyPreview: apiKey.keyPreview,
      requestId,
      startTime: Date.now(),
    };

    // Log the usage after request completes
    const originalSend = res.send;
    res.send = function (data: any) {
      // Update last used
      updateKeyLastUsed(apiKey.id).catch((err) => {
        console.error('Failed to update API key last_used_at:', err);
      });

      // Log usage
      logAPIKeyUsage({
        apiKeyId: apiKey.id,
        endpoint: `${req.method} ${req.path}`,
        method: req.method,
        statusCode: res.statusCode,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        scopeRequired: [],
        scopeGranted: apiKey.scopes,
        authorized: true,
        requestId,
        responseTimeMs: Date.now() - req.apiKey!.startTime,
      }).catch((err) => {
        console.error('Failed to log API key usage:', err);
      });

      res.send = originalSend;
      return originalSend.call(this, data);
    };

    next();
  } catch (error) {
    console.error('API key authentication error:', error);

    return res.status(500).json({
      error: 'internal_error',
      message: 'An error occurred while authenticating the API key.',
      request_id: requestId,
    });
  }
}

/**
 * Middleware to require specific scopes
 *
 * Usage:
 *   app.get('/api/sensitive-data', requireAPIKeyScope('data:read', 'pii:read'), handler)
 *
 * Supports multiple required scopes (all must be satisfied)
 */
export function requireAPIKeyScope(...requiredScopes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if no API key (user auth will be checked separately)
    if (!req.apiKey) {
      return next();
    }

    const { valid, missingScopes } = validateScopes(requiredScopes, req.apiKey.scopes);

    if (!valid) {
      // Log denied access
      await logAPIKeyUsage({
        apiKeyId: req.apiKey.apiKeyId,
        endpoint: `${req.method} ${req.path}`,
        method: req.method,
        statusCode: 403,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        scopeRequired: requiredScopes,
        scopeGranted: req.apiKey.scopes,
        authorized: false,
        errorMessage: `Missing scopes: ${missingScopes.join(', ')}`,
        requestId: req.apiKey.requestId,
        responseTimeMs: Date.now() - req.apiKey.startTime,
      });

      return res.status(403).json({
        error: 'insufficient_scope',
        message: `This operation requires the following scopes: ${requiredScopes.join(', ')}`,
        missing_scopes: missingScopes,
        granted_scopes: req.apiKey.scopes,
        request_id: req.apiKey.requestId,
      });
    }

    next();
  };
}

/**
 * Middleware to require authentication (either user or API key)
 *
 * Usage:
 *   app.get('/api/data', requireAuth, handler)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hasUserAuth = req.user && req.user.id;
  const hasAPIKeyAuth = req.apiKey && req.apiKey.apiKeyId;

  if (!hasUserAuth && !hasAPIKeyAuth) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required. Provide either user credentials or an API key.',
    });
  }

  next();
}

/**
 * Middleware to extract authentication source info
 *
 * Sets req.authSource to either 'user' or 'api_key'
 */
export function extractAuthSource(req: Request, res: Response, next: NextFunction) {
  if (req.apiKey) {
    (req as any).authSource = 'api_key';
    (req as any).authenticatedUserId = req.apiKey.userId;
    (req as any).authenticatedKeyId = req.apiKey.apiKeyId;
  } else if (req.user) {
    (req as any).authSource = 'user';
    (req as any).authenticatedUserId = req.user.id;
  }

  next();
}

/**
 * Middleware to log sensitive scope access
 *
 * Marks certain scope accesses for extra audit logging
 */
export function logSensitiveAccess(...sensitiveScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return next();
    }

    // Check if key has any sensitive scopes
    const hasSensitiveScope = sensitiveScopes.some((scope) =>
      req.apiKey!.scopes.some(
        (granted) => granted === scope || granted === '*' || granted === scope.split(':')[0] + ':*'
      )
    );

    if (hasSensitiveScope) {
      // Mark request as sensitive for audit logging
      (req as any).sensitiveOperation = true;
      (req as any).sensitiveScopes = sensitiveScopes.filter((scope) =>
        req.apiKey!.scopes.some(
          (granted) => granted === scope || granted === '*' || granted === scope.split(':')[0] + ':*'
        )
      );
    }

    next();
  };
}

/**
 * Middleware to validate request signature (optional)
 *
 * For webhook integrations, validate HMAC signature
 */
export function validateWebhookSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-webhook-signature'];

    if (!signature) {
      return res.status(401).json({
        error: 'missing_signature',
        message: 'Webhook signature is required.',
      });
    }

    // TODO: Implement HMAC-SHA256 validation
    // const expectedSignature = hmac(secret, req.body);
    // if (signature !== expectedSignature) {
    //   return res.status(401).json({ error: 'invalid_signature' });
    // }

    next();
  };
}

/**
 * Get authentication context from request
 *
 * Returns either user or API key context
 */
export function getAuthContext(req: Request): { type: 'user' | 'api_key'; userId: string; id: string } | null {
  if (req.apiKey) {
    return {
      type: 'api_key',
      userId: req.apiKey.userId,
      id: req.apiKey.apiKeyId,
    };
  }

  if (req.user) {
    return {
      type: 'user',
      userId: req.user.id,
      id: req.user.id,
    };
  }

  return null;
}

/**
 * NQX Guided Discovery
 *
 * A bookmarklet-driven flow to capture an NQX `calculate_rate` round-trip
 * from the admin's own browser, so we can build the field schema without
 * needing a headless scraper to fill the form.
 *
 * Flow:
 *   1. Admin clicks "Start Guided Discovery" → creates a session, returns a
 *      one-time token + a small bookmarklet snippet.
 *   2. Admin runs the bookmarklet on the NQX pricer page, fills in any
 *      scenario, clicks Calculate Rate.
 *   3. The bookmarklet POSTs the captured request body, response body, and
 *      a DOM snapshot back to /api/public/nqx-discovery-capture.
 *   4. Admin UI polls the session status; when "captured", we build a
 *      NqxDiscoverySchema from the DOM + request body and return it to
 *      the wizard, which then runs the same auto-map logic as the
 *      headless flow.
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import crypto from "crypto";
import { authenticateUser, type AuthRequest } from "../auth";
import {
  autoMapFields,
  autoMapOptions,
  type NqxDiscoverySchema,
  type NqxField,
  type NqxFieldOption,
  type NqxProduct,
} from "../services/nqxPricer";

const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_CAPTURE_BYTES = 1_500_000; // ~1.5 MB safety cap

interface DomFieldSnapshot {
  opaqueId: string;
  label: string;
  type: string;
  options?: Array<{ label: string; value: string }>;
}

interface CapturePayload {
  calculateRateUrl: string;
  requestBody: unknown;
  responseBody: unknown;
  domFields: DomFieldSnapshot[];
  pageTitle?: string;
}

interface DiscoverySession {
  token: string;
  tenantId: number;
  createdByUserId: number;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "captured" | "expired";
  capture?: CapturePayload;
  schema?: NqxDiscoverySchema;
  suggested?: {
    selectedProductId: string;
    fieldMappings: ReturnType<typeof autoMapFields>;
    optionMappings: ReturnType<typeof autoMapOptions>;
  };
}

const sessions = new Map<string, DiscoverySession>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [token, s] of Array.from(sessions.entries())) {
    if (s.expiresAt < now) sessions.delete(token);
  }
}

function parseCalculateRateUrl(url: string): { computeId: string; productId: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("nqxpricer.com")) return null;
    const m = u.pathname.match(/\/compute\/([a-f0-9]{12,})\/products\/([a-f0-9]{12,})\/calculate_rate/i);
    if (!m) return null;
    return { computeId: m[1], productId: m[2] };
  } catch {
    return null;
  }
}

function inferFieldType(domType: string): NqxField["type"] {
  const t = (domType || "").toLowerCase();
  if (t === "select" || t === "combobox" || t === "radio") return "select";
  if (t === "number" || t === "currency" || t === "percent") return "number";
  return "text";
}

function buildSchemaFromCapture(capture: CapturePayload): NqxDiscoverySchema {
  const ids = parseCalculateRateUrl(capture.calculateRateUrl);
  if (!ids) {
    throw new Error("Captured request URL is not a recognizable NQX calculate_rate endpoint.");
  }
  const reqBody =
    capture.requestBody && typeof capture.requestBody === "object"
      ? (capture.requestBody as Record<string, unknown>)
      : {};

  const fieldsById = new Map<string, NqxField>();
  for (const dom of capture.domFields) {
    if (!dom.opaqueId || fieldsById.has(dom.opaqueId)) continue;
    const opts: NqxFieldOption[] | undefined = Array.isArray(dom.options)
      ? dom.options
          .filter((o) => o && typeof o.value === "string" && typeof o.label === "string")
          .map((o) => ({ id: o.value, label: o.label }))
      : undefined;
    fieldsById.set(dom.opaqueId, {
      id: dom.opaqueId,
      label: dom.label || dom.opaqueId,
      type: inferFieldType(dom.type),
      options: opts && opts.length ? opts : undefined,
    });
  }

  // Add any fields present in the request body that the DOM walker missed.
  for (const key of Object.keys(reqBody)) {
    if (fieldsById.has(key)) continue;
    fieldsById.set(key, { id: key, label: key, type: "text" });
  }

  const fields = Array.from(fieldsById.values());
  const product: NqxProduct = {
    id: ids.productId,
    name: capture.pageTitle?.trim() || "Captured product",
    fields,
  };

  return {
    computeId: ids.computeId,
    computeName: capture.pageTitle?.trim(),
    products: [product],
    discoveredAt: new Date().toISOString(),
    rawResponses: [
      {
        url: capture.calculateRateUrl,
        status: 200,
        bodyPreview:
          typeof capture.responseBody === "string"
            ? capture.responseBody.slice(0, 500)
            : JSON.stringify(capture.responseBody).slice(0, 500),
      },
    ],
  };
}

export function registerNqxGuidedDiscoveryRoutes(
  app: Express,
  requireAdmin: RequestHandler,
): void {
  // ─── Start a session (admin) ──────────────────────────────────────────────
  app.post(
    "/api/admin/programs/nqx/guided-discovery/start",
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      sweepExpired();
      const user = req.user;
      if (!user?.tenantId) return res.status(401).json({ error: "Not authenticated" });

      const token = crypto.randomBytes(24).toString("hex");
      const now = Date.now();
      sessions.set(token, {
        token,
        tenantId: user.tenantId,
        createdByUserId: user.id,
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
        status: "pending",
      });

      res.json({
        token,
        expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      });
    },
  );

  // ─── Poll a session (admin) ───────────────────────────────────────────────
  app.get(
    "/api/admin/programs/nqx/guided-discovery/:token",
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      sweepExpired();
      const user = req.user;
      if (!user?.tenantId) return res.status(401).json({ error: "Not authenticated" });

      const token = String(req.params.token || "");
      const session = sessions.get(token);
      if (!session) return res.status(404).json({ status: "expired" });
      if (session.tenantId !== user.tenantId) return res.status(403).json({ error: "Forbidden" });

      if (session.status === "captured" && session.schema && session.suggested) {
        return res.json({
          status: "captured",
          schema: session.schema,
          suggested: session.suggested,
        });
      }
      return res.json({ status: session.status, expiresAt: new Date(session.expiresAt).toISOString() });
    },
  );

  // ─── CORS preflight for the capture endpoint ──────────────────────────────
  const setCors = (res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  };

  app.options("/api/public/nqx-discovery-capture", (_req: Request, res: Response) => {
    setCors(res);
    res.status(204).end();
  });

  // ─── Public capture endpoint (no auth, token-gated) ───────────────────────
  app.post("/api/public/nqx-discovery-capture", async (req: Request, res: Response) => {
    setCors(res);
    sweepExpired();
    try {
      const body = req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Invalid payload" });
      }
      const token = typeof body.token === "string" ? body.token : "";
      const session = sessions.get(token);
      if (!session) return res.status(404).json({ error: "Unknown or expired session" });
      if (session.status !== "pending") {
        return res.status(409).json({ error: "Session already captured" });
      }

      const calculateRateUrl =
        typeof body.calculateRateUrl === "string" ? body.calculateRateUrl : "";
      if (!parseCalculateRateUrl(calculateRateUrl)) {
        return res.status(400).json({ error: "calculateRateUrl is missing or not an NQX endpoint" });
      }

      const payloadSize = JSON.stringify(body).length;
      if (payloadSize > MAX_CAPTURE_BYTES) {
        return res.status(413).json({ error: "Capture payload too large" });
      }

      const capture: CapturePayload = {
        calculateRateUrl,
        requestBody: body.requestBody ?? {},
        responseBody: body.responseBody ?? null,
        domFields: Array.isArray(body.domFields) ? (body.domFields as DomFieldSnapshot[]) : [],
        pageTitle: typeof body.pageTitle === "string" ? body.pageTitle : undefined,
      };

      let schema: NqxDiscoverySchema;
      try {
        schema = buildSchemaFromCapture(capture);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to parse capture";
        return res.status(422).json({ error: msg });
      }

      const firstProduct = schema.products[0];
      const fieldMappings = autoMapFields(firstProduct);
      const optionMappings = autoMapOptions(firstProduct, fieldMappings);

      session.capture = capture;
      session.schema = schema;
      session.suggested = {
        selectedProductId: firstProduct.id,
        fieldMappings,
        optionMappings,
      };
      session.status = "captured";

      return res.json({
        ok: true,
        productCount: schema.products.length,
        fieldCount: firstProduct.fields.length,
        mappedCount: fieldMappings.filter((f) => f.fieldId).length,
      });
    } catch (error: unknown) {
      console.error("nqx capture error", error);
      res.status(500).json({ error: "Capture failed" });
    }
  });
}

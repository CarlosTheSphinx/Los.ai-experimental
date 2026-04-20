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
  findFieldsArray,
  findProductsArray,
  type NqxDiscoverySchema,
  type NqxField,
  type NqxFieldOption,
  type NqxProduct,
} from "../services/nqxPricer";

const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_CAPTURE_BYTES = 5_000_000; // ~5 MB safety cap (config responses can be large)

// Skip these opaqueIds — they're framework-generated and meaningless
// (React useId values like `:r2:`, `:r2:-outlined`, etc.).
const REACT_USEID_RE = /^:r[0-9a-z]+:/i;

interface DomFieldSnapshot {
  opaqueId: string;
  label: string;
  type: string;
  options?: Array<{ label: string; value: string }>;
}

interface AdditionalCapture {
  url: string;
  body: unknown;
}

interface CapturedFieldMapEntry {
  label: string;
  fieldId?: string | null;
  optionsByLabel?: Record<string, string>;
}

interface CapturePayload {
  calculateRateUrl: string;
  requestBody: unknown;
  responseBody: unknown;
  domFields: DomFieldSnapshot[];
  additionalCaptures?: AdditionalCapture[];
  fieldMap?: CapturedFieldMapEntry[];
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

function isUsableOpaqueId(id: string): boolean {
  if (!id) return false;
  if (REACT_USEID_RE.test(id)) return false;
  return true;
}

/**
 * Walk every additional capture body, pulling out any field definitions or
 * product definitions we recognize. Returns the merged set of fields keyed
 * by their NQX field _id, plus a product name (if we found one).
 */
function harvestFieldsFromAdditional(
  additional: AdditionalCapture[],
  productId: string,
): { fields: Map<string, NqxField>; productName?: string } {
  const fieldsById = new Map<string, NqxField>();
  let productName: string | undefined;

  const ingestFields = (fs: NqxField[] | null) => {
    if (!fs) return;
    for (const f of fs) {
      if (!f?.id || !isUsableOpaqueId(f.id)) continue;
      const existing = fieldsById.get(f.id);
      // Prefer the entry with options + a real label.
      if (
        !existing ||
        ((f.options?.length ?? 0) > (existing.options?.length ?? 0)) ||
        (!existing.label && f.label)
      ) {
        fieldsById.set(f.id, f);
      }
    }
  };

  for (const cap of additional) {
    if (!cap?.body || typeof cap.body !== "object") continue;
    // Try to find products first; if our productId is in there, use its fields.
    const products = findProductsArray(cap.body);
    if (products) {
      const matchedByName = products.find((p) => p.id === productId);
      if (matchedByName) {
        productName = matchedByName.name || productName;
        ingestFields(matchedByName.fields);
      }
      // Even if not matched, harvest fields from every product (NQX often
      // keeps the same field IDs across products in a compute).
      for (const p of products) ingestFields(p.fields);
      continue;
    }
    // Otherwise fall back to a flat field array search.
    ingestFields(findFieldsArray(cap.body));
  }

  return { fields: fieldsById, productName };
}

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function fieldsFromFieldMap(
  entries: CapturedFieldMapEntry[],
  reqBody: Record<string, unknown>,
): NqxField[] {
  const out: NqxField[] = [];
  for (const entry of entries) {
    if (!entry?.label) continue;
    const optionsByLabel = entry.optionsByLabel ?? {};
    const options: NqxFieldOption[] = Object.keys(optionsByLabel)
      .map((label) => ({ id: String(optionsByLabel[label]), label }))
      .filter((o) => o.id);

    let fieldId: string | null =
      entry.fieldId && OBJECT_ID_RE.test(entry.fieldId) ? entry.fieldId : null;
    if (!fieldId && options.length > 0) {
      const optIds = new Set(options.map((o) => o.id));
      for (const [k, v] of Object.entries(reqBody)) {
        if (!isUsableOpaqueId(k)) continue;
        if (typeof v === "string" && optIds.has(v)) { fieldId = k; break; }
        if (Array.isArray(v) && v.some((x) => typeof x === "string" && optIds.has(x))) {
          fieldId = k;
          break;
        }
      }
    }
    if (!fieldId) continue;

    out.push({
      id: fieldId,
      label: entry.label,
      type: "select",
      options: options.length ? options : undefined,
    });
  }
  return out;
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
  const additional = capture.additionalCaptures ?? [];
  const fieldMapEntries = capture.fieldMap ?? [];

  const fiberFields = fieldsFromFieldMap(fieldMapEntries, reqBody);
  const { fields: configFields, productName } = harvestFieldsFromAdditional(
    additional,
    ids.productId,
  );

  const domFieldsById = new Map<string, DomFieldSnapshot>();
  for (const dom of capture.domFields) {
    if (!dom.opaqueId || !isUsableOpaqueId(dom.opaqueId)) continue;
    if (!domFieldsById.has(dom.opaqueId)) domFieldsById.set(dom.opaqueId, dom);
  }

  // Precedence: fiber-walk > config > DOM > plain-text placeholder.
  const fieldsById = new Map<string, NqxField>();
  for (const f of fiberFields) fieldsById.set(f.id, f);

  const reqKeys = Object.keys(reqBody).filter(isUsableOpaqueId);
  for (const key of reqKeys) {
    if (fieldsById.has(key)) continue;
    const fromConfig = configFields.get(key);
    if (fromConfig) {
      fieldsById.set(key, fromConfig);
      continue;
    }
    const fromDom = domFieldsById.get(key);
    if (fromDom) {
      const opts: NqxFieldOption[] | undefined = Array.isArray(fromDom.options)
        ? fromDom.options
            .filter((o) => o && typeof o.value === "string" && typeof o.label === "string")
            .map((o) => ({ id: o.value, label: o.label }))
        : undefined;
      fieldsById.set(key, {
        id: key,
        label: fromDom.label || key,
        type: inferFieldType(fromDom.type),
        options: opts && opts.length ? opts : undefined,
      });
      continue;
    }
    fieldsById.set(key, { id: key, label: key, type: "text" });
  }

  for (const [id, f] of Array.from(configFields.entries())) {
    if (!fieldsById.has(id)) fieldsById.set(id, f);
  }

  const fields = Array.from(fieldsById.values());
  const product: NqxProduct = {
    id: ids.productId,
    name: productName || capture.pageTitle?.trim() || "Captured product",
    fields,
  };

  return {
    computeId: ids.computeId,
    computeName: capture.pageTitle?.trim(),
    products: [product],
    discoveredAt: new Date().toISOString(),
    rawResponses: [
      { url: capture.calculateRateUrl, status: 200, bodyPreview: previewBody(capture.responseBody) },
      ...additional.map((c) => ({ url: c.url, status: 200, bodyPreview: previewBody(c.body) })),
    ],
  };
}

function previewBody(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return "";
  }
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

      const additionalRaw: unknown[] = Array.isArray(body.additionalCaptures) ? body.additionalCaptures : [];
      const additionalCaptures: AdditionalCapture[] = [];
      for (const c of additionalRaw) {
        if (!c || typeof c !== "object") continue;
        const rec = c as Record<string, unknown>;
        const url = typeof rec.url === "string" ? rec.url : "";
        if (!url || !/nqxpricer\.com/.test(url)) continue;
        additionalCaptures.push({ url, body: rec.body });
      }

      const fieldMap: CapturedFieldMapEntry[] = [];
      const fieldMapRaw: unknown[] = Array.isArray(body.fieldMap) ? body.fieldMap : [];
      for (const e of fieldMapRaw) {
        if (!e || typeof e !== "object") continue;
        const rec = e as Record<string, unknown>;
        const label = typeof rec.label === "string" ? rec.label.trim() : "";
        if (!label) continue;
        const fid = typeof rec.fieldId === "string" ? rec.fieldId : null;
        const safeOpts: Record<string, string> = {};
        if (rec.optionsByLabel && typeof rec.optionsByLabel === "object") {
          for (const [k, v] of Object.entries(rec.optionsByLabel as Record<string, unknown>)) {
            if (typeof k === "string" && typeof v === "string") safeOpts[k] = v;
          }
        }
        fieldMap.push({ label, fieldId: fid, optionsByLabel: safeOpts });
      }

      const capture: CapturePayload = {
        calculateRateUrl,
        requestBody: body.requestBody ?? {},
        responseBody: body.responseBody ?? null,
        domFields: Array.isArray(body.domFields) ? (body.domFields as DomFieldSnapshot[]) : [],
        additionalCaptures,
        fieldMap,
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

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
  calculateRateUrl: string | null;
  requestBody: unknown;
  responseBody: unknown;
  domFields: DomFieldSnapshot[];
  additionalCaptures?: AdditionalCapture[];
  fieldMap?: CapturedFieldMapEntry[];
  pageUrl?: string;
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

function parsePricerPageUrl(pageUrl?: string): { computeId: string } | null {
  if (!pageUrl) return null;
  try {
    const u = new URL(pageUrl);
    if (!u.hostname.endsWith("nqxpricer.com")) return null;
    const m = u.pathname.match(/\/([a-f0-9]{24})/i);
    if (!m) return null;
    return { computeId: m[1] };
  } catch {
    return null;
  }
}

/**
 * Walk each captured field-map entry and try to resolve its NQX field
 * ObjectId by cross-referencing the captured option IDs against the
 * calculate_rate request body. Returns an array of fully-resolved NqxFields.
 */
function fieldsFromFieldMap(
  entries: CapturedFieldMapEntry[],
  reqBody: Record<string, unknown>,
): NqxField[] {
  const out: NqxField[] = [];
  for (const entry of entries) {
    if (!entry?.label) continue;
    const optionsByLabel = entry.optionsByLabel ?? {};
    const labels = Object.keys(optionsByLabel);
    const options: NqxFieldOption[] = labels
      .map((lbl) => ({ id: String(optionsByLabel[lbl]), label: lbl }))
      .filter((o) => o.id);

    // Resolve fieldId: prefer what the client captured via fiber walk,
    // else cross-reference option IDs against the request body.
    let fieldId: string | null =
      entry.fieldId && /^[a-f0-9]{24}$/i.test(entry.fieldId) ? entry.fieldId : null;
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

    if (!fieldId) {
      // Couldn't resolve the NQX id — still surface the field using the
      // label itself as a placeholder id so the admin at least sees it,
      // flagged as unresolved.
      out.push({
        id: `unresolved:${entry.label}`,
        label: entry.label,
        type: "select",
        options: options.length ? options : undefined,
      });
      continue;
    }
    out.push({ id: fieldId, label: entry.label, type: "select", options: options.length ? options : undefined });
  }
  return out;
}

function buildSchemaFromCapture(capture: CapturePayload): NqxDiscoverySchema {
  // Prefer the calculate_rate URL for compute/product IDs; fall back to the
  // pricer page URL (which only gives us computeId — productId has to come
  // from calculate_rate, so without it we degrade gracefully).
  const ids = parseCalculateRateUrl(capture.calculateRateUrl || "");
  const pageIds = parsePricerPageUrl(capture.pageUrl);
  if (!ids && !pageIds) {
    throw new Error(
      "No calculate_rate URL and no recognizable pricer page URL — cannot determine NQX compute/product IDs.",
    );
  }
  const computeId = ids?.computeId ?? pageIds!.computeId;
  const productId = ids?.productId ?? "unknown-product";

  const reqBody =
    capture.requestBody && typeof capture.requestBody === "object"
      ? (capture.requestBody as Record<string, unknown>)
      : {};
  const additional = capture.additionalCaptures ?? [];
  const fieldMapEntries = Array.isArray(capture.fieldMap) ? capture.fieldMap : [];

  // 1. Fiber-walked field map — this is the best source: real human field
  //    labels + real option labels + real option ObjectIds. fieldId may or
  //    may not be resolved depending on whether calculate_rate was captured.
  const fiberFields = fieldsFromFieldMap(fieldMapEntries, reqBody);

  // 2. Page-load config responses (legacy enrichment path; still useful if
  //    the admin did happen to catch them).
  const { fields: configFields, productName } = harvestFieldsFromAdditional(
    additional,
    productId,
  );

  // 3. DOM snapshot (very last resort; produces React useId-flavored noise).
  const domFieldsById = new Map<string, DomFieldSnapshot>();
  for (const dom of capture.domFields ?? []) {
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
    if (fromConfig) { fieldsById.set(key, fromConfig); continue; }
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

  // Include any config-derived fields that aren't yet in the map either.
  for (const [id, f] of Array.from(configFields.entries())) {
    if (!fieldsById.has(id)) fieldsById.set(id, f);
  }

  const fields = Array.from(fieldsById.values());
  const product: NqxProduct = {
    id: productId,
    name: productName || capture.pageTitle?.trim() || "Captured product",
    fields,
  };

  return {
    computeId,
    computeName: capture.pageTitle?.trim(),
    products: [product],
    discoveredAt: new Date().toISOString(),
    rawResponses: [
      ...(capture.calculateRateUrl
        ? [{ url: capture.calculateRateUrl, status: 200, bodyPreview: previewBody(capture.responseBody) }]
        : []),
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
        typeof body.calculateRateUrl === "string" ? body.calculateRateUrl : null;
      const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl : undefined;
      const hasFieldMap = Array.isArray(body.fieldMap) && body.fieldMap.length > 0;

      // Need EITHER a valid calculate_rate URL, OR a field map + a recognizable
      // pricer page URL (so we at least know the computeId).
      if (calculateRateUrl && !parseCalculateRateUrl(calculateRateUrl)) {
        return res.status(400).json({ error: "calculateRateUrl is not an NQX endpoint" });
      }
      if (!calculateRateUrl && !(hasFieldMap && parsePricerPageUrl(pageUrl))) {
        return res.status(400).json({
          error:
            "Need either a captured calculate_rate URL or a field map plus a recognizable nqxpricer.com page URL.",
        });
      }

      const payloadSize = JSON.stringify(body).length;
      if (payloadSize > MAX_CAPTURE_BYTES) {
        return res.status(413).json({ error: "Capture payload too large" });
      }

      const additionalRaw = Array.isArray(body.additionalCaptures) ? body.additionalCaptures : [];
      const additionalCaptures: AdditionalCapture[] = [];
      for (const c of additionalRaw) {
        if (!c || typeof c !== "object") continue;
        const url = typeof (c as any).url === "string" ? (c as any).url : "";
        if (!url || !/nqxpricer\.com/.test(url)) continue;
        additionalCaptures.push({ url, body: (c as any).body });
      }

      const fieldMap: CapturedFieldMapEntry[] = [];
      if (Array.isArray(body.fieldMap)) {
        for (const e of body.fieldMap) {
          if (!e || typeof e !== "object") continue;
          const label = typeof (e as any).label === "string" ? (e as any).label.trim() : "";
          if (!label) continue;
          const fid = typeof (e as any).fieldId === "string" ? (e as any).fieldId : null;
          const opts = (e as any).optionsByLabel;
          const safeOpts: Record<string, string> = {};
          if (opts && typeof opts === "object") {
            for (const [k, v] of Object.entries(opts)) {
              if (typeof k === "string" && typeof v === "string") safeOpts[k] = v;
            }
          }
          fieldMap.push({ label, fieldId: fid, optionsByLabel: safeOpts });
        }
      }

      const capture: CapturePayload = {
        calculateRateUrl,
        requestBody: body.requestBody ?? {},
        responseBody: body.responseBody ?? null,
        domFields: Array.isArray(body.domFields) ? (body.domFields as DomFieldSnapshot[]) : [],
        additionalCaptures,
        fieldMap,
        pageUrl,
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

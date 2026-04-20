import { ApifyClient } from 'apify-client';
import { evaluateFormula, matchConditionalRules } from './fieldResolver';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const apifyClient = new ApifyClient({ token: APIFY_TOKEN || '' });

const NQX_GATEWAY_HOST = 'prod-ecs-gateway.nqxpricer.com';
const CALCULATE_RATE_PATH = (computeId: string, productId: string) =>
  `https://${NQX_GATEWAY_HOST}/pricer-public/api/v1/compute/${computeId}/products/${productId}/calculate_rate`;

export interface NqxFieldOption {
  id: string;
  label: string;
}

export interface NqxField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'unknown';
  options?: NqxFieldOption[];
  required?: boolean;
  defaultValue?: any;
}

export interface NqxProduct {
  id: string;
  name: string;
  fields: NqxField[];
}

export interface NqxDiscoverySchema {
  computeId: string;
  computeName?: string;
  products: NqxProduct[];
  discoveredAt: string;
  rawResponses?: Array<{ url: string; status: number; bodyPreview?: string }>;
}

export interface FieldMapping {
  internalKey: string;
  internalLabel: string;
  fieldId: string | null;
  fieldLabel: string | null;
  confidence: number;
}

export interface OptionMapping {
  fieldId: string;
  internalValue: string;
  optionId: string;
  optionLabel: string;
  confidence: number;
}

export type DirectApiSourceType = 'borrower' | 'default' | 'calculated';

export interface DirectApiConditionalRule {
  operator: '>=' | '>' | '<=' | '<' | '==' | 'between';
  value: string;
  value2?: string;
  /** NQX optionId (24-hex) — what the rule resolves to when matched. */
  optionId: string;
}

/**
 * Per-NQX-product-field configuration. One entry per captured product field.
 * Mirrors the External-URL "Borrower Input / Fixed Default / Calculated"
 * model so admins can lock fields, compute them, or expose them to borrowers.
 */
export interface ProductFieldConfig {
  fieldId: string;
  fieldLabel: string;
  fieldType: 'select' | 'number' | 'text' | 'unknown';
  sourceType: DirectApiSourceType;
  /** When sourceType=borrower, the form key the value is read from (falls back to fieldId if unset). */
  internalKey?: string;
  /** sourceType=default, fieldType=select → the locked optionId. */
  defaultOptionId?: string;
  /** sourceType=default, fieldType=number → the locked numeric value. */
  defaultNumber?: number;
  /** sourceType=calculated → expression with `{varName}` placeholders. */
  formula?: string;
  /** sourceType=calculated, fieldType=select → rules that pick an optionId from the formula's numeric result. */
  conditionalRules?: DirectApiConditionalRule[];
}

export interface ApiModeConfig {
  computeId: string;
  computeName?: string;
  selectedProductId: string | null;
  products: NqxProduct[];
  fieldMappings: FieldMapping[];
  optionMappings: OptionMapping[];
  discoveredAt: string;
  /**
   * Lender's snapshot of fieldId → value(s) at the time the captured map was
   * exported. Used as defaults so unmapped/unanswered fields reproduce the
   * displayed pricer-URL rate instead of falling back to NQX server defaults.
   * For select fields the value is `[optionId]`; for numeric fields it's a number.
   */
  baselinePayload?: Record<string, unknown>;
  /** Per-NQX-field source-type configuration (Borrower / Default / Calculated). */
  productFieldConfigs?: ProductFieldConfig[];
}

export function isAllowedNqxHost(hostname: string): boolean {
  return hostname === 'nqxpricer.com' || hostname.endsWith('.nqxpricer.com');
}

export function extractComputeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!isAllowedNqxHost(u.hostname)) return null;
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    if (/^[a-f0-9]{24}$/i.test(last)) return last;
    return null;
  } catch {
    return null;
  }
}

function isObjectId(str: any): boolean {
  return typeof str === 'string' && /^[a-f0-9]{24}$/i.test(str);
}

function classifyFieldType(field: any): NqxField['type'] {
  if (Array.isArray(field?.options) && field.options.length > 0) return 'select';
  if (Array.isArray(field?.values) && field.values.length > 0) return 'select';
  if (Array.isArray(field?.choices) && field.choices.length > 0) return 'select';
  const t = (field?.type || field?.fieldType || field?.input_type || '').toString().toLowerCase();
  if (t.includes('select') || t.includes('drop') || t.includes('option') || t.includes('enum')) return 'select';
  if (t.includes('number') || t.includes('numeric') || t.includes('amount') || t.includes('currency')) return 'number';
  if (t.includes('text') || t.includes('string') || t.includes('input')) return 'text';
  return 'unknown';
}

/**
 * Normalize a raw NQX field object into our NqxField shape.
 * NQX's exact JSON shape isn't publicly documented, so this tries multiple
 * common conventions.
 */
function normalizeField(raw: any): NqxField | null {
  const id = raw?._id || raw?.id || raw?.fieldId || raw?.field_id;
  if (!isObjectId(id)) return null;
  const label = raw?.label || raw?.name || raw?.title || raw?.display_name || '';
  const type = classifyFieldType(raw);
  const optionsArr = raw?.options || raw?.values || raw?.choices || [];
  const options: NqxFieldOption[] = Array.isArray(optionsArr)
    ? optionsArr
        .map((o: any) => {
          const oid = o?._id || o?.id || o?.value;
          const olabel = o?.label || o?.name || o?.title || o?.display_name || (typeof o === 'string' ? o : '');
          if (!isObjectId(oid)) return null;
          return { id: oid, label: String(olabel) };
        })
        .filter(Boolean) as NqxFieldOption[]
    : [];
  return {
    id,
    label: String(label),
    type,
    options: options.length > 0 ? options : undefined,
    required: raw?.required ?? raw?.is_required ?? undefined,
    defaultValue: raw?.default ?? raw?.defaultValue ?? raw?.default_value ?? undefined,
  };
}

/**
 * Walk an arbitrary JSON object looking for arrays of field-like objects.
 * Returns the first array that yields >= 2 normalized fields.
 */
function findFieldsArray(obj: any, path = ''): NqxField[] | null {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    const fields = obj.map(normalizeField).filter(Boolean) as NqxField[];
    if (fields.length >= 2) return fields;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const found = findFieldsArray(v, `${path}.${k}`);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Look for a "products" array in the JSON: items that have an ObjectId _id and a name.
 */
function findProductsArray(obj: any): NqxProduct[] | null {
  if (!obj) return null;
  if (Array.isArray(obj) && obj.length > 0) {
    const looksLikeProducts = obj.every((p: any) => {
      const pid = p?._id || p?.id;
      return isObjectId(pid) && (p?.name || p?.title || p?.label || p?.product_name);
    });
    if (looksLikeProducts) {
      return obj.map((p: any) => {
        const pid = p?._id || p?.id;
        const pname = p?.name || p?.title || p?.label || p?.product_name || '';
        const pfields = findFieldsArray(p) || [];
        return { id: pid, name: String(pname), fields: pfields };
      });
    }
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const found = findProductsArray(v);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Discover the NQX schema for a compute by loading the public pricer page in
 * a headless browser (via Apify) and intercepting all network responses from
 * the NQX gateway. Parses captured JSON to extract products + fields.
 */
export async function discoverNqxSchema(scraperUrl: string): Promise<NqxDiscoverySchema> {
  const computeId = extractComputeId(scraperUrl);
  if (!computeId) {
    throw new Error('Could not extract compute ID from URL. Expected pattern: https://...nqxpricer.com/<24-hex-chars>');
  }
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not configured on the server.');
  }

  const run = await apifyClient.actor('apify/puppeteer-scraper').call({
    startUrls: [{ url: scraperUrl }],
    pageFunction: `async function pageFunction(context) {
      const { page, log } = context;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const captured = [];

      page.on('response', async (response) => {
        try {
          const url = response.url();
          if (!url.includes('${NQX_GATEWAY_HOST}')) return;
          const status = response.status();
          const ct = response.headers()['content-type'] || '';
          if (!ct.includes('application/json')) return;
          const body = await response.text();
          captured.push({ url, status, body });
        } catch (e) {
          log.info('Capture error: ' + e.message);
        }
      });

      log.info('Waiting for page to render and fire XHRs...');
      await wait(3000);

      try {
        await page.waitForSelector('input, [role="combobox"]', { timeout: 15000 });
      } catch (e) {
        log.info('Form selector wait timeout, continuing...');
      }

      // Give a few extra seconds for any deferred fetches
      await wait(3000);

      log.info('Captured ' + captured.length + ' NQX gateway responses.');

      return { success: true, captured };
    }`,
    proxyConfiguration: { useApifyProxy: true },
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
  });

  await apifyClient.run(run.id).waitForFinish();
  const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
  if (!items || items.length === 0 || !(items[0] as any).success) {
    throw new Error('Discovery scrape returned no results.');
  }

  const captured: Array<{ url: string; status: number; body: string }> = (items[0] as any).captured || [];
  if (captured.length === 0) {
    throw new Error('No NQX gateway responses were captured. The page may have changed structure.');
  }

  // Parse each captured JSON body and try to extract products + fields
  let products: NqxProduct[] = [];
  let computeName: string | undefined;
  const rawResponses: Array<{ url: string; status: number; bodyPreview?: string }> = [];

  for (const cap of captured) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(cap.body);
    } catch {
      continue;
    }
    rawResponses.push({
      url: cap.url,
      status: cap.status,
      bodyPreview: cap.body.slice(0, 500),
    });

    if (!computeName && parsed) {
      computeName = parsed.name || parsed.compute_name || parsed.title || undefined;
    }

    const foundProducts = findProductsArray(parsed);
    if (foundProducts && foundProducts.length > 0 && products.length === 0) {
      products = foundProducts;
    }

    // If we already have products list but no fields per product, merge in
    // fields from a per-product response.
    if (products.length > 0 && parsed) {
      for (const p of products) {
        if (p.fields.length === 0) {
          // try to find this product's fields in the parsed body
          const pidMatch = JSON.stringify(parsed).includes(p.id);
          if (pidMatch) {
            const fields = findFieldsArray(parsed);
            if (fields) p.fields = fields;
          }
        }
      }
    }
  }

  if (products.length === 0) {
    // Fallback: maybe the schema is flat (no separate products list)
    for (const cap of captured) {
      try {
        const parsed = JSON.parse(cap.body);
        const fields = findFieldsArray(parsed);
        if (fields && fields.length >= 2) {
          products = [{ id: computeId, name: computeName || 'Default Product', fields }];
          break;
        }
      } catch {}
    }
  }

  if (products.length === 0) {
    throw new Error(
      `Could not extract product/field schema from ${captured.length} NQX responses. ` +
        `The NQX API shape may have changed — check the raw response previews.`,
    );
  }

  return {
    computeId,
    computeName,
    products,
    discoveredAt: new Date().toISOString(),
    rawResponses,
  };
}

// ─── Auto-mapping helpers ───────────────────────────────────────────────────

const INTERNAL_FIELD_LABELS: Record<string, string[]> = {
  loanAmount: ['loan amount', 'loan size', 'amount'],
  propertyValue: ['property value', 'as-is value', 'as is value', 'purchase price', 'value', 'price'],
  ltv: ['ltv', 'loan to value', 'loan-to-value'],
  loanType: ['loan type', 'product type', 'amortization', 'loan product'],
  interestOnly: ['interest only', 'io', 'i/o'],
  loanPurpose: ['loan purpose', 'purpose', 'transaction type'],
  propertyType: ['property type', 'asset type'],
  dscr: ['dscr', 'debt service coverage', 'est. dscr', 'estimated dscr'],
  ficoScore: ['fico', 'credit score', 'fico score', 'stated fico'],
  prepaymentPenalty: ['prepayment', 'prepay', 'ppp'],
  occupancy: ['occupancy', 'occupied'],
  state: ['state', 'property state'],
  units: ['units', 'unit count', '# of units'],
  citizenship: ['citizenship', 'us citizen', 'citizen status'],
  experience: ['experience', 'years experience', 'investor experience'],
};

const INTERNAL_OPTION_SYNONYMS: Record<string, string[]> = {
  purchase: ['purchase', 'buy'],
  refinance: ['refinance', 'refi', 'rate/term', 'rate-term', 'rate and term'],
  cashout: ['cashout', 'cash out', 'cash-out'],
  yes: ['yes', 'y', 'true'],
  no: ['no', 'n', 'false'],
  '30 yr fixed rate': ['30 yr fixed', '30-year fixed', '30 year fixed'],
  '10/6 arm': ['10/6 arm', '10/6'],
  '7/6 arm': ['7/6 arm', '7/6'],
  '5/6 arm': ['5/6 arm', '5/6'],
  'single family residence': ['single family', 'sfr', 'single-family residence'],
  'condo': ['condo', 'condominium'],
  'multifamily': ['multifamily', 'multi-family', 'mf'],
  '2-4 unit': ['2-4 unit', '2-4', 'two to four'],
};

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyScore(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const aw = na.split(' ');
  const bw = new Set(nb.split(' '));
  const inter = aw.filter((w) => bw.has(w)).length;
  const union = new Set(aw.concat(nb.split(' '))).size;
  return union === 0 ? 0 : inter / union;
}

export function autoMapFields(product: NqxProduct, internalKeys?: string[]): FieldMapping[] {
  const keys = internalKeys ?? Object.keys(INTERNAL_FIELD_LABELS);
  const mappings: FieldMapping[] = [];
  for (const key of keys) {
    const synonyms = INTERNAL_FIELD_LABELS[key] || [key];
    let best: { field: NqxField; score: number } | null = null;
    for (const f of product.fields) {
      let s = 0;
      for (const syn of synonyms) {
        s = Math.max(s, fuzzyScore(syn, f.label));
      }
      s = Math.max(s, fuzzyScore(key, f.label));
      if (!best || s > best.score) best = { field: f, score: s };
    }
    mappings.push({
      internalKey: key,
      internalLabel: synonyms[0],
      fieldId: best && best.score >= 0.5 ? best.field.id : null,
      fieldLabel: best && best.score >= 0.5 ? best.field.label : null,
      confidence: best ? Number(best.score.toFixed(2)) : 0,
    });
  }
  return mappings;
}

export function autoMapOptions(product: NqxProduct, fieldMappings: FieldMapping[]): OptionMapping[] {
  const out: OptionMapping[] = [];
  for (const fm of fieldMappings) {
    if (!fm.fieldId) continue;
    const field = product.fields.find((f) => f.id === fm.fieldId);
    if (!field || !field.options) continue;
    // Build a list of internal option synonyms for this field
    const internalOptions = Object.keys(INTERNAL_OPTION_SYNONYMS);
    for (const internal of internalOptions) {
      const synonyms = INTERNAL_OPTION_SYNONYMS[internal];
      let best: { opt: NqxFieldOption; score: number } | null = null;
      for (const opt of field.options) {
        let s = 0;
        for (const syn of synonyms) s = Math.max(s, fuzzyScore(syn, opt.label));
        s = Math.max(s, fuzzyScore(internal, opt.label));
        if (!best || s > best.score) best = { opt, score: s };
      }
      if (best && best.score >= 0.6) {
        out.push({
          fieldId: fm.fieldId,
          internalValue: internal,
          optionId: best.opt.id,
          optionLabel: best.opt.label,
          confidence: Number(best.score.toFixed(2)),
        });
      }
    }
  }
  return out;
}

// ─── Quote execution ────────────────────────────────────────────────────────

export interface ExecuteQuoteParams {
  computeId: string;
  productId: string;
  /**
   * Map of fieldId -> raw value for that field. For select fields the value
   * should be the lender's option ID.
   */
  fieldValues: Record<string, any>;
}

export interface ExecuteQuoteResult {
  success: boolean;
  rate?: number;
  baseRate?: number;
  ineligible?: boolean;
  message?: string;
  request: { url: string; body: any };
  response: any;
  durationMs: number;
}

export async function executeNqxQuote(params: ExecuteQuoteParams): Promise<ExecuteQuoteResult> {
  const url = CALCULATE_RATE_PATH(params.computeId, params.productId);
  const flatBody = params.fieldValues;
  const wrappedBody = { fields: params.fieldValues };

  const tryPost = async (b: any) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    let txt = '';
    let j: any = null;
    try {
      txt = await r.text();
      j = JSON.parse(txt);
    } catch {
      j = { rawText: txt };
    }
    return { resp: r, json: j };
  };

  const start = Date.now();
  // Try flat first (matches captured NQX traffic), fall back to wrapped on failure
  let { resp, json } = await tryPost(flatBody);
  let body: any = flatBody;
  if (resp.status >= 400) {
    const wrapped = await tryPost(wrappedBody);
    if (wrapped.resp.ok || wrapped.resp.status < resp.status) {
      resp = wrapped.resp;
      json = wrapped.json;
      body = wrappedBody;
    }
  }

  const durationMs = Date.now() - start;

  if (!resp.ok) {
    return {
      success: false,
      message: `NQX returned HTTP ${resp.status}`,
      request: { url, body },
      response: json,
      durationMs,
    };
  }

  // Try to extract rate from the response
  const parsed = parseCalculateRateResponse(json);
  return {
    success: parsed.rate != null && !parsed.ineligible,
    rate: parsed.rate,
    baseRate: parsed.baseRate,
    ineligible: parsed.ineligible,
    message: parsed.message,
    request: { url, body },
    response: json,
    durationMs,
  };
}

function parseCalculateRateResponse(json: any): {
  rate?: number;
  baseRate?: number;
  ineligible?: boolean;
  message?: string;
} {
  if (!json || typeof json !== 'object') return { ineligible: true, message: 'Empty response' };

  // Common NQX shapes: eligible_cases / ineligible_cases, or top-level rate/base_rate
  const eligibleCases =
    json.eligible_cases || json.eligibleCases || json.eligible_products || json.eligibleProducts;
  const ineligibleCases =
    json.ineligible_cases || json.ineligibleCases || json.ineligible_products || json.ineligibleProducts;

  if (Array.isArray(eligibleCases) && eligibleCases.length > 0) {
    const first = eligibleCases[0];
    // NQX commonly nests numeric fields under a `rates` sub-object
    const rateBag = first?.rates || first?.rate_info || first;
    const rate = pickNumber(
      rateBag?.rate, rateBag?.final_rate, rateBag?.finalRate, rateBag?.adjusted_rate,
      first?.rate, first?.final_rate, first?.finalRate, first?.adjusted_rate,
    );
    const baseRate = pickNumber(
      rateBag?.base_rate, rateBag?.baseRate,
      first?.base_rate, first?.baseRate,
    );
    return { rate, baseRate };
  }

  if (Array.isArray(ineligibleCases) && ineligibleCases.length > 0 && (!eligibleCases || eligibleCases.length === 0)) {
    return { ineligible: true, message: ineligibleCases[0]?.reason || 'Loan is ineligible' };
  }

  // Top-level
  const topRate = pickNumber(json.rate, json.final_rate, json.finalRate);
  const topBase = pickNumber(json.base_rate, json.baseRate);
  if (topRate != null) return { rate: topRate, baseRate: topBase };

  return { ineligible: true, message: 'No rate found in response' };
}

function pickNumber(...vals: any[]): number | undefined {
  for (const v of vals) {
    if (v == null) continue;
    const n = typeof v === 'string' ? parseFloat(v.replace('%', '')) : Number(v);
    if (!isNaN(n) && isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Given a saved ApiModeConfig and the raw loanData submitted by the borrower,
 * build the fieldId -> value map that calculate_rate expects.
 */
export function seedProductFieldConfigs(config: ApiModeConfig): ProductFieldConfig[] {
  const product = config.products.find((p) => p.id === config.selectedProductId);
  if (!product) return [];
  const fmByFieldId = new Map<string, FieldMapping>();
  for (const fm of config.fieldMappings) {
    if (fm.fieldId) fmByFieldId.set(fm.fieldId, fm);
  }
  return product.fields.map((f) => {
    const fm = fmByFieldId.get(f.id);
    return {
      fieldId: f.id,
      fieldLabel: f.label,
      fieldType: f.type,
      sourceType: 'borrower' as DirectApiSourceType,
      internalKey: fm?.internalKey,
    };
  });
}

/**
 * Resolve a select field's optionId given a raw borrower-supplied value
 * (which may be an optionId already, an internal label, or arbitrary text).
 */
function resolveSelectOptionId(
  config: ApiModeConfig,
  field: NqxField,
  raw: any,
): string | null {
  const s = String(raw).trim();
  if (!s) return null;
  // Already an optionId
  if (/^[a-f0-9]{24}$/i.test(s) && field.options?.some((o) => o.id === s)) return s;
  // Try optionMappings
  const om = config.optionMappings.find(
    (o) => o.fieldId === field.id && normalizeStr(o.internalValue) === normalizeStr(s),
  );
  if (om) return om.optionId;
  // Fuzzy fallback against option labels
  let best: { id: string; score: number } | null = null;
  for (const opt of field.options || []) {
    const score = fuzzyScore(s, opt.label);
    if (!best || score > best.score) best = { id: opt.id, score };
  }
  if (best && best.score >= 0.5) return best.id;
  return null;
}

export function buildFieldValuesFromLoanData(
  config: ApiModeConfig,
  loanData: Record<string, any>,
): Record<string, any> {
  const fieldValues: Record<string, any> = {};
  // 1. Baseline defaults (lender snapshot)
  if (config.baselinePayload && typeof config.baselinePayload === 'object') {
    for (const [fid, val] of Object.entries(config.baselinePayload)) {
      if (!/^[a-f0-9]{24}$/i.test(fid)) continue;
      if (val === undefined || val === null) continue;
      fieldValues[fid] = val;
    }
  }

  const product = config.products.find((p) => p.id === config.selectedProductId);
  if (!product) return fieldValues;

  // 2. Per-field configs (new model). Falls back to legacy if absent.
  const configs: ProductFieldConfig[] =
    config.productFieldConfigs && config.productFieldConfigs.length > 0
      ? config.productFieldConfigs
      : seedProductFieldConfigs(config);

  for (const pfc of configs) {
    const field = product.fields.find((f) => f.id === pfc.fieldId);
    if (!field) continue;

    if (pfc.sourceType === 'default') {
      if (field.type === 'select' && pfc.defaultOptionId) {
        fieldValues[field.id] = [pfc.defaultOptionId];
      } else if (field.type === 'number' && typeof pfc.defaultNumber === 'number') {
        fieldValues[field.id] = pfc.defaultNumber;
      }
      continue;
    }

    if (pfc.sourceType === 'calculated') {
      const num = evaluateFormula(pfc.formula || '', loanData);
      if (num === null) continue;
      if (field.type === 'select') {
        const optId = matchConditionalRules(
          num,
          (pfc.conditionalRules || []).map((r) => ({ ...r, option: r.optionId })),
          undefined,
        );
        if (optId && /^[a-f0-9]{24}$/i.test(optId)) {
          fieldValues[field.id] = [optId];
        }
      } else if (field.type === 'number') {
        fieldValues[field.id] = num;
      }
      continue;
    }

    // sourceType === 'borrower'
    const raw =
      (pfc.internalKey ? loanData[pfc.internalKey] : undefined) ??
      loanData[field.id];
    if (raw === undefined || raw === null || raw === '') continue;
    if (field.type === 'select') {
      const optId = resolveSelectOptionId(config, field, raw);
      if (optId) fieldValues[field.id] = [optId];
    } else if (field.type === 'number') {
      const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
      if (!isNaN(n)) fieldValues[field.id] = n;
    } else {
      fieldValues[field.id] = raw;
    }
  }

  return fieldValues;
}

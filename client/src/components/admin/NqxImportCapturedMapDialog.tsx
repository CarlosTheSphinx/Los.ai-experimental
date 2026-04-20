import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────
interface NqxFieldOption { id: string; label: string }
interface NqxField { id: string; label: string; type: 'text' | 'number' | 'select' | 'unknown'; options?: NqxFieldOption[] }
interface NqxProduct { id: string; name: string; fields: NqxField[] }
interface FieldMapping { internalKey: string; internalLabel: string; fieldId: string | null; fieldLabel: string | null; confidence: number }
interface OptionMapping { fieldId: string; internalValue: string; optionId: string; optionLabel: string; confidence: number }
export interface ApiModeConfig {
  computeId: string;
  computeName?: string;
  selectedProductId: string | null;
  products: NqxProduct[];
  fieldMappings: FieldMapping[];
  optionMappings: OptionMapping[];
  discoveredAt: string;
}

interface CapturedMap {
  pricerId: string;
  productId: string;
  capturedAt?: string;
  fields: Record<string, {
    fieldId: string | null;
    type: 'dropdown';
    options: { id: string; label: string; order?: number }[];
  }>;
  numericFields?: Record<string, string>;
  baselinePayload?: Record<string, unknown>;
}

interface NumericChoice {
  fieldId: string;
  label: string;
  sampleValue: unknown;
  internalKey: string;
}

const NUMERIC_INTERNAL_KEYS: { key: string; label: string }[] = [
  { key: '__skip__', label: '(do not map)' },
  { key: 'loanAmount', label: 'Loan Amount' },
  { key: 'propertyValue', label: 'Property Value (As-Is / Purchase)' },
  { key: 'purchasePrice', label: 'Purchase Price' },
  { key: 'asIsValue', label: 'As-Is Value' },
  { key: 'arv', label: 'After Repair Value (ARV)' },
  { key: 'rehabBudget', label: 'Rehab Budget' },
];

// Mirror of server INTERNAL_FIELD_LABELS / INTERNAL_OPTION_SYNONYMS so we can
// build mappings client-side from a captured map.
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
  condo: ['condo', 'condominium'],
  multifamily: ['multifamily', 'multi-family', 'mf'],
  '2-4 unit': ['2-4 unit', '2-4', 'two to four'],
};

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fuzzyScore(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const aw = na.split(' ');
  const bw = nb.split(' ');
  const bSet: Record<string, true> = {};
  bw.forEach((w) => { bSet[w] = true; });
  const inter = aw.filter((w) => bSet[w]).length;
  const unionSet: Record<string, true> = { ...bSet };
  aw.forEach((w) => { unionSet[w] = true; });
  const union = Object.keys(unionSet).length;
  return union === 0 ? 0 : inter / union;
}

function detectNumericCandidates(captured: CapturedMap): NumericChoice[] {
  const dropdownIds: Record<string, true> = {};
  for (const f of Object.values(captured.fields || {})) {
    if (f.fieldId) dropdownIds[f.fieldId] = true;
  }
  const seenIds: Record<string, true> = {};
  const out: NumericChoice[] = [];
  for (const [label, fid] of Object.entries(captured.numericFields || {})) {
    if (!fid || seenIds[fid]) continue;
    seenIds[fid] = true;
    out.push({
      fieldId: fid,
      label,
      sampleValue: captured.baselinePayload?.[fid],
      internalKey: '__skip__',
    });
  }
  if (captured.baselinePayload) {
    for (const [k, v] of Object.entries(captured.baselinePayload)) {
      if (!OBJECT_ID_RE.test(k) || dropdownIds[k] || seenIds[k]) continue;
      const isNumeric =
        typeof v === 'number' ||
        (typeof v === 'string' && v.length > 0 && /^[\d.,\-]+$/.test(v));
      if (!isNumeric) continue;
      seenIds[k] = true;
      out.push({ fieldId: k, label: '', sampleValue: v, internalKey: '__skip__' });
    }
  }
  return out;
}

function adaptCapturedMap(captured: CapturedMap, numerics: NumericChoice[]): ApiModeConfig {
  const selectFields: NqxField[] = [];
  for (const [label, f] of Object.entries(captured.fields || {})) {
    if (!f.fieldId) continue;
    selectFields.push({
      id: f.fieldId,
      label,
      type: 'select',
      options: (f.options || []).map((o) => ({ id: o.id, label: o.label })),
    });
  }
  const numberFields: NqxField[] = numerics
    .filter((n) => n.internalKey && n.internalKey !== '__skip__')
    .map((n) => ({
      id: n.fieldId,
      label: n.label || INTERNAL_FIELD_LABELS[n.internalKey]?.[0] || n.internalKey,
      type: 'number' as const,
    }));

  const product: NqxProduct = {
    id: captured.productId,
    name: 'Imported Product',
    fields: [...selectFields, ...numberFields],
  };

  const fieldMappings: FieldMapping[] = [];
  for (const [internalKey, synonyms] of Object.entries(INTERNAL_FIELD_LABELS)) {
    let best: { field: NqxField; score: number } | null = null;
    for (const f of selectFields) {
      let s = 0;
      for (const syn of synonyms) s = Math.max(s, fuzzyScore(syn, f.label));
      s = Math.max(s, fuzzyScore(internalKey, f.label));
      if (!best || s > best.score) best = { field: f, score: s };
    }
    fieldMappings.push({
      internalKey,
      internalLabel: synonyms[0],
      fieldId: best && best.score >= 0.5 ? best.field.id : null,
      fieldLabel: best && best.score >= 0.5 ? best.field.label : null,
      confidence: best ? Number(best.score.toFixed(2)) : 0,
    });
  }

  for (const n of numerics) {
    if (!n.internalKey || n.internalKey === '__skip__') continue;
    const numLabel = INTERNAL_FIELD_LABELS[n.internalKey]?.[0] || n.internalKey;
    const entry: FieldMapping = {
      internalKey: n.internalKey,
      internalLabel: numLabel,
      fieldId: n.fieldId,
      fieldLabel: n.label || numLabel,
      confidence: 1,
    };
    const idx = fieldMappings.findIndex((fm) => fm.internalKey === n.internalKey);
    if (idx >= 0) fieldMappings[idx] = entry;
    else fieldMappings.push(entry);
  }

  const optionMappings: OptionMapping[] = [];
  for (const fm of fieldMappings) {
    if (!fm.fieldId) continue;
    const field = selectFields.find((f) => f.id === fm.fieldId);
    if (!field?.options) continue;
    for (const internal of Object.keys(INTERNAL_OPTION_SYNONYMS)) {
      const synonyms = INTERNAL_OPTION_SYNONYMS[internal];
      let best: { opt: NqxFieldOption; score: number } | null = null;
      for (const opt of field.options) {
        let s = 0;
        for (const syn of synonyms) s = Math.max(s, fuzzyScore(syn, opt.label));
        s = Math.max(s, fuzzyScore(internal, opt.label));
        if (!best || s > best.score) best = { opt, score: s };
      }
      if (best && best.score >= 0.6) {
        optionMappings.push({
          fieldId: fm.fieldId,
          internalValue: internal,
          optionId: best.opt.id,
          optionLabel: best.opt.label,
          confidence: Number(best.score.toFixed(2)),
        });
      }
    }
  }

  return {
    computeId: captured.pricerId,
    computeName: 'Imported (NQX Capture)',
    selectedProductId: captured.productId,
    products: [product],
    fieldMappings,
    optionMappings,
    discoveredAt: captured.capturedAt || new Date().toISOString(),
  };
}

function validateCaptured(parsed: unknown): { ok: true; map: CapturedMap } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Not a JSON object.' };
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.pricerId !== 'string' || !OBJECT_ID_RE.test(obj.pricerId)) {
    return { ok: false, error: 'Missing or invalid pricerId (24-hex).' };
  }
  if (typeof obj.productId !== 'string' || !OBJECT_ID_RE.test(obj.productId)) {
    return { ok: false, error: 'Missing or invalid productId (24-hex).' };
  }
  if (!obj.fields || typeof obj.fields !== 'object') {
    return { ok: false, error: 'Missing fields object.' };
  }
  return { ok: true, map: parsed as CapturedMap };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current Pricer URL value from the parent — used as a fallback default. */
  currentPricerUrl?: string;
  onApply: (result: { config: ApiModeConfig; pricerUrl: string }) => void;
}

function defaultPricerUrl(pricerId: string, currentUrl?: string): string {
  // If the current URL already contains the same pricerId, keep it (preserves
  // the lender's specific subdomain like `b-diya.nqxpricer.com`).
  if (currentUrl && currentUrl.includes(pricerId)) return currentUrl;
  // Otherwise fall back to the canonical host. Admins can edit it freely.
  return `https://www.nqxpricer.com/${pricerId}`;
}

export function NqxImportCapturedMapDialog({
  open,
  onOpenChange,
  currentPricerUrl,
  onApply,
}: Props) {
  const { toast } = useToast();
  const [rawJson, setRawJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedMap | null>(null);
  const [numerics, setNumerics] = useState<NumericChoice[]>([]);
  const [pricerUrl, setPricerUrl] = useState('');

  const reset = () => {
    setRawJson('');
    setParseError(null);
    setCaptured(null);
    setNumerics([]);
    setPricerUrl('');
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const ingest = (text: string) => {
    setRawJson(text);
    if (!text.trim()) {
      setParseError(null);
      setCaptured(null);
      setNumerics([]);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON';
      setParseError(msg);
      setCaptured(null);
      setNumerics([]);
      return;
    }
    const v = validateCaptured(parsed);
    if (!v.ok) {
      setParseError(v.error);
      setCaptured(null);
      setNumerics([]);
      return;
    }
    setParseError(null);
    setCaptured(v.map);
    setNumerics(detectNumericCandidates(v.map));
    setPricerUrl(defaultPricerUrl(v.map.pricerId, currentPricerUrl));
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    ingest(text);
  };

  const updateNumeric = (fieldId: string, patch: Partial<NumericChoice>) => {
    setNumerics((prev) => prev.map((n) => (n.fieldId === fieldId ? { ...n, ...patch } : n)));
  };

  const dropdownCount = useMemo(
    () => (captured ? Object.values(captured.fields).filter((f) => f.fieldId).length : 0),
    [captured],
  );
  const totalDropdowns = useMemo(
    () => (captured ? Object.keys(captured.fields).length : 0),
    [captured],
  );

  const apply = () => {
    if (!captured) return;
    // Detect duplicate internal-key picks across numerics
    const picked = numerics.filter((n) => n.internalKey && n.internalKey !== '__skip__');
    const keyCounts = new Map<string, number>();
    for (const n of picked) keyCounts.set(n.internalKey, (keyCounts.get(n.internalKey) || 0) + 1);
    const dupes = Array.from(keyCounts.entries()).filter(([, c]) => c > 1).map(([k]) => k);
    if (dupes.length) {
      toast({
        title: 'Duplicate numeric mapping',
        description: `Each internal key can only be mapped once. Duplicate(s): ${dupes.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }
    const config = adaptCapturedMap(captured, numerics);
    const finalUrl = pricerUrl.trim() || defaultPricerUrl(captured.pricerId, currentPricerUrl);
    onApply({ config, pricerUrl: finalUrl });
    toast({
      title: 'Captured map imported',
      description: `${config.products[0].fields.length} field(s) loaded — ${config.fieldMappings.filter((f) => f.fieldId).length}/${config.fieldMappings.length} internal keys mapped.`,
    });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-nqx-import-captured">
        <DialogHeader>
          <DialogTitle>Import Captured Map</DialogTitle>
          <DialogDescription>
            Upload (or paste) the JSON file you exported from the NQX pricer with the Lendry capture
            overlay. We&apos;ll convert it into a live API config you can test.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 — Source */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-semibold">1. Captured JSON</Label>
              <Label
                htmlFor="nqx-import-file"
                className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:underline cursor-pointer"
              >
                <Upload className="h-3 w-3" /> Upload .json
              </Label>
              <input
                id="nqx-import-file"
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
                data-testid="input-import-file"
              />
            </div>
            <textarea
              value={rawJson}
              onChange={(e) => ingest(e.target.value)}
              placeholder='Paste the contents of lendry-nqx-<pricerId>.json here'
              className="w-full h-32 text-[11px] font-mono bg-muted/30 border rounded p-2 resize-none"
              data-testid="textarea-import-json"
            />
            {parseError && (
              <div className="flex items-start gap-1.5 text-[12px] text-red-600">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span data-testid="text-import-error">{parseError}</span>
              </div>
            )}
            {captured && (
              <div className="flex items-center gap-2 text-[12px] text-green-700" data-testid="status-import-parsed">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Parsed — pricer <code className="text-[11px] bg-green-50 px-1 rounded">{captured.pricerId}</code>,{' '}
                  product <code className="text-[11px] bg-green-50 px-1 rounded">{captured.productId}</code>,{' '}
                  {dropdownCount}/{totalDropdowns} dropdowns with field IDs, {numerics.length} numeric candidate(s).
                </span>
              </div>
            )}
          </div>

          {/* Step 1b — Pricer URL (auto-filled from pricerId, editable) */}
          {captured && (
            <div className="rounded-md border p-4 space-y-2">
              <Label className="text-[13px] font-semibold" htmlFor="import-pricer-url">
                Pricer URL
              </Label>
              <Input
                id="import-pricer-url"
                value={pricerUrl}
                onChange={(e) => setPricerUrl(e.target.value)}
                placeholder="https://www.nqxpricer.com/<pricerId>"
                className="text-[12px] font-mono"
                data-testid="input-import-pricer-url"
              />
              <p className="text-[11px] text-muted-foreground">
                Pre-filled from the captured <code className="text-[10px] bg-muted/40 px-1 rounded">pricerId</code>. Edit if your lender uses a custom subdomain (e.g. <code className="text-[10px] bg-muted/40 px-1 rounded">b-diya.nqxpricer.com</code>).
              </p>
            </div>
          )}

          {/* Step 2 — Numeric mapping */}
          {captured && (
            <div className="rounded-md border p-4 space-y-3">
              <div>
                <Label className="text-[13px] font-semibold">2. Map numeric fields</Label>
                <p className="text-[12px] text-muted-foreground mt-1">
                  These numeric ObjectIds appear in the baseline payload but aren&apos;t dropdowns.
                  Choose which internal loan field each one represents — borrower-supplied numbers
                  flow through at quote time.
                </p>
              </div>
              {numerics.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic">
                  No numeric candidates detected. (Dropdown-only pricer, or baseline payload missing.)
                </div>
              ) : (
                <div className="space-y-2">
                  {numerics.map((n) => (
                    <div
                      key={n.fieldId}
                      className="grid grid-cols-12 gap-2 items-center"
                      data-testid={`row-numeric-${n.fieldId}`}
                    >
                      <div className="col-span-5">
                        <Input
                          value={n.label}
                          onChange={(e) => updateNumeric(n.fieldId, { label: e.target.value })}
                          placeholder="Label (optional)"
                          className="h-8 text-[12px]"
                          data-testid={`input-numeric-label-${n.fieldId}`}
                        />
                        <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                          {n.fieldId}
                          {n.sampleValue !== undefined && (
                            <span className="ml-1 text-foreground/60">= {String(n.sampleValue)}</span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-7">
                        <Select
                          value={n.internalKey}
                          onValueChange={(val) => updateNumeric(n.fieldId, { internalKey: val })}
                        >
                          <SelectTrigger
                            className="h-8 text-[12px]"
                            data-testid={`select-numeric-key-${n.fieldId}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NUMERIC_INTERNAL_KEYS.map((opt) => (
                              <SelectItem key={opt.key} value={opt.key}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Captured dropdowns preview */}
          {captured && (
            <div className="rounded-md border p-4 space-y-2">
              <Label className="text-[13px] font-semibold">3. Captured dropdowns</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {Object.entries(captured.fields).map(([label, f]) => (
                  <div key={label} className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5">
                      <FileJson className="h-3 w-3 text-muted-foreground" />
                      <strong>{label}</strong>
                      <span className="text-muted-foreground">— {f.options?.length || 0} option(s)</span>
                    </span>
                    {f.fieldId ? (
                      <code className="text-[10px] text-green-700 bg-green-50 px-1 rounded">{f.fieldId}</code>
                    ) : (
                      <span className="text-[10px] text-amber-700">no fieldId</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} data-testid="button-import-cancel">
            Cancel
          </Button>
          <Button
            onClick={apply}
            disabled={!captured}
            className="bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold"
            data-testid="button-import-apply"
          >
            Apply Map
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Calculator,
  Plus,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Upload,
  Globe,
  X,
  Ban,
  AlertTriangle,
  Search,
  Save,
  FileDown,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { NqxGuidedDiscoveryDialog } from '@/components/admin/NqxGuidedDiscoveryDialog';
import { NqxImportCapturedMapDialog, seedProductFieldConfigs, type ProductFieldConfig, type DirectApiSourceType, type DirectApiConditionalRule } from '@/components/admin/NqxImportCapturedMapDialog';

// ─── Types ──────────────────────────────────────────────────────

type PricingMode = 'none' | 'rule-based' | 'ai-upload' | 'external' | 'external-api';

const INTERNAL_FIELD_KEYS: { key: string; label: string }[] = [
  { key: 'loanAmount', label: 'Loan Amount' },
  { key: 'propertyValue', label: 'Property Value' },
  { key: 'purchasePrice', label: 'Purchase Price' },
  { key: 'asIsValue', label: 'As-Is Value' },
  { key: 'arv', label: 'After Repair Value (ARV)' },
  { key: 'rehabBudget', label: 'Rehab Budget' },
  { key: 'ltv', label: 'LTV (%)' },
  { key: 'ltc', label: 'LTC (%)' },
  { key: 'dscr', label: 'DSCR' },
  { key: 'ficoScore', label: 'FICO Score' },
  { key: 'units', label: 'Units' },
  { key: 'experience', label: 'Investor Experience' },
  { key: 'loanType', label: 'Loan Type' },
  { key: 'loanPurpose', label: 'Loan Purpose' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'state', label: 'State' },
  { key: 'citizenship', label: 'Citizenship' },
  { key: 'prepaymentPenalty', label: 'Prepayment Penalty' },
  { key: 'interestOnly', label: 'Interest Only' },
];

interface NqxFieldOption { id: string; label: string }
interface NqxField { id: string; label: string; type: 'text' | 'number' | 'select' | 'unknown'; options?: NqxFieldOption[] }
interface NqxProduct { id: string; name: string; fields: NqxField[] }
interface FieldMapping { internalKey: string; internalLabel: string; fieldId: string | null; fieldLabel: string | null; confidence: number }
interface OptionMapping { fieldId: string; internalValue: string; optionId: string; optionLabel: string; confidence: number }
interface ApiModeConfig {
  computeId: string;
  computeName?: string;
  selectedProductId: string | null;
  products: NqxProduct[];
  fieldMappings: FieldMapping[];
  optionMappings: OptionMapping[];
  productFieldConfigs?: ProductFieldConfig[];
  discoveredAt: string;
}

interface TierEntry {
  id: string;
  label: string;
  rateAdd: string;
  isDisqualified: boolean;
}

interface AdjusterCategory {
  id: string;
  name: string;
  tiers: TierEntry[];
}

// ─── External Pricing Config Types ──────────────────────────────

type FieldSourceType = 'borrower' | 'default' | 'calculated';

interface ExternalTextInput {
  id: string;
  fieldKey: string;
  label: string;
  sourceType: FieldSourceType;
  defaultValue?: string;
  formula?: string;
  mappedFrom?: string;
}

interface ConditionalRule {
  operator: '>=' | '>' | '<=' | '<' | '==' | 'between';
  value: string;
  value2?: string;
  option: string;
}

interface ExternalDropdown {
  label: string;
  fieldKey: string;
  options: string[];
  sourceType: FieldSourceType;
  defaultValue?: string;
  formula?: string;
  conditionalRules?: ConditionalRule[];
  fallbackOption?: string;
  mappedFrom?: string;
}

interface ExternalPricingConfig {
  scraperUrl: string;
  textInputs: ExternalTextInput[];
  dropdowns: ExternalDropdown[];
}

const NQX_DEFAULTS: ExternalPricingConfig = {
  scraperUrl: 'https://www.b-diya.nqxpricer.com/69af4d475dd9d8d5dc27b54b',
  textInputs: [
    { id: ':r0:', fieldKey: 'loanAmount', label: 'Loan Amount' },
    { id: ':r1:', fieldKey: 'propertyValue', label: 'Property Value' },
  ],
  dropdowns: [
    { label: 'LTV', fieldKey: 'ltv', options: ['≤ 50%', '50.01% - 55%', '55.01% - 60%', '60.01% - 65%', '65.01% - 70%', '70.01% - 75%', '75.01% - 80%'] },
    { label: 'Loan Type', fieldKey: 'loanType', options: ['30 YR Fixed Rate', '10/6 ARM (30 YR)', '7/6 ARM (30 YR)', '5/6 ARM (30 YR)'] },
    { label: 'Interest Only', fieldKey: 'interestOnly', options: ['Yes', 'No'] },
    { label: 'Loan Purpose', fieldKey: 'loanPurpose', options: ['Purchase', 'Rate/Term Refinance', 'Cash Out Refinance'] },
    { label: 'Property Type', fieldKey: 'propertyType', options: ['Single Family Residence', 'Condo (Warrantable)', 'Condo (Non-Warrantable)', '2-4 Unit', 'Multifamily (5+ Units)'] },
    { label: 'Est. DSCR', fieldKey: 'dscr', options: ['≥ 1.50', '1.25 - 1.49', '1.00 - 1.24', '0.75 - 0.99', '< 0.75', 'No Ratio'] },
    { label: 'Stated FICO Score', fieldKey: 'ficoScore', options: ['≥ 780', '760 - 779', '740 - 759', '720 - 739', '700 - 719', '680 - 699', '660 - 679'] },
    { label: 'Prepayment Penalty', fieldKey: 'prepaymentPenalty', options: ['5 Years', '4 Years', '3 Years', '2 Years', '1 Year', 'None'] },
    { label: 'TPO Premium', fieldKey: 'tpoPremium', options: ['1', '2', '3'] },
  ],
};

// ─── Default tier-based adjuster categories ─────────────────────

const DEFAULT_CATEGORIES: AdjusterCategory[] = [
  {
    id: 'fico',
    name: 'FICO Score Adjustments',
    tiers: [
      { id: 'fico_760', label: 'FICO ≥ 760', rateAdd: '-0.250', isDisqualified: false },
      { id: 'fico_720', label: 'FICO 720 – 759', rateAdd: '0.000', isDisqualified: false },
      { id: 'fico_680', label: 'FICO 680 – 719', rateAdd: '0.250', isDisqualified: false },
      { id: 'fico_660', label: 'FICO 660 – 679', rateAdd: '0.500', isDisqualified: false },
      { id: 'fico_lt_660', label: 'FICO < 660', rateAdd: '0', isDisqualified: true },
    ],
  },
  {
    id: 'ltv',
    name: 'LTV Adjustments',
    tiers: [
      { id: 'ltv_65', label: 'LTV ≤ 65%', rateAdd: '-0.250', isDisqualified: false },
      { id: 'ltv_75', label: 'LTV 65% – 75%', rateAdd: '0.000', isDisqualified: false },
      { id: 'ltv_80', label: 'LTV 75% – 80%', rateAdd: '0.250', isDisqualified: false },
    ],
  },
  {
    id: 'property',
    name: 'Property Type Adjustments',
    tiers: [
      { id: 'prop_multi', label: 'Multifamily (5+ units)', rateAdd: '0.500', isDisqualified: false },
      { id: 'prop_mixed', label: 'Mixed-use property', rateAdd: '0.250', isDisqualified: false },
    ],
  },
  {
    id: 'purpose',
    name: 'Loan Purpose Adjustments',
    tiers: [
      { id: 'purpose_cashout', label: 'Cash-out refinance', rateAdd: '0.500', isDisqualified: false },
    ],
  },
  {
    id: 'dscr',
    name: 'DSCR Adjustments',
    tiers: [
      { id: 'dscr_125', label: 'DSCR ≥ 1.25', rateAdd: '-0.125', isDisqualified: false },
      { id: 'dscr_100', label: 'DSCR 1.00 – 1.24', rateAdd: '0.000', isDisqualified: false },
      { id: 'dscr_lt_100', label: 'DSCR < 1.00', rateAdd: '0.500', isDisqualified: false },
    ],
  },
];

const CATEGORY_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#EC4899', '#6366F1'];

// ─── Helpers ────────────────────────────────────────────────────

function getTierTag(rateAdd: string, isDisqualified: boolean): { label: string; className: string } {
  if (isDisqualified) return { label: 'DISQUALIFIED', className: 'bg-red-100 text-red-700 border-red-200' };
  const val = parseFloat(rateAdd) || 0;
  if (val < 0) return { label: 'Discount', className: 'bg-green-100 text-green-700 border-green-200' };
  if (val === 0) return { label: 'Base', className: 'bg-gray-100 text-gray-600 border-gray-200' };
  return { label: 'Premium', className: 'bg-amber-100 text-amber-700 border-amber-200' };
}

function formatRate(val: string): string {
  const num = parseFloat(val) || 0;
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(3)}%`;
}

// ─── Main Component ─────────────────────────────────────────────

export interface PricingConfigState {
  pricingMode: string;
  externalPricingConfig: ExternalPricingConfig | null;
  yspEnabled: boolean;
  yspMin: number;
  yspMax: number;
  yspStep: number;
  yspBrokerCanToggle: boolean;
  basePoints: number;
  basePointsMin: number;
  basePointsMax: number;
  brokerPointsEnabled: boolean;
  brokerPointsStep: number;
}

export function PricingConfiguration({
  onNext,
  onBack,
  hideNavigation = false,
  programId: propProgramId,
  onChange,
}: {
  onNext?: () => void;
  onBack?: () => void;
  hideNavigation?: boolean;
  programId?: number | null;
  onChange?: (state: PricingConfigState) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: programsData, isLoading: programsLoading } = useQuery<any>({
    queryKey: ['/api/admin/programs'],
    enabled: !hideNavigation,
  });

  const programs: any[] = !hideNavigation
    ? (Array.isArray(programsData)
        ? programsData
        : programsData?.programs
          ? programsData.programs
          : programsData
            ? Object.values(programsData).filter((v: any) => v && typeof v === 'object' && v.id)
            : [])
    : [];

  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(propProgramId ?? null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('rule-based');

  const [baseRate, setBaseRate] = useState('7.125');
  const [rateFloor, setRateFloor] = useState('6.500');
  const [rateCeiling, setRateCeiling] = useState('10.000');

  const [categories, setCategories] = useState<AdjusterCategory[]>(
    DEFAULT_CATEGORIES.map((c) => ({ ...c, tiers: c.tiers.map((t) => ({ ...t })) }))
  );
  const [expandedCategory, setExpandedCategory] = useState<string>('fico');

  const [yspEnabled, setYspEnabled] = useState(true);
  const [yspMin, setYspMin] = useState('0.50');
  const [yspMax, setYspMax] = useState('2.00');
  const [yspStep, setYspStep] = useState('0.125');
  const [yspBrokerAdjustable, setYspBrokerAdjustable] = useState(true);

  const [basePoints, setBasePoints] = useState('1.00');
  const [pointsMin, setPointsMin] = useState('1.00');
  const [pointsMax, setPointsMax] = useState('3.00');
  const [pointsStep, setPointsStep] = useState('0.25');
  const [pointsBrokerAdjustable, setPointsBrokerAdjustable] = useState(true);

  const [extScraperUrl, setExtScraperUrl] = useState('');
  const [extTextInputs, setExtTextInputs] = useState<ExternalTextInput[]>([]);
  const [extDropdowns, setExtDropdowns] = useState<ExternalDropdown[]>([]);

  // ─── External-API (Direct NQX) state ──────────────────────────
  const [apiUrl, setApiUrl] = useState('');
  const [apiConfig, setApiConfig] = useState<ApiModeConfig | null>(null);
  const [apiTestSample, setApiTestSample] = useState<string>(
    JSON.stringify({ loanAmount: 500000, propertyValue: 700000, ficoScore: '720', loanType: '30 yr fixed rate', loanPurpose: 'purchase', propertyType: 'single family residence', dscr: '1.25', interestOnly: 'no', prepaymentPenalty: '5 years' }, null, 2)
  );
  const [apiTestResult, setApiTestResult] = useState<any>(null);
  const [showApiRawDebug, setShowApiRawDebug] = useState(false);
  const [extExpandedDropdown, setExtExpandedDropdown] = useState<number | null>(null);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const { data: templatesData, refetch: refetchTemplates } = useQuery<{ templates: any[] }>({
    queryKey: ['/api/admin/pricing-templates'],
  });
  const savedTemplates = templatesData?.templates || [];

  const saveTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const templateTextInputs = extTextInputs.map(ti => ({
        fieldKey: ti.fieldKey,
        label: ti.label,
        sourceType: ti.sourceType,
        defaultValue: ti.defaultValue,
        formula: ti.formula,
        mappedFrom: ti.mappedFrom,
      }));
      const templateDropdowns = extDropdowns.map(dd => ({
        fieldKey: dd.fieldKey,
        label: dd.label,
        sourceType: dd.sourceType,
        defaultValue: dd.defaultValue,
        formula: dd.formula,
        conditionalRules: dd.conditionalRules,
        fallbackOption: dd.fallbackOption,
        mappedFrom: dd.mappedFrom,
      }));
      const res = await apiRequest('POST', '/api/admin/pricing-templates', { name, textInputs: templateTextInputs, dropdowns: templateDropdowns });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Template saved', description: `"${templateName}" saved successfully.` });
      setShowSaveTemplateDialog(false);
      setTemplateName('');
      refetchTemplates();
    },
    onError: () => {
      toast({ title: 'Save failed', description: 'Could not save the template.', variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/admin/pricing-templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Template deleted' });
      refetchTemplates();
    },
  });

  const applyTemplate = (template: any) => {
    const tTextInputs = (template.textInputs || template.text_inputs || []) as any[];
    const tDropdowns = (template.dropdowns || []) as any[];
    let matchedCount = 0;
    const totalFields = tTextInputs.length + tDropdowns.length;

    const updatedTextInputs = extTextInputs.map(ti => {
      const match = tTextInputs.find((t: any) => t.label.toLowerCase() === ti.label.toLowerCase());
      if (match) {
        matchedCount++;
        return { ...ti, fieldKey: match.fieldKey || ti.fieldKey, sourceType: match.sourceType || ti.sourceType, defaultValue: match.defaultValue, formula: match.formula, mappedFrom: match.mappedFrom };
      }
      return ti;
    });
    const updatedDropdowns = extDropdowns.map(dd => {
      const match = tDropdowns.find((t: any) => t.label.toLowerCase() === dd.label.toLowerCase());
      if (match) {
        matchedCount++;
        return { ...dd, fieldKey: match.fieldKey || dd.fieldKey, sourceType: match.sourceType || dd.sourceType, defaultValue: match.defaultValue, formula: match.formula, conditionalRules: match.conditionalRules, fallbackOption: match.fallbackOption, mappedFrom: match.mappedFrom };
      }
      return dd;
    });

    setExtTextInputs(updatedTextInputs);
    setExtDropdowns(updatedDropdowns);
    toast({ title: 'Template applied', description: `Matched ${matchedCount} of ${totalFields} fields from "${template.name}".` });
  };

  const scanFieldsMutation = useMutation({
    mutationFn: async (scanUrl: string) => {
      const res = await apiRequest('POST', '/api/admin/programs/scan-pricing-fields', { url: scanUrl });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        const scannedDropdowns: ExternalDropdown[] = (data.dropdowns || []).map((dd: any) => ({
          label: dd.label || '',
          fieldKey: (dd.label || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
          options: dd.options || [],
          sourceType: 'borrower' as FieldSourceType,
        }));
        const dropdownLabels = new Set(scannedDropdowns.map(d => d.label.toLowerCase()));
        const dropdownKeys = new Set(scannedDropdowns.map(d => d.fieldKey));
        const scannedTextInputs: ExternalTextInput[] = (data.textInputs || [])
          .filter((ti: any) => {
            const label = (ti.label || ti.placeholder || '').toLowerCase();
            const key = label.replace(/[^a-z0-9]+/g, '');
            return !dropdownLabels.has(label) && !dropdownKeys.has(key);
          })
          .map((ti: any) => ({
            id: ti.id || '',
            fieldKey: (ti.placeholder || ti.label || ti.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
            label: ti.label || ti.placeholder || ti.name || '',
            sourceType: 'borrower' as FieldSourceType,
          }));
        setExtTextInputs(scannedTextInputs);
        setExtDropdowns(scannedDropdowns);
        toast({ title: `Scan complete`, description: `Found ${scannedTextInputs.length} text inputs and ${scannedDropdowns.length} dropdowns.` });
      } else {
        toast({ title: 'Scan failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Scan failed', description: error?.message || 'Could not scan the pricing page', variant: 'destructive' });
    },
  });

  const effectiveProgramId = selectedProgramId ?? propProgramId ?? null;

  const { data: existingRuleset, isFetched: rulesetsFetched } = useQuery<{ rulesets: any[] }>({
    queryKey: ['/api/admin/programs', effectiveProgramId, 'rulesets'],
    enabled: !!effectiveProgramId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/programs/${effectiveProgramId}/rulesets`);
      return res.json();
    },
  });

  const { data: editProgramData, isFetched: programFetched } = useQuery<any>({
    queryKey: ['/api/admin/programs', effectiveProgramId],
    enabled: !!effectiveProgramId && hideNavigation,
    queryFn: async () => {
      const res = await fetch(`/api/admin/programs/${effectiveProgramId}`);
      return res.json();
    },
  });

  const quoteFormVariables: { key: string; label: string }[] = (() => {
    const prog = programs.find((p: any) => p.id === effectiveProgramId) || editProgramData?.program;
    if (!prog?.quoteFormFields || !Array.isArray(prog.quoteFormFields)) return [];
    return prog.quoteFormFields
      .filter((f: any) => f.fieldKey && f.visible !== false)
      .map((f: any) => ({ key: f.fieldKey, label: f.label || f.fieldKey }));
  })();

  const [pricingDataLoaded, setPricingDataLoaded] = useState(false);
  useEffect(() => {
    if (pricingDataLoaded || !effectiveProgramId) return;
    if (!hideNavigation) return;
    if (!programFetched || !rulesetsFetched) return;

    const prog = editProgramData?.program;
    if (prog) {
      setSelectedProgramId(effectiveProgramId);
      setYspEnabled(prog.yspEnabled ?? true);
      setYspBrokerAdjustable(prog.yspBrokerCanToggle ?? true);
      setYspMin(String(prog.yspMin ?? '0.50'));
      setYspMax(String(prog.yspMax ?? '2.00'));
      setYspStep(String(prog.yspStep ?? '0.125'));
      setBasePoints(String(prog.basePoints ?? '1.00'));
      setPointsMin(String(prog.brokerPointsMin ?? '0'));
      setPointsMax(String(prog.brokerPointsMax ?? '2.00'));
      setPointsBrokerAdjustable(prog.brokerPointsEnabled ?? true);
      setPointsStep(String(prog.brokerPointsStep ?? '0.25'));

      if (prog.pricingMode) {
        const modeMap: Record<string, PricingMode> = { rule_based: 'rule-based', external: 'external', 'external-api': 'external-api', none: 'none' };
        setPricingMode(modeMap[prog.pricingMode] || (prog.pricingMode as PricingMode));
      }
      if (prog.externalPricingConfig) {
        const cfg = prog.externalPricingConfig as ExternalPricingConfig & { apiMode?: ApiModeConfig };
        setExtScraperUrl(cfg.scraperUrl || '');
        setExtTextInputs((cfg.textInputs || []).map(ti => ({ ...ti, sourceType: ti.sourceType || 'borrower' })));
        setExtDropdowns((cfg.dropdowns || []).map(dd => ({ ...dd, sourceType: dd.sourceType || 'borrower' })));
        if (cfg.apiMode) {
          const seeded = (cfg.apiMode.productFieldConfigs && cfg.apiMode.productFieldConfigs.length > 0)
            ? cfg.apiMode
            : { ...cfg.apiMode, productFieldConfigs: seedProductFieldConfigs(cfg.apiMode) };
          setApiConfig(seeded);
          setApiUrl(cfg.scraperUrl || '');
        }
      }
    }

    const activeRuleset = existingRuleset?.rulesets?.find((r: any) => r.status === 'active') || existingRuleset?.rulesets?.[0];
    if (activeRuleset?.rulesJson) {
      const rj = activeRuleset.rulesJson;
      if (rj.baseRates) {
        const firstRate = Object.values(rj.baseRates)[0];
        if (firstRate != null) setBaseRate(String(firstRate));
      }
      if (rj.rateFloor != null) setRateFloor(String(rj.rateFloor));
      if (rj.rateCeiling != null) setRateCeiling(String(rj.rateCeiling));

      if (rj.adjusters && Array.isArray(rj.adjusters) && rj.adjusters.length > 0) {
        setCategories(prev => {
          const updated = prev.map(cat => {
            const matchingAdjusters = rj.adjusters.filter((a: any) => a.category === cat.name);
            const matchingEligibility = (rj.eligibilityRules || []).filter((e: any) => e.category === cat.name);
            if (matchingAdjusters.length === 0 && matchingEligibility.length === 0) return cat;
            const tiers: TierEntry[] = [
              ...matchingAdjusters.map((a: any) => ({
                id: a.id || `${cat.id}-${a.label}`,
                label: a.label || '',
                condition: '',
                value: '',
                rateAdd: String(a.rateAdd ?? 0),
                isDisqualified: false,
              })),
              ...matchingEligibility.map((e: any) => ({
                id: e.id || `${cat.id}-${e.label}-dq`,
                label: e.label || '',
                condition: '',
                value: '',
                rateAdd: '0',
                isDisqualified: true,
              })),
            ];
            return { ...cat, tiers: tiers.length > 0 ? tiers : cat.tiers };
          });
          return updated;
        });
      }
    }

    setPricingDataLoaded(true);
  }, [effectiveProgramId, editProgramData, existingRuleset, hideNavigation, pricingDataLoaded, programFetched, rulesetsFetched]);

  useEffect(() => {
    if (!onChange) return;
    const pricingModeDb = pricingMode === 'rule-based' ? 'rule_based' : pricingMode;
    let extConfig: (ExternalPricingConfig & { apiMode?: ApiModeConfig }) | null = null;
    if (pricingMode === 'external') {
      extConfig = { scraperUrl: extScraperUrl, textInputs: extTextInputs, dropdowns: extDropdowns };
    } else if (pricingMode === 'external-api' && apiConfig) {
      extConfig = { scraperUrl: apiUrl, textInputs: [], dropdowns: [], apiMode: apiConfig };
    }
    onChange({
      pricingMode: pricingModeDb,
      externalPricingConfig: extConfig,
      yspEnabled,
      yspMin: parseFloat(yspMin) || 0,
      yspMax: parseFloat(yspMax) || 3,
      yspStep: parseFloat(yspStep) || 0.125,
      yspBrokerCanToggle: yspBrokerAdjustable,
      basePoints: parseFloat(basePoints) || 1,
      brokerPointsEnabled: pointsBrokerAdjustable,
      brokerPointsMin: parseFloat(pointsMin) || 0,
      brokerPointsMax: parseFloat(pointsMax) || 2,
      brokerPointsStep: parseFloat(pointsStep) || 0.25,
    });
  }, [onChange, pricingMode, extScraperUrl, extTextInputs, extDropdowns, apiUrl, apiConfig, yspEnabled, yspMin, yspMax, yspStep, yspBrokerAdjustable, basePoints, pointsMin, pointsMax, pointsBrokerAdjustable, pointsStep]);

  const hasExistingRuleset = (existingRuleset?.rulesets?.length || 0) > 0;

  function buildCondition(condition: string, value: string): Record<string, any> {
    const numericConditions = ['ficoLt', 'ficoGt', 'ltvLt', 'ltvGt', 'dscrLt', 'dscrGt', 'loanAmountLt', 'loanAmountGt'];
    if (numericConditions.includes(condition)) return { [condition]: parseFloat(value) || 0 };
    return { [condition]: value };
  }

  const saveRulesetMutation = useMutation({
    mutationFn: async () => {
      const saveProgramId = selectedProgramId || effectiveProgramId;
      if (!saveProgramId) throw new Error('Select a program first');
      const program = programs.find((p: any) => p.id === saveProgramId) || editProgramData?.program;
      const loanType = program?.loanType || 'rtl';

      const pricingModeDb = pricingMode === 'rule-based' ? 'rule_based' : pricingMode;

      if (pricingMode === 'rule-based') {
        const allAdjusters = categories.flatMap((cat) =>
          cat.tiers.filter((t) => !t.isDisqualified && t.label.trim()).map((t) => ({
            id: t.id,
            label: t.label,
            category: cat.name,
            rateAdd: parseFloat(t.rateAdd) || 0,
            pointsAdd: 0,
          }))
        );
        const eligibilityRules = categories.flatMap((cat) =>
          cat.tiers.filter((t) => t.isDisqualified && t.label.trim()).map((t) => ({
            id: t.id,
            label: t.label,
            category: cat.name,
            result: 'ineligible' as const,
          }))
        );

        const rulesJson: any = {
          product: loanType.toUpperCase(),
          baseRates: { [loanType]: parseFloat(baseRate) || 7.125 },
          rateFloor: parseFloat(rateFloor) || 6.5,
          rateCeiling: parseFloat(rateCeiling) || 10,
          adjusters: allAdjusters,
          eligibilityRules,
        };

        const res = await apiRequest('POST', `/api/admin/programs/${saveProgramId}/rulesets`, {
          name: 'Initial Pricing Rules',
          description: 'Created during onboarding',
          rulesJson,
        });
        const data = await res.json();

        if (data.ruleset?.id) {
          await apiRequest('PATCH', `/api/admin/programs/${saveProgramId}/rulesets/${data.ruleset.id}`, { status: 'active' });
        }
      }

      const extConfig: ExternalPricingConfig | null = pricingMode === 'external'
        ? { scraperUrl: extScraperUrl, textInputs: extTextInputs, dropdowns: extDropdowns }
        : null;

      await apiRequest('PUT', `/api/admin/programs/${saveProgramId}`, {
        yspEnabled,
        yspMin: parseFloat(yspMin) || 0,
        yspMax: parseFloat(yspMax) || 3,
        yspStep: parseFloat(yspStep) || 0.125,
        yspBrokerCanToggle: yspBrokerAdjustable,
        basePoints: parseFloat(basePoints) || 1,
        brokerPointsEnabled: pointsBrokerAdjustable,
        brokerPointsMin: parseFloat(pointsMin) || 0,
        brokerPointsMax: parseFloat(pointsMax) || 2,
        brokerPointsStep: parseFloat(pointsStep) || 0.25,
        pricingMode: pricingModeDb,
        externalPricingConfig: extConfig,
      });

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/programs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/programs-with-pricing'] });
      const msg = pricingMode === 'external' ? 'External pricing config saved!' : 'Pricing rules saved and activated!';
      toast({ title: msg });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to save pricing config', description: error?.message, variant: 'destructive' });
    },
  });

  const updateTier = (catId: string, tierId: string, field: keyof TierEntry, value: any) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, tiers: c.tiers.map((t) => (t.id === tierId ? { ...t, [field]: value } : t)) }
          : c
      )
    );
  };

  const removeTier = (catId: string, tierId: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId ? { ...c, tiers: c.tiers.filter((t) => t.id !== tierId) } : c
      )
    );
  };

  const addTier = (catId: string) => {
    const id = `tier_${Date.now()}`;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, tiers: [...c.tiers, { id, label: '', rateAdd: '0.000', isDisqualified: false }] }
          : c
      )
    );
    setExpandedCategory(catId);
  };

  const addCategory = () => {
    const id = `cat_${Date.now()}`;
    setCategories((prev) => [
      ...prev,
      { id, name: 'New Category', tiers: [{ id: `tier_${Date.now()}`, label: '', rateAdd: '0.000', isDisqualified: false }] },
    ]);
    setExpandedCategory(id);
  };

  const removeCategory = (catId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== catId));
  };

  const updateCategoryName = (catId: string, name: string) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, name } : c)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[26px] font-bold leading-tight">Pricing Configuration</h2>
        <p className="text-[16px] text-muted-foreground mt-1">
          Set up how rates are calculated for this program. Choose a pricing mode and configure rate adjusters.
        </p>
      </div>

      {!hideNavigation && (
        <div className="border-t pt-5">
          <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">
            Program
          </h3>
          {programsLoading ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-[14px] text-muted-foreground">Loading programs...</span>
            </div>
          ) : programs.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-[10px] border border-amber-200 bg-amber-50/60">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-[14px] text-amber-800">No programs found. Create a program first to configure pricing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Select
                value={selectedProgramId?.toString() || ''}
                onValueChange={(val) => {
                  const pid = parseInt(val);
                  setSelectedProgramId(pid);
                  const prog = programs.find((p: any) => p.id === pid);
                  if (prog) {
                    setYspEnabled(prog.yspEnabled ?? true);
                    setYspBrokerAdjustable(prog.yspBrokerCanToggle ?? true);
                    setYspMin(String(prog.yspMin ?? '0.50'));
                    setYspMax(String(prog.yspMax ?? '2.00'));
                    setYspStep(String(prog.yspStep ?? '0.125'));
                    setBasePoints(String(prog.basePoints ?? '1.00'));
                    setPointsMin(String(prog.brokerPointsMin ?? '0'));
                    setPointsMax(String(prog.brokerPointsMax ?? '2.00'));
                    setPointsBrokerAdjustable(prog.brokerPointsEnabled ?? true);
                    setPointsStep(String(prog.brokerPointsStep ?? '0.25'));
                    const modeMap: Record<string, PricingMode> = { rule_based: 'rule-based', external: 'external', none: 'none' };
                    setPricingMode(modeMap[prog.pricingMode] || 'none');
                    if (prog.externalPricingConfig) {
                      const cfg = prog.externalPricingConfig as ExternalPricingConfig;
                      setExtScraperUrl(cfg.scraperUrl || '');
                      setExtTextInputs((cfg.textInputs || []).map(ti => ({ ...ti, sourceType: ti.sourceType || 'borrower' })));
                      setExtDropdowns((cfg.dropdowns || []).map(dd => ({ ...dd, sourceType: dd.sourceType || 'borrower' })));
                    } else {
                      setExtScraperUrl('');
                      setExtTextInputs([]);
                      setExtDropdowns([]);
                    }
                  }
                }}
                data-testid="select-program"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a program..." />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.loanType?.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasExistingRuleset && selectedProgramId && (
                <div className="flex items-center gap-2 text-[13px] text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  This program already has pricing rules configured.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-t pt-5">
        <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted-foreground mb-4" data-testid="section-pricing-mode">
          Pricing Mode
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <ModeCard
            icon={<Ban className="h-5 w-5" />}
            title="No Pricing"
            subtitle="Manual quotes only"
            selected={pricingMode === 'none'}
            onClick={() => setPricingMode('none')}
          />
          <ModeCard
            icon={<Calculator className="h-5 w-5" />}
            title="Rule-Based"
            subtitle="Base rate + adjusters"
            selected={pricingMode === 'rule-based'}
            onClick={() => setPricingMode('rule-based')}
          />
          <ModeCard
            icon={<Upload className="h-5 w-5" />}
            title="AI Upload"
            subtitle="Upload rate sheet PDF"
            selected={pricingMode === 'ai-upload'}
            onClick={() => setPricingMode('ai-upload')}
          />
          <ModeCard
            icon={<Globe className="h-5 w-5" />}
            title="External URL"
            subtitle="Scrape via headless browser"
            selected={pricingMode === 'external'}
            onClick={() => setPricingMode('external')}
          />
        </div>
        <div className="grid grid-cols-4 gap-3 mt-3">
          <ModeCard
            icon={<Calculator className="h-5 w-5" />}
            title="Direct API (NQX)"
            subtitle="Fast direct API calls (~1–2s)"
            selected={pricingMode === 'external-api'}
            onClick={() => setPricingMode('external-api')}
          />
        </div>
      </div>

      {pricingMode === 'rule-based' && (
        <>
          <div className="border-t pt-5">
            <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted-foreground mb-4" data-testid="section-base-rate">
              Base Rate
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[14px] text-muted-foreground">Base Rate</Label>
                <div className="relative">
                  <Input
                    value={baseRate}
                    onChange={(e) => setBaseRate(e.target.value)}
                    className="pr-6"
                    data-testid="input-base-rate"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[14px] text-muted-foreground">Floor (Min)</Label>
                <div className="relative">
                  <Input
                    value={rateFloor}
                    onChange={(e) => setRateFloor(e.target.value)}
                    className="pr-6"
                    data-testid="input-rate-floor"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[14px] text-muted-foreground">Ceiling (Max)</Label>
                <div className="relative">
                  <Input
                    value={rateCeiling}
                    onChange={(e) => setRateCeiling(e.target.value)}
                    className="pr-6"
                    data-testid="input-rate-ceiling"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-5">
            <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted-foreground mb-2" data-testid="section-rate-adjusters">
              Rate Adjusters
            </h3>
            <p className="text-[14px] text-muted-foreground mb-4">
              Add or subtract from base rate based on deal characteristics. Mark tiers as "Disqualified" to reject deals that don't meet criteria.
            </p>

            <div className="space-y-2">
              {categories.map((cat, catIdx) => {
                const isExpanded = expandedCategory === cat.id;
                const color = CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length];

                return (
                  <div key={cat.id} data-testid={`adjuster-category-${cat.id}`}>
                    <button
                      className="w-full flex items-center gap-3 py-3 px-4 rounded-[10px] border bg-white hover:bg-muted/20 transition-colors text-left"
                      onClick={() => setExpandedCategory(isExpanded ? '' : cat.id)}
                      style={{ borderLeftWidth: '4px', borderLeftColor: color }}
                      data-testid={`button-toggle-category-${cat.id}`}
                    >
                      <ChevronDown
                        className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                      />
                      <span className="text-[15px] font-bold flex-1">{cat.name}</span>
                      <span className="text-[12px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                        {cat.tiers.length} {cat.tiers.length === 1 ? 'tier' : 'tiers'}
                      </span>
                      <span
                        className="text-[12px] text-primary font-medium hover:text-primary/80 ml-1"
                        onClick={(e) => { e.stopPropagation(); addTier(cat.id); }}
                        data-testid={`button-add-tier-${cat.id}`}
                      >
                        + Add Tier
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="ml-4 mt-1 mb-2 rounded-[10px] border bg-white overflow-hidden" style={{ borderLeftWidth: '3px', borderLeftColor: color }}>
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40">
                          <input
                            className="text-[14px] font-semibold bg-transparent border-0 outline-none flex-1 focus:bg-muted/30 focus:px-2 rounded transition-all"
                            value={cat.name}
                            onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                            data-testid={`input-category-name-${cat.id}`}
                          />
                          <button
                            className="text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
                            onClick={() => removeCategory(cat.id)}
                            data-testid={`button-remove-category-${cat.id}`}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="divide-y divide-border/30">
                          {cat.tiers.map((tier) => {
                            const tag = getTierTag(tier.rateAdd, tier.isDisqualified);
                            return (
                              <div
                                key={tier.id}
                                className="flex items-center gap-3 py-2.5 px-4 hover:bg-muted/20 group transition-colors"
                                data-testid={`tier-row-${tier.id}`}
                              >
                                <input
                                  className="text-[14px] text-foreground bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40 focus:bg-muted/30 focus:px-2 rounded transition-all"
                                  value={tier.label}
                                  onChange={(e) => updateTier(cat.id, tier.id, 'label', e.target.value)}
                                  placeholder="Tier label (e.g., FICO ≥ 760)"
                                  data-testid={`input-tier-label-${tier.id}`}
                                />
                                {tier.isDisqualified ? (
                                  <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded border', tag.className)} data-testid={`tag-tier-${tier.id}`}>
                                    {tag.label}
                                  </span>
                                ) : (
                                  <input
                                    className={cn(
                                      'w-[90px] text-[14px] text-center font-medium rounded border px-2 py-1 outline-none transition-colors',
                                      parseFloat(tier.rateAdd) < 0 ? 'text-green-700 border-green-200 bg-green-50' :
                                      parseFloat(tier.rateAdd) === 0 ? 'text-gray-600 border-gray-200 bg-gray-50' :
                                      'text-amber-700 border-amber-200 bg-amber-50'
                                    )}
                                    value={tier.rateAdd}
                                    onChange={(e) => updateTier(cat.id, tier.id, 'rateAdd', e.target.value)}
                                    data-testid={`input-tier-rate-${tier.id}`}
                                  />
                                )}
                                <span className="text-[12px] text-muted-foreground w-[70px] text-right" data-testid={`tag-tier-${tier.id}`}>
                                  {tier.isDisqualified ? (
                                    <span className="text-red-600 font-medium">Reject</span>
                                  ) : (
                                    tag.label
                                  )}
                                </span>
                                <button
                                  className={cn(
                                    'text-[11px] px-1.5 py-0.5 rounded font-medium transition-colors',
                                    tier.isDisqualified
                                      ? 'text-green-600 hover:text-green-800'
                                      : 'text-red-500 hover:text-red-700'
                                  )}
                                  onClick={() => updateTier(cat.id, tier.id, 'isDisqualified', !tier.isDisqualified)}
                                  data-testid={`button-toggle-disqualified-${tier.id}`}
                                >
                                  {tier.isDisqualified ? 'Enable' : 'DQ'}
                                </button>
                                <button
                                  className="text-muted-foreground/40 hover:text-red-500 transition-colors p-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                  onClick={() => removeTier(cat.id, tier.id)}
                                  data-testid={`button-remove-tier-${tier.id}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-4 py-2 border-t border-border/30">
                          <button
                            className="text-[12px] text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                            onClick={() => addTier(cat.id)}
                            data-testid={`button-add-tier-inline-${cat.id}`}
                          >
                            <Plus className="h-3 w-3" /> Add tier
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button variant="outline" className="mt-3" onClick={addCategory} data-testid="button-add-category">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Category
            </Button>
          </div>
        </>
      )}

      {pricingMode === 'ai-upload' && (
        <div className="border-t pt-5">
          <div className="rounded-[10px] border bg-white p-6 text-center space-y-3">
            <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <h4 className="text-[16px] font-semibold">Upload Your Rate Sheet</h4>
            <p className="text-[14px] text-muted-foreground max-w-md mx-auto">
              Upload a PDF of your rate sheet. AI will extract base rates, adjusters, and disqualifiers automatically. You can review and edit before activating.
            </p>
            <p className="text-[13px] text-muted-foreground">
              Available from program settings after setup. Use Rule-Based to get started now.
            </p>
          </div>
        </div>
      )}

      {pricingMode === 'external-api' && (
        <ExternalApiSection
          apiUrl={apiUrl}
          setApiUrl={setApiUrl}
          apiConfig={apiConfig}
          setApiConfig={setApiConfig}
          apiTestSample={apiTestSample}
          setApiTestSample={setApiTestSample}
          apiTestResult={apiTestResult}
          setApiTestResult={setApiTestResult}
          showApiRawDebug={showApiRawDebug}
          setShowApiRawDebug={setShowApiRawDebug}
        />
      )}

      {pricingMode === 'external' && (
        <div className="border-t pt-5 space-y-5">
          <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted-foreground" data-testid="section-external-config">
            External Pricing Configuration
          </h3>

          <div className="rounded-[10px] border bg-white p-5 space-y-4">
            <h4 className="text-[16px] font-bold">Scraper URL</h4>
            <Input
              placeholder="https://www.b-diya.nqxpricer.com/..."
              value={extScraperUrl}
              onChange={(e) => setExtScraperUrl(e.target.value)}
              data-testid="input-scraper-url"
            />
            <Button
              size="sm"
              disabled={scanFieldsMutation.isPending}
              onClick={() => {
                if (!extScraperUrl.trim()) {
                  toast({ title: 'Enter a URL first', description: 'Paste the external pricing page URL above, then click Extract Form Fields.', variant: 'destructive' });
                  return;
                }
                scanFieldsMutation.mutate(extScraperUrl.trim());
              }}
              className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold shadow-md"
              data-testid="button-load-defaults"
            >
              {scanFieldsMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning Page...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Extract Form Fields</>
              )}
            </Button>
          </div>

          {(extTextInputs.length > 0 || extDropdowns.length > 0) && (
          <div className="rounded-[10px] border bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[16px] font-bold">Field Mapping Templates</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaveTemplateDialog(true)}
                data-testid="button-save-template"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save as Template
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">Save your current field mappings as a reusable template, or apply a saved template to restore settings after scanning a new URL.</p>
            {savedTemplates.length > 0 ? (
              <div className="space-y-2">
                {savedTemplates.map((tpl: any) => (
                  <div key={tpl.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/30" data-testid={`template-row-${tpl.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{tpl.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({(tpl.textInputs || tpl.text_inputs || []).length + (tpl.dropdowns || []).length} fields)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyTemplate(tpl)}
                        data-testid={`button-apply-template-${tpl.id}`}
                      >
                        Apply
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTemplateMutation.mutate(tpl.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-template-${tpl.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground italic">No saved templates yet. Configure your field mappings below, then save as a template.</p>
            )}
          </div>
          )}

          <div className="rounded-[10px] border bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[16px] font-bold">Text Input Mappings</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExtTextInputs(prev => [...prev, { id: '', fieldKey: '', label: '', sourceType: 'borrower' }])}
                data-testid="button-add-text-input"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">Map element IDs on the external site to field keys in the quote form.</p>
            {extTextInputs.map((ti, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Element ID (e.g. :r0:)"
                    value={ti.id}
                    onChange={(e) => {
                      const updated = [...extTextInputs];
                      updated[idx] = { ...updated[idx], id: e.target.value };
                      setExtTextInputs(updated);
                    }}
                    className="w-32"
                    data-testid={`input-text-id-${idx}`}
                  />
                  <Input
                    placeholder="Field Key"
                    value={ti.fieldKey}
                    onChange={(e) => {
                      const updated = [...extTextInputs];
                      updated[idx] = { ...updated[idx], fieldKey: e.target.value };
                      setExtTextInputs(updated);
                    }}
                    className="w-32"
                    data-testid={`input-text-fieldkey-${idx}`}
                  />
                  <Input
                    placeholder="Label"
                    value={ti.label}
                    onChange={(e) => {
                      const updated = [...extTextInputs];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setExtTextInputs(updated);
                    }}
                    className="w-36"
                    data-testid={`input-text-label-${idx}`}
                  />
                  <Select
                    value={ti.sourceType || 'borrower'}
                    onValueChange={(val) => {
                      const updated = [...extTextInputs];
                      updated[idx] = { ...updated[idx], sourceType: val as FieldSourceType, defaultValue: val === 'borrower' ? undefined : updated[idx].defaultValue };
                      setExtTextInputs(updated);
                    }}
                  >
                    <SelectTrigger className="w-36" data-testid={`select-text-source-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="borrower">Borrower Input</SelectItem>
                      <SelectItem value="default">Fixed Default</SelectItem>
                      <SelectItem value="calculated">Calculated</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExtTextInputs(prev => prev.filter((_, i) => i !== idx))}
                    data-testid={`button-remove-text-${idx}`}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                {ti.sourceType === 'default' && (
                  <div className="pl-[calc(8rem+0.5rem)]">
                    <Input
                      placeholder="Default value"
                      value={ti.defaultValue || ''}
                      onChange={(e) => {
                        const updated = [...extTextInputs];
                        updated[idx] = { ...updated[idx], defaultValue: e.target.value };
                        setExtTextInputs(updated);
                      }}
                      className="w-48"
                      data-testid={`input-text-default-${idx}`}
                    />
                  </div>
                )}
                {ti.sourceType === 'calculated' && (
                  <div className="pl-[calc(8rem+0.5rem)] space-y-2">
                    <Input
                      placeholder="{fieldA} / ({fieldB} * {fieldC} / 100)"
                      value={ti.formula || ''}
                      onChange={(e) => {
                        const updated = [...extTextInputs];
                        updated[idx] = { ...updated[idx], formula: e.target.value };
                        setExtTextInputs(updated);
                      }}
                      className="font-mono text-[13px]"
                      data-testid={`input-text-formula-${idx}`}
                    />
                    {(() => {
                      const pricingVars = [...extTextInputs.filter((_, i) => i !== idx).map(f => ({ key: f.fieldKey, label: f.label })),
                        ...extDropdowns.map(f => ({ key: f.fieldKey, label: f.label }))].filter(f => f.key);
                      const quoteVars = quoteFormVariables.filter(qf => !pricingVars.some(pv => pv.key === qf.key));
                      const allVars = [...pricingVars, ...quoteVars];
                      return allVars.length > 0 ? (
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Available Variables</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {allVars.map((f, fi) => (
                              <button key={fi} type="button" className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono hover:bg-primary/20 transition-colors cursor-pointer" onClick={() => { const updated = [...extTextInputs]; updated[idx] = { ...updated[idx], formula: (updated[idx].formula || '') + `{${f.key}}` }; setExtTextInputs(updated); }} data-testid={`chip-text-var-${idx}-${fi}`}>
                                {`{${f.key}}`} <span className="opacity-60 font-sans">{f.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <p className="text-[11px] text-muted-foreground">Use {'{fieldKey}'} to reference other fields. Supports +, -, *, /, parentheses.</p>
                  </div>
                )}
              </div>
            ))}
            {extTextInputs.length === 0 && (
              <p className="text-[13px] text-muted-foreground italic">No text inputs defined. Click Add or Extract Form Fields.</p>
            )}
          </div>

          <div className="rounded-[10px] border bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[16px] font-bold">Dropdown Field Definitions</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExtDropdowns(prev => [...prev, { label: '', fieldKey: '', options: [], sourceType: 'borrower' }])}
                data-testid="button-add-dropdown"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Dropdown
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">Define each dropdown on the external pricing form with its label, field key, and option values.</p>

            {extDropdowns.map((dd, ddIdx) => (
              <div key={ddIdx} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Dropdown Label (e.g. LTV)"
                    value={dd.label}
                    onChange={(e) => {
                      const updated = [...extDropdowns];
                      updated[ddIdx] = { ...updated[ddIdx], label: e.target.value };
                      setExtDropdowns(updated);
                    }}
                    className="w-40"
                    data-testid={`input-dd-label-${ddIdx}`}
                  />
                  <Input
                    placeholder="Field Key (e.g. ltv)"
                    value={dd.fieldKey}
                    onChange={(e) => {
                      const updated = [...extDropdowns];
                      updated[ddIdx] = { ...updated[ddIdx], fieldKey: e.target.value };
                      setExtDropdowns(updated);
                    }}
                    className="w-40"
                    data-testid={`input-dd-fieldkey-${ddIdx}`}
                  />
                  <Select
                    value={dd.sourceType || 'borrower'}
                    onValueChange={(val) => {
                      const updated = [...extDropdowns];
                      updated[ddIdx] = { ...updated[ddIdx], sourceType: val as FieldSourceType, defaultValue: val === 'borrower' ? undefined : updated[ddIdx].defaultValue };
                      setExtDropdowns(updated);
                    }}
                  >
                    <SelectTrigger className="w-36" data-testid={`select-dd-source-${ddIdx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="borrower">Borrower Input</SelectItem>
                      <SelectItem value="default">Fixed Default</SelectItem>
                      <SelectItem value="calculated">Calculated</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExtExpandedDropdown(extExpandedDropdown === ddIdx ? null : ddIdx)}
                    data-testid={`button-toggle-dd-${ddIdx}`}
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', extExpandedDropdown === ddIdx && 'rotate-180')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExtDropdowns(prev => prev.filter((_, i) => i !== ddIdx))}
                    data-testid={`button-remove-dd-${ddIdx}`}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-muted-foreground">{dd.options.length} option{dd.options.length !== 1 ? 's' : ''}</span>
                  {dd.sourceType === 'default' && (
                    <Select
                      value={dd.defaultValue || ''}
                      onValueChange={(val) => {
                        const updated = [...extDropdowns];
                        updated[ddIdx] = { ...updated[ddIdx], defaultValue: val };
                        setExtDropdowns(updated);
                      }}
                    >
                      <SelectTrigger className="w-48" data-testid={`select-dd-default-${ddIdx}`}>
                        <SelectValue placeholder="Select default value" />
                      </SelectTrigger>
                      <SelectContent>
                        {dd.options.map((opt, oi) => (
                          <SelectItem key={oi} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {dd.sourceType === 'calculated' && (
                    <span className="text-[12px] text-muted-foreground italic">Calculated from other fields</span>
                  )}
                </div>
                {dd.sourceType === 'calculated' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-[12px] text-muted-foreground uppercase tracking-wider">Formula</Label>
                      <Input
                        placeholder="{grossMonthlyRent} / (({loanAmount} * {interestRate} / 100 / 12) + {monthlyTaxes} + {monthlyInsurance})"
                        value={dd.formula || ''}
                        onChange={(e) => {
                          const updated = [...extDropdowns];
                          updated[ddIdx] = { ...updated[ddIdx], formula: e.target.value };
                          setExtDropdowns(updated);
                        }}
                        className="font-mono text-[13px]"
                        data-testid={`input-dd-formula-${ddIdx}`}
                      />
                      {(() => {
                        const pricingVars = [...extTextInputs.map(f => ({ key: f.fieldKey, label: f.label })),
                          ...extDropdowns.filter((_, i) => i !== ddIdx).map(f => ({ key: f.fieldKey, label: f.label }))].filter(f => f.key);
                        const quoteVars = quoteFormVariables.filter(qf => !pricingVars.some(pv => pv.key === qf.key));
                        const allVars = [...pricingVars, ...quoteVars];
                        return allVars.length > 0 ? (
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Available Variables</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {allVars.map((f, fi) => (
                                <button key={fi} type="button" className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono hover:bg-primary/20 transition-colors cursor-pointer" onClick={() => { const updated = [...extDropdowns]; updated[ddIdx] = { ...updated[ddIdx], formula: (updated[ddIdx].formula || '') + `{${f.key}}` }; setExtDropdowns(updated); }} data-testid={`chip-dd-var-${ddIdx}-${fi}`}>
                                  {`{${f.key}}`} <span className="opacity-60 font-sans">{f.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-[12px] text-muted-foreground uppercase tracking-wider">Conditional Rules</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const updated = [...extDropdowns];
                            const rules = [...(updated[ddIdx].conditionalRules || []), { operator: '>=' as const, value: '', option: '' }];
                            updated[ddIdx] = { ...updated[ddIdx], conditionalRules: rules };
                            setExtDropdowns(updated);
                          }}
                          data-testid={`button-add-rule-${ddIdx}`}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Rule
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Rules are checked top-to-bottom. The first matching rule determines the dropdown selection.</p>

                      {(dd.conditionalRules || []).map((rule, rIdx) => (
                        <div key={rIdx} className="flex items-center gap-2 pl-2 border-l-2 border-primary/20">
                          <span className="text-[12px] text-muted-foreground whitespace-nowrap">If result</span>
                          <Select
                            value={rule.operator}
                            onValueChange={(val) => {
                              const updated = [...extDropdowns];
                              const rules = [...(updated[ddIdx].conditionalRules || [])];
                              rules[rIdx] = { ...rules[rIdx], operator: val as ConditionalRule['operator'] };
                              updated[ddIdx] = { ...updated[ddIdx], conditionalRules: rules };
                              setExtDropdowns(updated);
                            }}
                          >
                            <SelectTrigger className="w-20" data-testid={`select-rule-op-${ddIdx}-${rIdx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value=">=">≥</SelectItem>
                              <SelectItem value=">">{'>'}</SelectItem>
                              <SelectItem value="<=">≤</SelectItem>
                              <SelectItem value="<">{'<'}</SelectItem>
                              <SelectItem value="==">=</SelectItem>
                              <SelectItem value="between">between</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder={rule.operator === 'between' ? 'min' : 'value'}
                            value={rule.value}
                            onChange={(e) => {
                              const updated = [...extDropdowns];
                              const rules = [...(updated[ddIdx].conditionalRules || [])];
                              rules[rIdx] = { ...rules[rIdx], value: e.target.value };
                              updated[ddIdx] = { ...updated[ddIdx], conditionalRules: rules };
                              setExtDropdowns(updated);
                            }}
                            className="w-24 font-mono text-[13px]"
                            data-testid={`input-rule-val-${ddIdx}-${rIdx}`}
                          />
                          {rule.operator === 'between' && (
                            <>
                              <span className="text-[12px] text-muted-foreground whitespace-nowrap">and</span>
                              <Input
                                placeholder="max"
                                value={rule.value2 || ''}
                                onChange={(e) => {
                                  const updated = [...extDropdowns];
                                  const rules = [...(updated[ddIdx].conditionalRules || [])];
                                  rules[rIdx] = { ...rules[rIdx], value2: e.target.value };
                                  updated[ddIdx] = { ...updated[ddIdx], conditionalRules: rules };
                                  setExtDropdowns(updated);
                                }}
                                className="w-24 font-mono text-[13px]"
                                data-testid={`input-rule-val2-${ddIdx}-${rIdx}`}
                              />
                            </>
                          )}
                          <span className="text-[12px] text-muted-foreground whitespace-nowrap">then select</span>
                          <Select
                            value={rule.option || ''}
                            onValueChange={(val) => {
                              const updated = [...extDropdowns];
                              const rules = [...(updated[ddIdx].conditionalRules || [])];
                              rules[rIdx] = { ...rules[rIdx], option: val };
                              updated[ddIdx] = { ...updated[ddIdx], conditionalRules: rules };
                              setExtDropdowns(updated);
                            }}
                          >
                            <SelectTrigger className="w-40" data-testid={`select-rule-opt-${ddIdx}-${rIdx}`}>
                              <SelectValue placeholder="Choose option" />
                            </SelectTrigger>
                            <SelectContent>
                              {dd.options.filter(o => o).map((opt, oi) => (
                                <SelectItem key={oi} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = [...extDropdowns];
                              const rules = (updated[ddIdx].conditionalRules || []).filter((_, i) => i !== rIdx);
                              updated[ddIdx] = { ...updated[ddIdx], conditionalRules: rules };
                              setExtDropdowns(updated);
                            }}
                            data-testid={`button-remove-rule-${ddIdx}-${rIdx}`}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}

                      <div className="flex items-center gap-2 pl-2 border-l-2 border-muted-foreground/20 pt-1">
                        <span className="text-[12px] text-muted-foreground whitespace-nowrap">Otherwise select</span>
                        <Select
                          value={dd.fallbackOption || ''}
                          onValueChange={(val) => {
                            const updated = [...extDropdowns];
                            updated[ddIdx] = { ...updated[ddIdx], fallbackOption: val };
                            setExtDropdowns(updated);
                          }}
                        >
                          <SelectTrigger className="w-40" data-testid={`select-rule-fallback-${ddIdx}`}>
                            <SelectValue placeholder="Fallback option" />
                          </SelectTrigger>
                          <SelectContent>
                            {dd.options.filter(o => o).map((opt, oi) => (
                              <SelectItem key={oi} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {extExpandedDropdown === ddIdx && (
                  <div className="pl-4 space-y-2 border-l-2 border-primary/20">
                    {dd.options.map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const updated = [...extDropdowns];
                            const opts = [...updated[ddIdx].options];
                            opts[optIdx] = e.target.value;
                            updated[ddIdx] = { ...updated[ddIdx], options: opts };
                            setExtDropdowns(updated);
                          }}
                          className="flex-1"
                          data-testid={`input-dd-opt-${ddIdx}-${optIdx}`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const updated = [...extDropdowns];
                            updated[ddIdx] = { ...updated[ddIdx], options: updated[ddIdx].options.filter((_, i) => i !== optIdx) };
                            setExtDropdowns(updated);
                          }}
                          data-testid={`button-remove-opt-${ddIdx}-${optIdx}`}
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const updated = [...extDropdowns];
                        updated[ddIdx] = { ...updated[ddIdx], options: [...updated[ddIdx].options, ''] };
                        setExtDropdowns(updated);
                      }}
                      data-testid={`button-add-opt-${ddIdx}`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Option
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {extDropdowns.length === 0 && (
              <p className="text-[13px] text-muted-foreground italic">No dropdowns defined. Click Add Dropdown or Extract Form Fields.</p>
            )}
          </div>
        </div>
      )}

      <div className="border-t pt-5">
        <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted-foreground mb-4" data-testid="section-ysp-points">
          YSP & Points
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-[10px] border bg-white p-5 space-y-4">
            <h4 className="text-[16px] font-bold">YSP</h4>
            <div className="flex items-center justify-between">
              <Label className="text-[14px]">Enabled</Label>
              <Switch checked={yspEnabled} onCheckedChange={setYspEnabled} data-testid="switch-ysp-enabled" />
            </div>
            {yspEnabled && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-[14px] w-16">Range</Label>
                  <Input
                    value={yspMin}
                    onChange={(e) => setYspMin(e.target.value)}
                    className="w-20 text-center"
                    data-testid="input-ysp-min"
                  />
                  <span className="text-[13px] text-muted-foreground">to</span>
                  <Input
                    value={yspMax}
                    onChange={(e) => setYspMax(e.target.value)}
                    className="w-20 text-center"
                    data-testid="input-ysp-max"
                  />
                  <span className="text-[13px] text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[14px] w-16">Step</Label>
                  <Input
                    value={yspStep}
                    onChange={(e) => setYspStep(e.target.value)}
                    className="w-20 text-center"
                    data-testid="input-ysp-step"
                  />
                  <span className="text-[13px] text-muted-foreground">%</span>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[14px]">Broker Adjustable</Label>
                  <Switch checked={yspBrokerAdjustable} onCheckedChange={setYspBrokerAdjustable} data-testid="switch-ysp-broker" />
                </div>
              </>
            )}
          </div>

          <div className="rounded-[10px] border bg-white p-5 space-y-4">
            <h4 className="text-[16px] font-bold">Lender Points</h4>
            <p className="text-[13px] text-muted-foreground -mt-2">
              Set the lender origination points included in every quote. Brokers see this as a read-only line item.
            </p>
            <div className="flex items-center gap-2">
              <Label className="text-[14px] w-40">Lender Points Included</Label>
              <Input
                value={basePoints}
                onChange={(e) => setBasePoints(e.target.value)}
                className="w-20 text-center"
                data-testid="input-base-points"
              />
              <span className="text-[13px] text-muted-foreground">pts</span>
            </div>
          </div>

          <div className="rounded-[10px] border bg-white p-5 space-y-4">
            <h4 className="text-[16px] font-bold">Broker Points</h4>
            <p className="text-[13px] text-muted-foreground -mt-2">
              Configure how much additional broker compensation can be added on top of lender points.
            </p>
            <div className="flex items-center gap-2">
              <Label className="text-[14px] w-24">Range</Label>
              <Input
                value={pointsMin}
                onChange={(e) => setPointsMin(e.target.value)}
                className="w-20 text-center"
                data-testid="input-points-min"
              />
              <span className="text-[13px] text-muted-foreground">to</span>
              <Input
                value={pointsMax}
                onChange={(e) => setPointsMax(e.target.value)}
                className="w-20 text-center"
                data-testid="input-points-max"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[14px] w-24">Step</Label>
              <Input
                value={pointsStep}
                onChange={(e) => setPointsStep(e.target.value)}
                className="w-20 text-center"
                data-testid="input-points-step"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[14px]">Broker Adjustable</Label>
              <Switch checked={pointsBrokerAdjustable} onCheckedChange={setPointsBrokerAdjustable} data-testid="switch-points-broker" />
            </div>
          </div>
        </div>
      </div>

      {(pricingMode === 'rule-based' || pricingMode === 'external') && (selectedProgramId || effectiveProgramId) && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => saveRulesetMutation.mutate()}
            disabled={saveRulesetMutation.isPending}
            data-testid="button-save-pricing"
          >
            {saveRulesetMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
            ) : pricingMode === 'external' ? (
              <><CheckCircle2 className="h-4 w-4 mr-2" />Save External Pricing Config</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-2" />Save & Activate Pricing Rules</>
            )}
          </Button>
          {saveRulesetMutation.isSuccess && (
            <span className="text-[13px] text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      )}

      {!hideNavigation && (
        <div className="flex items-center justify-between gap-4 pt-4">
          <Button variant="outline" onClick={onBack} data-testid="button-pricing-back">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-pricing-skip">
              {pricingMode === 'none' ? 'Skip for now' : 'Continue'}
            </Button>
            <Button onClick={onNext} data-testid="button-pricing-continue">
              Continue
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Field Mapping Template</DialogTitle>
            <DialogDescription>Give this template a name so you can apply it to other programs later.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Template name (e.g. NQX Pricer Default)"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            data-testid="input-template-name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)} data-testid="button-cancel-template">Cancel</Button>
            <Button
              onClick={() => saveTemplateMutation.mutate(templateName)}
              disabled={!templateName.trim() || saveTemplateMutation.isPending}
              data-testid="button-confirm-save-template"
            >
              {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Mode Card ──────────────────────────────────────────────────

function ModeCard({
  icon,
  title,
  subtitle,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 py-4 px-3 rounded-[10px] border-2 transition-all text-center',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-white hover:border-primary/40'
      )}
      data-testid={`mode-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span className={cn('mb-0.5', selected ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
      </span>
      <span className="text-[14px] font-semibold">{title}</span>
      <span className="text-[12px] text-muted-foreground leading-tight">{subtitle}</span>
    </button>
  );
}

// ─── External API (Direct NQX) Section ──────────────────────────

function ExternalApiSection({
  apiUrl, setApiUrl, apiConfig, setApiConfig,
  apiTestSample, setApiTestSample, apiTestResult, setApiTestResult,
  showApiRawDebug, setShowApiRawDebug,
}: {
  apiUrl: string; setApiUrl: (v: string) => void;
  apiConfig: ApiModeConfig | null; setApiConfig: (c: ApiModeConfig | null) => void;
  apiTestSample: string; setApiTestSample: (v: string) => void;
  apiTestResult: any; setApiTestResult: (r: any) => void;
  showApiRawDebug: boolean; setShowApiRawDebug: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const discoverMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest('POST', '/api/admin/programs/discover-api-schema', { url });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (!data?.success) {
        toast({ title: 'Discovery failed', description: data?.error || 'Unknown error', variant: 'destructive' });
        return;
      }
      const cfg: ApiModeConfig = {
        computeId: data.schema.computeId,
        computeName: data.schema.computeName,
        selectedProductId: data.suggested.selectedProductId,
        products: data.schema.products,
        fieldMappings: data.suggested.fieldMappings,
        optionMappings: data.suggested.optionMappings,
        discoveredAt: data.schema.discoveredAt,
      };
      setApiConfig(cfg);
      toast({
        title: 'Schema discovered',
        description: `Found ${data.schema.products.length} product(s), ${cfg.fieldMappings.filter(f => f.fieldId).length}/${cfg.fieldMappings.length} fields auto-mapped.`,
      });
    },
    onError: (err: any) => {
      toast({ title: 'Discovery failed', description: err?.message || 'Could not discover schema.', variant: 'destructive' });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      let sample: any = {};
      try { sample = JSON.parse(apiTestSample); } catch { throw new Error('Sample loan data is not valid JSON.'); }
      const res = await apiRequest('POST', '/api/admin/programs/test-api-quote', {
        apiConfig,
        sampleLoanData: sample,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setApiTestResult(data);
      if (data?.result?.success) {
        toast({ title: `Got rate ${data.result.rate}% in ${data.result.durationMs}ms` });
      } else {
        toast({ title: 'Test returned no rate', description: data?.result?.message || 'See debug output', variant: 'destructive' });
      }
    },
    onError: (err: any) => {
      setApiTestResult({ error: err?.message });
      toast({ title: 'Test failed', description: err?.message || 'Network or server error', variant: 'destructive' });
    },
  });

  const product = apiConfig?.products.find(p => p.id === apiConfig?.selectedProductId);

  const updateFieldMapping = (internalKey: string, fieldId: string | null) => {
    if (!apiConfig) return;
    const field = product?.fields.find(f => f.id === fieldId) || null;
    setApiConfig({
      ...apiConfig,
      fieldMappings: apiConfig.fieldMappings.map(fm =>
        fm.internalKey === internalKey
          ? { ...fm, fieldId, fieldLabel: field?.label || null, confidence: 1 }
          : fm
      ),
    });
  };

  const updateFieldConfig = (fieldId: string, patch: Partial<ProductFieldConfig>) => {
    if (!apiConfig) return;
    const list = apiConfig.productFieldConfigs && apiConfig.productFieldConfigs.length > 0
      ? apiConfig.productFieldConfigs
      : seedProductFieldConfigs(apiConfig);
    setApiConfig({
      ...apiConfig,
      productFieldConfigs: list.map(pfc => pfc.fieldId === fieldId ? { ...pfc, ...patch } : pfc),
    });
  };

  const moveFieldConfig = (fieldId: string, direction: -1 | 1) => {
    if (!apiConfig) return;
    const list = apiConfig.productFieldConfigs && apiConfig.productFieldConfigs.length > 0
      ? [...apiConfig.productFieldConfigs]
      : seedProductFieldConfigs(apiConfig);
    const idx = list.findIndex(pfc => pfc.fieldId === fieldId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setApiConfig({ ...apiConfig, productFieldConfigs: list });
  };

  const productFieldConfigs: ProductFieldConfig[] = apiConfig
    ? (apiConfig.productFieldConfigs && apiConfig.productFieldConfigs.length > 0
        ? apiConfig.productFieldConfigs
        : seedProductFieldConfigs(apiConfig))
    : [];

  const borrowerCount = productFieldConfigs.filter(p => p.sourceType === 'borrower').length;
  const defaultCount = productFieldConfigs.filter(p => p.sourceType === 'default').length;
  const calcCount = productFieldConfigs.filter(p => p.sourceType === 'calculated').length;

  return (
    <div className="border-t pt-5 space-y-5">
      <div>
        <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted-foreground" data-testid="section-external-api-config">
          Direct API Configuration (NQX)
        </h3>
        <p className="text-[13px] text-muted-foreground mt-1">
          Calls the NQX <code className="text-[12px] bg-muted/40 px-1 rounded">calculate_rate</code> API directly for ~1–2s quotes (vs 20–60s for the headless scraper).
          Run discovery once per URL to capture the field schema; the URL rotates roughly once a month.
        </p>
      </div>

      <div className="rounded-[10px] border bg-white p-5 space-y-4">
        <h4 className="text-[16px] font-bold">1. Pricer URL</h4>
        <Input
          placeholder="https://www.b-diya.nqxpricer.com/<24-hex-id>"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          data-testid="input-api-url"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Button
            size="sm"
            disabled={discoverMutation.isPending}
            onClick={() => {
              const trimmed = apiUrl.trim();
              if (!trimmed) {
                toast({ title: 'Enter a URL first', variant: 'destructive' });
                return;
              }
              discoverMutation.mutate(trimmed);
            }}
            variant="outline"
            className="font-semibold"
            data-testid="button-discover-api"
          >
            {discoverMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Auto (≈30s)...</>
            ) : (
              <><Search className="h-4 w-4 mr-2" />Auto-Discover</>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!apiUrl.trim()) {
                toast({ title: 'Enter a URL first', variant: 'destructive' });
                return;
              }
              setGuidedOpen(true);
            }}
            className="bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold shadow-md"
            data-testid="button-guided-discovery"
          >
            <Search className="h-4 w-4 mr-2" />Guided Discovery
          </Button>
        </div>
        <div className="flex items-center justify-between -mt-2">
          <p className="text-[12px] text-muted-foreground">
            <strong>Guided</strong> is recommended — you fill in one scenario in the pricer and we capture the call. <strong>Auto</strong> only works if the page fires its API call without any user input.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setImportOpen(true)}
            className="text-[12px]"
            data-testid="button-import-captured-map"
          >
            <Upload className="h-3.5 w-3.5 mr-1" />Import captured JSON
          </Button>
        </div>
        <NqxGuidedDiscoveryDialog
          open={guidedOpen}
          onOpenChange={setGuidedOpen}
          pricerUrl={apiUrl.trim()}
        />
        <NqxImportCapturedMapDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          currentPricerUrl={apiUrl}
          onApply={({ config, pricerUrl }) => {
            const seeded = (config.productFieldConfigs && config.productFieldConfigs.length > 0)
              ? config
              : { ...config, productFieldConfigs: seedProductFieldConfigs(config) };
            setApiConfig(seeded);
            setApiUrl(pricerUrl);
            setApiTestResult(null);
          }}
        />
        {apiConfig && (
          <div className="flex items-center gap-2 text-[13px] text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Schema captured {new Date(apiConfig.discoveredAt).toLocaleString()} — compute <code className="text-[11px] bg-green-50 px-1 rounded">{apiConfig.computeId}</code>
          </div>
        )}
      </div>

      {apiConfig && (
        <div className="rounded-[10px] border bg-white p-5 space-y-4">
          <h4 className="text-[16px] font-bold">2. Select Product</h4>
          <Select
            value={apiConfig.selectedProductId || ''}
            onValueChange={(val) => {
              const next = { ...apiConfig, selectedProductId: val };
              next.productFieldConfigs = seedProductFieldConfigs(next);
              setApiConfig(next);
            }}
          >
            <SelectTrigger data-testid="select-api-product">
              <SelectValue placeholder="Select a product..." />
            </SelectTrigger>
            <SelectContent>
              {apiConfig.products.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.fields.length} fields)</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {apiConfig && product && (
        <div className="rounded-[10px] border bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[16px] font-bold">3. Field Configuration</h4>
            <span className="text-[12px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
              {borrowerCount} borrower · {defaultCount} fixed · {calcCount} calculated
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Choose how each pricer field gets its value when running a quote. Borrower fields show on the quote form;
            Fixed locks a value; Calculated derives it from a formula.
          </p>
          <p className="text-[12px] text-muted-foreground -mt-2">
            Use the up/down arrows to control the order Borrower-Input fields appear on the quote form.
          </p>
          <div className="divide-y divide-border/30">
            {productFieldConfigs.map((pfc, idx) => {
              const field = product.fields.find(f => f.id === pfc.fieldId);
              if (!field) return null;
              const isSelect = pfc.fieldType === 'select';
              const isFirst = idx === 0;
              const isLast = idx === productFieldConfigs.length - 1;
              return (
                <div key={pfc.fieldId} className="py-3 space-y-2" data-testid={`row-field-config-${pfc.fieldId}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        disabled={isFirst}
                        onClick={() => moveFieldConfig(pfc.fieldId, -1)}
                        data-testid={`button-move-up-${pfc.fieldId}`}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        disabled={isLast}
                        onClick={() => moveFieldConfig(pfc.fieldId, 1)}
                        data-testid={`button-move-down-${pfc.fieldId}`}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="w-52 shrink-0">
                      <div className="text-[14px] font-medium">{pfc.fieldLabel}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {pfc.fieldType} · …{pfc.fieldId.slice(-6)}
                      </div>
                    </div>
                    <Select
                      value={pfc.sourceType}
                      onValueChange={(val) => updateFieldConfig(pfc.fieldId, { sourceType: val as DirectApiSourceType })}
                    >
                      <SelectTrigger className="w-44" data-testid={`select-source-${pfc.fieldId}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="borrower">Borrower Input</SelectItem>
                        <SelectItem value="default">Fixed Default</SelectItem>
                        <SelectItem value="calculated">Calculated</SelectItem>
                      </SelectContent>
                    </Select>

                    {pfc.sourceType === 'borrower' && (
                      <Select
                        value={pfc.internalKey || '__fieldid__'}
                        onValueChange={(val) => updateFieldConfig(pfc.fieldId, { internalKey: val === '__fieldid__' ? undefined : val })}
                      >
                        <SelectTrigger className="flex-1" data-testid={`select-internal-key-${pfc.fieldId}`}>
                          <SelectValue placeholder="Use NQX field ID as form key" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__fieldid__">(Use NQX field ID as form key)</SelectItem>
                          {INTERNAL_FIELD_KEYS.map(k => (
                            <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {pfc.sourceType === 'default' && isSelect && (
                      <Select
                        value={pfc.defaultOptionId || ''}
                        onValueChange={(val) => updateFieldConfig(pfc.fieldId, { defaultOptionId: val })}
                      >
                        <SelectTrigger className="flex-1" data-testid={`select-default-option-${pfc.fieldId}`}>
                          <SelectValue placeholder="Choose option" />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options || []).map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {pfc.sourceType === 'default' && !isSelect && (
                      <Input
                        type="number"
                        className="flex-1"
                        value={pfc.defaultNumber ?? ''}
                        onChange={(e) => updateFieldConfig(pfc.fieldId, { defaultNumber: e.target.value === '' ? undefined : Number(e.target.value) })}
                        placeholder="Fixed numeric value"
                        data-testid={`input-default-number-${pfc.fieldId}`}
                      />
                    )}

                    {pfc.sourceType === 'calculated' && (
                      <Input
                        className="flex-1 font-mono text-[12px]"
                        value={pfc.formula || ''}
                        onChange={(e) => updateFieldConfig(pfc.fieldId, { formula: e.target.value })}
                        placeholder="e.g. {loanAmount} / {propertyValue} * 100"
                        data-testid={`input-formula-${pfc.fieldId}`}
                      />
                    )}
                  </div>

                  {pfc.sourceType === 'calculated' && (
                    <div className="ml-[14.5rem] space-y-2 rounded-md bg-muted/30 p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-muted-foreground mr-1 self-center">Insert:</span>
                        {INTERNAL_FIELD_KEYS.map(v => (
                          <button
                            type="button"
                            key={v.key}
                            className="text-[11px] px-2 py-0.5 rounded border bg-background hover:bg-accent font-mono"
                            onClick={() => updateFieldConfig(pfc.fieldId, { formula: (pfc.formula || '') + `{${v.key}}` })}
                            data-testid={`chip-var-${pfc.fieldId}-${v.key}`}
                          >
                            {`{${v.key}}`}
                          </button>
                        ))}
                      </div>
                      {quoteFormVariables.filter(qv => !INTERNAL_FIELD_KEYS.some(ik => ik.key === qv.key)).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
                          <span className="text-[11px] text-muted-foreground mr-1 self-center">From Quote Form:</span>
                          {quoteFormVariables
                            .filter(qv => !INTERNAL_FIELD_KEYS.some(ik => ik.key === qv.key))
                            .map(v => (
                              <button
                                type="button"
                                key={v.key}
                                className="text-[11px] px-2 py-0.5 rounded border bg-primary/10 hover:bg-primary/20 text-primary font-mono"
                                onClick={() => updateFieldConfig(pfc.fieldId, { formula: (pfc.formula || '') + `{${v.key}}` })}
                                data-testid={`chip-qfvar-${pfc.fieldId}-${v.key}`}
                                title={v.label}
                              >
                                {`{${v.key}}`}
                              </button>
                            ))}
                        </div>
                      )}

                      {isSelect && (
                        <div className="space-y-2">
                          <div className="text-[12px] font-semibold">Conditional Rules → Option</div>
                          {(pfc.conditionalRules || []).map((rule, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-[12px] text-muted-foreground">If result</span>
                              <Select
                                value={rule.operator}
                                onValueChange={(val) => {
                                  const rules = [...(pfc.conditionalRules || [])];
                                  rules[idx] = { ...rule, operator: val as DirectApiConditionalRule['operator'] };
                                  updateFieldConfig(pfc.fieldId, { conditionalRules: rules });
                                }}
                              >
                                <SelectTrigger className="w-28" data-testid={`select-rule-op-${pfc.fieldId}-${idx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="<">&lt;</SelectItem>
                                  <SelectItem value="<=">≤</SelectItem>
                                  <SelectItem value="==">=</SelectItem>
                                  <SelectItem value=">=">≥</SelectItem>
                                  <SelectItem value=">">&gt;</SelectItem>
                                  <SelectItem value="between">between</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                className="w-24"
                                value={rule.value ?? ''}
                                onChange={(e) => {
                                  const rules: DirectApiConditionalRule[] = (pfc.conditionalRules || []).map((r, i) =>
                                    i === idx ? { ...r, value: e.target.value } : r,
                                  );
                                  updateFieldConfig(pfc.fieldId, { conditionalRules: rules });
                                }}
                                data-testid={`input-rule-value-${pfc.fieldId}-${idx}`}
                              />
                              {rule.operator === 'between' && (
                                <>
                                  <span className="text-[12px] text-muted-foreground">and</span>
                                  <Input
                                    type="number"
                                    className="w-24"
                                    value={rule.value2 ?? ''}
                                    onChange={(e) => {
                                      const rules: DirectApiConditionalRule[] = (pfc.conditionalRules || []).map((r, i) =>
                                        i === idx ? { ...r, value2: e.target.value } : r,
                                      );
                                      updateFieldConfig(pfc.fieldId, { conditionalRules: rules });
                                    }}
                                    data-testid={`input-rule-value2-${pfc.fieldId}-${idx}`}
                                  />
                                </>
                              )}
                              <span className="text-[12px] text-muted-foreground">then</span>
                              <Select
                                value={rule.optionId}
                                onValueChange={(val) => {
                                  const rules = [...(pfc.conditionalRules || [])];
                                  rules[idx] = { ...rule, optionId: val };
                                  updateFieldConfig(pfc.fieldId, { conditionalRules: rules });
                                }}
                              >
                                <SelectTrigger className="flex-1" data-testid={`select-rule-option-${pfc.fieldId}-${idx}`}>
                                  <SelectValue placeholder="Choose option" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(field.options || []).map((o: any) => (
                                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const rules = (pfc.conditionalRules || []).filter((_, i) => i !== idx);
                                  updateFieldConfig(pfc.fieldId, { conditionalRules: rules });
                                }}
                                data-testid={`button-remove-rule-${pfc.fieldId}-${idx}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const rules: DirectApiConditionalRule[] = [
                                ...(pfc.conditionalRules || []),
                                { operator: '<=', value: '', optionId: '' },
                              ];
                              updateFieldConfig(pfc.fieldId, { conditionalRules: rules });
                            }}
                            data-testid={`button-add-rule-${pfc.fieldId}`}
                          >
                            + Add Rule
                          </Button>
                          <p className="text-[11px] text-muted-foreground">
                            First matching rule wins. Falls back to the field's first option if none match.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {apiConfig && product && (
        <div className="rounded-[10px] border bg-white p-5 space-y-4">
          <h4 className="text-[16px] font-bold">4. Test Quote</h4>
          <p className="text-[13px] text-muted-foreground">
            Submit a sample loan payload through the direct API and confirm it returns a rate.
          </p>
          <textarea
            value={apiTestSample}
            onChange={(e) => setApiTestSample(e.target.value)}
            className="w-full h-44 font-mono text-[12px] rounded border p-2"
            data-testid="textarea-api-test-sample"
          />
          <Button
            size="sm"
            disabled={testMutation.isPending}
            onClick={() => testMutation.mutate()}
            data-testid="button-test-api-quote"
          >
            {testMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calling API...</> : <>Run Test Quote</>}
          </Button>

          {apiTestResult && (
            <div className="space-y-2">
              {apiTestResult.result?.success ? (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 text-green-800 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    Rate: {apiTestResult.result.rate}% &nbsp;·&nbsp; {apiTestResult.result.durationMs}ms
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    {apiTestResult.result?.message || apiTestResult.error || 'No rate returned'}
                  </div>
                </div>
              )}
              <button
                className="text-[12px] text-primary hover:underline"
                onClick={() => setShowApiRawDebug(!showApiRawDebug)}
                data-testid="button-toggle-api-debug"
              >
                {showApiRawDebug ? 'Hide' : 'Show'} raw debug
              </button>
              {showApiRawDebug && (
                <pre className="text-[11px] bg-muted/40 p-3 rounded overflow-auto max-h-96">
                  {JSON.stringify(apiTestResult, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

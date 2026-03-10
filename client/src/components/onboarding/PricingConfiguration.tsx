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
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────

type PricingMode = 'none' | 'rule-based' | 'ai-upload' | 'external';

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

export function PricingConfiguration({
  onNext,
  onBack,
  hideNavigation = false,
  programId: propProgramId,
}: {
  onNext?: () => void;
  onBack?: () => void;
  hideNavigation?: boolean;
  programId?: number | null;
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
      setPointsMin(String(prog.basePointsMin ?? '1.00'));
      setPointsMax(String(prog.basePointsMax ?? '3.00'));
      setPointsBrokerAdjustable(prog.brokerPointsEnabled ?? true);
      setPointsStep(String(prog.brokerPointsStep ?? '0.25'));
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

      await apiRequest('PUT', `/api/admin/programs/${saveProgramId}`, {
        yspEnabled,
        yspMin: parseFloat(yspMin) || 0,
        yspMax: parseFloat(yspMax) || 3,
        yspStep: parseFloat(yspStep) || 0.125,
        yspBrokerCanToggle: yspBrokerAdjustable,
        basePoints: parseFloat(basePoints) || 1,
        basePointsMin: parseFloat(pointsMin) || 0.5,
        basePointsMax: parseFloat(pointsMax) || 3,
        brokerPointsEnabled: pointsBrokerAdjustable,
        brokerPointsStep: parseFloat(pointsStep) || 0.25,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/programs'] });
      toast({ title: 'Pricing rules saved and activated!' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to save pricing rules', description: error?.message, variant: 'destructive' });
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
                    setPointsMin(String(prog.basePointsMin ?? '1.00'));
                    setPointsMax(String(prog.basePointsMax ?? '3.00'));
                    setPointsBrokerAdjustable(prog.brokerPointsEnabled ?? true);
                    setPointsStep(String(prog.brokerPointsStep ?? '0.25'));
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
            subtitle="Link to pricing API"
            selected={pricingMode === 'external'}
            onClick={() => setPricingMode('external')}
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

      {pricingMode === 'external' && (
        <div className="border-t pt-5">
          <div className="rounded-[10px] border bg-white p-6 text-center space-y-3">
            <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <h4 className="text-[16px] font-semibold">External Pricing API</h4>
            <p className="text-[14px] text-muted-foreground max-w-md mx-auto">
              Connect to a third-party pricing tool. When a quote comes in, we submit the borrower's data and pull back the rate automatically.
            </p>
            <p className="text-[13px] text-muted-foreground">
              Contact Lendry support to configure your external pricing integration.
            </p>
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
            <h4 className="text-[16px] font-bold">Points</h4>
            <div className="flex items-center gap-2">
              <Label className="text-[14px] w-24">Base Points</Label>
              <Input
                value={basePoints}
                onChange={(e) => setBasePoints(e.target.value)}
                className="w-20 text-center"
                data-testid="input-base-points"
              />
            </div>
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

      {!hideNavigation && pricingMode === 'rule-based' && selectedProgramId && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => saveRulesetMutation.mutate()}
            disabled={saveRulesetMutation.isPending}
            data-testid="button-save-pricing"
          >
            {saveRulesetMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
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

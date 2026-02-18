import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  DollarSign,
  Calculator,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Info,
  Sparkles,
  Upload,
  Globe,
  X,
  Settings,
  ShieldAlert,
  TrendingUp,
  Percent,
  AlertTriangle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────

type PricingMode = 'none' | 'rule-based' | 'ai-upload' | 'external';

interface AdjusterEntry {
  id: string;
  label: string;
  condition: string;       // human-readable condition key
  conditionValue: string;  // value for condition
  rateAdd: string;
  pointsAdd: string;
}

interface EligibilityEntry {
  id: string;
  label: string;
  condition: string;
  conditionValue: string;
}

// ─── Common adjuster templates ──────────────────────────────────

const COMMON_ADJUSTERS = [
  { id: 'fico_lt_700', label: 'FICO below 700', condition: 'ficoLt', value: '700', rateAdd: '0.25', pointsAdd: '0' },
  { id: 'fico_lt_680', label: 'FICO below 680', condition: 'ficoLt', value: '680', rateAdd: '0.50', pointsAdd: '0' },
  { id: 'fico_lt_660', label: 'FICO below 660', condition: 'ficoLt', value: '660', rateAdd: '0.75', pointsAdd: '0' },
  { id: 'cash_out', label: 'Cash-out refinance', condition: 'purpose', value: 'cash_out', rateAdd: '0.50', pointsAdd: '0' },
  { id: 'multifamily', label: 'Multifamily (5+ units)', condition: 'propertyType', value: 'multifamily-5-plus', rateAdd: '1.00', pointsAdd: '0' },
  { id: 'mixed_use', label: 'Mixed-use property', condition: 'propertyType', value: 'mixed-use', rateAdd: '0.50', pointsAdd: '0' },
  { id: 'ltv_gt_75', label: 'LTV above 75%', condition: 'ltvGt', value: '75', rateAdd: '0.25', pointsAdd: '0' },
  { id: 'loan_gt_2m', label: 'Loan over $2M', condition: 'loanAmountGt', value: '2000000', rateAdd: '0.25', pointsAdd: '0' },
  { id: 'low_dscr', label: 'DSCR below 1.10', condition: 'dscrLt', value: '1.10', rateAdd: '0.50', pointsAdd: '0' },
];

const COMMON_DISQUALIFIERS = [
  { id: 'fico_min', label: 'FICO below 620', condition: 'ficoLt', value: '620' },
  { id: 'loan_too_small', label: 'Loan under $75,000', condition: 'loanAmountLt', value: '75000' },
  { id: 'loan_too_large', label: 'Loan over $5,000,000', condition: 'loanAmountGt', value: '5000000' },
  { id: 'ltv_too_high', label: 'LTV over 85%', condition: 'ltvGt', value: '85' },
  { id: 'dscr_too_low', label: 'DSCR below 0.75', condition: 'dscrLt', value: '0.75' },
];

const conditionOptions = [
  { value: 'ficoLt', label: 'FICO below' },
  { value: 'ficoGt', label: 'FICO above' },
  { value: 'ltvLt', label: 'LTV below' },
  { value: 'ltvGt', label: 'LTV above' },
  { value: 'dscrLt', label: 'DSCR below' },
  { value: 'dscrGt', label: 'DSCR above' },
  { value: 'loanAmountLt', label: 'Loan amount below' },
  { value: 'loanAmountGt', label: 'Loan amount above' },
  { value: 'purpose', label: 'Loan purpose is' },
  { value: 'propertyType', label: 'Property type is' },
  { value: 'state', label: 'State is' },
  { value: 'isMidstream', label: 'Is midstream' },
];

// ─── Main Component ─────────────────────────────────────────────

export function PricingConfiguration({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch programs to let user pick which one to configure pricing for
  const { data: programsData, isLoading: programsLoading } = useQuery<{ programs: any[] }>({
    queryKey: ['/api/admin/programs'],
  });

  const programs = programsData?.programs?.filter((p: any) => p.isActive) || [];
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('none');

  // Rule-based state
  const [baseRate, setBaseRate] = useState('9.25');
  const [defaultPoints, setDefaultPoints] = useState('2.0');
  const [adjusters, setAdjusters] = useState<AdjusterEntry[]>([]);
  const [disqualifiers, setDisqualifiers] = useState<EligibilityEntry[]>([]);

  // External pricer state
  const [externalUrl, setExternalUrl] = useState('');

  // Check if program already has a ruleset
  const { data: existingRuleset } = useQuery<{ rulesets: any[] }>({
    queryKey: ['/api/admin/programs', selectedProgramId, 'rulesets'],
    enabled: !!selectedProgramId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/programs/${selectedProgramId}/rulesets`);
      return res.json();
    },
  });

  const hasExistingRuleset = (existingRuleset?.rulesets?.length || 0) > 0;

  // Save ruleset mutation
  const saveRulesetMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProgramId) throw new Error('Select a program first');

      const program = programs.find((p: any) => p.id === selectedProgramId);
      const loanType = program?.loanType || 'rtl';

      // Build the PricingRules JSON
      const rulesJson: any = {
        product: loanType.toUpperCase(),
        baseRates: {
          [loanType]: parseFloat(baseRate) || 9.25,
        },
        points: { default: parseFloat(defaultPoints) || 2.0 },
        adjusters: adjusters.map((a) => ({
          id: a.id,
          label: a.label,
          when: buildCondition(a.condition, a.conditionValue),
          rateAdd: parseFloat(a.rateAdd) || 0,
          pointsAdd: parseFloat(a.pointsAdd) || 0,
        })),
        eligibilityRules: disqualifiers.map((d) => ({
          id: d.id,
          label: d.label,
          when: buildCondition(d.condition, d.conditionValue),
          result: 'ineligible' as const,
        })),
      };

      // Save as draft, then activate
      const res = await apiRequest('POST', `/api/admin/programs/${selectedProgramId}/rulesets`, {
        name: 'Initial Pricing Rules',
        description: 'Created during onboarding',
        rulesJson,
      });
      const data = await res.json();

      // Activate it
      if (data.ruleset?.id) {
        await apiRequest('PATCH', `/api/admin/programs/${selectedProgramId}/rulesets/${data.ruleset.id}`, {
          status: 'active',
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/programs'] });
      toast({ title: 'Pricing rules saved and activated!' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save pricing rules',
        description: error?.message || 'Please check your configuration',
        variant: 'destructive',
      });
    },
  });

  // Helpers
  function buildCondition(condition: string, value: string): Record<string, any> {
    const numericConditions = ['ficoLt', 'ficoGt', 'ficoLte', 'ficoGte', 'ltvLt', 'ltvGt', 'ltvLte', 'ltvGte', 'dscrLt', 'dscrGt', 'dscrLte', 'dscrGte', 'loanAmountLt', 'loanAmountGt', 'loanAmountLte', 'loanAmountGte'];
    if (numericConditions.includes(condition)) {
      return { [condition]: parseFloat(value) || 0 };
    }
    if (condition === 'isMidstream') {
      return { isMidstream: true };
    }
    return { [condition]: value };
  }

  function addCommonAdjuster(template: typeof COMMON_ADJUSTERS[0]) {
    if (adjusters.some((a) => a.id === template.id)) return;
    setAdjusters([...adjusters, {
      id: template.id,
      label: template.label,
      condition: template.condition,
      conditionValue: template.value,
      rateAdd: template.rateAdd,
      pointsAdd: template.pointsAdd,
    }]);
  }

  function addCommonDisqualifier(template: typeof COMMON_DISQUALIFIERS[0]) {
    if (disqualifiers.some((d) => d.id === template.id)) return;
    setDisqualifiers([...disqualifiers, {
      id: template.id,
      label: template.label,
      condition: template.condition,
      conditionValue: template.value,
    }]);
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Pricing Configuration
          </CardTitle>
          <CardDescription>
            Set up how your programs price deals. When a borrower submits a quote request, the pricing engine can instantly calculate a rate, points, and leverage caps — and send the term sheet to PandaDoc for e-signature automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Program selector */}
          {programsLoading ? (
            <div className="flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading your programs...</span>
            </div>
          ) : programs.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">No programs found</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Go back to the Loan Programs step to create a program first. Pricing rules are attached to specific programs.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Select a program to configure pricing for</Label>
                <Select
                  value={selectedProgramId?.toString() || ''}
                  onValueChange={(val) => {
                    setSelectedProgramId(parseInt(val));
                    setPricingMode('none');
                  }}
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
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    This program already has pricing rules configured.
                  </div>
                )}
              </div>

              {selectedProgramId && (
                <>
                  <Separator />

                  {/* Mode selector */}
                  <div className="space-y-3">
                    <Label>How would you like to set up pricing?</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <ModeCard
                        icon={Calculator}
                        title="Rule-Based Pricing"
                        description="Set a base rate, add adjusters for FICO, LTV, property type, etc. Instant pricing on every quote."
                        selected={pricingMode === 'rule-based'}
                        onClick={() => setPricingMode('rule-based')}
                        recommended
                      />
                      <ModeCard
                        icon={Upload}
                        title="Upload Rate Sheet (AI)"
                        description="Upload your rate sheet PDF. AI extracts the rules automatically. Review and activate."
                        selected={pricingMode === 'ai-upload'}
                        onClick={() => setPricingMode('ai-upload')}
                      />
                      <ModeCard
                        icon={Globe}
                        title="External Pricer"
                        description="Connect to a third-party pricing tool (e.g., B-DIYA NQX). We fill the form and extract the rate."
                        selected={pricingMode === 'external'}
                        onClick={() => setPricingMode('external')}
                      />
                      <ModeCard
                        icon={Settings}
                        title="Manual / Skip"
                        description="No automated pricing. You'll price each deal manually when quotes come in."
                        selected={pricingMode === 'none'}
                        onClick={() => setPricingMode('none')}
                      />
                    </div>
                  </div>

                  {/* Mode content */}
                  {pricingMode === 'rule-based' && (
                    <RuleBasedPricing
                      baseRate={baseRate}
                      setBaseRate={setBaseRate}
                      defaultPoints={defaultPoints}
                      setDefaultPoints={setDefaultPoints}
                      adjusters={adjusters}
                      setAdjusters={setAdjusters}
                      disqualifiers={disqualifiers}
                      setDisqualifiers={setDisqualifiers}
                      onAddCommonAdjuster={addCommonAdjuster}
                      onAddCommonDisqualifier={addCommonDisqualifier}
                      loanType={programs.find((p: any) => p.id === selectedProgramId)?.loanType || 'rtl'}
                    />
                  )}

                  {pricingMode === 'ai-upload' && (
                    <AIUploadPricing />
                  )}

                  {pricingMode === 'external' && (
                    <ExternalPricing
                      externalUrl={externalUrl}
                      setExternalUrl={setExternalUrl}
                    />
                  )}

                  {/* Save button */}
                  {pricingMode === 'rule-based' && (
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() => saveRulesetMutation.mutate()}
                        disabled={saveRulesetMutation.isPending}
                      >
                        {saveRulesetMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Save & Activate Pricing Rules
                          </>
                        )}
                      </Button>
                      {saveRulesetMutation.isSuccess && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" /> Saved
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Explainer card */}
      <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-300">How pricing connects to quotes</p>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              When a borrower fills out a quote form linked to this program, the pricing engine runs your rules against their inputs (FICO, LTV, property type, etc.) and returns a rate + points instantly. If PandaDoc is connected, the term sheet auto-generates and is sent for e-signature. You can refine pricing rules anytime from the program settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground">
            {pricingMode === 'none' ? 'Skip for now' : 'Continue'}
          </Button>
          <Button onClick={onNext}>
            Next: Communications & AI
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Mode Card ──────────────────────────────────────────────────

function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
  recommended,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  recommended?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left p-4 rounded-lg border-2 transition-all ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 bg-card'
      }`}
    >
      {recommended && (
        <Badge className="absolute -top-2 right-2 text-[10px]">Recommended</Badge>
      )}
      <Icon className={`h-5 w-5 mb-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </button>
  );
}

// ─── Mode 1: Rule-Based Pricing ─────────────────────────────────

function RuleBasedPricing({
  baseRate,
  setBaseRate,
  defaultPoints,
  setDefaultPoints,
  adjusters,
  setAdjusters,
  disqualifiers,
  setDisqualifiers,
  onAddCommonAdjuster,
  onAddCommonDisqualifier,
  loanType,
}: {
  baseRate: string;
  setBaseRate: (v: string) => void;
  defaultPoints: string;
  setDefaultPoints: (v: string) => void;
  adjusters: AdjusterEntry[];
  setAdjusters: (a: AdjusterEntry[]) => void;
  disqualifiers: EligibilityEntry[];
  setDisqualifiers: (d: EligibilityEntry[]) => void;
  onAddCommonAdjuster: (t: typeof COMMON_ADJUSTERS[0]) => void;
  onAddCommonDisqualifier: (t: typeof COMMON_DISQUALIFIERS[0]) => void;
  loanType: string;
}) {
  const removeAdjuster = (i: number) => setAdjusters(adjusters.filter((_, idx) => idx !== i));
  const removeDisqualifier = (i: number) => setDisqualifiers(disqualifiers.filter((_, idx) => idx !== i));

  const updateAdjuster = (i: number, field: keyof AdjusterEntry, value: string) => {
    const updated = [...adjusters];
    updated[i] = { ...updated[i], [field]: value };
    setAdjusters(updated);
  };

  const addCustomAdjuster = () => {
    const id = `custom_${Date.now()}`;
    setAdjusters([...adjusters, {
      id,
      label: '',
      condition: 'ficoLt',
      conditionValue: '',
      rateAdd: '0',
      pointsAdd: '0',
    }]);
  };

  const addCustomDisqualifier = () => {
    const id = `dq_${Date.now()}`;
    setDisqualifiers([...disqualifiers, {
      id,
      label: '',
      condition: 'ficoLt',
      conditionValue: '',
    }]);
  };

  const updateDisqualifier = (i: number, field: keyof EligibilityEntry, value: string) => {
    const updated = [...disqualifiers];
    updated[i] = { ...updated[i], [field]: value };
    setDisqualifiers(updated);
  };

  return (
    <div className="space-y-5">
      {/* Base rate + points */}
      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" />
          Base Rate & Points
        </h4>
        <p className="text-xs text-muted-foreground">
          This is your starting rate before any adjustments. The engine adds or subtracts from this based on the deal characteristics.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Base Interest Rate (%)</Label>
            <Input value={baseRate} onChange={(e) => setBaseRate(e.target.value)} placeholder="9.25" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default Points (%)</Label>
            <Input value={defaultPoints} onChange={(e) => setDefaultPoints(e.target.value)} placeholder="2.0" />
          </div>
        </div>
      </div>

      {/* Rate Adjusters */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Rate Adjusters
          <span className="text-xs text-muted-foreground font-normal">— "If this, add that to rate"</span>
        </h4>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Quick add common adjusters:</Label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_ADJUSTERS.filter((t) => {
              // Show DSCR-specific adjusters only for DSCR
              if (t.id === 'low_dscr' && loanType !== 'dscr') return false;
              return true;
            }).map((t) => (
              <Button
                key={t.id}
                variant={adjusters.some((a) => a.id === t.id) ? 'secondary' : 'outline'}
                size="sm"
                className="text-xs h-7"
                disabled={adjusters.some((a) => a.id === t.id)}
                onClick={() => onAddCommonAdjuster(t)}
              >
                {adjusters.some((a) => a.id === t.id) ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : (
                  <Plus className="h-3 w-3 mr-1" />
                )}
                {t.label}: +{t.rateAdd}%
              </Button>
            ))}
          </div>
        </div>

        {adjusters.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {adjusters.map((adj, i) => (
              <div key={adj.id} className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center">
                    <Input
                      className="h-7 text-xs flex-1"
                      placeholder="Label"
                      value={adj.label}
                      onChange={(e) => updateAdjuster(i, 'label', e.target.value)}
                    />
                    <Select value={adj.condition} onValueChange={(v) => updateAdjuster(i, 'condition', v)}>
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {conditionOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-7 text-xs w-20"
                      placeholder="Value"
                      value={adj.conditionValue}
                      onChange={(e) => updateAdjuster(i, 'conditionValue', e.target.value)}
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">+</span>
                      <Input
                        className="h-7 text-xs w-16"
                        value={adj.rateAdd}
                        onChange={(e) => updateAdjuster(i, 'rateAdd', e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => removeAdjuster(i)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={addCustomAdjuster}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Custom Adjuster
        </Button>
      </div>

      <Separator />

      {/* Disqualifiers */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          Disqualifiers
          <span className="text-xs text-muted-foreground font-normal">— "If this, deal is ineligible"</span>
        </h4>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Quick add common disqualifiers:</Label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_DISQUALIFIERS.map((t) => (
              <Button
                key={t.id}
                variant={disqualifiers.some((d) => d.id === t.id) ? 'secondary' : 'outline'}
                size="sm"
                className="text-xs h-7"
                disabled={disqualifiers.some((d) => d.id === t.id)}
                onClick={() => onAddCommonDisqualifier(t)}
              >
                {disqualifiers.some((d) => d.id === t.id) ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : (
                  <Plus className="h-3 w-3 mr-1" />
                )}
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {disqualifiers.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {disqualifiers.map((dq, i) => (
              <div key={dq.id} className="flex items-center gap-2 p-2 bg-red-50/50 dark:bg-red-950/20 rounded-md border border-red-200/50 dark:border-red-800/50">
                <div className="flex-1 flex gap-2 items-center">
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder="Label"
                    value={dq.label}
                    onChange={(e) => updateDisqualifier(i, 'label', e.target.value)}
                  />
                  <Select value={dq.condition} onValueChange={(v) => updateDisqualifier(i, 'condition', v)}>
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {conditionOptions.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 text-xs w-24"
                    placeholder="Value"
                    value={dq.conditionValue}
                    onChange={(e) => updateDisqualifier(i, 'conditionValue', e.target.value)}
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => removeDisqualifier(i)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={addCustomDisqualifier}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Custom Disqualifier
        </Button>
      </div>

      {/* Preview */}
      {adjusters.length > 0 && (
        <>
          <Separator />
          <div className="p-3 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-xs mb-2">Pricing Preview Example</h4>
            <p className="text-xs text-muted-foreground">
              Base rate: <span className="font-mono font-medium text-foreground">{baseRate}%</span>
              {adjusters.length > 0 && (
                <> + up to <span className="font-mono font-medium text-foreground">
                  {adjusters.reduce((sum, a) => sum + (parseFloat(a.rateAdd) || 0), 0).toFixed(2)}%
                </span> in adjustments</>
              )}
              {' '}= worst case <span className="font-mono font-medium text-foreground">
                {(parseFloat(baseRate) + adjusters.reduce((sum, a) => sum + (parseFloat(a.rateAdd) || 0), 0)).toFixed(2)}%
              </span>
              {' '}| Points: <span className="font-mono font-medium text-foreground">{defaultPoints}%</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Mode 2: AI Upload Pricing ──────────────────────────────────

function AIUploadPricing() {
  return (
    <div className="p-4 bg-muted/50 rounded-lg space-y-3">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium text-sm">Upload Your Rate Sheet</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a PDF of your rate sheet or lending guidelines. Our AI will extract the base rates, adjusters, leverage caps, and disqualifiers automatically. You'll review everything before activating.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            This feature is available from the program settings page after onboarding. Navigate to <span className="font-medium text-foreground">Loan Products → Your Program → Pricing</span> to upload your guidelines and let the AI build your ruleset.
          </p>
          <div className="flex items-center gap-2 mt-3 p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              For now, you can use Rule-Based Pricing to get started quickly, then upload your full rate sheet later.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mode 3: External Pricer ────────────────────────────────────

function ExternalPricing({
  externalUrl,
  setExternalUrl,
}: {
  externalUrl: string;
  setExternalUrl: (v: string) => void;
}) {
  return (
    <div className="p-4 bg-muted/50 rounded-lg space-y-3">
      <div className="flex items-start gap-3">
        <Globe className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="space-y-3 flex-1">
          <div>
            <h4 className="font-medium text-sm">External Pricing Tool</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Connect to a third-party pricing platform. When a quote comes in, we'll fill out the external form with the borrower's data and extract the rate automatically using browser automation.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pricing Tool URL</Label>
            <Input
              placeholder="https://www.example.com/pricer"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Currently supports B-DIYA NQX Pricer. Additional integrations can be configured after onboarding.
            </p>
          </div>
          <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              External pricing is slower than rule-based (5-15 seconds per quote) and depends on the third-party site being available.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

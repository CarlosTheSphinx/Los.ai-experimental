import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type RTLPricingResponse, type RTLPricingFormData } from "@shared/schema";
import { CheckCircle2, XCircle, AlertTriangle, RotateCcw, TrendingUp, Percent, DollarSign, Building, Calculator, Save, User, MapPin, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface ProgramConfig {
  yspEnabled?: boolean;
  yspBrokerCanToggle?: boolean;
  yspFixedAmount?: number;
  yspMin?: number;
  yspMax?: number;
  yspStep?: number;
  basePoints?: number;
  basePointsMin?: number;
  basePointsMax?: number;
  brokerPointsEnabled?: boolean;
  brokerPointsMin?: number;
  brokerPointsMax?: number;
  brokerPointsStep?: number;
}

interface BrokerSettings {
  yspEnabled?: boolean;
  yspMaxPercent?: number;
  brokerPointsEnabled?: boolean;
  brokerPointsMaxPercent?: number;
  programOverrides?: Record<string, {
    yspMaxPercent?: number;
    brokerPointsMaxPercent?: number;
  }>;
}

interface RTLPricingResultProps {
  result: RTLPricingResponse;
  formData: RTLPricingFormData | null;
  onReset: () => void;
  onEdit: () => void;
  programId?: number | null;
  programConfig?: ProgramConfig | null;
  brokerSettings?: BrokerSettings | null;
}

export function RTLPricingResult({ result, formData, onReset, onEdit, programId, programConfig, brokerSettings }: RTLPricingResultProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Determine user role
  const isLender = user?.role === 'admin' || user?.role === 'super_admin';
  const isBroker = user?.role === 'broker';

  // Program config with defaults
  const cfg = programConfig || {};
  const programBasePoints = cfg.basePoints ?? 2;
  const programBasePointsMin = cfg.basePointsMin ?? 1;
  const programBasePointsMax = cfg.basePointsMax ?? 4;
  const programBrokerPointsEnabled = cfg.brokerPointsEnabled ?? true;
  const programBrokerPointsMin = cfg.brokerPointsMin ?? 0;
  const rawProgramBrokerPointsMax = cfg.brokerPointsMax ?? 3;
  const programBrokerPointsStep = cfg.brokerPointsStep ?? 0.125;

  const effectiveBrokerPointsMax = (() => {
    if (!isBroker || !brokerSettings) return rawProgramBrokerPointsMax;
    const programKey = programId ? String(programId) : null;
    const override = programKey ? brokerSettings.programOverrides?.[programKey] : undefined;
    const brokerMax = override?.brokerPointsMaxPercent ?? brokerSettings.brokerPointsMaxPercent;
    if (brokerMax != null) return Math.min(rawProgramBrokerPointsMax, brokerMax);
    return rawProgramBrokerPointsMax;
  })();
  const programBrokerPointsMax = effectiveBrokerPointsMax;
  const programYspEnabled = cfg.yspEnabled ?? false;
  const programYspBrokerCanToggle = cfg.yspBrokerCanToggle ?? false;
  const programYspFixedAmount = cfg.yspFixedAmount ?? 0;
  const programYspMin = cfg.yspMin ?? 0;
  const programYspMax = cfg.yspMax ?? 3;
  const programYspStep = cfg.yspStep ?? 0.125;

  // Points state — split into base and broker additional
  const [basePointsValue, setBasePointsValue] = useState(programBasePoints);
  const [brokerPointsValue, setBrokerPointsValue] = useState(programBrokerPointsMin);

  // YSP state — when broker can toggle, they control an additional amount on top of fixed
  const [brokerYspValue, setBrokerYspValue] = useState(0);
  const [lenderYspOverride, setLenderYspOverride] = useState(
    programYspEnabled ? programYspFixedAmount : programYspFixedAmount
  );

  const totalYspValue = programYspBrokerCanToggle
    ? programYspFixedAmount + brokerYspValue
    : (isLender ? lenderYspOverride : programYspFixedAmount);

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerCompanyName, setCustomerCompanyName] = useState("");

  // Computed values
  const totalPoints = basePointsValue + brokerPointsValue;

  // Calculate max loan amounts based on property values and leverage caps
  const asIsValue = formData?.asIsValue || 0;
  const arv = formData?.arv || 0;
  const rehabBudget = formData?.rehabBudget || 0;
  const totalCost = asIsValue + rehabBudget;

  const maxLTC = result.caps?.maxLTC || 0;
  const maxLTAIV = result.caps?.maxLTAIV || 0;
  const maxLTARV = result.caps?.maxLTARV;
  const isLTARVApplicable = maxLTARV !== null && maxLTARV !== undefined;

  const maxLoanByLTC = (totalCost * maxLTC) / 100;
  const calculatedLTAIV = asIsValue > 0
    ? ((((rehabBudget + asIsValue) * (maxLTC / 100)) - rehabBudget) / asIsValue) * 100
    : 0;
  const effectiveLTAIV = Math.min(calculatedLTAIV, maxLTAIV);
  const maxLoanByLTAIV = (asIsValue * effectiveLTAIV) / 100;
  const maxLoanByLTARV = isLTARVApplicable ? (arv * maxLTARV) / 100 : Infinity;

  const maxLoanAmount = isLTARVApplicable
    ? Math.min(maxLoanByLTC, maxLoanByLTAIV, maxLoanByLTARV)
    : Math.min(maxLoanByLTC, maxLoanByLTAIV);

  // Points dollar amounts (based on max loan)
  const basePointsAmount = (maxLoanByLTC * basePointsValue) / 100;
  const brokerPointsAmount = (maxLoanByLTC * brokerPointsValue) / 100;
  const totalPointsAmount = (maxLoanByLTC * totalPoints) / 100;

  // YSP calculations
  const yspDollarAmount = (maxLoanByLTC * totalYspValue) / 100;
  const yspRateImpactEstimate = totalYspValue * 0.25;

  // Broker commission = additional points + YSP
  const brokerCommission = brokerPointsAmount + yspDollarAmount;

  const saveQuoteMutation = useMutation({
    mutationFn: async () => {
      const formattedRate = result.finalRate ? `${result.finalRate.toFixed(3)}%` : "N/A";

      const response = await apiRequest('POST', '/api/quotes', {
        customerFirstName,
        customerLastName,
        customerCompanyName,
        propertyAddress: formData?.propertyAddress || "",
        loanData: formData,
        interestRate: formattedRate,
        pointsCharged: totalPoints,
        programId: programId || null,
        yspAmount: totalYspValue,
        yspRateImpact: yspRateImpactEstimate,
        yspDollarAmount,
        basePointsCharged: basePointsValue,
        brokerPointsCharged: brokerPointsValue,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Quote Saved!",
        description: "Your quote has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
      setShowQuoteForm(false);
      const savedId = data?.quote?.id;
      if (savedId) {
        setLocation(`/quotes/${savedId}/documents`);
      } else {
        setLocation('/quotes');
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save quote",
        variant: "destructive"
      });
    }
  });

  const handleSaveQuote = () => {
    if (!customerFirstName.trim() || !customerLastName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in customer name.",
        variant: "destructive"
      });
      return;
    }
    saveQuoteMutation.mutate();
  };

  if (!result.eligible) {
    return (
      <Card className="w-full bg-background/90 backdrop-blur-sm shadow-xl border-destructive/60 overflow-hidden">
        <CardHeader className="bg-destructive/5 border-b border-destructive/10 pb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-destructive">Not Eligible</CardTitle>
              <CardDescription className="text-destructive">
                This loan does not meet program requirements
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 pb-8">
          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-foreground">Disqualification Reasons:</h3>
            {result.disqualifiers?.map((dq, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <Badge variant="outline" className="text-xs mb-1 border-destructive/20 text-destructive">{dq.id}</Badge>
                  <p className="text-sm text-foreground">{dq.message}</p>
                </div>
              </div>
            ))}
          </div>

          {result.flags && result.flags.length > 0 && (
            <div className="space-y-3 mb-6">
              <h3 className="font-semibold text-foreground">Additional Flags:</h3>
              {result.flags.map((flag, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
                  <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground">{flag.message}</p>
                </div>
              ))}
            </div>
          )}

          <Button onClick={onReset} variant="outline" className="w-full" data-testid="button-rtl-reset">
            <RotateCcw className="h-4 w-4 mr-2" />
            Start New Quote
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full bg-background/90 backdrop-blur-sm shadow-xl border-success/60 overflow-hidden">
      <CardHeader className="bg-success/5 border-b border-success/10 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-success/10 rounded-lg">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-success">Eligible</CardTitle>
            <CardDescription className="text-success">
              Loan meets program requirements
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="p-4 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Percent className="h-4 w-4" />
              <span className="text-sm font-medium">Interest Rate</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground" data-testid="text-rtl-rate">
                {result.finalRate?.toFixed(3)}%
              </span>
              {result.baseRate && result.finalRate && result.baseRate !== result.finalRate && (
                <span className="text-sm text-muted-foreground">
                  (base: {result.baseRate}%)
                </span>
              )}
            </div>
            {programYspEnabled && totalYspValue > 0 && (
              <div className="mt-2 text-sm text-warning">
                +{yspRateImpactEstimate.toFixed(3)}% YSP rate impact
              </div>
            )}
          </div>

          <div className="p-4 bg-muted rounded-lg border border-border">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Total Points</span>
            </div>
            <span className="text-3xl font-bold text-foreground" data-testid="text-rtl-points">
              {totalPoints.toFixed(2)}
            </span>
          </div>
        </div>

        {result.caps && (
          <div className="mb-6">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Building className="h-4 w-4" />
              Maximum Leverage Caps
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20 text-center">
                <span className="text-xs text-primary font-medium">Max LTC</span>
                <div className="text-xl font-bold text-primary" data-testid="text-max-ltc">
                  {result.caps.maxLTC}%
                </div>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20 text-center">
                <span className="text-xs text-primary font-medium">Max LTAIV</span>
                <div className="text-xl font-bold text-primary" data-testid="text-max-ltaiv">
                  {result.caps.maxLTAIV}%
                </div>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20 text-center">
                <span className="text-xs text-primary font-medium">Max LTARV</span>
                <div className="text-xl font-bold text-primary" data-testid="text-max-ltarv">
                  {isLTARVApplicable ? `${result.caps.maxLTARV}%` : "N/A"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Points & Commission Section */}
        {formData && result.caps && maxLoanAmount > 0 && (
          <div className="mb-6 bg-muted rounded-lg p-5 border border-border">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Points & Commission
            </h3>

            <div className="space-y-4">
              {/* Base Points */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-foreground font-medium">
                    Lender Points
                  </Label>
                  <span className="text-lg font-bold text-foreground">{basePointsValue.toFixed(2)}</span>
                </div>
                {isLender ? (
                  <>
                    <div className="bg-background rounded-lg p-4 border border-border">
                      <Slider
                        value={[basePointsValue]}
                        onValueChange={([val]) => setBasePointsValue(val)}
                        min={programBasePointsMin}
                        max={programBasePointsMax}
                        step={programBrokerPointsStep}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>{programBasePointsMin}</span>
                        <span>{programBasePointsMax}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-background rounded-lg p-3 border border-border text-sm text-muted-foreground">
                    Lender points — {programBasePoints.toFixed(2)} points
                    <span className="ml-2 text-foreground font-medium">
                      (${basePointsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                    </span>
                  </div>
                )}
              </div>

              {/* Broker Additional Points */}
              {programBrokerPointsEnabled && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="flex items-center gap-1 text-foreground font-medium">
                      <Percent className="w-3 h-3" />
                      Broker Points
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={programBrokerPointsMin}
                        max={programBrokerPointsMax}
                        step={programBrokerPointsStep}
                        value={brokerPointsValue}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= programBrokerPointsMin && val <= programBrokerPointsMax) {
                            setBrokerPointsValue(val);
                          }
                        }}
                        className="w-20 text-center text-lg font-bold border-border"
                        data-testid="input-additional-points"
                      />
                      <span className="text-sm text-muted-foreground">pts</span>
                    </div>
                  </div>
                  <div className="bg-background rounded-lg p-4 border border-border">
                    <Slider
                      value={[brokerPointsValue]}
                      onValueChange={([val]) => setBrokerPointsValue(val)}
                      min={programBrokerPointsMin}
                      max={programBrokerPointsMax}
                      step={programBrokerPointsStep}
                      className="w-full"
                      data-testid="slider-additional-points"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>+{programBrokerPointsMin.toFixed(1)}</span>
                      <span>+{((programBrokerPointsMin + programBrokerPointsMax) / 2).toFixed(1)}</span>
                      <span>+{programBrokerPointsMax.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Points Summary */}
              <div className="bg-background rounded-lg p-4 border border-border space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Lender Points</span>
                  <span className="font-medium">{basePointsValue.toFixed(2)} (${basePointsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                </div>
                {programBrokerPointsEnabled && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Broker Points</span>
                    <span className="font-medium">+{brokerPointsValue.toFixed(2)} (${brokerPointsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-foreground">Total Points</span>
                  <span className="text-primary">{totalPoints.toFixed(2)} (${totalPointsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                </div>
              </div>

              {/* YSP Section — only if enabled for this program */}
              {programYspEnabled && (
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="flex items-center gap-1 text-foreground font-medium">
                      <TrendingUp className="w-3 h-3" />
                      YSP (Yield Spread Premium)
                    </Label>
                    <span className="text-lg font-bold text-foreground">{totalYspValue.toFixed(3)}%</span>
                  </div>

                  {programYspFixedAmount > 0 && (
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3 border mb-3">
                      <span className="text-sm text-muted-foreground">Fixed YSP (included)</span>
                      <span className="font-bold">{programYspFixedAmount}%</span>
                    </div>
                  )}

                  {isLender && !programYspBrokerCanToggle ? (
                    <div className="bg-background rounded-lg p-4 border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm">YSP Override</Label>
                        <span className="font-bold">{lenderYspOverride.toFixed(3)}%</span>
                      </div>
                      <Slider
                        value={[lenderYspOverride]}
                        onValueChange={([val]) => setLenderYspOverride(val)}
                        min={programYspMin}
                        max={programYspMax}
                        step={programYspStep}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>{programYspMin}%</span>
                        <span>{programYspMax}%</span>
                      </div>
                    </div>
                  ) : (isLender || programYspBrokerCanToggle) ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-sm">
                          {isLender ? 'Broker YSP Addition' : 'Your Additional YSP'}
                        </Label>
                        <span className="font-bold">{brokerYspValue.toFixed(3)}%</span>
                      </div>
                      <div className="bg-background rounded-lg p-4 border border-border">
                        <Slider
                          value={[brokerYspValue]}
                          onValueChange={([val]) => setBrokerYspValue(val)}
                          min={programYspMin}
                          max={programYspMax}
                          step={programYspStep}
                          className="w-full"
                          data-testid="slider-broker-ysp"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-2">
                          <span>+{programYspMin}%</span>
                          <span>+{programYspMax}%</span>
                        </div>
                      </div>
                      {brokerYspValue > 0 && (
                        <div className="flex items-center justify-between bg-muted/30 rounded-lg p-2 border text-sm">
                          <span className="text-muted-foreground">Total YSP</span>
                          <span className="font-bold">{totalYspValue.toFixed(3)}% (fixed {programYspFixedAmount}% + {brokerYspValue.toFixed(3)}%)</span>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {totalYspValue > 0 && (
                    <div className="mt-3 p-3 bg-warning/10 rounded-lg border border-warning/20 space-y-1">
                      <div className="flex items-center gap-1 text-warning text-sm font-medium">
                        <Info className="w-3 h-3" />
                        YSP Impact
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Estimated Rate Impact</span>
                        <span className="font-medium text-warning">+{yspRateImpactEstimate.toFixed(3)}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">YSP Dollar Value</span>
                        <span className="font-medium text-success">${yspDollarAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Revenue Breakdown */}
              <div className="bg-success/10 rounded-lg p-4 border border-success/20 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-success">Broker Commission</span>
                  <span className="text-2xl font-bold text-success" data-testid="text-rtl-commission">
                    ${brokerCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {programYspEnabled && totalYspValue > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Additional points: ${brokerPointsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} + YSP: ${yspDollarAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {result.appliedAdjusters && result.appliedAdjusters.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-foreground mb-3">Rate Adjustments Applied:</h3>
            <div className="space-y-2">
              {result.appliedAdjusters.map((adj, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-warning/10 rounded border border-warning/20">
                  <span className="text-sm text-foreground">{adj.label}</span>
                  <Badge variant="secondary" className="bg-warning/20 text-warning">
                    +{adj.rateAdd.toFixed(2)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.flags && result.flags.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-foreground mb-3">Flags & Notes:</h3>
            <div className="space-y-2">
              {result.flags.map((flag, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
                  <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground">{flag.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {formData && result.caps && maxLoanAmount > 0 && (
          <div className="mb-6 bg-background rounded-lg p-5 border border-border">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Loan Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-foreground font-medium">Maximum Loan Amount</span>
                <span className="text-xl font-bold text-success" data-testid="text-max-loan-amount">
                  ${maxLoanByLTC.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-foreground font-medium">Initial Loan Amount</span>
                <span className="text-xl font-bold text-primary" data-testid="text-initial-loan-amount">
                  ${maxLoanByLTAIV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-foreground">
                  Budget <span className="text-muted-foreground">(100% held back)</span>
                </span>
                <span className="text-lg font-semibold text-foreground" data-testid="text-budget-held-back">
                  ${rehabBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-foreground">Down Payment</span>
                <span className="text-lg font-semibold text-foreground" data-testid="text-down-payment">
                  ${Math.max(0, asIsValue - maxLoanByLTAIV).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-foreground">Total Points ({totalPoints.toFixed(2)}%)</span>
                <span className="text-lg font-semibold text-foreground" data-testid="text-total-points-dollars">
                  ${totalPointsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-foreground">
                  Misc. Closing Costs <span className="text-muted-foreground">(title, insurance, etc.)</span>
                </span>
                <span className="text-lg font-semibold text-foreground" data-testid="text-misc-closing-costs">
                  ${((maxLoanByLTC * 1.5) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 bg-primary/5 rounded-lg px-3 -mx-3">
                <span className="text-foreground font-semibold">Estimated Total Cash to Close</span>
                <span className="text-2xl font-bold text-primary" data-testid="text-cash-to-close">
                  ${(Math.max(0, asIsValue - maxLoanByLTAIV) + totalPointsAmount + ((maxLoanByLTC * 1.5) / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        )}

        {!showQuoteForm ? (
          <>
            <Button
              onClick={() => setShowQuoteForm(true)}
              className="w-full mb-3 h-12 text-lg font-semibold bg-gradient-to-r from-success to-success/80 shadow-lg shadow-success/20"
              data-testid="button-save-rtl-quote"
            >
              <Save className="mr-2 h-5 w-5" />
              Save as Quote
            </Button>
            <Button
              onClick={onEdit}
              variant="secondary"
              className="w-full mb-3"
              data-testid="button-edit-rtl-quote"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Edit Quote
            </Button>
          </>
        ) : (
          <div className="bg-info/5 rounded-xl p-5 border border-info/20 space-y-5 mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Customer Details
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rtlFirstName">First Name</Label>
                <Input
                  id="rtlFirstName"
                  value={customerFirstName}
                  onChange={(e) => setCustomerFirstName(e.target.value)}
                  placeholder="John"
                  data-testid="input-rtl-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rtlLastName">Last Name</Label>
                <Input
                  id="rtlLastName"
                  value={customerLastName}
                  onChange={(e) => setCustomerLastName(e.target.value)}
                  placeholder="Doe"
                  data-testid="input-rtl-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rtlCompanyName">Company Name</Label>
              <Input
                id="rtlCompanyName"
                value={customerCompanyName}
                onChange={(e) => setCustomerCompanyName(e.target.value)}
                placeholder="ABC Investments LLC"
                data-testid="input-rtl-company-name"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Property Address
              </Label>
              <div className="p-3 bg-background rounded border border-border text-sm text-foreground">
                {formData?.propertyAddress || "Not provided"}
              </div>
            </div>

            <div className="bg-background rounded-lg p-4 border border-border space-y-3">
              <h4 className="font-semibold text-foreground text-sm">Loan Details Summary</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loan Type:</span>
                  <span className="font-medium">{formData?.loanType?.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Rate:</span>
                  <span className="font-medium">{result.finalRate?.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">As-Is Value:</span>
                  <span className="font-medium">${asIsValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ARV:</span>
                  <span className="font-medium">${arv.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rehab Budget:</span>
                  <span className="font-medium">${rehabBudget.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Cost:</span>
                  <span className="font-medium">${totalCost.toLocaleString()}</span>
                </div>
              </div>
              <div className="border-t pt-3 mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Maximum Loan Amount:</span>
                  <span className="font-bold text-success">${maxLoanByLTC.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial Loan Amount:</span>
                  <span className="font-bold text-primary">${maxLoanByLTAIV.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
              <div className="border-t pt-3 mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Down Payment:</span>
                  <span className="font-bold text-foreground">${Math.max(0, asIsValue - maxLoanByLTAIV).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Points ({totalPoints.toFixed(2)}%):</span>
                  <span className="font-bold text-foreground">${totalPointsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Broker Commission:</span>
                  <span className="font-bold text-success">${brokerCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowQuoteForm(false)}
                className="flex-1"
                data-testid="button-cancel-rtl-quote"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveQuote}
                disabled={saveQuoteMutation.isPending}
                className="flex-1 bg-gradient-to-r from-success to-success/80"
                data-testid="button-confirm-rtl-save"
              >
                {saveQuoteMutation.isPending ? "Saving..." : "Save Quote"}
              </Button>
            </div>
          </div>
        )}

        <Button onClick={onReset} variant="outline" className="w-full" data-testid="button-rtl-new-quote">
          <RotateCcw className="h-4 w-4 mr-2" />
          Start New Quote
        </Button>
      </CardContent>
    </Card>
  );
}

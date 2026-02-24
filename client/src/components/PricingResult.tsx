import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PricingResponse, LoanPricingFormData } from "@shared/schema";
import { CheckCircle2, ArrowLeft, Download, AlertCircle, FileText, Save, DollarSign, Percent, User, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
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
  brokerPointsMax?: number;
  brokerPointsStep?: number;
}

interface PricingResultProps {
  result: PricingResponse;
  formData: LoanPricingFormData | null;
  onReset: () => void;
  programId?: number | null;
  programConfig?: ProgramConfig | null;
}

export function PricingResult({ result, formData, onReset, programId, programConfig }: PricingResultProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerCompanyName, setCustomerCompanyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");

  // Determine user role
  const isLender = user?.role === 'admin' || user?.role === 'super_admin';
  const isBroker = user?.role === 'broker';

  // Program config with defaults
  const cfg = programConfig || {};
  const programBasePoints = cfg.basePoints ?? 1;
  const programBasePointsMin = cfg.basePointsMin ?? 0.5;
  const programBasePointsMax = cfg.basePointsMax ?? 3;
  const programBrokerPointsEnabled = cfg.brokerPointsEnabled ?? true;
  const programBrokerPointsMax = cfg.brokerPointsMax ?? 2;
  const programBrokerPointsStep = cfg.brokerPointsStep ?? 0.125;
  const programYspEnabled = cfg.yspEnabled ?? false;
  const programYspBrokerCanToggle = cfg.yspBrokerCanToggle ?? false;
  const programYspFixedAmount = cfg.yspFixedAmount ?? 0;
  const programYspMin = cfg.yspMin ?? 0;
  const programYspMax = cfg.yspMax ?? 3;
  const programYspStep = cfg.yspStep ?? 0.125;

  // Points state — split into base and broker additional
  const [basePointsValue, setBasePointsValue] = useState(programBasePoints);
  const [brokerPointsValue, setBrokerPointsValue] = useState(0);

  // YSP state — when broker can toggle, they control an additional amount on top of fixed
  const [brokerYspValue, setBrokerYspValue] = useState(0);
  const [lenderYspOverride, setLenderYspOverride] = useState(
    programYspEnabled && !programYspBrokerCanToggle ? programYspFixedAmount : programYspFixedAmount
  );

  const totalYspValue = programYspBrokerCanToggle
    ? programYspFixedAmount + brokerYspValue
    : (isLender ? lenderYspOverride : programYspFixedAmount);

  // Computed values
  const loanAmount = formData?.loanAmount || 0;
  const tpoPremiumPercent = formData?.tpoPremium ? parseFloat(formData.tpoPremium) : 0;
  const tpoPremiumAmount = (loanAmount * tpoPremiumPercent) / 100;

  const totalPointsCharged = basePointsValue + brokerPointsValue;
  const basePointsAmount = (loanAmount * basePointsValue) / 100;
  const brokerPointsAmount = (loanAmount * brokerPointsValue) / 100;
  const totalPointsAmount = (loanAmount * totalPointsCharged) / 100;
  const totalRevenue = totalPointsAmount + tpoPremiumAmount;

  // YSP calculations
  const yspDollarAmount = (loanAmount * totalYspValue) / 100;
  const yspRateImpactEstimate = totalYspValue * 0.25;

  // Commission = broker's additional points + YSP dollar amount
  const brokerCommission = brokerPointsAmount + yspDollarAmount;

  const saveQuoteMutation = useMutation({
    mutationFn: async () => {
      const rate = result.interestRate;
      const formattedRate = typeof rate === 'string' ? rate : (rate ? `${rate.toFixed(3)}%` : "N/A");

      const response = await apiRequest('POST', '/api/quotes', {
        customerFirstName,
        customerLastName,
        customerCompanyName,
        propertyAddress,
        loanData: formData,
        interestRate: formattedRate,
        pointsCharged: totalPointsCharged,
        programId: programId || null,
        // New YSP + split points fields
        yspAmount: totalYspValue,
        yspRateImpact: yspRateImpactEstimate,
        yspDollarAmount,
        basePointsCharged: basePointsValue,
        brokerPointsCharged: brokerPointsValue,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote Saved!",
        description: "Your quote has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
      setShowQuoteForm(false);
      setLocation('/quotes');
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
    if (!customerFirstName.trim() || !customerLastName.trim() || !propertyAddress.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in all customer details.",
        variant: "destructive"
      });
      return;
    }
    saveQuoteMutation.mutate();
  };

  if (result.error || !result.success) {
    return (
      <Card className="w-full border-destructive/20 bg-destructive/5 shadow-lg">
        <CardHeader className="text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <CardTitle>Pricing Error</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-destructive mb-4">{result.message || result.error || "An unknown error occurred."}</p>
          {result.debug && (
             <pre className="bg-destructive/10 p-2 rounded text-xs overflow-auto max-h-40">
               {JSON.stringify(result.debug, null, 2)}
             </pre>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={onReset} variant="outline" className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive">
            Edit Loan
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const rate = result.interestRate;
  const formattedRate = typeof rate === 'string' ? rate : (rate ? `${rate.toFixed(3)}%` : "N/A");

  return (
    <Card className="w-full bg-white shadow-xl border-primary/10 overflow-hidden animate-in">
      <div className="bg-primary/5 border-b border-primary/10 p-6 flex flex-col items-center justify-center text-center space-y-2">
        <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mb-2 shadow-sm">
          <CheckCircle2 className="w-6 h-6 text-success" />
        </div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your Qualified Rate</h2>
        <div className="text-5xl font-extrabold text-primary tracking-tight">
          {formattedRate}
        </div>
        {programYspEnabled && totalYspValue > 0 && (
          <p className="text-xs text-amber-600 font-medium">
            +{yspRateImpactEstimate.toFixed(3)}% YSP rate impact (est.)
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2">Based on today's market conditions</p>
      </div>

      <CardContent className="p-6">
        <div className="grid gap-6">
          <div className="bg-muted/30 rounded-xl p-5 border border-border">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Loan Summary
            </h3>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Loan Amount</dt>
                <dd className="font-medium text-foreground">${formData?.loanAmount?.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Property Value</dt>
                <dd className="font-medium text-foreground">${formData?.propertyValue?.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">LTV</dt>
                <dd className="font-medium text-foreground">{formData?.ltv}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">FICO Score</dt>
                <dd className="font-medium text-foreground">{formData?.ficoScore}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Program</dt>
                <dd className="font-medium text-foreground">{formData?.loanType}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Property Type</dt>
                <dd className="font-medium text-foreground">{formData?.propertyType}</dd>
              </div>
{/* TPO Premium is auto-included but hidden from user */}
            </dl>
          </div>

          {!showQuoteForm ? (
            <Button
              onClick={() => setShowQuoteForm(true)}
              className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-success to-success shadow-lg shadow-success/20"
              data-testid="button-save-quote"
            >
              <Save className="mr-2 h-5 w-5" />
              Save as Quote
            </Button>
          ) : (
            <div className="bg-info/10 rounded-xl p-5 border border-info/20 space-y-5">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Customer Details
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={customerFirstName}
                    onChange={(e) => setCustomerFirstName(e.target.value)}
                    placeholder="John"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={customerLastName}
                    onChange={(e) => setCustomerLastName(e.target.value)}
                    placeholder="Doe"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={customerCompanyName}
                  onChange={(e) => setCustomerCompanyName(e.target.value)}
                  placeholder="ABC Investments LLC"
                  data-testid="input-company-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Property Address</Label>
                <AddressAutocomplete
                  id="address"
                  value={propertyAddress}
                  onChange={setPropertyAddress}
                  placeholder="Start typing an address..."
                  data-testid="input-property-address"
                />
              </div>

              {/* ═══ ORIGINATION POINTS ═══ */}
              <div className="space-y-4">
                <Label className="flex items-center gap-1 text-base font-semibold">
                  <Percent className="w-4 h-4" />
                  Origination Points
                </Label>

                {/* Base Points — Broker sees read-only, Lender gets slider */}
                <div className="space-y-2">
                  {isLender ? (
                    <>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Automatic Points Included</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={programBasePointsMin}
                            max={programBasePointsMax}
                            step={programBrokerPointsStep}
                            value={basePointsValue}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= programBasePointsMin && val <= programBasePointsMax) {
                                setBasePointsValue(val);
                              }
                            }}
                            className="w-20 text-center font-bold"
                          />
                          <span className="text-sm text-muted-foreground">pts</span>
                        </div>
                      </div>
                      <div className="bg-background rounded-lg p-3 border border-border">
                        <Slider
                          value={[basePointsValue]}
                          onValueChange={([val]) => setBasePointsValue(val)}
                          min={programBasePointsMin}
                          max={programBasePointsMax}
                          step={programBrokerPointsStep}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{programBasePointsMin} pts</span>
                          <span>{programBasePointsMax} pts</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3 border">
                      <span className="text-sm text-muted-foreground">Automatic Points Included</span>
                      <span className="font-bold text-lg">{programBasePoints}</span>
                    </div>
                  )}
                </div>

                {/* Broker Additional Points — only if enabled */}
                {programBrokerPointsEnabled && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">
                        {isLender ? "Additional Points" : "Your Additional Points"}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={programBrokerPointsMax}
                          step={programBrokerPointsStep}
                          value={brokerPointsValue}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val >= 0 && val <= programBrokerPointsMax) {
                              setBrokerPointsValue(val);
                            }
                          }}
                          className="w-20 text-center font-bold"
                          data-testid="input-broker-points"
                        />
                        <span className="text-sm text-muted-foreground">pts</span>
                      </div>
                    </div>
                    <div className="bg-background rounded-lg p-3 border border-border">
                      <Slider
                        value={[brokerPointsValue]}
                        onValueChange={([val]) => setBrokerPointsValue(val)}
                        min={0}
                        max={programBrokerPointsMax}
                        step={programBrokerPointsStep}
                        className="w-full"
                        data-testid="slider-broker-points"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>0 pts</span>
                        <span>{programBrokerPointsMax} pts (max)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Total Points Display */}
                <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3 border text-sm">
                  <span className="font-medium">Total Points</span>
                  <span className="font-bold text-lg">{totalPointsCharged.toFixed(3)} pts</span>
                </div>
              </div>

              {/* ═══ YSP SECTION ═══ */}
              {programYspEnabled && (
                <div className="space-y-3 border-t pt-4">
                  <Label className="flex items-center gap-1 text-base font-semibold">
                    <DollarSign className="w-4 h-4" />
                    YSP (Yield Spread Premium)
                  </Label>

                  {programYspFixedAmount > 0 && (
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3 border">
                      <span className="text-sm text-muted-foreground">Fixed YSP (included)</span>
                      <span className="font-bold">{programYspFixedAmount}%</span>
                    </div>
                  )}

                  {isLender && !programYspBrokerCanToggle ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">YSP Override</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={programYspMin}
                            max={programYspMax}
                            step={programYspStep}
                            value={lenderYspOverride}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= programYspMin && val <= programYspMax) {
                                setLenderYspOverride(val);
                              }
                            }}
                            className="w-20 text-center font-bold"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="bg-background rounded-lg p-3 border border-border">
                        <Slider
                          value={[lenderYspOverride]}
                          onValueChange={([val]) => setLenderYspOverride(val)}
                          min={programYspMin}
                          max={programYspMax}
                          step={programYspStep}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{programYspMin}%</span>
                          <span>{programYspMax}%</span>
                        </div>
                      </div>
                    </div>
                  ) : (isLender || programYspBrokerCanToggle) ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">
                          {isLender ? 'Broker YSP Addition' : 'Your Additional YSP'}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={programYspMin}
                            max={programYspMax}
                            step={programYspStep}
                            value={brokerYspValue}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= programYspMin && val <= programYspMax) {
                                setBrokerYspValue(val);
                              }
                            }}
                            className="w-20 text-center font-bold"
                            data-testid="input-broker-ysp"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="bg-background rounded-lg p-3 border border-border">
                        <Slider
                          value={[brokerYspValue]}
                          onValueChange={([val]) => setBrokerYspValue(val)}
                          min={programYspMin}
                          max={programYspMax}
                          step={programYspStep}
                          className="w-full"
                          data-testid="slider-broker-ysp"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
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
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-amber-800">Est. Rate Impact</span>
                        <span className="font-semibold text-amber-900">+{yspRateImpactEstimate.toFixed(3)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-800">YSP Value</span>
                        <span className="font-semibold text-amber-900">
                          ${yspDollarAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <p className="text-xs text-amber-700 mt-1">
                        <Info className="w-3 h-3 inline mr-1" />
                        YSP increases the borrower's rate. Actual impact depends on the program's pricing tiers.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ REVENUE BREAKDOWN ═══ */}
              <div className="bg-background rounded-lg p-4 border border-border space-y-3">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-success" />
                  Revenue Breakdown
                </h4>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Automatic Points ({basePointsValue.toFixed(3)} pts)</span>
                    <span className="font-medium">
                      ${basePointsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {programBrokerPointsEnabled && brokerPointsValue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Additional Points ({brokerPointsValue.toFixed(3)} pts)</span>
                      <span className="font-medium">
                        ${brokerPointsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {programYspEnabled && totalYspValue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">YSP ({totalYspValue.toFixed(3)}%)</span>
                      <span className="font-medium">
                        ${yspDollarAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-muted-foreground font-medium">Total Points ({totalPointsCharged.toFixed(3)}%)</span>
                    <span className="font-bold">
                      ${totalPointsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Broker Commission Highlight */}
                <div className="bg-success/10 rounded-lg p-3 border border-success/20">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-success text-sm">
                      {isBroker ? "Your" : "Broker"} Compensation
                      {programYspEnabled && totalYspValue > 0 ? " (Points + YSP)" : ` (${brokerPointsValue.toFixed(2)} additional pts)`}
                    </span>
                    <span className="text-2xl font-bold text-success" data-testid="text-commission">
                      ${brokerCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowQuoteForm(false)}
                  className="flex-1"
                  data-testid="button-cancel-quote"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveQuote}
                  disabled={saveQuoteMutation.isPending}
                  className="flex-1 bg-gradient-to-r from-success to-success"
                  data-testid="button-confirm-save"
                >
                  {saveQuoteMutation.isPending ? "Saving..." : "Save Quote"}
                </Button>
              </div>
            </div>
          )}


          <div className="text-xs text-muted-foreground text-center px-4">
            Disclaimer: This rate is an estimate based on the information provided. Final approval is subject to full underwriting and verification of all documents. Rates are subject to change without notice.
          </div>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/30 p-6 border-t border-border">
        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <Button
            onClick={onReset}
            variant="outline"
            className="flex-1 h-12 text-lg font-semibold"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Edit Loan
          </Button>
          <Button
            onClick={() => window.print()}
            className="flex-1 h-12 text-lg font-semibold shadow-lg shadow-primary/20 bg-gradient-to-r from-primary to-primary"
          >
            <Download className="mr-2 h-5 w-5" />
            Download PDF
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LoanForm } from "@/components/LoanForm";
import { RTLLoanForm } from "@/components/RTLLoanForm";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse, type RTLPricingFormData, type RTLPricingResponse } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calculator, CheckCircle2, AlertCircle, Loader2, RotateCcw, Save, MapPin, DollarSign, Home, TrendingUp, FileText, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatPhoneNumber, isValidPhone } from "@/lib/validation";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

interface ProgramWithPricing {
  id: number;
  name: string;
  loanType: string;
  description: string | null;
  hasActiveRuleset: boolean;
  activeRulesetId?: number;
  activeRulesetVersion?: number;
}

export default function BorrowerQuote() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [loanProductType, setLoanProductType] = useState<"dscr" | "rtl">("dscr");
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);

  const [dscrResult, setDscrResult] = useState<PricingResponse | null>(null);
  const [dscrFormData, setDscrFormData] = useState<LoanPricingFormData | null>(null);

  const [rtlResult, setRtlResult] = useState<RTLPricingResponse | null>(null);
  const [rtlFormData, setRtlFormData] = useState<RTLPricingFormData | null>(null);

  const [borrowerFirstName, setBorrowerFirstName] = useState(user?.firstName || "");
  const [borrowerLastName, setBorrowerLastName] = useState(user?.lastName || "");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [additionalProperties, setAdditionalProperties] = useState<string[]>([]);

  const { mutate: getPricing, isPending: dscrPending } = usePricing();

  const rtlPricingMutation = useMutation({
    mutationFn: async (data: RTLPricingFormData) => {
      const res = await apiRequest("POST", "/api/pricing/rtl", data);
      return res.json();
    },
    onSuccess: (data: RTLPricingResponse) => {
      setRtlResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate RTL pricing", variant: "destructive" });
    },
  });

  const { data: programsData } = useQuery<{ programs: ProgramWithPricing[] }>({
    queryKey: ["/api/programs-with-pricing"],
  });

  const allActivePrograms = programsData?.programs || [];

  const handleDSCRSubmit = (data: LoanPricingFormData) => {
    setDscrFormData(data);
    getPricing(data, {
      onSuccess: (response) => {
        setDscrResult(response);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    });
  };

  const handleRTLSubmit = (data: RTLPricingFormData) => {
    setRtlFormData(data);
    rtlPricingMutation.mutate(data);
  };

  const handleReset = () => {
    setDscrResult(null);
    setRtlResult(null);
  };

  const saveQuoteMutation = useMutation({
    mutationFn: async () => {
      let formattedRate = "N/A";
      let formData: LoanPricingFormData | RTLPricingFormData | null = null;
      let pointsCharged = 1;

      if (loanProductType === "dscr" && dscrResult) {
        const rate = dscrResult.interestRate;
        formattedRate = typeof rate === "string" ? rate : rate ? `${rate.toFixed(3)}%` : "N/A";
        formData = dscrFormData;
        pointsCharged = 1;
      } else if (loanProductType === "rtl" && rtlResult) {
        formattedRate = rtlResult.finalRate ? `${rtlResult.finalRate.toFixed(3)}%` : "N/A";
        formData = rtlFormData;
        pointsCharged = 2;
      }

      const enrichedLoanData = {
        ...formData,
        additionalProperties: additionalProperties.filter(a => a.trim()).map(a => ({ address: a.trim() })),
      };

      return apiRequest("POST", "/api/quotes", {
        customerFirstName: borrowerFirstName.trim(),
        customerLastName: borrowerLastName.trim(),
        customerCompanyName: "",
        customerEmail: borrowerEmail || undefined,
        customerPhone: borrowerPhone || undefined,
        propertyAddress,
        loanData: enrichedLoanData,
        interestRate: formattedRate,
        pointsCharged,
        programId: selectedProgramId || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Quote Saved!", description: "Your quote has been saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      setLocation("/borrower-quotes");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save quote",
        variant: "destructive",
      });
    },
  });

  const handleSaveQuote = () => {
    if (!borrowerFirstName.trim() || !borrowerLastName.trim()) {
      toast({ title: "Missing Information", description: "Please enter your first and last name.", variant: "destructive" });
      return;
    }
    if (borrowerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borrowerEmail)) {
      toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (borrowerPhone && !isValidPhone(borrowerPhone)) {
      toast({ title: "Invalid Phone", description: "Phone number must be 10 digits.", variant: "destructive" });
      return;
    }
    if (!propertyAddress.trim()) {
      toast({ title: "Missing Information", description: "Please enter a property address.", variant: "destructive" });
      return;
    }
    saveQuoteMutation.mutate();
  };

  const hasResult = (loanProductType === "dscr" && dscrResult) || (loanProductType === "rtl" && rtlResult);
  const isLoading = dscrPending || rtlPricingMutation.isPending;

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Calculator className="w-5 h-5 md:w-6 md:h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-primary truncate tracking-tight" data-testid="text-page-title">
                Get a Quote
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                Get instant loan pricing
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6">
        {!hasResult && (
          <>
            <Card className="mb-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Loan Program</CardTitle>
                <CardDescription>Select the loan program to price</CardDescription>
              </CardHeader>
              <CardContent>
                {allActivePrograms.length > 0 ? (
                  <Select
                    value={selectedProgramId?.toString() || ""}
                    onValueChange={(v) => {
                      const prog = allActivePrograms.find((p) => p.id === parseInt(v));
                      if (prog) {
                        setSelectedProgramId(prog.id);
                        const derivedType = (prog.loanType === "dscr" ? "dscr" : "rtl") as "dscr" | "rtl";
                        setLoanProductType(derivedType);
                        setDscrResult(null);
                        setRtlResult(null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full md:w-96" data-testid="select-loan-program">
                      <SelectValue placeholder="Select a loan program" />
                    </SelectTrigger>
                    <SelectContent>
                      {allActivePrograms.map((program) => (
                        <SelectItem key={program.id} value={program.id.toString()}>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {program.loanType.toUpperCase()}
                            </Badge>
                            {program.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={loanProductType}
                    onValueChange={(v: "dscr" | "rtl") => {
                      setLoanProductType(v);
                      setSelectedProgramId(null);
                      setDscrResult(null);
                      setRtlResult(null);
                    }}
                  >
                    <SelectTrigger className="w-full md:w-80" data-testid="select-loan-product-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dscr">DSCR</SelectItem>
                      <SelectItem value="rtl">Fix and Flip/Ground Up Construction</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            <div className="max-w-4xl mx-auto">
              {loanProductType === "dscr" ? (
                <LoanForm onSubmit={handleDSCRSubmit} isLoading={dscrPending} defaultData={dscrFormData} />
              ) : (
                <RTLLoanForm onSubmit={handleRTLSubmit} isLoading={rtlPricingMutation.isPending} defaultData={rtlFormData} />
              )}
            </div>
          </>
        )}

        {hasResult && (
          <div className="max-w-2xl mx-auto space-y-6">
            {loanProductType === "dscr" && dscrResult && (
              <BorrowerDSCRResult
                result={dscrResult}
                formData={dscrFormData}
                onReset={handleReset}
              />
            )}

            {loanProductType === "rtl" && rtlResult && (
              <BorrowerRTLResult
                result={rtlResult}
                formData={rtlFormData}
                onReset={handleReset}
              />
            )}

            {((loanProductType === "dscr" && dscrResult?.success) ||
              (loanProductType === "rtl" && rtlResult?.eligible)) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Save className="h-5 w-5" />
                    Save This Quote
                  </CardTitle>
                  <CardDescription>
                    Save this quote for your records.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="borrower-first-name">First Name</Label>
                      <Input
                        id="borrower-first-name"
                        value={borrowerFirstName}
                        onChange={(e) => setBorrowerFirstName(e.target.value)}
                        placeholder="First name"
                        data-testid="input-borrower-first-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="borrower-last-name">Last Name</Label>
                      <Input
                        id="borrower-last-name"
                        value={borrowerLastName}
                        onChange={(e) => setBorrowerLastName(e.target.value)}
                        placeholder="Last name"
                        data-testid="input-borrower-last-name"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="borrower-email">Email Address</Label>
                      <Input
                        id="borrower-email"
                        type="email"
                        value={borrowerEmail}
                        onChange={(e) => setBorrowerEmail(e.target.value)}
                        placeholder="email@example.com"
                      />
                      {borrowerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borrowerEmail) && (
                        <p className="text-xs text-destructive">Please enter a valid email address</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="borrower-phone">Phone Number</Label>
                      <Input
                        id="borrower-phone"
                        type="tel"
                        value={borrowerPhone}
                        onChange={(e) => setBorrowerPhone(formatPhoneNumber(e.target.value))}
                        placeholder="(555) 123-4567"
                      />
                      {borrowerPhone && !isValidPhone(borrowerPhone) && (
                        <p className="text-xs text-destructive">Phone number must be 10 digits</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="property-address">Property Address</Label>
                    <AddressAutocomplete
                      value={propertyAddress}
                      onChange={setPropertyAddress}
                      placeholder="Enter the property address"
                      id="property-address"
                      data-testid="input-property-address"
                    />
                  </div>
                  {additionalProperties.length > 0 && (
                    <div className="space-y-2">
                      {additionalProperties.map((addr, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">Additional Property {idx + 1}</Label>
                            <AddressAutocomplete
                              value={addr}
                              onChange={(val) => {
                                const updated = [...additionalProperties];
                                updated[idx] = val;
                                setAdditionalProperties(updated);
                              }}
                              placeholder="Enter additional property address"
                              data-testid={`input-additional-property-${idx}`}
                            />
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setAdditionalProperties(additionalProperties.filter((_, i) => i !== idx))}
                            className="mt-5 flex-shrink-0"
                            data-testid={`button-remove-additional-property-${idx}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdditionalProperties([...additionalProperties, ""])}
                    data-testid="button-add-additional-property"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Another Property
                  </Button>
                  <Button
                    onClick={handleSaveQuote}
                    disabled={saveQuoteMutation.isPending}
                    className="w-full"
                    data-testid="button-save-quote"
                  >
                    {saveQuoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Quote
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatCurrency(value: number, decimals = 2) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function CostLineItem({ label, value, bold, testId }: { label: string; value: string; bold?: boolean; testId?: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 py-2 ${bold ? "font-semibold text-foreground" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground text-sm"}>{label}</span>
      <span className="tabular-nums" data-testid={testId}>{value}</span>
    </div>
  );
}

function BorrowerDSCRResult({
  result,
  formData,
  onReset,
}: {
  result: PricingResponse;
  formData: LoanPricingFormData | null;
  onReset: () => void;
}) {
  if (result.error || !result.success) {
    return (
      <Card className="border-destructive/20 bg-destructive/10">
        <CardHeader className="text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <CardTitle>Pricing Error</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-destructive mb-4" data-testid="text-pricing-error">
            {result.message || result.error || "An unknown error occurred."}
          </p>
        </CardContent>
        <div className="p-6 pt-0">
          <Button onClick={onReset} variant="outline" className="w-full" data-testid="button-try-again">
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  const rate = result.interestRate;
  const rateNum = typeof rate === "number" ? rate : parseFloat(rate || "0");
  const formattedRate = typeof rate === "string" ? rate : rate ? `${rate.toFixed(3)}%` : "N/A";
  const loanAmount = formData?.loanAmount || 0;
  const propertyValue = formData?.propertyValue || 0;
  const originationFee = (loanAmount * 1) / 100;
  const annualTaxes = formData?.annualTaxes || 0;
  const annualInsurance = formData?.annualInsurance || 0;
  const isInterestOnly = formData?.interestOnly === "Yes";

  const hasValidRate = rateNum > 0 && loanAmount > 0;
  const monthlyRate = rateNum / 100 / 12;
  let monthlyPI = 0;
  if (hasValidRate) {
    if (isInterestOnly) {
      monthlyPI = loanAmount * monthlyRate;
    } else {
      const n = 360;
      monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    }
  }
  const monthlyTaxes = annualTaxes / 12;
  const monthlyInsurance = annualInsurance / 12;
  const monthlyPITI = monthlyPI + monthlyTaxes + monthlyInsurance;

  const prepaidInterest = hasValidRate ? loanAmount * monthlyRate : 0;
  const titleInsuranceEst = Math.round(loanAmount * 0.005);
  const appraisalFee = 750;
  const processingFee = 995;
  const floodCert = 25;

  const totalClosingCosts = originationFee + titleInsuranceEst + appraisalFee + processingFee + floodCert + prepaidInterest;

  return (
    <div className="space-y-4">
      <Card className="border-success/30 bg-success/5">
        <CardHeader>
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="w-6 h-6" />
            <CardTitle>Your Qualified Rate</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-5xl font-bold text-success" data-testid="text-interest-rate">
              {formattedRate}
            </p>
            <p className="text-sm text-muted-foreground mt-2">Interest Rate</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Loan Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Loan Amount</p>
              <p className="font-semibold text-lg" data-testid="text-loan-amount">
                {formatCurrency(loanAmount, 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Property Value</p>
              <p className="font-semibold text-lg" data-testid="text-property-value">
                {formatCurrency(propertyValue, 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">LTV</p>
              <p className="font-medium" data-testid="text-ltv">{formData?.ltv || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Loan Term</p>
              <p className="font-medium" data-testid="text-loan-term">30 Year Fixed</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Loan Purpose</p>
              <p className="font-medium" data-testid="text-loan-purpose">{formData?.loanPurpose || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Payment Type</p>
              <p className="font-medium" data-testid="text-payment-type">{isInterestOnly ? "Interest Only" : "Principal & Interest"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">FICO Score</p>
              <p className="font-medium" data-testid="text-fico">{formData?.ficoScore || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Property Type</p>
              <p className="font-medium" data-testid="text-property-type">{formData?.propertyType || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Estimated Monthly Payment</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          <CostLineItem label={isInterestOnly ? "Interest Only" : "Principal & Interest"} value={formatCurrency(monthlyPI)} testId="text-monthly-pi" />
          <CostLineItem label="Property Taxes" value={formatCurrency(monthlyTaxes)} testId="text-monthly-taxes" />
          <CostLineItem label="Property Insurance" value={formatCurrency(monthlyInsurance)} testId="text-monthly-insurance" />
          <Separator className="my-1" />
          <CostLineItem label="Total Monthly (PITI)" value={formatCurrency(monthlyPITI)} bold testId="text-monthly-piti" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Estimated Closing Costs</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          <CostLineItem label="Origination Fee (1 point)" value={formatCurrency(originationFee)} testId="text-origination-fee" />
          <CostLineItem label="Title Insurance (est.)" value={formatCurrency(titleInsuranceEst)} testId="text-title-insurance" />
          <CostLineItem label="Appraisal Fee" value={formatCurrency(appraisalFee)} testId="text-appraisal-fee" />
          <CostLineItem label="Processing Fee" value={formatCurrency(processingFee)} testId="text-processing-fee" />
          <CostLineItem label="Flood Certification" value={formatCurrency(floodCert)} testId="text-flood-cert" />
          <CostLineItem label="Prepaid Interest (1 mo. est.)" value={formatCurrency(prepaidInterest)} testId="text-prepaid-interest" />
          <Separator className="my-1" />
          <CostLineItem label="Total Estimated Closing Costs" value={formatCurrency(totalClosingCosts)} bold testId="text-total-closing-costs" />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center px-4">
        These are estimates only and may vary. Title insurance, recording fees, and other third-party costs depend on your location and provider. Final costs will be detailed in your Loan Estimate.
      </p>

      <Button onClick={onReset} variant="outline" className="w-full" data-testid="button-new-quote">
        <RotateCcw className="h-4 w-4 mr-2" />
        Get Another Quote
      </Button>
    </div>
  );
}

function BorrowerRTLResult({
  result,
  formData,
  onReset,
}: {
  result: RTLPricingResponse;
  formData: RTLPricingFormData | null;
  onReset: () => void;
}) {
  if (!result.eligible) {
    return (
      <Card className="border-destructive/20 bg-destructive/10">
        <CardHeader className="text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <CardTitle>Not Eligible</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {result.disqualifiers && result.disqualifiers.length > 0 && (
            <ul className="text-sm text-destructive list-disc list-inside space-y-1" data-testid="text-disqualifiers">
              {result.disqualifiers.map((d, i) => (
                <li key={i}>{d.message || d.reason}</li>
              ))}
            </ul>
          )}
        </CardContent>
        <div className="p-6 pt-0">
          <Button onClick={onReset} variant="outline" className="w-full" data-testid="button-try-again">
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  const formattedRate = result.finalRate ? `${result.finalRate.toFixed(3)}%` : "N/A";
  const rateNum = result.finalRate || 0;
  const asIsValue = formData?.asIsValue || 0;
  const arv = formData?.arv || 0;
  const rehabBudget = formData?.rehabBudget || 0;
  const totalCost = asIsValue + rehabBudget;
  const maxLTC = result.caps?.maxLTC || 0;
  const maxLTARV = result.caps?.maxLTARV || 0;
  const maxLoanByLTC = maxLTC > 0 ? (totalCost * maxLTC) / 100 : 0;
  const maxLoanByARV = maxLTARV > 0 ? (arv * maxLTARV) / 100 : 0;
  const estimatedLoan = maxLoanByLTC > 0 && maxLoanByARV > 0
    ? Math.min(maxLoanByLTC, maxLoanByARV)
    : maxLoanByLTC > 0 ? maxLoanByLTC
    : maxLoanByARV > 0 ? maxLoanByARV
    : formData?.loanAmount || 0;
  const originationFee = (estimatedLoan * 2) / 100;

  const loanTypeLabels: Record<string, string> = {
    light_rehab: "Light Rehab",
    heavy_rehab: "Heavy Rehab",
    bridge_no_rehab: "Bridge (No Rehab)",
    guc: "Ground Up Construction",
  };
  const purposeLabels: Record<string, string> = {
    purchase: "Purchase",
    refi: "Refinance",
    cash_out: "Cash-Out Refinance",
  };
  const propertyTypeLabels: Record<string, string> = {
    "single-family-residence": "Single Family Residence",
    "2-4-unit": "2-4 Unit",
    "multifamily-5-plus": "Multifamily (5+ Units)",
    "rental-portfolio": "Rental Portfolio",
    "mixed-use": "Mixed-Use",
    "infill-lot": "Infill Lot",
    "land": "Land",
    "office": "Office",
    "retail": "Retail",
    "hospitality": "Hospitality",
    "industrial": "Industrial",
    "medical": "Medical",
    "agricultural": "Agricultural",
    "special-purpose": "Special Purpose",
    sfr_1_4: "Single Family Residence",
    condo: "2-4 Unit",
    multifamily: "Multifamily (5+ Units)",
    pud: "Rental Portfolio",
    modular: "Mixed-Use",
    other: "Other",
  };

  const hasValidRate = rateNum > 0 && estimatedLoan > 0;
  const monthlyRate = rateNum / 100 / 12;
  const monthlyInterest = hasValidRate ? estimatedLoan * monthlyRate : 0;

  const titleInsuranceEst = Math.round(estimatedLoan * 0.005);
  const appraisalFee = 750;
  const processingFee = 995;
  const floodCert = 25;
  const prepaidInterest = monthlyInterest;

  const totalClosingCosts = originationFee + titleInsuranceEst + appraisalFee + processingFee + floodCert + prepaidInterest;

  return (
    <div className="space-y-4">
      <Card className="border-success/30 bg-success/5">
        <CardHeader>
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="w-6 h-6" />
            <CardTitle>Your Qualified Rate</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-5xl font-bold text-success" data-testid="text-interest-rate">
              {formattedRate}
            </p>
            <p className="text-sm text-muted-foreground mt-2">Interest Rate</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Property & Loan Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">As-Is Value</p>
              <p className="font-semibold text-lg" data-testid="text-as-is-value">
                {formatCurrency(asIsValue, 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">After Repair Value</p>
              <p className="font-semibold text-lg" data-testid="text-arv">
                {formatCurrency(arv, 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Rehab Budget</p>
              <p className="font-semibold text-lg" data-testid="text-rehab-budget">
                {formatCurrency(rehabBudget, 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Project Cost</p>
              <p className="font-semibold text-lg" data-testid="text-total-cost">
                {formatCurrency(totalCost, 0)}
              </p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Loan Type</p>
              <p className="font-medium" data-testid="text-loan-type">{loanTypeLabels[formData?.loanType || ""] || formData?.loanType || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Purpose</p>
              <p className="font-medium" data-testid="text-purpose">{purposeLabels[formData?.purpose || ""] || formData?.purpose || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Property Type</p>
              <p className="font-medium" data-testid="text-property-type">{propertyTypeLabels[formData?.propertyType || ""] || formData?.propertyType || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">FICO Score</p>
              <p className="font-medium" data-testid="text-fico">{formData?.fico || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Leverage & Estimated Loan</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Max LTC</p>
              <p className="font-medium" data-testid="text-max-ltc">{maxLTC}%</p>
            </div>
            {maxLTARV > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Max LTARV</p>
                <p className="font-medium" data-testid="text-max-ltarv">{maxLTARV}%</p>
              </div>
            )}
          </div>
          <Separator className="my-3" />
          <CostLineItem label="Max Loan by LTC" value={formatCurrency(maxLoanByLTC, 0)} testId="text-max-loan-ltc" />
          {maxLTARV > 0 && (
            <CostLineItem label="Max Loan by LTARV" value={formatCurrency(maxLoanByARV, 0)} testId="text-max-loan-ltarv" />
          )}
          <Separator className="my-1" />
          <CostLineItem label="Estimated Max Loan" value={formatCurrency(estimatedLoan, 0)} bold testId="text-estimated-loan" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Estimated Monthly Payment</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          <CostLineItem label="Interest Only (monthly)" value={formatCurrency(monthlyInterest)} testId="text-monthly-interest" />
          <p className="text-xs text-muted-foreground mt-1">Fix & Flip loans are typically interest-only during the loan term.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Estimated Closing Costs</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          <CostLineItem label="Origination Fee (2 points)" value={formatCurrency(originationFee)} testId="text-origination-fee" />
          <CostLineItem label="Title Insurance (est.)" value={formatCurrency(titleInsuranceEst)} testId="text-title-insurance" />
          <CostLineItem label="Appraisal Fee" value={formatCurrency(appraisalFee)} testId="text-appraisal-fee" />
          <CostLineItem label="Processing Fee" value={formatCurrency(processingFee)} testId="text-processing-fee" />
          <CostLineItem label="Flood Certification" value={formatCurrency(floodCert)} testId="text-flood-cert" />
          <CostLineItem label="Prepaid Interest (1 mo. est.)" value={formatCurrency(prepaidInterest)} testId="text-prepaid-interest" />
          <Separator className="my-1" />
          <CostLineItem label="Total Estimated Closing Costs" value={formatCurrency(totalClosingCosts)} bold testId="text-total-closing-costs" />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center px-4">
        These are estimates only and may vary. Title insurance, recording fees, and other third-party costs depend on your location and provider. Final costs will be detailed in your Loan Estimate.
      </p>

      <Button onClick={onReset} variant="outline" className="w-full" data-testid="button-new-quote">
        <RotateCcw className="h-4 w-4 mr-2" />
        Get Another Quote
      </Button>
    </div>
  );
}

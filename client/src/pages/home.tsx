import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LoanForm } from "@/components/LoanForm";
import { PricingResult } from "@/components/PricingResult";
import { RTLLoanForm } from "@/components/RTLLoanForm";
import { RTLPricingResult } from "@/components/RTLPricingResult";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse, type RTLPricingFormData, type RTLPricingResponse } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Zap, CheckCircle2, XCircle, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProgramWithPricing {
  id: number;
  name: string;
  loanType: string;
  description: string | null;
  hasActiveRuleset: boolean;
  activeRulesetId?: number;
  activeRulesetVersion?: number;
}

interface EnginePricingResult {
  eligible: boolean;
  baseRate?: number;
  finalRate?: number;
  points?: number;
  caps?: {
    maxLTC?: number;
    maxLTV?: number;
    maxLTAIV?: number;
    maxLTARV?: number;
  };
  appliedAdjusters?: Array<{
    id: string;
    label: string;
    rateAdd: number;
    pointsAdd: number;
  }>;
  reasons?: string[];
}

const progressSteps = [
  { percent: 10, message: "Initializing pricing engine..." },
  { percent: 20, message: "Ron is racing down the hall to collect quotes..." },
  { percent: 35, message: "Lance is going to the beach..." },
  { percent: 50, message: "Terry is texting Tom to solidify the rate..." },
  { percent: 65, message: "Warren is lifting weights..." },
  { percent: 80, message: "Analyzing lender network availability..." },
  { percent: 90, message: "Finalizing your custom quote..." },
  { percent: 95, message: "Almost there! Just a few more seconds..." },
];

export default function Home() {
  const { toast } = useToast();
  const [result, setResult] = useState<PricingResponse | null>(null);
  const [lastFormData, setLastFormData] = useState<LoanPricingFormData | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  
  // Loan product type selector
  const [loanProductType, setLoanProductType] = useState<"dscr" | "rtl">("dscr");
  
  // Instant pricing mode state
  const [showInstantPricing, setShowInstantPricing] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [instantInputs, setInstantInputs] = useState({
    loanType: "light_rehab",
    tier: "experienced",
    fico: 720,
    ltv: 70,
    purpose: "purchase",
    propertyType: "single-family",
  });
  const [instantResult, setInstantResult] = useState<EnginePricingResult | null>(null);
  
  const { mutate: getPricing, isPending } = usePricing();
  
  // RTL pricing state
  const [rtlResult, setRtlResult] = useState<RTLPricingResponse | null>(null);
  const [rtlFormData, setRtlFormData] = useState<RTLPricingFormData | null>(null);
  
  // RTL pricing mutation
  const rtlPricingMutation = useMutation({
    mutationFn: async (data: RTLPricingFormData) => {
      setRtlFormData(data);
      const res = await apiRequest("POST", "/api/pricing/rtl", data);
      return res.json();
    },
    onSuccess: (data: RTLPricingResponse) => {
      setRtlResult(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate RTL pricing", variant: "destructive" });
    },
  });
  
  // Fetch programs with pricing capability
  const { data: programsData } = useQuery<{ programs: ProgramWithPricing[] }>({
    queryKey: ["/api/programs-with-pricing"],
  });
  
  const programsWithRulesets = programsData?.programs.filter(p => p.hasActiveRuleset) || [];
  const selectedProgram = programsWithRulesets.find(p => p.id === selectedProgramId);
  
  // Instant pricing mutation
  const instantPricingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pricing/calculate", {
        programId: selectedProgramId,
        inputs: instantInputs,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setInstantResult(data.result);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate pricing", variant: "destructive" });
    },
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPending) {
      setProgress(0);
      let stepIdx = 0;
      setProgressMessage(progressSteps[0].message);
      
      interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + (100 / 30);
          if (next >= 100) return 99;
          
          const currentStep = progressSteps.findLast(step => next >= step.percent);
          if (currentStep) setProgressMessage(currentStep.message);
          
          return next;
        });
      }, 1000);
    } else {
      setProgress(0);
      setProgressMessage("");
    }
    return () => clearInterval(interval);
  }, [isPending]);

  const handleSubmit = (data: LoanPricingFormData) => {
    setLastFormData(data);
    getPricing(data, {
      onSuccess: (response) => {
        setResult(response);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  };

  const handleReset = () => {
    setResult(null);
    setRtlResult(null);
  };
  
  const handleRTLSubmit = (data: RTLPricingFormData) => {
    rtlPricingMutation.mutate(data);
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 dark:bg-background/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calculator className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">New Quote</h1>
                <p className="text-sm text-slate-500">Generate loan pricing</p>
              </div>
            </div>
            {programsWithRulesets.length > 0 && (
              <Button
                variant={showInstantPricing ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowInstantPricing(!showInstantPricing);
                  setInstantResult(null);
                }}
                data-testid="button-toggle-instant"
              >
                <Zap className="h-4 w-4 mr-1" />
                Instant Pricing
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Loan Product Type Selector */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Loan Product Type</CardTitle>
            <CardDescription>Select the type of loan you want to price</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={loanProductType}
              onValueChange={(v: "dscr" | "rtl") => {
                setLoanProductType(v);
                setResult(null);
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
          </CardContent>
        </Card>

        {/* Instant Pricing Panel */}
        {showInstantPricing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Instant Pricing Engine
                </CardTitle>
                <CardDescription>
                  Get real-time pricing using configured program rules - no external lookup required
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <Label>Program</Label>
                    <Select
                      value={selectedProgramId?.toString() || ""}
                      onValueChange={(v) => {
                        setSelectedProgramId(parseInt(v));
                        setInstantResult(null);
                      }}
                    >
                      <SelectTrigger data-testid="select-instant-program">
                        <SelectValue placeholder="Select program" />
                      </SelectTrigger>
                      <SelectContent>
                        {programsWithRulesets.map((program) => (
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
                  </div>
                  <div>
                    <Label>Loan Type</Label>
                    <Select
                      value={instantInputs.loanType}
                      onValueChange={(v) => setInstantInputs({ ...instantInputs, loanType: v })}
                    >
                      <SelectTrigger data-testid="select-instant-loan-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProgram?.loanType === 'dscr' ? (
                          <>
                            <SelectItem value="30yr_fixed">30yr Fixed</SelectItem>
                            <SelectItem value="5yr_arm">5yr ARM</SelectItem>
                            <SelectItem value="7yr_arm">7yr ARM</SelectItem>
                            <SelectItem value="10yr_arm">10yr ARM</SelectItem>
                            <SelectItem value="interest_only">Interest Only</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="light_rehab">Light Rehab</SelectItem>
                            <SelectItem value="heavy_rehab">Heavy Rehab</SelectItem>
                            <SelectItem value="bridge_no_rehab">Bridge (No Rehab)</SelectItem>
                            <SelectItem value="guc">Ground-Up Construction</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Borrower Tier</Label>
                    <Select
                      value={instantInputs.tier}
                      onValueChange={(v) => setInstantInputs({ ...instantInputs, tier: v })}
                    >
                      <SelectTrigger data-testid="select-instant-tier">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="institutional">Institutional</SelectItem>
                        <SelectItem value="experienced">Experienced</SelectItem>
                        <SelectItem value="new_investor">New Investor</SelectItem>
                        <SelectItem value="no_experience">No Experience</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>FICO Score</Label>
                    <Input
                      type="number"
                      value={instantInputs.fico}
                      onChange={(e) => setInstantInputs({ ...instantInputs, fico: parseInt(e.target.value) || 0 })}
                      data-testid="input-instant-fico"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <Label>LTV (%)</Label>
                    <Input
                      type="number"
                      value={instantInputs.ltv}
                      onChange={(e) => setInstantInputs({ ...instantInputs, ltv: parseInt(e.target.value) || 0 })}
                      data-testid="input-instant-ltv"
                    />
                  </div>
                  <div>
                    <Label>Purpose</Label>
                    <Select
                      value={instantInputs.purpose}
                      onValueChange={(v) => setInstantInputs({ ...instantInputs, purpose: v })}
                    >
                      <SelectTrigger data-testid="select-instant-purpose">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchase">Purchase</SelectItem>
                        <SelectItem value="refinance">Refinance</SelectItem>
                        <SelectItem value="cash_out">Cash Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Property Type</Label>
                    <Select
                      value={instantInputs.propertyType}
                      onValueChange={(v) => setInstantInputs({ ...instantInputs, propertyType: v })}
                    >
                      <SelectTrigger data-testid="select-instant-property">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single-family">Single Family</SelectItem>
                        <SelectItem value="multifamily">Multifamily</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => instantPricingMutation.mutate()}
                      disabled={!selectedProgramId || instantPricingMutation.isPending}
                      className="w-full"
                      data-testid="button-calculate-instant"
                    >
                      {instantPricingMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Calculate
                    </Button>
                  </div>
                </div>

                {/* Instant Result Display */}
                {instantResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className={instantResult.eligible ? "border-green-200 bg-green-50 dark:bg-green-950" : "border-red-200 bg-red-50 dark:bg-red-950"}>
                      <CardContent className="pt-4">
                        {instantResult.eligible ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                              <CheckCircle2 className="h-5 w-5" />
                              <span className="font-medium">Eligible for Financing</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-white dark:bg-background/50 rounded-lg p-3 text-center">
                                <p className="text-sm text-muted-foreground">Base Rate</p>
                                <p className="text-2xl font-bold">{instantResult.baseRate}%</p>
                              </div>
                              <div className="bg-white dark:bg-background/50 rounded-lg p-3 text-center">
                                <p className="text-sm text-muted-foreground">Final Rate</p>
                                <p className="text-2xl font-bold text-primary">{instantResult.finalRate}%</p>
                              </div>
                              <div className="bg-white dark:bg-background/50 rounded-lg p-3 text-center">
                                <p className="text-sm text-muted-foreground">Points</p>
                                <p className="text-2xl font-bold">{instantResult.points}</p>
                              </div>
                              <div className="bg-white dark:bg-background/50 rounded-lg p-3 text-center">
                                <p className="text-sm text-muted-foreground">Max LTV</p>
                                <p className="text-2xl font-bold">
                                  {instantResult.caps?.maxLTV 
                                    ? `${(instantResult.caps.maxLTV * 100).toFixed(0)}%`
                                    : instantResult.caps?.maxLTC 
                                    ? `${(instantResult.caps.maxLTC * 100).toFixed(0)}%`
                                    : "N/A"}
                                </p>
                              </div>
                            </div>
                            {instantResult.appliedAdjusters && instantResult.appliedAdjusters.length > 0 && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-2">Applied Adjustments:</p>
                                <div className="flex flex-wrap gap-2">
                                  {instantResult.appliedAdjusters.map((adj) => (
                                    <Badge key={adj.id} variant="outline" className="bg-white dark:bg-background">
                                      {adj.label}: +{adj.rateAdd}%
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-2">
                              <XCircle className="h-5 w-5" />
                              <span className="font-medium">Not Eligible</span>
                            </div>
                            {instantResult.reasons && (
                              <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside">
                                {instantResult.reasons.map((reason, i) => (
                                  <li key={i}>{reason}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {isPending ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 text-center py-20"
            >
              <div className="max-w-md mx-auto space-y-4">
                <Progress value={progress} className="h-3 w-full" />
                <p className="text-lg font-medium text-slate-700 animate-pulse">
                  {progressMessage}
                </p>
              </div>
            </motion.div>
          ) : !result ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {loanProductType === "dscr" ? (
                <LoanForm 
                  onSubmit={handleSubmit} 
                  isLoading={isPending} 
                  defaultData={lastFormData}
                />
              ) : rtlResult ? (
                <RTLPricingResult 
                  result={rtlResult} 
                  formData={rtlFormData}
                  onReset={handleReset}
                />
              ) : (
                <RTLLoanForm 
                  onSubmit={handleRTLSubmit} 
                  isLoading={rtlPricingMutation.isPending}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <PricingResult 
                result={result} 
                formData={lastFormData} 
                onReset={handleReset} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

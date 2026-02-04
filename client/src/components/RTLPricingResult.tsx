import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type RTLPricingResponse, type RTLPricingFormData } from "@shared/schema";
import { CheckCircle2, XCircle, AlertTriangle, RotateCcw, TrendingUp, Percent, DollarSign, Building, Calculator, Save, User, MapPin } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RTLPricingResultProps {
  result: RTLPricingResponse;
  formData: RTLPricingFormData | null;
  onReset: () => void;
  onEdit: () => void;
}

export function RTLPricingResult({ result, formData, onReset, onEdit }: RTLPricingResultProps) {
  const { toast } = useToast();
  const MIN_POINTS = 2.0;
  const MAX_ADDITIONAL_POINTS = 3.0;
  const [additionalPoints, setAdditionalPoints] = useState(0);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  
  const saveQuoteMutation = useMutation({
    mutationFn: async () => {
      const formattedRate = result.finalRate ? `${result.finalRate.toFixed(3)}%` : "N/A";
      
      return apiRequest('POST', '/api/quotes', {
        customerFirstName,
        customerLastName,
        propertyAddress: formData?.propertyAddress || "",
        loanData: formData,
        interestRate: formattedRate,
        pointsCharged: MIN_POINTS + additionalPoints
      });
    },
    onSuccess: () => {
      toast({
        title: "Quote Saved!",
        description: "Your quote has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
      setShowQuoteForm(false);
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
  
  const totalPoints = MIN_POINTS + additionalPoints;
  
  // Calculate max loan amounts based on property values and leverage caps
  const asIsValue = formData?.asIsValue || 0;
  const arv = formData?.arv || 0;
  const rehabBudget = formData?.rehabBudget || 0;
  const totalCost = asIsValue + rehabBudget;
  
  const maxLTC = result.caps?.maxLTC || 0;
  const maxLTAIV = result.caps?.maxLTAIV || 0;
  const maxLTARV = result.caps?.maxLTARV; // Can be null, number, or undefined
  const isLTARVApplicable = maxLTARV !== null && maxLTARV !== undefined;
  
  // Max loan based on each metric
  const maxLoanByLTC = (totalCost * maxLTC) / 100;
  // LTAIV formula: (((budget + as-is value) * LTC) - budget) / As is value
  // This gives max loan = calculated LTAIV * asIsValue, capped by maxLTAIV
  const calculatedLTAIV = asIsValue > 0 
    ? ((((rehabBudget + asIsValue) * (maxLTC / 100)) - rehabBudget) / asIsValue) * 100
    : 0;
  const effectiveLTAIV = Math.min(calculatedLTAIV, maxLTAIV);
  const maxLoanByLTAIV = (asIsValue * effectiveLTAIV) / 100;
  const maxLoanByLTARV = isLTARVApplicable ? (arv * maxLTARV) / 100 : Infinity;
  
  // The actual max loan is the minimum of applicable constraints
  const maxLoanAmount = isLTARVApplicable 
    ? Math.min(maxLoanByLTC, maxLoanByLTAIV, maxLoanByLTARV)
    : Math.min(maxLoanByLTC, maxLoanByLTAIV);
  
  // Commission is the additional points amount on max loan
  const additionalPointsAmount = (maxLoanAmount * additionalPoints) / 100;
  if (!result.eligible) {
    return (
      <Card className="w-full bg-white/90 backdrop-blur-sm shadow-xl border-red-200/60 overflow-hidden">
        <CardHeader className="bg-red-50/50 border-b border-red-100 pb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-red-800">Not Eligible</CardTitle>
              <CardDescription className="text-red-600">
                This loan does not meet program requirements
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 pb-8">
          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-slate-700">Disqualification Reasons:</h3>
            {result.disqualifiers?.map((dq, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <Badge variant="outline" className="text-xs mb-1 border-red-200 text-red-600">{dq.id}</Badge>
                  <p className="text-sm text-slate-700">{dq.message}</p>
                </div>
              </div>
            ))}
          </div>

          {result.flags && result.flags.length > 0 && (
            <div className="space-y-3 mb-6">
              <h3 className="font-semibold text-slate-700">Additional Flags:</h3>
              {result.flags.map((flag, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">{flag.message}</p>
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
    <Card className="w-full bg-white/90 backdrop-blur-sm shadow-xl border-green-200/60 overflow-hidden">
      <CardHeader className="bg-green-50/50 border-b border-green-100 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-green-100 rounded-lg">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-green-800">Eligible</CardTitle>
            <CardDescription className="text-green-600">
              Loan meets program requirements
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="p-4 bg-slate-50 rounded-lg border">
            <div className="flex items-center gap-2 text-slate-500 mb-2">
              <Percent className="h-4 w-4" />
              <span className="text-sm font-medium">Interest Rate</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-800" data-testid="text-rtl-rate">
                {result.finalRate?.toFixed(3)}%
              </span>
              {result.baseRate && result.finalRate && result.baseRate !== result.finalRate && (
                <span className="text-sm text-slate-500">
                  (base: {result.baseRate}%)
                </span>
              )}
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border">
            <div className="flex items-center gap-2 text-slate-500 mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Points</span>
            </div>
            <span className="text-3xl font-bold text-slate-800" data-testid="text-rtl-points">
              {result.points?.toFixed(2)}
            </span>
          </div>
        </div>

        {result.caps && (
          <div className="mb-6">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Building className="h-4 w-4" />
              Maximum Leverage Caps
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <span className="text-xs text-blue-600 font-medium">Max LTC</span>
                <div className="text-xl font-bold text-blue-800" data-testid="text-max-ltc">
                  {result.caps.maxLTC}%
                </div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-center">
                <span className="text-xs text-purple-600 font-medium">Max LTAIV</span>
                <div className="text-xl font-bold text-purple-800" data-testid="text-max-ltaiv">
                  {result.caps.maxLTAIV}%
                </div>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-center">
                <span className="text-xs text-indigo-600 font-medium">Max LTARV</span>
                <div className="text-xl font-bold text-indigo-800" data-testid="text-max-ltarv">
                  {isLTARVApplicable ? `${result.caps.maxLTARV}%` : "N/A"}
                </div>
              </div>
            </div>
          </div>
        )}


        {formData && result.caps && maxLoanAmount > 0 && (
          <div className="mb-6 bg-slate-50 rounded-lg p-5 border border-slate-200">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Commission Calculator
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  Additional Points (on top of {MIN_POINTS} minimum)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={MAX_ADDITIONAL_POINTS}
                    step={0.125}
                    value={additionalPoints}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= MAX_ADDITIONAL_POINTS) {
                        setAdditionalPoints(val);
                      }
                    }}
                    className="w-20 text-center text-lg font-bold"
                    data-testid="input-additional-points"
                  />
                  <span className="text-sm text-slate-500">points</span>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <Slider
                  value={[additionalPoints]}
                  onValueChange={([val]) => setAdditionalPoints(val)}
                  max={MAX_ADDITIONAL_POINTS}
                  step={0.125}
                  className="w-full"
                  data-testid="slider-additional-points"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-2">
                  <span>+0</span>
                  <span>+1</span>
                  <span>+2</span>
                  <span>+3</span>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Minimum Points Required</span>
                  <span className="font-medium">{MIN_POINTS.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Additional Points</span>
                  <span className="font-medium">+{additionalPoints.toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-slate-700">Total Points</span>
                  <span className="text-primary">{totalPoints.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-green-700">Your Commission</span>
                  <span className="text-2xl font-bold text-green-600" data-testid="text-rtl-commission">
                    ${additionalPointsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {result.appliedAdjusters && result.appliedAdjusters.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-slate-700 mb-3">Rate Adjustments Applied:</h3>
            <div className="space-y-2">
              {result.appliedAdjusters.map((adj, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-amber-50 rounded border border-amber-100">
                  <span className="text-sm text-slate-700">{adj.label}</span>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                    +{adj.rateAdd.toFixed(2)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.flags && result.flags.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-slate-700 mb-3">Flags & Notes:</h3>
            <div className="space-y-2">
              {result.flags.map((flag, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">{flag.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {formData && result.caps && maxLoanAmount > 0 && (
          <div className="mb-6 bg-white rounded-lg p-5 border border-slate-200">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Loan Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Maximum Loan Amount</span>
                <span className="text-xl font-bold text-green-600" data-testid="text-max-loan-amount">
                  ${maxLoanByLTC.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Initial Loan Amount</span>
                <span className="text-xl font-bold text-blue-600" data-testid="text-initial-loan-amount">
                  ${maxLoanByLTAIV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600">
                  Budget <span className="text-slate-400">(100% held back)</span>
                </span>
                <span className="text-lg font-semibold text-slate-700" data-testid="text-budget-held-back">
                  ${rehabBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600">Down Payment</span>
                <span className="text-lg font-semibold text-slate-700" data-testid="text-down-payment">
                  ${Math.max(0, asIsValue - maxLoanByLTAIV).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600">Total Points ({totalPoints.toFixed(2)}%)</span>
                <span className="text-lg font-semibold text-slate-700" data-testid="text-total-points-dollars">
                  ${((maxLoanByLTC * totalPoints) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600">
                  Misc. Closing Costs <span className="text-slate-400">(title, insurance, etc.)</span>
                </span>
                <span className="text-lg font-semibold text-slate-700" data-testid="text-misc-closing-costs">
                  ${((maxLoanByLTC * 1.5) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 bg-primary/5 rounded-lg px-3 -mx-3">
                <span className="text-slate-700 font-semibold">Estimated Total Cash to Close</span>
                <span className="text-2xl font-bold text-primary" data-testid="text-cash-to-close">
                  ${(Math.max(0, asIsValue - maxLoanByLTAIV) + ((maxLoanByLTC * totalPoints) / 100) + ((maxLoanByLTC * 1.5) / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        )}

        {!showQuoteForm ? (
          <>
            <Button 
              onClick={() => setShowQuoteForm(true)}
              className="w-full mb-3 h-12 text-lg font-semibold bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg shadow-green-500/20"
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
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 space-y-5 mb-3">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
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
              <Label className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Property Address
              </Label>
              <div className="p-3 bg-white rounded border border-slate-200 text-sm text-slate-700">
                {formData?.propertyAddress || "Not provided"}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
              <h4 className="font-semibold text-slate-700 text-sm">Loan Details Summary</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Loan Type:</span>
                  <span className="font-medium">{formData?.loanType?.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Interest Rate:</span>
                  <span className="font-medium">{result.finalRate?.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">As-Is Value:</span>
                  <span className="font-medium">${asIsValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ARV:</span>
                  <span className="font-medium">${arv.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rehab Budget:</span>
                  <span className="font-medium">${rehabBudget.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Cost:</span>
                  <span className="font-medium">${totalCost.toLocaleString()}</span>
                </div>
              </div>
              <div className="border-t pt-3 mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Max Loan Amount:</span>
                  <span className="font-bold text-green-600">${maxLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Points:</span>
                  <span className="font-bold text-primary">{totalPoints.toFixed(2)}</span>
                </div>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Your Commission:</span>
                  <span className="font-bold text-green-600">${additionalPointsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600"
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

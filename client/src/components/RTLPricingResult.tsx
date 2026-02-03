import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type RTLPricingResponse, type RTLPricingFormData } from "@shared/schema";
import { CheckCircle2, XCircle, AlertTriangle, RotateCcw, TrendingUp, Percent, DollarSign, Building, Calculator } from "lucide-react";

interface RTLPricingResultProps {
  result: RTLPricingResponse;
  formData: RTLPricingFormData | null;
  onReset: () => void;
}

export function RTLPricingResult({ result, formData, onReset }: RTLPricingResultProps) {
  const MIN_POINTS = 2.0;
  const MAX_ADDITIONAL_POINTS = 3.0;
  const [additionalPoints, setAdditionalPoints] = useState(0);
  
  const totalPoints = MIN_POINTS + additionalPoints;
  
  // Calculate max loan amounts based on property values and leverage caps
  const asIsValue = formData?.asIsValue || 0;
  const arv = formData?.arv || 0;
  const rehabBudget = formData?.rehabBudget || 0;
  const totalCost = asIsValue + rehabBudget;
  
  const maxLTC = result.caps?.maxLTC || 0;
  const maxLTAIV = result.caps?.maxLTAIV || 0;
  const maxLTARV = result.caps?.maxLTARV || 0;
  
  // Max loan based on each metric
  const maxLoanByLTC = (totalCost * maxLTC) / 100;
  const maxLoanByLTAIV = (asIsValue * maxLTAIV) / 100;
  const maxLoanByLTARV = (arv * maxLTARV) / 100;
  
  // The actual max loan is the minimum of all three constraints
  const maxLoanAmount = Math.min(maxLoanByLTC, maxLoanByLTAIV, maxLoanByLTARV);
  
  // Commission calculation (points on max loan)
  const pointsAmount = (maxLoanAmount * totalPoints) / 100;
  const commission = pointsAmount * 0.30;
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
                  {result.caps.maxLTARV}%
                </div>
              </div>
            </div>
          </div>
        )}

        {formData && result.caps && (
          <div className="mb-6">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Maximum Loan Amounts
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <span className="text-xs text-blue-600 font-medium">Max by LTC</span>
                <div className="text-lg font-bold text-blue-800" data-testid="text-max-loan-ltc">
                  ${maxLoanByLTC.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <span className="text-xs text-blue-500">{maxLTC}% of ${totalCost.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-center">
                <span className="text-xs text-purple-600 font-medium">Max by LTAIV</span>
                <div className="text-lg font-bold text-purple-800" data-testid="text-max-loan-ltaiv">
                  ${maxLoanByLTAIV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <span className="text-xs text-purple-500">{maxLTAIV}% of ${asIsValue.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-center">
                <span className="text-xs text-indigo-600 font-medium">Max by LTARV</span>
                <div className="text-lg font-bold text-indigo-800" data-testid="text-max-loan-ltarv">
                  ${maxLoanByLTARV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <span className="text-xs text-indigo-500">{maxLTARV}% of ${arv.toLocaleString()}</span>
              </div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
              <span className="text-sm text-green-600 font-medium">Maximum Loan Amount (Limiting Factor)</span>
              <div className="text-2xl font-bold text-green-800" data-testid="text-max-loan-amount">
                ${maxLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                  <span>+1.5</span>
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
              
              <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Points Amount ({totalPoints.toFixed(2)}% of ${maxLoanAmount.toLocaleString()})</span>
                  <span className="font-medium">${pointsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-green-700">Your Commission (30%)</span>
                    <span className="text-2xl font-bold text-green-600" data-testid="text-rtl-commission">
                      ${commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
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

        <Button onClick={onReset} variant="outline" className="w-full" data-testid="button-rtl-new-quote">
          <RotateCcw className="h-4 w-4 mr-2" />
          Start New Quote
        </Button>
      </CardContent>
    </Card>
  );
}

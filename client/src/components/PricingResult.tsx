import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { PricingResponse, LoanPricingFormData } from "@shared/schema";
import { CheckCircle2, ArrowLeft, Download, AlertCircle, FileText, Save, DollarSign, Percent, User } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

interface PricingResultProps {
  result: PricingResponse;
  formData: LoanPricingFormData | null;
  onReset: () => void;
}

export function PricingResult({ result, formData, onReset }: PricingResultProps) {
  const { toast } = useToast();
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [pointsCharged, setPointsCharged] = useState(1); // Minimum 1 point

  const loanAmount = formData?.loanAmount || 0;
  const tpoPremiumPercent = formData?.tpoPremium ? parseFloat(formData.tpoPremium) : 0;
  const tpoPremiumAmount = (loanAmount * tpoPremiumPercent) / 100;
  const pointsAmount = (loanAmount * pointsCharged) / 100;
  const totalRevenue = pointsAmount + tpoPremiumAmount;
  // Commission is everything above 1 point minimum
  const additionalPoints = Math.max(0, pointsCharged - 1);
  const commission = (loanAmount * additionalPoints) / 100;

  const saveQuoteMutation = useMutation({
    mutationFn: async () => {
      const rate = result.interestRate;
      const formattedRate = typeof rate === 'string' ? rate : (rate ? `${rate.toFixed(3)}%` : "N/A");
      
      return apiRequest('POST', '/api/quotes', {
          customerFirstName,
          customerLastName,
          propertyAddress,
          loanData: formData,
          interestRate: formattedRate,
          pointsCharged
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
      <Card className="w-full border-red-100 bg-red-50/50 shadow-lg">
        <CardHeader className="text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <CardTitle>Pricing Error</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 mb-4">{result.message || result.error || "An unknown error occurred."}</p>
          {result.debug && (
             <pre className="bg-red-100 p-2 rounded text-xs overflow-auto max-h-40">
               {JSON.stringify(result.debug, null, 2)}
             </pre>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={onReset} variant="outline" className="w-full border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800">
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
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-2 shadow-sm">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Your Qualified Rate</h2>
        <div className="text-5xl font-extrabold text-primary tracking-tight">
          {formattedRate}
        </div>
        <p className="text-sm text-slate-500 mt-2">Based on today's market conditions</p>
      </div>

      <CardContent className="p-6">
        <div className="grid gap-6">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Loan Summary
            </h3>
            
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <div>
                <dt className="text-slate-500">Loan Amount</dt>
                <dd className="font-medium text-slate-900">${formData?.loanAmount?.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Property Value</dt>
                <dd className="font-medium text-slate-900">${formData?.propertyValue?.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">LTV</dt>
                <dd className="font-medium text-slate-900">{formData?.ltv}</dd>
              </div>
              <div>
                <dt className="text-slate-500">FICO Score</dt>
                <dd className="font-medium text-slate-900">{formData?.ficoScore}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Program</dt>
                <dd className="font-medium text-slate-900">{formData?.loanType}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Property Type</dt>
                <dd className="font-medium text-slate-900">{formData?.propertyType}</dd>
              </div>
{/* TPO Premium is auto-included but hidden from user */}
            </dl>
          </div>

          {!showQuoteForm ? (
            <Button 
              onClick={() => setShowQuoteForm(true)}
              className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg shadow-green-500/20"
              data-testid="button-save-quote"
            >
              <Save className="mr-2 h-5 w-5" />
              Save as Quote
            </Button>
          ) : (
            <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 space-y-5">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
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
                <Label htmlFor="address">Property Address</Label>
                <AddressAutocomplete
                  id="address"
                  value={propertyAddress}
                  onChange={setPropertyAddress}
                  placeholder="Start typing an address..."
                  data-testid="input-property-address"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    Origination Points (1 min + up to 2 additional)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={3}
                      step={0.125}
                      value={pointsCharged}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 1 && val <= 3) {
                          setPointsCharged(val);
                        }
                      }}
                      className="w-20 text-center text-lg font-bold"
                      data-testid="input-points"
                    />
                    <span className="text-sm text-slate-500">points</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">1 point minimum required. Your commission is the additional points above 1.</p>
                <div className="bg-white rounded-lg p-4 border-2 border-slate-300 shadow-sm">
                  <Slider
                    value={[pointsCharged]}
                    onValueChange={([val]) => setPointsCharged(val)}
                    min={1}
                    max={3}
                    step={0.125}
                    className="w-full"
                    data-testid="slider-points"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-2">
                    <span>1 point (min)</span>
                    <span>2 points</span>
                    <span>3 points (max)</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
                <h4 className="font-semibold text-slate-700 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  Revenue Breakdown
                </h4>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Points Amount ({pointsCharged.toFixed(2)}% of ${loanAmount.toLocaleString()})</span>
                    <span className="font-medium">${pointsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-green-700">
                      Your Commission ({additionalPoints.toFixed(2)} pts above 1 min)
                    </span>
                    <span className="text-2xl font-bold text-green-600" data-testid="text-commission">
                      ${commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600"
                  data-testid="button-confirm-save"
                >
                  {saveQuoteMutation.isPending ? "Saving..." : "Save Quote"}
                </Button>
              </div>
            </div>
          )}
          
          <div className="text-xs text-slate-400 text-center px-4">
            Disclaimer: This rate is an estimate based on the information provided. Final approval is subject to full underwriting and verification of all documents. Rates are subject to change without notice.
          </div>
        </div>
      </CardContent>

      <CardFooter className="bg-slate-50 p-6 border-t border-slate-100">
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
            className="flex-1 h-12 text-lg font-semibold shadow-lg shadow-primary/20 bg-gradient-to-r from-primary to-blue-600"
          >
            <Download className="mr-2 h-5 w-5" />
            Download PDF
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

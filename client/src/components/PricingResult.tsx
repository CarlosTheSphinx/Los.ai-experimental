import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PricingResponse, LoanPricingFormData } from "@shared/schema";
import { CheckCircle2, ArrowLeft, Download, AlertCircle, FileText } from "lucide-react";

interface PricingResultProps {
  result: PricingResponse;
  formData: LoanPricingFormData | null;
  onReset: () => void;
}

export function PricingResult({ result, formData, onReset }: PricingResultProps) {
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
  // Format percentage nicely
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
            </dl>
          </div>
          
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

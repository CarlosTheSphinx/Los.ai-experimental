import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loanPricingFormSchema, type LoanPricingFormData } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calculator, DollarSign, Building, Percent } from "lucide-react";
import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface LoanFormProps {
  onSubmit: (data: LoanPricingFormData) => void;
  isLoading: boolean;
}

export function LoanForm({ onSubmit, isLoading }: LoanFormProps) {
  const form = useForm<LoanPricingFormData>({
    resolver: zodResolver(loanPricingFormSchema),
    defaultValues: {
      loanAmount: "" as any,
      propertyValue: "" as any,
      ltv: "",
      loanType: "30 YR Fixed Rate",
      loanPurpose: "Purchase",
      propertyType: "Single Family",
      interestOnly: "No",
      ficoScore: "740",
      dscr: "1.20x+",
      prepaymentPenalty: "5-Year (54321)",
    },
  });

  // Calculate LTV whenever loan amount or property value changes
  const loanAmount = form.watch("loanAmount");
  const propertyValue = form.watch("propertyValue");

  useEffect(() => {
    if (loanAmount && propertyValue && propertyValue > 0) {
      const numericLtv = (Number(loanAmount) / Number(propertyValue)) * 100;
      
      // Map numeric LTV to backend ranges
      let mappedLtv = "";
      if (numericLtv <= 50) mappedLtv = "≤ 50%";
      else if (numericLtv <= 55) mappedLtv = "50.01% - 55%";
      else if (numericLtv <= 60) mappedLtv = "55.01% - 60%";
      else if (numericLtv <= 65) mappedLtv = "60.01% - 65%";
      else if (numericLtv <= 70) mappedLtv = "65.01% - 70%";
      else if (numericLtv <= 75) mappedLtv = "70.01% - 75%";
      else if (numericLtv <= 80) mappedLtv = "75.01% - 80%";
      else mappedLtv = "75.01% - 80%"; // Cap at 80% as per backend options
      
      form.setValue("ltv", mappedLtv);
    }
  }, [loanAmount, propertyValue, form]);

  return (
    <Card className="w-full bg-white/90 backdrop-blur-sm shadow-xl border-slate-200/60 overflow-hidden">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">Loan Parameters</CardTitle>
        </div>
        <CardDescription className="text-base text-slate-500">
          Enter the loan details below to receive a real-time interest rate quote.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-8 px-6 pb-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
            {/* Financial Details Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-slate-400" />
                Financials
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="loanAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Loan Amount ($)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <Input type="number" className="pl-9 h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all" placeholder="Enter amount" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="propertyValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Property Value ($)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Building className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <Input type="number" className="pl-9 h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all" placeholder="Enter value" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="ltv"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">LTV (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <Input readOnly className="pl-9 h-11 bg-slate-100/50 text-slate-500 font-medium" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ficoScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">FICO Score</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select FICO" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[760, 740, 720, 700, 680, 660, 640, 620].map(score => (
                            <SelectItem key={score} value={score.toString()}>{score}+</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dscr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Est. DSCR</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select DSCR" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1.0x - 1.19x">1.0x - 1.19x</SelectItem>
                          <SelectItem value="1.20x+">1.20x+</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Loan Specifics Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Building className="w-5 h-5 text-slate-400" />
                Loan Specifics
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="loanType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Loan Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="30 YR Fixed Rate">30 YR Fixed Rate</SelectItem>
                          <SelectItem value="10/6 ARM (30 YR)">10/6 ARM (30 YR)</SelectItem>
                          <SelectItem value="7/6 ARM (30 YR)">7/6 ARM (30 YR)</SelectItem>
                          <SelectItem value="5/6 ARM (30 YR)">5/6 ARM (30 YR)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="loanPurpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Loan Purpose</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select purpose" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Purchase">Purchase</SelectItem>
                          <SelectItem value="Rate/Term Refinance">Rate/Term Refinance</SelectItem>
                          <SelectItem value="Cash-Out Refinance">Cash-Out Refinance</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="propertyType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Property Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select property type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Single Family">Single Family</SelectItem>
                          <SelectItem value="2-4 Unit">2-4 Unit</SelectItem>
                          <SelectItem value="Portfolio (1-4 Unit)">Portfolio (1-4 Unit)</SelectItem>
                          <SelectItem value="Warrantable Condo">Warrantable Condo</SelectItem>
                          <SelectItem value="Non-Warrantable Condo">Non-Warrantable Condo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="interestOnly"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Interest Only</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select option" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="No">No</SelectItem>
                          <SelectItem value="Yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <FormField
                  control={form.control}
                  name="prepaymentPenalty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">Prepayment Penalty</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="5-Year (54321)">5-Year (54321)</SelectItem>
                          <SelectItem value="3-Year (321)">3-Year (321)</SelectItem>
                          <SelectItem value="2-Year (320)">2-Year (320)</SelectItem>
                          <SelectItem value="1-Year (300)">1-Year (300)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tpoPremium"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">TPO Premium</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                            <SelectValue placeholder="No TPO Premium" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="No TPO Premium">No TPO Premium</SelectItem>
                          <SelectItem value="0.25%">0.25%</SelectItem>
                          <SelectItem value="0.50%">0.50%</SelectItem>
                          <SelectItem value="0.75%">0.75%</SelectItem>
                          <SelectItem value="1.00%">1.00%</SelectItem>
                          <SelectItem value="1.25%">1.25%</SelectItem>
                          <SelectItem value="1.5%">1.5%</SelectItem>
                          <SelectItem value="1.75%">1.75%</SelectItem>
                          <SelectItem value="2.0%">2.0%</SelectItem>
                          <SelectItem value="2.25%">2.25%</SelectItem>
                          <SelectItem value="2.5%">2.5%</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full h-14 text-lg font-semibold shadow-lg shadow-primary/20 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 transition-all duration-300"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Calculating Rate...
                </>
              ) : (
                "Get Pricing Quote"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

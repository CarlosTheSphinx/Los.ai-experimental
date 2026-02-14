import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loanPricingFormSchema, type LoanPricingFormData } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calculator, DollarSign, Building, Percent } from "lucide-react";
import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface LoanFormProps {
  onSubmit: (data: LoanPricingFormData) => void;
  isLoading: boolean;
  defaultData?: LoanPricingFormData | null;
}

export function LoanForm({ onSubmit, isLoading, defaultData }: LoanFormProps) {
  const form = useForm<LoanPricingFormData>({
    resolver: zodResolver(loanPricingFormSchema),
    defaultValues: defaultData || {
      loanAmount: "" as any,
      propertyValue: "" as any,
      ltv: "",
      loanType: "" as any,
      loanPurpose: "" as any,
      propertyType: "" as any,
      interestOnly: "" as any,
      ficoScore: "" as any,
      grossMonthlyRent: "" as any,
      annualTaxes: "" as any,
      annualInsurance: "" as any,
      calculatedDscr: "",
      dscr: "" as any,
      prepaymentPenalty: "" as any,
      tpoPremium: "1", // Auto-set 1% TPO (hidden from user)
    },
  });

  // Calculate LTV and DSCR
  const loanAmount = form.watch("loanAmount");
  const propertyValue = form.watch("propertyValue");
  const grossMonthlyRent = form.watch("grossMonthlyRent");
  const annualTaxes = form.watch("annualTaxes");
  const annualInsurance = form.watch("annualInsurance");

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
      else mappedLtv = "75.01% - 80%";
      
      form.setValue("ltv", mappedLtv);
    }
  }, [loanAmount, propertyValue, form]);

  useEffect(() => {
    if (grossMonthlyRent && annualTaxes !== undefined && annualInsurance !== undefined && loanAmount) {
      const monthlyRent = Number(grossMonthlyRent);
      const taxes = Number(annualTaxes);
      const insurance = Number(annualInsurance);
      const loan = Number(loanAmount);

      const annualIncome = monthlyRent * 12;
      const noi = annualIncome - (taxes || 0) - (insurance || 0);

      // Estimate monthly payment (P&I) at 7% interest for 30 years
      const rate = 0.07 / 12;
      const n = 360;
      const monthlyPayment = loan * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
      const annualDebtService = monthlyPayment * 12;

      const dscrRatio = noi / annualDebtService;
      form.setValue("calculatedDscr", dscrRatio.toFixed(2));

      let mappedDscr = "1.20x+";
      if (dscrRatio < 1.0) mappedDscr = "1.0x - 1.19x";
      else if (dscrRatio < 1.2) mappedDscr = "1.0x - 1.19x";
      else mappedDscr = "1.20x+";

      form.setValue("dscr", mappedDscr);
    }
  }, [grossMonthlyRent, annualTaxes, annualInsurance, loanAmount, form]);

  return (
    <Card className="w-full bg-background/90 backdrop-blur-sm shadow-xl border-border/60 overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/10 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">DSCR Loan Parameters</CardTitle>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary mt-1">
              Debt Service Coverage Ratio
            </span>
          </div>
        </div>
        <CardDescription className="text-base text-muted-foreground mt-2">
          Enter the DSCR loan details below to receive a real-time interest rate quote.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-8 px-6 pb-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            
            {/* Financial Details Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
                Financials
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="loanAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Loan Amount ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          className="h-11 bg-muted border-border focus:bg-background transition-all" 
                          placeholder="Enter amount" 
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-loan-amount"
                        />
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
                      <FormLabel className="text-foreground">Property Value ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          className="h-11 bg-muted border-border focus:bg-background transition-all" 
                          placeholder="Enter value" 
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-property-value"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="ltv"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">LTV (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input readOnly className="pl-9 h-11 bg-muted text-muted-foreground font-medium" {...field} />
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
                      <FormLabel className="text-foreground">FICO Score</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted border-border">
                            <SelectValue placeholder="Select FICO" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {["780+", "760 - 779", "740 - 759", "720 - 739", "700 - 719", "680 - 699", "660 - 679", "Below 660"].map(score => (
                            <SelectItem key={score} value={score}>{score}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="grossMonthlyRent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Gross Monthly Rent ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          className="h-11 bg-muted border-border focus:bg-background transition-all" 
                          placeholder="Enter rent" 
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-gross-monthly-rent"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="annualTaxes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Annual Taxes ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          className="h-11 bg-muted border-border focus:bg-background transition-all" 
                          placeholder="Enter taxes" 
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-annual-taxes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="annualInsurance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Annual Insurance ($)</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          className="h-11 bg-muted border-border focus:bg-white transition-all" 
                          placeholder="Enter insurance" 
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-annual-insurance"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="calculatedDscr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Exact DSCR</FormLabel>
                      <FormControl>
                        <Input readOnly className="h-11 bg-muted text-muted-foreground font-medium" placeholder="Calculated" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dscr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Est. DSCR</FormLabel>
                      <Select disabled onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted text-muted-foreground font-medium">
                            <SelectValue placeholder="Calculated from financials" />
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

            <div className="h-px bg-border" />

            {/* Loan Specifics Section */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Building className="w-5 h-5 text-muted-foreground" />
                Loan Specifics
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="loanType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Loan Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted border-border">
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
                      <FormLabel className="text-foreground">Loan Purpose</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted border-border">
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
                      <FormLabel className="text-foreground">Property Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted border-border">
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
                      <FormLabel className="text-foreground">Interest Only</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted border-border">
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
                      <FormLabel className="text-foreground">Prepayment Penalty</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted border-border">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
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

{/* TPO Premium is automatically set to 1% - hidden from user */}
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

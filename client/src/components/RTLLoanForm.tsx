import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { rtlPricingFormSchema, type RTLPricingFormData } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Calculator, DollarSign, Building, User, FileText, CreditCard, Landmark } from "lucide-react";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RTLLoanFormProps {
  onSubmit: (data: RTLPricingFormData) => void;
  isLoading: boolean;
}

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

export function RTLLoanForm({ onSubmit, isLoading }: RTLLoanFormProps) {
  const [activeTab, setActiveTab] = useState("loan");

  const form = useForm<RTLPricingFormData>({
    resolver: zodResolver(rtlPricingFormSchema),
    defaultValues: {
      loanType: "light_rehab",
      purpose: "purchase",
      propertyUnits: 1,
      asIsValue: 0,
      rehabBudget: 0,
      propertyType: "sfr_1_4",
      state: "",
      isMidstream: false,
      experienceTier: "experienced",
      completedProjects: 0,
      fico: 720,
      hasFullGuaranty: true,
      isDecliningMarket: false,
      isListedLast12Months: false,
      mortgageLate30Last24: 0,
      mortgageLate60Last24: 0,
      isForeignNational: false,
    },
  });

  const loanType = form.watch("loanType");
  const purpose = form.watch("purpose");
  const asIsValue = form.watch("asIsValue");
  const rehabBudget = form.watch("rehabBudget");

  // Auto-calculate loan type for rehab loans based on 50% rule
  const calculatedRehabType = (() => {
    if (loanType === "bridge_no_rehab" || loanType === "guc") return null;
    if (!asIsValue || asIsValue <= 0) return null;
    const rehabPercent = (rehabBudget || 0) / asIsValue * 100;
    return rehabPercent >= 50 ? "heavy_rehab" : "light_rehab";
  })();

  // Determine if this is a rehab loan (has rehab budget > 0)
  const isRehabLoan = (rehabBudget || 0) > 0 && loanType !== "guc";

  // Auto-set loan type based on rehab budget
  useEffect(() => {
    if (loanType === "guc") return; // Don't override GUC
    
    if (asIsValue > 0 && rehabBudget > 0) {
      const rehabPercent = rehabBudget / asIsValue * 100;
      const newType = rehabPercent >= 50 ? "heavy_rehab" : "light_rehab";
      if (loanType !== newType && loanType !== "guc") {
        form.setValue("loanType", newType);
      }
    } else if (rehabBudget === 0 && loanType !== "bridge_no_rehab" && loanType !== "guc") {
      form.setValue("loanType", "bridge_no_rehab");
    }
  }, [asIsValue, rehabBudget, loanType, form]);

  return (
    <Card className="w-full bg-white/90 backdrop-blur-sm shadow-xl border-slate-200/60 overflow-hidden">
      <CardHeader className="bg-orange-50/50 border-b border-orange-100 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Calculator className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-800">Fix and Flip/Ground Up Construction</CardTitle>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 mt-1">
              RTL Pricing
            </span>
          </div>
        </div>
        <CardDescription className="text-base text-slate-500 mt-2">
          Enter the loan details below to receive a real-time rate quote.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6 px-6 pb-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="loan" data-testid="tab-loan">
                  <DollarSign className="w-4 h-4 mr-1" />
                  Loan
                </TabsTrigger>
                <TabsTrigger value="borrower" data-testid="tab-borrower">
                  <User className="w-4 h-4 mr-1" />
                  Borrower
                </TabsTrigger>
                <TabsTrigger value="property" data-testid="tab-property">
                  <Building className="w-4 h-4 mr-1" />
                  Property
                </TabsTrigger>
                <TabsTrigger value="credit" data-testid="tab-credit">
                  <CreditCard className="w-4 h-4 mr-1" />
                  Credit
                </TabsTrigger>
              </TabsList>

              <TabsContent value="loan" className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-slate-400" />
                  Loan Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="loanType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Loan Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-slate-50 border-slate-200" data-testid="select-rtl-loan-type">
                              <SelectValue placeholder="Select loan type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="light_rehab">Rehab</SelectItem>
                            <SelectItem value="bridge_no_rehab">Bridge (No Rehab)</SelectItem>
                            <SelectItem value="guc">Ground Up Construction (GUC)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="purpose"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Loan Purpose</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-slate-50 border-slate-200" data-testid="select-rtl-purpose">
                              <SelectValue placeholder="Select purpose" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="purchase">Purchase</SelectItem>
                            <SelectItem value="refi">Refinance</SelectItem>
                            <SelectItem value="cash_out">Cash-Out Refinance</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {purpose === "cash_out" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="cashOutAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700">Cash-Out Amount ($)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                              <Input
                                type="number"
                                className="pl-9 h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                                placeholder="Enter cash-out amount"
                                data-testid="input-rtl-cashout"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="isMidstream"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-midstream"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-slate-700">Midstream Loan</FormLabel>
                        <p className="text-sm text-slate-500">Check if this is a midstream/construction takeout</p>
                      </div>
                    </FormItem>
                  )}
                />

                {loanType === "guc" && (
                  <div className="border-t pt-6 space-y-6">
                    <h4 className="font-medium text-slate-700">GUC-Specific Fields</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="initialDrawToLandPct"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-700">Initial Draw to Land (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                className="h-11 bg-slate-50 border-slate-200"
                                placeholder="0-70"
                                data-testid="input-initial-draw"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="monthsSinceWorkPerformed"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-slate-700">Months Since Work Performed</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                className="h-11 bg-slate-50 border-slate-200"
                                placeholder="Enter months"
                                data-testid="input-months-since-work"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="hasBuildingPermitsIssued"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-permits"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-slate-700">Building Permits Issued</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="borrower" className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <User className="w-5 h-5 text-slate-400" />
                  Borrower Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="experienceTier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Experience Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-slate-50 border-slate-200" data-testid="select-experience">
                              <SelectValue placeholder="Select experience" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="no_experience">No Experience</SelectItem>
                            <SelectItem value="experienced">Experienced</SelectItem>
                            <SelectItem value="institutional">Institutional</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="completedProjects"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Completed Projects</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-slate-50 border-slate-200"
                            placeholder="Enter count"
                            data-testid="input-completed-projects"
                            {...field}
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
                    name="fico"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">FICO Score</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-slate-50 border-slate-200"
                            placeholder="Enter FICO (660-850)"
                            data-testid="input-fico"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="borrowingEntityType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Entity Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-slate-50 border-slate-200" data-testid="select-entity-type">
                              <SelectValue placeholder="Select entity type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="llc">LLC</SelectItem>
                            <SelectItem value="llp">LLP</SelectItem>
                            <SelectItem value="lp">LP</SelectItem>
                            <SelectItem value="corporation">Corporation</SelectItem>
                            <SelectItem value="sole_prop">Sole Proprietorship</SelectItem>
                            <SelectItem value="revocable_trust">Revocable Trust</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="hasFullGuaranty"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-guaranty"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-slate-700">Full Guaranty</FormLabel>
                          <p className="text-sm text-slate-500">Without full guaranty, minimum FICO is 700</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isForeignNational"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-foreign"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-slate-700">Foreign National</FormLabel>
                          <p className="text-sm text-slate-500">Additional documentation will be required</p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="property" className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Building className="w-5 h-5 text-slate-400" />
                  Property Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="propertyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Property Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-slate-50 border-slate-200" data-testid="select-property-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="sfr_1_4">SFR (1-4 units)</SelectItem>
                            <SelectItem value="condo">Condo</SelectItem>
                            <SelectItem value="multifamily">Multifamily (5+)</SelectItem>
                            <SelectItem value="pud">PUD</SelectItem>
                            <SelectItem value="modular">Modular</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="propertyUnits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Number of Units</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-slate-50 border-slate-200"
                            placeholder="1-20"
                            data-testid="input-units"
                            {...field}
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
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">State</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-slate-50 border-slate-200" data-testid="select-state">
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {US_STATES.map(state => (
                              <SelectItem key={state} value={state}>{state}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="asIsValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">As-Is Value ($)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                              type="number"
                              className="pl-9 h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                              placeholder="Enter as-is value"
                              data-testid="input-as-is-value"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="rehabBudget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">Rehab Budget ($)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                              type="number"
                              className="pl-9 h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                              placeholder="Enter rehab budget (0 for no rehab)"
                              data-testid="input-rehab-budget"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {loanType !== "guc" && asIsValue > 0 && (
                    <div className="flex items-end">
                      <div className="w-full p-3 bg-slate-100 rounded-lg border border-slate-200">
                        <p className="text-sm text-slate-500 mb-1">Calculated Loan Type</p>
                        <p className="text-lg font-semibold text-slate-800" data-testid="text-calculated-loan-type">
                          {rehabBudget > 0 ? (
                            (rehabBudget / asIsValue * 100) >= 50 ? (
                              <span className="text-orange-600">Heavy Rehab</span>
                            ) : (
                              <span className="text-green-600">Light Rehab</span>
                            )
                          ) : (
                            <span className="text-blue-600">Bridge (No Rehab)</span>
                          )}
                        </p>
                        {rehabBudget > 0 && (
                          <p className="text-xs text-slate-500 mt-1">
                            Rehab is {((rehabBudget / asIsValue) * 100).toFixed(1)}% of as-is value
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-6 space-y-4">
                  <h4 className="font-medium text-slate-700">Market Conditions</h4>

                  <FormField
                    control={form.control}
                    name="isDecliningMarket"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-declining"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-slate-700">Declining Market</FormLabel>
                          <p className="text-sm text-slate-500">-10% LTC and LTARV reduction</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isListedLast12Months"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-listed"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-slate-700">Listed in Last 12 Months</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  {form.watch("isListedLast12Months") && (
                    <FormField
                      control={form.control}
                      name="daysOnMarket"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700">Days on Market</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="h-11 bg-slate-50 border-slate-200 max-w-xs"
                              placeholder="Enter days"
                              data-testid="input-days-on-market"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="credit" className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-slate-400" />
                  Credit History
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="mortgageLate30Last24"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">30-Day Lates (Last 24 Mo)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-slate-50 border-slate-200"
                            placeholder="0"
                            data-testid="input-late30"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-slate-500">Max allowed: 1</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mortgageLate60Last24"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">60-Day Lates (Last 24 Mo)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-slate-50 border-slate-200"
                            placeholder="0"
                            data-testid="input-late60"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-slate-500">Max allowed: 0</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium text-slate-700 mb-4">Credit Events (Leave blank if none)</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="monthsSinceBK"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700">Months Since Bankruptcy</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="h-11 bg-slate-50 border-slate-200"
                              placeholder="N/A"
                              data-testid="input-bk"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <p className="text-xs text-slate-500">Min: 60 months</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="monthsSinceForeclosure"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700">Months Since Foreclosure</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="h-11 bg-slate-50 border-slate-200"
                              placeholder="N/A"
                              data-testid="input-foreclosure"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <p className="text-xs text-slate-500">Min: 60 months</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="monthsSinceShortSaleOrDIL"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-700">Months Since Short Sale/DIL</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="h-11 bg-slate-50 border-slate-200"
                              placeholder="N/A"
                              data-testid="input-shortsale"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <p className="text-xs text-slate-500">Min: 60 months</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="pt-6 border-t">
              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold bg-orange-600 hover:bg-orange-700"
                disabled={isLoading}
                data-testid="button-rtl-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Calculating Price...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-5 w-5" />
                    Get Rate Quote
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

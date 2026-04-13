import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { rtlPricingFormSchema, type RTLPricingFormData } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput, NumberInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calculator, DollarSign, Building, User, FileText, CreditCard, Landmark } from "lucide-react";
import { useEffect } from "react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

interface QuoteFormField {
  fieldKey: string;
  label: string;
  visible: boolean;
  required: boolean;
}

interface RTLLoanFormProps {
  onSubmit: (data: RTLPricingFormData) => void;
  isLoading: boolean;
  defaultData?: RTLPricingFormData | null;
  visibleFields?: QuoteFormField[];
}

export function RTLLoanForm({ onSubmit, isLoading, defaultData, visibleFields }: RTLLoanFormProps) {
  const isFieldVisible = (fieldKey: string) => {
    if (!visibleFields) return true;
    if (visibleFields.length === 0) return false;
    const field = visibleFields.find(f => f.fieldKey === fieldKey);
    return field ? field.visible !== false : false;
  };
  const form = useForm<RTLPricingFormData>({
    resolver: zodResolver(rtlPricingFormSchema),
    defaultValues: defaultData || {
      loanType: "light_rehab",
      purpose: "purchase",
      propertyUnits: 1,
      asIsValue: 0,
      arv: 0,
      rehabBudget: 0,
      propertyType: "sfr_1_4",
      propertyAddress: "",
      isMidstream: false,
      borrowingEntityType: "llc",
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

  // Reset form when defaultData changes (for editing)
  useEffect(() => {
    if (defaultData) {
      form.reset(defaultData);
    }
  }, [defaultData, form]);

  const loanType = form.watch("loanType");
  const purpose = form.watch("purpose");
  const asIsValue = form.watch("asIsValue");
  const rehabBudget = form.watch("rehabBudget");
  const completedProjects = form.watch("completedProjects");

  // Auto-calculate experience level based on completed projects
  const calculatedExperienceLevel = (() => {
    const projects = completedProjects || 0;
    if (projects >= 10) return { tier: "institutional", label: "Institutional", color: "text-primary" };
    if (projects >= 3) return { tier: "experienced", label: "Experienced", color: "text-primary" };
    return { tier: "no_experience", label: "No Experience", color: "text-warning" };
  })();

  // Auto-set experience tier based on completed projects
  useEffect(() => {
    const projects = completedProjects || 0;
    let newTier: "no_experience" | "experienced" | "institutional";
    if (projects >= 10) newTier = "institutional";
    else if (projects >= 3) newTier = "experienced";
    else newTier = "no_experience";
    
    if (form.getValues("experienceTier") !== newTier) {
      form.setValue("experienceTier", newTier);
    }
  }, [completedProjects, form]);

  // Auto-calculate loan type for rehab loans based on 50% rule
  const calculatedRehabType = (() => {
    if (loanType === "bridge_no_rehab" || loanType === "guc") return null;
    if (!asIsValue || asIsValue <= 0) return null;
    const rehabPercent = (rehabBudget || 0) / asIsValue * 100;
    return rehabPercent >= 50 ? "heavy_rehab" : "light_rehab";
  })();

  // Determine if this is a rehab loan (has rehab budget > 0)
  const isRehabLoan = (rehabBudget || 0) > 0 && loanType !== "guc";

  // Auto-set loan type based on rehab budget (only when both values are entered)
  useEffect(() => {
    if (loanType === "guc" || loanType === "bridge_no_rehab") return; // Don't override GUC or Bridge
    
    // Only auto-switch between light/heavy rehab when values are present
    if (asIsValue > 0 && rehabBudget > 0) {
      const rehabPercent = rehabBudget / asIsValue * 100;
      const newType = rehabPercent >= 50 ? "heavy_rehab" : "light_rehab";
      if (loanType !== newType) {
        form.setValue("loanType", newType);
      }
    }
  }, [asIsValue, rehabBudget, loanType, form]);

  return (
    <Card className="w-full bg-background/90 backdrop-blur-sm shadow-xl border-border/60 overflow-hidden">
      <CardHeader className="bg-warning/5 border-b border-warning/10 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-warning/10 rounded-lg">
            <Calculator className="h-6 w-6 text-warning" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">Fix and Flip/Ground Up Construction</CardTitle>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning mt-1">
              RTL Pricing
            </span>
          </div>
        </div>
        <CardDescription className="text-base text-muted-foreground mt-2">
          Enter the loan details below to receive a real-time rate quote.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6 px-6 pb-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Loan Details Section */}
            {(isFieldVisible('loanType') || isFieldVisible('purpose') || isFieldVisible('isMidstream')) && (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                  Loan Details
                </h3>

                {isFieldVisible('loanType') && (
                <FormField
                  control={form.control}
                  name="loanType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Loan Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 bg-muted border-border" data-testid="select-rtl-loan-type">
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
                )}

                {isFieldVisible('isMidstream') && (
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
                        <FormLabel className="text-foreground">Midstream Loan</FormLabel>
                        <p className="text-sm text-muted-foreground">Check if this is a midstream/construction takeout</p>
                      </div>
                    </FormItem>
                  )}
                />
                )}

                {loanType === "guc" && (
                  <div className="border-t pt-6 space-y-6">
                    <h4 className="font-medium text-foreground">GUC-Specific Fields</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="initialDrawToLandPct"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Initial Draw to Land (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                className="h-11 bg-muted border-border"
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
                            <FormLabel className="text-foreground">Months Since Work Performed</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                className="h-11 bg-muted border-border"
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
                            <FormLabel className="text-foreground">Building Permits Issued</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
            </div>
            )}

            {/* Borrower Information Section */}
            {(isFieldVisible('completedProjects') || isFieldVisible('ficoScore') || isFieldVisible('borrowingEntityType') || isFieldVisible('hasFullGuaranty')) && (
            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <User className="w-5 h-5 text-muted-foreground" />
                Borrower Information
              </h3>

                {isFieldVisible('completedProjects') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="completedProjects"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Completed Deals (In last three years)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-muted border-border"
                            placeholder="Enter count"
                            data-testid="input-completed-projects"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-end">
                    <div className="w-full p-3 bg-muted rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground mb-1">Experience Level</p>
                      <p className={`text-lg font-semibold ${calculatedExperienceLevel.color}`} data-testid="text-experience-level">
                        {calculatedExperienceLevel.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {completedProjects >= 10 ? "10+ projects" : completedProjects >= 3 ? "3-9 projects" : "0-2 projects"}
                      </p>
                    </div>
                  </div>
                </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {isFieldVisible('ficoScore') && (
                  <FormField
                    control={form.control}
                    name="fico"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">FICO Score</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-muted border-border"
                            placeholder="Enter FICO (660-850)"
                            data-testid="input-fico"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}

                  {isFieldVisible('borrowingEntityType') && (
                  <FormField
                    control={form.control}
                    name="borrowingEntityType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Entity Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-muted border-border" data-testid="select-entity-type">
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
                  )}
                </div>

                <div className="space-y-4">
                  {isFieldVisible('hasFullGuaranty') && (
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
                          <FormLabel className="text-foreground">Full Guaranty</FormLabel>
                          <p className="text-sm text-muted-foreground">Without full guaranty, minimum FICO is 700</p>
                        </div>
                      </FormItem>
                    )}
                  />
                  )}

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
                          <FormLabel className="text-foreground">Foreign National</FormLabel>
                          <p className="text-sm text-muted-foreground">Additional documentation will be required</p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
            </div>
            )}

            {/* Property Details Section */}
            {(isFieldVisible('propertyType') || isFieldVisible('propertyUnits') || isFieldVisible('asIsValue') || isFieldVisible('arv') || isFieldVisible('rehabBudget')) && (
            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Building className="w-5 h-5 text-muted-foreground" />
                Property Details
              </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {isFieldVisible('propertyType') && (
                  <FormField
                    control={form.control}
                    name="propertyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Property Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11 bg-muted border-border" data-testid="select-property-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="single-family-residence">Single Family Residence</SelectItem>
                            <SelectItem value="2-4-unit">2-4 Unit</SelectItem>
                            <SelectItem value="multifamily-5-plus">Multifamily (5+ Units)</SelectItem>
                            <SelectItem value="rental-portfolio">Rental Portfolio</SelectItem>
                            <SelectItem value="mixed-use">Mixed-Use</SelectItem>
                            <SelectItem value="infill-lot">Infill Lot</SelectItem>
                            <SelectItem value="land">Land</SelectItem>
                            <SelectItem value="office">Office</SelectItem>
                            <SelectItem value="retail">Retail</SelectItem>
                            <SelectItem value="hospitality">Hospitality</SelectItem>
                            <SelectItem value="industrial">Industrial</SelectItem>
                            <SelectItem value="medical">Medical</SelectItem>
                            <SelectItem value="agricultural">Agricultural</SelectItem>
                            <SelectItem value="special-purpose">Special Purpose</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  )}

                  {isFieldVisible('propertyUnits') && (
                  <FormField
                    control={form.control}
                    name="propertyUnits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Number of Units</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-muted border-border"
                            placeholder="1-20"
                            data-testid="input-units"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="propertyAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Property Address</FormLabel>
                      <FormControl>
                        <AddressAutocomplete
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Start typing an address..."
                          className="h-11 bg-muted border-border focus:bg-background transition-all"
                          data-testid="input-property-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isFieldVisible('asIsValue') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="asIsValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">As-Is Value ($)</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            className="h-11 bg-muted border-border focus:bg-background transition-all"
                            placeholder="Enter as-is value"
                            data-testid="input-as-is-value"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {isFieldVisible('arv') && (
                  <FormField
                    control={form.control}
                    name="arv"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">ARV - After Repair Value ($)</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            className="h-11 bg-muted border-border focus:bg-background transition-all"
                            placeholder="Enter after repair value"
                            data-testid="input-arv"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  )}

                  {isFieldVisible('rehabBudget') && (
                  <FormField
                    control={form.control}
                    name="rehabBudget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Rehab Budget ($)</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            className="h-11 bg-muted border-border focus:bg-background transition-all"
                            placeholder="Enter rehab budget (0 for no rehab)"
                            data-testid="input-rehab-budget"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  )}

                  {loanType !== "guc" && asIsValue > 0 && (
                    <div className="flex items-end">
                      <div className="w-full p-3 bg-muted rounded-lg border border-border">
                        <p className="text-sm text-muted-foreground mb-1">Calculated Loan Type</p>
                        <p className="text-lg font-semibold text-foreground" data-testid="text-calculated-loan-type">
                          {rehabBudget > 0 ? (
                            (rehabBudget / asIsValue * 100) >= 50 ? (
                              <span className="text-warning">Heavy Rehab</span>
                            ) : (
                              <span className="text-success">Light Rehab</span>
                            )
                          ) : (
                            <span className="text-info">Bridge (No Rehab)</span>
                          )}
                        </p>
                        {rehabBudget > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Rehab is {((rehabBudget / asIsValue) * 100).toFixed(1)}% of as-is value
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-6 space-y-4">
                  <h4 className="font-medium text-foreground">Market Conditions</h4>

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
                          <FormLabel className="text-foreground">Listed in Last 12 Months</FormLabel>
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
                          <FormLabel className="text-foreground">Days on Market</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              className="h-11 bg-muted border-border max-w-xs"
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
            </div>
            )}

            {/* Credit History Section */}
            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-muted-foreground" />
                Credit History
              </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="mortgageLate30Last24"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">30-Day Lates (Last 24 Mo)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-muted border-border"
                            placeholder="0"
                            data-testid="input-late30"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Max allowed: 1</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mortgageLate60Last24"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">60-Day Lates (Last 24 Mo)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            className="h-11 bg-muted border-border"
                            placeholder="0"
                            data-testid="input-late60"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Max allowed: 0</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium text-foreground mb-4">Credit Events (In last 5 years)</h4>
                  
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="monthsSinceBK"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value !== null && field.value !== undefined}
                              onCheckedChange={(checked) => {
                                field.onChange(checked ? 12 : null);
                              }}
                              data-testid="checkbox-bk"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-foreground">Bankruptcy in the last 5 years?</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="monthsSinceForeclosure"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value !== null && field.value !== undefined}
                              onCheckedChange={(checked) => {
                                field.onChange(checked ? 12 : null);
                              }}
                              data-testid="checkbox-foreclosure"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-foreground">Foreclosure in the last 5 years?</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="monthsSinceShortSaleOrDIL"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value !== null && field.value !== undefined}
                              onCheckedChange={(checked) => {
                                field.onChange(checked ? 12 : null);
                              }}
                              data-testid="checkbox-shortsale"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-foreground">Short Sale/DIL in the last 5 years?</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
            </div>

            <div className="pt-6 border-t">
              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold bg-warning hover:bg-warning/90"
                disabled={isLoading}
                data-testid="button-rtl-submit"
              >
                {isLoading ? (
                  "Calculating Price..."
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

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const US_STATES = [
  { value: "AL", label: "AL - Alabama" },
  { value: "AK", label: "AK - Alaska" },
  { value: "AZ", label: "AZ - Arizona" },
  { value: "AR", label: "AR - Arkansas" },
  { value: "CA", label: "CA - California" },
  { value: "CO", label: "CO - Colorado" },
  { value: "CT", label: "CT - Connecticut" },
  { value: "DE", label: "DE - Delaware" },
  { value: "DC", label: "DC - District of Columbia" },
  { value: "FL", label: "FL - Florida" },
  { value: "GA", label: "GA - Georgia" },
  { value: "HI", label: "HI - Hawaii" },
  { value: "ID", label: "ID - Idaho" },
  { value: "IL", label: "IL - Illinois" },
  { value: "IN", label: "IN - Indiana" },
  { value: "IA", label: "IA - Iowa" },
  { value: "KS", label: "KS - Kansas" },
  { value: "KY", label: "KY - Kentucky" },
  { value: "LA", label: "LA - Louisiana" },
  { value: "ME", label: "ME - Maine" },
  { value: "MD", label: "MD - Maryland" },
  { value: "MA", label: "MA - Massachusetts" },
  { value: "MI", label: "MI - Michigan" },
  { value: "MN", label: "MN - Minnesota" },
  { value: "MS", label: "MS - Mississippi" },
  { value: "MO", label: "MO - Missouri" },
  { value: "MT", label: "MT - Montana" },
  { value: "NE", label: "NE - Nebraska" },
  { value: "NV", label: "NV - Nevada" },
  { value: "NH", label: "NH - New Hampshire" },
  { value: "NJ", label: "NJ - New Jersey" },
  { value: "NM", label: "NM - New Mexico" },
  { value: "NY", label: "NY - New York" },
  { value: "NC", label: "NC - North Carolina" },
  { value: "ND", label: "ND - North Dakota" },
  { value: "OH", label: "OH - Ohio" },
  { value: "OK", label: "OK - Oklahoma" },
  { value: "OR", label: "OR - Oregon" },
  { value: "PA", label: "PA - Pennsylvania" },
  { value: "RI", label: "RI - Rhode Island" },
  { value: "SC", label: "SC - South Carolina" },
  { value: "SD", label: "SD - South Dakota" },
  { value: "TN", label: "TN - Tennessee" },
  { value: "TX", label: "TX - Texas" },
  { value: "UT", label: "UT - Utah" },
  { value: "VT", label: "VT - Vermont" },
  { value: "VA", label: "VA - Virginia" },
  { value: "WA", label: "WA - Washington" },
  { value: "WV", label: "WV - West Virginia" },
  { value: "WI", label: "WI - Wisconsin" },
  { value: "WY", label: "WY - Wyoming" },
];

const ASSET_CLASSES = [
  { value: "single-family-residence", label: "Single Family Residence" },
  { value: "2-4-unit", label: "2-4 Unit" },
  { value: "multifamily-5-plus", label: "Multifamily (5+ Units)" },
  { value: "rental-portfolio", label: "Rental Portfolio" },
  { value: "mixed-use", label: "Mixed-Use" },
  { value: "infill-lot", label: "Infill Lot" },
  { value: "land", label: "Land" },
  { value: "office", label: "Office" },
  { value: "retail", label: "Retail" },
  { value: "hospitality", label: "Hospitality" },
  { value: "industrial", label: "Industrial" },
  { value: "medical", label: "Medical" },
  { value: "agricultural", label: "Agricultural" },
  { value: "special-purpose", label: "Special Purpose" },
];

const DEAL_TYPES = [
  { value: "acquisition", label: "Acquisition" },
  { value: "refinance", label: "Refinance" },
  { value: "cash-out-refinance", label: "Cash-Out Refinance" },
  { value: "construction", label: "Construction" },
  { value: "renovation", label: "Renovation" },
];

const CREDIT_SCORES = [
  { value: "below-600", label: "Below 600" },
  { value: "600-649", label: "600-649" },
  { value: "650-699", label: "650-699" },
  { value: "700-749", label: "700-749" },
  { value: "750+", label: "750+" },
];

const preScreenSchema = z.object({
  loanAmount: z.coerce.number().min(1, "Loan amount is required"),
  assetClass: z.string().min(1, "Asset class is required"),
  propertyState: z.string().min(1, "Property state is required"),
  dealType: z.string().min(1, "Deal type is required"),
  creditScore: z.string().min(1, "Credit score range is required"),
});

type PreScreenFormValues = z.infer<typeof preScreenSchema>;

interface PreScreenResult {
  decision: "proceed" | "decline" | "borderline";
  reason: string;
}

export default function CommercialPreScreenPage() {
  const [, navigate] = useLocation();
  const [result, setResult] = useState<PreScreenResult | null>(null);

  const form = useForm<PreScreenFormValues>({
    resolver: zodResolver(preScreenSchema),
    defaultValues: {
      loanAmount: "" as unknown as number,
      assetClass: "",
      propertyState: "",
      dealType: "",
      creditScore: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: PreScreenFormValues) => {
      const res = await apiRequest("POST", "/api/commercial/pre-screen", data);
      return await res.json() as PreScreenResult;
    },
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const onSubmit = (data: PreScreenFormValues) => {
    setResult(null);
    mutation.mutate(data);
  };

  const resetForm = () => {
    form.reset();
    setResult(null);
    mutation.reset();
  };

  const buildSubmissionUrl = () => {
    const values = form.getValues();
    const params = new URLSearchParams({
      assetClass: values.assetClass,
      dealType: values.dealType,
      state: values.propertyState,
      loanAmount: String(values.loanAmount),
      creditScore: values.creditScore,
    });
    return `/commercial-submission/new?${params.toString()}`;
  };

  return (
    <div className="min-h-full p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-page-title">
            Quick Deal Check
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">
            Answer 5 questions to see if we can help with your commercial deal
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deal Details</CardTitle>
            <CardDescription>Tell us about your commercial deal</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="loanAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan Amount Needed</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            {...field}
                            type="number"
                            placeholder="2,000,000"
                            className="pl-7"
                            data-testid="input-loan-amount"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assetClass"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asset Class</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-asset-class">
                            <SelectValue placeholder="Select asset class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ASSET_CLASSES.map((ac) => (
                            <SelectItem key={ac.value} value={ac.value}>
                              {ac.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="propertyState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property State</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-property-state">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {US_STATES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dealType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deal Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-deal-type">
                            <SelectValue placeholder="Select deal type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEAL_TYPES.map((dt) => (
                            <SelectItem key={dt.value} value={dt.value}>
                              {dt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="creditScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sponsor Credit Score Range</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-credit-score">
                            <SelectValue placeholder="Select credit score range" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CREDIT_SCORES.map((cs) => (
                            <SelectItem key={cs.value} value={cs.value}>
                              {cs.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={mutation.isPending}
                  data-testid="button-submit-prescreen"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Check If We Can Help"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {result.decision === "proceed" && (
              <Card
                className="border-success/20 bg-success/10"
                data-testid="result-card-proceed"
              >
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-success" data-testid="text-result-title">
                        Great fit! Proceed with full submission
                      </h3>
                      <p className="text-sm text-success/80" data-testid="text-result-reason">
                        {result.reason}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => navigate(buildSubmissionUrl())}
                    data-testid="button-continue-submission"
                  >
                    Continue to Full Submission
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {result.decision === "decline" && (
              <Card
                className="border-destructive/20 bg-destructive/10"
                data-testid="result-card-decline"
              >
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-destructive" data-testid="text-result-title">
                        This deal doesn't fit our current criteria
                      </h3>
                      <p className="text-sm text-destructive/80" data-testid="text-result-reason">
                        {result.reason}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={resetForm}
                    data-testid="button-try-different"
                  >
                    Try a Different Deal
                  </Button>
                </CardContent>
              </Card>
            )}

            {result.decision === "borderline" && (
              <Card
                className="border-warning/20 bg-warning/10"
                data-testid="result-card-borderline"
              >
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-6 w-6 text-warning shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-warning" data-testid="text-result-title">
                        Borderline - Worth submitting
                      </h3>
                      <p className="text-sm text-warning/80" data-testid="text-result-reason">
                        {result.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => navigate(buildSubmissionUrl())}
                      data-testid="button-continue-submission"
                    >
                      Continue to Full Submission
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={resetForm}
                      data-testid="button-try-different"
                    >
                      Try Different Parameters
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

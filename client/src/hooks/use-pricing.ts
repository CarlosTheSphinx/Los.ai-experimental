import { useMutation } from "@tanstack/react-query";
import { api, type LoanPricingFormData, type PricingResponse } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function usePricing() {
  const { toast } = useToast();

  return useMutation<PricingResponse, Error, LoanPricingFormData>({
    mutationFn: async (data: LoanPricingFormData) => {
      // Ensure numeric fields are correctly typed if they come in as strings from forms
      const payload = {
        ...data,
        loanAmount: Number(data.loanAmount),
        propertyValue: Number(data.propertyValue),
        // other fields are strings or handled by zod coercion in backend
      };

      const res = await fetch(api.pricing.submit.path, {
        method: api.pricing.submit.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("The pricing request timed out or returned an unexpected response. Please try again.");
      }

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || errorData.error || "Failed to fetch pricing");
      }

      const result = await res.json();
      return api.pricing.submit.responses[200].parse(result);
    },
    onError: (error) => {
      toast({
        title: "Pricing Error",
        description: error.message || "Something went wrong while calculating rates.",
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      if (!data.success) {
        toast({
          title: "Pricing Failed",
          description: data.message || "Could not retrieve pricing for these parameters.",
          variant: "destructive",
        });
      }
    },
  });
}

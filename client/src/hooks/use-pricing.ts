import { useMutation } from "@tanstack/react-query";
import { api, type LoanPricingFormData, type PricingResponse } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function usePricing() {
  const { toast } = useToast();

  return useMutation<PricingResponse, Error, Record<string, any>>({
    mutationFn: async (data: Record<string, any>) => {
      const payload: Record<string, any> = { ...data };
      for (const key of Object.keys(payload)) {
        const val = payload[key];
        if (typeof val === 'string' && val !== '' && !isNaN(Number(val.replace(/,/g, '')))) {
          const num = Number(val.replace(/,/g, ''));
          if (key === 'loanAmount' || key === 'propertyValue' || /amount|value|price|budget|rent|tax|insurance/i.test(key)) {
            payload[key] = num;
          }
        }
      }

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
        const err = new Error(errorData.message || errorData.error || "Failed to fetch pricing") as any;
        err.scraperPayload = errorData.scraperPayload;
        err.debug = errorData.debug;
        throw err;
      }

      const result = await res.json();
      try {
        return api.pricing.submit.responses[200].parse(result);
      } catch {
        return result;
      }
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

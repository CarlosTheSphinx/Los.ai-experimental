import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, ArrowLeft, Building, DollarSign, CheckCircle2, AlertCircle, Loader2, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoanForm } from "@/components/LoanForm";
import { RTLLoanForm } from "@/components/RTLLoanForm";
import { PricingResult } from "@/components/PricingResult";
import { RTLPricingResult } from "@/components/RTLPricingResult";
import type { LoanPricingFormData, PricingResponse, RTLPricingFormData, RTLPricingResponse } from "@shared/schema";

interface Program {
  id: number;
  name: string;
  description: string | null;
  loanType: string | null;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  eligiblePropertyTypes: string[] | null;
  quoteFormFields: any;
  yspEnabled: boolean | null;
  yspMin: number | null;
  yspMax: number | null;
  yspStep: number | null;
  basePoints: number | null;
  basePointsMin: number | null;
  basePointsMax: number | null;
  brokerPointsEnabled: boolean | null;
  brokerPointsMin: number | null;
  brokerPointsMax: number | null;
  brokerPointsStep: number | null;
}

interface MagicLinkQuoteBuilderProps {
  magicLinkToken: string;
  programs: Program[];
  userType: "borrower" | "broker";
  lenderName?: string;
  companyName?: string;
}

export default function MagicLinkQuoteBuilder({
  magicLinkToken,
  programs,
  userType,
  lenderName,
  companyName,
}: MagicLinkQuoteBuilderProps) {
  const { toast } = useToast();
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [dscrResult, setDscrResult] = useState<PricingResponse | null>(null);
  const [rtlResult, setRtlResult] = useState<RTLPricingResponse | null>(null);
  const [lastDscrForm, setLastDscrForm] = useState<LoanPricingFormData | null>(null);
  const [lastRtlForm, setLastRtlForm] = useState<RTLPricingFormData | null>(null);

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);
  const isRTL = selectedProgram?.loanType === "RTL" || selectedProgram?.loanType === "Fix & Flip";

  // DSCR pricing mutation
  const dscrMutation = useMutation<any, Error, LoanPricingFormData>({
    mutationFn: async (data) => {
      const payload = {
        programId: selectedProgramId,
        inputs: {
          ...data,
          loanAmount: Number(data.loanAmount),
          propertyValue: Number(data.propertyValue),
        },
      };
      const res = await fetch(`/api/magic-link/${magicLinkToken}/pricing/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Pricing request failed");
      }
      return res.json();
    },
    onSuccess: (data, formData) => {
      setLastDscrForm(formData);
      // Transform backend response to match PricingResponse shape
      const result = data.result;
      setDscrResult({
        success: result.eligible,
        message: result.eligible ? "Pricing calculated successfully" : (result.reasons?.join(". ") || "Not eligible"),
        rate: result.finalRate,
        points: result.points,
        baseRate: result.baseRate,
        caps: result.caps,
        appliedAdjusters: result.appliedAdjusters,
        notes: result.notes,
        yspRateImpact: result.yspRateImpact,
        effectiveRate: result.effectiveRate,
      } as any);
    },
    onError: (error) => {
      toast({ title: "Pricing Error", description: error.message, variant: "destructive" });
    },
  });

  // RTL pricing mutation
  const rtlMutation = useMutation<any, Error, RTLPricingFormData>({
    mutationFn: async (data) => {
      const payload = {
        programId: selectedProgramId,
        inputs: data,
      };
      const res = await fetch(`/api/magic-link/${magicLinkToken}/pricing/rtl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Pricing request failed");
      }
      return res.json();
    },
    onSuccess: (data, formData) => {
      setLastRtlForm(formData);
      setRtlResult(data.result);
    },
    onError: (error) => {
      toast({ title: "Pricing Error", description: error.message, variant: "destructive" });
    },
  });

  const handleReset = () => {
    setDscrResult(null);
    setRtlResult(null);
    setLastDscrForm(null);
    setLastRtlForm(null);
  };

  // Show result if we have one
  if (dscrResult && !isRTL) {
    return (
      <div className="space-y-4">
        <PricingResult
          result={dscrResult}
          formData={lastDscrForm}
          onReset={handleReset}
          programId={selectedProgramId}
          programConfig={selectedProgram ? {
            yspEnabled: selectedProgram.yspEnabled ?? false,
            yspMin: selectedProgram.yspMin ?? undefined,
            yspMax: selectedProgram.yspMax ?? undefined,
            yspStep: selectedProgram.yspStep ?? undefined,
            basePoints: selectedProgram.basePoints ?? undefined,
            basePointsMin: selectedProgram.basePointsMin ?? undefined,
            basePointsMax: selectedProgram.basePointsMax ?? undefined,
            brokerPointsEnabled: selectedProgram.brokerPointsEnabled ?? undefined,
            brokerPointsMin: selectedProgram.brokerPointsMin ?? undefined,
            brokerPointsMax: selectedProgram.brokerPointsMax ?? undefined,
            brokerPointsStep: selectedProgram.brokerPointsStep ?? undefined,
          } : null}
        />
      </div>
    );
  }

  if (rtlResult && isRTL) {
    return (
      <div className="space-y-4">
        <RTLPricingResult
          result={rtlResult}
          formData={lastRtlForm}
          onReset={handleReset}
          onEdit={handleReset}
          programId={selectedProgramId}
          programConfig={selectedProgram ? {
            yspEnabled: selectedProgram.yspEnabled ?? false,
            yspMin: selectedProgram.yspMin ?? undefined,
            yspMax: selectedProgram.yspMax ?? undefined,
            yspStep: selectedProgram.yspStep ?? undefined,
            basePoints: selectedProgram.basePoints ?? undefined,
            basePointsMin: selectedProgram.basePointsMin ?? undefined,
            basePointsMax: selectedProgram.basePointsMax ?? undefined,
            brokerPointsEnabled: selectedProgram.brokerPointsEnabled ?? undefined,
            brokerPointsMin: selectedProgram.brokerPointsMin ?? undefined,
            brokerPointsMax: selectedProgram.brokerPointsMax ?? undefined,
            brokerPointsStep: selectedProgram.brokerPointsStep ?? undefined,
          } : null}
        />
      </div>
    );
  }

  // No programs available
  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No Programs Available</h3>
          <p className="text-sm text-muted-foreground mt-2">
            This lender hasn't published any loan programs yet. Check back later.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Quote Calculator
          </CardTitle>
          <CardDescription>
            Select a loan program and enter your deal details to get an instant rate quote
            {companyName ? ` from ${companyName}` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Program Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Loan Program</label>
            <Select
              value={selectedProgramId?.toString() || ""}
              onValueChange={(val) => {
                setSelectedProgramId(Number(val));
                handleReset();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a loan program" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id.toString()} data-testid={`select-program-${program.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">#{program.id}</span>
                      <span>{program.name}</span>
                      {program.loanType && (
                        <Badge variant="outline" className="text-xs">
                          {program.loanType}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Program Details */}
          {selectedProgram && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2" data-testid={`program-details-${selectedProgram.id}`}>
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{selectedProgram.name}</span>
                <span className="text-xs text-muted-foreground font-mono flex items-center gap-0.5">
                  <Hash className="h-3 w-3" />{selectedProgram.id}
                </span>
                {selectedProgram.loanType && (
                  <Badge variant="secondary" className="text-xs">{selectedProgram.loanType}</Badge>
                )}
              </div>
              {selectedProgram.description && (
                <p className="text-sm text-muted-foreground">{selectedProgram.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {selectedProgram.minLoanAmount != null && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Min: ${Number(selectedProgram.minLoanAmount).toLocaleString()}
                  </span>
                )}
                {selectedProgram.maxLoanAmount != null && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Max: ${Number(selectedProgram.maxLoanAmount).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Form */}
      {selectedProgram && (
        <>
          {isRTL ? (
            <RTLLoanForm
              onSubmit={(data) => rtlMutation.mutate(data)}
              isLoading={rtlMutation.isPending}
              visibleFields={selectedProgram.quoteFormFields as any}
            />
          ) : (
            <LoanForm
              onSubmit={(data) => dscrMutation.mutate(data)}
              isLoading={dscrMutation.isPending}
              visibleFields={selectedProgram.quoteFormFields as any}
            />
          )}
        </>
      )}
    </div>
  );
}

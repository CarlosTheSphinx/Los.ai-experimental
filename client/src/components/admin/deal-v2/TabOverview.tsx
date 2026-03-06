import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pencil, Building2, User, Settings2, Plus, DollarSign, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/validation";

type QuoteFormField = {
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  visible: boolean;
  displayGroup?: string;
  options?: string[];
  readOnly?: boolean;
  autoFilledFrom?: string;
  computedFrom?: string[];
  repeatable?: boolean;
  repeatGroupKey?: string;
};

const LOCKED_LOAN_FIELD_KEYS = new Set([
  'ltv', 'ysp', 'lenderOriginationPoints', 'brokerOriginationPoints',
  'interestRate', 'brokerName', 'holdbackAmount', 'loanTermMonths', 'term',
]);

const CONTACT_FIELD_KEYS = new Set(['firstName', 'lastName', 'email', 'phone', 'address']);

function fmt(amount: number | string | undefined | null): string {
  if (amount === null || amount === undefined || amount === "" || amount === "—") return "—";
  const n = typeof amount === "string" ? parseFloat(amount.replace(/[^0-9.-]/g, "")) : amount;
  if (isNaN(n)) return "—";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFieldValue(value: any, fieldType: string): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (fieldType) {
    case 'currency':
      return fmt(value);
    case 'percentage':
      return `${value}%`;
    case 'yes_no':
    case 'radio':
      return value === true || value === 'yes' || value === 'Yes' ? 'Yes' : 'No';
    case 'date':
      return fmtDate(value);
    case 'address':
      return String(value).replace(/,?\s*United States of America$/i, '');
    default:
      return String(value);
  }
}

function Field({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  const labelEl = tooltip ? (
    <Tooltip>
      <TooltipTrigger className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-dashed border-muted-foreground/40 cursor-help">
        {label} <span className="text-muted-foreground/50">?</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
  );
  return (
    <div data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      {labelEl}
      <p className="text-[17px] font-bold mt-0.5">{value}</p>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-[16px] mt-0.5"
        data-testid={`input-edit-${label.toLowerCase().replace(/\s+/g, "-")}`}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-[16px] mt-0.5" data-testid={`select-edit-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DynamicEditField({ field, value, onChange }: { field: QuoteFormField; value: string; onChange: (v: string) => void }) {
  const testId = `input-edit-${field.label.toLowerCase().replace(/\s+/g, "-")}`;
  if (field.fieldType === 'select' && field.options?.length) {
    return (
      <div>
        <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{field.label}</span>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-[16px] mt-0.5" data-testid={testId}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (field.fieldType === 'yes_no' || field.fieldType === 'radio') {
    return (
      <div>
        <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{field.label}</span>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-[16px] mt-0.5" data-testid={testId}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  const inputType = (field.fieldType === 'currency' || field.fieldType === 'percentage' || field.fieldType === 'number') ? 'number' : field.fieldType === 'email' ? 'email' : field.fieldType === 'phone' ? 'tel' : 'text';
  return <EditField label={field.label} value={value} onChange={onChange} type={inputType} />;
}

export default function TabOverview({
  deal,
  properties,
  dealId,
  isAdmin = true,
  stages: programStages,
}: {
  deal: any;
  properties: any[];
  dealId: string;
  isAdmin?: boolean;
  stages?: any[];
}) {
  const { toast } = useToast();
  const apiBase = "/api/admin";

  const primaryProp = properties?.find((p: any) => p.isPrimary) || properties?.[0];

  const propertyValue = deal.propertyValue || deal.applicationData?.propertyValue || primaryProp?.estimatedValue || deal.loanData?.propertyValue;
  const loanAmount = deal.loanAmount || deal.loanData?.loanAmount;
  const interestRate = deal.interestRate;
  const termMonths = deal.termMonths || deal.loanTermMonths || deal.loanData?.loanTerm;
  const loanType = deal.loanType || deal.loanData?.loanType || "";
  const isDSCR = loanType.toLowerCase().includes("dscr");
  const isRTL = !isDSCR;

  const calculatedLtv = (loanAmount && propertyValue && Number(propertyValue) > 0)
    ? ((Number(loanAmount) / Number(propertyValue)) * 100).toFixed(1)
    : null;

  const rateDisplay = interestRate && interestRate !== "—"
    ? (String(interestRate).includes("%") ? interestRate : `${Number(interestRate).toFixed(3)}%`)
    : "—";

  const yspValue = deal.ysp ?? deal.applicationData?.ysp ?? deal.applicationData?.yspAmount;
  const lenderPts = deal.lenderOriginationPoints ?? deal.applicationData?.originationPoints ?? deal.applicationData?.basePointsCharged;
  const brokerPts = deal.brokerOriginationPoints ?? deal.applicationData?.brokerPointsCharged;
  const brokerNameVal = deal.brokerName ?? deal.applicationData?.brokerName ?? "";
  const prepayPenalty = deal.prepaymentPenalty ?? deal.applicationData?.prepaymentPenalty ?? "";
  const holdbackAmt = deal.holdbackAmount ?? deal.applicationData?.holdbackAmount;

  const termOptions = isDSCR
    ? [
        { value: "60", label: "5 Year IO" },
        { value: "84", label: "7 Year IO" },
        { value: "120", label: "10 Year IO" },
      ]
    : [
        { value: "12", label: "12 month" },
        { value: "15", label: "15 month" },
        { value: "18", label: "18 month" },
        { value: "24", label: "24 month" },
      ];

  const termDisplay = (() => {
    if (!termMonths) return "—";
    const match = termOptions.find(o => o.value === String(termMonths));
    if (match) return match.label;
    const n = Number(termMonths);
    if (!isNaN(n) && n > 0) {
      return `${n} month${n > 1 ? 's' : ''}`;
    }
    return String(termMonths);
  })();

  const prepayOptions = [
    { value: "5-4-3-2-1%", label: "5-4-3-2-1%" },
    { value: "4-3-2-1%", label: "4-3-2-1%" },
    { value: "3-2-1%", label: "3-2-1%" },
    { value: "2-1%", label: "2-1%" },
    { value: "1%", label: "1%" },
    { value: "None", label: "None" },
  ];

  const [editLoan, setEditLoan] = useState(false);
  const [loanForm, setLoanForm] = useState<Record<string, string>>({});

  const [editBorrower, setEditBorrower] = useState(false);
  const [borrowerForm, setBorrowerForm] = useState<Record<string, string>>({});

  const [editProperty, setEditProperty] = useState(false);
  const [propForm, setPropForm] = useState<Record<string, string>>({});

  const invalidateDeal = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId] });
  };

  const saveLoanMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("PATCH", `${apiBase}/projects/${deal.projectId || deal.id}`, data);
    },
    onSuccess: () => {
      setEditLoan(false);
      invalidateDeal();
      toast({ title: "Loan details updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const saveBorrowerMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("PATCH", `${apiBase}/deals/${dealId}/people`, data);
    },
    onSuccess: () => {
      setEditBorrower(false);
      invalidateDeal();
      toast({ title: "Borrower details updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const savePropertyMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      if (primaryProp?.id) {
        return apiRequest("PATCH", `${apiBase}/deals/${dealId}/properties/${primaryProp.id}`, data);
      }
      return apiRequest("POST", `${apiBase}/deals/${dealId}/properties`, { ...data, isPrimary: true });
    },
    onSuccess: () => {
      setEditProperty(false);
      invalidateDeal();
      toast({ title: "Property details updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const saveControlMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("PATCH", `${apiBase}/projects/${deal.projectId || deal.id}`, data);
    },
    onSuccess: () => {
      invalidateDeal();
      toast({ title: "Deal updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const [pendingProgramId, setPendingProgramId] = useState<number | null | undefined>(undefined);
  const [showProgramConfirm, setShowProgramConfirm] = useState(false);

  const convertProgramMutation = useMutation({
    mutationFn: async (programId: number | null) => {
      return apiRequest("POST", `${apiBase}/projects/${deal.projectId || deal.id}/convert-program`, { programId });
    },
    onSuccess: () => {
      invalidateDeal();
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/deals`, dealId, "documents"] });
      queryClient.invalidateQueries({ queryKey: [`${apiBase}/deals`, dealId, "tasks"] });
      toast({ title: "Loan program updated", description: "Documents and tasks have been synced to the new program." });
    },
    onError: () => toast({ title: "Failed to convert program", variant: "destructive" }),
  });

  const projectId = deal.projectId || deal.id;

  const { data: programsData } = useQuery<any[]>({
    queryKey: ["/api/admin/programs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/programs", { credentials: "include" });
      if (!res.ok) return [];
      const d = await res.json();
      return d.programs || d || [];
    },
  });
  const programs = Array.isArray(programsData) ? programsData : [];

  const { data: dealStatusesData } = useQuery<any[]>({
    queryKey: ["/api/admin/deal-statuses"],
    queryFn: async () => {
      const res = await fetch("/api/admin/deal-statuses", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: assignedProcessors } = useQuery<any[]>({
    queryKey: ["/api/admin/projects", projectId, "processors"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/projects/${projectId}/processors`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: availableProcessors } = useQuery<any[]>({
    queryKey: ["/api/admin/processors"],
    queryFn: async () => {
      const res = await fetch("/api/admin/processors", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addProcessorMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("POST", `/api/admin/projects/${projectId}/processors`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "processors"] });
      toast({ title: "Processor assigned" });
    },
    onError: () => toast({ title: "Failed to assign processor", variant: "destructive" }),
  });

  const removeProcessorMutation = useMutation({
    mutationFn: async (processorId: number) => {
      return apiRequest("DELETE", `/api/admin/projects/${projectId}/processors/${processorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects", projectId, "processors"] });
      toast({ title: "Processor removed" });
    },
    onError: () => toast({ title: "Failed to remove processor", variant: "destructive" }),
  });

  const rateNum = interestRate && interestRate !== "—" ? String(interestRate).replace("%", "") : "";
  const appData = deal.applicationData || {};

  const quoteFormFields: QuoteFormField[] = deal.quoteFormFields || [];
  const hasProgram = quoteFormFields.length > 0;

  const getFieldsByGroup = (group: string) =>
    quoteFormFields.filter(f => {
      if (f.visible === false || CONTACT_FIELD_KEYS.has(f.fieldKey)) return false;
      const dg = f.displayGroup || 'loan_details';
      if (dg === group) return true;
      if (dg === 'application_details' && group === 'loan_details') return true;
      return false;
    });

  const getFieldValue = (fieldKey: string): any => {
    if (deal[fieldKey] !== undefined && deal[fieldKey] !== null) return deal[fieldKey];
    if (appData[fieldKey] !== undefined && appData[fieldKey] !== null) return appData[fieldKey];
    if (deal.loanData?.[fieldKey] !== undefined && deal.loanData?.[fieldKey] !== null) return deal.loanData[fieldKey];
    return null;
  };

  const buildLockedLoanFields = (): { label: string; value: string; tooltip?: string; key: string }[] => {
    const fields: { label: string; value: string; tooltip?: string; key: string }[] = [];

    fields.push({ key: 'interestRate', label: "Interest Rate", value: rateDisplay });
    fields.push({ key: 'ltv', label: "LTV", value: calculatedLtv ? `${calculatedLtv}%` : "—", tooltip: "Loan-to-Value ratio — auto-calculated as Loan Amount / Property Value" });

    if (isAdmin) {
      fields.push({ key: 'ysp', label: "YSP", value: yspValue != null ? `${yspValue}%` : "—", tooltip: "Yield Spread Premium — visible to lender admins only" });
      fields.push({ key: 'lenderOriginationPoints', label: "Lender Origination Points", value: lenderPts != null ? `${lenderPts}%` : "—" });
      fields.push({ key: 'brokerOriginationPoints', label: "Broker Origination Points", value: brokerPts != null ? `${brokerPts}%` : "—" });
    } else {
      fields.push({
        key: 'originationPoints',
        label: "Origination Points",
        value: (lenderPts != null || brokerPts != null)
          ? `${((Number(lenderPts) || 0) + (Number(brokerPts) || 0)).toFixed(2)}%`
          : "—"
      });
    }

    fields.push({ key: 'brokerName', label: "Broker Name", value: brokerNameVal || "—" });
    fields.push({ key: 'term', label: "Term", value: termDisplay });
    fields.push({ key: 'holdbackAmount', label: "Holdback Amount", value: isDSCR ? "N/A" : (holdbackAmt != null ? fmt(holdbackAmt) : "—") });

    return fields;
  };

  const buildDynamicLoanFields = (): { label: string; value: string; key: string }[] => {
    if (!hasProgram) {
      return [
        { key: 'loanAmount', label: "Loan Amount", value: fmt(loanAmount) },
        { key: 'prepaymentPenalty', label: "Prepayment Penalty", value: prepayPenalty || "—" },
      ];
    }
    const programLoanFields = getFieldsByGroup('loan_details');
    return programLoanFields
      .filter(f => !LOCKED_LOAN_FIELD_KEYS.has(f.fieldKey))
      .map(f => ({
        key: f.fieldKey,
        label: f.label,
        value: formatFieldValue(getFieldValue(f.fieldKey), f.fieldType),
      }));
  };

  const allLoanFields = [...buildDynamicLoanFields(), ...buildLockedLoanFields()];

  const buildPropertyFields = (): { label: string; value: string; key: string; tooltip?: string }[] => {
    const baseFields: { label: string; value: string; key: string; tooltip?: string }[] = [
      { key: 'address', label: "Address", value: primaryProp?.address || deal.propertyAddress || "—" },
      { key: 'cityState', label: "City / State", value: primaryProp ? [primaryProp.city, primaryProp.state].filter(Boolean).join(", ") || "—" : "—" },
    ];

    if (hasProgram) {
      const programPropertyFields = getFieldsByGroup('property_details');
      const baseKeys = new Set(['address', 'city', 'state', 'cityState']);
      programPropertyFields
        .filter(f => !baseKeys.has(f.fieldKey))
        .forEach(f => {
          let val = getFieldValue(f.fieldKey);
          if (val === null && f.fieldKey === 'propertyType') val = primaryProp?.propertyType || deal.propertyType;
          if (val === null && f.fieldKey === 'grossMonthlyRent') val = primaryProp?.monthlyRent;
          if (val === null && f.fieldKey === 'annualTaxes') val = primaryProp?.annualTaxes;
          if (val === null && f.fieldKey === 'annualInsurance') val = primaryProp?.annualInsurance;
          if (val === null && f.fieldKey === 'propertyUnits') val = primaryProp?.units;
          if (val === null && f.fieldKey === 'propertyValue') val = primaryProp?.estimatedValue;
          baseFields.push({
            key: f.fieldKey,
            label: f.label,
            value: formatFieldValue(val, f.fieldType),
          });
        });
    } else {
      baseFields.push(
        { key: 'propertyType', label: "Property Type", value: primaryProp?.propertyType || deal.propertyType || "—" },
        { key: 'units', label: "Units", value: primaryProp?.units ? String(primaryProp.units) : "—" },
        { key: 'monthlyRent', label: "Monthly Rent", value: fmt(primaryProp?.monthlyRent) },
        { key: 'annualTaxes', label: "Annual Taxes", value: fmt(primaryProp?.annualTaxes) },
        { key: 'annualInsurance', label: "Annual Insurance", value: fmt(primaryProp?.annualInsurance) },
      );
      const noi = primaryProp
        ? ((primaryProp.monthlyRent || 0) * 12 - (primaryProp.annualTaxes || 0) - (primaryProp.annualInsurance || 0))
        : null;
      baseFields.push({ key: 'noi', label: "NOI", value: noi !== null && noi !== 0 ? fmt(noi) : "—", tooltip: "Net Operating Income" });
    }

    return baseFields;
  };

  const buildBorrowerFields = (): { label: string; value: string; key: string }[] => {
    const baseFields: { label: string; value: string; key: string }[] = [
      { key: 'fullName', label: "Full Name", value: deal.borrowerName || `${deal.customerFirstName || ""} ${deal.customerLastName || ""}`.trim() || "—" },
      { key: 'email', label: "Email", value: deal.borrowerEmail || deal.customerEmail || "—" },
      { key: 'phone', label: "Phone", value: deal.borrowerPhone || deal.customerPhone || "—" },
    ];

    if (hasProgram) {
      const programBorrowerFields = getFieldsByGroup('borrower_details');
      const baseKeys = new Set(['firstName', 'lastName', 'email', 'phone', 'address', 'fullName']);
      programBorrowerFields
        .filter(f => !baseKeys.has(f.fieldKey))
        .forEach(f => {
          baseFields.push({
            key: f.fieldKey,
            label: f.label,
            value: formatFieldValue(getFieldValue(f.fieldKey), f.fieldType),
          });
        });

      const memberCount = appData._memberCount || 1;
      const member1Templates = programBorrowerFields.filter(f => f.repeatable && f.repeatGroupKey === 'member' && f.fieldKey.startsWith('member1'));
      for (let m = 2; m <= memberCount; m++) {
        member1Templates.forEach(tmpl => {
          const mKey = tmpl.fieldKey.replace('member1', `member${m}`);
          const mLabel = tmpl.label.replace('Member 1', `Member ${m}`);
          const val = appData[mKey];
          if (val !== undefined && val !== null && val !== '') {
            baseFields.push({
              key: mKey,
              label: mLabel,
              value: formatFieldValue(val, tmpl.fieldType),
            });
          }
        });
      }
    } else {
      baseFields.push(
        { key: 'creditScore', label: "Credit Score", value: appData.creditScore || deal.creditScore || "—" },
        { key: 'employer', label: "Employer", value: appData.employer || appData.employerName || "—" },
        { key: 'title', label: "Title", value: appData.title || appData.borrowerTitle || "—" },
        { key: 'annualIncome', label: "Annual Income", value: appData.annualIncome ? fmt(appData.annualIncome) : "—" },
        { key: 'entityName', label: "Entity Name", value: appData.entityName || "—" },
        { key: 'entityType', label: "Entity Type", value: appData.entityType || "—" },
      );
    }

    return baseFields;
  };

  const propertyFields = buildPropertyFields();
  const borrowerFields = buildBorrowerFields();

  const startEditLoan = () => {
    const form: Record<string, string> = {
      loanAmount: String(loanAmount || ""),
      interestRate: rateNum,
      ysp: String(yspValue ?? ""),
      lenderOriginationPoints: String(lenderPts ?? ""),
      brokerOriginationPoints: String(brokerPts ?? ""),
      brokerName: brokerNameVal,
      loanTermMonths: (() => {
        const raw = String(termMonths || "");
        const digits = raw.replace(/\D/g, "");
        return digits || "";
      })(),
      prepaymentPenalty: prepayPenalty || "",
      holdbackAmount: String(holdbackAmt ?? ""),
    };
    if (hasProgram) {
      const programLoanFields = getFieldsByGroup('loan_details');
      programLoanFields
        .filter(f => !LOCKED_LOAN_FIELD_KEYS.has(f.fieldKey))
        .forEach(f => {
          form[f.fieldKey] = String(getFieldValue(f.fieldKey) ?? "");
        });
    }
    setLoanForm(form);
    setEditLoan(true);
  };

  const startEditBorrower = () => {
    const form: Record<string, string> = {
      fullName: deal.borrowerName || `${deal.customerFirstName || ""} ${deal.customerLastName || ""}`.trim(),
      email: deal.borrowerEmail || deal.customerEmail || "",
      phone: deal.borrowerPhone || deal.customerPhone || "",
    };
    if (hasProgram) {
      const programBorrowerFields = getFieldsByGroup('borrower_details');
      const baseKeys = new Set(['firstName', 'lastName', 'email', 'phone', 'address', 'fullName']);
      programBorrowerFields
        .filter(f => !baseKeys.has(f.fieldKey))
        .forEach(f => {
          form[f.fieldKey] = String(getFieldValue(f.fieldKey) ?? "");
        });
    }
    setBorrowerForm(form);
    setEditBorrower(true);
  };

  const startEditProperty = () => {
    const form: Record<string, string> = {
      address: primaryProp?.address || deal.propertyAddress || "",
      city: primaryProp?.city || "",
      state: primaryProp?.state || "",
      propertyType: primaryProp?.propertyType || deal.propertyType || "",
      units: String(primaryProp?.units || ""),
      monthlyRent: String(primaryProp?.monthlyRent || ""),
      annualTaxes: String(primaryProp?.annualTaxes || ""),
      annualInsurance: String(primaryProp?.annualInsurance || ""),
      estimatedValue: String(primaryProp?.estimatedValue || ""),
    };
    if (hasProgram) {
      const programPropertyFields = getFieldsByGroup('property_details');
      const baseKeys = new Set(['address', 'city', 'state', 'cityState', 'propertyType', 'units', 'monthlyRent', 'annualTaxes', 'annualInsurance', 'estimatedValue', 'grossMonthlyRent', 'propertyUnits', 'propertyValue']);
      programPropertyFields
        .filter(f => !baseKeys.has(f.fieldKey))
        .forEach(f => {
          form[f.fieldKey] = String(getFieldValue(f.fieldKey) ?? "");
        });
    }
    setPropForm(form);
    setEditProperty(true);
  };

  const defaultStageOptions = [
    { value: "application", label: "Application" },
    { value: "intake", label: "Intake" },
    { value: "processing", label: "Processing" },
    { value: "underwriting", label: "Underwriting" },
    { value: "approval", label: "Approval" },
    { value: "closing", label: "Closing" },
    { value: "funded", label: "Funded" },
    { value: "documentation", label: "Documentation" },
  ];

  const stageOptions = (programStages && programStages.length > 0)
    ? programStages.map((s: any) => ({
        value: s.stepKey || s.key || s.label?.toLowerCase().replace(/\s+/g, "_") || `stage-${s.id}`,
        label: s.stepName || s.name || s.label || s.stageName || `Stage ${s.id}`,
      }))
    : defaultStageOptions;

  const defaultStatusOptions = [
    { value: "active", label: "Active" },
    { value: "on_hold", label: "On Hold" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "funded", label: "Funded" },
  ];

  const configuredStatuses = Array.isArray(dealStatusesData) ? dealStatusesData : [];
  const statusOptions = configuredStatuses.length > 0
    ? configuredStatuses.filter((s: any) => s.isActive !== false).map((s: any) => ({
        value: s.key,
        label: s.label,
      }))
    : defaultStatusOptions;

  const assignedIds = new Set((assignedProcessors || []).map((p: any) => p.userId));
  const unassignedProcessors = (availableProcessors || []).filter((u: any) => !assignedIds.has(u.id));

  const handleProgramChange = (v: string) => {
    const newProgramId = v === "none" ? null : Number(v);
    setPendingProgramId(newProgramId);
    setShowProgramConfirm(true);
  };

  const confirmProgramChange = () => {
    if (pendingProgramId !== undefined) {
      convertProgramMutation.mutate(pendingProgramId);
    }
    setShowProgramConfirm(false);
    setPendingProgramId(undefined);
  };

  const cancelProgramChange = () => {
    setShowProgramConfirm(false);
    setPendingProgramId(undefined);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        {/* Left column: Borrower Details + Property Details */}
        <div className="flex flex-col gap-5">
          {/* Borrower Details */}
          <Card>
            <CardHeader className="pb-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[22px] flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                Borrower Details
              </CardTitle>
              {!editBorrower ? (
                <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7" onClick={startEditBorrower} data-testid="button-edit-borrower">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditBorrower(false)} data-testid="button-cancel-borrower">Cancel</Button>
                  <Button size="sm" className="text-xs h-7" disabled={saveBorrowerMutation.isPending} data-testid="button-save-borrower" onClick={() => {
                    const staticFields = ['fullName', 'email', 'phone'];
                    const appDataUpdates: Record<string, any> = {};
                    Object.entries(borrowerForm).forEach(([k, v]) => {
                      if (!staticFields.includes(k)) appDataUpdates[k] = v || null;
                    });
                    saveBorrowerMutation.mutate({
                      borrowerName: borrowerForm.fullName,
                      borrowerEmail: borrowerForm.email,
                      borrowerPhone: borrowerForm.phone,
                    });
                    if (Object.keys(appDataUpdates).length > 0) {
                      saveLoanMutation.mutate({ applicationData: appDataUpdates });
                    }
                  }}>
                    {saveBorrowerMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <div className="mx-6 mt-2 mb-3 border-b border-muted" />
            <CardContent>
              {!editBorrower ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  {borrowerFields.map(f => (
                    <Field key={f.key} label={f.label} value={f.value} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  <EditField label="Full Name" value={borrowerForm.fullName} onChange={(v) => setBorrowerForm({ ...borrowerForm, fullName: v })} />
                  <EditField label="Email" value={borrowerForm.email} onChange={(v) => setBorrowerForm({ ...borrowerForm, email: v })} type="email" />
                  <EditField label="Phone" value={borrowerForm.phone} onChange={(v) => setBorrowerForm({ ...borrowerForm, phone: formatPhoneNumber(v) })} type="tel" />
                  {hasProgram && (() => {
                    const programBorrowerFields = getFieldsByGroup('borrower_details');
                    const baseKeys = new Set(['firstName', 'lastName', 'email', 'phone', 'address', 'fullName']);
                    return programBorrowerFields
                      .filter(f => !baseKeys.has(f.fieldKey))
                      .map(f => (
                        <DynamicEditField
                          key={f.fieldKey}
                          field={f}
                          value={borrowerForm[f.fieldKey] || ""}
                          onChange={(v) => setBorrowerForm({ ...borrowerForm, [f.fieldKey]: v })}
                        />
                      ));
                  })()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Property Details */}
          <Card>
            <CardHeader className="pb-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[22px] flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Property Details
              </CardTitle>
              <div className="flex gap-1">
                {!editProperty ? (
                  <>
                    <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7" onClick={startEditProperty} data-testid="button-edit-property">
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7" data-testid="button-add-property">
                      <Plus className="h-3 w-3" /> Add Property
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditProperty(false)} data-testid="button-cancel-property">Cancel</Button>
                    <Button size="sm" className="text-xs h-7" disabled={savePropertyMutation.isPending} data-testid="button-save-property" onClick={() => {
                      const staticPropKeys = new Set(['address', 'city', 'state', 'propertyType', 'units', 'monthlyRent', 'annualTaxes', 'annualInsurance', 'estimatedValue']);
                      const appDataUpdates: Record<string, any> = {};
                      Object.entries(propForm).forEach(([k, v]) => {
                        if (!staticPropKeys.has(k)) appDataUpdates[k] = v || null;
                      });
                      savePropertyMutation.mutate({
                        address: propForm.address,
                        city: propForm.city,
                        state: propForm.state,
                        propertyType: propForm.propertyType,
                        units: propForm.units ? Number(propForm.units) : null,
                        monthlyRent: propForm.monthlyRent ? Number(propForm.monthlyRent) : null,
                        annualTaxes: propForm.annualTaxes ? Number(propForm.annualTaxes) : null,
                        annualInsurance: propForm.annualInsurance ? Number(propForm.annualInsurance) : null,
                        estimatedValue: propForm.estimatedValue ? Number(propForm.estimatedValue) : null,
                      });
                      if (Object.keys(appDataUpdates).length > 0) {
                        saveLoanMutation.mutate({ applicationData: appDataUpdates });
                      }
                    }}>
                      {savePropertyMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <div className="mx-6 mt-2 mb-3 border-b border-muted" />
            <CardContent>
              {!editProperty ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  {propertyFields.map(f => (
                    <Field key={f.key} label={f.label} value={f.value} tooltip={f.tooltip} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  <EditField label="Address" value={propForm.address} onChange={(v) => setPropForm({ ...propForm, address: v })} />
                  <div className="grid grid-cols-2 gap-2">
                    <EditField label="City" value={propForm.city} onChange={(v) => setPropForm({ ...propForm, city: v })} />
                    <EditField label="State" value={propForm.state} onChange={(v) => setPropForm({ ...propForm, state: v })} />
                  </div>
                  {!hasProgram ? (
                    <>
                      <EditField label="Property Type" value={propForm.propertyType} onChange={(v) => setPropForm({ ...propForm, propertyType: v })} />
                      <EditField label="Units" value={propForm.units} onChange={(v) => setPropForm({ ...propForm, units: v })} type="number" />
                      <EditField label="Monthly Rent" value={propForm.monthlyRent} onChange={(v) => setPropForm({ ...propForm, monthlyRent: v })} type="number" />
                      <EditField label="Annual Taxes" value={propForm.annualTaxes} onChange={(v) => setPropForm({ ...propForm, annualTaxes: v })} type="number" />
                      <EditField label="Annual Insurance" value={propForm.annualInsurance} onChange={(v) => setPropForm({ ...propForm, annualInsurance: v })} type="number" />
                      <EditField label="Estimated Value" value={propForm.estimatedValue} onChange={(v) => setPropForm({ ...propForm, estimatedValue: v })} type="number" />
                    </>
                  ) : (() => {
                    const programPropertyFields = getFieldsByGroup('property_details');
                    const baseKeys = new Set(['address', 'city', 'state', 'cityState']);
                    return programPropertyFields
                      .filter(f => !baseKeys.has(f.fieldKey))
                      .map(f => {
                        const mapKey = f.fieldKey === 'grossMonthlyRent' ? 'monthlyRent'
                          : f.fieldKey === 'propertyUnits' ? 'units'
                          : f.fieldKey === 'propertyValue' ? 'estimatedValue'
                          : f.fieldKey;
                        const formKey = propForm[f.fieldKey] !== undefined ? f.fieldKey : mapKey;
                        return (
                          <DynamicEditField
                            key={f.fieldKey}
                            field={f}
                            value={propForm[formKey] || ""}
                            onChange={(v) => setPropForm({ ...propForm, [formKey]: v })}
                          />
                        );
                      });
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Loan Details */}
        <Card>
          <CardHeader className="pb-0 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[22px] flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              Loan Details
            </CardTitle>
            {!editLoan ? (
              <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7" onClick={startEditLoan} data-testid="button-edit-loan">
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditLoan(false)} data-testid="button-cancel-loan">Cancel</Button>
                <Button size="sm" className="text-xs h-7" disabled={saveLoanMutation.isPending} data-testid="button-save-loan" onClick={() => {
                  const termVal = loanForm.loanTermMonths ? parseInt(loanForm.loanTermMonths.replace(/\D/g, ""), 10) : null;
                  const staticLoanKeys = new Set(['loanAmount', 'interestRate', 'loanTermMonths', 'ysp', 'lenderOriginationPoints', 'brokerOriginationPoints', 'brokerName', 'prepaymentPenalty', 'holdbackAmount']);
                  const appDataUpdates: Record<string, any> = {};
                  Object.entries(loanForm).forEach(([k, v]) => {
                    if (!staticLoanKeys.has(k)) appDataUpdates[k] = v || null;
                  });
                  saveLoanMutation.mutate({
                    loanAmount: loanForm.loanAmount ? Number(loanForm.loanAmount) : null,
                    interestRate: loanForm.interestRate ? Number(loanForm.interestRate) : null,
                    loanTermMonths: !isNaN(termVal as number) ? termVal : null,
                    ysp: loanForm.ysp ? Number(loanForm.ysp) : null,
                    lenderOriginationPoints: loanForm.lenderOriginationPoints ? Number(loanForm.lenderOriginationPoints) : null,
                    brokerOriginationPoints: loanForm.brokerOriginationPoints ? Number(loanForm.brokerOriginationPoints) : null,
                    brokerName: loanForm.brokerName || null,
                    prepaymentPenalty: loanForm.prepaymentPenalty || null,
                    holdbackAmount: loanForm.holdbackAmount ? Number(loanForm.holdbackAmount) : null,
                    ...(Object.keys(appDataUpdates).length > 0 ? { applicationData: appDataUpdates } : {}),
                  });
                }}>
                  {saveLoanMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </CardHeader>
          <div className="mx-6 mt-2 mb-3 border-b border-muted" />
          <CardContent>
            {!editLoan ? (
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                {allLoanFields.map(f => (
                  <Field key={f.key} label={f.label} value={f.value} tooltip={f.tooltip} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                {hasProgram ? (() => {
                  const programLoanFields = getFieldsByGroup('loan_details');
                  return programLoanFields
                    .filter(f => !LOCKED_LOAN_FIELD_KEYS.has(f.fieldKey))
                    .map(f => (
                      <DynamicEditField
                        key={f.fieldKey}
                        field={f}
                        value={loanForm[f.fieldKey] || ""}
                        onChange={(v) => setLoanForm({ ...loanForm, [f.fieldKey]: v })}
                      />
                    ));
                })() : (
                  <EditField label="Loan Amount" value={loanForm.loanAmount} onChange={(v) => setLoanForm({ ...loanForm, loanAmount: v })} type="number" />
                )}
                <Field label="LTV" value={
                  loanForm.loanAmount && propertyValue && Number(propertyValue) > 0
                    ? `${((Number(loanForm.loanAmount) / Number(propertyValue)) * 100).toFixed(1)}%`
                    : (calculatedLtv ? `${calculatedLtv}%` : "—")
                } tooltip="Auto-calculated from Loan Amount / Property Value" />
                <EditField label="Interest Rate %" value={loanForm.interestRate} onChange={(v) => setLoanForm({ ...loanForm, interestRate: v })} type="number" />
                {isAdmin && (
                  <EditField label="YSP %" value={loanForm.ysp} onChange={(v) => setLoanForm({ ...loanForm, ysp: v })} type="number" />
                )}
                {isAdmin ? (
                  <>
                    <EditField label="Lender Origination Points %" value={loanForm.lenderOriginationPoints} onChange={(v) => setLoanForm({ ...loanForm, lenderOriginationPoints: v })} type="number" />
                    <EditField label="Broker Origination Points %" value={loanForm.brokerOriginationPoints} onChange={(v) => setLoanForm({ ...loanForm, brokerOriginationPoints: v })} type="number" />
                  </>
                ) : (
                  <Field label="Origination Points" value={
                    (lenderPts != null || brokerPts != null)
                      ? `${((Number(lenderPts) || 0) + (Number(brokerPts) || 0)).toFixed(2)}%`
                      : "—"
                  } />
                )}
                <EditField label="Broker Name" value={loanForm.brokerName} onChange={(v) => setLoanForm({ ...loanForm, brokerName: v })} />
                <SelectField label="Term" value={loanForm.loanTermMonths} onChange={(v) => setLoanForm({ ...loanForm, loanTermMonths: v })} options={termOptions} />
                <SelectField label="Prepayment Penalty" value={loanForm.prepaymentPenalty} onChange={(v) => setLoanForm({ ...loanForm, prepaymentPenalty: v })} options={prepayOptions} />
                {isRTL ? (
                  <EditField label="Holdback Amount" value={loanForm.holdbackAmount} onChange={(v) => setLoanForm({ ...loanForm, holdbackAmount: v })} type="number" />
                ) : (
                  <Field label="Holdback Amount" value="N/A" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deal Controls - full width below */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-[22px] flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            Deal Controls
          </CardTitle>
        </CardHeader>
        <div className="mx-6 mt-2 mb-3 border-b border-muted" />
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4">
            <div>
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Deal Status</span>
              <Select
                value={deal.projectStatus || deal.status || "active"}
                onValueChange={(v) => saveControlMutation.mutate({ status: v })}
              >
                <SelectTrigger className="h-9 mt-1 text-[16px]" data-testid="select-deal-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Current Stage</span>
              <Select
                value={deal.stage || deal.currentStage || "application"}
                onValueChange={(v) => saveControlMutation.mutate({ currentStage: v })}
              >
                <SelectTrigger className="h-9 mt-1 text-[16px]" data-testid="select-current-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Loan Program</span>
              <Select
                value={deal.programId ? String(deal.programId) : "none"}
                onValueChange={handleProgramChange}
                disabled={convertProgramMutation.isPending || !isAdmin}
              >
                <SelectTrigger className="h-9 mt-1 text-[16px]" data-testid="select-loan-program">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Program</SelectItem>
                  {programs.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Created</span>
              <p className="text-[17px] font-bold mt-2.5">{fmtDate(deal.createdAt)}</p>
            </div>

            <div className="col-span-2 md:col-span-4">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Processors</span>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {(assignedProcessors || []).map((p: any) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[13px] font-medium border border-blue-200"
                    data-testid={`processor-badge-${p.userId}`}
                  >
                    {p.user?.fullName || p.user?.email || `User ${p.userId}`}
                    {isAdmin && (
                      <button
                        onClick={() => removeProcessorMutation.mutate(p.id)}
                        className="ml-0.5 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                        data-testid={`remove-processor-${p.userId}`}
                        disabled={removeProcessorMutation.isPending}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {isAdmin && unassignedProcessors.length > 0 && (
                  <Select
                    onValueChange={(v) => addProcessorMutation.mutate(Number(v))}
                    value=""
                  >
                    <SelectTrigger
                      className="h-8 w-[200px] text-[13px] border-dashed"
                      data-testid="select-add-processor"
                    >
                      <SelectValue placeholder="Add processor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unassignedProcessors.map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.fullName || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(!assignedProcessors || assignedProcessors.length === 0) && unassignedProcessors.length === 0 && (
                  <span className="text-[14px] text-muted-foreground">No processors available</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showProgramConfirm} onOpenChange={setShowProgramConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Loan Program?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the loan program will rebuild this deal's pipeline, including stages, document requirements, and tasks.
              Uploaded documents will be preserved, but the checklist structure will be replaced with the new program's template.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelProgramChange} data-testid="cancel-program-change">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmProgramChange}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-program-change"
            >
              Confirm Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

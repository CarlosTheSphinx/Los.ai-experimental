import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pencil, Building2, User, Plus, DollarSign
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
  conditionalOn?: string;
  conditionalValue?: string;
};

const LOCKED_LOAN_FIELD_KEYS = new Set([
  'ltv', 'dscr', 'ysp', 'lenderOriginationPoints', 'brokerOriginationPoints',
  'interestRate', 'brokerName', 'holdbackAmount', 'loanTermMonths', 'term',
  'targetCloseDate',
]);

const CONTACT_FIELD_KEYS = new Set(['firstName', 'lastName', 'email', 'phone', 'address']);

const PROPERTY_TYPE_OPTIONS = [
  { value: "SINGLE_FAMILY_RESIDENCE", label: "Single Family Residence" },
  { value: "TWO_FOUR_UNIT", label: "2-4 Unit" },
  { value: "MULTIFAMILY", label: "Multifamily (5+ Units)" },
  { value: "RENTAL_PORTFOLIO", label: "Rental Portfolio" },
  { value: "MIXED_USE", label: "Mixed-Use" },
  { value: "INFILL_LOT", label: "Infill Lot" },
  { value: "LAND", label: "Land" },
  { value: "OFFICE", label: "Office" },
  { value: "RETAIL", label: "Retail" },
  { value: "HOSPITALITY", label: "Hospitality" },
  { value: "INDUSTRIAL", label: "Industrial" },
  { value: "MEDICAL", label: "Medical" },
  { value: "AGRICULTURAL", label: "Agricultural" },
  { value: "SPECIAL_PURPOSE", label: "Special Purpose" },
];

function fmt(amount: number | string | undefined | null): string {
  if (amount === null || amount === undefined || amount === "" || amount === "—") return "—";
  const n = typeof amount === "string" ? parseFloat(amount.replace(/[^0-9.-]/g, "")) : amount;
  if (isNaN(n)) return "—";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

function PropertyTypeSelectField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-[16px] mt-0.5" data-testid="select-property-type">
          <SelectValue placeholder="Select property type" />
        </SelectTrigger>
        <SelectContent>
          {PROPERTY_TYPE_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value} data-testid={`select-property-type-${opt.value.toLowerCase()}`}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
}: {
  deal: any;
  properties: any[];
  dealId: string;
  isAdmin?: boolean;
}) {
  const { toast } = useToast();
  const apiBase = "/api/admin";

  const primaryProp = properties?.find((p: any) => p.isPrimary) || properties?.[0];

  const allProps = properties || [];
  const totalPropertyValue = allProps.length > 0
    ? allProps.reduce((sum: number, p: any) => sum + (Number(p.estimatedValue) || 0), 0)
    : null;
  const totalMonthlyRent = allProps.reduce((sum: number, p: any) => sum + (Number(p.monthlyRent) || 0), 0);
  const totalAnnualTaxes = allProps.reduce((sum: number, p: any) => sum + (Number(p.annualTaxes) || 0), 0);
  const totalAnnualInsurance = allProps.reduce((sum: number, p: any) => sum + (Number(p.annualInsurance) || 0), 0);

  const propertyValue = (totalPropertyValue && totalPropertyValue > 0)
    ? totalPropertyValue
    : (deal.propertyValue || deal.applicationData?.propertyValue || primaryProp?.estimatedValue || deal.loanData?.propertyValue);
  const loanAmount = deal.loanAmount || deal.loanData?.loanAmount;
  const interestRate = deal.interestRate;
  const termMonths = deal.termMonths || deal.loanTermMonths || deal.loanData?.loanTerm;
  const loanType = deal.loanType || deal.loanData?.loanType || "";
  const isDSCR = loanType.toLowerCase().includes("dscr");
  const isRTL = !isDSCR;

  const calculatedLtv = (loanAmount && propertyValue && Number(propertyValue) > 0)
    ? ((Number(loanAmount) / Number(propertyValue)) * 100).toFixed(1)
    : null;

  const calculatedDscr = (() => {
    const loan = Number(loanAmount) || 0;
    if (loan <= 0) return null;
    const noi = (totalMonthlyRent * 12) - totalAnnualTaxes - totalAnnualInsurance;
    if (noi <= 0) return null;
    const rateStr = String(interestRate || "").replace("%", "");
    const annualRate = Number(rateStr) || 0;
    if (annualRate <= 0) return null;
    const monthlyRate = annualRate / 100 / 12;
    const n = 360;
    const monthlyPayment = loan * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    const annualDebtService = monthlyPayment * 12;
    if (annualDebtService <= 0) return null;
    return (noi / annualDebtService).toFixed(2);
  })();

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

  const [showAddProperty, setShowAddProperty] = useState(false);
  const [newPropForm, setNewPropForm] = useState<Record<string, string>>({
    address: "", city: "", state: "", propertyType: "", units: "",
    monthlyRent: "", annualTaxes: "", annualInsurance: "", estimatedValue: "",
  });

  const invalidateDeal = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
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

  const addPropertyMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("POST", `${apiBase}/deals/${dealId}/properties`, data);
    },
    onSuccess: () => {
      setShowAddProperty(false);
      setNewPropForm({ address: "", city: "", state: "", propertyType: "", units: "", monthlyRent: "", annualTaxes: "", annualInsurance: "", estimatedValue: "" });
      invalidateDeal();
      toast({ title: "Property added" });
    },
    onError: () => toast({ title: "Failed to add property", variant: "destructive" }),
  });

  const rateNum = interestRate && interestRate !== "—" ? String(interestRate).replace("%", "") : "";
  const appData = deal.applicationData || {};

  const quoteFormFields: QuoteFormField[] = deal.quoteFormFields || [];
  const hasProgram = quoteFormFields.length > 0;

  const isConditionMet = (f: QuoteFormField): boolean => {
    if (!f.conditionalOn) return true;
    const watchedVal = getFieldValue(f.conditionalOn);
    if (f.conditionalValue) {
      return String(watchedVal || '').toLowerCase() === String(f.conditionalValue).toLowerCase();
    }
    return !!watchedVal;
  };

  const getFieldsByGroup = (group: string) =>
    quoteFormFields.filter(f => {
      if (f.visible === false || CONTACT_FIELD_KEYS.has(f.fieldKey)) return false;
      if (!isConditionMet(f)) return false;
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
    fields.push({ key: 'ltv', label: "LTV", value: calculatedLtv ? `${calculatedLtv}%` : "—", tooltip: "Auto-calculated: Loan Amount ÷ Total Property Value" });
    fields.push({ key: 'dscr', label: "DSCR", value: calculatedDscr ? `${calculatedDscr}x` : "—", tooltip: "Auto-calculated: NOI ÷ Annual Debt Service (30yr amortization)" });

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

  const allLoanFields = [
    ...buildDynamicLoanFields(),
    ...buildLockedLoanFields(),
    { key: 'targetCloseDate', label: "Estimated Closing Date", value: fmtDate(deal.targetCloseDate) },
  ];

  const buildPropertyFields = (): { label: string; value: string; key: string; tooltip?: string }[] => {
    const baseFields: { label: string; value: string; key: string; tooltip?: string }[] = [];

    if (hasProgram) {
      const programPropertyFields = getFieldsByGroup('property_details');
      programPropertyFields
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
        { key: 'propertyType', label: "Property Type", value: (() => { const raw = primaryProp?.propertyType || deal.propertyType; return PROPERTY_TYPE_OPTIONS.find(o => o.value === raw)?.label || raw || "—"; })() },
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

      const resolvedMemberCount = parseInt(appData.entityMemberCount || appData._memberCount || '1', 10) || 1;
      const member1Templates = programBorrowerFields.filter(f => f.repeatable && f.repeatGroupKey === 'member' && f.fieldKey.startsWith('member1'));
      for (let m = 2; m <= resolvedMemberCount; m++) {
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
      targetCloseDate: (() => {
        if (!deal.targetCloseDate) return "";
        const d = new Date(deal.targetCloseDate);
        return isNaN(d.getTime()) ? "" : d.toISOString().split('T')[0];
      })(),
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

      const resolvedMemberCount = parseInt(appData.entityMemberCount || appData._memberCount || '1', 10) || 1;
      const member1Templates = programBorrowerFields.filter(f => f.repeatable && f.repeatGroupKey === 'member' && f.fieldKey.startsWith('member1'));
      for (let m = 2; m <= resolvedMemberCount; m++) {
        member1Templates.forEach(tmpl => {
          const mKey = tmpl.fieldKey.replace('member1', `member${m}`);
          form[mKey] = String(appData[mKey] ?? "");
        });
      }
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
                    if (borrowerForm.entityMemberCount) {
                      appDataUpdates._memberCount = parseInt(borrowerForm.entityMemberCount, 10) || 1;
                    }
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
                    const member1Fields = programBorrowerFields.filter(f => !baseKeys.has(f.fieldKey));
                    const liveMemberCount = parseInt(borrowerForm.entityMemberCount || appData.entityMemberCount || appData._memberCount || '1', 10) || 1;
                    const member1Templates = programBorrowerFields.filter(f => f.repeatable && f.repeatGroupKey === 'member' && f.fieldKey.startsWith('member1'));

                    const allEditFields: React.ReactNode[] = [];

                    member1Fields.forEach(f => {
                      allEditFields.push(
                        <DynamicEditField
                          key={f.fieldKey}
                          field={f}
                          value={borrowerForm[f.fieldKey] || ""}
                          onChange={(v) => setBorrowerForm(prev => ({ ...prev, [f.fieldKey]: v }))}
                        />
                      );
                    });

                    for (let m = 2; m <= liveMemberCount; m++) {
                      allEditFields.push(
                        <div key={`member-${m}-divider`} className="col-span-2 border-t border-muted pt-2 mt-1">
                          <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Member {m}</span>
                        </div>
                      );
                      member1Templates.forEach(tmpl => {
                        const mKey = tmpl.fieldKey.replace('member1', `member${m}`);
                        const mLabel = tmpl.label.replace('Member 1', `Member ${m}`).replace('member 1', `Member ${m}`);
                        const mField: QuoteFormField = { ...tmpl, fieldKey: mKey, label: mLabel };
                        allEditFields.push(
                          <DynamicEditField
                            key={mKey}
                            field={mField}
                            value={borrowerForm[mKey] || ""}
                            onChange={(v) => setBorrowerForm(prev => ({ ...prev, [mKey]: v }))}
                          />
                        );
                      });
                    }

                    return allEditFields;
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
                    <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7" data-testid="button-add-property" onClick={() => setShowAddProperty(true)}>
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
                      <PropertyTypeSelectField label="Property Type" value={propForm.propertyType} onChange={(v) => setPropForm({ ...propForm, propertyType: v })} />
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

              {(() => {
                const additionalProps = properties?.filter((p: any) => p.id !== primaryProp?.id) || [];
                if (additionalProps.length === 0) return null;
                const getTypeLabel = (val: string) => PROPERTY_TYPE_OPTIONS.find(o => o.value === val)?.label || val || "—";
                return additionalProps.map((prop: any, idx: number) => (
                  <div key={prop.id || idx} data-testid={`additional-property-${prop.id || idx}`}>
                    <div className="border-t border-muted my-4" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Additional Property {idx + 1}</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                      <Field label="Address" value={prop.address || "—"} />
                      <Field label="City / State" value={[prop.city, prop.state].filter(Boolean).join(", ") || "—"} />
                      <Field label="Property Type" value={getTypeLabel(prop.propertyType)} />
                      <Field label="Units" value={prop.units ? String(prop.units) : "—"} />
                      <Field label="Monthly Rent" value={fmt(prop.monthlyRent)} />
                      <Field label="Annual Taxes" value={fmt(prop.annualTaxes)} />
                      <Field label="Annual Insurance" value={fmt(prop.annualInsurance)} />
                      <Field label="Estimated Value" value={fmt(prop.estimatedValue)} />
                    </div>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>

          <Dialog open={showAddProperty} onOpenChange={setShowAddProperty}>
            <DialogContent className="max-w-lg" data-testid="dialog-add-property">
              <DialogHeader>
                <DialogTitle className="text-lg">Add Property</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2">
                <div className="col-span-2">
                  <EditField label="Address" value={newPropForm.address} onChange={(v) => setNewPropForm({ ...newPropForm, address: v })} />
                </div>
                <EditField label="City" value={newPropForm.city} onChange={(v) => setNewPropForm({ ...newPropForm, city: v })} />
                <EditField label="State" value={newPropForm.state} onChange={(v) => setNewPropForm({ ...newPropForm, state: v })} />
                <PropertyTypeSelectField label="Property Type" value={newPropForm.propertyType} onChange={(v) => setNewPropForm({ ...newPropForm, propertyType: v })} />
                <EditField label="Units" value={newPropForm.units} onChange={(v) => setNewPropForm({ ...newPropForm, units: v })} type="number" />
                <EditField label="Monthly Rent" value={newPropForm.monthlyRent} onChange={(v) => setNewPropForm({ ...newPropForm, monthlyRent: v })} type="number" />
                <EditField label="Annual Taxes" value={newPropForm.annualTaxes} onChange={(v) => setNewPropForm({ ...newPropForm, annualTaxes: v })} type="number" />
                <EditField label="Annual Insurance" value={newPropForm.annualInsurance} onChange={(v) => setNewPropForm({ ...newPropForm, annualInsurance: v })} type="number" />
                <EditField label="Estimated Value" value={newPropForm.estimatedValue} onChange={(v) => setNewPropForm({ ...newPropForm, estimatedValue: v })} type="number" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" size="sm" onClick={() => setShowAddProperty(false)} data-testid="button-cancel-add-property">Cancel</Button>
                <Button size="sm" disabled={addPropertyMutation.isPending || !newPropForm.address.trim()} data-testid="button-save-add-property" onClick={() => {
                  addPropertyMutation.mutate({
                    address: newPropForm.address,
                    city: newPropForm.city,
                    state: newPropForm.state,
                    propertyType: newPropForm.propertyType,
                    units: newPropForm.units ? Number(newPropForm.units) : null,
                    monthlyRent: newPropForm.monthlyRent ? Number(newPropForm.monthlyRent) : null,
                    annualTaxes: newPropForm.annualTaxes ? Number(newPropForm.annualTaxes) : null,
                    annualInsurance: newPropForm.annualInsurance ? Number(newPropForm.annualInsurance) : null,
                    estimatedValue: newPropForm.estimatedValue ? Number(newPropForm.estimatedValue) : null,
                  });
                }}>
                  {addPropertyMutation.isPending ? "Adding..." : "Add Property"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Right column: Loan Details + Deal Controls */}
        <div className="flex flex-col gap-5">
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
                  const staticLoanKeys = new Set(['loanAmount', 'interestRate', 'loanTermMonths', 'ysp', 'lenderOriginationPoints', 'brokerOriginationPoints', 'brokerName', 'prepaymentPenalty', 'holdbackAmount', 'targetCloseDate']);
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
                    targetCloseDate: loanForm.targetCloseDate || null,
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
                } tooltip="Auto-calculated: Loan Amount ÷ Total Property Value" />
                <Field label="DSCR" value={(() => {
                  const loan = Number(loanForm.loanAmount) || Number(loanAmount) || 0;
                  if (loan <= 0) return calculatedDscr ? `${calculatedDscr}x` : "—";
                  const noi = (totalMonthlyRent * 12) - totalAnnualTaxes - totalAnnualInsurance;
                  if (noi <= 0) return "—";
                  const rateStr = String(loanForm.interestRate || interestRate || "").replace("%", "");
                  const annualRate = Number(rateStr) || 0;
                  if (annualRate <= 0) return "—";
                  const monthlyRate = annualRate / 100 / 12;
                  const mp = loan * (monthlyRate * Math.pow(1 + monthlyRate, 360)) / (Math.pow(1 + monthlyRate, 360) - 1);
                  return mp > 0 ? `${(noi / (mp * 12)).toFixed(2)}x` : "—";
                })()} tooltip="Auto-calculated: NOI ÷ Annual Debt Service (30yr amortization)" />
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
                <EditField label="Estimated Closing Date" value={loanForm.targetCloseDate} onChange={(v) => setLoanForm({ ...loanForm, targetCloseDate: v })} type="date" />
              </div>
            )}
          </CardContent>
        </Card>

      </div>
      </div>
    </div>
  );
}

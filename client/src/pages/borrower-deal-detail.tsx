import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useState, type ChangeEvent } from "react";
import {
  ArrowLeft, Building2, User, DollarSign, FileText, CheckSquare,
  Upload, Loader2, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp,
  Eye, X, ClipboardEdit, HelpCircle, ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StageProgressBar } from "@/components/ui/phase1/stage-progress-bar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/validation";
import { sortByActionPriority, docActionPriority, taskActionPriority } from "@/lib/utils";

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
    case 'currency': return fmt(value);
    case 'percentage': return `${value}%`;
    case 'yes_no':
    case 'radio': return value === true || value === 'yes' || value === 'Yes' ? 'Yes' : 'No';
    case 'date': return fmtDate(value);
    case 'address': return String(value).replace(/,?\s*United States of America$/i, '');
    default: return String(value);
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <p className="text-[15px] font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function getDocStatusIcon(status: string) {
  switch (status) {
    case 'approved': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'uploaded': case 'submitted': case 'ai_reviewed': return <Clock className="h-4 w-4 text-amber-500" />;
    case 'rejected': return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'waived': case 'not_applicable': return <CheckCircle2 className="h-4 w-4 text-gray-400" />;
    default: return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
  }
}

function getDocStatusLabel(status: string) {
  switch (status) {
    case 'approved': return 'Approved';
    case 'uploaded': case 'submitted': case 'ai_reviewed': return 'Under Review';
    case 'rejected': return 'Needs Revision';
    case 'waived': case 'not_applicable': return 'Not Required';
    default: return 'Pending';
  }
}

const DEFAULT_STAGES = [
  { id: "application", label: "Application" },
  { id: "processing", label: "Processing" },
  { id: "underwriting", label: "Underwriting" },
  { id: "appraisal", label: "Appraisal & Title" },
  { id: "closing", label: "Closing" },
];

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function InlineFormTask({ task, dealId }: { task: any; dealId: string }) {
  const { toast } = useToast();
  const template = task.formTemplate;
  const submission = task.formSubmission;
  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    if (submission?.formData) return { ...submission.formData };
    const init: Record<string, string> = {};
    template?.fields?.forEach((f: any) => { init[f.fieldKey] = ""; });
    return init;
  });

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("POST", `/api/deals/${dealId}/tasks/${task.id}/submit-form`, { formData: data });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Form submitted", description: "Your information has been received." });
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/deals", dealId] });
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  if (!template) return null;

  if (task.status === 'completed' && !submission) return null;

  if (submission && submission.status === "submitted") {
    return (
      <div className="mt-2 ml-7 p-3 rounded-md border border-green-300/30 bg-green-50/50 dark:bg-green-950/20" data-testid={`form-submitted-${task.id}`}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-600">Form Submitted</span>
          {submission.submittedAt && (
            <span className="text-xs text-muted-foreground">
              {formatDateTime(submission.submittedAt)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {template.fields.map((field: any) => (
            <div key={field.fieldKey} className="text-xs">
              <span className="text-muted-foreground">{field.label}:</span>{" "}
              <span className="font-medium">{submission.formData[field.fieldKey] || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 ml-7" data-testid={`form-section-${task.id}`}>
      {!formOpen ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setFormOpen(true)}
          data-testid={`button-form-action-${task.id}`}
        >
          <ClipboardEdit className="h-3.5 w-3.5" />
          Fill Out Form
        </Button>
      ) : (
        <div className="p-4 rounded-md border border-primary/20 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{template.name}</h4>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} data-testid={`button-close-form-${task.id}`}>
              Cancel
            </Button>
          </div>
          {template.description && (
            <p className="text-xs text-muted-foreground">{template.description}</p>
          )}
          <div className="space-y-3">
            {template.fields.map((field: any) => (
              <div key={field.fieldKey}>
                <Label className="text-xs font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                {field.fieldType === "textarea" ? (
                  <Textarea
                    placeholder={field.placeholder || ""}
                    value={formValues[field.fieldKey] || ""}
                    onChange={e => setFormValues(prev => ({ ...prev, [field.fieldKey]: e.target.value }))}
                    className="mt-1"
                    data-testid={`input-form-${field.fieldKey}-${task.id}`}
                  />
                ) : field.fieldType === "select" && field.options ? (
                  <Select
                    value={formValues[field.fieldKey] || ""}
                    onValueChange={val => setFormValues(prev => ({ ...prev, [field.fieldKey]: val }))}
                  >
                    <SelectTrigger className="mt-1" data-testid={`select-form-${field.fieldKey}-${task.id}`}>
                      <SelectValue placeholder={field.placeholder || "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt: string) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.fieldType === "email" ? "email" : field.fieldType === "phone" ? "tel" : "text"}
                    placeholder={field.placeholder || ""}
                    value={formValues[field.fieldKey] || ""}
                    onChange={e => setFormValues(prev => ({ ...prev, [field.fieldKey]: field.fieldType === "phone" ? formatPhoneNumber(e.target.value) : e.target.value }))}
                    className="mt-1"
                    data-testid={`input-form-${field.fieldKey}-${task.id}`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => submitMutation.mutate(formValues)}
              disabled={submitMutation.isPending}
              data-testid={`button-submit-form-${task.id}`}
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BorrowerDealDetail() {
  const [, params] = useRoute("/deals/:id");
  const dealId = params?.id;
  const { toast } = useToast();
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());
  const [previewDoc, setPreviewDoc] = useState<{ name: string; filePath: string; mimeType?: string; docId: number } | null>(null);

  const { data: dealData, isLoading, error: dealError } = useQuery<{
    project: any;
    stages: any[];
    tasks: any[];
    activity: any[];
    documents: any[];
    dealDocuments: any[];
  }>({
    queryKey: ["/api/deals", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deal");
      return res.json();
    },
    enabled: !!dealId,
    retry: 2,
    refetchInterval: 15000,
  });

  const deal = dealData?.project;
  const rawStages = dealData?.stages || [];
  const documents = dealData?.dealDocuments?.length ? dealData.dealDocuments : dealData?.documents || [];
  const stageTasks = rawStages.flatMap((s: any) => (s.tasks || []).filter((t: any) => t.visibleToBorrower));
  const stagelessTasks = (dealData?.tasks || []).filter((t: any) => t.visibleToBorrower);
  const allTasks = [...stageTasks, ...stagelessTasks.filter((st: any) => !stageTasks.some((et: any) => et.id === st.id))];

  const stages = rawStages.length > 0
    ? rawStages.map((s: any, i: number) => ({
        id: s.id || `stage-${i}`,
        label: s.stageName || s.label || `Stage ${i + 1}`,
        completed: s.status === "completed",
        current: s.status === "in_progress" || deal?.currentStage === s.stageKey,
      }))
    : DEFAULT_STAGES.map((s) => ({ ...s, completed: false, current: false }));

  const completedTasks = allTasks.filter((t: any) => t.status === "completed").length;
  const totalTasks = allTasks.length;
  const completedDocs = documents.filter((d: any) => d.status === "approved" || d.status === "uploaded" || d.status === "ai_reviewed" || d.status === "waived" || d.status === "not_applicable").length;
  const totalDocs = documents.length;
  const completedItems = completedTasks + completedDocs;
  const totalItems = totalTasks + totalDocs;

  const appData = deal?.applicationData || {};
  const quoteFormFields = deal?.quoteFormFields || [];
  const hasProgram = quoteFormFields.length > 0;

  const getFieldValue = (fieldKey: string): any => {
    if (deal?.[fieldKey] !== undefined && deal?.[fieldKey] !== null) return deal[fieldKey];
    if (appData[fieldKey] !== undefined && appData[fieldKey] !== null) return appData[fieldKey];
    if (deal?.loanData?.[fieldKey] !== undefined && deal?.loanData?.[fieldKey] !== null) return deal.loanData[fieldKey];
    return null;
  };

  const getFieldsByGroup = (group: string) =>
    quoteFormFields.filter((f: any) => {
      if (f.visible === false) return false;
      const dg = f.displayGroup || 'loan_details';
      if (dg === group) return true;
      if (dg === 'application_details' && group === 'loan_details') return true;
      return false;
    });

  const buildBorrowerFields = () => {
    const fields = [
      { key: 'fullName', label: "Full Name", value: deal?.borrowerName || `${deal?.customerFirstName || ""} ${deal?.customerLastName || ""}`.trim() || "—" },
      { key: 'email', label: "Email", value: deal?.borrowerEmail || deal?.customerEmail || "—" },
      { key: 'phone', label: "Phone", value: deal?.borrowerPhone || deal?.customerPhone || "—" },
    ];
    if (hasProgram) {
      const contactKeys = new Set(['firstName', 'lastName', 'email', 'phone', 'address', 'fullName']);
      getFieldsByGroup('borrower_details')
        .filter((f: any) => !contactKeys.has(f.fieldKey))
        .forEach((f: any) => {
          fields.push({ key: f.fieldKey, label: f.label, value: formatFieldValue(getFieldValue(f.fieldKey), f.fieldType) });
        });
    } else {
      fields.push(
        { key: 'creditScore', label: "Credit Score", value: appData.creditScore || deal?.creditScore || "—" },
        { key: 'entityName', label: "Entity Name", value: appData.entityName || "—" },
        { key: 'entityType', label: "Entity Type", value: appData.entityType || "—" },
      );
    }
    return fields;
  };

  const buildPropertyFields = () => {
    const fields = [
      { key: 'address', label: "Address", value: deal?.propertyAddress || "—" },
      { key: 'propertyType', label: "Property Type", value: deal?.propertyType || appData.propertyType || "—" },
    ];
    if (hasProgram) {
      const baseKeys = new Set(['address', 'city', 'state', 'cityState', 'propertyType']);
      getFieldsByGroup('property_details')
        .filter((f: any) => !baseKeys.has(f.fieldKey))
        .forEach((f: any) => {
          fields.push({ key: f.fieldKey, label: f.label, value: formatFieldValue(getFieldValue(f.fieldKey), f.fieldType) });
        });
    }
    return fields;
  };

  const buildLoanFields = () => {
    const loanAmount = deal?.loanAmount || deal?.loanData?.loanAmount;
    const interestRate = deal?.interestRate;
    const termMonths = deal?.termMonths || deal?.loanTermMonths || deal?.loanData?.loanTerm;
    const propertyValue = deal?.propertyValue || appData.propertyValue || deal?.loanData?.propertyValue;
    const calculatedLtv = (loanAmount && propertyValue && Number(propertyValue) > 0)
      ? ((Number(loanAmount) / Number(propertyValue)) * 100).toFixed(1) : null;
    const rateDisplay = interestRate && interestRate !== "—"
      ? (String(interestRate).includes("%") ? interestRate : `${Number(interestRate).toFixed(3)}%`) : "—";
    const lenderPts = deal?.lenderOriginationPoints ?? appData.originationPoints;
    const brokerPts = deal?.brokerOriginationPoints ?? appData.brokerPointsCharged;
    const totalPts = (lenderPts != null || brokerPts != null)
      ? `${((Number(lenderPts) || 0) + (Number(brokerPts) || 0)).toFixed(2)}%` : "—";

    const fields = [
      { key: 'loanAmount', label: "Loan Amount", value: fmt(loanAmount) },
      { key: 'interestRate', label: "Interest Rate", value: rateDisplay },
      { key: 'ltv', label: "LTV", value: calculatedLtv ? `${calculatedLtv}%` : "—" },
      { key: 'originationPoints', label: "Origination Points", value: totalPts },
      { key: 'term', label: "Term", value: termMonths ? `${termMonths} months` : "—" },
      { key: 'targetCloseDate', label: "Estimated Closing", value: fmtDate(deal?.targetCloseDate) },
    ];

    if (hasProgram) {
      const lockedKeys = new Set(['ltv', 'ysp', 'lenderOriginationPoints', 'brokerOriginationPoints', 'interestRate', 'brokerName', 'holdbackAmount', 'loanTermMonths', 'term', 'targetCloseDate']);
      const contactKeys = new Set(['firstName', 'lastName', 'email', 'phone', 'address']);
      getFieldsByGroup('loan_details')
        .filter((f: any) => !lockedKeys.has(f.fieldKey) && !contactKeys.has(f.fieldKey) && f.fieldKey !== 'loanAmount')
        .forEach((f: any) => {
          fields.push({ key: f.fieldKey, label: f.label, value: formatFieldValue(getFieldValue(f.fieldKey), f.fieldType) });
        });
    }
    return fields;
  };

  const handleFileUpload = async (docId: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocId(docId);
    try {
      const urlRes = await apiRequest("POST", `/api/deals/${dealId}/documents/upload-url`, {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const urlData = await urlRes.json();
      if (urlData.uploadURL) {
        let uploadRes: Response;
        if (urlData.useDirectUpload || urlData.uploadURL.startsWith('/api/')) {
          const formData = new FormData();
          formData.append('file', file);
          uploadRes = await fetch(urlData.uploadURL, { method: 'POST', body: formData, credentials: 'include' });
        } else {
          uploadRes = await fetch(urlData.uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        }
        if (!uploadRes.ok) throw new Error('File upload failed');
      }
      await apiRequest("POST", `/api/deals/${dealId}/deal-documents/${docId}/upload-complete`, {
        objectPath: urlData.objectPath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/deals", dealId] });
      toast({ title: "Document uploaded successfully" });
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast({ title: "Upload failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setUploadingDocId(null);
      e.target.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold mb-2">{dealError ? "Failed to load loan" : "Loan not found"}</h2>
        <p className="text-muted-foreground text-sm mb-4">
          {dealError ? "There was an error loading this loan." : "This loan may not be available."}
        </p>
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-back-to-loans">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to My Loans
          </Button>
        </Link>
      </div>
    );
  }

  const borrowerFields = buildBorrowerFields();
  const propertyFields = buildPropertyFields();
  const loanFields = buildLoanFields();
  const borrowerTasks = allTasks.filter((t: any) => t.borrowerActionRequired || t.assignedTo === 'borrower');
  const pendingDocs = documents.filter((d: any) => d.status === 'pending' || d.status === 'rejected');


  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] text-muted-foreground font-medium" data-testid="text-loan-number">
              {deal.loanNumber || `Loan #${deal.id}`}
            </span>
            <Badge
              variant={deal.status === 'active' ? 'default' : 'secondary'}
              className={deal.status === 'active' ? 'bg-emerald-600' : ''}
              data-testid="badge-status"
            >
              {deal.status === 'active' ? 'In Progress' : deal.status === 'completed' ? 'Completed' : deal.status}
            </Badge>
          </div>
          <h1 className="text-xl font-bold truncate" data-testid="text-deal-title">
            {deal.projectName || deal.propertyAddress || `Loan #${deal.id}`}
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="text-deal-subtitle">
            {[deal.programName, deal.loanType, deal.propertyAddress?.replace(/,?\s*United States of America$/i, '')].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <StageProgressBar
        stages={stages}
        completedItems={completedItems}
        totalItems={totalItems}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="overflow-hidden" data-testid="card-loan-overview">
          <div className="w-full flex items-center justify-between px-5 py-3" data-testid="header-overview">
            <CardTitle className="text-[18px] flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Loan Overview
            </CardTitle>
          </div>
          <CardContent className="pt-0 pb-5">
              <div className="border-t mb-4" />
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[14px] font-bold uppercase tracking-wider text-muted-foreground">Borrower Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {borrowerFields.map(f => <Field key={f.key} label={f.label} value={f.value} />)}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[14px] font-bold uppercase tracking-wider text-muted-foreground">Property Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {propertyFields.map(f => <Field key={f.key} label={f.label} value={f.value} />)}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[14px] font-bold uppercase tracking-wider text-muted-foreground">Loan Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {loanFields.map(f => <Field key={f.key} label={f.label} value={f.value} />)}
                  </div>
                </div>
              </div>
            </CardContent>
        </Card>

        <Card className="overflow-hidden" data-testid="card-borrower-checklist">
          <div className="w-full flex items-center justify-between px-5 py-3" data-testid="header-checklist">
            <CardTitle className="text-[18px] flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Borrower Checklist
              {(borrowerTasks.filter((t: any) => t.status !== 'completed').length + pendingDocs.length) > 0 && (
                <Badge variant="destructive" className="text-[11px] h-5 px-1.5">
                  {borrowerTasks.filter((t: any) => t.status !== 'completed').length + pendingDocs.length} action needed
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{completedItems}/{totalItems}</span>
            </div>
          </div>
          <CardContent className="pt-0 pb-4">
              <div className="border-t mb-3" />

              {borrowerTasks.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Tasks</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto">
                      {borrowerTasks.filter((t: any) => t.status === 'completed').length}/{borrowerTasks.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {sortByActionPriority(borrowerTasks, (t: any) => taskActionPriority(t.status)).map((task: any) => (
                      <div key={task.id} className="flex flex-col gap-1 py-2 px-3 rounded-lg hover:bg-muted/30" data-testid={`task-row-${task.id}`}>
                        <div className="flex items-center gap-3">
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-amber-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[14px] font-medium truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                              {task.taskTitle || task.taskName}
                            </p>
                            {task.dueDate && (
                              <p className="text-[12px] text-muted-foreground">Due: {fmtDate(task.dueDate)}</p>
                            )}
                          </div>
                          <Badge
                            variant={task.status === 'completed' ? 'default' : task.priority === 'critical' ? 'destructive' : task.priority === 'high' ? 'destructive' : 'secondary'}
                            className={`text-[11px] capitalize ${task.status === 'completed' ? 'bg-green-600' : ''}`}
                          >
                            {task.status === 'completed' ? 'Done' : task.priority || 'Pending'}
                          </Badge>
                        </div>
                        {task.formTemplateId && (
                          <InlineFormTask task={task} dealId={dealId!} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {documents.length > 0 && (
                <div>
                  {borrowerTasks.length > 0 && <div className="border-t mb-3" />}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Documents</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto">
                      {completedDocs}/{totalDocs}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {sortByActionPriority(documents, (d: any) => docActionPriority(d.status)).map((doc: any) => {
                      const isExpanded = expandedDocs.has(doc.id);
                      const toggleDoc = () => setExpandedDocs(prev => {
                        const next = new Set(prev);
                        if (next.has(doc.id)) next.delete(doc.id);
                        else next.add(doc.id);
                        return next;
                      });
                      return (
                        <div key={doc.id} className="rounded-lg border border-border/60 overflow-hidden" data-testid={`doc-row-${doc.id}`}>
                          <button
                            onClick={toggleDoc}
                            className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-muted/30 transition-colors"
                            data-testid={`toggle-doc-${doc.id}`}
                          >
                            {getDocStatusIcon(doc.status)}
                            <div className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[14px] font-medium truncate">{doc.documentName}</p>
                                {doc.documentDescription && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center flex-shrink-0"
                                          onClick={(e) => e.stopPropagation()}
                                          aria-label={`Info: ${doc.documentDescription}`}
                                          data-testid={`tooltip-doc-desc-${doc.id}`}
                                        >
                                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs">{doc.documentDescription}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              <p className="text-[12px] text-muted-foreground">{getDocStatusLabel(doc.status)}</p>
                            </div>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/20">
                              {doc.fileName && doc.filePath && (
                                <p className="text-[11px] text-muted-foreground/70 truncate mb-2" data-testid={`text-filename-${doc.id}`}>
                                  Uploaded: {doc.fileName}
                                </p>
                              )}
                              <div className="flex items-center gap-2">
                                {doc.filePath && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    onClick={() => setPreviewDoc({ name: doc.documentName || doc.fileName, filePath: doc.filePath, mimeType: doc.mimeType, docId: doc.id })}
                                    data-testid={`button-preview-${doc.id}`}
                                  >
                                    <Eye className="h-3 w-3" />
                                    View
                                  </Button>
                                )}
                                {doc.status !== 'approved' && doc.status !== 'waived' && doc.status !== 'not_applicable' && (
                                  <label className="cursor-pointer" data-testid={`button-upload-${doc.id}`}>
                                    <input
                                      type="file"
                                      className="hidden"
                                      onChange={(e) => handleFileUpload(doc.id, e)}
                                      disabled={uploadingDocId === doc.id}
                                      data-testid={`file-input-${doc.id}`}
                                    />
                                    <span className="inline-flex items-center justify-center gap-1.5 h-7 px-3 text-xs font-medium border rounded-md hover:bg-accent transition-colors">
                                      {uploadingDocId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                      {doc.filePath ? 'Replace' : 'Upload'}
                                    </span>
                                  </label>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {borrowerTasks.length === 0 && documents.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No checklist items yet.</p>
              )}
            </CardContent>
        </Card>
      </div>

      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewDoc(null)}
          data-testid="preview-overlay"
        >
          <div
            className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-sm font-semibold truncate">{previewDoc.name}</h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-md hover:bg-muted transition-colors"
                data-testid="button-close-preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[400px]">
              {previewDoc.mimeType?.startsWith('image/') ? (
                <img
                  src={`/api/projects/${dealId}/deal-documents/${previewDoc.docId}/download`}
                  alt={previewDoc.name}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                  data-testid="preview-image"
                />
              ) : previewDoc.mimeType === 'application/pdf' ? (
                <div className="w-full h-[75vh] flex flex-col">
                  <iframe
                    src={`/api/projects/${dealId}/deal-documents/${previewDoc.docId}/download`}
                    className="w-full flex-1 rounded border"
                    title={previewDoc.name}
                    data-testid="preview-pdf"
                  />
                  <div className="flex justify-center pt-3">
                    <a
                      href={`/api/projects/${dealId}/deal-documents/${previewDoc.docId}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                      data-testid="link-open-pdf-tab"
                    >
                      <Eye className="h-3 w-3" />
                      Open in new tab
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-3 py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
                  <a
                    href={`/api/projects/${dealId}/deal-documents/${previewDoc.docId}/download?download=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    data-testid="link-download-file"
                  >
                    Download file
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useState, type ChangeEvent } from "react";
import {
  ArrowLeft, Building2, User, DollarSign, FileText, CheckSquare,
  Upload, Loader2, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp,
  Eye, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StageProgressBar } from "@/components/ui/phase1/stage-progress-bar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
    case 'uploaded': case 'submitted': return <Clock className="h-4 w-4 text-amber-500" />;
    case 'rejected': return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'waived': case 'not_applicable': return <CheckCircle2 className="h-4 w-4 text-gray-400" />;
    default: return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
  }
}

function getDocStatusLabel(status: string) {
  switch (status) {
    case 'approved': return 'Approved';
    case 'uploaded': case 'submitted': return 'Under Review';
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

export default function BorrowerDealDetail() {
  const [, params] = useRoute("/deals/:id");
  const dealId = params?.id;
  const { toast } = useToast();
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("overview");
  const [previewDoc, setPreviewDoc] = useState<{ name: string; filePath: string; mimeType?: string } | null>(null);

  const { data: dealData, isLoading, error: dealError } = useQuery<{
    project: any;
    stages: any[];
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
  });

  const deal = dealData?.project;
  const rawStages = dealData?.stages || [];
  const documents = dealData?.dealDocuments?.length ? dealData.dealDocuments : dealData?.documents || [];
  const allTasks = rawStages.flatMap((s: any) => (s.tasks || []).filter((t: any) => t.visibleToBorrower));

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
  const completedDocs = documents.filter((d: any) => d.status === "approved" || d.status === "uploaded" || d.status === "waived" || d.status === "not_applicable").length;
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
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
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
  const borrowerTasks = allTasks.filter((t: any) => t.borrowerActionRequired);
  const pendingDocs = documents.filter((d: any) => d.status === 'pending' || d.status === 'rejected');

  const toggle = (section: string) => setExpandedSection(expandedSection === section ? null : section);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl font-bold truncate" data-testid="text-deal-title">
              {deal.projectName || deal.propertyAddress || `Loan #${deal.id}`}
            </h1>
            <Badge
              variant={deal.status === 'active' ? 'default' : 'secondary'}
              className={deal.status === 'active' ? 'bg-emerald-600' : ''}
              data-testid="badge-status"
            >
              {deal.status === 'active' ? 'In Progress' : deal.status === 'completed' ? 'Completed' : deal.status}
            </Badge>
          </div>
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

      <div className="space-y-3">
        <Card className="overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
            onClick={() => toggle("overview")}
            data-testid="toggle-overview"
          >
            <CardTitle className="text-[18px] flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Loan Overview
            </CardTitle>
            {expandedSection === "overview" ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {expandedSection === "overview" && (
            <CardContent className="pt-0 pb-5">
              <div className="border-t mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                </div>
                <div>
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
          )}
        </Card>

        <Card className="overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
            onClick={() => toggle("documents")}
            data-testid="toggle-documents"
          >
            <CardTitle className="text-[18px] flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Documents
              {pendingDocs.length > 0 && (
                <Badge variant="destructive" className="text-[11px] h-5 px-1.5">{pendingDocs.length} action needed</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{completedDocs}/{totalDocs}</span>
              {expandedSection === "documents" ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {expandedSection === "documents" && (
            <CardContent className="pt-0 pb-4">
              <div className="border-t mb-3" />
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No documents required yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 border border-transparent hover:border-border transition-colors" data-testid={`doc-row-${doc.id}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getDocStatusIcon(doc.status)}
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium truncate">{doc.documentName}</p>
                          <p className="text-[12px] text-muted-foreground">{getDocStatusLabel(doc.status)}</p>
                          {doc.fileName && (doc.status === 'uploaded' || doc.status === 'submitted' || doc.status === 'approved') && (
                            <p className="text-[11px] text-muted-foreground/70 truncate" data-testid={`text-filename-${doc.id}`}>
                              {doc.fileName}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {doc.filePath && (doc.status === 'uploaded' || doc.status === 'submitted' || doc.status === 'approved') && (
                          <button
                            onClick={() => setPreviewDoc({ name: doc.documentName || doc.fileName, filePath: doc.filePath, mimeType: doc.mimeType })}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md border hover:bg-accent transition-colors"
                            data-testid={`button-preview-${doc.id}`}
                            title="Preview"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(doc.status === 'pending' || doc.status === 'rejected' || doc.status === 'uploaded' || doc.status === 'submitted') && (
                          <label className="cursor-pointer" data-testid={`button-upload-${doc.id}`}>
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => handleFileUpload(doc.id, e)}
                              disabled={uploadingDocId === doc.id}
                              data-testid={`file-input-${doc.id}`}
                            />
                            <span className="inline-flex items-center justify-center gap-1 h-7 px-3 text-xs font-medium border rounded-md hover:bg-accent transition-colors">
                              {uploadingDocId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              {doc.status === 'uploaded' || doc.status === 'submitted' ? 'Replace' : 'Upload'}
                            </span>
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {borrowerTasks.length > 0 && (
          <Card className="overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
              onClick={() => toggle("tasks")}
              data-testid="toggle-tasks"
            >
              <CardTitle className="text-[18px] flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                Your Tasks
                <Badge variant="secondary" className="text-[11px] h-5 px-1.5">
                  {borrowerTasks.filter((t: any) => t.status !== 'completed').length} remaining
                </Badge>
              </CardTitle>
              {expandedSection === "tasks" ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {expandedSection === "tasks" && (
              <CardContent className="pt-0 pb-4">
                <div className="border-t mb-3" />
                <div className="space-y-1.5">
                  {borrowerTasks.map((task: any) => (
                    <div key={task.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/30" data-testid={`task-row-${task.id}`}>
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
                        variant={task.status === 'completed' ? 'default' : task.priority === 'critical' ? 'destructive' : 'secondary'}
                        className={`text-[11px] ${task.status === 'completed' ? 'bg-green-600' : ''}`}
                      >
                        {task.status === 'completed' ? 'Done' : task.priority === 'critical' ? 'Required' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}
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
                  src={`/api/storage/file?path=${encodeURIComponent(previewDoc.filePath)}`}
                  alt={previewDoc.name}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                  data-testid="preview-image"
                />
              ) : previewDoc.mimeType === 'application/pdf' ? (
                <iframe
                  src={`/api/storage/file?path=${encodeURIComponent(previewDoc.filePath)}`}
                  className="w-full h-[75vh] rounded border"
                  title={previewDoc.name}
                  data-testid="preview-pdf"
                />
              ) : (
                <div className="text-center space-y-3 py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
                  <a
                    href={`/api/storage/file?path=${encodeURIComponent(previewDoc.filePath)}`}
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

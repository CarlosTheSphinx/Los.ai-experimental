import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { formatPhoneNumber } from "@/lib/validation";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Upload,
  Loader2,
  FolderOpen,
  FileText,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardEdit,
  Send,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DocFile {
  id: number;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string | null;
}

interface FormFieldDef {
  fieldKey: string;
  label: string;
  fieldType: "text" | "email" | "phone" | "select" | "textarea";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormTemplate {
  id: number;
  name: string;
  description?: string | null;
  fields: FormFieldDef[];
  targetType: string;
  targetRole?: string | null;
}

interface FormSubmission {
  id: number;
  formData: Record<string, string>;
  status: string;
  submittedAt?: string | null;
  submittedByEmail?: string | null;
}

export interface ChecklistItem {
  id: string;
  type: "document" | "task";
  itemId: number;
  stageId: number | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  isRequired: boolean;
  assignedTo: string;
  visibility: string;
  sortOrder: number;
  filePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedAt?: string | null;
  uploadedBy?: number | null;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
  reviewNotes?: string | null;
  files?: DocFile[];
  priority?: string;
  borrowerActionRequired?: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  createdAt?: string | null;
  formTemplateId?: number | null;
  formTemplate?: FormTemplate | null;
  formSubmission?: FormSubmission | null;
}

export interface ChecklistStage {
  id: number;
  name: string;
  key: string;
  order: number;
  status: string;
  description: string | null;
}

interface ChecklistResponse {
  success: boolean;
  viewerRole: string;
  items: ChecklistItem[];
  stages: ChecklistStage[];
}

interface LoanChecklistProps {
  dealId: number;
  mode: "admin" | "broker" | "borrower";
  portalToken?: string;
  onUploadDoc?: (docId: number) => void;
  onReviewDoc?: (docId: number, decision: "approved" | "rejected", notes?: string) => void;
  pollingInterval?: number;
  showTasks?: boolean;
  onApproveAll?: () => void;
  isApprovingAll?: boolean;
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getStatusBadge(status: string, type: "document" | "task") {
  if (type === "document") {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-success">Approved</Badge>;
      case "ai_reviewed":
        return <Badge variant="secondary" className="bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-700">AI Reviewed</Badge>;
      case "uploaded":
      case "submitted":
        return <Badge variant="secondary">Under Review</Badge>;
      case "rejected":
        return <Badge variant="destructive">Needs Revision</Badge>;
      case "waived":
      case "not_applicable":
        return <Badge variant="outline">Waived</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  } else {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-success">Done</Badge>;
      case "in_progress":
        return <Badge variant="secondary">In Progress</Badge>;
      case "blocked":
        return <Badge variant="destructive">Blocked</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  }
}

function getStatusIcon(status: string, type: "document" | "task") {
  if (type === "document") {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />;
      case "ai_reviewed":
        return <CheckSquare className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />;
      case "uploaded":
      case "submitted":
        return <Clock className="h-5 w-5 text-info shrink-0" />;
      case "rejected":
        return <AlertCircle className="h-5 w-5 text-destructive shrink-0" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground shrink-0" />;
    }
  } else {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-info shrink-0" />;
      case "blocked":
        return <AlertCircle className="h-5 w-5 text-destructive shrink-0" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground shrink-0" />;
    }
  }
}

export function LoanChecklist({
  dealId,
  mode,
  portalToken,
  onUploadDoc,
  onReviewDoc,
  pollingInterval = 0,
  showTasks = true,
  onApproveAll,
  isApprovingAll = false,
}: LoanChecklistProps) {
  const { toast } = useToast();
  const [expandedStages, setExpandedStages] = useState<Set<number | string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);

  const endpoint = portalToken
    ? `/api/portal/${portalToken}/checklist`
    : mode === "admin"
    ? `/api/admin/deals/${dealId}/checklist`
    : `/api/projects/${dealId}/checklist`;

  const queryKey = portalToken
    ? ["/api/portal/checklist", portalToken]
    : ["/api/checklist", dealId, mode];

  const { data, isLoading, error } = useQuery<ChecklistResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load checklist");
      return res.json();
    },
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading checklist...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            Failed to load checklist. Please try again.
          </div>
        </CardContent>
      </Card>
    );
  }

  const { items, stages } = data;

  const filteredItems = showTasks ? items : items.filter(i => i.type === "document");

  const docItems = filteredItems.filter(i => i.type === "document");
  const totalDocs = docItems.filter(i => i.isRequired).length;
  const approvedDocs = docItems.filter(i => i.status === "approved").length;
  const aiReviewedCount = docItems.filter(i => i.status === "ai_reviewed").length;

  const taskItems = filteredItems.filter(i => i.type === "task");
  const totalTasks = taskItems.length;
  const completedTasks = taskItems.filter(i => i.status === "completed").length;

  const itemsByStage = stages.map(stage => ({
    stage,
    items: filteredItems.filter(i => i.stageId === stage.id)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "document" ? -1 : 1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      }),
  })).filter(g => g.items.length > 0);

  const unstagedItems = filteredItems.filter(i => !i.stageId || !stages.find(s => s.id === i.stageId));

  const isStageExpanded = (stageId: number | string) => {
    if (allExpanded) return true;
    return expandedStages.has(stageId);
  };

  const toggleStage = (stageId: number | string) => {
    setAllExpanded(false);
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  if (filteredItems.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No checklist items yet</p>
            <p className="text-xs mt-1">Items will appear here once the loan program is configured</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {docItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Documents</span>
            <span className="text-sm font-semibold text-foreground" data-testid="text-doc-progress">
              {approvedDocs} of {totalDocs} complete
            </span>
          </div>
          <Progress value={(approvedDocs / totalDocs) * 100} className="h-2" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{Math.round((approvedDocs / totalDocs) * 100)}% complete</p>
            {mode === "admin" && aiReviewedCount > 0 && onApproveAll && (
              <Button
                variant="default"
                size="sm"
                onClick={onApproveAll}
                disabled={isApprovingAll}
                data-testid="button-approve-all-docs"
              >
                {isApprovingAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Approve All & Push To Drive ({aiReviewedCount})
              </Button>
            )}
          </div>
        </div>
      )}

      {showTasks && taskItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Tasks</span>
            <span className="text-sm font-semibold text-foreground" data-testid="text-task-progress">
              {completedTasks} of {totalTasks} complete
            </span>
          </div>
          <Progress value={(completedTasks / totalTasks) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">{Math.round((completedTasks / totalTasks) * 100)}% complete</p>
        </div>
      )}

      {itemsByStage.map(({ stage, items: stageItems }) => (
        <Card key={stage.id} data-testid={`card-checklist-stage-${stage.id}`}>
          <CardHeader
            className="pb-3 cursor-pointer"
            onClick={() => toggleStage(stage.id)}
            data-testid={`button-toggle-stage-${stage.id}`}
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <CardTitle className="text-base">{stage.name}</CardTitle>
                <CardDescription>
                  {stageItems.filter(i => i.type === "document" && i.status === "approved").length}/
                  {stageItems.filter(i => i.type === "document" && i.isRequired).length} docs approved
                  {showTasks && stageItems.some(i => i.type === "task") && (
                    <> · {stageItems.filter(i => i.type === "task" && i.status === "completed").length}/
                    {stageItems.filter(i => i.type === "task").length} tasks</>
                  )}
                </CardDescription>
              </div>
              {isStageExpanded(stage.id) ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {isStageExpanded(stage.id) && (
            <CardContent>
              <div className="space-y-2">
                {stageItems.map(item => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    mode={mode}
                    portalToken={portalToken}
                    onUploadDoc={onUploadDoc}
                    onReviewDoc={onReviewDoc}
                  />
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {unstagedItems.length > 0 && (
        <Card data-testid="card-checklist-stage-other">
          <CardHeader
            className="pb-3 cursor-pointer"
            onClick={() => toggleStage("other")}
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Other Items</CardTitle>
              {isStageExpanded("other") ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
              )}
            </div>
          </CardHeader>
          {isStageExpanded("other") && (
            <CardContent>
              <div className="space-y-2">
                {unstagedItems.map(item => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    mode={mode}
                    portalToken={portalToken}
                    onUploadDoc={onUploadDoc}
                    onReviewDoc={onReviewDoc}
                  />
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

function FormTaskInline({
  item,
  portalToken,
}: {
  item: ChecklistItem;
  portalToken: string;
}) {
  const { toast } = useToast();
  const template = item.formTemplate;
  const submission = item.formSubmission;
  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    if (submission?.formData) return { ...submission.formData };
    const init: Record<string, string> = {};
    template?.fields?.forEach(f => { init[f.fieldKey] = ""; });
    return init;
  });

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("POST", `/api/portal/${portalToken}/tasks/${item.itemId}/submit-form`, { formData: data });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Form submitted", description: "Your information has been received." });
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/checklist", portalToken] });
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  if (!template) return null;

  if (submission && submission.status === "submitted") {
    return (
      <div className="mt-2 p-3 rounded-md border border-success/30 bg-success/5" data-testid={`form-submitted-${item.id}`}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm font-medium text-success">Form Submitted</span>
          {submission.submittedAt && (
            <span className="text-xs text-muted-foreground">
              {formatDateTime(submission.submittedAt)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {template.fields.map(field => (
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
    <div className="mt-2" data-testid={`form-section-${item.id}`}>
      {!formOpen ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFormOpen(true)}
          data-testid={`button-fill-form-${item.id}`}
        >
          <ClipboardEdit className="h-4 w-4 mr-2" />
          Fill Out Form
        </Button>
      ) : (
        <div className="p-4 rounded-md border border-primary/20 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{template.name}</h4>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} data-testid={`button-close-form-${item.id}`}>
              Cancel
            </Button>
          </div>
          {template.description && (
            <p className="text-xs text-muted-foreground">{template.description}</p>
          )}
          <div className="space-y-3">
            {template.fields.map(field => (
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
                    data-testid={`input-form-${field.fieldKey}-${item.id}`}
                  />
                ) : field.fieldType === "select" && field.options ? (
                  <Select
                    value={formValues[field.fieldKey] || ""}
                    onValueChange={val => setFormValues(prev => ({ ...prev, [field.fieldKey]: val }))}
                  >
                    <SelectTrigger className="mt-1" data-testid={`select-form-${field.fieldKey}-${item.id}`}>
                      <SelectValue placeholder={field.placeholder || "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map(opt => (
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
                    data-testid={`input-form-${field.fieldKey}-${item.id}`}
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
              data-testid={`button-submit-form-${item.id}`}
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistItemRow({
  item,
  mode,
  portalToken,
  onUploadDoc,
  onReviewDoc,
}: {
  item: ChecklistItem;
  mode: "admin" | "broker" | "borrower";
  portalToken?: string;
  onUploadDoc?: (docId: number) => void;
  onReviewDoc?: (docId: number, decision: "approved" | "rejected", notes?: string) => void;
}) {
  const isDocument = item.type === "document";
  const canUpload = isDocument && (item.status === "pending" || item.status === "rejected");
  const canReview = isDocument && mode === "admin" && (item.status === "uploaded" || item.status === "submitted" || item.status === "ai_reviewed");
  const showUploadButton = canUpload && (mode === "borrower" || mode === "broker" || (mode === "admin" && item.assignedTo !== "admin"));
  const hasForm = !isDocument && item.formTemplateId && item.formTemplate;
  const isFormTask = hasForm && mode === "borrower" && portalToken;
  const isAdminViewForm = hasForm && mode === "admin";

  return (
    <div
      className={`p-3 rounded-md border transition-colors ${
        item.status === "rejected" ? "border-destructive/50 bg-destructive/5" :
        item.status === "ai_reviewed" ? "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/10" :
        "border-border"
      } ${item.status === "approved" || item.status === "completed" ? "border-success/30 bg-success/5" : ""}`}
      data-testid={`checklist-item-${item.id}`}
    >
      <div className="flex items-center gap-3">
        {getStatusIcon(item.status, item.type)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${
              item.status === "approved" || item.status === "completed" ? "text-success" :
              item.status === "rejected" ? "text-destructive" :
              item.status === "ai_reviewed" ? "text-violet-600 dark:text-violet-400" :
              (item.status === "uploaded" || item.status === "submitted") ? "text-info" :
              "text-foreground"
            }`}>
              {item.title}
            </span>
            {isDocument && item.isRequired && <Badge variant="outline" className="text-xs">Required</Badge>}
            {!isDocument && <Badge variant="outline" className="text-xs">Task</Badge>}
            {hasForm && <Badge variant="secondary" className="text-xs"><ClipboardEdit className="h-3 w-3 mr-1" />Form</Badge>}
            {item.assignedTo && item.assignedTo !== "borrower" && mode === "admin" && (
              <Badge variant="secondary" className="text-xs capitalize">{item.assignedTo}</Badge>
            )}
            {item.borrowerActionRequired && item.status !== "completed" && (
              <Badge variant="outline" className="text-xs">Action Required</Badge>
            )}
            {isAdminViewForm && item.formSubmission?.status === "submitted" && (
              <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Form Submitted</Badge>
            )}
            {isAdminViewForm && !item.formSubmission && item.status !== "completed" && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Form Pending</Badge>
            )}
          </div>
          {item.description && (
            <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
          )}
          {item.status === "rejected" && item.reviewNotes && (
            <div className="text-xs text-destructive mt-1 font-medium">
              Rejected: {item.reviewNotes}
            </div>
          )}
          {item.status === "approved" && item.reviewNotes && (
            <div className="text-xs text-success mt-1">
              Note: {item.reviewNotes}
            </div>
          )}
          {isDocument && item.fileName && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {item.fileName}
              {item.fileSize ? ` · ${(item.fileSize / 1024).toFixed(1)} KB` : ""}
              {item.uploadedAt && ` · ${formatDateTime(item.uploadedAt)}`}
            </div>
          )}
          {!isDocument && item.completedAt && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Completed {formatDateTime(item.completedAt)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {getStatusBadge(item.status, item.type)}
          {showUploadButton && onUploadDoc && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUploadDoc(item.itemId)}
              data-testid={`button-upload-checklist-${item.id}`}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          )}
          {canReview && onReviewDoc && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-success"
                onClick={() => onReviewDoc(item.itemId, "approved")}
                data-testid={`button-approve-${item.id}`}
              >
                Approve & Push To Drive
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  const notes = window.prompt("Reason for rejection?");
                  if (notes !== null) onReviewDoc(item.itemId, "rejected", notes);
                }}
                data-testid={`button-reject-${item.id}`}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      </div>
      {isFormTask && portalToken && item.status !== "completed" && (
        <FormTaskInline item={item} portalToken={portalToken} />
      )}
      {isFormTask && item.status === "completed" && item.formSubmission && (
        <FormTaskInline item={item} portalToken={portalToken} />
      )}
      {isAdminViewForm && item.formSubmission?.status === "submitted" && (
        <AdminFormSubmissionView item={item} />
      )}
    </div>
  );
}

function AdminFormSubmissionView({ item }: { item: ChecklistItem }) {
  const [open, setOpen] = useState(false);
  const template = item.formTemplate;
  const submission = item.formSubmission;
  if (!template || !submission) return null;

  return (
    <div className="mt-2" data-testid={`admin-form-view-${item.id}`}>
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid={`button-view-submission-${item.id}`}>
          <FileText className="h-4 w-4 mr-2" />
          View Submission
        </Button>
      ) : (
        <div className="p-3 rounded-md border bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{template.name}</h4>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Submitted {submission.submittedAt ? formatDateTime(submission.submittedAt) : ""}
            {submission.submittedByEmail && ` by ${submission.submittedByEmail}`}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {template.fields.map(field => (
              <div key={field.fieldKey} className="text-sm">
                <span className="text-muted-foreground text-xs">{field.label}</span>
                <div className="font-medium">{submission.formData[field.fieldKey] || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LoanChecklist;

import { useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
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
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DocFile {
  id: number;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string | null;
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
        return <Badge variant="default" className="bg-green-600">Approved</Badge>;
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
        return <Badge variant="default" className="bg-green-600">Done</Badge>;
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
        return <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />;
      case "uploaded":
      case "submitted":
        return <Clock className="h-5 w-5 text-blue-500 shrink-0" />;
      case "rejected":
        return <AlertCircle className="h-5 w-5 text-destructive shrink-0" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground shrink-0" />;
    }
  } else {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-blue-500 shrink-0" />;
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {docItems.length > 0 && (
            <span data-testid="text-doc-progress">
              Documents: {approvedDocs}/{totalDocs} approved
            </span>
          )}
          {showTasks && taskItems.length > 0 && (
            <span data-testid="text-task-progress">
              Tasks: {completedTasks}/{totalTasks} complete
            </span>
          )}
        </div>
      </div>

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

function ChecklistItemRow({
  item,
  mode,
  onUploadDoc,
  onReviewDoc,
}: {
  item: ChecklistItem;
  mode: "admin" | "broker" | "borrower";
  onUploadDoc?: (docId: number) => void;
  onReviewDoc?: (docId: number, decision: "approved" | "rejected", notes?: string) => void;
}) {
  const isDocument = item.type === "document";
  const canUpload = isDocument && (item.status === "pending" || item.status === "rejected");
  const canReview = isDocument && mode === "admin" && (item.status === "uploaded" || item.status === "submitted");
  const showUploadButton = canUpload && (mode === "borrower" || mode === "broker" || (mode === "admin" && item.assignedTo !== "admin"));

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border ${
        item.status === "rejected" ? "border-destructive/50 bg-destructive/5" : ""
      }`}
      data-testid={`checklist-item-${item.id}`}
    >
      {getStatusIcon(item.status, item.type)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{item.title}</span>
          {isDocument && item.isRequired && <Badge variant="outline" className="text-xs">Required</Badge>}
          {!isDocument && <Badge variant="outline" className="text-xs">Task</Badge>}
          {item.assignedTo && item.assignedTo !== "borrower" && mode === "admin" && (
            <Badge variant="secondary" className="text-xs capitalize">{item.assignedTo}</Badge>
          )}
          {item.borrowerActionRequired && item.status !== "completed" && (
            <Badge variant="outline" className="text-xs">Action Required</Badge>
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
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">
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
              className="text-green-600"
              onClick={() => onReviewDoc(item.itemId, "approved")}
              data-testid={`button-approve-${item.id}`}
            >
              Approve
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
  );
}

export default LoanChecklist;

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Brain,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Mail,
  Pencil,
  Copy,
  Check,
  Save,
  X,
  XCircle,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AgentCommunication {
  id: number;
  projectId: number;
  agentRunId: number | null;
  recipientType: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  subject: string | null;
  body: string | null;
  htmlBody: string | null;
  priority: string | null;
  status: string | null;
  findingIds: any | null;
  suggestedFollowUpDate: string | null;
  internalNotes: string | null;
  editedBody: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  sentAt: string | null;
  sentVia: string | null;
  createdAt: string;
}

function InsightCard({ insight }: { insight: any }) {
  const getIcon = () => {
    switch (insight.severity || insight.type) {
      case "warning":
      case "risk":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "success":
      case "positive":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="flex items-start gap-3 py-3 px-4 rounded-lg border bg-card">
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-medium">{insight.title || insight.message}</p>
        {insight.description && (
          <p className="text-[14px] text-muted-foreground mt-1">{insight.description}</p>
        )}
        {insight.recommendation && (
          <p className="text-[14px] text-primary mt-1.5">{insight.recommendation}</p>
        )}
      </div>
      {insight.category && (
        <Badge variant="secondary" className="text-[12px] shrink-0">{insight.category}</Badge>
      )}
    </div>
  );
}

function DocumentReviewRow({
  doc,
  dealId,
  onStatusChange,
}: {
  doc: any;
  dealId: string;
  onStatusChange: () => void;
}) {
  const { toast } = useToast();
  const aiStatus = doc.aiReviewStatus?.toLowerCase();
  const hasFile = !!doc.filePath || !!doc.fileUrl;

  const statusIcon = () => {
    if (aiStatus === "approved") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (aiStatus === "denied") return <XCircle className="h-4 w-4 text-red-500" />;
    if (aiStatus === "reviewing") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  const statusLabel = () => {
    if (aiStatus === "approved") return "Passed";
    if (aiStatus === "denied") return "Failed";
    if (aiStatus === "reviewing") return "Reviewing";
    if (aiStatus === "pending") return "Pending";
    return "Needs Review";
  };

  const statusVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    if (aiStatus === "approved") return "default";
    if (aiStatus === "denied") return "destructive";
    return "secondary";
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/documents/${doc.id}`, { status: "approved" });
    },
    onSuccess: () => {
      onStatusChange();
      toast({ title: `"${doc.documentName || doc.documentCategory}" approved` });
    },
    onError: () => toast({ title: "Failed to approve document", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/documents/${doc.id}`, { status: "rejected" });
    },
    onSuccess: () => {
      onStatusChange();
      toast({ title: `"${doc.documentName || doc.documentCategory}" rejected` });
    },
    onError: () => toast({ title: "Failed to reject document", variant: "destructive" }),
  });

  const isActionable = hasFile && doc.status !== "approved" && doc.status !== "rejected";

  return (
    <div className="flex items-start gap-3 py-3 px-4 rounded-lg border bg-card" data-testid={`review-doc-${doc.id}`}>
      <div className="mt-0.5">{statusIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[15px] font-medium">{doc.documentName || doc.documentCategory || "Document"}</p>
          <Badge variant={statusVariant()} className="text-[11px]">{statusLabel()}</Badge>
          {doc.aiReviewConfidence != null && (
            <span className="text-[12px] text-muted-foreground">
              {Math.round(doc.aiReviewConfidence * 100)}% confidence
            </span>
          )}
        </div>
        {doc.aiReviewReason && (
          <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">{doc.aiReviewReason}</p>
        )}
        {!hasFile && (
          <p className="text-[13px] text-amber-600 mt-1 italic">No file uploaded yet</p>
        )}
      </div>
      {isActionable && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            data-testid={`approve-doc-${doc.id}`}
          >
            {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending}
            className="text-red-700 border-red-300 hover:bg-red-50"
            data-testid={`reject-doc-${doc.id}`}
          >
            {rejectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
            Reject
          </Button>
        </div>
      )}
      {(doc.status === "approved") && (
        <Badge variant="default" className="bg-emerald-100 text-emerald-800 text-[11px] shrink-0">Approved</Badge>
      )}
      {(doc.status === "rejected") && (
        <Badge variant="destructive" className="text-[11px] shrink-0">Rejected</Badge>
      )}
    </div>
  );
}

function parseCommBody(comm: AgentCommunication): { subject: string; body: string } {
  const rawBody = comm.editedBody || comm.body || "";
  try {
    const trimmed = rawBody.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(trimmed);
    return { subject: parsed.subject || comm.subject || "No Subject", body: parsed.body || rawBody };
  } catch {
    return { subject: comm.subject || "No Subject", body: rawBody };
  }
}

function CommunicationCard({
  comm,
  dealId,
}: {
  comm: AgentCommunication;
  dealId: string;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [copied, setCopied] = useState(false);

  const parsed = parseCommBody(comm);

  const startEditing = () => {
    setEditSubject(parsed.subject);
    setEditBody(parsed.body);
    setIsEditing(true);
  };

  const approveComm = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/projects/${dealId}/agent-communications/${comm.id}/approve`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", dealId, "agent-communications"] });
      const digestMsg = data?.digest?.queued ? " Queued for next digest." : "";
      toast({ title: `Communication approved.${digestMsg}` });
    },
    onError: () => {
      toast({ title: "Failed to approve", variant: "destructive" });
    },
  });

  const editComm = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/projects/${dealId}/agent-communications/${comm.id}`, {
        body: editBody,
        subject: editSubject,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", dealId, "agent-communications"] });
      setIsEditing(false);
      toast({ title: "Communication updated" });
    },
    onError: () => {
      toast({ title: "Failed to save changes", variant: "destructive" });
    },
  });

  const discardComm = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/projects/${dealId}/agent-communications/${comm.id}/reject`, {
        reason: "Discarded by user",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", dealId, "agent-communications"] });
      toast({ title: "Communication discarded" });
    },
    onError: () => {
      toast({ title: "Failed to discard", variant: "destructive" });
    },
  });

  const copyBody = () => {
    navigator.clipboard.writeText(parsed.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const priorityVariant = (p: string | null) => {
    if (!p) return "secondary" as const;
    const low = p.toLowerCase();
    if (low === "high" || low === "urgent") return "destructive" as const;
    return "secondary" as const;
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3" data-testid={`comm-card-${comm.id}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-medium truncate" data-testid={`comm-subject-${comm.id}`}>
              {isEditing ? (
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="text-[15px]"
                  data-testid={`input-edit-subject-${comm.id}`}
                />
              ) : (
                parsed.subject
              )}
            </p>
            {comm.priority && (
              <Badge variant={priorityVariant(comm.priority)} className="text-[11px] shrink-0" data-testid={`badge-priority-${comm.id}`}>
                {comm.priority}
              </Badge>
            )}
            {comm.status && comm.status !== "draft" && (
              <Badge variant="secondary" className="text-[11px] shrink-0" data-testid={`badge-status-${comm.id}`}>
                {comm.status}
              </Badge>
            )}
          </div>
          <div className="text-[13px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>To: {comm.recipientType || "borrower"}</span>
            {comm.recipientName && <span>{comm.recipientName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => editComm.mutate()}
                disabled={editComm.isPending}
                data-testid={`button-save-comm-${comm.id}`}
              >
                {editComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsEditing(false)}
                data-testid={`button-cancel-edit-${comm.id}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={startEditing}
                data-testid={`button-edit-comm-${comm.id}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={copyBody}
                data-testid={`button-copy-comm-${comm.id}`}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              {comm.status === "draft" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => approveComm.mutate()}
                    disabled={approveComm.isPending}
                    data-testid={`button-approve-comm-${comm.id}`}
                  >
                    {approveComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                    Approve
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => discardComm.mutate()}
                    disabled={discardComm.isPending}
                    data-testid={`button-discard-comm-${comm.id}`}
                  >
                    {discardComm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <Textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          className="text-sm min-h-[120px] resize-y"
          data-testid={`textarea-edit-body-${comm.id}`}
        />
      ) : (
        <div
          className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-3 max-h-64 overflow-y-auto"
          data-testid={`comm-body-${comm.id}`}
        >
          {parsed.body}
        </div>
      )}
      {comm.internalNotes && (
        <div className="text-xs text-muted-foreground italic border-t pt-2">
          Notes: {comm.internalNotes}
        </div>
      )}
    </div>
  );
}

export default function TabAIInsights({
  deal,
  dealId,
}: {
  deal: any;
  dealId: string;
}) {
  const { toast } = useToast();

  const { data: docsData, isLoading: docsLoading } = useQuery<{ documents: any[] }>({
    queryKey: ["/api/admin/deals", dealId, "documents", "ai-reviews"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/admin/deals/${dealId}/documents`, { credentials: "include" });
        if (!res.ok) return { documents: [] };
        return res.json();
      } catch {
        return { documents: [] };
      }
    },
    enabled: !!dealId,
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<any[]>({
    queryKey: [`/api/deals/${dealId}/ai-insights`],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/ai-insights`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: !!dealId,
  });

  const { data: communications, isLoading: commsLoading } = useQuery<AgentCommunication[]>({
    queryKey: ["/api/projects", dealId, "agent-communications"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/projects/${dealId}/agent-communications`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: !!dealId,
  });

  const invalidateDocData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents", "ai-reviews"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId] });
  };

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/documents/approve-all`);
    },
    onSuccess: () => {
      invalidateDocData();
      toast({ title: "All documents approved" });
    },
    onError: () => toast({ title: "Failed to approve documents", variant: "destructive" }),
  });

  const isLoading = docsLoading || insightsLoading || commsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-[16px]">Loading AI reviews...</span>
      </div>
    );
  }

  const allDocuments = docsData?.documents ?? [];
  const reviewedDocs = allDocuments.filter((d: any) => (d.filePath || d.fileUrl) && d.aiReviewStatus);
  const passedDocs = reviewedDocs.filter((d: any) => d.status === "approved");
  const failedDocs = reviewedDocs.filter((d: any) => d.aiReviewStatus === "denied");
  const approvableDocs = allDocuments.filter((d: any) => d.status === "ai_reviewed");
  const pendingReviewDocs = reviewedDocs.filter((d: any) => d.status !== "approved" && d.status !== "rejected");

  const insightsList = Array.isArray(insights) ? insights : [];
  const commsList = Array.isArray(communications) ? communications : [];
  const draftComms = commsList.filter((c) => c.status === "draft");
  const otherComms = commsList.filter((c) => c.status !== "draft");

  const risks = insightsList.filter((i) => i.severity === "warning" || i.type === "risk");
  const recommendations = insightsList.filter((i) => i.severity !== "warning" && i.type !== "risk");

  const hasAnyContent = reviewedDocs.length > 0 || insightsList.length > 0 || commsList.length > 0;

  if (!hasAnyContent) {
    return (
      <EmptyState
        icon={Brain}
        title="No AI reviews yet"
        description="AI reviews will appear here after running Auto Process or when documents are reviewed."
      />
    );
  }

  return (
    <div className="space-y-5">
      {reviewedDocs.length > 0 && (
        <div data-testid="section-document-reviews">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Document Reviews ({reviewedDocs.length})
            </h4>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-[13px]">
                {passedDocs.length > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {passedDocs.length} passed
                  </span>
                )}
                {failedDocs.length > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-3.5 w-3.5" /> {failedDocs.length} failed
                  </span>
                )}
                {pendingReviewDocs.length > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> {pendingReviewDocs.length} pending
                  </span>
                )}
              </div>
              {approvableDocs.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => approveAllMutation.mutate()}
                  disabled={approveAllMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="approve-all-docs"
                >
                  {approveAllMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Approve All ({approvableDocs.length})
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {reviewedDocs.map((doc: any) => (
              <DocumentReviewRow
                key={doc.id}
                doc={doc}
                dealId={dealId}
                onStatusChange={invalidateDocData}
              />
            ))}
          </div>
        </div>
      )}

      {draftComms.length > 0 && (
        <div data-testid="section-drafted-communications">
          <h4 className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2 flex-wrap">
            <Mail className="h-4 w-4" />
            Drafted Communications ({draftComms.length})
          </h4>
          <div className="space-y-2">
            {draftComms.map((comm) => (
              <CommunicationCard key={comm.id} comm={comm} dealId={dealId} />
            ))}
          </div>
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <h4 className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Risk Flags ({risks.length})
          </h4>
          <div className="space-y-2">
            {risks.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}
      {recommendations.length > 0 && (
        <div>
          <h4 className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Recommendations ({recommendations.length})
          </h4>
          <div className="space-y-2">
            {recommendations.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}
      {otherComms.length > 0 && (
        <div data-testid="section-sent-communications">
          <h4 className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2 flex-wrap">
            <Mail className="h-4 w-4" />
            Sent / Approved Communications ({otherComms.length})
          </h4>
          <div className="space-y-2">
            {otherComms.map((comm) => (
              <CommunicationCard key={comm.id} comm={comm} dealId={dealId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Mail,
  Pencil,
  Save,
  X,
  Calendar,
  Send,
  Trash2,
  ShieldCheck,
  Clock,
} from "lucide-react";
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

function CommunicationReviewCard({
  comm,
  dealId,
  onStatusChange,
}: {
  comm: AgentCommunication;
  dealId: string;
  onStatusChange: () => void;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");

  const parsed = parseCommBody(comm);

  const startEditing = () => {
    setEditSubject(parsed.subject);
    setEditBody(parsed.body);
    setIsEditing(true);
  };

  const editComm = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/projects/${dealId}/agent-communications/${comm.id}`, {
        body: editBody,
        subject: editSubject,
      });
    },
    onSuccess: () => {
      onStatusChange();
      setIsEditing(false);
      toast({ title: "Message updated" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const approveComm = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/projects/${dealId}/agent-communications/${comm.id}/approve`);
    },
    onSuccess: () => {
      onStatusChange();
      toast({ title: "Message approved and queued for sending" });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const scheduleComm = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/communications/${comm.id}/schedule`, {
        scheduledDate: scheduleDate,
      });
    },
    onSuccess: () => {
      onStatusChange();
      setShowSchedule(false);
      toast({ title: "Message scheduled" });
    },
    onError: () => toast({ title: "Failed to schedule", variant: "destructive" }),
  });

  const discardComm = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/projects/${dealId}/agent-communications/${comm.id}/reject`, {
        reason: "Discarded by user",
      });
    },
    onSuccess: () => {
      onStatusChange();
      toast({ title: "Message discarded" });
    },
    onError: () => toast({ title: "Failed to discard", variant: "destructive" }),
  });

  if (comm.status !== "draft") {
    return (
      <div className="rounded-lg border bg-card p-4 opacity-60" data-testid={`review-comm-${comm.id}`}>
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-medium flex-1">{parsed.subject}</p>
          <Badge variant="secondary" className="text-[11px]">{comm.status}</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3" data-testid={`review-comm-${comm.id}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              className="text-[15px] font-medium mb-1"
              placeholder="Subject"
              data-testid={`input-modal-subject-${comm.id}`}
            />
          ) : (
            <p className="text-[15px] font-medium">{parsed.subject}</p>
          )}
          <div className="text-[13px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            <span>To: {comm.recipientType || "borrower"}</span>
            {comm.recipientName && <span className="font-medium">{comm.recipientName}</span>}
            {comm.recipientEmail && <span>({comm.recipientEmail})</span>}
          </div>
        </div>
        {comm.priority && (
          <Badge
            variant={comm.priority?.toLowerCase() === "high" || comm.priority?.toLowerCase() === "urgent" ? "destructive" : "secondary"}
            className="text-[11px] shrink-0"
          >
            {comm.priority}
          </Badge>
        )}
      </div>

      {isEditing ? (
        <Textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          className="text-sm min-h-[120px] resize-y"
          data-testid={`textarea-modal-body-${comm.id}`}
        />
      ) : (
        <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-3 max-h-48 overflow-y-auto">
          {parsed.body}
        </div>
      )}

      {showSchedule && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
          <Input
            type="datetime-local"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="flex-1 text-sm"
            data-testid={`input-schedule-date-${comm.id}`}
          />
          <Button
            size="sm"
            onClick={() => scheduleComm.mutate()}
            disabled={!scheduleDate || scheduleComm.isPending}
            data-testid={`confirm-schedule-${comm.id}`}
          >
            {scheduleComm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5 mr-1" />}
            Schedule
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowSchedule(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1">
        {isEditing ? (
          <>
            <Button
              size="sm"
              onClick={() => editComm.mutate()}
              disabled={editComm.isPending}
              data-testid={`save-comm-edit-${comm.id}`}
            >
              {editComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={startEditing}
              data-testid={`edit-comm-modal-${comm.id}`}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              onClick={() => approveComm.mutate()}
              disabled={approveComm.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid={`approve-send-comm-${comm.id}`}
            >
              {approveComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              Approve & Send
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSchedule(!showSchedule)}
              data-testid={`schedule-comm-${comm.id}`}
            >
              <Calendar className="h-3.5 w-3.5 mr-1" />
              Schedule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => discardComm.mutate()}
              disabled={discardComm.isPending}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              data-testid={`discard-comm-modal-${comm.id}`}
            >
              {discardComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AIReviewResultsModal({
  open,
  onClose,
  dealId,
  deal,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  deal: any;
}) {
  const { toast } = useToast();

  const { data: docsData, isLoading: docsLoading } = useQuery<{ documents: any[] }>({
    queryKey: ["/api/admin/deals", dealId, "documents", "review-modal"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/${dealId}/documents`, { credentials: "include" });
      if (!res.ok) return { documents: [] };
      return res.json();
    },
    enabled: open && !!dealId,
  });

  const { data: commsData, isLoading: commsLoading } = useQuery<AgentCommunication[]>({
    queryKey: ["/api/projects", dealId, "agent-communications", "review-modal"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${dealId}/agent-communications`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!dealId,
  });

  const documents = docsData?.documents ?? [];
  const communications = Array.isArray(commsData) ? commsData : [];
  const draftComms = communications.filter((c) => c.status === "draft");

  const reviewedDocs = documents.filter((d: any) => d.filePath || d.fileUrl);
  const passedDocs = reviewedDocs.filter((d: any) => d.aiReviewStatus === "approved");
  const failedDocs = reviewedDocs.filter((d: any) => d.aiReviewStatus === "denied");
  const pendingDocs = reviewedDocs.filter((d: any) => d.aiReviewStatus !== "approved" && d.aiReviewStatus !== "denied");

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents", "review-modal"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", dealId, "agent-communications", "review-modal"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/deals", dealId, "documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", dealId, "agent-communications"] });
  };

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const promises: Promise<any>[] = [];
      promises.push(
        apiRequest("POST", `/api/admin/deals/${dealId}/documents/approve-all`)
      );
      for (const comm of draftComms) {
        promises.push(
          apiRequest("PUT", `/api/projects/${dealId}/agent-communications/${comm.id}/approve`)
        );
      }
      return Promise.all(promises);
    },
    onSuccess: () => {
      invalidateData();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId] });
      toast({ title: "All items approved", description: "Documents approved and messages queued for sending." });
      onClose();
    },
    onError: () => toast({ title: "Some approvals failed", variant: "destructive" }),
  });

  const isLoading = docsLoading || commsLoading;

  const handleClose = () => {
    invalidateData();
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-[70vw] max-h-[85vh] flex flex-col p-0 gap-0"
        data-testid="ai-review-results-modal"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-[22px] flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            AI Review Complete — Action Required
          </DialogTitle>
          <p className="text-[14px] text-muted-foreground mt-1">
            Review the AI analysis results below. Approve documents, edit or send messages, then confirm.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
              <span className="text-[16px] text-muted-foreground">Loading review results...</span>
            </div>
          ) : (
            <>
              <div data-testid="section-document-results">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[16px] font-semibold flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-blue-600" />
                    Document Review Results
                  </h3>
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
                    {pendingDocs.length > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> {pendingDocs.length} pending
                      </span>
                    )}
                  </div>
                </div>
                {reviewedDocs.length === 0 ? (
                  <div className="text-[14px] text-muted-foreground py-4 text-center border rounded-lg bg-muted/20">
                    No documents with files to review.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reviewedDocs.map((doc: any) => (
                      <DocumentReviewRow
                        key={doc.id}
                        doc={doc}
                        dealId={dealId}
                        onStatusChange={invalidateData}
                      />
                    ))}
                  </div>
                )}
              </div>

              {(draftComms.length > 0 || communications.length > 0) && (
                <div data-testid="section-communication-results">
                  <h3 className="text-[16px] font-semibold flex items-center gap-2 mb-3">
                    <Mail className="h-4.5 w-4.5 text-blue-600" />
                    AI-Generated Messages
                    {draftComms.length > 0 && (
                      <Badge variant="secondary" className="text-[11px]">{draftComms.length} draft{draftComms.length !== 1 ? "s" : ""}</Badge>
                    )}
                  </h3>
                  {draftComms.length === 0 ? (
                    <div className="text-[14px] text-muted-foreground py-4 text-center border rounded-lg bg-muted/20">
                      No draft messages to review.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {draftComms.map((comm) => (
                        <CommunicationReviewCard
                          key={comm.id}
                          comm={comm}
                          dealId={dealId}
                          onStatusChange={invalidateData}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t px-6 py-4 flex items-center justify-between gap-3 shrink-0 bg-muted/30">
          <Button variant="outline" onClick={handleClose} data-testid="close-review-modal">
            Close
          </Button>
          <Button
            onClick={() => approveAllMutation.mutate()}
            disabled={approveAllMutation.isPending || isLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
            data-testid="approve-all-close"
          >
            {approveAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Approve All & Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

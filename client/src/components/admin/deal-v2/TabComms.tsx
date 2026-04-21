import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Activity, Mail, Settings, Plus, StickyNote, Zap, CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/utils";


function getDigestDotColor(type: string | undefined): string {
  switch (type) {
    case "welcome": return "bg-blue-500";
    case "digest":
    case "weekly": return "bg-blue-400";
    case "portal": return "bg-green-500";
    case "document_request": return "bg-green-500";
    case "stage_update": return "bg-blue-500";
    default: return "bg-blue-400";
  }
}

function getActivityDotColor(type: string | undefined): string {
  switch (type) {
    case "stage_change": return "bg-orange-400";
    case "document_review":
    case "ai_review": return "bg-orange-400";
    case "note": return "bg-orange-400";
    case "task_updated":
    case "task_completed": return "bg-blue-500";
    case "system": return "bg-green-500";
    default: return "bg-orange-400";
  }
}

interface DealAutomationRun {
  id: number;
  automationId: number;
  automationName: string;
  status: string;
  startedAt: string;
  exitReason: string | null;
  currentStep: number | null;
  currentStepLabel: string;
}

function runStatusBadge(status: string) {
  switch (status) {
    case "running":
      return <Badge className="gap-1 bg-blue-500/10 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 animate-spin" />Running</Badge>;
    case "completed":
      return <Badge className="gap-1 bg-green-500/10 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" />Completed</Badge>;
    case "exited":
      return <Badge className="gap-1 bg-orange-500/10 text-orange-700 border-orange-200"><XCircle className="w-3 h-3" />Exited</Badge>;
    case "failed":
      return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function TabComms({
  deal,
  activities,
  dealId,
}: {
  deal: any;
  activities: any[];
  dealId: string;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role && ["admin", "staff", "super_admin"].includes(user.role);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");

  const { data: automationRuns = [] } = useQuery<DealAutomationRun[]>({
    queryKey: ["/api/comms/deal-runs", dealId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/comms/deal-runs/${dealId}`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch { return []; }
    },
    enabled: !!dealId,
    refetchInterval: 30000,
  });

  const apiBase = isAdmin ? `/api/admin/deals` : `/api/deals`;

  const { data: notesData, refetch: refetchNotes } = useQuery<{ notes: any[] }>({
    queryKey: [apiBase, dealId, "notes"],
    queryFn: async () => {
      try {
        const res = await fetch(`${apiBase}/${dealId}/notes`, { credentials: "include" });
        if (!res.ok) return { notes: [] };
        return res.json();
      } catch {
        return { notes: [] };
      }
    },
    enabled: !!dealId,
  });
  const notes = notesData?.notes ?? [];

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `${apiBase}/${dealId}/notes`, {
        content,
        noteType: "general",
      });
    },
    onSuccess: () => {
      setNoteContent("");
      setShowAddNote(false);
      refetchNotes();
      queryClient.invalidateQueries({ queryKey: [apiBase, dealId] });
      toast({ title: "Note added" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  const digestEntries = activities
    .filter(a => {
      const desc = (a.activityDescription || a.description || "").toLowerCase();
      return desc.includes("email") || desc.includes("digest") || desc.includes("sent") ||
             desc.includes("portal") || desc.includes("welcome") || desc.includes("notification");
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const activityEntries = activities
    .filter(a => {
      const desc = (a.activityDescription || a.description || "").toLowerCase();
      const type = (a.activityType || "").toLowerCase();
      return type.includes("task") ||
             desc.includes("moved") || desc.includes("stage") || desc.includes("review") ||
             desc.includes("approved") || desc.includes("rejected") || desc.includes("updated") ||
             desc.includes("created") || desc.includes("assigned") || desc.includes("note") ||
             desc.includes("document") || desc.includes("uploaded") || desc.includes("task") ||
             desc.includes("completed") || desc.includes("marked");
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

      {/* Row 0: Active Automations (full-width) */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-[17px] flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            Active Automations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {automationRuns.length === 0 ? (
            <div className="text-center py-4">
              <Zap className="h-7 w-7 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No automations running on this deal</p>
            </div>
          ) : (
            <div className="divide-y">
              {automationRuns.map(run => (
                <div key={run.id} className="flex items-center justify-between py-3 gap-4" data-testid={`row-automation-run-${run.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold truncate">{run.automationName}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[13px] text-muted-foreground">
                      {run.status === "running" && run.currentStep != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Step {run.currentStep} — {run.currentStepLabel}
                        </span>
                      )}
                      {run.status !== "running" && run.exitReason && (
                        <span>Exit: {run.exitReason.replace(/_/g, " ")}</span>
                      )}
                      <span>· Started {formatDateTime(run.startedAt)}</span>
                    </div>
                  </div>
                  <div className="shrink-0">{runStatusBadge(run.status)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 1, Left: Email Digests */}
      <Card className="flex flex-col min-h-[350px]">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[17px] flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Email Digests
          </CardTitle>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7" data-testid="button-configure-digests">
            <Settings className="h-3 w-3" />
            Configure
          </Button>
        </CardHeader>
        <CardContent className="flex-1">
          {digestEntries.length === 0 ? (
            <div className="text-center py-6">
              <Mail className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No email digests sent yet</p>
              <p className="text-xs text-muted-foreground mt-1">Digests will appear here when emails are sent to the borrower</p>
            </div>
          ) : (
            <div className="space-y-0 max-h-[280px] overflow-y-auto">
              {digestEntries.slice(0, 10).map((entry, idx) => {
                const desc = entry.activityDescription || entry.description || "";
                const parts = desc.split(" — ");
                const title = parts[0] || desc;
                const subtitle = parts[1] || "";

                return (
                  <div key={entry.id || idx} className="flex items-start gap-3 py-3 border-b last:border-0">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${getDigestDotColor(entry.activityType)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-foreground leading-snug">{title}</p>
                      <p className="text-[14px] text-muted-foreground mt-0.5">
                        {formatDateTime(entry.createdAt)}
                        {subtitle && ` — ${subtitle}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 1, Right: Notes */}
      <Card className="flex flex-col min-h-[350px]">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[17px] flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            Notes
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 h-7"
            onClick={() => setShowAddNote(!showAddNote)}
            data-testid="button-add-note"
          >
            <Plus className="h-3 w-3" />
            Add Note
          </Button>
        </CardHeader>
        <CardContent className="flex-1">
          {showAddNote && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg space-y-2">
              <Textarea
                placeholder="Write a note..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="text-[16px] min-h-[70px] resize-none bg-white"
                data-testid="input-note-content"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => { setShowAddNote(false); setNoteContent(""); }}
                  data-testid="button-cancel-note"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-7"
                  disabled={!noteContent.trim() || addNoteMutation.isPending}
                  onClick={() => addNoteMutation.mutate(noteContent)}
                  data-testid="button-save-note"
                >
                  {addNoteMutation.isPending ? "Saving..." : "Save Note"}
                </Button>
              </div>
            </div>
          )}

          {notes.length === 0 && !showAddNote ? (
            <div className="text-center py-6">
              <StickyNote className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No notes yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add notes to track important details about this deal</p>
            </div>
          ) : (
            <div className="space-y-0 max-h-[280px] overflow-y-auto">
              {notes.map((n: any) => (
                <div key={n.id} className="flex items-start gap-3 py-3 border-b last:border-0">
                  <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 bg-orange-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-semibold text-foreground leading-snug">{n.content}</p>
                    <p className="text-[14px] text-muted-foreground mt-0.5">
                      {n.authorFullName || n.authorEmail || "User"} · {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 2, Full Width: Activity */}
      <Card className="flex flex-col min-h-[350px] md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-[17px] flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          {activityEntries.length === 0 ? (
            <div className="text-center py-6">
              <Activity className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">Activity will be logged as the deal progresses</p>
            </div>
          ) : (
            <div className="space-y-0 max-h-[280px] overflow-y-auto">
              {activityEntries.slice(0, 15).map((entry, idx) => {
                const description = entry.activityDescription || entry.description || '';
                const actorName: string | null | undefined = entry.actorName;
                const descriptionHasActor = actorName && description.includes(actorName);
                return (
                  <div key={entry.id || idx} className="flex items-start gap-3 py-3 border-b last:border-0">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${getActivityDotColor(entry.activityType)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-foreground leading-snug">
                        {description}
                      </p>
                      {actorName && !descriptionHasActor && (
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                          by {actorName}
                        </p>
                      )}
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

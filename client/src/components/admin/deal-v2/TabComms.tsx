import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Send, MessageSquare, Activity, Mail, Settings, Plus, StickyNote
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/phase1/empty-state";
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
  const [newMessage, setNewMessage] = useState("");

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

  const { data: threadsData, refetch: refetchThreads } = useQuery<{ threads: any[] }>({
    queryKey: ["/api/messages/threads", { dealId }],
    queryFn: async () => {
      const res = await fetch(`/api/messages/threads?dealId=${dealId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch threads");
      return res.json();
    },
    enabled: !!dealId,
    refetchInterval: dealId ? 5000 : false,
  });

  const currentThread = threadsData?.threads?.[0];

  const { data: threadMessagesData, refetch: refetchMessages } = useQuery<{ thread: any; messages: any[] }>({
    queryKey: ["/api/messages/threads", currentThread?.id],
    queryFn: async () => {
      const res = await fetch(`/api/messages/threads/${currentThread!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!currentThread?.id,
    refetchInterval: currentThread?.id ? 5000 : false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ threadId, body }: { threadId: number; body: string }) => {
      return apiRequest("POST", `/api/messages/threads/${threadId}/messages`, { body, type: "message" });
    },
    onSuccess: () => {
      setNewMessage("");
      refetchMessages();
      refetchThreads();
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const threadRes = await apiRequest("POST", "/api/messages/threads", {
        dealId: Number(dealId),
        userId: user!.id,
        subject: "Message about loan",
      });
      const threadData = await threadRes.json();
      await apiRequest("POST", `/api/messages/threads/${threadData.thread.id}/messages`, {
        body: message,
        type: "message",
      });
      return threadData;
    },
    onSuccess: () => {
      setNewMessage("");
      refetchThreads();
      toast({ title: "Message sent" });
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const messages = (threadMessagesData?.messages || []).filter(
    (m: any) => m.type !== 'notification' && m.senderRole !== 'system'
  );

  const handleSend = () => {
    if (!newMessage.trim()) return;
    if (currentThread) {
      sendMessageMutation.mutate({ threadId: currentThread.id, body: newMessage });
    } else {
      createThreadMutation.mutate({ message: newMessage });
    }
  };

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

      {/* Row 2, Left: Messages */}
      <Card className="flex flex-col min-h-[350px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[17px] flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Messages
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 mb-3">
            {messages.length === 0 && !currentThread ? (
              <div className="text-center py-6">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">Start a conversation about this deal</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {messages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-[16px] ${
                        msg.senderId === user?.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.senderName && msg.senderId !== user?.id && (
                        <p className="text-[13px] font-medium mb-0.5 opacity-70">{msg.senderName}</p>
                      )}
                      <p>{msg.body}</p>
                      <p className="text-[12px] mt-1 opacity-60">
                        {formatDateTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Textarea
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="text-[16px] min-h-[60px] resize-none"
              data-testid="input-message-content"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="sm"
              className="self-end"
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMessageMutation.isPending || createThreadMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Row 2, Right: Activity */}
      <Card className="flex flex-col min-h-[350px]">
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
              {activityEntries.slice(0, 15).map((entry, idx) => (
                <div key={entry.id || idx} className="flex items-start gap-3 py-3 border-b last:border-0">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${getActivityDotColor(entry.activityType)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-semibold text-foreground leading-snug">
                      {entry.activityDescription || entry.description}
                    </p>
                    <p className="text-[14px] text-muted-foreground mt-0.5">
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

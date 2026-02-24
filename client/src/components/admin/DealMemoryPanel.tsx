import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Brain,
  MessageSquare,
  FileText,
  ArrowRightLeft,
  Mail,
  StickyNote,
  Send,
  Pin,
  PinOff,
  Trash2,
  Loader2,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  AtSign,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DealMemoryPanelProps {
  dealId: number;
  projectId: number | null;
  collapsed?: boolean;
  onToggle: () => void;
}

interface MemoryEntry {
  id: number;
  dealId: number;
  entryType: string;
  title: string;
  description: string | null;
  metadata: any;
  sourceType: string | null;
  sourceUserId: number | null;
  sourceUserName: string | null;
  sourceUserFullName: string | null;
  sourceUserEmail: string | null;
  createdAt: string;
}

interface DealNote {
  id: number;
  dealId: number;
  userId: number;
  content: string;
  noteType: string;
  mentions: any;
  isPinned: boolean;
  parentNoteId: number | null;
  createdAt: string;
  updatedAt: string;
  authorId: number | null;
  authorFullName: string | null;
  authorEmail: string | null;
  authorRole: string | null;
}

interface TeamMember {
  id: number;
  fullName: string | null;
  email: string;
  role: string;
}

const ENTRY_TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  document_received: { icon: FileText, color: "text-success", label: "Document Received" },
  document_approved: { icon: CheckCircle2, color: "text-success", label: "Document Approved" },
  document_rejected: { icon: XCircle, color: "text-destructive", label: "Document Rejected" },
  stage_change: { icon: ArrowRightLeft, color: "text-info", label: "Stage Changed" },
  communication_approved: { icon: MessageSquare, color: "text-primary", label: "Communication Approved" },
  digest_approved: { icon: CheckCircle2, color: "text-primary", label: "Communication Approved" },
  digest_sent: { icon: Mail, color: "text-primary", label: "Communication Sent" },
  digest_skipped: { icon: Mail, color: "text-muted-foreground", label: "Communication Skipped" },
  note_added: { icon: StickyNote, color: "text-warning", label: "Note Added" },
  field_change: { icon: ArrowRightLeft, color: "text-muted-foreground", label: "Field Changed" },
};

function getEntryConfig(type: string) {
  return ENTRY_TYPE_CONFIG[type] || { icon: Clock, color: "text-muted-foreground", label: type.replace(/_/g, " ") };
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Exact time portion (always shown)
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  // Relative label for context
  if (diffMins < 1) return `Just now · ${timeStr}`;
  if (diffMins < 60) return `${diffMins}m ago · ${timeStr}`;
  if (diffHours < 24) return `${diffHours}h ago · ${timeStr}`;
  // For older entries, show full date + time
  const dateStr2 = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
  return `${dateStr2} at ${timeStr}`;
}

export function DealMemoryPanel({ dealId, projectId, collapsed, onToggle }: DealMemoryPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("memory");
  const [noteInput, setNoteInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const [seeded, setSeeded] = useState(false);

  const { data: memoryData, isLoading: memoryLoading } = useQuery<{ entries: MemoryEntry[] }>({
    queryKey: ["/api/admin/deals", dealId, "memory"],
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!memoryLoading && memoryData && memoryData.entries.length === 0 && !seeded) {
      setSeeded(true);
      apiRequest("POST", `/api/admin/deals/${dealId}/memory/seed`).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "memory"] });
      }).catch(() => {
        setSeeded(false);
      });
    }
  }, [memoryLoading, memoryData, dealId, seeded]);

  const { data: notesData, isLoading: notesLoading } = useQuery<{ notes: DealNote[] }>({
    queryKey: ["/api/admin/deals", dealId, "notes"],
    refetchInterval: 10000,
  });

  const { data: teamData } = useQuery<{ members: TeamMember[] }>({
    queryKey: ["/api/admin/deals", dealId, "team"],
  });

  const entries = memoryData?.entries || [];
  const notes = notesData?.notes || [];
  const teamMembers = teamData?.members || [];
  const pinnedNotes = notes.filter((n) => n.isPinned);

  useEffect(() => {
    if (activeTab === "notes" && notesEndRef.current) {
      notesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [notes.length, activeTab]);

  const createNoteMutation = useMutation({
    mutationFn: async (data: { content: string; noteType?: string; mentions?: any[] }) => {
      const res = await apiRequest("POST", `/api/admin/deals/${dealId}/notes`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "memory"] });
      setNoteInput("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ noteId, isPinned }: { noteId: number; isPinned: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/deals/${dealId}/notes/${noteId}`, { isPinned });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "notes"] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/deals/${dealId}/notes/${noteId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "memory"] });
    },
  });

  const handleNoteInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setNoteInput(val);

      const cursorPos = e.target.selectionStart || 0;
      setMentionCursorPos(cursorPos);

      const textBeforeCursor = val.substring(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);
      if (atMatch) {
        setShowMentions(true);
        setMentionSearch(atMatch[1].toLowerCase());
      } else {
        setShowMentions(false);
        setMentionSearch("");
      }
    },
    []
  );

  const handleMentionSelect = useCallback(
    (member: TeamMember) => {
      const textBeforeCursor = noteInput.substring(0, mentionCursorPos);
      const textAfterCursor = noteInput.substring(mentionCursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");
      const name = member.fullName || member.email.split("@")[0];
      const newText = textBeforeCursor.substring(0, atIndex) + `@${name} ` + textAfterCursor;
      setNoteInput(newText);
      setShowMentions(false);
      noteInputRef.current?.focus();
    },
    [noteInput, mentionCursorPos]
  );

  const handleSendNote = useCallback(() => {
    if (!noteInput.trim()) return;

    const mentionMatches = noteInput.match(/@[\w\s]+/g) || [];
    const mentions = mentionMatches
      .map((m) => {
        const name = m.substring(1).trim();
        const member = teamMembers.find(
          (tm) =>
            (tm.fullName || "").toLowerCase() === name.toLowerCase() ||
            tm.email.split("@")[0].toLowerCase() === name.toLowerCase()
        );
        return member ? { userId: member.id, username: member.fullName || member.email } : null;
      })
      .filter(Boolean);

    const isAiInstruction = noteInput.toLowerCase().startsWith("/ai ") || noteInput.toLowerCase().startsWith("/instruct ");
    createNoteMutation.mutate({
      content: noteInput,
      noteType: isAiInstruction ? "ai_instruction" : "note",
      mentions,
    });
  }, [noteInput, teamMembers, createNoteMutation]);

  const filteredMembers = teamMembers.filter((m) => {
    const name = (m.fullName || m.email).toLowerCase();
    return name.includes(mentionSearch);
  });

  const groupEntriesByDate = (entries: MemoryEntry[]) => {
    const groups: Record<string, MemoryEntry[]> = {};
    for (const entry of entries) {
      const date = new Date(entry.createdAt);
      const today = new Date();
      const yesterday = new Date(Date.now() - 86400000);
      let key: string;
      if (date.toDateString() === today.toDateString()) key = "Today";
      else if (date.toDateString() === yesterday.toDateString()) key = "Yesterday";
      else key = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    return groups;
  };

  // Filter out plain notes from timeline — keep notes with @mentions
  const timelineEntries = entries.filter((entry) => {
    if (entry.entryType === "note_added") {
      // Keep note in timeline only if it has @mentions
      const hasMentions = entry.description?.includes("@") || entry.title?.includes("@") ||
        (entry.metadata?.mentions && Array.isArray(entry.metadata.mentions) && entry.metadata.mentions.length > 0);
      return hasMentions;
    }
    return true;
  });

  const groupedEntries = groupEntriesByDate(timelineEntries);

  function renderHighlightedContent(content: string) {
    const parts = content.split(/(@[\w\s]+?)(?=\s|$)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="text-primary font-medium">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center h-full border-l bg-background py-2" data-testid="deal-memory-panel-collapsed">
        <Button size="icon" variant="ghost" onClick={onToggle} data-testid="button-expand-memory">
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground font-medium" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            Deal Memory
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-l bg-background" data-testid="deal-memory-panel">
      <div className="flex items-center justify-between p-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Deal Memory</h3>
        </div>
        <Button size="icon" variant="ghost" onClick={onToggle} data-testid="button-collapse-memory">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full rounded-none border-b h-9 flex-shrink-0">
          <TabsTrigger value="memory" className="flex-1 text-xs gap-1" data-testid="tab-memory">
            <Brain className="h-3 w-3" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-1 text-xs gap-1" data-testid="tab-notes">
            <MessageSquare className="h-3 w-3" />
            Notes
            {notes.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1 py-0">
                {notes.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="memory" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">
              {memoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No memory entries yet.</p>
                  <p className="text-xs mt-1">Events will appear here as the deal progresses.</p>
                </div>
              ) : (
                Object.entries(groupedEntries).map(([dateLabel, dateEntries]) => (
                  <div key={dateLabel}>
                    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-1 mb-2">
                      <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
                    </div>
                    <div className="space-y-1">
                      {dateEntries.map((entry) => {
                        const config = getEntryConfig(entry.entryType);
                        const Icon = config.icon;
                        return (
                          <div
                            key={entry.id}
                            className="flex gap-2 py-1.5 group"
                            data-testid={`memory-entry-${entry.id}`}
                          >
                            <div className={cn("flex-shrink-0 mt-0.5", config.color)}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium leading-tight">
                                {entry.title}
                                {(entry.sourceUserFullName || entry.sourceUserName) && (
                                  <span className="text-muted-foreground font-normal"> — {entry.sourceUserFullName || entry.sourceUserName}</span>
                                )}
                              </p>
                              {entry.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                                  {entry.description}
                                </p>
                              )}
                              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                {formatRelativeTime(entry.createdAt)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="notes" className="flex-1 m-0 flex flex-col min-h-0">
          {pinnedNotes.length > 0 && (
            <div className="border-b px-3 py-2 bg-muted/30 flex-shrink-0">
              <div className="flex items-center gap-1 mb-1">
                <Pin className="h-3 w-3 text-warning" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pinned</span>
              </div>
              {pinnedNotes.map((note) => (
                <div key={note.id} className="text-xs text-muted-foreground py-0.5 line-clamp-1">
                  <span className="font-medium text-foreground">{note.authorFullName || "Unknown"}:</span>{" "}
                  {note.content}
                </div>
              ))}
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              {notesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No notes yet.</p>
                  <p className="text-xs mt-1">Add notes, tag team members with @, or instruct the AI with /ai.</p>
                </div>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className={cn(
                      "group relative",
                      note.noteType === "ai_instruction" && "bg-primary/5 rounded-lg p-2 -mx-1"
                    )}
                    data-testid={`deal-note-${note.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                        {note.noteType === "ai_instruction" ? (
                          <Brain className="h-3 w-3 text-primary" />
                        ) : (
                          <User className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{note.authorFullName || "Unknown"}</span>
                          {note.noteType === "ai_instruction" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">AI Instruction</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(note.createdAt)}
                          </span>
                        </div>
                        <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">
                          {renderHighlightedContent(note.content)}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 invisible group-hover:visible flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => togglePinMutation.mutate({ noteId: note.id, isPinned: !note.isPinned })}
                          data-testid={`button-pin-note-${note.id}`}
                        >
                          {note.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => deleteNoteMutation.mutate(note.id)}
                          data-testid={`button-delete-note-${note.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={notesEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-3 flex-shrink-0 relative">
            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-1 bg-popover border rounded-lg shadow-lg max-h-[200px] overflow-y-auto z-50">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover-elevate cursor-pointer text-left"
                    onClick={() => handleMentionSelect(member)}
                    data-testid={`mention-option-${member.id}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <AtSign className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-xs">{member.fullName || member.email}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{member.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                ref={noteInputRef}
                value={noteInput}
                onChange={handleNoteInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendNote();
                  }
                  if (e.key === "Escape") {
                    setShowMentions(false);
                  }
                }}
                placeholder="Add a note, @mention, or /ai instruction..."
                className="min-h-[36px] max-h-[120px] text-sm resize-none"
                data-testid="input-deal-note"
              />
              <Button
                size="icon"
                onClick={handleSendNote}
                disabled={!noteInput.trim() || createNoteMutation.isPending}
                data-testid="button-send-note"
              >
                {createNoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Use @ to mention team members. Start with /ai to instruct the AI.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

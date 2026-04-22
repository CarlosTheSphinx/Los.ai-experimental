import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail,
  Search,
  Paperclip,
  RefreshCw,
  Loader2,
  ChevronLeft,
  Send,
  Plus,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { safeFormat, safeRelativeTime } from "@/lib/utils";

interface EmailThread {
  id: number;
  gmailThreadId: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  fromName: string | null;
  participants: string[] | null;
  messageCount: number;
  hasAttachments: boolean;
  isUnread: boolean;
  lastMessageAt: string | null;
}

interface EmailMessage {
  id: number;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[] | null;
  ccAddresses: string[] | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> | null;
  internalDate: string | null;
  isUnread: boolean;
}

function ConnectGmailPrompt() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center space-y-5">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Mail className="w-8 h-8 text-primary" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-semibold">Connect your Gmail</h2>
        <p className="text-sm text-muted-foreground">
          Manage your prospect email conversations inside Lendry without switching to Gmail.
        </p>
      </div>
      <Button
        onClick={() => {
          window.location.href = `/api/google/connect?returnTo=/broker/email`;
        }}
        data-testid="button-connect-gmail"
        className="gap-2"
      >
        <ExternalLink className="w-4 h-4" />
        Connect Gmail
      </Button>
      <p className="text-xs text-muted-foreground">
        Or connect via{" "}
        <button
          className="underline"
          onClick={() => setLocation("/settings?tab=integrations")}
        >
          Settings → Integrations
        </button>
      </p>
    </div>
  );
}

function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  searchQuery,
  onSearchChange,
  isLoading,
  onSync,
  isSyncing,
}: {
  threads: EmailThread[];
  activeThreadId: number | null;
  onSelect: (id: number) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isLoading: boolean;
  onSync: () => void;
  isSyncing: boolean;
}) {
  const unreadCount = threads.filter((t) => t.isUnread).length;

  return (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Inbox</span>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0" data-testid="badge-unread-count">
                {unreadCount}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onSync}
            disabled={isSyncing}
            data-testid="button-sync-email"
            title="Sync emails"
          >
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-email-search"
          />
        </div>
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <Mail className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No emails yet</p>
            <p className="text-xs text-muted-foreground">Click sync to load your Gmail threads</p>
          </div>
        ) : (
          <div className="divide-y">
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onSelect(thread.id)}
                data-testid={`thread-item-${thread.id}`}
                className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${
                  activeThreadId === thread.id ? "bg-accent" : ""
                } ${thread.isUnread ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span
                    className={`text-sm truncate ${
                      thread.isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                    }`}
                  >
                    {thread.fromName || thread.fromAddress || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {thread.lastMessageAt ? safeRelativeTime(thread.lastMessageAt) : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  {thread.isUnread && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  )}
                  <span className={`text-xs truncate ${thread.isUnread ? "font-medium" : "text-muted-foreground"}`}>
                    {thread.subject || "(No Subject)"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{thread.snippet || ""}</p>
                <div className="flex items-center gap-2 mt-1">
                  {thread.hasAttachments && (
                    <Paperclip className="w-3 h-3 text-muted-foreground" />
                  )}
                  {thread.messageCount > 1 && (
                    <span className="text-xs text-muted-foreground">{thread.messageCount} messages</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MessageBody({ message, myEmail }: { message: EmailMessage; myEmail: string }) {
  const isFromMe = message.fromAddress?.toLowerCase() === myEmail.toLowerCase();

  return (
    <div className={`py-4 ${isFromMe ? "pl-8" : ""}`} data-testid={`message-${message.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-medium text-sm">
            {message.fromName || message.fromAddress}
          </span>
          <div className="text-xs text-muted-foreground mt-0.5">
            To: {(message.toAddresses as string[] | null)?.join(", ") || ""}
            {message.ccAddresses && (message.ccAddresses as string[]).length > 0 && (
              <span> · CC: {(message.ccAddresses as string[]).join(", ")}</span>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {message.internalDate ? safeFormat(message.internalDate, "MMM d, h:mm a") : ""}
        </span>
      </div>

      {message.bodyHtml ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none text-sm overflow-auto"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.bodyHtml) }}
        />
      ) : (
        <pre className="text-sm whitespace-pre-wrap font-sans">{message.bodyText || message.snippet}</pre>
      )}

      {message.attachments && (message.attachments as unknown[]).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(message.attachments as Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>).map((att) => (
            <div
              key={att.attachmentId}
              className="flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded"
            >
              <Paperclip className="w-3 h-3" />
              <span>{att.filename}</span>
              <span className="text-muted-foreground">
                ({Math.round(att.size / 1024)} KB)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComposeModal({
  open,
  onClose,
  contacts,
  accountEmail,
}: {
  open: boolean;
  onClose: () => void;
  contacts: Array<{ id: number; firstName: string; lastName: string; email?: string }>;
  accountEmail: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { mutate: sendEmail, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/email/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to, subject, body }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads"] });
      setTo(""); setSubject(""); setBody("");
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="compose-to" className="text-xs font-medium">To</Label>
            <Input
              id="compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              list="compose-contacts"
              data-testid="input-compose-to"
              className="mt-1"
            />
            {contacts.length > 0 && (
              <datalist id="compose-contacts">
                {contacts.filter((c) => c.email).map((c) => (
                  <option key={c.id} value={c.email!}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </datalist>
            )}
          </div>
          <div>
            <Label htmlFor="compose-subject" className="text-xs font-medium">Subject</Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              data-testid="input-compose-subject"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="compose-body" className="text-xs font-medium">Message</Label>
            <Textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={8}
              data-testid="textarea-compose-body"
              className="mt-1 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => sendEmail()}
            disabled={isPending || !to || !subject || !body}
            data-testid="button-send-email"
            className="gap-2"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BrokerInboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const urlThreadId = searchParams.get("threadId");

  const [searchQuery, setSearchQuery] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<number | null>(
    urlThreadId ? parseInt(urlThreadId) : null
  );
  const [replyBody, setReplyBody] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle OAuth redirect params
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "google_connected" || success === "email_connected") {
      toast({ title: "Gmail Connected", description: "Your Gmail account has been connected. Syncing emails now..." });
      syncMutation.mutate();
      window.history.replaceState({}, "", "/broker/email");
    }
    if (error) {
      toast({ title: "Connection Failed", description: "Could not connect Gmail. Please try again.", variant: "destructive" });
      window.history.replaceState({}, "", "/broker/email");
    }
  }, []);

  // Account status
  const { data: accountData, isLoading: accountLoading } = useQuery<{ account: any }>({
    queryKey: ["/api/email/account"],
  });
  const account = accountData?.account;

  // Threads list
  const { data: threadsData, isLoading: threadsLoading } = useQuery<{ threads: EmailThread[]; total: number }>({
    queryKey: ["/api/email/threads", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/email/threads?${params}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!account,
    refetchInterval: 60000,
  });

  const threads = threadsData?.threads || [];

  // Thread detail
  const { data: threadDetail, isLoading: detailLoading } = useQuery<{
    thread: EmailThread;
    messages: EmailMessage[];
  }>({
    queryKey: ["/api/email/threads", activeThreadId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/email/threads/${activeThreadId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!activeThreadId,
  });

  // Contacts for compose autocomplete
  const { data: contactsData } = useQuery<{ contacts: Array<{ id: number; firstName: string; lastName: string; email?: string }> }>({
    queryKey: ["broker-contacts-for-compose"],
    queryFn: async () => {
      const res = await fetch("/api/broker/contacts?limit=500", { credentials: "include" });
      return res.json();
    },
  });

  // Sync mutation
  const { mutate: syncMutation, isPending: isSyncing } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Synced", description: `${data.synced} threads synced` });
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads"] });
    },
    onError: () => {
      toast({ title: "Sync failed", description: "Could not sync Gmail", variant: "destructive" });
    },
  });

  // Mark as read when opening thread
  const { mutate: markRead } = useMutation({
    mutationFn: async (threadId: number) => {
      await fetch(`/api/email/threads/${threadId}/read`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads"] });
    },
  });

  // Reply mutation
  const { mutate: sendReply, isPending: isReplying } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/email/threads/${activeThreadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: replyBody }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send reply");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reply sent" });
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", activeThreadId, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads"] });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    },
  });

  const handleSelectThread = (threadId: number) => {
    setActiveThreadId(threadId);
    setReplyBody("");
    markRead(threadId);
  };

  // Scroll to bottom of messages when thread changes
  useEffect(() => {
    if (threadDetail?.messages) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [threadDetail?.messages]);

  // Loading state
  if (accountLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not connected — show prompt
  if (!account) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto pt-8 px-4">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Email Inbox</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your prospect email conversations</p>
          </div>
          <ConnectGmailPrompt />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div>
          <h1 className="text-xl font-bold">Email Inbox</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connected as <span className="font-medium">{account.emailAddress}</span>
            {account.lastSyncAt && (
              <> · Last synced {safeRelativeTime(account.lastSyncAt)}</>
            )}
          </p>
        </div>
        <Button
          onClick={() => setComposeOpen(true)}
          data-testid="button-compose-email"
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          New Email
        </Button>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thread list — fixed width */}
        <div className="w-80 shrink-0 overflow-hidden flex flex-col">
          <ThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelect={handleSelectThread}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isLoading={threadsLoading}
            onSync={() => syncMutation()}
            isSyncing={isSyncing}
          />
        </div>

        {/* Thread detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeThreadId ? (
            detailLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : threadDetail ? (
              <>
                {/* Thread header */}
                <div className="px-6 py-4 border-b shrink-0">
                  <button
                    onClick={() => setActiveThreadId(null)}
                    className="flex items-center gap-1 text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors md:hidden"
                    data-testid="button-back-to-threads"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Back
                  </button>
                  <h2 className="font-semibold text-base">{threadDetail.thread.subject || "(No Subject)"}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {threadDetail.thread.messageCount} message{threadDetail.thread.messageCount !== 1 ? "s" : ""}
                    {" · "}
                    {threadDetail.thread.participants?.slice(0, 3).join(", ")}
                  </p>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 px-6">
                  <div className="py-4 divide-y">
                    {threadDetail.messages.map((msg) => (
                      <MessageBody
                        key={msg.id}
                        message={msg}
                        myEmail={account.emailAddress}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Reply composer */}
                <div className="px-6 py-4 border-t shrink-0 space-y-3">
                  <Textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply..."
                    rows={3}
                    className="resize-none text-sm"
                    data-testid="textarea-reply-body"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => sendReply()}
                      disabled={isReplying || !replyBody.trim()}
                      data-testid="button-send-reply"
                      className="gap-2"
                    >
                      {isReplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Reply
                    </Button>
                  </div>
                </div>
              </>
            ) : null
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-3">
              <Mail className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm">Select a thread to read</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        contacts={contactsData?.contacts || []}
        accountEmail={account.emailAddress}
      />
    </div>
  );
}

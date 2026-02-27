import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquare,
  Send,
  User,
  Clock,
  Plus,
  MessageCircle,
  Briefcase,
  Star,
  Archive,
  Phone,
  FileText,
  MoreHorizontal,
  Mail,
  Link2,
  Paperclip,
  Inbox,
  Users,
  Save,
  Trash2,
  Tags,
  RefreshCw,
  X,
  Loader2,
  Search,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Play,
  Pencil,
  Eye,
  MapPin,
  Sparkles,
  File,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import {
  listThreads,
  getThread,
  sendMessage,
  markRead,
  createThread,
  type MessageThread,
  type Message
} from "@/lib/messagesApi";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import { MERGE_TAGS, type MessageTemplate } from "@shared/schema";
import TeamChat, { TeamChatDetail } from "@/components/TeamChat";

const QUICK_REPLIES = [
  { text: "Got it, thanks!", icon: CheckCircle2 },
  { text: "Request insurance binder", icon: FileText },
  { text: "Send Magic Link", icon: Sparkles },
  { text: "Can you send more details?", icon: MessageCircle },
];

export default function MessagesPage() {
  const { user } = useAuth();
  const { branding } = useBranding();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const urlDealId = searchParams.get('dealId');
  const openNew = searchParams.get('new') === 'true';
  const urlTab = searchParams.get('tab');

  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [isNewThreadDialogOpen, setIsNewThreadDialogOpen] = useState(false);
  const [newThreadSubject, setNewThreadSubject] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [initialMessage, setInitialMessage] = useState("");
  const [starredThreadIds, setStarredThreadIds] = useState<Set<number>>(new Set());
  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = useState(false);
  const [inboxTab, setInboxTab] = useState<'messages' | 'email' | 'digests' | 'team'>(urlTab === 'email' ? 'email' : urlTab === 'team' ? 'team' : 'messages');
  const [activeTeamChatId, setActiveTeamChatId] = useState<number | null>(null);
  const [statFilter, setStatFilter] = useState<'all' | 'unread' | 'needs_reply'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'in-app' | 'email' | 'team'>('all');
  const [activeEmailThreadId, setActiveEmailThreadId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [isMergeTagPopoverOpen, setIsMergeTagPopoverOpen] = useState(false);
  const [isLinkDealDialogOpen, setIsLinkDealDialogOpen] = useState(false);
  const [linkDealSelectedId, setLinkDealSelectedId] = useState("");
  const [inboxSearchQuery, setInboxSearchQuery] = useState("");
  const [emailSearchQuery, setEmailSearchQuery] = useState("");
  const [emailReplyText, setEmailReplyText] = useState("");
  const [emailLinkFilter, setEmailLinkFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [emailReadFilter, setEmailReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [digestDate, setDigestDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [editingDraft, setEditingDraft] = useState<any>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);

  const toggleStarred = (threadId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStarred = new Set(starredThreadIds);
    if (newStarred.has(threadId)) {
      newStarred.delete(threadId);
    } else {
      newStarred.add(threadId);
    }
    setStarredThreadIds(newStarred);
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const AVATAR_COLORS = [
    "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500",
    "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
  ];

  const getAvatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length];

  const STAGE_COLORS: Record<string, string> = {
    "lead": "bg-slate-400",
    "application": "bg-blue-400",
    "processing": "bg-amber-400",
    "underwriting": "bg-purple-400",
    "conditional_approval": "bg-cyan-400",
    "clear_to_close": "bg-emerald-400",
    "closing": "bg-green-500",
    "funded": "bg-green-600",
    "dead": "bg-red-400",
  };

  const formatStageName = (stage: string) =>
    stage.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const insertTemplate = (templateContent: string) => {
    setDraft(templateContent);
    setIsTemplatePopoverOpen(false);
  };

  const insertMergeTag = (tag: string) => {
    const input = messageInputRef.current;
    if (input) {
      const start = input.selectionStart ?? draft.length;
      const end = input.selectionEnd ?? draft.length;
      const newDraft = draft.slice(0, start) + tag + draft.slice(end);
      setDraft(newDraft);
      setIsMergeTagPopoverOpen(false);
      setTimeout(() => {
        input.focus();
        const newPos = start + tag.length;
        input.setSelectionRange(newPos, newPos);
      }, 0);
    } else {
      setDraft(draft + tag);
      setIsMergeTagPopoverOpen(false);
    }
  };

  const { data: templatesData, refetch: refetchTemplates } = useQuery<{ templates: MessageTemplate[] }>({
    queryKey: ["/api/message-templates"],
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; content: string; category?: string }) => {
      const res = await fetch('/api/message-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      refetchTemplates();
      setIsSaveTemplateOpen(false);
      setSaveTemplateName("");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/message-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      return res.json();
    },
    onSuccess: () => {
      refetchTemplates();
    },
  });

  const savedTemplates = templatesData?.templates || [];

  const { data: threadsData, isLoading: threadsLoading, refetch: refetchThreads } = useQuery({
    queryKey: ["/api/messages/threads"],
    queryFn: listThreads,
  });

  const { data: activeThreadData, isLoading: threadLoading, refetch: refetchThread } = useQuery({
    queryKey: ["/api/messages/threads", activeThreadId],
    queryFn: () => activeThreadId ? getThread(activeThreadId) : Promise.resolve(null),
    enabled: !!activeThreadId,
  });

  const { data: usersData } = useQuery<{ users: any[] }>({
    queryKey: ["/api/admin/users"],
    enabled: !!isAdmin,
  });

  const { data: quotesData } = useQuery<{ quotes: any[] }>({
    queryKey: ["/api/quotes"],
  });

  const { data: emailThreadsData, isLoading: emailThreadsLoading } = useQuery<{ threads: any[]; total: number }>({
    queryKey: ["/api/email/threads", "all"],
    queryFn: async () => {
      const res = await fetch('/api/email/threads', { credentials: 'include' });
      return res.json();
    },
    enabled: !!isAdmin,
    refetchInterval: inboxTab === 'email' ? 60000 : false,
  });

  const { data: emailThreadDetail } = useQuery<{ thread: any; messages: any[]; dealLinks: any[] }>({
    queryKey: ["/api/email/threads", activeEmailThreadId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/email/threads/${activeEmailThreadId}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!activeEmailThreadId && inboxTab === 'email',
  });

  const emailThreads = emailThreadsData?.threads || [];

  const syncEmailMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/sync"),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", "all"] });
      toast({ title: "Sync Complete", description: `Synced ${result.synced} threads` });
    },
    onError: () => {
      toast({ title: "Sync Failed", variant: "destructive" });
    },
  });

  const { data: dealsListData } = useQuery<{ quotes: any[] }>({
    queryKey: ["/api/quotes"],
    enabled: !!isAdmin && inboxTab === 'email',
  });

  const { data: teamChatUnreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/team-chats/unread-count"],
    enabled: !!isAdmin,
    refetchInterval: 15000,
  });

  const linkDealMutation = useMutation({
    mutationFn: ({ threadId, dealId }: { threadId: number; dealId: number }) =>
      apiRequest("POST", `/api/email/threads/${threadId}/link`, { dealId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", "all"] });
      if (activeEmailThreadId) {
        queryClient.invalidateQueries({ queryKey: ["/api/email/threads", activeEmailThreadId, "detail"] });
      }
      setIsLinkDealDialogOpen(false);
      setLinkDealSelectedId("");
      toast({ title: "Linked", description: "Email thread linked to deal" });
    },
    onError: () => {
      toast({ title: "Failed to link", variant: "destructive" });
    },
  });

  const unlinkDealMutation = useMutation({
    mutationFn: ({ threadId, dealId }: { threadId: number; dealId: number }) =>
      apiRequest("DELETE", `/api/email/threads/${threadId}/link/${dealId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", "all"] });
      if (activeEmailThreadId) {
        queryClient.invalidateQueries({ queryKey: ["/api/email/threads", activeEmailThreadId, "detail"] });
      }
      toast({ title: "Unlinked", description: "Email thread unlinked from deal" });
    },
  });

  const replyEmailMutation = useMutation({
    mutationFn: ({ threadId, body }: { threadId: number; body: string }) =>
      apiRequest("POST", `/api/email/threads/${threadId}/reply`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", "all"] });
      if (activeEmailThreadId) {
        queryClient.invalidateQueries({ queryKey: ["/api/email/threads", activeEmailThreadId, "detail"] });
      }
      setEmailReplyText("");
      toast({ title: "Reply Sent", description: "Your email reply has been sent" });
    },
    onError: () => {
      toast({ title: "Failed to send reply", variant: "destructive" });
    },
  });

  const markEmailReadMutation = useMutation({
    mutationFn: (threadId: number) =>
      apiRequest("POST", `/api/email/threads/${threadId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", "all"] });
    },
  });

  useEffect(() => {
    if (activeEmailThreadId && emailThreads.length > 0) {
      const thread = emailThreads.find((t: any) => t.id === activeEmailThreadId);
      if (thread?.isUnread) {
        markEmailReadMutation.mutate(activeEmailThreadId);
      }
    }
  }, [activeEmailThreadId]);

  // Digest queries and mutations
  const { data: digestsData, isLoading: digestsLoading } = useQuery<{ date: string; digests: any[] }>({
    queryKey: ['/api/admin/digests/scheduled', digestDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/digests/scheduled?date=${digestDate}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch digests');
      return res.json();
    },
    enabled: inboxTab === 'digests' && !!isAdmin,
    refetchInterval: inboxTab === 'digests' ? 30000 : false,
  });

  const approveDraftMutation = useMutation({
    mutationFn: (draftId: number) => apiRequest('POST', `/api/admin/digests/drafts/${draftId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/digests/scheduled', digestDate] });
      toast({ title: 'Draft approved' });
    },
    onError: () => toast({ title: 'Failed to approve', variant: 'destructive' }),
  });

  const skipDraftMutation = useMutation({
    mutationFn: (draftId: number) => apiRequest('POST', `/api/admin/digests/drafts/${draftId}/skip`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/digests/scheduled', digestDate] });
      toast({ title: 'Draft skipped' });
    },
    onError: () => toast({ title: 'Failed to skip', variant: 'destructive' }),
  });

  const sendDraftMutation = useMutation({
    mutationFn: (draftId: number) => apiRequest('POST', `/api/admin/digests/drafts/${draftId}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/digests/scheduled', digestDate] });
      toast({ title: 'Digest sent!' });
    },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  const updateDraftMutation = useMutation({
    mutationFn: ({ draftId, data }: { draftId: number; data: any }) =>
      apiRequest('PUT', `/api/admin/digests/drafts/${draftId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/digests/scheduled', digestDate] });
      setEditingDraft(null);
      toast({ title: 'Draft updated' });
    },
    onError: () => toast({ title: 'Failed to update', variant: 'destructive' }),
  });

  // Handle URL params for opening new thread with pre-selected deal
  // Wait for quotes data to be loaded before opening dialog
  useEffect(() => {
    if (urlDealId && openNew && quotesData?.quotes) {
      setSelectedDealId(urlDealId);
      setIsNewThreadDialogOpen(true);
      // Clear URL params after handling
      setLocation('/inbox', { replace: true });
    }
  }, [urlDealId, openNew, setLocation, quotesData]);

  const threads = threadsData?.threads || [];

  const unreadThreadCount = threads.filter((t: any) => t.unreadCount > 0).length;
  const unreadEmailCount = emailThreads.filter((t: any) => t.isUnread).length;
  const teamUnreadCount = teamChatUnreadData?.unreadCount || 0;
  const needsReplyCount = threads.filter((t: any) => {
    if (!t.lastMessageSenderId) return false;
    return t.lastMessageSenderId !== user?.id && t.unreadCount > 0;
  }).length;

  const filteredThreads = threads.filter((t: any) => {
    if (inboxSearchQuery.trim()) {
      const q = inboxSearchQuery.toLowerCase();
      const matchesSearch = (t.subject?.toLowerCase().includes(q)) ||
        (t.userName?.toLowerCase().includes(q)) ||
        (t.dealName?.toLowerCase().includes(q)) ||
        (t.propertyAddress?.toLowerCase().includes(q)) ||
        (t.lastMessagePreview?.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    if (statFilter === 'unread' && t.unreadCount <= 0) return false;
    if (statFilter === 'needs_reply') {
      if (!t.lastMessageSenderId || t.lastMessageSenderId === user?.id || t.unreadCount <= 0) return false;
    }
    return true;
  });

  const filteredEmailThreads = emailThreads.filter((t: any) => {
    if (emailSearchQuery.trim()) {
      const q = emailSearchQuery.toLowerCase();
      const matchesSearch = (t.subject?.toLowerCase().includes(q)) ||
        (t.fromName?.toLowerCase().includes(q)) ||
        (t.fromAddress?.toLowerCase().includes(q)) ||
        (t.snippet?.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    if (emailLinkFilter === 'linked' && !(t.linkedDealIds?.length > 0)) return false;
    if (emailLinkFilter === 'unlinked' && t.linkedDealIds?.length > 0) return false;
    if (emailReadFilter === 'unread' && !t.isUnread) return false;
    if (emailReadFilter === 'read' && t.isUnread) return false;
    return true;
  });

  const activeThread = activeThreadData?.thread;
  const activeMessages = activeThreadData?.messages || [];

  const activeThreadMeta = activeThread ? threads.find((t: any) => t.id === activeThread.id) : null;
  const headerAddress = activeThreadMeta?.propertyAddress?.split(',')[0] || (activeThread as any)?.userName || "Conversation";
  const headerStage = activeThreadMeta?.currentStage;
  const headerIdentifier = activeThreadMeta?.dealIdentifier;
  const headerUserType = activeThreadMeta?.userType;
  const headerUserName = (activeThread as any)?.userName || activeThreadMeta?.userName;

  useEffect(() => {
    if (threads.length && !activeThreadId) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId]);

  useEffect(() => {
    if (activeThreadId) {
      markRead(activeThreadId).catch(() => {});
    }
  }, [activeThreadId, activeMessages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeThreadId || !draft.trim()) return;
      return sendMessage(activeThreadId, draft.trim());
    },
    onSuccess: () => {
      setDraft("");
      refetchThread();
      refetchThreads();
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = isAdmin ? parseInt(selectedUserId) : user!.id;
      if (!targetUserId || !selectedDealId) return;
      const dealId = parseInt(selectedDealId);
      const result = await createThread(targetUserId, dealId, newThreadSubject || undefined);
      
      if (result?.thread && initialMessage.trim()) {
        await sendMessage(result.thread.id, initialMessage.trim(), "message");
      }
      return result;
    },
    onSuccess: (data) => {
      if (data?.thread) {
        setActiveThreadId(data.thread.id);
        refetchThreads();
        refetchThread();
      }
      setIsNewThreadDialogOpen(false);
      setNewThreadSubject("");
      setSelectedUserId("");
      setSelectedDealId("");
      setInitialMessage("");
    },
  });

  const handleSend = () => {
    if (draft.trim() && activeThreadId) {
      sendMutation.mutate();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeThreadId) return;

    setIsUploading(true);
    try {
      const urlRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const urlData = await urlRes.json();

      let objectPath = urlData.objectPath;

      if (urlData.useDirectUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch(urlData.uploadURL, {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        objectPath = uploadData.objectPath || objectPath;
      } else {
        await fetch(urlData.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
      }

      const fileSizeStr = file.size < 1024 * 1024
        ? `${Math.round(file.size / 1024)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      await sendMessage(activeThreadId, `📎 ${file.name}`, "message", {
        fileName: file.name,
        fileType: file.type.includes("pdf") ? "PDF" : file.type.split("/")[1]?.toUpperCase() || "File",
        fileSize: fileSizeStr,
        objectPath,
        uploadedAt: new Date().toISOString(),
        status: "received",
      });

      refetchThread();
      refetchThreads();
      toast({ title: "File uploaded successfully" });
    } catch (err) {
      console.error("File upload error:", err);
      toast({ title: "Failed to upload file", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-4 md:p-6 h-full" data-testid="messages-page">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight" data-testid="text-inbox-title">Inbox</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">
            {isAdmin ? "Communicate with borrowers and partners" : `Messages from ${branding.companyName}`}
          </p>
        </div>
        
        <Dialog open={isNewThreadDialogOpen} onOpenChange={setIsNewThreadDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full h-10 px-5 text-[15px] gap-2 shadow-md" data-testid="button-new-thread">
              <Plus className="h-4 w-4" />
              {isAdmin ? "New Conversation" : "Message Lender"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAdmin ? "Start New Conversation" : `Message ${branding.companyName}`}</DialogTitle>
              <DialogDescription>
                {isAdmin 
                  ? "Select a user to start a new conversation thread."
                  : "Send a message to our team. We'll respond as soon as possible."
                }
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {isAdmin && (
                <div className="grid gap-2">
                  <Label htmlFor="user">Select User</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger data-testid="select-user">
                      <SelectValue placeholder="Choose a user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {usersData?.users?.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.fullName || u.email} {u.role === 'user' ? '(Broker)' : `(${u.role})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="grid gap-2">
                <Label htmlFor="deal">Related Deal <span className="text-destructive">*</span></Label>
                <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                  <SelectTrigger data-testid="select-deal">
                    <SelectValue placeholder="Select a deal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {quotesData?.quotes?.map((q) => (
                      <SelectItem key={q.id} value={q.id.toString()}>
                        {q.borrowerName || q.propertyAddress || `Quote #${q.id}`}
                      </SelectItem>
                    ))}
                    {(!quotesData?.quotes || quotesData.quotes.length === 0) && (
                      <div className="p-2 text-sm text-muted-foreground">No deals available</div>
                    )}
                  </SelectContent>
                </Select>
                {!selectedDealId && (
                  <p className="text-xs text-muted-foreground">All conversations must be linked to a deal</p>
                )}
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="e.g., Question about loan application"
                  value={newThreadSubject}
                  onChange={(e) => setNewThreadSubject(e.target.value)}
                  data-testid="input-thread-subject"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Type your message here..."
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  rows={4}
                  data-testid="input-initial-message"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createThreadMutation.mutate()}
                disabled={(isAdmin && !selectedUserId) || !selectedDealId || !initialMessage.trim() || createThreadMutation.isPending}
                data-testid="button-create-thread"
              >
                Send Message
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex h-[calc(100vh-180px)] gap-4">
        <Card className="w-[504px] shrink-0 flex flex-col overflow-hidden rounded-[10px] shadow-sm">
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="grid grid-cols-3 gap-2" data-testid="inbox-stat-counters">
              {([
                { key: 'all' as const, label: 'All', count: threads.length },
                { key: 'unread' as const, label: 'Unread', count: unreadThreadCount },
                { key: 'needs_reply' as const, label: 'Needs Reply', count: needsReplyCount },
              ]).map((stat) => (
                <button
                  key={stat.key}
                  onClick={() => setStatFilter(stat.key)}
                  className={`flex flex-col items-center py-2.5 rounded-lg transition-colors cursor-pointer ${
                    statFilter === stat.key
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-muted/50 hover:bg-muted border border-transparent"
                  }`}
                  data-testid={`stat-${stat.key}`}
                >
                  <span className={`text-[20px] font-bold leading-tight ${statFilter === stat.key ? 'text-primary' : ''}`}>{stat.count}</span>
                  <span className="text-[13px] text-muted-foreground mt-0.5">{stat.label}</span>
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={inboxSearchQuery}
                onChange={(e) => setInboxSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
                data-testid="input-inbox-search"
              />
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { key: 'all' as const, label: 'All', icon: null, badge: 0 },
                  { key: 'in-app' as const, label: 'In-App', icon: MessageSquare, badge: unreadThreadCount },
                  { key: 'email' as const, label: 'Email', icon: Mail, badge: unreadEmailCount },
                  { key: 'team' as const, label: 'Team', icon: Users, badge: teamUnreadCount },
                ] as const).map((ch) => (
                  <div key={ch.key} className="relative">
                    <Button
                      variant={channelFilter === ch.key ? 'default' : 'outline'}
                      size="sm"
                      className={`rounded-full text-[13px] h-7 px-3 gap-1.5 ${channelFilter === ch.key ? '' : 'text-muted-foreground'}`}
                      onClick={() => {
                        setChannelFilter(ch.key);
                        if (ch.key === 'email') { setInboxTab('email'); }
                        else if (ch.key === 'team') { setInboxTab('team'); setActiveTeamChatId(null); }
                        else if (ch.key === 'in-app') { setInboxTab('messages'); setActiveEmailThreadId(null); }
                        else { setInboxTab('messages'); }
                      }}
                      data-testid={`filter-${ch.key}`}
                    >
                      {ch.icon && <ch.icon className="h-3 w-3" />}
                      {ch.label}
                    </Button>
                    {ch.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold leading-none shadow-sm" data-testid={`badge-${ch.key}`}>
                        {ch.badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            {inboxTab === 'email' && isAdmin ? (
              <>
                <div className="px-3 py-2 space-y-2 border-b overflow-hidden">
                  <div className="relative w-full">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search emails..."
                      value={emailSearchQuery}
                      onChange={(e) => setEmailSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-xs w-full"
                      data-testid="input-email-search"
                    />
                  </div>
                  <Select value={emailLinkFilter} onValueChange={(v) => setEmailLinkFilter(v as any)}>
                    <SelectTrigger className="h-7 text-xs w-full" data-testid="select-email-link-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Emails</SelectItem>
                      <SelectItem value="linked">Linked to Deal</SelectItem>
                      <SelectItem value="unlinked">Not Linked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={emailReadFilter} onValueChange={(v) => setEmailReadFilter(v as any)}>
                    <SelectTrigger className="h-7 text-xs w-full" data-testid="select-email-read-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Read Status</SelectItem>
                      <SelectItem value="unread">Unread Only</SelectItem>
                      <SelectItem value="read">Read Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{filteredEmailThreads.length} thread{filteredEmailThreads.length !== 1 ? 's' : ''}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => syncEmailMutation.mutate()}
                      disabled={syncEmailMutation.isPending}
                      data-testid="button-sync-email-inbox-tab"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncEmailMutation.isPending ? 'animate-spin' : ''}`} />
                      {syncEmailMutation.isPending ? 'Syncing...' : 'Sync'}
                    </Button>
                  </div>
                </div>
                {emailThreadsLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading emails...</div>
              ) : filteredEmailThreads.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No email threads found</p>
                  <p className="text-xs mt-1">Click Sync to fetch your latest emails</p>
                </div>
              ) : (
                <div className="p-2">
                  {filteredEmailThreads.map((thread: any) => (
                    <button
                      key={thread.id}
                      className={`group w-full text-left p-3 rounded-lg mb-1 transition-colors cursor-pointer hover-elevate ${
                        thread.id === activeEmailThreadId
                          ? "bg-primary/10 border border-primary/20"
                          : ""
                      }`}
                      onClick={() => { setActiveEmailThreadId(thread.id); setEmailReplyText(""); }}
                      data-testid={`email-thread-msg-${thread.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold shrink-0">
                            <Mail className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm truncate ${thread.isUnread ? 'font-bold' : ''}`}>
                                {thread.fromName || thread.fromAddress || "Unknown"}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0 border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-400">
                                Email
                              </Badge>
                            </div>
                            <div className={`text-xs truncate ${thread.isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                              {thread.subject || "(No Subject)"}
                            </div>
                            {thread.snippet && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {thread.snippet}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          <div className="flex items-center gap-1.5">
                            {thread.hasAttachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                            {thread.isUnread && (
                              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </div>
                          <span className={`text-[11px] whitespace-nowrap ${thread.isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                            {thread.lastMessageAt ? format(new Date(thread.lastMessageAt), "MMM d, h:mm a") : ""}
                          </span>
                        </div>
                      </div>
                      {thread.linkedDealIds?.length > 0 && (
                        <div className="flex items-center gap-1.5 ml-10 mb-1">
                          <Badge variant="default" className="text-[10px] h-4 px-1.5">
                            <Link2 className="h-2.5 w-2.5 mr-0.5" />
                            DEAL-{thread.linkedDealIds[0]}
                          </Badge>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground line-clamp-1 ml-10">
                        {thread.snippet || ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
            ) : inboxTab === 'team' && isAdmin ? (
              <TeamChat activeChatId={activeTeamChatId} onSelectChat={setActiveTeamChatId} />
            ) : inboxTab === 'digests' && isAdmin ? (
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      const d = new Date(digestDate);
                      d.setDate(d.getDate() - 1);
                      setDigestDate(format(d, 'yyyy-MM-dd'));
                    }}
                    data-testid="button-digest-prev-day"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    {format(new Date(digestDate + 'T12:00:00'), 'MMM d, yyyy')}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      const d = new Date(digestDate);
                      d.setDate(d.getDate() + 1);
                      setDigestDate(format(d, 'yyyy-MM-dd'));
                    }}
                    data-testid="button-digest-next-day"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {digestsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    <p className="text-xs">Loading scheduled updates...</p>
                  </div>
                ) : !digestsData?.digests?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">No scheduled updates</p>
                    <p className="text-xs mt-1">Automated loan digests will appear here when scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{digestsData.digests.length} update{digestsData.digests.length !== 1 ? 's' : ''} scheduled</p>
                    {digestsData.digests.map((digest: any) => (
                      <div
                        key={digest.id}
                        className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition-colors"
                        data-testid={`digest-item-${digest.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {digest.propertyAddress && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{digest.propertyAddress}</span>
                              </div>
                            )}
                            <div className="text-sm font-medium truncate">
                              {digest.borrowerName || 'Borrower'}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {digest.dealIdentifier && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">{digest.dealIdentifier}</Badge>
                              )}
                              <Badge
                                variant={digest.status === 'approved' ? 'default' : digest.status === 'sent' ? 'secondary' : digest.status === 'skipped' ? 'outline' : 'secondary'}
                                className="text-[10px] h-4 px-1.5"
                              >
                                {digest.status}
                              </Badge>
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {digest.scheduledFor ? format(new Date(digest.scheduledFor), 'h:mm a') : ''}
                          </span>
                        </div>

                        {editingDraft?.id === digest.id ? (
                          <div className="space-y-2">
                            <textarea
                              className="w-full text-xs border rounded p-2 min-h-[80px] resize-none bg-background"
                              value={editingDraft.content}
                              onChange={(e) => setEditingDraft({ ...editingDraft, content: e.target.value })}
                              data-testid={`textarea-edit-digest-${digest.id}`}
                            />
                            <div className="flex gap-1.5 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDraft(null)} data-testid={`button-cancel-edit-digest-${digest.id}`}>Cancel</Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => updateDraftMutation.mutate({ draftId: digest.id, data: { emailBody: editingDraft.content } })}
                                disabled={updateDraftMutation.isPending}
                                data-testid={`button-save-digest-${digest.id}`}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground line-clamp-3">
                              {digest.emailBody || digest.smsBody || 'No content preview available'}
                            </p>
                            {digest.status === 'draft' && (
                              <div className="flex items-center gap-1.5 pt-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => setEditingDraft({ id: digest.id, content: digest.emailBody || '' })}
                                  data-testid={`button-edit-digest-${digest.id}`}
                                >
                                  <Pencil className="h-3 w-3" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs gap-1 text-green-600"
                                  onClick={() => approveDraftMutation.mutate(digest.id)}
                                  disabled={approveDraftMutation.isPending}
                                  data-testid={`button-approve-digest-${digest.id}`}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs gap-1 text-red-600"
                                  onClick={() => skipDraftMutation.mutate(digest.id)}
                                  disabled={skipDraftMutation.isPending}
                                  data-testid={`button-skip-digest-${digest.id}`}
                                >
                                  <XCircle className="h-3 w-3" /> Skip
                                </Button>
                              </div>
                            )}
                            {digest.status === 'approved' && (
                              <div className="flex items-center gap-1.5 pt-1">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => sendDraftMutation.mutate(digest.id)}
                                  disabled={sendDraftMutation.isPending}
                                  data-testid={`button-send-digest-${digest.id}`}
                                >
                                  <Play className="h-3 w-3" /> Send Now
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : threadsLoading ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>{inboxSearchQuery ? 'No matching conversations' : 'No conversations yet'}</p>
                {isAdmin && !inboxSearchQuery && <p className="text-xs mt-1">Start a new conversation above</p>}
              </div>
            ) : (
              <div className="p-2">
                {filteredThreads.map((thread: any) => {
                  const t = thread;
                  const isActive = thread.id === activeThreadId;
                  const isRead = t.unreadCount === 0;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => { setActiveThreadId(thread.id); setInboxTab('messages'); }}
                      className={`group w-full text-left p-3 rounded-xl mb-1.5 transition-colors cursor-pointer border ${
                        isActive
                          ? "bg-primary/5 border-l-[3px] border-l-primary border-primary/20"
                          : isRead
                            ? "bg-blue-50/60 dark:bg-blue-950/20 border-border/40 hover:bg-blue-100/60 dark:hover:bg-blue-950/30 border-l-[3px] border-l-transparent"
                            : "bg-background border-border/40 hover:bg-muted border-l-[3px] border-l-transparent"
                      }`}
                      data-testid={`thread-item-${thread.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex items-center justify-center h-10 w-10 rounded-full text-white text-[14px] font-bold shrink-0 ${getAvatarColor(thread.id)}`}>
                          {getInitials(t.propertyAddress || t.userName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className={`text-[15px] truncate ${t.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>
                              {t.propertyAddress?.split(',')[0] || t.subject || "General"}
                            </div>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                              {format(new Date(thread.lastMessageAt), "h:mm a")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {t.dealIdentifier && (
                              <span className="text-[12px] font-medium text-muted-foreground">{t.dealIdentifier}</span>
                            )}
                            {t.userType && (
                              <Badge variant="secondary" className={`text-[10px] h-[18px] px-1.5 shrink-0 border-0 ${t.userType === 'borrower' ? 'bg-blue-500 hover:bg-blue-500 text-white' : 'bg-emerald-500 hover:bg-emerald-500 text-white'}`}>
                                {t.userType === 'borrower' ? 'Borrower' : 'Broker'}
                              </Badge>
                            )}
                            <span className="text-[12px] text-muted-foreground truncate">
                              {t.userName || "User"}
                            </span>
                            {t.unreadCount > 0 && (
                              <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ml-auto shrink-0">
                                {t.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-[12px] text-muted-foreground line-clamp-1">
                              {t.lastMessagePreview || "No messages yet"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        <Card className="flex-1 flex flex-col rounded-[10px] shadow-sm">
          {inboxTab === 'team' ? (
            <TeamChatDetail activeChatId={activeTeamChatId} />
          ) : inboxTab === 'email' && activeEmailThreadId && emailThreadDetail ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">
                        {emailThreadDetail.thread.subject || "(No Subject)"}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {emailThreadDetail.messages.length} message{emailThreadDetail.messages.length !== 1 ? "s" : ""}
                        </p>
                        {emailThreadDetail.dealLinks.map((link: any) => (
                          <Badge key={link.dealId} variant="default" className="text-[10px] h-4 px-1.5 gap-0.5 group/badge">
                            <Link2 className="h-2.5 w-2.5" />
                            DEAL-{link.dealId}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeEmailThreadId) {
                                  unlinkDealMutation.mutate({ threadId: activeEmailThreadId, dealId: link.dealId });
                                }
                              }}
                              className="ml-0.5 opacity-0 group-hover/badge:opacity-100 transition-opacity"
                              data-testid={`button-unlink-deal-${link.dealId}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLinkDealSelectedId("");
                        setIsLinkDealDialogOpen(true);
                      }}
                      data-testid="button-link-to-deal"
                    >
                      <Link2 className="h-4 w-4 mr-1" />
                      Link to Deal
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-2xl mx-auto">
                  {emailThreadDetail.messages.map((msg: any) => (
                    <div key={msg.id} className="border rounded-lg p-3" data-testid={`email-msg-detail-${msg.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {(msg.fromName || msg.fromAddress || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{msg.fromName || msg.fromAddress}</p>
                            <p className="text-[10px] text-muted-foreground">
                              to {(msg.toAddresses || []).join(", ")}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {msg.internalDate ? format(new Date(msg.internalDate), "MMM d, h:mm a") : ""}
                        </span>
                      </div>
                      {msg.bodyHtml ? (
                        <div
                          className="text-sm prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                        />
                      ) : (
                        <pre className="text-sm whitespace-pre-wrap font-sans">{msg.bodyText || msg.snippet || ""}</pre>
                      )}
                      {msg.attachments && (msg.attachments as any[]).length > 0 && (
                        <div className="mt-2 pt-2 border-t flex items-center gap-2 flex-wrap">
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                          {(msg.attachments as any[]).map((att: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-[10px]">
                              {att.filename} ({Math.round(att.size / 1024)}KB)
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="border-t px-3 pt-2 pb-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {["Thanks, received!", "I'll look into this", "Can you send more details?"].map((chip) => (
                    <Button
                      key={chip}
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => {
                        if (!activeEmailThreadId) return;
                        replyEmailMutation.mutate({
                          threadId: activeEmailThreadId,
                          body: chip,
                        });
                      }}
                      disabled={replyEmailMutation.isPending}
                      data-testid={`chip-quick-reply-${chip.replace(/[^a-zA-Z]/g, '').toLowerCase()}`}
                    >
                      {chip}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" data-testid="button-email-template">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid="button-email-attach">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={emailReplyText}
                      onChange={(e) => setEmailReplyText(e.target.value)}
                      className="text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && emailReplyText.trim() && activeEmailThreadId) {
                          e.preventDefault();
                          replyEmailMutation.mutate({
                            threadId: activeEmailThreadId,
                            body: emailReplyText.replace(/\n/g, '<br/>'),
                          });
                        }
                      }}
                      data-testid="input-email-reply"
                    />
                    <Button
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        if (!activeEmailThreadId || !emailReplyText.trim()) return;
                        replyEmailMutation.mutate({
                          threadId: activeEmailThreadId,
                          body: emailReplyText.replace(/\n/g, '<br/>'),
                        });
                      }}
                      disabled={!emailReplyText.trim() || replyEmailMutation.isPending}
                      data-testid="button-send-email-reply"
                    >
                      {replyEmailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : activeThread ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`flex items-center justify-center h-10 w-10 rounded-full text-white text-sm font-semibold shrink-0 ${getAvatarColor(activeThread.id)}`}>
                      {getInitials(headerAddress)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-[18px] truncate" data-testid="text-conversation-title">
                        {headerAddress}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {headerIdentifier && (
                          <span className="text-[12px] font-medium text-muted-foreground">{headerIdentifier}</span>
                        )}
                        {headerUserType && (
                          <Badge variant="secondary" className={`text-[10px] h-4 px-1.5 shrink-0 ${headerUserType === 'borrower' ? 'bg-blue-500 hover:bg-blue-500 text-white' : 'bg-emerald-500 hover:bg-emerald-500 text-white'}`}>
                            {headerUserType === 'borrower' ? 'Borrower' : 'Broker'}
                          </Badge>
                        )}
                        <span className="text-[12px] text-muted-foreground">{headerUserName}</span>
                        {headerStage && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            <span className={`w-2 h-2 rounded-full ${STAGE_COLORS[headerStage] || 'bg-slate-400'}`} />
                            {formatStageName(headerStage)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && activeThread.dealId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[13px] gap-1.5"
                        onClick={() => setLocation(`/admin/deals/${activeThread.dealId}`)}
                        title="Go to deal"
                        data-testid="button-go-to-deal"
                      >
                        <Briefcase className="h-3.5 w-3.5" />
                        Deal
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" data-testid="button-call">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid="button-more">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <ScrollArea className="flex-1 p-4">
                {threadLoading ? (
                  <div className="text-center text-muted-foreground">Loading messages...</div>
                ) : activeMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-xs mt-1">Send the first message below</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeMessages.map((msg, idx) => {
                      const isOwnMessage = msg.senderId === user?.id;
                      const isSystemNotification = msg.type === 'notification';
                      const isAiInsight = msg.senderRole === 'system' && msg.type === 'message';
                      const hasMeta = msg.meta && typeof msg.meta === 'object';
                      const fileAttachment = hasMeta && (msg.meta as any).fileName ? (msg.meta as any) : null;

                      const prevMsg = idx > 0 ? activeMessages[idx - 1] : null;
                      const showDateHeader = !prevMsg || format(new Date(msg.createdAt), 'yyyy-MM-dd') !== format(new Date(prevMsg.createdAt), 'yyyy-MM-dd');

                      return (
                        <div key={msg.id}>
                          {showDateHeader && (
                            <div className="flex items-center justify-center py-3" data-testid={`date-header-${msg.id}`}>
                              <span className="text-[13px] text-muted-foreground font-medium">
                                {format(new Date(msg.createdAt), "MMMM d, yyyy")}
                              </span>
                            </div>
                          )}

                          {isSystemNotification ? (
                            <div className="flex items-center justify-center py-1.5" data-testid={`notification-${msg.id}`}>
                              <span className="text-[13px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                                {msg.body}
                              </span>
                            </div>
                          ) : isAiInsight ? (
                            <div className="flex justify-start" data-testid={`ai-insight-${msg.id}`}>
                              <div className="max-w-[80%] rounded-lg p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">AI Insight:</span>
                                  <span className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60 ml-auto">
                                    {format(new Date(msg.createdAt), "h:mm a")}
                                  </span>
                                </div>
                                <p className="text-[14px] text-emerald-900 dark:text-emerald-100 whitespace-pre-wrap">{msg.body}</p>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} gap-2`}
                              data-testid={`message-${msg.id}`}
                            >
                              {!isOwnMessage && (
                                <div className={`flex items-center justify-center h-8 w-8 rounded-full text-white text-[12px] font-semibold shrink-0 mt-1 ${getAvatarColor(msg.senderId || 0)}`}>
                                  {getInitials(msg.senderName)}
                                </div>
                              )}
                              <div className="flex flex-col max-w-[70%]">
                                <div
                                  className={`rounded-lg p-3 ${
                                    isOwnMessage
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                                  {fileAttachment && (
                                    <div className="mt-2 flex items-center gap-2 p-2 rounded-md border bg-background/50">
                                      <div className="flex items-center justify-center h-9 w-9 rounded bg-red-100 dark:bg-red-900/30 shrink-0">
                                        <File className="h-4 w-4 text-red-600 dark:text-red-400" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-medium truncate">{fileAttachment.fileName}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                          {fileAttachment.fileType || 'PDF'} {fileAttachment.fileSize ? `${fileAttachment.fileSize}` : ''}
                                          {fileAttachment.uploadedAt ? ` · Uploaded ${format(new Date(fileAttachment.uploadedAt), "h:mm a")}` : ''}
                                        </div>
                                      </div>
                                      {fileAttachment.status === 'received' && (
                                        <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] h-5 shrink-0">Received</Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className={`text-[11px] text-muted-foreground mt-1 ${isOwnMessage ? 'text-right' : ''}`}>
                                  {format(new Date(msg.createdAt), "h:mm a")}
                                </span>
                              </div>
                              {isOwnMessage && (
                                <div className="flex flex-col items-center shrink-0 mt-1">
                                  <div className={`flex items-center justify-center h-8 w-8 rounded-full text-white text-[12px] font-semibold ${getAvatarColor(user?.id || 0)}`}>
                                    {getInitials(user?.fullName || user?.email)}
                                  </div>
                                  <span className="text-[11px] font-medium text-muted-foreground mt-0.5">Me</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
              <Separator />

              {activeMessages.length > 0 && (
                <div className="px-4 pt-3 pb-2">
                  <div className="flex gap-2 flex-wrap">
                    {QUICK_REPLIES.map((reply) => (
                      <Button
                        key={reply.text}
                        variant="outline"
                        size="sm"
                        className="rounded-full text-[13px] h-8 px-3 gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setDraft(reply.text)}
                        data-testid={`quick-reply-${reply.text}`}
                      >
                        <reply.icon className="h-3.5 w-3.5" />
                        {reply.text}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="px-4 pb-4 pt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.csv,.txt,.zip"
                  data-testid="input-file-upload"
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-[42px] w-[42px] shrink-0 text-muted-foreground hover:text-foreground"
                    title="Attach file"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!activeThreadId || isUploading}
                    data-testid="button-attach-file"
                  >
                    {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
                  </Button>

                  <Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-[42px] w-[42px] shrink-0 text-muted-foreground hover:text-foreground" title="Message templates" data-testid="button-templates">
                        <FileText className="h-5 w-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold px-2 py-1.5 text-muted-foreground">Saved Templates</p>
                        {savedTemplates.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-2 py-2">No templates yet. Type a message and save it as a template.</p>
                        ) : (
                          savedTemplates.map((template) => (
                            <div key={template.id} className="flex items-center gap-1 group" data-testid={`template-item-${template.id}`}>
                              <button onClick={() => insertTemplate(template.content)} className="flex-1 text-left px-2 py-2 rounded hover:bg-muted transition-colors text-sm">
                                <div className="font-medium">{template.name}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1">{template.content.split("\n")[0]}</div>
                              </button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteTemplateMutation.mutate(template.id)} data-testid={`button-delete-template-${template.id}`}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Popover open={isMergeTagPopoverOpen} onOpenChange={setIsMergeTagPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-[42px] w-[42px] shrink-0 text-muted-foreground hover:text-foreground" title="Insert merge tag" data-testid="button-merge-tags">
                        <Tags className="h-5 w-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-60 p-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold px-2 py-1.5 text-muted-foreground">Merge Tags</p>
                        {MERGE_TAGS.map((mt) => (
                          <button key={mt.tag} onClick={() => insertMergeTag(mt.tag)} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors text-sm" data-testid={`merge-tag-${mt.tag}`}>
                            <div className="font-medium text-xs">{mt.label}</div>
                            <div className="text-xs text-muted-foreground font-mono">{mt.tag}</div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {draft.trim() && (
                    <Popover open={isSaveTemplateOpen} onOpenChange={setIsSaveTemplateOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-[42px] w-[42px] shrink-0 text-muted-foreground hover:text-foreground" title="Save as template" data-testid="button-save-template">
                          <Save className="h-5 w-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 p-3">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Save as Template</p>
                          <Input placeholder="Template name..." value={saveTemplateName} onChange={(e) => setSaveTemplateName(e.target.value)} data-testid="input-template-name" />
                          <Button size="sm" className="w-full" disabled={!saveTemplateName.trim() || createTemplateMutation.isPending} onClick={() => createTemplateMutation.mutate({ name: saveTemplateName.trim(), content: draft })} data-testid="button-confirm-save-template">
                            {createTemplateMutation.isPending ? "Saving..." : "Save Template"}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}

                  <Input
                    ref={messageInputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 text-[15px] placeholder:text-muted-foreground/50 rounded-lg"
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMutation.isPending}
                    size="icon"
                    className="h-9 w-9 rounded-full shrink-0"
                    data-testid="button-send-message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a conversation</p>
                <p className="text-sm">Choose a thread from the left to view messages</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={isLinkDealDialogOpen} onOpenChange={setIsLinkDealDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Email Thread to Deal</DialogTitle>
            <DialogDescription>
              Choose a deal to link this email conversation to. Linked emails will appear in the deal's communications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">Select Deal</p>
            <Select value={linkDealSelectedId} onValueChange={setLinkDealSelectedId}>
              <SelectTrigger data-testid="select-deal-to-link">
                <SelectValue placeholder="Choose a deal..." />
              </SelectTrigger>
              <SelectContent>
                {(dealsListData?.quotes || []).map((deal: any) => (
                  <SelectItem key={deal.projectId || deal.id} value={String(deal.projectId || deal.id)}>
                    {deal.loanNumber || `DEAL-${deal.projectId || deal.id}`} - {deal.borrowerName || deal.propertyAddress || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDealDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (activeEmailThreadId && linkDealSelectedId) {
                  linkDealMutation.mutate({ threadId: activeEmailThreadId, dealId: parseInt(linkDealSelectedId) });
                }
              }}
              disabled={!linkDealSelectedId || linkDealMutation.isPending}
              data-testid="button-confirm-link"
            >
              {linkDealMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
              Link to Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

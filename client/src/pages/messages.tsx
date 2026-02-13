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
  Bell,
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
import { queryClient } from "@/lib/queryClient";
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

// Message templates
const MESSAGE_TEMPLATES = [
  {
    name: "Document Request",
    content: "Hi, could you please provide the following documents for your loan application:\n\n[list documents]"
  },
  {
    name: "Status Update",
    content: "I wanted to give you a quick update on your loan.\n\n[update details]"
  },
  {
    name: "Missing Information",
    content: "We noticed some information is missing from your application. Could you please provide:\n\n[details]"
  },
  {
    name: "Approval Notice",
    content: "Great news! Your loan has been conditionally approved. Here are the next steps:\n\n[steps]"
  },
  {
    name: "Follow Up",
    content: "I'm following up on our previous conversation.\n\n[details]"
  }
];

const QUICK_REPLIES = [
  "Thanks, received!",
  "I'll look into this",
  "Can you send more details?"
];

export default function MessagesPage() {
  const { user } = useAuth();
  const { branding } = useBranding();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const urlDealId = searchParams.get('dealId');
  const openNew = searchParams.get('new') === 'true';

  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [isNewThreadDialogOpen, setIsNewThreadDialogOpen] = useState(false);
  const [newThreadSubject, setNewThreadSubject] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [initialMessage, setInitialMessage] = useState("");
  const [starredThreadIds, setStarredThreadIds] = useState<Set<number>>(new Set());
  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
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

  const insertTemplate = (templateContent: string) => {
    setDraft(templateContent);
    setIsTemplatePopoverOpen(false);
  };

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
  
  // Handle URL params for opening new thread with pre-selected deal
  // Wait for quotes data to be loaded before opening dialog
  useEffect(() => {
    if (urlDealId && openNew && quotesData?.quotes) {
      setSelectedDealId(urlDealId);
      setIsNewThreadDialogOpen(true);
      // Clear URL params after handling
      setLocation('/messages', { replace: true });
    }
  }, [urlDealId, openNew, setLocation, quotesData]);

  const threads = threadsData?.threads || [];
  const activeThread = activeThreadData?.thread;
  const messages = activeThreadData?.messages || [];

  useEffect(() => {
    if (threads.length && !activeThreadId) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId]);

  useEffect(() => {
    if (activeThreadId) {
      markRead(activeThreadId).catch(() => {});
    }
  }, [activeThreadId, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeThreadId || !draft.trim()) return;
      return sendMessage(activeThreadId, draft.trim(), "message");
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

  return (
    <div className="p-6 h-full" data-testid="messages-page">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Messages</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Communicate with borrowers and partners" : `Messages from ${branding.companyName}`}
            </p>
          </div>
        </div>
        
        <Dialog open={isNewThreadDialogOpen} onOpenChange={setIsNewThreadDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-thread">
              <Plus className="h-4 w-4 mr-2" />
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

      <div className="flex h-[calc(100vh-200px)] gap-4">
        <Card className="w-80 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Inbox
            </CardTitle>
          </CardHeader>
          <Separator />
          <ScrollArea className="flex-1">
            {threadsLoading ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : threads.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No conversations yet</p>
                {isAdmin && <p className="text-xs mt-1">Start a new conversation above</p>}
              </div>
            ) : (
              <div className="p-2">
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`group w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                      thread.id === activeThreadId
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted"
                    }`}
                    data-testid={`thread-item-${thread.id}`}
                  >
                    <button
                      onClick={() => setActiveThreadId(thread.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">
                            {thread.userName || "User"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {thread.subject || (thread.dealId ? `Deal #${thread.dealId}` : "General")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {thread.unreadCount && thread.unreadCount > 0 && (
                            <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(thread.lastMessageAt), "MMM d")}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {(thread as any).lastMessagePreview || "No messages yet"}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => toggleStarred(thread.id, e)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            starredThreadIds.has(thread.id)
                              ? "fill-yellow-500 text-yellow-500"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="p-1 hover:bg-muted rounded transition-colors"
                      >
                        <Archive className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        <Card className="flex-1 flex flex-col">
          {activeThread ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted text-sm font-semibold">
                      {getInitials((activeThread as any).userName)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {(activeThread as any).userName || "User"}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {activeThread.subject || (activeThread.dealId ? `Deal #${activeThread.dealId}` : "General Conversation")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <ScrollArea className="flex-1 p-4">
                {threadLoading ? (
                  <div className="text-center text-muted-foreground">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-xs mt-1">Send the first message below</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => {
                      const isOwnMessage = msg.senderId === user?.id;
                      const isNotification = msg.type === "notification";
                      
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                          data-testid={`message-${msg.id}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              isNotification
                                ? "bg-warning/10 border border-warning/20"
                                : isOwnMessage
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {isNotification && <Bell className="h-3 w-3 text-warning" />}
                              <span className="text-xs opacity-70">
                                {msg.senderName || (msg.senderRole === 'system' ? 'System' : msg.senderRole)}
                                {" · "}
                                {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
              <Separator />

              {messages.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-0">
                    <div className="flex gap-2 flex-wrap">
                      {QUICK_REPLIES.map((reply) => (
                        <Button
                          key={reply}
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => setDraft(reply)}
                        >
                          {reply}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Separator className="mt-3" />
                </>
              )}

              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <Popover open={isTemplatePopoverOpen} onOpenChange={setIsTemplatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        title="Message templates"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 p-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold px-2 py-1.5 text-muted-foreground">
                          Message Templates
                        </p>
                        {MESSAGE_TEMPLATES.map((template) => (
                          <button
                            key={template.name}
                            onClick={() => insertTemplate(template.content)}
                            className="w-full text-left px-2 py-2 rounded hover:bg-muted transition-colors text-sm"
                          >
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {template.content.split("\n")[0]}
                            </div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1"
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMutation.isPending}
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
    </div>
  );
}

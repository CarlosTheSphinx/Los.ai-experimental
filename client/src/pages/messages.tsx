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
import { MessageSquare, Send, Bell, User, Clock, Plus, MessageCircle, Briefcase } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
import { Label } from "@/components/ui/label";

export default function MessagesPage() {
  const { user } = useAuth();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);

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
              {isAdmin ? "Communicate with borrowers and partners" : "Messages from Sphinx Capital"}
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
              <DialogTitle>{isAdmin ? "Start New Conversation" : "Message Sphinx Capital"}</DialogTitle>
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
                  <button
                    key={thread.id}
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`w-full text-left p-3 rounded-lg mb-1 transition-colors hover-elevate ${
                      thread.id === activeThreadId
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted"
                    }`}
                    data-testid={`thread-item-${thread.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">
                        {thread.subject || (thread.dealId ? `Deal #${thread.dealId}` : "General")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="truncate">{thread.userName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="h-3 w-3" />
                      <span>{format(new Date(thread.lastMessageAt), "MMM d, h:mm a")}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        <Card className="flex-1 flex flex-col">
          {activeThread ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {activeThread.subject || (activeThread.dealId ? `Deal #${activeThread.dealId}` : "General Conversation")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      With: {(activeThread as any).userName || "User"}
                    </p>
                  </div>
                  {activeThread.dealId && (
                    <Badge variant="outline">Deal #{activeThread.dealId}</Badge>
                  )}
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
                                ? "bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
                                : isOwnMessage
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {isNotification && <Bell className="h-3 w-3 text-amber-600" />}
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
              <div className="p-4 flex gap-2">
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

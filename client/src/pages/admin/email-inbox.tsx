import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  Search,
  Paperclip,
  Link2,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ExternalLink,
  Unlink,
  Download,
  Inbox,
  Filter,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { safeFormat, safeRelativeTime } from "@/lib/utils";

interface EmailThread {
  id: number;
  accountId: number;
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
  linkedDealIds: number[];
}

interface EmailMessage {
  id: number;
  threadId: number;
  gmailMessageId: string;
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

interface DealLink {
  dealId: number;
  linkedBy: number | null;
  linkedAt: string;
  deal: { id: number; borrowerName: string | null; propertyAddress: string | null; loanNumber: string | null };
}

export default function EmailInboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const urlThreadId = searchParams.get('threadId');

  const [searchQuery, setSearchQuery] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<number | null>(urlThreadId ? parseInt(urlThreadId) : null);
  const [filterLinked, setFilterLinked] = useState<string>("all");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string>("");

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success === 'email_connected') {
      toast({ title: "Gmail Connected", description: "Your Gmail account has been connected successfully. Syncing your emails now." });
      window.history.replaceState({}, '', '/admin/email');
    }
    if (error === 'email_connect_failed') {
      toast({ title: "Connection Failed", description: "Could not initiate Gmail connection. Please check that Google OAuth is configured.", variant: "destructive" });
      window.history.replaceState({}, '', '/admin/email');
    }
    if (error === 'email_auth_failed') {
      toast({ title: "Authentication Failed", description: "Gmail authentication failed. Please try again.", variant: "destructive" });
      window.history.replaceState({}, '', '/admin/email');
    }
    if (error === 'email_not_configured') {
      toast({ title: "Gmail Not Configured", description: "Google OAuth credentials are not set up. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.", variant: "destructive" });
      window.history.replaceState({}, '', '/admin/email');
    }
  }, []);

  const { data: accountData } = useQuery<{ account: any }>({
    queryKey: ["/api/email/account"],
  });

  const { data: threadsData, isLoading: threadsLoading, refetch: refetchThreads } = useQuery<{ threads: EmailThread[]; total: number }>({
    queryKey: ["/api/email/threads", searchQuery, filterLinked],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterLinked === 'linked') params.set('linked', 'true');
      if (filterLinked === 'unlinked') params.set('linked', 'false');
      const res = await fetch(`/api/email/threads?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!accountData?.account,
    refetchInterval: 30000,
  });

  const { data: threadDetail, isLoading: threadDetailLoading } = useQuery<{
    thread: EmailThread;
    messages: EmailMessage[];
    dealLinks: DealLink[];
  }>({
    queryKey: ["/api/email/threads", activeThreadId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/email/threads/${activeThreadId}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!activeThreadId,
  });

  const { data: dealsData } = useQuery<{ quotes: any[] }>({
    queryKey: ["/api/quotes"],
  });

  const { data: suggestedDeals } = useQuery<{ deals: any[] }>({
    queryKey: ["/api/email/suggest-deals", threadDetail?.thread?.participants],
    queryFn: async () => {
      if (!threadDetail?.thread?.participants?.length) return { deals: [] };
      const params = new URLSearchParams({ participants: threadDetail.thread.participants.join(',') });
      const res = await fetch(`/api/email/suggest-deals?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!threadDetail?.thread?.participants?.length,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/sync"),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/account"] });
      toast({
        title: "Sync Complete",
        description: `Synced ${result.synced} threads`,
      });
    },
    onError: () => {
      toast({ title: "Sync Failed", variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ threadId, dealId }: { threadId: number; dealId: number }) => {
      return apiRequest("POST", `/api/email/threads/${threadId}/link`, { dealId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", activeThreadId, "detail"] });
      setLinkDialogOpen(false);
      setSelectedDealId("");
      toast({ title: "Thread Linked", description: "Email thread linked to deal" });
    },
    onError: () => {
      toast({ title: "Link Failed", variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ threadId, dealId }: { threadId: number; dealId: number }) => {
      return apiRequest("DELETE", `/api/email/threads/${threadId}/link/${dealId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/threads", activeThreadId, "detail"] });
      toast({ title: "Thread Unlinked" });
    },
  });

  const threads = threadsData?.threads || [];

  useEffect(() => {
    if (threads.length && !activeThreadId) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId]);

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isSuperAdmin = user?.role === 'super_admin';

  if (!accountData?.account) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Connect Your Email</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isSuperAdmin
                  ? "Connect your Gmail account to sync emails and link them to deals"
                  : "Email integration has not been set up yet. Please contact your administrator to enable Gmail sync."}
              </p>
            </div>
            {isSuperAdmin && (
              <Button onClick={() => window.location.href = '/api/google/connect?returnTo=' + encodeURIComponent('/admin/email')} data-testid="button-connect-email-inbox">
                <Mail className="h-4 w-4 mr-2" />
                Connect Gmail
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="email-inbox-page">
      {/* Thread List Sidebar */}
      <div className="w-96 border-r flex flex-col bg-background">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Email Inbox
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-inbox"
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-email-search"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <Select value={filterLinked} onValueChange={setFilterLinked}>
              <SelectTrigger className="h-7 text-xs w-auto border-0 px-2" data-testid="select-email-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Emails</SelectItem>
                <SelectItem value="linked">Linked to Deal</SelectItem>
                <SelectItem value="unlinked">Not Linked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {threadsLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchQuery ? "No emails match your search" : "No emails synced yet. Click sync to fetch emails."}
            </div>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                className={`p-3 cursor-pointer border-b hover-elevate ${
                  activeThreadId === thread.id ? "bg-accent/50" : ""
                }`}
                onClick={() => setActiveThreadId(thread.id)}
                data-testid={`email-thread-${thread.id}`}
              >
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-medium">
                    {getInitials(thread.fromName || thread.fromAddress)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm truncate ${thread.isUnread ? "font-semibold" : ""}`}>
                        {thread.fromName || thread.fromAddress || "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {safeRelativeTime(thread.lastMessageAt, "")}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${thread.isUnread ? "font-medium" : "text-muted-foreground"}`}>
                      {thread.subject || "(No Subject)"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {thread.snippet}
                    </p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {thread.hasAttachments && (
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                      )}
                      {thread.messageCount > 1 && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {thread.messageCount}
                        </Badge>
                      )}
                      {thread.linkedDealIds.length > 0 && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          <Link2 className="h-2.5 w-2.5 mr-0.5" />
                          DEAL-{thread.linkedDealIds[0]}
                        </Badge>
                      )}
                      {thread.isUnread && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Thread Detail */}
      <div className="flex-1 flex flex-col bg-background">
        {activeThreadId && threadDetail ? (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-lg truncate">
                    {threadDetail.thread.subject || "(No Subject)"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {threadDetail.messages.length} message{threadDetail.messages.length !== 1 ? "s" : ""}
                    {threadDetail.thread.participants && (
                      <span> with {threadDetail.thread.participants.slice(0, 3).join(", ")}
                        {threadDetail.thread.participants.length > 3 ? ` +${threadDetail.thread.participants.length - 3} more` : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {threadDetail.dealLinks.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {threadDetail.dealLinks.map((link) => (
                        <Badge key={link.dealId} variant="default" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          {link.deal.loanNumber || `DEAL-${link.dealId}`}
                          {link.deal.borrowerName && <span>({link.deal.borrowerName})</span>}
                          <button
                            onClick={() => unlinkMutation.mutate({ threadId: activeThreadId, dealId: link.dealId })}
                            className="ml-1 opacity-70 hover:opacity-100"
                            data-testid={`button-unlink-deal-${link.dealId}`}
                          >
                            <Unlink className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLinkDialogOpen(true)}
                    data-testid="button-link-to-deal"
                  >
                    <Link2 className="h-4 w-4 mr-1" />
                    Link to Deal
                  </Button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {threadDetailLoading ? (
                  <div className="text-center text-sm text-muted-foreground py-8">Loading messages...</div>
                ) : (
                  threadDetail.messages.map((msg) => (
                    <Card key={msg.id} data-testid={`email-message-${msg.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-medium">
                              {getInitials(msg.fromName || msg.fromAddress)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {msg.fromName || msg.fromAddress}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                to {msg.toAddresses?.join(", ")}
                                {msg.ccAddresses?.length ? `, cc: ${msg.ccAddresses.join(", ")}` : ""}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {safeFormat(msg.internalDate, "MMM d, yyyy h:mm a", "")}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {msg.bodyHtml ? (
                          <div
                            className="text-sm prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_table]:text-sm"
                            dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                          />
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap font-sans">{msg.bodyText || msg.snippet || ""}</pre>
                        )}

                        {msg.attachments && (msg.attachments as any[]).length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <Paperclip className="h-3 w-3" />
                              {(msg.attachments as any[]).length} attachment{(msg.attachments as any[]).length !== 1 ? "s" : ""}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {(msg.attachments as any[]).map((att: any, idx: number) => (
                                <a
                                  key={idx}
                                  href={`/api/email/messages/${msg.gmailMessageId}/attachments/${att.attachmentId}`}
                                  className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm hover-elevate"
                                  download={att.filename}
                                  data-testid={`attachment-download-${idx}`}
                                >
                                  <Download className="h-3 w-3" />
                                  <span className="truncate max-w-[200px]">{att.filename}</span>
                                  <span className="text-xs text-muted-foreground">{formatSize(att.size)}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <Mail className="h-12 w-12 mx-auto opacity-30" />
              <p>Select an email thread to view</p>
            </div>
          </div>
        )}
      </div>

      {/* Link to Deal Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Email Thread to Deal</DialogTitle>
            <DialogDescription>
              Choose a deal to link this email conversation to. Linked emails will appear in the deal's communications.
            </DialogDescription>
          </DialogHeader>

          {suggestedDeals?.deals && suggestedDeals.deals.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Suggested Deals</p>
              <p className="text-xs text-muted-foreground">
                Based on email participants matching borrowers/brokers
              </p>
              <div className="space-y-1">
                {suggestedDeals.deals.map((deal: any) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between p-2 border rounded-md hover-elevate cursor-pointer"
                    onClick={() => {
                      setSelectedDealId(String(deal.id));
                    }}
                    data-testid={`suggested-deal-${deal.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{deal.loanNumber || `DEAL-${deal.id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {deal.borrowerName} - {deal.propertyAddress}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeThreadId) {
                          linkMutation.mutate({ threadId: activeThreadId, dealId: deal.id });
                        }
                      }}
                      data-testid={`button-link-suggested-${deal.id}`}
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Link
                    </Button>
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Select Deal</p>
            <Select value={selectedDealId} onValueChange={setSelectedDealId}>
              <SelectTrigger data-testid="select-deal-to-link">
                <SelectValue placeholder="Choose a deal..." />
              </SelectTrigger>
              <SelectContent>
                {dealsData?.quotes?.map((deal: any) => (
                  <SelectItem key={deal.projectId || deal.id} value={String(deal.projectId || deal.id)}>
                    {deal.loanNumber || `DEAL-${deal.projectId || deal.id}`} - {deal.borrowerName || "Unknown Borrower"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (activeThreadId && selectedDealId) {
                  linkMutation.mutate({ threadId: activeThreadId, dealId: parseInt(selectedDealId) });
                }
              }}
              disabled={!selectedDealId || linkMutation.isPending}
              data-testid="button-confirm-link"
            >
              {linkMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
              Link to Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

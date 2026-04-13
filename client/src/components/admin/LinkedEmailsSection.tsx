import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Paperclip, ExternalLink } from "lucide-react";
import { safeFormat } from "@/lib/utils";
import { useLocation } from "wouter";

interface LinkedEmailsSectionProps {
  dealId: number;
}

export function LinkedEmailsSection({ dealId }: LinkedEmailsSectionProps) {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{ threads: any[] }>({
    queryKey: [`/api/email/deal/${dealId}/threads`],
  });

  const threads = data?.threads || [];

  return (
    <Card className="mt-4" data-testid="linked-emails-section">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2" data-testid="text-linked-emails-title">
            <Mail className="h-4 w-4" />
            Linked Email Threads
            {threads.length > 0 && (
              <Badge variant="secondary" className="text-[10px]" data-testid="text-email-count">{threads.length}</Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/admin/email')}
            data-testid="button-go-to-inbox"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Email Inbox
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : threads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-linked-emails">
            No email threads linked to this deal yet. Link emails from the Email Inbox page.
          </p>
        ) : (
          <div className="space-y-2">
            {threads.map((thread: any) => (
              <button
                key={thread.id}
                className="flex items-start gap-3 p-3 border rounded-md hover-elevate cursor-pointer w-full text-left"
                onClick={() => setLocation(`/admin/email?threadId=${thread.id}`)}
                data-testid={`button-linked-email-${thread.id}`}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate" data-testid={`text-email-subject-${thread.id}`}>
                      {thread.subject || "(No Subject)"}
                    </p>
                    <span className="text-xs text-muted-foreground flex-shrink-0" data-testid={`text-email-date-${thread.id}`}>
                      {safeFormat(thread.lastMessageAt, "MMM d", "")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate" data-testid={`text-email-from-${thread.id}`}>
                    {thread.fromName || thread.fromAddress} - {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {thread.snippet}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {thread.hasAttachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    {thread.isUnread && (
                      <Badge variant="default" className="text-[10px] px-1 py-0">New</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

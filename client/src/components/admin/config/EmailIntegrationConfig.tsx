import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, CheckCircle2, FolderOpen, RefreshCw, Unplug, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { safeFormat } from "@/lib/utils";

interface EmailAccount {
  id: number;
  emailAddress: string;
  provider: string;
  isActive: boolean;
  lastSyncAt: string | null;
  syncStatus: string;
  createdAt: string;
}

interface GoogleStatus {
  connected: boolean;
  gmail: { connected: boolean; emailAddress: string | null; lastSyncAt: string | null; syncStatus: string | null };
  drive: { connected: boolean };
}

export default function EmailIntegrationConfig() {
  const { toast } = useToast();

  // Use unified Google status
  const { data: googleStatus, isLoading: isGoogleLoading } = useQuery<GoogleStatus>({
    queryKey: ["/api/google/status"],
  });

  // Keep email account query for detailed info (sync status, created date)
  const { data, isLoading: isAccountLoading } = useQuery<{ account: EmailAccount | null }>({
    queryKey: ["/api/email/account"],
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/sync"),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/email/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      toast({
        title: "Email Sync Complete",
        description: `Synced ${result.synced} threads${result.errors?.length ? ` with ${result.errors.length} errors` : ""}`,
      });
    },
    onError: () => {
      toast({ title: "Sync Failed", description: "Could not sync emails. Please try again.", variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      toast({ title: "Google Disconnected", description: "Gmail and Drive have been disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
    },
  });

  const account = data?.account;
  const isLoading = isGoogleLoading || isAccountLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const isConnected = googleStatus?.connected || googleStatus?.gmail?.connected;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google Integration
        </CardTitle>
        <CardDescription>
          Connect your Google account to sync emails, link conversations to deals, and store documents in Google Drive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected && account ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <span className="font-medium">{account.emailAddress}</span>
                </div>
                <Badge variant="default">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending || account.syncStatus === 'syncing'}
                  data-testid="button-sync-email"
                >
                  {syncMutation.isPending || account.syncStatus === 'syncing' ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Sync Now
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-google"
                >
                  <Unplug className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                <Mail className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Gmail</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {account.lastSyncAt
                      ? `Last synced ${safeFormat(account.lastSyncAt, "MMM d, h:mm a")}`
                      : "Not yet synced"}
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                <FolderOpen className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Google Drive</p>
                  <p className="text-xs text-muted-foreground">Document storage</p>
                </div>
                {googleStatus?.drive?.connected ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <Badge variant="secondary" className="text-xs">Pending</Badge>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <div>
              <p className="font-medium">No Google Account Connected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect Google to enable email sync and document storage
              </p>
            </div>
            <Button
              onClick={() => window.location.href = '/api/google/connect?returnTo=' + encodeURIComponent('/admin/settings?tab=integrations')}
              data-testid="button-connect-google"
              className="gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
              </svg>
              Connect Google
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

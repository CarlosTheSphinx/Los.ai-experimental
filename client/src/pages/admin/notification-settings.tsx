import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Loader2, Bell, MessageSquare, Mail } from "lucide-react";

export default function AdminNotificationSettingsPage() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/notification-settings"],
  });
  const [email, setEmail] = useState("");
  const [smsPhone, setSmsPhone] = useState("");

  useEffect(() => {
    if (data?.settings) {
      setEmail(data.settings.email || "");
      setSmsPhone(data.settings.smsPhone || "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/admin/notification-settings", { email, smsPhone: smsPhone || null }),
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-settings"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const testSms = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/notification-settings/test-sms"),
    onSuccess: () => toast({ title: "Test SMS sent", description: `Sent to ${smsPhone}` }),
    onError: (err: any) => toast({ title: "Test SMS failed", description: err?.message || "See server logs", variant: "destructive" }),
  });

  const testDigest = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/notification-settings/test-digest"),
    onSuccess: () => toast({ title: "Digest sent", description: `Sent to ${email}` }),
    onError: (err: any) => toast({ title: "Digest failed", description: err?.message || "See server logs", variant: "destructive" }),
  });

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 space-y-6">
      <Link href="/admin/tickets">
        <Button variant="ghost" size="sm" data-testid="btn-back"><ArrowLeft className="h-4 w-4 mr-1" /> Back to tickets</Button>
      </Link>

      <div className="flex items-center gap-3">
        <Bell className="h-7 w-7 text-primary" />
        <h1 className="font-display text-3xl">Support Notification Settings</h1>
      </div>

      {isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where to send support alerts</CardTitle>
              <CardDescription>
                Email is used for new ticket notifications, broker replies, and the daily digest (9 AM ET).
                SMS fires immediately for every new bug report.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="email">Notification email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email" />
              </div>
              <div>
                <Label htmlFor="sms">SMS phone number</Label>
                <Input id="sms" placeholder="+15551234567" value={smsPhone} onChange={e => setSmsPhone(e.target.value)} data-testid="input-sms" />
                <p className="text-xs text-muted-foreground mt-1">
                  Use E.164 format (with country code). Receives an SMS for every new bug report.
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="btn-save">
                  {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test delivery</CardTitle>
              <CardDescription>
                Send a sample message right now to verify both channels are working. Save first if you've made changes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-sm">Send test SMS</div>
                    <div className="text-xs text-muted-foreground">A sample bug alert to {smsPhone || '— phone not set —'}</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testSms.mutate()}
                  disabled={testSms.isPending || !smsPhone}
                  data-testid="btn-test-sms"
                >
                  {testSms.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Send
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-sm">Send test digest</div>
                    <div className="text-xs text-muted-foreground">Today's digest computed against current data, sent to {email || '— email not set —'}</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testDigest.mutate()}
                  disabled={testDigest.isPending || !email}
                  data-testid="btn-test-digest"
                >
                  {testDigest.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Loader2, Bell } from "lucide-react";

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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where to send support alerts</CardTitle>
            <CardDescription>
              Email is used for new ticket notifications and broker replies. SMS is captured here and used for urgent bug alerts (Phase 2).
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
                Use E.164 format (with country code). Used for urgent bug alerts in a future phase.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="btn-save">
                {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

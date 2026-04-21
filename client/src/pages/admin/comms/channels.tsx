import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Wifi, WifiOff, User } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

interface SmsConfig {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  fromNumber: string;
}

interface CommsChannel {
  id: number;
  type: string;
  ownerUserId: number | null;
  config: SmsConfig | null;
  smsEnabled: boolean;
  isActive: boolean;
  createdAt: string;
}

interface ChannelFormData {
  type: string;
  isActive: boolean;
  ownerUserId?: number | null;
  smsEnabled?: boolean;
  config?: SmsConfig;
}

interface TenantUser {
  id: number;
  fullName: string | null;
  email: string;
  role: string;
}

function ChannelTypeLabel({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    email: { label: "Email", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
    sms: { label: "SMS", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
    in_app: { label: "In-App", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" },
  };
  const { label, color } = map[type] || { label: type, color: "" };
  return <Badge className={color}>{label}</Badge>;
}

function ChannelForm({
  initial,
  users,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: Partial<CommsChannel>;
  users: TenantUser[];
  onSave: (data: ChannelFormData) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const { isSuperAdmin } = usePermissions();
  const [type, setType] = useState(initial?.type || "email");
  const smsConfig = initial?.config as SmsConfig | null;
  const [accountSid, setAccountSid] = useState(smsConfig?.accountSid || "");
  const [apiKey, setApiKey] = useState(smsConfig?.apiKey || "");
  const [apiKeySecret, setApiKeySecret] = useState(smsConfig?.apiKeySecret || "");
  const [fromNumber, setFromNumber] = useState(smsConfig?.fromNumber || "");
  const [smsEnabled, setSmsEnabled] = useState(initial?.smsEnabled ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [ownerUserId, setOwnerUserId] = useState<string>(
    initial?.ownerUserId ? String(initial.ownerUserId) : "none"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: ChannelFormData = { type, isActive };

    // Only set ownerUserId for SMS channels (per-user number assignment)
    if (type === "sms") {
      data.config = { accountSid, apiKey, apiKeySecret, fromNumber };
      data.ownerUserId = ownerUserId !== "none" ? parseInt(ownerUserId) : null;
      // Only super_admin can set smsEnabled — omit entirely for non-super-admin
      // to avoid a 403 on the backend
      if (isSuperAdmin) {
        data.smsEnabled = smsEnabled;
      }
    }
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="channel-type">Channel Type</Label>
        <Select value={type} onValueChange={setType} disabled={!!initial?.id}>
          <SelectTrigger id="channel-type" data-testid="select-channel-type">
            <SelectValue placeholder="Select channel type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email (Resend)</SelectItem>
            <SelectItem value="sms">SMS (Twilio)</SelectItem>
            <SelectItem value="in_app">In-App Notification</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {type === "sms" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="account-sid">Twilio Account SID</Label>
            <Input
              id="account-sid"
              data-testid="input-account-sid"
              value={accountSid}
              onChange={e => setAccountSid(e.target.value)}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              data-testid="input-api-key"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-secret">API Key Secret</Label>
            <Input
              id="api-key-secret"
              data-testid="input-api-key-secret"
              type="password"
              value={apiKeySecret}
              onChange={e => setApiKeySecret(e.target.value)}
              placeholder="••••••••••••••••••••••••••••••••"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="from-number">From Phone Number</Label>
            <Input
              id="from-number"
              data-testid="input-from-number"
              value={fromNumber}
              onChange={e => setFromNumber(e.target.value)}
              placeholder="+15551234567"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-user">Assign to Team Member (optional)</Label>
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger id="owner-user" data-testid="select-owner-user">
                <SelectValue placeholder="No specific owner (shared)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific owner (shared channel)</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={String(u.id)} data-testid={`user-option-${u.id}`}>
                    {u.fullName || u.email} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              When assigned, messages sent by this team member use this phone number.
            </p>
          </div>
          {isSuperAdmin ? (
            <div className="flex items-center gap-2">
              <Switch
                id="sms-enabled"
                data-testid="switch-sms-enabled"
                checked={smsEnabled}
                onCheckedChange={setSmsEnabled}
              />
              <Label htmlFor="sms-enabled">SMS Enabled (requires 10DLC approval)</Label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-2 rounded">
              SMS activation requires platform administrator approval for 10DLC compliance.
            </p>
          )}
        </>
      )}

      {type === "email" && (
        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
          Email sending uses the platform's Resend integration. No additional credentials needed.
        </p>
      )}

      {type === "in_app" && (
        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
          In-app notifications are delivered to users through the notification system.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Switch
          id="is-active"
          data-testid="switch-is-active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
        <Label htmlFor="is-active">Active</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving} data-testid="button-save-channel">
          {isSaving ? "Saving..." : "Save Channel"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function CommsChannelsPage() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CommsChannel | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: channels = [], isLoading } = useQuery<CommsChannel[]>({
    queryKey: ["/api/comms/channels"],
  });

  const { data: tenantUsers = [] } = useQuery<TenantUser[]>({
    queryKey: ["/api/comms/recipients/search"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/comms/recipients/search?q=");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ChannelFormData) => apiRequest("POST", "/api/comms/channels", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/channels"] });
      setShowAdd(false);
      toast({ title: "Channel created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ChannelFormData }) =>
      apiRequest("PATCH", `/api/comms/channels/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/channels"] });
      setEditing(null);
      toast({ title: "Channel updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/comms/channels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/channels"] });
      setDeletingId(null);
      toast({ title: "Channel removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const getUserLabel = (ownerUserId: number | null) => {
    if (!ownerUserId) return null;
    const u = tenantUsers.find((u: TenantUser) => u.id === ownerUserId);
    return u ? (u.fullName || u.email) : `User #${ownerUserId}`;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Channel Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure email, SMS, and in-app notification channels. Assign phone numbers to team members for personalized outreach.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="button-add-channel">
          <Plus className="h-4 w-4 mr-2" />
          Add Channel
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading channels...</div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No channels configured yet. Add a channel to start sending communications.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {channels.map(ch => (
            <Card key={ch.id} data-testid={`card-channel-${ch.id}`}>
              <CardContent className="pt-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {ch.isActive ? (
                    <Wifi className="h-5 w-5 text-green-500" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <ChannelTypeLabel type={ch.type} />
                      {ch.type === "sms" && (
                        <Badge variant={ch.smsEnabled ? "default" : "outline"} className="text-xs">
                          {ch.smsEnabled ? "SMS Active" : "SMS Pending 10DLC"}
                        </Badge>
                      )}
                      {!ch.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      {ch.type === "sms" && ch.config && (
                        <span>From: {ch.config.fromNumber || "—"}</span>
                      )}
                      {ch.ownerUserId && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {getUserLabel(ch.ownerUserId)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(ch)}
                    data-testid={`button-edit-channel-${ch.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingId(ch.id)}
                    data-testid={`button-delete-channel-${ch.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Channel</DialogTitle>
          </DialogHeader>
          <ChannelForm
            users={tenantUsers}
            onSave={data => createMutation.mutate(data)}
            onCancel={() => setShowAdd(false)}
            isSaving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Channel</DialogTitle>
          </DialogHeader>
          {editing && (
            <ChannelForm
              initial={editing}
              users={tenantUsers}
              onSave={data => updateMutation.mutate({ id: editing.id, data })}
              onCancel={() => setEditing(null)}
              isSaving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deletingId !== null} onOpenChange={v => !v && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Channel</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove this channel? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              data-testid="button-confirm-delete"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

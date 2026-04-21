import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Pencil, User, Mail, MessageSquare, Bell,
  CheckCircle2, AlertCircle, Lock,
} from "lucide-react";
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

type ChannelType = "email" | "sms" | "in_app";

interface SetupStepMeta {
  type: ChannelType;
  title: string;
  subtitle: string;
  icon: typeof Mail;
}

const SETUP_STEPS: SetupStepMeta[] = [
  { type: "email",  title: "Email",  subtitle: "Resend (platform managed)", icon: Mail },
  { type: "sms",    title: "SMS",    subtitle: "Twilio per-tenant credentials", icon: MessageSquare },
  { type: "in_app", title: "In-App", subtitle: "Notification bell delivery", icon: Bell },
];

function ChannelStatusBadge({ channel }: { channel: CommsChannel | undefined }) {
  if (!channel) {
    return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />Needs setup</Badge>;
  }
  if (!channel.isActive) {
    return <Badge variant="outline" className="gap-1 text-muted-foreground">Inactive</Badge>;
  }
  if (channel.type === "sms" && !channel.smsEnabled) {
    return <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700">
      <Lock className="h-3 w-3" />Disabled until 10DLC approved
    </Badge>;
  }
  return <Badge className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
    <CheckCircle2 className="h-3 w-3" />Connected
  </Badge>;
}

function ChannelForm({
  initial,
  initialType,
  users,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: Partial<CommsChannel>;
  initialType?: ChannelType;
  users: TenantUser[];
  onSave: (data: ChannelFormData) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const { isSuperAdmin } = usePermissions();
  const [type, setType] = useState(initial?.type || initialType || "email");
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
    if (type === "sms") {
      data.config = { accountSid, apiKey, apiKeySecret, fromNumber };
      data.ownerUserId = ownerUserId !== "none" ? parseInt(ownerUserId) : null;
      if (isSuperAdmin) data.smsEnabled = smsEnabled;
    }
    onSave(data);
  };

  const typeLocked = !!initial?.id || !!initialType;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="channel-type">Channel Type</Label>
        <Select value={type} onValueChange={setType} disabled={typeLocked}>
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
            <Input id="account-sid" data-testid="input-account-sid" value={accountSid} onChange={e => setAccountSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input id="api-key" data-testid="input-api-key" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-secret">API Key Secret</Label>
            <Input id="api-key-secret" data-testid="input-api-key-secret" type="password" value={apiKeySecret} onChange={e => setApiKeySecret(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="from-number">From Phone Number</Label>
            <Input id="from-number" data-testid="input-from-number" value={fromNumber} onChange={e => setFromNumber(e.target.value)} placeholder="+15551234567" required />
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
            <p className="text-xs text-muted-foreground">When assigned, messages sent by this team member use this phone number.</p>
          </div>
          {isSuperAdmin ? (
            <div className="flex items-center gap-2">
              <Switch id="sms-enabled" data-testid="switch-sms-enabled" checked={smsEnabled} onCheckedChange={setSmsEnabled} />
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
        <Switch id="is-active" data-testid="switch-is-active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="is-active">Active</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
        <Button type="submit" disabled={isSaving} data-testid="button-save-channel">
          {isSaving ? "Saving..." : "Save Channel"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ChannelStepCard({
  step,
  index,
  channels,
  onSetup,
  onEdit,
  onDelete,
  onAddAdditional,
  getUserLabel,
}: {
  step: SetupStepMeta;
  index: number;
  channels: CommsChannel[];
  onSetup: (type: ChannelType) => void;
  onEdit: (ch: CommsChannel) => void;
  onDelete: (id: number) => void;
  onAddAdditional: (type: ChannelType) => void;
  getUserLabel: (id: number | null) => string | null;
}) {
  const matching = channels.filter(c => c.type === step.type);
  const primary = matching[0];
  const Icon = step.icon;

  return (
    <Card data-testid={`step-card-${step.type}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-semibold">
              {index + 1}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {step.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{step.subtitle}</p>
            </div>
          </div>
          <ChannelStatusBadge channel={primary} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {matching.length === 0 ? (
          <Button variant="outline" onClick={() => onSetup(step.type)} data-testid={`button-setup-${step.type}`}>
            <Plus className="h-4 w-4 mr-2" />
            Set up {step.title}
          </Button>
        ) : (
          <>
            {matching.map(ch => (
              <div key={ch.id} className="flex items-center justify-between p-2 border rounded bg-background" data-testid={`channel-row-${ch.id}`}>
                <div className="text-sm">
                  {ch.type === "sms" && ch.config?.fromNumber && (
                    <span className="font-mono">{ch.config.fromNumber}</span>
                  )}
                  {ch.type === "email" && <span>Resend (default)</span>}
                  {ch.type === "in_app" && <span>Built-in</span>}
                  {ch.ownerUserId && (
                    <span className="ml-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {getUserLabel(ch.ownerUserId)}
                    </span>
                  )}
                  {!ch.isActive && (
                    <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(ch)} data-testid={`button-edit-channel-${ch.id}`}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(ch.id)} data-testid={`button-delete-channel-${ch.id}`}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {step.type === "sms" && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onAddAdditional(step.type)} data-testid={`button-add-additional-${step.type}`}>
                <Plus className="h-3 w-3 mr-1" />
                Add another SMS number
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommsChannelsPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState<{ type?: ChannelType } | null>(null);
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
      setShowForm(null);
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
      <div>
        <h2 className="text-xl font-semibold" data-testid="text-page-title">Channel Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your delivery channels in order. Email is required first; SMS and in-app are optional.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading channels...</div>
      ) : (
        <div className="space-y-3">
          {SETUP_STEPS.map((step, i) => (
            <ChannelStepCard
              key={step.type}
              step={step}
              index={i}
              channels={channels}
              onSetup={t => setShowForm({ type: t })}
              onAddAdditional={t => setShowForm({ type: t })}
              onEdit={ch => setEditing(ch)}
              onDelete={id => setDeletingId(id)}
              getUserLabel={getUserLabel}
            />
          ))}
        </div>
      )}

      <Dialog open={!!showForm} onOpenChange={v => !v && setShowForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {showForm?.type ? `Set up ${SETUP_STEPS.find(s => s.type === showForm.type)?.title}` : "Add Channel"}
            </DialogTitle>
          </DialogHeader>
          <ChannelForm
            initialType={showForm?.type}
            users={tenantUsers}
            onSave={data => createMutation.mutate(data)}
            onCancel={() => setShowForm(null)}
            isSaving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Channel</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>Remove Channel</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove this channel? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} data-testid="button-cancel-delete">Cancel</Button>
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

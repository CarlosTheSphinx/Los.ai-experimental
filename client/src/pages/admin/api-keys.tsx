import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDate, formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Key,
  Plus,
  Copy,
  RotateCw,
  Trash2,
  Shield,
  Clock,
  Activity,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Webhook,
  Globe,
  Zap,
  Send,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  XCircle,
  CheckCircle2,
} from "lucide-react";

const SCOPE_CATEGORIES = [
  {
    name: "Deal Management",
    scopes: [
      { id: "deals:read", label: "Read Deals" },
      { id: "deals:write", label: "Write Deals" },
      { id: "deals:delete", label: "Delete Deals", critical: true },
    ],
  },
  {
    name: "Document Management",
    scopes: [
      { id: "documents:read", label: "Read Documents" },
      { id: "documents:write", label: "Write Documents" },
      { id: "documents:sign", label: "Sign Documents" },
    ],
  },
  {
    name: "Borrower Profiles",
    scopes: [
      { id: "borrowers:read", label: "Read Borrowers" },
      { id: "borrowers:write", label: "Write Borrowers" },
      { id: "borrowers:pii", label: "Access PII", critical: true },
    ],
  },
  {
    name: "Financial Data",
    scopes: [
      { id: "financials:read", label: "Read Financials" },
      { id: "financials:write", label: "Write Financials" },
    ],
  },
  {
    name: "Reports & Exports",
    scopes: [
      { id: "reports:read", label: "Read Reports" },
      { id: "reports:export", label: "Export Reports" },
      { id: "reports:data_dump", label: "Data Dump", critical: true },
    ],
  },
  {
    name: "Webhooks",
    scopes: [
      { id: "webhooks:read", label: "Read Webhooks" },
      { id: "webhooks:write", label: "Write Webhooks" },
      { id: "webhooks:manage", label: "Manage Webhooks" },
    ],
  },
];

const EVENT_CATEGORIES = [
  {
    name: "Deal Events",
    resourceType: "deal",
    events: [
      { id: "deals.created", label: "Deal Created" },
      { id: "deals.updated", label: "Deal Updated" },
      { id: "deals.status_changed", label: "Status Changed" },
      { id: "deals.deleted", label: "Deal Deleted", critical: true },
    ],
  },
  {
    name: "Document Events",
    resourceType: "document",
    events: [
      { id: "documents.uploaded", label: "Document Uploaded" },
      { id: "documents.signed", label: "Document Signed" },
      { id: "documents.deleted", label: "Document Deleted", critical: true },
    ],
  },
  {
    name: "Borrower Events",
    resourceType: "borrower",
    events: [
      { id: "borrowers.created", label: "Borrower Created" },
      { id: "borrowers.updated", label: "Borrower Updated" },
      { id: "borrowers.deleted", label: "Borrower Deleted", critical: true },
    ],
  },
  {
    name: "User Events",
    resourceType: "user",
    events: [
      { id: "users.created", label: "User Created" },
      { id: "users.updated", label: "User Updated" },
    ],
  },
  {
    name: "Audit Events",
    resourceType: "audit",
    events: [
      { id: "audit.pii_accessed", label: "PII Accessed", critical: true },
      { id: "audit.api_key_revoked", label: "API Key Revoked", critical: true },
      { id: "audit.critical_action", label: "Critical Action", critical: true },
    ],
  },
  {
    name: "System Events",
    resourceType: "system",
    events: [
      { id: "system.health", label: "System Health" },
    ],
  },
];

interface ApiKeyItem {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  isRevoked: boolean;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
}

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  rateLimitPerSecond: number;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
  failureCount: number;
}

interface DeliveryItem {
  id: string;
  eventId: string;
  succeeded: boolean;
  statusCode: number | null;
  responseTime: number | null;
  error: string | null;
  timestamp: string;
}

function ApiKeysTab() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyExpiration, setKeyExpiration] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [rotateTarget, setRotateTarget] = useState<ApiKeyItem | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);

  const { data, isLoading } = useQuery<{ keys: ApiKeyItem[] }>({
    queryKey: ["/api/user/api-keys"],
  });

  const keys = data?.keys || [];

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; scopes: string[]; expiresAt?: string }) => {
      const res = await apiRequest("POST", "/api/user/api-keys", payload);
      return res.json();
    },
    onSuccess: (data) => {
      setNewKeyPlaintext(data.keyPlaintext);
      setNewKeyName(data.name);
      setShowCreateDialog(false);
      setShowKeyDialog(true);
      setKeyName("");
      setKeyExpiration("");
      setSelectedScopes([]);
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      toast({ title: "API key created", description: "Make sure to copy and save it now." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create key", description: error.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const res = await apiRequest("DELETE", `/api/user/api-keys/${keyId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      setRevokeTarget(null);
      toast({ title: "API key revoked" });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const res = await apiRequest("POST", `/api/user/api-keys/${keyId}/rotate`);
      return res.json();
    },
    onSuccess: (data) => {
      setNewKeyPlaintext(data.newKeyPlaintext);
      setNewKeyName("Rotated Key");
      setShowKeyDialog(true);
      setRotateTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      toast({ title: "API key rotated", description: "Old key has been revoked. Save the new one." });
    },
  });

  const handleCreate = () => {
    if (!keyName.trim()) return;
    if (selectedScopes.length === 0) {
      toast({ title: "Select at least one scope", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: keyName.trim(),
      scopes: selectedScopes,
      expiresAt: keyExpiration || undefined,
    });
  };

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(newKeyPlaintext);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const activeKeys = keys.filter((k) => !k.isRevoked);
  const revokedKeys = keys.filter((k) => k.isRevoked);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground" data-testid="text-apikeys-description">
          Create and manage API keys for programmatic access to your account.
        </p>
        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="button-create-api-key"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-[10px] shadow-sm" data-testid="card-stat-active">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Key className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Keys</p>
                <p className="text-2xl font-bold" data-testid="text-active-count">{activeKeys.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[10px] shadow-sm" data-testid="card-stat-revoked">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Shield className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Revoked Keys</p>
                <p className="text-2xl font-bold" data-testid="text-revoked-count">{revokedKeys.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[10px] shadow-sm" data-testid="card-stat-total-usage">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total API Calls</p>
                <p className="text-2xl font-bold" data-testid="text-total-usage">
                  {keys.reduce((sum, k) => sum + (k.usageCount || 0), 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="rounded-[10px] shadow-sm animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-1/3 mb-3" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : keys.length === 0 ? (
        <Card className="rounded-[10px] shadow-sm" data-testid="card-empty-state">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Key className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No API Keys Yet</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Create your first API key to start integrating with the platform programmatically.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-key">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeKeys.map((key) => (
            <Card key={key.id} className="rounded-[10px] shadow-sm" data-testid={`card-api-key-${key.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[17px] font-semibold" data-testid={`text-key-name-${key.id}`}>
                        {key.name}
                      </h3>
                      <Badge variant="outline" className="text-emerald-600 border-emerald-600/30 bg-emerald-500/10">
                        Active
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-mono bg-muted px-2 py-0.5 rounded" data-testid={`text-key-prefix-${key.id}`}>
                        {key.keyPrefix}...
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {formatDate(key.createdAt)}
                      </span>
                      {key.lastUsedAt && (
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          Last used {formatDate(key.lastUsedAt)}
                        </span>
                      )}
                      <span>{key.usageCount || 0} calls</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {((key.scopes as string[]) || []).slice(0, 6).map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                      {(key.scopes as string[])?.length > 6 && (
                        <Badge variant="secondary" className="text-xs">
                          +{(key.scopes as string[]).length - 6} more
                        </Badge>
                      )}
                    </div>
                    {key.expiresAt && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                        <AlertTriangle className="h-3 w-3" />
                        Expires {formatDate(key.expiresAt)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRotateTarget(key)}
                      data-testid={`button-rotate-key-${key.id}`}
                    >
                      <RotateCw className="h-4 w-4 mr-1" />
                      Rotate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => setRevokeTarget(key)}
                      data-testid={`button-revoke-key-${key.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Revoke
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {revokedKeys.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-muted-foreground pt-4" data-testid="text-revoked-heading">
                Revoked Keys
              </h2>
              {revokedKeys.map((key) => (
                <Card
                  key={key.id}
                  className="rounded-[10px] shadow-sm opacity-60"
                  data-testid={`card-revoked-key-${key.id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-[17px] font-semibold line-through">{key.name}</h3>
                          <Badge variant="destructive">Revoked</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">{key.keyPrefix}...</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-create-dialog-title">Create New API Key</DialogTitle>
            <DialogDescription>
              Configure your API key with a name and the permissions it needs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production Integration"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                data-testid="input-key-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-expiration">Expiration (optional)</Label>
              <Input
                id="key-expiration"
                type="date"
                value={keyExpiration}
                onChange={(e) => setKeyExpiration(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                data-testid="input-key-expiration"
              />
            </div>
            <div className="space-y-3">
              <Label>Permissions (Scopes)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SCOPE_CATEGORIES.map((cat) => (
                  <Card key={cat.name} className="rounded-[10px]">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-[13px] uppercase tracking-wider text-muted-foreground">
                        {cat.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      {cat.scopes.map((scope) => (
                        <label
                          key={scope.id}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                          data-testid={`checkbox-scope-${scope.id}`}
                        >
                          <Checkbox
                            checked={selectedScopes.includes(scope.id)}
                            onCheckedChange={() => toggleScope(scope.id)}
                          />
                          <span>{scope.label}</span>
                          {scope.critical && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              Critical
                            </Badge>
                          )}
                        </label>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
              {selectedScopes.length > 0 && (
                <p className="text-sm text-muted-foreground" data-testid="text-selected-count">
                  {selectedScopes.length} scope{selectedScopes.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !keyName.trim() || selectedScopes.length === 0}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? "Creating..." : "Create API Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showKeyDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowKeyDialog(false);
            setNewKeyPlaintext("");
            setKeyCopied(false);
            setKeyVisible(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-key-created-title">API Key Created</DialogTitle>
            <DialogDescription>
              This is the only time this key will be shown. Copy and store it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-semibold">Save this key now!</p>
                  <p>You will not be able to see it again after closing this dialog.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Key Name</Label>
              <p className="text-sm font-medium" data-testid="text-new-key-name">{newKeyName}</p>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 bg-muted p-3 rounded-lg text-sm font-mono break-all"
                  data-testid="text-new-key-value"
                >
                  {keyVisible ? newKeyPlaintext : "•".repeat(Math.min(newKeyPlaintext.length, 40))}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setKeyVisible(!keyVisible)}
                  data-testid="button-toggle-key-visibility"
                >
                  {keyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button
              onClick={handleCopyKey}
              className="w-full"
              variant={keyCopied ? "outline" : "default"}
              data-testid="button-copy-key"
            >
              {keyCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-revoke-dialog-title">Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke "{revokeTarget?.name}"? Any applications using this key
              will immediately lose access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
              data-testid="button-confirm-revoke"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rotateTarget} onOpenChange={(open) => !open && setRotateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-rotate-dialog-title">Rotate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new key and revoke "{rotateTarget?.name}". The new key will have the
              same permissions. Applications using the old key will need to be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-rotate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rotateTarget && rotateMutation.mutate(rotateTarget.id)}
              data-testid="button-confirm-rotate"
            >
              Rotate Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WebhooksTab() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebhookItem | null>(null);
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [rateLimit, setRateLimit] = useState("10");

  const { data, isLoading } = useQuery<{ webhooks: WebhookItem[] }>({
    queryKey: ["/api/webhooks"],
  });

  const webhooks = data?.webhooks || [];
  const activeWebhooks = webhooks.filter((w) => w.active);

  const { data: deliveriesData } = useQuery<{ deliveries: DeliveryItem[] }>({
    queryKey: ["/api/webhooks", expandedWebhook, "deliveries"],
    enabled: !!expandedWebhook,
    queryFn: async () => {
      const res = await fetch(`/api/webhooks/${expandedWebhook}/deliveries?limit=20`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; url: string; events: string[]; rateLimitPerSecond: number }) => {
      const res = await apiRequest("POST", "/api/webhooks", payload);
      return res.json();
    },
    onSuccess: () => {
      setShowCreateDialog(false);
      setWebhookName("");
      setWebhookUrl("");
      setSelectedEvents([]);
      setRateLimit("10");
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({ title: "Webhook created", description: "Your webhook is now active and will receive events." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create webhook", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/webhooks/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/webhooks/${id}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Test delivered", description: `Response: ${data.statusCode} (${data.responseTime}ms)` });
      } else {
        toast({ title: "Test failed", description: data.error || "Delivery failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Test failed", description: "Could not send test event", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/webhooks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      setDeleteTarget(null);
      toast({ title: "Webhook deleted" });
    },
  });

  const handleCreate = () => {
    if (!webhookName.trim() || !webhookUrl.trim() || selectedEvents.length === 0) return;
    createMutation.mutate({
      name: webhookName.trim(),
      url: webhookUrl.trim(),
      events: selectedEvents,
      rateLimitPerSecond: parseInt(rateLimit) || 10,
    });
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  const totalDeliveries = webhooks.reduce((sum, w) => sum + (w.failureCount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground" data-testid="text-webhooks-description">
          Configure webhooks to receive real-time notifications when events occur in your account.
        </p>
        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="button-create-webhook"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Webhook
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-[10px] shadow-sm" data-testid="card-stat-active-webhooks">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Webhook className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Webhooks</p>
                <p className="text-2xl font-bold" data-testid="text-active-webhooks-count">{activeWebhooks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[10px] shadow-sm" data-testid="card-stat-total-webhooks">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Globe className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Webhooks</p>
                <p className="text-2xl font-bold" data-testid="text-total-webhooks-count">{webhooks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[10px] shadow-sm" data-testid="card-stat-failures">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Recent Failures</p>
                <p className="text-2xl font-bold" data-testid="text-total-failures">{totalDeliveries}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="rounded-[10px] shadow-sm animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-1/3 mb-3" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="rounded-[10px] shadow-sm" data-testid="card-webhooks-empty">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Webhook className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Webhooks Yet</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Create your first webhook to receive real-time event notifications at your endpoint.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-webhook">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => (
            <Card key={wh.id} className="rounded-[10px] shadow-sm" data-testid={`card-webhook-${wh.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[17px] font-semibold" data-testid={`text-webhook-name-${wh.id}`}>
                        {wh.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className={wh.active
                          ? "text-emerald-600 border-emerald-600/30 bg-emerald-500/10"
                          : "text-gray-500 border-gray-400/30 bg-gray-500/10"
                        }
                      >
                        {wh.active ? "Active" : "Paused"}
                      </Badge>
                      {wh.failureCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {wh.failureCount} failures
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="font-mono truncate max-w-md" data-testid={`text-webhook-url-${wh.id}`}>
                        {wh.url}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {formatDate(wh.createdAt)}
                      </span>
                      {wh.lastTriggeredAt && (
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Last triggered {formatDate(wh.lastTriggeredAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(wh.events || []).slice(0, 5).map((evt) => (
                        <Badge key={evt} variant="secondary" className="text-xs">
                          {evt}
                        </Badge>
                      ))}
                      {(wh.events || []).length > 5 && (
                        <Badge variant="secondary" className="text-xs">
                          +{wh.events.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Switch
                      checked={wh.active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: wh.id, active: checked })}
                      data-testid={`switch-webhook-active-${wh.id}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testMutation.mutate(wh.id)}
                      disabled={testMutation.isPending || !wh.active}
                      data-testid={`button-test-webhook-${wh.id}`}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedWebhook(expandedWebhook === wh.id ? null : wh.id)}
                      data-testid={`button-deliveries-${wh.id}`}
                    >
                      {expandedWebhook === wh.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => setDeleteTarget(wh)}
                      data-testid={`button-delete-webhook-${wh.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {expandedWebhook === wh.id && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Recent Deliveries
                    </h4>
                    {!deliveriesData?.deliveries || deliveriesData.deliveries.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No deliveries recorded yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {deliveriesData.deliveries.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/50"
                            data-testid={`delivery-${d.id}`}
                          >
                            <div className="flex items-center gap-2">
                              {d.succeeded ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <Badge variant="secondary" className="text-xs">{d.eventId}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              {d.statusCode && <span>HTTP {d.statusCode}</span>}
                              {d.responseTime != null && <span>{d.responseTime}ms</span>}
                              <span>{formatTimestamp(d.timestamp)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-create-webhook-title">Create New Webhook</DialogTitle>
            <DialogDescription>
              Configure your webhook endpoint to receive real-time event notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Webhook Name</Label>
              <Input
                id="webhook-name"
                placeholder="e.g., Production Events Handler"
                value={webhookName}
                onChange={(e) => setWebhookName(e.target.value)}
                data-testid="input-webhook-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://your-server.com/webhooks/lendry"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                data-testid="input-webhook-url"
              />
              <p className="text-xs text-muted-foreground">Must be HTTPS. Private/internal IPs are blocked for security.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate-limit">Rate Limit (requests/second)</Label>
              <Input
                id="rate-limit"
                type="number"
                min="1"
                max="100"
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                data-testid="input-webhook-rate-limit"
              />
            </div>
            <div className="space-y-3">
              <Label>Event Subscriptions</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EVENT_CATEGORIES.map((cat) => (
                  <Card key={cat.name} className="rounded-[10px]">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-[13px] uppercase tracking-wider text-muted-foreground">
                        {cat.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      {cat.events.map((evt) => (
                        <label
                          key={evt.id}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                          data-testid={`checkbox-event-${evt.id}`}
                        >
                          <Checkbox
                            checked={selectedEvents.includes(evt.id)}
                            onCheckedChange={() => toggleEvent(evt.id)}
                          />
                          <span>{evt.label}</span>
                          {evt.critical && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              Admin
                            </Badge>
                          )}
                        </label>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
              {selectedEvents.length > 0 && (
                <p className="text-sm text-muted-foreground" data-testid="text-selected-events-count">
                  {selectedEvents.length} event{selectedEvents.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-create-webhook">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !webhookName.trim() || !webhookUrl.trim() || selectedEvents.length === 0}
              data-testid="button-confirm-create-webhook"
            >
              {createMutation.isPending ? "Creating..." : "Create Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-delete-webhook-title">Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will stop all event deliveries
              to this endpoint and remove its delivery history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-webhook">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-webhook"
            >
              Delete Webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-[30px] font-display font-bold" data-testid="text-page-title">Integrations</h1>
        <p className="text-muted-foreground mt-1" data-testid="text-page-description">
          Manage your API keys and webhook subscriptions for external integrations.
        </p>
      </div>

      <Tabs defaultValue="api-keys" className="space-y-6">
        <TabsList data-testid="tabs-integrations">
          <TabsTrigger value="api-keys" data-testid="tab-api-keys">
            <Key className="h-4 w-4 mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>

        <TabsContent value="webhooks">
          <WebhooksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

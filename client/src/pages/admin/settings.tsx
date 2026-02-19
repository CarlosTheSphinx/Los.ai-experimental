import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Save, Settings as SettingsIcon, RefreshCw, HardDrive, Phone, Mail, Brain,
  MapPin, Bot, CheckCircle2, XCircle, AlertCircle, Layers, Plus, Trash2,
  GripVertical, FileStack, ChevronRight, Shield, Palette, Lock,
  Calculator, GitBranch, Bell, Plug, CreditCard, LayoutList, FileText
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { PERMISSION_CATEGORIES, type PermissionKey } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

import BrandingConfig from "@/components/admin/config/BrandingConfig";
import AuthSecurityConfig from "@/components/admin/config/AuthSecurityConfig";
import PricingEngineConfig from "@/components/admin/config/PricingEngineConfig";
import PipelineWorkflowConfig from "@/components/admin/config/PipelineWorkflowConfig";
import DocumentsEsignConfig from "@/components/admin/config/DocumentsEsignConfig";
import NotificationsConfig from "@/components/admin/config/NotificationsConfig";
import CustomFieldsConfig from "@/components/admin/config/CustomFieldsConfig";
import BillingPlansConfig from "@/components/admin/config/BillingPlansConfig";
import EmailIntegrationConfig from "@/components/admin/config/EmailIntegrationConfig";

interface DealStage {
  id: number;
  key: string;
  label: string;
  color: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

const COLOR_OPTIONS = [
  { value: "gray", label: "Gray" },
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "blue", label: "Blue" },
  { value: "emerald", label: "Emerald" },
  { value: "cyan", label: "Cyan" },
  { value: "indigo", label: "Indigo" },
  { value: "teal", label: "Teal" },
  { value: "green", label: "Green" },
  { value: "red", label: "Red" },
  { value: "slate", label: "Slate" },
];

const stageColorMap: Record<string, string> = {
  gray: "bg-muted text-muted-foreground",
  yellow: "bg-warning/10 text-warning",
  orange: "bg-warning/10 text-warning",
  blue: "bg-primary/10 text-primary",
  emerald: "bg-success/10 text-success",
  cyan: "bg-info/10 text-info",
  indigo: "bg-primary/10 text-primary",
  teal: "bg-info/10 text-info",
  green: "bg-success/10 text-success",
  red: "bg-destructive/10 text-destructive",
  slate: "bg-muted text-muted-foreground",
};

const CONFIG_TABS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "auth", label: "Auth & Security", icon: Lock },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "pricing", label: "Pricing Engine", icon: Calculator },
  { id: "pipeline", label: "Statuses & Stages", icon: GitBranch },
  { id: "documents", label: "Documents & eSign", icon: FileText },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "custom-fields", label: "Custom Fields", icon: LayoutList },
  { id: "billing", label: "Billing & Plans", icon: CreditCard },
];

function SortableStageItem({ stage, index, onDelete }: { stage: DealStage; index: number; onDelete: (id: number) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border rounded-lg bg-background"
      data-testid={`stage-row-${stage.key}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
        data-testid={`drag-handle-${stage.key}`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <span className="text-sm text-muted-foreground w-6">{index + 1}</span>
      <Badge className={`${stageColorMap[stage.color] || stageColorMap.gray} min-w-[100px] justify-center`}>
        {stage.label}
      </Badge>
      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{stage.key}</code>
      <span className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(stage.id)}
        data-testid={`delete-stage-${stage.key}`}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

interface SystemSetting {
  id: number;
  settingKey: string;
  settingValue: string;
  settingDescription: string | null;
  updatedBy: number | null;
  updatedAt: string | null;
}

interface IntegrationStatus {
  connected: boolean;
  status: string;
  details?: {
    phoneNumber?: string;
    fromEmail?: string;
    configured?: boolean;
  };
}

interface IntegrationsResponse {
  integrations: {
    twilio?: IntegrationStatus;
    resend?: IntegrationStatus;
    apify?: IntegrationStatus;
    openai?: IntegrationStatus;
    geoapify?: IntegrationStatus;
  };
}

const settingLabels: Record<string, { label: string; description: string; type: "text" | "textarea" | "url"; category: string }> = {
  company_name: {
    label: "Company Name",
    description: "The company name displayed throughout the application",
    type: "text",
    category: "general",
  },
  support_email: {
    label: "Support Email",
    description: "Email address for customer support inquiries",
    type: "text",
    category: "general",
  },
  puppeteer_quote_url: {
    label: "Quote Scraping URL",
    description: "The URL used for automated quote scraping via Puppeteer",
    type: "url",
    category: "general",
  },
  google_drive_parent_folder_id: {
    label: "Google Drive Parent Folder ID",
    description: "The ID of the parent Google Drive folder where all deal folders will be created. Find this in your Google Drive folder's URL after /folders/",
    type: "text",
    category: "google_drive",
  },
};

interface TeamPermission {
  id: number;
  role: string;
  permissionKey: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: number | null;
}

function TeamPermissionsCard() {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<{ permissions: TeamPermission[] }>({
    queryKey: ["/api/admin/permissions"],
  });

  useEffect(() => {
    if (data?.permissions) {
      const rolePerms = data.permissions.filter(p => p.role === selectedRole);
      const permMap: Record<string, boolean> = {};
      for (const p of rolePerms) {
        permMap[p.permissionKey] = p.enabled;
      }
      setLocalPerms(permMap);
      setHasChanges(false);
    }
  }, [data, selectedRole]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const permissions = Object.entries(localPerms).map(([key, enabled]) => ({ key, enabled }));
      return await apiRequest("PUT", `/api/admin/permissions/${selectedRole}`, { permissions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
      setHasChanges(false);
      toast({ title: `${selectedRole === "admin" ? "Admin" : "Staff"} permissions saved` });
    },
    onError: () => {
      toast({ title: "Failed to save permissions", variant: "destructive" });
    },
  });

  const handleToggle = (key: string, enabled: boolean) => {
    setLocalPerms(prev => ({ ...prev, [key]: enabled }));
    setHasChanges(true);
  };

  const handleToggleAll = (enabled: boolean) => {
    const newPerms: Record<string, boolean> = {};
    for (const cat of Object.values(PERMISSION_CATEGORIES)) {
      for (const p of cat.permissions) {
        newPerms[p.key] = enabled;
      }
    }
    setLocalPerms(newPerms);
    setHasChanges(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Team Permissions
        </CardTitle>
        <CardDescription>
          Configure what each team role can access. Super Admins always have full access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Tabs value={selectedRole} onValueChange={setSelectedRole}>
            <TabsList data-testid="tabs-permissions-role">
              <TabsTrigger value="admin" data-testid="tab-perm-admin">Admin</TabsTrigger>
              <TabsTrigger value="staff" data-testid="tab-perm-staff">Staff</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => handleToggleAll(true)} data-testid="button-enable-all">
              Enable All
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleToggleAll(false)} data-testid="button-disable-all">
              Disable All
            </Button>
            {hasChanges && (
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-permissions">
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(PERMISSION_CATEGORIES).map(([catKey, category]) => (
              <div key={catKey} className="border rounded-md p-4 space-y-3" data-testid={`perm-category-${catKey}`}>
                <h4 className="font-medium text-sm">{category.label}</h4>
                <div className="space-y-2">
                  {category.permissions.map(perm => (
                    <div key={perm.key} className="flex items-center justify-between gap-4" data-testid={`perm-row-${perm.key}`}>
                      <span className="text-sm text-muted-foreground">{perm.label}</span>
                      <Switch
                        checked={localPerms[perm.key] ?? false}
                        onCheckedChange={(checked) => handleToggle(perm.key, checked)}
                        data-testid={`switch-perm-${perm.key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
  const isSuperAdmin = user?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState("general");

  const { data, isLoading } = useQuery<{ settings: SystemSetting[] }>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: integrationsData, isLoading: integrationsLoading, refetch: refetchIntegrations } = useQuery<IntegrationsResponse>({
    queryKey: ["/api/admin/integrations/status"],
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: string; description?: string }) => {
      return await apiRequest("PUT", `/api/admin/settings/${key}`, { value, description });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: `Setting "${variables.key}" updated successfully` });
      setEditedSettings((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const [stages, setStages] = useState<DealStage[]>([]);
  const [showAddStageDialog, setShowAddStageDialog] = useState(false);
  const [newStageKey, setNewStageKey] = useState("");
  const [newStageLabel, setNewStageLabel] = useState("");
  const [newStageColor, setNewStageColor] = useState("gray");

  const { data: stagesData, isLoading: stagesLoading } = useQuery<{ stages: DealStage[] }>({
    queryKey: ["/api/admin/deal-stages"],
  });

  useEffect(() => {
    if (stagesData?.stages) {
      setStages(stagesData.stages);
    }
  }, [stagesData?.stages]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const reorderMutation = useMutation({
    mutationFn: async (stageOrders: { id: number; sortOrder: number }[]) => {
      return await apiRequest("PUT", "/api/admin/deal-stages/reorder", { stageOrders });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-stages"] });
      toast({ title: "Stages reordered successfully" });
    },
    onError: () => {
      toast({ title: "Failed to reorder stages", variant: "destructive" });
    },
  });

  const createStageMutation = useMutation({
    mutationFn: async (data: { key: string; label: string; color: string }) => {
      return await apiRequest("POST", "/api/admin/deal-stages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-stages"] });
      toast({ title: "Stage created successfully" });
      setShowAddStageDialog(false);
      setNewStageKey("");
      setNewStageLabel("");
      setNewStageColor("gray");
    },
    onError: () => {
      toast({ title: "Failed to create stage", variant: "destructive" });
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/deal-stages/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-stages"] });
      setStages((prev) => prev.filter((s) => s.id !== deletedId));
      toast({ title: "Stage deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete stage. It may be in use.", variant: "destructive" });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const activeId = Number(active.id);
      const overId = Number(over.id);
      const oldIndex = stages.findIndex((s) => s.id === activeId);
      const newIndex = stages.findIndex((s) => s.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const newStages = arrayMove(stages, oldIndex, newIndex);
      setStages(newStages);
      const stageOrders = newStages.map((stage, index) => ({
        id: stage.id,
        sortOrder: index,
      }));
      reorderMutation.mutate(stageOrders);
    }
  };

  const handleDeleteStage = (id: number) => {
    if (window.confirm("Are you sure you want to delete this stage? This cannot be undone.")) {
      deleteStageMutation.mutate(id);
    }
  };

  const handleAddStage = () => {
    if (!newStageKey || !newStageLabel) {
      toast({ title: "Key and label are required", variant: "destructive" });
      return;
    }
    createStageMutation.mutate({
      key: newStageKey.toLowerCase().replace(/\s+/g, "-"),
      label: newStageLabel,
      color: newStageColor,
    });
  };

  const handleSave = (key: string) => {
    const currentValue = editedSettings[key];
    if (currentValue !== undefined) {
      const setting = data?.settings.find((s) => s.settingKey === key);
      updateSettingMutation.mutate({
        key,
        value: currentValue,
        description: setting?.settingDescription || undefined,
      });
    }
  };

  const settings = data?.settings || [];

  const getSettingValue = (key: string) => {
    if (editedSettings[key] !== undefined) return editedSettings[key];
    const setting = settings.find((s) => s.settingKey === key);
    return setting?.settingValue || "";
  };

  const hasChanges = (key: string) => {
    const setting = settings.find((s) => s.settingKey === key);
    return editedSettings[key] !== undefined && editedSettings[key] !== setting?.settingValue;
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">System Settings</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const renderSettingField = (key: string, config: typeof settingLabels[string]) => {
    const setting = settings.find((s) => s.settingKey === key);
    const value = getSettingValue(key);
    const changed = hasChanges(key);

    return (
      <div key={key} className="space-y-2" data-testid={`setting-${key}`}>
        <div className="flex items-center justify-between">
          <Label htmlFor={key} className="font-medium">
            {config.label}
          </Label>
          {setting?.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {format(new Date(setting.updatedAt), "MMM d, yyyy")}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{config.description}</p>
        <div className="flex gap-2">
          {config.type === "textarea" ? (
            <Textarea
              id={key}
              value={value}
              onChange={(e) => setEditedSettings({ ...editedSettings, [key]: e.target.value })}
              className="flex-1"
              data-testid={`input-${key}`}
            />
          ) : (
            <Input
              id={key}
              type={config.type === "url" ? "url" : "text"}
              value={value}
              onChange={(e) => setEditedSettings({ ...editedSettings, [key]: e.target.value })}
              className="flex-1"
              data-testid={`input-${key}`}
            />
          )}
          <Button
            variant={changed ? "default" : "outline"}
            size="icon"
            onClick={() => handleSave(key)}
            disabled={!changed || updateSettingMutation.isPending}
            data-testid={`button-save-${key}`}
          >
            {updateSettingMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-semibold" data-testid="text-admin-settings-title">System Settings</h1>
      </div>

      <div className="flex gap-6">
        <nav className="w-52 shrink-0 space-y-1 sticky top-4 self-start" data-testid="nav-settings-tabs">
          {CONFIG_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors",
                activeTab === tab.id
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover-elevate"
              )}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 space-y-4">

          {activeTab === "general" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Application Configuration</CardTitle>
                  <CardDescription>
                    Manage global settings for the loan pricing application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {Object.entries(settingLabels)
                    .filter(([_, config]) => config.category === "general")
                    .map(([key, config]) => renderSettingField(key, config))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Google Drive Integration
                  </CardTitle>
                  <CardDescription>
                    Configure Google Drive for automatic document sync. When a document is uploaded, a copy will be stored in the loan's Google Drive folder.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {Object.entries(settingLabels)
                    .filter(([_, config]) => config.category === "google_drive")
                    .map(([key, config]) => renderSettingField(key, config))}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm text-muted-foreground">
                      <strong>Setup Instructions:</strong>
                    </p>
                    <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                      <li>Enable the Google Drive API in your Google Cloud Console</li>
                      <li>Add the Drive file scope to your OAuth consent screen</li>
                      <li>Log in with Google as a Super Admin to authorize Drive access</li>
                      <li>Enter the Google Drive Parent Folder ID above</li>
                    </ol>
                    <p className="text-sm text-muted-foreground">
                      When a deal is created, a folder will be automatically created inside the parent folder. Uploaded documents will sync to Google Drive.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>All Settings</CardTitle>
                  <CardDescription>
                    View all system settings including auto-generated ones
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 text-sm font-medium">Key</th>
                          <th className="text-left p-3 text-sm font-medium">Value</th>
                          <th className="text-left p-3 text-sm font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settings.map((setting) => (
                          <tr key={setting.id} className="border-t" data-testid={`row-setting-${setting.settingKey}`}>
                            <td className="p-3 font-mono text-sm">{setting.settingKey}</td>
                            <td className="p-3 text-sm truncate max-w-[200px]">{setting.settingValue}</td>
                            <td className="p-3 text-sm text-muted-foreground">{setting.settingDescription || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "branding" && <BrandingConfig />}

          {activeTab === "auth" && <AuthSecurityConfig />}

          {activeTab === "roles" && isSuperAdmin && <TeamPermissionsCard />}
          {activeTab === "roles" && !isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Roles & Permissions
                </CardTitle>
                <CardDescription>
                  Only Super Admins can manage team permissions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Contact a Super Admin to update role-based permissions for your organization.
                </p>
              </CardContent>
            </Card>
          )}

          {activeTab === "pricing" && <PricingEngineConfig />}

          {activeTab === "pipeline" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Deal Stages
                  </CardTitle>
                  <CardDescription>
                    Configure the workflow stages for loan deals. Drag to reorder stages. These stages help track the progress of each loan from initial review to closing.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stagesLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEnd}
                        >
                          <SortableContext
                            items={stages.map((s) => s.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {stages.map((stage, index) => (
                              <SortableStageItem
                                key={stage.id}
                                stage={stage}
                                index={index}
                                onDelete={handleDeleteStage}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      </div>
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          onClick={() => setShowAddStageDialog(true)}
                          data-testid="button-add-stage"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Stage
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <PipelineWorkflowConfig />
            </>
          )}

          {activeTab === "documents" && (
            <>
              <Card className="hover-elevate cursor-pointer">
                <Link href="/admin/document-templates">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <FileStack className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">Document Templates</CardTitle>
                          <CardDescription>
                            Create and manage reusable document templates with pre-positioned fields
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                </Link>
              </Card>

              <DocumentsEsignConfig />
            </>
          )}

          {activeTab === "notifications" && <NotificationsConfig />}

          {activeTab === "integrations" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    External Integrations
                  </CardTitle>
                  <CardDescription>
                    Status of connected external services for notifications, AI, and automation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {integrationsLoading ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-24" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <div className="border rounded-lg p-4 space-y-3" data-testid="integration-twilio">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Phone className="h-5 w-5 text-primary" />
                            <span className="font-medium">Twilio SMS</span>
                          </div>
                          {integrationsData?.integrations.twilio?.connected ? (
                            <Badge variant="default">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Connected
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Not Connected
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Send SMS notifications for loan digests and updates
                        </p>
                        {integrationsData?.integrations.twilio?.details?.phoneNumber && (
                          <p className="text-xs text-muted-foreground">
                            From: {integrationsData.integrations.twilio.details.phoneNumber}
                          </p>
                        )}
                      </div>

                      {isSuperAdmin && (
                        <>
                          <div className="border rounded-lg p-4 space-y-3" data-testid="integration-resend">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Mail className="h-5 w-5 text-primary" />
                                <span className="font-medium">Resend Email</span>
                              </div>
                              {integrationsData?.integrations.resend?.connected ? (
                                <Badge variant="default">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Connected
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Not Connected
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Send email notifications for loan digests and system alerts
                            </p>
                            {integrationsData?.integrations.resend?.details?.fromEmail && (
                              <p className="text-xs text-muted-foreground">
                                From: {integrationsData.integrations.resend.details.fromEmail}
                              </p>
                            )}
                          </div>

                          <div className="border rounded-lg p-4 space-y-3" data-testid="integration-openai">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Brain className="h-5 w-5 text-success" />
                                <span className="font-medium">OpenAI</span>
                              </div>
                              {integrationsData?.integrations.openai?.connected ? (
                                <Badge variant="default">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Connected
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Not Connected
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              AI-powered features for document analysis and automation
                            </p>
                          </div>

                          <div className="border rounded-lg p-4 space-y-3" data-testid="integration-apify">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Bot className="h-5 w-5 text-warning" />
                                <span className="font-medium">Apify Scraper</span>
                              </div>
                              {integrationsData?.integrations.apify?.connected ? (
                                <Badge variant="default">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Connected
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Not Configured
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Automated quote scraping from external pricing providers
                            </p>
                          </div>

                          <div className="border rounded-lg p-4 space-y-3" data-testid="integration-geoapify">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-destructive" />
                                <span className="font-medium">Geoapify</span>
                              </div>
                              {integrationsData?.integrations.geoapify?.connected ? (
                                <Badge variant="default">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Connected
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Not Connected
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Address autocomplete and geocoding for property locations
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {isSuperAdmin ? (
                    <>
                      <OpenAiApiKeySection />
                      <PandaDocApiKeySection />

                      <div className="mt-4 border rounded-lg p-4 space-y-3" data-testid="integration-pandadoc-webhook">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          <span className="font-medium">PandaDoc Webhook URL</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Set this URL in your PandaDoc account (Settings &rarr; Integrations &rarr; Webhooks) to automatically create loan deals when documents are signed.
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={`${window.location.origin}/api/webhooks/pandadoc`}
                            className="font-mono text-xs"
                            data-testid="input-pandadoc-webhook-url"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/pandadoc`);
                              toast({ title: "Copied", description: "Webhook URL copied to clipboard" });
                            }}
                            data-testid="button-copy-webhook-url"
                          >
                            Copy
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Subscribe to events: <strong>document.completed</strong>, <strong>document.viewed</strong>, <strong>document.sent</strong>
                        </p>
                      </div>
                    </>
                  ) : (
                    <PandaDocStatusReadonly />
                  )}

                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchIntegrations()}
                      data-testid="button-refresh-integrations"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Status
                    </Button>
                  </div>
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Note:</strong> Integrations are managed through Replit's connector system. To connect or update an integration, use the Replit Integrations panel or contact your administrator.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <EmailIntegrationConfig />
            </>
          )}

          {activeTab === "custom-fields" && <CustomFieldsConfig />}

          {activeTab === "billing" && <BillingPlansConfig />}

        </div>
      </div>

      <Dialog open={showAddStageDialog} onOpenChange={setShowAddStageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Stage</DialogTitle>
            <DialogDescription>
              Create a new deal stage. The key will be used internally and cannot be changed later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-label">Label</Label>
              <Input
                id="stage-label"
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                placeholder="e.g., Pending Approval"
                data-testid="input-stage-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-key">Key (auto-generated from label)</Label>
              <Input
                id="stage-key"
                value={newStageKey || newStageLabel.toLowerCase().replace(/\s+/g, "-")}
                onChange={(e) => setNewStageKey(e.target.value)}
                placeholder="e.g., pending-approval"
                data-testid="input-stage-key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-color">Color</Label>
              <Select value={newStageColor} onValueChange={setNewStageColor}>
                <SelectTrigger data-testid="select-stage-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded ${stageColorMap[color.value]?.split(" ")[0] || "bg-muted"}`} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStageDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddStage}
              disabled={createStageMutation.isPending}
              data-testid="button-confirm-add-stage"
            >
              {createStageMutation.isPending ? "Creating..." : "Add Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PandaDocApiKeySection() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: pandadocStatus, isLoading: statusLoading } = useQuery<{ connected: boolean; maskedKey?: string }>({
    queryKey: ['/api/admin/pandadoc/status'],
  });

  const saveMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest('PUT', '/api/admin/settings/pandadoc_api_key', {
        value: key,
        description: 'PandaDoc API Key for e-signatures',
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "PandaDoc API key saved successfully" });
      setApiKey('');
      setShowKey(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pandadoc/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/integrations/status'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save API key", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('GET', '/api/admin/pandadoc/test');
      return res.json();
    },
    onSuccess: (data: any) => {
      setTestResult({
        success: data.connected,
        message: data.connected ? `Connected to ${data.workspace || 'PandaDoc'}` : (data.error || 'Connection failed'),
      });
    },
    onError: () => {
      setTestResult({ success: false, message: 'Failed to test connection' });
    },
  });

  return (
    <div className="mt-6 border rounded-lg p-4 space-y-3" data-testid="integration-pandadoc-api">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <span className="font-medium">PandaDoc API Key</span>
        </div>
        {statusLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : pandadocStatus?.connected ? (
          <Badge variant="default">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Not Connected
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Connect your PandaDoc account to enable e-signatures on term sheets, commitment letters, and closing documents.
        Get your API key from PandaDoc &rarr; Settings &rarr; Integrations &rarr; API.
      </p>
      {pandadocStatus?.maskedKey && (
        <p className="text-xs text-muted-foreground">
          Current key: <span className="font-mono">{pandadocStatus.maskedKey}</span>
        </p>
      )}
      <div className="flex items-center gap-2">
        <Input
          type={showKey ? "text" : "password"}
          placeholder="Enter your PandaDoc API key..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="font-mono text-xs"
          data-testid="input-pandadoc-api-key"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowKey(!showKey)}
          data-testid="button-toggle-key-visibility"
        >
          {showKey ? "Hide" : "Show"}
        </Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(apiKey)}
          disabled={!apiKey.trim() || saveMutation.isPending}
          data-testid="button-save-pandadoc-key"
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setTestResult(null); testMutation.mutate(); }}
          disabled={testMutation.isPending}
          data-testid="button-test-pandadoc"
        >
          {testMutation.isPending ? "Testing..." : "Test Connection"}
        </Button>
        {testResult && (
          <span className={`text-xs ${testResult.success ? 'text-green-600' : 'text-destructive'}`}>
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

function OpenAiApiKeySection() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: openaiStatus, isLoading: statusLoading } = useQuery<{ connected: boolean; maskedKey?: string; source?: string }>({
    queryKey: ['/api/admin/openai/status'],
  });

  const saveMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest('PUT', '/api/admin/settings/openai_api_key', {
        value: key,
        description: 'OpenAI API Key for AI features',
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "OpenAI API key saved successfully" });
      setApiKey('');
      setShowKey(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/openai/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/integrations/status'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save API key", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('GET', '/api/admin/openai/test');
      return res.json();
    },
    onSuccess: (data: any) => {
      setTestResult({
        success: data.connected,
        message: data.connected ? (data.message || 'Connected successfully') : (data.error || 'Connection failed'),
      });
    },
    onError: () => {
      setTestResult({ success: false, message: 'Failed to test connection' });
    },
  });

  return (
    <div className="mt-6 border rounded-lg p-4 space-y-3" data-testid="integration-openai-api">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          <span className="font-medium">OpenAI API Key</span>
        </div>
        {statusLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : openaiStatus?.connected ? (
          <Badge variant="default">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Not Connected
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Connect your OpenAI account to enable AI-powered features like document analysis, deal review, and automated communications.
        Get your API key from{" "}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline" data-testid="link-openai-platform">
          platform.openai.com
        </a>.
      </p>
      {openaiStatus?.maskedKey && (
        <p className="text-xs text-muted-foreground" data-testid="text-openai-masked-key">
          Current key: <span className="font-mono">{openaiStatus.maskedKey}</span>
          {openaiStatus.source === 'integration' && (
            <span className="ml-2">(via system integration)</span>
          )}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Input
          type={showKey ? "text" : "password"}
          placeholder="Enter your OpenAI API key (sk-...)..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="font-mono text-xs"
          data-testid="input-openai-api-key"
        />
        <Button
          variant="outline"
          onClick={() => setShowKey(!showKey)}
          data-testid="button-toggle-openai-key-visibility"
        >
          {showKey ? "Hide" : "Show"}
        </Button>
        <Button
          onClick={() => saveMutation.mutate(apiKey)}
          disabled={!apiKey.trim() || saveMutation.isPending}
          data-testid="button-save-openai-key"
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => { setTestResult(null); testMutation.mutate(); }}
          disabled={testMutation.isPending}
          data-testid="button-test-openai"
        >
          {testMutation.isPending ? "Testing..." : "Test Connection"}
        </Button>
        {testResult && (
          <span className={`text-xs ${testResult.success ? 'text-green-600' : 'text-destructive'}`} data-testid="text-openai-test-result">
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

function PandaDocStatusReadonly() {
  const { data: pandadocStatus, isLoading } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/admin/pandadoc/status'],
  });

  return (
    <div className="mt-6 border rounded-lg p-4 space-y-3" data-testid="integration-pandadoc-readonly">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <span className="font-medium">PandaDoc E-Signatures</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : pandadocStatus?.connected ? (
          <Badge variant="default">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Not Connected
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        E-signature service for term sheets, commitment letters, and closing documents.
        {!pandadocStatus?.connected && " Contact your system administrator to configure this integration."}
      </p>
    </div>
  );
}

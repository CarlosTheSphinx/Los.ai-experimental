import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Settings as SettingsIcon, RefreshCw, HardDrive, Phone, Mail, Brain, MapPin, Bot, CheckCircle2, XCircle, AlertCircle, Layers, Plus, Trash2, GripVertical } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
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
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

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
  google_drive_folder_id: {
    label: "Google Drive Parent Folder ID",
    description: "The ID of the parent Google Drive folder where all loan folders will be created (e.g., 1aBcDeFgHiJkLmNoPqRsTuVwXyZ)",
    type: "text",
    category: "google_drive",
  },
  google_drive_service_account: {
    label: "Google Drive Service Account Email",
    description: "The service account email for Google Drive API access (e.g., my-service@my-project.iam.gserviceaccount.com)",
    type: "text",
    category: "google_drive",
  },
};

export default function AdminSettings() {
  const { toast } = useToast();
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});

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

  // Deal stages state and queries
  const [stages, setStages] = useState<DealStage[]>([]);
  const [showAddStageDialog, setShowAddStageDialog] = useState(false);
  const [newStageKey, setNewStageKey] = useState("");
  const [newStageLabel, setNewStageLabel] = useState("");
  const [newStageColor, setNewStageColor] = useState("gray");

  const { data: stagesData, isLoading: stagesLoading } = useQuery<{ stages: DealStage[] }>({
    queryKey: ["/api/admin/deal-stages"],
  });

  // Update local stages when data changes
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
      
      // Send reorder request to server
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-semibold" data-testid="text-admin-settings-title">System Settings</h1>
      </div>

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
                    <Phone className="h-5 w-5 text-blue-500" />
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

              <div className="border rounded-lg p-4 space-y-3" data-testid="integration-resend">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-purple-500" />
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
                    <Brain className="h-5 w-5 text-green-500" />
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
                    <Bot className="h-5 w-5 text-orange-500" />
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
                    <MapPin className="h-5 w-5 text-red-500" />
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
            </div>
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
            .map(([key, config]) => {
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
            })}
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
            .map(([key, config]) => {
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
                    <Input
                      id={key}
                      type="text"
                      value={value}
                      onChange={(e) => setEditedSettings({ ...editedSettings, [key]: e.target.value })}
                      className="flex-1"
                      placeholder={key === "google_drive_folder_id" ? "1aBcDeFgHiJkLmNoPqRsTuVwXyZ" : "service-account@project.iam.gserviceaccount.com"}
                      data-testid={`input-${key}`}
                    />
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
            })}
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Setup Instructions:</strong> To enable Google Drive integration, you need to create a Google Cloud service account and share the parent folder with the service account email. The service account credentials (JSON key file) should be stored as a secret named <code className="bg-muted px-1 py-0.5 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code>.
            </p>
          </div>
        </CardContent>
      </Card>

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
                        <div className={`w-4 h-4 rounded ${stageColorMap[color.value]?.split(" ")[0] || "bg-gray-100"}`} />
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
    </div>
  );
}

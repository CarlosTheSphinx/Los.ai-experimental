import { useTenantConfig } from "@/hooks/use-tenant-config";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { Save, Plus, Trash2, GitBranch, XCircle, PauseCircle, Bell, Layers, GripVertical, Pencil, Check, X, CircleDot, ChevronUp, ChevronDown } from "lucide-react";
import type { DealStatus } from "@shared/schema";

interface ApprovalStep {
  stage: string;
  requiredRole: string;
  description: string;
}

interface DealStage {
  id: number;
  key: string;
  label: string;
  color: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

const defaults = {
  stageConfigs: {} as Record<string, any>,
  approvalSteps: [
    { stage: "underwriting", requiredRole: "admin", description: "Admin approval required before moving to closing" },
  ] as ApprovalStep[],
  denialReasons: [
    "Credit score below minimum",
    "Insufficient collateral",
    "Incomplete documentation",
    "Failed background check",
    "Property does not meet guidelines",
    "Borrower experience insufficient",
    "Loan amount exceeds program limits",
  ],
  suspensionReasons: [
    "Awaiting additional documentation",
    "Pending appraisal review",
    "Title issues",
    "Insurance verification pending",
    "Borrower unresponsive",
  ],
  autoNotifications: true,
  taskRemindersEnabled: true,
  taskReminderDays: 3,
};

const STATUS_COLORS = [
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Yellow", value: "#eab308" },
  { label: "Orange", value: "#d97706" },
  { label: "Red", value: "#ef4444" },
  { label: "Purple", value: "#a855f7" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Gray", value: "#6b7280" },
  { label: "Slate", value: "#64748b" },
];

const STAGE_COLORS = STATUS_COLORS;

function DealStatusesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ label: "", color: "#6b7280", description: "" });
  const [newStatus, setNewStatus] = useState({ label: "", color: "#6b7280", description: "" });
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: statuses = [], isLoading } = useQuery<DealStatus[]>({
    queryKey: ["/api/admin/deal-statuses"],
  });

  const createMutation = useMutation({
    mutationFn: async (s: { label: string; color: string; description: string }) => {
      const key = s.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      return apiRequest("POST", "/api/admin/deal-statuses", {
        key,
        label: s.label,
        color: s.color,
        description: s.description || null,
        sortOrder: statuses.length,
        isDefault: false,
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-statuses"] });
      setNewStatus({ label: "", color: "#6b7280", description: "" });
      setShowAddForm(false);
      toast({ title: "Status created" });
    },
    onError: () => toast({ title: "Failed to create status", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: number; label?: string; color?: string; description?: string; isActive?: boolean }) => {
      return apiRequest("PUT", `/api/admin/deal-statuses/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-statuses"] });
      setEditingId(null);
      toast({ title: "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/deal-statuses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-statuses"] });
      toast({ title: "Status deleted" });
    },
    onError: (err: any) => toast({ title: err?.message || "Cannot delete default status", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (order: number[]) => apiRequest("PUT", "/api/admin/deal-statuses/reorder", { order }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-statuses"] }),
  });

  const moveStatus = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= statuses.length) return;
    const reordered = [...statuses];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered.map((s) => s.id));
  };

  const startEdit = (status: DealStatus) => {
    setEditingId(status.id);
    setEditForm({ label: status.label, color: status.color || "#6b7280", description: status.description || "" });
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Deal Statuses</h3>
        </div>
        <p className="text-xs text-muted-foreground">These statuses can be assigned to deals across all loan programs.</p>
      </div>

      <div className="rounded-md border divide-y">
        {statuses.map((status, index) => (
          <div key={status.id} className="flex items-center gap-3 p-3" data-testid={`status-row-${status.id}`}>
            <div className="flex flex-col gap-0.5">
              <button
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => moveStatus(index, -1)}
                disabled={index === 0}
                data-testid={`button-move-status-up-${status.id}`}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => moveStatus(index, 1)}
                disabled={index === statuses.length - 1}
                data-testid={`button-move-status-down-${status.id}`}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            <span
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: editingId === status.id ? editForm.color : (status.color || "#6b7280") }}
            />

            {editingId === status.id ? (
              <div className="flex-1 flex items-center gap-2 flex-wrap">
                <Input
                  className="h-8 w-40"
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                  placeholder="Status name"
                  data-testid="input-edit-status-label"
                />
                <Select value={editForm.color} onValueChange={(v) => setEditForm({ ...editForm, color: v })}>
                  <SelectTrigger className="h-8 w-28" data-testid="select-edit-status-color">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: editForm.color }} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_COLORS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.value }} />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 flex-1 min-w-[120px]"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Description (optional)"
                  data-testid="input-edit-status-description"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => updateMutation.mutate({ id: status.id, ...editForm })}
                  data-testid="button-save-status-edit"
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  data-testid="button-cancel-status-edit"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${!status.isActive ? 'line-through text-muted-foreground' : ''}`}>
                    {status.label}
                  </span>
                  {status.description && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">{status.description}</span>
                  )}
                  {status.isDefault && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Default</span>
                  )}
                  {!status.isActive && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startEdit(status)}
                    data-testid={`button-edit-status-${status.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => updateMutation.mutate({ id: status.id, isActive: !status.isActive })}
                    title={status.isActive ? "Deactivate" : "Activate"}
                    data-testid={`button-toggle-status-${status.id}`}
                  >
                    {status.isActive ? (
                      <PauseCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    )}
                  </Button>
                  {!status.isDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete status "${status.label}"? This cannot be undone.`)) {
                          deleteMutation.mutate(status.id);
                        }
                      }}
                      data-testid={`button-delete-status-${status.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {statuses.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No deal statuses configured. Add one below.
          </div>
        )}
      </div>

      {showAddForm ? (
        <div className="flex items-center gap-2 border rounded-md p-3 flex-wrap">
          <Input
            className="h-8 w-40"
            value={newStatus.label}
            onChange={(e) => setNewStatus({ ...newStatus, label: e.target.value })}
            placeholder="Status name"
            data-testid="input-new-status-label"
          />
          <Select value={newStatus.color} onValueChange={(v) => setNewStatus({ ...newStatus, color: v })}>
            <SelectTrigger className="h-8 w-28" data-testid="select-new-status-color">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: newStatus.color }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {STATUS_COLORS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.value }} />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-8 flex-1 min-w-[120px]"
            value={newStatus.description}
            onChange={(e) => setNewStatus({ ...newStatus, description: e.target.value })}
            placeholder="Description (optional)"
            data-testid="input-new-status-description"
          />
          <Button
            size="sm"
            onClick={() => newStatus.label && createMutation.mutate(newStatus)}
            disabled={!newStatus.label || createMutation.isPending}
            data-testid="button-add-status-confirm"
          >
            <Check className="h-4 w-4 mr-1" />
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} data-testid="button-add-status-cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShowAddForm(true)} data-testid="button-add-deal-status">
          <Plus className="mr-2 h-4 w-4" />
          Add Status
        </Button>
      )}
    </section>
  );
}

function LoanStagesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ label: "", color: "#6b7280", description: "" });
  const [newStage, setNewStage] = useState({ label: "", color: "#3b82f6", description: "" });
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading } = useQuery<{ stages: DealStage[] }>({
    queryKey: ["/api/admin/deal-stages"],
  });

  const stages = data?.stages || [];

  const createMutation = useMutation({
    mutationFn: async (stage: { label: string; color: string; description: string }) => {
      const key = stage.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return apiRequest("POST", "/api/admin/deal-stages", {
        key,
        label: stage.label,
        color: stage.color,
        description: stage.description || null,
        sortOrder: stages.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-stages"] });
      setNewStage({ label: "", color: "#3b82f6", description: "" });
      setShowAddForm(false);
      toast({ title: "Stage created" });
    },
    onError: () => toast({ title: "Failed to create stage", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: number; label?: string; color?: string; description?: string; isActive?: boolean }) => {
      return apiRequest("PUT", `/api/admin/deal-stages/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-stages"] });
      setEditingId(null);
      toast({ title: "Stage updated" });
    },
    onError: () => toast({ title: "Failed to update stage", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/deal-stages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-stages"] });
      toast({ title: "Stage deleted" });
    },
    onError: () => toast({ title: "Failed to delete stage", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (stageOrders: { id: number; sortOrder: number }[]) => {
      return apiRequest("PUT", "/api/admin/deal-stages/reorder", { stageOrders });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deal-stages"] });
    },
  });

  const moveStage = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= stages.length) return;
    const reordered = [...stages];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    const stageOrders = reordered.map((s, i) => ({ id: s.id, sortOrder: i }));
    reorderMutation.mutate(stageOrders);
  };

  const startEdit = (stage: DealStage) => {
    setEditingId(stage.id);
    setEditForm({ label: stage.label, color: stage.color, description: stage.description || "" });
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Loan Stages</h3>
        </div>
        <p className="text-xs text-muted-foreground">These stages appear in the deal stage dropdown for lenders.</p>
      </div>

      <div className="rounded-md border divide-y">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center gap-3 p-3">
            <div className="flex flex-col gap-0.5">
              <button
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => moveStage(index, -1)}
                disabled={index === 0}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() => moveStage(index, 1)}
                disabled={index === stages.length - 1}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            <span
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: editingId === stage.id ? editForm.color : stage.color }}
            />

            {editingId === stage.id ? (
              <div className="flex-1 flex items-center gap-2 flex-wrap">
                <Input
                  className="h-8 w-40"
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                  placeholder="Stage name"
                />
                <Select value={editForm.color} onValueChange={(v) => setEditForm({ ...editForm, color: v })}>
                  <SelectTrigger className="h-8 w-28">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: editForm.color }} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_COLORS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.value }} />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 flex-1 min-w-[120px]"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Description (optional)"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => updateMutation.mutate({ id: stage.id, ...editForm })}
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${!stage.isActive ? 'line-through text-muted-foreground' : ''}`}>
                    {stage.label}
                  </span>
                  {stage.description && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">{stage.description}</span>
                  )}
                  {!stage.isActive && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => startEdit(stage)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => updateMutation.mutate({ id: stage.id, isActive: !stage.isActive })}
                    title={stage.isActive ? "Deactivate" : "Activate"}
                  >
                    {stage.isActive ? (
                      <PauseCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete stage "${stage.label}"? This cannot be undone.`)) {
                        deleteMutation.mutate(stage.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {stages.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No loan stages configured. Add one below.
          </div>
        )}
      </div>

      {showAddForm ? (
        <div className="flex items-center gap-2 border rounded-md p-3 flex-wrap">
          <Input
            className="h-8 w-40"
            value={newStage.label}
            onChange={(e) => setNewStage({ ...newStage, label: e.target.value })}
            placeholder="Stage name"
          />
          <Select value={newStage.color} onValueChange={(v) => setNewStage({ ...newStage, color: v })}>
            <SelectTrigger className="h-8 w-28">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: newStage.color }} />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {STAGE_COLORS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.value }} />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-8 flex-1 min-w-[120px]"
            value={newStage.description}
            onChange={(e) => setNewStage({ ...newStage, description: e.target.value })}
            placeholder="Description (optional)"
          />
          <Button
            size="sm"
            onClick={() => newStage.label && createMutation.mutate(newStage)}
            disabled={!newStage.label || createMutation.isPending}
          >
            <Check className="h-4 w-4 mr-1" />
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShowAddForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Loan Stage
        </Button>
      )}
    </section>
  );
}

export default function PipelineWorkflowConfig() {
  const { config, isLoading, hasChanges, updateField, save, isPending, isSuccess } =
    useTenantConfig("tenant_pipeline_config", defaults);
  const { toast } = useToast();

  useEffect(() => {
    if (isSuccess) {
      toast({ title: "Pipeline settings saved", description: "Your pipeline and workflow configuration has been updated." });
    }
  }, [isSuccess]);

  const updateApprovalStep = (index: number, field: keyof ApprovalStep, value: string) => {
    const updated = [...config.approvalSteps];
    updated[index] = { ...updated[index], [field]: value };
    updateField("approvalSteps", updated);
  };

  const addApprovalStep = () => {
    updateField("approvalSteps", [...config.approvalSteps, { stage: "", requiredRole: "admin", description: "" }]);
  };

  const removeApprovalStep = (index: number) => {
    updateField("approvalSteps", config.approvalSteps.filter((_: ApprovalStep, i: number) => i !== index));
  };

  const updateDenialReason = (index: number, value: string) => {
    const updated = [...config.denialReasons];
    updated[index] = value;
    updateField("denialReasons", updated);
  };

  const addDenialReason = () => {
    updateField("denialReasons", [...config.denialReasons, ""]);
  };

  const removeDenialReason = (index: number) => {
    updateField("denialReasons", config.denialReasons.filter((_: string, i: number) => i !== index));
  };

  const updateSuspensionReason = (index: number, value: string) => {
    const updated = [...config.suspensionReasons];
    updated[index] = value;
    updateField("suspensionReasons", updated);
  };

  const addSuspensionReason = () => {
    updateField("suspensionReasons", [...config.suspensionReasons, ""]);
  };

  const removeSuspensionReason = (index: number) => {
    updateField("suspensionReasons", config.suspensionReasons.filter((_: string, i: number) => i !== index));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-pipeline-config-title">Statuses & Stages</CardTitle>
        <CardDescription data-testid="text-pipeline-config-description">
          Configure deal statuses, loan stages, approval workflows, denial/suspension reasons, and automation settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <DealStatusesSection />

        <LoanStagesSection />

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Approval Stages</h3>
          </div>
          <div className="grid gap-3">
            {config.approvalSteps.map((step: ApprovalStep, index: number) => (
              <div key={index} className="flex items-start gap-2 rounded-md border p-3 flex-wrap">
                <div className="grid flex-1 gap-2 sm:grid-cols-3 min-w-0">
                  <div className="space-y-1">
                    <Label htmlFor={`approval-stage-${index}`}>Stage</Label>
                    <Input
                      id={`approval-stage-${index}`}
                      data-testid={`input-approval-stage-${index}`}
                      value={step.stage}
                      onChange={(e) => updateApprovalStep(index, "stage", e.target.value)}
                      placeholder="e.g. underwriting"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`approval-role-${index}`}>Required Role</Label>
                    <Select
                      value={step.requiredRole}
                      onValueChange={(val) => updateApprovalStep(index, "requiredRole", val)}
                    >
                      <SelectTrigger data-testid={`select-approval-role-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`approval-desc-${index}`}>Description</Label>
                    <Input
                      id={`approval-desc-${index}`}
                      data-testid={`input-approval-desc-${index}`}
                      value={step.description}
                      onChange={(e) => updateApprovalStep(index, "description", e.target.value)}
                      placeholder="Description of this approval stage"
                    />
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid={`button-remove-approval-${index}`}
                  onClick={() => removeApprovalStep(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            data-testid="button-add-approval-step"
            onClick={addApprovalStep}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Approval Stage
          </Button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Denial Reasons</h3>
          </div>
          <div className="grid gap-2">
            {config.denialReasons.map((reason: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  data-testid={`input-denial-reason-${index}`}
                  value={reason}
                  onChange={(e) => updateDenialReason(index, e.target.value)}
                  placeholder="Denial reason"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid={`button-remove-denial-${index}`}
                  onClick={() => removeDenialReason(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            data-testid="button-add-denial-reason"
            onClick={addDenialReason}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Reason
          </Button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Suspension Reasons</h3>
          </div>
          <div className="grid gap-2">
            {config.suspensionReasons.map((reason: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  data-testid={`input-suspension-reason-${index}`}
                  value={reason}
                  onChange={(e) => updateSuspensionReason(index, e.target.value)}
                  placeholder="Suspension reason"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid={`button-remove-suspension-${index}`}
                  onClick={() => removeSuspensionReason(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            data-testid="button-add-suspension-reason"
            onClick={addSuspensionReason}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Reason
          </Button>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Automation Settings</h3>
          </div>
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="autoNotifications">Auto Notifications</Label>
                <p className="text-sm text-muted-foreground">Automatically send notifications on stage changes</p>
              </div>
              <Switch
                id="autoNotifications"
                data-testid="switch-auto-notifications"
                checked={config.autoNotifications}
                onCheckedChange={(checked) => updateField("autoNotifications", checked)}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="taskReminders">Task Reminders</Label>
                <p className="text-sm text-muted-foreground">Send reminders for overdue tasks</p>
              </div>
              <Switch
                id="taskReminders"
                data-testid="switch-task-reminders"
                checked={config.taskRemindersEnabled}
                onCheckedChange={(checked) => updateField("taskRemindersEnabled", checked)}
              />
            </div>
            {config.taskRemindersEnabled && (
              <div className="flex items-center gap-2 pl-1">
                <Label htmlFor="reminderDays" className="whitespace-nowrap text-sm">Remind after</Label>
                <Input
                  id="reminderDays"
                  data-testid="input-reminder-days"
                  type="number"
                  className="w-20"
                  min={1}
                  max={30}
                  value={config.taskReminderDays}
                  onChange={(e) => updateField("taskReminderDays", parseInt(e.target.value) || 3)}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end pt-4 border-t">
          <Button
            data-testid="button-save-pipeline-config"
            onClick={save}
            disabled={!hasChanges || isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {isPending ? "Saving..." : "Save Pipeline Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
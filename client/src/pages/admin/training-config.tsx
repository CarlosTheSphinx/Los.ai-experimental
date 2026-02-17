/**
 * Training Configuration Page
 * Admin page to manage lender onboarding training steps.
 * CRUD form: title, description, target page, HTML content, video URL, required toggle.
 * Reorder, activate/deactivate, and view user completion stats.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  CheckCircle2,
  Circle,
  Eye,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TrainingStep {
  id: number;
  title: string;
  description: string | null;
  targetPage: string;
  contentHtml: string | null;
  videoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isRequired: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

const TARGET_PAGES = [
  { value: "/admin/programs", label: "Programs" },
  { value: "/admin/ai-agents", label: "AI Agents" },
  { value: "/admin/digests", label: "Digests" },
  { value: "/admin/settings", label: "Settings" },
  { value: "/admin/users", label: "Users" },
  { value: "/admin/onboarding", label: "Onboarding" },
  { value: "/admin", label: "Dashboard / Pipeline" },
  { value: "/admin/processor", label: "One-Click Processing" },
  { value: "/admin/ai-review", label: "Lane (AI Review)" },
  { value: "/admin/team-permissions", label: "Permissions" },
];

const emptyForm = {
  title: "",
  description: "",
  targetPage: "/admin/programs",
  contentHtml: "",
  videoUrl: "",
  isActive: true,
  isRequired: true,
};

export default function TrainingConfigPage() {
  const { toast } = useToast();
  const [editingStep, setEditingStep] = useState<TrainingStep | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Fetch all steps (including inactive)
  const { data: steps, isLoading } = useQuery<TrainingStep[]>({
    queryKey: ["/api/training/steps/all"],
    queryFn: async () => {
      const res = await fetch("/api/training/steps/all");
      if (!res.ok) throw new Error("Failed to fetch training steps");
      return res.json();
    },
  });

  // Fetch user stats
  const { data: userStats } = useQuery({
    queryKey: ["/api/admin/training/user-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/training/user-stats");
      if (!res.ok) return { totalUsers: 0, totalSteps: 0, userStats: [] };
      return res.json();
    },
  });

  // Create step
  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      return apiRequest("POST", "/api/admin/training/steps", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/steps/all"] });
      setFormOpen(false);
      setForm(emptyForm);
      toast({ title: "Created", description: "Training step added." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update step
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof emptyForm> }) => {
      return apiRequest("PUT", `/api/admin/training/steps/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/steps/all"] });
      setFormOpen(false);
      setEditingStep(null);
      setForm(emptyForm);
      toast({ title: "Updated", description: "Training step updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete step
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/training/steps/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/steps/all"] });
      toast({ title: "Deleted", description: "Training step removed." });
    },
  });

  // Reorder
  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      return apiRequest("POST", "/api/admin/training/steps/reorder", { orderedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/steps/all"] });
    },
  });

  // Seed defaults
  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/training/seed-defaults", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/steps/all"] });
      toast({ title: "Seeded", description: "Default training steps created." });
    },
  });

  const openCreate = () => {
    setEditingStep(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (step: TrainingStep) => {
    setEditingStep(step);
    setForm({
      title: step.title,
      description: step.description || "",
      targetPage: step.targetPage,
      contentHtml: step.contentHtml || "",
      videoUrl: step.videoUrl || "",
      isActive: step.isActive,
      isRequired: step.isRequired,
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (editingStep) {
      updateMutation.mutate({ id: editingStep.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleMoveUp = (index: number) => {
    if (!steps || index <= 0) return;
    const ids = steps.map((s) => s.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorderMutation.mutate(ids);
  };

  const handleMoveDown = (index: number) => {
    if (!steps || index >= steps.length - 1) return;
    const ids = steps.map((s) => s.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    reorderMutation.mutate(ids);
  };

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-8 w-8" />
            Training Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage onboarding training steps for new lenders
          </p>
        </div>
        <div className="flex gap-2">
          {(!steps || steps.length === 0) && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              <Sparkles className="h-4 w-4 mr-1.5" />
              Seed Defaults
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Step
          </Button>
        </div>
      </div>

      {/* Stats */}
      {userStats && userStats.totalUsers > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total Steps</div>
            <div className="text-2xl font-bold">{userStats.totalSteps}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Users in Training</div>
            <div className="text-2xl font-bold">{userStats.totalUsers}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Avg Completion</div>
            <div className="text-2xl font-bold">
              {userStats.userStats.length > 0
                ? Math.round(
                    userStats.userStats.reduce(
                      (sum: number, u: any) => sum + u.percentComplete,
                      0
                    ) / userStats.userStats.length
                  )
                : 0}
              %
            </div>
          </Card>
        </div>
      )}

      {/* Steps List */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !steps || steps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Training Steps</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create training steps to guide lenders through the platform, or seed the default steps.
            </p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Seed Defaults
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Step
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {steps.map((step, index) => (
            <Card
              key={step.id}
              className={cn(
                "transition-opacity",
                !step.isActive && "opacity-50"
              )}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Reorder */}
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === steps.length - 1}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                {/* Step Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">
                      #{index + 1}
                    </span>
                    <span className="font-semibold text-sm">{step.title}</span>
                    {step.isRequired && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                        Required
                      </Badge>
                    )}
                    {!step.isActive && (
                      <Badge variant="secondary" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {step.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {step.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {step.targetPage}
                    </Badge>
                    {step.videoUrl && (
                      <Badge variant="outline" className="text-xs">
                        Has Video
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(step)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("Delete this training step?")) {
                        deleteMutation.mutate(step.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStep ? "Edit Training Step" : "New Training Step"}
            </DialogTitle>
            <DialogDescription>
              Configure the training step content, target page, and requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Creating a Loan Program"
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief summary of what this step covers"
              />
            </div>

            <div className="space-y-2">
              <Label>Target Page</Label>
              <Select
                value={form.targetPage}
                onValueChange={(val) =>
                  setForm((f) => ({ ...f, targetPage: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_PAGES.map((page) => (
                    <SelectItem key={page.value} value={page.value}>
                      {page.label} ({page.value})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Content (HTML)</Label>
              <Textarea
                value={form.contentHtml}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contentHtml: e.target.value }))
                }
                className="font-mono text-sm min-h-48"
                placeholder="<div><h3>Step Title</h3><p>Instructions here...</p></div>"
              />
              <p className="text-xs text-muted-foreground">
                HTML content shown in the training overlay. Supports h3, p, ul, ol, li, strong tags.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Video URL (optional)</Label>
              <Input
                value={form.videoUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, videoUrl: e.target.value }))
                }
                placeholder="https://www.youtube.com/embed/..."
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRequired"
                  checked={form.isRequired}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, isRequired: checked as boolean }))
                  }
                />
                <Label htmlFor="isRequired" className="font-normal">
                  Required step
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, isActive: checked as boolean }))
                  }
                />
                <Label htmlFor="isActive" className="font-normal">
                  Active
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFormOpen(false);
                setEditingStep(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.title.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              {editingStep ? "Save Changes" : "Create Step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

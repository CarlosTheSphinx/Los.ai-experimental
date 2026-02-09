import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
  GripVertical,
  FileText,
  ListChecks,
  Trash2,
  Check,
  Sparkles,
  AlertTriangle,
  Info,
  ShieldCheck,
} from "lucide-react";

interface WorkflowStepDefinition {
  id: number;
  name: string;
  key: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface ProgramWorkflowStep {
  id: number;
  programId: number;
  stepDefinitionId: number;
  stepOrder: number;
  isRequired: boolean;
  estimatedDays: number | null;
  definition: {
    id: number;
    name: string;
    key: string;
    description: string | null;
    color: string | null;
    icon: string | null;
  };
}

interface ProgramDocument {
  id: number;
  programId: number;
  documentName: string;
  documentCategory: string;
  documentDescription: string | null;
  isRequired: boolean;
  sortOrder: number;
  stepId: number | null;
}

interface ProgramTask {
  id: number;
  programId: number;
  taskName: string;
  taskDescription: string | null;
  taskCategory: string | null;
  priority: string;
  sortOrder: number;
  stepId: number | null;
  assignToRole: string | null;
}

interface ProgramWorkflowEditorProps {
  programId: number;
  programName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ConfiguredStep {
  stepDefinitionId: number;
  isRequired: boolean;
  estimatedDays: number | null;
  name: string;
  color: string | null;
}

const COLOR_OPTIONS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#10b981", label: "Green" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#ef4444", label: "Red" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#64748b", label: "Slate" },
];

const DOCUMENT_CATEGORIES = [
  { value: "borrower_docs", label: "Borrower Documents" },
  { value: "entity_docs", label: "Entity Documents" },
  { value: "property_docs", label: "Property Documents" },
  { value: "financial_docs", label: "Financial Documents" },
  { value: "closing_docs", label: "Closing Documents" },
  { value: "other", label: "Other" },
];

const TASK_CATEGORIES = [
  { value: "application_review", label: "Application Review" },
  { value: "credit_check", label: "Credit Check" },
  { value: "appraisal", label: "Appraisal" },
  { value: "title_search", label: "Title Search" },
  { value: "underwriting", label: "Underwriting" },
  { value: "closing", label: "Closing" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "borrower", label: "User (Borrower)" },
  { value: "processor", label: "Processor" },
];

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "low":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case "medium":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "high":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function getCategoryLabel(value: string, categories: { value: string; label: string }[]): string {
  return categories.find((c) => c.value === value)?.label || value;
}

function StepColorDot({ color }: { color: string | null }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full shrink-0"
      style={{ backgroundColor: color || "#64748b" }}
    />
  );
}

export default function ProgramWorkflowEditor({
  programId,
  programName,
  open,
  onOpenChange,
}: ProgramWorkflowEditorProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("steps");
  const [stepsSaving, setStepsSaving] = useState(false);
  const stepsSaveRef = React.useRef<(() => Promise<void>) | null>(null);

  const handleSaveWorkflow = async () => {
    setStepsSaving(true);
    try {
      if (stepsSaveRef.current) {
        await stepsSaveRef.current();
      }
      toast({ title: "Workflow saved", description: "All workflow configuration has been saved successfully." });
    } catch {
      toast({ title: "Failed to save workflow", variant: "destructive" });
    } finally {
      setStepsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-y-auto"
        data-testid="dialog-workflow-editor"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-workflow-editor-title">
            Configure Workflow: {programName}
          </DialogTitle>
          <DialogDescription>
            Manage workflow steps, required documents, and tasks for this loan program.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-workflow">
            <TabsTrigger value="steps" data-testid="tab-steps">
              <GripVertical className="mr-1" /> Steps
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="mr-1" /> Documents
            </TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">
              <ListChecks className="mr-1" /> Tasks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="steps">
            <StepsTab programId={programId} onSaveRef={stepsSaveRef} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab programId={programId} />
          </TabsContent>
          <TabsContent value="tasks">
            <TasksTab programId={programId} />
          </TabsContent>
        </Tabs>

        <div className="border-t pt-4 mt-2">
          <Button
            onClick={handleSaveWorkflow}
            disabled={stepsSaving}
            className="w-full"
            data-testid="button-save-workflow"
          >
            {stepsSaving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
            Save Workflow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepsTab({ programId, onSaveRef }: { programId: number; onSaveRef?: React.MutableRefObject<(() => Promise<void>) | null> }) {
  const { toast } = useToast();
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customStepName, setCustomStepName] = useState("");
  const [customStepDescription, setCustomStepDescription] = useState("");
  const [customStepColor, setCustomStepColor] = useState("#3b82f6");

  const { data: allSteps, isLoading: loadingAllSteps } = useQuery<WorkflowStepDefinition[]>({
    queryKey: ["/api/admin/workflow-steps"],
  });

  const { data: programSteps, isLoading: loadingProgramSteps } = useQuery<ProgramWorkflowStep[]>({
    queryKey: ["/api/admin/programs", programId, "workflow-steps"],
  });

  const [configuredSteps, setConfiguredSteps] = useState<ConfiguredStep[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (programSteps && !initialized) {
    setConfiguredSteps(
      programSteps.map((ps) => ({
        stepDefinitionId: ps.stepDefinitionId,
        isRequired: ps.isRequired,
        estimatedDays: ps.estimatedDays,
        name: ps.definition.name,
        color: ps.definition.color,
      }))
    );
    setInitialized(true);
  }

  const addedDefIds = new Set(configuredSteps.map((s) => s.stepDefinitionId));

  const saveStepsAsync = useCallback(async () => {
    await apiRequest("PUT", `/api/admin/programs/${programId}/workflow-steps`, {
      steps: configuredSteps.map((s) => ({
        stepDefinitionId: s.stepDefinitionId,
        isRequired: s.isRequired,
        estimatedDays: s.estimatedDays,
      })),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId, "workflow-steps"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
  }, [programId, configuredSteps]);

  useEffect(() => {
    if (onSaveRef) {
      onSaveRef.current = saveStepsAsync;
    }
  }, [onSaveRef, saveStepsAsync]);

  const saveStepsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/admin/programs/${programId}/workflow-steps`, {
        steps: configuredSteps.map((s) => ({
          stepDefinitionId: s.stepDefinitionId,
          isRequired: s.isRequired,
          estimatedDays: s.estimatedDays,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId, "workflow-steps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Workflow steps saved" });
    },
    onError: () => {
      toast({ title: "Failed to save workflow steps", variant: "destructive" });
    },
  });

  const createCustomStepMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/workflow-steps", {
        name: customStepName,
        description: customStepDescription || null,
        color: customStepColor,
        icon: null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/workflow-steps"] });
      setShowCustomForm(false);
      setCustomStepName("");
      setCustomStepDescription("");
      setCustomStepColor("#3b82f6");
      toast({ title: "Custom step created" });
    },
    onError: () => {
      toast({ title: "Failed to create custom step", variant: "destructive" });
    },
  });

  const addStep = (def: WorkflowStepDefinition) => {
    if (addedDefIds.has(def.id)) return;
    setConfiguredSteps((prev) => [
      ...prev,
      {
        stepDefinitionId: def.id,
        isRequired: true,
        estimatedDays: null,
        name: def.name,
        color: def.color,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setConfiguredSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveStep = (idx: number, direction: "up" | "down") => {
    setConfiguredSteps((prev) => {
      const next = [...prev];
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const toggleRequired = (idx: number) => {
    setConfiguredSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, isRequired: !s.isRequired } : s))
    );
  };

  if (loadingAllSteps || loadingProgramSteps) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 mt-2">
      <div className="w-1/2 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Step Library
        </h3>
        <div className="space-y-1">
          {allSteps?.map((def) => {
            const isAdded = addedDefIds.has(def.id);
            return (
              <button
                key={def.id}
                onClick={() => addStep(def)}
                disabled={isAdded}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                  isAdded
                    ? "opacity-50 cursor-not-allowed bg-muted"
                    : "hover-elevate cursor-pointer"
                }`}
                data-testid={`button-add-step-${def.id}`}
              >
                <StepColorDot color={def.color} />
                <span className="flex-1">{def.name}</span>
                {isAdded && <Check className="w-4 h-4 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

        {showCustomForm ? (
          <Card className="mt-3">
            <CardContent className="p-4 space-y-3">
              <div>
                <Label htmlFor="custom-step-name">Step Name</Label>
                <Input
                  id="custom-step-name"
                  value={customStepName}
                  onChange={(e) => setCustomStepName(e.target.value)}
                  placeholder="e.g. Environmental Review"
                  data-testid="input-custom-step-name"
                />
              </div>
              <div>
                <Label htmlFor="custom-step-desc">Description (optional)</Label>
                <Textarea
                  id="custom-step-desc"
                  value={customStepDescription}
                  onChange={(e) => setCustomStepDescription(e.target.value)}
                  placeholder="Describe this step"
                  className="resize-none"
                  data-testid="input-custom-step-description"
                />
              </div>
              <div>
                <Label>Color</Label>
                <Select value={customStepColor} onValueChange={setCustomStepColor}>
                  <SelectTrigger data-testid="select-custom-step-color">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: customStepColor }}
                      />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: opt.value }}
                          />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => createCustomStepMutation.mutate()}
                  disabled={!customStepName.trim() || createCustomStepMutation.isPending}
                  data-testid="button-save-custom-step"
                >
                  {createCustomStepMutation.isPending && <Loader2 className="animate-spin" />}
                  Create Step
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowCustomForm(false)}
                  data-testid="button-cancel-custom-step"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomForm(true)}
            className="w-full"
            data-testid="button-add-custom-step"
          >
            <Plus className="mr-1" /> Add Custom Step
          </Button>
        )}
      </div>

      <div className="w-1/2 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Program Workflow ({configuredSteps.length} steps)
        </h3>
        {configuredSteps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Click steps from the library to add them to this program's workflow.
          </p>
        ) : (
          <div className="space-y-1">
            {configuredSteps.map((step, idx) => (
              <div
                key={`${step.stepDefinitionId}-${idx}`}
                className="flex items-center gap-2 px-3 py-2 rounded-md border"
                data-testid={`configured-step-${step.stepDefinitionId}`}
              >
                <span className="text-xs text-muted-foreground w-5 text-center">{idx + 1}</span>
                <StepColorDot color={step.color} />
                <span className="flex-1 text-sm">{step.name}</span>
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-1 mr-2">
                    <Label className="text-xs text-muted-foreground">Req</Label>
                    <Switch
                      checked={step.isRequired}
                      onCheckedChange={() => toggleRequired(idx)}
                      data-testid={`switch-required-${step.stepDefinitionId}`}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => moveStep(idx, "up")}
                    disabled={idx === 0}
                    data-testid={`button-move-up-${step.stepDefinitionId}`}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => moveStep(idx, "down")}
                    disabled={idx === configuredSteps.length - 1}
                    data-testid={`button-move-down-${step.stepDefinitionId}`}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeStep(idx)}
                    data-testid={`button-remove-step-${step.stepDefinitionId}`}
                  >
                    <X />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button
          onClick={() => saveStepsMutation.mutate()}
          disabled={saveStepsMutation.isPending}
          className="w-full"
          data-testid="button-save-steps"
        >
          {saveStepsMutation.isPending && <Loader2 className="animate-spin" />}
          <Save className="mr-1" /> Save Step Configuration
        </Button>
      </div>
    </div>
  );
}

function DocumentsTab({ programId }: { programId: number }) {
  const { toast } = useToast();
  const [dragOverStepId, setDragOverStepId] = useState<number | null | "unassigned">(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [docForm, setDocForm] = useState({
    documentName: "",
    documentCategory: "borrower_docs",
    documentDescription: "",
    isRequired: true,
    stepId: null as number | null,
  });

  const { data: programData, isLoading } = useQuery<{
    program: any;
    documents: ProgramDocument[];
    tasks: ProgramTask[];
    workflowSteps: ProgramWorkflowStep[];
  }>({
    queryKey: ["/api/admin/programs", programId],
  });

  const documents = programData?.documents || [];
  const workflowSteps = programData?.workflowSteps || [];

  const batchAssignMutation = useMutation({
    mutationFn: async (assignments: { documentId: number; stepId: number | null }[]) => {
      return apiRequest("PUT", `/api/admin/programs/${programId}/documents/batch-step`, {
        assignments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      toast({ title: "Document assignment updated" });
    },
    onError: () => {
      toast({ title: "Failed to update document assignment", variant: "destructive" });
    },
  });

  const addDocMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/programs/${programId}/documents`, {
        documentName: docForm.documentName,
        documentCategory: docForm.documentCategory,
        documentDescription: docForm.documentDescription || null,
        isRequired: docForm.isRequired,
        stepId: docForm.stepId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddForm(false);
      setDocForm({
        documentName: "",
        documentCategory: "borrower_docs",
        documentDescription: "",
        isRequired: true,
        stepId: null,
      });
      toast({ title: "Document added" });
    },
    onError: () => {
      toast({ title: "Failed to add document", variant: "destructive" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: number) => {
      return apiRequest("DELETE", `/api/admin/programs/${programId}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Document removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove document", variant: "destructive" });
    },
  });

  const handleDragStart = useCallback((e: React.DragEvent, docId: number) => {
    e.dataTransfer.setData("text/plain", String(docId));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetStepId: number | null) => {
      e.preventDefault();
      setDragOverStepId(null);
      const docIdStr = e.dataTransfer.getData("text/plain");
      const docId = parseInt(docIdStr, 10);
      if (isNaN(docId)) return;

      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;
      if (doc.stepId === targetStepId) return;

      batchAssignMutation.mutate([{ documentId: docId, stepId: targetStepId }]);
    },
    [documents, batchAssignMutation]
  );

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const unassignedDocs = documents.filter((d) => d.stepId === null);

  return (
    <div className="space-y-4 mt-2">
      <div className="flex gap-3 overflow-x-auto pb-2">
        <div
          className={`min-w-[180px] w-[180px] shrink-0 rounded-md border-2 border-dashed p-3 transition-colors ${
            dragOverStepId === "unassigned"
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
              : "border-border"
          }`}
          onDragOver={(e) => {
            handleDragOver(e);
            setDragOverStepId("unassigned");
          }}
          onDragLeave={() => setDragOverStepId(null)}
          onDrop={(e) => handleDrop(e, null)}
          data-testid="dropzone-unassigned-docs"
        >
          <p className="text-xs font-semibold text-muted-foreground mb-2">Unassigned</p>
          <div className="space-y-1">
            {unassignedDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                programId={programId}
                onDragStart={handleDragStart}
                onDelete={(id) => deleteDocMutation.mutate(id)}
              />
            ))}
            {unassignedDocs.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Drop documents here</p>
            )}
          </div>
        </div>

        {workflowSteps
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((ws) => {
            const stepDocs = documents.filter((d) => d.stepId === ws.id);
            return (
              <div
                key={ws.id}
                className={`min-w-[180px] w-[180px] shrink-0 rounded-md border-2 border-dashed p-3 transition-colors ${
                  dragOverStepId === ws.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-border"
                }`}
                onDragOver={(e) => {
                  handleDragOver(e);
                  setDragOverStepId(ws.id);
                }}
                onDragLeave={() => setDragOverStepId(null)}
                onDrop={(e) => handleDrop(e, ws.id)}
                data-testid={`dropzone-step-docs-${ws.id}`}
              >
                <div className="flex items-center gap-1 mb-2">
                  <StepColorDot color={ws.definition.color} />
                  <p className="text-xs font-semibold text-muted-foreground">
                    {ws.definition.name}
                  </p>
                </div>
                <div className="space-y-1">
                  {stepDocs.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      programId={programId}
                      onDragStart={handleDragStart}
                      onDelete={(id) => deleteDocMutation.mutate(id)}
                    />
                  ))}
                  {stepDocs.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Drop documents here</p>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {showAddForm ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="doc-name">Document Name</Label>
                <Input
                  id="doc-name"
                  value={docForm.documentName}
                  onChange={(e) => setDocForm({ ...docForm, documentName: e.target.value })}
                  placeholder="e.g. Purchase Agreement"
                  data-testid="input-doc-name"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={docForm.documentCategory}
                  onValueChange={(v) => setDocForm({ ...docForm, documentCategory: v })}
                >
                  <SelectTrigger data-testid="select-doc-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="doc-desc">Description (optional)</Label>
              <Textarea
                id="doc-desc"
                value={docForm.documentDescription}
                onChange={(e) => setDocForm({ ...docForm, documentDescription: e.target.value })}
                placeholder="Description"
                className="resize-none"
                data-testid="input-doc-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assign to Step (optional)</Label>
                <Select
                  value={docForm.stepId !== null ? String(docForm.stepId) : "none"}
                  onValueChange={(v) =>
                    setDocForm({ ...docForm, stepId: v === "none" ? null : parseInt(v, 10) })
                  }
                >
                  <SelectTrigger data-testid="select-doc-step">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {workflowSteps
                      .sort((a, b) => a.stepOrder - b.stepOrder)
                      .map((ws) => (
                        <SelectItem key={ws.id} value={String(ws.id)}>
                          {ws.definition.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="doc-required">Required</Label>
                  <Switch
                    id="doc-required"
                    checked={docForm.isRequired}
                    onCheckedChange={(v) => setDocForm({ ...docForm, isRequired: v })}
                    data-testid="switch-doc-required"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => addDocMutation.mutate()}
                disabled={!docForm.documentName.trim() || addDocMutation.isPending}
                data-testid="button-save-doc"
              >
                {addDocMutation.isPending && <Loader2 className="animate-spin" />}
                Add Document
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddForm(false)}
                data-testid="button-cancel-doc"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          data-testid="button-add-document"
        >
          <Plus className="mr-1" /> Add Document
        </Button>
      )}
    </div>
  );
}

interface ReviewRule {
  id?: number;
  ruleTitle: string;
  ruleDescription: string;
  ruleType: string;
  severity: string;
  isActive: boolean;
}

const RULE_TYPE_OPTIONS = [
  { value: "presence", label: "Presence Check" },
  { value: "numeric_threshold", label: "Numeric Threshold" },
  { value: "format", label: "Format / Structure" },
  { value: "consistency", label: "Cross-Reference / Consistency" },
  { value: "red_flag", label: "Red Flag Detection" },
  { value: "signature_date", label: "Signature / Date Check" },
  { value: "general", label: "General" },
];

const SEVERITY_OPTIONS = [
  { value: "fail", label: "Fail", color: "text-red-600" },
  { value: "warn", label: "Warning", color: "text-amber-600" },
  { value: "info", label: "Info", color: "text-blue-600" },
];

function DocumentRulesDialog({
  templateId,
  programId,
  documentName,
  open,
  onOpenChange,
}: {
  templateId: number;
  programId: number;
  documentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: rulesData, isLoading } = useQuery<{ rules: any[] }>({
    queryKey: [`/api/admin/document-templates/${templateId}/review-rules`],
    enabled: open,
  });

  useEffect(() => {
    if (rulesData?.rules) {
      setRules(rulesData.rules.map((r: any) => ({
        id: r.id,
        ruleTitle: r.ruleTitle || '',
        ruleDescription: r.ruleDescription || '',
        ruleType: r.ruleType || 'general',
        severity: r.severity || 'fail',
        isActive: r.isActive !== false,
      })));
      setHasChanges(false);
    }
  }, [rulesData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/admin/document-templates/${templateId}/review-rules`, {
        programId,
        rules: rules.filter(r => r.ruleTitle.trim()).map((r, idx) => ({
          ruleTitle: r.ruleTitle.trim(),
          ruleDescription: r.ruleDescription.trim(),
          ruleType: r.ruleType,
          severity: r.severity,
          documentType: documentName,
          isActive: r.isActive,
          sortOrder: idx,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Rules saved' });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/document-templates/${templateId}/review-rules`] });
    },
    onError: () => {
      toast({ title: 'Failed to save rules', variant: 'destructive' });
    },
  });

  const addRule = () => {
    setRules([...rules, { ruleTitle: '', ruleDescription: '', ruleType: 'general', severity: 'fail', isActive: true }]);
    setHasChanges(true);
  };

  const updateRule = (index: number, field: keyof ReviewRule, value: any) => {
    const updated = [...rules];
    (updated[index] as any)[field] = value;
    setRules(updated);
    setHasChanges(true);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const moveRule = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rules.length) return;
    const updated = [...rules];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setRules(updated);
    setHasChanges(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Review Rules
          </DialogTitle>
          <DialogDescription>
            Configure review rules for "{documentName}". The AI will use these rules when reviewing uploaded documents of this type.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No review rules configured yet. Add rules to enable AI document review for this document type.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule, idx) => (
                  <div key={idx} className="border rounded-md p-3 space-y-2 bg-muted/20" data-testid={`wf-rule-row-${templateId}-${idx}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-0.5 mt-1">
                        <button onClick={() => moveRule(idx, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-wf-rule-up-${idx}`}>
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveRule(idx, 'down')} disabled={idx === rules.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-wf-rule-down-${idx}`}>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Rule title (e.g., Verify borrower name matches across all pages)"
                          value={rule.ruleTitle}
                          onChange={(e) => updateRule(idx, 'ruleTitle', e.target.value)}
                          className="text-sm"
                          data-testid={`input-wf-rule-title-${idx}`}
                        />
                        <Textarea
                          placeholder="Detailed instructions for the AI reviewer..."
                          value={rule.ruleDescription}
                          onChange={(e) => updateRule(idx, 'ruleDescription', e.target.value)}
                          className="text-sm min-h-[60px]"
                          data-testid={`input-wf-rule-desc-${idx}`}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Select value={rule.ruleType} onValueChange={(v) => updateRule(idx, 'ruleType', v)}>
                            <SelectTrigger className="w-[180px] text-xs h-8" data-testid={`select-wf-rule-type-${idx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RULE_TYPE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={rule.severity} onValueChange={(v) => updateRule(idx, 'severity', v)}>
                            <SelectTrigger className="w-[130px] text-xs h-8" data-testid={`select-wf-rule-severity-${idx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SEVERITY_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <span className={opt.color}>{opt.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeRule(idx)} className="text-destructive flex-shrink-0" data-testid={`button-wf-remove-rule-${idx}`}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="outline" onClick={addRule} data-testid={`button-wf-add-rule-${templateId}`}>
                <Plus className="h-3 w-3 mr-1" />
                Add Rule
              </Button>
              {hasChanges && (
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid={`button-wf-save-rules-${templateId}`}>
                  {saveMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                  Save Rules
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocumentCard({
  doc,
  programId,
  onDragStart,
  onDelete,
}: {
  doc: ProgramDocument;
  programId: number;
  onDragStart: (e: React.DragEvent, docId: number) => void;
  onDelete: (docId: number) => void;
}) {
  const [showRulesDialog, setShowRulesDialog] = useState(false);

  return (
    <>
      <Card
        draggable="true"
        onDragStart={(e) => onDragStart(e, doc.id)}
        className="cursor-grab active:cursor-grabbing"
        data-testid={`card-document-${doc.id}`}
      >
        <CardContent className="p-2 space-y-1">
          <div className="flex items-start gap-1.5">
            <FileText className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-xs font-medium leading-tight break-words" data-testid={`text-doc-name-${doc.id}`}>
              {doc.documentName}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Badge variant="secondary" className="text-[10px] no-default-hover-elevate no-default-active-elevate">
              {getCategoryLabel(doc.documentCategory, DOCUMENT_CATEGORIES)}
            </Badge>
            {doc.isRequired && (
              <Badge variant="outline" className="text-[10px] no-default-hover-elevate no-default-active-elevate">
                Required
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowRulesDialog(true); }}
              className="h-5 text-[10px] px-1.5 gap-1"
              data-testid={`button-ai-rules-${doc.id}`}
            >
              <Sparkles className="w-3 h-3" />
              AI Review
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
              data-testid={`button-delete-doc-${doc.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
      <DocumentRulesDialog
        templateId={doc.id}
        programId={programId}
        documentName={doc.documentName}
        open={showRulesDialog}
        onOpenChange={setShowRulesDialog}
      />
    </>
  );
}

function TasksTab({ programId }: { programId: number }) {
  const { toast } = useToast();
  const [dragOverStepId, setDragOverStepId] = useState<number | null | "unassigned">(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [taskForm, setTaskForm] = useState({
    taskName: "",
    taskDescription: "",
    taskCategory: "other",
    priority: "medium",
    stepId: null as number | null,
    assignToRole: null as string | null,
  });

  const { data: programData, isLoading } = useQuery<{
    program: any;
    documents: ProgramDocument[];
    tasks: ProgramTask[];
    workflowSteps: ProgramWorkflowStep[];
  }>({
    queryKey: ["/api/admin/programs", programId],
  });

  const tasks = programData?.tasks || [];
  const workflowSteps = programData?.workflowSteps || [];

  const batchAssignMutation = useMutation({
    mutationFn: async (assignments: { taskId: number; stepId: number | null; assignToRole?: string | null }[]) => {
      return apiRequest("PUT", `/api/admin/programs/${programId}/tasks/batch-step`, {
        assignments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      toast({ title: "Task assignment updated" });
    },
    onError: () => {
      toast({ title: "Failed to update task assignment", variant: "destructive" });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/programs/${programId}/tasks`, {
        taskName: taskForm.taskName,
        taskDescription: taskForm.taskDescription || null,
        taskCategory: taskForm.taskCategory,
        priority: taskForm.priority,
        stepId: taskForm.stepId,
        assignToRole: taskForm.assignToRole,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddForm(false);
      setTaskForm({
        taskName: "",
        taskDescription: "",
        taskCategory: "other",
        priority: "medium",
        stepId: null,
        assignToRole: null,
      });
      toast({ title: "Task added" });
    },
    onError: () => {
      toast({ title: "Failed to add task", variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest("DELETE", `/api/admin/programs/${programId}/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Task removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove task", variant: "destructive" });
    },
  });

  const updateTaskRoleMutation = useMutation({
    mutationFn: async ({ taskId, assignToRole }: { taskId: number; assignToRole: string | null }) => {
      return apiRequest("PUT", `/api/admin/programs/${programId}/tasks/${taskId}`, {
        assignToRole,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
      toast({ title: "Task role updated" });
    },
    onError: () => {
      toast({ title: "Failed to update task role", variant: "destructive" });
    },
  });

  const handleDragStart = useCallback((e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData("text/plain", String(taskId));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetStepId: number | null) => {
      e.preventDefault();
      setDragOverStepId(null);
      const taskIdStr = e.dataTransfer.getData("text/plain");
      const taskId = parseInt(taskIdStr, 10);
      if (isNaN(taskId)) return;

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (task.stepId === targetStepId) return;

      batchAssignMutation.mutate([{ taskId, stepId: targetStepId }]);
    },
    [tasks, batchAssignMutation]
  );

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const unassignedTasks = tasks.filter((t) => t.stepId === null);

  return (
    <div className="space-y-4 mt-2">
      <div className="flex gap-3 overflow-x-auto pb-2">
        <div
          className={`min-w-[180px] w-[180px] shrink-0 rounded-md border-2 border-dashed p-3 transition-colors ${
            dragOverStepId === "unassigned"
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
              : "border-border"
          }`}
          onDragOver={(e) => {
            handleDragOver(e);
            setDragOverStepId("unassigned");
          }}
          onDragLeave={() => setDragOverStepId(null)}
          onDrop={(e) => handleDrop(e, null)}
          data-testid="dropzone-unassigned-tasks"
        >
          <p className="text-xs font-semibold text-muted-foreground mb-2">Unassigned</p>
          <div className="space-y-1">
            {unassignedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onDragStart={handleDragStart}
                onDelete={(id) => deleteTaskMutation.mutate(id)}
                onRoleChange={(taskId, role) =>
                  updateTaskRoleMutation.mutate({ taskId, assignToRole: role })
                }
              />
            ))}
            {unassignedTasks.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Drop tasks here</p>
            )}
          </div>
        </div>

        {workflowSteps
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((ws) => {
            const stepTasks = tasks.filter((t) => t.stepId === ws.id);
            return (
              <div
                key={ws.id}
                className={`min-w-[180px] w-[180px] shrink-0 rounded-md border-2 border-dashed p-3 transition-colors ${
                  dragOverStepId === ws.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-border"
                }`}
                onDragOver={(e) => {
                  handleDragOver(e);
                  setDragOverStepId(ws.id);
                }}
                onDragLeave={() => setDragOverStepId(null)}
                onDrop={(e) => handleDrop(e, ws.id)}
                data-testid={`dropzone-step-tasks-${ws.id}`}
              >
                <div className="flex items-center gap-1 mb-2">
                  <StepColorDot color={ws.definition.color} />
                  <p className="text-xs font-semibold text-muted-foreground">
                    {ws.definition.name}
                  </p>
                </div>
                <div className="space-y-1">
                  {stepTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDragStart={handleDragStart}
                      onDelete={(id) => deleteTaskMutation.mutate(id)}
                      onRoleChange={(taskId, role) =>
                        updateTaskRoleMutation.mutate({ taskId, assignToRole: role })
                      }
                    />
                  ))}
                  {stepTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Drop tasks here</p>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {showAddForm ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="task-name">Task Name</Label>
                <Input
                  id="task-name"
                  value={taskForm.taskName}
                  onChange={(e) => setTaskForm({ ...taskForm, taskName: e.target.value })}
                  placeholder="e.g. Order Appraisal"
                  data-testid="input-task-name"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={taskForm.taskCategory}
                  onValueChange={(v) => setTaskForm({ ...taskForm, taskCategory: v })}
                >
                  <SelectTrigger data-testid="select-task-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="task-desc">Description (optional)</Label>
              <Textarea
                id="task-desc"
                value={taskForm.taskDescription}
                onChange={(e) => setTaskForm({ ...taskForm, taskDescription: e.target.value })}
                placeholder="Describe this task"
                className="resize-none"
                data-testid="input-task-description"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(v) => setTaskForm({ ...taskForm, priority: v })}
                >
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign To</Label>
                <Select
                  value={taskForm.assignToRole || "none"}
                  onValueChange={(v) =>
                    setTaskForm({ ...taskForm, assignToRole: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger data-testid="select-task-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign to Step</Label>
                <Select
                  value={taskForm.stepId !== null ? String(taskForm.stepId) : "none"}
                  onValueChange={(v) =>
                    setTaskForm({ ...taskForm, stepId: v === "none" ? null : parseInt(v, 10) })
                  }
                >
                  <SelectTrigger data-testid="select-task-step">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {workflowSteps
                      .sort((a, b) => a.stepOrder - b.stepOrder)
                      .map((ws) => (
                        <SelectItem key={ws.id} value={String(ws.id)}>
                          {ws.definition.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => addTaskMutation.mutate()}
                disabled={!taskForm.taskName.trim() || addTaskMutation.isPending}
                data-testid="button-save-task"
              >
                {addTaskMutation.isPending && <Loader2 className="animate-spin" />}
                Add Task
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddForm(false)}
                data-testid="button-cancel-task"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          data-testid="button-add-task"
        >
          <Plus className="mr-1" /> Add Task
        </Button>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onDragStart,
  onDelete,
  onRoleChange,
}: {
  task: ProgramTask;
  onDragStart: (e: React.DragEvent, taskId: number) => void;
  onDelete: (taskId: number) => void;
  onRoleChange: (taskId: number, role: string | null) => void;
}) {
  return (
    <Card
      draggable="true"
      onDragStart={(e) => onDragStart(e, task.id)}
      className="cursor-grab active:cursor-grabbing"
      data-testid={`card-task-${task.id}`}
    >
      <CardContent className="p-2 space-y-1">
        <div className="flex items-start gap-1.5">
          <ListChecks className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-xs font-medium leading-tight break-words" data-testid={`text-task-name-${task.id}`}>
            {task.taskName}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Badge
            variant="secondary"
            className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${getPriorityColor(task.priority)}`}
          >
            {task.priority}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            data-testid={`button-delete-task-${task.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {task.taskCategory && (
            <span className="text-[10px] text-muted-foreground">
              {getCategoryLabel(task.taskCategory, TASK_CATEGORIES)}
            </span>
          )}
          <Select
            value={task.assignToRole || "none"}
            onValueChange={(v) => onRoleChange(task.id, v === "none" ? null : v)}
          >
            <SelectTrigger
              className="h-6 text-[10px] w-auto min-w-[80px] border-dashed"
              data-testid={`select-task-assign-${task.id}`}
            >
              <SelectValue placeholder="Assign..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

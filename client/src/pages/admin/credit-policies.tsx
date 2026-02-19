import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Plus,
  Upload,
  Loader2,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Pencil,
  ShieldCheck,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

type Rule = {
  documentType: string;
  ruleTitle: string;
  ruleDescription: string;
  category?: string;
  isActive?: boolean;
  confidence?: "high" | "medium" | "low";
  _localId?: string;
};

let ruleIdCounter = 0;
function assignLocalId(rule: Rule): Rule {
  if (!rule._localId) return { ...rule, _localId: `rule_${++ruleIdCounter}` };
  return rule;
}

type CreditPolicy = {
  id: number;
  name: string;
  description: string | null;
  sourceFileName: string | null;
  isActive: boolean;
  ruleCount: number;
  createdAt: string;
  updatedAt: string;
};

type CreditPolicyWithRules = CreditPolicy & { rules: Rule[] };

export default function AdminCreditPolicies() {
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CreditPolicyWithRules | null>(null);
  const [deletePolicy, setDeletePolicy] = useState<CreditPolicy | null>(null);

  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [sourceFileName, setSourceFileName] = useState("");

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [editingRuleIds, setEditingRuleIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, []);

  const { data: policies, isLoading } = useQuery<CreditPolicy[]>({
    queryKey: ["/api/admin/credit-policies"],
  });

  const createPolicy = useMutation({
    mutationFn: async () => {
      const validRules = rules.filter((r) => r.ruleTitle?.trim());
      return apiRequest("POST", "/api/admin/credit-policies", {
        name: policyName,
        description: policyDescription || null,
        sourceFileName: sourceFileName || null,
        rules: validRules,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-policies"] });
      resetForm();
      setShowAddDialog(false);
      toast({ title: "Credit policy created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create credit policy", variant: "destructive" });
    },
  });

  const updatePolicy = useMutation({
    mutationFn: async () => {
      if (!editingPolicy) return;
      const validRules = rules.filter((r) => r.ruleTitle?.trim());
      return apiRequest("PUT", `/api/admin/credit-policies/${editingPolicy.id}`, {
        name: policyName,
        description: policyDescription || null,
        rules: validRules,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-policies"] });
      resetForm();
      setEditingPolicy(null);
      toast({ title: "Credit policy updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update credit policy", variant: "destructive" });
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/credit-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-policies"] });
      setDeletePolicy(null);
      toast({ title: "Credit policy deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete credit policy", variant: "destructive" });
    },
  });

  function resetForm() {
    setPolicyName("");
    setPolicyDescription("");
    setRules([]);
    setSourceFileName("");
    setCollapsedSections({});
    setEditingRuleIds(new Set());
    setIsDragOver(false);
    setExtractProgress(0);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
      progressTimeoutRef.current = null;
    }
  }

  function startProgressSimulation() {
    setExtractProgress(0);
    let progress = 0;
    progressIntervalRef.current = setInterval(() => {
      progress += Math.random() * 8 + 2;
      if (progress > 90) progress = 90 + Math.random() * 2;
      if (progress > 95) progress = 95;
      setExtractProgress(Math.min(Math.round(progress), 95));
    }, 600);
  }

  function stopProgressSimulation() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setExtractProgress(100);
    progressTimeoutRef.current = setTimeout(() => {
      setExtractProgress(0);
      progressTimeoutRef.current = null;
    }, 500);
  }

  async function handleFileUpload(file: File) {
    setIsExtracting(true);
    setSourceFileName(file.name);
    setEditingRuleIds(new Set());
    startProgressSimulation();
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiRequest("POST", "/api/admin/credit-policies/extract-rules", { fileContent: base64, fileName: file.name });

      const data = await response.json();
      stopProgressSimulation();
      if (data.rules && Array.isArray(data.rules)) {
        setRules(data.rules.map(assignLocalId));
        toast({ title: `Extracted ${data.rules.length} rules from ${file.name}` });
      }
    } catch (error: any) {
      stopProgressSimulation();
      toast({ title: "Failed to extract rules", description: error.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  }

  function handleDropZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function toggleSection(docType: string) {
    setCollapsedSections((prev) => ({ ...prev, [docType]: !prev[docType] }));
  }

  function updateRule(index: number, field: string, value: string) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function deleteRule(index: number) {
    const ruleId = rules[index]?._localId;
    setRules((prev) => prev.filter((_, i) => i !== index));
    if (ruleId) {
      setEditingRuleIds((prev) => {
        const next = new Set(prev);
        next.delete(ruleId);
        return next;
      });
    }
  }

  function toggleEditRule(ruleId: string) {
    setEditingRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }

  function addRuleToGroup(docType: string) {
    const newRule = assignLocalId({ documentType: docType, ruleTitle: "", ruleDescription: "", category: "" });
    setRules((prev) => [...prev, newRule]);
    if (newRule._localId) setEditingRuleIds((prev) => new Set(prev).add(newRule._localId!));
  }

  const groupedRules = rules.reduce(
    (acc, rule, index) => {
      const dt = rule.documentType || "General";
      if (!acc[dt]) acc[dt] = { rules: [], indices: [] };
      acc[dt].rules.push(rule);
      acc[dt].indices.push(index);
      return acc;
    },
    {} as Record<string, { rules: Rule[]; indices: number[] }>
  );

  async function openEditDialog(policy: CreditPolicy) {
    try {
      const res = await fetch(`/api/admin/credit-policies/${policy.id}`, { credentials: "include" });
      const data = await res.json();
      setPolicyName(data.name);
      setPolicyDescription(data.description || "");
      setSourceFileName(data.sourceFileName || "");
      setRules((data.rules || []).map(assignLocalId));
      setCollapsedSections({});
      setEditingRuleIds(new Set());
      setEditingPolicy(data);
    } catch {
      toast({ title: "Failed to load policy details", variant: "destructive" });
    }
  }

  const isDialogOpen = showAddDialog || !!editingPolicy;
  const isEditing = !!editingPolicy;

  function renderPolicyForm() {
    return (
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>Policy Name</Label>
          <Input
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value)}
            placeholder="e.g. DSCR Credit Policy v2"
            data-testid="input-policy-name"
          />
        </div>
        <div className="space-y-2">
          <Label>Description (optional)</Label>
          <Textarea
            value={policyDescription}
            onChange={(e) => setPolicyDescription(e.target.value)}
            placeholder="Brief description of this credit policy..."
            className="min-h-[60px]"
            data-testid="input-policy-description"
          />
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-warning" />
            Upload Credit Policy Document
          </Label>
          <p className="text-xs text-muted-foreground">
            Upload a PDF or Excel file. AI will extract rules automatically, or manage rules manually below.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls"
            className="hidden"
            data-testid="input-policy-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = "";
            }}
          />

          {sourceFileName && !isExtracting && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-uploaded-file">{sourceFileName}</p>
                <p className="text-xs text-muted-foreground">{rules.length} rules extracted</p>
              </div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-reupload-file"
              >
                <Upload className="h-3 w-3 mr-1" />
                Re-upload
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setSourceFileName(""); setRules([]); }}
                data-testid="button-clear-file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {isExtracting ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-extracting-rules">
                  AI is extracting rules from your document...
                </p>
                <div className="w-full max-w-xs space-y-1">
                  <Progress value={extractProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center" data-testid="text-extract-progress">
                    {extractProgress}% complete
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : !sourceFileName ? (
            <div
              className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "border-success bg-success/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              data-testid="dropzone-policy-upload"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDropZoneDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragOver(false);
              }}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Drop file here or click to upload</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, Excel (.xlsx, .xls)</p>
            </div>
          ) : null}

          {rules.length > 0 && (
            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm font-medium" data-testid="text-rule-count">{rules.length} rules</p>
                  {rules.some(r => r.confidence === "low" || r.confidence === "medium") && (
                    <span className="flex items-center gap-1 text-xs text-warning" data-testid="text-rules-need-review">
                      <AlertTriangle className="h-3 w-3" />
                      {rules.filter(r => r.confidence === "low" || r.confidence === "medium").length} need review
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => addRuleToGroup("General")}
                  data-testid="button-add-rule-general"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Rule
                </Button>
              </div>
              {Object.entries(groupedRules).map(([docType, { rules: docRules, indices }]) => {
                const isCollapsed = collapsedSections[docType];
                return (
                  <Card key={docType}>
                    <div
                      className="flex items-center justify-between gap-2 p-3 cursor-pointer"
                      data-testid={`section-header-${docType}`}
                      onClick={() => toggleSection(docType)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{docType}</span>
                        <Badge variant="secondary" className="text-xs">
                          {docRules.length}
                        </Badge>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {!isCollapsed && (
                      <CardContent className="pt-0 space-y-3">
                        {docRules.map((rule, rIdx) => {
                          const globalIdx = indices[rIdx];
                          const isUncertain = rule.confidence === "low" || rule.confidence === "medium";
                          const ruleLocalId = rule._localId || `fallback_${globalIdx}`;
                          const isEditing = editingRuleIds.has(ruleLocalId);
                          return (
                            <div
                              key={globalIdx}
                              className={`border rounded-md p-3 space-y-2 ${
                                rule.confidence === "low"
                                  ? "border-destructive/40 bg-destructive/5"
                                  : rule.confidence === "medium"
                                    ? "border-warning/40 bg-warning/5"
                                    : ""
                              }`}
                            >
                              {isEditing ? (
                                <>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={rule.ruleTitle}
                                      onChange={(e) => updateRule(globalIdx, "ruleTitle", e.target.value)}
                                      placeholder="Rule title"
                                      className="text-sm flex-1"
                                      data-testid={`input-rule-title-${globalIdx}`}
                                    />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => toggleEditRule(ruleLocalId)}
                                      data-testid={`button-done-edit-rule-${globalIdx}`}
                                    >
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => deleteRule(globalIdx)}
                                      data-testid={`button-delete-rule-${globalIdx}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                  <Textarea
                                    value={rule.ruleDescription}
                                    onChange={(e) =>
                                      updateRule(globalIdx, "ruleDescription", e.target.value)
                                    }
                                    placeholder="Rule description"
                                    className="text-sm min-h-[60px]"
                                    data-testid={`input-rule-description-${globalIdx}`}
                                  />
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    {isUncertain && (
                                      <AlertTriangle
                                        className={`h-4 w-4 flex-shrink-0 ${
                                          rule.confidence === "low" ? "text-destructive" : "text-warning"
                                        }`}
                                      />
                                    )}
                                    <span className="text-sm font-medium flex-1" data-testid={`text-rule-title-${globalIdx}`}>
                                      {rule.ruleTitle || "(untitled rule)"}
                                    </span>
                                    {rule.category && (
                                      <Badge variant="outline" className="text-xs shrink-0">
                                        {rule.category}
                                      </Badge>
                                    )}
                                    {rule.confidence && (
                                      <Badge
                                        variant={rule.confidence === "high" ? "secondary" : "outline"}
                                        className={`text-xs shrink-0 ${
                                          rule.confidence === "low"
                                            ? "border-destructive/50 text-destructive"
                                            : rule.confidence === "medium"
                                              ? "border-warning/50 text-warning"
                                              : ""
                                        }`}
                                      >
                                        {rule.confidence}
                                      </Badge>
                                    )}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => toggleEditRule(ruleLocalId)}
                                      data-testid={`button-edit-rule-${globalIdx}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => deleteRule(globalIdx)}
                                      data-testid={`button-delete-rule-${globalIdx}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                  {rule.ruleDescription && (
                                    <p className="text-xs text-muted-foreground" data-testid={`text-rule-description-${globalIdx}`}>
                                      {rule.ruleDescription}
                                    </p>
                                  )}
                                  {isUncertain && (
                                    <p className="text-xs text-warning">
                                      {rule.confidence === "low"
                                        ? "Low confidence — please review carefully."
                                        : "Medium confidence — implied but not explicitly stated."}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                        <Button
                          variant="outline"
                          onClick={() => addRuleToGroup(docType)}
                          data-testid={`button-add-rule-${docType}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Rule
                        </Button>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Credit Policies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage credit policy documents and their extracted review rules. Assign policies to loan programs.
          </p>
        </div>
        <Dialog
          open={showAddDialog}
          onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-policy">
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Credit Policy</DialogTitle>
              <DialogDescription>
                Upload a credit policy document and AI will extract review rules.
              </DialogDescription>
            </DialogHeader>
            {renderPolicyForm()}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createPolicy.mutate()}
                disabled={createPolicy.isPending || !policyName.trim()}
                data-testid="button-save-policy"
              >
                {createPolicy.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Policy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={!!editingPolicy}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPolicy(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Credit Policy</DialogTitle>
            <DialogDescription>
              Update the policy details and rules.
            </DialogDescription>
          </DialogHeader>
          {renderPolicyForm()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingPolicy(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => updatePolicy.mutate()}
              disabled={updatePolicy.isPending || !policyName.trim()}
              data-testid="button-update-policy"
            >
              {updatePolicy.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletePolicy} onOpenChange={(open) => !open && setDeletePolicy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credit Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletePolicy?.name}"? This will remove all its
              rules and unlink it from any programs using it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePolicy && deletePolicyMutation.mutate(deletePolicy.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deletePolicyMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !policies || policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <ShieldCheck className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="text-lg font-medium" data-testid="text-empty-state">No credit policies yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first credit policy by uploading a policy document.
              </p>
            </div>
            <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-first-policy">
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => (
            <Card key={policy.id} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate" data-testid={`text-policy-name-${policy.id}`}>
                        {policy.name}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {policy.ruleCount} rules
                        </Badge>
                        {policy.sourceFileName && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {policy.sourceFileName}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(policy.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(policy)}
                      data-testid={`button-edit-policy-${policy.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletePolicy(policy)}
                      data-testid={`button-delete-policy-${policy.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {policy.description && (
                  <p className="text-sm text-muted-foreground mt-2 ml-13">{policy.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

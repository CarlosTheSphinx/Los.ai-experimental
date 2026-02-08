import { useState, useRef } from "react";
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
} from "lucide-react";

type Rule = {
  documentType: string;
  ruleTitle: string;
  ruleDescription: string;
  category?: string;
  isActive?: boolean;
};

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: policies, isLoading } = useQuery<CreditPolicy[]>({
    queryKey: ["/api/admin/credit-policies"],
  });

  const createPolicy = useMutation({
    mutationFn: async () => {
      const validRules = rules.filter((r) => r.ruleTitle?.trim());
      return apiRequest("/api/admin/credit-policies", {
        method: "POST",
        body: JSON.stringify({
          name: policyName,
          description: policyDescription || null,
          sourceFileName: sourceFileName || null,
          rules: validRules,
        }),
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
      return apiRequest(`/api/admin/credit-policies/${editingPolicy.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: policyName,
          description: policyDescription || null,
          rules: validRules,
        }),
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
      return apiRequest(`/api/admin/credit-policies/${id}`, { method: "DELETE" });
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
    setIsDragOver(false);
  }

  async function handleFileUpload(file: File) {
    setIsExtracting(true);
    setSourceFileName(file.name);
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

      const response = await apiRequest("/api/admin/credit-policies/extract-rules", {
        method: "POST",
        body: JSON.stringify({ fileContent: base64, fileName: file.name }),
      });

      const data = await response.json();
      if (data.rules && Array.isArray(data.rules)) {
        setRules(data.rules);
        toast({ title: `Extracted ${data.rules.length} rules from ${file.name}` });
      }
    } catch (error: any) {
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
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function addRuleToGroup(docType: string) {
    setRules((prev) => [
      ...prev,
      { documentType: docType, ruleTitle: "", ruleDescription: "", category: "" },
    ]);
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
      setRules(data.rules || []);
      setCollapsedSections({});
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
            <Sparkles className="h-4 w-4 text-amber-500" />
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

          {isExtracting ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-extracting-rules">
                  AI is extracting rules from your document...
                </p>
              </CardContent>
            </Card>
          ) : (
            <div
              className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "border-emerald-500 bg-emerald-500/5"
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
              {sourceFileName && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last uploaded: {sourceFileName}
                </p>
              )}
            </div>
          )}

          {rules.length > 0 && (
            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium">{rules.length} rules</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRules((prev) => [
                      ...prev,
                      { documentType: "General", ruleTitle: "", ruleDescription: "", category: "" },
                    ])
                  }
                  data-testid="button-add-rule-general"
                >
                  <Plus className="h-3 w-3 mr-1" />
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
                          return (
                            <div key={globalIdx} className="border rounded-md p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={rule.ruleTitle}
                                  onChange={(e) => updateRule(globalIdx, "ruleTitle", e.target.value)}
                                  placeholder="Rule title"
                                  className="text-sm flex-1"
                                  data-testid={`input-rule-title-${globalIdx}`}
                                />
                                {rule.category && (
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    {rule.category}
                                  </Badge>
                                )}
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
                            </div>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addRuleToGroup(docType)}
                          data-testid={`button-add-rule-${docType}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
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

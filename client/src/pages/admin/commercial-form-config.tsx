import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, GripVertical, Save, RotateCcw, Eye, EyeOff,
  CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  FileCheck, Plus, Pencil, Trash2, X, Brain, FileText, Bot,
  RefreshCw, Sparkles, Upload, Download,
} from "lucide-react";

interface FormField {
  id: number;
  fieldKey: string;
  fieldLabel: string;
  section: string;
  fieldType: string;
  isVisible: boolean;
  isRequired: boolean;
  sortOrder: number;
  options: any;
}

type ActiveTab = "fields" | "documents" | "ai";

const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];
const DOCUMENT_TYPES = [
  "FFE Appraisal","Franchisor Approval","Room Rate Analysis","Reservation System Analysis",
  "Management Agreement","Audit Statement","Full Appraisal","Environmental Report (Phase I)",
  "Environmental Report (Phase II)","Rent Roll","Operating Statements (3 years)","Property Condition Report",
  "Survey","Title Report","Insurance Certificate","Zoning Compliance","Franchise Agreement",
  "Personal Financial Statement","Entity Documents","Ground Lease",
];

type Condition = { field: string; operator: string; value: string };

const INTAKE_AGENTS = [
  { agentType: "intake_validator", name: "Deal Validator", description: "Validates and structures incoming deal submissions", icon: CheckCircle2, color: "emerald" },
  { agentType: "intake_fund_matcher", name: "Fund Matcher", description: "Matches validated deals against fund criteria", icon: Sparkles, color: "blue" },
  { agentType: "intake_feedback_generator", name: "Feedback Generator", description: "Generates verdict and recommendations for deals", icon: Brain, color: "violet" },
];

function RuleForm({ rule, onSave, onCancel, onRefresh }: { rule?: any; onSave: (data: any) => void; onCancel: () => void; onRefresh?: () => void }) {
  const existingConditions = rule?.conditions || {};
  const initialConditions: Condition[] = [];
  if (existingConditions.asset_type) {
    initialConditions.push({ field: "asset_type", operator: "equals", value: Array.isArray(existingConditions.asset_type) ? existingConditions.asset_type.join(",") : existingConditions.asset_type });
  }
  if (existingConditions.loan_amount_gt) {
    initialConditions.push({ field: "loan_amount", operator: "greater_than", value: String(existingConditions.loan_amount_gt) });
  }
  if (existingConditions.loan_amount_lt) {
    initialConditions.push({ field: "loan_amount", operator: "less_than", value: String(existingConditions.loan_amount_lt) });
  }
  if (existingConditions.property_state) {
    initialConditions.push({ field: "property_state", operator: "equals", value: Array.isArray(existingConditions.property_state) ? existingConditions.property_state.join(",") : existingConditions.property_state });
  }

  const [ruleName, setRuleName] = useState(rule?.ruleName || "");
  const [conditions, setConditions] = useState<Condition[]>(initialConditions.length ? initialConditions : [{ field: "asset_type", operator: "equals", value: "" }]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>((rule?.requiredDocuments || []) as string[]);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [customDocName, setCustomDocName] = useState("");
  const [customDocs, setCustomDocs] = useState<string[]>(() => {
    const existing = (rule?.requiredDocuments || []) as string[];
    return existing.filter(d => !DOCUMENT_TYPES.includes(d));
  });
  const [docTemplates, setDocTemplates] = useState<Record<string, { url: string; fileName: string }>>(
    (rule?.documentTemplates || {}) as Record<string, { url: string; fileName: string }>
  );
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});

  const handleTemplateSelect = (docType: string, file: File) => {
    setPendingFiles(prev => ({ ...prev, [docType]: file }));
    setDocTemplates(prev => ({ ...prev, [docType]: { url: "", fileName: file.name } }));
  };

  const handleTemplateRemove = async (docType: string) => {
    if (rule?.id && docTemplates[docType]?.url) {
      await fetch(`/api/commercial/document-rules/${rule.id}/template/${encodeURIComponent(docType)}`, { method: "DELETE", credentials: "include" });
      onRefresh?.();
    }
    setPendingFiles(prev => { const n = { ...prev }; delete n[docType]; return n; });
    setDocTemplates(prev => { const n = { ...prev }; delete n[docType]; return n; });
  };

  const addCondition = () => setConditions([...conditions, { field: "asset_type", operator: "equals", value: "" }]);
  const removeCondition = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));
  const toggleDoc = (doc: string) => {
    setSelectedDocs(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]);
  };

  const handleSave = () => {
    const condObj: Record<string, any> = {};
    conditions.forEach(c => {
      if (!c.value) return;
      if (c.field === "asset_type") {
        condObj.asset_type = c.value.split(",").map(s => s.trim());
      } else if (c.field === "loan_amount") {
        if (c.operator === "greater_than") condObj.loan_amount_gt = parseInt(c.value);
        else condObj.loan_amount_lt = parseInt(c.value);
      } else if (c.field === "property_state") {
        condObj.property_state = c.value.split(",").map(s => s.trim().toUpperCase());
      }
    });
    onSave({ ruleName, conditions: condObj, requiredDocuments: selectedDocs, isActive, _pendingTemplateFiles: pendingFiles });
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div>
        <Label className="text-xs text-slate-400">Rule Name *</Label>
        <Input value={ruleName} onChange={e => setRuleName(e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="rule-name-input" />
      </div>

      <div>
        <Label className="text-xs text-slate-400 mb-2 block">Conditions (IF)</Label>
        {conditions.map((cond, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <Select value={cond.field} onValueChange={v => { const c = [...conditions]; c[i].field = v; if (v === "loan_amount" && c[i].operator === "equals") c[i].operator = "greater_than"; else if (v !== "loan_amount" && c[i].operator !== "equals") c[i].operator = "equals"; setConditions(c); }}>
              <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm w-36" data-testid={`condition-field-${i}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asset_type">Asset Type</SelectItem>
                <SelectItem value="loan_amount">Loan Amount</SelectItem>
                <SelectItem value="property_state">State</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cond.operator} onValueChange={v => { const c = [...conditions]; c[i].operator = v; setConditions(c); }}>
              <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm w-32" data-testid={`condition-op-${i}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cond.field !== "loan_amount" && <SelectItem value="equals">equals</SelectItem>}
                <SelectItem value="greater_than">greater than</SelectItem>
                <SelectItem value="less_than">less than</SelectItem>
              </SelectContent>
            </Select>
            {cond.field === "asset_type" ? (
              <div className="flex-1 relative">
                <div className="flex flex-wrap gap-1 min-h-[36px] p-1.5 rounded-md bg-[#0f1629] border border-slate-700 text-sm">
                  {cond.value ? cond.value.split(",").map(v => v.trim()).filter(Boolean).map(v => (
                    <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs border border-blue-500/30">
                      {v}
                      <button type="button" onClick={() => { const c = [...conditions]; const vals = c[i].value.split(",").map(s => s.trim()).filter(s => s !== v); c[i].value = vals.join(", "); setConditions(c); }} className="hover:text-white"><X size={10} /></button>
                    </span>
                  )) : <span className="text-slate-500 text-xs py-0.5">Select asset types...</span>}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
                  {ASSET_TYPES.filter(at => !cond.value.split(",").map(s => s.trim()).includes(at)).map(at => (
                    <button key={at} type="button" onClick={() => { const c = [...conditions]; const existing = c[i].value ? c[i].value.split(",").map(s => s.trim()).filter(Boolean) : []; c[i].value = [...existing, at].join(", "); setConditions(c); }} className="text-left px-2 py-1 text-xs rounded bg-[#0f1629] text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-white transition-colors" data-testid={`asset-option-${i}-${at}`}>{at}</button>
                  ))}
                </div>
              </div>
            ) : (
              <Input
                value={cond.value}
                onChange={e => { const c = [...conditions]; c[i].value = e.target.value; setConditions(c); }}
                placeholder={cond.field === "loan_amount" ? "5000000" : "CA, NY"}
                className="bg-[#0f1629] border-slate-700 text-white text-sm flex-1"
                data-testid={`condition-value-${i}`}
              />
            )}
            {conditions.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeCondition(i)} className="text-slate-400 h-8 w-8 p-0">
                <X size={14} />
              </Button>
            )}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addCondition} className="text-blue-400 text-xs" data-testid="add-condition">+ AND</Button>
      </div>

      <div>
        <Label className="text-xs text-slate-400 mb-2 block">Required Documents (THEN)</Label>
        <div className="grid grid-cols-2 gap-2">
          {[...DOCUMENT_TYPES, ...customDocs].map(doc => (
            <div key={doc} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => toggleDoc(doc)}
                className={`text-left px-3 py-2 rounded text-xs border transition-colors ${
                  selectedDocs.includes(doc)
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    : "bg-[#0f1629] text-slate-500 border-slate-700 hover:border-slate-500"
                }`}
                data-testid={`doc-${doc.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              >{doc}</button>
              {selectedDocs.includes(doc) && (
                <div className="flex items-center gap-1 pl-1">
                  {docTemplates[doc] ? (
                    <>
                      <FileText size={10} className="text-emerald-400" />
                      <span className="text-[10px] text-emerald-400 truncate flex-1">{docTemplates[doc].fileName}</span>
                      <button type="button" onClick={() => handleTemplateRemove(doc)} className="text-slate-500 hover:text-red-400" data-testid={`remove-template-${doc.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}><X size={10} /></button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 transition-colors">
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) handleTemplateSelect(doc, f); e.target.value = ""; }} />
                      <Upload size={10} />
                      <span>Attach template</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            value={customDocName}
            onChange={e => setCustomDocName(e.target.value)}
            placeholder="Add custom document type..."
            className="bg-[#0f1629] border-slate-700 text-white text-sm flex-1"
            data-testid="custom-doc-input"
            onKeyDown={e => {
              if (e.key === "Enter" && customDocName.trim()) {
                e.preventDefault();
                const name = customDocName.trim();
                if (!DOCUMENT_TYPES.includes(name) && !customDocs.includes(name)) {
                  setCustomDocs(prev => [...prev, name]);
                  setSelectedDocs(prev => [...prev, name]);
                }
                setCustomDocName("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!customDocName.trim()}
            onClick={() => {
              const name = customDocName.trim();
              if (name && !DOCUMENT_TYPES.includes(name) && !customDocs.includes(name)) {
                setCustomDocs(prev => [...prev, name]);
                setSelectedDocs(prev => [...prev, name]);
              }
              setCustomDocName("");
            }}
            data-testid="add-custom-doc-button"
          >
            <Plus size={14} className="mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="rule-active-switch" />
        <Label className="text-xs text-slate-400">Active</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} data-testid="cancel-rule-button">Cancel</Button>
        <Button size="sm" disabled={!ruleName || selectedDocs.length === 0} onClick={handleSave} data-testid="save-rule-button">Save Rule</Button>
      </div>
    </div>
  );
}

function DocumentRulesSection() {
  const { toast } = useToast();
  const [editingRule, setEditingRule] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: rules = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/commercial/document-rules"] });

  const uploadPendingTemplates = async (ruleId: number, pendingFiles: Record<string, File>) => {
    for (const [docType, file] of Object.entries(pendingFiles)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", docType);
      await fetch(`/api/commercial/document-rules/${ruleId}/template`, { method: "POST", body: formData, credentials: "include" });
    }
  };

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const { _pendingTemplateFiles, ...ruleData } = data;
      const res = await apiRequest("POST", "/api/commercial/document-rules", ruleData);
      const created = await res.json();
      if (_pendingTemplateFiles && Object.keys(_pendingTemplateFiles).length > 0) {
        await uploadPendingTemplates(created.id, _pendingTemplateFiles);
      }
      return created;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/commercial/document-rules"] }); setDialogOpen(false); toast({ title: "Rule created" }); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const { _pendingTemplateFiles, ...ruleData } = data;
      await apiRequest("PATCH", `/api/commercial/document-rules/${id}`, ruleData);
      if (_pendingTemplateFiles && Object.keys(_pendingTemplateFiles).length > 0) {
        await uploadPendingTemplates(id, _pendingTemplateFiles);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/commercial/document-rules"] }); setDialogOpen(false); setEditingRule(null); toast({ title: "Rule updated" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/commercial/document-rules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/commercial/document-rules"] }); toast({ title: "Rule deleted" }); },
  });

  const formatConditions = (conditions: Record<string, any>) => {
    const parts: string[] = [];
    if (conditions.asset_type) parts.push(`Asset = ${Array.isArray(conditions.asset_type) ? conditions.asset_type.join(", ") : conditions.asset_type}`);
    if (conditions.loan_amount_gt) parts.push(`Amount > $${(conditions.loan_amount_gt / 1000000).toFixed(1)}M`);
    if (conditions.loan_amount_lt) parts.push(`Amount < $${(conditions.loan_amount_lt / 1000000).toFixed(1)}M`);
    if (conditions.property_state) parts.push(`State = ${Array.isArray(conditions.property_state) ? conditions.property_state.join(", ") : conditions.property_state}`);
    return parts.join(" AND ") || "No conditions";
  };

  const activeRules = rules.filter((r: any) => r.isActive);

  return (
    <div className="space-y-4" data-testid="document-rules-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck size={16} className="text-amber-400" />
          <h2 className="text-sm font-medium text-white">Conditional Document Requirements</h2>
          <Badge className="text-[10px] bg-amber-500/20 text-amber-400">{activeRules.length} active rule{activeRules.length !== 1 ? "s" : ""}</Badge>
        </div>
        <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingRule(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-700/50 text-xs" data-testid="add-rule-button">
              <Plus size={14} className="mr-1" /> Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#1a2038] border-slate-700 text-white max-w-2xl">
            <DialogHeader><DialogTitle>{editingRule ? "Edit Rule" : "Create New Rule"}</DialogTitle></DialogHeader>
            <RuleForm
              rule={editingRule}
              onCancel={() => { setDialogOpen(false); setEditingRule(null); }}
              onSave={data => {
                if (editingRule) updateMut.mutate({ id: editingRule.id, data });
                else createMut.mutate(data);
              }}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/commercial/document-rules"] })}
            />
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-slate-500">
        Define conditional rules: IF certain deal criteria match, THEN specific documents are required from the borrower.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8"><RefreshCw size={16} className="animate-spin text-slate-400" /></div>
      ) : rules.length === 0 ? (
        <Card className="bg-[#0f1629] border-slate-700/30">
          <CardContent className="p-8 text-center">
            <FileCheck size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">No document rules configured yet.</p>
            <p className="text-xs text-slate-600 mt-1">Add rules to specify what documents are required based on deal criteria.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule: any) => (
            <div
              key={rule.id}
              className={`p-3 rounded-lg border ${rule.isActive ? "bg-[#0f1629] border-slate-700/30" : "bg-[#0f1629]/50 border-slate-800/30 opacity-60"}`}
              data-testid={`rule-card-${rule.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white truncate">{rule.ruleName}</span>
                    <Badge className={`text-[9px] shrink-0 ${rule.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-500"}`}>
                      {rule.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <span className="text-blue-400 font-medium">IF</span>
                    <span className="text-slate-400">{formatConditions(rule.conditions)}</span>
                  </div>
                  <div className="flex items-start gap-1 text-xs mt-1">
                    <span className="text-amber-400 font-medium shrink-0">THEN</span>
                    <span className="text-slate-400">{(rule.requiredDocuments as string[]).join(", ")}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingRule(rule); setDialogOpen(true); }} className="text-slate-400 hover:text-white h-7 w-7 p-0" data-testid={`edit-rule-${rule.id}`}>
                    <Pencil size={13} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("Delete this rule?")) deleteMut.mutate(rule.id); }} className="text-slate-400 hover:text-red-400 h-7 w-7 p-0" data-testid={`delete-rule-${rule.id}`}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIConfigSection() {
  const { toast } = useToast();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { systemPrompt: string; modelName: string; temperature: number; maxTokens: number }>>({});

  const { data: configs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/agents/configurations"] });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/admin/agents/configurations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/configurations"] });
      toast({ title: "Agent configuration saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    },
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/agents/configurations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents/configurations"] });
      toast({ title: "Agent configuration created" });
    },
    onError: (err: any) => {
      toast({ title: "Error creating", description: err.message, variant: "destructive" });
    },
  });

  const getConfigForAgent = (agentType: string) => {
    return configs.find((c: any) => c.agentType === agentType && c.isActive);
  };

  const getEditState = (agentType: string) => {
    if (editState[agentType]) return editState[agentType];
    const existing = getConfigForAgent(agentType);
    if (existing) {
      return {
        systemPrompt: existing.systemPrompt || "",
        modelName: existing.modelName || "gpt-4o-mini",
        temperature: existing.temperature ?? 0.2,
        maxTokens: existing.maxTokens ?? 4096,
      };
    }
    return { systemPrompt: "", modelName: "gpt-4o-mini", temperature: 0.2, maxTokens: 4096 };
  };

  const updateEditState = (agentType: string, updates: Partial<typeof editState[string]>) => {
    const current = getEditState(agentType);
    setEditState(prev => ({ ...prev, [agentType]: { ...current, ...updates } }));
  };

  const handleSaveAgent = (agentType: string, agentName: string) => {
    const state = getEditState(agentType);
    const existing = getConfigForAgent(agentType);
    if (existing) {
      updateMut.mutate({ id: existing.id, data: state });
    } else {
      createMut.mutate({
        agentType,
        name: agentName,
        ...state,
      });
    }
  };

  const hasChanges = (agentType: string) => {
    if (!editState[agentType]) return false;
    const existing = getConfigForAgent(agentType);
    const es = editState[agentType];
    if (!existing) {
      return (
        es.systemPrompt !== "" ||
        es.modelName !== "gpt-4o-mini" ||
        es.temperature !== 0.2 ||
        es.maxTokens !== 4096
      );
    }
    return (
      es.systemPrompt !== (existing.systemPrompt || "") ||
      es.modelName !== (existing.modelName || "gpt-4o-mini") ||
      es.temperature !== (existing.temperature ?? 0.2) ||
      es.maxTokens !== (existing.maxTokens ?? 4096)
    );
  };

  const configuredCount = INTAKE_AGENTS.filter(a => getConfigForAgent(a.agentType)).length;

  return (
    <div className="space-y-4" data-testid="ai-config-section">
      <div className="flex items-center gap-2">
        <Bot size={16} className="text-violet-400" />
        <h2 className="text-sm font-medium text-white">AI Analysis Pipeline</h2>
        <Badge className="text-[10px] bg-violet-500/20 text-violet-400">{configuredCount}/{INTAKE_AGENTS.length} configured</Badge>
      </div>

      <p className="text-xs text-slate-500">
        Configure the AI agents that analyze incoming commercial deals. Each agent runs in sequence: validation → fund matching → feedback generation.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8"><RefreshCw size={16} className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-3">
          {INTAKE_AGENTS.map(agent => {
            const config = getConfigForAgent(agent.agentType);
            const isExpanded = expandedAgent === agent.agentType;
            const state = getEditState(agent.agentType);
            const changed = hasChanges(agent.agentType);
            const Icon = agent.icon;

            const colorClasses = {
              emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-400" },
              blue: { bg: "bg-blue-500/20", text: "text-blue-400", badge: "bg-blue-500/20 text-blue-400" },
              violet: { bg: "bg-violet-500/20", text: "text-violet-400", badge: "bg-violet-500/20 text-violet-400" },
            }[agent.color];

            return (
              <div key={agent.agentType} className="rounded-lg border border-slate-700/30 bg-[#0f1629] overflow-hidden" data-testid={`agent-card-${agent.agentType}`}>
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.agentType)}
                  data-testid={`agent-toggle-${agent.agentType}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${colorClasses.bg} flex items-center justify-center`}>
                      <Icon size={16} className={colorClasses.text} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{agent.name}</span>
                        {config ? (
                          <Badge className={`text-[9px] ${colorClasses.badge}`}>{config.modelName}</Badge>
                        ) : (
                          <Badge className="text-[9px] bg-slate-700/50 text-slate-500">Using defaults</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{agent.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {changed && <Badge className="text-[9px] bg-blue-500/20 text-blue-400">Unsaved</Badge>}
                    {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700/30 p-4 space-y-4">
                    <div>
                      <Label className="text-xs text-slate-400 mb-1 block">System Prompt</Label>
                      <Textarea
                        value={state.systemPrompt}
                        onChange={e => updateEditState(agent.agentType, { systemPrompt: e.target.value })}
                        placeholder={`Enter the system prompt for the ${agent.name}. This defines what the AI looks for and how it analyzes deals.`}
                        className="bg-[#1a2038] border-slate-700 text-white text-sm min-h-[120px] font-mono text-xs"
                        data-testid={`agent-prompt-${agent.agentType}`}
                      />
                      {!config && state.systemPrompt === "" && (
                        <p className="text-[10px] text-slate-600 mt-1">No custom prompt set. The agent will use its built-in default prompt.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-slate-400 mb-1 block">Model</Label>
                        <Select value={state.modelName} onValueChange={v => updateEditState(agent.agentType, { modelName: v })}>
                          <SelectTrigger className="bg-[#1a2038] border-slate-700 text-white text-sm" data-testid={`agent-model-${agent.agentType}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                            <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                            <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs text-slate-400 mb-1 block">
                          Temperature: {state.temperature.toFixed(1)}
                        </Label>
                        <Slider
                          value={[state.temperature]}
                          onValueChange={v => updateEditState(agent.agentType, { temperature: v[0] })}
                          min={0}
                          max={1}
                          step={0.1}
                          className="mt-3"
                          data-testid={`agent-temp-${agent.agentType}`}
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-slate-400 mb-1 block">Max Tokens</Label>
                        <Input
                          type="number"
                          value={state.maxTokens}
                          onChange={e => updateEditState(agent.agentType, { maxTokens: parseInt(e.target.value) || 4096 })}
                          className="bg-[#1a2038] border-slate-700 text-white text-sm"
                          data-testid={`agent-tokens-${agent.agentType}`}
                        />
                      </div>
                    </div>

                    {config?.updatedAt && (
                      <p className="text-[10px] text-slate-600">
                        Last updated: {new Date(config.updatedAt).toLocaleString()}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleSaveAgent(agent.agentType, agent.name)}
                        disabled={!changed || updateMut.isPending || createMut.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-xs"
                        data-testid={`agent-save-${agent.agentType}`}
                      >
                        <Save size={12} className="mr-1" />
                        {updateMut.isPending || createMut.isPending ? "Saving..." : "Save Configuration"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CommercialFormConfigPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>("fields");
  const [editedFields, setEditedFields] = useState<Record<number, Partial<FormField>>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    "Deal Basics": true,
    "Borrower Information": true,
    "Property Metrics": true,
  });

  const { data: fields = [], isLoading } = useQuery<FormField[]>({
    queryKey: ["/api/commercial/form-config"],
  });

  const { data: rules = [] } = useQuery<any[]>({ queryKey: ["/api/commercial/document-rules"] });
  const { data: agentConfigs = [] } = useQuery<any[]>({ queryKey: ["/api/admin/agents/configurations"] });

  const saveMut = useMutation({
    mutationFn: async (updatedFields: Partial<FormField>[]) => {
      const res = await apiRequest("PUT", "/api/commercial/form-config", { fields: updatedFields });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/form-config"] });
      setEditedFields({});
      toast({ title: "Form configuration saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    },
  });

  const getField = (field: FormField): FormField => {
    const edits = editedFields[field.id];
    return edits ? { ...field, ...edits } : field;
  };

  const updateField = (id: number, updates: Partial<FormField>) => {
    setEditedFields(prev => ({
      ...prev,
      [id]: { ...prev[id], id, ...updates },
    }));
  };

  const handleSave = () => {
    const changedFields = Object.values(editedFields).map(edits => {
      const original = fields.find(f => f.id === edits.id);
      return { ...original, ...edits };
    });
    if (changedFields.length === 0) return;
    saveMut.mutate(changedFields);
  };

  const handleReset = () => setEditedFields({});

  const hasChanges = Object.keys(editedFields).length > 0;

  const sections = fields.reduce((acc, field) => {
    const f = getField(field);
    if (!acc[f.section]) acc[f.section] = [];
    acc[f.section].push(f);
    return acc;
  }, {} as Record<string, FormField[]>);

  Object.values(sections).forEach(arr => arr.sort((a, b) => a.sortOrder - b.sortOrder));

  const totalFields = fields.length;
  const visibleCount = fields.map(getField).filter(f => f.isVisible).length;
  const requiredCount = fields.map(getField).filter(f => f.isRequired).length;
  const activeRulesCount = rules.filter((r: any) => r.isActive).length;
  const configuredAgents = INTAKE_AGENTS.filter(a => agentConfigs.find((c: any) => c.agentType === a.agentType && c.isActive)).length;

  const tabs = [
    { id: "fields" as const, label: "Form Fields", icon: FileText, count: `${visibleCount}/${totalFields}` },
    { id: "documents" as const, label: "Document Rules", icon: FileCheck, count: `${activeRulesCount}` },
    { id: "ai" as const, label: "AI Analysis", icon: Brain, count: `${configuredAgents}/3` },
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl" data-testid="form-config-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2" data-testid="page-title">
            <Settings size={20} className="text-blue-400" />
            Commercial Intake Configuration
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure form fields, document requirements, and AI analysis for commercial deal submissions
          </p>
        </div>
        {activeTab === "fields" && (
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-400" data-testid="reset-button">
                <RotateCcw size={14} className="mr-1" /> Reset
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saveMut.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-button"
            >
              <Save size={14} className="mr-1" />
              {saveMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <FileText size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white" data-testid="total-fields">{visibleCount}<span className="text-sm text-slate-500">/{totalFields}</span></p>
              <p className="text-xs text-slate-400">Form Fields</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <FileCheck size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white" data-testid="doc-rules-count">{activeRulesCount}</p>
              <p className="text-xs text-slate-400">Document Rules</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Bot size={16} className="text-violet-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white" data-testid="ai-agents-count">{configuredAgents}<span className="text-sm text-slate-500">/3</span></p>
              <p className="text-xs text-slate-400">AI Agents</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 bg-[#0f1629] rounded-lg p-1 border border-slate-700/30" data-testid="config-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#1a2038] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon size={14} />
              {tab.label}
              <Badge className={`text-[9px] ${isActive ? "bg-blue-500/20 text-blue-400" : "bg-slate-700/50 text-slate-500"}`}>
                {tab.count}
              </Badge>
            </button>
          );
        })}
      </div>

      {activeTab === "fields" && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(sections).map(([sectionName, sectionFields]) => {
                const isExpanded = expandedSections[sectionName] !== false;
                const sectionVisibleCount = sectionFields.filter(f => f.isVisible).length;

                return (
                  <Card key={sectionName} className="bg-[#1a2038] border-slate-700/50">
                    <CardHeader className="pb-2">
                      <button
                        onClick={() => setExpandedSections(prev => ({ ...prev, [sectionName]: !isExpanded }))}
                        className="flex items-center justify-between w-full text-left"
                        data-testid={`section-toggle-${sectionName.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                          <CardTitle className="text-sm text-slate-300">{sectionName}</CardTitle>
                          <Badge className="text-[10px] bg-slate-700/50 text-slate-400">
                            {sectionVisibleCount}/{sectionFields.length} visible
                          </Badge>
                        </div>
                      </button>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="space-y-2 pt-0">
                        <div className="grid grid-cols-[auto_1fr_80px_80px_60px] gap-x-3 gap-y-0 items-center px-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium pb-1 border-b border-slate-700/30">
                          <span></span>
                          <span>Label</span>
                          <span className="text-center">Visible</span>
                          <span className="text-center">Required</span>
                          <span className="text-center">Type</span>
                        </div>
                        {sectionFields.map(field => {
                          const f = getField(field);
                          const hasEdits = !!editedFields[field.id];
                          return (
                            <div
                              key={field.id}
                              className={`grid grid-cols-[auto_1fr_80px_80px_60px] gap-x-3 items-center px-2 py-2 rounded ${
                                hasEdits ? "bg-blue-500/10 border border-blue-500/20" : "bg-[#0f1629] border border-slate-700/30"
                              } ${!f.isVisible ? "opacity-50" : ""}`}
                              data-testid={`field-row-${field.fieldKey}`}
                            >
                              <GripVertical size={14} className="text-slate-600 cursor-grab" />
                              <div className="flex items-center gap-2">
                                <Input
                                  value={f.fieldLabel}
                                  onChange={e => updateField(field.id, { fieldLabel: e.target.value })}
                                  className="bg-transparent border-none text-sm text-white p-0 h-auto focus-visible:ring-0"
                                  data-testid={`field-label-${field.fieldKey}`}
                                />
                                <span className="text-[10px] text-slate-600 font-mono">{field.fieldKey}</span>
                              </div>
                              <div className="flex justify-center">
                                <Switch
                                  checked={f.isVisible}
                                  onCheckedChange={v => updateField(field.id, { isVisible: v })}
                                  data-testid={`field-visible-${field.fieldKey}`}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Switch
                                  checked={f.isRequired}
                                  onCheckedChange={v => updateField(field.id, { isRequired: v })}
                                  disabled={!f.isVisible}
                                  data-testid={`field-required-${field.fieldKey}`}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Badge className="text-[9px] bg-slate-700/50 text-slate-400">{f.fieldType}</Badge>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {hasChanges && (
            <div className="sticky bottom-4 flex justify-end">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMut.isPending}
                className="bg-blue-600 hover:bg-blue-700 shadow-lg"
                data-testid="save-button-sticky"
              >
                <CheckCircle2 size={14} className="mr-1" />
                {saveMut.isPending ? "Saving..." : `Save ${Object.keys(editedFields).length} Change${Object.keys(editedFields).length > 1 ? "s" : ""}`}
              </Button>
            </div>
          )}
        </>
      )}

      {activeTab === "documents" && <DocumentRulesSection />}

      {activeTab === "ai" && <AIConfigSection />}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileCheck, RefreshCw, X, Upload, FileText } from "lucide-react";

const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];
const DOCUMENT_TYPES = [
  "FFE Appraisal","Franchisor Approval","Room Rate Analysis","Reservation System Analysis",
  "Management Agreement","Audit Statement","Full Appraisal","Environmental Report (Phase I)",
  "Environmental Report (Phase II)","Rent Roll","Operating Statements (3 years)","Property Condition Report",
  "Survey","Title Report","Insurance Certificate","Zoning Compliance","Franchise Agreement",
  "Personal Financial Statement","Entity Documents","Ground Lease",
];

type Condition = { field: string; operator: string; value: string };

function RuleForm({ rule, onSave, onCancel, onRefresh }: { rule?: any; onSave: (data: any) => void; onCancel: () => void; onRefresh?: () => void }) {
  const existingConditions = rule?.conditions || {};
  const initialConditions: Condition[] = [];
  if (existingConditions.asset_type) {
    initialConditions.push({ field: "asset_type", operator: "equals", value: Array.isArray(existingConditions.asset_type) ? existingConditions.asset_type.join(",") : existingConditions.asset_type });
  }
  if (existingConditions.loan_amount_gt) {
    initialConditions.push({ field: "loan_amount", operator: "greater_than", value: String(existingConditions.loan_amount_gt) });
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
            <Select value={cond.field} onValueChange={v => { const c = [...conditions]; c[i].field = v; setConditions(c); }}>
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
                <SelectItem value="equals">equals</SelectItem>
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
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={!ruleName || selectedDocs.length === 0} onClick={handleSave} data-testid="save-rule-button">Save Rule</Button>
      </div>
    </div>
  );
}

export default function DocumentRulesPage() {
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

  return (
    <div className="p-6 space-y-6" data-testid="document-rules-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Document Rules</h1>
          <p className="text-sm text-slate-400 mt-1">Configure conditional document requirements for deal submissions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingRule(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-rule-button"><Plus size={14} className="mr-1" /> Add Rule</Button>
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

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
      ) : rules.length === 0 ? (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-12 text-center">
            <FileCheck size={40} className="mx-auto text-slate-500 mb-3" />
            <p className="text-slate-400">No document rules configured. Add rules to specify conditional document requirements.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule: any) => (
            <Card key={rule.id} className="bg-[#1a2038] border-slate-700/50" data-testid={`rule-card-${rule.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white">{rule.ruleName}</h3>
                      <Badge className={`text-[10px] ${rule.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-blue-400 mt-1">IF {formatConditions(rule.conditions)}</p>
                    <p className="text-xs text-slate-400 mt-1">THEN require: {(rule.requiredDocuments as string[]).join(", ")}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingRule(rule); setDialogOpen(true); }} className="text-slate-400 hover:text-white h-8 w-8 p-0" data-testid={`edit-rule-${rule.id}`}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Delete this rule?")) deleteMut.mutate(rule.id); }} className="text-slate-400 hover:text-red-400 h-8 w-8 p-0" data-testid={`delete-rule-${rule.id}`}><Trash2 size={14} /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

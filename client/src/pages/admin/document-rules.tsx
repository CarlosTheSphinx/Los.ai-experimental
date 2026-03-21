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
import { Plus, Pencil, Trash2, FileCheck, RefreshCw, X } from "lucide-react";

const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];
const DOCUMENT_TYPES = [
  "FFE Appraisal","Franchisor Approval","Room Rate Analysis","Reservation System Analysis",
  "Management Agreement","Audit Statement","Full Appraisal","Environmental Report (Phase I)",
  "Environmental Report (Phase II)","Rent Roll","Operating Statements (3 years)","Property Condition Report",
  "Survey","Title Report","Insurance Certificate","Zoning Compliance","Franchise Agreement",
  "Personal Financial Statement","Entity Documents","Ground Lease",
];

type Condition = { field: string; operator: string; value: string };

function RuleForm({ rule, onSave, onCancel }: { rule?: any; onSave: (data: any) => void; onCancel: () => void }) {
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
    onSave({ ruleName, conditions: condObj, requiredDocuments: selectedDocs, isActive });
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
            <Input
              value={cond.value}
              onChange={e => { const c = [...conditions]; c[i].value = e.target.value; setConditions(c); }}
              placeholder={cond.field === "asset_type" ? "Hotel, Motel" : cond.field === "loan_amount" ? "5000000" : "CA, NY"}
              className="bg-[#0f1629] border-slate-700 text-white text-sm flex-1"
              data-testid={`condition-value-${i}`}
            />
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
          {DOCUMENT_TYPES.map(doc => (
            <button
              key={doc}
              type="button"
              onClick={() => toggleDoc(doc)}
              className={`text-left px-3 py-2 rounded text-xs border transition-colors ${
                selectedDocs.includes(doc)
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  : "bg-[#0f1629] text-slate-500 border-slate-700 hover:border-slate-500"
              }`}
              data-testid={`doc-${doc.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
            >{doc}</button>
          ))}
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

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/commercial/document-rules", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/commercial/document-rules"] }); setDialogOpen(false); toast({ title: "Rule created" }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/commercial/document-rules/${id}`, data),
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

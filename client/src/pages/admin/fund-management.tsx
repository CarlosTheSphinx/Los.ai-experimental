import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2, RefreshCw } from "lucide-react";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];

function FundForm({ fund, onSave, onCancel }: { fund?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    fundName: fund?.fundName || "",
    providerName: fund?.providerName || "",
    contactEmail: fund?.contactEmail || "",
    contactPhone: fund?.contactPhone || "",
    ltvMin: fund?.ltvMin ?? "",
    ltvMax: fund?.ltvMax ?? "",
    ltcMin: fund?.ltcMin ?? "",
    ltcMax: fund?.ltcMax ?? "",
    loanAmountMin: fund?.loanAmountMin ?? "",
    loanAmountMax: fund?.loanAmountMax ?? "",
    allowedStates: (fund?.allowedStates || []) as string[],
    allowedAssetTypes: (fund?.allowedAssetTypes || []) as string[],
    fundDescription: fund?.fundDescription || "",
    isActive: fund?.isActive ?? true,
  });

  const toggleState = (state: string) => {
    setForm(f => ({
      ...f,
      allowedStates: f.allowedStates.includes(state)
        ? f.allowedStates.filter(s => s !== state)
        : [...f.allowedStates, state],
    }));
  };

  const toggleAssetType = (type: string) => {
    setForm(f => ({
      ...f,
      allowedAssetTypes: f.allowedAssetTypes.includes(type)
        ? f.allowedAssetTypes.filter(t => t !== type)
        : [...f.allowedAssetTypes, type],
    }));
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Fund Name *</Label>
          <Input value={form.fundName} onChange={e => setForm(f => ({ ...f, fundName: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="fund-name-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Provider Name</Label>
          <Input value={form.providerName} onChange={e => setForm(f => ({ ...f, providerName: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="provider-name-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Contact Email</Label>
          <Input value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="contact-email-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Contact Phone</Label>
          <Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="contact-phone-input" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-slate-400">LTV Min %</Label>
          <Input type="number" value={form.ltvMin} onChange={e => setForm(f => ({ ...f, ltvMin: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="ltv-min-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">LTV Max %</Label>
          <Input type="number" value={form.ltvMax} onChange={e => setForm(f => ({ ...f, ltvMax: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="ltv-max-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">LTC Min %</Label>
          <Input type="number" value={form.ltcMin} onChange={e => setForm(f => ({ ...f, ltcMin: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">LTC Max %</Label>
          <Input type="number" value={form.ltcMax} onChange={e => setForm(f => ({ ...f, ltcMax: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Min Loan Amount ($)</Label>
          <Input type="number" value={form.loanAmountMin} onChange={e => setForm(f => ({ ...f, loanAmountMin: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="loan-min-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Max Loan Amount ($)</Label>
          <Input type="number" value={form.loanAmountMax} onChange={e => setForm(f => ({ ...f, loanAmountMax: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="loan-max-input" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-slate-400 mb-2 block">Allowed States</Label>
        <div className="flex flex-wrap gap-1.5">
          {US_STATES.map(state => (
            <button
              key={state}
              type="button"
              onClick={() => toggleState(state)}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                form.allowedStates.includes(state)
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  : "bg-[#0f1629] text-slate-500 border-slate-700 hover:border-slate-500"
              }`}
              data-testid={`state-${state}`}
            >{state}</button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-slate-400 mb-2 block">Allowed Asset Types</Label>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => toggleAssetType(type)}
              className={`px-3 py-1 rounded text-xs border transition-colors ${
                form.allowedAssetTypes.includes(type)
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "bg-[#0f1629] text-slate-500 border-slate-700 hover:border-slate-500"
              }`}
              data-testid={`asset-${type.toLowerCase().replace(/\s/g, "-")}`}
            >{type}</button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs text-slate-400">Description</Label>
        <Textarea value={form.fundDescription} onChange={e => setForm(f => ({ ...f, fundDescription: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="fund-description-input" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} data-testid="fund-active-switch" />
        <Label className="text-xs text-slate-400">Active</Label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} data-testid="cancel-button">Cancel</Button>
        <Button
          size="sm"
          disabled={!form.fundName}
          onClick={() => {
            const data: any = { ...form };
            if (data.ltvMin !== "") data.ltvMin = parseFloat(data.ltvMin); else data.ltvMin = null;
            if (data.ltvMax !== "") data.ltvMax = parseFloat(data.ltvMax); else data.ltvMax = null;
            if (data.ltcMin !== "") data.ltcMin = parseFloat(data.ltcMin); else data.ltcMin = null;
            if (data.ltcMax !== "") data.ltcMax = parseFloat(data.ltcMax); else data.ltcMax = null;
            if (data.loanAmountMin !== "") data.loanAmountMin = parseInt(data.loanAmountMin); else data.loanAmountMin = null;
            if (data.loanAmountMax !== "") data.loanAmountMax = parseInt(data.loanAmountMax); else data.loanAmountMax = null;
            onSave(data);
          }}
          data-testid="save-fund-button"
        >Save Fund</Button>
      </div>
    </div>
  );
}

export default function FundManagementPage() {
  const { toast } = useToast();
  const [editingFund, setEditingFund] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: fundsList = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/commercial/funds"] });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/commercial/funds", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds"] });
      setDialogOpen(false);
      toast({ title: "Fund created" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/commercial/funds/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds"] });
      setDialogOpen(false);
      setEditingFund(null);
      toast({ title: "Fund updated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/commercial/funds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds"] });
      toast({ title: "Fund deleted" });
    },
  });

  return (
    <div className="p-6 space-y-6" data-testid="fund-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Fund Management</h1>
          <p className="text-sm text-slate-400 mt-1">Configure lending funds and their matching criteria</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingFund(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-fund-button">
              <Plus size={14} className="mr-1" /> Add Fund
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#1a2038] border-slate-700 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingFund ? "Edit Fund" : "Add New Fund"}</DialogTitle>
            </DialogHeader>
            <FundForm
              fund={editingFund}
              onCancel={() => { setDialogOpen(false); setEditingFund(null); }}
              onSave={data => {
                if (editingFund) {
                  updateMut.mutate({ id: editingFund.id, data });
                } else {
                  createMut.mutate(data);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
      ) : fundsList.length === 0 ? (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-12 text-center">
            <Building2 size={40} className="mx-auto text-slate-500 mb-3" />
            <p className="text-slate-400">No funds configured yet. Add your first fund to start matching deals.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {fundsList.map((fund: any) => (
            <Card key={fund.id} className="bg-[#1a2038] border-slate-700/50" data-testid={`fund-card-${fund.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-medium text-white" data-testid={`fund-name-${fund.id}`}>{fund.fundName}</h3>
                      <Badge className={`text-[10px] ${fund.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
                        {fund.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {fund.providerName && <p className="text-xs text-slate-400 mb-1">{fund.providerName}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                      {(fund.ltvMin != null || fund.ltvMax != null) && (
                        <span>LTV: {fund.ltvMin ?? "—"}-{fund.ltvMax ?? "—"}%</span>
                      )}
                      {(fund.loanAmountMin != null || fund.loanAmountMax != null) && (
                        <span>${fund.loanAmountMin ? (fund.loanAmountMin / 1000000).toFixed(1) + "M" : "—"} - ${fund.loanAmountMax ? (fund.loanAmountMax / 1000000).toFixed(1) + "M" : "—"}</span>
                      )}
                      {fund.allowedStates?.length > 0 && (
                        <span>States: {fund.allowedStates.slice(0, 5).join(", ")}{fund.allowedStates.length > 5 ? ` +${fund.allowedStates.length - 5}` : ""}</span>
                      )}
                      {fund.allowedAssetTypes?.length > 0 && (
                        <span>Assets: {fund.allowedAssetTypes.slice(0, 3).join(", ")}{fund.allowedAssetTypes.length > 3 ? ` +${fund.allowedAssetTypes.length - 3}` : ""}</span>
                      )}
                    </div>
                    {fund.contactEmail && <p className="text-xs text-slate-500 mt-1">Contact: {fund.contactEmail}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setEditingFund(fund); setDialogOpen(true); }}
                      className="text-slate-400 hover:text-white h-8 w-8 p-0"
                      data-testid={`edit-fund-${fund.id}`}
                    ><Pencil size={14} /></Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { if (confirm("Delete this fund?")) deleteMut.mutate(fund.id); }}
                      className="text-slate-400 hover:text-red-400 h-8 w-8 p-0"
                      data-testid={`delete-fund-${fund.id}`}
                    ><Trash2 size={14} /></Button>
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

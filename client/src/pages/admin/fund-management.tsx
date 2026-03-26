import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Building2, RefreshCw, Upload, FileText,
  Search, ArrowLeft, BookOpen, FileUp, ChevronRight, Check, X, Download,
  CheckCircle2, XCircle
} from "lucide-react";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];
const KNOWLEDGE_CATEGORIES = ["general", "rates", "terms", "eligibility", "guidelines", "specialty"];

function FundForm({ fund, onSave, onCancel }: { fund?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    fundName: fund?.fundName || "",
    providerName: fund?.providerName || "",
    website: fund?.website || "",
    contactName: fund?.contactName || "",
    contactEmail: fund?.contactEmail || "",
    contactPhone: fund?.contactPhone || "",
    guidelineUrl: fund?.guidelineUrl || "",
    ltvMin: fund?.ltvMin ?? "",
    ltvMax: fund?.ltvMax ?? "",
    ltcMin: fund?.ltcMin ?? "",
    ltcMax: fund?.ltcMax ?? "",
    loanAmountMin: fund?.loanAmountMin ?? "",
    loanAmountMax: fund?.loanAmountMax ?? "",
    interestRateMin: fund?.interestRateMin ?? "",
    interestRateMax: fund?.interestRateMax ?? "",
    termMin: fund?.termMin ?? "",
    termMax: fund?.termMax ?? "",
    recourseType: fund?.recourseType || "",
    minDscr: fund?.minDscr ?? "",
    minCreditScore: fund?.minCreditScore ?? "",
    prepaymentTerms: fund?.prepaymentTerms || "",
    closingTimeline: fund?.closingTimeline || "",
    originationFeeMin: fund?.originationFeeMin ?? "",
    originationFeeMax: fund?.originationFeeMax ?? "",
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
          <Label className="text-xs text-slate-400">Website</Label>
          <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" placeholder="https://..." data-testid="website-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Contact Name</Label>
          <Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="contact-name-input" />
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
      <div>
        <Label className="text-xs text-slate-400">Guideline URL</Label>
        <Input value={form.guidelineUrl} onChange={e => setForm(f => ({ ...f, guidelineUrl: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" placeholder="Link to guidelines document..." data-testid="guideline-url-input" />
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
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Rate Min %</Label>
          <Input type="number" value={form.interestRateMin} onChange={e => setForm(f => ({ ...f, interestRateMin: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="rate-min-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Rate Max %</Label>
          <Input type="number" value={form.interestRateMax} onChange={e => setForm(f => ({ ...f, interestRateMax: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="rate-max-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Term Min (mo)</Label>
          <Input type="number" value={form.termMin} onChange={e => setForm(f => ({ ...f, termMin: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Term Max (mo)</Label>
          <Input type="number" value={form.termMax} onChange={e => setForm(f => ({ ...f, termMax: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
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
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Recourse Type</Label>
          <Select value={form.recourseType} onValueChange={v => setForm(f => ({ ...f, recourseType: v }))}>
            <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="recourse-type-select">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full Recourse</SelectItem>
              <SelectItem value="non-recourse">Non-Recourse</SelectItem>
              <SelectItem value="partial">Partial Recourse</SelectItem>
              <SelectItem value="varies">Varies</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-400">Min DSCR</Label>
          <Input type="number" step="0.01" value={form.minDscr} onChange={e => setForm(f => ({ ...f, minDscr: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="min-dscr-input" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Min Credit Score</Label>
          <Input type="number" value={form.minCreditScore} onChange={e => setForm(f => ({ ...f, minCreditScore: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="min-credit-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Prepayment Terms</Label>
          <Input value={form.prepaymentTerms} onChange={e => setForm(f => ({ ...f, prepaymentTerms: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Closing Timeline</Label>
          <Input value={form.closingTimeline} onChange={e => setForm(f => ({ ...f, closingTimeline: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Origination Fee Min %</Label>
          <Input type="number" step="0.01" value={form.originationFeeMin} onChange={e => setForm(f => ({ ...f, originationFeeMin: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Origination Fee Max %</Label>
          <Input type="number" step="0.01" value={form.originationFeeMax} onChange={e => setForm(f => ({ ...f, originationFeeMax: e.target.value }))} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
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
            const floats = ["ltvMin","ltvMax","ltcMin","ltcMax","interestRateMin","interestRateMax","minDscr","originationFeeMin","originationFeeMax"];
            const ints = ["loanAmountMin","loanAmountMax","termMin","termMax","minCreditScore"];
            floats.forEach(k => { if (data[k] !== "") data[k] = parseFloat(data[k]); else data[k] = null; });
            ints.forEach(k => { if (data[k] !== "") data[k] = parseInt(data[k]); else data[k] = null; });
            if (!data.recourseType) data.recourseType = null;
            if (!data.prepaymentTerms) data.prepaymentTerms = null;
            if (!data.closingTimeline) data.closingTimeline = null;
            if (!data.website) data.website = null;
            if (!data.contactName) data.contactName = null;
            if (!data.guidelineUrl) data.guidelineUrl = null;
            onSave(data);
          }}
          data-testid="save-fund-button"
        >Save Fund</Button>
      </div>
    </div>
  );
}

function BulkImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "sheet-select" | "preview" | "importing" | "done">("upload");
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [currentPreviewSheet, setCurrentPreviewSheet] = useState<string>("");
  const [allSheetsPreview, setAllSheetsPreview] = useState<Record<string, any>>({});
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState("skip");
  const [importResult, setImportResult] = useState<any>(null);

  const previewMut = useMutation({
    mutationFn: async ({ file, sheetName }: { file: File; sheetName?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (sheetName) formData.append("sheetName", sheetName);
      const resp = await fetch("/api/commercial/funds/bulk-preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) throw new Error((await resp.json()).error || "Preview failed");
      return resp.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      if (data.sheetNames?.length > 1 && step === "upload") {
        setSheetNames(data.sheetNames);
        setSelectedSheets([data.selectedSheet || data.sheetNames[0]]);
        setStep("sheet-select");
      } else if (step === "sheet-select") {
        setAllSheetsPreview(prev => ({ ...prev, [data.selectedSheet]: data }));
        setStep("preview");
      } else {
        setStep("preview");
      }
    },
    onError: (err: any) => toast({ title: "Failed to parse file", description: err.message, variant: "destructive" }),
  });

  const importMut = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file");
      const sheetsToImport = selectedSheets.length > 0 ? selectedSheets : [currentPreviewSheet || ""];
      const aggregated = { created: 0, updated: 0, skipped: 0, failed: 0, knowledgeCreated: 0, sheetResults: [] as any[] };
      for (const sheet of sheetsToImport) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("duplicateAction", duplicateAction);
        if (sheet) formData.append("sheetName", sheet);
        const resp = await fetch("/api/commercial/funds/bulk-import", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!resp.ok) throw new Error((await resp.json()).error || `Import failed for sheet "${sheet}"`);
        const result = await resp.json();
        aggregated.created += result.created || 0;
        aggregated.updated += result.updated || 0;
        aggregated.skipped += result.skipped || 0;
        aggregated.failed += result.failed || 0;
        aggregated.knowledgeCreated += result.knowledgeCreated || 0;
        aggregated.sheetResults.push({ sheet, ...result });
      }
      return aggregated;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds"] });
    },
    onError: (err: any) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const reset = () => {
    setStep("upload");
    setPreviewData(null);
    setSelectedFile(null);
    setSheetNames([]);
    setSelectedSheets([]);
    setCurrentPreviewSheet("");
    setAllSheetsPreview({});
    setLoadingSheets(false);
    setImportResult(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    previewMut.mutate({ file });
  };

  const handleSheetConfirm = async () => {
    if (!selectedFile || selectedSheets.length === 0) return;
    setLoadingSheets(true);
    setCurrentPreviewSheet(selectedSheets[0]);
    const previews: Record<string, any> = {};
    for (const sheet of selectedSheets) {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("sheetName", sheet);
      try {
        const resp = await fetch("/api/commercial/funds/bulk-preview", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (resp.ok) {
          previews[sheet] = await resp.json();
        }
      } catch {}
    }
    setAllSheetsPreview(previews);
    setPreviewData(previews[selectedSheets[0]] || null);
    setLoadingSheets(false);
    setStep("preview");
  };

  const formatMoney = (val: number | null) => {
    if (!val) return "—";
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val}`;
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="bg-[#1a2038] border-slate-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={18} />
            Import Funds from Excel/CSV
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="bulk-upload-dropzone"
            >
              <FileUp size={40} className="mx-auto text-slate-500 mb-3" />
              <p className="text-sm text-slate-400">Click to select an Excel (.xlsx, .xls) or CSV file</p>
              <p className="text-xs text-slate-500 mt-1">Supports loan amount ranges (e.g. "1-10MM"), property types, and auto-creates knowledge entries</p>
              {previewMut.isPending && <RefreshCw size={16} className="animate-spin mx-auto mt-3 text-blue-400" />}
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} data-testid="bulk-file-input" />
          </div>
        )}

        {step === "sheet-select" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">This file has multiple sheets. Select which sheets to import:</p>
            <div className="space-y-2">
              {sheetNames.map(name => {
                const isSelected = selectedSheets.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedSheets(prev => isSelected ? prev.filter(s => s !== name) : [...prev, name])}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-center gap-3 ${
                      isSelected
                        ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                        : "bg-[#0f1629] border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                    data-testid={`sheet-option-${name.replace(/\s/g, "-").toLowerCase()}`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "bg-blue-500 border-blue-500" : "border-slate-500"
                    }`}>
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <span className="font-medium">{name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setSelectedSheets(selectedSheets.length === sheetNames.length ? [] : [...sheetNames])}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                data-testid="select-all-sheets"
              >
                {selectedSheets.length === sheetNames.length ? "Deselect All" : "Select All"}
              </button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset} data-testid="bulk-back-button">Back</Button>
                <Button size="sm" onClick={handleSheetConfirm} disabled={selectedSheets.length === 0 || loadingSheets} data-testid="sheet-confirm-button">
                  {loadingSheets ? <><RefreshCw size={14} className="animate-spin mr-1" /> Loading...</> : `Continue (${selectedSheets.length} sheet${selectedSheets.length !== 1 ? "s" : ""})`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "preview" && previewData && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {selectedSheets.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                {selectedSheets.map(sheet => (
                  <button
                    key={sheet}
                    onClick={() => { setCurrentPreviewSheet(sheet); setPreviewData(allSheetsPreview[sheet]); }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      currentPreviewSheet === sheet
                        ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                        : "bg-[#0f1629] border-slate-700 text-slate-400 hover:text-slate-300"
                    }`}
                    data-testid={`preview-sheet-tab-${sheet.replace(/\s/g, "-").toLowerCase()}`}
                  >
                    {sheet}
                    {allSheetsPreview[sheet] && <span className="ml-1 text-slate-500">({allSheetsPreview[sheet].validRows})</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedSheets.length === 1 && previewData.sheetNames?.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <FileText size={12} />
                Sheet: <span className="text-blue-400 font-medium">{previewData.selectedSheet}</span>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-2xl font-semibold text-white" data-testid="stat-total">{previewData.totalRows}</p>
                <p className="text-xs text-slate-400">Total Rows</p>
              </div>
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-2xl font-semibold text-emerald-400" data-testid="stat-valid">{previewData.validRows}</p>
                <p className="text-xs text-slate-400">Valid</p>
              </div>
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-2xl font-semibold text-amber-400" data-testid="stat-duplicates">{previewData.duplicates?.length || 0}</p>
                <p className="text-xs text-slate-400">Duplicates</p>
              </div>
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-2xl font-semibold text-purple-400" data-testid="stat-knowledge">{previewData.totalKnowledgeEntries || 0}</p>
                <p className="text-xs text-slate-400">Knowledge Entries</p>
              </div>
            </div>

            {previewData.columnMapping?.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Column Mapping</p>
                <div className="flex flex-wrap gap-1.5">
                  {previewData.columnMapping.map((m: any, i: number) => (
                    <Badge key={i} className="bg-blue-500/20 text-blue-400 text-[10px]">
                      {m.column} → {m.mappedTo}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {previewData.unmappedColumns?.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Unmapped Columns (will be skipped)</p>
                <div className="flex flex-wrap gap-1.5">
                  {previewData.unmappedColumns.map((c: string, i: number) => (
                    <Badge key={i} className="bg-slate-500/20 text-slate-400 text-[10px]">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {previewData.errors?.length > 0 && (
              <div>
                <p className="text-xs text-red-400 mb-1">Errors ({previewData.errors.length})</p>
                {previewData.errors.slice(0, 5).map((e: any, i: number) => (
                  <p key={i} className="text-xs text-red-300">Row {e.row}: {e.message}</p>
                ))}
              </div>
            )}

            {previewData.duplicates?.length > 0 && (
              <div>
                <p className="text-xs text-amber-400 mb-2">Handle Duplicates</p>
                <Select value={duplicateAction} onValueChange={setDuplicateAction}>
                  <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm w-48" data-testid="duplicate-action-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip duplicates</SelectItem>
                    <SelectItem value="update">Update existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {previewData.preview?.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Preview (first {Math.min(previewData.preview.length, 10)} rows)</p>
                <div className="bg-[#0f1629] rounded p-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {previewData.preview.slice(0, 10).map((r: any, i: number) => (
                    <div key={i} className="text-xs text-slate-300 flex flex-wrap gap-x-2 gap-y-0.5 items-center border-b border-slate-800 pb-1.5 last:border-0">
                      <span className="text-slate-500 w-6">#{r.rowNumber}</span>
                      <span className="font-medium text-white">{r.data.fundName}</span>
                      {r.data.website && <span className="text-blue-400 truncate max-w-[150px]">{r.data.website}</span>}
                      {r.data.contactName && <span className="text-slate-400">{r.data.contactName}</span>}
                      {r.data._parsedRange && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">
                          {formatMoney(r.data._parsedRange.min)} – {formatMoney(r.data._parsedRange.max)}
                        </Badge>
                      )}
                      {r.data.allowedStates?.length === 50 && (
                        <Badge className="bg-violet-500/15 text-violet-400 text-[10px]">Nationwide</Badge>
                      )}
                      {r.data.allowedAssetTypes?.length > 0 && (
                        <Badge className="bg-orange-500/15 text-orange-400 text-[10px]">{r.data.allowedAssetTypes.join(", ")}</Badge>
                      )}
                      {r.knowledgeCount > 0 && (
                        <Badge className="bg-purple-500/15 text-purple-400 text-[10px]">{r.knowledgeCount} knowledge</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset} data-testid="bulk-back-button">Back</Button>
                {previewData.sheetNames?.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => setStep("sheet-select")} data-testid="change-sheet-button">Change Sheets</Button>
                )}
              </div>
              <Button size="sm" onClick={() => { setStep("importing"); importMut.mutate(); }} disabled={importMut.isPending} data-testid="bulk-confirm-button">
                {importMut.isPending ? <><RefreshCw size={14} className="animate-spin mr-1" /> Importing...</> : (() => {
                  const totalValid = selectedSheets.length > 1
                    ? selectedSheets.reduce((sum, s) => sum + (allSheetsPreview[s]?.validRows || 0), 0)
                    : previewData.validRows;
                  return `Import ${totalValid} Funds${selectedSheets.length > 1 ? ` (${selectedSheets.length} sheets)` : ""}`;
                })()}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-12 text-center">
            <RefreshCw size={32} className="animate-spin mx-auto text-blue-400 mb-4" />
            <p className="text-sm text-slate-400">Importing funds and creating knowledge entries...</p>
          </div>
        )}

        {step === "done" && importResult && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <Check size={40} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-lg font-medium text-white">Import Complete</p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-xl font-semibold text-emerald-400" data-testid="result-created">{importResult.created}</p>
                <p className="text-xs text-slate-400">Created</p>
              </div>
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-xl font-semibold text-blue-400" data-testid="result-updated">{importResult.updated}</p>
                <p className="text-xs text-slate-400">Updated</p>
              </div>
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-xl font-semibold text-slate-400" data-testid="result-skipped">{importResult.skipped}</p>
                <p className="text-xs text-slate-400">Skipped</p>
              </div>
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-xl font-semibold text-red-400" data-testid="result-failed">{importResult.failed}</p>
                <p className="text-xs text-slate-400">Failed</p>
              </div>
              <div className="bg-[#0f1629] rounded p-3 text-center">
                <p className="text-xl font-semibold text-purple-400" data-testid="result-knowledge">{importResult.knowledgeCreated || 0}</p>
                <p className="text-xs text-slate-400">Knowledge</p>
              </div>
            </div>
            {importResult.sheetResults?.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs text-slate-400 font-medium">Per-sheet breakdown:</p>
                {importResult.sheetResults.map((sr: any) => (
                  <div key={sr.sheet} className="flex items-center justify-between text-xs bg-[#0f1629] rounded px-3 py-2">
                    <span className="text-slate-300 font-medium">{sr.sheet}</span>
                    <span className="text-slate-400">
                      {sr.created > 0 && <span className="text-emerald-400 mr-2">{sr.created} created</span>}
                      {sr.updated > 0 && <span className="text-blue-400 mr-2">{sr.updated} updated</span>}
                      {sr.skipped > 0 && <span className="text-slate-400 mr-2">{sr.skipped} skipped</span>}
                      {sr.failed > 0 && <span className="text-red-400 mr-2">{sr.failed} failed</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onOpenChange(false)} data-testid="bulk-done-button">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FundDetailView({ fundId, onBack }: { fundId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const docInputRef = useRef<HTMLInputElement>(null);

  const { data: fund, isLoading } = useQuery<any>({
    queryKey: ["/api/commercial/funds", fundId],
  });

  const { data: knowledgeEntries = [] } = useQuery<any[]>({
    queryKey: ["/api/commercial/funds", fundId, "knowledge"],
  });

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ["/api/commercial/funds", fundId, "documents"],
  });

  const updateFundMut = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/commercial/funds/${fundId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds"] });
      setEditMode(false);
      toast({ title: "Fund updated" });
    },
  });

  const addNoteMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/commercial/funds/${fundId}/knowledge`, { content: noteContent, category: noteCategory }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds", fundId, "knowledge"] });
      setNoteContent("");
      toast({ title: "Note added" });
    },
  });

  const deleteKnowledgeMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/commercial/funds/knowledge/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds", fundId, "knowledge"] });
      toast({ title: "Entry removed" });
    },
  });

  const uploadDocMut = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(`/api/commercial/funds/${fundId}/documents`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Upload failed");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds", fundId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds", fundId, "knowledge"] });
      toast({ title: "Document uploaded — extraction started" });
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  const deleteDocMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/commercial/funds/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds", fundId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds", fundId, "knowledge"] });
      toast({ title: "Document removed" });
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;
  if (!fund) return <div className="text-slate-400 text-center py-12">Fund not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-white" data-testid="fund-detail-back">
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-white" data-testid="fund-detail-name">{fund.fundName}</h2>
          {fund.providerName && <p className="text-sm text-slate-400">{fund.providerName}</p>}
        </div>
        <Badge className={`${fund.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
          {fund.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="bg-[#0f1629] border border-slate-700">
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">
            Documents
            {documents.length > 0 && <Badge className="ml-1.5 bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0">{documents.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">
            Knowledge
            {knowledgeEntries.length > 0 && <Badge className="ml-1.5 bg-purple-500/20 text-purple-400 text-[10px] px-1.5 py-0">{knowledgeEntries.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {editMode ? (
            <Card className="bg-[#1a2038] border-slate-700/50">
              <CardContent className="p-4">
                <FundForm
                  fund={fund}
                  onCancel={() => setEditMode(false)}
                  onSave={(data) => updateFundMut.mutate(data)}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-[#1a2038] border-slate-700/50">
              <CardContent className="p-4">
                <div className="flex justify-end mb-3">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(true)} data-testid="edit-fund-detail">
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <DetailRow label="Fund Name" value={fund.fundName} />
                  <DetailRow label="Provider" value={fund.providerName} />
                  <DetailRow label="Contact Email" value={fund.contactEmail} />
                  <DetailRow label="Contact Phone" value={fund.contactPhone} />
                  <DetailRow label="LTV Range" value={fund.ltvMin || fund.ltvMax ? `${fund.ltvMin ?? "—"}% – ${fund.ltvMax ?? "—"}%` : null} />
                  <DetailRow label="LTC Range" value={fund.ltcMin || fund.ltcMax ? `${fund.ltcMin ?? "—"}% – ${fund.ltcMax ?? "—"}%` : null} />
                  <DetailRow label="Interest Rate" value={fund.interestRateMin || fund.interestRateMax ? `${fund.interestRateMin ?? "—"}% – ${fund.interestRateMax ?? "—"}%` : null} />
                  <DetailRow label="Term" value={fund.termMin || fund.termMax ? `${fund.termMin ?? "—"} – ${fund.termMax ?? "—"} months` : null} />
                  <DetailRow label="Loan Amount" value={fund.loanAmountMin || fund.loanAmountMax ? `$${fmtAmt(fund.loanAmountMin)} – $${fmtAmt(fund.loanAmountMax)}` : null} />
                  <DetailRow label="Recourse Type" value={fund.recourseType} />
                  <DetailRow label="Min DSCR" value={fund.minDscr ? `${fund.minDscr}x` : null} />
                  <DetailRow label="Min Credit Score" value={fund.minCreditScore} />
                  <DetailRow label="Prepayment Terms" value={fund.prepaymentTerms} />
                  <DetailRow label="Closing Timeline" value={fund.closingTimeline} />
                  <DetailRow label="Origination Fee" value={fund.originationFeeMin || fund.originationFeeMax ? `${fund.originationFeeMin ?? "—"}% – ${fund.originationFeeMax ?? "—"}%` : null} />
                </div>
                {fund.allowedStates?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-500 mb-1">Allowed States</p>
                    <div className="flex flex-wrap gap-1">
                      {fund.allowedStates.map((s: string) => <Badge key={s} className="bg-blue-500/10 text-blue-400 text-[10px]">{s}</Badge>)}
                    </div>
                  </div>
                )}
                {fund.allowedAssetTypes?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-1">Asset Types</p>
                    <div className="flex flex-wrap gap-1">
                      {fund.allowedAssetTypes.map((t: string) => <Badge key={t} className="bg-emerald-500/10 text-emerald-400 text-[10px]">{t}</Badge>)}
                    </div>
                  </div>
                )}
                {fund.fundDescription && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-500 mb-1">Description</p>
                    <p className="text-sm text-slate-300">{fund.fundDescription}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card className="bg-[#0f1629]/50 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 shrink-0 mt-0.5">
                  <Upload size={18} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Upload Fund Documents</p>
                  <p className="text-xs text-slate-400 mt-0.5">Upload term sheets, rate sheets, guidelines, or any fund documentation. Our AI will automatically extract key details like rates, terms, eligibility criteria, and other relevant information into the Knowledge tab.</p>
                  <div className="flex items-center gap-3 mt-3">
                    <Button size="sm" onClick={() => docInputRef.current?.click()} disabled={uploadDocMut.isPending} data-testid="upload-fund-doc">
                      {uploadDocMut.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : <FileUp size={14} className="mr-1" />}
                      {uploadDocMut.isPending ? "Uploading..." : "Choose File"}
                    </Button>
                    <span className="text-[10px] text-slate-500">PDF, DOC, DOCX, TXT, XLS, XLSX</span>
                  </div>
                </div>
              </div>
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocMut.mutate(f); e.target.value = ""; }}
                data-testid="fund-doc-file-input"
              />
            </CardContent>
          </Card>

          {documents.length === 0 ? (
            <Card className="bg-[#1a2038] border-slate-700/50">
              <CardContent className="p-10 text-center">
                <FileText size={36} className="mx-auto text-slate-600 mb-3" />
                <p className="text-sm text-slate-400 font-medium">No documents uploaded yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Upload your first document above and our AI will automatically analyze it to build this fund's knowledge base.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <Card key={doc.id} className={`border-slate-700/50 ${
                  doc.extractionStatus === "processing" ? "bg-[#1a2038] border-blue-500/20" : "bg-[#1a2038]"
                }`} data-testid={`fund-doc-${doc.id}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`p-1.5 rounded ${
                      doc.extractionStatus === "completed" ? "bg-emerald-500/10" :
                      doc.extractionStatus === "processing" ? "bg-blue-500/10" :
                      doc.extractionStatus === "failed" ? "bg-red-500/10" :
                      "bg-slate-500/10"
                    }`}>
                      <FileText size={16} className={
                        doc.extractionStatus === "completed" ? "text-emerald-400" :
                        doc.extractionStatus === "processing" ? "text-blue-400" :
                        doc.extractionStatus === "failed" ? "text-red-400" :
                        "text-slate-500"
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">{doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ""}</span>
                        <Badge className={`text-[10px] px-2 py-0.5 ${
                          doc.extractionStatus === "completed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                          doc.extractionStatus === "processing" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                          doc.extractionStatus === "failed" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          "bg-slate-500/20 text-slate-400 border-slate-500/30"
                        }`}>
                          {doc.extractionStatus === "processing" && <RefreshCw size={10} className="animate-spin mr-1 inline" />}
                          {doc.extractionStatus === "completed" && <CheckCircle2 size={10} className="mr-1 inline" />}
                          {doc.extractionStatus === "failed" && <XCircle size={10} className="mr-1 inline" />}
                          {doc.extractionStatus === "completed" ? "AI Reviewed" :
                           doc.extractionStatus === "processing" ? "AI Reviewing..." :
                           doc.extractionStatus === "failed" ? "Review Failed" :
                           doc.extractionStatus || "Pending"}
                        </Badge>
                        {doc.extractionStatus === "completed" && (
                          <span className="text-[10px] text-slate-500">Knowledge extracted</span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Delete this document and its extracted knowledge?")) deleteDocMut.mutate(doc.id); }} className="text-slate-400 hover:text-red-400 h-8 w-8 p-0" data-testid={`delete-doc-${doc.id}`}>
                      <Trash2 size={14} />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4 space-y-4">
          <Card className="bg-[#1a2038] border-slate-700/50">
            <CardContent className="p-3 space-y-2">
              <p className="text-xs text-slate-400">Add Knowledge Note</p>
              <div className="flex gap-2">
                <Select value={noteCategory} onValueChange={setNoteCategory}>
                  <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm w-32" data-testid="note-category-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWLEDGE_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="Enter knowledge note..."
                  className="bg-[#0f1629] border-slate-700 text-white text-sm flex-1"
                  data-testid="knowledge-note-input"
                />
                <Button size="sm" disabled={!noteContent.trim() || addNoteMut.isPending} onClick={() => addNoteMut.mutate()} data-testid="add-note-button">
                  <Plus size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {knowledgeEntries.length === 0 ? (
            <Card className="bg-[#1a2038] border-slate-700/50">
              <CardContent className="p-8 text-center">
                <BookOpen size={32} className="mx-auto text-slate-500 mb-2" />
                <p className="text-sm text-slate-400">No knowledge entries yet</p>
                <p className="text-xs text-slate-500 mt-1">Add notes manually or upload documents to auto-extract knowledge</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {knowledgeEntries.map((entry: any) => (
                <Card key={entry.id} className="bg-[#1a2038] border-slate-700/50" data-testid={`knowledge-entry-${entry.id}`}>
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-blue-500/10 text-blue-400 text-[10px]">{entry.category}</Badge>
                        <Badge className={`text-[10px] ${entry.sourceType === "manual" ? "bg-slate-500/20 text-slate-400" : "bg-purple-500/20 text-purple-400"}`}>
                          {entry.sourceType === "manual" ? "Manual" : "Extracted"}
                        </Badge>
                        {entry.sourceDocumentName && <span className="text-[10px] text-slate-500 truncate">{entry.sourceDocumentName}</span>}
                      </div>
                      <p className="text-sm text-slate-300">{entry.content}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteKnowledgeMut.mutate(entry.id)} className="text-slate-400 hover:text-red-400 h-8 w-8 p-0 shrink-0" data-testid={`delete-knowledge-${entry.id}`}>
                      <Trash2 size={14} />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}

function fmtAmt(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toLocaleString();
}

export function FundManagementContent() {
  const { toast } = useToast();
  const [editingFund, setEditingFund] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const { data: fundsList = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/commercial/funds"] });

  const filteredFunds = fundsList.filter(fund => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!fund.fundName.toLowerCase().includes(q) && !(fund.providerName || "").toLowerCase().includes(q)) return false;
    }
    if (filterActive === "active" && !fund.isActive) return false;
    if (filterActive === "inactive" && fund.isActive) return false;
    return true;
  });

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

  if (selectedFundId) {
    return (
      <div className="p-6" data-testid="fund-detail-page">
        <FundDetailView fundId={selectedFundId} onBack={() => setSelectedFundId(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="fund-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Fund Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            {fundsList.length} fund{fundsList.length !== 1 ? "s" : ""} configured
            {filteredFunds.length !== fundsList.length && ` · ${filteredFunds.length} shown`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} data-testid="import-funds-button">
            <Upload size={14} className="mr-1" /> Import
          </Button>
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
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search funds..."
            className="bg-[#1a2038] border-slate-700 text-white text-sm pl-9"
            data-testid="search-funds-input"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map(f => (
            <Button
              key={f}
              variant={filterActive === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterActive(f)}
              className="text-xs capitalize"
              data-testid={`filter-${f}`}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
      ) : filteredFunds.length === 0 ? (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-12 text-center">
            <Building2 size={40} className="mx-auto text-slate-500 mb-3" />
            <p className="text-slate-400">
              {fundsList.length === 0
                ? "No funds configured yet. Add your first fund or import from Excel."
                : "No funds match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredFunds.map((fund: any) => (
            <Card
              key={fund.id}
              className="bg-[#1a2038] border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors"
              onClick={() => setSelectedFundId(fund.id)}
              data-testid={`fund-card-${fund.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white" data-testid={`fund-name-${fund.id}`}>{fund.fundName}</h3>
                      <Badge className={`text-[10px] ${fund.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
                        {fund.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {fund.providerName && <p className="text-xs text-slate-400 mb-1">{fund.providerName}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                      {(fund.ltvMin != null || fund.ltvMax != null) && (
                        <span>LTV: {fund.ltvMin ?? "—"}-{fund.ltvMax ?? "—"}%</span>
                      )}
                      {(fund.interestRateMin != null || fund.interestRateMax != null) && (
                        <span>Rate: {fund.interestRateMin ?? "—"}-{fund.interestRateMax ?? "—"}%</span>
                      )}
                      {(fund.loanAmountMin != null || fund.loanAmountMax != null) && (
                        <span>${fmtAmt(fund.loanAmountMin)} - ${fmtAmt(fund.loanAmountMax)}</span>
                      )}
                      {fund.allowedStates?.length > 0 && (
                        <span>States: {fund.allowedStates.slice(0, 5).join(", ")}{fund.allowedStates.length > 5 ? ` +${fund.allowedStates.length - 5}` : ""}</span>
                      )}
                      {fund.allowedAssetTypes?.length > 0 && (
                        <span>Assets: {fund.allowedAssetTypes.slice(0, 3).join(", ")}{fund.allowedAssetTypes.length > 3 ? ` +${fund.allowedAssetTypes.length - 3}` : ""}</span>
                      )}
                      {fund.minDscr && <span>Min DSCR: {fund.minDscr}x</span>}
                      {fund.recourseType && <span>Recourse: {fund.recourseType}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="sm"
                      onClick={(e) => { e.stopPropagation(); setEditingFund(fund); setDialogOpen(true); }}
                      className="text-slate-400 hover:text-white h-8 w-8 p-0"
                      data-testid={`edit-fund-${fund.id}`}
                    ><Pencil size={14} /></Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={(e) => { e.stopPropagation(); if (confirm("Delete this fund?")) deleteMut.mutate(fund.id); }}
                      className="text-slate-400 hover:text-red-400 h-8 w-8 p-0"
                      data-testid={`delete-fund-${fund.id}`}
                    ><Trash2 size={14} /></Button>
                    <ChevronRight size={16} className="text-slate-600 ml-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BulkImportDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} />
    </div>
  );
}

export default function FundManagementPage() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/admin/commercial-pipeline?tab=funds", { replace: true });
  }, [navigate]);
  return null;
}

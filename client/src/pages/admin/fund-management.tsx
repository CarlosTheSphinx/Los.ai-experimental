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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import {
  Plus, Pencil, Trash2, Building2, RefreshCw, Upload, FileText,
  Search, ArrowLeft, BookOpen, FileUp, ChevronRight, Check, X, Download,
  CheckCircle2, XCircle, ToggleLeft, ToggleRight
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ExpandableRow } from "@/components/ui/phase1/expandable-row";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
import { STANDARD_LOAN_TYPES, STANDARD_PROPERTY_TYPES } from "@shared/loanConstants";
const ASSET_TYPES = STANDARD_PROPERTY_TYPES.map(t => t.value);
const LOAN_TYPES = STANDARD_LOAN_TYPES.map(t => t.value);
const KNOWLEDGE_CATEGORIES = ["general", "rates", "terms", "eligibility", "guidelines", "specialty"];

const FUND_FIELD_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: "_skip", label: "— Skip —", group: "Actions" },
  { value: "fundName", label: "Fund Name", group: "Basic" },
  { value: "providerName", label: "Provider Name", group: "Basic" },
  { value: "website", label: "Website", group: "Basic" },
  { value: "contactName", label: "Contact Name", group: "Contact" },
  { value: "contactEmail", label: "Contact Email", group: "Contact" },
  { value: "contactPhone", label: "Contact Phone", group: "Contact" },
  { value: "guidelineUrl", label: "Guideline URL", group: "Contact" },
  { value: "fundDescription", label: "Description / Notes", group: "Details" },
  { value: "_specialty", label: "Specialty (→ Knowledge)", group: "Details" },
  { value: "_loanAmountRange", label: "Loan Amount Range (auto-parse)", group: "Financials" },
  { value: "loanAmountMin", label: "Loan Amount Min", group: "Financials" },
  { value: "loanAmountMax", label: "Loan Amount Max", group: "Financials" },
  { value: "ltvMin", label: "LTV Min %", group: "Financials" },
  { value: "ltvMax", label: "LTV Max %", group: "Financials" },
  { value: "ltcMin", label: "LTC Min %", group: "Financials" },
  { value: "ltcMax", label: "LTC Max %", group: "Financials" },
  { value: "interestRateMin", label: "Interest Rate Min", group: "Financials" },
  { value: "interestRateMax", label: "Interest Rate Max", group: "Financials" },
  { value: "termMin", label: "Term Min (months)", group: "Financials" },
  { value: "termMax", label: "Term Max (months)", group: "Financials" },
  { value: "recourseType", label: "Recourse Type", group: "Terms" },
  { value: "minDscr", label: "Min DSCR", group: "Terms" },
  { value: "minCreditScore", label: "Min Credit Score", group: "Terms" },
  { value: "prepaymentTerms", label: "Prepayment Terms", group: "Terms" },
  { value: "closingTimeline", label: "Closing Timeline", group: "Terms" },
  { value: "originationFeeMin", label: "Origination Fee Min", group: "Terms" },
  { value: "originationFeeMax", label: "Origination Fee Max", group: "Terms" },
  { value: "allowedStates", label: "States / Region", group: "Criteria" },
  { value: "allowedAssetTypes", label: "Property / Asset Types", group: "Criteria" },
  { value: "loanStrategy", label: "Loan Strategy (Bridge/Permanent/Both)", group: "Criteria" },
  { value: "loanTypes", label: "Loan Types", group: "Criteria" },
  { value: "isActive", label: "Active Status", group: "Other" },
];

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
    loanStrategy: fund?.loanStrategy || "",
    loanTypes: (fund?.loanTypes || []) as string[],
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

  const toggleLoanType = (type: string) => {
    setForm(f => ({
      ...f,
      loanTypes: f.loanTypes.includes(type)
        ? f.loanTypes.filter((t: string) => t !== type)
        : [...f.loanTypes, type],
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
        <Label className="text-xs text-slate-400 mb-2 block">Loan Types</Label>
        <div className="flex flex-wrap gap-2">
          {LOAN_TYPES.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => toggleLoanType(type)}
              className={`px-3 py-1 rounded text-xs border transition-colors ${
                form.loanTypes.includes(type)
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  : "bg-[#0f1629] text-slate-500 border-slate-700 hover:border-slate-500"
              }`}
              data-testid={`loan-type-${type.toLowerCase().replace(/[\s&]/g, "-")}`}
            >{type}</button>
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
  const [columnMappings, setColumnMappings] = useState<Record<string, Record<number, string>>>({});
  const [showMappingEditor, setShowMappingEditor] = useState(false);
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
      } else {
        const sheetKey = data.selectedSheet || "_default";
        setCurrentPreviewSheet(sheetKey);
        setSelectedSheets([sheetKey]);
        setAllSheetsPreview(prev => ({ ...prev, [sheetKey]: data }));
        if (data.headers) {
          const mapping: Record<number, string> = {};
          data.headers.forEach((h: any) => {
            mapping[h.index] = h.autoMapped || "_skip";
          });
          setColumnMappings(prev => ({ ...prev, [sheetKey]: mapping }));
        }
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
        const sheetMapping = columnMappings[sheet];
        if (sheetMapping) formData.append("customMapping", JSON.stringify(sheetMapping));
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
    setColumnMappings({});
    setShowMappingEditor(false);
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
    const mappings: Record<string, Record<number, string>> = {};
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
          const data = await resp.json();
          previews[sheet] = data;
          const mapping: Record<number, string> = {};
          if (data.headers) {
            data.headers.forEach((h: any) => {
              mapping[h.index] = h.autoMapped || "_skip";
            });
          }
          mappings[sheet] = mapping;
        }
      } catch {}
    }
    setAllSheetsPreview(previews);
    setColumnMappings(mappings);
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

            {previewData.headers?.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400">Column Mapping</p>
                  <button
                    onClick={() => setShowMappingEditor(!showMappingEditor)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                    data-testid="toggle-mapping-editor"
                  >
                    <Pencil size={10} />
                    {showMappingEditor ? "Hide Editor" : "Edit Mapping"}
                  </button>
                </div>
                {!showMappingEditor ? (
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.headers.map((h: any) => {
                      const currentMapping = columnMappings[currentPreviewSheet]?.[h.index];
                      const field = FUND_FIELD_OPTIONS.find(f => f.value === currentMapping);
                      const isSkipped = !currentMapping || currentMapping === "_skip";
                      return (
                        <Badge key={h.index} className={isSkipped ? "bg-slate-500/20 text-slate-500 text-[10px]" : "bg-blue-500/20 text-blue-400 text-[10px]"}>
                          {h.name} → {isSkipped ? "skip" : field?.label || currentMapping}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-[#0f1629] rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                    {previewData.headers.map((h: any) => {
                      const currentMapping = columnMappings[currentPreviewSheet]?.[h.index] || "_skip";
                      return (
                        <div key={h.index} className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 font-medium w-36 truncate flex-shrink-0" title={h.name}>{h.name}</span>
                          <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />
                          <Select
                            value={currentMapping}
                            onValueChange={(val) => {
                              setColumnMappings(prev => ({
                                ...prev,
                                [currentPreviewSheet]: { ...prev[currentPreviewSheet], [h.index]: val }
                              }));
                            }}
                          >
                            <SelectTrigger className="bg-[#1a2038] border-slate-700 text-white text-xs h-8 flex-1" data-testid={`mapping-select-${h.index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {(() => {
                                const groups = [...new Set(FUND_FIELD_OPTIONS.map(f => f.group))];
                                return groups.map(group => (
                                  <div key={group}>
                                    <div className="px-2 py-1 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{group}</div>
                                    {FUND_FIELD_OPTIONS.filter(f => f.group === group).map(f => (
                                      <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                                    ))}
                                  </div>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                          {currentMapping !== "_skip" && currentMapping !== h.autoMapped && (
                            <Badge className="bg-amber-500/20 text-amber-400 text-[9px] flex-shrink-0">edited</Badge>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex justify-between pt-2 border-t border-slate-800">
                      <button
                        onClick={() => {
                          const mapping: Record<number, string> = {};
                          previewData.headers.forEach((h: any) => { mapping[h.index] = h.autoMapped || "_skip"; });
                          setColumnMappings(prev => ({ ...prev, [currentPreviewSheet]: mapping }));
                        }}
                        className="text-xs text-slate-400 hover:text-slate-300"
                        data-testid="reset-mapping"
                      >
                        Reset to Auto-Detect
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={async () => {
                          if (!selectedFile) return;
                          const formData = new FormData();
                          formData.append("file", selectedFile);
                          formData.append("sheetName", currentPreviewSheet);
                          formData.append("customMapping", JSON.stringify(columnMappings[currentPreviewSheet]));
                          try {
                            const resp = await fetch("/api/commercial/funds/bulk-preview", { method: "POST", body: formData, credentials: "include" });
                            if (resp.ok) {
                              const data = await resp.json();
                              setPreviewData(data);
                              setAllSheetsPreview(prev => ({ ...prev, [currentPreviewSheet]: data }));
                              toast({ title: "Preview updated with new mapping" });
                            }
                          } catch {}
                        }}
                        data-testid="apply-mapping"
                      >
                        <RefreshCw size={12} className="mr-1" /> Re-Preview
                      </Button>
                    </div>
                  </div>
                )}
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

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-muted-foreground" /></div>;
  if (!fund) return <div className="text-muted-foreground text-center py-12">Fund not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground" data-testid="fund-detail-back">
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold" data-testid="fund-detail-name">{fund.fundName}</h2>
          {fund.providerName && <p className="text-sm text-muted-foreground">{fund.providerName}</p>}
        </div>
        <Badge className={`text-[11px] ${fund.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`} variant="outline">
          {fund.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">
            Documents
            {documents.length > 0 && <Badge className="ml-1.5 bg-blue-50 text-blue-600 border-blue-200 text-[10px] px-1.5 py-0" variant="outline">{documents.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="knowledge" data-testid="tab-knowledge">
            Knowledge
            {knowledgeEntries.length > 0 && <Badge className="ml-1.5 bg-purple-50 text-purple-600 border-purple-200 text-[10px] px-1.5 py-0" variant="outline">{knowledgeEntries.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {editMode ? (
            <Card>
              <CardContent className="p-4">
                <FundForm
                  fund={fund}
                  onCancel={() => setEditMode(false)}
                  onSave={(data) => updateFundMut.mutate(data)}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-end mb-3">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(true)} data-testid="edit-fund-detail">
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <DetailRow label="Lender" value={fund.fundName} />
                  <DetailRow label="Provider" value={fund.providerName} />
                  <DetailRow label="Website" value={fund.website ? <a href={fund.website.startsWith("http") ? fund.website : `https://${fund.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{fund.website}</a> : null} />
                  <DetailRow label="Contact Name" value={fund.contactName} />
                  <DetailRow label="Email" value={fund.contactEmail} />
                  <DetailRow label="Phone" value={fund.contactPhone} />
                  <DetailRow label="Guideline URL" value={fund.guidelineUrl ? <a href={fund.guidelineUrl.startsWith("http") ? fund.guidelineUrl : `https://${fund.guidelineUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-xs">{fund.guidelineUrl}</a> : null} />
                  <DetailRow label="Loan Amounts" value={fund.loanAmountMin != null || fund.loanAmountMax != null ? `$${fmtAmt(fund.loanAmountMin)} – $${fmtAmt(fund.loanAmountMax)}` : null} />
                  <DetailRow label="LTV Range" value={fund.ltvMin != null || fund.ltvMax != null ? `${fund.ltvMin ?? "—"}% – ${fund.ltvMax ?? "—"}%` : null} />
                  <DetailRow label="LTC Range" value={fund.ltcMin != null || fund.ltcMax != null ? `${fund.ltcMin ?? "—"}% – ${fund.ltcMax ?? "—"}%` : null} />
                  <DetailRow label="Interest Rate" value={fund.interestRateMin != null || fund.interestRateMax != null ? `${fund.interestRateMin ?? "—"}% – ${fund.interestRateMax ?? "—"}%` : null} />
                  <DetailRow label="Term" value={fund.termMin != null || fund.termMax != null ? `${fund.termMin ?? "—"} – ${fund.termMax ?? "—"} months` : null} />
                  <DetailRow label="Recourse" value={fund.recourseType} />
                  <DetailRow label="Min DSCR" value={fund.minDscr != null ? `${fund.minDscr}x` : null} />
                  <DetailRow label="Min Credit Score" value={fund.minCreditScore} />
                  <DetailRow label="Prepayment Terms" value={fund.prepaymentTerms} />
                  <DetailRow label="Closing Timeline" value={fund.closingTimeline} />
                  <DetailRow label="Origination Fee" value={fund.originationFeeMin != null || fund.originationFeeMax != null ? `${fund.originationFeeMin ?? "—"}% – ${fund.originationFeeMax ?? "—"}%` : null} />
                </div>
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-1">Region</p>
                  {fund.allowedStates?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {fund.allowedStates.length === 50
                        ? <Badge variant="outline" className="text-[10px]">Nationwide</Badge>
                        : fund.allowedStates.map((s: string) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)
                      }
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-sm">N/A</p>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1">Property Types</p>
                  {fund.allowedAssetTypes?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {fund.allowedAssetTypes.map((t: string) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-sm">N/A</p>
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-1">Description / Notes</p>
                  <p className={fund.fundDescription ? "text-sm" : "text-muted-foreground italic text-sm"}>{fund.fundDescription || "N/A"}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-100 shrink-0 mt-0.5">
                  <Upload size={18} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Upload Fund Documents</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Upload term sheets, rate sheets, guidelines, or any fund documentation. Our AI will automatically extract key details like rates, terms, eligibility criteria, and other relevant information into the Knowledge tab.</p>
                  <div className="flex items-center gap-3 mt-3">
                    <Button size="sm" onClick={() => docInputRef.current?.click()} disabled={uploadDocMut.isPending} data-testid="upload-fund-doc">
                      {uploadDocMut.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : <FileUp size={14} className="mr-1" />}
                      {uploadDocMut.isPending ? "Uploading..." : "Choose File"}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">PDF, DOC, DOCX, TXT, XLS, XLSX</span>
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
            <Card>
              <CardContent className="p-10 text-center">
                <FileText size={36} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No documents uploaded yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">Upload your first document above and our AI will automatically analyze it to build this fund's knowledge base.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <Card key={doc.id} className={doc.extractionStatus === "processing" ? "border-blue-200" : ""} data-testid={`fund-doc-${doc.id}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`p-1.5 rounded ${
                      doc.extractionStatus === "completed" ? "bg-emerald-100" :
                      doc.extractionStatus === "processing" ? "bg-blue-100" :
                      doc.extractionStatus === "failed" ? "bg-red-100" :
                      "bg-muted"
                    }`}>
                      <FileText size={16} className={
                        doc.extractionStatus === "completed" ? "text-emerald-600" :
                        doc.extractionStatus === "processing" ? "text-blue-600" :
                        doc.extractionStatus === "failed" ? "text-red-500" :
                        "text-muted-foreground"
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ""}</span>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${
                          doc.extractionStatus === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          doc.extractionStatus === "processing" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          doc.extractionStatus === "failed" ? "bg-red-50 text-red-700 border-red-200" :
                          ""
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
                          <span className="text-[10px] text-muted-foreground">Knowledge extracted</span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Delete this document and its extracted knowledge?")) deleteDocMut.mutate(doc.id); }} className="text-muted-foreground hover:text-red-500 h-8 w-8 p-0" data-testid={`delete-doc-${doc.id}`}>
                      <Trash2 size={14} />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Add Knowledge Note</p>
              <div className="flex gap-2">
                <Select value={noteCategory} onValueChange={setNoteCategory}>
                  <SelectTrigger className="text-sm w-32" data-testid="note-category-select">
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
                  className="text-sm flex-1"
                  data-testid="knowledge-note-input"
                />
                <Button size="sm" disabled={!noteContent.trim() || addNoteMut.isPending} onClick={() => addNoteMut.mutate()} data-testid="add-note-button">
                  <Plus size={14} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {knowledgeEntries.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <BookOpen size={32} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No knowledge entries yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add notes manually or upload documents to auto-extract knowledge</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {knowledgeEntries.map((entry: any) => (
                <Card key={entry.id} data-testid={`knowledge-entry-${entry.id}`}>
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-[10px]">{entry.category}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${entry.sourceType === "manual" ? "" : "bg-purple-50 text-purple-600 border-purple-200"}`}>
                          {entry.sourceType === "manual" ? "Manual" : "Extracted"}
                        </Badge>
                        {entry.sourceDocumentName && <span className="text-[10px] text-muted-foreground truncate">{entry.sourceDocumentName}</span>}
                      </div>
                      <p className="text-sm">{entry.content}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteKnowledgeMut.mutate(entry.id)} className="text-muted-foreground hover:text-red-500 h-8 w-8 p-0 shrink-0" data-testid={`delete-knowledge-${entry.id}`}>
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
  const isEmpty = !value && value !== 0;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={isEmpty ? "text-muted-foreground italic" : ""}>{isEmpty ? "N/A" : value}</p>
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  const bulkActionMut = useMutation({
    mutationFn: async ({ ids, action, data }: { ids: number[]; action: string; data?: any }) =>
      apiRequest("POST", "/api/commercial/funds/bulk-action", { ids, action, data }),
    onSuccess: (_: any, vars: { ids: number[]; action: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/funds"] });
      setSelectedIds(new Set());
      toast({
        title: vars.action === "delete"
          ? `${vars.ids.length} fund${vars.ids.length > 1 ? "s" : ""} deleted`
          : `${vars.ids.length} fund${vars.ids.length > 1 ? "s" : ""} updated`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Bulk action failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFunds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFunds.map((f: any) => f.id)));
    }
  };

  const backfillMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/commercial/embeddings/backfill");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Embeddings synced", description: `${data.fundCount || 0} funds, ${data.knowledgeCount || 0} knowledge entries processed` });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message || "Check API quota", variant: "destructive" });
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
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="fund-management-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-display font-bold" data-testid="page-title">Fund Management</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">
            {fundsList.length} fund{fundsList.length !== 1 ? "s" : ""} configured
            {filteredFunds.length !== fundsList.length && ` · ${filteredFunds.length} shown`}
          </p>
        </div>
      </div>

      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative max-w-[320px] w-[320px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search funds..."
                  className="pl-9 h-9 text-[16px]"
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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => backfillMut.mutate()}
                disabled={backfillMut.isPending}
                data-testid="backfill-embeddings-button"
              >
                <RefreshCw size={14} className={`mr-1 ${backfillMut.isPending ? "animate-spin" : ""}`} />
                {backfillMut.isPending ? "Processing..." : "Sync AI"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} data-testid="import-funds-button">
                <Upload size={14} className="mr-1" /> Import
              </Button>
              <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingFund(null); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid="add-fund-button">
                    <Plus size={14} className="mr-1" /> Add Fund
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
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
        </div>
      </div>

      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredFunds.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={fundsList.length === 0 ? "No funds configured" : "No funds found"}
            description={fundsList.length === 0
              ? "Add your first fund or import from Excel."
              : "Try adjusting your search or filters."}
          />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b-2">
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={filteredFunds.length > 0 && selectedIds.size === filteredFunds.length}
                      onCheckedChange={toggleSelectAll}
                      data-testid="select-all-funds"
                      className="border-slate-400"
                    />
                  </th>
                  <th className="w-8" />
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Lender</th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Loan Range</th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">LTV</th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Region</th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Property Types</th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredFunds.map((fund: any) => (
                  <ExpandableRow
                    key={fund.id}
                    columns={7}
                    isExpanded={expandedId === fund.id}
                    onToggle={(expanded) => setExpandedId(expanded ? fund.id : null)}
                    prefix={
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(fund.id)}
                          onCheckedChange={() => toggleSelect(fund.id)}
                          data-testid={`select-fund-${fund.id}`}
                          className="border-slate-400"
                        />
                      </td>
                    }
                    summary={
                      <>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[16px] font-medium text-blue-600" data-testid={`fund-name-${fund.id}`}>{fund.fundName}</span>
                            {Array.isArray(fund.loanTypes) && fund.loanTypes.length > 0 ? (
                              <>
                                {fund.loanTypes.slice(0, 3).map((lt: string) => (
                                  <Badge key={lt} variant="outline" className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-500/30" data-testid={`fund-loantype-${fund.id}-${lt}`}>{lt}</Badge>
                                ))}
                                {fund.loanTypes.length > 3 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-600">+{fund.loanTypes.length - 3}</Badge>
                                )}
                              </>
                            ) : fund.loanStrategy ? (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                fund.loanStrategy === "Bridge" ? "text-amber-600 border-amber-300" :
                                fund.loanStrategy === "Permanent" ? "text-emerald-600 border-emerald-300" :
                                "text-blue-600 border-blue-300"
                              }`} data-testid={`fund-strategy-${fund.id}`}>{fund.loanStrategy}</Badge>
                            ) : null}
                          </div>
                          {fund.providerName && <div className="text-[13px] text-muted-foreground">{fund.providerName}</div>}
                        </td>
                        <td className="px-3 py-3 text-[14px]">
                          {fund.loanAmountMin != null || fund.loanAmountMax != null
                            ? `$${fmtAmt(fund.loanAmountMin)} – $${fmtAmt(fund.loanAmountMax)}`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-[14px]">
                          {fund.ltvMin != null || fund.ltvMax != null
                            ? `${fund.ltvMin ?? "—"}–${fund.ltvMax ?? "—"}%`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-[14px]">
                          {fund.interestRateMin != null || fund.interestRateMax != null
                            ? `${fund.interestRateMin ?? "—"}–${fund.interestRateMax ?? "—"}%`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-[13px]">
                          {fund.allowedStates?.length > 0
                            ? fund.allowedStates.length === 50
                              ? <Badge variant="outline" className="text-[11px]">Nationwide</Badge>
                              : <span className="text-muted-foreground">{fund.allowedStates.slice(0, 4).join(", ")}{fund.allowedStates.length > 4 ? ` +${fund.allowedStates.length - 4}` : ""}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-[13px]">
                          {fund.allowedAssetTypes?.length > 0
                            ? <span className="text-muted-foreground">{fund.allowedAssetTypes.slice(0, 2).join(", ")}{fund.allowedAssetTypes.length > 2 ? ` +${fund.allowedAssetTypes.length - 2}` : ""}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={`text-[11px] ${fund.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`} variant="outline">
                            {fund.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </>
                    }
                    details={
                      <div data-testid={`fund-expanded-${fund.id}`}>
                        <div className="grid grid-cols-3 gap-8">
                          <div>
                            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact Info</h4>
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Contact Name</span>
                                <span className="font-medium">{fund.contactName || "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Email</span>
                                <span className="font-medium">{fund.contactEmail || "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Phone</span>
                                <span className="font-medium">{fund.contactPhone || "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Website</span>
                                <span className="font-medium truncate max-w-[160px]">
                                  {fund.website
                                    ? <a href={fund.website.startsWith("http") ? fund.website : `https://${fund.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{fund.website}</a>
                                    : "—"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Guidelines</span>
                                <span className="font-medium truncate max-w-[160px]">
                                  {fund.guidelineUrl
                                    ? <a href={fund.guidelineUrl.startsWith("http") ? fund.guidelineUrl : `https://${fund.guidelineUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Financial Terms</h4>
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">LTC</span>
                                <span className="font-medium">{fund.ltcMin != null || fund.ltcMax != null ? `${fund.ltcMin ?? "—"}–${fund.ltcMax ?? "—"}%` : "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Term</span>
                                <span className="font-medium">{fund.termMin != null || fund.termMax != null ? `${fund.termMin ?? "—"}–${fund.termMax ?? "—"} mo` : "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Recourse</span>
                                <span className="font-medium">{fund.recourseType || "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Min DSCR</span>
                                <span className="font-medium">{fund.minDscr != null ? `${fund.minDscr}x` : "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Min Credit Score</span>
                                <span className="font-medium">{fund.minCreditScore ?? "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Origination Fee</span>
                                <span className="font-medium">{fund.originationFeeMin != null || fund.originationFeeMax != null ? `${fund.originationFeeMin ?? "—"}–${fund.originationFeeMax ?? "—"}%` : "—"}</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Additional Details</h4>
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Prepayment</span>
                                <span className="font-medium">{fund.prepaymentTerms || "—"}</span>
                              </div>
                              <div className="flex items-center justify-between text-[14px]">
                                <span className="text-muted-foreground">Closing Timeline</span>
                                <span className="font-medium">{fund.closingTimeline || "—"}</span>
                              </div>
                            </div>
                            {fund.allowedStates?.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[13px] text-muted-foreground mb-1.5">Region</p>
                                <div className="flex flex-wrap gap-1">
                                  {fund.allowedStates.length === 50
                                    ? <Badge variant="outline" className="text-[11px]">Nationwide</Badge>
                                    : fund.allowedStates.map((s: string) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)
                                  }
                                </div>
                              </div>
                            )}
                            {fund.allowedAssetTypes?.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[13px] text-muted-foreground mb-1.5">Property Types</p>
                                <div className="flex flex-wrap gap-1">
                                  {fund.allowedAssetTypes.map((t: string) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {fund.fundDescription && (
                          <div className="mt-4 pt-3 border-t border-border/50">
                            <p className="text-[13px] text-muted-foreground mb-1">Description / Notes</p>
                            <p className="text-[14px]">{fund.fundDescription}</p>
                          </div>
                        )}

                        <div className="mt-5 pt-4 border-t border-border/50 flex items-center gap-3">
                          <Button size="default" className="text-[16px] shadow-md" onClick={(e) => { e.stopPropagation(); setSelectedFundId(fund.id); }} data-testid={`button-open-fund-${fund.id}`}>
                            Open Fund <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            onClick={(e) => { e.stopPropagation(); setEditingFund(fund); setDialogOpen(true); }}
                            data-testid={`edit-fund-${fund.id}`}
                          ><Pencil size={14} className="mr-1" /> Edit</Button>
                          <Button
                            variant="outline" size="sm"
                            onClick={(e) => { e.stopPropagation(); if (confirm("Delete this fund?")) deleteMut.mutate(fund.id); }}
                            className="text-red-500 hover:text-red-600 hover:border-red-300"
                            data-testid={`delete-fund-${fund.id}`}
                          ><Trash2 size={14} className="mr-1" /> Delete</Button>
                        </div>
                      </div>
                    }
                  />
                ))}
              </tbody>
            </table>

            {filteredFunds.length > 0 && (
              <div className="px-4 py-3 border-t text-[14px] text-muted-foreground flex items-center justify-between">
                <span>
                  Showing {filteredFunds.length} of {fundsList.length} funds
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a2340] border border-slate-600 rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200" data-testid="bulk-action-bar">
          <span className="text-[14px] text-slate-300 font-medium mr-1" data-testid="bulk-selected-count">
            {selectedIds.size} selected
          </span>
          <div className="h-5 w-px bg-slate-600" />
          <Button
            size="sm"
            variant="outline"
            className="text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10 text-[13px]"
            onClick={() => bulkActionMut.mutate({ ids: Array.from(selectedIds), action: "update", data: { isActive: true } })}
            disabled={bulkActionMut.isPending}
            data-testid="bulk-activate"
          >
            <ToggleRight className="h-3.5 w-3.5 mr-1" /> Activate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-slate-400 border-slate-500/40 hover:bg-slate-500/10 text-[13px]"
            onClick={() => bulkActionMut.mutate({ ids: Array.from(selectedIds), action: "update", data: { isActive: false } })}
            disabled={bulkActionMut.isPending}
            data-testid="bulk-deactivate"
          >
            <ToggleLeft className="h-3.5 w-3.5 mr-1" /> Deactivate
          </Button>
          <Select onValueChange={(val) => bulkActionMut.mutate({ ids: Array.from(selectedIds), action: "update", data: { loanTypes: [val] } })}>
            <SelectTrigger className="w-[160px] h-8 text-[13px] bg-transparent border-slate-500/40 text-slate-300" data-testid="bulk-loantype-select">
              <SelectValue placeholder="Set Loan Type" />
            </SelectTrigger>
            <SelectContent>
              {STANDARD_LOAN_TYPES.map(lt => (
                <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="h-5 w-px bg-slate-600" />
          <Button
            size="sm"
            variant="outline"
            className="text-red-400 border-red-500/40 hover:bg-red-500/10 text-[13px]"
            onClick={() => {
              if (confirm(`Delete ${selectedIds.size} fund${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`)) {
                bulkActionMut.mutate({ ids: Array.from(selectedIds), action: "delete" });
              }
            }}
            disabled={bulkActionMut.isPending}
            data-testid="bulk-delete"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <div className="h-5 w-px bg-slate-600" />
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-500 hover:text-slate-300 text-[13px]"
            onClick={() => setSelectedIds(new Set())}
            data-testid="bulk-clear"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
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

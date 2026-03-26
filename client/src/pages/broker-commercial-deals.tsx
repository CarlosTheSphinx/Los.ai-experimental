import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Building2, DollarSign, MapPin, Clock, Eye, Send, ArrowLeft,
  FileText, Upload, CheckCircle2, AlertTriangle, TrendingUp, RefreshCw,
  ArrowRight, Save, Download, Pencil, X, MessageSquare, StickyNote,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import DealStoryRecorder from "@/components/DealStoryRecorder";

const CURRENCY_FIELDS = new Set(["loanAmount", "propertyValue", "noiAnnual"]);

function formatCurrency(val: string): string {
  const num = val.replace(/[^0-9]/g, "");
  if (!num) return "";
  return parseInt(num).toLocaleString("en-US");
}

function parseCurrency(val: string): string {
  return val.replace(/[^0-9]/g, "");
}

function tryParseDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

function formatDealDate(deal: { submittedAt?: unknown; updatedAt?: unknown; createdAt?: unknown }): string {
  const d = tryParseDate(deal.submittedAt) ?? tryParseDate(deal.updatedAt) ?? tryParseDate(deal.createdAt);
  return d ? d.toLocaleDateString() : "N/A";
}

const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];
const ENTITY_TYPES = ["Individual","LLC","Corporation","Partnership","Trust"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function statusBadge(status: string) {
  const config: Record<string, { color: string; label: string }> = {
    draft: { color: "bg-muted text-muted-foreground border", label: "Draft" },
    submitted: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Submitted" },
    analyzed: { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Under Review" },
    under_review: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Under Review" },
    approved: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Approved" },
    conditional: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Conditional" },
    rejected: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Rejected" },
    transferred: { color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "In Progress" },
    no_match: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "No Match" },
  };
  const c = config[status] || { color: "bg-muted text-muted-foreground", label: status };
  return <Badge className={`text-xs ${c.color}`}>{c.label}</Badge>;
}

function DealsList() {
  const [, navigate] = useLocation();

  const { data: deals = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/commercial/deals"],
  });

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" data-testid="broker-commercial-deals">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-display font-bold" data-testid="page-title">Commercial Deals</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">Submit and track your commercial real estate deals</p>
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
          onClick={() => navigate("/commercial-deals/new")}
          data-testid="new-deal-button"
        >
          <Plus size={14} className="mr-1" /> Submit New Deal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-muted-foreground" /></div>
      ) : deals.length === 0 ? (
        <Card className="bg-card border">
          <CardContent className="p-12 text-center">
            <Building2 size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No deals yet. Submit your first commercial deal.</p>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => navigate("/commercial-deals/new")} data-testid="empty-new-deal">
              <Plus size={14} className="mr-1" /> Submit New Deal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deals.map((deal: any) => (
            <Card
              key={deal.id}
              className="bg-card border hover:border transition-colors cursor-pointer"
              onClick={() => navigate(deal.status === "draft" ? `/commercial-deals/${deal.id}/edit` : `/commercial-deals/${deal.id}`)}
              data-testid={`deal-card-${deal.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-foreground">{deal.dealName || `Deal #${deal.id}`}</h3>
                      {statusBadge(deal.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                      {deal.loanAmount && <span className="flex items-center gap-1"><DollarSign size={12} />${(deal.loanAmount / 1000000).toFixed(1)}M</span>}
                      {deal.assetType && <span className="flex items-center gap-1"><Building2 size={12} />{deal.assetType}</span>}
                      {deal.propertyState && <span className="flex items-center gap-1"><MapPin size={12} />{deal.propertyState}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2" data-testid={`deal-date-${deal.id}`}>
                      {deal.status === "draft" ? "Last saved" : "Submitted"}: {formatDealDate(deal)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid={`view-deal-${deal.id}`}>
                    <Eye size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface FormFieldConfig {
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

function DynamicField({ field, value, onChange, onAddressSelect }: { field: FormFieldConfig; value: any; onChange: (v: any) => void; onAddressSelect?: (data: { formatted: string; city?: string; state?: string; zip?: string }) => void }) {
  const label = `${field.fieldLabel}${field.isRequired ? " *" : ""}`;
  const inputClass = "bg-muted/50 border text-foreground text-sm";

  if (field.fieldType === "select" && field.options?.choices) {
    return (
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className={inputClass} data-testid={field.fieldKey}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.choices.map((c: string) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.fieldType === "radio" && field.options?.choices) {
    return (
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">{label}</Label>
        <RadioGroup value={value ? "yes" : "no"} onValueChange={v => onChange(v === "yes")} className="flex gap-4">
          {field.options.choices.map((c: string) => (
            <div key={c} className="flex items-center gap-1.5">
              <RadioGroupItem value={c.toLowerCase()} id={`${field.fieldKey}-${c}`} />
              <Label htmlFor={`${field.fieldKey}-${c}`} className="text-xs text-muted-foreground">{c}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    );
  }

  if (field.fieldKey === "propertyAddress") {
    return (
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <AddressAutocomplete
          value={value || ""}
          onChange={(v) => {
            onChange(v);
            onAddressSelect?.({ formatted: v, city: "", state: "", zip: "" });
          }}
          onSelectStructured={(data) => {
            onChange(data.formatted);
            onAddressSelect?.({
              formatted: data.formatted,
              city: data.city || "",
              state: data.state || "",
              zip: data.zip || "",
            });
          }}
          placeholder="Start typing an address..."
          className={inputClass}
          data-testid="propertyAddress"
        />
      </div>
    );
  }

  const isCurrency = CURRENCY_FIELDS.has(field.fieldKey);
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={isCurrency ? "text" : (field.fieldType === "number" ? "number" : "text")}
        inputMode={isCurrency ? "numeric" : undefined}
        value={isCurrency ? formatCurrency(value || "") : (value || "")}
        onChange={e => onChange(isCurrency ? parseCurrency(e.target.value) : e.target.value)}
        className={inputClass}
        data-testid={field.fieldKey}
      />
    </div>
  );
}

function DealForm({ editDealId }: { editDealId?: number } = {}) {
  const [, navigate] = useLocation();
  const location = useLocation()[0];
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const urlEditId = editDealId || (() => {
    const match = location.match(/\/commercial-deals\/(\d+)\/edit/);
    return match ? parseInt(match[1]) : undefined;
  })();
  const isEditing = !!urlEditId;

  const { data: existingDeal, isLoading: loadingDeal } = useQuery<any>({
    queryKey: ["/api/commercial/deals", urlEditId],
    queryFn: async () => {
      const res = await fetch(`/api/commercial/deals/${urlEditId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load deal");
      return res.json();
    },
    enabled: isEditing,
  });

  const emptyForm: Record<string, any> = {
    dealName: "",
    loanAmount: "",
    assetType: "",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: "",
    propertyValue: "",
    noiAnnual: "",
    occupancyPct: "",
    borrowerName: "",
    borrowerEntityType: "",
    borrowerCreditScore: "",
    hasGuarantor: false,
    dealStoryTranscript: "",
  };

  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [formLoaded, setFormLoaded] = useState(false);
  const [savedDealId, setSavedDealId] = useState<number | undefined>(undefined);

  if (isEditing && existingDeal && !formLoaded) {
    setForm({
      dealName: existingDeal.dealName || "",
      loanAmount: existingDeal.loanAmount?.toString() || "",
      assetType: existingDeal.assetType || "",
      propertyAddress: existingDeal.propertyAddress || "",
      propertyCity: existingDeal.propertyCity || "",
      propertyState: existingDeal.propertyState || "",
      propertyZip: existingDeal.propertyZip || "",
      propertyValue: existingDeal.propertyValue?.toString() || "",
      noiAnnual: existingDeal.noiAnnual?.toString() || "",
      occupancyPct: existingDeal.occupancyPct?.toString() || "",
      borrowerName: existingDeal.borrowerName || "",
      borrowerEntityType: existingDeal.borrowerEntityType || "",
      borrowerCreditScore: existingDeal.borrowerCreditScore?.toString() || "",
      hasGuarantor: existingDeal.hasGuarantor || false,
      dealStoryTranscript: existingDeal.dealStoryTranscript || "",
    });
    setSavedDealId(existingDeal.id);
    setFormLoaded(true);
  }

  const { data: formConfig = [] } = useQuery<FormFieldConfig[]>({
    queryKey: ["/api/commercial/form-config"],
  });

  const loanAmt = parseFloat(form.loanAmount) || 0;
  const propVal = parseFloat(form.propertyValue) || 0;
  const noi = parseFloat(form.noiAnnual) || 0;
  const ltv = propVal > 0 ? ((loanAmt / propVal) * 100).toFixed(2) : "—";
  const dscr = loanAmt > 0 ? (noi / (loanAmt * 0.07)).toFixed(2) : "—";

  const { data: requiredDocs = { requiredDocuments: [], templates: {} } } = useQuery<{ requiredDocuments: string[]; templates: Record<string, { ruleId: number; fileName: string }> }>({
    queryKey: ["/api/commercial/evaluate-document-rules", form.assetType, form.loanAmount, form.propertyState],
    queryFn: async () => {
      if (!form.assetType) return { requiredDocuments: ["Loan Application (1003)", "Bank Statement", "Tax Returns (2 years)", "Purchase Contract"], templates: {} };
      const res = await fetch("/api/commercial/evaluate-document-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          assetType: form.assetType,
          loanAmount: loanAmt || undefined,
          propertyState: form.propertyState || undefined,
        }),
      });
      if (!res.ok) return { requiredDocuments: ["Loan Application (1003)", "Bank Statement", "Tax Returns (2 years)", "Purchase Contract"], templates: {} };
      return res.json();
    },
    enabled: true,
  });

  const existingDocsByType: Record<string, any[]> = {};
  for (const d of (existingDeal?.documents || []).filter((d: any) => d.isCurrent)) {
    if (!existingDocsByType[d.documentType]) existingDocsByType[d.documentType] = [];
    existingDocsByType[d.documentType].push(d);
  }
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, Array<{ file: File; name: string }>>>({});

  const totalRequired = requiredDocs.requiredDocuments.length;
  const docsUploaded = requiredDocs.requiredDocuments.filter((docType: string) => {
    const newFiles = uploadedDocs[docType] || [];
    const existingFiles = existingDocsByType[docType] || [];
    return newFiles.length > 0 || existingFiles.length > 0;
  }).length;
  const allDocsUploaded = totalRequired > 0 && docsUploaded === totalRequired;

  const saveMut = useMutation({
    mutationFn: async (submit: boolean) => {
      const body: any = {
        dealName: form.dealName,
        loanAmount: loanAmt || null,
        assetType: form.assetType || null,
        propertyAddress: form.propertyAddress || null,
        propertyCity: form.propertyCity || null,
        propertyState: form.propertyState || null,
        propertyZip: form.propertyZip || null,
        propertyValue: propVal || null,
        noiAnnual: noi || null,
        occupancyPct: form.occupancyPct ? parseInt(form.occupancyPct) : null,
        borrowerName: form.borrowerName || null,
        borrowerEntityType: form.borrowerEntityType || null,
        borrowerCreditScore: form.borrowerCreditScore ? parseInt(form.borrowerCreditScore) : null,
        hasGuarantor: form.hasGuarantor,
        dealStoryTranscript: form.dealStoryTranscript || null,
      };

      let deal: any;
      if (isEditing && urlEditId) {
        const res = await apiRequest("PATCH", `/api/commercial/deals/${urlEditId}`, body);
        deal = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/commercial/deals", body);
        deal = await res.json();
      }

      setSavedDealId(deal.id);

      for (const [docType, files] of Object.entries(uploadedDocs)) {
        for (const { name } of files) {
          await apiRequest("POST", `/api/commercial/deals/${deal.id}/documents`, {
            documentType: docType,
            fileName: name,
            fileSize: 0,
            mimeType: "application/pdf",
          });
        }
      }

      if (submit) {
        await apiRequest("POST", `/api/commercial/deals/${deal.id}/submit`);
      }

      return deal;
    },
    onSuccess: (_deal, submit) => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals"] });
      toast({ title: submit ? "Deal submitted for review" : "Draft saved" });
      navigate("/commercial-deals");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = (docType: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files).map(f => ({ file: f, name: f.name }));
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: [...(prev[docType] || []), ...newFiles],
    }));
  };

  const removeUploadedFile = (docType: string, index: number) => {
    setUploadedDocs(prev => {
      const updated = [...(prev[docType] || [])];
      updated.splice(index, 1);
      if (updated.length === 0) {
        const { [docType]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [docType]: updated };
    });
  };

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const canAdvance = !!form.dealName && !!form.loanAmount && !!form.assetType;

  if (isEditing && loadingDeal) {
    return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl" data-testid="deal-form-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => step === 2 ? setStep(1) : navigate("/commercial-deals")} className="text-muted-foreground" data-testid="back-button">
          <ArrowLeft size={16} className="mr-1" /> {step === 2 ? "Back to Deal Info" : "Back"}
        </Button>
        <h1 className="text-xl font-semibold text-foreground">{isEditing ? "Edit Draft Deal" : "Submit New Deal"}</h1>
        {isEditing && <Badge className="text-xs bg-muted text-muted-foreground border">Draft</Badge>}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3" data-testid="step-indicator">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${step === 1 ? "bg-blue-500/20 text-blue-400 border-blue-500/40" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"}`}>
          {step > 1 ? <CheckCircle2 size={14} /> : <span className="w-5 h-5 rounded-full bg-blue-500 text-foreground flex items-center justify-center text-[10px] font-bold">1</span>}
          Deal Info
        </div>
        <div className="w-8 h-px bg-muted" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${step === 2 ? "bg-blue-500/20 text-blue-400 border-blue-500/40" : "bg-muted/50 text-muted-foreground border"}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 2 ? "bg-blue-500 text-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
          Documents
        </div>
      </div>

      {/* STEP 1: Deal Information */}
      {step === 1 && (
        <>
          {(() => {
            const visibleFields = formConfig.filter(f => f.isVisible);
            const sections = visibleFields.reduce((acc, field) => {
              if (!acc[field.section]) acc[field.section] = [];
              acc[field.section].push(field);
              return acc;
            }, {} as Record<string, FormFieldConfig[]>);
            Object.values(sections).forEach(arr => arr.sort((a, b) => a.sortOrder - b.sortOrder));

            if (Object.keys(sections).length === 0) {
              return (
                <Card className="bg-card border">
                  <CardHeader className="pb-3"><CardTitle className="text-sm text-foreground">Deal Basics</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Deal Name *</Label>
                      <Input value={form.dealName} onChange={e => update("dealName", e.target.value)} className="bg-muted/50 border text-foreground text-sm" data-testid="deal-name" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Loan Amount ($) *</Label>
                        <Input type="text" inputMode="numeric" value={formatCurrency(form.loanAmount)} onChange={e => update("loanAmount", parseCurrency(e.target.value))} className="bg-muted/50 border text-foreground text-sm" data-testid="loan-amount" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Asset Type *</Label>
                        <Select value={form.assetType} onValueChange={v => update("assetType", v)}>
                          <SelectTrigger className="bg-muted/50 border text-foreground text-sm" data-testid="asset-type"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return Object.entries(sections).map(([sectionName, sectionFields]) => (
              <Card key={sectionName} className="bg-card border">
                <CardHeader className="pb-3"><CardTitle className="text-sm text-foreground">{sectionName}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sectionFields.map(field => (
                      <DynamicField
                        key={field.id}
                        field={field}
                        value={form[field.fieldKey]}
                        onChange={v => update(field.fieldKey, v)}
                        onAddressSelect={(data) => {
                          update("propertyCity", data.city || "");
                          update("propertyState", data.state || "");
                          update("propertyZip", data.zip || "");
                        }}
                      />
                    ))}
                  </div>
                  {sectionName === "Property Metrics" && (
                    <div className="flex gap-6 p-3 rounded bg-muted/50 border">
                      <div>
                        <p className="text-xs text-muted-foreground">LTV (auto-calculated)</p>
                        <p className={`text-sm font-medium ${ltv !== "—" && parseFloat(ltv) > 80 ? "text-red-400" : "text-foreground"}`} data-testid="ltv-display">{ltv}{ltv !== "—" ? "%" : ""}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">DSCR (auto-calculated)</p>
                        <p className={`text-sm font-medium ${dscr !== "—" && parseFloat(dscr) < 1.25 ? "text-amber-400" : "text-foreground"}`} data-testid="dscr-display">{dscr}{dscr !== "—" ? "x" : ""}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ));
          })()}

          <DealStoryRecorder
            dealId={savedDealId || urlEditId}
            transcript={form.dealStoryTranscript || ""}
            onTranscriptChange={(t) => update("dealStoryTranscript", t)}
            disabled={saveMut.isPending}
          />

          <div className="flex flex-wrap items-center gap-3 pb-6">
            <Button
              variant="outline"
              onClick={() => saveMut.mutate(false)}
              disabled={saveMut.isPending}
              className="border text-foreground"
              data-testid="save-draft-button"
            >
              <Save size={14} className="mr-1" /> {isEditing ? "Update Draft" : "Save as Draft"}
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={() => navigate("/commercial-deals")}
              className="border text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!canAdvance}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="next-step-button"
            >
              Next: Upload Documents <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        </>
      )}

      {/* STEP 2: Document Upload */}
      {step === 2 && (
        <>
          <Card className="bg-card border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-foreground">Required Documents</CardTitle>
                <Badge className={`text-xs ${allDocsUploaded ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground border"}`} data-testid="doc-progress-badge">
                  {docsUploaded} of {totalRequired} uploaded
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on your deal ({form.assetType || "—"}, ${loanAmt ? `${(loanAmt / 1000000).toFixed(1)}M` : "—"}, {form.propertyState || "—"})
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {requiredDocs.requiredDocuments.map((docType: string) => {
                const template = requiredDocs.templates?.[docType];
                const newFiles = uploadedDocs[docType] || [];
                const existingFiles = existingDocsByType[docType] || [];
                const hasFiles = newFiles.length > 0 || existingFiles.length > 0;
                return (
                  <div key={docType} className={`p-3 rounded border ${hasFiles ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/50 border"}`} data-testid={`doc-req-${docType.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                    <div className="flex items-center gap-3">
                      {hasFiles ? (
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      ) : (
                        <FileText size={16} className="text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{docType}</p>
                        {hasFiles && (
                          <p className="text-[10px] text-muted-foreground">{existingFiles.length + newFiles.length} file{(existingFiles.length + newFiles.length) !== 1 ? "s" : ""}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {template && (
                          <a
                            href={`/api/commercial/document-rules/${template.ruleId}/template/${encodeURIComponent(docType)}/download`}
                            className="text-xs px-3 py-1.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                            data-testid={`template-${docType.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                            download
                          >
                            <Download size={12} />
                            Template
                          </a>
                        )}
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            multiple
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
                            onChange={e => { handleFileSelect(docType, e.target.files); e.target.value = ""; }}
                          />
                          <span className="text-xs px-3 py-1.5 rounded border transition-colors bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20 flex items-center gap-1" data-testid={`upload-${docType.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                            <Upload size={12} />
                            {hasFiles ? "Add More" : "Upload"}
                          </span>
                        </label>
                      </div>
                    </div>
                    {(existingFiles.length > 0 || newFiles.length > 0) && (
                      <div className="mt-2 ml-7 space-y-1">
                        {existingFiles.map((doc: any) => (
                          <div key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
                            <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                            <span className="truncate flex-1">{doc.fileName}</span>
                            <span className="text-muted-foreground/50 shrink-0">v{doc.version}</span>
                          </div>
                        ))}
                        {newFiles.map((f, i) => (
                          <div key={`new-${i}`} className="flex items-center gap-2 text-xs text-blue-400 py-0.5">
                            <Plus size={10} className="text-blue-400 shrink-0" />
                            <span className="truncate flex-1">{f.name}</span>
                            <button type="button" onClick={() => removeUploadedFile(docType, i)} className="text-muted-foreground hover:text-red-400 shrink-0" data-testid={`remove-file-${docType.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${i}`}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3 pb-6">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="border text-foreground"
              data-testid="back-to-step1-button"
            >
              <ArrowLeft size={14} className="mr-1" /> Back to Deal Info
            </Button>
            <Button
              variant="outline"
              onClick={() => saveMut.mutate(false)}
              disabled={saveMut.isPending}
              className="border text-foreground"
              data-testid="save-draft-button-step2"
            >
              <Save size={14} className="mr-1" /> Save as Draft
            </Button>
            <div className="flex-1" />
            <Button
              onClick={() => saveMut.mutate(true)}
              disabled={saveMut.isPending || !allDocsUploaded}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="submit-deal-button"
            >
              <Send size={14} className="mr-1" /> {saveMut.isPending ? "Submitting..." : "Submit to Lender"}
            </Button>
          </div>

          {!allDocsUploaded && (
            <p className="text-xs text-amber-400 text-center pb-4" data-testid="docs-required-warning">
              <AlertTriangle size={12} className="inline mr-1" />
              Upload all {totalRequired} required documents before submitting
            </p>
          )}
        </>
      )}
    </div>
  );
}

function DealDetail() {
  const params = useLocation()[0].split("/").pop();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [noteContent, setNoteContent] = useState("");
  const [uploadDocType, setUploadDocType] = useState("General");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: deal, isLoading } = useQuery<any>({
    queryKey: ["/api/commercial/deals", params],
    queryFn: async () => {
      const res = await fetch(`/api/commercial/deals/${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/commercial/deals/${params}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", params] });
      setIsEditing(false);
      toast({ title: "Deal updated" });
    },
    onError: () => toast({ title: "Failed to update deal", variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/commercial/deals/${params}/notes`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", params] });
      setNoteContent("");
      toast({ title: "Note added" });
    },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, documentType }: { file: File; documentType: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);
      const res = await fetch(`/api/commercial/deals/${params}/upload-document`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", params] });
      toast({ title: "Document uploaded" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: () => toast({ title: "Failed to upload document", variant: "destructive" }),
  });

  const startEdit = () => {
    setEditData({
      dealName: deal.dealName || "",
      loanAmount: deal.loanAmount || "",
      assetType: deal.assetType || "",
      propertyAddress: deal.propertyAddress || "",
      propertyCity: deal.propertyCity || "",
      propertyState: deal.propertyState || "",
      propertyZip: deal.propertyZip || "",
      propertyValue: deal.propertyValue || "",
      noiAnnual: deal.noiAnnual || "",
      occupancyPct: deal.occupancyPct || "",
      borrowerName: deal.borrowerName || "",
      borrowerEntityType: deal.borrowerEntityType || "",
      borrowerCreditScore: deal.borrowerCreditScore || "",
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(editData)) {
      if (v !== "" && v !== null && v !== undefined) {
        cleaned[k] = ["loanAmount", "propertyValue", "noiAnnual", "occupancyPct", "borrowerCreditScore"].includes(k)
          ? parseInt(v as string) || undefined
          : v;
      }
    }
    updateMutation.mutate(cleaned);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate({ file, documentType: uploadDocType });
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-muted-foreground" /></div>;
  if (!deal) return <div className="p-6"><p className="text-muted-foreground">Deal not found</p></div>;

  const currentDocs = deal.documents?.filter((d: any) => d.isCurrent) || [];
  const brokerNotes = (deal.brokerNotes || []) as Array<{ content: string; createdAt: string; authorName: string }>;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" data-testid="broker-deal-detail">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/commercial-deals")} className="text-muted-foreground" data-testid="back-button">
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold text-foreground">{deal.dealName || `Deal #${deal.id}`}</h1>
        {statusBadge(deal.status)}
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 ml-auto" onClick={() => navigate(`/commercial-deals/${deal.id}/edit`)} data-testid="edit-deal-button">
          <Pencil size={14} className="mr-1" /> Edit Deal
        </Button>
      </div>

      {deal.linkedProjectId && (
        <Card className="bg-card border-cyan-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowRight size={16} className="text-cyan-400" />
            <div>
              <p className="text-sm text-foreground">This deal has been transferred to the origination pipeline</p>
              <p className="text-xs text-muted-foreground">Project #{deal.linkedProjectId}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-4 sm:space-y-6">
          {/* Deal Summary - Editable */}
          <Card className="bg-card border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-foreground flex items-center gap-2"><Building2 size={16} /> Deal Summary</CardTitle>
              {!isEditing ? (
                <Button variant="ghost" size="sm" onClick={startEdit} className="text-muted-foreground hover:text-foreground h-7 px-2" data-testid="edit-summary-button">
                  <Pencil size={12} className="mr-1" /> Edit
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="text-muted-foreground h-7 px-2" data-testid="cancel-edit-button">
                    <X size={12} className="mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="bg-[#C9A84C] hover:bg-[#b8973b] h-7 px-2" data-testid="save-edit-button">
                    <Save size={12} className="mr-1" /> {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs">Deal Name</Label>
                    <Input value={editData.dealName} onChange={e => setEditData({ ...editData, dealName: e.target.value })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-deal-name" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Loan Amount ($)</Label>
                    <Input type="text" inputMode="numeric" value={formatCurrency(editData.loanAmount)} onChange={e => setEditData({ ...editData, loanAmount: parseCurrency(e.target.value) })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-loan-amount" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Asset Type</Label>
                    <Select value={editData.assetType} onValueChange={v => setEditData({ ...editData, assetType: v })}>
                      <SelectTrigger className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-asset-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs">Property Address</Label>
                    <Input value={editData.propertyAddress} onChange={e => setEditData({ ...editData, propertyAddress: e.target.value })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-property-address" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">City</Label>
                    <Input value={editData.propertyCity} onChange={e => setEditData({ ...editData, propertyCity: e.target.value })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-city" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">State</Label>
                    <Select value={editData.propertyState} onValueChange={v => setEditData({ ...editData, propertyState: v })}>
                      <SelectTrigger className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-state">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Property Value ($)</Label>
                    <Input type="text" inputMode="numeric" value={formatCurrency(editData.propertyValue)} onChange={e => setEditData({ ...editData, propertyValue: parseCurrency(e.target.value) })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-property-value" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">NOI Annual ($)</Label>
                    <Input type="text" inputMode="numeric" value={formatCurrency(editData.noiAnnual)} onChange={e => setEditData({ ...editData, noiAnnual: parseCurrency(e.target.value) })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-noi" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Occupancy %</Label>
                    <Input type="number" value={editData.occupancyPct} onChange={e => setEditData({ ...editData, occupancyPct: e.target.value })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-occupancy" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Borrower Name</Label>
                    <Input value={editData.borrowerName} onChange={e => setEditData({ ...editData, borrowerName: e.target.value })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-borrower-name" />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Entity Type</Label>
                    <Select value={editData.borrowerEntityType} onValueChange={v => setEditData({ ...editData, borrowerEntityType: v })}>
                      <SelectTrigger className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-entity-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Credit Score</Label>
                    <Input type="number" value={editData.borrowerCreditScore} onChange={e => setEditData({ ...editData, borrowerCreditScore: e.target.value })} className="bg-muted/50 border text-foreground text-sm h-8 mt-1" data-testid="edit-credit-score" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Loan Amount</p><p className="text-foreground">${deal.loanAmount ? deal.loanAmount.toLocaleString() : "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Asset Type</p><p className="text-foreground">{deal.assetType || "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Property</p><p className="text-foreground truncate">{deal.propertyAddress || "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">LTV</p><p className="text-foreground">{deal.ltvPct != null ? `${deal.ltvPct}%` : "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">DSCR</p><p className="text-foreground">{deal.dscr != null ? `${deal.dscr}x` : "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Borrower</p><p className="text-foreground">{deal.borrowerName || "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Property Value</p><p className="text-foreground">{deal.propertyValue ? `$${deal.propertyValue.toLocaleString()}` : "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">NOI</p><p className="text-foreground">{deal.noiAnnual ? `$${deal.noiAnnual.toLocaleString()}` : "N/A"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Occupancy</p><p className="text-foreground">{deal.occupancyPct != null ? `${deal.occupancyPct}%` : "N/A"}</p></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Timeline */}
          {deal.statusHistory?.length > 0 && (
            <Card className="bg-card border">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-foreground flex items-center gap-2"><Clock size={16} /> Status Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deal.statusHistory.map((sh: any, i: number) => (
                    <div key={sh.id} className="flex items-start gap-3" data-testid={`timeline-${i}`}>
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${i === 0 ? "bg-blue-500" : "bg-muted"}`} />
                        {i < deal.statusHistory.length - 1 && <div className="w-px h-6 bg-muted" />}
                      </div>
                      <div>
                        <p className="text-sm text-foreground">{sh.toStatus.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                        <p className="text-xs text-muted-foreground">{new Date(sh.createdAt).toLocaleString()}</p>
                        {sh.notes && <p className="text-xs text-muted-foreground mt-0.5">{sh.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes Section */}
          <Card className="bg-card border">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-foreground flex items-center gap-2"><StickyNote size={16} /> Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note about this deal..."
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  className="bg-muted/50 border text-foreground text-sm min-h-[60px] resize-none flex-1"
                  data-testid="note-input"
                />
              </div>
              <Button
                size="sm"
                disabled={!noteContent.trim() || addNoteMutation.isPending}
                onClick={() => addNoteMutation.mutate(noteContent)}
                className="bg-[#C9A84C] hover:bg-[#b8973b] text-sm"
                data-testid="add-note-button"
              >
                {addNoteMutation.isPending ? <RefreshCw size={12} className="animate-spin mr-1" /> : <MessageSquare size={12} className="mr-1" />}
                Add Note
              </Button>

              {brokerNotes.length > 0 && (
                <div className="space-y-2 pt-2 border-t border">
                  {brokerNotes.map((note, i) => (
                    <div key={i} className="p-2.5 rounded bg-muted/50 border" data-testid={`note-${i}`}>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <p className="text-xs text-muted-foreground">{note.authorName}</p>
                        <span className="text-xs text-muted-foreground/50">·</span>
                        <p className="text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4 sm:space-y-6">
          {/* Document Collection */}
          <Card className="bg-card border">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-foreground flex items-center gap-2"><FileText size={16} /> Documents</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* Upload Section */}
              <div className="p-3 rounded border-dashed border bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Upload size={14} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Upload a document</p>
                </div>
                <div className="space-y-2">
                  <Select value={uploadDocType} onValueChange={setUploadDocType}>
                    <SelectTrigger className="bg-muted/50 border text-foreground text-xs h-8" data-testid="select-doc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["General", "Operating Statement", "Rent Roll", "Appraisal", "Purchase Agreement", "Title Report", "Insurance", "Environmental", "Entity Documents", "Financial Statements", "Tax Returns", "Other"].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      data-testid="file-input"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="border text-foreground hover:bg-muted text-xs flex-1"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadMutation.isPending}
                      data-testid="upload-button"
                    >
                      {uploadMutation.isPending ? <RefreshCw size={12} className="animate-spin mr-1" /> : <Upload size={12} className="mr-1" />}
                      {uploadMutation.isPending ? "Uploading..." : "Choose File"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Uploaded Documents List */}
              {currentDocs.length > 0 ? (
                <div className="space-y-2">
                  {currentDocs.map((doc: any) => (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded bg-muted/50 border" data-testid={`doc-${doc.id}`}>
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{doc.documentType}</p>
                        <p className="text-xs text-muted-foreground truncate">{doc.fileName} · v{doc.version} · {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <FileText size={24} className="mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">No documents uploaded yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deal Story */}
          {deal.dealStoryTranscript && (
            <Card className="bg-card border">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-foreground flex items-center gap-2"><MessageSquare size={16} /> Deal Story</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">{deal.dealStoryTranscript}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export { DealsList, DealForm, DealDetail };
export default DealsList;

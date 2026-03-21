import { useState } from "react";
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
  ArrowRight, Save,
} from "lucide-react";

const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];
const ENTITY_TYPES = ["Individual","LLC","Corporation","Partnership","Trust"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function statusBadge(status: string) {
  const config: Record<string, { color: string; label: string }> = {
    draft: { color: "bg-slate-500/20 text-slate-400 border-slate-500/30", label: "Draft" },
    submitted: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Submitted" },
    analyzed: { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Under Review" },
    under_review: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Under Review" },
    approved: { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Approved" },
    conditional: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Conditional" },
    rejected: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Rejected" },
    transferred: { color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "In Progress" },
    no_match: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "No Match" },
  };
  const c = config[status] || { color: "bg-slate-500/20 text-slate-400", label: status };
  return <Badge className={`text-xs ${c.color}`}>{c.label}</Badge>;
}

function DealsList() {
  const [, navigate] = useLocation();

  const { data: deals = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/commercial/deals"],
  });

  return (
    <div className="p-6 space-y-6" data-testid="broker-commercial-deals">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white" data-testid="page-title">Commercial Deals</h1>
          <p className="text-sm text-slate-400 mt-1">Submit and track your commercial real estate deals</p>
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
          onClick={() => navigate("/commercial-deals/new")}
          data-testid="new-deal-button"
        >
          <Plus size={14} className="mr-1" /> Submit New Deal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
      ) : deals.length === 0 ? (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardContent className="p-12 text-center">
            <Building2 size={40} className="mx-auto text-slate-500 mb-3" />
            <p className="text-slate-400 mb-4">No deals yet. Submit your first commercial deal.</p>
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
              className="bg-[#1a2038] border-slate-700/50 hover:border-slate-600 transition-colors cursor-pointer"
              onClick={() => navigate(`/commercial-deals/${deal.id}`)}
              data-testid={`deal-card-${deal.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white">{deal.dealName || `Deal #${deal.id}`}</h3>
                      {statusBadge(deal.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-2">
                      {deal.loanAmount && <span className="flex items-center gap-1"><DollarSign size={12} />${(deal.loanAmount / 1000000).toFixed(1)}M</span>}
                      {deal.assetType && <span className="flex items-center gap-1"><Building2 size={12} />{deal.assetType}</span>}
                      {deal.propertyState && <span className="flex items-center gap-1"><MapPin size={12} />{deal.propertyState}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {deal.status === "draft" ? "Last saved" : "Submitted"}: {new Date(deal.submittedAt || deal.updatedAt || deal.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-slate-400" data-testid={`view-deal-${deal.id}`}>
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

function DealForm() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({
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
  });

  const loanAmt = parseFloat(form.loanAmount) || 0;
  const propVal = parseFloat(form.propertyValue) || 0;
  const noi = parseFloat(form.noiAnnual) || 0;
  const ltv = propVal > 0 ? ((loanAmt / propVal) * 100).toFixed(2) : "—";
  const dscr = loanAmt > 0 ? (noi / (loanAmt * 0.07)).toFixed(2) : "—";

  const { data: requiredDocs = { requiredDocuments: [] } } = useQuery<{ requiredDocuments: string[] }>({
    queryKey: ["/api/commercial/evaluate-document-rules", form.assetType, form.loanAmount, form.propertyState],
    queryFn: async () => {
      if (!form.assetType) return { requiredDocuments: ["Loan Application (1003)", "Bank Statement", "Tax Returns (2 years)", "Purchase Contract"] };
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
      if (!res.ok) return { requiredDocuments: ["Loan Application (1003)", "Bank Statement", "Tax Returns (2 years)", "Purchase Contract"] };
      return res.json();
    },
    enabled: true,
  });

  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { file: File; name: string }>>({});

  const createMut = useMutation({
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
      };

      const res = await apiRequest("POST", "/api/commercial/deals", body);
      const deal = await res.json();

      for (const [docType, { name }] of Object.entries(uploadedDocs)) {
        await apiRequest("POST", `/api/commercial/deals/${deal.id}/documents`, {
          documentType: docType,
          fileName: name,
          fileSize: 0,
          mimeType: "application/pdf",
        });
      }

      if (submit) {
        await apiRequest("POST", `/api/commercial/deals/${deal.id}/submit`);
      }

      return deal;
    },
    onSuccess: (deal, submit) => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals"] });
      toast({ title: submit ? "Deal submitted for review" : "Draft saved" });
      navigate("/commercial-deals");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = (docType: string, file: File | null) => {
    if (file) {
      setUploadedDocs(prev => ({ ...prev, [docType]: { file, name: file.name } }));
    }
  };

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="p-6 space-y-6 max-w-3xl" data-testid="deal-form-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/commercial-deals")} className="text-slate-400" data-testid="back-button">
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold text-white">Submit New Deal</h1>
      </div>

      <Card className="bg-[#1a2038] border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300">Deal Basics</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-slate-400">Deal Name *</Label>
            <Input value={form.dealName} onChange={e => update("dealName", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="deal-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400">Loan Amount ($) *</Label>
              <Input type="number" value={form.loanAmount} onChange={e => update("loanAmount", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="loan-amount" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Asset Type *</Label>
              <Select value={form.assetType} onValueChange={v => update("assetType", v)}>
                <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="asset-type"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Property Address *</Label>
            <Input value={form.propertyAddress} onChange={e => update("propertyAddress", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="property-address" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-slate-400">City</Label>
              <Input value={form.propertyCity} onChange={e => update("propertyCity", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">State</Label>
              <Select value={form.propertyState} onValueChange={v => update("propertyState", v)}>
                <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="property-state"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">ZIP</Label>
              <Input value={form.propertyZip} onChange={e => update("propertyZip", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#1a2038] border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300">Borrower Information</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400">Borrower Name *</Label>
              <Input value={form.borrowerName} onChange={e => update("borrowerName", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="borrower-name" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Entity Type *</Label>
              <Select value={form.borrowerEntityType} onValueChange={v => update("borrowerEntityType", v)}>
                <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="entity-type"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400">Credit Score</Label>
              <Input type="number" value={form.borrowerCreditScore} onChange={e => update("borrowerCreditScore", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="credit-score" />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-2 block">Has Guarantor?</Label>
              <RadioGroup value={form.hasGuarantor ? "yes" : "no"} onValueChange={v => update("hasGuarantor", v === "yes")} className="flex gap-4">
                <div className="flex items-center gap-1.5"><RadioGroupItem value="yes" id="guar-yes" /><Label htmlFor="guar-yes" className="text-xs text-slate-400">Yes</Label></div>
                <div className="flex items-center gap-1.5"><RadioGroupItem value="no" id="guar-no" /><Label htmlFor="guar-no" className="text-xs text-slate-400">No</Label></div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#1a2038] border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300">Property Metrics</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400">Property Appraisal Value ($) *</Label>
              <Input type="number" value={form.propertyValue} onChange={e => update("propertyValue", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="property-value" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Annual NOI ($)</Label>
              <Input type="number" value={form.noiAnnual} onChange={e => update("noiAnnual", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="noi-annual" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Occupancy %</Label>
            <Input type="number" value={form.occupancyPct} onChange={e => update("occupancyPct", e.target.value)} className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="occupancy" />
          </div>
          <div className="flex gap-6 p-3 rounded bg-[#0f1629] border border-slate-700/50">
            <div>
              <p className="text-xs text-slate-500">LTV (auto-calculated)</p>
              <p className={`text-sm font-medium ${ltv !== "—" && parseFloat(ltv) > 80 ? "text-red-400" : "text-white"}`} data-testid="ltv-display">{ltv}{ltv !== "—" ? "%" : ""}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">DSCR (auto-calculated)</p>
              <p className={`text-sm font-medium ${dscr !== "—" && parseFloat(dscr) < 1.25 ? "text-amber-400" : "text-white"}`} data-testid="dscr-display">{dscr}{dscr !== "—" ? "x" : ""}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#1a2038] border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-300">Required Documents</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Based on your deal ({form.assetType || "—"}, ${loanAmt ? `${(loanAmt / 1000000).toFixed(1)}M` : "—"}, {form.propertyState || "—"})
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {requiredDocs.requiredDocuments.map((docType: string) => (
            <div key={docType} className="flex items-center gap-3 p-3 rounded bg-[#0f1629] border border-slate-700/50" data-testid={`doc-req-${docType.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
              {uploadedDocs[docType] ? (
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              ) : (
                <FileText size={16} className="text-slate-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{docType}</p>
                {uploadedDocs[docType] && (
                  <p className="text-xs text-slate-500">{uploadedDocs[docType].name}</p>
                )}
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
                  onChange={e => handleFileSelect(docType, e.target.files?.[0] || null)}
                />
                <span className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  uploadedDocs[docType]
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                }`}>
                  {uploadedDocs[docType] ? "Replace" : "Upload"}
                </span>
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pb-6">
        <Button
          variant="outline"
          onClick={() => createMut.mutate(false)}
          disabled={createMut.isPending}
          className="border-slate-700 text-slate-300"
          data-testid="save-draft-button"
        >
          <Save size={14} className="mr-1" /> Save as Draft
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          onClick={() => navigate("/commercial-deals")}
          className="border-slate-700 text-slate-300"
        >
          Cancel
        </Button>
        <Button
          onClick={() => createMut.mutate(true)}
          disabled={createMut.isPending || !form.dealName || !form.loanAmount || !form.assetType}
          className="bg-blue-600 hover:bg-blue-700"
          data-testid="submit-deal-button"
        >
          <Send size={14} className="mr-1" /> Submit to Lender
        </Button>
      </div>
    </div>
  );
}

function DealDetail() {
  const params = useLocation()[0].split("/").pop();
  const [, navigate] = useLocation();

  const { data: deal, isLoading } = useQuery<any>({
    queryKey: ["/api/commercial/deals", params],
    queryFn: async () => {
      const res = await fetch(`/api/commercial/deals/${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>;
  if (!deal) return <div className="p-6"><p className="text-slate-400">Deal not found</p></div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl" data-testid="broker-deal-detail">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/commercial-deals")} className="text-slate-400" data-testid="back-button">
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold text-white">{deal.dealName || `Deal #${deal.id}`}</h1>
        {statusBadge(deal.status)}
      </div>

      <Card className="bg-[#1a2038] border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300">Deal Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-slate-500 text-xs">Loan Amount</p><p className="text-white">${deal.loanAmount ? deal.loanAmount.toLocaleString() : "N/A"}</p></div>
            <div><p className="text-slate-500 text-xs">Asset Type</p><p className="text-white">{deal.assetType || "N/A"}</p></div>
            <div><p className="text-slate-500 text-xs">Property</p><p className="text-white">{deal.propertyAddress || "N/A"}</p></div>
            <div><p className="text-slate-500 text-xs">LTV</p><p className="text-white">{deal.ltvPct != null ? `${deal.ltvPct}%` : "N/A"}</p></div>
            <div><p className="text-slate-500 text-xs">DSCR</p><p className="text-white">{deal.dscr != null ? `${deal.dscr}x` : "N/A"}</p></div>
            <div><p className="text-slate-500 text-xs">Borrower</p><p className="text-white">{deal.borrowerName || "N/A"}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Status Timeline */}
      {deal.statusHistory?.length > 0 && (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Clock size={16} /> Status Timeline</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deal.statusHistory.map((sh: any, i: number) => (
                <div key={sh.id} className="flex items-start gap-3" data-testid={`timeline-${i}`}>
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${i === 0 ? "bg-blue-500" : "bg-slate-600"}`} />
                    {i < deal.statusHistory.length - 1 && <div className="w-px h-6 bg-slate-700" />}
                  </div>
                  <div>
                    <p className="text-sm text-white">{sh.toStatus.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                    <p className="text-xs text-slate-500">{new Date(sh.createdAt).toLocaleString()}</p>
                    {sh.notes && <p className="text-xs text-slate-400 mt-0.5">{sh.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      {deal.documents?.length > 0 && (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardHeader className="pb-3"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><FileText size={16} /> Documents</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deal.documents.filter((d: any) => d.isCurrent).map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 p-2 rounded bg-[#0f1629] border border-slate-700/50">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-white">{doc.documentType}</p>
                    <p className="text-xs text-slate-500">{doc.fileName} · v{doc.version} · {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Project */}
      {deal.linkedProjectId && (
        <Card className="bg-[#1a2038] border-cyan-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowRight size={16} className="text-cyan-400" />
            <div>
              <p className="text-sm text-white">This deal has been transferred to the origination pipeline</p>
              <p className="text-xs text-slate-400">Project #{deal.linkedProjectId}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { DealsList, DealForm, DealDetail };
export default DealsList;

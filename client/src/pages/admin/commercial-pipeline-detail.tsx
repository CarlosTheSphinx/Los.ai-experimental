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
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Building2, DollarSign, MapPin, TrendingUp, User, FileText,
  AlertTriangle, CheckCircle2, XCircle, Clock, Send, RefreshCw,
  ChevronDown, ChevronUp, ArrowRight, Shield, BarChart3, Volume2,
  Pencil, X, Save, MessageSquare, Sparkles, Loader2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/phase1/status-badge";

const ASSET_TYPES = ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"];
const ENTITY_TYPES = ["Individual","LLC","Corporation","Partnership","Trust"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function formatCurrency(val: string): string {
  const num = val.replace(/[^0-9]/g, "");
  if (!num) return "";
  return parseInt(num).toLocaleString("en-US");
}
function parseCurrency(val: string): string {
  return val.replace(/[^0-9]/g, "");
}

function getStatusVariant(status?: string): "active" | "pending" | "closed" | "inactive" | "error" | "info" {
  switch (status?.toLowerCase()) {
    case "approved":
    case "transferred":
      return "active";
    case "submitted":
    case "under_review":
    case "conditional":
      return "pending";
    case "analyzed":
      return "info";
    case "rejected":
    case "no_match":
      return "error";
    default:
      return "inactive";
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    analyzed: "Analyzed",
    under_review: "Under Review",
    approved: "Approved",
    conditional: "Conditional",
    rejected: "Rejected",
    transferred: "Transferred",
    no_match: "No Match",
  };
  return labels[status] || status;
}

function VerdictDisplay({ verdict, confidence, breakdown }: { verdict: string; confidence: number; breakdown?: { fund_fit: number; deal_health: number } }) {
  const colors: Record<string, { bg: string; text: string; icon: any }> = {
    pass: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-500", icon: CheckCircle2 },
    conditional: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-500", icon: AlertTriangle },
    fail: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-500", icon: XCircle },
  };
  const c = colors[verdict] || colors.conditional;
  const Icon = c.icon;

  return (
    <div className={`rounded-lg border p-4 ${c.bg}`} data-testid="ai-verdict">
      <div className="flex items-center gap-3 mb-3">
        <Icon size={24} className={c.text} />
        <div>
          <p className={`text-lg font-semibold ${c.text}`}>
            {verdict.charAt(0).toUpperCase() + verdict.slice(1)}
          </p>
          <p className="text-xs text-muted-foreground">AI Verdict</p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-2xl font-bold ${c.text}`} data-testid="confidence-score">{confidence}%</p>
          <p className="text-xs text-muted-foreground">Confidence</p>
        </div>
      </div>
      {breakdown && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Fund Fit: {breakdown.fund_fit}%</span>
          <span>Deal Health: {breakdown.deal_health}%</span>
        </div>
      )}
    </div>
  );
}

export default function CommercialPipelineDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [statusNotes, setStatusNotes] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedFundId, setSelectedFundId] = useState("");
  const [showFlaws, setShowFlaws] = useState(true);
  const [showStrengths, setShowStrengths] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [noteContent, setNoteContent] = useState("");

  const dealId = params.id;

  const { data: deal, isLoading } = useQuery<any>({
    queryKey: ["/api/commercial/deals", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/commercial/deals/${dealId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deal");
      return res.json();
    },
  });

  const { data: allFunds = [] } = useQuery<any[]>({
    queryKey: ["/api/commercial/funds"],
  });

  const updateStatusMut = useMutation({
    mutationFn: async ({ status, notes }: { status: string; notes: string }) => {
      return apiRequest("POST", `/api/commercial/deals/${dealId}/update-status`, { status, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", dealId] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/portfolio-summary"] });
      toast({ title: "Status updated" });
      setStatusNotes("");
      setSelectedStatus("");
    },
  });

  const sendToFundMut = useMutation({
    mutationFn: async ({ fundId, notes }: { fundId: number; notes: string }) => {
      return apiRequest("POST", `/api/commercial/deals/${dealId}/send-to-fund`, { fundId, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", dealId] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals"] });
      toast({ title: "Deal sent to fund" });
      setSelectedFundId("");
    },
  });

  const transferMut = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/commercial/deals/${dealId}/transfer`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", dealId] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals"] });
      toast({ title: "Deal transferred to origination pipeline" });
    },
  });

  const reanalyzeMut = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/commercial/deals/${dealId}/reanalyze`);
    },
    onSuccess: () => {
      toast({ title: "AI analysis started", description: "This may take a moment. The page will refresh automatically." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", dealId] });
      }, 8000);
    },
  });

  const addNoteMut = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/commercial/deals/${dealId}/notes`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", dealId] });
      setNoteContent("");
      toast({ title: "Note added" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  const updateDealMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/commercial/deals/${dealId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", dealId] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals"] });
      setIsEditing(false);
      toast({ title: "Deal updated" });
    },
    onError: () => toast({ title: "Failed to update deal", variant: "destructive" }),
  });

  const startEdit = () => {
    if (!deal) return;
    setEditData({
      dealName: deal.dealName || "",
      loanAmount: deal.loanAmount?.toString() || "",
      assetType: deal.assetType || "",
      propertyAddress: deal.propertyAddress || "",
      propertyCity: deal.propertyCity || "",
      propertyState: deal.propertyState || "",
      propertyValue: deal.propertyValue?.toString() || "",
      noiAnnual: deal.noiAnnual?.toString() || "",
      occupancyPct: deal.occupancyPct?.toString() || "",
      borrowerName: deal.borrowerName || "",
      borrowerEntityType: deal.borrowerEntityType || "",
      borrowerCreditScore: deal.borrowerCreditScore?.toString() || "",
    });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(editData)) {
      if (v !== "" && v !== null && v !== undefined) {
        cleaned[k] = ["loanAmount", "propertyValue", "noiAnnual", "occupancyPct", "borrowerCreditScore"].includes(k)
          ? parseInt(v as string) || undefined
          : v;
      }
    }
    updateDealMut.mutate(cleaned);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Deal not found</p>
      </div>
    );
  }

  const analysis = deal.analysis;
  const rawFeedback = analysis?.agent3Feedback as any;
  const normalizeVerdict = (v: string) => {
    if (!v) return "conditional";
    const l = v.toLowerCase().trim();
    if (["pass", "approved", "accept", "strong"].includes(l)) return "pass";
    if (["fail", "reject", "denied", "decline"].includes(l)) return "fail";
    return "conditional";
  };
  const feedback = rawFeedback ? {
    overall_verdict: normalizeVerdict(rawFeedback.overall_verdict || rawFeedback.overallVerdict || rawFeedback.verdict || analysis?.overallVerdict),
    confidence_score: rawFeedback.confidence_score ?? rawFeedback.confidenceScore ?? rawFeedback.confidence ?? analysis?.confidenceScore ?? 50,
    confidence_breakdown: rawFeedback.confidence_breakdown || rawFeedback.confidenceBreakdown,
    key_flaws: rawFeedback.key_flaws || rawFeedback.keyFlaws || rawFeedback.flaws || rawFeedback.issues || [],
    strengths: rawFeedback.strengths || rawFeedback.positives || [],
    fund_recommendations: rawFeedback.fund_recommendations || rawFeedback.fundRecommendations || rawFeedback.recommendations || [],
    next_steps: rawFeedback.next_steps || rawFeedback.nextSteps || rawFeedback.action_items || [],
  } : null;

  const notes = (deal.brokerNotes || []) as Array<{ content: string; createdAt: string; authorName: string }>;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto" data-testid="deal-detail-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/commercial-pipeline")}
            className="text-muted-foreground hover:text-foreground"
            data-testid="back-button"
          >
            <ArrowLeft size={16} className="mr-1" /> Back
          </Button>
          <h1 className="text-xl font-display font-bold" data-testid="deal-title">
            {deal.dealName || `Deal #${deal.id}`}
          </h1>
          <StatusBadge variant={getStatusVariant(deal.status)} label={getStatusLabel(deal.status)} />
        </div>
        <Button
          onClick={() => reanalyzeMut.mutate()}
          disabled={reanalyzeMut.isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          data-testid="run-ai-analysis-header-button"
        >
          {reanalyzeMut.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {reanalyzeMut.isPending ? "Analyzing..." : (analysis ? "Re-run AI Analysis" : "Run AI Analysis")}
        </Button>
      </div>

      <Card className="bg-card border shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 size={16} /> Deal Summary</CardTitle>
          {!isEditing ? (
            <Button variant="ghost" size="sm" onClick={startEdit} className="text-muted-foreground hover:text-foreground h-7 px-2" data-testid="edit-summary-button">
              <Pencil size={12} className="mr-1" /> Edit
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="text-muted-foreground h-7 px-2" data-testid="cancel-edit-button">
                <X size={12} className="mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={updateDealMut.isPending} className="h-7 px-2" data-testid="save-edit-button">
                <Save size={12} className="mr-1" /> {updateDealMut.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="col-span-2 sm:col-span-3">
                <Label className="text-muted-foreground text-xs">Deal Name</Label>
                <Input value={editData.dealName} onChange={e => setEditData({ ...editData, dealName: e.target.value })} className="text-sm h-8 mt-1" data-testid="edit-deal-name" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Loan Amount ($)</Label>
                <Input type="text" inputMode="numeric" value={formatCurrency(editData.loanAmount)} onChange={e => setEditData({ ...editData, loanAmount: parseCurrency(e.target.value) })} className="text-sm h-8 mt-1" data-testid="edit-loan-amount" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Asset Type</Label>
                <Select value={editData.assetType} onValueChange={v => setEditData({ ...editData, assetType: v })}>
                  <SelectTrigger className="text-sm h-8 mt-1" data-testid="edit-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Property Value ($)</Label>
                <Input type="text" inputMode="numeric" value={formatCurrency(editData.propertyValue)} onChange={e => setEditData({ ...editData, propertyValue: parseCurrency(e.target.value) })} className="text-sm h-8 mt-1" data-testid="edit-property-value" />
              </div>
              <div className="col-span-2">
                <Label className="text-muted-foreground text-xs">Property Address</Label>
                <Input value={editData.propertyAddress} onChange={e => setEditData({ ...editData, propertyAddress: e.target.value })} className="text-sm h-8 mt-1" data-testid="edit-address" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">State</Label>
                <Select value={editData.propertyState} onValueChange={v => setEditData({ ...editData, propertyState: v })}>
                  <SelectTrigger className="text-sm h-8 mt-1" data-testid="edit-state"><SelectValue /></SelectTrigger>
                  <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">NOI Annual ($)</Label>
                <Input type="text" inputMode="numeric" value={formatCurrency(editData.noiAnnual)} onChange={e => setEditData({ ...editData, noiAnnual: parseCurrency(e.target.value) })} className="text-sm h-8 mt-1" data-testid="edit-noi" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Occupancy %</Label>
                <Input type="number" value={editData.occupancyPct} onChange={e => setEditData({ ...editData, occupancyPct: e.target.value })} className="text-sm h-8 mt-1" data-testid="edit-occupancy" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Borrower Name</Label>
                <Input value={editData.borrowerName} onChange={e => setEditData({ ...editData, borrowerName: e.target.value })} className="text-sm h-8 mt-1" data-testid="edit-borrower" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Entity Type</Label>
                <Select value={editData.borrowerEntityType} onValueChange={v => setEditData({ ...editData, borrowerEntityType: v })}>
                  <SelectTrigger className="text-sm h-8 mt-1" data-testid="edit-entity-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Credit Score</Label>
                <Input type="number" value={editData.borrowerCreditScore} onChange={e => setEditData({ ...editData, borrowerCreditScore: e.target.value })} className="text-sm h-8 mt-1" data-testid="edit-credit-score" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Loan Amount</p>
                <p className="text-foreground font-medium" data-testid="loan-amount">
                  ${deal.loanAmount ? (deal.loanAmount).toLocaleString() : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Asset Type</p>
                <p className="text-foreground" data-testid="asset-type">{deal.assetType || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Property</p>
                <p className="text-foreground">{deal.propertyAddress || "N/A"}{deal.propertyState ? `, ${deal.propertyState}` : ""}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">LTV</p>
                <p className="text-foreground">{deal.ltvPct != null ? `${deal.ltvPct}%` : "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">DSCR</p>
                <p className="text-foreground">{deal.dscr != null ? `${deal.dscr}x` : "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Property Value</p>
                <p className="text-foreground">${deal.propertyValue ? (deal.propertyValue).toLocaleString() : "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Borrower</p>
                <p className="text-foreground">{deal.borrowerName || "N/A"} {deal.borrowerEntityType ? `(${deal.borrowerEntityType})` : ""}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Credit Score</p>
                <p className="text-foreground">{deal.borrowerCreditScore || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Broker</p>
                <p className="text-foreground">{deal.brokerName || deal.brokerEmail || "N/A"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {deal.dealStoryTranscript && (
        <Card className="bg-card border shadow-sm" data-testid="deal-story-section">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Volume2 size={16} className="text-amber-500" /> Deal Story
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 rounded bg-muted/50 border">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" data-testid="deal-story-text">
                {deal.dealStoryTranscript}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <BarChart3 size={16} /> AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback && (
            <>
              <VerdictDisplay
                verdict={analysis.overallVerdict || feedback.overall_verdict || "conditional"}
                confidence={analysis.confidenceScore ?? feedback.confidence_score ?? 50}
                breakdown={feedback.confidence_breakdown}
              />

              {Array.isArray(feedback.key_flaws) && feedback.key_flaws.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowFlaws(!showFlaws)}
                    className="flex items-center gap-2 text-sm font-medium text-foreground mb-2 w-full"
                    data-testid="toggle-flaws"
                  >
                    <AlertTriangle size={14} className="text-amber-500" />
                    Key Flaws ({feedback.key_flaws.length})
                    {showFlaws ? <ChevronUp size={14} className="ml-auto text-muted-foreground" /> : <ChevronDown size={14} className="ml-auto text-muted-foreground" />}
                  </button>
                  {showFlaws && (
                    <div className="space-y-2">
                      {feedback.key_flaws.map((flaw: any, i: number) => {
                        const flawObj = typeof flaw === "string" ? { flaw, severity: "medium", detail: flaw } : flaw;
                        const severity = String(flawObj.severity || flawObj.level || "medium");
                        const title = String(flawObj.flaw || flawObj.issue || flawObj.title || flawObj.description || "Issue");
                        const detail = String(flawObj.detail || flawObj.description || flawObj.message || "");
                        const remediation = flawObj.remediation || flawObj.fix || flawObj.suggestion;
                        return (
                          <div key={i} className="rounded-lg bg-muted/50 p-3 border" data-testid={`flaw-${i}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`text-[10px] ${
                                severity === "critical" ? "bg-red-500/20 text-red-500" :
                                severity === "high" ? "bg-amber-500/20 text-amber-500" :
                                "bg-muted text-muted-foreground"
                              }`}>{severity}</Badge>
                              <span className="text-sm font-medium text-foreground">{title}</span>
                            </div>
                            {detail && detail !== title && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
                            {remediation && (
                              <p className="text-xs text-blue-500 mt-1">&rarr; {String(remediation)}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {Array.isArray(feedback.strengths) && feedback.strengths.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowStrengths(!showStrengths)}
                    className="flex items-center gap-2 text-sm font-medium text-foreground mb-2 w-full"
                    data-testid="toggle-strengths"
                  >
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    Strengths ({feedback.strengths.length})
                    {showStrengths ? <ChevronUp size={14} className="ml-auto text-muted-foreground" /> : <ChevronDown size={14} className="ml-auto text-muted-foreground" />}
                  </button>
                  {showStrengths && (
                    <div className="space-y-2">
                      {feedback.strengths.map((s: any, i: number) => {
                        const sObj = typeof s === "string" ? { strength: s, detail: "" } : s;
                        const title = String(sObj.strength || sObj.title || sObj.name || sObj.positive || "Strength");
                        const detail = String(sObj.detail || sObj.description || sObj.explanation || "");
                        return (
                          <div key={i} className="rounded-lg bg-muted/50 p-3 border border-emerald-500/20" data-testid={`strength-${i}`}>
                            <span className="text-sm text-emerald-500">{title}</span>
                            {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {Array.isArray(feedback.fund_recommendations) && feedback.fund_recommendations.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Building2 size={14} /> Fund Recommendations
                  </p>
                  <div className="space-y-2">
                    {feedback.fund_recommendations.map((fr: any, i: number) => {
                      const frObj = typeof fr === "string" ? { fund_name: fr, recommendation: "", match_score: 0 } : fr;
                      return (
                        <div key={i} className="rounded-lg bg-muted/50 p-3 border flex items-center gap-3" data-testid={`fund-rec-${i}`}>
                          <div className="flex-1">
                            <p className="text-sm text-foreground">{String(frObj.fund_name || frObj.fundName || frObj.name || "Fund")}</p>
                            <p className="text-xs text-muted-foreground mt-1">{String(frObj.recommendation || frObj.reason || frObj.notes || "")}</p>
                          </div>
                          {(frObj.match_score || frObj.matchScore) != null && (
                            <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">
                              {frObj.match_score || frObj.matchScore}% match
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {Array.isArray(feedback.next_steps) && feedback.next_steps.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Next Steps</p>
                  <ul className="space-y-1">
                    {feedback.next_steps.map((step: any, i: number) => {
                      const text = typeof step === "string" ? step : String(step.step || step.action || step.description || step.text || JSON.stringify(step));
                      return (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-blue-500 mt-0.5">&bull;</span> {text}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          {!feedback && !reanalyzeMut.isPending && (
            <div className="text-center py-6">
              <BarChart3 size={32} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No AI analysis available yet for this deal.</p>
              <Button
                onClick={() => reanalyzeMut.mutate()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="run-ai-analysis-button"
              >
                <Sparkles size={14} className="mr-2" /> Run AI Analysis
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                The 3-agent pipeline will validate the deal, match it against funds, and generate a recommendation.
              </p>
            </div>
          )}

          {!feedback && reanalyzeMut.isPending && (
            <div className="text-center py-6">
              <Loader2 size={24} className="mx-auto text-blue-500 animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">AI analysis is running...</p>
              <p className="text-xs text-muted-foreground mt-1">This may take a moment. The page will refresh automatically.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border shadow-sm" data-testid="notes-section">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <MessageSquare size={16} /> Notes & Activity ({notes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="Add a note about this deal..."
              className="min-h-[60px] text-sm flex-1"
              data-testid="note-input"
            />
            <Button
              size="sm"
              onClick={() => noteContent.trim() && addNoteMut.mutate(noteContent.trim())}
              disabled={!noteContent.trim() || addNoteMut.isPending}
              className="self-end"
              data-testid="add-note-button"
            >
              {addNoteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>

          {notes.length > 0 ? (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {notes.map((note, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border" data-testid={`note-${i}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{note.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString()} {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">No notes yet. Add a note to start a conversation about this deal.</p>
          )}
        </CardContent>
      </Card>

      {deal.documents?.length > 0 && (
        <Card className="bg-card border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <FileText size={16} /> Documents ({deal.documents.filter((d: any) => d.isCurrent).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deal.documents.filter((d: any) => d.isCurrent).map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 p-2 rounded bg-muted/50 border" data-testid={`document-${doc.id}`}>
                  <FileText size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{doc.documentType}</p>
                    <p className="text-xs text-muted-foreground">{doc.fileName} &middot; v{doc.version} &middot; {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Uploaded</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {deal.statusHistory?.length > 0 && (
        <Card className="bg-card border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock size={16} /> Status History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deal.statusHistory.map((sh: any) => (
                <div key={sh.id} className="flex items-center gap-3 text-xs" data-testid={`status-${sh.id}`}>
                  <span className="text-muted-foreground w-28 shrink-0">{new Date(sh.createdAt).toLocaleString()}</span>
                  {sh.fromStatus && <Badge variant="outline" className="text-[10px]">{sh.fromStatus}</Badge>}
                  {sh.fromStatus && <ArrowRight size={10} className="text-muted-foreground" />}
                  <Badge variant="outline" className="text-[10px]">{sh.toStatus}</Badge>
                  {sh.notes && <span className="text-muted-foreground truncate">&mdash; {sh.notes}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!["transferred", "rejected"].includes(deal.status) && (
        <Card className="bg-card border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allFunds.length > 0 && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Send to Fund</label>
                  <Select value={selectedFundId} onValueChange={setSelectedFundId}>
                    <SelectTrigger className="text-sm" data-testid="select-fund">
                      <SelectValue placeholder="Select fund..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allFunds.map((f: any) => (
                        <SelectItem key={f.id} value={String(f.id)}>{f.fundName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!selectedFundId || sendToFundMut.isPending}
                  onClick={() => sendToFundMut.mutate({ fundId: parseInt(selectedFundId), notes: "" })}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="send-to-fund-button"
                >
                  <Send size={14} className="mr-1" /> Send
                </Button>
              </div>
            )}

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Update Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="text-sm" data-testid="select-status">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="conditional">Conditional</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <Textarea
                  value={statusNotes}
                  onChange={e => setStatusNotes(e.target.value)}
                  className="text-sm min-h-[38px] h-[38px]"
                  placeholder="Optional notes..."
                  data-testid="status-notes"
                />
              </div>
              <Button
                size="sm"
                disabled={!selectedStatus || updateStatusMut.isPending}
                onClick={() => updateStatusMut.mutate({ status: selectedStatus, notes: statusNotes })}
                data-testid="update-status-button"
              >
                Update
              </Button>
            </div>

            {["approved", "conditional", "under_review"].includes(deal.status) && (
              <div className="pt-3 border-t">
                <Button
                  onClick={() => transferMut.mutate()}
                  disabled={transferMut.isPending}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white w-full"
                  data-testid="transfer-button"
                >
                  <ArrowRight size={14} className="mr-2" />
                  Transfer to Origination Pipeline
                </Button>
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  Creates a new project in the origination system with all deal data
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {deal.fundSubmissions?.length > 0 && (
        <Card className="bg-card border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Fund Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deal.fundSubmissions.map((fs: any) => (
                <div key={fs.id} className="flex items-center gap-3 p-2 rounded bg-muted/50 border" data-testid={`fund-submission-${fs.id}`}>
                  <Building2 size={14} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{fs.fundName || `Fund #${fs.fundId}`}</p>
                    <p className="text-xs text-muted-foreground">Submitted {new Date(fs.submittedAt).toLocaleDateString()}</p>
                  </div>
                  <Badge className={`text-[10px] ${
                    fs.fundResponseStatus === "approved" ? "bg-emerald-500/20 text-emerald-500" :
                    fs.fundResponseStatus === "rejected" ? "bg-red-500/20 text-red-500" :
                    "bg-amber-500/20 text-amber-500"
                  }`}>{fs.fundResponseStatus}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

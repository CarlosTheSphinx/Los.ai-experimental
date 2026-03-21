import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Building2, DollarSign, MapPin, TrendingUp, User, FileText,
  AlertTriangle, CheckCircle2, XCircle, Clock, Send, RefreshCw,
  ChevronDown, ChevronUp, ArrowRight, Shield, BarChart3,
} from "lucide-react";

function VerdictDisplay({ verdict, confidence, breakdown }: { verdict: string; confidence: number; breakdown?: { fund_fit: number; deal_health: number } }) {
  const colors: Record<string, { bg: string; text: string; icon: any }> = {
    pass: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-400", icon: CheckCircle2 },
    conditional: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400", icon: AlertTriangle },
    fail: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-400", icon: XCircle },
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
          <p className="text-xs text-slate-400">AI Verdict</p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-2xl font-bold ${c.text}`} data-testid="confidence-score">{confidence}%</p>
          <p className="text-xs text-slate-400">Confidence</p>
        </div>
      </div>
      {breakdown && (
        <div className="flex gap-4 text-xs text-slate-400">
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
      toast({ title: "AI re-analysis started" });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/commercial/deals", dealId] });
      }, 5000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6">
        <p className="text-slate-400">Deal not found</p>
      </div>
    );
  }

  const analysis = deal.analysis;
  const feedback = analysis?.agent3Feedback as any;
  const matching = analysis?.agent2Matching as any;

  return (
    <div className="p-6 space-y-6 max-w-5xl" data-testid="deal-detail-page">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/commercial-pipeline")}
          className="text-slate-400 hover:text-white"
          data-testid="back-button"
        >
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold text-white" data-testid="deal-title">
          {deal.dealName || `Deal #${deal.id}`}
        </h1>
        <Badge className={`text-xs ${
          deal.status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
          deal.status === "rejected" ? "bg-red-500/20 text-red-400" :
          deal.status === "transferred" ? "bg-cyan-500/20 text-cyan-400" :
          "bg-slate-500/20 text-slate-400"
        }`}>
          {deal.status}
        </Badge>
      </div>

      {/* Deal Summary */}
      <Card className="bg-[#1a2038] border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-300">Deal Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs mb-1">Loan Amount</p>
              <p className="text-white font-medium" data-testid="loan-amount">
                ${deal.loanAmount ? (deal.loanAmount).toLocaleString() : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Asset Type</p>
              <p className="text-white" data-testid="asset-type">{deal.assetType || "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Property</p>
              <p className="text-white">{deal.propertyAddress || "N/A"}{deal.propertyState ? `, ${deal.propertyState}` : ""}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">LTV</p>
              <p className="text-white">{deal.ltvPct != null ? `${deal.ltvPct}%` : "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">DSCR</p>
              <p className="text-white">{deal.dscr != null ? `${deal.dscr}x` : "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Property Value</p>
              <p className="text-white">${deal.propertyValue ? (deal.propertyValue).toLocaleString() : "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Borrower</p>
              <p className="text-white">{deal.borrowerName || "N/A"} {deal.borrowerEntityType ? `(${deal.borrowerEntityType})` : ""}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Credit Score</p>
              <p className="text-white">{deal.borrowerCreditScore || "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Broker</p>
              <p className="text-white">{deal.brokerName || deal.brokerEmail || "N/A"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis */}
      {analysis && (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <BarChart3 size={16} /> AI Analysis
              <Button
                variant="ghost"
                size="sm"
                onClick={() => reanalyzeMut.mutate()}
                disabled={reanalyzeMut.isPending}
                className="ml-auto text-xs text-slate-400"
                data-testid="reanalyze-button"
              >
                <RefreshCw size={12} className={`mr-1 ${reanalyzeMut.isPending ? "animate-spin" : ""}`} /> Re-analyze
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback && (
              <>
                <VerdictDisplay
                  verdict={analysis.overallVerdict || feedback.overall_verdict}
                  confidence={analysis.confidenceScore || feedback.confidence_score}
                  breakdown={feedback.confidence_breakdown}
                />

                {/* Key Flaws */}
                {feedback.key_flaws?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowFlaws(!showFlaws)}
                      className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2 w-full"
                      data-testid="toggle-flaws"
                    >
                      <AlertTriangle size={14} className="text-amber-400" />
                      Key Flaws ({feedback.key_flaws.length})
                      {showFlaws ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                    </button>
                    {showFlaws && (
                      <div className="space-y-2">
                        {feedback.key_flaws.map((flaw: any, i: number) => (
                          <div key={i} className="rounded-lg bg-[#0f1629] p-3 border border-slate-700/50" data-testid={`flaw-${i}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`text-[10px] ${
                                flaw.severity === "critical" ? "bg-red-500/20 text-red-400" :
                                flaw.severity === "high" ? "bg-amber-500/20 text-amber-400" :
                                "bg-slate-500/20 text-slate-400"
                              }`}>{flaw.severity}</Badge>
                              <span className="text-sm font-medium text-white">{flaw.flaw}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{flaw.detail}</p>
                            {flaw.remediation && (
                              <p className="text-xs text-blue-400 mt-1">→ {flaw.remediation}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Strengths */}
                {feedback.strengths?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowStrengths(!showStrengths)}
                      className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2 w-full"
                      data-testid="toggle-strengths"
                    >
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      Strengths ({feedback.strengths.length})
                      {showStrengths ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                    </button>
                    {showStrengths && (
                      <div className="space-y-2">
                        {feedback.strengths.map((s: any, i: number) => (
                          <div key={i} className="rounded-lg bg-[#0f1629] p-3 border border-emerald-500/20" data-testid={`strength-${i}`}>
                            <span className="text-sm text-emerald-400">{s.strength}</span>
                            <p className="text-xs text-slate-400 mt-1">{s.detail}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Fund Recommendations */}
                {feedback.fund_recommendations?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      <Building2 size={14} /> Fund Recommendations
                    </p>
                    <div className="space-y-2">
                      {feedback.fund_recommendations.map((fr: any, i: number) => (
                        <div key={i} className="rounded-lg bg-[#0f1629] p-3 border border-slate-700/50 flex items-center gap-3" data-testid={`fund-rec-${i}`}>
                          <div className="flex-1">
                            <p className="text-sm text-white">{fr.fund_name}</p>
                            <p className="text-xs text-slate-400 mt-1">{fr.recommendation}</p>
                          </div>
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                            {fr.match_score}% match
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Steps */}
                {feedback.next_steps?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2">Next Steps</p>
                    <ul className="space-y-1">
                      {feedback.next_steps.map((step: string, i: number) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-blue-400 mt-0.5">•</span> {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {!feedback && (
              <p className="text-sm text-slate-400">AI analysis is processing or not yet available.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      {deal.documents?.length > 0 && (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <FileText size={16} /> Documents ({deal.documents.filter((d: any) => d.isCurrent).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deal.documents.filter((d: any) => d.isCurrent).map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 p-2 rounded bg-[#0f1629] border border-slate-700/50" data-testid={`document-${doc.id}`}>
                  <FileText size={14} className="text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{doc.documentType}</p>
                    <p className="text-xs text-slate-500">{doc.fileName} · v{doc.version} · {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">Uploaded</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status History */}
      {deal.statusHistory?.length > 0 && (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <Clock size={16} /> Status History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deal.statusHistory.map((sh: any) => (
                <div key={sh.id} className="flex items-center gap-3 text-xs" data-testid={`status-${sh.id}`}>
                  <span className="text-slate-500 w-28 shrink-0">{new Date(sh.createdAt).toLocaleString()}</span>
                  {sh.fromStatus && <Badge variant="outline" className="text-[10px]">{sh.fromStatus}</Badge>}
                  {sh.fromStatus && <ArrowRight size={10} className="text-slate-500" />}
                  <Badge variant="outline" className="text-[10px]">{sh.toStatus}</Badge>
                  {sh.notes && <span className="text-slate-400 truncate">— {sh.notes}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {!["transferred", "rejected"].includes(deal.status) && (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-300">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Send to Fund */}
            {allFunds.length > 0 && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 mb-1 block">Send to Fund</label>
                  <Select value={selectedFundId} onValueChange={setSelectedFundId}>
                    <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="select-fund">
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
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="send-to-fund-button"
                >
                  <Send size={14} className="mr-1" /> Send
                </Button>
              </div>
            )}

            {/* Update Status */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Update Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="bg-[#0f1629] border-slate-700 text-white text-sm" data-testid="select-status">
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
                <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                <Textarea
                  value={statusNotes}
                  onChange={e => setStatusNotes(e.target.value)}
                  className="bg-[#0f1629] border-slate-700 text-white text-sm min-h-[38px] h-[38px]"
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

            {/* Transfer to Origination */}
            {["approved", "conditional", "under_review"].includes(deal.status) && (
              <div className="pt-3 border-t border-slate-700/50">
                <Button
                  onClick={() => transferMut.mutate()}
                  disabled={transferMut.isPending}
                  className="bg-cyan-600 hover:bg-cyan-700 w-full"
                  data-testid="transfer-button"
                >
                  <ArrowRight size={14} className="mr-2" />
                  Transfer to Origination Pipeline
                </Button>
                <p className="text-xs text-slate-500 mt-1 text-center">
                  Creates a new project in the origination system with all deal data
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fund Submissions */}
      {deal.fundSubmissions?.length > 0 && (
        <Card className="bg-[#1a2038] border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-300">Fund Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deal.fundSubmissions.map((fs: any) => (
                <div key={fs.id} className="flex items-center gap-3 p-2 rounded bg-[#0f1629] border border-slate-700/50" data-testid={`fund-submission-${fs.id}`}>
                  <Building2 size={14} className="text-slate-400" />
                  <div className="flex-1">
                    <p className="text-sm text-white">{fs.fundName || `Fund #${fs.fundId}`}</p>
                    <p className="text-xs text-slate-500">Submitted {new Date(fs.submittedAt).toLocaleDateString()}</p>
                  </div>
                  <Badge className={`text-[10px] ${
                    fs.fundResponseStatus === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                    fs.fundResponseStatus === "rejected" ? "bg-red-500/20 text-red-400" :
                    "bg-amber-500/20 text-amber-400"
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

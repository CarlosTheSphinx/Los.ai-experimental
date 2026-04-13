import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Brain,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Mail,
  Pencil,
  Copy,
  Check,
  Save,
  X,
  XCircle,
  FileText,
  ShieldCheck,
  Shield,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  User,
  Calendar,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { cn, formatDate, formatDateTime, formatTimestamp } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AgentCommunication {
  id: number;
  projectId: number;
  agentRunId: number | null;
  recipientType: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  subject: string | null;
  body: string | null;
  htmlBody: string | null;
  priority: string | null;
  status: string | null;
  findingIds: any | null;
  suggestedFollowUpDate: string | null;
  internalNotes: string | null;
  editedBody: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  sentAt: string | null;
  sentVia: string | null;
  createdAt: string;
}

const DECISION_OPTIONS = [
  { value: "approve", label: "Approve", color: "bg-emerald-600 hover:bg-emerald-700", icon: CheckCircle2 },
  { value: "conditional", label: "Conditional", color: "bg-amber-600 hover:bg-amber-700", icon: AlertTriangle },
  { value: "deny", label: "Deny", color: "bg-red-600 hover:bg-red-700", icon: XCircle },
  { value: "at_risk", label: "At Risk", color: "bg-orange-600 hover:bg-orange-700", icon: AlertCircle },
];

function getStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case "on_track": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "at_risk": return "text-orange-700 bg-orange-50 border-orange-200";
    case "conditional": return "text-amber-700 bg-amber-50 border-amber-200";
    case "denied": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-slate-700 bg-slate-50 border-slate-200";
  }
}

function getSeverityStyle(severity: string) {
  switch (severity?.toLowerCase()) {
    case "critical": return { bg: "bg-red-50 border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-800 border-red-200" };
    case "high": return { bg: "bg-orange-50 border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-800 border-orange-200" };
    case "medium": return { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-800 border-amber-200" };
    case "low": return { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-800 border-blue-200" };
    default: return { bg: "bg-slate-50 border-slate-200", text: "text-slate-700", badge: "bg-slate-100 text-slate-800 border-slate-200" };
  }
}

function getComplianceIcon(status: string) {
  switch (status?.toLowerCase()) {
    case "compliant": return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "non_compliant": return <XCircle className="h-4 w-4 text-red-600" />;
    case "waiver_required": return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case "data_insufficient": return <AlertCircle className="h-4 w-4 text-slate-400" />;
    default: return <Minus className="h-4 w-4 text-slate-400" />;
  }
}

function getDecisionStyle(decision: string | null) {
  switch (decision) {
    case "approve": return { bg: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Approved" };
    case "conditional": return { bg: "bg-amber-100 text-amber-800 border-amber-200", label: "Conditional" };
    case "deny": return { bg: "bg-red-100 text-red-800 border-red-200", label: "Denied" };
    case "at_risk": return { bg: "bg-orange-100 text-orange-800 border-orange-200", label: "At Risk" };
    default: return { bg: "bg-slate-100 text-slate-800 border-slate-200", label: "Pending Review" };
  }
}

function RiskBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function parseCommBody(comm: AgentCommunication): { subject: string; body: string } {
  const rawBody = comm.editedBody || comm.body || "";
  try {
    const trimmed = rawBody.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(trimmed);
    return { subject: parsed.subject || comm.subject || "No Subject", body: parsed.body || rawBody };
  } catch {
    return { subject: comm.subject || "No Subject", body: rawBody };
  }
}

function InlineCommunicationCard({
  comm,
  dealId,
}: {
  comm: AgentCommunication;
  dealId: string;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [copied, setCopied] = useState(false);

  const parsed = parseCommBody(comm);

  const startEditing = () => {
    setEditSubject(parsed.subject);
    setEditBody(parsed.body);
    setIsEditing(true);
  };

  const approveComm = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/projects/${dealId}/agent-communications/${comm.id}/approve`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${dealId}/agent-communications`] });
      const digestMsg = data?.digest?.queued ? " Queued for next digest." : "";
      toast({ title: `Communication approved.${digestMsg}` });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const editComm = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/projects/${dealId}/agent-communications/${comm.id}`, {
        body: editBody,
        subject: editSubject,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${dealId}/agent-communications`] });
      setIsEditing(false);
      toast({ title: "Communication updated" });
    },
    onError: () => toast({ title: "Failed to save changes", variant: "destructive" }),
  });

  const discardComm = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/projects/${dealId}/agent-communications/${comm.id}/reject`, {
        reason: "Discarded by user",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${dealId}/agent-communications`] });
      toast({ title: "Communication discarded" });
    },
    onError: () => toast({ title: "Failed to discard", variant: "destructive" }),
  });

  const copyBody = () => {
    navigator.clipboard.writeText(parsed.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="rounded-lg border bg-blue-50/20 border-blue-200/50 p-4 space-y-2" data-testid={`comm-card-${comm.id}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Mail className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">Drafted Communication</span>
            {comm.status && comm.status !== "draft" && (
              <Badge variant="secondary" className="text-[11px]" data-testid={`badge-status-${comm.id}`}>{comm.status}</Badge>
            )}
            {comm.priority && comm.priority !== "routine" && (
              <Badge variant={comm.priority === "high" || comm.priority === "urgent" ? "destructive" : "secondary"} className="text-[11px]" data-testid={`badge-priority-${comm.id}`}>
                {comm.priority}
              </Badge>
            )}
          </div>
          {isEditing ? (
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              className="text-sm mt-2"
              data-testid={`input-edit-subject-${comm.id}`}
            />
          ) : (
            <p className="text-sm font-medium mt-1" data-testid={`comm-subject-${comm.id}`}>{parsed.subject}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">To: {comm.recipientType || "borrower"}{comm.recipientName ? ` — ${comm.recipientName}` : ""}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isEditing ? (
            <>
              <Button size="sm" variant="default" onClick={() => editComm.mutate()} disabled={editComm.isPending} data-testid={`button-save-comm-${comm.id}`}>
                {editComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(false)} data-testid={`button-cancel-edit-${comm.id}`}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" onClick={startEditing} data-testid={`button-edit-comm-${comm.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" onClick={copyBody} data-testid={`button-copy-comm-${comm.id}`}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              {comm.status === "draft" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => approveComm.mutate()} disabled={approveComm.isPending} data-testid={`button-approve-comm-${comm.id}`}>
                    {approveComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                    Approve
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => discardComm.mutate()} disabled={discardComm.isPending} data-testid={`button-discard-comm-${comm.id}`}>
                    {discardComm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <Textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          className="text-sm min-h-[100px] resize-y"
          data-testid={`textarea-edit-body-${comm.id}`}
        />
      ) : (
        <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-white/60 rounded-md p-3 max-h-48 overflow-y-auto" data-testid={`comm-body-${comm.id}`}>
          {parsed.body}
        </div>
      )}
    </div>
  );
}

function FindingSection({
  finding,
  projectId,
  dealId,
  communications,
  isLatest,
}: {
  finding: any;
  projectId: string;
  dealId: string;
  communications: AgentCommunication[];
  isLatest: boolean;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(isLatest);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(
    new Set(isLatest ? ["health", "policy", "risk", "actions"] : [])
  );

  const raw = finding?.rawOutput || {};
  const report = raw.internal_report || raw.internalReport || raw;
  const policyFindings = report.policy_findings || finding?.policyFindings || [];
  const riskAssessment = report.risk_assessment || {};
  const dealHealth = report.deal_health || finding?.dealHealthSummary || {};
  const actions = report.underwriting_team_actions || finding?.recommendedNextActions || [];
  const changeImpact = report.change_impact || finding?.crossDocumentConsistency || {};
  const overallStatus = report.overall_status || finding?.overallStatus || "pending";
  const summaryForLO = report.summary_for_loan_officer || "";
  const decisionStyle = getDecisionStyle(finding.lenderDecision);

  const matchedComms = communications.filter(c => c.agentRunId === finding.agentRunId);

  const toggleSub = (key: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const SubHeader = ({ id, title, icon, count }: { id: string; title: string; icon: React.ReactNode; count?: number }) => (
    <button onClick={() => toggleSub(id)} className="flex items-center justify-between w-full py-1.5 text-left" data-testid={`toggle-${id}-${finding.id}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
        {count !== undefined && <Badge variant="secondary" className="text-[10px]">{count}</Badge>}
      </div>
      {expandedSubs.has(id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );

  const createdDate = finding.createdAt ? new Date(finding.createdAt) : null;
  const dateStr = createdDate && !isNaN(createdDate.getTime())
    ? createdDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const timeStr = createdDate && !isNaN(createdDate.getTime())
    ? createdDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : "";

  return (
    <div className={cn("border-l-4 pl-5 py-4", isLatest ? "border-l-primary" : "border-l-slate-200")} data-testid={`finding-section-${finding.id}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left group"
        data-testid={`toggle-finding-${finding.id}`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <p className="text-base font-semibold">{dateStr}{timeStr ? ` — ${timeStr}` : ""}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className={cn("text-[11px] border", decisionStyle.bg)}>{decisionStyle.label}</Badge>
              <Badge variant="outline" className="text-[11px] capitalize">{overallStatus.replace(/_/g, " ")}</Badge>
              {dealHealth.approval_likelihood_pct != null && (
                <span className="text-xs text-muted-foreground">Approval: <strong>{dealHealth.approval_likelihood_pct}%</strong></span>
              )}
              {isLatest && <Badge className="bg-primary text-primary-foreground text-[10px]">Latest</Badge>}
            </div>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {summaryForLO && (
            <div className="p-4 rounded-lg border bg-blue-50/30 border-blue-200">
              <p className="text-xs font-semibold text-blue-900 mb-1.5 uppercase tracking-wide">Executive Summary</p>
              <p className="text-sm text-blue-800 whitespace-pre-line leading-relaxed">{summaryForLO}</p>
            </div>
          )}

          {finding.lenderDecisionNotes && (
            <div className="p-3 rounded-lg border bg-slate-50 border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-1">Decision Notes</p>
              <p className="text-sm text-slate-700">{finding.lenderDecisionNotes}</p>
            </div>
          )}

          {dealHealth && (dealHealth.approval_likelihood_pct != null || dealHealth.current_stage || dealHealth.estimated_days_to_closing != null) && (
            <div>
              <SubHeader id="health" title="Deal Health" icon={<Target className="h-3.5 w-3.5 text-primary" />} />
              {expandedSubs.has("health") && (
                <div className="mt-2 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {dealHealth.approval_likelihood_pct != null && (
                      <div className="p-3 rounded-lg border bg-white text-center">
                        <p className="text-2xl font-bold">{dealHealth.approval_likelihood_pct}%</p>
                        <p className="text-xs text-muted-foreground">Approval Likelihood</p>
                      </div>
                    )}
                    {dealHealth.current_stage && (
                      <div className="p-3 rounded-lg border bg-white text-center">
                        <p className="text-sm font-semibold capitalize">{dealHealth.current_stage.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">Current Stage</p>
                      </div>
                    )}
                    {dealHealth.estimated_days_to_closing != null && (
                      <div className="p-3 rounded-lg border bg-white text-center">
                        <p className="text-2xl font-bold">{dealHealth.estimated_days_to_closing}</p>
                        <p className="text-xs text-muted-foreground">Est. Days to Close</p>
                      </div>
                    )}
                  </div>
                  {dealHealth.key_concerns?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key Concerns</p>
                      {dealHealth.key_concerns.map((c: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded border bg-red-50/30 border-red-100">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{typeof c === "string" ? c : c.concern}</p>
                            {c.resolution_path && <p className="text-xs text-muted-foreground mt-0.5">{c.resolution_path}</p>}
                          </div>
                          {c.priority && <Badge className={cn("text-[10px] ml-auto flex-shrink-0", getSeverityStyle(c.priority).badge)}>{c.priority}</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                  {dealHealth.strengths?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strengths</p>
                      {dealHealth.strengths.map((s: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded border bg-emerald-50/30 border-emerald-100">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{typeof s === "string" ? s : s.strength}</p>
                            {s.impact && <p className="text-xs text-muted-foreground mt-0.5">{s.impact}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {riskAssessment.by_category && (
            <div>
              <SubHeader id="risk" title="Risk Assessment" icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-600" />} />
              {expandedSubs.has("risk") && (
                <div className="mt-2 space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{riskAssessment.overall_risk ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">Overall Risk Score</p>
                    </div>
                    {riskAssessment.trending && (
                      <div className="flex items-center gap-1 text-sm">
                        {riskAssessment.trending === "improving" ? (
                          <><TrendingUp className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700">Improving</span></>
                        ) : riskAssessment.trending === "deteriorating" ? (
                          <><TrendingDown className="h-4 w-4 text-red-600" /><span className="text-red-700">Deteriorating</span></>
                        ) : (
                          <><Minus className="h-4 w-4 text-slate-500" /><span className="text-slate-600">Stable</span></>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 p-3 rounded-lg border bg-white">
                    {riskAssessment.by_category.borrower_strength != null && <RiskBar score={riskAssessment.by_category.borrower_strength} label="Borrower Strength" />}
                    {riskAssessment.by_category.property_performance != null && <RiskBar score={riskAssessment.by_category.property_performance} label="Property Performance" />}
                    {riskAssessment.by_category.loan_structure != null && <RiskBar score={riskAssessment.by_category.loan_structure} label="Loan Structure" />}
                    {riskAssessment.by_category.market_risk != null && <RiskBar score={riskAssessment.by_category.market_risk} label="Market Risk" />}
                    {riskAssessment.by_category.documentation != null && <RiskBar score={riskAssessment.by_category.documentation} label="Documentation" />}
                  </div>
                </div>
              )}
            </div>
          )}

          {Array.isArray(policyFindings) && policyFindings.length > 0 && (
            <div>
              <SubHeader id="policy" title="Policy Compliance" icon={<Shield className="h-3.5 w-3.5 text-amber-600" />} count={policyFindings.length} />
              {expandedSubs.has("policy") && (
                <div className="mt-2 space-y-2">
                  {policyFindings.map((pf: any, i: number) => {
                    const style = getSeverityStyle(pf.severity);
                    return (
                      <div key={i} className={cn("p-3 rounded-lg border", style.bg)}>
                        <div className="flex items-start gap-2">
                          {getComplianceIcon(pf.status)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{pf.rule_name || pf.ruleName || `Rule ${i + 1}`}</span>
                              <Badge className={cn("text-[10px]", style.badge)}>{(pf.status || "unknown").replace(/_/g, " ")}</Badge>
                              {pf.severity && <Badge variant="outline" className="text-[10px]">{pf.severity}</Badge>}
                            </div>
                            {pf.requirement && (
                              <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Required:</span> {pf.requirement}</p>
                            )}
                            {pf.actual_value && (
                              <p className="text-xs text-muted-foreground"><span className="font-medium">Actual:</span> {pf.actual_value}</p>
                            )}
                            {pf.impact && <p className="text-xs mt-1">{pf.impact}</p>}
                            {pf.remediation_path && (
                              <p className="text-xs text-blue-700 mt-1"><span className="font-medium">Fix:</span> {pf.remediation_path}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {Array.isArray(actions) && actions.length > 0 && (
            <div>
              <SubHeader id="actions" title="Action Items" icon={<Clock className="h-3.5 w-3.5 text-blue-600" />} count={actions.length} />
              {expandedSubs.has("actions") && (
                <div className="mt-2 space-y-2">
                  {actions.map((action: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg border bg-white">
                      <p className="text-sm font-medium">{typeof action === "string" ? action : action.action}</p>
                      {typeof action === "object" && (
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          {action.owner && (
                            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {action.owner}</span>
                          )}
                          {action.deadline && (
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {action.deadline}</span>
                          )}
                          {action.priority && <Badge className={cn("text-[10px]", getSeverityStyle(action.priority).badge)}>{action.priority}</Badge>}
                        </div>
                      )}
                      {action.reason && <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {changeImpact && changeImpact.significant_changes?.length > 0 && (
            <div>
              <SubHeader id="changes" title="Change Impact" icon={<TrendingUp className="h-3.5 w-3.5 text-purple-600" />} />
              {expandedSubs.has("changes") && (
                <div className="mt-2 p-3 rounded-lg border bg-purple-50/30">
                  <div className="space-y-2">
                    {changeImpact.significant_changes.map((c: string, i: number) => (
                      <p key={i} className="text-xs">{c}</p>
                    ))}
                    {changeImpact.impact_on_approval && (
                      <p className="text-xs font-medium mt-2">Impact: {changeImpact.impact_on_approval}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {matchedComms.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Communications ({matchedComms.length})
              </p>
              {matchedComms.map(comm => (
                <InlineCommunicationCard key={comm.id} comm={comm} dealId={dealId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TabAIInsights({
  deal,
  dealId,
}: {
  deal: any;
  dealId: string;
}) {
  const { toast } = useToast();
  const [selectedDecision, setSelectedDecision] = useState<string>("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [docsExpanded, setDocsExpanded] = useState(false);

  const { data: docsData, isLoading: docsLoading } = useQuery<{ documents: any[] }>({
    queryKey: ["/api/admin/deals", dealId, "documents", "ai-reviews"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/admin/deals/${dealId}/documents`, { credentials: "include" });
        if (!res.ok) return { documents: [] };
        return res.json();
      } catch {
        return { documents: [] };
      }
    },
    enabled: !!dealId,
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<any[]>({
    queryKey: [`/api/deals/${dealId}/ai-insights`],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/ai-insights`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: !!dealId,
  });

  const projectId = deal?.projectId || deal?.project_id || dealId;

  const { data: communications, isLoading: commsLoading } = useQuery<AgentCommunication[]>({
    queryKey: [`/api/projects/${projectId}/agent-communications`],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/agent-communications`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: !!projectId,
  });

  const { data: findingsData, isLoading: findingsLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/findings`],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/findings`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: !!projectId,
  });

  const findings = Array.isArray(findingsData) ? [...findingsData].sort((a, b) => {
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return db - da;
  }) : [];

  const latestFinding = findings.length > 0 ? findings[0] : null;

  const latestRaw = latestFinding?.rawOutput || {};
  const latestReport = latestRaw.internal_report || latestRaw.internalReport || latestRaw;
  const latestDealHealth = latestReport.deal_health || latestFinding?.dealHealthSummary || {};
  const approvalOdds = latestDealHealth.approval_likelihood_pct;

  useEffect(() => {
    if (latestFinding) {
      setSelectedDecision(latestFinding.lenderDecision || "");
      setDecisionNotes(latestFinding.lenderDecisionNotes || "");
    }
  }, [latestFinding?.id, latestFinding?.lenderDecision]);

  const decisionMutation = useMutation({
    mutationFn: async ({ decision, notes }: { decision: string; notes: string }) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/findings/${latestFinding.id}/decision`, { decision, notes });
    },
    onSuccess: () => {
      toast({ title: "Decision Saved", description: `Deal marked as ${selectedDecision.replace("_", " ")}` });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/findings`] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to save decision", variant: "destructive" });
    },
  });

  const docDecisionMutation = useMutation({
    mutationFn: async ({ docId, status, reviewNotes }: { docId: number; status: string; reviewNotes?: string }) => {
      return apiRequest("PATCH", `/api/admin/deals/${projectId}/documents/${docId}`, { status, reviewNotes });
    },
    onSuccess: (_, variables) => {
      const label = variables.status === "at_risk" ? "at risk" : variables.status;
      toast({ title: "Document Updated", description: `Document marked as ${label}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", projectId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", String(projectId), "documents"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${projectId}/documents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${projectId}/documents`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents", "ai-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update document status", variant: "destructive" });
    },
  });

  const invalidateDocData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents", "ai-reviews"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId] });
  };

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/documents/approve-all`);
    },
    onSuccess: () => {
      invalidateDocData();
      toast({ title: "All documents approved" });
    },
    onError: () => toast({ title: "Failed to approve documents", variant: "destructive" }),
  });

  const isLoading = docsLoading || insightsLoading || commsLoading || findingsLoading;
  const commsList = Array.isArray(communications) ? communications : [];
  const allDocuments = docsData?.documents ?? [];
  const uploadedDocs = allDocuments.filter((d: any) => d.id);
  const approvableDocs = allDocuments.filter((d: any) => d.status === "ai_reviewed");

  const unmatchedComms = commsList.filter(c => !findings.some(f => f.agentRunId === c.agentRunId));

  const insightsList = Array.isArray(insights) ? insights : [];
  const risks = insightsList.filter((i) => i.severity === "warning" || i.type === "risk");
  const recommendations = insightsList.filter((i) => i.severity !== "warning" && i.type !== "risk");

  const hasAnyContent = allDocuments.length > 0 || insightsList.length > 0 || commsList.length > 0 || findings.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-[16px]">Loading AI analysis...</span>
      </div>
    );
  }

  if (!hasAnyContent) {
    return (
      <EmptyState
        icon={Brain}
        title="No AI analysis yet"
        description="AI analysis will appear here after running Auto Process or when documents are reviewed."
      />
    );
  }

  const oddsColor = approvalOdds != null
    ? approvalOdds >= 70 ? "text-emerald-600" : approvalOdds >= 40 ? "text-amber-600" : "text-red-600"
    : "text-slate-400";
  const oddsBg = approvalOdds != null
    ? approvalOdds >= 70 ? "bg-emerald-50 border-emerald-200" : approvalOdds >= 40 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
    : "bg-slate-50 border-slate-200";

  return (
    <div className="space-y-6" data-testid="ai-analysis-document">
      <div className="flex items-start gap-6 flex-wrap">
        <div className={cn("rounded-xl border-2 p-5 text-center min-w-[140px]", oddsBg)} data-testid="approval-odds">
          <p className={cn("text-4xl font-bold", oddsColor)}>
            {approvalOdds != null ? `${approvalOdds}%` : "—"}
          </p>
          <p className="text-xs font-semibold text-muted-foreground mt-1 uppercase tracking-wide">Approval Odds</p>
        </div>

        <div className="flex-1 min-w-[300px] space-y-3">
          {latestFinding && (
            <>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Lender Decision</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {DECISION_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = selectedDecision === opt.value;
                    return (
                      <Button
                        key={opt.value}
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        className={cn("text-xs", isSelected && `${opt.color} text-white border-0`)}
                        onClick={() => setSelectedDecision(opt.value)}
                        data-testid={`decision-${opt.value}`}
                      >
                        <Icon className="h-3.5 w-3.5 mr-1" />
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              {selectedDecision && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add notes about your decision (optional)..."
                    value={decisionNotes}
                    onChange={(e) => setDecisionNotes(e.target.value)}
                    className="text-sm h-16 resize-none"
                    data-testid="input-decision-notes"
                  />
                  <Button
                    size="sm"
                    onClick={() => decisionMutation.mutate({ decision: selectedDecision, notes: decisionNotes })}
                    disabled={decisionMutation.isPending}
                    data-testid="button-save-decision"
                  >
                    {decisionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Save Decision
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {uploadedDocs.length > 0 && (
        <div className="rounded-lg border bg-card">
          <button
            onClick={() => setDocsExpanded(!docsExpanded)}
            className="flex items-center justify-between w-full p-4 text-left"
            data-testid="toggle-document-decisions"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Document Decisions</span>
              <Badge variant="secondary" className="text-[11px]">{uploadedDocs.length}</Badge>
              {approvableDocs.length > 0 && (
                <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300 bg-amber-50">
                  {approvableDocs.length} needs review
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {approvableDocs.length > 0 && (
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); approveAllMutation.mutate(); }}
                  disabled={approveAllMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  data-testid="approve-all-docs"
                >
                  {approveAllMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                  Approve All
                </Button>
              )}
              {docsExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {docsExpanded && (
            <div className="px-4 pb-4 space-y-2 border-t pt-3">
              {uploadedDocs.map((doc: any) => {
                const currentStatus = doc.status?.toLowerCase();
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white" data-testid={`doc-decision-${doc.id}`}>
                    <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.documentName || doc.documentCategory || "Document"}</p>
                      {doc.documentCategory && doc.documentName && (
                        <p className="text-xs text-muted-foreground capitalize">{doc.documentCategory.replace(/_/g, " ")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {[
                        { value: "approved", label: "Approve", icon: CheckCircle2, color: "text-emerald-700 border-emerald-300 hover:bg-emerald-50", active: "bg-emerald-100 text-emerald-800 border-emerald-400" },
                        { value: "conditional", label: "Conditional", icon: AlertTriangle, color: "text-amber-700 border-amber-300 hover:bg-amber-50", active: "bg-amber-100 text-amber-800 border-amber-400" },
                        { value: "denied", label: "Deny", icon: XCircle, color: "text-red-700 border-red-300 hover:bg-red-50", active: "bg-red-100 text-red-800 border-red-400" },
                        { value: "at_risk", label: "At Risk", icon: AlertCircle, color: "text-orange-700 border-orange-300 hover:bg-orange-50", active: "bg-orange-100 text-orange-800 border-orange-400" },
                      ].map(opt => {
                        const Icon = opt.icon;
                        const isActive = currentStatus === opt.value;
                        return (
                          <Button
                            key={opt.value}
                            size="sm"
                            variant="outline"
                            className={cn("h-7 px-2 text-xs gap-1", isActive ? opt.active : opt.color)}
                            disabled={docDecisionMutation.isPending}
                            onClick={() => docDecisionMutation.mutate({ docId: doc.id, status: opt.value })}
                            data-testid={`doc-${doc.id}-${opt.value}`}
                          >
                            <Icon className="h-3 w-3" />
                            {opt.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {findings.length > 0 && (
        <div data-testid="section-analysis-timeline">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Analysis Timeline</h3>
            <Badge variant="secondary" className="text-[11px]">{findings.length} {findings.length === 1 ? "entry" : "entries"}</Badge>
          </div>
          <div className="space-y-1">
            {findings.map((finding: any, index: number) => (
              <FindingSection
                key={finding.id}
                finding={finding}
                projectId={String(projectId)}
                dealId={dealId}
                communications={commsList}
                isLatest={index === 0}
              />
            ))}
          </div>
        </div>
      )}

      {unmatchedComms.length > 0 && (
        <div data-testid="section-other-communications">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Other Communications</h3>
            <Badge variant="secondary" className="text-[11px]">{unmatchedComms.length}</Badge>
          </div>
          <div className="space-y-2">
            {unmatchedComms.map(comm => (
              <InlineCommunicationCard key={comm.id} comm={comm} dealId={dealId} />
            ))}
          </div>
        </div>
      )}

      {(risks.length > 0 || recommendations.length > 0) && (
        <div data-testid="section-insights">
          {risks.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Risk Flags ({risks.length})
              </p>
              <div className="space-y-2">
                {risks.map((insight, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 px-3 rounded-lg border bg-card">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{insight.title || insight.message}</p>
                      {insight.description && <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>}
                      {insight.recommendation && <p className="text-xs text-primary mt-1">{insight.recommendation}</p>}
                    </div>
                    {insight.category && <Badge variant="secondary" className="text-[11px] shrink-0">{insight.category}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-blue-500" /> Recommendations ({recommendations.length})
              </p>
              <div className="space-y-2">
                {recommendations.map((insight, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 px-3 rounded-lg border bg-card">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{insight.title || insight.message}</p>
                      {insight.description && <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>}
                      {insight.recommendation && <p className="text-xs text-primary mt-1">{insight.recommendation}</p>}
                    </div>
                    {insight.category && <Badge variant="secondary" className="text-[11px] shrink-0">{insight.category}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

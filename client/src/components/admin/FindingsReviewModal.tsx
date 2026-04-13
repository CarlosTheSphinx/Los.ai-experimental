import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Mail,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  Calendar,
  Sparkles,
  FileText,
} from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FindingsReviewModalProps {
  open: boolean;
  onClose: () => void;
  finding: any;
  projectId: number;
  onGenerateEmail?: () => void;
  emailGenerating?: boolean;
  readOnly?: boolean;
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

export function FindingsReviewModal({
  open,
  onClose,
  finding,
  projectId,
  onGenerateEmail,
  emailGenerating,
}: FindingsReviewModalProps) {
  const { toast } = useToast();
  const showEmailButton = !!onGenerateEmail;
  const [selectedDecision, setSelectedDecision] = useState<string>(finding?.lenderDecision || "");
  const [decisionNotes, setDecisionNotes] = useState(finding?.lenderDecisionNotes || "");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["health", "policy", "risk", "actions", "documents"])
  );

  useEffect(() => {
    if (finding) {
      setSelectedDecision(finding.lenderDecision || "");
      setDecisionNotes(finding.lenderDecisionNotes || "");
    }
  }, [finding?.id, finding?.lenderDecision]);

  const raw = finding?.rawOutput || {};
  const report = raw.internal_report || raw.internalReport || raw;
  const policyFindings = report.policy_findings || finding?.policyFindings || [];
  const riskAssessment = report.risk_assessment || {};
  const dealHealth = report.deal_health || finding?.dealHealthSummary || {};
  const actions = report.underwriting_team_actions || finding?.recommendedNextActions || [];
  const changeImpact = report.change_impact || finding?.crossDocumentConsistency || {};
  const overallStatus = report.overall_status || finding?.overallStatus || "pending";
  const summaryForLO = report.summary_for_loan_officer || "";

  const { data: docsData } = useQuery<{ documents: any[] }>({
    queryKey: ["/api/admin/deals", projectId, "documents"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/admin/deals/${projectId}/documents`, { credentials: "include" });
        if (!res.ok) return { documents: [] };
        return res.json();
      } catch { return { documents: [] }; }
    },
    enabled: open && !!projectId,
  });
  const uploadedDocs = (docsData?.documents || docsData || []).filter((d: any) => d.id);

  const decisionMutation = useMutation({
    mutationFn: async ({ decision, notes }: { decision: string; notes: string }) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/findings/${finding.id}/decision`, { decision, notes });
    },
    onSuccess: () => {
      toast({ title: "Decision Saved", description: `Deal marked as ${selectedDecision.replace('_', ' ')}` });
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
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update document status", variant: "destructive" });
    },
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const SectionHeader = ({ id, title, icon, count }: { id: string; title: string; icon: React.ReactNode; count?: number }) => (
    <button
      onClick={() => toggleSection(id)}
      className="flex items-center justify-between w-full py-2 text-left"
      data-testid={`toggle-${id}`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
        {count !== undefined && (
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        )}
      </div>
      {expandedSections.has(id) ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );

  if (!finding) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0" data-testid="findings-review-modal">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Shield className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">AI Findings Report</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Analysis completed {formatTimestamp(finding.createdAt, "")}
                </p>
              </div>
            </div>
            <Badge className={cn("text-sm px-3 py-1 border", getStatusColor(overallStatus))} data-testid="badge-overall-status">
              {overallStatus.replace(/_/g, " ")}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(90vh-220px)]">
          <div className="px-6 py-4 space-y-4">

            {summaryForLO && (
              <div className="p-4 rounded-lg border bg-blue-50/30 border-blue-200">
                <p className="text-sm font-semibold text-blue-900 mb-2">Executive Summary</p>
                <p className="text-sm text-blue-800 whitespace-pre-line leading-relaxed">{summaryForLO}</p>
              </div>
            )}

            {uploadedDocs.length > 0 && (
              <div>
                <SectionHeader id="documents" title="Document Decisions" icon={<FileText className="h-4 w-4 text-primary" />} count={uploadedDocs.length} />
                {expandedSections.has("documents") && (
                  <div className="mt-2 space-y-2">
                    {uploadedDocs.map((doc: any) => {
                      const currentStatus = doc.status?.toLowerCase();
                      const docDecisionStatuses = ["approved", "conditional", "denied", "at_risk"];
                      const hasDecision = docDecisionStatuses.includes(currentStatus);
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
                                  className={cn(
                                    "h-7 px-2 text-xs gap-1",
                                    isActive ? opt.active : opt.color
                                  )}
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

            {/* Deal Health */}
            <div>
              <SectionHeader id="health" title="Deal Health" icon={<Target className="h-4 w-4 text-primary" />} />
              {expandedSections.has("health") && dealHealth && (
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
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key Concerns</p>
                      {dealHealth.key_concerns.map((c: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded border bg-red-50/30 border-red-100">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{typeof c === 'string' ? c : c.concern}</p>
                            {c.resolution_path && <p className="text-xs text-muted-foreground mt-0.5">{c.resolution_path}</p>}
                          </div>
                          {c.priority && (
                            <Badge className={cn("text-[10px] ml-auto flex-shrink-0", getSeverityStyle(c.priority).badge)}>{c.priority}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {dealHealth.strengths?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strengths</p>
                      {dealHealth.strengths.map((s: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded border bg-emerald-50/30 border-emerald-100">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium">{typeof s === 'string' ? s : s.strength}</p>
                            {s.impact && <p className="text-xs text-muted-foreground mt-0.5">{s.impact}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Risk Assessment */}
            {riskAssessment.by_category && (
              <div>
                <SectionHeader id="risk" title="Risk Assessment" icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} />
                {expandedSections.has("risk") && (
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
                      {riskAssessment.by_category.borrower_strength != null && (
                        <RiskBar score={riskAssessment.by_category.borrower_strength} label="Borrower Strength" />
                      )}
                      {riskAssessment.by_category.property_performance != null && (
                        <RiskBar score={riskAssessment.by_category.property_performance} label="Property Performance" />
                      )}
                      {riskAssessment.by_category.loan_structure != null && (
                        <RiskBar score={riskAssessment.by_category.loan_structure} label="Loan Structure" />
                      )}
                      {riskAssessment.by_category.market_risk != null && (
                        <RiskBar score={riskAssessment.by_category.market_risk} label="Market Risk" />
                      )}
                      {riskAssessment.by_category.documentation != null && (
                        <RiskBar score={riskAssessment.by_category.documentation} label="Documentation" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Policy Findings */}
            {Array.isArray(policyFindings) && policyFindings.length > 0 && (
              <div>
                <SectionHeader
                  id="policy"
                  title="Policy Compliance"
                  icon={<Shield className="h-4 w-4 text-amber-600" />}
                  count={policyFindings.length}
                />
                {expandedSections.has("policy") && (
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
                                <Badge className={cn("text-[10px]", style.badge)}>
                                  {(pf.status || "unknown").replace(/_/g, " ")}
                                </Badge>
                                {pf.severity && (
                                  <Badge variant="outline" className="text-[10px]">{pf.severity}</Badge>
                                )}
                              </div>
                              {pf.requirement && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  <span className="font-medium">Required:</span> {pf.requirement}
                                </p>
                              )}
                              {pf.actual_value && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Actual:</span> {pf.actual_value}
                                </p>
                              )}
                              {pf.impact && (
                                <p className="text-xs mt-1">{pf.impact}</p>
                              )}
                              {pf.remediation_path && (
                                <p className="text-xs text-blue-700 mt-1">
                                  <span className="font-medium">Fix:</span> {pf.remediation_path}
                                </p>
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

            {/* Action Items */}
            {Array.isArray(actions) && actions.length > 0 && (
              <div>
                <SectionHeader
                  id="actions"
                  title="Action Items"
                  icon={<Clock className="h-4 w-4 text-blue-600" />}
                  count={actions.length}
                />
                {expandedSections.has("actions") && (
                  <div className="mt-2 space-y-2">
                    {actions.map((action: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border bg-white">
                        <p className="text-sm font-medium">{typeof action === 'string' ? action : action.action}</p>
                        {typeof action === 'object' && (
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                            {action.owner && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" /> {action.owner}
                              </span>
                            )}
                            {action.deadline && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> {action.deadline}
                              </span>
                            )}
                            {action.priority && (
                              <Badge className={cn("text-[10px]", getSeverityStyle(action.priority).badge)}>
                                {action.priority}
                              </Badge>
                            )}
                          </div>
                        )}
                        {action.reason && (
                          <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Change Impact */}
            {changeImpact && changeImpact.significant_changes?.length > 0 && (
              <div>
                <SectionHeader id="changes" title="Change Impact" icon={<TrendingUp className="h-4 w-4 text-purple-600" />} />
                {expandedSections.has("changes") && (
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
          </div>
        </ScrollArea>

        {/* Decision Footer */}
        <div className="border-t bg-slate-50/50 px-6 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold mr-2">Decision:</p>
            {DECISION_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedDecision === opt.value;
              return (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className={cn(
                    "text-xs",
                    isSelected && `${opt.color} text-white border-0`
                  )}
                  onClick={() => setSelectedDecision(opt.value)}
                  data-testid={`decision-${opt.value}`}
                >
                  <Icon className="h-3.5 w-3.5 mr-1" />
                  {opt.label}
                </Button>
              );
            })}
          </div>

          {selectedDecision && (
            <Textarea
              placeholder="Add notes about your decision (optional)..."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              className="text-sm h-16 resize-none"
              data-testid="input-decision-notes"
            />
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedDecision) {
                  decisionMutation.mutate({ decision: selectedDecision, notes: decisionNotes });
                }
                onClose();
              }}
              data-testid="button-save-close"
            >
              {selectedDecision ? "Save & Close" : "Close"}
            </Button>

            <div className="flex items-center gap-2">
              {selectedDecision && (
                <Button
                  size="sm"
                  onClick={() => decisionMutation.mutate({ decision: selectedDecision, notes: decisionNotes })}
                  disabled={decisionMutation.isPending}
                  data-testid="button-save-decision"
                >
                  {decisionMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Save Decision
                </Button>
              )}
              {showEmailButton && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (selectedDecision) {
                      decisionMutation.mutate({ decision: selectedDecision, notes: decisionNotes });
                    }
                    onGenerateEmail!();
                  }}
                  disabled={emailGenerating}
                  data-testid="button-generate-email"
                >
                  {emailGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Auto Generate Email
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

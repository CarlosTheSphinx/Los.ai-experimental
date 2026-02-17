import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  RefreshCw,
  Loader2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Zap,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Mail,
  FileSearch,
  ListChecks,
  XCircle,
  Copy,
  Check,
  Bug,
  ArrowRight,
  ArrowDown,
  Timer,
  CircleDot,
  Brain,
  MessageSquare,
  ScanSearch,
} from "lucide-react";

interface AIInsightsPanelProps {
  projectId: number;
  onPipelineComplete?: () => void;
}

interface DealStoryData {
  id: number;
  projectId: number;
  currentNarrative: string;
  lastUpdatedSection: string | null;
  storyVersion: number;
  metadata: {
    total_extractions?: number;
    total_findings?: number;
    total_communications?: number;
    total_documents_received?: number;
    policy_findings_count?: number;
    document_requirement_findings_count?: number;
    communications_drafted?: number;
    communications_sent?: number;
    open_tasks_count?: number;
    overall_deal_health?: string;
    last_updated_source?: string;
    last_updated_at?: string;
  } | null;
  lastAgentUpdate: string | null;
  lastHumanUpdate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentExtraction {
  id: number;
  projectId: number;
  dealDocumentId: number | null;
  documentType: string;
  extractedFields: Record<string, any>;
  qualityAssessment: string | null;
  createdAt: string;
}

interface AgentFinding {
  id: number;
  projectId: number;
  programId: number | null;
  agentRunId: number | null;
  overallStatus: string | null;
  policyFindings: any[] | null;
  documentRequirementFindings: any[] | null;
  crossDocumentConsistency: any[] | null;
  missingDocuments: any[] | null;
  dealHealthSummary: any | null;
  recommendedNextActions: any[] | null;
  createdAt: string;
}

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

interface PipelineStepLog {
  id: number;
  pipelineRunId: number;
  agentType: string;
  agentRunId: number | null;
  sequenceIndex: number;
  status: string;
  outputSummary: any | null;
  inputContext: any | null;
  durationMs: number | null;
  errorMessage: string | null;
  executedAt: string | null;
  completedAt: string | null;
}

interface PipelineRun {
  id: number;
  projectId: number;
  status: string;
  agentSequence: string[];
  currentAgentIndex: number;
  triggerType: string | null;
  triggeredBy: number | null;
  errorMessage: string | null;
  totalDurationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  steps: PipelineStepLog[];
}

const AGENT_LABELS: Record<string, { label: string; icon: typeof Brain }> = {
  document_intelligence: { label: "Document Intelligence", icon: ScanSearch },
  processor: { label: "Processor (Policy Check)", icon: Brain },
  communication: { label: "Communication Drafter", icon: MessageSquare },
};

function JsonViewer({ data, label }: { data: any; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const preview = jsonStr.length > 200 ? jsonStr.slice(0, 200) + "..." : jsonStr;

  const copyJson = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="px-2"
          data-testid={`button-toggle-${label.toLowerCase().replace(/\s/g, '-')}`}
        >
          {expanded ? <ArrowDown className="h-3 w-3 mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
          <span className="text-xs">{label}</span>
          <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0 font-normal">
            {typeof data === 'object' && data !== null ? `${Object.keys(data).length} keys` : `${jsonStr.length} chars`}
          </Badge>
        </Button>
        <Button size="icon" variant="ghost" onClick={copyJson} data-testid={`button-copy-${label.toLowerCase().replace(/\s/g, '-')}`}>
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className={`text-xs bg-muted/50 rounded-md p-3 overflow-x-auto ${expanded ? 'max-h-[500px]' : 'max-h-24'} overflow-y-auto font-mono whitespace-pre-wrap break-all`}>
        {expanded ? jsonStr : preview}
      </pre>
    </div>
  );
}

function StatusIcon({ status, className = "h-4 w-4 mt-0.5 shrink-0" }: { status: string; className?: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'pass' || s === 'received' || s === 'consistent' || s === 'clear' || s === 'approved' || s === 'complete') {
    return <CheckCircle2 className={`${className} text-success`} />;
  }
  if (s === 'fail' || s === 'missing' || s === 'rejected' || s === 'inconsistent') {
    return <XCircle className={`${className} text-destructive`} />;
  }
  if (s === 'warning' || s === 'needs_review' || s === 'partial') {
    return <AlertTriangle className={`${className} text-yellow-500`} />;
  }
  return <ShieldQuestion className={`${className} text-muted-foreground`} />;
}

function statusVariant(status: string): "default" | "destructive" | "secondary" {
  const s = (status || '').toLowerCase();
  if (s === 'pass' || s === 'clear' || s === 'approved' || s === 'complete' || s === 'consistent') return 'default';
  if (s === 'fail' || s === 'rejected' || s === 'critical' || s === 'inconsistent') return 'destructive';
  return 'secondary';
}

export function AIInsightsPanel({ projectId, onPipelineComplete }: AIInsightsPanelProps) {
  const { toast } = useToast();
  const [storyOpen, setStoryOpen] = useState(true);
  const [findingsOpen, setFindingsOpen] = useState(true);
  const [commsOpen, setCommsOpen] = useState(true);
  const [copiedCommId, setCopiedCommId] = useState<number | null>(null);
  const [debugOpen, setDebugOpen] = useState(true);
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);

  const pipelineRunsQuery = useQuery<PipelineRun[]>({
    queryKey: ["/api/projects", projectId, "pipeline-runs"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pipeline-runs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pipeline runs");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const storyQuery = useQuery<DealStoryData>({
    queryKey: ["/api/projects", projectId, "story"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/story`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch deal story");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const findingsQuery = useQuery<AgentFinding[]>({
    queryKey: ["/api/projects", projectId, "findings"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/findings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch findings");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const extractionsQuery = useQuery<DocumentExtraction[]>({
    queryKey: ["/api/projects", projectId, "extractions"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/extractions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch extractions");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const commsQuery = useQuery<AgentCommunication[]>({
    queryKey: ["/api/projects", projectId, "agent-communications"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/agent-communications`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch communications");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const runPipeline = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/agents/pipeline/start", { projectId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "AI Pipeline Started", description: "The AI agents are analyzing this deal. Results will appear here automatically." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "story"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "findings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "agent-communications"] });
      }, 5000);
      onPipelineComplete?.();
    },
    onError: (error: any) => {
      const msg = error?.message?.includes("already running")
        ? "A pipeline is already running for this deal."
        : error?.message || "Failed to start pipeline";
      toast({ title: "Pipeline Error", description: msg, variant: "destructive" });
    },
  });

  const approveComm = useMutation({
    mutationFn: async (commId: number) => {
      return apiRequest("PUT", `/api/projects/${projectId}/agent-communications/${commId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "agent-communications"] });
      toast({ title: "Communication approved" });
    },
    onError: () => {
      toast({ title: "Failed to approve", variant: "destructive" });
    },
  });

  const story = storyQuery.data;
  const findings = findingsQuery.data || [];
  const extractions = extractionsQuery.data || [];
  const communications = commsQuery.data || [];
  const latestFinding = findings.length > 0 ? findings[0] : null;
  const draftComms = communications.filter(c => c.status === 'draft');
  const pipelineRuns = pipelineRunsQuery.data || [];
  const clampedRunIndex = pipelineRuns.length > 0 ? Math.min(selectedRunIndex, pipelineRuns.length - 1) : 0;
  const selectedRun = pipelineRuns[clampedRunIndex] || null;
  const isLoading = storyQuery.isLoading || findingsQuery.isLoading || commsQuery.isLoading;

  const parseCommBody = (comm: AgentCommunication): { subject: string; body: string } => {
    const rawBody = comm.editedBody || comm.body || "";
    try {
      const trimmed = rawBody.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(trimmed);
      return { subject: parsed.subject || comm.subject || "No Subject", body: parsed.body || rawBody };
    } catch {
      return { subject: comm.subject || "No Subject", body: rawBody };
    }
  };

  const copyCommBody = (commId: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommId(commId);
    setTimeout(() => setCopiedCommId(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const healthColor = (health: string | undefined) => {
    if (!health) return "secondary";
    const h = health.toLowerCase();
    if (h === "pass" || h === "approved" || h === "good" || h === "healthy") return "default";
    if (h === "fail" || h === "critical" || h === "rejected") return "destructive";
    return "secondary";
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="ai-insights-loading">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> AI Insights</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasAnyData = story || latestFinding || communications.length > 0;

  return (
    <div className="space-y-4" data-testid="ai-insights-panel">
      {/* Header with Run Pipeline */}
      <Card data-testid="card-ai-insights-header">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base">AI Insights</h3>
                <p className="text-xs text-muted-foreground">
                  {hasAnyData
                    ? `Last analyzed ${story?.lastAgentUpdate ? new Date(story.lastAgentUpdate).toLocaleString() : "recently"}`
                    : "Run the AI pipeline to analyze this deal"}
                </p>
              </div>
            </div>
            <Button
              onClick={() => runPipeline.mutate()}
              disabled={runPipeline.isPending}
              data-testid="button-run-pipeline-insights"
            >
              {runPipeline.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {runPipeline.isPending ? "Analyzing..." : "Run AI Agents"}
            </Button>
          </div>

          {/* Quick Stats Bar */}
          {story?.metadata && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4" data-testid="insights-stats">
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Docs Analyzed</p>
                  <p className="text-sm font-medium">{story.metadata.total_extractions ?? story.metadata.total_documents_received ?? 0}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Findings</p>
                  <p className="text-sm font-medium">{story.metadata.total_findings ?? 0}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Send className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Drafts</p>
                  <p className="text-sm font-medium">{story.metadata.total_communications ?? draftComms.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Health</p>
                  <Badge variant={healthColor(story.metadata.overall_deal_health)} className="text-[10px]">
                    {story.metadata.overall_deal_health || "Pending"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasAnyData && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <h4 className="font-medium">No AI Analysis Yet</h4>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Click "Run AI Agents" to analyze uploaded documents, check against credit policies, and draft borrower communications.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deal Story Section */}
      {story && (
        <Collapsible open={storyOpen} onOpenChange={setStoryOpen}>
          <Card data-testid="card-insights-story">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4" />
                  Deal Story
                  <Badge variant="secondary" className="text-[10px]">v{story.storyVersion}</Badge>
                </CardTitle>
                {storyOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="prose prose-sm max-w-none dark:prose-invert space-y-0.5" data-testid="insights-narrative">
                  {story.currentNarrative.split("\n").map((line, i) => {
                    if (line.startsWith("## ") || line.startsWith("=== ")) {
                      const clean = line.replace(/^(## |=== |===\s*)/g, "").replace(/\s*===$/, "");
                      return <h3 key={i} className="text-sm font-semibold text-foreground mt-4 mb-1 first:mt-0">{clean}</h3>;
                    }
                    if (line.startsWith("  - ") || line.startsWith("- ")) {
                      const content = line.replace(/^\s*-\s*/, "");
                      const sev = content.match(/^\[(critical|warning|info|fail|pass)\]/i);
                      return (
                        <div key={i} className="flex items-start gap-2 ml-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                          <span>
                            {sev && <Badge variant={sev[1].toLowerCase() === "critical" || sev[1].toLowerCase() === "fail" ? "destructive" : "secondary"} className="mr-1 text-[10px] px-1 py-0">{sev[1]}</Badge>}
                            {sev ? content.replace(sev[0], "").trim() : content}
                          </span>
                        </div>
                      );
                    }
                    if (line.trim() === "") return <div key={i} className="h-1" />;
                    return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
                  })}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Agent Findings Section */}
      {latestFinding && (
        <Collapsible open={findingsOpen} onOpenChange={setFindingsOpen}>
          <Card data-testid="card-insights-findings">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  Agent Findings
                  {latestFinding.overallStatus && (
                    <Badge
                      variant={statusVariant(latestFinding.overallStatus)}
                      className={statusVariant(latestFinding.overallStatus) === 'default' ? 'bg-success/10 text-success text-[10px]' : 'text-[10px]'}
                    >
                      {latestFinding.overallStatus}
                    </Badge>
                  )}
                </CardTitle>
                {findingsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-5">

                {/* Per-Document Analysis */}
                {extractions.length > 0 && (
                  <div data-testid="findings-per-document">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      Per-Document Analysis
                      <Badge variant="secondary" className="text-[10px]">{extractions.length} docs</Badge>
                    </h4>
                    <div className="space-y-3">
                      {extractions.map((ext) => {
                        const docReq = latestFinding.documentRequirementFindings?.find(
                          (f: any) => f.document === ext.documentType || f.documentType === ext.documentType
                        );
                        const docLabel = ext.documentType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                        const fieldEntries = ext.extractedFields ? Object.entries(ext.extractedFields) : [];
                        const docStatus = docReq?.status || 'received';
                        return (
                          <Collapsible key={ext.id}>
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30 cursor-pointer group" data-testid={`findings-doc-${ext.id}`}>
                                <StatusIcon status={docStatus} />
                                <span className="font-medium text-sm flex-1">{docLabel}</span>
                                <Badge variant="secondary" className="text-[10px]">{fieldEntries.length} fields</Badge>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-data-[state=open]:rotate-90 transition-transform" />
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-6 mt-1 space-y-1">
                                {docReq?.notes && (
                                  <p className="text-xs text-muted-foreground italic px-2 py-1">{docReq.notes}</p>
                                )}
                                {fieldEntries.map(([key, value]) => (
                                  <div key={key} className="flex items-start gap-2 px-2 py-1.5 rounded text-sm">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                                    <span className="text-muted-foreground min-w-0">
                                      <span className="font-medium text-foreground">{key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}: </span>
                                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Policy Checks */}
                {latestFinding.policyFindings && Array.isArray(latestFinding.policyFindings) && latestFinding.policyFindings.length > 0 && (
                  <div data-testid="findings-policy">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      Policy Checks
                      <Badge variant="secondary" className="text-[10px]">
                        {latestFinding.policyFindings.filter((f: any) => f.status === 'pass').length}/{latestFinding.policyFindings.length} passed
                      </Badge>
                    </h4>
                    <div className="space-y-1.5">
                      {latestFinding.policyFindings.map((f: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30 text-sm">
                          <StatusIcon status={f.status} />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{f.rule || f.name || `Check ${i + 1}`}</span>
                            {(f.detail || f.details) && <p className="text-xs text-muted-foreground mt-0.5">{f.detail || f.details}</p>}
                            {f.message && <p className="text-xs text-muted-foreground mt-0.5">{f.message}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cross-Document Consistency */}
                {latestFinding.crossDocumentConsistency && Array.isArray(latestFinding.crossDocumentConsistency) && latestFinding.crossDocumentConsistency.length > 0 && (
                  <div data-testid="findings-consistency">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                      Cross-Document Consistency
                      <Badge variant="secondary" className="text-[10px]">
                        {latestFinding.crossDocumentConsistency.filter((c: any) => c.result === 'consistent' || c.consistent === true).length}/{latestFinding.crossDocumentConsistency.length} consistent
                      </Badge>
                    </h4>
                    <div className="space-y-1.5">
                      {latestFinding.crossDocumentConsistency.map((item: any, i: number) => {
                        const isConsistent = item.result === 'consistent' || item.consistent === true;
                        return (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30 text-sm">
                            {isConsistent
                              ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                              : <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{item.check || item.field || `Check ${i + 1}`}</span>
                              {(item.detail || item.details || item.message) && (
                                <p className="text-xs text-muted-foreground mt-0.5">{item.detail || item.details || item.message}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Document Rules - per-document validation checks */}
                {latestFinding.documentRequirementFindings && Array.isArray(latestFinding.documentRequirementFindings) && latestFinding.documentRequirementFindings.length > 0 && (
                  <div data-testid="findings-document-rules">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                      <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                      Document Rules
                      <Badge variant="secondary" className="text-[10px]">{latestFinding.documentRequirementFindings.length} docs</Badge>
                    </h4>
                    <div className="space-y-3">
                      {latestFinding.documentRequirementFindings.map((docGroup: any, gi: number) => {
                        const rules = docGroup.rules || [];
                        const hasRules = Array.isArray(rules) && rules.length > 0;
                        const passCount = hasRules ? rules.filter((r: any) => r.status === 'pass').length : 0;
                        const failCount = hasRules ? rules.filter((r: any) => r.status === 'fail').length : 0;
                        const warnCount = hasRules ? rules.filter((r: any) => r.status === 'warning').length : 0;
                        const docLabel = docGroup.documentName || (docGroup.documentType || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || `Document ${gi + 1}`;
                        const overallDocStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warning' : 'pass';

                        if (!hasRules && !docGroup.document && !docGroup.status) return null;

                        if (!hasRules) {
                          const flatStatus = docGroup.status || 'received';
                          return (
                            <div key={gi} className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30 text-sm">
                              <StatusIcon status={flatStatus} />
                              <span className="font-medium flex-1">{docGroup.document || docLabel}</span>
                              {docGroup.notes && <span className="text-xs text-muted-foreground">{docGroup.notes}</span>}
                            </div>
                          );
                        }

                        return (
                          <Collapsible key={gi} defaultOpen={failCount > 0 || warnCount > 0}>
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/30 cursor-pointer group" data-testid={`doc-rules-${gi}`}>
                                <StatusIcon status={overallDocStatus} />
                                <span className="font-medium text-sm flex-1">{docLabel}</span>
                                <div className="flex items-center gap-1.5">
                                  {passCount > 0 && <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">{passCount} pass</Badge>}
                                  {warnCount > 0 && <Badge variant="secondary" className="text-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">{warnCount} warn</Badge>}
                                  {failCount > 0 && <Badge variant="destructive" className="text-[10px]">{failCount} fail</Badge>}
                                </div>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-data-[state=open]:rotate-90 transition-transform" />
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-6 mt-1 space-y-1">
                                {rules.map((rule: any, ri: number) => (
                                  <div key={ri} className="flex items-start gap-2 px-2 py-1.5 rounded text-sm">
                                    <StatusIcon status={rule.status || 'pass'} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium">{rule.rule || rule.name || `Rule ${ri + 1}`}</span>
                                      {(rule.detail || rule.details) && <p className="text-xs text-muted-foreground mt-0.5">{rule.detail || rule.details}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Missing Documents */}
                {latestFinding.missingDocuments && Array.isArray(latestFinding.missingDocuments) && latestFinding.missingDocuments.length > 0 && (
                  <div data-testid="findings-missing-docs">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                      Missing Documents
                    </h4>
                    <div className="space-y-1">
                      {latestFinding.missingDocuments.map((doc: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-destructive/5 text-sm">
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          <span>{typeof doc === 'string' ? doc : doc.name || doc.document || JSON.stringify(doc)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended Next Actions */}
                {latestFinding.recommendedNextActions && Array.isArray(latestFinding.recommendedNextActions) && latestFinding.recommendedNextActions.length > 0 && (
                  <div data-testid="findings-next-actions">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                      Recommended Next Steps
                    </h4>
                    <div className="space-y-1">
                      {latestFinding.recommendedNextActions.map((action: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-primary/5 text-sm">
                          <span className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">{i + 1}</span>
                          <span>{typeof action === 'string' ? action : action.action || action.description || JSON.stringify(action)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deal Health Summary */}
                {latestFinding.dealHealthSummary && (
                  <div data-testid="findings-health-summary" className="p-3 rounded-md border bg-muted/20">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      Deal Health Summary
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {typeof latestFinding.dealHealthSummary === 'string'
                        ? latestFinding.dealHealthSummary
                        : latestFinding.dealHealthSummary.summary || latestFinding.dealHealthSummary.message || JSON.stringify(latestFinding.dealHealthSummary)}
                    </p>
                  </div>
                )}

                {/* Empty findings state */}
                {!latestFinding.policyFindings && !latestFinding.missingDocuments && !latestFinding.crossDocumentConsistency && extractions.length === 0 && !latestFinding.recommendedNextActions && !latestFinding.dealHealthSummary && (
                  <p className="text-sm text-muted-foreground py-2">No detailed findings available from the latest analysis.</p>
                )}

                <div className="text-xs text-muted-foreground pt-2 border-t">
                  Analyzed {new Date(latestFinding.createdAt).toLocaleString()}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Communication Drafts Section */}
      {communications.length > 0 && (
        <Collapsible open={commsOpen} onOpenChange={setCommsOpen}>
          <Card data-testid="card-insights-comms">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4" />
                  Communication Drafts
                  {draftComms.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{draftComms.length} pending</Badge>
                  )}
                </CardTitle>
                {commsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                {communications.map((comm) => {
                  const parsed = parseCommBody(comm);
                  return (
                    <div key={comm.id} className="border rounded-lg p-4 space-y-3" data-testid={`comm-draft-${comm.id}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{parsed.subject}</span>
                            <Badge variant={comm.status === 'draft' ? 'secondary' : comm.status === 'approved' ? 'default' : 'outline'} className="text-[10px]">
                              {comm.status || 'draft'}
                            </Badge>
                            {comm.priority && comm.priority !== 'routine' && (
                              <Badge variant={comm.priority === 'urgent' ? 'destructive' : 'secondary'} className="text-[10px]">
                                {comm.priority}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <span>To: {comm.recipientType || 'borrower'}</span>
                            {comm.recipientName && <span>{comm.recipientName}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => copyCommBody(comm.id, parsed.body)}
                            data-testid={`button-copy-comm-${comm.id}`}
                          >
                            {copiedCommId === comm.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          {comm.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveComm.mutate(comm.id)}
                              disabled={approveComm.isPending}
                              data-testid={`button-approve-comm-${comm.id}`}
                            >
                              {approveComm.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                              Approve
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-3 max-h-64 overflow-y-auto" data-testid={`comm-body-${comm.id}`}>
                        {parsed.body}
                      </div>
                      {comm.internalNotes && (
                        <div className="text-xs text-muted-foreground italic border-t pt-2">
                          Notes: {comm.internalNotes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Pipeline Debug Section - Agent Inputs & Outputs */}
      {pipelineRuns.length > 0 && (
        <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
          <Card data-testid="card-insights-debug">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bug className="h-4 w-4" />
                  Pipeline Debug
                  <Badge variant="secondary" className="text-[10px]">{pipelineRuns.length} run{pipelineRuns.length !== 1 ? 's' : ''}</Badge>
                </CardTitle>
                {debugOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {/* Run selector */}
                {pipelineRuns.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap" data-testid="pipeline-run-selector">
                    {pipelineRuns.map((run, idx) => (
                      <Button
                        key={run.id}
                        size="sm"
                        variant={clampedRunIndex === idx ? 'default' : 'outline'}
                        onClick={() => setSelectedRunIndex(idx)}
                        data-testid={`button-select-run-${run.id}`}
                      >
                        Run #{run.id}
                        <Badge
                          variant={run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'}
                          className={`ml-1.5 text-[9px] ${run.status === 'completed' ? 'bg-success/10 text-success' : ''}`}
                        >
                          {run.status}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                )}

                {selectedRun && (
                  <div className="space-y-2">
                    {/* Run summary bar */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground p-2 bg-muted/30 rounded-md" data-testid="pipeline-run-summary">
                      <span className="flex items-center gap-1">
                        <CircleDot className="h-3 w-3" />
                        Status: <span className="font-medium text-foreground">{selectedRun.status}</span>
                      </span>
                      {selectedRun.totalDurationMs && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {(selectedRun.totalDurationMs / 1000).toFixed(1)}s total
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(selectedRun.startedAt).toLocaleString()}
                      </span>
                      <span>{selectedRun.agentSequence.length} agents</span>
                    </div>

                    {selectedRun.errorMessage && (
                      <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                        Pipeline Error: {selectedRun.errorMessage}
                      </div>
                    )}

                    {/* Agent Steps */}
                    <div className="space-y-3">
                      {selectedRun.steps.map((step, stepIdx) => {
                        const agentInfo = AGENT_LABELS[step.agentType] || { label: step.agentType, icon: Brain };
                        const AgentIcon = agentInfo.icon;
                        return (
                          <div
                            key={step.id}
                            className="border rounded-lg overflow-visible"
                            data-testid={`pipeline-step-${step.agentType}`}
                          >
                            {/* Step header */}
                            <div className="flex items-center justify-between gap-3 p-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                                  {stepIdx + 1}
                                </span>
                                <AgentIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{agentInfo.label}</span>
                                <Badge
                                  variant={step.status === 'completed' ? 'default' : step.status === 'failed' ? 'destructive' : step.status === 'running' ? 'secondary' : 'outline'}
                                  className={`text-[10px] ${step.status === 'completed' ? 'bg-success/10 text-success' : ''}`}
                                >
                                  {step.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {step.durationMs && (
                                  <span className="flex items-center gap-1">
                                    <Timer className="h-3 w-3" />
                                    {(step.durationMs / 1000).toFixed(1)}s
                                  </span>
                                )}
                              </div>
                            </div>

                            {step.errorMessage && (
                              <div className="mx-3 mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                                {step.errorMessage}
                              </div>
                            )}

                            {/* Input & Output */}
                            <div className="px-3 pb-3 space-y-3">
                              {step.inputContext && (
                                <JsonViewer data={step.inputContext} label={`Step ${stepIdx + 1} Input Context`} />
                              )}
                              {step.outputSummary && (
                                <JsonViewer data={step.outputSummary} label={`Step ${stepIdx + 1} Output`} />
                              )}
                              {!step.inputContext && !step.outputSummary && step.status !== 'pending' && step.status !== 'running' && (
                                <p className="text-xs text-muted-foreground italic px-1">No input/output data captured for this step.</p>
                              )}
                              {(step.status === 'pending' || step.status === 'running') && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-1">
                                  {step.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                                  {step.status === 'running' ? 'Agent is currently running...' : 'Waiting for previous steps to complete'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}

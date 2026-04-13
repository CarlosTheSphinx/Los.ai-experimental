/**
 * AI Review Tab Component
 * Shows pipeline progress, document extractions, processor findings,
 * drafted communications, and Deal Story narrative for a deal.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileSearch,
  Shield,
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BookOpen,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn, safeFormat } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AIReviewTabProps {
  dealId: number;
  projectId: number | null;
}

interface PipelineStep {
  id: number;
  agentType: string;
  sequenceIndex: number;
  status: string;
  outputSummary: any;
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
  triggerType: string;
  totalDurationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface PipelineStatus {
  hasRun: boolean;
  latestRun: PipelineRun | null;
  steps: PipelineStep[];
}

const AGENT_INFO: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
  document_intelligence: {
    name: "Document Intelligence",
    icon: <FileSearch className="h-4 w-4" />,
    color: "blue",
  },
  processor: {
    name: "Loan Processor",
    icon: <Shield className="h-4 w-4" />,
    color: "amber",
  },
  communication: {
    name: "Communication",
    icon: <Mail className="h-4 w-4" />,
    color: "green",
  },
};

function getStepStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    case "running":
      return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "pending":
      return <Clock className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}

function getStepStatusBg(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 border-emerald-200";
    case "running":
      return "bg-blue-50 border-blue-200";
    case "failed":
      return "bg-red-50 border-red-200";
    default:
      return "bg-muted/30 border-border";
  }
}

function getSeverityBadge(severity: string) {
  switch (severity?.toLowerCase()) {
    case "critical":
      return <Badge variant="destructive" className="text-xs">Critical</Badge>;
    case "warning":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Warning</Badge>;
    case "info":
      return <Badge variant="secondary" className="text-xs">Info</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{severity || "Unknown"}</Badge>;
  }
}

export function AIReviewTab({ dealId, projectId }: AIReviewTabProps) {
  const { toast } = useToast();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["pipeline", "story"])
  );

  // Fetch pipeline status
  const { data: pipelineStatus, isLoading: pipelineLoading } = useQuery<PipelineStatus>({
    queryKey: [`/api/projects/${projectId}/pipeline/status`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/pipeline/status`);
      if (!res.ok) throw new Error("Failed to fetch pipeline status");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data as PipelineStatus | undefined;
      if (data?.latestRun?.status === "running") return 3000;
      return false;
    },
  });

  // Fetch deal story
  const { data: dealStory, isLoading: storyLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/story`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/story`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch deal story");
      }
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch extractions
  const { data: extractions } = useQuery({
    queryKey: [`/api/projects/${projectId}/extractions`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/extractions`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch findings
  const { data: findings } = useQuery({
    queryKey: [`/api/projects/${projectId}/findings`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/findings`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch communications
  const { data: communications } = useQuery({
    queryKey: [`/api/projects/${projectId}/agent-communications`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/agent-communications`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Start pipeline mutation
  const startPipelineMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/agents/pipeline/start", {
        projectId,
        triggerType: "manual",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/pipeline/status`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/story`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/extractions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/findings`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/agent-communications`] });
      toast({ title: "Pipeline Started", description: "AI analysis is running on this deal." });
    },
    onError: (error: any) => {
      toast({
        title: "Pipeline Error",
        description: error.message || "Failed to start pipeline",
        variant: "destructive",
      });
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

  const isRunning = pipelineStatus?.latestRun?.status === "running";
  const steps = pipelineStatus?.steps || [];
  const hasRun = pipelineStatus?.hasRun ?? false;

  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No project linked to this deal yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Run Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">AI Review</h3>
          {isRunning && (
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs animate-pulse">
              Running
            </Badge>
          )}
          {pipelineStatus?.latestRun?.status === "completed" && (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
              Complete
            </Badge>
          )}
          {pipelineStatus?.latestRun?.status === "failed" && (
            <Badge variant="destructive" className="text-xs">
              Failed
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => startPipelineMutation.mutate()}
          disabled={isRunning || startPipelineMutation.isPending}
        >
          {isRunning || startPipelineMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-1.5" />
              {hasRun ? "Re-run AI Analysis" : "Run AI Analysis"}
            </>
          )}
        </Button>
      </div>

      {/* Pipeline Progress */}
      <Card className={cn(getStepStatusBg(pipelineStatus?.latestRun?.status || "pending"))}>
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => toggleSection("pipeline")}
        >
          <h4 className="text-sm font-semibold flex items-center gap-2">
            Pipeline Progress
            {pipelineStatus?.latestRun?.totalDurationMs && (
              <span className="text-xs font-normal text-muted-foreground">
                ({Math.round(pipelineStatus.latestRun.totalDurationMs / 1000)}s total)
              </span>
            )}
          </h4>
          {expandedSections.has("pipeline") ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {expandedSections.has("pipeline") && (
          <CardContent className="pt-0 pb-4">
            {pipelineLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !hasRun ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No AI analysis has been run on this deal yet. Click "Run AI Analysis" to start.
              </div>
            ) : (
              <div className="relative">
                {/* Vertical connector line */}
                <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-border" />
                <div className="space-y-3">
                  {steps.map((step, i) => {
                    const info = AGENT_INFO[step.agentType] || {
                      name: step.agentType,
                      icon: <FileSearch className="h-4 w-4" />,
                      color: "gray",
                    };
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border relative z-10",
                          getStepStatusBg(step.status)
                        )}
                      >
                        <div className="flex-shrink-0 bg-background rounded-full p-0.5">
                          {getStepStatusIcon(step.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {info.icon}
                            <span className="font-medium text-sm">{info.name}</span>
                          </div>
                          {step.durationMs && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(step.durationMs)}ms
                            </span>
                          )}
                          {step.errorMessage && (
                            <p className="text-xs text-red-600 mt-1">{step.errorMessage}</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs capitalize",
                            step.status === "completed" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                            step.status === "running" && "bg-blue-50 text-blue-700 border-blue-200",
                            step.status === "failed" && "bg-red-50 text-red-700 border-red-200"
                          )}
                        >
                          {step.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Document Extractions */}
      {(extractions?.length > 0) && (
        <Card>
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => toggleSection("extractions")}
          >
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-blue-600" />
              Document Extractions
              <Badge variant="secondary" className="text-xs">{extractions.length}</Badge>
            </h4>
            {expandedSections.has("extractions") ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {expandedSections.has("extractions") && (
            <CardContent className="pt-0 pb-4 space-y-3">
              {extractions.map((extraction: any) => (
                <div
                  key={extraction.id}
                  className="p-3 rounded-lg border bg-blue-50/30 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {extraction.documentType || "Unknown Document"}
                    </span>
                    {extraction.confidenceScore != null && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          extraction.confidenceScore >= 80
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : extraction.confidenceScore >= 50
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        )}
                      >
                        {extraction.confidenceScore}% confidence
                      </Badge>
                    )}
                  </div>
                  {extraction.qualityAssessment && (
                    <p className="text-xs text-muted-foreground">{extraction.qualityAssessment}</p>
                  )}
                  {extraction.extractedData && (
                    <div className="text-xs bg-white rounded p-2 border font-mono overflow-auto max-h-32">
                      {typeof extraction.extractedData === "string"
                        ? extraction.extractedData
                        : JSON.stringify(extraction.extractedData, null, 2)}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Processor Findings */}
      {(findings?.length > 0) && (
        <Card>
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => toggleSection("findings")}
          >
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              Processor Findings
              <Badge variant="secondary" className="text-xs">{findings.length}</Badge>
              {findings.some((f: any) => f.severity === "critical") && (
                <Badge variant="destructive" className="text-xs">
                  {findings.filter((f: any) => f.severity === "critical").length} Critical
                </Badge>
              )}
            </h4>
            {expandedSections.has("findings") ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {expandedSections.has("findings") && (
            <CardContent className="pt-0 pb-4 space-y-3">
              {findings.map((finding: any) => (
                <div
                  key={finding.id}
                  className={cn(
                    "p-3 rounded-lg border space-y-1",
                    finding.severity === "critical"
                      ? "bg-red-50/50 border-red-200"
                      : finding.severity === "warning"
                      ? "bg-amber-50/50 border-amber-200"
                      : "bg-muted/30"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {finding.severity === "critical" ? (
                        <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                      ) : finding.severity === "warning" ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      ) : (
                        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="font-medium text-sm">{finding.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {finding.category && (
                        <Badge variant="outline" className="text-xs">{finding.category}</Badge>
                      )}
                      {getSeverityBadge(finding.severity)}
                    </div>
                  </div>
                  {finding.description && (
                    <p className="text-xs text-muted-foreground ml-6">{finding.description}</p>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Drafted Communications */}
      {(communications?.length > 0) && (
        <Card>
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => toggleSection("comms")}
          >
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-green-600" />
              Drafted Communications
              <Badge variant="secondary" className="text-xs">{communications.length}</Badge>
            </h4>
            {expandedSections.has("comms") ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {expandedSections.has("comms") && (
            <CardContent className="pt-0 pb-4 space-y-3">
              {communications.map((comm: any) => (
                <div key={comm.id} className="p-3 rounded-lg border bg-green-50/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{comm.subject || "Untitled"}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs capitalize",
                        comm.status === "sent"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : comm.status === "approved"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-muted"
                      )}
                    >
                      {comm.status || "draft"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>To: {comm.recipientType || "Borrower"}</span>
                    {comm.communicationType && <span>Type: {comm.communicationType}</span>}
                  </div>
                  {comm.body && (
                    <div className="text-xs bg-white rounded p-3 border whitespace-pre-wrap max-h-40 overflow-auto">
                      {comm.body}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Deal Story */}
      <Card>
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => toggleSection("story")}
        >
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Deal Story
            {dealStory?.storyVersion > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                v{dealStory.storyVersion}
              </span>
            )}
          </h4>
          {expandedSections.has("story") ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {expandedSections.has("story") && (
          <CardContent className="pt-0 pb-4">
            {storyLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : dealStory?.currentNarrative ? (
              <div className="prose prose-sm max-w-none text-sm">
                <div
                  className="bg-muted/30 rounded-lg p-4 border"
                  dangerouslySetInnerHTML={{
                    __html: dealStory.currentNarrative
                      .replace(/^## /gm, '<h3 class="text-sm font-semibold mt-4 mb-2">')
                      .replace(/^- /gm, '<div class="flex items-start gap-1.5 ml-2 text-xs text-muted-foreground"><span>•</span><span>')
                      .replace(/\n(?=<div class="flex)/g, "</span></div>\n")
                      .replace(/\n\n/g, "</p><p>")
                      .replace(/\n/g, "<br/>"),
                  }}
                />
                {dealStory.lastAgentUpdate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated: {safeFormat(dealStory.lastAgentUpdate, "MMM d, yyyy h:mm a")}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No deal story generated yet. Run AI Analysis to create one.
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Pipeline History */}
      {hasRun && pipelineStatus?.latestRun && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Last run: {safeFormat(pipelineStatus.latestRun.startedAt, "MMM d, yyyy h:mm a")}
          {pipelineStatus.latestRun.triggerType && (
            <span> ({pipelineStatus.latestRun.triggerType})</span>
          )}
        </div>
      )}
    </div>
  );
}

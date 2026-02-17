import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";

interface DealStoryPanelProps {
  projectId: number;
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

export function DealStoryPanel({ projectId }: DealStoryPanelProps) {
  const { toast } = useToast();

  const storyQuery = useQuery<DealStoryData>({
    queryKey: ["/api/projects", projectId, "story"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/story`, {
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch deal story");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const runPipeline = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/agents/pipeline/start", {
        projectId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "AI Pipeline Started",
        description:
          "The AI agents are analyzing this deal. The story will update automatically.",
      });
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/projects", projectId, "story"],
        });
      }, 5000);
    },
    onError: (error: any) => {
      const msg =
        error?.message?.includes("already running")
          ? "A pipeline is already running for this deal."
          : error?.message || "Failed to start pipeline";
      toast({ title: "Pipeline Error", description: msg, variant: "destructive" });
    },
  });

  const refreshStory = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/story/refresh`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "story"],
      });
      toast({ title: "Deal Story Refreshed" });
    },
    onError: () => {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh deal story.",
        variant: "destructive",
      });
    },
  });

  if (storyQuery.isLoading) {
    return (
      <Card data-testid="card-deal-story-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Deal Story
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (storyQuery.isError) {
    return (
      <Card data-testid="card-deal-story-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Deal Story
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive/60" />
            <p className="text-sm text-muted-foreground">Failed to load the deal story.</p>
            <Button size="sm" variant="outline" onClick={() => storyQuery.refetch()} data-testid="button-retry-story">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const story = storyQuery.data;

  const healthColor = (health: string | undefined) => {
    if (!health) return "secondary";
    const h = health.toLowerCase();
    if (h === "pass" || h === "approved" || h === "good") return "default";
    if (h === "fail" || h === "critical" || h === "rejected") return "destructive";
    return "secondary";
  };

  const formatNarrative = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ") || line.startsWith("=== ")) {
        const cleanLine = line.replace(/^(## |=== |===\s*)/g, "").replace(/\s*===$/, "");
        return (
          <h3
            key={i}
            className="text-sm font-semibold text-foreground mt-4 mb-1 first:mt-0"
          >
            {cleanLine}
          </h3>
        );
      }
      if (line.startsWith("  - ") || line.startsWith("- ")) {
        const content = line.replace(/^\s*-\s*/, "");
        const hasSeverity = content.match(/^\[(critical|warning|info|fail|pass)\]/i);
        return (
          <div key={i} className="flex items-start gap-2 ml-2 text-sm text-muted-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
            <span>
              {hasSeverity && (
                <Badge
                  variant={
                    hasSeverity[1].toLowerCase() === "critical" || hasSeverity[1].toLowerCase() === "fail"
                      ? "destructive"
                      : "secondary"
                  }
                  className="mr-1 text-[10px] px-1 py-0"
                >
                  {hasSeverity[1]}
                </Badge>
              )}
              {hasSeverity ? content.replace(hasSeverity[0], "").trim() : content}
            </span>
          </div>
        );
      }
      if (line.trim() === "") return <div key={i} className="h-1" />;
      return (
        <p key={i} className="text-sm text-muted-foreground">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="space-y-4" data-testid="deal-story-panel">
      <Card data-testid="card-deal-story">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5" />
            Deal Story
            {story && (
              <Badge variant="secondary" className="text-[10px]">
                v{story.storyVersion}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshStory.mutate()}
              disabled={refreshStory.isPending}
              data-testid="button-refresh-story"
            >
              {refreshStory.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => runPipeline.mutate()}
              disabled={runPipeline.isPending}
              data-testid="button-run-pipeline"
            >
              {runPipeline.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5 mr-1" />
              )}
              Run AI Pipeline
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!story ? (
            <div className="text-center py-8 space-y-3" data-testid="story-empty">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No AI analysis has been run on this deal yet.
              </p>
              <p className="text-xs text-muted-foreground">
                Click "Run AI Pipeline" to start analyzing documents and building the deal story.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {story.metadata && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="story-stats">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Extracted</p>
                      <p className="text-sm font-medium">
                        {story.metadata.total_extractions ?? story.metadata.total_documents_received ?? 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Findings</p>
                      <p className="text-sm font-medium">
                        {story.metadata.total_findings ?? story.metadata.policy_findings_count ?? 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Send className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Comms Drafted</p>
                      <p className="text-sm font-medium">
                        {story.metadata.total_communications ?? story.metadata.communications_drafted ?? 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    {story.metadata.overall_deal_health ? (
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Health</p>
                      <Badge variant={healthColor(story.metadata.overall_deal_health)} className="text-[10px]">
                        {story.metadata.overall_deal_health || "Pending"}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              <div
                className="prose prose-sm max-w-none dark:prose-invert space-y-0.5"
                data-testid="story-narrative"
              >
                {formatNarrative(story.currentNarrative)}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <span data-testid="text-story-version">
                  Version {story.storyVersion}
                  {story.lastUpdatedSection && ` \u00B7 Last: ${story.lastUpdatedSection}`}
                </span>
                <span data-testid="text-story-updated">
                  {story.lastAgentUpdate
                    ? `Updated ${new Date(story.lastAgentUpdate).toLocaleString()}`
                    : story.updatedAt
                      ? `Updated ${new Date(story.updatedAt).toLocaleString()}`
                      : ""}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

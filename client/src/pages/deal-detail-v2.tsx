import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, FolderOpen, RefreshCw, ExternalLink,
  LayoutDashboard, FileText, CheckSquare, Users, MessageCircle, Sparkles,
  MoreHorizontal, DollarSign,
  Loader2, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StageProgressBar } from "@/components/ui/phase1/stage-progress-bar";
import { StatusBadge } from "@/components/ui/phase1/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import TabOverview from "@/components/admin/deal-v2/TabOverview";
import TabDocuments from "@/components/admin/deal-v2/TabDocuments";
import TabTasks from "@/components/admin/deal-v2/TabTasks";
import TabPeople from "@/components/admin/deal-v2/TabPeople";
import TabComms from "@/components/admin/deal-v2/TabComms";
import TabAIInsights from "@/components/admin/deal-v2/TabAIInsights";
import AIReviewResultsModal from "@/components/admin/deal-v2/AIReviewResultsModal";

function formatCurrency(amount: number | undefined): string {
  if (!amount) return "$0";
  return "$" + amount.toLocaleString();
}

function KpiCard({
  label, value, subtitle, icon: Icon, valueColor,
}: {
  label: string; value: string; subtitle?: string; icon: any; valueColor?: string;
}) {
  return (
    <div className="bg-card border rounded-[10px] px-4 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor || ""}`}>{value}</div>
      {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ControlCard({
  label, children,
}: {
  label: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-[10px] px-4 py-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DealStrip({
  deal, dealId, isAdmin, stages: programStages,
}: {
  deal: any; dealId: string; isAdmin: boolean; stages?: any[];
}) {
  const { toast } = useToast();
  const projectId = deal.projectId || deal.id;

  const [pendingProgramId, setPendingProgramId] = useState<number | null | undefined>(undefined);
  const [showProgramConfirm, setShowProgramConfirm] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | undefined>(undefined);
  const [showStageConfirm, setShowStageConfirm] = useState(false);

  const invalidateDeal = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId] });
  };

  const saveControlMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("PATCH", `/api/admin/projects/${projectId}`, data);
    },
    onSuccess: () => {
      invalidateDeal();
      toast({ title: "Deal updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const convertProgramMutation = useMutation({
    mutationFn: async (programId: number | null) => {
      return apiRequest("POST", `/api/admin/projects/${projectId}/convert-program`, { programId });
    },
    onSuccess: () => {
      invalidateDeal();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals", dealId, "tasks"] });
      toast({ title: "Loan program updated", description: "Documents and tasks have been synced to the new program." });
    },
    onError: () => toast({ title: "Failed to convert program", variant: "destructive" }),
  });

  const { data: programsData } = useQuery<any[]>({
    queryKey: ["/api/admin/programs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/programs", { credentials: "include" });
      if (!res.ok) return [];
      const d = await res.json();
      return d.programs || d || [];
    },
  });
  const programs = Array.isArray(programsData) ? programsData : [];

  const { data: dealStatusesData } = useQuery<any[]>({
    queryKey: ["/api/admin/deal-statuses"],
    queryFn: async () => {
      const res = await fetch("/api/admin/deal-statuses", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const defaultStageOptions = [
    { value: "application", label: "Application" },
    { value: "intake", label: "Intake" },
    { value: "processing", label: "Processing" },
    { value: "underwriting", label: "Underwriting" },
    { value: "approval", label: "Approval" },
    { value: "closing", label: "Closing" },
    { value: "funded", label: "Funded" },
    { value: "documentation", label: "Documentation" },
  ];

  const stageOptions = (programStages && programStages.length > 0)
    ? programStages.map((s: any) => ({
        value: s.stageKey || s.stepKey || s.key || s.label?.toLowerCase().replace(/\s+/g, "_") || `stage-${s.id}`,
        label: s.stageName || s.stepName || s.name || s.label || `Stage ${s.id}`,
      }))
    : defaultStageOptions;

  const defaultStatusOptions = [
    { value: "active", label: "Active" },
    { value: "on_hold", label: "On Hold" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "funded", label: "Funded" },
  ];

  const configuredStatuses = Array.isArray(dealStatusesData) ? dealStatusesData : [];
  const statusOptions = configuredStatuses.length > 0
    ? configuredStatuses.filter((s: any) => s.isActive !== false).map((s: any) => ({
        value: s.key,
        label: s.label,
      }))
    : defaultStatusOptions;

  const handleProgramChange = (v: string) => {
    const newProgramId = v === "none" ? null : Number(v);
    setPendingProgramId(newProgramId);
    setShowProgramConfirm(true);
  };

  const confirmProgramChange = () => {
    if (pendingProgramId !== undefined) {
      convertProgramMutation.mutate(pendingProgramId);
    }
    setShowProgramConfirm(false);
    setPendingProgramId(undefined);
  };

  const cancelProgramChange = () => {
    setShowProgramConfirm(false);
    setPendingProgramId(undefined);
  };

  const handleStageChange = (v: string) => {
    setPendingStage(v);
    setShowStageConfirm(true);
  };

  const confirmStageChange = () => {
    if (pendingStage) {
      saveControlMutation.mutate({ currentStage: pendingStage });
    }
    setShowStageConfirm(false);
    setPendingStage(undefined);
  };

  const cancelStageChange = () => {
    setShowStageConfirm(false);
    setPendingStage(undefined);
  };

  const loanAmount = deal.loanAmount || deal.loanData?.loanAmount;
  const purpose = deal.loanPurpose || deal.loanData?.loanPurpose || deal.loanType;
  const purposeLabel = purpose ? purpose.charAt(0).toUpperCase() + purpose.slice(1).replace(/_/g, " ") : undefined;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Loan Amount" value={formatCurrency(loanAmount)} subtitle={purposeLabel} />
        <ControlCard label="Deal Status">
          <Select
            value={deal.projectStatus || deal.status || "active"}
            onValueChange={(v) => saveControlMutation.mutate({ status: v })}
          >
            <SelectTrigger className="h-8 border-0 shadow-none px-0 text-[18px] font-bold focus:ring-0" data-testid="select-deal-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlCard>
        <ControlCard label="Current Stage">
          <Select
            value={deal.stage || deal.currentStage || "application"}
            onValueChange={handleStageChange}
          >
            <SelectTrigger className="h-8 border-0 shadow-none px-0 text-[18px] font-bold focus:ring-0" data-testid="select-current-stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stageOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlCard>
        <ControlCard label="Loan Program">
          <Select
            value={deal.programId ? String(deal.programId) : "none"}
            onValueChange={handleProgramChange}
            disabled={convertProgramMutation.isPending || !isAdmin}
          >
            <SelectTrigger className="h-8 border-0 shadow-none px-0 text-[18px] font-bold focus:ring-0" data-testid="select-loan-program">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Program</SelectItem>
              {programs.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlCard>
      </div>

      <AlertDialog open={showProgramConfirm} onOpenChange={setShowProgramConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Loan Program?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the loan program will rebuild this deal's pipeline, including stages, document requirements, and tasks.
              Uploaded documents will be preserved, but the checklist structure will be replaced with the new program's template.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelProgramChange} data-testid="cancel-program-change">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmProgramChange}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-program-change"
            >
              Confirm Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showStageConfirm} onOpenChange={setShowStageConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Override Current Stage?</AlertDialogTitle>
            <AlertDialogDescription>
              The current stage is normally determined automatically based on completed documents and tasks.
              Are you sure you want to manually override it to "{stageOptions.find(o => o.value === pendingStage)?.label || pendingStage}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelStageChange} data-testid="cancel-stage-change">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStageChange}
              data-testid="confirm-stage-change"
            >
              Override Stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const DEFAULT_STAGES = [
  { id: "application", label: "Application" },
  { id: "processing", label: "Processing" },
  { id: "underwriting", label: "Underwriting" },
  { id: "appraisal", label: "Appraisal & Title" },
  { id: "closing", label: "Closing" },
];

export default function DealDetailV2() {
  const [, params] = useRoute("/deals/:id");
  const [, adminParams] = useRoute("/admin/deals/:id");
  const dealId = params?.id || adminParams?.id;
  const { user } = useAuth();
  const isAdmin = user?.role && ["admin", "staff", "super_admin"].includes(user.role);
  const [activeTab, setActiveTab] = useState("overview");
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineProjectId, setPipelineProjectId] = useState<number | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const { toast } = useToast();

  const apiBase = isAdmin ? `/api/admin/deals` : `/api/deals`;

  const { data: dealData, isLoading, error: dealError } = useQuery<{
    deal: any;
    stages: any[];
    activity: any[];
    processors?: any[];
  }>({
    queryKey: [apiBase, dealId],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/${dealId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deal");
      return res.json();
    },
    enabled: !!dealId,
    retry: 2,
  });

  const deal = dealData?.deal;
  const activities = dealData?.activity ?? [];
  const properties = (dealData as any)?.properties ?? [];

  // Tasks (separate endpoint, may or may not exist)
  const { data: tasksData } = useQuery<any[]>({
    queryKey: [apiBase, dealId, "tasks"],
    queryFn: async () => {
      try {
        const res = await fetch(`${apiBase}/${dealId}/tasks`, { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: !!dealId,
  });
  const tasks = Array.isArray(tasksData) ? tasksData : (tasksData as any)?.tasks ?? [];

  // Documents
  const { data: docsData } = useQuery<{ documents: any[] }>({
    queryKey: [apiBase, dealId, "documents"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/${dealId}/documents`, { credentials: "include" });
      if (!res.ok) return { documents: [] };
      return res.json();
    },
    enabled: !!dealId,
  });
  const documents = docsData?.documents ?? [];

  useEffect(() => {
    if (deal) {
      const projectId = deal.projectId || deal.project_id;
      if (projectId) {
        setPipelineProjectId(projectId);
      }
    }
  }, [deal]);

  const { data: initialPipelineStatus } = useQuery<{ hasRun: boolean; latestRun: any }>({
    queryKey: ["/api/projects", pipelineProjectId, "pipeline", "status", "initial"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${pipelineProjectId}/pipeline/status`, { credentials: "include" });
      if (!res.ok) return { hasRun: false, latestRun: null };
      return res.json();
    },
    enabled: !!pipelineProjectId && !pipelineRunning,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (initialPipelineStatus?.latestRun?.status === "running") {
      setPipelineRunning(true);
    }
  }, [initialPipelineStatus]);

  const triggerPipeline = useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", "/api/admin/agents/pipeline/start", { projectId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "AI Pipeline Started", description: "Processing your deal automatically..." });
      setPipelineRunning(true);
    },
    onError: (error: any) => {
      toast({ title: "Pipeline Error", description: error?.message || "Failed to start pipeline", variant: "destructive" });
    },
  });

  const { data: pipelineStatus } = useQuery<{
    hasRun: boolean;
    latestRun: any;
    steps: any[];
  }>({
    queryKey: ["/api/projects", pipelineProjectId, "pipeline", "status"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${pipelineProjectId}/pipeline/status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pipeline status");
      return res.json();
    },
    enabled: pipelineRunning && !!pipelineProjectId,
    refetchInterval: pipelineRunning ? 3000 : false,
  });

  const agentSequence: string[] = (pipelineStatus?.latestRun?.agentSequence as string[]) || [];
  const currentAgentIndex: number = pipelineStatus?.latestRun?.currentAgentIndex ?? 0;
  const pipelineStatusValue: string = pipelineStatus?.latestRun?.status || "";
  const totalSteps = agentSequence.length || 1;
  const completedSteps = pipelineStatusValue === "completed"
    ? totalSteps
    : pipelineStatusValue === "failed"
      ? currentAgentIndex
      : currentAgentIndex;
  const pipelineProgress = Math.round((completedSteps / totalSteps) * 100);

  const AGENT_LABELS: Record<string, string> = {
    document_intelligence: "Analyzing Documents",
    processor: "Processing Deal",
    communication: "Drafting Communications",
  };

  const currentStepName = pipelineStatusValue === "completed"
    ? "Complete"
    : pipelineStatusValue === "failed"
      ? "Failed"
      : AGENT_LABELS[agentSequence[currentAgentIndex]] || `Step ${currentAgentIndex + 1}`;

  useEffect(() => {
    if (!pipelineRunning) return;
    if (pipelineStatusValue === "completed") {
      toast({ title: "Pipeline Complete", description: "All AI agents have finished processing." });
      setPipelineRunning(false);
      setShowReviewModal(true);
      queryClient.invalidateQueries({ queryKey: [apiBase, dealId] });
      queryClient.invalidateQueries({ queryKey: [apiBase, dealId, "documents"] });
      queryClient.invalidateQueries({ queryKey: [apiBase, dealId, "tasks"] });
    } else if (pipelineStatusValue === "failed") {
      const errorMsg = pipelineStatus?.latestRun?.errorMessage || "Pipeline encountered an error";
      toast({ title: "Pipeline Failed", description: errorMsg, variant: "destructive" });
      setPipelineRunning(false);
    }
  }, [pipelineStatusValue, pipelineRunning]);

  const handleAutoProcess = () => {
    const projectId = deal?.projectId || deal?.project_id;
    if (!projectId) {
      toast({ title: "No Project", description: "This deal has no associated project for pipeline processing.", variant: "destructive" });
      return;
    }
    setPipelineProjectId(projectId);
    triggerPipeline.mutate(projectId);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6 max-w-7xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold mb-2">{dealError ? "Failed to load deal" : "Deal not found"}</h2>
        <p className="text-muted-foreground text-sm mb-4">
          {dealError ? "There was an error loading this deal. Please try again." : "This deal may have been deleted or you don't have access."}
        </p>
        <div className="flex items-center justify-center gap-3">
          {dealError && (
            <Button variant="default" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: [apiBase, dealId] })} data-testid="button-retry-deal">
              Retry
            </Button>
          )}
          <Link href={isAdmin ? "/admin" : "/deals"}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pipeline
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const rawStages = dealData?.stages || deal.stages || DEFAULT_STAGES;
  const stages = rawStages.map((s: any, i: number) => ({
    id: s.id || s.stepId || `stage-${i}`,
    label: s.label || s.name || s.stepName || s.stageName || `Stage ${i + 1}`,
    completed: s.completed || s.status === "completed" || false,
    current: s.current || s.status === "in_progress" || deal.stage?.toLowerCase() === (s.label || s.name || s.stageName || "").toLowerCase(),
  }));

  return (
    <div className="max-w-7xl mx-auto">
      {/* Fixed Header */}
      <div className="sticky top-0 z-20 bg-white border-b px-6 py-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <Link href={isAdmin ? "/admin" : "/deals"}>
              <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] text-muted-foreground font-medium" data-testid="text-deal-number">
                  {deal.dealNumber || `Deal #${deal.id}`}
                </span>
                <StatusBadge
                  variant={(deal.projectStatus || "active") === "active" ? "active" : (deal.projectStatus || "active") === "closed" ? "closed" : "pending"}
                  label={deal.projectStatus || "Active"}
                />
                {(deal.programName || deal.loanType) && (
                  <StatusBadge variant="pending" label={deal.programName || deal.loanType} />
                )}
              </div>
              <h1 className="text-xl font-bold leading-tight" data-testid="text-deal-title">
                {deal.propertyAddress
                  ? `${deal.propertyAddress}${deal.propertyCity ? `, ${deal.propertyCity}` : ""}${deal.propertyState ? `, ${deal.propertyState}` : ""}${deal.propertyZip ? ` ${deal.propertyZip}` : ""}`
                  : deal.dealNumber || `Deal #${deal.id}`}
              </h1>
              {(() => {
                const contactName = deal.borrowerName || [deal.customerFirstName, deal.customerLastName].filter(Boolean).join(" ");
                const contactEmail = deal.borrowerEmail || deal.customerEmail;
                const contactPhone = deal.borrowerPhone || deal.customerPhone;
                const contactParts = [contactName, contactEmail, contactPhone].filter(Boolean);
                return contactParts.length > 0 ? (
                  <p className="text-[12px] text-muted-foreground mt-0.5" data-testid="text-borrower-info">
                    {contactParts.join(" \u00B7 ")}
                  </p>
                ) : null;
              })()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {deal.reviewMode && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[11.5px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Review Mode
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 text-[13px] font-medium"
              data-testid="button-drive"
              disabled={!deal.googleDriveFolderUrl && !deal.googleDriveFolderId}
              onClick={() => {
                const driveUrl = deal.googleDriveFolderUrl
                  || (deal.googleDriveFolderId ? `https://drive.google.com/drive/folders/${deal.googleDriveFolderId}` : null);
                if (driveUrl) {
                  window.open(driveUrl, "_blank", "noopener,noreferrer");
                } else {
                  toast({ title: "No Drive Folder", description: "This deal does not have a linked Google Drive folder.", variant: "destructive" });
                }
              }}
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Drive
            </Button>
            <Button
              size="sm"
              className="h-9 px-4 text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-md shadow-emerald-600/30"
              data-testid="button-auto-process"
              disabled={pipelineRunning || triggerPipeline.isPending}
              onClick={handleAutoProcess}
            >
              {(pipelineRunning || triggerPipeline.isPending) ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {pipelineRunning ? "Processing..." : "Auto Process"}
            </Button>
            {!pipelineRunning && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-3 text-[13px] font-medium"
                data-testid="button-review-results"
                onClick={() => setShowReviewModal(true)}
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Review Results
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-more-actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stage Progress Bar */}
        <StageProgressBar
          stages={stages}
          completedItems={
            (deal.completedDocuments || documents.filter((d: any) => d.status === "approved" || d.status === "ai_reviewed").length || 0) +
            (deal.completedTasks || tasks.filter((t: any) => t.status === "completed").length || 0)
          }
          totalItems={
            (deal.totalDocuments || documents.length || 0) +
            (deal.totalTasks || tasks.length || 0)
          }
        />

        {pipelineRunning && (
          <div className="mt-3 space-y-1.5" data-testid="pipeline-progress">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span data-testid="text-pipeline-step">{currentStepName}...</span>
              </div>
              <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400" data-testid="text-pipeline-percent">
                {pipelineProgress}%
              </span>
            </div>
            <Progress
              value={pipelineProgress}
              className="h-2 bg-emerald-100 dark:bg-emerald-900/30 [&>div]:bg-emerald-500 [&>div]:transition-all [&>div]:duration-700"
            />
          </div>
        )}
      </div>

      {/* Deal Strip + Tabs */}
      <div className="px-6 py-5">
        <DealStrip deal={deal} dealId={dealId!} isAdmin={!!isAdmin} stages={dealData?.stages} />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="border rounded-lg mt-5 mb-5 bg-card">
            <TabsList className="bg-transparent rounded-none w-full justify-between p-0 h-auto">
              {[
                { value: "overview", label: "Overview", icon: LayoutDashboard, badge: null },
                { value: "documents", label: "Documents", icon: FileText, badge: documents.filter((d: any) => d.status === 'pending').length > 0 ? `${documents.filter((d: any) => d.status === 'pending').length} pending` : String(documents.length) },
                { value: "tasks", label: "Tasks", icon: CheckSquare, badge: String(tasks.length) },
                { value: "people", label: "People", icon: Users, badge: null },
                { value: "communications", label: "Communications", icon: MessageCircle, badge: null },
                { value: "ai-insights", label: "AI Insights", icon: Sparkles, badge: null },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-[16px] font-semibold gap-2"
                  data-testid={`tab-${tab.value}`}
                >
                  <tab.icon className="h-4.5 w-4.5" />
                  {tab.label}
                  {tab.badge && (
                    <span className={`text-[13px] ml-0.5 ${tab.badge.includes('pending') ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                      {tab.badge}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-5">
            <TabsContent value="overview" className="m-0">
              <TabOverview deal={deal} properties={properties} dealId={dealId!} isAdmin={!!isAdmin} />
            </TabsContent>
            <TabsContent value="documents" className="m-0">
              <TabDocuments deal={deal} documents={documents} dealId={dealId!} stages={dealData?.stages} />
            </TabsContent>
            <TabsContent value="tasks" className="m-0">
              <TabTasks deal={deal} tasks={tasks} dealId={dealId!} />
            </TabsContent>
            <TabsContent value="people" className="m-0">
              <TabPeople deal={deal} isAdmin={!!isAdmin} />
            </TabsContent>
            <TabsContent value="communications" className="m-0">
              <TabComms deal={deal} activities={activities} dealId={dealId!} />
            </TabsContent>
            <TabsContent value="ai-insights" className="m-0">
              <TabAIInsights deal={deal} dealId={dealId!} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <AIReviewResultsModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        dealId={dealId!}
        deal={deal}
      />
    </div>
  );
}

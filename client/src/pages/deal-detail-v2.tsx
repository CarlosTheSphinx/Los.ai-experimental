import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, FolderOpen, RefreshCw, ExternalLink,
  LayoutDashboard, FileText, CheckSquare, Users, MessageCircle, Sparkles,
  MoreHorizontal, DollarSign, Percent, TrendingUp, Calculator, Activity,
  Loader2, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StageProgressBar } from "@/components/ui/phase1/stage-progress-bar";
import { StatusBadge } from "@/components/ui/phase1/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import TabOverview from "@/components/admin/deal-v2/TabOverview";
import TabDocuments from "@/components/admin/deal-v2/TabDocuments";
import TabTasks from "@/components/admin/deal-v2/TabTasks";
import TabPeople from "@/components/admin/deal-v2/TabPeople";
import TabComms from "@/components/admin/deal-v2/TabComms";
import TabAIInsights from "@/components/admin/deal-v2/TabAIInsights";

function formatCurrency(amount: number | undefined): string {
  if (!amount) return "$0";
  return "$" + amount.toLocaleString();
}

function KpiCard({
  label, value, subtitle, tooltip, icon: Icon, valueColor,
}: {
  label: string; value: string; subtitle?: string; tooltip?: string; icon: any; valueColor?: string;
}) {
  const labelEl = tooltip ? (
    <Tooltip>
      <TooltipTrigger className="flex items-center gap-1 border-b border-dashed border-muted-foreground/40 cursor-help text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} <span className="text-muted-foreground/60">?</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
  );
  return (
    <div className="bg-card border rounded-[10px] px-4 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {labelEl}
      </div>
      <div className={`text-2xl font-bold ${valueColor || ""}`}>{value}</div>
      {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function KpiRow({ deal, documents, tasks }: { deal: any; documents: any[]; tasks: any[] }) {
  const propertyValue = deal.propertyValue || deal.loanData?.propertyValue;
  const loanAmount = deal.loanAmount || deal.loanData?.loanAmount;
  const ltv = deal.ltv || deal.loanData?.ltv;
  const dscr = deal.dscr || deal.loanData?.dscr;
  const interestRate = deal.interestRate;
  const termMonths = deal.termMonths || deal.loanTermMonths || deal.loanData?.loanTerm;
  const purpose = deal.loanPurpose || deal.loanData?.loanPurpose || deal.loanType;
  const progress = deal.progressPercentage || deal.completionPercentage || 0;
  const totalDocs = deal.totalDocuments || documents.length || 0;
  const completedDocs = deal.completedDocuments || documents.filter((d: any) => d.status === "approved" || d.status === "ai_reviewed").length || 0;
  const totalTasks = deal.totalTasks || tasks.length || 0;
  const completedTasks = deal.completedTasks || tasks.filter((t: any) => t.status === "completed").length || 0;
  const totalItems = totalDocs + totalTasks;
  const completedItems = completedDocs + completedTasks;
  const ltvSubtitle = propertyValue ? `of ${formatCurrency(propertyValue)}` : undefined;
  const dscrValue = dscr ? `${dscr}` : "\u2014";
  const dscrSubtitle = dscr ? (parseFloat(dscr) >= 1.2 ? "Above threshold (1.20)" : "Below threshold (1.20)") : "Pending";
  const rateDisplay = interestRate && interestRate !== "\u2014" ? (String(interestRate).includes("%") ? interestRate : `${interestRate}%`) : "\u2014";
  const termLabel = termMonths
    ? (typeof termMonths === "string" && termMonths.includes("month")
        ? (parseInt(termMonths) >= 12 ? `${Math.round(parseInt(termMonths) / 12)}-year` : termMonths)
        : (Number(termMonths) >= 12 ? `${Math.round(Number(termMonths) / 12)}-year` : `${termMonths} months`))
    : "";
  const rateSubtitle = termLabel ? `${termLabel} fixed` : undefined;
  const purposeLabel = purpose ? purpose.charAt(0).toUpperCase() + purpose.slice(1).replace(/_/g, " ") : undefined;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <KpiCard icon={DollarSign} label="Loan Amount" value={formatCurrency(loanAmount)} subtitle={purposeLabel} />
      <KpiCard icon={Percent} label="LTV" value={ltv ? `${ltv}%` : "\u2014"} subtitle={ltvSubtitle} tooltip="Loan-to-Value \u2014 the loan amount as a percentage of the property\u2019s appraised value." />
      <KpiCard icon={TrendingUp} label="DSCR" value={dscrValue} subtitle={dscrSubtitle} tooltip="Debt Service Coverage Ratio \u2014 net operating income divided by total debt service." />
      <KpiCard icon={Calculator} label="Interest Rate" value={rateDisplay} subtitle={rateSubtitle} />
      <KpiCard icon={Activity} label="Progress" value={`${progress}%`} subtitle={totalItems > 0 ? `${completedItems} of ${totalItems} items` : undefined} valueColor={progress >= 70 ? "text-green-600" : progress >= 40 ? "text-blue-600" : ""} />
    </div>
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
                  variant={deal.status === "active" ? "active" : deal.status === "closed" ? "closed" : "pending"}
                  label={deal.status || "Unknown"}
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
            <Button variant="ghost" size="sm" className="h-9 px-4 text-[13px] font-medium" data-testid="button-drive">
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Drive
            </Button>
            <Button size="sm" className="h-9 px-4 text-[13px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-md shadow-emerald-600/30" data-testid="button-auto-process">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Auto Process
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-more-actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stage Progress Bar */}
        <StageProgressBar stages={stages} />
      </div>

      {/* KPI Cards + Tabs */}
      <div className="px-6 py-5">
        <KpiRow deal={deal} documents={documents} tasks={tasks} />

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
              <TabOverview deal={deal} properties={properties} dealId={dealId!} />
            </TabsContent>
            <TabsContent value="documents" className="m-0">
              <TabDocuments deal={deal} documents={documents} dealId={dealId!} stages={dealData?.stages} />
            </TabsContent>
            <TabsContent value="tasks" className="m-0">
              <TabTasks deal={deal} tasks={tasks} dealId={dealId!} />
            </TabsContent>
            <TabsContent value="people" className="m-0">
              <TabPeople deal={deal} />
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
    </div>
  );
}

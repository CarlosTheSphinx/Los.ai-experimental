import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft, FolderOpen, RefreshCw, ExternalLink,
  LayoutDashboard, FileText, CheckSquare, Users, MessageCircle, Sparkles,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  // Main deal query — endpoint returns { deal, stages, activity, processors }
  const { data: dealData, isLoading } = useQuery<{
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
  });

  const deal = dealData?.deal;
  const activities = dealData?.activity ?? [];

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
  const tasks = Array.isArray(tasksData) ? tasksData : [];

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
        <h2 className="text-lg font-semibold mb-2">Deal not found</h2>
        <p className="text-muted-foreground text-sm mb-4">This deal may have been deleted or you don't have access.</p>
        <Link href={isAdmin ? "/admin" : "/deals"}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pipeline
          </Button>
        </Link>
      </div>
    );
  }

  // Build stages from deal data (dealData.stages from the API, or fallback)
  const stages = (dealData?.stages || deal.stages || DEFAULT_STAGES).map((s: any, i: number) => ({
    id: s.id || s.stepId || `stage-${i}`,
    label: s.label || s.name || s.stepName || `Stage ${i + 1}`,
    completed: s.completed || false,
    current: s.current || deal.stage?.toLowerCase() === (s.label || s.name || "").toLowerCase(),
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
              <p className="text-[13px] text-muted-foreground mt-0.5" data-testid="text-borrower-info">
                {[deal.borrowerName, deal.borrowerEmail, deal.borrowerPhone].filter(Boolean).join(" \u00B7 ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {deal.reviewMode && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[11.5px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Review Mode
              </div>
            )}
            <Button variant="outline" size="sm" data-testid="button-drive">
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Drive
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-auto-process">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Auto Process
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" data-testid="button-more-actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stage Progress Bar */}
        <StageProgressBar stages={stages} />
      </div>

      {/* Tabbed Content */}
      <div className="px-6 py-5">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent border-b rounded-none w-full justify-start gap-0 p-0 h-auto">
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
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-2.5 text-[13px] font-medium gap-1.5"
                data-testid={`tab-${tab.value}`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.badge && (
                  <span className={`text-[11px] ml-0.5 ${tab.badge.includes('pending') ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                    {tab.badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-5">
            <TabsContent value="overview" className="m-0">
              <TabOverview deal={deal} />
            </TabsContent>
            <TabsContent value="documents" className="m-0">
              <TabDocuments deal={deal} documents={documents} dealId={dealId!} />
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

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Layers, Plus, Search, CheckCircle2, Clock, FileText, ListTodo,
  ChevronRight, ExternalLink, MoreHorizontal, Percent, DollarSign, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SummaryCard, SummaryStrip } from "@/components/ui/phase1/summary-card";
import { StatusBadge } from "@/components/ui/phase1/status-badge";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { ExpandableRow } from "@/components/ui/phase1/expandable-row";
import { SlideOverPanel } from "@/components/ui/phase1/slide-over-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProgramCreationWizard } from "@/components/onboarding/ProgramCreationWizard";

interface LoanProgram {
  id: number;
  name: string;
  programType: string;
  description: string | null;
  isActive: boolean;
  isTemplate: boolean;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  minLtv: number | null;
  maxLtv: number | null;
  minDscr: number | null;
  baseRate: number | null;
  maxRate: number | null;
  propertyTypes: string[];
  documents?: any[];
  tasks?: any[];
  createdAt: string;
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

export default function ProgramsV2() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<LoanProgram | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editWizardProgram, setEditWizardProgram] = useState<{ id: number } | null>(null);

  const { data: programs = [], isLoading } = useQuery<LoanProgram[]>({
    queryKey: ["/api/admin/programs"],
  });

  // Fetch selected program details
  const { data: programDetails } = useQuery<{
    program: LoanProgram;
    documents: any[];
    tasks: any[];
    workflowSteps: any[];
  }>({
    queryKey: ["/api/admin/programs", selectedProgram?.id],
    enabled: !!selectedProgram?.id,
  });

  // Metrics
  const metrics = useMemo(() => {
    const total = programs.length;
    const active = programs.filter((p) => p.isActive).length;
    const docCount = programs.reduce((sum, p) => sum + (p.documents?.length || 0), 0);
    const taskCount = programs.reduce((sum, p) => sum + (p.tasks?.length || 0), 0);
    return { total, active, docCount, taskCount };
  }, [programs]);

  // Filtered programs
  const filteredPrograms = useMemo(() => {
    let result = [...programs];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.programType?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    if (activeFilter === "active") result = result.filter((p) => p.isActive);
    if (activeFilter === "inactive") result = result.filter((p) => !p.isActive);
    if (activeFilter === "template") result = result.filter((p) => p.isTemplate);

    return result;
  }, [programs, searchQuery, activeFilter]);

  const openPanel = (program: LoanProgram) => {
    setSelectedProgram(program);
    setPanelOpen(true);
  };

  if (showWizard || editWizardProgram) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <ProgramCreationWizard
          onComplete={() => {
            setShowWizard(false);
            setEditWizardProgram(null);
            queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
          }}
          onCancel={() => { setShowWizard(false); setEditWizardProgram(null); }}
          editProgram={editWizardProgram}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold">Loan Programs</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure and manage your lending products.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard(true)} data-testid="button-new-program">
          <Plus className="h-4 w-4 mr-1" /> New Program
        </Button>
      </div>

      {/* Summary Strip */}
      <SummaryStrip>
        <SummaryCard
          icon={Layers}
          label="Total Programs"
          value={metrics.total}
          isActive={activeFilter === "all"}
          onClick={() => setActiveFilter("all")}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Active"
          value={metrics.active}
          subtitle="Accepting deals"
          isActive={activeFilter === "active"}
          onClick={() => setActiveFilter("active")}
        />
        <SummaryCard
          icon={FileText}
          label="Documents"
          value={metrics.docCount}
          subtitle="Across all programs"
          isActive={false}
        />
        <SummaryCard
          icon={ListTodo}
          label="Tasks"
          value={metrics.taskCount}
          subtitle="Workflow tasks"
          isActive={false}
        />
      </SummaryStrip>

      {/* Table Card */}
      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        {/* Search & Filters */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <div className="relative flex-1 max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-[13px]"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredPrograms.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No programs found"
            description={searchQuery ? "Try adjusting your search." : "Create your first loan program to get started."}
            actionLabel="+ New Program"
            onAction={() => setShowWizard(true)}
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2">
                <th className="w-8" />
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Program
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Type
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger className="border-b border-dashed border-muted-foreground/40 cursor-help">LTV Range</TooltipTrigger>
                    <TooltipContent>Loan-to-Value ratio range</TooltipContent>
                  </Tooltip>
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Rate
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Loan Range
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map((program) => (
                <ExpandableRow
                  key={program.id}
                  columns={6}
                  isExpanded={expandedId === program.id}
                  onToggle={(expanded) => setExpandedId(expanded ? program.id : null)}
                  summary={
                    <>
                      <td className="px-3 py-3">
                        <div className="text-[13px] font-medium">{program.name}</div>
                        {program.description && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {program.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="text-[11px]">
                          {program.programType || "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-[13px]">
                        {program.minLtv || program.maxLtv
                          ? `${program.minLtv || 0}% – ${program.maxLtv || 100}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-[13px]">
                        {program.baseRate
                          ? `${program.baseRate}%${program.maxRate ? ` – ${program.maxRate}%` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-[13px]">
                        {program.minLoanAmount || program.maxLoanAmount
                          ? `${formatCurrency(program.minLoanAmount)} – ${formatCurrency(program.maxLoanAmount)}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          variant={program.isActive ? "active" : program.isTemplate ? "template" : "inactive"}
                          label={program.isActive ? "Active" : program.isTemplate ? "Template" : "Inactive"}
                        />
                      </td>
                    </>
                  }
                  details={
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">Metrics</h4>
                        <div className="grid grid-cols-2 gap-y-2 text-[12px]">
                          <span className="text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger className="border-b border-dashed border-muted-foreground cursor-help">Min DSCR</TooltipTrigger>
                              <TooltipContent>Minimum Debt Service Coverage Ratio</TooltipContent>
                            </Tooltip>
                          </span>
                          <span className="font-medium">{program.minDscr ? `${program.minDscr}x` : "—"}</span>
                          <span className="text-muted-foreground">Base Rate</span>
                          <span className="font-medium">{program.baseRate ? `${program.baseRate}%` : "—"}</span>
                          <span className="text-muted-foreground">Docs</span>
                          <span className="font-medium">{program.documents?.length || 0}</span>
                          <span className="text-muted-foreground">Tasks</span>
                          <span className="font-medium">{program.tasks?.length || 0}</span>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">Property Types</h4>
                        <div className="flex flex-wrap gap-1">
                          {(program.propertyTypes || []).length > 0 ? (
                            program.propertyTypes.map((t: string) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                            ))
                          ) : (
                            <span className="text-[12px] text-muted-foreground">No types configured</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">Quick Actions</h4>
                        <div className="flex flex-col gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start text-[12px]"
                            onClick={() => openPanel(program)}
                          >
                            <ExternalLink className="h-3 w-3 mr-2" /> Edit Program
                          </Button>
                        </div>
                      </div>
                    </div>
                  }
                />
              ))}
            </tbody>
          </table>
        )}

        {/* Footer */}
        {filteredPrograms.length > 0 && (
          <div className="px-4 py-3 border-t text-[12px] text-muted-foreground">
            Showing {filteredPrograms.length} of {programs.length} programs
          </div>
        )}
      </div>

      {/* Slide-Over Panel */}
      <SlideOverPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={selectedProgram?.name || "Program Details"}
      >
        {selectedProgram && (
          <Tabs defaultValue="details" className="mt-2">
            <TabsList className="bg-transparent border-b rounded-none w-full justify-start gap-0 p-0 h-auto">
              {["Details", "Workflow", "Pricing"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab.toLowerCase()}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2 text-[13px] font-medium"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
                  <p className="font-medium mt-0.5">{selectedProgram.name}</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
                  <p className="font-medium mt-0.5">{selectedProgram.programType || "—"}</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">LTV Range</label>
                  <p className="font-medium mt-0.5">{selectedProgram.minLtv || 0}% – {selectedProgram.maxLtv || 100}%</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Loan Range</label>
                  <p className="font-medium mt-0.5">{formatCurrency(selectedProgram.minLoanAmount)} – {formatCurrency(selectedProgram.maxLoanAmount)}</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Base Rate</label>
                  <p className="font-medium mt-0.5">{selectedProgram.baseRate ? `${selectedProgram.baseRate}%` : "—"}</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Min DSCR</label>
                  <p className="font-medium mt-0.5">{selectedProgram.minDscr ? `${selectedProgram.minDscr}x` : "—"}</p>
                </div>
              </div>
              {selectedProgram.description && (
                <div className="text-[13px]">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
                  <p className="mt-0.5 text-muted-foreground">{selectedProgram.description}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="workflow" className="mt-4">
              <div className="text-[13px] text-muted-foreground text-center py-8">
                {programDetails?.workflowSteps?.length ? (
                  <div className="space-y-2">
                    {programDetails.workflowSteps.map((step: any, i: number) => (
                      <div key={step.id} className="flex items-center gap-3 p-3 border rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                          {i + 1}
                        </div>
                        <span className="font-medium text-foreground">{step.definition?.name || `Step ${i + 1}`}</span>
                        {step.estimatedDays && (
                          <Badge variant="secondary" className="text-[10px] ml-auto">{step.estimatedDays}d</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  "No workflow steps configured for this program."
                )}
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="mt-4">
              <div className="text-[13px] text-muted-foreground text-center py-8">
                <p>Pricing configuration for this program.</p>
                <p className="mt-1">Base Rate: {selectedProgram.baseRate ? `${selectedProgram.baseRate}%` : "Not set"}</p>
                <p>Max Rate: {selectedProgram.maxRate ? `${selectedProgram.maxRate}%` : "Not set"}</p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SlideOverPanel>
    </div>
  );
}

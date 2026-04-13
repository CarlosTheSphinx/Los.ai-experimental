import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import {
  Layers, Plus, Search, CheckCircle2, FileText, ListTodo,
  Pencil, Copy, ShieldCheck,
  ChevronRight, ChevronDown, AlertTriangle, Clock, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SummaryCard, SummaryStrip } from "@/components/ui/phase1/summary-card";
import { StatusBadge } from "@/components/ui/phase1/status-badge";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { ExpandableRow } from "@/components/ui/phase1/expandable-row";
import { SlideOverPanel } from "@/components/ui/phase1/slide-over-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProgramCreationWizard } from "@/components/onboarding/ProgramCreationWizard";

type CreditPolicyRule = {
  documentType: string;
  ruleTitle: string;
  ruleDescription: string;
  category?: string;
  severity?: string;
  isActive?: boolean;
  confidence?: "high" | "medium" | "low";
};

type CreditPolicy = {
  id: number;
  name: string;
  description: string | null;
  sourceFileName: string | null;
  isActive: boolean;
  ruleCount: number;
  createdAt: string;
  updatedAt: string;
};

type CreditPolicyWithRules = CreditPolicy & { rules: CreditPolicyRule[] };

function CreditPoliciesTab() {
  const [expandedPolicyId, setExpandedPolicyId] = useState<number | null>(null);
  const [expandedDocTypes, setExpandedDocTypes] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const { data: policies = [], isLoading } = useQuery<CreditPolicy[]>({
    queryKey: ["/api/admin/credit-policies"],
  });

  const { data: policyDetails } = useQuery<CreditPolicyWithRules>({
    queryKey: ["/api/admin/credit-policies", expandedPolicyId],
    enabled: !!expandedPolicyId,
  });

  const { data: programs = [] } = useQuery<LoanProgram[]>({
    queryKey: ["/api/admin/programs"],
  });

  const usedPolicyMap = useMemo(() => {
    const map: Record<number, string[]> = {};
    for (const p of programs) {
      if (p.creditPolicyId) {
        if (!map[p.creditPolicyId]) map[p.creditPolicyId] = [];
        map[p.creditPolicyId].push(p.name);
      }
    }
    return map;
  }, [programs]);

  const deletePolicyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/credit-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-policies"] });
      toast({ title: "Credit policy deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete credit policy", variant: "destructive" });
    },
  });

  function togglePolicy(id: number) {
    if (expandedPolicyId === id) {
      setExpandedPolicyId(null);
      setExpandedDocTypes({});
    } else {
      setExpandedPolicyId(id);
      setExpandedDocTypes({});
    }
  }

  function toggleDocType(docType: string) {
    setExpandedDocTypes((prev) => ({ ...prev, [docType]: !prev[docType] }));
  }

  function groupRulesByDocType(rules: CreditPolicyRule[]) {
    return rules.reduce((acc, rule) => {
      const dt = rule.documentType || "General";
      if (!acc[dt]) acc[dt] = [];
      acc[dt].push(rule);
      return acc;
    }, {} as Record<string, CreditPolicyRule[]>);
  }


  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No credit policies"
        description="Credit policies define the review rules for your loan programs. Create one from the Credit Policies page."
      />
    );
  }

  return (
    <div className="space-y-3">
      {policies.map((policy) => {
        const isExpanded = expandedPolicyId === policy.id;
        const grouped = isExpanded && policyDetails?.rules ? groupRulesByDocType(policyDetails.rules) : {};

        return (
          <Card key={policy.id} data-testid={`card-credit-policy-${policy.id}`}>
            <div
              className="flex items-center gap-3 p-4 cursor-pointer"
              onClick={() => togglePolicy(policy.id)}
              data-testid={`button-toggle-policy-${policy.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <ShieldCheck className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold" data-testid={`text-policy-name-${policy.id}`}>
                    {policy.name}
                  </span>
                  <StatusBadge
                    variant={policy.isActive ? "active" : "inactive"}
                    label={policy.isActive ? "Active" : "Inactive"}
                  />
                </div>
                {policy.description && (
                  <p className="text-[13px] text-muted-foreground mt-0.5 truncate" data-testid={`text-policy-desc-${policy.id}`}>
                    {policy.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 text-[13px] text-muted-foreground">
                <span className="flex items-center gap-1" data-testid={`text-policy-rules-${policy.id}`}>
                  <FileText className="h-3.5 w-3.5" />
                  {policy.ruleCount} rules
                </span>
                <span className="flex items-center gap-1" data-testid={`text-policy-updated-${policy.id}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(policy.updatedAt)}
                </span>
                {usedPolicyMap[policy.id] ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-40 cursor-not-allowed"
                          disabled
                          data-testid={`button-delete-policy-disabled-${policy.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      In use by {usedPolicyMap[policy.id].join(", ")}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`button-delete-policy-${policy.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Credit Policy</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{policy.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-delete-policy">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deletePolicyMutation.mutate(policy.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid="button-confirm-delete-policy"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 pb-4">
                {!policyDetails?.rules ? (
                  <div className="space-y-2 pl-9">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : Object.keys(grouped).length === 0 ? (
                  <p className="text-[13px] text-muted-foreground pl-9">No rules defined for this policy.</p>
                ) : (
                  <div className="space-y-2 pl-9">
                    {Object.entries(grouped).map(([docType, rules]) => {
                      const isDocExpanded = expandedDocTypes[docType];
                      return (
                        <div key={docType} className="border rounded-md" data-testid={`group-doctype-${policy.id}-${docType}`}>
                          <div
                            className="flex items-center gap-2 p-3 cursor-pointer hover-elevate"
                            onClick={() => toggleDocType(docType)}
                            data-testid={`button-toggle-doctype-${policy.id}-${docType}`}
                          >
                            {isDocExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[14px] font-medium flex-1">{docType}</span>
                            <Badge variant="secondary">{rules.length}</Badge>
                          </div>

                          {isDocExpanded && (
                            <div className="border-t divide-y">
                              {rules.map((rule, rIdx) => (
                                <div
                                  key={rIdx}
                                  className="px-4 py-2.5 flex items-start gap-3"
                                  data-testid={`row-rule-${policy.id}-${docType}-${rIdx}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[13px] font-medium" data-testid={`text-rule-title-${policy.id}-${rIdx}`}>
                                        {rule.ruleTitle || "(untitled)"}
                                      </span>
                                      {rule.category && (
                                        <Badge variant="outline" className="text-[11px]">
                                          {rule.category}
                                        </Badge>
                                      )}
                                      {rule.severity && (
                                        <Badge
                                          variant={rule.severity === "critical" ? "destructive" : "secondary"}
                                          className="text-[11px]"
                                        >
                                          {rule.severity}
                                        </Badge>
                                      )}
                                    </div>
                                    {rule.ruleDescription && (
                                      <p className="text-[12px] text-muted-foreground mt-0.5">
                                        {rule.ruleDescription}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

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
  minInterestRate: number | null;
  maxInterestRate: number | null;
  yspMin: number | null;
  yspMax: number | null;
  basePointsMin: number | null;
  basePointsMax: number | null;
  termOptions: string | null;
  creditPolicyId: number | null;
  propertyTypes: string[];
  eligiblePropertyTypes: string[];
  documents?: any[];
  tasks?: any[];
  documentCount?: number;
  taskCount?: number;
  quoteFormFields?: any;
  createdAt: string;
}

interface ProgramDetails {
  program: LoanProgram;
  documents: Array<{ id: number; documentName: string; isRequired: boolean; [key: string]: any }>;
  tasks: Array<{ id: number; taskName: string; [key: string]: any }>;
  workflowSteps: Array<{ id: number; stepOrder: number; estimatedDays?: number; definition?: { name: string; key: string } }>;
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function parseTermOptions(termOptions: string | null | undefined): string[] {
  if (!termOptions) return [];
  return termOptions.split(",").map((t) => t.trim()).filter(Boolean);
}

function ExpandedProgramDetails({
  program,
  details,
  onEdit,
  onDuplicate,
  isDuplicating,
}: {
  program: LoanProgram;
  details?: ProgramDetails;
  onEdit: () => void;
  onDuplicate: () => void;
  isDuplicating: boolean;
}) {
  const docs = details?.documents || [];
  const tasks = details?.tasks || [];
  const steps = details?.workflowSteps || [];
  const requiredDocs = docs.filter((d) => d.isRequired).length;
  const optionalDocs = docs.length - requiredDocs;
  const termOptions = parseTermOptions(program.termOptions);
  const baseRate = program.minInterestRate ?? program.baseRate;
  const dealCount = (details as any)?.dealCount ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-8">
        <div>
          <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-key-metrics-${program.id}`}>Key Metrics</h4>
          <div className="divide-y divide-border/50 text-[16px]">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger className="border-b border-dashed border-muted-foreground/40 cursor-help">Base Rate</TooltipTrigger>
                  <TooltipContent>Starting interest rate for this program</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-medium">{baseRate ? `${baseRate}%` : "—"}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger className="border-b border-dashed border-muted-foreground/40 cursor-help">YSP</TooltipTrigger>
                  <TooltipContent>Yield Spread Premium range</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-medium">
                {program.yspMin != null && program.yspMax != null
                  ? `${program.yspMin.toFixed(2)}% – ${program.yspMax.toFixed(2)}%`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger className="border-b border-dashed border-muted-foreground/40 cursor-help">Points</TooltipTrigger>
                  <TooltipContent>Origination points range</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-medium">
                {program.basePointsMin != null && program.basePointsMax != null
                  ? `${program.basePointsMin.toFixed(2)} – ${program.basePointsMax.toFixed(2)}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Min Loan</span>
              <span className="font-medium">{program.minLoanAmount ? `$${program.minLoanAmount.toLocaleString()}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Max Loan</span>
              <span className="font-medium">{program.maxLoanAmount ? `$${program.maxLoanAmount.toLocaleString()}` : "—"}</span>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-workflow-${program.id}`}>Workflow</h4>
          <div className="divide-y divide-border/50 text-[16px]">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Stages</span>
              <span className="font-medium">{steps.length || "—"}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Documents</span>
              <span className="font-medium">
                {docs.length > 0
                  ? `${requiredDocs} required${optionalDocs > 0 ? `, ${optionalDocs} optional` : ""}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">Tasks</span>
              <span className="font-medium">{tasks.length > 0 ? `${tasks.length} tasks` : "—"}</span>
            </div>
            {program.creditPolicyId && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-muted-foreground">Credit Policy</span>
                <span className="font-medium text-blue-600">{program.name} ↗</span>
              </div>
            )}
          </div>
        </div>

        <div>
          {termOptions.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-term-options-${program.id}`}>Term Options</h4>
              <div className="flex flex-wrap gap-1.5">
                {termOptions.map((term) => (
                  <Badge key={term} variant="secondary" className="text-[13px] px-2.5 py-0.5">{term}</Badge>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-loan-purpose-${program.id}`}>Loan Purpose</h4>
            <div className="flex flex-wrap gap-1.5">
              {["Purchase", "Rate/Term Refi", "Cash-Out Refi"].map((purpose) => (
                <Badge key={purpose} variant="secondary" className="text-[13px] px-2.5 py-0.5">{purpose}</Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          className="text-[14px] px-4 py-2 h-auto"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          data-testid={`button-expanded-edit-${program.id}`}
        >
          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit Program
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-[14px] px-4 py-2 h-auto"
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          disabled={isDuplicating}
          data-testid={`button-duplicate-${program.id}`}
        >
          <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
        </Button>
      </div>
    </div>
  );
}

export default function ProgramsV2() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<LoanProgram | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [editWizardProgram, setEditWizardProgram] = useState<{ id: number } | null>(null);

  const { data: programs = [], isLoading } = useQuery<LoanProgram[]>({
    queryKey: ["/api/admin/programs"],
  });

  const { data: expandedDetails } = useQuery<ProgramDetails>({
    queryKey: ["/api/admin/programs", expandedId],
    enabled: !!expandedId,
  });

  const { data: programDetails } = useQuery<ProgramDetails>({
    queryKey: ["/api/admin/programs", selectedProgram?.id],
    enabled: !!selectedProgram?.id,
  });

  const duplicateMutation = useMutation({
    mutationFn: (programId: number) => apiRequest("POST", `/api/admin/programs/${programId}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program duplicated", description: "A copy of the program has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to duplicate program.", variant: "destructive" });
    },
  });

  // Metrics
  const metrics = useMemo(() => {
    const total = programs.length;
    const active = programs.filter((p) => p.isActive).length;
    const docCount = programs.reduce((sum, p) => sum + (p.documentCount || 0), 0);
    const taskCount = programs.reduce((sum, p) => sum + (p.taskCount || 0), 0);
    return { total, active, docCount, taskCount };
  }, [programs]);

  const availablePropertyTypes = useMemo(() => {
    const types = new Set<string>();
    programs.forEach((p) => (p.propertyTypes || p.eligiblePropertyTypes || []).forEach((t) => types.add(t)));
    return Array.from(types).sort();
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
    if (activeFilter === "has_documents") result = result.filter((p) => (p.documentCount || 0) > 0);
    if (activeFilter === "has_tasks") result = result.filter((p) => (p.taskCount || 0) > 0);

    if (propertyTypeFilter !== "all") {
      result = result.filter((p) => (p.propertyTypes || p.eligiblePropertyTypes || []).includes(propertyTypeFilter));
    }

    return result;
  }, [programs, searchQuery, activeFilter, propertyTypeFilter]);

  const toggleMutation = useMutation({
    mutationFn: async (programId: number) => {
      await apiRequest("PATCH", `/api/admin/programs/${programId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program status updated" });
    },
    onError: () => {
      toast({ title: "Failed to toggle program status", variant: "destructive" });
    },
  });


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
          <h1 className="text-[30px] font-display font-bold">Loan Programs</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">
            Configure and manage your lending products.
          </p>
        </div>
        <Button className="text-[18px] px-5 py-2.5 h-auto" onClick={() => setShowWizard(true)} data-testid="button-new-program">
          <Plus className="h-5 w-5 mr-1.5" /> New Program
        </Button>
      </div>

      <Tabs defaultValue="programs" className="w-full">
        <TabsList data-testid="tabs-programs-page">
          <TabsTrigger value="programs" data-testid="tab-programs">
            <Layers className="h-4 w-4 mr-1.5" />
            Programs
          </TabsTrigger>
          <TabsTrigger value="credit-policies" data-testid="tab-credit-policies">
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            Credit Policies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="space-y-5 mt-4">

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
          isActive={activeFilter === "has_documents"}
          onClick={() => setActiveFilter(activeFilter === "has_documents" ? "all" : "has_documents")}
        />
        <SummaryCard
          icon={ListTodo}
          label="Tasks"
          value={metrics.taskCount}
          subtitle="Workflow tasks"
          isActive={activeFilter === "has_tasks"}
          onClick={() => setActiveFilter(activeFilter === "has_tasks" ? "all" : "has_tasks")}
        />
      </SummaryStrip>

      {/* Table Card */}
      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        {/* Search & Filters */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-[16px]"
              data-testid="input-search-programs"
            />
          </div>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-[180px] h-10 text-[16px]" data-testid="select-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Draft / Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={propertyTypeFilter} onValueChange={setPropertyTypeFilter}>
            <SelectTrigger className="w-[200px] h-10 text-[16px]" data-testid="select-property-type-filter">
              <SelectValue placeholder="All Property Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Property Types</SelectItem>
              {availablePropertyTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Program
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger className="border-b border-dashed border-muted-foreground/40 cursor-help">LTV Range</TooltipTrigger>
                    <TooltipContent>Loan-to-Value ratio range</TooltipContent>
                  </Tooltip>
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger className="border-b border-dashed border-muted-foreground/40 cursor-help">Min DSCR</TooltipTrigger>
                    <TooltipContent>Minimum Debt Service Coverage Ratio</TooltipContent>
                  </Tooltip>
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Property Types
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-center px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active
                </th>
                <th className="text-center px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Edit
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map((program) => {
                const propTypes = program.propertyTypes || program.eligiblePropertyTypes || [];
                const visibleTypes = propTypes.slice(0, 3);
                const overflowCount = propTypes.length - 3;
                return (
                <ExpandableRow
                  key={program.id}
                  columns={7}
                  isExpanded={expandedId === program.id}
                  onToggle={(expanded) => setExpandedId(expanded ? program.id : null)}
                  summary={
                    <>
                      <td className="px-3 py-3">
                        <div className="text-[16px] font-semibold" data-testid={`text-program-name-${program.id}`}>{program.name}</div>
                        {program.description && (
                          <div className="text-[13px] text-muted-foreground truncate max-w-[250px]">
                            {program.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[16px]">
                        {program.minLtv || program.maxLtv
                          ? `${program.minLtv || 0}% – ${program.maxLtv || 100}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-[16px]">
                        {program.minDscr ? `${program.minDscr}x` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {visibleTypes.length > 0 ? (
                            <>
                              {visibleTypes.map((t: string) => (
                                <Badge key={t} variant="secondary" className="text-[11px]" data-testid={`badge-property-type-${program.id}-${t}`}>{t}</Badge>
                              ))}
                              {overflowCount > 0 && (
                                <Badge variant="outline" className="text-[11px]" data-testid={`badge-property-overflow-${program.id}`}>+{overflowCount}</Badge>
                              )}
                            </>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          variant={program.isActive ? "active" : "inactive"}
                          label={program.isActive ? "Active" : "Draft"}
                        />
                      </td>
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={program.isActive}
                          onCheckedChange={() => toggleMutation.mutate(program.id)}
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-active-${program.id}`}
                        />
                      </td>
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[13px] text-blue-600 hover:text-blue-700"
                          onClick={() => setEditWizardProgram({ id: program.id })}
                          data-testid={`button-edit-program-${program.id}`}
                        >
                          Edit
                        </Button>
                      </td>
                    </>
                  }
                  details={
                    <ExpandedProgramDetails
                      program={program}
                      details={expandedId === program.id ? expandedDetails : undefined}
                      onEdit={() => setEditWizardProgram({ id: program.id })}
                      onDuplicate={() => duplicateMutation.mutate(program.id)}
                      isDuplicating={duplicateMutation.isPending}
                    />
                  }
                />
                );
              })}
            </tbody>
          </table>
        )}

        {/* Footer */}
        {filteredPrograms.length > 0 && (
          <div className="px-4 py-3 border-t text-[14px] text-muted-foreground">
            Showing {filteredPrograms.length} of {programs.length} programs
          </div>
        )}
      </div>

        </TabsContent>

        <TabsContent value="credit-policies" className="mt-4">
          <CreditPoliciesTab />
        </TabsContent>
      </Tabs>

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

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DollarSign, FolderOpen, Clock, CheckCircle2, Search, ChevronRight, Plus,
  Building2, User, FileText, ExternalLink, Copy, MoreHorizontal, Mail,
  List, LayoutGrid, ChevronDown, ArrowUpDown, Filter,
  CalendarIcon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SummaryCard, SummaryStrip } from "@/components/ui/phase1/summary-card";
import { StatusBadge } from "@/components/ui/phase1/status-badge";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { ExpandableRow } from "@/components/ui/phase1/expandable-row";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { ComposeEmailModal } from "@/components/ComposeEmailModal";
import DealsKanbanView from "@/components/admin/DealsKanbanView";
import { format } from "date-fns";

interface Deal {
  id: number;
  dealNumber?: string;
  loanNumber?: string;
  borrowerName?: string;
  borrowerEmail?: string;
  borrowerPhone?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyType?: string;
  loanAmount?: number;
  programName?: string;
  loanType?: string;
  status?: string;
  stage?: string;
  currentStage?: string;
  ltv?: number;
  dscr?: number;
  interestRate?: number;
  loanTermMonths?: number;
  documents?: any[];
  tasks?: any[];
  createdAt?: string;
  updatedAt?: string;
  targetCloseDate?: string;
  completionPercentage?: number;
  progressPercentage?: number;
  completedDocuments?: number;
  totalDocuments?: number;
  completedTasks?: number;
  totalTasks?: number;
  userName?: string;
  asIsValue?: number;
  appraisalStatus?: string;
  googleDriveFolderUrl?: string;
  driveSyncStatus?: string;
  metadata?: any;
}

const AVATAR_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-600" },
  { bg: "bg-emerald-100", text: "text-emerald-600" },
  { bg: "bg-red-100", text: "text-red-500" },
  { bg: "bg-amber-100", text: "text-amber-600" },
  { bg: "bg-purple-100", text: "text-purple-600" },
  { bg: "bg-teal-100", text: "text-teal-600" },
];

function getAvatarColor(name?: string) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function cleanAddress(address?: string): string {
  if (!address) return "—";
  return address.replace(/,?\s*United States of America$/i, "").trim();
}

function formatCurrency(amount: number | undefined): string {
  if (!amount) return "$0";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatCurrencyFull(amount: number | undefined): string {
  if (!amount) return "—";
  return `$${Math.round(amount).toLocaleString()}`;
}

function getDaysInStage(createdAt?: string): string {
  if (!createdAt) return "—";
  const created = new Date(createdAt);
  const now = new Date();
  const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return `${days} days`;
}

function extractState(address?: string): string {
  if (!address) return "—";
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (match) return match[1];
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    const stateZip = parts[parts.length - 2] || parts[parts.length - 1];
    const stateMatch = stateZip.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
    if (stateMatch) return stateMatch[1];
  }
  return "—";
}

function getPropertyTypeLabel(type?: string): string {
  if (!type) return "—";
  const labels: Record<string, string> = {
    "single-family-residence": "Single Family",
    "single-family": "Single Family",
    "multi-family": "Multi-Family",
    "2-4-unit": "2-4 Unit",
    "multifamily-5-plus": "5+ Units",
    "condo": "Condo",
    "townhouse": "Townhouse",
    "mixed-use": "Mixed-Use",
    "commercial": "Commercial",
  };
  return labels[type.toLowerCase()] || type;
}

function formatTerm(months?: number): string {
  if (!months) return "—";
  if (months >= 12 && months % 12 === 0) return `${months / 12} years`;
  return `${months} months`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function getLoanPurpose(deal: Deal): string {
  const purpose = deal.loanType;
  if (!purpose) return "—";
  return purpose.charAt(0).toUpperCase() + purpose.slice(1).replace(/[-_]/g, " ");
}

function getStatusVariant(status?: string): "active" | "pending" | "closed" | "inactive" {
  switch (status?.toLowerCase()) {
    case "active":
    case "in_progress":
      return "active";
    case "pending":
    case "submitted":
    case "review":
      return "pending";
    case "closed":
    case "funded":
    case "completed":
      return "closed";
    default:
      return "inactive";
  }
}

function InlineDollarField({ label, value, onSave, testId }: {
  label: string;
  value?: number;
  onSave: (v: number) => void;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState("");

  const startEdit = () => {
    setLocalVal(value ? String(Math.round(value)) : "");
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(localVal.replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed) && parsed !== value) {
      onSave(parsed);
    }
  };

  const displayVal = value ? `$${Math.round(value).toLocaleString()}` : "—";

  return (
    <div className="flex items-center justify-between text-[15px]">
      <span className="text-muted-foreground">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">$</span>
          <Input
            data-testid={testId}
            className="h-7 w-[130px] text-right text-[14px]"
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
        </div>
      ) : (
        <span
          className="font-medium cursor-pointer hover:text-primary transition-colors border-b border-dashed border-transparent hover:border-muted-foreground/40"
          onClick={startEdit}
          data-testid={testId}
        >
          {displayVal}
        </span>
      )}
    </div>
  );
}

function InlinePercentField({ label, value, decimals, onSave, testId }: {
  label: string;
  value?: number;
  decimals: number;
  onSave: (v: number) => void;
  testId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState("");

  const startEdit = () => {
    setLocalVal(value != null ? value.toFixed(decimals) : "");
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(localVal);
    if (!isNaN(parsed) && parsed !== value) {
      onSave(parseFloat(parsed.toFixed(decimals)));
    }
  };

  const displayVal = value != null ? `${value.toFixed(decimals)}%` : "—";

  return (
    <div className="flex items-center justify-between text-[15px]">
      <span className="text-muted-foreground">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            data-testid={testId}
            className="h-7 w-[90px] text-right text-[14px]"
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
          <span className="text-muted-foreground">%</span>
        </div>
      ) : (
        <span
          className="font-medium cursor-pointer hover:text-primary transition-colors border-b border-dashed border-transparent hover:border-muted-foreground/40"
          onClick={startEdit}
          data-testid={testId}
        >
          {displayVal}
        </span>
      )}
    </div>
  );
}

function InlineSelectField({ label, value, options, onSave, testId }: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSave: (v: string) => void;
  testId: string;
}) {
  const currentLabel = options.find((o) => o.value === value)?.label || value || "—";

  return (
    <div className="flex items-center justify-between text-[15px]">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onSave(v)}>
        <SelectTrigger
          className="h-7 w-auto min-w-[120px] max-w-[180px] text-right text-[14px] border-dashed border-muted-foreground/30 bg-transparent font-medium"
          data-testid={testId}
        >
          <SelectValue placeholder="—">{currentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} data-testid={`${testId}-option-${opt.value}`}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InlineDateField({ label, value, onSave, testId }: {
  label: string;
  value?: string;
  onSave: (v: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;
  const displayVal = date && !isNaN(date.getTime())
    ? format(date, "MMM d, yyyy")
    : "—";

  return (
    <div className="flex items-center justify-between text-[15px]">
      <span className="text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="font-medium text-[14px] cursor-pointer hover:text-primary transition-colors border-b border-dashed border-transparent hover:border-muted-foreground/40 flex items-center gap-1.5"
            data-testid={testId}
          >
            {displayVal}
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                onSave(d.toISOString());
                setOpen(false);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function DealsV2() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [closeDateFilter, setCloseDateFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [brokerFilter, setBrokerFilter] = useState<string>("all");
  const [daysInStageFilter, setDaysInStageFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [composeEmailDealId, setComposeEmailDealId] = useState<number | null>(null);
  const { toast } = useToast();

  const updateDealMutation = useMutation({
    mutationFn: async ({ dealId, updates }: { dealId: number; updates: Record<string, unknown> }) => {
      await apiRequest("PUT", `/api/projects/${dealId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const handleFieldUpdate = useCallback((dealId: number, field: string, value: unknown) => {
    updateDealMutation.mutate({ dealId, updates: { [field]: value } });
  }, [updateDealMutation]);

  const { data: dealsData, isLoading } = useQuery<{ projects: Deal[] }>({
    queryKey: ["/api/deals"],
    queryFn: async () => {
      const res = await fetch("/api/deals", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deals");
      return res.json();
    },
    refetchInterval: 15000,
  });
  const deals = dealsData?.projects ?? [];

  const uniquePrograms = useMemo(() => {
    const programs = new Set<string>();
    deals.forEach((d) => { if (d.programName) programs.add(d.programName); });
    return Array.from(programs).sort();
  }, [deals]);

  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    deals.forEach((d) => {
      const st = d.propertyState || extractState(d.propertyAddress);
      if (st && st !== "—") states.add(st);
    });
    return Array.from(states).sort();
  }, [deals]);

  const uniqueAssignees = useMemo(() => {
    const names = new Set<string>();
    deals.forEach((d) => { if (d.userName) names.add(d.userName); });
    return Array.from(names).sort();
  }, [deals]);

  const uniqueStages = useMemo(() => {
    const stages = new Set<string>();
    deals.forEach((d) => { if (d.currentStage) stages.add(d.currentStage); });
    return Array.from(stages).sort();
  }, [deals]);

  // Compute summary metrics
  const metrics = useMemo(() => {
    const total = deals.length;
    const active = deals.filter((d) => ["active", "in_progress"].includes(d.status?.toLowerCase() || "")).length;
    const pending = deals.filter((d) => ["pending", "submitted", "review"].includes(d.status?.toLowerCase() || "")).length;
    const closed = deals.filter((d) => ["closed", "funded", "completed"].includes(d.status?.toLowerCase() || "")).length;
    const totalValue = deals.reduce((sum, d) => sum + (d.loanAmount || 0), 0);
    return { total, active, pending, closed, totalValue };
  }, [deals]);

  // Filter deals
  const filteredDeals = useMemo(() => {
    let result = [...deals];

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.borrowerName?.toLowerCase().includes(q) ||
          d.dealNumber?.toLowerCase().includes(q) ||
          d.propertyAddress?.toLowerCase().includes(q) ||
          d.programName?.toLowerCase().includes(q)
      );
    }

    // Summary card filter
    if (activeFilter === "active") result = result.filter((d) => ["active", "in_progress"].includes(d.status?.toLowerCase() || ""));
    if (activeFilter === "pending") result = result.filter((d) => ["pending", "submitted", "review"].includes(d.status?.toLowerCase() || ""));
    if (activeFilter === "closed") result = result.filter((d) => ["closed", "funded", "completed"].includes(d.status?.toLowerCase() || ""));

    // Loan type filter
    if (typeFilter !== "all") result = result.filter((d) => d.loanType?.toLowerCase() === typeFilter.toLowerCase());

    // Status filter
    if (statusFilter !== "all") result = result.filter((d) => d.status?.toLowerCase() === statusFilter.toLowerCase());

    // Program filter
    if (programFilter !== "all") result = result.filter((d) => d.programName === programFilter);

    // Assigned filter
    if (assignedFilter !== "all") result = result.filter((d) => d.userName === assignedFilter);

    // Amount range
    if (amountMin) {
      const min = parseFloat(amountMin);
      if (!isNaN(min)) result = result.filter((d) => (d.loanAmount || 0) >= min);
    }
    if (amountMax) {
      const max = parseFloat(amountMax);
      if (!isNaN(max)) result = result.filter((d) => (d.loanAmount || 0) <= max);
    }

    // Close date filter
    if (closeDateFilter !== "all") {
      const now = new Date();
      if (closeDateFilter === "overdue") result = result.filter((d) => d.targetCloseDate && new Date(d.targetCloseDate) < now);
      if (closeDateFilter === "this-week") {
        const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
        result = result.filter((d) => d.targetCloseDate && new Date(d.targetCloseDate) >= now && new Date(d.targetCloseDate) <= weekEnd);
      }
      if (closeDateFilter === "this-month") {
        const monthEnd = new Date(now); monthEnd.setDate(now.getDate() + 30);
        result = result.filter((d) => d.targetCloseDate && new Date(d.targetCloseDate) >= now && new Date(d.targetCloseDate) <= monthEnd);
      }
      if (closeDateFilter === "next-90") {
        const end = new Date(now); end.setDate(now.getDate() + 90);
        result = result.filter((d) => d.targetCloseDate && new Date(d.targetCloseDate) >= now && new Date(d.targetCloseDate) <= end);
      }
    }

    // Stage filter
    if (stageFilter !== "all") result = result.filter((d) => d.currentStage === stageFilter);

    // Property state filter
    if (stateFilter !== "all") {
      result = result.filter((d) => {
        const st = d.propertyState || extractState(d.propertyAddress);
        return st === stateFilter;
      });
    }

    // Days in stage filter
    if (daysInStageFilter !== "all") {
      const now = new Date();
      result = result.filter((d) => {
        if (!d.createdAt) return false;
        const days = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysInStageFilter === "0-7") return days <= 7;
        if (daysInStageFilter === "8-30") return days > 7 && days <= 30;
        if (daysInStageFilter === "31-60") return days > 30 && days <= 60;
        if (daysInStageFilter === "60+") return days > 60;
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [deals, searchQuery, activeFilter, typeFilter, statusFilter, sortOrder, programFilter, assignedFilter, amountMin, amountMax, closeDateFilter, stateFilter, brokerFilter, daysInStageFilter, stageFilter]);

  const isAdmin = user?.role && ["admin", "staff", "super_admin"].includes(user.role);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-display font-bold">Pipeline</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">
            Track and manage your loan deals.
          </p>
        </div>
        {isAdmin && (
          <Link href="/deals/new">
            <Button size="default" className="text-[18px] px-5 py-2.5 h-auto">
              <Plus className="h-5 w-5 mr-1.5" /> Add Deal
            </Button>
          </Link>
        )}
      </div>

      {/* Summary Strip — Level 1 */}
      <SummaryStrip>
        <SummaryCard
          icon={FolderOpen}
          label="Total Deals"
          value={metrics.total}
          subtitle={formatCurrency(metrics.totalValue) + " pipeline value"}
          isActive={activeFilter === "all"}
          onClick={() => setActiveFilter("all")}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Active"
          value={metrics.active}
          subtitle="In progress"
          isActive={activeFilter === "active"}
          onClick={() => setActiveFilter("active")}
        />
        <SummaryCard
          icon={Clock}
          label="Pending Review"
          value={metrics.pending}
          subtitle="Awaiting action"
          isActive={activeFilter === "pending"}
          onClick={() => setActiveFilter("pending")}
        />
        <SummaryCard
          icon={DollarSign}
          label="Closed"
          value={metrics.closed}
          subtitle="Funded deals"
          isActive={activeFilter === "closed"}
          onClick={() => setActiveFilter("closed")}
        />
      </SummaryStrip>

      {/* Search & Toolbar Card */}
      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative max-w-[320px] w-[320px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by borrower, address, or loan #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-[16px]"
                  data-testid="input-search-deals"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 text-[16px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                data-testid="button-more-filters"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${showFilters ? "rotate-90" : ""}`} />
                More Filters
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                className="flex items-center gap-1.5 h-9 px-3 text-[16px] font-medium border rounded-md bg-white hover:bg-gray-50 transition-colors"
                data-testid="button-sort-order"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortOrder === "newest" ? "Newest First" : "Oldest First"}
              </button>

              <div className="flex items-center border rounded-md overflow-hidden" data-testid="view-toggle-group">
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex items-center justify-center h-9 w-9 transition-colors ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  data-testid="button-view-list"
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("board")}
                  className={`flex items-center justify-center h-9 w-9 border-l transition-colors ${viewMode === "board" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  data-testid="button-view-board"
                  title="Board view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-border/50 animate-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[16px] font-semibold">Filter Deals</span>
                <button
                  onClick={() => {
                    setProgramFilter("all"); setTypeFilter("all"); setAssignedFilter("all");
                    setAmountMin(""); setAmountMax(""); setCloseDateFilter("all");
                    setStateFilter("all"); setBrokerFilter("all"); setDaysInStageFilter("all");
                    setStatusFilter("all"); setStageFilter("all");
                  }}
                  className="text-[14px] text-blue-600 hover:text-blue-700 transition-colors"
                  data-testid="button-clear-all-filters"
                >
                  Clear all
                </button>
              </div>
              <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Loan Program</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={programFilter}
                    onChange={(e) => setProgramFilter(e.target.value)}
                    data-testid="select-program-filter"
                  >
                    <option value="all">All Programs</option>
                    {uniquePrograms.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Loan Type</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    data-testid="select-type-filter"
                  >
                    <option value="all">All Types</option>
                    <option value="dscr">DSCR</option>
                    <option value="rtl">RTL Fix & Flip</option>
                    <option value="bridge">Bridge</option>
                    <option value="purchase">Purchase</option>
                    <option value="refinance">Refinance</option>
                    <option value="ground-up">Ground Up</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Assigned To</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={assignedFilter}
                    onChange={(e) => setAssignedFilter(e.target.value)}
                    data-testid="select-assigned-filter"
                  >
                    <option value="all">Anyone</option>
                    {uniqueAssignees.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Amount Range</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={amountMin}
                      onChange={(e) => setAmountMin(e.target.value)}
                      className="h-9 text-[16px] w-1/2"
                      data-testid="input-amount-min"
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={amountMax}
                      onChange={(e) => setAmountMax(e.target.value)}
                      className="h-9 text-[16px] w-1/2"
                      data-testid="input-amount-max"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Close Date</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={closeDateFilter}
                    onChange={(e) => setCloseDateFilter(e.target.value)}
                    data-testid="select-close-date-filter"
                  >
                    <option value="all">Any time</option>
                    <option value="overdue">Overdue</option>
                    <option value="this-week">This week</option>
                    <option value="this-month">This month</option>
                    <option value="next-90">Next 90 days</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Property State</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    data-testid="select-state-filter"
                  >
                    <option value="all">All States</option>
                    {uniqueStates.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Broker / Partner</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={brokerFilter}
                    onChange={(e) => setBrokerFilter(e.target.value)}
                    data-testid="select-broker-filter"
                  >
                    <option value="all">All</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Current Stage</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                    data-testid="select-stage-filter"
                  >
                    <option value="all">All Stages</option>
                    {uniqueStages.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Days in Stage</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground"
                    value={daysInStageFilter}
                    onChange={(e) => setDaysInStageFilter(e.target.value)}
                    data-testid="select-days-in-stage-filter"
                  >
                    <option value="all">Any</option>
                    <option value="0-7">0–7 days</option>
                    <option value="8-30">8–30 days</option>
                    <option value="31-60">31–60 days</option>
                    <option value="60+">60+ days</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewMode === "board" ? (
        <DealsKanbanView />
      ) : (
        <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
          {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredDeals.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No deals found"
            description={searchQuery ? "Try adjusting your search or filters." : "Create your first deal to get started."}
            actionLabel={isAdmin ? "+ Add Deal" : undefined}
            onAction={isAdmin ? () => (window.location.href = "/deals/new") : undefined}
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2">
                <th className="w-8" />
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Loan #
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Guarantor
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Property
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Program
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Close
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Progress
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => (
                <ExpandableRow
                  key={deal.id}
                  columns={8}
                  isExpanded={expandedId === deal.id}
                  onToggle={(expanded) => setExpandedId(expanded ? deal.id : null)}
                  summary={
                    <>
                      <td className="px-3 py-3 text-[16px] font-medium text-blue-600">
                        {deal.dealNumber || deal.loanNumber || `#${deal.id}`}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-8 w-8 rounded-md flex items-center justify-center text-[13px] font-semibold shrink-0 ${getAvatarColor(deal.borrowerName).bg} ${getAvatarColor(deal.borrowerName).text}`} data-testid={`avatar-borrower-${deal.id}`}>
                            {(deal.borrowerName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-[16px] font-medium">{deal.borrowerName || "—"}</div>
                            <div className="text-[13px] text-muted-foreground">{deal.borrowerEmail || ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[16px]">{cleanAddress(deal.propertyAddress)}</div>
                        <div className="text-[13px] text-muted-foreground">
                          {[deal.propertyCity, deal.propertyState].filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="text-[13px] font-medium">
                          {deal.programName || deal.loanType || "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-[16px] font-semibold">
                        {formatCurrencyFull(deal.loanAmount)}
                      </td>
                      <td className="px-3 py-3 text-[14px] text-muted-foreground">
                        {formatDate(deal.targetCloseDate)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge variant={getStatusVariant(deal.status)} label={deal.status || "Unknown"} />
                      </td>
                      <td className="px-3 py-3 w-[120px]">
                        <div className="flex items-center gap-2">
                          <Progress value={deal.completionPercentage || 0} className="h-1.5 flex-1" />
                          <span className="text-[13px] text-muted-foreground w-8 text-right">
                            {deal.completionPercentage || 0}%
                          </span>
                        </div>
                      </td>
                    </>
                  }
                  details={
                    <div>
                      <div className="grid grid-cols-3 gap-8">
                        <div>
                          <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-loan-details-${deal.id}`}>Loan Details</h4>
                          <div className="space-y-3">
                            <InlineDollarField
                              label="Loan Amount"
                              value={deal.loanAmount}
                              onSave={(v) => handleFieldUpdate(deal.id, "loanAmount", v)}
                              testId={`input-loan-amount-${deal.id}`}
                            />
                            <InlinePercentField
                              label="LTV"
                              value={deal.ltv}
                              decimals={0}
                              onSave={(v) => handleFieldUpdate(deal.id, "ltv", v)}
                              testId={`input-ltv-${deal.id}`}
                            />
                            <InlinePercentField
                              label="Interest Rate"
                              value={deal.interestRate}
                              decimals={3}
                              onSave={(v) => handleFieldUpdate(deal.id, "interestRate", v)}
                              testId={`input-interest-rate-${deal.id}`}
                            />
                            <InlineSelectField
                              label="Term"
                              value={deal.loanTermMonths != null ? String(deal.loanTermMonths) : ""}
                              options={
                                deal.loanType?.toLowerCase() === "rtl" || deal.loanType?.toLowerCase() === "fix-and-flip" || deal.loanType?.toLowerCase() === "bridge"
                                  ? [
                                      { label: "12 month", value: "12" },
                                      { label: "15 month", value: "15" },
                                      { label: "18 month", value: "18" },
                                      { label: "24 month", value: "24" },
                                    ]
                                  : [
                                      { label: "5 Year IO", value: "60" },
                                      { label: "7 Year IO", value: "84" },
                                      { label: "10 Year IO", value: "120" },
                                    ]
                              }
                              onSave={(v) => handleFieldUpdate(deal.id, "loanTermMonths", parseInt(v))}
                              testId={`select-term-${deal.id}`}
                            />
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-property-${deal.id}`}>Property</h4>
                          <div className="space-y-3">
                            <InlineSelectField
                              label="Type"
                              value={deal.propertyType || ""}
                              options={[
                                { label: "Single Family Residence", value: "single-family-residence" },
                                { label: "Duplex", value: "duplex" },
                                { label: "Triplex", value: "triplex" },
                                { label: "Quadplex", value: "quadplex" },
                                { label: "5+ Unit Multifamily", value: "multifamily-5-plus" },
                              ]}
                              onSave={(v) => handleFieldUpdate(deal.id, "propertyType", v)}
                              testId={`select-property-type-${deal.id}`}
                            />
                            <InlineDollarField
                              label="As-Is Value"
                              value={deal.asIsValue}
                              onSave={(v) => handleFieldUpdate(deal.id, "asIsValue", v)}
                              testId={`input-as-is-value-${deal.id}`}
                            />
                            <div className="flex items-center justify-between text-[15px]">
                              <span className="text-muted-foreground">State</span>
                              <span className="font-medium" data-testid={`text-state-${deal.id}`}>{deal.propertyState || extractState(deal.propertyAddress)}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-timeline-${deal.id}`}>Timeline</h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-[15px]">
                              <span className="text-muted-foreground">Created</span>
                              <span className="font-medium" data-testid={`text-created-${deal.id}`}>{formatDate(deal.createdAt)}</span>
                            </div>
                            <InlineDateField
                              label="Target Close"
                              value={deal.targetCloseDate}
                              onSave={(v) => handleFieldUpdate(deal.id, "targetCloseDate", v)}
                              testId={`date-target-close-${deal.id}`}
                            />
                            <InlineSelectField
                              label="Appraisal Status"
                              value={deal.appraisalStatus || ""}
                              options={[
                                { label: "Not Ordered", value: "not_ordered" },
                                { label: "Ordered", value: "ordered" },
                                { label: "Received", value: "received" },
                              ]}
                              onSave={(v) => handleFieldUpdate(deal.id, "appraisalStatus", v)}
                              testId={`select-appraisal-${deal.id}`}
                            />
                            <div className="flex items-center justify-between text-[15px]">
                              <span className="text-muted-foreground">Time in Stage</span>
                              <span className="font-medium" data-testid={`text-days-in-stage-${deal.id}`}>{getDaysInStage(deal.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-border/50 flex items-center gap-3">
                        <Link href={isAdmin ? `/admin/deals/${deal.id}` : `/deals/${deal.id}`}>
                          <Button size="default" className="text-[18px] shadow-md" data-testid={`button-open-deal-${deal.id}`}>
                            Open Deal <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                        {deal.googleDriveFolderUrl ? (
                          <a href={deal.googleDriveFolderUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="default" className="text-[18px] [--button-outline:rgba(156,163,175,0.30)] border-[0.5px]" data-testid={`button-drive-${deal.id}`}>
                              <FolderOpen className="h-4 w-4 mr-1.5" /> Google Drive
                            </Button>
                          </a>
                        ) : (
                          <Button variant="outline" size="default" className="text-[18px] [--button-outline:rgba(156,163,175,0.30)] border-[0.5px]" disabled data-testid={`button-drive-${deal.id}`}>
                            <FolderOpen className="h-4 w-4 mr-1.5" /> Google Drive
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="default"
                          className="text-[18px] [--button-outline:rgba(156,163,175,0.30)] border-[0.5px]"
                          disabled={!deal.borrowerEmail}
                          onClick={(e) => {
                            e.stopPropagation();
                            setComposeEmailDealId(deal.id);
                          }}
                          data-testid={`button-email-borrower-${deal.id}`}
                        >
                          <Mail className="h-4 w-4 mr-1.5" /> Email Borrower
                        </Button>
                        <ComposeEmailModal
                          open={composeEmailDealId === deal.id}
                          onClose={() => setComposeEmailDealId(null)}
                          defaultTo={deal.borrowerEmail || ""}
                          defaultSubject={`Regarding your loan - ${deal.loanNumber || deal.dealNumber || `Deal #${deal.id}`}`}
                          dealId={deal.id}
                        />
                        <Link href={isAdmin ? `/admin/deals/${deal.id}` : `/deals/${deal.id}`}>
                          <Button variant="outline" size="default" className="text-[18px] [--button-outline:rgba(156,163,175,0.30)] border-[0.5px]" data-testid={`button-documents-${deal.id}`}>
                            <FileText className="h-4 w-4 mr-1.5" /> Documents ({deal.documents?.length || 0}/{deal.totalDocuments || 0})
                          </Button>
                        </Link>
                      </div>
                    </div>
                  }
                />
              ))}
            </tbody>
          </table>
        )}

          {/* Footer */}
          {filteredDeals.length > 0 && (
            <div className="px-4 py-3 border-t text-[14px] text-muted-foreground flex items-center justify-between">
              <span>
                Showing {filteredDeals.length} of {deals.length} deals
              </span>
              <span className="text-[13px]">⌘K to search</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

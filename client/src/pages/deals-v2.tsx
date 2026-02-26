import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  DollarSign, FolderOpen, Clock, CheckCircle2, Search, ChevronRight, Plus,
  Building2, User, FileText, ExternalLink, Copy, MoreHorizontal, Mail,
  List, LayoutGrid, SlidersHorizontal, ChevronDown, ArrowUpDown, Filter
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
  googleDriveFolderUrl?: string;
  driveSyncStatus?: string;
  metadata?: any;
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

export default function DealsV2() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewMode, setViewMode] = useState<"list" | "board" | "compact">("list");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [closeDateFilter, setCloseDateFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [brokerFilter, setBrokerFilter] = useState<string>("all");
  const [daysInStageFilter, setDaysInStageFilter] = useState<string>("all");

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
  }, [deals, searchQuery, activeFilter, typeFilter, statusFilter, sortOrder, programFilter, assignedFilter, amountMin, amountMax, closeDateFilter, stateFilter, brokerFilter, daysInStageFilter]);

  const isAdmin = user?.role && ["admin", "staff", "super_admin"].includes(user.role);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold">Pipeline</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">
            Track and manage your loan deals.
          </p>
        </div>
        {isAdmin && (
          <Link href="/deals/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Deal
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
                <button
                  onClick={() => setViewMode("compact")}
                  className={`flex items-center justify-center h-9 w-9 border-l transition-colors ${viewMode === "compact" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  data-testid="button-view-compact"
                  title="Compact view"
                >
                  <SlidersHorizontal className="h-4 w-4" />
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
                    setStatusFilter("all");
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

      {/* Table Card */}
      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        {/* Table */}
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
            actionLabel={isAdmin ? "+ New Deal" : undefined}
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
                  Borrower
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
                  columns={7}
                  isExpanded={expandedId === deal.id}
                  onToggle={(expanded) => setExpandedId(expanded ? deal.id : null)}
                  summary={
                    <>
                      <td className="px-3 py-3 text-[16px] font-medium text-blue-600">
                        {deal.dealNumber || deal.loanNumber || `#${deal.id}`}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[16px] font-medium">{deal.borrowerName || "—"}</div>
                        <div className="text-[13px] text-muted-foreground">{deal.borrowerEmail || ""}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[16px]">{deal.propertyAddress || "—"}</div>
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
                        {formatCurrency(deal.loanAmount)}
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
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Loan Amount</span>
                              <span className="font-semibold">{formatCurrencyFull(deal.loanAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">LTV</span>
                              <span className="font-semibold">{deal.ltv ? `${deal.ltv}%` : "—"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Interest Rate</span>
                              <span className="font-semibold">{deal.interestRate ? `${deal.interestRate}%` : "—"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Term</span>
                              <span className="font-semibold">{formatTerm(deal.loanTermMonths)}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-property-${deal.id}`}>Property</h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Type</span>
                              <span className="font-semibold">{getPropertyTypeLabel(deal.propertyType)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">State</span>
                              <span className="font-semibold">{deal.propertyState || extractState(deal.propertyAddress)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Purpose</span>
                              <span className="font-semibold">{getLoanPurpose(deal)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Address</span>
                              <span className="font-semibold truncate max-w-[180px] text-right" title={deal.propertyAddress || "—"}>
                                {deal.propertyAddress ? deal.propertyAddress.split(",")[0] : "—"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-timeline-${deal.id}`}>Timeline</h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Created</span>
                              <span className="font-semibold">{formatDate(deal.createdAt)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Target Close</span>
                              <span className="font-semibold">{formatDate(deal.targetCloseDate)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Days in Stage</span>
                              <span className="font-semibold">{getDaysInStage(deal.createdAt)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[16px]">
                              <span className="text-muted-foreground">Assigned To</span>
                              <span className="font-semibold">{deal.userName || "—"}</span>
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
                        {deal.borrowerEmail ? (
                          <a href={`mailto:${deal.borrowerEmail}`}>
                            <Button variant="outline" size="default" className="text-[18px] [--button-outline:rgba(156,163,175,0.30)] border-[0.5px]" data-testid={`button-email-borrower-${deal.id}`}>
                              <Mail className="h-4 w-4 mr-1.5" /> Email Borrower
                            </Button>
                          </a>
                        ) : (
                          <Button variant="outline" size="default" className="text-[18px] [--button-outline:rgba(156,163,175,0.30)] border-[0.5px]" disabled data-testid={`button-email-borrower-${deal.id}`}>
                            <Mail className="h-4 w-4 mr-1.5" /> Email Borrower
                          </Button>
                        )}
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
    </div>
  );
}

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  DollarSign, FolderOpen, Clock, CheckCircle2, Search, ChevronRight, Plus,
  Building2, User, FileText, ExternalLink, Copy, MoreHorizontal, Mail
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

    // Type filter
    if (typeFilter !== "all") result = result.filter((d) => d.loanType?.toLowerCase() === typeFilter.toLowerCase());

    // Status filter
    if (statusFilter !== "all") result = result.filter((d) => d.status?.toLowerCase() === statusFilter.toLowerCase());

    return result;
  }, [deals, searchQuery, activeFilter, typeFilter, statusFilter]);

  const isAdmin = user?.role && ["admin", "staff", "super_admin"].includes(user.role);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold">Pipeline</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
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

      {/* Table Card */}
      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        {/* Search & Filters — Level 2 */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <div className="relative flex-1 max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-[13px]"
            />
          </div>
          <select
            className="h-8 px-3 text-[13px] border rounded-md bg-white text-foreground"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Programs</option>
            <option value="dscr">DSCR</option>
            <option value="rtl">RTL</option>
            <option value="bridge">Bridge</option>
          </select>
          <select
            className="h-8 px-3 text-[13px] border rounded-md bg-white text-foreground"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </select>
        </div>

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
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Loan #
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Borrower
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Property
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Program
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                      <td className="px-3 py-3 text-[13px] font-medium text-blue-600">
                        {deal.dealNumber || deal.loanNumber || `#${deal.id}`}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[13px] font-medium">{deal.borrowerName || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{deal.borrowerEmail || ""}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[13px]">{deal.propertyAddress || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[deal.propertyCity, deal.propertyState].filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="text-[11px] font-medium">
                          {deal.programName || deal.loanType || "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold">
                        {formatCurrency(deal.loanAmount)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge variant={getStatusVariant(deal.status)} label={deal.status || "Unknown"} />
                      </td>
                      <td className="px-3 py-3 w-[120px]">
                        <div className="flex items-center gap-2">
                          <Progress value={deal.completionPercentage || 0} className="h-1.5 flex-1" />
                          <span className="text-[11px] text-muted-foreground w-8 text-right">
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
                          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-loan-details-${deal.id}`}>Loan Details</h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Loan Amount</span>
                              <span className="font-semibold">{formatCurrencyFull(deal.loanAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">LTV</span>
                              <span className="font-semibold">{deal.ltv ? `${deal.ltv}%` : "—"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Interest Rate</span>
                              <span className="font-semibold">{deal.interestRate ? `${deal.interestRate}%` : "—"}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Term</span>
                              <span className="font-semibold">{formatTerm(deal.loanTermMonths)}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-property-${deal.id}`}>Property</h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Type</span>
                              <span className="font-semibold">{getPropertyTypeLabel(deal.propertyType)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">State</span>
                              <span className="font-semibold">{deal.propertyState || extractState(deal.propertyAddress)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Purpose</span>
                              <span className="font-semibold">{getLoanPurpose(deal)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Address</span>
                              <span className="font-semibold truncate max-w-[180px] text-right" title={deal.propertyAddress || "—"}>
                                {deal.propertyAddress ? deal.propertyAddress.split(",")[0] : "—"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid={`heading-timeline-${deal.id}`}>Timeline</h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Created</span>
                              <span className="font-semibold">{formatDate(deal.createdAt)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Target Close</span>
                              <span className="font-semibold">{formatDate(deal.targetCloseDate)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Days in Stage</span>
                              <span className="font-semibold">{getDaysInStage(deal.createdAt)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-muted-foreground">Assigned To</span>
                              <span className="font-semibold">{deal.userName || "—"}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-border/50 flex items-center gap-2">
                        <Link href={isAdmin ? `/admin/deals/${deal.id}` : `/deals/${deal.id}`}>
                          <Button size="sm" className="text-[12px]" data-testid={`button-open-deal-${deal.id}`}>
                            Open Deal <ChevronRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </Link>
                        {deal.googleDriveFolderUrl ? (
                          <a href={deal.googleDriveFolderUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="text-[12px]" data-testid={`button-drive-${deal.id}`}>
                              <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Google Drive
                            </Button>
                          </a>
                        ) : (
                          <Button variant="outline" size="sm" className="text-[12px]" disabled data-testid={`button-drive-${deal.id}`}>
                            <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Google Drive
                          </Button>
                        )}
                        {deal.borrowerEmail ? (
                          <a href={`mailto:${deal.borrowerEmail}`}>
                            <Button variant="outline" size="sm" className="text-[12px]" data-testid={`button-email-borrower-${deal.id}`}>
                              <Mail className="h-3.5 w-3.5 mr-1.5" /> Email Borrower
                            </Button>
                          </a>
                        ) : (
                          <Button variant="outline" size="sm" className="text-[12px]" disabled data-testid={`button-email-borrower-${deal.id}`}>
                            <Mail className="h-3.5 w-3.5 mr-1.5" /> Email Borrower
                          </Button>
                        )}
                        <Link href={isAdmin ? `/admin/deals/${deal.id}` : `/deals/${deal.id}`}>
                          <Button variant="outline" size="sm" className="text-[12px]" data-testid={`button-documents-${deal.id}`}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" /> Documents ({deal.documents?.length || 0}/{deal.totalDocuments || 0})
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
          <div className="px-4 py-3 border-t text-[12px] text-muted-foreground flex items-center justify-between">
            <span>
              Showing {filteredDeals.length} of {deals.length} deals
            </span>
            <span className="text-[11px]">⌘K to search</span>
          </div>
        )}
      </div>
    </div>
  );
}

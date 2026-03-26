import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import {
  Search, Building2, Eye, CheckCircle2, Clock, ArrowRight, Landmark,
  ChevronRight, ArrowUpDown, FolderOpen,
} from "lucide-react";
import { SummaryCard, SummaryStrip } from "@/components/ui/phase1/summary-card";
import { StatusBadge } from "@/components/ui/phase1/status-badge";
import { EmptyState } from "@/components/ui/phase1/empty-state";
import { ExpandableRow } from "@/components/ui/phase1/expandable-row";
import { FundManagementContent } from "./fund-management";

type IntakeDeal = {
  id: number;
  dealName: string;
  loanAmount: number;
  assetType: string;
  propertyAddress: string;
  propertyState: string;
  ltvPct: number;
  dscr: number;
  borrowerName: string;
  brokerName: string;
  brokerEmail: string;
  status: string;
  submittedAt: string;
  createdAt: string;
  analysis?: any;
};

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

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function getStatusVariant(status?: string): "active" | "pending" | "closed" | "inactive" | "error" | "info" {
  switch (status?.toLowerCase()) {
    case "approved":
    case "transferred":
      return "active";
    case "submitted":
    case "under_review":
    case "conditional":
      return "pending";
    case "analyzed":
      return "info";
    case "rejected":
    case "no_match":
      return "error";
    default:
      return "inactive";
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Submitted",
    analyzed: "Analyzed",
    under_review: "Under Review",
    approved: "Approved",
    conditional: "Conditional",
    rejected: "Rejected",
    transferred: "Transferred",
    no_match: "No Match",
  };
  return labels[status] || status;
}

const ASSET_TYPES = ["Multifamily", "Office", "Retail", "Industrial", "Hotel", "Land", "Mixed Use"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function CommercialPipelinePage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("");

  const urlParams = new URLSearchParams(window.location.search);
  const initialShowFunds = urlParams.get("tab") === "funds";
  const [showFunds, setShowFunds] = useState(initialShowFunds);

  const handleShowFunds = () => {
    setShowFunds(true);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "funds");
    window.history.replaceState({}, "", url.toString());
  };

  const handleBackToDeals = () => {
    setShowFunds(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.replaceState({}, "", url.toString());
  };

  const { data: deals = [], isLoading } = useQuery<IntakeDeal[]>({
    queryKey: ["/api/commercial/deals"],
    queryFn: async () => {
      const res = await fetch("/api/commercial/deals", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deals");
      return res.json();
    },
    enabled: !showFunds,
  });

  const { data: summary } = useQuery({
    queryKey: ["/api/commercial/portfolio-summary"],
  });

  const { data: fundsList = [] } = useQuery<any[]>({
    queryKey: ["/api/commercial/funds"],
  });

  const intakeStats = (summary as any)?.intake || {};
  const activeFunds = fundsList.filter((f: any) => f.isActive).length;

  const metrics = useMemo(() => {
    const newCount = (intakeStats.submitted || 0) + (intakeStats.analyzed || 0) + (intakeStats.no_match || 0);
    const reviewCount = intakeStats.under_review || 0;
    const approvedCount = (intakeStats.approved || 0) + (intakeStats.conditional || 0) + (intakeStats.transferred || 0);
    const rejectedCount = intakeStats.rejected || 0;
    const total = newCount + reviewCount + approvedCount + rejectedCount;
    const totalValue = deals.reduce((sum, d) => sum + (d.loanAmount || 0), 0);
    return { total, totalValue, newCount, reviewCount, approvedCount, rejectedCount };
  }, [intakeStats, deals]);

  const uniqueBrokers = useMemo(() => {
    const brokers = new Set<string>();
    deals.forEach(d => { if (d.brokerName) brokers.add(d.brokerName); });
    return Array.from(brokers).sort();
  }, [deals]);

  const filteredDeals = useMemo(() => {
    let result = [...deals];

    if (activeFilter === "new") {
      result = result.filter(d => ["submitted", "analyzed", "no_match"].includes(d.status));
    } else if (activeFilter === "review") {
      result = result.filter(d => d.status === "under_review");
    } else if (activeFilter === "approved") {
      result = result.filter(d => ["approved", "conditional", "transferred"].includes(d.status));
    } else if (activeFilter === "rejected") {
      result = result.filter(d => d.status === "rejected");
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.dealName?.toLowerCase().includes(q) ||
        d.borrowerName?.toLowerCase().includes(q) ||
        d.brokerName?.toLowerCase().includes(q) ||
        d.propertyAddress?.toLowerCase().includes(q)
      );
    }

    if (assetTypeFilter !== "all") {
      result = result.filter(d => d.assetType === assetTypeFilter);
    }
    if (stateFilter !== "all") {
      result = result.filter(d => d.propertyState === stateFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter(d => d.status === statusFilter);
    }
    if (amountMin) {
      result = result.filter(d => d.loanAmount >= parseFloat(amountMin));
    }
    if (amountMax) {
      result = result.filter(d => d.loanAmount <= parseFloat(amountMax));
    }
    if (brokerFilter) {
      result = result.filter(d => d.brokerName === brokerFilter);
    }

    result.sort((a, b) => {
      const dateA = new Date(a.submittedAt || a.createdAt).getTime();
      const dateB = new Date(b.submittedAt || b.createdAt).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [deals, searchQuery, activeFilter, sortOrder, assetTypeFilter, stateFilter, statusFilter, amountMin, amountMax, brokerFilter]);

  if (showFunds) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="commercial-pipeline-page">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToDeals} className="text-muted-foreground hover:text-foreground" data-testid="back-to-deals">
            <ArrowRight size={16} className="mr-1 rotate-180" /> Back to Pipeline
          </Button>
        </div>
        <FundManagementContent />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" data-testid="commercial-pipeline-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-display font-bold" data-testid="page-title">Commercial Pipeline</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">Review and manage incoming commercial deal submissions</p>
        </div>
      </div>

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
          icon={Clock}
          label="New"
          value={metrics.newCount}
          subtitle="Submitted & analyzed"
          isActive={activeFilter === "new"}
          onClick={() => setActiveFilter("new")}
        />
        <SummaryCard
          icon={Eye}
          label="Under Review"
          value={metrics.reviewCount}
          subtitle="Awaiting decision"
          isActive={activeFilter === "review"}
          onClick={() => setActiveFilter("review")}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Approved"
          value={metrics.approvedCount}
          subtitle="Approved & transferred"
          isActive={activeFilter === "approved"}
          onClick={() => setActiveFilter("approved")}
        />
      </SummaryStrip>

      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative max-w-[320px] w-[320px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by deal, borrower, or broker..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-[16px]"
                  data-testid="search-deals"
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
                className="flex items-center gap-1.5 h-9 px-3 text-[16px] font-medium border rounded-md bg-card hover:bg-muted/50 transition-colors"
                data-testid="button-sort-order"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortOrder === "newest" ? "Newest First" : "Oldest First"}
              </button>

              <button
                onClick={handleShowFunds}
                className="flex items-center gap-2 h-9 px-3 text-[16px] font-medium border rounded-md bg-card hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                data-testid="funds-card"
              >
                <Landmark className="h-3.5 w-3.5 text-blue-600" />
                <span>{fundsList.length} Funds</span>
                <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[11px] px-1.5 py-0">{activeFunds} active</Badge>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-border/50 animate-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[16px] font-semibold">Filter Deals</span>
                <button
                  onClick={() => {
                    setAssetTypeFilter("all"); setStateFilter("all"); setStatusFilter("all");
                    setAmountMin(""); setAmountMax(""); setBrokerFilter("");
                  }}
                  className="text-[14px] text-blue-600 hover:text-blue-700 transition-colors"
                  data-testid="button-clear-all-filters"
                >
                  Clear all
                </button>
              </div>
              <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Asset Type</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-card text-foreground"
                    value={assetTypeFilter}
                    onChange={(e) => setAssetTypeFilter(e.target.value)}
                    data-testid="select-asset-type-filter"
                  >
                    <option value="all">All Types</option>
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">State</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-card text-foreground"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    data-testid="select-state-filter"
                  >
                    <option value="all">All States</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Status</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-card text-foreground"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    data-testid="select-status-filter"
                  >
                    <option value="all">All Statuses</option>
                    <option value="submitted">Submitted</option>
                    <option value="analyzed">Analyzed</option>
                    <option value="under_review">Under Review</option>
                    <option value="approved">Approved</option>
                    <option value="conditional">Conditional</option>
                    <option value="rejected">Rejected</option>
                    <option value="transferred">Transferred</option>
                    <option value="no_match">No Match</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Loan Amount</label>
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
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Broker</label>
                  <select
                    className="w-full h-9 px-3 text-[16px] border rounded-md bg-card text-foreground"
                    value={brokerFilter}
                    onChange={(e) => setBrokerFilter(e.target.value)}
                    data-testid="select-broker-filter"
                  >
                    <option value="">All Brokers</option>
                    {uniqueBrokers.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredDeals.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No deals found"
            description={searchQuery || activeFilter !== "all" ? "Try adjusting your search or filters." : "Commercial deal submissions will appear here."}
          />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b-2">
                  <th className="w-8" />
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Deal
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Broker
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Property
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Asset Type
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Amount
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    LTV
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((deal) => {
                  const avatarColor = getAvatarColor(deal.brokerName);
                  const initials = (deal.brokerName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

                  return (
                    <ExpandableRow
                      key={deal.id}
                      columns={8}
                      isExpanded={expandedId === deal.id}
                      onToggle={(expanded) => setExpandedId(expanded ? deal.id : null)}
                      summary={
                        <>
                          <td className="px-3 py-3">
                            <div className="text-[16px] font-medium text-blue-600" data-testid={`deal-name-${deal.id}`}>
                              {deal.dealName || `Deal #${deal.id}`}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-8 w-8 rounded-md flex items-center justify-center text-[13px] font-semibold shrink-0 ${avatarColor.bg} ${avatarColor.text}`} data-testid={`avatar-broker-${deal.id}`}>
                                {initials}
                              </div>
                              <div>
                                <div className="text-[16px] font-medium">{deal.brokerName || "—"}</div>
                                <div className="text-[13px] text-muted-foreground">{deal.brokerEmail || ""}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-[16px]">{deal.propertyAddress || "—"}</div>
                            <div className="text-[13px] text-muted-foreground">{deal.propertyState || ""}</div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className="text-[13px] font-medium">
                              {deal.assetType || "—"}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-[16px] font-semibold">
                            {formatCurrencyFull(deal.loanAmount)}
                          </td>
                          <td className="px-3 py-3 text-[14px] text-muted-foreground">
                            {deal.ltvPct != null ? `${deal.ltvPct}%` : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge variant={getStatusVariant(deal.status)} label={getStatusLabel(deal.status)} />
                          </td>
                          <td className="px-3 py-3 text-[14px] text-muted-foreground">
                            {formatDate(deal.submittedAt || deal.createdAt)}
                          </td>
                        </>
                      }
                      details={
                        <div>
                          <div className="grid grid-cols-3 gap-8">
                            <div>
                              <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Loan Details</h4>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">Loan Amount</span>
                                  <span className="font-medium">{formatCurrencyFull(deal.loanAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">LTV</span>
                                  <span className="font-medium">{deal.ltvPct != null ? `${deal.ltvPct}%` : "—"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">DSCR</span>
                                  <span className="font-medium">{deal.dscr != null ? deal.dscr.toFixed(2) : "—"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">Asset Type</span>
                                  <span className="font-medium">{deal.assetType || "—"}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Parties</h4>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">Borrower</span>
                                  <span className="font-medium">{deal.borrowerName || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">Broker</span>
                                  <span className="font-medium">{deal.brokerName || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">Broker Email</span>
                                  <span className="font-medium text-[14px]">{deal.brokerEmail || "—"}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Property & Timeline</h4>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">Address</span>
                                  <span className="font-medium text-right max-w-[200px] truncate">{deal.propertyAddress || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">State</span>
                                  <span className="font-medium">{deal.propertyState || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between text-[15px]">
                                  <span className="text-muted-foreground">Submitted</span>
                                  <span className="font-medium">{formatDate(deal.submittedAt || deal.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {deal.analysis && (
                            <div className="mt-5 pt-4 border-t border-border/50">
                              <h4 className="text-[16px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Analysis</h4>
                              <div className="flex items-center gap-3">
                                {deal.analysis.verdict && (
                                  <StatusBadge
                                    variant={deal.analysis.verdict === "pass" ? "active" : deal.analysis.verdict === "conditional" ? "pending" : "error"}
                                    label={`${deal.analysis.verdict.charAt(0).toUpperCase() + deal.analysis.verdict.slice(1)}${deal.analysis.confidence ? ` (${deal.analysis.confidence}%)` : ""}`}
                                  />
                                )}
                                {deal.analysis.matchedFunds?.length > 0 && (
                                  <span className="text-[14px] text-muted-foreground">
                                    {deal.analysis.matchedFunds.length} fund match{deal.analysis.matchedFunds.length > 1 ? "es" : ""}
                                  </span>
                                )}
                              </div>
                              {deal.analysis.feedback && (
                                <p className="text-[14px] text-muted-foreground mt-2 max-w-2xl">{deal.analysis.feedback}</p>
                              )}
                            </div>
                          )}

                          <div className="mt-5 pt-4 border-t border-border/50 flex items-center gap-3">
                            <Button size="default" className="text-[18px] shadow-md" onClick={(e) => { e.stopPropagation(); navigate(`/admin/commercial-pipeline/${deal.id}`); }} data-testid={`button-open-deal-${deal.id}`}>
                              Open Deal <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      }
                    />
                  );
                })}
              </tbody>
            </table>

            {filteredDeals.length > 0 && (
              <div className="px-4 py-3 border-t text-[14px] text-muted-foreground flex items-center justify-between">
                <span>
                  Showing {filteredDeals.length} of {deals.length} deals
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

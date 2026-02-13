import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  FolderKanban, 
  Plus, 
  Search, 
  ArrowRight,
  Building2,
  Calendar,
  DollarSign,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  FileText,
  TrendingUp,
  Wallet,
  LayoutGrid,
  List,
  MapPin,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Deal {
  id: number;
  dealNumber: string;
  dealName: string;
  status: string;
  currentStage: string;
  progressPercentage: number;
  borrowerName: string;
  borrowerEmail: string;
  loanAmount: number | null;
  propertyAddress: string | null;
  targetCloseDate: string | null;
  applicationDate: string | null;
  createdAt: string;
  completedTasks: number;
  totalTasks: number;
  quoteId?: number | null;
}

interface StageInfo {
  stage: string;
  label: string;
  count: number;
}

function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold">{value}</span>
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineByStage({ stageStats }: { stageStats: StageInfo[] }) {
  const stageColors: Record<string, string> = {
    "active": "bg-success",
    "on_hold": "bg-warning",
    "cancelled": "bg-destructive",
    "completed": "bg-info",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Pipeline by Stage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
          {stageStats.map((stageInfo, index) => (
            <div key={stageInfo.stage} className="flex flex-col items-center flex-1 min-w-[80px]">
              <span className="text-2xl font-bold">{stageInfo.count}</span>
              <span className="text-xs text-muted-foreground text-center whitespace-nowrap">
                {stageInfo.label}
              </span>
              <div className="flex items-center w-full mt-2 gap-1">
                <div
                  className={cn(
                    "h-2 flex-1 rounded-full",
                    stageColors[stageInfo.stage] || "bg-muted"
                  )}
                  style={{ opacity: stageInfo.count > 0 ? 1 : 0.3 }}
                />
                {index < stageStats.length - 1 && (
                  <span className="text-muted-foreground text-xs">→</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrencyShort(amount: number | null) {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatCurrency(amount: number | null) {
  if (!amount) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="secondary" className="bg-success/10 text-success">Completed</Badge>;
    case 'active':
      return <Badge variant="secondary" className="bg-info/10 text-info">Active</Badge>;
    case 'on_hold':
      return <Badge variant="secondary" className="bg-warning/10 text-warning">On Hold</Badge>;
    case 'cancelled':
      return <Badge variant="secondary" className="bg-destructive/10 text-destructive">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    "active": "bg-success/10 text-success",
    "on_hold": "bg-warning/10 text-warning",
    "cancelled": "bg-destructive/10 text-destructive",
    "completed": "bg-info/10 text-info",
  };
  return colors[status] || "bg-muted text-muted-foreground";
}

function formatStage(stage: string | null) {
  if (!stage) return 'Documentation';
  return stage.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data, isLoading } = useQuery<{ projects: Deal[] }>({
    queryKey: ['/api/deals'],
    queryFn: async () => {
      const res = await fetch('/api/deals', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch deals');
      return res.json();
    }
  });

  const projects = data?.projects ?? [];
  
  const filteredProjects = projects.filter(p => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.dealNumber?.toLowerCase().includes(query) ||
      p.dealName?.toLowerCase().includes(query) ||
      p.borrowerName?.toLowerCase().includes(query) ||
      p.propertyAddress?.toLowerCase().includes(query)
    );
  });

  // Calculate stats
  const stats = useMemo(() => {
    const totalLoans = projects.length;
    const totalLoanVolume = projects.reduce((sum, p) => sum + (p.loanAmount || 0), 0);
    
    // Stage stats
    const stageCounts: Record<string, number> = {
      active: 0,
      on_hold: 0,
      cancelled: 0,
      completed: 0,
    };
    projects.forEach(p => {
      if (stageCounts[p.status] !== undefined) {
        stageCounts[p.status]++;
      }
    });

    const stageStats: StageInfo[] = [
      { stage: 'active', label: 'Active', count: stageCounts.active },
      { stage: 'on_hold', label: 'On Hold', count: stageCounts.on_hold },
      { stage: 'cancelled', label: 'Cancelled', count: stageCounts.cancelled },
      { stage: 'completed', label: 'Completed', count: stageCounts.completed },
    ];

    return { totalLoans, totalLoanVolume, stageStats };
  }, [projects]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Loans Dashboard</h1>
          <p className="text-muted-foreground">Overview of all your loans</p>
        </div>
        <Link href="/deals/new">
          <Button data-testid="button-new-deal">
            <Plus className="h-4 w-4 mr-2" />
            New Loan
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Loans"
          value={stats.totalLoans}
          subtitle="All time submissions"
          icon={FileText}
        />
        <StatsCard
          title="Total Loan Volume"
          value={formatCurrencyShort(stats.totalLoanVolume)}
          subtitle="Cumulative loan amount"
          icon={DollarSign}
        />
        <StatsCard
          title="Active Loans"
          value={stats.stageStats.find(s => s.stage === 'active')?.count || 0}
          subtitle="Currently in progress"
          icon={TrendingUp}
        />
        <StatsCard
          title="Completed"
          value={stats.stageStats.find(s => s.stage === 'completed')?.count || 0}
          subtitle="Successfully closed"
          icon={Wallet}
        />
      </div>

      {/* Pipeline by Stage */}
      <PipelineByStage stageStats={stats.stageStats} />

      {/* All Loans Section */}
      <div className="space-y-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">All Loans</h2>
            <p className="text-muted-foreground text-sm">Your submitted loan applications</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Search by borrower, address, or deal..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className={cn("rounded-r-none", viewMode === "grid" && "bg-muted")}
                onClick={() => setViewMode("grid")}
                data-testid="btn-view-grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("rounded-l-none", viewMode === "list" && "bg-muted")}
                onClick={() => setViewMode("list")}
                data-testid="btn-view-list"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-5 bg-muted rounded w-2/3"></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-8 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card className="p-12 text-center">
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <FolderKanban className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">No loans found</h3>
                  <p className="text-muted-foreground mt-1">
                    {searchQuery ? 'Try a different search term' : 'Loans are auto-created when term sheets are signed'}
                  </p>
                </div>
                <Link href="/deals/new">
                  <Button variant="outline" data-testid="button-create-first">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Loan Manually
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Card 
                key={project.id} 
                className="hover-elevate overflow-hidden" 
                data-testid={`card-deal-${project.id}`}
              >
                <Link href={`/deals/${project.id}`}>
                  <div className="p-5">
                    {/* Top row: Deal number, status badge, arrow */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono" data-testid={`text-deal-number-${project.id}`}>
                          DEAL-{project.id}
                        </span>
                        {getStatusBadge(project.status)}
                      </div>
                      <div className="flex items-center gap-1">
                        {project.quoteId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLocation(`/messages?dealId=${project.quoteId}&new=true`);
                            }}
                            title="Message about this loan"
                            data-testid={`button-message-deal-${project.id}`}
                          >
                            <MessageSquare className="h-3 w-3" />
                          </Button>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    
                    {/* Loan title */}
                    <h3 className="text-base font-semibold mb-3 truncate" data-testid={`text-deal-name-${project.id}`}>
                      {project.dealName}
                    </h3>
                    
                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium" data-testid={`text-progress-${project.id}`}>{project.progressPercentage}%</span>
                      </div>
                      <Progress value={project.progressPercentage} className="h-2" />
                    </div>
                    
                    {/* Documentation status */}
                    <div className="flex justify-between text-sm py-2 border-t border-border">
                      <span className="text-muted-foreground">Documentation</span>
                      <span className="font-medium">{project.completedTasks}/{project.totalTasks} tasks</span>
                    </div>
                    
                    {/* Borrower and Amount row */}
                    <div className="flex items-center gap-4 text-sm mt-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span data-testid={`text-borrower-${project.id}`}>{project.borrowerName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span data-testid={`text-amount-${project.id}`}>
                          {formatCurrency(project.loanAmount)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Property address */}
                    {project.propertyAddress && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                        <MapPin className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate" data-testid={`text-address-${project.id}`}>{project.propertyAddress}</span>
                      </div>
                    )}
                    
                    {/* Target date */}
                    {project.targetCloseDate && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span data-testid={`text-target-date-${project.id}`}>Target: {formatDate(project.targetCloseDate)}</span>
                      </div>
                    )}
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow 
                    key={project.id} 
                    className="cursor-pointer hover-elevate"
                    data-testid={`row-deal-${project.id}`}
                  >
                    <TableCell>
                      <Link href={`/deals/${project.id}`}>
                        <span className="font-mono text-sm text-primary hover:underline" data-testid={`link-deal-row-${project.id}`}>
                          DEAL-{project.id}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{project.borrowerName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 max-w-[200px]">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate text-sm">{project.propertyAddress || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(project.loanAmount)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(project.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <Progress value={project.progressPercentage} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-8">{project.progressPercentage}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileText,
  DollarSign,
  TrendingUp,
  Search,
  Plus,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Building2,
  CheckSquare,
  Activity,
  CalendarDays,
  Circle,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List,
  Columns3,
  FolderUp,
  ExternalLink,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  Filter,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DigestConfigPanel } from "@/components/DigestConfigPanel";
import DealsKanbanView from "@/components/admin/DealsKanbanView";

interface DealStage {
  id: number;
  stageName: string;
  stageKey: string;
  stageOrder: number;
  stageDescription: string;
  status: string;
  tasks: DealTask[];
}

interface DealTask {
  id: number;
  taskTitle: string;
  taskType: string;
  priority: string;
  status: string;
  completedAt: string | null;
  visibleToBorrower: boolean;
  borrowerActionRequired: boolean;
}

interface Partner {
  id: number;
  name: string;
  companyName: string | null;
}

interface Deal {
  id: number;
  projectId?: number;
  projectNumber?: string;
  userId: number;
  partnerId?: number | null;
  partnerName?: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  propertyAddress: string;
  loanData: {
    loanAmount: number;
    propertyValue?: number;
    ltv?: string;
    loanType: string;
    loanPurpose?: string;
    propertyType: string;
    loanTerm?: string;
  };
  interestRate: string;
  pointsCharged?: number;
  pointsAmount?: number;
  tpoPremiumAmount?: number;
  totalRevenue?: number;
  commission?: number;
  stage: string;
  currentStage?: string;
  progressPercentage?: number;
  createdAt: string;
  targetCloseDate?: string;
  userName: string | null;
  userEmail: string | null;
  partner?: Partner | null;
  quoteId?: number | null;
  googleDriveFolderId?: string | null;
  googleDriveFolderUrl?: string | null;
  driveSyncStatus?: string | null;
}

interface StageInfo {
  stage: string;
  label: string;
  count: number;
  color?: string;
}

interface ProgramPipeline {
  programId: number;
  programName: string;
  totalDeals: number;
  stages: StageInfo[];
}

interface DealsStats {
  totalDeals: number;
  totalLoanAmount: number;
  totalRevenue: number;
  totalCommission: number;
  loanTypeStats: Record<string, { count: number; amount: number }>;
  stageStats: StageInfo[];
  pipelineByProgram: ProgramPipeline[];
  monthlyStats: { month: string; count: number; amount: number }[];
}

interface DealsResponse {
  deals: Deal[];
  stats: DealsStats;
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
  // Determine stat card class and colors based on title
  const getColorClasses = (title: string) => {
    switch (title) {
      case "Total Deals":
        return { statCard: "stat-card-blue", bg: "bg-primary/10", icon: "text-primary" };
      case "Total Loan Volume":
        return { statCard: "stat-card-emerald", bg: "bg-accent/10", icon: "text-accent" };
      case "Total Revenue":
        return { statCard: "stat-card-navy", bg: "bg-info/10", icon: "text-info" };
      case "Total Commission":
        return { statCard: "stat-card-amber", bg: "bg-warning/10", icon: "text-warning" };
      default:
        return { statCard: "stat-card-blue", bg: "bg-primary/10", icon: "text-primary" };
    }
  };

  const colors = getColorClasses(title);

  return (
    <Card className={`${colors.statCard} hover:shadow-lg transition-all duration-200 ${className}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-3xl font-bold">{value}</span>
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
            )}
          </div>
          <div className={`h-14 w-14 rounded-full ${colors.bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`h-7 w-7 ${colors.icon}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineByProgram({ programs }: { programs: ProgramPipeline[] }) {
  const totalDeals = programs.reduce((sum, p) => sum + p.totalDeals, 0);

  return (
    <Card data-testid="card-pipeline-by-program">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Pipeline by Program</CardTitle>
        <CardDescription>Deal distribution across programs and stages</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No deals in pipeline</p>
        ) : (
          programs.map((program) => {
            const maxCount = Math.max(...(program.stages.length > 0 ? program.stages.map(s => s.count) : [0]), 1);
            return (
              <div key={program.programId} className="space-y-3" data-testid={`pipeline-program-${program.programId}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{program.programName}</span>
                    <Badge variant="secondary" className="text-xs">{program.totalDeals} {program.totalDeals === 1 ? 'deal' : 'deals'}</Badge>
                  </div>
                </div>
                {program.stages.length > 0 ? (
                  <div className="space-y-2 pl-1">
                    {program.stages.map((stage, idx) => {
                      const pct = program.totalDeals > 0 ? Math.round((stage.count / program.totalDeals) * 100) : 0;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{stage.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground font-medium">{stage.count}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {pct}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-5 rounded-md overflow-hidden bg-muted">
                            <div
                              className="h-full rounded-md transition-all duration-500"
                              style={{
                                width: `${Math.max((stage.count / maxCount) * 100, 4)}%`,
                                backgroundColor: stage.color || 'hsl(212 67% 51%)',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pl-1">No workflow stages configured</p>
                )}
                {program !== programs[programs.length - 1] && (
                  <div className="border-b" />
                )}
              </div>
            );
          })
        )}

        <div className="pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Total in Pipeline</span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-primary">{totalDeals}</span>
              <span className="text-sm text-muted-foreground">deals</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineByStage({ stageStats }: { stageStats: StageInfo[] }) {
  const totalDeals = stageStats.reduce((sum, s) => sum + s.count, 0);
  const maxCount = Math.max(...stageStats.map(s => s.count), 1);

  return (
    <Card data-testid="card-pipeline-by-stage">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Pipeline by Program</CardTitle>
        <CardDescription>Deal count and percentage at each stage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {stageStats.map((stage, index) => {
            const pct = totalDeals > 0 ? Math.round((stage.count / totalDeals) * 100) : 0;
            return (
              <div key={index} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{stage.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-semibold">{stage.count} deals</span>
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-5 rounded-md overflow-hidden bg-muted">
                  <div
                    className="h-full rounded-md transition-all duration-500"
                    style={{
                      width: `${Math.max((stage.count / maxCount) * 100, 4)}%`,
                      backgroundColor: stage.color || 'hsl(212 67% 51%)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Total in Pipeline</span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-primary">{totalDeals}</span>
              <span className="text-sm text-muted-foreground">deals</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

function getStageStyle(stage: string, stageStats?: StageInfo[]): React.CSSProperties | undefined {
  if (stageStats) {
    const stageInfo = stageStats.find(s => s.stage === stage);
    if (stageInfo?.color) {
      const rgb = hexToRgb(stageInfo.color);
      if (rgb) {
        return {
          backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
          color: stageInfo.color,
        };
      }
    }
  }
  return undefined;
}

function getStageLabel(stage: string, stageStats?: StageInfo[]): string {
  if (stageStats) {
    const stageInfo = stageStats.find(s => s.stage === stage);
    if (stageInfo) return stageInfo.label;
  }
  const words = stage.replace(/[-_]/g, ' ').split(' ');
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatCurrency(amount: number) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function getLoanTypeLabel(loanType: string): string {
  const labels: Record<string, string> = {
    "rtl": "RTL",
    "dscr": "DSCR",
    "fix-and-flip": "Fix & Flip",
    "bridge": "Bridge",
    "ground-up": "Ground Up",
    "rental": "Rental",
  };
  return labels[loanType?.toLowerCase()] || loanType || "N/A";
}

function getDaysInStage(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function getSemanticStageColor(stage: string): { className: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const stageKey = stage?.toLowerCase() || '';
  if (stageKey.includes('complete') || stageKey.includes('funded') || stageKey.includes('closed')) {
    return { className: 'bg-green-50 text-green-700 border-green-200', variant: 'outline' };
  }
  if (stageKey.includes('initial') || stageKey.includes('quote') || stageKey.includes('appraisal')) {
    return { className: 'bg-blue-50 text-blue-700 border-blue-200', variant: 'outline' };
  }
  if (stageKey.includes('at-risk') || stageKey.includes('overdue') || stageKey.includes('stalled')) {
    return { className: 'bg-red-50 text-red-700 border-red-200', variant: 'destructive' };
  }
  if (stageKey.includes('underwriting') || stageKey.includes('review') || stageKey.includes('processing')) {
    return { className: 'bg-amber-50 text-amber-700 border-amber-200', variant: 'outline' };
  }
  return { className: '', variant: 'default' };
}

function DrivePushButton({ deal }: { deal: Deal }) {
  const { toast } = useToast();
  const [pushing, setPushing] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(deal.googleDriveFolderUrl || null);
  const [hasError, setHasError] = useState(deal.driveSyncStatus === 'ERROR');

  if (driveUrl) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            data-testid={`button-drive-open-${deal.id}`}
          >
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <ExternalLink className="h-3.5 w-3.5" />
              Drive
            </Button>
          </a>
        </TooltipTrigger>
        <TooltipContent>Open Google Drive folder</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant={hasError ? 'destructive' : 'outline'}
          className="gap-1.5 text-xs"
          disabled={pushing}
          data-testid={`button-drive-push-${deal.id}`}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            setPushing(true);
            setHasError(false);
            try {
              const res = await apiRequest('POST', `/api/admin/deals/${deal.id}/drive/push`);
              const data = await res.json();
              setDriveUrl(data.googleDriveFolderUrl);
              queryClient.invalidateQueries({ queryKey: ['/api/admin/deals'] });
              toast({ title: "Drive folder created", description: "Google Drive folder is ready." });
            } catch (err: any) {
              setHasError(true);
              toast({ title: "Drive push failed", description: err.message || "Could not create folder.", variant: "destructive" });
            } finally {
              setPushing(false);
            }
          }}
        >
          {pushing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasError ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <FolderUp className="h-3.5 w-3.5" />
          )}
          {pushing ? 'Pushing...' : hasError ? 'Retry' : 'Push to Drive'}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hasError ? 'Failed - click to retry' : 'Create a Google Drive folder for this deal'}
      </TooltipContent>
    </Tooltip>
  );
}

interface DealExpandedCardProps {
  deal: Deal;
  formatCurrency: (amount: number) => string;
  getStageLabel: (stage: string, stageStats?: StageInfo[]) => string;
  getLoanTypeLabel: (type: string) => string;
  stageStats?: StageInfo[];
}

function DealExpandedCard({ deal, formatCurrency, getStageLabel, getLoanTypeLabel, stageStats }: DealExpandedCardProps) {
  const progress = deal.progressPercentage || 0;
  const loanTitle = `${deal.customerFirstName} ${deal.customerLastName} - ${getLoanTypeLabel(deal.loanData?.loanType)}`;
  const targetDate = deal.targetCloseDate ? new Date(deal.targetCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const daysInStage = getDaysInStage(deal.createdAt);
  const stageColorInfo = getSemanticStageColor(deal.stage);

  // Mock Lane confidence calculation based on progress percentage
  const laneConfidence = Math.min(95, Math.max(60, progress + 20));

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-700';
    if (confidence >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <Card data-testid={`card-deal-${deal.id}`} className="overflow-hidden hover-elevate">
      <Link href={`/admin/deals/${deal.id}`} data-testid={`link-deal-${deal.id}`}>
        <div className="p-5">
          {/* Top row: Project number, status badge, Lane confidence, arrow */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {deal.projectNumber && (
                <span className="text-xs text-muted-foreground font-mono" data-testid={`text-project-number-${deal.id}`}>
                  {deal.projectNumber}
                </span>
              )}
              <Badge className="text-xs" style={getStageStyle(deal.stage, stageStats)} data-testid={`badge-status-${deal.id}`}>
                {getStageLabel(deal.stage, stageStats)}
              </Badge>
              <Badge variant="outline" className="text-xs" data-testid={`badge-loantype-${deal.id}`}>
                {getLoanTypeLabel(deal.loanData?.loanType)}
              </Badge>
              <Badge variant="secondary" className="text-xs gap-1">
                <Clock className="h-3 w-3" />
                {daysInStage}d
              </Badge>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${getConfidenceColor(laneConfidence)}`} data-testid={`lane-confidence-deal-${deal.id}`}>
                Lane: {laneConfidence}%
              </span>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          
          {/* Loan title */}
          <h3 className="text-base font-semibold mb-3 truncate" data-testid={`text-deal-title-${deal.id}`}>
            {loanTitle}
          </h3>
          
          {/* Progress bar */}
          <div className="mb-3" data-testid={`progress-container-${deal.id}`}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium" data-testid={`text-progress-${deal.id}`}>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          {/* Borrower and Amount row */}
          <div className="flex items-center gap-4 text-sm mt-2 mb-2 border-t border-border pt-3">
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-muted-foreground" />
              <span data-testid={`text-borrower-${deal.id}`}>{deal.customerFirstName} {deal.customerLastName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span data-testid={`text-amount-${deal.id}`}>
                {deal.loanData?.loanAmount ? formatCurrency(deal.loanData.loanAmount) : "—"}
              </span>
            </div>
          </div>
          
          {/* Property address */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate" data-testid={`text-address-${deal.id}`}>{deal.propertyAddress}</span>
          </div>
          
          {/* Target date */}
          {targetDate && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span data-testid={`text-target-date-${deal.id}`}>Target: {targetDate}</span>
            </div>
          )}
        </div>
      </Link>
      <div className="px-5 pb-4 pt-0">
        <DrivePushButton deal={deal} />
      </div>
    </Card>
  );
}

export default function AdminDeals({ embedded = false }: { embedded?: boolean }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount-high" | "amount-low">("newest");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { toast } = useToast();
  
  const [newDeal, setNewDeal] = useState({
    customerFirstName: "",
    customerLastName: "",
    borrowerEmail: "",
    borrowerPhone: "",
    propertyAddress: "",
    loanAmount: "",
    propertyValue: "",
    interestRate: "",
    loanType: "",
    programId: "",
    propertyType: "",
    stage: "initial-review",
    partnerId: "",
    partnerName: "",
    loanPurpose: "purchase",
    targetCloseDate: "",
  });
  
  const [partnerInputMode, setPartnerInputMode] = useState<"select" | "manual">("select");

  const { data: programsData } = useQuery<{ programs: Array<{ id: number; name: string; loanType: string; isActive: boolean; eligiblePropertyTypes: string[] | null }> }>({
    queryKey: ["/api/programs-with-pricing"],
    queryFn: async () => {
      const res = await fetch("/api/programs-with-pricing", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json();
    },
  });

  const { data: partnersData } = useQuery<{ partners: Partner[] }>({
    queryKey: ["/api/admin/partners"],
    queryFn: async () => {
      const res = await fetch("/api/admin/partners", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch partners");
      return res.json();
    },
  });

  const selectedProgram = programsData?.programs?.find(p => String(p.id) === newDeal.programId);

  const allPropertyTypes = [
    { value: "single-family-residence", label: "Single Family Residence" },
    { value: "2-4-unit", label: "2-4 Unit" },
    { value: "multifamily-5-plus", label: "Multifamily (5+ Units)" },
    { value: "rental-portfolio", label: "Rental Portfolio" },
    { value: "mixed-use", label: "Mixed-Use" },
    { value: "infill-lot", label: "Infill Lot" },
    { value: "land", label: "Land" },
    { value: "office", label: "Office" },
    { value: "retail", label: "Retail" },
    { value: "hospitality", label: "Hospitality" },
    { value: "industrial", label: "Industrial" },
    { value: "medical", label: "Medical" },
    { value: "agricultural", label: "Agricultural" },
    { value: "special-purpose", label: "Special Purpose" },
  ];

  const availablePropertyTypes = selectedProgram?.eligiblePropertyTypes?.length
    ? allPropertyTypes.filter(pt => selectedProgram.eligiblePropertyTypes!.includes(pt.value))
    : allPropertyTypes;

  const { data, isLoading } = useQuery<DealsResponse>({
    queryKey: ["/api/admin/deals", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      const res = await fetch(`/api/admin/deals?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch deals");
      return res.json();
    },
  });

  const createDealMutation = useMutation({
    mutationFn: async (dealData: typeof newDeal) => {
      return apiRequest("POST", "/api/admin/deals", dealData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
      setIsAddDialogOpen(false);
      setNewDeal({
        customerFirstName: "",
        customerLastName: "",
        borrowerEmail: "",
        borrowerPhone: "",
        propertyAddress: "",
        loanAmount: "",
        propertyValue: "",
        interestRate: "",
        loanType: "",
        programId: "",
        propertyType: "",
        stage: "initial-review",
        partnerId: "",
        partnerName: "",
        loanPurpose: "purchase",
        targetCloseDate: "",
      });
      setPartnerInputMode("select");
      toast({
        title: "Deal created",
        description: "The deal has been added to the pipeline and is ready for processing.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create deal. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateDeal = () => {
    if (!newDeal.programId) {
      toast({
        title: "Missing loan program",
        description: "Please select a loan program first.",
        variant: "destructive",
      });
      return;
    }
    if (!newDeal.customerFirstName || !newDeal.customerLastName) {
      toast({
        title: "Missing borrower name",
        description: "Please enter the borrower's first and last name.",
        variant: "destructive",
      });
      return;
    }
    if (!newDeal.propertyAddress) {
      toast({
        title: "Missing property address",
        description: "Please enter the property address.",
        variant: "destructive",
      });
      return;
    }
    if (!newDeal.loanAmount) {
      toast({
        title: "Missing loan amount",
        description: "Please enter the requested loan amount.",
        variant: "destructive",
      });
      return;
    }
    createDealMutation.mutate(newDeal);
  };

  const stats = data?.stats;
  const rawDeals = data?.deals || [];
  
  const deals = [...rawDeals].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "amount-high":
        return (b.loanData?.loanAmount || 0) - (a.loanData?.loanAmount || 0);
      case "amount-low":
        return (a.loanData?.loanAmount || 0) - (b.loanData?.loanAmount || 0);
      default:
        return 0;
    }
  });

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {!embedded && (
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Loan Pipeline</h1>
            <p className="text-muted-foreground text-sm">Manage your active loan pipeline</p>
          </div>
        )}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-deal">
              <Plus className="h-4 w-4 mr-2" />
              Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Deal</DialogTitle>
              <DialogDescription>
                Select a loan program and fill in the deal details
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="programId" className="text-sm font-semibold">Loan Program *</Label>
                <Select
                  value={newDeal.programId}
                  onValueChange={(value) => {
                    const program = programsData?.programs?.find(p => String(p.id) === value);
                    const eligibleTypes = program?.eligiblePropertyTypes || [];
                    setNewDeal({
                      ...newDeal,
                      programId: value,
                      loanType: program?.loanType || "",
                      propertyType: eligibleTypes.length === 1 ? eligibleTypes[0] : (eligibleTypes.includes(newDeal.propertyType) ? newDeal.propertyType : ""),
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-loan-program">
                    <SelectValue placeholder="Choose a loan program..." />
                  </SelectTrigger>
                  <SelectContent>
                    {programsData?.programs?.filter(p => p.isActive).map((program) => (
                      <SelectItem key={program.id} value={String(program.id)}>
                        {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProgram && (
                  <p className="text-xs text-muted-foreground">
                    Type: {selectedProgram.loanType?.toUpperCase().replace(/_/g, " ") || "—"}
                    {selectedProgram.eligiblePropertyTypes?.length ? ` · ${selectedProgram.eligiblePropertyTypes.length} eligible property types` : ""}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={newDeal.customerFirstName}
                    onChange={(e) => setNewDeal({ ...newDeal, customerFirstName: e.target.value })}
                    placeholder="John"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={newDeal.customerLastName}
                    onChange={(e) => setNewDeal({ ...newDeal, customerLastName: e.target.value })}
                    placeholder="Smith"
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="borrowerEmail">Email</Label>
                  <Input
                    id="borrowerEmail"
                    type="email"
                    value={newDeal.borrowerEmail}
                    onChange={(e) => setNewDeal({ ...newDeal, borrowerEmail: e.target.value })}
                    placeholder="john@example.com"
                    data-testid="input-borrower-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="borrowerPhone">Phone</Label>
                  <Input
                    id="borrowerPhone"
                    type="tel"
                    value={newDeal.borrowerPhone}
                    onChange={(e) => setNewDeal({ ...newDeal, borrowerPhone: e.target.value })}
                    placeholder="(555) 123-4567"
                    data-testid="input-borrower-phone"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Property Address *</Label>
                <AddressAutocomplete
                  id="address"
                  value={newDeal.propertyAddress}
                  onChange={(address) => setNewDeal({ ...newDeal, propertyAddress: address })}
                  placeholder="Start typing an address..."
                  data-testid="input-property-address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="propertyType">Property Type</Label>
                  <Select
                    value={newDeal.propertyType}
                    onValueChange={(value) => setNewDeal({ ...newDeal, propertyType: value })}
                  >
                    <SelectTrigger data-testid="select-property-type">
                      <SelectValue placeholder="Select property type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePropertyTypes.map((pt) => (
                        <SelectItem key={pt.value} value={pt.value}>
                          {pt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loanPurpose">Loan Purpose</Label>
                  <Select
                    value={newDeal.loanPurpose}
                    onValueChange={(value) => setNewDeal({ ...newDeal, loanPurpose: value })}
                  >
                    <SelectTrigger data-testid="select-loan-purpose">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Purchase</SelectItem>
                      <SelectItem value="refinance">Refinance</SelectItem>
                      <SelectItem value="cash_out">Cash-Out Refinance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loanAmount">Loan Amount *</Label>
                  <Input
                    id="loanAmount"
                    type="number"
                    value={newDeal.loanAmount}
                    onChange={(e) => setNewDeal({ ...newDeal, loanAmount: e.target.value })}
                    placeholder="680000"
                    data-testid="input-loan-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyValue">Property Value</Label>
                  <Input
                    id="propertyValue"
                    type="number"
                    value={newDeal.propertyValue}
                    onChange={(e) => setNewDeal({ ...newDeal, propertyValue: e.target.value })}
                    placeholder="850000"
                    data-testid="input-property-value"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="interestRate">Interest Rate</Label>
                  <Input
                    id="interestRate"
                    value={newDeal.interestRate}
                    onChange={(e) => setNewDeal({ ...newDeal, interestRate: e.target.value })}
                    placeholder="11.5"
                    data-testid="input-interest-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetCloseDate">Target Close Date</Label>
                  <Input
                    id="targetCloseDate"
                    type="date"
                    value={newDeal.targetCloseDate}
                    onChange={(e) => setNewDeal({ ...newDeal, targetCloseDate: e.target.value })}
                    data-testid="input-target-close-date"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label htmlFor="partner">Partner / Broker</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setPartnerInputMode(partnerInputMode === "select" ? "manual" : "select");
                      setNewDeal({ ...newDeal, partnerId: "", partnerName: "" });
                    }}
                    data-testid="button-toggle-partner-mode"
                  >
                    {partnerInputMode === "select" ? "Type manually" : "Select from list"}
                  </Button>
                </div>
                {partnerInputMode === "select" ? (
                  <Select
                    value={newDeal.partnerId || "none"}
                    onValueChange={(value) => setNewDeal({ ...newDeal, partnerId: value === "none" ? "" : value, partnerName: "" })}
                  >
                    <SelectTrigger data-testid="select-partner">
                      <SelectValue placeholder="Select a partner (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {partnersData?.partners?.map((partner) => (
                        <SelectItem key={partner.id} value={partner.id.toString()}>
                          {partner.name}{partner.companyName ? ` (${partner.companyName})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="partnerName"
                    value={newDeal.partnerName}
                    onChange={(e) => setNewDeal({ ...newDeal, partnerName: e.target.value, partnerId: "" })}
                    placeholder="Enter partner name manually"
                    data-testid="input-partner-name"
                  />
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDeal}
                disabled={createDealMutation.isPending}
                data-testid="button-create-deal"
              >
                {createDealMutation.isPending ? "Creating..." : "Create Deal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Deals"
            value={stats?.totalDeals || 0}
            subtitle="All time submissions"
            icon={FileText}
          />
          <StatsCard
            title="Total Loan Volume"
            value={formatCurrency(stats?.totalLoanAmount || 0)}
            subtitle="Cumulative loan amount"
            icon={DollarSign}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {stats?.pipelineByProgram && stats.pipelineByProgram.length > 0 && (
          <PipelineByProgram programs={stats.pipelineByProgram} />
        )}
        {stats?.stageStats && stats.stageStats.length > 0 && (
          <PipelineByStage stageStats={stats.stageStats} />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-accent">
          <Filter className="h-3.5 w-3.5" />
          All Deals
        </Badge>
        <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-accent">
          <Zap className="h-3.5 w-3.5" />
          High Priority
        </Badge>
        <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-accent">
          <AlertTriangle className="h-3.5 w-3.5" />
          At Risk
        </Badge>
      </div>

      <div className="space-y-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">All Deals</h2>
            <p className="text-muted-foreground text-sm">Quotes submitted by all users</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer, address, or user..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-deals"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[180px]" data-testid="select-sort-deals">
                <ArrowUpDown className="h-4 w-4 mr-2 shrink-0" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="amount-high">Amount: High to Low</SelectItem>
                <SelectItem value="amount-low">Amount: Low to High</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {([
                { mode: "grid" as const, label: "Cards", icon: LayoutGrid },
                { mode: "list" as const, label: "List", icon: List },
                { mode: "kanban" as const, label: "Kanban", icon: Columns3 },
              ]).map(({ mode, label, icon: Icon }) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode(mode)}
                  data-testid={`btn-view-${mode}`}
                  className="gap-1.5"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
        
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : deals.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="space-y-4">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium">No deals found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first deal to the pipeline"}
                </p>
              </div>
              {!searchTerm && (
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add Your First Deal
                    </Button>
                  </DialogTrigger>
                </Dialog>
              )}
            </CardContent>
          </Card>
        ) : viewMode === "kanban" ? (
          <DealsKanbanView />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deals.map((deal) => (
              <DealExpandedCard 
                key={deal.id} 
                deal={deal} 
                formatCurrency={formatCurrency}
                getStageLabel={getStageLabel}
                getLoanTypeLabel={getLoanTypeLabel}
                stageStats={data?.stats?.stageStats}
              />
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10 border-b-2 border-border">
                  <TableRow className="hover:bg-transparent">
                  <TableHead>Deal</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Loan Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage Time</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Drive</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow 
                    key={deal.id} 
                    className="cursor-pointer hover-elevate"
                    data-testid={`row-deal-${deal.id}`}
                  >
                    <TableCell>
                      <Link href={`/admin/deals/${deal.id}`}>
                        <span className="font-mono text-sm text-primary hover:underline" data-testid={`link-deal-row-${deal.id}`}>
                          {deal.projectNumber || `#${deal.id}`}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{deal.customerFirstName} {deal.customerLastName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 max-w-[200px]">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate text-sm">{deal.propertyAddress}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getLoanTypeLabel(deal.loanData?.loanType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {deal.loanData?.loanAmount ? formatCurrency(deal.loanData.loanAmount) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className="text-xs" style={getStageStyle(deal.stage, data?.stats?.stageStats)}>
                        {getStageLabel(deal.stage, data?.stats?.stageStats)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{getDaysInStage(deal.createdAt)} days</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <Progress value={deal.progressPercentage || 0} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-8">{deal.progressPercentage || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DrivePushButton deal={deal} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

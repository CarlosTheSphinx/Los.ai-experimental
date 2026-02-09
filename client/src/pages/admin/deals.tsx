import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  Wallet,
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
} from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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

interface DealsStats {
  totalDeals: number;
  totalLoanAmount: number;
  totalRevenue: number;
  totalCommission: number;
  loanTypeStats: Record<string, { count: number; amount: number }>;
  stageStats: StageInfo[];
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
                  className="h-2 flex-1 rounded-full"
                  style={{
                    backgroundColor: stageInfo.color || '#6b7280',
                    opacity: stageInfo.count > 0 ? 1 : 0.3,
                  }}
                />
                {index < stageStats.length - 1 && (
                  <span className="text-muted-foreground text-xs">&rarr;</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    "active": "bg-green-100 text-green-800",
    "on_hold": "bg-yellow-100 text-yellow-800",
    "cancelled": "bg-red-100 text-red-800",
    "completed": "bg-blue-100 text-blue-800",
    "initial-review": "bg-yellow-100 text-yellow-800",
    "term-sheet": "bg-blue-100 text-blue-800",
    "onboarding": "bg-purple-100 text-purple-800",
    "processing": "bg-red-100 text-red-800",
    "underwriting": "bg-indigo-100 text-indigo-800",
    "closing": "bg-teal-100 text-teal-800",
    "closed": "bg-green-100 text-green-800",
  };
  return colors[stage] || "bg-gray-100 text-gray-800";
}

function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    "active": "Active",
    "on_hold": "On Hold",
    "cancelled": "Cancelled",
    "completed": "Completed",
    "initial-review": "Initial Review",
    "term-sheet": "Term Sheet",
    "onboarding": "Onboarding",
    "processing": "Processing",
    "underwriting": "Underwriting",
    "closing": "Closing",
    "closed": "Closed",
  };
  return labels[stage] || stage;
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
  getStageColor: (stage: string) => string;
  getStageLabel: (stage: string) => string;
  getLoanTypeLabel: (type: string) => string;
}

function DealExpandedCard({ deal, formatCurrency, getStageColor, getStageLabel, getLoanTypeLabel }: DealExpandedCardProps) {
  const progress = deal.progressPercentage || 0;
  const loanTitle = `${deal.customerFirstName} ${deal.customerLastName} - ${getLoanTypeLabel(deal.loanData?.loanType)}`;
  const targetDate = deal.targetCloseDate ? new Date(deal.targetCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <Card data-testid={`card-deal-${deal.id}`} className="overflow-hidden hover-elevate">
      <Link href={`/admin/deals/${deal.id}`} data-testid={`link-deal-${deal.id}`}>
        <div className="p-5">
          {/* Top row: Project number, status badge, arrow */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {deal.projectNumber && (
                <span className="text-xs text-muted-foreground font-mono" data-testid={`text-project-number-${deal.id}`}>
                  {deal.projectNumber}
                </span>
              )}
              <Badge className={cn("text-xs", getStageColor(deal.stage))} data-testid={`badge-status-${deal.id}`}>
                {getStageLabel(deal.stage)}
              </Badge>
              <Badge variant="outline" className="text-xs" data-testid={`badge-loantype-${deal.id}`}>
                {getLoanTypeLabel(deal.loanData?.loanType)}
              </Badge>
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

export default function AdminDeals() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount-high" | "amount-low">("newest");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { toast } = useToast();
  
  const [newDeal, setNewDeal] = useState({
    customerFirstName: "",
    customerLastName: "",
    propertyAddress: "",
    loanAmount: "",
    propertyValue: "",
    interestRate: "",
    loanType: "rtl",
    programId: "",
    propertyType: "single-family",
    stage: "initial-review",
    partnerId: "",
    partnerName: "",
  });
  
  const [partnerInputMode, setPartnerInputMode] = useState<"select" | "manual">("select");

  const { data: programsData } = useQuery<{ programs: Array<{ id: number; name: string; loanType: string; isActive: boolean }> }>({
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
        propertyAddress: "",
        loanAmount: "",
        propertyValue: "",
        interestRate: "",
        loanType: "rtl",
        programId: "",
        propertyType: "single-family",
        stage: "initial-review",
        partnerId: "",
        partnerName: "",
      });
      setPartnerInputMode("select");
      toast({
        title: "Project created",
        description: "The project has been added to the pipeline.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateDeal = () => {
    if (!newDeal.customerFirstName || !newDeal.customerLastName || !newDeal.propertyAddress || !newDeal.loanAmount) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
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
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Pipeline</h1>
          <p className="text-muted-foreground">Overview of all deals submitted by users</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-project">
              <Plus className="h-4 w-4 mr-2" />
              Add Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Project</DialogTitle>
              <DialogDescription>
                Manually add a new project to the pipeline
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
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
                    placeholder="11.5%"
                    data-testid="input-interest-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="programId">Loan Program</Label>
                  <Select
                    value={newDeal.programId}
                    onValueChange={(value) => {
                      const program = programsData?.programs?.find(p => String(p.id) === value);
                      setNewDeal({
                        ...newDeal,
                        programId: value,
                        loanType: program?.loanType || newDeal.loanType,
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-loan-program">
                      <SelectValue placeholder="Select a program" />
                    </SelectTrigger>
                    <SelectContent>
                      {programsData?.programs?.filter(p => p.isActive).map((program) => (
                        <SelectItem key={program.id} value={String(program.id)}>
                          {program.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="propertyType">Property Type</Label>
                <Select
                  value={newDeal.propertyType}
                  onValueChange={(value) => setNewDeal({ ...newDeal, propertyType: value })}
                >
                  <SelectTrigger data-testid="select-property-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single-family">Single Family</SelectItem>
                    <SelectItem value="multi-family">Multi-Family</SelectItem>
                    <SelectItem value="condo">Condo</SelectItem>
                    <SelectItem value="townhouse">Townhouse</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="partner">Partner</Label>
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
            <DialogFooter>
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
                data-testid="button-create-project"
              >
                {createDealMutation.isPending ? "Creating..." : "Create Project"}
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
          <StatsCard
            title="Total Revenue"
            value={formatCurrency(stats?.totalRevenue || 0)}
            subtitle="Points + TPO Premium"
            icon={TrendingUp}
          />
          <StatsCard
            title="Total Commission"
            value={formatCurrency(stats?.totalCommission || 0)}
            subtitle="30% of revenue"
            icon={Wallet}
          />
        </div>
      )}

      {stats?.stageStats && stats.stageStats.length > 0 && (
        <PipelineByStage stageStats={stats.stageStats} />
      )}

      <div className="space-y-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">All Deals</h2>
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
            <CardContent>
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No deals found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? "Try adjusting your search" : "No quotes have been submitted yet"}
              </p>
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
                getStageColor={getStageColor}
                getStageLabel={getStageLabel}
                getLoanTypeLabel={getLoanTypeLabel}
              />
            ))}
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Loan Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
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
                      <Badge className={cn("text-xs", getStageColor(deal.stage))}>
                        {getStageLabel(deal.stage)}
                      </Badge>
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
          </Card>
        )}
      </div>
    </div>
  );
}

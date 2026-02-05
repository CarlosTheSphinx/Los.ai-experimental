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
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DigestConfigPanel } from "@/components/DigestConfigPanel";

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
}

interface StageInfo {
  stage: string;
  label: string;
  count: number;
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
  const stageColors: Record<string, string> = {
    "initial-review": "bg-yellow-500",
    "term-sheet": "bg-blue-400",
    "onboarding": "bg-purple-400",
    "processing": "bg-red-500",
    "underwriting": "bg-indigo-500",
    "closing": "bg-teal-500",
    "closed": "bg-green-500",
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
                    stageColors[stageInfo.stage] || "bg-gray-400"
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

interface DealExpandedCardProps {
  deal: Deal;
  formatCurrency: (amount: number) => string;
  getStageColor: (stage: string) => string;
  getStageLabel: (stage: string) => string;
  getLoanTypeLabel: (type: string) => string;
}

function DealExpandedCard({ deal, formatCurrency, getStageColor, getStageLabel, getLoanTypeLabel }: DealExpandedCardProps) {
  const [activeTab, setActiveTab] = useState<string>("stages");
  const [isDigestOpen, setIsDigestOpen] = useState(false);

  const { data: projectData } = useQuery<{ project: { id: number; projectName: string; status: string } | null }>({
    queryKey: ['/api/admin/deals', deal.id, 'project'],
  });

  const projectId = projectData?.project?.id;

  const { data: projectDetailData, isLoading: stagesLoading } = useQuery<{ 
    project: any; 
    stages: DealStage[]; 
    tasks: DealTask[];
    activity: any[];
  }>({
    queryKey: ['/api/admin/projects', projectId],
    enabled: !!projectId && activeTab === "stages",
  });

  const { data: docsData, isLoading: docsLoading } = useQuery<{ documents: any[] }>({
    queryKey: ['/api/admin/deals', deal.id, 'documents'],
    enabled: activeTab === "documents",
  });

  const dealStages = projectDetailData?.stages || [];
  const projectTasks = projectDetailData?.tasks || [];
  const dealDocuments = docsData?.documents || [];

  const stagesWithTasks = dealStages.map((stage: DealStage) => ({
    ...stage,
    tasks: projectTasks.filter((t: DealTask) => t.taskType === stage.stageKey || 
      (stage.stageOrder === 1 && projectTasks.filter(pt => pt.status === 'pending').slice(0, 3).some(pt => pt.id === t.id)))
  }));

  const completedStages = dealStages.filter((s: DealStage) => s.status === 'completed').length;
  const totalStages = dealStages.length || 9;
  const progress = Math.round((completedStages / totalStages) * 100);

  return (
    <Card data-testid={`card-deal-${deal.id}`} className="overflow-hidden">
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {deal.projectNumber && (
                <span className="text-xs text-muted-foreground font-mono">{deal.projectNumber}</span>
              )}
              <Link href={`/admin/deals/${deal.id}`}>
                <h3 className="text-lg font-semibold hover:underline cursor-pointer" data-testid={`link-deal-${deal.id}`}>
                  {deal.customerFirstName} {deal.customerLastName}
                </h3>
              </Link>
              <Badge className={cn("text-xs", getStageColor(deal.stage))}>
                {getStageLabel(deal.stage)}
              </Badge>
              <Badge variant="outline">
                {getLoanTypeLabel(deal.loanData?.loanType)}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <MapPin className="h-4 w-4" />
              <span>{deal.propertyAddress}</span>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 max-w-md">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Loan Progress</span>
                  <span className="font-medium">{deal.progressPercentage || 0}%</span>
                </div>
                <Progress value={deal.progressPercentage || 0} className="h-2" />
              </div>
              <span className="text-sm font-medium text-primary">{deal.progressPercentage || 0}%</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/deals/${deal.id}?tab=stages`}>
              <Button variant="outline" size="sm" data-testid={`btn-stages-${deal.id}`}>
                <Activity className="h-4 w-4 mr-1" />
                Stages
              </Button>
            </Link>
            <Link href={`/admin/deals/${deal.id}?tab=documents`}>
              <Button variant="outline" size="sm" data-testid={`btn-documents-${deal.id}`}>
                <FileText className="h-4 w-4 mr-1" />
                Documents
              </Button>
            </Link>
            <Link href={`/admin/deals/${deal.id}?tab=tasks`}>
              <Button variant="outline" size="sm" data-testid={`btn-tasks-${deal.id}`}>
                <CheckSquare className="h-4 w-4 mr-1" />
                Tasks
              </Button>
            </Link>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsDigestOpen(true)}
              data-testid={`btn-digests-${deal.id}`}
            >
              <CalendarDays className="h-4 w-4 mr-1" />
              Digests
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" />
              Loan Amount
            </div>
            <div className="text-lg font-semibold">{formatCurrency(deal.loanData?.loanAmount || 0)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              Interest Rate
            </div>
            <div className="text-lg font-semibold">{deal.interestRate || "N/A"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3 w-3" />
              LTV
            </div>
            <div className="text-lg font-semibold">{deal.loanData?.ltv || "N/A"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <User className="h-3 w-3" />
              Partner
            </div>
            <div className="text-lg font-semibold truncate">{deal.partner?.name || deal.partnerName || "—"}</div>
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="stages" data-testid={`tab-stages-${deal.id}`}>Stages & Tasks</TabsTrigger>
            <TabsTrigger value="documents" data-testid={`tab-documents-${deal.id}`}>Documents</TabsTrigger>
            <TabsTrigger value="info" data-testid={`tab-info-${deal.id}`}>Borrower Info</TabsTrigger>
          </TabsList>
          
          <TabsContent value="stages" className="mt-0">
            {!projectId ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No loan project linked to this deal yet</p>
                <p className="text-xs mt-1">Create a loan from this deal to track stages and tasks</p>
              </div>
            ) : stagesLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : stagesWithTasks && stagesWithTasks.length > 0 ? (
              <div className="space-y-3">
                {stagesWithTasks.map((stage) => (
                  <div key={stage.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {stage.status === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : stage.status === 'in_progress' ? (
                          <Clock className="h-5 w-5 text-blue-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className="font-medium">{stage.stageName}</span>
                      </div>
                      <Badge variant={stage.status === 'completed' ? 'default' : 'outline'} className="text-xs">
                        {stage.status === 'completed' ? 'Completed' : stage.status === 'in_progress' ? 'In Progress' : 'Pending'}
                      </Badge>
                    </div>
                    {stage.tasks && stage.tasks.length > 0 && (
                      <div className="ml-7 space-y-1">
                        {stage.tasks.map((task: DealTask) => (
                          <div key={task.id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={task.status === 'completed'} disabled className="h-3 w-3" />
                            <span className={task.status === 'completed' ? 'text-muted-foreground line-through' : ''}>
                              {task.taskTitle}
                            </span>
                            {task.borrowerActionRequired && (
                              <Badge variant="outline" className="text-xs">Borrower Action</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No stages configured for this deal</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="documents" className="mt-0">
            {docsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : dealDocuments && dealDocuments.length > 0 ? (
              <div className="space-y-2">
                {dealDocuments.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{doc.documentName}</div>
                        <div className="text-xs text-muted-foreground">{doc.documentType}</div>
                      </div>
                    </div>
                    <Badge variant="outline">{doc.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No documents uploaded yet</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="info" className="mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Borrower Name</div>
                  <div className="font-medium">{deal.customerFirstName} {deal.customerLastName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Submitted By</div>
                  <div className="font-medium">{deal.userName || deal.userEmail || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Property Type</div>
                  <div className="font-medium">{deal.loanData?.propertyType || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="font-medium">{new Date(deal.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {isDigestOpen && (
        <Dialog open={isDigestOpen} onOpenChange={setIsDigestOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Digest Configuration - {deal.customerFirstName} {deal.customerLastName}</DialogTitle>
              <DialogDescription>
                Configure automated loan digest notifications for this deal.
              </DialogDescription>
            </DialogHeader>
            <DigestConfigPanel dealId={deal.id} dealType="quote" />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

export default function AdminDeals() {
  const [searchTerm, setSearchTerm] = useState("");
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
    propertyType: "single-family",
    stage: "initial-review",
    partnerId: "",
    partnerName: "",
  });
  
  const [partnerInputMode, setPartnerInputMode] = useState<"select" | "manual">("select");
  
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
        propertyType: "single-family",
        stage: "initial-review",
        partnerId: "",
        partnerName: "",
      });
      setPartnerInputMode("select");
      toast({
        title: "Deal created",
        description: "The deal has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create deal. Please try again.",
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
  const deals = data?.deals || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Deals Dashboard</h1>
          <p className="text-muted-foreground">Overview of all deals submitted by users</p>
        </div>
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
                Manually add a new deal to the pipeline
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
                <Input
                  id="address"
                  value={newDeal.propertyAddress}
                  onChange={(e) => setNewDeal({ ...newDeal, propertyAddress: e.target.value })}
                  placeholder="123 Main Street, Los Angeles, CA 90001"
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
                  <Label htmlFor="loanType">Loan Type</Label>
                  <Select
                    value={newDeal.loanType}
                    onValueChange={(value) => setNewDeal({ ...newDeal, loanType: value })}
                  >
                    <SelectTrigger data-testid="select-loan-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtl">RTL (Residential Transition Loan)</SelectItem>
                      <SelectItem value="dscr">DSCR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                  <Label htmlFor="stage">Initial Stage</Label>
                  <Select
                    value={newDeal.stage}
                    onValueChange={(value) => setNewDeal({ ...newDeal, stage: value })}
                  >
                    <SelectTrigger data-testid="select-stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial-review">Initial Review</SelectItem>
                      <SelectItem value="term-sheet">Term Sheet</SelectItem>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="underwriting">Underwriting</SelectItem>
                      <SelectItem value="closing">Closing</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
        ) : (
          <div className="space-y-6">
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
        )}
      </div>
    </div>
  );
}

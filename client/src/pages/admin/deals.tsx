import { Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhoneNumber, getPhoneError, getEmailError } from "@/lib/validation";
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
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  DollarSign,
  Search,
  Plus,
  User,
  MapPin,
  Calendar,
  Clock,
  LayoutGrid,
  List,
  Columns3,
  FolderUp,
  ExternalLink,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Mail,
  FolderOpen,
  Inbox,
  Filter,
} from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import DealsKanbanView from "@/components/admin/DealsKanbanView";

interface Deal {
  id: number;
  projectId?: number;
  projectNumber?: string;
  loanNumber?: string | null;
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
  partner?: { id: number; name: string; companyName: string | null } | null;
  quoteId?: number | null;
  googleDriveFolderId?: string | null;
  googleDriveFolderUrl?: string | null;
  driveSyncStatus?: string | null;
  programName?: string | null;
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
  pipelineByProgram: any[];
  monthlyStats: { month: string; count: number; amount: number }[];
}

interface DealsResponse {
  deals: Deal[];
  stats: DealsStats;
}

function formatCurrency(amount: number) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${Math.round(amount).toLocaleString()}`;
  return `$${amount.toFixed(0)}`;
}

function formatCurrencyFull(amount: number) {
  return `$${Math.round(amount).toLocaleString()}`;
}

function getLoanTypeLabel(loanType: string): string {
  const labels: Record<string, string> = {
    "rtl": "RTL Fix & Flip",
    "dscr": "DSCR 30-Year",
    "fix-and-flip": "Fix & Flip",
    "bridge": "Bridge Loan",
    "ground-up": "Ground Up",
    "rental": "Rental",
    "purchase": "Purchase",
    "refinance": "Refinance",
  };
  return labels[loanType?.toLowerCase()] || loanType || "N/A";
}

function getStageLabel(stage: string, stageStats?: StageInfo[]): string {
  if (stageStats) {
    const stageInfo = stageStats.find(s => s.stage === stage);
    if (stageInfo) return stageInfo.label;
  }
  const words = stage.replace(/[-_]/g, ' ').split(' ');
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getStageColor(stage: string): string {
  const stageKey = stage?.toLowerCase() || '';
  if (stageKey.includes('fund') || stageKey.includes('complete') || stageKey.includes('closed')) return '#10b981';
  if (stageKey.includes('approv')) return '#10b981';
  if (stageKey.includes('underwriting') || stageKey.includes('review')) return '#f59e0b';
  if (stageKey.includes('doc') || stageKey.includes('processing')) return '#3b82f6';
  if (stageKey.includes('new') || stageKey.includes('lead') || stageKey.includes('initial') || stageKey.includes('intake')) return '#6366f1';
  if (stageKey.includes('closing') || stageKey.includes('clear')) return '#14b8a6';
  return '#6b7280';
}

function getProgressColor(pct: number): string {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#3b82f6';
  if (pct >= 25) return '#f59e0b';
  return '#ef4444';
}

function getDaysInStage(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function getInitials(first: string, last: string): string {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase();
}

function getInitialColor(name: string): string {
  const colors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600',
    'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-teal-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function extractState(address: string): string {
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (match) return match[1];
  const parts = address.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    const stateZip = parts[parts.length - 2] || parts[parts.length - 1];
    const stateMatch = stateZip.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
    if (stateMatch) return stateMatch[1];
  }
  return '—';
}

function getPropertyTypeLabel(type: string): string {
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
    "industrial": "Industrial",
    "land": "Land",
  };
  return labels[type?.toLowerCase()] || type || '—';
}

function DrivePushButton({ deal }: { deal: Deal }) {
  const { toast } = useToast();
  const [pushing, setPushing] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(deal.googleDriveFolderUrl || null);
  const [hasError, setHasError] = useState(deal.driveSyncStatus === 'ERROR');

  if (driveUrl) {
    return (
      <a
        href={driveUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        data-testid={`button-drive-open-${deal.id}`}
      >
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <FolderOpen className="h-3.5 w-3.5" />
          Google Drive
        </Button>
      </a>
    );
  }

  return (
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
      {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasError ? <AlertCircle className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
      {pushing ? 'Creating...' : hasError ? 'Retry' : 'Google Drive'}
    </Button>
  );
}

function ExpandedDealRow({ deal, stageStats }: { deal: Deal; stageStats?: StageInfo[] }) {
  const createdDate = new Date(deal.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const targetDate = deal.targetCloseDate
    ? new Date(deal.targetCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const daysInStage = getDaysInStage(deal.createdAt);
  const ltv = deal.loanData?.ltv || '—';
  const rate = deal.interestRate && deal.interestRate !== '—' ? deal.interestRate : 'TBD';
  const term = deal.loanData?.loanTerm || '—';
  const propertyType = getPropertyTypeLabel(deal.loanData?.propertyType);
  const propertyValue = deal.loanData?.propertyValue ? formatCurrencyFull(deal.loanData.propertyValue) : '—';
  const state = extractState(deal.propertyAddress);
  const purpose = deal.loanData?.loanPurpose
    ? deal.loanData.loanPurpose.charAt(0).toUpperCase() + deal.loanData.loanPurpose.slice(1).replace(/_/g, ' ')
    : '—';
  const assignedTo = deal.userName || 'Unassigned';

  return (
    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 border-b">
      <TableCell colSpan={7} className="p-0">
        <div className="px-6 py-5">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Loan Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">LTV</span><span className="font-medium">{ltv}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">DSCR</span><span className="font-medium">Pending</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-medium">{rate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Term</span><span className="font-medium">{term}</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Property</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{propertyType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span className="font-medium">{propertyValue}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">State</span><span className="font-medium">{state}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Purpose</span><span className="font-medium">{purpose}</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timeline</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{createdDate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Target Close</span><span className="font-medium">{targetDate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Days in Stage</span><span className="font-medium">{daysInStage} days</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Assigned To</span><span className="font-medium">{assignedTo}</span></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5 pt-4 border-t">
            <Link href={`/admin/deals/${deal.id}`}>
              <Button size="sm" className="gap-1.5" data-testid={`button-open-deal-${deal.id}`}>
                Open Deal <span className="ml-0.5">&rarr;</span>
              </Button>
            </Link>
            <DrivePushButton deal={deal} />
            {deal.customerEmail && (
              <a href={`mailto:${deal.customerEmail}`} onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  <Mail className="h-3.5 w-3.5" />
                  Email Borrower
                </Button>
              </a>
            )}
            <Link href={`/admin/deals/${deal.id}`}>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Documents
              </Button>
            </Link>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function DealExpandedCard({ deal, stageStats }: { deal: Deal; stageStats?: StageInfo[] }) {
  const progress = deal.progressPercentage || 0;
  const stageColor = getStageColor(deal.stage);
  const targetDate = deal.targetCloseDate ? new Date(deal.targetCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const daysInStage = getDaysInStage(deal.createdAt);
  const fullName = `${deal.customerFirstName} ${deal.customerLastName}`;
  const initials = getInitials(deal.customerFirstName, deal.customerLastName);
  const avatarColor = getInitialColor(fullName);

  return (
    <Card data-testid={`card-deal-${deal.id}`} className="overflow-hidden hover:shadow-md transition-shadow">
      <Link href={`/admin/deals/${deal.id}`} data-testid={`link-deal-${deal.id}`}>
        <div className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{deal.loanNumber || deal.projectNumber || `#${deal.id}`}</span>
              <Badge variant="outline" className="text-xs">{getLoanTypeLabel(deal.loanData?.loanType)}</Badge>
              <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />{daysInStage}d</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-8 w-8 rounded-full ${avatarColor} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white text-xs font-semibold">{initials}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{fullName}</h3>
              {deal.customerEmail && <p className="text-xs text-muted-foreground truncate">{deal.customerEmail}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate text-xs">{deal.propertyAddress}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-bold">{deal.loanData?.loanAmount ? formatCurrency(deal.loanData.loanAmount) : '—'}</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stageColor }} />
              <span className="text-xs font-medium" style={{ color: stageColor }}>{getStageLabel(deal.stage, stageStats)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: getProgressColor(progress) }} />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{progress}%</span>
          </div>
          {targetDate && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
              <Calendar className="h-3 w-3" />
              <span>Target: {targetDate}</span>
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

const ITEMS_PER_PAGE = 10;

export default function AdminDeals({ embedded = false }: { embedded?: boolean }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("list");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount-high" | "amount-low">("newest");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<"all" | "new" | "processing" | "attention">("all");
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

  const { data: partnersData } = useQuery<{ partners: { id: number; name: string; companyName: string | null }[] }>({
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
      const res = await fetch(`/api/admin/deals?${params.toString()}`, { credentials: "include" });
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
        customerFirstName: "", customerLastName: "", borrowerEmail: "", borrowerPhone: "",
        propertyAddress: "", loanAmount: "", propertyValue: "", interestRate: "",
        loanType: "", programId: "", propertyType: "", stage: "initial-review",
        partnerId: "", partnerName: "", loanPurpose: "purchase", targetCloseDate: "",
      });
      setPartnerInputMode("select");
      toast({ title: "Deal created", description: "The deal has been added to the pipeline." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create deal.", variant: "destructive" });
    },
  });

  const handleCreateDeal = () => {
    if (!newDeal.programId) {
      toast({ title: "Missing loan program", description: "Please select a loan program first.", variant: "destructive" });
      return;
    }
    if (!newDeal.customerFirstName || !newDeal.customerLastName) {
      toast({ title: "Missing borrower name", description: "Please enter the borrower's first and last name.", variant: "destructive" });
      return;
    }
    if (!newDeal.propertyAddress) {
      toast({ title: "Missing property address", description: "Please enter the property address.", variant: "destructive" });
      return;
    }
    if (!newDeal.loanAmount) {
      toast({ title: "Missing loan amount", description: "Please enter the requested loan amount.", variant: "destructive" });
      return;
    }
    createDealMutation.mutate(newDeal);
  };

  const stats = data?.stats;
  const rawDeals = data?.deals || [];

  const isNewStage = (stage: string) => {
    const s = stage?.toLowerCase() || '';
    return s.includes('new') || s.includes('lead') || s.includes('initial') || s.includes('intake') || s.includes('documentation');
  };
  const isProcessingStage = (stage: string) => {
    const s = stage?.toLowerCase() || '';
    return s.includes('processing') || s.includes('underwriting') || s.includes('review') || s.includes('appraisal') || s.includes('closing');
  };
  const isAttentionStage = (stage: string) => {
    const s = stage?.toLowerCase() || '';
    return s.includes('risk') || s.includes('stall') || s.includes('overdue');
  };

  const newCount = rawDeals.filter(d => isNewStage(d.stage)).length;
  const processingCount = rawDeals.filter(d => isProcessingStage(d.stage)).length;
  const attentionCount = rawDeals.filter(d => isAttentionStage(d.stage)).length;

  const filteredByStatus = rawDeals.filter(d => {
    if (activeFilter === 'new') return isNewStage(d.stage);
    if (activeFilter === 'processing') return isProcessingStage(d.stage);
    if (activeFilter === 'attention') return isAttentionStage(d.stage);
    return true;
  });

  const deals = [...filteredByStatus].sort((a, b) => {
    switch (sortBy) {
      case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "amount-high": return (b.loanData?.loanAmount || 0) - (a.loanData?.loanAmount || 0);
      case "amount-low": return (a.loanData?.loanAmount || 0) - (b.loanData?.loanAmount || 0);
      default: return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil(deals.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDeals = deals.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const totalVolume = rawDeals.reduce((sum, d) => sum + (d.loanData?.loanAmount || 0), 0);

  const filterCards = [
    {
      key: "all" as const,
      count: rawDeals.length,
      label: "All Deals",
      icon: <FileText className="h-5 w-5" />,
      color: "border-primary bg-primary/5 text-primary",
      activeColor: "border-primary bg-primary text-white",
    },
    {
      key: "new" as const,
      count: newCount,
      label: "New / Intake",
      icon: <Inbox className="h-5 w-5" />,
      color: "border-indigo-200 bg-indigo-50 text-indigo-700",
      activeColor: "border-indigo-500 bg-indigo-500 text-white",
    },
    {
      key: "processing" as const,
      count: processingCount,
      label: "In Processing",
      icon: <Filter className="h-5 w-5" />,
      color: "border-amber-200 bg-amber-50 text-amber-700",
      activeColor: "border-amber-500 bg-amber-500 text-white",
    },
    {
      key: "attention" as const,
      count: attentionCount,
      label: "Needs Attention",
      icon: <AlertTriangle className="h-5 w-5" />,
      color: "border-red-200 bg-red-50 text-red-700",
      activeColor: "border-red-500 bg-red-500 text-white",
    },
  ];

  return (
    <div className={embedded ? "space-y-5" : "p-6 space-y-5"}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Loan Pipeline</h1>
            <p className="text-muted-foreground text-sm">{rawDeals.length} active deals &middot; {formatCurrency(totalVolume)} total volume</p>
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
                <DialogDescription>Select a loan program and fill in the deal details</DialogDescription>
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
                    <SelectTrigger data-testid="select-loan-program"><SelectValue placeholder="Choose a loan program..." /></SelectTrigger>
                    <SelectContent>
                      {programsData?.programs?.filter(p => p.isActive).map((program) => (
                        <SelectItem key={program.id} value={String(program.id)}>{program.name}</SelectItem>
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
                    <Input id="firstName" value={newDeal.customerFirstName} onChange={(e) => setNewDeal({ ...newDeal, customerFirstName: e.target.value })} placeholder="John" data-testid="input-first-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input id="lastName" value={newDeal.customerLastName} onChange={(e) => setNewDeal({ ...newDeal, customerLastName: e.target.value })} placeholder="Smith" data-testid="input-last-name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="borrowerEmail">Email</Label>
                    <Input id="borrowerEmail" type="email" value={newDeal.borrowerEmail} onChange={(e) => setNewDeal({ ...newDeal, borrowerEmail: e.target.value })} placeholder="john@example.com" data-testid="input-borrower-email" />
                    {getEmailError(newDeal.borrowerEmail) && <p className="text-xs text-destructive mt-1">{getEmailError(newDeal.borrowerEmail)}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="borrowerPhone">Phone</Label>
                    <Input id="borrowerPhone" type="tel" value={newDeal.borrowerPhone} onChange={(e) => setNewDeal({ ...newDeal, borrowerPhone: formatPhoneNumber(e.target.value) })} placeholder="(555) 123-4567" data-testid="input-borrower-phone" />
                    {getPhoneError(newDeal.borrowerPhone) && <p className="text-xs text-destructive mt-1">{getPhoneError(newDeal.borrowerPhone)}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Property Address *</Label>
                  <AddressAutocomplete id="address" value={newDeal.propertyAddress} onChange={(address) => setNewDeal({ ...newDeal, propertyAddress: address })} placeholder="Start typing an address..." data-testid="input-property-address" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="propertyType">Property Type</Label>
                    <Select value={newDeal.propertyType} onValueChange={(value) => setNewDeal({ ...newDeal, propertyType: value })}>
                      <SelectTrigger data-testid="select-property-type"><SelectValue placeholder="Select property type" /></SelectTrigger>
                      <SelectContent>
                        {availablePropertyTypes.map((pt) => (
                          <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loanPurpose">Loan Purpose</Label>
                    <Select value={newDeal.loanPurpose} onValueChange={(value) => setNewDeal({ ...newDeal, loanPurpose: value })}>
                      <SelectTrigger data-testid="select-loan-purpose"><SelectValue /></SelectTrigger>
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
                    <Input id="loanAmount" type="number" value={newDeal.loanAmount} onChange={(e) => setNewDeal({ ...newDeal, loanAmount: e.target.value })} placeholder="680000" data-testid="input-loan-amount" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="propertyValue">Property Value</Label>
                    <Input id="propertyValue" type="number" value={newDeal.propertyValue} onChange={(e) => setNewDeal({ ...newDeal, propertyValue: e.target.value })} placeholder="850000" data-testid="input-property-value" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="interestRate">Interest Rate</Label>
                    <Input id="interestRate" value={newDeal.interestRate} onChange={(e) => setNewDeal({ ...newDeal, interestRate: e.target.value })} placeholder="11.5" data-testid="input-interest-rate" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetCloseDate">Target Close Date</Label>
                    <Input id="targetCloseDate" type="date" value={newDeal.targetCloseDate} onChange={(e) => setNewDeal({ ...newDeal, targetCloseDate: e.target.value })} data-testid="input-target-close-date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label htmlFor="partner">Partner / Broker</Label>
                    <Button variant="ghost" size="sm" type="button" onClick={() => { setPartnerInputMode(partnerInputMode === "select" ? "manual" : "select"); setNewDeal({ ...newDeal, partnerId: "", partnerName: "" }); }} data-testid="button-toggle-partner-mode">
                      {partnerInputMode === "select" ? "Type manually" : "Select from list"}
                    </Button>
                  </div>
                  {partnerInputMode === "select" ? (
                    <Select value={newDeal.partnerId || "none"} onValueChange={(value) => setNewDeal({ ...newDeal, partnerId: value === "none" ? "" : value, partnerName: "" })}>
                      <SelectTrigger data-testid="select-partner"><SelectValue placeholder="Select a partner (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {partnersData?.partners?.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id.toString()}>{partner.name}{partner.companyName ? ` (${partner.companyName})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id="partnerName" value={newDeal.partnerName} onChange={(e) => setNewDeal({ ...newDeal, partnerName: e.target.value, partnerId: "" })} placeholder="Enter partner name manually" data-testid="input-partner-name" />
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel">Cancel</Button>
                <Button onClick={handleCreateDeal} disabled={createDealMutation.isPending} data-testid="button-create-deal">
                  {createDealMutation.isPending ? "Creating..." : "Create Deal"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {filterCards.map((card) => (
            <button
              key={card.key}
              onClick={() => { setActiveFilter(card.key); setCurrentPage(1); }}
              className={`rounded-xl border-2 p-4 text-left transition-all ${activeFilter === card.key ? card.activeColor : card.color} hover:shadow-md`}
              data-testid={`filter-card-${card.key}`}
            >
              <div className="flex items-center gap-3">
                <div className="opacity-80">{card.icon}</div>
                <div>
                  <div className="text-2xl font-bold leading-none">{card.count}</div>
                  <div className="text-xs mt-1 opacity-80">{card.label}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by borrower, address, or loan #..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              data-testid="input-search-deals"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[160px]" data-testid="select-sort-deals">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="amount-high">Amount: High to Low</SelectItem>
              <SelectItem value="amount-low">Amount: Low to High</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
            {([
              { mode: "list" as const, icon: List },
              { mode: "grid" as const, icon: LayoutGrid },
              { mode: "kanban" as const, icon: Columns3 },
            ]).map(({ mode, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-1.5 rounded-md transition-colors ${viewMode === mode ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                data-testid={`btn-view-${mode}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : deals.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-medium">No deals found</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchTerm || activeFilter !== 'all' ? "Try adjusting your search or filter" : "Get started by adding your first deal"}
              </p>
            </div>
            {!searchTerm && activeFilter === 'all' && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Your First Deal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "kanban" ? (
        <DealsKanbanView />
      ) : viewMode === "grid" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedDeals.map((deal) => (
              <DealExpandedCard key={deal.id} deal={deal} stageStats={data?.stats?.stageStats} />
            ))}
          </div>
          {totalPages > 1 && (
            <PaginationBar
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={deals.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      ) : (
        <>
          <Card className="overflow-hidden border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[100px]">Loan #</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Borrower</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Property</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Program</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Amount</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[140px]">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDeals.map((deal) => {
                    const isExpanded = expandedDealId === deal.id;
                    const fullName = `${deal.customerFirstName} ${deal.customerLastName}`;
                    const initials = getInitials(deal.customerFirstName, deal.customerLastName);
                    const avatarColor = getInitialColor(fullName);
                    const progress = deal.progressPercentage || 0;
                    const stageColor = getStageColor(deal.stage);
                    const progressColor = getProgressColor(progress);

                    return (
                      <Fragment key={deal.id}>
                        <TableRow
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50/50' : 'hover:bg-slate-50/30'}`}
                          onClick={() => setExpandedDealId(isExpanded ? null : deal.id)}
                          data-testid={`row-deal-${deal.id}`}
                        >
                          <TableCell>
                            <span className="font-mono text-sm text-primary font-medium" data-testid={`link-deal-row-${deal.id}`}>
                              {deal.loanNumber || deal.projectNumber || `#${deal.id}`}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className={`h-8 w-8 rounded-full ${avatarColor} flex items-center justify-center flex-shrink-0`}>
                                <span className="text-white text-[11px] font-semibold">{initials}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{fullName}</div>
                                {deal.customerEmail && (
                                  <div className="text-xs text-muted-foreground truncate max-w-[180px]">{deal.customerEmail}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm truncate block max-w-[200px]">{deal.propertyAddress}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{deal.programName || getLoanTypeLabel(deal.loanData?.loanType)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-semibold">
                              {deal.loanData?.loanAmount ? formatCurrencyFull(deal.loanData.loanAmount) : '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stageColor }} />
                              <span className="text-sm font-medium whitespace-nowrap" style={{ color: stageColor }}>
                                {getStageLabel(deal.stage, data?.stats?.stageStats)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden min-w-[60px]">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${progress}%`, backgroundColor: progressColor }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-8 text-right">{progress}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <ExpandedDealRow key={`expanded-${deal.id}`} deal={deal} stageStats={data?.stats?.stageStats} />
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
          {totalPages > 1 && (
            <PaginationBar
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={deals.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}
    </div>
  );
}

function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}) {
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  const pages: (number | 'ellipsis')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-sm text-muted-foreground">
        Showing {start}–{end} of {totalItems} deals
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          data-testid="button-prev-page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((page, idx) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground text-sm">&hellip;</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${
                page === currentPage
                  ? 'bg-primary text-white'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
              data-testid={`button-page-${page}`}
            >
              {page}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          data-testid="button-next-page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

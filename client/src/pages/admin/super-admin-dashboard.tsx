import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Globe,
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  Settings,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Zap,
  FileText,
  Sparkles,
  Target,
  Phone,
  Mail,
  Brain,
  RefreshCw,
  MapPin,
  Plug,
  XCircle,
  Loader2,
} from "lucide-react";
import { safeFormat, safeRelativeTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PlatformOverviewStats {
  totalLenderAccounts: number;
  totalBrokers: number;
  totalBorrowers: number;
  totalDeals: number;
  totalLoanVolume: number;
}

interface LenderAccount {
  id: number;
  companyName: string;
  adminName: string;
  adminEmail: string;
  teamMembersCount: number;
  activeDealsCount: number;
  totalLoanVolume: number;
  programCount: number;
  isActive: boolean;
  createdAt: string;
}

interface RecentSignup {
  id: number;
  email: string;
  fullName: string | null;
  role: string;
  userType: string;
  companyName: string | null;
  createdAt: string;
}

interface DashboardData {
  stats: PlatformOverviewStats;
  lenderAccounts: LenderAccount[];
  recentSignups: RecentSignup[];
  platformSettings: {
    aiAgentsEnabled: boolean;
    commercialLendingEnabled: boolean;
    documentTemplatesEnabled: boolean;
    smartProspectingEnabled: boolean;
  };
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
}: {
  title: string;
  value: number | string;
  icon: any;
  description?: string;
  trend?: string;
}) {
  return (
    <Card className="hover:shadow-lg transition-all duration-200">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="rounded-full bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1.5 pt-1">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-medium text-success">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LenderAccountsTable({ accounts }: { accounts: LenderAccount[] }) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filtered = accounts.filter((a) => {
    const matchesSearch = !search || 
      (a.companyName || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.adminName || "").toLowerCase().includes(search.toLowerCase()) ||
      a.adminEmail.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" ? a.isActive : !a.isActive);
    return matchesSearch && matchesStatus;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Lender Accounts
            </CardTitle>
            <CardDescription>
              All lender organizations on the platform
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <Button
                variant={statusFilter === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("all")}
                data-testid="filter-all"
              >
                All ({accounts.length})
              </Button>
              <Button
                variant={statusFilter === "active" ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("active")}
                data-testid="filter-active"
              >
                Active ({accounts.filter(a => a.isActive).length})
              </Button>
              <Button
                variant={statusFilter === "inactive" ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter("inactive")}
                data-testid="filter-inactive"
              >
                Inactive ({accounts.filter(a => !a.isActive).length})
              </Button>
            </div>
            <input
              type="text"
              placeholder="Search lenders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-56 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-search-lenders"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{accounts.length === 0 ? "No lender accounts yet" : "No matching lender accounts"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Admin Name</TableHead>
                  <TableHead>Admin Email</TableHead>
                  <TableHead className="text-right">Team Members</TableHead>
                  <TableHead className="text-right">Active Deals</TableHead>
                  <TableHead className="text-right">Programs</TableHead>
                  <TableHead className="text-right">Loan Volume</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      {account.companyName}
                    </TableCell>
                    <TableCell>{account.adminName || "—"}</TableCell>
                    <TableCell className="text-xs">{account.adminEmail}</TableCell>
                    <TableCell className="text-right">
                      {account.teamMembersCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {account.activeDealsCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {account.programCount}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(account.totalLoanVolume)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={account.isActive ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {safeFormat(account.createdAt, "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`btn-manage-tenant-${account.id}`}
                        onClick={() => setLocation(`/admin/platform/tenants/${account.id}`)}
                      >
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeatureFlagsCard({
  settings,
  onUpdate,
}: {
  settings: DashboardData["platformSettings"];
  onUpdate: (key: string, value: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Platform Feature Flags
        </CardTitle>
        <CardDescription>
          Control platform-wide feature availability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <Label htmlFor="ai-agents" className="text-base font-medium">
                AI Agents Enabled
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Enable AI agent features for lenders
              </p>
            </div>
          </div>
          <Switch
            id="ai-agents"
            checked={settings.aiAgentsEnabled}
            onCheckedChange={(checked) =>
              onUpdate("aiAgentsEnabled", checked)
            }
          />
        </div>

        <div className="border-t" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <Label htmlFor="commercial" className="text-base font-medium">
                Commercial Lending Enabled
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Enable commercial loan processing
              </p>
            </div>
          </div>
          <Switch
            id="commercial"
            checked={settings.commercialLendingEnabled}
            onCheckedChange={(checked) =>
              onUpdate("commercialLendingEnabled", checked)
            }
          />
        </div>

        <div className="border-t" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <Label htmlFor="templates" className="text-base font-medium">
                Document Templates Enabled
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Enable document template functionality
              </p>
            </div>
          </div>
          <Switch
            id="templates"
            checked={settings.documentTemplatesEnabled}
            onCheckedChange={(checked) =>
              onUpdate("documentTemplatesEnabled", checked)
            }
          />
        </div>

        <div className="border-t" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-primary" />
            <div>
              <Label htmlFor="prospecting" className="text-base font-medium">
                Smart Prospecting Enabled
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Enable smart prospecting tools
              </p>
            </div>
          </div>
          <Switch
            id="prospecting"
            checked={settings.smartProspectingEnabled}
            onCheckedChange={(checked) =>
              onUpdate("smartProspectingEnabled", checked)
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformIntegrationsCard() {
  const { data: integrationsData, isLoading } = useQuery<{ integrations: Record<string, any> }>({
    queryKey: ['/api/admin/integrations/status'],
  });

  const integrations = [
    { key: 'twilio', label: 'Twilio SMS', icon: Phone, description: 'SMS notifications and communication' },
    { key: 'resend', label: 'Resend Email', icon: Mail, description: 'Transactional email delivery' },
    { key: 'openai', label: 'OpenAI', icon: Brain, description: 'AI-powered document review and agents' },
    { key: 'apify', label: 'Apify', icon: RefreshCw, description: 'Web scraping and data enrichment' },
    { key: 'geoapify', label: 'Geoapify', icon: MapPin, description: 'Property location and geocoding' },
    { key: 'pandadoc', label: 'PandaDoc', icon: FileText, description: 'Document signing and templates' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          Platform Integrations
        </CardTitle>
        <CardDescription>
          External services powering the platform. These are configured at the platform level — lenders do not manage these.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-3 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking integration status...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {integrations.map((integration) => {
              const IntIcon = integration.icon;
              const status = integrationsData?.integrations?.[integration.key];
              const isConnected = status?.connected === true;
              return (
                <div
                  key={integration.key}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-md"
                >
                  <IntIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{integration.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{integration.description}</p>
                  </div>
                  {isConnected ? (
                    <Badge variant="default">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-4">
          Configure API keys via environment variables or Replit Connectors.
        </p>
      </CardContent>
    </Card>
  );
}

function RecentActivityFeed({ signups }: { signups: RecentSignup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Signups
        </CardTitle>
        <CardDescription>Last 10 user registrations</CardDescription>
      </CardHeader>
      <CardContent>
        {signups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No recent signups</p>
          </div>
        ) : (
          <div className="space-y-0">
            {signups.map((signup, index) => (
              <div
                key={signup.id}
                className={`flex items-start gap-3 py-3 px-3 hover:bg-muted/50 transition-colors ${
                  index !== signups.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {signup.fullName
                    ? signup.fullName.charAt(0).toUpperCase()
                    : "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {signup.fullName || signup.email}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {signup.userType}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {signup.role}
                    </Badge>
                    {signup.companyName && (
                      <span className="text-xs text-muted-foreground">
                        {signup.companyName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {safeRelativeTime(signup.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/super-admin/dashboard"],
  });

  const handleFeatureFlagUpdate = async (key: string, value: boolean) => {
    try {
      await apiRequest("PATCH", "/api/super-admin/settings", {
        [key]: value,
      });

      toast({
        title: "Success",
        description: `Feature flag updated successfully`,
      });

      queryClient.invalidateQueries({
        queryKey: ["/api/super-admin/dashboard"],
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.message || "Failed to update feature flag",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Super Admin Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Super Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform overview and management
          </p>
        </div>
      </div>

      {/* Platform Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Lender Accounts"
          value={stats?.totalLenderAccounts || 0}
          icon={Building2}
          description="Active lender organizations"
        />
        <StatCard
          title="Brokers"
          value={stats?.totalBrokers || 0}
          icon={Users}
          description="Broker users"
        />
        <StatCard
          title="Borrowers"
          value={stats?.totalBorrowers || 0}
          icon={Users}
          description="Borrower users"
        />
        <StatCard
          title="Total Deals"
          value={stats?.totalDeals || 0}
          icon={TrendingUp}
          description="All deals on platform"
        />
        <StatCard
          title="Loan Volume"
          value={formatCurrency(stats?.totalLoanVolume || 0)}
          icon={DollarSign}
          description="Total loan amount"
        />
      </div>

      {/* Lender Accounts Table */}
      {data && <LenderAccountsTable accounts={data.lenderAccounts} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feature Flags */}
        {data && (
          <div className="lg:col-span-2">
            <FeatureFlagsCard
              settings={data.platformSettings}
              onUpdate={handleFeatureFlagUpdate}
            />
          </div>
        )}

        {/* Recent Activity Feed */}
        {data && (
          <RecentActivityFeed signups={data.recentSignups} />
        )}
      </div>

      {/* Platform Integrations — super admin only */}
      <PlatformIntegrationsCard />
    </div>
  );
}

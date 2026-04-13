import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Building2,
  Users,
  FileText,
  Settings,
  DollarSign,
  Shield,
  UserCheck,
  UserX,
  Key,
  BarChart3,
  Calendar,
  Mail,
  Phone,
  Briefcase,
  Loader2,
} from "lucide-react";
import { safeFormat } from "@/lib/utils";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

interface TenantData {
  tenant: {
    id: number;
    email: string;
    fullName: string | null;
    companyName: string | null;
    phone: string | null;
    isActive: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    onboardingCompleted: boolean;
  };
  teamMembers: Array<{
    id: number;
    email: string;
    fullName: string | null;
    role: string;
    userType: string | null;
    isActive: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    inviteStatus: string | null;
  }>;
  deals: Array<{
    id: number;
    projectName: string;
    loanNumber: string | null;
    borrowerName: string | null;
    borrowerEmail: string | null;
    loanAmount: number | null;
    status: string;
    currentStage: string | null;
    createdAt: string;
    lastUpdated: string;
  }>;
  programs: Array<{
    id: number;
    name: string;
    loanType: string | null;
    isActive: boolean;
    createdAt: string;
  }>;
  settings: Array<{
    id: number;
    settingKey: string;
    settingValue: string;
  }>;
  dealStats: {
    total: number;
    active: number;
    funded: number;
    closed: number;
    totalVolume: number;
  };
}

export default function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [resetPasswordDialog, setResetPasswordDialog] = useState<{ userId: number; userName: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading, error } = useQuery<TenantData>({
    queryKey: ["/api/super-admin/tenants", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tenant");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const toggleTenantMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      return apiRequest("PATCH", `/api/super-admin/tenants/${tenantId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/dashboard"] });
      toast({ title: "Tenant updated" });
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/super-admin/tenants/${tenantId}/users/${userId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants", tenantId] });
      toast({ title: "User updated" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      return apiRequest("POST", `/api/super-admin/tenants/${tenantId}/reset-password`, { userId, newPassword });
    },
    onSuccess: () => {
      setResetPasswordDialog(null);
      setNewPassword("");
      toast({ title: "Password reset successfully" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => setLocation("/admin/platform")} data-testid="btn-back-platform">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Platform
        </Button>
        <Card className="mt-4">
          <CardContent className="py-8 text-center text-muted-foreground">
            Tenant not found or failed to load.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { tenant, teamMembers, deals, programs, settings, dealStats } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/platform")} data-testid="btn-back-platform">
            <ArrowLeft className="h-4 w-4 mr-2" /> Platform
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-tenant-name">
              <Building2 className="h-6 w-6" />
              {tenant.companyName || tenant.fullName || tenant.email}
            </h1>
            <p className="text-sm text-muted-foreground">{tenant.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={tenant.isActive ? "default" : "secondary"} data-testid="badge-tenant-status">
            {tenant.isActive ? "Active" : "Disabled"}
          </Badge>
          <Button
            variant={tenant.isActive ? "destructive" : "default"}
            size="sm"
            data-testid="btn-toggle-tenant"
            onClick={() => toggleTenantMutation.mutate(!tenant.isActive)}
            disabled={toggleTenantMutation.isPending}
          >
            {toggleTenantMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : tenant.isActive ? (
              <UserX className="h-4 w-4 mr-2" />
            ) : (
              <UserCheck className="h-4 w-4 mr-2" />
            )}
            {tenant.isActive ? "Disable Account" : "Enable Account"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Total Deals</div>
            <div className="text-2xl font-bold" data-testid="stat-total-deals">{dealStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Active Deals</div>
            <div className="text-2xl font-bold text-green-600" data-testid="stat-active-deals">{dealStats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Funded</div>
            <div className="text-2xl font-bold text-blue-600" data-testid="stat-funded">{dealStats.funded}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Total Volume</div>
            <div className="text-xl font-bold" data-testid="stat-volume">{formatCurrency(dealStats.totalVolume)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Team Size</div>
            <div className="text-2xl font-bold" data-testid="stat-team">{teamMembers.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-1.5" /> Users ({teamMembers.length})
          </TabsTrigger>
          <TabsTrigger value="deals" data-testid="tab-deals">
            <Briefcase className="h-4 w-4 mr-1.5" /> Deals ({deals.length})
          </TabsTrigger>
          <TabsTrigger value="programs" data-testid="tab-programs">
            <FileText className="h-4 w-4 mr-1.5" /> Programs ({programs.length})
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="h-4 w-4 mr-1.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Company Name</span>
                  <span className="font-medium">{tenant.companyName || "Not set"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Admin Name</span>
                  <span className="font-medium">{tenant.fullName || "Not set"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>
                  <span className="font-medium">{tenant.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</span>
                  <span className="font-medium">{tenant.phone || "Not set"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined</span>
                  <span className="font-medium">{safeFormat(tenant.createdAt, "MMM d, yyyy", "Unknown")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Login</span>
                  <span className="font-medium">{safeFormat(tenant.lastLoginAt, "MMM d, yyyy h:mm a", "Never")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Onboarding</span>
                  <Badge variant={tenant.onboardingCompleted ? "default" : "secondary"} className="text-xs">
                    {tenant.onboardingCompleted ? "Completed" : "In Progress"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Loan Programs</span>
                  <span className="font-bold">{programs.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Active Programs</span>
                  <span className="font-bold text-green-600">{programs.filter(p => p.isActive).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Deals</span>
                  <span className="font-bold">{dealStats.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pipeline Value</span>
                  <span className="font-bold">{formatCurrency(deals.filter(d => d.status === "active").reduce((sum, d) => sum + (d.loanAmount || 0), 0))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Custom Settings</span>
                  <span className="font-bold">{settings.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" /> Team Members
              </CardTitle>
              <CardDescription>All users belonging to this tenant</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id} data-testid={`row-user-${member.id}`}>
                      <TableCell className="font-medium">{member.fullName || "—"}</TableCell>
                      <TableCell className="text-sm">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {member.inviteStatus === "owner" ? "Owner" : member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.isActive ? "default" : "secondary"} className="text-xs">
                          {member.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {safeFormat(member.lastLoginAt, "MMM d, yyyy", "Never")}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`btn-toggle-user-${member.id}`}
                          onClick={() => toggleUserMutation.mutate({ userId: member.id, isActive: !member.isActive })}
                          disabled={toggleUserMutation.isPending}
                        >
                          {member.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`btn-reset-password-${member.id}`}
                          onClick={() => setResetPasswordDialog({ userId: member.id, userName: member.fullName || member.email })}
                        >
                          <Key className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deals">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-5 w-5" /> Deals
              </CardTitle>
              <CardDescription>All deals belonging to this tenant</CardDescription>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No deals yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan #</TableHead>
                      <TableHead>Deal Name</TableHead>
                      <TableHead>Borrower</TableHead>
                      <TableHead className="text-right">Loan Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals.map((deal) => (
                      <TableRow key={deal.id} data-testid={`row-deal-${deal.id}`}>
                        <TableCell className="font-mono text-xs">{deal.loanNumber || `DEAL-${deal.id}`}</TableCell>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">{deal.projectName}</TableCell>
                        <TableCell className="text-sm">{deal.borrowerName || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{deal.loanAmount ? formatCurrency(deal.loanAmount) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={deal.status === "active" ? "default" : "secondary"} className="text-xs capitalize">
                            {deal.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground capitalize">{deal.currentStage || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {safeFormat(deal.createdAt, "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="programs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5" /> Loan Programs
              </CardTitle>
              <CardDescription>Loan programs created by this tenant</CardDescription>
            </CardHeader>
            <CardContent>
              {programs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No loan programs yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program Name</TableHead>
                      <TableHead>Loan Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {programs.map((program) => (
                      <TableRow key={program.id} data-testid={`row-program-${program.id}`}>
                        <TableCell className="font-medium">{program.name}</TableCell>
                        <TableCell className="capitalize text-sm">{program.loanType || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={program.isActive ? "default" : "secondary"} className="text-xs">
                            {program.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {safeFormat(program.createdAt, "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-5 w-5" /> Tenant Settings
              </CardTitle>
              <CardDescription>Configuration settings for this tenant</CardDescription>
            </CardHeader>
            <CardContent>
              {settings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No custom settings configured</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Setting Key</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.map((setting) => (
                      <TableRow key={setting.id}>
                        <TableCell className="font-mono text-sm">{setting.settingKey}</TableCell>
                        <TableCell className="text-sm max-w-[400px] truncate">
                          {setting.settingValue.length > 100
                            ? setting.settingValue.substring(0, 100) + "..."
                            : setting.settingValue}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!resetPasswordDialog} onOpenChange={() => { setResetPasswordDialog(null); setNewPassword(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPasswordDialog?.userName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                data-testid="input-new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetPasswordDialog(null); setNewPassword(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (resetPasswordDialog && newPassword.length >= 6) {
                  resetPasswordMutation.mutate({ userId: resetPasswordDialog.userId, newPassword });
                }
              }}
              disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
              data-testid="btn-confirm-reset"
            >
              {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

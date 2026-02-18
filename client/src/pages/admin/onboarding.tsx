import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ProgramCreationWizard } from '@/components/onboarding/ProgramCreationWizard';
import { useAuth } from '@/hooks/use-auth';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  Video,
  ExternalLink,
  Shield,
  Users,
  Loader2,
  CheckCircle2,
  Clock,
  BookOpen,
  Mail,
  Layers,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Settings,
  ListChecks,
  Workflow,
  Bot,
  Send,
  Bell,
  ArrowRight,
  Check,
  Building2,
  Plug,
  AlertCircle,
  HardDrive,
  FolderOpen,
  UserPlus,
  Save,
  AlertTriangle,
  X,
} from 'lucide-react';
import { PERMISSION_CATEGORIES, SCOPABLE_PERMISSIONS, type PermissionKey } from '@shared/schema';
import { Skeleton } from '@/components/ui/skeleton';

interface OnboardingDocument {
  id: number;
  type: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  externalUrl: string | null;
  thumbnailUrl: string | null;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
  targetUserType: string;
  createdAt: string;
}

interface OnboardingUser {
  id: number;
  email: string;
  fullName: string | null;
  userType: string;
  onboardingCompleted: boolean;
  partnershipAgreementSignedAt: string | null;
  trainingCompletedAt: string | null;
  createdAt: string;
}

const documentTypeLabels: Record<string, { label: string; icon: typeof FileText }> = {
  'partnership_agreement': { label: 'Partnership Agreement', icon: Shield },
  'training_doc': { label: 'Training Document', icon: FileText },
  'training_video': { label: 'Training Video', icon: Video },
  'training_link': { label: 'Training Link', icon: ExternalLink },
};

const GUIDE_STEPS = [
  { id: 1, label: 'Company Profile', icon: Building2 },
  { id: 2, label: 'Integrations', icon: Plug },
  { id: 3, label: 'Loan Programs', icon: Layers },
  { id: 4, label: 'Communications & AI', icon: MessageSquare },
  { id: 5, label: 'Team Setup', icon: Users },
  { id: 6, label: 'Role Permissions', icon: Shield },
];

export default function AdminOnboarding() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>('guide');
  const initialStep = (() => {
    const params = new URLSearchParams(window.location.search);
    const s = parseInt(params.get('step') || '1', 10);
    return s >= 1 && s <= 6 ? s : 1;
  })();
  const [currentStep, setCurrentStep] = useState(initialStep);

  const { data: googleStatusData, isLoading: googleStatusLoading } = useQuery<{
    connected: boolean;
    gmail: { connected: boolean; emailAddress: string | null; lastSyncAt: string | null; syncStatus: string | null };
    drive: { connected: boolean };
  }>({
    queryKey: ['/api/google/status'],
  });

  const { data: programsData, isLoading: programsLoading } = useQuery<{ programs: any[] }>({
    queryKey: ['/api/programs-with-pricing'],
  });

  const { data: teamData, isLoading: teamLoading } = useQuery<{ users: any[] }>({
    queryKey: ['/api/admin/users'],
  });

  const { data: integrationsData, isLoading: integrationsLoading } = useQuery<{ integrations: any }>({
    queryKey: ['/api/admin/integrations/status'],
  });

  const { data: settingsData, isLoading: settingsLoading } = useQuery<{ settings: any[] }>({
    queryKey: ['/api/admin/settings'],
  });

  const tenantConfig = useTenantConfig("tenant_branding", {
    companyName: "",
    supportEmail: "",
    emailSenderName: "",
  });

  const emailConnected = googleStatusData?.gmail?.connected || false;
  const resendConnected = integrationsData?.integrations?.resend?.connected || false;
  const hasPrograms = (programsData?.programs?.length || 0) > 0;

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/auth/complete-onboarding', {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: 'Setup complete', description: 'Welcome to the platform!' });
      setLocation('/admin/deals');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not complete setup. Please try again.', variant: 'destructive' });
    },
  });

  const handleNext = () => {
    if (currentStep < GUIDE_STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const driveFolderSetting = settingsData?.settings?.find((s: any) => s.settingKey === 'google_drive_parent_folder_id');

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-onboarding-title">Getting Started</h1>
          <p className="text-muted-foreground">
            Your step-by-step guide to setting up and using the platform
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="guide" className="flex items-center gap-2" data-testid="tab-onboarding-guide">
            <BookOpen className="h-4 w-4" />
            Setup Guide
          </TabsTrigger>
          <TabsTrigger value="materials" className="flex items-center gap-2" data-testid="tab-onboarding-materials">
            <FileText className="h-4 w-4" />
            Training Materials
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-onboarding-users">
            <Users className="h-4 w-4" />
            User Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guide">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-64 flex-shrink-0">
              <Card>
                <CardContent className="p-4 space-y-1">
                  {GUIDE_STEPS.map((step) => {
                    const StepIcon = step.icon;
                    const isActive = currentStep === step.id;
                    const isCompleted = currentStep > step.id;
                    return (
                      <button
                        key={step.id}
                        onClick={() => setCurrentStep(step.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover-elevate text-muted-foreground'
                        }`}
                        data-testid={`button-step-${step.id}`}
                      >
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCompleted
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : isActive
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {isCompleted ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <span className="text-sm font-medium">{step.id}</span>
                          )}
                        </div>
                        <span className="text-sm">{step.label}</span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="flex-1 min-w-0">
              {currentStep === 1 && (
                <StepCompanyProfile
                  userName={user?.fullName || user?.firstName || 'there'}
                  tenantConfig={tenantConfig}
                  onNext={handleNext}
                />
              )}
              {currentStep === 2 && (
                <StepIntegrations
                  driveFolderId={driveFolderSetting?.settingValue || ''}
                  isSettingsLoading={settingsLoading}
                  onNext={handleNext}
                  onBack={handleBack}
                />
              )}
              {currentStep === 3 && (
                <StepProgramsWorkflow
                  hasPrograms={hasPrograms}
                  programCount={programsData?.programs?.length || 0}
                  isLoading={programsLoading}
                  onNext={handleNext}
                  onBack={handleBack}
                  onNavigate={setLocation}
                />
              )}
              {currentStep === 4 && (
                <StepCommunicationsAI
                  emailConnected={emailConnected}
                  onNext={handleNext}
                  onBack={handleBack}
                  onNavigate={setLocation}
                />
              )}
              {currentStep === 5 && (
                <StepTeamSetup
                  teamData={teamData?.users || []}
                  isLoading={teamLoading}
                  emailConnected={resendConnected}
                  onNext={handleNext}
                  onBack={handleBack}
                  onNavigate={setLocation}
                />
              )}
              {currentStep === 6 && (
                <StepRolePermissions
                  onboardingCompleted={!!user?.onboardingCompleted}
                  onBack={handleBack}
                  onNavigate={setLocation}
                  onCompleteOnboarding={() => completeOnboardingMutation.mutate()}
                  isCompleting={completeOnboardingMutation.isPending}
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="materials">
          <MaterialsManagement />
        </TabsContent>

        <TabsContent value="users">
          <UsersStatus />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StepCompanyProfile({
  userName,
  tenantConfig,
  onNext,
}: {
  userName: string;
  tenantConfig: ReturnType<typeof useTenantConfig<{ companyName: string; supportEmail: string; emailSenderName: string }>>;
  onNext: () => void;
}) {
  const { config, updateField, save, isPending, hasChanges } = tenantConfig;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl" data-testid="text-welcome-title">Welcome, {userName}</CardTitle>
          <CardDescription>
            Let's get you set up. This guide will walk you through the key steps to start using the platform effectively.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-md p-4 space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              What we'll cover
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground ml-6">
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">1.</span>
                Set up your company profile and branding
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">2.</span>
                Invite your team and configure roles
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">3.</span>
                Connect integrations like Gmail, Google Drive, and external services
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">4.</span>
                Create your first loan program with stages, tasks, and document requirements
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground">5.</span>
                Learn how communications, notifications, and the AI assistant work
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Profile
            {config.companyName && (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" data-testid="icon-company-set" />
            )}
          </CardTitle>
          <CardDescription>
            Configure your company identity. This information is used across the platform for branding, emails, and documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="onboard-company-name">Company Name</Label>
            <Input
              id="onboard-company-name"
              value={config.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
              placeholder="Your Company Name"
              data-testid="input-onboard-company-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboard-support-email">Support Email</Label>
            <Input
              id="onboard-support-email"
              type="email"
              value={config.supportEmail}
              onChange={(e) => updateField("supportEmail", e.target.value)}
              placeholder="support@example.com"
              data-testid="input-onboard-support-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboard-sender-name">Email Sender Name</Label>
            <Input
              id="onboard-sender-name"
              value={config.emailSenderName}
              onChange={(e) => updateField("emailSenderName", e.target.value)}
              placeholder="Your Company"
              data-testid="input-onboard-sender-name"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-1">
          Skip for now
        </Button>
        <Button
          onClick={async () => {
            if (hasChanges) await save();
            onNext();
          }}
          disabled={isPending}
          data-testid="button-next-step-1"
        >
          {isPending ? 'Saving...' : 'Next: Integrations'}
          {!isPending && <ChevronRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function StepTeamSetup({
  teamData,
  isLoading,
  emailConnected,
  onNext,
  onBack,
  onNavigate,
}: {
  teamData: any[];
  isLoading: boolean;
  emailConnected: boolean;
  onNext: () => void;
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const { toast } = useToast();
  const [newMember, setNewMember] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'processor',
  });

  const { user: currentUser } = useAuth();

  // Only show lender's own team roles — exclude super_admin (platform-level only)
  const teamRoles = new Set(['processor', 'staff', 'admin']);
  const teamMembers = teamData.filter((u: any) => {
    if (u.role === 'super_admin') return false;
    if (u.isActive === false) return false;
    if (teamRoles.has(u.role)) return true;
    if (u.roles?.some((r: string) => teamRoles.has(r))) return true;
    return false;
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async (data: typeof newMember) => {
      const res = await apiRequest('POST', '/api/admin/invite-member', data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setNewMember({ firstName: '', lastName: '', email: '', role: 'processor' });
      toast({ 
        title: 'Invitation sent',
        description: data.emailSent ? 'An email invitation has been sent.' : 'Member created but email could not be sent.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to invite team member',
        description: error?.message || 'Please check the form and try again',
        variant: 'destructive',
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest('DELETE', `/api/admin/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'Team member removed' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to remove team member',
        description: error?.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!newMember.email || !newMember.firstName || !newMember.lastName) {
      toast({ title: 'First name, last name, and email are required', variant: 'destructive' });
      return;
    }
    inviteMemberMutation.mutate(newMember);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Your Team
          </CardTitle>
          <CardDescription>
            Invite team members to join your platform. They'll receive an email to set up their own password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!emailConnected && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md" data-testid="warning-email-not-configured">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Email delivery not configured</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Team invitations require the platform email service (Resend) to be configured by your system administrator. Invitations will be saved, but emails won't be sent until this is set up.
                </p>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading team members...</span>
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="bg-muted/50 rounded-md p-4 text-sm text-muted-foreground">
              No team members found yet. Add your first team member below.
            </div>
          ) : (
            <div className="space-y-2">
              {teamMembers.map((member: any) => {
                const isCurrentUser = member.id === currentUser?.id;
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-md group"
                    data-testid={`team-member-${member.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.fullName || 'No name'}
                        {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} data-testid={`badge-role-${member.id}`}>
                      {member.role}
                    </Badge>
                    {!isCurrentUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => removeMemberMutation.mutate(member.id)}
                        disabled={removeMemberMutation.isPending}
                        data-testid={`remove-member-${member.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2 text-sm">
              <UserPlus className="h-4 w-4 text-primary" />
              Add Team Member
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="team-add-firstname" className="text-xs">First Name</Label>
                <Input
                  id="team-add-firstname"
                  value={newMember.firstName}
                  onChange={(e) => setNewMember({ ...newMember, firstName: e.target.value })}
                  placeholder="Jane"
                  data-testid="input-team-add-firstname"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="team-add-lastname" className="text-xs">Last Name</Label>
                <Input
                  id="team-add-lastname"
                  value={newMember.lastName}
                  onChange={(e) => setNewMember({ ...newMember, lastName: e.target.value })}
                  placeholder="Smith"
                  data-testid="input-team-add-lastname"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="team-add-email" className="text-xs">Email</Label>
                <Input
                  id="team-add-email"
                  type="email"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  placeholder="jane@company.com"
                  data-testid="input-team-add-email"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="team-add-role" className="text-xs">Role</Label>
                <Select value={newMember.role} onValueChange={(val) => setNewMember({ ...newMember, role: val })}>
                  <SelectTrigger data-testid="select-team-add-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="processor">Processor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              An email invitation will be sent for them to set up their own password.
            </p>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={inviteMemberMutation.isPending}
              data-testid="button-add-team-member-inline"
            >
              {inviteMemberMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Invite...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Invite
                </>
              )}
            </Button>
          </div>

        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-5">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-5">
            Skip for now
          </Button>
          <Button onClick={onNext} data-testid="button-next-step-5">
            Next: Role Permissions
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepIntegrations({
  driveFolderId,
  isSettingsLoading,
  onNext,
  onBack,
}: {
  driveFolderId: string;
  isSettingsLoading: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [localDriveFolderId, setLocalDriveFolderId] = useState(driveFolderId);

  useEffect(() => {
    setLocalDriveFolderId(driveFolderId);
  }, [driveFolderId]);

  // Google status
  const { data: googleStatus, isLoading: isGoogleLoading } = useQuery<{
    connected: boolean;
    gmail: { connected: boolean; emailAddress: string | null; lastSyncAt: string | null; syncStatus: string | null };
    drive: { connected: boolean; folderId: string | null };
  }>({
    queryKey: ['/api/google/status'],
  });

  // Microsoft status
  const { data: msStatus, isLoading: isMsLoading } = useQuery<{
    connected: boolean;
    outlook: { connected: boolean; emailAddress: string | null; lastSyncAt: string | null; syncStatus: string | null };
    oneDrive: { connected: boolean };
  }>({
    queryKey: ['/api/microsoft/status'],
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/account"] });
      toast({ title: "Google Disconnected", description: "Gmail and Drive have been disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect Google.", variant: "destructive" });
    },
  });

  const disconnectMicrosoftMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/microsoft/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/microsoft/status"] });
      toast({ title: "Microsoft Disconnected", description: "Outlook and OneDrive have been disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect Microsoft.", variant: "destructive" });
    },
  });

  const saveDriveMutation = useMutation({
    mutationFn: async (folderId: string) => {
      return await apiRequest("PUT", "/api/admin/settings/google_drive_parent_folder_id", {
        value: folderId,
        description: "Google Drive parent folder ID",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      toast({ title: 'Google Drive folder ID saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save folder ID', variant: 'destructive' });
    },
  });

  const removeDriveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", "/api/admin/settings/google_drive_parent_folder_id");
    },
    onSuccess: () => {
      setLocalDriveFolderId('');
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google/status"] });
      toast({ title: 'Google Drive folder ID removed' });
    },
    onError: () => {
      toast({ title: 'Failed to remove folder ID', variant: 'destructive' });
    },
  });

  const [isEditingFolderId, setIsEditingFolderId] = useState(false);
  const savedFolderId = driveFolderId || googleStatus?.drive?.folderId || '';

  const isGoogleConnected = googleStatus?.connected || googleStatus?.gmail?.connected;
  const isMicrosoftConnected = msStatus?.connected || msStatus?.outlook?.connected || msStatus?.oneDrive?.connected;
  const hasAnyConnection = isGoogleConnected || isMicrosoftConnected;

  // Microsoft logo SVG paths
  const MicrosoftLogo = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 23 23" fill="none">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
      <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
    </svg>
  );

  // Google logo SVG paths
  const GoogleLogo = ({ className, fillColor }: { className?: string; fillColor?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill={fillColor || "#4285F4"}/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={fillColor || "#34A853"}/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={fillColor || "#FBBC05"}/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={fillColor || "#EA4335"}/>
    </svg>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Connect Your Accounts</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose your provider to connect email and document storage in one click. You only need one.
        </p>
      </div>

      {/* ===== Google Card ===== */}
      <Card className={isGoogleConnected ? 'border-green-200 dark:border-green-800' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GoogleLogo className="h-5 w-5" />
            Google
            {isGoogleConnected && (
              <Badge variant="default" className="ml-auto">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Gmail + Google Drive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isGoogleLoading ? (
            <div className="flex items-center gap-3 p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Checking...</span>
            </div>
          ) : isGoogleConnected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <Mail className="h-4 w-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Gmail</p>
                    <p className="text-xs text-muted-foreground truncate">{googleStatus?.gmail?.emailAddress || 'Connected'}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Google Drive</p>
                    <p className="text-xs text-muted-foreground">Document storage</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => disconnectGoogleMutation.mutate()}
                disabled={disconnectGoogleMutation.isPending}
                className="text-muted-foreground"
              >
                Disconnect Google
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => window.open('/api/google/connect?returnTo=' + encodeURIComponent('/admin/onboarding?step=2'), '_blank')}
              data-testid="button-connect-google-onboarding"
              className="gap-2 w-full"
              variant={isMicrosoftConnected ? 'outline' : 'default'}
            >
              <GoogleLogo className="h-4 w-4" fillColor="#fff" />
              Connect Google
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ===== Microsoft Card ===== */}
      <Card className={isMicrosoftConnected ? 'border-green-200 dark:border-green-800' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MicrosoftLogo className="h-5 w-5" />
            Microsoft
            {isMicrosoftConnected && (
              <Badge variant="default" className="ml-auto">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Outlook + OneDrive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isMsLoading ? (
            <div className="flex items-center gap-3 p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Checking...</span>
            </div>
          ) : isMicrosoftConnected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Outlook</p>
                    <p className="text-xs text-muted-foreground truncate">{msStatus?.outlook?.emailAddress || 'Connected'}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <FolderOpen className="h-4 w-4 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">OneDrive</p>
                    <p className="text-xs text-muted-foreground">Document storage</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => disconnectMicrosoftMutation.mutate()}
                disabled={disconnectMicrosoftMutation.isPending}
                className="text-muted-foreground"
              >
                Disconnect Microsoft
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => window.open('/api/microsoft/connect?returnTo=' + encodeURIComponent('/admin/onboarding?step=2'), '_blank')}
              data-testid="button-connect-microsoft-onboarding"
              className="gap-2 w-full"
              variant={isGoogleConnected ? 'outline' : 'default'}
            >
              <MicrosoftLogo className="h-4 w-4" />
              Connect Microsoft
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Drive Folder Config — only shown when Google is connected */}
      {isGoogleConnected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-5 w-5" />
              Google Drive Folder
            </CardTitle>
            <CardDescription>
              Optionally set a parent folder where deal documents are stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isSettingsLoading ? (
              <div className="flex items-center gap-3 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading settings...</span>
              </div>
            ) : savedFolderId && !isEditingFolderId ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap p-3 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <code className="text-sm truncate" data-testid="text-saved-drive-folder">{savedFolderId}</code>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLocalDriveFolderId(savedFolderId);
                        setIsEditingFolderId(true);
                      }}
                      data-testid="button-edit-drive-folder"
                    >
                      Replace
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDriveMutation.mutate()}
                      disabled={removeDriveMutation.isPending}
                      data-testid="button-remove-drive-folder"
                      className="text-destructive"
                    >
                      {removeDriveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={localDriveFolderId}
                    onChange={(e) => setLocalDriveFolderId(e.target.value)}
                    placeholder="Enter Google Drive Parent Folder ID (optional)"
                    data-testid="input-drive-folder-id"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      saveDriveMutation.mutate(localDriveFolderId);
                      setIsEditingFolderId(false);
                    }}
                    disabled={saveDriveMutation.isPending || !localDriveFolderId.trim()}
                    data-testid="button-save-drive-folder"
                  >
                    {saveDriveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                  {isEditingFolderId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingFolderId(false)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Find the folder ID in your Google Drive folder's URL after /folders/
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-2">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          {!hasAnyConnection && (
            <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-2">
              Skip for now
            </Button>
          )}
          <Button onClick={onNext} data-testid="button-next-step-2">
            Next: Loan Programs
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepProgramsWorkflow({
  hasPrograms,
  programCount,
  isLoading,
  onNext,
  onBack,
  onNavigate,
}: {
  hasPrograms: boolean;
  programCount: number;
  isLoading: boolean;
  onNext: () => void;
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className="space-y-6">
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking your loan programs...</span>
          </CardContent>
        </Card>
      ) : hasPrograms && !showWizard ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Loan Programs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-300">
                  You have {programCount} loan program{programCount !== 1 ? 's' : ''} configured
                </p>
                <p className="text-sm text-green-700 dark:text-green-400">
                  You can manage them anytime from Loan Products in the sidebar.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Another Program
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {!showWizard && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Create Your First Loan Program
                </CardTitle>
                <CardDescription>
                  Programs are the foundation of your lending operations. Each program defines a loan type with its own workflow, stages, documents, and AI review rules. Quotes your borrowers request are directly tied to the program you configure here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-card border border-border rounded-md p-3 space-y-1.5">
                    <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h4 className="font-medium text-sm">Stages</h4>
                    <p className="text-xs text-muted-foreground">
                      The phases each deal moves through — from application to closing.
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-md p-3 space-y-1.5">
                    <div className="h-8 w-8 rounded-md bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <ListChecks className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h4 className="font-medium text-sm">Tasks & Documents</h4>
                    <p className="text-xs text-muted-foreground">
                      Action items and required documents linked to each stage.
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-md p-3 space-y-1.5">
                    <div className="h-8 w-8 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <h4 className="font-medium text-sm">AI Rules</h4>
                    <p className="text-xs text-muted-foreground">
                      The AI agent reviews documents against your rules automatically.
                    </p>
                  </div>
                </div>
                <Button onClick={() => setShowWizard(true)} data-testid="button-start-program-wizard">
                  <Plus className="h-4 w-4 mr-2" />
                  Let's Build Your First Program
                </Button>
              </CardContent>
            </Card>
          )}

          {showWizard && (
            <ProgramCreationWizard
              onComplete={() => {
                setShowWizard(false);
                // Re-fetch programs so the count updates
                queryClient.invalidateQueries({ queryKey: ['/api/admin/programs'] });
              }}
            />
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-3">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-3">
            {hasPrograms ? 'Continue' : 'Skip for now'}
          </Button>
          <Button onClick={onNext} data-testid="button-next-step-3">
            Next: Communications & AI
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepCommunicationsAI({
  emailConnected,
  onNext,
  onBack,
  onNavigate,
}: {
  emailConnected: boolean;
  onNext: () => void;
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Communications
          </CardTitle>
          <CardDescription>
            Stay connected with borrowers, brokers, and your team through multiple channels — all managed from one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-md p-4 space-y-2">
              <div className="h-9 w-9 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h4 className="font-medium text-sm">In-App Messages</h4>
              <p className="text-sm text-muted-foreground">
                Send and receive messages linked to specific deals. Borrowers see these in their portal, and you can manage all conversations from the Messages page.
              </p>
            </div>
            <div className="bg-card border border-border rounded-md p-4 space-y-2">
              <div className="h-9 w-9 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Mail className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="font-medium text-sm">Email Integration</h4>
              <p className="text-sm text-muted-foreground">
                {emailConnected
                  ? 'Your Gmail is connected. View, search, and link email threads to deals directly from your Email Inbox.'
                  : 'Connect your Gmail to view and link email conversations to deals without leaving the platform.'}
              </p>
            </div>
            <div className="bg-card border border-border rounded-md p-4 space-y-2">
              <div className="h-9 w-9 rounded-md bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Send className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h4 className="font-medium text-sm">Loan Digests</h4>
              <p className="text-sm text-muted-foreground">
                Automated email and SMS updates sent to borrowers and partners with loan status, next steps, and outstanding items.
              </p>
            </div>
            <div className="bg-card border border-border rounded-md p-4 space-y-2">
              <div className="h-9 w-9 rounded-md bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Bell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <h4 className="font-medium text-sm">Notifications</h4>
              <p className="text-sm text-muted-foreground">
                In-app notifications keep you informed of new documents, deal updates, messages, and email activity in real time.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              AI Communication Agent
            </h3>
            <p className="text-sm text-muted-foreground">
              The AI button on each deal page gives you a powerful communication assistant. It can:
            </p>
            <ul className="space-y-2 ml-4 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                Draft personalized emails and messages to borrowers based on deal context
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                Send loan digest updates via email and SMS automatically
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                Use Deal Memory to understand the full history — documents received, stage changes, past communications — so it never repeats itself
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                Follow admin notes and instructions (prefix with /ai) to customize its behavior per deal
              </li>
            </ul>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-medium">Where to Find Everything</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Messages</p>
                  <p className="text-xs text-muted-foreground">In-app conversations and deal-linked email threads</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onNavigate('/messages')} data-testid="button-go-to-messages">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Email Inbox</p>
                  <p className="text-xs text-muted-foreground">Full email management with search, sync, and deal linking</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onNavigate('/admin/email')} data-testid="button-go-to-email">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                <Bell className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Notifications</p>
                  <p className="text-xs text-muted-foreground">Configure notification preferences in Settings</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onNavigate('/admin/settings')} data-testid="button-go-to-settings">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-4">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-4">
            Skip for now
          </Button>
          <Button onClick={onNext} data-testid="button-next-step-4">
            Next: Team Setup
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PermissionValue {
  enabled: boolean;
  scope: string;
}

interface PermissionState {
  [role: string]: {
    [key: string]: PermissionValue;
  };
}

function StepRolePermissions({
  onboardingCompleted,
  onBack,
  onNavigate,
  onCompleteOnboarding,
  isCompleting,
}: {
  onboardingCompleted: boolean;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onCompleteOnboarding: () => void;
  isCompleting: boolean;
}) {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>("processor");

  const { data, isLoading, refetch } = useQuery<PermissionState>({
    queryKey: ["team-permissions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/team-permissions");
      return response.json();
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async (payload: {
      role: string;
      permissionKey: string;
      enabled: boolean;
      scope?: string;
    }) => {
      return await apiRequest("PUT", "/api/admin/team-permissions", payload);
    },
    onSuccess: () => {
      toast({ title: "Permission updated" });
      queryClient.invalidateQueries({ queryKey: ["team-permissions"] });
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to update permission", variant: "destructive" });
    },
  });

  const handleToggle = (role: string, permissionKey: string, currentValue: boolean) => {
    updatePermissionMutation.mutate({ role, permissionKey, enabled: !currentValue });
  };

  const handleScopeChange = (role: string, permissionKey: string, scope: string) => {
    const currentEnabled = data?.[role]?.[permissionKey]?.enabled ?? false;
    updatePermissionMutation.mutate({ role, permissionKey, enabled: currentEnabled, scope });
  };

  const isEditableRole = (role: string) => role === "processor";

  const isScopable = (key: string) => SCOPABLE_PERMISSIONS.includes(key as PermissionKey);

  const roleOptions = [
    { value: "processor", label: "Processor" },
    { value: "admin", label: "Admin" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role Permissions
          </CardTitle>
          <CardDescription>
            Configure what each role can access. Admin has full access. Processor permissions are customizable below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <Tabs defaultValue="processor" value={selectedRole} onValueChange={setSelectedRole}>
              <TabsList className="grid w-full grid-cols-2">
                {roleOptions.map((role) => (
                  <TabsTrigger key={role.value} value={role.value} data-testid={`tab-onboarding-role-${role.value}`}>
                    <div className="flex items-center gap-2">
                      {role.label}
                      {role.value === "admin" && (
                        <Badge variant="secondary" className="ml-1">Full</Badge>
                      )}
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>

              {roleOptions.map((role) => (
                <TabsContent key={role.value} value={role.value} className="space-y-6">
                  {!isEditableRole(role.value) && (
                    <div className="bg-muted p-4 rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground">
                        Admin users have full access to all permissions.
                      </p>
                    </div>
                  )}

                  <div className="space-y-6">
                    {Object.entries(PERMISSION_CATEGORIES).map(([categoryKey, category]) => (
                      <div key={categoryKey} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-base">{category.label}</h3>
                          <Badge variant="outline">
                            {category.permissions.filter((p) => data?.[role.value]?.[p.key]?.enabled).length} / {category.permissions.length}
                          </Badge>
                        </div>

                        <div className="space-y-3">
                          {category.permissions.map((permission) => {
                            const permValue = data?.[role.value]?.[permission.key];
                            const isEnabled = permValue?.enabled || false;
                            const scope = permValue?.scope || "all";
                            const isEditable = isEditableRole(role.value);
                            const showScope = isEditable && isScopable(permission.key) && isEnabled;

                            return (
                              <div key={permission.key} className="p-3 bg-muted/50 rounded">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 flex-1">
                                    <Label
                                      htmlFor={`onboard-${role.value}-${permission.key}`}
                                      className="cursor-pointer flex-1 font-normal"
                                    >
                                      {permission.label}
                                    </Label>
                                  </div>
                                  {isEditable ? (
                                    <Switch
                                      id={`onboard-${role.value}-${permission.key}`}
                                      checked={isEnabled}
                                      onCheckedChange={() => handleToggle(role.value, permission.key, isEnabled)}
                                      disabled={updatePermissionMutation.isPending}
                                      data-testid={`switch-onboard-${role.value}-${permission.key}`}
                                    />
                                  ) : (
                                    <Badge variant={isEnabled ? "default" : "secondary"}>
                                      {isEnabled ? "Enabled" : "Disabled"}
                                    </Badge>
                                  )}
                                </div>

                                {showScope && (
                                  <div className="mt-3 flex items-center gap-3 pl-1">
                                    <span className="text-xs text-muted-foreground">Scope:</span>
                                    <Select
                                      value={scope}
                                      onValueChange={(val) => handleScopeChange(role.value, permission.key, val)}
                                      disabled={updatePermissionMutation.isPending}
                                    >
                                      <SelectTrigger className="w-[180px] h-8 text-xs" data-testid={`select-onboard-scope-${permission.key}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="assigned_only">Assigned Only</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {scope === "assigned_only" && (
                                      <span className="text-xs text-muted-foreground">
                                        Only sees items on deals they are assigned to
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50 border-muted">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg">You're all set!</h3>
              <p className="text-sm text-muted-foreground">
                You can always come back to this guide from the Getting Started section in the sidebar. Now go ahead and start managing your deals.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-6">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          {!onboardingCompleted && (
            <Button variant="ghost" onClick={onCompleteOnboarding} disabled={isCompleting} className="text-muted-foreground" data-testid="button-skip-step-6">
              Skip for now
            </Button>
          )}
          {onboardingCompleted ? (
            <Button onClick={() => onNavigate('/admin/deals')} data-testid="button-go-to-dashboard">
              Go to Deals
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={onCompleteOnboarding} disabled={isCompleting} data-testid="button-finish-setup">
              {isCompleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finishing...
                </>
              ) : (
                <>
                  Finish Setup & Go to Deals
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<OnboardingDocument | null>(null);
  const [formData, setFormData] = useState({
    type: 'training_doc',
    title: '',
    description: '',
    fileUrl: '',
    externalUrl: '',
    sortOrder: 0,
    isRequired: true,
    isActive: true,
    targetUserType: 'broker',
  });

  const { data: documentsData, isLoading: docsLoading } = useQuery<{ documents: OnboardingDocument[] }>({
    queryKey: ['/api/admin/onboarding/documents'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('POST', '/api/admin/onboarding/documents', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/onboarding/documents'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({ title: 'Document created', description: 'The onboarding document has been created.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error?.message || 'Failed to create document', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const res = await apiRequest('PATCH', `/api/admin/onboarding/documents/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/onboarding/documents'] });
      setEditingDocument(null);
      resetForm();
      toast({ title: 'Document updated', description: 'The onboarding document has been updated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error?.message || 'Failed to update document', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/admin/onboarding/documents/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/onboarding/documents'] });
      toast({ title: 'Document deleted', description: 'The onboarding document has been deleted.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error?.message || 'Failed to delete document', variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      type: 'training_doc',
      title: '',
      description: '',
      fileUrl: '',
      externalUrl: '',
      sortOrder: 0,
      isRequired: true,
      isActive: true,
      targetUserType: 'broker',
    });
  };

  const handleEdit = (doc: OnboardingDocument) => {
    setEditingDocument(doc);
    setFormData({
      type: doc.type,
      title: doc.title,
      description: doc.description || '',
      fileUrl: doc.fileUrl || '',
      externalUrl: doc.externalUrl || '',
      sortOrder: doc.sortOrder,
      isRequired: doc.isRequired,
      isActive: doc.isActive,
      targetUserType: doc.targetUserType,
    });
  };

  const handleSubmit = () => {
    if (editingDocument) {
      updateMutation.mutate({ id: editingDocument.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const documents = documentsData?.documents || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Training Materials</CardTitle>
            <CardDescription>
              Configure partnership agreements and training materials for new users
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-document">
                <Plus className="h-4 w-4 mr-2" />
                Add Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Onboarding Document</DialogTitle>
                <DialogDescription>
                  Create a new document for user onboarding
                </DialogDescription>
              </DialogHeader>
              <DocumentForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSubmit}
                isPending={createMutation.isPending}
                submitLabel="Create Document"
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {docsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No Documents</p>
            <p className="text-muted-foreground">Add your first onboarding document to get started.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => {
                const typeInfo = documentTypeLabels[doc.type] || { label: doc.type, icon: FileText };
                const TypeIcon = typeInfo.icon;

                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground truncate max-w-xs">{doc.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {doc.targetUserType === 'all' ? 'All Users' : doc.targetUserType === 'broker' ? 'Brokers' : 'Borrowers'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.isRequired ? (
                        <Badge variant="default">Required</Badge>
                      ) : (
                        <Badge variant="outline">Optional</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {doc.isActive ? (
                        <Badge variant="default" className="bg-success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(doc)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Document</DialogTitle>
                              <DialogDescription>
                                Update the onboarding document
                              </DialogDescription>
                            </DialogHeader>
                            <DocumentForm
                              formData={formData}
                              setFormData={setFormData}
                              onSubmit={handleSubmit}
                              isPending={updateMutation.isPending}
                              submitLabel="Save Changes"
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function UsersStatus() {
  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: OnboardingUser[] }>({
    queryKey: ['/api/admin/onboarding/users'],
  });

  const users = usersData?.users || [];
  const brokersPendingOnboarding = users.filter(u => u.userType === 'broker' && !u.onboardingCompleted);
  const brokersCompleted = users.filter(u => u.userType === 'broker' && u.onboardingCompleted);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Pending Onboarding
          </CardTitle>
          <CardDescription>
            Brokers who have not completed their onboarding
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : brokersPendingOnboarding.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium">All Caught Up!</p>
              <p className="text-muted-foreground">All brokers have completed their onboarding.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Agreement</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brokersPendingOnboarding.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.fullName || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.partnershipAgreementSignedAt ? (
                        <Badge variant="default" className="bg-success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Signed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.trainingCompletedAt ? (
                        <Badge variant="default" className="bg-success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Completed Onboarding
          </CardTitle>
          <CardDescription>
            Brokers who have completed their onboarding
          </CardDescription>
        </CardHeader>
        <CardContent>
          {brokersCompleted.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No brokers have completed onboarding yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Agreement Signed</TableHead>
                  <TableHead>Training Completed</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brokersCompleted.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.fullName || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.partnershipAgreementSignedAt
                        ? new Date(user.partnershipAgreementSignedAt).toLocaleDateString()
                        : 'N/A'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.trainingCompletedAt
                        ? new Date(user.trainingCompletedAt).toLocaleDateString()
                        : 'N/A'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentForm({
  formData,
  setFormData,
  onSubmit,
  isPending,
  submitLabel,
}: {
  formData: {
    type: string;
    title: string;
    description: string;
    fileUrl: string;
    externalUrl: string;
    sortOrder: number;
    isRequired: boolean;
    isActive: boolean;
    targetUserType: string;
  };
  setFormData: (data: typeof formData) => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const response = await apiRequest('POST', '/api/admin/onboarding/upload-url', {
        name: file.name,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await response.json();

      setUploadProgress(30);

      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      setUploadProgress(100);
      setFormData({ ...formData, fileUrl: objectPath });
      setUploadedFileName(file.name);
      toast({ title: 'File uploaded', description: `${file.name} uploaded successfully.` });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: 'Upload failed', description: 'Failed to upload file. Please try again.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const showFileUpload = formData.type === 'training_video' || formData.type === 'training_doc' || formData.type === 'partnership_agreement';
  const showExternalUrl = formData.type === 'training_link' || formData.type === 'training_video';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Document Type</Label>
        <Select
          value={formData.type}
          onValueChange={(value) => setFormData({ ...formData, type: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="partnership_agreement">Partnership Agreement</SelectItem>
            <SelectItem value="training_doc">Training Document</SelectItem>
            <SelectItem value="training_video">Training Video</SelectItem>
            <SelectItem value="training_link">Training Link</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Enter document title"
          data-testid="input-document-title"
        />
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Enter a brief description"
        />
      </div>

      {showFileUpload && (
        <div className="space-y-2">
          <Label>Upload File</Label>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept={formData.type === 'training_video' ? 'video/*' : '.pdf,.doc,.docx'}
              onChange={handleFileUpload}
              disabled={isUploading}
              className="flex-1"
              data-testid="input-file-upload"
            />
          </div>
          {isUploading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading... {uploadProgress}%
            </div>
          )}
          {uploadedFileName && !isUploading && (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Uploaded: {uploadedFileName}
            </p>
          )}
          {formData.fileUrl && !uploadedFileName && (
            <p className="text-sm text-muted-foreground">
              Current file: {formData.fileUrl.split('/').pop()}
            </p>
          )}
          <div className="pt-2">
            <Label className="text-muted-foreground text-sm">Or paste file URL</Label>
            <Input
              value={formData.fileUrl}
              onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
              placeholder="https://..."
              className="mt-1"
            />
          </div>
        </div>
      )}

      {showExternalUrl && (
        <div className="space-y-2">
          <Label>{formData.type === 'training_link' ? 'External URL' : 'Video URL (optional - use if linking to external video)'}</Label>
          <Input
            value={formData.externalUrl}
            onChange={(e) => setFormData({ ...formData, externalUrl: e.target.value })}
            placeholder="https://..."
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Target Users</Label>
        <Select
          value={formData.targetUserType}
          onValueChange={(value) => setFormData({ ...formData, targetUserType: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="broker">Brokers Only</SelectItem>
            <SelectItem value="borrower">Borrowers Only</SelectItem>
            <SelectItem value="all">All Users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Sort Order</Label>
        <Input
          type="number"
          value={formData.sortOrder}
          onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Required for onboarding</Label>
        <Switch
          checked={formData.isRequired}
          onCheckedChange={(checked) => setFormData({ ...formData, isRequired: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
        />
      </div>

      <DialogFooter>
        <Button onClick={onSubmit} disabled={isPending || !formData.title}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

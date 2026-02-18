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
  Phone,
  Brain,
  MapPin,
  XCircle,
  AlertCircle,
  HardDrive,
  FolderOpen,
  UserPlus,
  Save,
  RefreshCw,
} from 'lucide-react';

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
  { id: 2, label: 'Team Setup', icon: Users },
  { id: 3, label: 'Integrations', icon: Plug },
  { id: 4, label: 'Loan Programs', icon: Layers },
  { id: 5, label: 'Communications & AI', icon: MessageSquare },
];

export default function AdminOnboarding() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>('guide');
  const [currentStep, setCurrentStep] = useState(1);

  const { data: accountData, isLoading: accountLoading } = useQuery<{ account: any }>({
    queryKey: ['/api/email/account'],
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

  const emailConnected = !!accountData?.account;
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
                <StepTeamSetup
                  teamData={teamData?.users || []}
                  isLoading={teamLoading}
                  onNext={handleNext}
                  onBack={handleBack}
                  onNavigate={setLocation}
                />
              )}
              {currentStep === 3 && (
                <StepIntegrations
                  emailConnected={emailConnected}
                  emailAddress={accountData?.account?.emailAddress}
                  isEmailLoading={accountLoading}
                  integrationsData={integrationsData?.integrations}
                  isIntegrationsLoading={integrationsLoading}
                  driveFolderId={driveFolderSetting?.settingValue || ''}
                  isSettingsLoading={settingsLoading}
                  onNext={handleNext}
                  onBack={handleBack}
                  onNavigate={setLocation}
                />
              )}
              {currentStep === 4 && (
                <StepProgramsWorkflow
                  hasPrograms={hasPrograms}
                  programCount={programsData?.programs?.length || 0}
                  isLoading={programsLoading}
                  onNext={handleNext}
                  onBack={handleBack}
                  onNavigate={setLocation}
                />
              )}
              {currentStep === 5 && (
                <StepCommunicationsAI
                  emailConnected={emailConnected}
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
          <Button
            onClick={save}
            disabled={!hasChanges || isPending}
            size="sm"
            data-testid="button-save-company-profile"
          >
            <Save className="h-4 w-4 mr-2" />
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-1">
          Skip for now
        </Button>
        <Button onClick={onNext} data-testid="button-next-step-1">
          Next: Team Setup
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StepTeamSetup({
  teamData,
  isLoading,
  onNext,
  onBack,
  onNavigate,
}: {
  teamData: any[];
  isLoading: boolean;
  onNext: () => void;
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const { toast } = useToast();
  const [newMember, setNewMember] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'staff',
  });

  const teamRoles = new Set(['processor', 'staff', 'admin', 'super_admin']);
  const teamMembers = teamData.filter((u: any) => {
    if (teamRoles.has(u.role)) return true;
    if (u.roles?.some((r: string) => teamRoles.has(r))) return true;
    return false;
  });

  const createMemberMutation = useMutation({
    mutationFn: async (data: typeof newMember) => {
      return await apiRequest('POST', '/api/admin/users', {
        ...data,
        userType: 'broker',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setNewMember({ fullName: '', email: '', password: '', role: 'staff' });
      toast({ title: 'Team member added successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to add team member',
        description: error?.message || 'Please check the form and try again',
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!newMember.email || !newMember.password || !newMember.fullName) {
      toast({ title: 'Full name, email, and password are required', variant: 'destructive' });
      return;
    }
    createMemberMutation.mutate(newMember);
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
            Team members with admin, staff, or processor access. Add members here or manage permissions in detail later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              {teamMembers.map((member: any) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-md"
                  data-testid={`team-member-${member.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.fullName || 'No name'}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <Badge variant={member.role === 'admin' || member.role === 'super_admin' ? 'default' : 'secondary'} data-testid={`badge-role-${member.id}`}>
                    {member.role}
                  </Badge>
                </div>
              ))}
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
                <Label htmlFor="team-add-name" className="text-xs">Full Name</Label>
                <Input
                  id="team-add-name"
                  value={newMember.fullName}
                  onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
                  placeholder="Jane Smith"
                  data-testid="input-team-add-name"
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
                <Label htmlFor="team-add-password" className="text-xs">Temporary Password</Label>
                <Input
                  id="team-add-password"
                  type="password"
                  value={newMember.password}
                  onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                  placeholder="Enter password"
                  data-testid="input-team-add-password"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="team-add-role" className="text-xs">Role</Label>
                <Select value={newMember.role} onValueChange={(val) => setNewMember({ ...newMember, role: val })}>
                  <SelectTrigger data-testid="select-team-add-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMemberMutation.isPending}
              data-testid="button-add-team-member-inline"
            >
              {createMemberMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Member
                </>
              )}
            </Button>
          </div>

          <Separator />

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('/admin/team-permissions')}
            data-testid="button-go-to-permissions"
          >
            <Shield className="h-4 w-4 mr-2" />
            Manage Permissions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-2">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-2">
            Skip for now
          </Button>
          <Button onClick={onNext} data-testid="button-next-step-2">
            Next: Integrations
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepIntegrations({
  emailConnected,
  emailAddress,
  isEmailLoading,
  integrationsData,
  isIntegrationsLoading,
  driveFolderId,
  isSettingsLoading,
  onNext,
  onBack,
  onNavigate,
}: {
  emailConnected: boolean;
  emailAddress?: string;
  isEmailLoading: boolean;
  integrationsData: any;
  isIntegrationsLoading: boolean;
  driveFolderId: string;
  isSettingsLoading: boolean;
  onNext: () => void;
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const { toast } = useToast();
  const [localDriveFolderId, setLocalDriveFolderId] = useState(driveFolderId);

  useEffect(() => {
    setLocalDriveFolderId(driveFolderId);
  }, [driveFolderId]);

  const saveDriveMutation = useMutation({
    mutationFn: async (folderId: string) => {
      return await apiRequest("PUT", "/api/admin/settings/google_drive_parent_folder_id", {
        value: folderId,
        description: "Google Drive parent folder ID",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: 'Google Drive folder ID saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save folder ID', variant: 'destructive' });
    },
  });

  const externalIntegrations = [
    { key: 'twilio', label: 'Twilio SMS', icon: Phone },
    { key: 'resend', label: 'Resend Email', icon: Mail },
    { key: 'openai', label: 'OpenAI', icon: Brain },
    { key: 'apify', label: 'Apify', icon: RefreshCw },
    { key: 'geoapify', label: 'Geoapify', icon: MapPin },
    { key: 'pandadoc', label: 'PandaDoc', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Connection
          </CardTitle>
          <CardDescription>
            Link your Gmail account so you can view, manage, and link email conversations to deals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEmailLoading ? (
            <div className="flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Checking email connection status...</span>
            </div>
          ) : emailConnected ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-300">Gmail Connected</p>
                <p className="text-sm text-green-700 dark:text-green-400">{emailAddress}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Connecting your Gmail allows you to:</p>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    View your email inbox directly inside the platform
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    Link email threads to specific deals for full context
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    Get notified when new emails arrive on linked deals
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => window.location.href = '/api/email/connect'}
                  data-testid="button-connect-gmail-onboarding"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Connect Gmail
                </Button>
                <span className="text-sm text-muted-foreground">You can also do this later from Settings</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Google Drive
          </CardTitle>
          <CardDescription>
            Configure a parent folder in Google Drive where all deal document folders will be created automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSettingsLoading ? (
            <div className="flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading settings...</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={localDriveFolderId}
                onChange={(e) => setLocalDriveFolderId(e.target.value)}
                placeholder="Enter Google Drive Parent Folder ID"
                data-testid="input-drive-folder-id"
              />
              <Button
                size="sm"
                onClick={() => saveDriveMutation.mutate(localDriveFolderId)}
                disabled={saveDriveMutation.isPending || localDriveFolderId === driveFolderId}
                data-testid="button-save-drive-folder"
              >
                {saveDriveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Find the folder ID in your Google Drive folder's URL after /folders/
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            External Integrations
          </CardTitle>
          <CardDescription>
            Status of your connected third-party services. Configure API keys and credentials in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isIntegrationsLoading ? (
            <div className="flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Checking integration status...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {externalIntegrations.map((integration) => {
                const IntIcon = integration.icon;
                const status = integrationsData?.[integration.key];
                const isConnected = status?.connected === true;
                return (
                  <div
                    key={integration.key}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-md"
                    data-testid={`integration-status-${integration.key}`}
                  >
                    <IntIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm flex-1 min-w-0 truncate">{integration.label}</span>
                    {isConnected ? (
                      <Badge variant="default" data-testid={`badge-connected-${integration.key}`}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary" data-testid={`badge-not-connected-${integration.key}`}>
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Connected
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('/admin/settings')}
            data-testid="button-manage-settings"
          >
            <Settings className="h-4 w-4 mr-2" />
            Manage in Settings
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-3">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground" data-testid="button-skip-step-3">
            Skip for now
          </Button>
          <Button onClick={onNext} data-testid="button-next-step-3">
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
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Loan Programs
          </CardTitle>
          <CardDescription>
            Programs are the foundation of your lending operations. Each program defines a loan type with its own workflow, stages, and requirements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Checking your loan programs...</span>
            </div>
          ) : hasPrograms ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-300">
                  You have {programCount} loan program{programCount !== 1 ? 's' : ''} configured
                </p>
                <p className="text-sm text-green-700 dark:text-green-400">
                  You can manage them anytime from Loan Products in the sidebar
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">No programs yet</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Create your first loan program to start processing deals
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-medium">How Programs Work</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-md p-4 space-y-2">
                <div className="h-9 w-9 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="font-medium text-sm">Stages</h4>
                <p className="text-sm text-muted-foreground">
                  Define the phases each deal goes through — from application to closing. Each stage represents a milestone in the loan lifecycle.
                </p>
              </div>
              <div className="bg-card border border-border rounded-md p-4 space-y-2">
                <div className="h-9 w-9 rounded-md bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <ListChecks className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <h4 className="font-medium text-sm">Tasks</h4>
                <p className="text-sm text-muted-foreground">
                  Assign tasks to each stage. These are the action items that need to be completed before a deal can move to the next stage.
                </p>
              </div>
              <div className="bg-card border border-border rounded-md p-4 space-y-2">
                <div className="h-9 w-9 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="font-medium text-sm">Documents</h4>
                <p className="text-sm text-muted-foreground">
                  Specify which documents are needed at each stage. Borrowers and brokers will see exactly what they need to upload.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-medium">Building Your First Program</h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>When creating a program, you'll configure:</p>
              <ol className="space-y-2 ml-4 list-decimal">
                <li><span className="text-foreground font-medium">Loan type</span> — DSCR, Fix & Flip, Ground Up Construction, or others</li>
                <li><span className="text-foreground font-medium">Loan parameters</span> — min/max amounts, LTV ranges, rate ranges</li>
                <li><span className="text-foreground font-medium">Workflow stages</span> — the steps a deal moves through (e.g., Application, Processing, Underwriting, Closing)</li>
                <li><span className="text-foreground font-medium">Stage tasks</span> — what needs to happen at each stage</li>
                <li><span className="text-foreground font-medium">Required documents</span> — what borrowers/brokers need to upload per stage</li>
              </ol>
            </div>
            <Button
              variant="outline"
              onClick={() => onNavigate('/admin/programs')}
              data-testid="button-go-to-programs"
            >
              <Settings className="h-4 w-4 mr-2" />
              {hasPrograms ? 'Manage Loan Programs' : 'Create Your First Program'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary" />
              Program-to-Deal Sync
            </h3>
            <p className="text-sm text-muted-foreground">
              When you update a program's stages, tasks, or documents, those changes automatically sync to all existing deals using that program. You don't need to update each deal individually — the system handles it for you.
            </p>
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
  onboardingCompleted,
  onBack,
  onNavigate,
  onCompleteOnboarding,
  isCompleting,
}: {
  emailConnected: boolean;
  onboardingCompleted: boolean;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onCompleteOnboarding: () => void;
  isCompleting: boolean;
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

      <Card>
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
        <Button variant="outline" onClick={onBack} data-testid="button-back-step-5">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          {!onboardingCompleted && (
            <Button variant="ghost" onClick={onCompleteOnboarding} disabled={isCompleting} className="text-muted-foreground" data-testid="button-skip-step-5">
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

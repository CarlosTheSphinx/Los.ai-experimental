import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useState, useRef, type ChangeEvent } from "react";
import {
  CheckCircle2,
  Building2,
  Calendar,
  DollarSign,
  FileText,
  Activity,
  CheckSquare,
  AlertCircle,
  Upload,
  Loader2,
  MessageSquare,
  FolderOpen,
  UserCircle,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/validation";
import { LoanChecklist } from "@/components/LoanChecklist";
import { PortalOnboarding, hasCompletedOnboarding } from "@/components/portal/PortalOnboarding";
import { PortalSidebar, type PortalView } from "@/components/portal/PortalSidebar";

interface Task {
  id: number;
  taskTitle: string;
  taskType: string;
  priority: string;
  status: string;
  completedAt: string | null;
  visibleToBorrower: boolean;
  borrowerActionRequired: boolean;
}

interface Stage {
  id: number;
  stageName: string;
  stageKey: string;
  stageOrder: number;
  stageDescription: string;
  status: string;
  tasks: Task[];
}

interface ActivityItem {
  id: number;
  activityType: string;
  activityDescription: string;
  createdAt: string;
}

interface Project {
  id: number;
  programName?: string | null;
  projectName: string;
  borrowerName: string;
  status: string;
  currentStage: string;
  progressPercentage: number;
  loanAmount: number | null;
  interestRate: number | null;
  loanTermMonths: number | null;
  loanType: string | null;
  propertyAddress: string | null;
  targetCloseDate: string | null;
  applicationDate: string | null;
  notes: string | null;
}

interface PortalConfig {
  welcomeMessage?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  sections?: {
    dealOverview?: boolean;
    stageProgress?: boolean;
    documents?: boolean;
    activityFeed?: boolean;
    loanChecklist?: boolean;
  };
  fieldVisibility?: {
    propertyAddress?: boolean;
    loanAmount?: boolean;
    interestRate?: boolean;
    loanTerm?: boolean;
    targetCloseDate?: boolean;
  };
}

const DEFAULT_SECTIONS = {
  dealOverview: true,
  stageProgress: true,
  documents: true,
  activityFeed: true,
  loanChecklist: true,
};

const DEFAULT_FIELD_VISIBILITY = {
  propertyAddress: true,
  loanAmount: true,
  interestRate: true,
  loanTerm: true,
  targetCloseDate: true,
};

interface BorrowerProfile {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  ssnLast4: string | null;
  idType: string | null;
  idNumber: string | null;
  idExpirationDate: string | null;
  employerName: string | null;
  employmentTitle: string | null;
  annualIncome: number | null;
  employmentType: string | null;
  entityName: string | null;
  entityType: string | null;
  einNumber: string | null;
  profileData: Record<string, any> | null;
}

interface BorrowerDocument {
  id: number;
  borrowerProfileId: number;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  storagePath: string | null;
  category: string | null;
  description: string | null;
  expirationDate: string | null;
  isActive: boolean;
  uploadedAt: string;
}

interface RelatedDeal {
  id: number;
  dealName: string;
  propertyAddress: string | null;
  loanAmount: number | null;
  loanType: string | null;
  status: string;
  currentStage: string;
  portalToken: string;
  programName: string | null;
  isCurrent: boolean;
}

export default function BorrowerPortal() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (!token) return false;
    return !hasCompletedOnboarding("borrower", token);
  });
  const [activeView, setActiveView] = useState<PortalView>("dashboard");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<Partial<BorrowerProfile>>({});

  // Borrower profile query
  const { data: profileData } = useQuery<{ profile: BorrowerProfile }>({
    queryKey: ['/api/portal', token, 'borrower-profile'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/borrower-profile`);
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
    enabled: !!token && (activeView === 'profile' || activeView === 'documents'),
  });

  // Borrower documents query
  const { data: docsData } = useQuery<{ documents: BorrowerDocument[] }>({
    queryKey: ['/api/portal', token, 'borrower-documents'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/borrower-documents`);
      if (!res.ok) throw new Error('Failed to load documents');
      return res.json();
    },
    enabled: !!token && activeView === 'documents',
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<BorrowerProfile>) => {
      const res = await apiRequest('PUT', `/api/portal/${token}/borrower-profile`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'borrower-profile'] });
      setEditingProfile(false);
      toast({ title: "Profile updated" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const { data, isLoading, error } = useQuery<{
    project: Project;
    stages: Stage[];
    activity: ActivityItem[];
    portalConfig?: PortalConfig | null;
  }>({
    queryKey: ['/api/portal', token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load portal');
      }
      return res.json();
    },
    enabled: !!token,
  });

  const { data: relatedDealsData } = useQuery<{ deals: RelatedDeal[] }>({
    queryKey: ["/api/portal", token, "related-deals"],
    queryFn: async () => {
      if (!token) throw new Error("Token is required");
      const response = await fetch(`/api/portal/${token}/related-deals`);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    enabled: !!token && !showOnboarding,
    retry: false,
  });

  const relatedDeals = relatedDealsData?.deals || [];
  const displayDeals = relatedDeals.length > 0
    ? relatedDeals
    : data?.project ? [{ id: data.project.id, dealName: data.project.projectName, propertyAddress: data.project.propertyAddress, loanAmount: data.project.loanAmount, loanType: data.project.loanType, status: data.project.status, currentStage: data.project.currentStage, portalToken: token!, programName: data.project.programName || null, isCurrent: true }]
    : [];

  const handleDealSwitch = (portalToken: string) => {
    if (portalToken !== token) {
      setLocation(`/portal/${portalToken}`);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async ({ docId, file }: { docId: number; file: File }) => {
      setUploadingDocId(docId);
      const urlRes = await fetch(`/api/portal/${token}/documents/${docId}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const urlData = await urlRes.json();

      let objectPath: string;
      if (urlData.useDirectUpload) {
        const fd = new FormData();
        fd.append('file', file);
        const dr = await fetch(urlData.uploadURL, { method: 'POST', body: fd });
        if (!dr.ok) throw new Error('Upload failed');
        objectPath = (await dr.json()).objectPath;
      } else {
        const uploadRes = await fetch(urlData.uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!uploadRes.ok) throw new Error('Failed to upload file');
        objectPath = urlData.objectPath;
      }

      const completeRes = await fetch(`/api/portal/${token}/documents/${docId}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectPath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });
      if (!completeRes.ok) throw new Error('Failed to complete upload');
      return completeRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal/checklist', token] });
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token] });
      toast({ title: "Document uploaded successfully" });
      setUploadingDocId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploadingDocId(null);
    },
  });

  const handleUploadClick = (docId: number) => {
    setSelectedDocId(docId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedDocId) {
      uploadMutation.mutate({ docId: selectedDocId, file });
    }
    e.target.value = '';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 w-48 bg-muted rounded mx-auto mb-4"></div>
          <div className="h-4 w-64 bg-muted rounded mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Portal Not Available</h1>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'This borrower portal link is invalid or has been disabled.'}
          </p>
        </Card>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <PortalOnboarding
        config={data.portalConfig as any}
        portalType="borrower"
        token={token!}
        onComplete={() => setShowOnboarding(false)}
      />
    );
  }

  const { project, stages, activity, portalConfig } = data;
  const sections = { ...DEFAULT_SECTIONS, ...portalConfig?.sections };
  const fieldVisibility = { ...DEFAULT_FIELD_VISIBILITY, ...portalConfig?.fieldVisibility };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="borrower-portal">
      <PortalSidebar
        portalType="borrower"
        activeView={activeView}
        onViewChange={setActiveView}
        dealName={project.projectName}
      />

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.txt"
        data-testid="input-file-upload"
      />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-background border-b">
          <div className="px-4 md:px-6 py-3 md:py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs md:text-sm text-muted-foreground font-mono truncate">{project.loanNumber || `DEAL-${project.id}`}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg md:text-xl font-semibold truncate">{project.projectName}</h1>
                  {project.programName && (
                    <Badge variant="outline" className="text-xs shrink-0" data-testid="badge-program-name">
                      {project.programName}
                    </Badge>
                  )}
                </div>
              </div>
              <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="shrink-0" data-testid="badge-deal-status">
                {project.status}
              </Badge>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
          {activeView === "dashboard" && (
            <>
              {portalConfig?.welcomeMessage && (
                <Card className="p-4 bg-primary/5 border-primary/20">
                  <p className="text-sm text-muted-foreground">{portalConfig.welcomeMessage}</p>
                </Card>
              )}

              {sections.stageProgress && stages.length > 0 && (
                <Card data-testid="card-loan-progress">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4 gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold">Loan Progress</h3>
                        <p className="text-xs text-muted-foreground">Welcome, {project.borrowerName}</p>
                      </div>
                      <span className="text-xl md:text-2xl font-bold shrink-0" data-testid="text-overall-progress">
                        {(() => {
                          let totalItems = 0;
                          let completedItems = 0;
                          stages.forEach(stage => {
                            const completedTasks = (stage.tasks || []).filter((t: Task) => t.status === 'completed').length;
                            totalItems += (stage.tasks || []).length;
                            completedItems += completedTasks;
                          });
                          return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                        })()}% Complete
                      </span>
                    </div>
                    <div className="flex items-start justify-between relative">
                      {stages.map((stage, i) => {
                        const completedTasks = (stage.tasks || []).filter((t: Task) => t.status === 'completed').length;
                        const totalItems = (stage.tasks || []).length;
                        const isCompleted = totalItems > 0 && completedTasks >= totalItems;
                        const isActive = stage.status === 'in_progress';
                        return (
                          <div key={stage.id} className="flex flex-col items-center relative flex-1" data-testid={`progress-stage-${stage.id}`}>
                            <div
                              className={`h-10 w-10 md:h-12 md:w-12 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold border-[3px] flex-shrink-0 transition-all z-10 ${
                                isCompleted ? 'bg-success border-success text-white' :
                                isActive ? 'bg-primary border-primary text-white' :
                                'bg-muted border-border text-muted-foreground'
                              }`}
                              data-testid={`stage-indicator-${stage.id}`}
                            >
                              {isCompleted ? <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" /> : i + 1}
                            </div>
                            <div className="mt-2 md:mt-3 text-center max-w-[80px] md:max-w-[120px]">
                              <div className={`text-[10px] md:text-[13px] font-medium leading-tight ${
                                isCompleted ? 'text-success' :
                                isActive ? 'text-primary font-semibold' :
                                'text-muted-foreground'
                              }`}>
                                {stage.stageName}
                              </div>
                              {totalItems > 0 && (
                                <div className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                                  {completedTasks}/{totalItems}
                                </div>
                              )}
                            </div>
                            {i < stages.length - 1 && (
                              <div
                                className={`absolute top-5 md:top-6 left-[calc(50%+20px)] md:left-[calc(50%+24px)] h-[2px] md:h-[3px] z-0 ${
                                  isCompleted ? 'bg-success/50' : 'bg-border'
                                }`}
                                style={{ width: 'calc(100% - 40px)' }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {project.programName && (
                      <div className="border-t mt-4 md:mt-5 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Loan Program</span>
                          </div>
                          <span className="text-sm font-medium" data-testid="text-program-name">{project.programName}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {sections.dealOverview && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
                {fieldVisibility.loanAmount && (
                <Card className="p-3 md:p-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-success" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] md:text-xs text-muted-foreground">Loan Amount</div>
                      <div className="font-semibold text-sm md:text-base truncate">{formatCurrency(project.loanAmount)}</div>
                    </div>
                  </div>
                </Card>
                )}
                {fieldVisibility.interestRate && (
                <Card className="p-3 md:p-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
                      <span className="text-info font-semibold text-xs md:text-sm">%</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] md:text-xs text-muted-foreground">Interest Rate</div>
                      <div className="font-semibold text-sm md:text-base">{project.interestRate ? `${project.interestRate}%` : '—'}</div>
                    </div>
                  </div>
                </Card>
                )}
                {fieldVisibility.targetCloseDate && (
                <Card className="p-3 md:p-4 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] md:text-xs text-muted-foreground">Target Close</div>
                      <div className="font-semibold text-sm md:text-base">{formatDate(project.targetCloseDate)}</div>
                    </div>
                  </div>
                </Card>
                )}
              </div>
              )}

              {fieldVisibility.propertyAddress && project.propertyAddress && (
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Property:</span>
                    <span className="text-sm text-muted-foreground">{project.propertyAddress}</span>
                  </div>
                </Card>
              )}
            </>
          )}

          {activeView === "loans" && (
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Documents & Checklist</h2>
                    <p className="text-sm text-muted-foreground">Upload documents and track your progress</p>
                  </div>
                  {displayDeals.length > 0 && (
                    <div className="w-full sm:w-auto sm:min-w-[280px]">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Select Loan</label>
                      <Select
                        value={token}
                        onValueChange={handleDealSwitch}
                        data-testid="select-loan-borrower"
                      >
                        <SelectTrigger className="w-full" data-testid="select-trigger-loan-borrower">
                          <SelectValue placeholder="Select a loan" />
                        </SelectTrigger>
                        <SelectContent>
                          {displayDeals.map((rd) => (
                            <SelectItem key={rd.portalToken} value={rd.portalToken} data-testid={`select-loan-${rd.id}`}>
                              <span className="truncate">
                                {rd.loanNumber || `DEAL-${rd.id}`} — {rd.propertyAddress || rd.dealName}
                                {rd.loanAmount ? ` ($${rd.loanAmount.toLocaleString()})` : ""}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              {(sections.loanChecklist || sections.activityFeed) && (
              <Tabs defaultValue={sections.loanChecklist ? "checklist" : "updates"} className="space-y-4">
                <TabsList>
                  {sections.loanChecklist && (
                  <TabsTrigger value="checklist" data-testid="tab-checklist">
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Checklist
                  </TabsTrigger>
                  )}
                  {sections.activityFeed && (
                  <TabsTrigger value="updates" data-testid="tab-updates">
                    <Activity className="h-4 w-4 mr-2" />
                    Updates
                  </TabsTrigger>
                  )}
                </TabsList>

                {sections.loanChecklist && (
                <TabsContent value="checklist" className="space-y-4">
                  <LoanChecklist
                    dealId={project.id}
                    mode="borrower"
                    portalToken={token}
                    onUploadDoc={handleUploadClick}
                    pollingInterval={15000}
                    showTasks={true}
                  />
                </TabsContent>
                )}

                {sections.activityFeed && (
                <TabsContent value="updates">
                  <Card>
                    <CardContent className="pt-6">
                      {activity.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No updates yet
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {activity.map((item, i) => (
                            <div key={item.id} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className="h-2 w-2 rounded-full bg-primary" />
                                {i < activity.length - 1 && <div className="flex-1 w-px bg-border" />}
                              </div>
                              <div className="flex-1 pb-4">
                                <div className="text-sm">{item.activityDescription}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {formatDateTime(item.createdAt)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                )}
              </Tabs>
              )}
            </>
          )}

          {activeView === "inbox" && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">Inbox</h2>
                <p className="text-sm text-muted-foreground">Messages and notifications</p>
              </div>
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No messages yet. You'll see updates about your loan here.</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* My Documents View */}
          {activeView === "documents" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      My Documents
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground">Documents stored here persist across all your loans.</p>
                </CardHeader>
                <CardContent>
                  {!docsData?.documents?.length ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No documents yet. Documents you upload will be stored here for future loans.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {docsData.documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{doc.fileName}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {doc.category && <Badge variant="outline" className="text-[10px]">{doc.category.replace(/_/g, ' ')}</Badge>}
                                <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                {doc.fileSize && <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* My Profile View */}
          {activeView === "profile" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserCircle className="h-4 w-4" />
                      My Profile
                    </CardTitle>
                    {!editingProfile ? (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setProfileForm(profileData?.profile || {});
                        setEditingProfile(true);
                      }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingProfile(false)}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={() => updateProfileMutation.mutate(profileForm)} disabled={updateProfileMutation.isPending}>
                          <Save className="h-3.5 w-3.5 mr-1" /> Save
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Your profile information auto-populates new loan applications.</p>
                </CardHeader>
                <CardContent>
                  {!profileData?.profile ? (
                    <div className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading profile...</p>
                    </div>
                  ) : editingProfile ? (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Personal Information</h3>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div><Label className="text-xs">First Name</Label><Input value={profileForm.firstName || ''} onChange={(e) => setProfileForm({...profileForm, firstName: e.target.value})} /></div>
                          <div><Label className="text-xs">Last Name</Label><Input value={profileForm.lastName || ''} onChange={(e) => setProfileForm({...profileForm, lastName: e.target.value})} /></div>
                          <div><Label className="text-xs">Email</Label><Input value={profileForm.email || ''} disabled className="bg-muted" /></div>
                          <div><Label className="text-xs">Phone</Label><Input value={profileForm.phone || ''} onChange={(e) => setProfileForm({...profileForm, phone: formatPhoneNumber(e.target.value)})} /></div>
                          <div><Label className="text-xs">Date of Birth</Label><Input type="date" value={profileForm.dateOfBirth || ''} onChange={(e) => setProfileForm({...profileForm, dateOfBirth: e.target.value})} /></div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Address</h3>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2"><Label className="text-xs">Street Address</Label><Input value={profileForm.streetAddress || ''} onChange={(e) => setProfileForm({...profileForm, streetAddress: e.target.value})} /></div>
                          <div><Label className="text-xs">City</Label><Input value={profileForm.city || ''} onChange={(e) => setProfileForm({...profileForm, city: e.target.value})} /></div>
                          <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-xs">State</Label><Input value={profileForm.state || ''} onChange={(e) => setProfileForm({...profileForm, state: e.target.value})} /></div>
                            <div><Label className="text-xs">ZIP</Label><Input value={profileForm.zipCode || ''} onChange={(e) => setProfileForm({...profileForm, zipCode: e.target.value})} /></div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Identification</h3>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div><Label className="text-xs">SSN (last 4)</Label><Input maxLength={4} value={profileForm.ssnLast4 || ''} onChange={(e) => setProfileForm({...profileForm, ssnLast4: e.target.value})} /></div>
                          <div><Label className="text-xs">ID Type</Label><Input value={profileForm.idType || ''} onChange={(e) => setProfileForm({...profileForm, idType: e.target.value})} placeholder="e.g. Driver's License" /></div>
                          <div><Label className="text-xs">ID Number</Label><Input value={profileForm.idNumber || ''} onChange={(e) => setProfileForm({...profileForm, idNumber: e.target.value})} /></div>
                          <div><Label className="text-xs">ID Expiration</Label><Input type="date" value={profileForm.idExpirationDate || ''} onChange={(e) => setProfileForm({...profileForm, idExpirationDate: e.target.value})} /></div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Employment & Income</h3>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div><Label className="text-xs">Employer</Label><Input value={profileForm.employerName || ''} onChange={(e) => setProfileForm({...profileForm, employerName: e.target.value})} /></div>
                          <div><Label className="text-xs">Title</Label><Input value={profileForm.employmentTitle || ''} onChange={(e) => setProfileForm({...profileForm, employmentTitle: e.target.value})} /></div>
                          <div><Label className="text-xs">Annual Income</Label><Input type="number" value={profileForm.annualIncome || ''} onChange={(e) => setProfileForm({...profileForm, annualIncome: parseFloat(e.target.value) || null})} /></div>
                          <div><Label className="text-xs">Employment Type</Label><Input value={profileForm.employmentType || ''} onChange={(e) => setProfileForm({...profileForm, employmentType: e.target.value})} placeholder="e.g. employed, self-employed" /></div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Entity Information</h3>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div><Label className="text-xs">Entity Name</Label><Input value={profileForm.entityName || ''} onChange={(e) => setProfileForm({...profileForm, entityName: e.target.value})} /></div>
                          <div><Label className="text-xs">Entity Type</Label><Input value={profileForm.entityType || ''} onChange={(e) => setProfileForm({...profileForm, entityType: e.target.value})} placeholder="e.g. LLC, Corp, Trust" /></div>
                          <div><Label className="text-xs">EIN</Label><Input value={profileForm.einNumber || ''} onChange={(e) => setProfileForm({...profileForm, einNumber: e.target.value})} /></div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {(() => {
                        const p = profileData.profile;
                        const sections = [
                          { title: "Personal Information", fields: [
                            { label: "Name", value: [p.firstName, p.lastName].filter(Boolean).join(' ') },
                            { label: "Email", value: p.email },
                            { label: "Phone", value: p.phone },
                            { label: "Date of Birth", value: p.dateOfBirth },
                          ]},
                          { title: "Address", fields: [
                            { label: "Street", value: p.streetAddress },
                            { label: "City", value: p.city },
                            { label: "State", value: p.state },
                            { label: "ZIP", value: p.zipCode },
                          ]},
                          { title: "Identification", fields: [
                            { label: "SSN (last 4)", value: p.ssnLast4 ? `••••${p.ssnLast4}` : null },
                            { label: "ID Type", value: p.idType },
                            { label: "ID Number", value: p.idNumber },
                            { label: "ID Expiration", value: p.idExpirationDate },
                          ]},
                          { title: "Employment", fields: [
                            { label: "Employer", value: p.employerName },
                            { label: "Title", value: p.employmentTitle },
                            { label: "Income", value: p.annualIncome ? `$${p.annualIncome.toLocaleString()}` : null },
                            { label: "Type", value: p.employmentType },
                          ]},
                          { title: "Entity", fields: [
                            { label: "Entity Name", value: p.entityName },
                            { label: "Entity Type", value: p.entityType },
                            { label: "EIN", value: p.einNumber },
                          ]},
                        ];
                        return sections.map((section) => {
                          const hasValues = section.fields.some(f => f.value);
                          return (
                            <div key={section.title}>
                              <h3 className="text-sm font-semibold mb-2">{section.title}</h3>
                              {!hasValues ? (
                                <p className="text-xs text-muted-foreground italic">Not provided yet</p>
                              ) : (
                                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                                  {section.fields.filter(f => f.value).map((f) => (
                                    <div key={f.label} className="flex justify-between py-1 text-sm border-b border-dashed">
                                      <span className="text-muted-foreground">{f.label}</span>
                                      <span className="font-medium">{f.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {project.notes && activeView === "dashboard" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.notes}</p>
              </CardContent>
            </Card>
          )}
        </main>

        <footer className="border-t bg-background mt-auto">
          <div className="px-6 py-4 text-center text-sm text-muted-foreground">
            Loan Progress Portal - Powered by Lendry.AI
          </div>
        </footer>
      </div>
    </div>
  );
}

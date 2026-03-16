import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useState, useRef, useEffect, type ChangeEvent } from "react";
import {
  CheckCircle2,
  Building2,
  Calendar,
  DollarSign,
  FileText,
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
  ArrowRight,
  ArrowLeft,
  Bell,
  Send,
  Plus,
  Download,
  RefreshCw,
  Star,
  LinkIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getMessageFileMeta, getAttachmentDownloadUrl } from "@/lib/messagesApi";
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

interface PortalThread {
  id: number;
  dealId: number | null;
  subject: string | null;
  isClosed: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  dealName: string | null;
  dealIdentifier: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderRole: string | null;
  unreadCount: number;
}

interface PortalMessage {
  id: number;
  threadId: number;
  senderId: number | null;
  senderRole: 'admin' | 'user' | 'system';
  type: 'message' | 'notification';
  body: string;
  meta: Record<string, any> | null;
  createdAt: string;
  senderName?: string;
}

interface BorrowerPortalProps {
  token?: string;
  isPreview?: boolean;
}

export default function BorrowerPortal({ token: propToken, isPreview }: BorrowerPortalProps = {}) {
  const [, params] = useRoute("/portal/:token");
  const token = propToken || params?.token;
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
  const [activeView, setActiveView] = useState<PortalView>(() => {
    if (typeof window !== 'undefined') {
      const pending = sessionStorage.getItem('portal_open_deal');
      if (pending === token) {
        sessionStorage.removeItem('portal_open_deal');
        return "deal-detail";
      }
    }
    return "loans";
  });

  const [editingProfile, setEditingProfile] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [composing, setComposing] = useState(false);
  const [composeDealId, setComposeDealId] = useState<string>("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const docUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingGlobalDoc, setUploadingGlobalDoc] = useState(false);
  const [docUploadCategory, setDocUploadCategory] = useState<string>("other");
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

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ['/api/portal', token, 'messages', 'unread-count'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/messages/unread-count`);
      if (!res.ok) return { unreadCount: 0 };
      return res.json();
    },
    enabled: !!token && !showOnboarding,
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.unreadCount || 0;

  const { data: threadsData, isLoading: threadsLoading } = useQuery<{ threads: PortalThread[] }>({
    queryKey: ['/api/portal', token, 'messages', 'threads'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/messages/threads`);
      if (!res.ok) return { threads: [] };
      return res.json();
    },
    enabled: !!token && activeView === 'inbox',
  });
  const threads = threadsData?.threads || [];

  const { data: threadDetail, isLoading: threadDetailLoading } = useQuery<{ thread: any; messages: PortalMessage[] }>({
    queryKey: ['/api/portal', token, 'messages', 'threads', selectedThreadId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/messages/threads/${selectedThreadId}`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!token && !!selectedThreadId && activeView === 'inbox',
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ threadId, body }: { threadId: number; body: string }) => {
      const res = await apiRequest('POST', `/api/portal/${token}/messages/threads/${threadId}/messages`, { body });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'messages', 'threads', variables.threadId] });
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'messages', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'messages', 'unread-count'] });
      setNewMessage("");
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: async ({ dealId, subject, body }: { dealId: string; subject: string; body: string }) => {
      const res = await apiRequest('POST', `/api/portal/${token}/messages/threads`, { dealId: parseInt(dealId), subject, body });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'messages', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'messages', 'unread-count'] });
      setComposing(false);
      setComposeDealId("");
      setComposeSubject("");
      setComposeBody("");
      if (data.thread?.id) {
        setSelectedThreadId(data.thread.id);
      }
    },
    onError: () => {
      toast({ title: "Failed to create conversation", variant: "destructive" });
    },
  });

  const uploadGlobalDocMutation = useMutation({
    mutationFn: async ({ file, category }: { file: File; category: string }) => {
      setUploadingGlobalDoc(true);
      const urlRes = await fetch(`/api/portal/${token}/borrower-documents/upload-url`, {
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

      const saveRes = await apiRequest('POST', `/api/portal/${token}/borrower-documents`, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath: objectPath,
        category,
      });
      return saveRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'borrower-documents'] });
      setUploadingGlobalDoc(false);
      setDocUploadCategory("other");
      toast({ title: "Document uploaded" });
    },
    onError: (err: Error) => {
      setUploadingGlobalDoc(false);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const classificationMutation = useMutation({
    mutationFn: async ({ docId, classification }: { docId: number; classification: string }) => {
      return await apiRequest("PATCH", `/api/portal/${token}/borrower-documents/${docId}/classification`, {
        documentClassification: classification,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'borrower-documents'] });
    },
    onError: () => {
      toast({ title: "Failed to update document", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (selectedThreadId && token && activeView === 'inbox') {
      fetch(`/api/portal/${token}/messages/threads/${selectedThreadId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'messages', 'threads'] });
        queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'messages', 'unread-count'] });
      }).catch(() => {});
    }
  }, [selectedThreadId, token, activeView]);

  useEffect(() => {
    if (threadDetail?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadDetail?.messages]);

  const relatedDeals = relatedDealsData?.deals || [];
  const displayDeals = relatedDeals.length > 0
    ? relatedDeals
    : data?.project ? [{ id: data.project.id, dealName: data.project.projectName, propertyAddress: data.project.propertyAddress, loanAmount: data.project.loanAmount, loanType: data.project.loanType, status: data.project.status, currentStage: data.project.currentStage, portalToken: token!, programName: data.project.programName || null, isCurrent: true }]
    : [];

  const handleDealSwitch = (portalToken: string) => {
    if (portalToken !== token && !isPreview) {
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

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  return (
    <div className={`flex min-h-screen ${isPreview ? '' : 'bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'}`} data-testid="borrower-portal">
      {!isPreview && (
        <PortalSidebar
          portalType="borrower"
          activeView={activeView}
          onViewChange={setActiveView}
          dealName={project.projectName}
          userName={project.borrowerName || (profileData?.profile?.firstName ? `${profileData?.profile?.firstName || ''} ${profileData?.profile?.lastName || ''}`.trim() : undefined)}
          onSignOut={() => setLocation('/login')}
        />
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.txt"
        data-testid="input-file-upload"
      />

      <div className="flex-1 flex flex-col min-h-screen">
        <div className="flex items-center justify-end gap-2 px-4 md:px-6 py-2 bg-background border-b">
          <Button
            size="icon"
            className="relative h-7 w-7 rounded-full bg-[#C9A84C] hover:bg-[#C9A84C]/90 text-white"
            data-testid="button-portal-messages"
            onClick={() => {
              setActiveView("inbox");
              setSelectedThreadId(null);
            }}
          >
            <MessageSquare className="!h-3.5 !w-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center px-1" data-testid="badge-unread-count">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
          <Button
            size="icon"
            className="relative h-7 w-7 rounded-full bg-[#C9A84C] hover:bg-[#C9A84C]/90 text-white"
            data-testid="button-portal-notifications"
          >
            <Bell className="!h-3.5 !w-3.5" />
          </Button>
        </div>

        {activeView !== "loans" && activeView !== "deal-detail" && activeView !== "inbox" && (
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
        )}

        <main className="flex-1 px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
          {activeView === "loans" && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-bold font-ui">My Loans</h2>
                <p className="text-sm text-muted-foreground font-ui">Click a loan to view progress, details, and documents</p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm font-ui">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Loan</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Property</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Amount</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="w-[120px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayDeals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">
                          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No active loans yet.</p>
                        </td>
                      </tr>
                    ) : (
                      displayDeals.map((deal) => {
                        const isCurrent = deal.isCurrent;
                        return (
                          <tr
                            key={deal.id}
                            className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-3 px-3">
                              <div className="font-medium truncate" data-testid={`text-deal-name-${deal.id}`}>{deal.dealName}</div>
                              {deal.programName && <div className="text-[11px] text-muted-foreground">{deal.programName}</div>}
                            </td>
                            <td className="py-3 px-3 text-muted-foreground truncate max-w-[200px]">{deal.propertyAddress || '—'}</td>
                            <td className="py-3 px-3 font-medium">{deal.loanAmount ? formatCurrency(deal.loanAmount) : '—'}</td>
                            <td className="py-3 px-3">
                              <Badge variant={deal.status === 'active' ? 'default' : 'secondary'} className="text-[11px]" data-testid={`badge-status-${deal.id}`}>
                                {deal.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (isCurrent) {
                                    setActiveView("deal-detail");
                                  } else {
                                    sessionStorage.setItem('portal_open_deal', deal.portalToken);
                                    handleDealSwitch(deal.portalToken);
                                  }
                                }}
                                data-testid={`btn-open-deal-${deal.id}`}
                              >
                                Open Deal <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeView === "deal-detail" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveView("loans")}
                  data-testid="btn-back-to-loans"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to My Loans
                </Button>
              </div>

              <div className="border-b pb-4">
                <div className="text-xs text-muted-foreground font-mono">{project.loanNumber || `DEAL-${project.id}`}</div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <h2 className="text-xl font-bold font-ui" data-testid="text-deal-title">{project.projectName}</h2>
                  {project.programName && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-program-name">
                      {project.programName}
                    </Badge>
                  )}
                  <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="text-xs" data-testid="badge-deal-status">
                    {project.status}
                  </Badge>
                </div>
              </div>

              {sections.stageProgress && stages.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold font-ui">Loan Progress</h4>
                    <span className="text-sm font-bold" data-testid="text-deal-progress">
                      {(() => {
                        let totalItems = 0;
                        let completedItems = 0;
                        stages.forEach(stage => {
                          const completed = (stage.tasks || []).filter((t: Task) => t.status === 'completed').length;
                          totalItems += (stage.tasks || []).length;
                          completedItems += completed;
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
                      const isActiveStage = stage.status === 'in_progress';
                      return (
                        <div key={stage.id} className="flex flex-col items-center relative flex-1">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 flex-shrink-0 z-10 ${
                            isCompleted ? 'bg-success border-success text-white' :
                            isActiveStage ? 'bg-primary border-primary text-white' :
                            'bg-muted border-border text-muted-foreground'
                          }`}>
                            {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                          </div>
                          <div className="mt-1.5 text-center max-w-[90px]">
                            <div className={`text-[10px] font-medium leading-tight ${
                              isCompleted ? 'text-success' : isActiveStage ? 'text-primary font-semibold' : 'text-muted-foreground'
                            }`}>{stage.stageName}</div>
                            {totalItems > 0 && <div className="text-[10px] text-muted-foreground">{completedTasks}/{totalItems}</div>}
                          </div>
                          {i < stages.length - 1 && (
                            <div className={`absolute top-4 left-[calc(50%+16px)] h-[2px] z-0 ${isCompleted ? 'bg-success/50' : 'bg-border'}`} style={{ width: 'calc(100% - 32px)' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {sections.dealOverview && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {fieldVisibility.loanAmount && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-success flex-shrink-0" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">Loan Amount</div>
                        <div className="text-sm font-semibold">{formatCurrency(project.loanAmount)}</div>
                      </div>
                    </div>
                  )}
                  {fieldVisibility.interestRate && (
                    <div className="flex items-center gap-2">
                      <span className="text-info font-semibold text-xs flex-shrink-0">%</span>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Interest Rate</div>
                        <div className="text-sm font-semibold">{project.interestRate ? `${project.interestRate}%` : '—'}</div>
                      </div>
                    </div>
                  )}
                  {fieldVisibility.targetCloseDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">Target Close</div>
                        <div className="text-sm font-semibold">{formatDate(project.targetCloseDate)}</div>
                      </div>
                    </div>
                  )}
                  {fieldVisibility.propertyAddress && project.propertyAddress && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">Property</div>
                        <div className="text-sm font-semibold truncate">{project.propertyAddress}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sections.loanChecklist && (
                <div>
                  <LoanChecklist
                    dealId={project.id}
                    mode="borrower"
                    portalToken={token}
                    onUploadDoc={handleUploadClick}
                    pollingInterval={15000}
                    showTasks={true}
                  />
                </div>
              )}
            </div>
          )}

          {activeView === "inbox" && (
            <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
              <div className="mb-4">
                <h2 className="text-xl font-bold font-ui">Inbox</h2>
                <p className="text-sm text-muted-foreground font-ui">Messages about your loans</p>
              </div>

              <div className="flex flex-1 border rounded-lg overflow-hidden bg-background min-h-0">
                <div className="w-[280px] md:w-[320px] border-r flex flex-col shrink-0">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversations</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => { setComposing(true); setSelectedThreadId(null); }}
                      data-testid="button-new-message"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> New
                    </Button>
                  </div>
                  <ScrollArea className="flex-1">
                    {threadsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : threads.length === 0 ? (
                      <div className="text-center py-12 px-4">
                        <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No conversations yet</p>
                      </div>
                    ) : (
                      threads.map((thread) => (
                        <button
                          key={thread.id}
                          className={`w-full text-left px-3 py-3 border-b hover:bg-muted/50 transition-colors ${
                            selectedThreadId === thread.id ? 'bg-muted' : ''
                          }`}
                          onClick={() => { setSelectedThreadId(thread.id); setComposing(false); }}
                          data-testid={`thread-item-${thread.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium truncate">
                                  {thread.dealName || thread.subject || 'Conversation'}
                                </span>
                                {thread.unreadCount > 0 && (
                                  <span className="h-4 min-w-[16px] rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center px-1 shrink-0">
                                    {thread.unreadCount}
                                  </span>
                                )}
                              </div>
                              {thread.dealIdentifier && (
                                <div className="text-[11px] text-muted-foreground font-mono">{thread.dealIdentifier}</div>
                              )}
                              {thread.lastMessagePreview && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {thread.lastMessageSenderRole === 'user' ? 'You: ' : ''}
                                  {thread.lastMessagePreview}
                                </p>
                              )}
                            </div>
                            {thread.lastMessageAt && (
                              <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                                {formatDate(thread.lastMessageAt)}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </ScrollArea>
                </div>

                <div className="flex-1 flex flex-col min-w-0">
                  {composing ? (
                    <div className="flex-1 flex flex-col p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold">New Conversation</h3>
                        <Button variant="ghost" size="sm" onClick={() => setComposing(false)} data-testid="button-cancel-compose">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-3 flex-1 flex flex-col">
                        <div>
                          <Label className="text-xs mb-1 block">Loan</Label>
                          <Select value={composeDealId} onValueChange={setComposeDealId}>
                            <SelectTrigger data-testid="select-compose-deal">
                              <SelectValue placeholder="Select a loan..." />
                            </SelectTrigger>
                            <SelectContent>
                              {displayDeals.map((deal) => (
                                <SelectItem key={deal.id} value={String(deal.id)} data-testid={`option-deal-${deal.id}`}>
                                  {deal.dealName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Subject (optional)</Label>
                          <Input
                            value={composeSubject}
                            onChange={(e) => setComposeSubject(e.target.value)}
                            placeholder="e.g. Question about my loan"
                            data-testid="input-compose-subject"
                          />
                        </div>
                        <div className="flex-1 flex flex-col">
                          <Label className="text-xs mb-1 block">Message</Label>
                          <Textarea
                            value={composeBody}
                            onChange={(e) => setComposeBody(e.target.value)}
                            placeholder="Type your message..."
                            className="flex-1 min-h-[120px] resize-none text-sm"
                            data-testid="input-compose-body"
                          />
                        </div>
                        <Button
                          className="self-end"
                          disabled={!composeDealId || !composeBody.trim() || createThreadMutation.isPending}
                          onClick={() => {
                            if (composeDealId && composeBody.trim()) {
                              createThreadMutation.mutate({ dealId: composeDealId, subject: composeSubject.trim(), body: composeBody.trim() });
                            }
                          }}
                          data-testid="button-send-compose"
                        >
                          {createThreadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                          Send Message
                        </Button>
                      </div>
                    </div>
                  ) : !selectedThreadId ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <MessageSquare className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">Select a conversation or start a new one</p>
                      </div>
                    </div>
                  ) : threadDetailLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {threadDetail?.thread?.subject || threads.find(t => t.id === selectedThreadId)?.dealName || 'Conversation'}
                          </div>
                          {threads.find(t => t.id === selectedThreadId)?.dealIdentifier && (
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {threads.find(t => t.id === selectedThreadId)?.dealIdentifier}
                            </div>
                          )}
                        </div>
                      </div>

                      <ScrollArea className="flex-1 px-4 py-3">
                        <div className="space-y-3">
                          {(threadDetail?.messages || []).map((msg) => {
                            const isUser = msg.senderRole === 'user';
                            return (
                              <div
                                key={msg.id}
                                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                                data-testid={`message-${msg.id}`}
                              >
                                <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                                  isUser
                                    ? 'bg-primary text-primary-foreground'
                                    : msg.senderRole === 'system'
                                    ? 'bg-muted/50 border'
                                    : 'bg-muted'
                                }`}>
                                  {!isUser && (
                                    <div className="text-[11px] font-medium mb-0.5 opacity-70">
                                      {msg.senderName || (msg.senderRole === 'system' ? 'System' : 'Lender')}
                                    </div>
                                  )}
                                  <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                                  {(() => {
                                    const fileMeta = getMessageFileMeta(msg.meta);
                                    if (!fileMeta?.objectPath) return null;
                                    const downloadUrl = getAttachmentDownloadUrl(fileMeta.objectPath);
                                    return (
                                    <div className="mt-2 flex items-center gap-2 p-2 rounded-md border bg-background/50">
                                      <div className="flex items-center justify-center h-8 w-8 rounded bg-red-100 dark:bg-red-900/30 shrink-0">
                                        <FileText className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <a
                                          href={downloadUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[12px] font-medium truncate block hover:underline cursor-pointer"
                                          data-testid={`link-view-attachment-${msg.id}`}
                                        >
                                          {fileMeta.fileName}
                                        </a>
                                        <div className="text-[10px] text-muted-foreground">
                                          {fileMeta.fileType || 'File'} {fileMeta.fileSize || ''}
                                        </div>
                                      </div>
                                      <a
                                        href={downloadUrl}
                                        download={fileMeta.fileName}
                                        className="shrink-0"
                                        data-testid={`button-download-attachment-${msg.id}`}
                                      >
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                      </a>
                                    </div>
                                    );
                                  })()}
                                  <div className={`text-[10px] mt-1 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                    {formatDateTime(msg.createdAt)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div ref={messagesEndRef} />
                        </div>
                      </ScrollArea>

                      <div className="border-t p-3">
                        <div className="flex items-end gap-2">
                          <Textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Type a message..."
                            className="min-h-[40px] max-h-[120px] resize-none text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (newMessage.trim() && selectedThreadId) {
                                  sendMessageMutation.mutate({ threadId: selectedThreadId, body: newMessage.trim() });
                                }
                              }
                            }}
                            data-testid="input-message"
                          />
                          <Button
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            disabled={!newMessage.trim() || sendMessageMutation.isPending}
                            onClick={() => {
                              if (newMessage.trim() && selectedThreadId) {
                                sendMessageMutation.mutate({ threadId: selectedThreadId, body: newMessage.trim() });
                              }
                            }}
                            data-testid="button-send-message"
                          >
                            {sendMessageMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* My Documents View */}
          {activeView === "documents" && (() => {
            const categoryLabels: Record<string, string> = {
              id_document: "Identification",
              tax_return: "Tax Returns",
              bank_statement: "Bank Statements",
              pay_stub: "Pay Stubs",
              entity_docs: "Entity Documents",
              insurance: "Insurance",
              appraisal: "Appraisal",
              contract: "Contract",
              other: "Other",
            };
            const allDocs = docsData?.documents || [];
            const profileDocs = allDocs.filter((d: any) =>
              d.documentClassification === 'profile'
            );
            const standaloneDocs = allDocs.filter((d: any) =>
              d.documentClassification !== 'profile'
            );

            const handleGlobalDocUpload = (e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (file) {
                uploadGlobalDocMutation.mutate({ file, category: docUploadCategory });
              }
              if (docUploadRef.current) docUploadRef.current.value = '';
            };

            const renderDocRow = (doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`doc-row-${doc.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {doc.documentClassification === 'profile' ? (
                    <Star className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {doc.category && (
                        <Badge variant="outline" className="text-[10px]">
                          {categoryLabels[doc.category] || doc.category.replace(/_/g, ' ')}
                        </Badge>
                      )}
                      {doc.documentClassification === 'profile' && (
                        <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-200">
                          <Star className="h-2.5 w-2.5 mr-0.5" /> Kept for future deals
                        </Badge>
                      )}
                      {doc.sourceDealName && (
                        <span className="flex items-center gap-0.5">
                          <LinkIcon className="h-2.5 w-2.5" />
                          From: {doc.sourceDealName}
                        </span>
                      )}
                      <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      {doc.fileSize && <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5" title="Keep for future deals">
                    <Switch
                      checked={doc.documentClassification === 'profile'}
                      onCheckedChange={(checked) =>
                        classificationMutation.mutate({
                          docId: doc.id,
                          classification: checked ? 'profile' : 'standalone',
                        })
                      }
                      data-testid={`toggle-keep-doc-${doc.id}`}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">Keep</span>
                  </div>
                  {doc.storagePath && (
                    <a href={doc.storagePath} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            );

            return (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      My Documents
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={docUploadCategory} onValueChange={setDocUploadCategory}>
                        <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-doc-category">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id_document">Identification</SelectItem>
                          <SelectItem value="tax_return">Tax Returns</SelectItem>
                          <SelectItem value="bank_statement">Bank Statements</SelectItem>
                          <SelectItem value="pay_stub">Pay Stubs</SelectItem>
                          <SelectItem value="entity_docs">Entity Documents</SelectItem>
                          <SelectItem value="insurance">Insurance</SelectItem>
                          <SelectItem value="appraisal">Appraisal</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() => docUploadRef.current?.click()}
                        disabled={uploadingGlobalDoc}
                        data-testid="button-upload-document"
                      >
                        {uploadingGlobalDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        Upload
                      </Button>
                      <input ref={docUploadRef} type="file" className="hidden" onChange={handleGlobalDocUpload} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Documents stored here persist across all your loans. Profile documents auto-fill future applications.</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!allDocs.length ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No documents yet. Upload documents to store them for current and future loans.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profile Documents</h3>
                          <Badge variant="outline" className="text-[10px]">{profileDocs.length}</Badge>
                        </div>
                        {profileDocs.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-3 pl-2">No profile documents uploaded yet. Upload IDs, tax returns, or bank statements to auto-fill future loans.</p>
                        ) : (
                          <div className="space-y-2">
                            {profileDocs.map(renderDocRow)}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Other Documents</h3>
                          <Badge variant="outline" className="text-[10px]">{standaloneDocs.length}</Badge>
                        </div>
                        {standaloneDocs.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-3 pl-2">No other documents uploaded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {standaloneDocs.map(renderDocRow)}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
            );
          })()}

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

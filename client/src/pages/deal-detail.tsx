import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle,
  ExternalLink,
  Copy,
  Send,
  MoreHorizontal,
  Building2,
  Calendar,
  DollarSign,
  User,
  Mail,
  Phone,
  FileText,
  Activity,
  CheckSquare,
  MapPin,
  RefreshCw,
  Upload,
  FolderOpen,
  CloudOff,
  Loader2,
  HardDrive,
  Download,
  Trash2,
  MessageSquare,
  Smartphone,
  PhoneCall,
  AtSign,
  Users
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { LoanChecklist } from "@/components/LoanChecklist";

interface Task {
  id: number;
  taskTitle: string;
  taskType: string;
  priority: string;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  assignedTo: string | null;
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
  startedAt: string | null;
  completedAt: string | null;
  tasks: Task[];
}

interface ActivityItem {
  id: number;
  activityType: string;
  activityDescription: string;
  createdAt: string;
  visibleToBorrower: boolean;
}

interface ProjectDocument {
  id: number;
  projectId: number;
  documentName: string;
  documentType: string | null;
  documentCategory: string;
  filePath: string;
  fileSize: number | null;
  uploadedBy: number;
  status: string;
  uploadedAt: string;
  googleDriveFileId: string | null;
  googleDriveFileUrl: string | null;
  driveUploadStatus: string;
  driveUploadError: string | null;
}

interface DealDocument {
  id: number;
  dealId: number;
  stageId: number | null;
  documentName: string;
  documentCategory: string | null;
  documentDescription: string | null;
  status: string;
  isRequired: boolean;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string | null;
  reviewNotes: string | null;
  sortOrder: number;
}

interface Deal {
  id: number;
  dealNumber: string;
  dealName: string;
  status: string;
  currentStage: string;
  progressPercentage: number;
  borrowerName: string;
  borrowerEmail: string;
  borrowerPhone: string | null;
  loanAmount: number | null;
  interestRate: number | null;
  loanTermMonths: number | null;
  loanType: string | null;
  propertyAddress: string | null;
  propertyType: string | null;
  targetCloseDate: string | null;
  applicationDate: string | null;
  borrowerPortalEnabled: boolean;
  borrowerPortalToken: string | null;
  notes: string | null;
  createdAt: string;
  googleDriveFolderId: string | null;
  googleDriveFolderUrl: string | null;
  driveSyncStatus: string;
  programId?: number | null;
  programName?: string | null;
}

interface DealProcessor {
  id: number;
  userId: number;
  role: string;
  assignedAt: string;
  user: {
    id: number;
    fullName: string;
    email: string;
    phone: string | null;
  };
}

interface MessageThread {
  id: number;
  dealId: number | null;
  userId: number;
  subject: string | null;
  lastMessageAt: string;
}

interface Message {
  id: number;
  threadId: number;
  senderId: number | null;
  senderRole: string;
  body: string;
  createdAt: string;
  senderName?: string;
}


export default function ProjectDetail() {
  const [, params] = useRoute("/deals/:id");
  const projectId = params?.id;
  const { toast } = useToast();
  const { user } = useAuth();
  const isBorrower = user?.userType === 'borrower';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dealDocFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [uploadingDealDocId, setUploadingDealDocId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [newThreadSubject, setNewThreadSubject] = useState("");
  const [newThreadMessage, setNewThreadMessage] = useState("");

  const { data, isLoading, refetch } = useQuery<{ 
    deal: Deal; 
    stages: Stage[]; 
    activity: ActivityItem[];
    processors?: DealProcessor[];
  }>({
    queryKey: ['/api/deals', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${projectId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch deal');
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: docsData, refetch: refetchDocs } = useQuery<{ documents: ProjectDocument[] }>({
    queryKey: ['/api/deals', projectId, 'documents'],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${projectId}/documents`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch documents');
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: dealDocsData, refetch: refetchDealDocs } = useQuery<DealDocument[]>({
    queryKey: ['/api/deals', projectId, 'deal-documents'],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${projectId}/deal-documents`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch deal documents');
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: threadsData, refetch: refetchThreads } = useQuery<{ threads: MessageThread[] }>({
    queryKey: ['/api/messages/threads', { dealId: projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/messages/threads?dealId=${projectId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch threads');
      return res.json();
    },
    enabled: !!projectId,
  });

  const currentThread = threadsData?.threads?.[0];

  const { data: threadMessagesData, refetch: refetchMessages } = useQuery<{ thread: MessageThread; messages: Message[] }>({
    queryKey: ['/api/messages/threads', currentThread?.id],
    queryFn: async () => {
      const res = await fetch(`/api/messages/threads/${currentThread!.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!currentThread?.id,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      return apiRequest('PATCH', `/api/deals/${projectId}/tasks/${taskId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals', projectId] });
      toast({ title: "Task updated" });
    },
  });

  const retryDriveFolderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/deals/${projectId}/drive/retry`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals', projectId] });
      toast({ title: "Drive folder sync retried" });
    },
    onError: () => {
      toast({ title: "Drive folder sync failed", variant: "destructive" });
    },
  });

  const retryDriveDocMutation = useMutation({
    mutationFn: async (docId: number) => {
      return apiRequest('POST', `/api/documents/${docId}/drive/retry`, {});
    },
    onSuccess: () => {
      refetchDocs();
      toast({ title: "Drive upload retried" });
    },
    onError: () => {
      toast({ title: "Drive upload retry failed", variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ threadId, body }: { threadId: number; body: string }) => {
      return apiRequest('POST', `/api/messages/threads/${threadId}/messages`, { body, type: 'message' });
    },
    onSuccess: () => {
      setNewMessage("");
      refetchMessages();
      refetchThreads();
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: async ({ dealId, subject, message }: { dealId: number; subject: string; message: string }) => {
      const threadRes = await apiRequest('POST', '/api/messages/threads', { 
        dealId, 
        userId: user!.id, 
        subject: subject || 'Message about loan' 
      });
      const threadData = await threadRes.json();
      await apiRequest('POST', `/api/messages/threads/${threadData.thread.id}/messages`, { 
        body: message, 
        type: 'message' 
      });
      return threadData;
    },
    onSuccess: () => {
      setNewThreadSubject("");
      setNewThreadMessage("");
      refetchThreads();
      toast({ title: "Message sent" });
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const handleFileUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const fileName = file.name;
      setUploadingFiles(prev => [...prev, fileName]);
      try {
        const urlRes = await apiRequest('POST', `/api/deals/${projectId}/documents/upload-url`, {
          name: file.name,
          size: file.size,
          contentType: file.type,
        });
        const urlData = await urlRes.json();

        await fetch(urlData.uploadURL, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });

        await apiRequest('POST', `/api/deals/${projectId}/documents/upload-complete`, {
          objectPath: urlData.objectPath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        toast({ title: `Uploaded: ${file.name}` });
      } catch (err) {
        toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
      } finally {
        setUploadingFiles(prev => prev.filter(f => f !== fileName));
      }
    }
    refetchDocs();
    refetch();
  }, [projectId, toast, refetchDocs, refetch]);

  const handleDealDocUpload = useCallback(async (docId: number, file: File) => {
    setUploadingDealDocId(docId);
    try {
      const urlRes = await apiRequest('POST', `/api/deals/${projectId}/documents/upload-url`, {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const urlData = await urlRes.json();

      await fetch(urlData.uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      await apiRequest('POST', `/api/deals/${projectId}/deal-documents/${docId}/upload-complete`, {
        objectPath: urlData.objectPath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      toast({ title: `Uploaded: ${file.name}` });
      refetchDealDocs();
    } catch (err) {
      toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
    } finally {
      setUploadingDealDocId(null);
    }
  }, [projectId, toast, refetchDealDocs]);

  const copyBorrowerLink = async () => {
    try {
      const res = await fetch(`/api/deals/${projectId}/borrower-link`, { credentials: 'include' });
      const { borrowerLink } = await res.json();
      await navigator.clipboard.writeText(borrowerLink);
      toast({ title: "Borrower portal link copied" });
    } catch (e) {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const pushToLOS = async () => {
    try {
      await apiRequest('POST', `/api/deals/${projectId}/push-to-los`, {});
      toast({ title: "Deal pushed to LOS" });
      refetch();
    } catch (e) {
      toast({ title: "Failed to push to LOS", variant: "destructive" });
    }
  };

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48"></div>
          <div className="h-48 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  const { project, stages, activity, processors } = data;

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

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-info" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical': return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case 'high': return <Badge variant="secondary" className="bg-warning/10 text-warning text-xs">High</Badge>;
      case 'medium': return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      default: return null;
    }
  };

  const getDealDocStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-success/10 text-success text-xs">Approved</Badge>;
      case 'uploaded': return <Badge className="bg-info/10 text-info text-xs">Uploaded</Badge>;
      case 'rejected': return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
      case 'not_applicable': return <Badge variant="secondary" className="text-xs">N/A</Badge>;
      default: return <Badge variant="outline" className="text-xs">Pending</Badge>;
    }
  };

  const filteredActivity = isBorrower 
    ? activity.filter(item => item.visibleToBorrower) 
    : activity.filter(item => {
        const desc = (item.activityDescription || '').toLowerCase();
        if (item.activityType === 'task_completed' || item.activityType === 'task_updated') {
          if (desc.includes('internal') || desc.includes('admin task')) return false;
        }
        return item.visibleToBorrower !== false;
      });

  const filterTasksForRole = (tasks: Task[]) => {
    if (isBorrower) {
      return tasks.filter(t => {
        const assignee = (t.assignedTo || '').toLowerCase();
        return t.visibleToBorrower !== false && (assignee === '' || assignee === 'borrower' || assignee === 'all');
      });
    }
    return tasks.filter(t => {
      const assignee = (t.assignedTo || '').toLowerCase();
      return assignee === '' || assignee === 'broker' || assignee === 'borrower' || assignee === 'all';
    });
  };

  const filteredStages = stages.map(stage => ({
    ...stage,
    tasks: filterTasksForRole(stage.tasks),
  }));

  const dealDocsByStage = stages.map(stage => ({
    stageId: stage.id,
    stageName: stage.stageName,
    stageOrder: stage.stageOrder,
    docs: (dealDocsData || []).filter(d => d.stageId === stage.id),
  }));
  const unstagedDealDocs = (dealDocsData || []).filter(d => !d.stageId || !stages.find(s => s.id === d.stageId));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/deals">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-mono tracking-tight">DEAL-{project.id}</span>
            <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
              {project.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-deal-name">{project.dealName}</h1>
            {project.programName && (
              <Badge variant="outline" data-testid="badge-program-name">
                {project.programName}
              </Badge>
            )}
          </div>
          {!isBorrower && project.driveSyncStatus === 'OK' && project.googleDriveFolderId && (
            <a 
              href={`https://drive.google.com/drive/folders/${project.googleDriveFolderId}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              data-testid="link-drive-folder"
            >
              <HardDrive className="h-3 w-3" />
              Google Drive Folder
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {!isBorrower && project.driveSyncStatus === 'PENDING' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing Drive folder...
            </span>
          )}
          {!isBorrower && project.driveSyncStatus === 'ERROR' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
              <CloudOff className="h-3 w-3" />
              Drive folder sync failed
            </span>
          )}
        </div>
        {!isBorrower && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyBorrowerLink} data-testid="button-copy-portal-link">
              <Copy className="h-4 w-4 mr-2" />
              Borrower Link
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-more-actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={pushToLOS}>
                  <Send className="h-4 w-4 mr-2" />
                  Push to LOS
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Borrower Portal
                </DropdownMenuItem>
                {project.googleDriveFolderId && (
                  <DropdownMenuItem onClick={() => window.open(`https://drive.google.com/drive/folders/${project.googleDriveFolderId}`, '_blank')}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Open Drive Folder
                  </DropdownMenuItem>
                )}
                {project.driveSyncStatus === 'ERROR' && (
                  <DropdownMenuItem onClick={() => retryDriveFolderMutation.mutate()} disabled={retryDriveFolderMutation.isPending}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Drive Folder Sync
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {isBorrower ? (
        <>
          {filteredStages.length > 0 && (() => {
            const computeStageProgress = (stage: Stage) => {
              const completedTasks = stage.tasks.filter(t => t.status === 'completed').length;
              const totalTasks = stage.tasks.length;
              const stageDocs = (dealDocsData || []).filter(d => d.stageId === stage.id);
              const completedDocs = stageDocs.filter(d => d.status === 'approved' || d.status === 'uploaded').length;
              const totalItems = totalTasks + stageDocs.length;
              const completedItems = completedTasks + completedDocs;
              return { completedItems, totalItems };
            };
            
            let totalItems = 0;
            let completedItems = 0;
            filteredStages.forEach(stage => {
              const progress = computeStageProgress(stage);
              totalItems += progress.totalItems;
              completedItems += progress.completedItems;
            });
            const unstagedDocs = (dealDocsData || []).filter(d => !d.stageId || !filteredStages.find(s => s.id === d.stageId));
            totalItems += unstagedDocs.length;
            completedItems += unstagedDocs.filter(d => d.status === 'approved' || d.status === 'uploaded').length;
            const overallPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
            
            return (
              <Card data-testid="card-loan-progress">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold">Loan Progress</h3>
                    <span className="text-2xl font-bold" data-testid="text-overall-progress">{overallPercent}% Complete</span>
                  </div>
                  <div className="flex items-start justify-between relative">
                    {filteredStages.map((stage, i) => {
                      const progress = computeStageProgress(stage);
                      const isCompleted = progress.totalItems > 0 && progress.completedItems >= progress.totalItems;
                      const isActive = stage.status === 'in_progress';
                      return (
                        <div key={stage.id} className="flex flex-col items-center relative flex-1" data-testid={`progress-stage-${stage.id}`}>
                          <div
                            className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-semibold border-[3px] flex-shrink-0 transition-all z-10 ${
                              isCompleted ? 'bg-success border-success text-white' :
                              isActive ? 'bg-primary border-primary text-white' :
                              'bg-muted border-border text-muted-foreground'
                            }`}
                            data-testid={`stage-indicator-${stage.id}`}
                          >
                            {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                          </div>
                          <div className="mt-3 text-center max-w-[120px]">
                            <div className={`text-[13px] font-medium leading-tight ${
                              isCompleted ? 'text-success' :
                              isActive ? 'text-primary font-semibold' :
                              'text-muted-foreground'
                            }`}>
                              {stage.stageName}
                            </div>
                            {progress.totalItems > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {progress.completedItems}/{progress.totalItems}
                              </div>
                            )}
                          </div>
                          {i < filteredStages.length - 1 && (
                            <div
                              className={`absolute top-6 left-[calc(50%+24px)] h-[3px] z-0 ${
                                isCompleted ? 'bg-success/50' : 'bg-border'
                              }`}
                              style={{ width: 'calc(100% - 48px)' }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {project.programName && (
                    <div className="border-t mt-5 pt-3">
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
            );
          })()}

          <div className="grid md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-success" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Loan Amount</div>
                  <div className="font-semibold">{formatCurrency(project.loanAmount)}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                  <span className="text-info font-semibold text-sm">%</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Interest Rate</div>
                  <div className="font-semibold">{project.interestRate ? `${project.interestRate}%` : '—'}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Term</div>
                  <div className="font-semibold">{project.loanTermMonths ? `${project.loanTermMonths} months` : '—'}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Property</div>
                  <div className="font-semibold truncate">{project.propertyType || '—'}</div>
                </div>
              </div>
            </Card>
          </div>

          {project.propertyAddress && (
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Property Address:</span>
                <span className="text-sm text-muted-foreground">{project.propertyAddress}</span>
              </div>
            </Card>
          )}

          <Tabs defaultValue="checklist" className="space-y-4">
            <TabsList>
              <TabsTrigger value="checklist" data-testid="tab-checklist">
                <CheckSquare className="h-4 w-4 mr-2" />
                Checklist
              </TabsTrigger>
              <TabsTrigger value="messages" data-testid="tab-messages">
                <MessageSquare className="h-4 w-4 mr-2" />
                Messages
              </TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">
                <Activity className="h-4 w-4 mr-2" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="space-y-4">
              <input
                ref={dealDocFileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0 && uploadingDealDocId) {
                    handleDealDocUpload(uploadingDealDocId, e.target.files[0]);
                    e.target.value = '';
                  }
                }}
                data-testid="input-deal-doc-upload"
              />
              <LoanChecklist
                dealId={parseInt(projectId!)}
                mode="broker"
                onUploadDoc={(docId) => {
                  setUploadingDealDocId(docId);
                  dealDocFileInputRef.current?.click();
                }}
                pollingInterval={15000}
                showTasks={true}
              />
            </TabsContent>

            <TabsContent value="messages">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Messages
                  </CardTitle>
                  <CardDescription>Communicate with your loan team</CardDescription>
                </CardHeader>
                <CardContent>
                  {!currentThread ? (
                    <div className="space-y-4">
                      <div className="text-center py-4 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No messages yet. Start a conversation with your loan team.</p>
                      </div>
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Subject (optional)"
                          value={newThreadSubject}
                          onChange={(e) => setNewThreadSubject(e.target.value)}
                          className="resize-none"
                          rows={1}
                          data-testid="input-thread-subject"
                        />
                        <Textarea
                          placeholder="Type your message..."
                          value={newThreadMessage}
                          onChange={(e) => setNewThreadMessage(e.target.value)}
                          className="resize-none"
                          rows={3}
                          data-testid="input-thread-message"
                        />
                        <Button
                          onClick={() => {
                            if (newThreadMessage.trim() && projectId) {
                              createThreadMutation.mutate({
                                dealId: parseInt(projectId),
                                subject: newThreadSubject,
                                message: newThreadMessage,
                              });
                            }
                          }}
                          disabled={!newThreadMessage.trim() || createThreadMutation.isPending}
                          data-testid="button-send-first-message"
                        >
                          {createThreadMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send Message
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {threadMessagesData?.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`p-3 rounded-md ${
                              msg.senderId === user?.id 
                                ? 'bg-primary/10 ml-8' 
                                : 'bg-muted/50 mr-8'
                            }`}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium">
                                {msg.senderName || (msg.senderId === user?.id ? 'You' : 'Team')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(msg.createdAt)}
                              </span>
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
                          </div>
                        ))}
                        {(!threadMessagesData?.messages || threadMessagesData.messages.length === 0) && (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No messages in this thread yet
                          </div>
                        )}
                      </div>
                      <Separator />
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Type a reply..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          className="resize-none flex-1"
                          rows={2}
                          data-testid="input-reply-message"
                        />
                        <Button
                          size="icon"
                          onClick={() => {
                            if (newMessage.trim() && currentThread) {
                              sendMessageMutation.mutate({
                                threadId: currentThread.id,
                                body: newMessage,
                              });
                            }
                          }}
                          disabled={!newMessage.trim() || sendMessageMutation.isPending}
                          data-testid="button-send-reply"
                        >
                          {sendMessageMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
              <Card>
                <CardContent className="pt-6">
                  {filteredActivity.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No activity yet
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredActivity.map((item, i) => (
                        <div key={item.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-2 w-2 rounded-full bg-primary" />
                            {i < filteredActivity.length - 1 && <div className="flex-1 w-px bg-border" />}
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
          </Tabs>
        </>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2" data-testid="card-loan-progress">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold">Loan Progress</h3>
                  <span className="text-2xl font-bold" data-testid="text-overall-progress">{(() => {
                    let totalItems = 0;
                    let completedItems = 0;
                    filteredStages.forEach(stage => {
                      const completedTasks = stage.tasks.filter(t => t.status === 'completed').length;
                      const stageDocs = (dealDocsData || []).filter(d => d.stageId === stage.id);
                      const completedDocs = stageDocs.filter(d => d.status === 'approved' || d.status === 'uploaded').length;
                      totalItems += stage.tasks.length + stageDocs.length;
                      completedItems += completedTasks + completedDocs;
                    });
                    const unstagedDocs = (dealDocsData || []).filter(d => !d.stageId || !filteredStages.find(s => s.id === d.stageId));
                    totalItems += unstagedDocs.length;
                    completedItems += unstagedDocs.filter(d => d.status === 'approved' || d.status === 'uploaded').length;
                    return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                  })()}% Complete</span>
                </div>
                <div className="flex items-start justify-between relative">
                  {filteredStages.map((stage, i) => {
                    const completedTasks = stage.tasks.filter(t => t.status === 'completed').length;
                    const stageDocs = (dealDocsData || []).filter(d => d.stageId === stage.id);
                    const completedDocs = stageDocs.filter(d => d.status === 'approved' || d.status === 'uploaded').length;
                    const totalItems = stage.tasks.length + stageDocs.length;
                    const completedItemsCount = completedTasks + completedDocs;
                    const isCompleted = totalItems > 0 && completedItemsCount >= totalItems;
                    const isActive = stage.status === 'in_progress';
                    return (
                      <div key={stage.id} className="flex flex-col items-center relative flex-1" data-testid={`progress-stage-${stage.id}`}>
                        <div
                          className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-semibold border-[3px] flex-shrink-0 transition-all z-10 ${
                            isCompleted ? 'bg-success border-success text-white' :
                            isActive ? 'bg-primary border-primary text-white' :
                            'bg-muted border-border text-muted-foreground'
                          }`}
                          data-testid={`stage-indicator-${stage.id}`}
                        >
                          {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                        </div>
                        <div className="mt-3 text-center max-w-[120px]">
                          <div className={`text-[13px] font-medium leading-tight ${
                            isCompleted ? 'text-success' :
                            isActive ? 'text-primary font-semibold' :
                            'text-muted-foreground'
                          }`}>
                            {stage.stageName}
                          </div>
                          {totalItems > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {completedItemsCount}/{totalItems}
                            </div>
                          )}
                        </div>
                        {i < filteredStages.length - 1 && (
                          <div
                            className={`absolute top-6 left-[calc(50%+24px)] h-[3px] z-0 ${
                              isCompleted ? 'bg-success/50' : 'bg-border'
                            }`}
                            style={{ width: 'calc(100% - 48px)' }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {project.programName && (
                  <div className="border-t mt-5 pt-3">
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Contacts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Borrower</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-info/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-info" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{project.borrowerName}</div>
                        <div className="text-xs text-muted-foreground truncate">{project.borrowerEmail}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          const subject = encodeURIComponent(`RE: ${project.dealName} (DEAL-${project.id})`);
                          window.open(`mailto:${project.borrowerEmail}?subject=${subject}`, '_blank');
                        }}
                        title="Send email"
                        data-testid="button-email-borrower"
                      >
                        <AtSign className="h-3.5 w-3.5" />
                      </Button>
                      {project.borrowerPhone && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={async () => {
                              try {
                                await apiRequest('POST', '/api/communication/sms', {
                                  to: project.borrowerPhone,
                                  message: `Hi ${project.borrowerName}, this is a message regarding your loan (DEAL-${project.id}). Please check your borrower portal for updates.`,
                                  dealId: project.id,
                                });
                                toast({ title: "SMS sent" });
                              } catch {
                                toast({ title: "Failed to send SMS", variant: "destructive" });
                              }
                            }}
                            title="Send text message"
                            data-testid="button-sms-borrower"
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => window.open(`tel:${project.borrowerPhone}`, '_self')}
                            title="Call"
                            data-testid="button-call-borrower"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          const tabTrigger = document.querySelector('[data-testid="tab-messages"]') as HTMLButtonElement;
                          if (tabTrigger) tabTrigger.click();
                        }}
                        title="Send internal message"
                        data-testid="button-message-borrower"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {processors && processors.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      {processors.length === 1 ? 'Processor' : 'Team'}
                    </div>
                    <div className="space-y-2">
                      {processors.map((proc) => (
                        <div key={proc.id} className="flex items-center justify-between gap-2" data-testid={`contact-processor-${proc.id}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                              <User className="h-3.5 w-3.5 text-success" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{proc.user.fullName}</div>
                              <div className="text-xs text-muted-foreground truncate">{proc.user.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                const subject = encodeURIComponent(`RE: ${project.dealName} (DEAL-${project.id})`);
                                window.open(`mailto:${proc.user.email}?subject=${subject}`, '_blank');
                              }}
                              title="Send email"
                              data-testid={`button-email-processor-${proc.id}`}
                            >
                              <AtSign className="h-3.5 w-3.5" />
                            </Button>
                            {proc.user.phone && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={async () => {
                                    try {
                                      await apiRequest('POST', '/api/communication/sms', {
                                        to: proc.user.phone,
                                        message: `Regarding DEAL-${project.id} (${project.dealName}): Please check the deal for updates.`,
                                        dealId: project.id,
                                      });
                                      toast({ title: "SMS sent" });
                                    } catch {
                                      toast({ title: "Failed to send SMS", variant: "destructive" });
                                    }
                                  }}
                                  title="Send text message"
                                  data-testid={`button-sms-processor-${proc.id}`}
                                >
                                  <Smartphone className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => window.open(`tel:${proc.user.phone}`, '_self')}
                                  title="Call"
                                  data-testid={`button-call-processor-${proc.id}`}
                                >
                                  <PhoneCall className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                const tabTrigger = document.querySelector('[data-testid="tab-messages"]') as HTMLButtonElement;
                                if (tabTrigger) tabTrigger.click();
                              }}
                              title="Send internal message"
                              data-testid={`button-message-processor-${proc.id}`}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-success" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Loan Amount</div>
                  <div className="font-semibold">{formatCurrency(project.loanAmount)}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
                  <span className="text-info font-semibold text-sm">%</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Interest Rate</div>
                  <div className="font-semibold">{project.interestRate ? `${project.interestRate}%` : '—'}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Term</div>
                  <div className="font-semibold">{project.loanTermMonths ? `${project.loanTermMonths} months` : '—'}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Property</div>
                  <div className="font-semibold truncate">{project.propertyType || '—'}</div>
                </div>
              </div>
            </Card>
          </div>

          {project.propertyAddress && (
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Property Address:</span>
                <span className="text-sm text-muted-foreground">{project.propertyAddress}</span>
              </div>
            </Card>
          )}

          <Tabs defaultValue="checklist" className="space-y-4">
            <TabsList>
              <TabsTrigger value="tasks" data-testid="tab-tasks">
                <CheckSquare className="h-4 w-4 mr-2" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">
                <Activity className="h-4 w-4 mr-2" />
                Activity
              </TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents">
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="checklist" data-testid="tab-checklist">
                <CheckSquare className="h-4 w-4 mr-2" />
                Checklist
              </TabsTrigger>
              <TabsTrigger value="messages" data-testid="tab-messages">
                <MessageSquare className="h-4 w-4 mr-2" />
                Messages
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="space-y-4">
              {filteredStages.map((stage) => (
                <Card key={stage.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStageIcon(stage.status)}
                        <div>
                          <CardTitle className="text-base">{stage.stageName}</CardTitle>
                          <CardDescription>{stage.stageDescription}</CardDescription>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {stage.tasks.filter(t => t.status === 'completed').length}/{stage.tasks.length} complete
                      </div>
                    </div>
                  </CardHeader>
                  {stage.tasks.length > 0 && (
                    <CardContent>
                      <div className="space-y-2">
                        {stage.tasks.map((task) => (
                          <div 
                            key={task.id} 
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={task.status === 'completed'}
                              onCheckedChange={(checked) => {
                                updateTaskMutation.mutate({
                                  taskId: task.id,
                                  status: checked ? 'completed' : 'pending'
                                });
                              }}
                              data-testid={`checkbox-task-${task.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                                  {task.taskTitle}
                                </span>
                                {getPriorityBadge(task.priority)}
                                {task.borrowerActionRequired && (
                                  <Badge variant="outline" className="text-xs">Borrower Action</Badge>
                                )}
                              </div>
                              {task.completedAt && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  Completed {formatDateTime(task.completedAt)}
                                  {task.completedBy && ` by ${task.completedBy}`}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="activity">
              <Card>
                <CardContent className="pt-6">
                  {activity.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No activity yet
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

            <TabsContent value="documents">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                  <CardTitle className="text-base">Deal Documents</CardTitle>
                  <div className="flex items-center gap-2">
                    {project.googleDriveFolderId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://drive.google.com/drive/folders/${project.googleDriveFolderId}`, '_blank')}
                        data-testid="button-open-drive"
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Drive Folder
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFileUpload(e.target.files);
                          e.target.value = '';
                        }
                      }}
                      data-testid="input-file-upload"
                    />
                    <Button
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFiles.length > 0}
                      data-testid="button-upload-document"
                    >
                      {uploadingFiles.length > 0 ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {uploadingFiles.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {uploadingFiles.map((name) => (
                        <div key={name} className="flex items-center gap-2 text-sm text-muted-foreground p-2 rounded-md bg-muted/50">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading {name}...
                        </div>
                      ))}
                    </div>
                  )}
                  {(!docsData?.documents || docsData.documents.length === 0) && uploadingFiles.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No documents uploaded yet</p>
                      <p className="text-xs mt-1">Upload files to store them with your loan</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {docsData?.documents.map((doc) => (
                        <div 
                          key={doc.id} 
                          className="flex items-center gap-3 p-3 rounded-md border"
                          data-testid={`doc-row-${doc.id}`}
                        >
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{doc.documentName}</div>
                            <div className="text-xs text-muted-foreground">
                              {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : ''} 
                              {doc.uploadedAt && ` · ${formatDateTime(doc.uploadedAt)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {doc.driveUploadStatus === 'OK' && doc.googleDriveFileUrl && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(doc.googleDriveFileUrl!, '_blank')}
                                title="View in Google Drive"
                                data-testid={`button-drive-view-${doc.id}`}
                              >
                                <HardDrive className="h-4 w-4 text-success" />
                              </Button>
                            )}
                            {doc.driveUploadStatus === 'PENDING' && (
                              <span title="Syncing to Drive">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </span>
                            )}
                            {doc.driveUploadStatus === 'ERROR' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => retryDriveDocMutation.mutate(doc.id)}
                                disabled={retryDriveDocMutation.isPending}
                                title={`Drive upload failed: ${doc.driveUploadError || 'Unknown error'}. Click to retry.`}
                                data-testid={`button-drive-retry-${doc.id}`}
                              >
                                <CloudOff className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              {doc.status === 'pending_review' ? 'Pending' : doc.status === 'approved' ? 'Approved' : doc.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="checklist" className="space-y-4">
              {(!dealDocsData || dealDocsData.length === 0) ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No document requirements set up yet</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Upload the required documents for your loan application
                    </p>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {(dealDocsData || []).filter(d => d.status === 'approved').length}/{(dealDocsData || []).filter(d => d.isRequired).length} approved
                    </div>
                  </div>
                  <input
                    ref={dealDocFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0 && uploadingDealDocId) {
                        handleDealDocUpload(uploadingDealDocId, e.target.files[0]);
                        e.target.value = '';
                      }
                    }}
                    data-testid="input-deal-doc-upload"
                  />
                  {dealDocsByStage.filter(s => s.docs.length > 0).map((stageGroup) => (
                    <Card key={stageGroup.stageId} data-testid={`card-checklist-stage-${stageGroup.stageId}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                          <FolderOpen className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <CardTitle className="text-base">{stageGroup.stageName}</CardTitle>
                            <CardDescription>
                              {stageGroup.docs.filter(d => d.status === 'approved').length}/{stageGroup.docs.filter(d => d.isRequired).length} approved
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {stageGroup.docs.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center gap-3 p-3 rounded-md border"
                              data-testid={`deal-doc-row-${doc.id}`}
                            >
                              {doc.status === 'approved' ? (
                                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                              ) : doc.status === 'uploaded' ? (
                                <Clock className="h-5 w-5 text-info shrink-0" />
                              ) : doc.status === 'rejected' ? (
                                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                              ) : (
                                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{doc.documentName}</span>
                                  {doc.isRequired && <Badge variant="outline" className="text-xs">Required</Badge>}
                                </div>
                                {doc.documentDescription && (
                                  <div className="text-xs text-muted-foreground mt-0.5">{doc.documentDescription}</div>
                                )}
                                {doc.status === 'rejected' && doc.reviewNotes && (
                                  <div className="text-xs text-destructive mt-1">
                                    Rejection reason: {doc.reviewNotes}
                                  </div>
                                )}
                                {doc.fileName && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {doc.fileName}
                                    {doc.fileSize ? ` · ${(doc.fileSize / 1024).toFixed(1)} KB` : ''}
                                    {doc.uploadedAt && ` · ${formatDateTime(doc.uploadedAt)}`}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {getDealDocStatusBadge(doc.status)}
                                {(doc.status === 'pending' || doc.status === 'rejected') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={uploadingDealDocId === doc.id}
                                    onClick={() => {
                                      setUploadingDealDocId(doc.id);
                                      dealDocFileInputRef.current?.click();
                                    }}
                                    data-testid={`button-upload-deal-doc-${doc.id}`}
                                  >
                                    {uploadingDealDocId === doc.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Upload className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {unstagedDealDocs.length > 0 && (
                    <Card data-testid="card-checklist-stage-other">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                          <FolderOpen className="h-5 w-5 text-muted-foreground" />
                          <CardTitle className="text-base">Other Documents</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {unstagedDealDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center gap-3 p-3 rounded-md border"
                              data-testid={`deal-doc-row-${doc.id}`}
                            >
                              {doc.status === 'approved' ? (
                                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                              ) : doc.status === 'uploaded' ? (
                                <Clock className="h-5 w-5 text-info shrink-0" />
                              ) : (
                                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{doc.documentName}</span>
                                  {doc.isRequired && <Badge variant="outline" className="text-xs">Required</Badge>}
                                </div>
                                {doc.fileName && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {doc.fileName}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {getDealDocStatusBadge(doc.status)}
                                {(doc.status === 'pending' || doc.status === 'rejected') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={uploadingDealDocId === doc.id}
                                    onClick={() => {
                                      setUploadingDealDocId(doc.id);
                                      dealDocFileInputRef.current?.click();
                                    }}
                                    data-testid={`button-upload-deal-doc-${doc.id}`}
                                  >
                                    {uploadingDealDocId === doc.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Upload className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="messages">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Messages
                  </CardTitle>
                  <CardDescription>Communicate with your loan team</CardDescription>
                </CardHeader>
                <CardContent>
                  {!currentThread ? (
                    <div className="space-y-4">
                      <div className="text-center py-4 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No messages yet. Start a conversation with your loan team.</p>
                      </div>
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Subject (optional)"
                          value={newThreadSubject}
                          onChange={(e) => setNewThreadSubject(e.target.value)}
                          className="resize-none"
                          rows={1}
                          data-testid="input-thread-subject"
                        />
                        <Textarea
                          placeholder="Type your message..."
                          value={newThreadMessage}
                          onChange={(e) => setNewThreadMessage(e.target.value)}
                          className="resize-none"
                          rows={3}
                          data-testid="input-thread-message"
                        />
                        <Button
                          onClick={() => {
                            if (newThreadMessage.trim() && projectId) {
                              createThreadMutation.mutate({
                                dealId: parseInt(projectId),
                                subject: newThreadSubject,
                                message: newThreadMessage,
                              });
                            }
                          }}
                          disabled={!newThreadMessage.trim() || createThreadMutation.isPending}
                          data-testid="button-send-first-message"
                        >
                          {createThreadMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send Message
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {threadMessagesData?.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`p-3 rounded-md ${
                              msg.senderId === user?.id 
                                ? 'bg-primary/10 ml-8' 
                                : 'bg-muted/50 mr-8'
                            }`}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium">
                                {msg.senderName || (msg.senderId === user?.id ? 'You' : 'Team')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(msg.createdAt)}
                              </span>
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
                          </div>
                        ))}
                        {(!threadMessagesData?.messages || threadMessagesData.messages.length === 0) && (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No messages in this thread yet
                          </div>
                        )}
                      </div>
                      <Separator />
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Type a reply..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          className="resize-none flex-1"
                          rows={2}
                          data-testid="input-reply-message"
                        />
                        <Button
                          size="icon"
                          onClick={() => {
                            if (newMessage.trim() && currentThread) {
                              sendMessageMutation.mutate({
                                threadId: currentThread.id,
                                body: newMessage,
                              });
                            }
                          }}
                          disabled={!newMessage.trim() || sendMessageMutation.isPending}
                          data-testid="button-send-reply"
                        >
                          {sendMessageMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

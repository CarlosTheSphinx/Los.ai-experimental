import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
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
  File as FileIcon,
  XCircle,
  Loader2,
  FolderOpen
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LoanChecklist } from "@/components/LoanChecklist";

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

interface DocFile {
  id: number;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string | null;
}

interface DealDocument {
  id: number;
  dealId: number;
  stageId: number | null;
  documentName: string;
  documentCategory: string | null;
  documentDescription: string | null;
  status: string;
  isRequired: boolean | null;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  reviewNotes: string | null;
  sortOrder: number | null;
  files: DocFile[];
}

interface PortalStage {
  id: number;
  stageName: string;
  stageOrder: number;
}

export default function BorrowerPortal() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<{ 
    project: Project; 
    stages: Stage[]; 
    activity: ActivityItem[];
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

  const { project, stages, activity } = data;

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.txt"
        data-testid="input-file-upload"
      />

      <header className="bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs md:text-sm text-muted-foreground font-mono truncate">DEAL-{project.id}</div>
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

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
        {stages.length > 0 && (
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
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
        </div>

        {project.propertyAddress && (
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Property:</span>
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
            <TabsTrigger value="updates" data-testid="tab-updates">
              <Activity className="h-4 w-4 mr-2" />
              Updates
            </TabsTrigger>
          </TabsList>

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
        </Tabs>

        {project.notes && (
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

      <footer className="border-t bg-background mt-12">
        <div className="max-w-4xl mx-auto px-6 py-4 text-center text-sm text-muted-foreground">
          Loan Progress Portal - Powered by Lendry.AI
        </div>
      </footer>
    </div>
  );
}


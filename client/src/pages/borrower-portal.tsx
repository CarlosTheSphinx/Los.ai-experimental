import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState, useRef, type ChangeEvent } from "react";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
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
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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
  projectNumber: string;
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

  const { data: docsData } = useQuery<{ 
    documents: DealDocument[]; 
    stages: PortalStage[];
  }>({
    queryKey: ['/api/portal', token, 'documents'],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/documents`);
      if (!res.ok) throw new Error('Failed to load documents');
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
      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Failed to upload file');

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
      queryClient.invalidateQueries({ queryKey: ['/api/portal', token, 'documents'] });
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
  const documents = docsData?.documents || [];
  const docStages = docsData?.stages || [];

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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-blue-500" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getDocStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="bg-green-600" data-testid="badge-doc-approved">Approved</Badge>;
      case 'uploaded':
        return <Badge variant="secondary" data-testid="badge-doc-uploaded">Under Review</Badge>;
      case 'rejected':
        return <Badge variant="destructive" data-testid="badge-doc-rejected">Needs Revision</Badge>;
      case 'not_applicable':
        return <Badge variant="outline" data-testid="badge-doc-na">Not Required</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-doc-pending">Needed</Badge>;
    }
  };

  const totalTasks = stages.reduce((sum, s) => sum + s.tasks.length, 0);
  const completedTasks = stages.reduce((sum, s) => sum + s.tasks.filter(t => t.status === 'completed').length, 0);

  const totalDocs = documents.filter(d => d.isRequired && d.status !== 'not_applicable').length;
  const uploadedDocs = documents.filter(d => d.status === 'uploaded' || d.status === 'approved').length;

  const docsByStage = docStages.map(stage => ({
    ...stage,
    docs: documents.filter(d => d.stageId === stage.id),
  }));
  const unstagedDocs = documents.filter(d => !d.stageId);

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

      <header className="bg-white dark:bg-slate-900 border-b">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs md:text-sm text-muted-foreground font-mono truncate">{project.projectNumber}</div>
              <h1 className="text-lg md:text-xl font-semibold truncate">{project.projectName}</h1>
            </div>
            <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="shrink-0" data-testid="badge-deal-status">
              {project.status}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
        <Card>
          <CardHeader className="pb-3 p-4 md:p-6 md:pb-3">
            <div className="flex items-start md:items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <CardTitle className="text-base md:text-lg truncate">Welcome, {project.borrowerName}</CardTitle>
                <CardDescription className="text-xs md:text-sm">Track your loan progress</CardDescription>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl md:text-3xl font-bold text-primary">{project.progressPercentage}%</div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 md:p-6 pt-0 md:pt-0">
            <Progress value={project.progressPercentage} className="h-2 md:h-3" />
            
            <div className="flex flex-wrap gap-1 overflow-x-auto">
              {stages.map((stage, i) => (
                <div key={stage.id} className="flex items-center gap-1">
                  {getStageIcon(stage.status)}
                  <span className={`text-[10px] md:text-xs whitespace-nowrap ${stage.status === 'in_progress' ? 'font-medium text-blue-600' : stage.status === 'completed' ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {stage.stageName}
                  </span>
                  {i < stages.length - 1 && (
                    <div className={`h-px w-2 md:w-4 ${stage.status === 'completed' ? 'bg-green-300' : 'bg-muted'}`} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          <Card className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] md:text-xs text-muted-foreground">Loan Amount</div>
                <div className="font-semibold text-sm md:text-base truncate">{formatCurrency(project.loanAmount)}</div>
              </div>
            </div>
          </Card>
          <Card className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <span className="text-blue-600 font-semibold text-xs md:text-sm">%</span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] md:text-xs text-muted-foreground">Interest Rate</div>
                <div className="font-semibold text-sm md:text-base">{project.interestRate ? `${project.interestRate}%` : '—'}</div>
              </div>
            </div>
          </Card>
          <Card className="p-3 md:p-4 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 md:h-5 md:w-5 text-purple-600" />
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

        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FolderOpen className="h-4 w-4 mr-2" />
              Documents ({uploadedDocs}/{totalDocs})
            </TabsTrigger>
            <TabsTrigger value="checklist" data-testid="tab-checklist">
              <CheckSquare className="h-4 w-4 mr-2" />
              Tasks ({completedTasks}/{totalTasks})
            </TabsTrigger>
            <TabsTrigger value="updates" data-testid="tab-updates">
              <Activity className="h-4 w-4 mr-2" />
              Updates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            {documents.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No documents required yet</p>
                    <p className="text-xs mt-1">Documents will appear here once your loan program is set up</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {docsByStage.filter(s => s.docs.length > 0).map((stageGroup) => (
                  <Card key={stageGroup.id} data-testid={`card-doc-stage-${stageGroup.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <CardTitle className="text-base">{stageGroup.stageName}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stageGroup.docs.map((doc) => (
                          <DocumentRow
                            key={doc.id}
                            doc={doc}
                            uploadingDocId={uploadingDocId}
                            onUpload={handleUploadClick}
                            formatFileSize={formatFileSize}
                            formatDateTime={formatDateTime}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {unstagedDocs.length > 0 && (
                  <Card data-testid="card-doc-stage-other">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">Other Documents</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {unstagedDocs.map((doc) => (
                          <DocumentRow
                            key={doc.id}
                            doc={doc}
                            uploadingDocId={uploadingDocId}
                            onUpload={handleUploadClick}
                            formatFileSize={formatFileSize}
                            formatDateTime={formatDateTime}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="checklist" className="space-y-4">
            {stages.map((stage) => (
              <Card key={stage.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    {getStageIcon(stage.status)}
                    <div>
                      <CardTitle className="text-base">{stage.stageName}</CardTitle>
                      <CardDescription>{stage.stageDescription}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {stage.tasks.length > 0 && (
                  <CardContent>
                    <div className="space-y-3">
                      {stage.tasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-3">
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground mt-0.5" />
                          )}
                          <div className="flex-1">
                            <div className={`text-sm ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                              {task.taskTitle}
                            </div>
                            {task.borrowerActionRequired && task.status !== 'completed' && (
                              <Badge variant="outline" className="text-xs mt-1">Action Required</Badge>
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

      <footer className="border-t bg-white dark:bg-slate-900 mt-12">
        <div className="max-w-4xl mx-auto px-6 py-4 text-center text-sm text-muted-foreground">
          Loan Progress Portal - Powered by Sphinx Capital
        </div>
      </footer>
    </div>
  );
}

function DocumentRow({ 
  doc, 
  uploadingDocId, 
  onUpload, 
  formatFileSize,
  formatDateTime
}: { 
  doc: DealDocument; 
  uploadingDocId: number | null;
  onUpload: (docId: number) => void;
  formatFileSize: (bytes: number | null) => string;
  formatDateTime: (dateStr: string) => string;
}) {
  const isUploading = uploadingDocId === doc.id;
  const canUpload = doc.status === 'pending' || doc.status === 'rejected';
  const getDocStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="bg-green-600" data-testid={`badge-doc-approved-${doc.id}`}>Approved</Badge>;
      case 'uploaded':
        return <Badge variant="secondary" data-testid={`badge-doc-uploaded-${doc.id}`}>Under Review</Badge>;
      case 'rejected':
        return <Badge variant="destructive" data-testid={`badge-doc-rejected-${doc.id}`}>Needs Revision</Badge>;
      case 'not_applicable':
        return <Badge variant="outline" data-testid={`badge-doc-na-${doc.id}`}>Not Required</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-doc-pending-${doc.id}`}>Needed</Badge>;
    }
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-md border ${
        doc.status === 'rejected' ? 'border-destructive/30 bg-destructive/5' :
        doc.status === 'approved' ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' :
        'border-border'
      }`}
      data-testid={`row-document-${doc.id}`}
    >
      <div className="mt-0.5">
        {doc.status === 'approved' ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : doc.status === 'rejected' ? (
          <XCircle className="h-5 w-5 text-destructive" />
        ) : doc.status === 'uploaded' ? (
          <Clock className="h-5 w-5 text-blue-500" />
        ) : (
          <FileIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" data-testid={`text-doc-name-${doc.id}`}>{doc.documentName}</span>
          {doc.isRequired && doc.status === 'pending' && (
            <span className="text-[10px] text-destructive font-medium">Required</span>
          )}
          {getDocStatusBadge(doc.status)}
        </div>

        {doc.documentDescription && (
          <p className="text-xs text-muted-foreground mt-0.5">{doc.documentDescription}</p>
        )}

        {doc.status === 'rejected' && doc.reviewNotes && (
          <div className="mt-2 p-2 rounded bg-destructive/10 text-xs text-destructive dark:text-red-400">
            <span className="font-medium">Revision needed:</span> {doc.reviewNotes}
          </div>
        )}

        {doc.files && doc.files.length > 0 && (
          <div className="mt-2 space-y-1">
            {doc.files.map((file) => (
              <div key={file.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span className="truncate">{file.fileName || 'Uploaded file'}</span>
                {file.fileSize && <span className="shrink-0">({formatFileSize(file.fileSize)})</span>}
              </div>
            ))}
          </div>
        )}

        {doc.uploadedAt && !doc.files?.length && (
          <div className="text-xs text-muted-foreground mt-1">
            Uploaded {formatDateTime(doc.uploadedAt)}
            {doc.fileName && <> - {doc.fileName}</>}
            {doc.fileSize && <> ({formatFileSize(doc.fileSize)})</>}
          </div>
        )}
      </div>

      <div className="shrink-0">
        {canUpload && (
          <Button
            size="sm"
            variant={doc.status === 'rejected' ? 'destructive' : 'outline'}
            onClick={() => onUpload(doc.id)}
            disabled={isUploading}
            data-testid={`button-upload-doc-${doc.id}`}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1" />
                {doc.status === 'rejected' ? 'Resubmit' : 'Upload'}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

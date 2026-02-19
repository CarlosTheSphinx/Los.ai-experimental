import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Home,
  FileText,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  Building2,
  DollarSign,
  ChevronRight,
  Video,
  Shield,
  Phone,
  AlertCircle,
  UploadCloud,
  X,
  Eye,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface DealInfo {
  id: number;
  dealName: string;
  borrowerName: string;
  propertyAddress: string | null;
  status: string;
  currentStage: string;
  progressPercentage: number;
  loanAmount: number | null;
  programName: string | null;
}

interface Stage {
  id: number;
  stageName: string;
  stageKey: string;
  stageOrder: number;
  status: string;
}

interface DocumentFile {
  id: number;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
}

interface Document {
  id: number;
  documentName: string;
  documentCategory: string | null;
  documentDescription: string | null;
  status: string; // pending, uploaded, approved, rejected, not_applicable, waived
  isRequired: boolean | null;
  assignedTo: string | null;
  aiReviewStatus: string; // pending, reviewing, approved, denied, not_reviewed
  aiReviewReason: string | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
  files: DocumentFile[];
}

interface Task {
  id: number;
  taskName: string;
  taskDescription: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  borrowerActionRequired: boolean;
}

interface Stats {
  totalDocuments: number;
  approvedDocuments: number;
  pendingDocuments: number;
  rejectedDocuments: number;
  completionPercentage: number;
}

interface DashboardData {
  deal: DealInfo;
  stages: Stage[];
  documents: Document[];
  tasks: Task[];
  stats: Stats;
}

const stageLabels: Record<string, string> = {
  'application': 'Application',
  'underwriting': 'Underwriting',
  'approval': 'Approval',
  'conditions': 'Conditions',
  'title': 'Title & Escrow',
  'appraisal': 'Appraisal',
  'final-review': 'Final Review',
  'closing': 'Closing',
  'funded': 'Funded'
};

const categoryColors: Record<string, string> = {
  'borrower_docs': 'bg-blue-100 text-blue-800',
  'entity_docs': 'bg-purple-100 text-purple-800',
  'property_docs': 'bg-green-100 text-green-800',
  'financial_docs': 'bg-amber-100 text-amber-800',
  'closing_docs': 'bg-indigo-100 text-indigo-800',
};

const categoryLabels: Record<string, string> = {
  'borrower_docs': 'Borrower Docs',
  'entity_docs': 'Entity Docs',
  'property_docs': 'Property Docs',
  'financial_docs': 'Financial Docs',
  'closing_docs': 'Closing Docs',
};

function getStatusIcon(status: string) {
  switch (status) {
    case 'approved':
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case 'uploaded':
    case 'submitted':
      return <Clock className="h-5 w-5 text-amber-500" />;
    case 'rejected':
      return <AlertCircle className="h-5 w-5 text-red-600" />;
    case 'waived':
    case 'not_applicable':
      return <CheckCircle2 className="h-5 w-5 text-gray-400" />;
    default:
      return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'uploaded':
    case 'submitted':
      return 'Under Review';
    case 'rejected':
      return 'Needs Revision';
    case 'waived':
    case 'not_applicable':
      return 'Not Required';
    default:
      return 'Not Uploaded';
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-green-50 border-green-200';
    case 'uploaded':
    case 'submitted':
      return 'bg-amber-50 border-amber-200';
    case 'rejected':
      return 'bg-red-50 border-red-200';
    case 'waived':
    case 'not_applicable':
      return 'bg-gray-50 border-gray-200';
    default:
      return 'bg-white border-gray-200';
  }
}

export function BorrowerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['/api/deals'],
  });

  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/onboarding/status'],
  });

  // Get first active deal (for now - real implementation would allow multiple)
  const deal = data?.projects?.[0];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-primary">In Progress</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case 'on_hold':
        return <Badge variant="secondary">On Hold</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const borrowerTrainingVideo = (onboardingStatus as any)?.documents?.find(
    (d: any) => d.type === 'training_video' && (d.targetUserType === 'borrower' || d.targetUserType === 'all')
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no deals, show empty state
  if (!deal) {
    return (
      <div className="container max-w-4xl mx-auto py-6 px-4">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p className="text-muted-foreground">
            Track the progress of your loan and stay updated on important milestones.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Home className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Active Loans</h3>
            <p className="text-muted-foreground text-center max-w-md">
              You don't have any active loans yet. Once your loan application is submitted,
              you'll be able to track its progress here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>
        <p className="text-muted-foreground">
          Track your loan progress and manage required documents
        </p>
      </div>

      {/* Training Video */}
      {borrowerTrainingVideo && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Video className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">New to the loan process?</p>
              <p className="text-sm text-muted-foreground">
                Watch our quick video guide to understand how your loan will progress.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const url = borrowerTrainingVideo.externalUrl || borrowerTrainingVideo.fileUrl;
                if (url) window.open(url, '_blank');
              }}
            >
              Watch Video
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Deal Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <CardTitle className="text-lg truncate">{deal.dealName}</CardTitle>
              </div>
              {deal.propertyAddress && (
                <p className="text-sm text-muted-foreground mb-3">{deal.propertyAddress}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  {formatCurrency(deal.loanAmount)}
                </div>
                {deal.programName && (
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {deal.programName}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getStatusBadge(deal.status)}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress Bar - Mirror of Admin Pipeline */}
      {deal && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold mb-4">Loan Progress</h3>
            <div className="relative">
              {/* Connection line */}
              <div className="absolute top-3 left-3 right-3 h-0.5 bg-border" />
              <div
                className="absolute top-3 left-3 h-0.5 bg-green-500 transition-all duration-500"
                style={{
                  width: `${Math.max(0, (deal.progressPercentage / 100) * 100)}%`,
                  maxWidth: 'calc(100% - 1.5rem)'
                }}
              />
              {/* Stage dots */}
              <div className="relative flex justify-between">
                {deal && (
                  <>
                    {['Application', 'Underwriting', 'Approval', 'Closing'].map((stage, index) => {
                      const isCompleted = (index / 3) * 100 <= deal.progressPercentage;
                      const isActive = Math.abs((index / 3) * 100 - deal.progressPercentage) < 25;
                      return (
                        <div key={stage} className="flex flex-col items-center" style={{ width: '25%' }}>
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium z-10 transition-all ${
                              isCompleted
                                ? 'bg-green-500 text-white'
                                : isActive
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                          </div>
                          <span className="text-xs mt-2 text-center font-medium text-muted-foreground">
                            {stage}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm font-semibold">{deal.progressPercentage}% Complete</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion Stats */}
      {data && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {data.stats.approvedDocuments}/{data.stats.totalDocuments}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Documents Approved</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{data.stats.completionPercentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">Complete</p>
              </div>
            </div>
            <Progress value={data.stats.completionPercentage} className="h-3 mt-4" />
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {data.stats.approvedDocuments} of {data.stats.totalDocuments} documents reviewed
            </p>
          </CardContent>
        </Card>
      )}

      {/* Documents Section */}
      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Required Documents</CardTitle>
                <CardDescription>
                  {data.stats.approvedDocuments} of {data.stats.totalDocuments} approved
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter Tabs */}
            <Tabs value={filterStatus} onValueChange={setFilterStatus} className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
                <TabsTrigger value="uploaded" className="text-xs">Uploaded</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs">Attention</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4 space-y-3">
                {data.documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    expanded={expandedDocId === doc.id}
                    onToggleExpanded={() =>
                      setExpandedDocId(expandedDocId === doc.id ? null : doc.id)
                    }
                  />
                ))}
              </TabsContent>

              <TabsContent value="pending" className="mt-4 space-y-3">
                {data.documents
                  .filter((d) => d.status === 'pending')
                  .map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      expanded={expandedDocId === doc.id}
                      onToggleExpanded={() =>
                        setExpandedDocId(expandedDocId === doc.id ? null : doc.id)
                      }
                    />
                  ))}
              </TabsContent>

              <TabsContent value="uploaded" className="mt-4 space-y-3">
                {data.documents
                  .filter((d) => d.status === 'uploaded' || d.status === 'submitted')
                  .map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      expanded={expandedDocId === doc.id}
                      onToggleExpanded={() =>
                        setExpandedDocId(expandedDocId === doc.id ? null : doc.id)
                      }
                    />
                  ))}
              </TabsContent>

              <TabsContent value="approved" className="mt-4 space-y-3">
                {data.documents
                  .filter((d) => d.status === 'approved')
                  .map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      expanded={expandedDocId === doc.id}
                      onToggleExpanded={() =>
                        setExpandedDocId(expandedDocId === doc.id ? null : doc.id)
                      }
                    />
                  ))}
              </TabsContent>

              <TabsContent value="rejected" className="mt-4 space-y-3">
                {data.documents
                  .filter((d) => d.status === 'rejected')
                  .map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      expanded={expandedDocId === doc.id}
                      onToggleExpanded={() =>
                        setExpandedDocId(expandedDocId === doc.id ? null : doc.id)
                      }
                    />
                  ))}
              </TabsContent>
            </Tabs>

            {data.documents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No documents required yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Tasks Section */}
      {data && data.tasks.filter((t) => t.borrowerActionRequired).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Tasks</CardTitle>
            <CardDescription>
              {data.tasks.filter((t) => t.status !== 'completed').length} action items
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.tasks
                .filter((t) => t.borrowerActionRequired)
                .map((task) => (
                  <Card key={task.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-medium">{task.taskName}</h4>
                        {task.taskDescription && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {task.taskDescription}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {task.priority && (
                          <Badge
                            variant={task.priority === 'high' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {task.priority}
                          </Badge>
                        )}
                        <Badge
                          variant={task.status === 'completed' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {task.status === 'completed' ? 'Done' : 'Pending'}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Support Section */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation('/inbox')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Messages</p>
              <p className="text-sm text-muted-foreground">Contact your loan team</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation('/resources')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Resources</p>
              <p className="text-sm text-muted-foreground">Documents and guides</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation('/borrower-quote')}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Get a Quote</p>
              <p className="text-sm text-muted-foreground">Instant loan pricing</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </CardContent>
        </Card>
      </div>

      {/* Trust Signals */}
      <div className="pt-6 border-t border-border">
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>256-bit encrypted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>FCRA & TILA compliant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            <span>Support available 8am–6pm EST</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Document Card Component
interface DocumentCardProps {
  doc: Document;
  expanded: boolean;
  onToggleExpanded: () => void;
}

function DocumentCard({ doc, expanded, onToggleExpanded }: DocumentCardProps) {
  const statusIcon = getStatusIcon(doc.status);
  const statusLabel = getStatusLabel(doc.status);
  const statusColor = getStatusColor(doc.status);
  const categoryColor = categoryColors[doc.documentCategory || ''] || 'bg-gray-100 text-gray-800';
  const categoryLabel = categoryLabels[doc.documentCategory || ''] || doc.documentCategory || 'Other';

  return (
    <Card className={`border ${statusColor}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Status icon */}
          <div className="flex-shrink-0 mt-1">{statusIcon}</div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <h4 className="font-medium truncate">{doc.documentName}</h4>
                <Badge variant="outline" className={`mt-1 text-xs ${categoryColor}`}>
                  {categoryLabel}
                </Badge>
              </div>
              <div className="flex-shrink-0">
                <Badge variant="outline" className="text-xs">
                  {statusLabel}
                </Badge>
              </div>
            </div>

            {doc.documentDescription && (
              <p className="text-sm text-muted-foreground mb-2">{doc.documentDescription}</p>
            )}

            {/* File info */}
            {doc.files.length > 0 && (
              <div className="mt-3 space-y-1">
                {doc.files.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    <span className="truncate">{file.fileName}</span>
                    {file.fileSize && <span className="flex-shrink-0">({formatFileSize(file.fileSize)})</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Rejection reason */}
            {doc.status === 'rejected' && doc.aiReviewReason && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                <button
                  onClick={onToggleExpanded}
                  className="flex items-center gap-2 text-sm font-medium text-red-800 w-full"
                >
                  <AlertCircle className="h-4 w-4" />
                  <span>Why this was rejected</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ml-auto ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expanded && (
                  <p className="text-sm text-red-700 mt-2">{doc.aiReviewReason}</p>
                )}
              </div>
            )}
          </div>

          {/* Action */}
          {doc.status === 'pending' && (
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <Button size="sm" variant="outline">
                <UploadCloud className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </div>
          )}
          {doc.status === 'uploaded' && (
            <div className="flex-shrink-0">
              <p className="text-xs text-amber-600 font-medium">Your document is being reviewed...</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

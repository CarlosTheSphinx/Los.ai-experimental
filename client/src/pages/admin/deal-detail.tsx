import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  DollarSign,
  Building,
  Building2,
  User,
  Users,
  Calendar,
  CalendarDays,
  FileText,
  CheckSquare,
  Mail,
  Pencil,
  Check,
  Clock,
  Upload,
  AlertCircle,
  XCircle,
  FileCheck,
  Folder,
  Eye,
  Download,
  Loader2,
  Phone,
  Plus,
  Circle,
  CheckCircle2,
  Copy,
  MoreHorizontal,
  Send,
  ExternalLink,
  Activity,
  MapPin,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DigestConfigPanel } from "@/components/DigestConfigPanel";

interface Deal {
  id: number;
  userId: number;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  propertyAddress: string;
  loanData: {
    loanAmount: number;
    propertyValue: number;
    ltv?: string;
    loanType: string;
    loanPurpose: string;
    propertyType: string;
    loanTerm?: string;
  };
  interestRate: string;
  pointsCharged: number;
  pointsAmount: number;
  tpoPremiumAmount: number;
  totalRevenue: number;
  commission: number;
  stage: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface DealDocument {
  id: number;
  dealId: number;
  documentName: string;
  documentCategory: string | null;
  documentDescription: string | null;
  status: string;
  isRequired: boolean | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string | null;
  uploadedBy: number | null;
  reviewedAt: string | null;
  reviewedBy: number | null;
  reviewNotes: string | null;
  sortOrder: number | null;
  createdAt: string;
}

interface DealTask {
  id: number;
  dealId: number;
  taskName: string;
  taskDescription: string | null;
  status: string;
  priority: string | null;
  assignedTo: number | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface TeamMember {
  id: number;
  fullName: string | null;
  email: string;
  role: string;
}

interface DealDetailResponse {
  deal: Deal;
  documents: DealDocument[];
}

interface ProjectTask {
  id: number;
  taskTitle: string;
  taskType: string;
  priority: string;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  visibleToBorrower: boolean;
  borrowerActionRequired: boolean;
}

interface ProjectStage {
  id: number;
  stageName: string;
  stageKey: string;
  stageOrder: number;
  stageDescription: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  tasks: ProjectTask[];
}

interface ProjectActivityItem {
  id: number;
  activityType: string;
  activityDescription: string;
  createdAt: string;
  visibleToBorrower: boolean;
}

interface ProjectDetailResponse {
  project: {
    id: number;
    projectNumber: string;
    projectName: string;
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
    borrowerPortalToken: string | null;
  };
  stages: ProjectStage[];
  tasks: ProjectTask[];
  activity: ProjectActivityItem[];
}

interface DealStage {
  id: number;
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

const stageColorMap: Record<string, string> = {
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

function getStageColorFromStages(stage: string, stages: DealStage[]): string {
  const stageObj = stages.find(s => s.key === stage);
  if (stageObj) {
    return stageColorMap[stageObj.color] || stageColorMap.gray;
  }
  return stageColorMap.gray;
}

function getStageLabelFromStages(stage: string, stages: DealStage[]): string {
  const stageObj = stages.find(s => s.key === stage);
  return stageObj?.label || stage;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getLoanTypeLabel(loanType: string): string {
  const labels: Record<string, string> = {
    "rtl": "RTL",
    "dscr": "DSCR",
    "fix-and-flip": "Fix & Flip",
    "bridge": "Bridge",
    "ground-up": "Ground Up",
    "rental": "Rental",
  };
  return labels[loanType?.toLowerCase()] || loanType || "N/A";
}

function parseAddress(address: string) {
  const parts = address.split(",").map((p) => p.trim());
  const street = parts[0] || "";
  const city = parts[1] || "";
  const stateZip = parts[2] || "";
  const [state, zip] = stateZip.split(" ").filter(Boolean);
  return { street, city, state: state || "", zip: zip || "" };
}

function getDocumentStatusIcon(status: string) {
  switch (status) {
    case "approved":
      return <Check className="h-4 w-4 text-green-600" />;
    case "uploaded":
      return <FileCheck className="h-4 w-4 text-blue-600" />;
    case "rejected":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "not_applicable":
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <Clock className="h-4 w-4 text-yellow-600" />;
  }
}

function getDocumentStatusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    uploaded: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    not_applicable: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    uploaded: "Uploaded",
    approved: "Approved",
    rejected: "Rejected",
    not_applicable: "N/A",
  };
  return (
    <Badge className={cn("text-xs", styles[status] || "bg-gray-100 text-gray-800")}>
      {labels[status] || status}
    </Badge>
  );
}

function getCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    borrower_docs: "Borrower Documents",
    entity_docs: "Entity Documents",
    property_docs: "Property Documents",
    financial_docs: "Financial Documents",
    closing_docs: "Closing Documents",
    lender_ordered: "Ordered by Lender",
  };
  return labels[category || ""] || "Other";
}

function getCategoryIcon(category: string | null) {
  switch (category) {
    case "borrower_docs":
      return <User className="h-4 w-4" />;
    case "entity_docs":
      return <Building className="h-4 w-4" />;
    case "property_docs":
      return <Building className="h-4 w-4" />;
    case "financial_docs":
      return <DollarSign className="h-4 w-4" />;
    case "closing_docs":
      return <FileText className="h-4 w-4" />;
    case "lender_ordered":
      return <FileCheck className="h-4 w-4" />;
    default:
      return <Folder className="h-4 w-4" />;
  }
}

export default function AdminDealDetail() {
  const [, params] = useRoute("/admin/deals/:id");
  const dealId = params?.id;
  const { toast } = useToast();
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    customerFirstName: "",
    customerLastName: "",
    customerEmail: "",
    customerPhone: "",
    propertyAddress: "",
    loanAmount: "",
    propertyValue: "",
    interestRate: "",
    loanType: "",
    loanPurpose: "",
    propertyType: "",
  });
  
  // Task dialog state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    taskName: "",
    taskDescription: "",
    priority: "medium",
    assignedTo: "",
    dueDate: "",
  });
  
  // Document dialog state
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [documentForm, setDocumentForm] = useState({
    documentName: "",
    documentCategory: "other",
    documentDescription: "",
    isRequired: true,
  });

  const { data, isLoading, error } = useQuery<DealDetailResponse>({
    queryKey: [`/api/admin/deals/${dealId}`],
    enabled: !!dealId,
  });
  
  const { data: tasksData } = useQuery<{ tasks: DealTask[] }>({
    queryKey: [`/api/admin/deals/${dealId}/tasks`],
    enabled: !!dealId,
  });
  
  const { data: teamData } = useQuery<{ teamMembers: TeamMember[] }>({
    queryKey: ['/api/admin/team-members'],
  });

  // Deal ID is now the project ID directly (deals are projects)
  const linkedProjectId = dealId ? parseInt(dealId) : null;
  const [showAddProcessor, setShowAddProcessor] = useState(false);
  const [selectedProcessorId, setSelectedProcessorId] = useState<string>("");

  const { data: projectDetailData, isLoading: projectLoading } = useQuery<ProjectDetailResponse>({
    queryKey: ['/api/admin/projects', linkedProjectId],
    enabled: !!linkedProjectId,
  });

  const { data: stagesData } = useQuery<{ stages: DealStage[] }>({
    queryKey: ['/api/admin/deal-stages'],
  });

  const { data: dealProcessorsData } = useQuery<any[]>({
    queryKey: ['/api/admin/projects', linkedProjectId, 'processors'],
    enabled: !!linkedProjectId,
  });

  const { data: availableProcessors } = useQuery<any[]>({
    queryKey: ['/api/admin/processors'],
  });

  const addProcessorMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("POST", `/api/admin/projects/${linkedProjectId}/processors`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId, 'processors'] });
      setShowAddProcessor(false);
      setSelectedProcessorId("");
      toast({ title: "Processor added to deal" });
    },
    onError: () => {
      toast({ title: "Failed to add processor", variant: "destructive" });
    },
  });

  const removeProcessorMutation = useMutation({
    mutationFn: async (processorId: number) => {
      return apiRequest("DELETE", `/api/admin/projects/${linkedProjectId}/processors/${processorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId, 'processors'] });
      toast({ title: "Processor removed from deal" });
    },
    onError: () => {
      toast({ title: "Failed to remove processor", variant: "destructive" });
    },
  });
  
  const stages = stagesData?.stages || [];
  const projectStages = projectDetailData?.stages || [];
  const projectActivity = projectDetailData?.activity || [];
  const project = projectDetailData?.project;

  const updateDocumentStatus = useMutation({
    mutationFn: async ({ docId, status }: { docId: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/documents/${docId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({
        title: "Document updated",
        description: "The document status has been updated.",
      });
    },
  });

  const updateDealMutation = useMutation({
    mutationFn: async (formData: typeof editForm) => {
      return apiRequest("PUT", `/api/admin/deals/${dealId}`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setEditDialogOpen(false);
      toast({
        title: "Deal updated",
        description: "The loan details have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        variant: "destructive",
      });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async (stage: string) => {
      return apiRequest("PUT", `/api/admin/deals/${dealId}`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals'] });
      toast({
        title: "Stage updated",
        description: "The deal stage has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update stage",
        variant: "destructive",
      });
    },
  });

  const populateDocumentsMutation = useMutation({
    mutationFn: async ({ loanType, clearExisting }: { loanType: string; clearExisting?: boolean }) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/populate-documents`, { loanType, clearExisting });
    },
    onSuccess: (data: any) => {
      // Documents are part of the main deal response, so invalidate the deal query
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({
        title: "Documents populated",
        description: data.message || `${data.documentsCreated} documents added from templates.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to populate documents",
        description: error?.message || "Could not load document templates for this loan type.",
        variant: "destructive",
      });
    },
  });

  const openEditDialog = () => {
    if (deal) {
      setEditForm({
        customerFirstName: deal.customerFirstName || "",
        customerLastName: deal.customerLastName || "",
        customerEmail: deal.customerEmail || "",
        customerPhone: deal.customerPhone || "",
        propertyAddress: deal.propertyAddress || "",
        loanAmount: deal.loanData?.loanAmount?.toString() || "",
        propertyValue: deal.loanData?.propertyValue?.toString() || "",
        interestRate: deal.interestRate || "",
        loanType: deal.loanData?.loanType || "",
        loanPurpose: deal.loanData?.loanPurpose || "",
        propertyType: deal.loanData?.propertyType || "",
      });
      setEditDialogOpen(true);
    }
  };

  const createTaskMutation = useMutation({
    mutationFn: async (formData: typeof taskForm) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/tasks`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/tasks`] });
      setTaskDialogOpen(false);
      setTaskForm({ taskName: "", taskDescription: "", priority: "medium", assignedTo: "", dueDate: "" });
      toast({ title: "Task created" });
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/deals/${dealId}/tasks/${taskId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}/tasks`] });
      toast({ title: "Task updated" });
    },
  });

  const updateProjectTaskMutation = useMutation({
    mutationFn: async ({ projectId, taskId, status }: { projectId: number; taskId: number; status: string }) => {
      return apiRequest('PATCH', `/api/admin/projects/${projectId}/tasks/${taskId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects', linkedProjectId] });
      toast({ title: "Task updated" });
    },
  });

  const copyBorrowerPortalLink = async () => {
    if (!linkedProjectId) {
      toast({ title: "No project linked", description: "Create a loan project first to generate a borrower portal link.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`/api/projects/${linkedProjectId}/borrower-link`, { credentials: 'include' });
      const { borrowerLink } = await res.json();
      await navigator.clipboard.writeText(borrowerLink);
      toast({ title: "Borrower portal link copied" });
    } catch (e) {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
    });
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-blue-500" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical': return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case 'high': return <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">High</Badge>;
      case 'medium': return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      default: return null;
    }
  };

  const createDocumentMutation = useMutation({
    mutationFn: async (formData: typeof documentForm) => {
      return apiRequest("POST", `/api/admin/deals/${dealId}/documents`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      setDocumentDialogOpen(false);
      setDocumentForm({ documentName: "", documentCategory: "other", documentDescription: "", isRequired: true });
      toast({ title: "Document requirement added" });
    },
    onError: () => {
      toast({ title: "Failed to add document", variant: "destructive" });
    },
  });

  const handleContactBorrower = async () => {
    if (deal?.customerEmail) {
      const subject = `Regarding Your Loan - ${deal.propertyAddress}`;
      const mailtoLink = `mailto:${deal.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Dear ${deal.customerFirstName},\n\n`)}`;
      
      const link = document.createElement('a');
      link.href = mailtoLink;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      try {
        await navigator.clipboard.writeText(deal.customerEmail);
        toast({
          title: "Email address copied",
          description: `${deal.customerEmail} copied to clipboard. If your email app didn't open, paste this address manually.`,
        });
      } catch {
        toast({
          title: "Borrower Email",
          description: `${deal.customerEmail} - Copy this to email the borrower.`,
        });
      }
    } else {
      toast({
        title: "No email available",
        description: "Please add the borrower's email address first.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (docId: number, file: File) => {
    setUploadingDocId(docId);
    setUploadProgress(10);

    try {
      // Step 1: Get presigned URL
      const urlResponse = await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${docId}/upload-url`, {
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      });
      const { uploadURL, objectPath } = await urlResponse.json();
      setUploadProgress(30);

      // Step 2: Upload directly to storage
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });
      setUploadProgress(70);

      // Step 3: Update database record
      await apiRequest("POST", `/api/admin/deals/${dealId}/documents/${docId}/upload-complete`, {
        objectPath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
      });
      setUploadProgress(100);

      queryClient.invalidateQueries({ queryKey: [`/api/admin/deals/${dealId}`] });
      toast({
        title: "Document uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading the document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingDocId(null);
      setUploadProgress(0);
    }
  };

  const handleFileInputChange = (docId: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(docId, file);
    }
    // Reset the input so the same file can be selected again
    e.target.value = "";
  };

  const handleViewDocument = (docId: number) => {
    window.open(`/api/admin/deals/${dealId}/documents/${docId}/download`, "_blank");
  };

  const handleDownloadDocument = (docId: number, fileName: string | null) => {
    const link = document.createElement("a");
    link.href = `/api/admin/deals/${dealId}/documents/${docId}/download?download=true`;
    link.download = fileName || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deal = data?.deal;
  const documents = data?.documents || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-96" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-64 md:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="p-6">
        <Link href="/admin/deals">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Deal not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const address = parseAddress(deal.propertyAddress);
  const borrowerName = `${deal.customerFirstName} ${deal.customerLastName}`;
  const borrowerEmail = deal.customerEmail || `${deal.customerFirstName.toLowerCase()}.${deal.customerLastName.toLowerCase()}@email.com`;
  const progressPercentage = project?.progressPercentage || 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header matching Loans page */}
      <div className="flex items-center gap-4">
        <Link href="/admin/deals">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-mono">DEAL-{deal.id}</span>
            <Select 
              value={deal.stage} 
              onValueChange={(value) => updateStageMutation.mutate(value)}
              disabled={updateStageMutation.isPending}
            >
              <SelectTrigger 
                className={cn("w-auto h-6 text-xs font-medium px-2", getStageColorFromStages(deal.stage, stages))}
                data-testid="select-deal-stage"
              >
                <SelectValue>{getStageLabelFromStages(deal.stage, stages)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {stages.filter(s => s.isActive !== false).map((stage) => (
                  <SelectItem key={stage.id} value={stage.key}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <h1 className="text-xl font-semibold" data-testid="text-borrower-name">{borrowerName}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyBorrowerPortalLink} data-testid="button-copy-portal-link">
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
              <DropdownMenuItem onClick={openEditDialog}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Loan Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleContactBorrower}>
                <Mail className="h-4 w-4 mr-2" />
                Contact Borrower
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Borrower Portal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Two-column top section: Loan Progress + Borrower */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Loan Progress</CardTitle>
              <span className="text-2xl font-bold">{progressPercentage}%</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progressPercentage} className="h-3" />
            
            {projectStages.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {projectStages.map((stage, i) => (
                  <div 
                    key={stage.id} 
                    className="flex items-center gap-1"
                  >
                    {getStageIcon(stage.status)}
                    <span className={`text-xs ${stage.status === 'in_progress' ? 'font-medium text-blue-600' : stage.status === 'completed' ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {stage.stageName}
                    </span>
                    {i < projectStages.length - 1 && (
                      <div className={`h-px w-4 ${stage.status === 'completed' ? 'bg-green-300' : 'bg-muted'}`} />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No loan project linked. Create a project to track stages.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Borrower
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="font-medium">{borrowerName}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>{borrowerEmail}</span>
            </div>
            {deal.customerPhone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>{deal.customerPhone}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4-column metrics row */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Loan Amount</div>
              <div className="font-semibold" data-testid="text-loan-amount">{formatCurrency(deal.loanData?.loanAmount || 0)}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 font-semibold text-sm">%</span>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Interest Rate</div>
              <div className="font-semibold" data-testid="text-interest-rate">{deal.interestRate || '—'}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Term</div>
              <div className="font-semibold" data-testid="text-loan-term">{deal.loanData?.loanTerm || '12 months'}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Property</div>
              <div className="font-semibold truncate" data-testid="text-property-type">{deal.loanData?.propertyType || '—'}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Property Address card */}
      {deal.propertyAddress && (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Property Address:</span>
            <span className="text-sm text-muted-foreground" data-testid="text-property-address">{deal.propertyAddress}</span>
          </div>
        </Card>
      )}

      {/* Team / Processors Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddProcessor(true)}
              data-testid="button-add-processor"
              className="gap-1"
            >
              <UserPlus className="h-4 w-4" />
              Add Processor
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dealProcessorsData && dealProcessorsData.length > 0 ? (
            <div className="space-y-2">
              {dealProcessorsData.map((proc: any) => (
                <div key={proc.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`processor-${proc.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{proc.user?.fullName || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">{proc.user?.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{proc.role}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => removeProcessorMutation.mutate(proc.id)}
                      data-testid={`button-remove-processor-${proc.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No processors assigned to this deal yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add Processor Dialog */}
      <Dialog open={showAddProcessor} onOpenChange={setShowAddProcessor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Processor</DialogTitle>
            <DialogDescription>
              Assign a team member as a processor on this deal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Team Member</Label>
              <Select value={selectedProcessorId} onValueChange={setSelectedProcessorId}>
                <SelectTrigger data-testid="select-processor">
                  <SelectValue placeholder="Choose a team member..." />
                </SelectTrigger>
                <SelectContent>
                  {(availableProcessors || [])
                    .filter((p: any) => !dealProcessorsData?.some((dp: any) => dp.userId === p.id))
                    .map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.fullName || p.email} ({p.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProcessor(false)}>Cancel</Button>
            <Button
              onClick={() => selectedProcessorId && addProcessorMutation.mutate(parseInt(selectedProcessorId))}
              disabled={!selectedProcessorId || addProcessorMutation.isPending}
              data-testid="button-confirm-add-processor"
            >
              {addProcessorMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Processor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs matching Loans page: Tasks, Activity, Documents, Digests */}
      <Tabs defaultValue="tasks" className="space-y-4" data-testid="tabs-deal-detail">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="tasks" className="flex items-center gap-2" data-testid="tab-tasks">
            <CheckSquare className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2" data-testid="tab-activity">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2" data-testid="tab-documents">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="digests" className="flex items-center gap-2" data-testid="tab-digests">
            <CalendarDays className="h-4 w-4" />
            Digests
          </TabsTrigger>
        </TabsList>

        {/* Tasks Tab - Stage cards with tasks matching Loans page */}
        <TabsContent value="tasks" className="space-y-4">
          {projectStages.length > 0 ? (
            projectStages.map((stage) => (
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
                      {(stage.tasks || []).filter(t => t.status === 'completed').length}/{(stage.tasks || []).length} complete
                    </div>
                  </div>
                </CardHeader>
                {(stage.tasks || []).length > 0 && (
                  <CardContent>
                    <div className="space-y-2">
                      {(stage.tasks || []).map((task) => (
                        <div 
                          key={task.id} 
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={task.status === 'completed'}
                            onCheckedChange={(checked) => {
                              if (linkedProjectId) {
                                updateProjectTaskMutation.mutate({
                                  projectId: linkedProjectId,
                                  taskId: task.id,
                                  status: checked ? 'completed' : 'pending'
                                });
                              }
                            }}
                            data-testid={`checkbox-task-${task.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
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
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No stages configured</h3>
                <p className="text-muted-foreground">
                  Create a loan project from this deal to track stages and tasks.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6">
              {projectActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activity yet
                </div>
              ) : (
                <div className="space-y-4">
                  {projectActivity.map((item, i) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        {i < projectActivity.length - 1 && <div className="flex-1 w-px bg-border" />}
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

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-6">
          {documents.length === 0 ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Documents</CardTitle>
                <div className="flex items-center gap-2">
                  {deal?.loanData?.loanType && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => populateDocumentsMutation.mutate({ 
                        loanType: deal.loanData?.loanType || 'rtl',
                        clearExisting: false 
                      })}
                      disabled={populateDocumentsMutation.isPending}
                      data-testid="button-populate-documents-empty"
                    >
                      {populateDocumentsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-1" />
                      )}
                      Load Templates
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setDocumentDialogOpen(true)} data-testid="button-add-document-empty">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Document
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="py-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No documents yet</h3>
                <p className="text-muted-foreground">
                  {deal?.loanData?.loanType 
                    ? 'Click "Load Templates" to populate documents from the loan program, or "Add Document" to add individually.'
                    : 'Set a loan type first to load document templates, or click "Add Document" to add individually.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4 flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="h-5 w-5" />
                      Required Documents
                    </CardTitle>
                    <CardDescription>
                      {getLoanTypeLabel(deal.loanData?.loanType)} Loan Document Checklist
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {deal?.loanData?.loanType && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => populateDocumentsMutation.mutate({ 
                          loanType: deal.loanData?.loanType || 'rtl',
                          clearExisting: false 
                        })}
                        disabled={populateDocumentsMutation.isPending}
                        data-testid="button-populate-documents"
                      >
                        {populateDocumentsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4 mr-1" />
                        )}
                        Load Templates
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setDocumentDialogOpen(true)} data-testid="button-add-document">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Document
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Progress</span>
                      <span className="text-sm font-medium">
                        {documents.filter(d => d.status === 'approved' || d.status === 'uploaded').length} of {documents.length} complete
                      </span>
                    </div>
                    <Progress 
                      value={(documents.filter(d => d.status === 'approved' || d.status === 'uploaded').length / documents.length) * 100} 
                    />
                  </div>
                  
                  {(() => {
                    const categories = Array.from(new Set(documents.map(d => d.documentCategory)));
                    return categories.map((category) => (
                      <div key={category} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                          {getCategoryIcon(category)}
                          {getCategoryLabel(category)}
                        </div>
                        <div className="space-y-2">
                          {documents
                            .filter(d => d.documentCategory === category)
                            .map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between p-3 border rounded-lg hover-elevate"
                                data-testid={`doc-row-${doc.id}`}
                              >
                                <div className="flex items-center gap-3">
                                  {getDocumentStatusIcon(doc.status)}
                                  <div>
                                    <p className="font-medium text-sm">{doc.documentName}</p>
                                    {doc.documentDescription && (
                                      <p className="text-xs text-muted-foreground max-w-md">{doc.documentDescription}</p>
                                    )}
                                    {doc.fileName && doc.uploadedAt && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {doc.fileName} • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                  {doc.isRequired && (
                                    <Badge variant="outline" className="text-xs">Required</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {getDocumentStatusBadge(doc.status)}
                                  
                                  {/* Upload progress indicator */}
                                  {uploadingDocId === doc.id && (
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                      <span className="text-xs text-muted-foreground">{uploadProgress}%</span>
                                    </div>
                                  )}
                                  
                                  <div className="flex gap-1">
                                    {/* View/Download buttons for uploaded files */}
                                    {doc.filePath && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleViewDocument(doc.id)}
                                          data-testid={`button-view-${doc.id}`}
                                          title="View document"
                                        >
                                          <Eye className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleDownloadDocument(doc.id, doc.fileName)}
                                          data-testid={`button-download-${doc.id}`}
                                          title="Download document"
                                        >
                                          <Download className="h-3 w-3" />
                                        </Button>
                                      </>
                                    )}

                                    {/* File upload input (hidden) */}
                                    <input
                                      type="file"
                                      id={`file-input-${doc.id}`}
                                      className="hidden"
                                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                                      onChange={handleFileInputChange(doc.id)}
                                      data-testid={`input-file-${doc.id}`}
                                    />
                                    
                                    {doc.status === 'pending' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => updateDocumentStatus.mutate({ docId: doc.id, status: 'not_applicable' })}
                                          disabled={updateDocumentStatus.isPending || uploadingDocId === doc.id}
                                          data-testid={`button-na-${doc.id}`}
                                        >
                                          N/A
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => document.getElementById(`file-input-${doc.id}`)?.click()}
                                          disabled={uploadingDocId === doc.id}
                                          data-testid={`button-upload-${doc.id}`}
                                        >
                                          <Upload className="h-3 w-3 mr-1" />
                                          Upload
                                        </Button>
                                      </>
                                    )}
                                    {doc.status === 'uploaded' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => document.getElementById(`file-input-${doc.id}`)?.click()}
                                          disabled={uploadingDocId === doc.id}
                                          data-testid={`button-reupload-${doc.id}`}
                                          title="Replace file"
                                        >
                                          <Upload className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => updateDocumentStatus.mutate({ docId: doc.id, status: 'rejected' })}
                                          disabled={updateDocumentStatus.isPending}
                                          data-testid={`button-reject-${doc.id}`}
                                        >
                                          <XCircle className="h-3 w-3 mr-1" />
                                          Reject
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="default"
                                          onClick={() => updateDocumentStatus.mutate({ docId: doc.id, status: 'approved' })}
                                          disabled={updateDocumentStatus.isPending}
                                          data-testid={`button-approve-${doc.id}`}
                                        >
                                          <Check className="h-3 w-3 mr-1" />
                                          Approve
                                        </Button>
                                      </>
                                    )}
                                    {doc.status === 'approved' && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => document.getElementById(`file-input-${doc.id}`)?.click()}
                                        disabled={uploadingDocId === doc.id}
                                        data-testid={`button-reupload-${doc.id}`}
                                        title="Replace file"
                                      >
                                        <Upload className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {doc.status === 'rejected' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => document.getElementById(`file-input-${doc.id}`)?.click()}
                                          disabled={uploadingDocId === doc.id}
                                          data-testid={`button-upload-${doc.id}`}
                                        >
                                          <Upload className="h-3 w-3 mr-1" />
                                          Re-upload
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => updateDocumentStatus.mutate({ docId: doc.id, status: 'pending' })}
                                          disabled={updateDocumentStatus.isPending}
                                          data-testid={`button-reset-${doc.id}`}
                                        >
                                          Reset
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ));
                  })()}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="digests" className="mt-6" data-testid="tabcontent-digests">
          <div data-testid="digest-config-container">
            <DigestConfigPanel dealId={deal.id} />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Loan Details</DialogTitle>
            <DialogDescription>
              Update the borrower and loan information for this deal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerFirstName">First Name</Label>
                <Input
                  id="customerFirstName"
                  value={editForm.customerFirstName}
                  onChange={(e) => setEditForm({ ...editForm, customerFirstName: e.target.value })}
                  data-testid="input-customer-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerLastName">Last Name</Label>
                <Input
                  id="customerLastName"
                  value={editForm.customerLastName}
                  onChange={(e) => setEditForm({ ...editForm, customerLastName: e.target.value })}
                  data-testid="input-customer-last-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={editForm.customerEmail}
                  onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
                  placeholder="borrower@example.com"
                  data-testid="input-customer-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={editForm.customerPhone}
                  onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                  data-testid="input-customer-phone"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyAddress">Property Address</Label>
              <Input
                id="propertyAddress"
                value={editForm.propertyAddress}
                onChange={(e) => setEditForm({ ...editForm, propertyAddress: e.target.value })}
                data-testid="input-property-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loanAmount">Loan Amount</Label>
                <Input
                  id="loanAmount"
                  type="number"
                  value={editForm.loanAmount}
                  onChange={(e) => setEditForm({ ...editForm, loanAmount: e.target.value })}
                  data-testid="input-loan-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="propertyValue">Property Value</Label>
                <Input
                  id="propertyValue"
                  type="number"
                  value={editForm.propertyValue}
                  onChange={(e) => setEditForm({ ...editForm, propertyValue: e.target.value })}
                  data-testid="input-property-value"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate</Label>
                <Input
                  id="interestRate"
                  value={editForm.interestRate}
                  onChange={(e) => setEditForm({ ...editForm, interestRate: e.target.value })}
                  placeholder="8.5%"
                  data-testid="input-interest-rate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loanType">Loan Type (Document List)</Label>
                <Select
                  value={editForm.loanType}
                  onValueChange={(value) => setEditForm({ ...editForm, loanType: value })}
                >
                  <SelectTrigger data-testid="select-loan-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rtl">RTL</SelectItem>
                    <SelectItem value="dscr">DSCR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="loanPurpose">Loan Purpose</Label>
                <Select
                  value={editForm.loanPurpose}
                  onValueChange={(value) => setEditForm({ ...editForm, loanPurpose: value })}
                >
                  <SelectTrigger data-testid="select-loan-purpose">
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="refinance">Refinance</SelectItem>
                    <SelectItem value="cashout">Cash Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <Select
                value={editForm.propertyType}
                onValueChange={(value) => setEditForm({ ...editForm, propertyType: value })}
              >
                <SelectTrigger data-testid="select-property-type">
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sfr">Single Family Residence</SelectItem>
                  <SelectItem value="2-4unit">2-4 Unit</SelectItem>
                  <SelectItem value="condo">Condo</SelectItem>
                  <SelectItem value="townhouse">Townhouse</SelectItem>
                  <SelectItem value="multifamily">Multifamily (5+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button 
              onClick={() => updateDealMutation.mutate(editForm)}
              disabled={updateDealMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateDealMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>
              Create a task and assign it to a team member.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="taskName">Task Name</Label>
              <Input
                id="taskName"
                value={taskForm.taskName}
                onChange={(e) => setTaskForm({ ...taskForm, taskName: e.target.value })}
                placeholder="e.g., Review appraisal report"
                data-testid="input-task-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskDescription">Description (optional)</Label>
              <Textarea
                id="taskDescription"
                value={taskForm.taskDescription}
                onChange={(e) => setTaskForm({ ...taskForm, taskDescription: e.target.value })}
                placeholder="Add details about this task..."
                data-testid="input-task-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taskPriority">Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value) => setTaskForm({ ...taskForm, priority: value })}
                >
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taskDueDate">Due Date (optional)</Label>
                <Input
                  id="taskDueDate"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  data-testid="input-task-due-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskAssignee">Assign To</Label>
              <Select
                value={taskForm.assignedTo}
                onValueChange={(value) => setTaskForm({ ...taskForm, assignedTo: value })}
              >
                <SelectTrigger data-testid="select-task-assignee">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamData?.teamMembers?.map((member) => (
                    <SelectItem key={member.id} value={member.id.toString()}>
                      {member.fullName || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)} data-testid="button-cancel-task">
              Cancel
            </Button>
            <Button
              onClick={() => createTaskMutation.mutate(taskForm)}
              disabled={!taskForm.taskName || createTaskMutation.isPending}
              data-testid="button-save-task"
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Document Requirement</DialogTitle>
            <DialogDescription>
              Add a new document to the checklist for this deal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="documentName">Document Name</Label>
              <Input
                id="documentName"
                value={documentForm.documentName}
                onChange={(e) => setDocumentForm({ ...documentForm, documentName: e.target.value })}
                placeholder="e.g., Property Insurance Declaration"
                data-testid="input-document-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentCategory">Category</Label>
              <Select
                value={documentForm.documentCategory}
                onValueChange={(value) => setDocumentForm({ ...documentForm, documentCategory: value })}
              >
                <SelectTrigger data-testid="select-document-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrower_docs">Borrower Documents</SelectItem>
                  <SelectItem value="entity_docs">Entity Documents</SelectItem>
                  <SelectItem value="property_docs">Property Documents</SelectItem>
                  <SelectItem value="financial_docs">Financial Documents</SelectItem>
                  <SelectItem value="closing_docs">Closing Documents</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="documentDescription">Description (optional)</Label>
              <Textarea
                id="documentDescription"
                value={documentForm.documentDescription}
                onChange={(e) => setDocumentForm({ ...documentForm, documentDescription: e.target.value })}
                placeholder="Additional details about this document..."
                data-testid="input-document-description"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isRequired"
                checked={documentForm.isRequired}
                onCheckedChange={(checked) => setDocumentForm({ ...documentForm, isRequired: checked as boolean })}
                data-testid="checkbox-document-required"
              />
              <Label htmlFor="isRequired" className="font-normal">
                This document is required
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentDialogOpen(false)} data-testid="button-cancel-document">
              Cancel
            </Button>
            <Button
              onClick={() => createDocumentMutation.mutate(documentForm)}
              disabled={!documentForm.documentName || createDocumentMutation.isPending}
              data-testid="button-save-document"
            >
              {createDocumentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

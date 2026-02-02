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
  User,
  Calendar,
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
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    "initial-review": "bg-yellow-100 text-yellow-800",
    "term-sheet": "bg-blue-100 text-blue-800",
    "onboarding": "bg-purple-100 text-purple-800",
    "processing": "bg-red-100 text-red-800",
    "underwriting": "bg-indigo-100 text-indigo-800",
    "closing": "bg-teal-100 text-teal-800",
    "closed": "bg-green-100 text-green-800",
  };
  return colors[stage] || "bg-gray-100 text-gray-800";
}

function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    "initial-review": "Initial Review",
    "term-sheet": "Term Sheet",
    "onboarding": "Onboarding",
    "processing": "Processing",
    "underwriting": "Underwriting",
    "closing": "Closing",
    "closed": "Closed",
  };
  return labels[stage] || stage;
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

  const handleContactBorrower = () => {
    if (deal?.customerEmail) {
      const subject = encodeURIComponent(`Regarding Your Loan - ${deal.propertyAddress}`);
      const body = encodeURIComponent(`Dear ${deal.customerFirstName},\n\n`);
      window.open(`mailto:${deal.customerEmail}?subject=${subject}&body=${body}`, "_blank");
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
  const borrowerEmail = `${deal.customerFirstName.toLowerCase()}.${deal.customerLastName.toLowerCase()}@email.com`;

  return (
    <div className="p-6 space-y-6">
      <Link href="/admin/deals">
        <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" data-testid="text-borrower-name">{borrowerName}</h1>
            <Badge className={cn("text-sm", getStageColor(deal.stage))} data-testid="badge-deal-stage">
              {getStageLabel(deal.stage)}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-1 mt-1" data-testid="text-property-address">
            <Building className="h-4 w-4" />
            {deal.propertyAddress}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEditDialog} data-testid="button-edit-loan">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Loan
          </Button>
          <Button onClick={handleContactBorrower} data-testid="button-contact-borrower">
            <Mail className="h-4 w-4 mr-2" />
            Contact Borrower
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full" data-testid="tabs-deal-detail">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="overview" className="flex items-center gap-2" data-testid="tab-overview">
            <DollarSign className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2" data-testid="tab-documents">
            <FileText className="h-4 w-4" />
            Documents
            <Badge variant="secondary" className="ml-1 text-xs" data-testid="badge-documents-count">{documents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-2" data-testid="tab-tasks">
            <CheckSquare className="h-4 w-4" />
            Tasks
            <Badge variant="secondary" className="ml-1 text-xs" data-testid="badge-tasks-count">0</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <DollarSign className="h-5 w-5" />
                    Loan Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Loan Amount</p>
                      <p className="text-xl font-bold" data-testid="text-loan-amount">{formatCurrency(deal.loanData?.loanAmount || 0)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Interest Rate</p>
                      <p className="text-xl font-bold" data-testid="text-interest-rate">{deal.interestRate}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Property Value</p>
                      <p className="text-xl font-bold" data-testid="text-property-value">{formatCurrency(deal.loanData?.propertyValue || 0)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Loan Term</p>
                      <p className="text-xl font-bold" data-testid="text-loan-term">{deal.loanData?.loanTerm || "12 months"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Loan-to-Value (LTV)</p>
                      <p className="text-xl font-bold" data-testid="text-ltv">{deal.loanData?.ltv || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Loan Type</p>
                      <p className="text-xl font-bold" data-testid="text-loan-type">{getLoanTypeLabel(deal.loanData?.loanType)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building className="h-5 w-5" />
                    Property Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{address.street}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">City</p>
                      <p className="font-medium">{address.city}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">State</p>
                      <p className="font-medium">{address.state}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">ZIP Code</p>
                      <p className="font-medium">{address.zip}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Property Type</p>
                      <p className="font-medium">{deal.loanData?.propertyType || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Appraised Value</p>
                      <p className="font-medium">{formatCurrency(deal.loanData?.propertyValue || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5" />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {deal.createdAt
                          ? new Date(deal.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Updated</p>
                      <p className="font-medium">
                        {deal.createdAt
                          ? new Date(deal.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5" />
                    Borrower
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{borrowerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {borrowerEmail}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Broker</p>
                    <p className="font-medium">{deal.userName || "N/A"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          {documents.length === 0 ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Documents</CardTitle>
                <Button size="sm" onClick={() => setDocumentDialogOpen(true)} data-testid="button-add-document-empty">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Document
                </Button>
              </CardHeader>
              <CardContent className="py-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No documents yet</h3>
                <p className="text-muted-foreground">Click "Add Document" to add a document requirement</p>
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
                  <Button size="sm" onClick={() => setDocumentDialogOpen(true)} data-testid="button-add-document">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Document
                  </Button>
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

        <TabsContent value="tasks" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Tasks</CardTitle>
              <Button size="sm" onClick={() => setTaskDialogOpen(true)} data-testid="button-add-task">
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            </CardHeader>
            <CardContent>
              {(!tasksData?.tasks || tasksData.tasks.length === 0) ? (
                <div className="py-8 text-center">
                  <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No tasks yet</h3>
                  <p className="text-muted-foreground">Click "Add Task" to create a new task</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasksData.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border",
                        task.status === "completed" && "bg-muted/50"
                      )}
                      data-testid={`task-item-${task.id}`}
                    >
                      <button
                        onClick={() => updateTaskMutation.mutate({
                          taskId: task.id,
                          status: task.status === "completed" ? "pending" : "completed"
                        })}
                        className="mt-0.5"
                        data-testid={`button-toggle-task-${task.id}`}
                      >
                        {task.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "font-medium",
                            task.status === "completed" && "line-through text-muted-foreground"
                          )}>
                            {task.taskName}
                          </span>
                          {task.priority && task.priority !== "medium" && (
                            <Badge variant={task.priority === "high" || task.priority === "critical" ? "destructive" : "secondary"} className="text-xs">
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                        {task.taskDescription && (
                          <p className="text-sm text-muted-foreground mt-1">{task.taskDescription}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          {task.assigneeName && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.assigneeName}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                          )}
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

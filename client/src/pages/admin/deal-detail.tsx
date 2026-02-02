import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Deal {
  id: number;
  userId: number;
  customerFirstName: string;
  customerLastName: string;
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

  const { data, isLoading, error } = useQuery<DealDetailResponse>({
    queryKey: [`/api/admin/deals/${dealId}`],
    enabled: !!dealId,
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
          <Button variant="outline" data-testid="button-edit-loan">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Loan
          </Button>
          <Button data-testid="button-contact-borrower">
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
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No documents yet</h3>
                <p className="text-muted-foreground">Documents will appear here once the deal is created with a loan type</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5" />
                    Required Documents
                  </CardTitle>
                  <CardDescription>
                    {getLoanTypeLabel(deal.loanData?.loanType)} Loan Document Checklist
                  </CardDescription>
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
                                      <p className="text-xs text-muted-foreground">{doc.documentDescription}</p>
                                    )}
                                  </div>
                                  {doc.isRequired && (
                                    <Badge variant="outline" className="text-xs">Required</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {getDocumentStatusBadge(doc.status)}
                                  <div className="flex gap-1">
                                    {doc.status === 'pending' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => updateDocumentStatus.mutate({ docId: doc.id, status: 'not_applicable' })}
                                          disabled={updateDocumentStatus.isPending}
                                          data-testid={`button-na-${doc.id}`}
                                        >
                                          N/A
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => updateDocumentStatus.mutate({ docId: doc.id, status: 'uploaded' })}
                                          disabled={updateDocumentStatus.isPending}
                                          data-testid={`button-upload-${doc.id}`}
                                        >
                                          <Upload className="h-3 w-3 mr-1" />
                                          Mark Uploaded
                                        </Button>
                                      </>
                                    )}
                                    {doc.status === 'uploaded' && (
                                      <>
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
                                    {doc.status === 'rejected' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateDocumentStatus.mutate({ docId: doc.id, status: 'pending' })}
                                        disabled={updateDocumentStatus.isPending}
                                        data-testid={`button-reset-${doc.id}`}
                                      >
                                        Reset
                                      </Button>
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
            <CardContent className="py-12 text-center">
              <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No tasks yet</h3>
              <p className="text-muted-foreground">Tasks will appear here once created</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

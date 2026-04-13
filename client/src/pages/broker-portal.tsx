import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign,
  Building2,
  User,
  Calendar,
  FileText,
  Loader2,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload,
  Inbox as InboxIcon,
  MessageSquare,
  ChevronDown,
  HelpCircle,
  LayoutGrid,
  Hash,
  MapPin,
  TrendingUp,
  Percent,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { sortByActionPriority, docActionPriority, safeFormat } from "@/lib/utils";
import { PortalOnboarding, hasCompletedOnboarding } from "@/components/portal/PortalOnboarding";
import { PortalSidebar, type PortalView } from "@/components/portal/PortalSidebar";

interface BrokerPortalData {
  deal: {
    id: number;
    programName: string | null;
    dealName: string;
    borrowerName: string;
    borrowerEmail: string | null;
    borrowerPhone: string | null;
    propertyAddress: string;
    status: string;
    currentStage: string;
    progressPercentage: number;
    loanAmount: number;
    interestRate: number | null;
    loanTermMonths: number | null;
    loanType: string;
    targetCloseDate: string | null;
    applicationDate: string | null;
  };
  stages: Array<{
    id: number;
    stageName: string;
    stageKey: string;
    stageOrder: number;
    status: string;
  }>;
  documents: Array<{
    id: number;
    documentName: string;
    documentCategory: string;
    documentDescription: string;
    status: string;
    isRequired: boolean;
    assignedTo: string | null;
    uploadedAt: string | null;
    reviewedAt: string | null;
    files: Array<{
      id: number;
      fileName: string | null;
      fileSize: number | null;
      uploadedAt: string;
    }>;
  }>;
  onboardingConfig?: any;
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

export default function BrokerPortal() {
  const [, params] = useRoute("/broker-portal/:token");
  const token = params?.token;

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Invalid Link</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">The link you're trying to access is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <BrokerPortalContent token={token} />;
}

function BrokerPortalContent({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !hasCompletedOnboarding("broker", token);
  });
  const [activeView, setActiveView] = useState<PortalView>("dashboard");
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);

  const { data, isLoading, isError, error } = useQuery<BrokerPortalData>({
    queryKey: ["broker-portal", token],
    queryFn: async () => {
      const response = await fetch(`/api/broker-portal/${token}`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    enabled: !!user,
    retry: false,
  });

  const { data: relatedDealsData } = useQuery<{ deals: RelatedDeal[] }>({
    queryKey: ["broker-portal", token, "related-deals"],
    queryFn: async () => {
      const response = await fetch(`/api/broker-portal/${token}/related-deals`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    enabled: !!user && !showOnboarding,
    retry: false,
  });

  const relatedDeals = relatedDealsData?.deals || [];
  const displayDeals = relatedDeals.length > 0
    ? relatedDeals
    : data ? [{ id: data.deal.id, dealName: data.deal.dealName, propertyAddress: data.deal.propertyAddress, loanAmount: data.deal.loanAmount, loanType: data.deal.loanType, status: data.deal.status, currentStage: data.deal.currentStage, portalToken: token, programName: data.deal.programName, isCurrent: true }]
    : [];

  const handleDealSwitch = (portalToken: string) => {
    if (portalToken !== token) {
      setLocation(`/broker-portal/${portalToken}`);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async ({ docId, file }: { docId: number; file: File }) => {
      const urlRes = await fetch(`/api/broker-portal/${token}/documents/${docId}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const urlData = await urlRes.json();

      let objectPath = urlData.objectPath;
      let fileName = file.name;
      let fileSize = file.size;
      let mimeType = file.type;

      if (urlData.useDirectUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const directRes = await fetch(urlData.uploadURL, { method: "POST", body: formData });
        if (!directRes.ok) throw new Error("Direct upload failed");
        const directData = await directRes.json();
        objectPath = directData.objectPath;
        fileName = directData.fileName;
        fileSize = directData.fileSize;
        mimeType = directData.mimeType;
      } else {
        await fetch(urlData.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
      }

      const completeRes = await fetch(`/api/broker-portal/${token}/documents/${docId}/upload-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath, fileName, fileSize, mimeType }),
      });
      if (!completeRes.ok) throw new Error("Failed to complete upload");
      return completeRes.json();
    },
    onSuccess: () => {
      toast({ title: "Document uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["broker-portal", token] });
      setUploadingDocId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploadingDocId(null);
    },
  });

  const handleFileSelect = (docId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocId(docId);
    uploadMutation.mutate({ docId, file });
    e.target.value = "";
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active": case "in_progress": return "bg-blue-100 text-blue-800";
      case "completed": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "on_hold": return "bg-orange-100 text-orange-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getDocumentStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "approved": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "pending": case "uploaded": return <Clock className="h-4 w-4 text-yellow-600" />;
      case "rejected": return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "$0";
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  if (showOnboarding) {
    return (
      <PortalOnboarding
        config={data?.onboardingConfig}
        portalType="broker"
        token={token}
        onComplete={() => setShowOnboarding(false)}
      />
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Please sign in to access your portal.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-64 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle className="text-red-600">Error Loading Deal</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Failed to load the deal."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { deal, stages, documents } = data;
  const approvedDocs = documents.filter((d) => d.status === "approved").length;
  const totalRequiredDocs = documents.filter((d) => d.isRequired).length;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50" data-testid="broker-portal">
      <PortalSidebar
        portalType="broker"
        activeView={activeView}
        onViewChange={setActiveView}
        dealName={deal.dealName}
      />

      <main className="flex-1 p-3 sm:p-4 md:p-8 overflow-y-auto">
        {activeView === "dashboard" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{deal.dealName}</h1>
              <p className="text-sm text-muted-foreground">Deal Overview</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Loan Amount</p>
                      <p className="text-2xl font-bold">{formatCurrency(deal.loanAmount)}</p>
                    </div>
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Status</p>
                      <Badge className={getStatusColor(deal.status)}>{deal.status}</Badge>
                    </div>
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Progress</p>
                      <p className="text-2xl font-bold">{deal.progressPercentage}%</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Documents</p>
                      <p className="text-2xl font-bold">{approvedDocs}/{totalRequiredDocs}</p>
                    </div>
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader><CardTitle className="text-lg">Deal Details</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <Building2 className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-600">Property</p>
                        <p className="text-gray-900 font-medium">{deal.propertyAddress}</p>
                      </div>
                    </div>
                    {deal.loanType && (
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600">Loan Type</p>
                          <p className="text-gray-900 font-medium">{deal.loanType}</p>
                        </div>
                      </div>
                    )}
                    {deal.interestRate !== null && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Interest Rate</span>
                        <span className="font-medium">{deal.interestRate}%</span>
                      </div>
                    )}
                    {deal.loanTermMonths && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Term</span>
                        <span className="font-medium">{deal.loanTermMonths} months</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Borrower Info</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-600">Name</p>
                        <p className="text-gray-900 font-medium">{deal.borrowerName}</p>
                      </div>
                    </div>
                    {deal.borrowerEmail && (
                      <div className="flex items-start gap-3">
                        <Mail className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600">Email</p>
                          <p className="text-gray-900 font-medium">{deal.borrowerEmail}</p>
                        </div>
                      </div>
                    )}
                    {deal.borrowerPhone && (
                      <div className="flex items-start gap-3">
                        <Phone className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600">Phone</p>
                          <p className="text-gray-900 font-medium">{deal.borrowerPhone}</p>
                        </div>
                      </div>
                    )}
                    {deal.targetCloseDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Target Close</span>
                        <span className="font-medium">{safeFormat(deal.targetCloseDate, "MMM dd, yyyy")}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {stages.length > 0 && (
              <Card className="mb-6">
                <CardHeader><CardTitle className="text-lg">Deal Stages</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stages.map((stage, index) => (
                      <div key={stage.id} className="flex items-center gap-4">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${
                          stage.status === "completed" ? "bg-green-100 text-green-700" :
                          stage.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {stage.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-gray-900">{stage.stageName}</h4>
                        </div>
                        <Badge variant={stage.status === "completed" ? "default" : stage.status === "in_progress" ? "secondary" : "outline"} className="text-xs">
                          {stage.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {activeView === "loans" && (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
                  <p className="text-sm text-muted-foreground">Upload and track required documents</p>
                </div>
                {displayDeals.length > 0 && (
                  <div className="w-full sm:w-auto sm:min-w-[280px]">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Select Loan</label>
                    <Select
                      value={token}
                      onValueChange={handleDealSwitch}
                      data-testid="select-loan-broker"
                    >
                      <SelectTrigger className="w-full" data-testid="select-trigger-loan-broker">
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

            {documents.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No documents required for this deal.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sortByActionPriority(documents, (d: any) => docActionPriority(d.status)).map((doc) => (
                  <Card key={doc.id} data-testid={`doc-card-${doc.id}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {getDocumentStatusIcon(doc.status)}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm text-gray-900">{doc.documentName}</h4>
                              {doc.documentDescription && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="inline-flex items-center justify-center flex-shrink-0"
                                        aria-label={`Info: ${doc.documentDescription}`}
                                        data-testid={`tooltip-doc-desc-${doc.id}`}
                                      >
                                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                      <p className="text-xs">{doc.documentDescription}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {doc.isRequired && <Badge variant="outline" className="text-xs">Required</Badge>}
                              {doc.assignedTo === "broker" && <Badge variant="secondary" className="text-xs">Assigned to you</Badge>}
                            </div>
                            {doc.files.length > 0 && (
                              <div className="mt-2 text-xs text-gray-600">
                                <p>{doc.files.length} file(s) uploaded</p>
                                {doc.uploadedAt && (
                                  <p className="text-gray-500">Uploaded: {safeFormat(doc.uploadedAt, "MMM dd, yyyy")}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                          <Badge
                            variant={doc.status === "approved" ? "default" : doc.status === "pending" || doc.status === "uploaded" ? "secondary" : doc.status === "rejected" ? "destructive" : "outline"}
                            className="text-xs"
                          >
                            {doc.status}
                          </Badge>
                          {doc.status !== "approved" && (
                            <div>
                              <input
                                type="file"
                                className="hidden"
                                ref={(el) => { fileInputRefs.current[doc.id] = el; }}
                                onChange={(e) => handleFileSelect(doc.id, e)}
                                data-testid={`file-input-${doc.id}`}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => fileInputRefs.current[doc.id]?.click()}
                                disabled={uploadingDocId === doc.id}
                                data-testid={`button-upload-${doc.id}`}
                              >
                                {uploadingDocId === doc.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Upload className="h-3 w-3 mr-1" />
                                )}
                                Upload
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {activeView === "inbox" && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
              <p className="text-sm text-muted-foreground">Messages and notifications</p>
            </div>
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No messages yet. You'll see updates about your deal here.</p>
              </CardContent>
            </Card>
          </div>
        )}

        {activeView === "programs" && (
          <BrokerProgramsView />
        )}

        {activeView === "commissions" && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Commissions</h1>
              <p className="text-sm text-muted-foreground">Track your earnings</p>
            </div>
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Commission tracking coming soon.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

interface BrokerProgram {
  id: number;
  name: string;
  description: string | null;
  loanType: string;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  minLtv: number | null;
  maxLtv: number | null;
  minInterestRate: number | null;
  maxInterestRate: number | null;
  minDscr: number | null;
  minFico: number | null;
  termOptions: string | null;
  eligiblePropertyTypes: string[] | null;
  isActive: boolean;
  updatedAt: string | null;
}

function BrokerProgramsView() {
  const { data, isLoading } = useQuery<{ programs: BrokerProgram[] }>({
    queryKey: ["/api/broker/programs"],
    refetchInterval: 30000,
  });

  const programs = data?.programs || [];

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    return `$${(amount / 1000).toFixed(0)}K`;
  };

  const getLoanTypeBadgeColor = (type: string) => {
    const t = type?.toLowerCase();
    if (t === "dscr") return "bg-blue-100 text-blue-800";
    if (t === "rtl" || t === "fix & flip") return "bg-orange-100 text-orange-800";
    if (t === "bridge") return "bg-purple-100 text-purple-800";
    if (t === "construction") return "bg-amber-100 text-amber-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div data-testid="broker-programs-view">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" data-testid="text-programs-title">Available Programs</h1>
        <p className="text-sm text-muted-foreground">Loan programs available from your lender</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutGrid className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-700" data-testid="text-no-programs">No Programs Available</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Your lender has not published any loan programs yet. Check back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="programs-grid">
          {programs.map((program) => (
            <Card key={program.id} className="hover:shadow-md transition-shadow" data-testid={`card-program-${program.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-semibold truncate">{program.name}</CardTitle>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Hash className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground font-mono" data-testid={`text-program-id-${program.id}`}>
                        ID: {program.id}
                      </span>
                    </div>
                  </div>
                  <Badge className={`${getLoanTypeBadgeColor(program.loanType)} flex-shrink-0 text-xs`} data-testid={`badge-program-type-${program.id}`}>
                    {program.loanType}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {program.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{program.description}</p>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Loan Range</p>
                      <p className="text-xs font-medium">
                        {formatCurrency(program.minLoanAmount)} – {formatCurrency(program.maxLoanAmount)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">LTV</p>
                      <p className="text-xs font-medium">
                        {program.minLtv ?? "—"}% – {program.maxLtv ?? "—"}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Interest Rate</p>
                      <p className="text-xs font-medium">
                        {program.minInterestRate ?? "—"}% – {program.maxInterestRate ?? "—"}%
                      </p>
                    </div>
                  </div>
                  {program.minDscr != null && (
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
                      <div>
                        <p className="text-[11px] text-muted-foreground">Min DSCR</p>
                        <p className="text-xs font-medium">{program.minDscr}</p>
                      </div>
                    </div>
                  )}
                  {program.minFico != null && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-teal-600 flex-shrink-0" />
                      <div>
                        <p className="text-[11px] text-muted-foreground">Min FICO</p>
                        <p className="text-xs font-medium">{program.minFico}</p>
                      </div>
                    </div>
                  )}
                  {program.termOptions && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600 flex-shrink-0" />
                      <div>
                        <p className="text-[11px] text-muted-foreground">Terms</p>
                        <p className="text-xs font-medium">{program.termOptions} mo</p>
                      </div>
                    </div>
                  )}
                </div>
                {program.eligiblePropertyTypes && program.eligiblePropertyTypes.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">Eligible Property Types</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {program.eligiblePropertyTypes.slice(0, 5).map((pt: string) => (
                        <Badge key={pt} variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                          {pt.replace(/-/g, " ")}
                        </Badge>
                      ))}
                      {program.eligiblePropertyTypes.length > 5 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          +{program.eligiblePropertyTypes.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

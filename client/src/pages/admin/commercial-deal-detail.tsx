import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Building2,
  User,
  DollarSign,
  MapPin,
  FileText,
  Download,
  Loader2,
  Calendar,
  Briefcase,
  Check,
  X,
  MessageSquare,
  RefreshCw,
  Sparkles,
  StickyNote,
  Clock,
  AlertTriangle,
  CheckCircle,
  HardHat,
  Landmark,
  CreditCard,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SubmissionDocument {
  id: number;
  docType: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

interface CommercialSubmissionDetail {
  id: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  adminNotes: string | null;
  submitterType: string;
  brokerOrDeveloperName: string;
  companyName: string;
  email: string;
  phone: string;
  roleOnDeal: string;
  loanType: string;
  requestedLoanAmount: number;
  requestedLTV: number | null;
  requestedLTC: number | null;
  interestOnly: boolean;
  desiredCloseDate: string;
  exitStrategyType: string | null;
  exitStrategyDetails: string | null;
  propertyName: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  occupancyType: string;
  unitsOrSqft: number;
  yearBuilt: number | null;
  purchasePrice: number | null;
  asIsValue: number;
  arvOrStabilizedValue: number | null;
  currentNOI: number | null;
  inPlaceRent: number | null;
  proFormaNOI: number | null;
  capexBudgetTotal: number;
  businessPlanSummary: string;
  primarySponsorName: string;
  primarySponsorExperienceYears: number;
  numberOfSimilarProjects: number;
  netWorth: number;
  liquidity: number;
  aiDecision: string | null;
  aiDecisionReason: string | null;
  reviewedAt: string | null;
  documents: SubmissionDocument[];
  totalProjectCost: number | null;
  landAcquisitionCost: number | null;
  hardCosts: number | null;
  softCosts: number | null;
  contingency: number | null;
  projectTimeline: number | null;
  generalContractor: string | null;
  entityName: string | null;
  entityType: string | null;
  ownershipStructure: string | null;
  sponsorCreditScore: string | null;
  currentLender: string | null;
  currentLoanBalance: number | null;
  currentInterestRate: number | null;
  loanMaturityDate: string | null;
  prepaymentPenalty: number | null;
  additionalNotes: string | null;
}

interface AiReviewData {
  aiDecision: string | null;
  aiDecisionReason: string | null;
  reviewedAt: string | null;
  reviews: Array<{
    id: number;
    decision: string;
    reason: string;
    riskFactors: string[] | null;
    strengths: string[] | null;
    score: number | null;
    createdAt: string;
  }>;
}

interface SubmissionNote {
  id: number;
  noteText: string;
  adminUserId: number;
  createdAt: string;
}

function getStatusBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    NEW: "bg-primary/10 text-primary",
    UNDER_REVIEW: "bg-warning/10 text-warning",
    IN_REVIEW: "bg-warning/10 text-warning",
    NEEDS_INFO: "bg-warning/10 text-warning",
    DECLINED: "bg-destructive/10 text-destructive",
    APPROVED: "bg-success/10 text-success",
  };
  return colors[status] || "bg-muted text-muted-foreground";
}

function getAiDecisionBadgeClass(decision: string | null): string {
  if (!decision) return "bg-muted text-muted-foreground";
  const colors: Record<string, string> = {
    auto_approved: "bg-success/10 text-success",
    needs_review: "bg-warning/10 text-warning",
    auto_declined: "bg-destructive/10 text-destructive",
  };
  return colors[decision] || "bg-muted text-muted-foreground";
}

function getScoreColor(score: number | null): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score < 30) return "bg-destructive/10 text-destructive";
  if (score <= 70) return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DataField({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  let displayValue: string;
  if (value === null || value === undefined || value === "") {
    displayValue = "N/A";
  } else if (typeof value === "boolean") {
    displayValue = value ? "Yes" : "No";
  } else {
    displayValue = String(value);
  }

  return (
    <div data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{displayValue}</p>
    </div>
  );
}

export default function AdminCommercialDealDetail() {
  const [, params] = useRoute("/admin/commercial/submissions/:id");
  const id = params?.id;
  const { toast } = useToast();

  const [dialogType, setDialogType] = useState<"approve" | "decline" | "info" | null>(null);
  const [dialogReason, setDialogReason] = useState("");
  const [newNote, setNewNote] = useState("");

  const { data: submission, isLoading } = useQuery<CommercialSubmissionDetail>({
    queryKey: ["/api/admin/commercial-submissions", id],
    enabled: !!id,
  });

  const { data: aiReviewData } = useQuery<AiReviewData>({
    queryKey: ["/api/admin/commercial/submissions", id, "ai-review"],
    enabled: !!id,
  });

  const { data: documents } = useQuery<SubmissionDocument[]>({
    queryKey: ["/api/commercial-submissions", id, "documents"],
    enabled: !!id,
  });

  const { data: notes, refetch: refetchNotes } = useQuery<SubmissionNote[]>({
    queryKey: ["/api/admin/commercial/submissions", id, "notes"],
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, adminNotes }: { status: string; adminNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/commercial-submissions/${id}/status`, { status, adminNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-submissions", id] });
      toast({ title: "Status updated" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const rerunAiMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/commercial/submissions/${id}/ai-review`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-submissions", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial/submissions", id, "ai-review"] });
      toast({ title: "AI review completed" });
    },
    onError: () => {
      toast({ title: "Failed to run AI review", variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const res = await apiRequest("POST", `/api/admin/commercial/submissions/${id}/notes`, { noteText });
      return res.json();
    },
    onSuccess: () => {
      refetchNotes();
      setNewNote("");
      toast({ title: "Note added" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogType(null);
    setDialogReason("");
  };

  const handleDialogConfirm = () => {
    if (!dialogType) return;
    const statusMap: Record<string, string> = {
      approve: "APPROVED",
      decline: "DECLINED",
      info: "NEEDS_INFO",
    };
    updateStatusMutation.mutate({
      status: statusMap[dialogType],
      adminNotes: dialogReason || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="loading-state">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-6" data-testid="not-found-state">
        <Link href="/admin/commercial-submissions">
          <Button variant="ghost" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Submissions
          </Button>
        </Link>
        <div className="mt-8 text-center">
          <h2 className="text-xl font-semibold">Submission not found</h2>
          <p className="text-muted-foreground mt-2">The requested submission could not be loaded.</p>
        </div>
      </div>
    );
  }

  const allDocuments = documents || submission.documents || [];
  const latestReview = aiReviewData?.reviews?.[0];

  const dialogTitles: Record<string, string> = {
    approve: "Approve Submission",
    decline: "Decline Submission",
    info: "Request More Information",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/commercial-submissions">
          <Button variant="ghost" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-deal-name">
            {submission.propertyName || "Commercial Submission"}
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge
              className={getStatusBadgeClass(submission.status)}
              data-testid="badge-status"
            >
              {submission.status?.replace(/_/g, " ")}
            </Badge>
            {submission.aiDecision && (
              <Badge
                className={getAiDecisionBadgeClass(submission.aiDecision)}
                data-testid="badge-ai-decision"
              >
                AI: {submission.aiDecision.replace(/_/g, " ")}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground" data-testid="text-submission-id">
              #{submission.id}
            </span>
            <span className="text-sm text-muted-foreground" data-testid="text-submission-date">
              Submitted {formatDate(submission.submittedAt || submission.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setDialogType("approve")}
            data-testid="button-approve"
          >
            <Check className="h-4 w-4 mr-1" />
            Approve
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDialogType("decline")}
            data-testid="button-decline"
          >
            <X className="h-4 w-4 mr-1" />
            Decline
          </Button>
          <Button
            variant="outline"
            onClick={() => setDialogType("info")}
            data-testid="button-request-info"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Request Info
          </Button>
          <Button
            variant="outline"
            onClick={() => rerunAiMutation.mutate()}
            disabled={rerunAiMutation.isPending}
            data-testid="button-rerun-ai"
          >
            {rerunAiMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Re-run AI
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList data-testid="tabs-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">Deal Overview</TabsTrigger>
          <TabsTrigger value="ai-review" data-testid="tab-ai-review">AI Review</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">Admin Notes</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Submitter Info
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <DataField label="Type" value={submission.submitterType} />
                  <DataField label="Name" value={submission.brokerOrDeveloperName} />
                  <DataField label="Company" value={submission.companyName} />
                  <DataField label="Email" value={submission.email} />
                  <DataField label="Phone" value={submission.phone} />
                  <DataField label="Role on Deal" value={submission.roleOnDeal} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Deal Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <DataField label="Loan Type" value={submission.loanType} />
                  <DataField label="Loan Amount" value={formatCurrency(submission.requestedLoanAmount)} />
                  <DataField label="Requested LTV" value={submission.requestedLTV != null ? `${submission.requestedLTV}%` : "N/A"} />
                  <DataField label="Requested LTC" value={submission.requestedLTC != null ? `${submission.requestedLTC}%` : "N/A"} />
                  <DataField label="Interest Only" value={submission.interestOnly} />
                  <DataField label="Desired Close Date" value={formatDate(submission.desiredCloseDate)} />
                  {submission.exitStrategyType && (
                    <>
                      <DataField label="Exit Strategy" value={submission.exitStrategyType} />
                      <DataField label="Exit Details" value={submission.exitStrategyDetails} />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Property Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <DataField label="Property Name" value={submission.propertyName} />
                  <DataField label="Address" value={submission.propertyAddress} />
                  <DataField label="City" value={submission.city} />
                  <DataField label="State" value={submission.state} />
                  <DataField label="Zip" value={submission.zip} />
                  <DataField label="Property Type" value={submission.propertyType} />
                  <DataField label="Occupancy Type" value={submission.occupancyType} />
                  <DataField label={submission.propertyType === "MULTIFAMILY" ? "Units" : "Sq Ft"} value={submission.unitsOrSqft?.toLocaleString()} />
                  <DataField label="Year Built" value={submission.yearBuilt} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Financials
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <DataField label="Purchase Price" value={formatCurrency(submission.purchasePrice)} />
                  <DataField label="As-Is Value" value={formatCurrency(submission.asIsValue)} />
                  <DataField label="ARV / Stabilized Value" value={formatCurrency(submission.arvOrStabilizedValue)} />
                  <DataField label="Current NOI" value={formatCurrency(submission.currentNOI)} />
                  <DataField label="In-Place Rent" value={formatCurrency(submission.inPlaceRent)} />
                  <DataField label="Pro Forma NOI" value={formatCurrency(submission.proFormaNOI)} />
                  <DataField label="CapEx Budget" value={formatCurrency(submission.capexBudgetTotal)} />
                </div>
              </CardContent>
            </Card>

            {(submission.totalProjectCost || submission.hardCosts || submission.softCosts) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HardHat className="h-5 w-5" />
                    Construction Budget
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <DataField label="Total Project Cost" value={formatCurrency(submission.totalProjectCost)} />
                    <DataField label="Land Acquisition" value={formatCurrency(submission.landAcquisitionCost)} />
                    <DataField label="Hard Costs" value={formatCurrency(submission.hardCosts)} />
                    <DataField label="Soft Costs" value={formatCurrency(submission.softCosts)} />
                    <DataField label="Contingency" value={formatCurrency(submission.contingency)} />
                    <DataField label="Timeline (months)" value={submission.projectTimeline} />
                    <DataField label="General Contractor" value={submission.generalContractor} />
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Sponsor / Entity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <DataField label="Primary Sponsor" value={submission.primarySponsorName} />
                  <DataField label="Years of Experience" value={submission.primarySponsorExperienceYears} />
                  <DataField label="Similar Projects" value={submission.numberOfSimilarProjects} />
                  <DataField label="Net Worth" value={formatCurrency(submission.netWorth)} />
                  <DataField label="Liquidity" value={formatCurrency(submission.liquidity)} />
                  <DataField label="Credit Score" value={submission.sponsorCreditScore} />
                  <DataField label="Entity Name" value={submission.entityName} />
                  <DataField label="Entity Type" value={submission.entityType} />
                  <DataField label="Ownership Structure" value={submission.ownershipStructure} />
                </div>
              </CardContent>
            </Card>

            {(submission.currentLender || submission.currentLoanBalance) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Existing Debt
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <DataField label="Current Lender" value={submission.currentLender} />
                    <DataField label="Loan Balance" value={formatCurrency(submission.currentLoanBalance)} />
                    <DataField label="Interest Rate" value={submission.currentInterestRate != null ? `${submission.currentInterestRate}%` : "N/A"} />
                    <DataField label="Maturity Date" value={formatDate(submission.loanMaturityDate)} />
                    <DataField label="Prepayment Penalty" value={submission.prepaymentPenalty != null ? `${submission.prepaymentPenalty}%` : "N/A"} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {submission.businessPlanSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Business Plan Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap" data-testid="text-business-plan">
                  {submission.businessPlanSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {submission.additionalNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Additional Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap" data-testid="text-additional-notes">
                  {submission.additionalNotes}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ai-review" className="space-y-6 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Review Summary
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => rerunAiMutation.mutate()}
                disabled={rerunAiMutation.isPending}
                data-testid="button-rerun-ai-tab"
              >
                {rerunAiMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Re-run AI Review
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {submission.aiDecision ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className={getAiDecisionBadgeClass(submission.aiDecision)} data-testid="badge-ai-decision-detail">
                      {submission.aiDecision.replace(/_/g, " ")}
                    </Badge>
                    {submission.reviewedAt && (
                      <span className="text-sm text-muted-foreground">
                        Reviewed {formatDate(submission.reviewedAt)}
                      </span>
                    )}
                  </div>
                  {submission.aiDecisionReason && (
                    <div className="p-4 bg-muted rounded-md">
                      <p className="text-sm font-medium mb-1">Decision Reason</p>
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-ai-reason">
                        {submission.aiDecisionReason}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No AI review has been run yet.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {latestReview && (
            <>
              {latestReview.score != null && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">AI Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20">
                        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="text-muted"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeDasharray={`${latestReview.score}, 100`}
                            className={
                              latestReview.score < 30 ? "text-destructive" :
                              latestReview.score <= 70 ? "text-warning" : "text-success"
                            }
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" data-testid="text-ai-score">
                          {latestReview.score}
                        </span>
                      </div>
                      <Badge className={getScoreColor(latestReview.score)} data-testid="badge-ai-score">
                        {latestReview.score < 30 ? "High Risk" : latestReview.score <= 70 ? "Moderate" : "Low Risk"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {latestReview.riskFactors && latestReview.riskFactors.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Risk Factors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2" data-testid="list-risk-factors">
                        {latestReview.riskFactors.map((factor, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <X className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {latestReview.strengths && latestReview.strengths.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-success" />
                        Strengths
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2" data-testid="list-strengths">
                        {latestReview.strengths.map((strength, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                            {strength}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}

          {aiReviewData?.reviews && aiReviewData.reviews.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Review History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiReviewData.reviews.map((review) => (
                  <div key={review.id} className="p-3 border rounded-md space-y-1" data-testid={`review-history-${review.id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={getAiDecisionBadgeClass(review.decision)}>
                        {review.decision?.replace(/_/g, " ")}
                      </Badge>
                      {review.score != null && (
                        <Badge className={getScoreColor(review.score)}>Score: {review.score}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                    </div>
                    {review.reason && <p className="text-sm text-muted-foreground">{review.reason}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documents ({allDocuments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allDocuments.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No documents uploaded.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2 border-b last:border-0"
                      data-testid={`row-document-${doc.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-doc-name-${doc.id}`}>
                            {doc.originalFileName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.docType}
                            {doc.fileSize ? ` - ${(doc.fileSize / 1024).toFixed(0)} KB` : ""}
                            {doc.uploadedAt ? ` - ${formatDate(doc.uploadedAt)}` : ""}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `/api/admin/commercial-submissions/${id}/documents/${doc.id}/download`,
                            "_blank"
                          )
                        }
                        data-testid={`button-download-${doc.id}`}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <StickyNote className="h-5 w-5" />
                Admin Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an internal note..."
                  rows={3}
                  data-testid="textarea-new-note"
                />
                <Button
                  onClick={() => addNoteMutation.mutate(newNote)}
                  disabled={!newNote.trim() || addNoteMutation.isPending}
                  data-testid="button-add-note"
                >
                  {addNoteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Note
                </Button>
              </div>

              {submission.adminNotes && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Status Notes</p>
                  <p className="text-sm">{submission.adminNotes}</p>
                </div>
              )}

              {notes && notes.length > 0 && (
                <div className="space-y-3 mt-4">
                  {notes.map((note) => (
                    <div key={note.id} className="p-3 border rounded-md" data-testid={`note-${note.id}`}>
                      <p className="text-sm">{note.noteText}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(note.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4" data-testid="activity-timeline">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Submission Created</p>
                    <p className="text-xs text-muted-foreground">{formatDate(submission.createdAt)}</p>
                  </div>
                </div>
                {submission.submittedAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Submitted for Review</p>
                      <p className="text-xs text-muted-foreground">{formatDate(submission.submittedAt)}</p>
                    </div>
                  </div>
                )}
                {submission.reviewedAt && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-warning rounded-full mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">AI Review Completed</p>
                      <p className="text-xs text-muted-foreground">{formatDate(submission.reviewedAt)}</p>
                    </div>
                  </div>
                )}
                {(submission.status === "APPROVED" || submission.status === "DECLINED") && (
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${submission.status === "APPROVED" ? "bg-success" : "bg-destructive"}`} />
                    <div>
                      <p className="text-sm font-medium">
                        {submission.status === "APPROVED" ? "Approved" : "Declined"}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(submission.updatedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogType !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent data-testid="dialog-action">
          <DialogHeader>
            <DialogTitle>{dialogType ? dialogTitles[dialogType] : ""}</DialogTitle>
            <DialogDescription>
              {dialogType === "approve" && "Are you sure you want to approve this submission?"}
              {dialogType === "decline" && "Please provide a reason for declining this submission."}
              {dialogType === "info" && "Please describe what additional information is needed."}
            </DialogDescription>
          </DialogHeader>
          {(dialogType === "decline" || dialogType === "info") && (
            <Textarea
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
              placeholder={dialogType === "decline" ? "Reason for declining..." : "What information is needed..."}
              rows={3}
              data-testid="textarea-dialog-reason"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-dialog-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleDialogConfirm}
              disabled={updateStatusMutation.isPending || ((dialogType === "decline" || dialogType === "info") && !dialogReason.trim())}
              variant={dialogType === "decline" ? "destructive" : "default"}
              data-testid="button-dialog-confirm"
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {dialogType === "approve" && "Approve"}
              {dialogType === "decline" && "Decline"}
              {dialogType === "info" && "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

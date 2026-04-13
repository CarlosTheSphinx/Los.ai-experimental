import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Building2,
  User,
  DollarSign,
  MapPin,
  FileText,
  Calendar,
  Briefcase,
  Clock,
  HardHat,
  Landmark,
  Calculator,
  Plus,
} from "lucide-react";

interface SubmissionDocument {
  id: number;
  docType: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

interface CommercialSubmission {
  id: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
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
  aiDecision: string | null;
  documents: SubmissionDocument[];
}

function getStatusBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: "bg-secondary text-secondary-foreground",
    NEW: "bg-info/20 text-info",
    UNDER_REVIEW: "bg-warning/20 text-warning",
    NEEDS_INFO: "bg-warning/20 text-warning",
    APPROVED: "bg-success/10 text-success",
    DECLINED: "bg-destructive/10 text-destructive",
    EXPIRED: "bg-muted text-muted-foreground",
  };
  return colors[status] || "bg-muted text-muted-foreground";
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function CommercialSubmissionDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/commercial-submission/:id");
  const id = params?.id;

  const { data: submission, isLoading } = useQuery<CommercialSubmission>({
    queryKey: ["/api/commercial-submissions", id],
    enabled: !!id && id !== "new",
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Submission not found</h3>
          <p className="text-muted-foreground mb-4">This submission may have been removed or you don't have access.</p>
          <Button onClick={() => navigate("/commercial/dashboard")} data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const hasConstruction = submission.totalProjectCost || submission.hardCosts || submission.softCosts;
  const hasExistingDebt = submission.currentLender || submission.currentLoanBalance;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/commercial/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              {submission.propertyName || "Untitled Deal"}
            </h1>
            <p className="text-muted-foreground">
              Submission #{submission.id}
            </p>
          </div>
        </div>
        <Badge className={getStatusBadgeClass(submission.status)} data-testid="badge-status">
          {submission.status?.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">Requested Amount</p>
              <p className="text-xl font-bold" data-testid="text-loan-amount">
                {formatCurrency(submission.requestedLoanAmount)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">Property Type</p>
              <p className="text-xl font-bold" data-testid="text-property-type">
                {submission.propertyType || "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Clock className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">Submitted</p>
              <p className="text-xl font-bold" data-testid="text-submitted-date">
                {formatDate(submission.submittedAt || submission.createdAt)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Property Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DataField label="Property Name" value={submission.propertyName} />
            <DataField label="Address" value={`${submission.propertyAddress}, ${submission.city}, ${submission.state} ${submission.zip}`} />
            <DataField label="Property Type" value={submission.propertyType} />
            <DataField label="Occupancy Type" value={submission.occupancyType} />
            <DataField label="Units / Sq Ft" value={submission.unitsOrSqft} />
            <DataField label="Year Built" value={submission.yearBuilt} />
            <DataField label="As-Is Value" value={formatCurrency(submission.asIsValue)} />
            <DataField label="Purchase Price" value={formatCurrency(submission.purchasePrice)} />
            <DataField label="ARV / Stabilized Value" value={formatCurrency(submission.arvOrStabilizedValue)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Briefcase className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Deal Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DataField label="Loan Type" value={submission.loanType} />
            <DataField label="Requested Amount" value={formatCurrency(submission.requestedLoanAmount)} />
            <DataField label="Requested LTV" value={submission.requestedLTV ? `${submission.requestedLTV}%` : null} />
            <DataField label="Requested LTC" value={submission.requestedLTC ? `${submission.requestedLTC}%` : null} />
            <DataField label="Interest Only" value={submission.interestOnly} />
            <DataField label="Desired Close Date" value={formatDate(submission.desiredCloseDate)} />
            <DataField label="Exit Strategy" value={submission.exitStrategyType} />
            {submission.exitStrategyDetails && (
              <div className="sm:col-span-2">
                <DataField label="Exit Strategy Details" value={submission.exitStrategyDetails} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Calculator className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Financial Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DataField label="Current NOI" value={formatCurrency(submission.currentNOI)} />
            <DataField label="In-Place Rent" value={formatCurrency(submission.inPlaceRent)} />
            <DataField label="Pro Forma NOI" value={formatCurrency(submission.proFormaNOI)} />
            <DataField label="CapEx Budget" value={formatCurrency(submission.capexBudgetTotal)} />
          </div>
          {submission.businessPlanSummary && (
            <div className="mt-4">
              <DataField label="Business Plan Summary" value={submission.businessPlanSummary} />
            </div>
          )}
        </CardContent>
      </Card>

      {hasConstruction && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <HardHat className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Construction Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <CardHeader className="flex flex-row items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Sponsor & Entity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DataField label="Primary Sponsor" value={submission.primarySponsorName} />
            <DataField label="Experience (years)" value={submission.primarySponsorExperienceYears} />
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

      {hasExistingDebt && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Existing Debt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <DataField label="Current Lender" value={submission.currentLender} />
              <DataField label="Current Balance" value={formatCurrency(submission.currentLoanBalance)} />
              <DataField label="Interest Rate" value={submission.currentInterestRate ? `${submission.currentInterestRate}%` : null} />
              <DataField label="Maturity Date" value={formatDate(submission.loanMaturityDate)} />
              <DataField label="Prepayment Penalty" value={submission.prepaymentPenalty ? `${submission.prepaymentPenalty}%` : null} />
            </div>
          </CardContent>
        </Card>
      )}

      {submission.documents && submission.documents.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Uploaded Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {submission.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-md"
                  data-testid={`document-item-${doc.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{doc.originalFileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.docType} &middot; {formatFileSize(doc.fileSize)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(doc.uploadedAt)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {submission.additionalNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{submission.additionalNotes}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center pb-6">
        <Button
          variant="outline"
          onClick={() => navigate("/commercial/dashboard")}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <Button
          onClick={() => navigate("/commercial/pre-screen")}
          data-testid="button-new-submission"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Submission
        </Button>
      </div>
    </div>
  );
}

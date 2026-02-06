import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  documents: SubmissionDocument[];
}

const STATUS_OPTIONS = ["NEW", "IN_REVIEW", "NEEDS_INFO", "DECLINED", "APPROVED"];

function getStatusBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    IN_REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    NEEDS_INFO: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    DECLINED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
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
  return new Date(dateStr).toLocaleDateString("en-US", {
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

export default function AdminCommercialSubmissionDetail() {
  const [, params] = useRoute("/admin/commercial-submissions/:id");
  const id = params?.id;
  const { toast } = useToast();
  const [newStatus, setNewStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  const { data: submission, isLoading } = useQuery<CommercialSubmissionDetail>({
    queryKey: ["/api/admin/commercial-submissions", id],
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
      setNewStatus("");
      setAdminNotes("");
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const handleStatusUpdate = () => {
    if (!newStatus) return;
    updateStatusMutation.mutate({ status: newStatus, adminNotes: adminNotes || undefined });
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

  const ltvLtcDisplay = [
    submission.requestedLTV != null ? `LTV: ${submission.requestedLTV}%` : null,
    submission.requestedLTC != null ? `LTC: ${submission.requestedLTC}%` : null,
  ].filter(Boolean).join(" / ") || "N/A";

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
          <h1 className="text-2xl font-bold" data-testid="text-property-name">
            {submission.propertyName || "Commercial Submission"}
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge
              className={getStatusBadgeClass(submission.status)}
              data-testid="badge-status"
            >
              {submission.status?.replace("_", " ")}
            </Badge>
            <span className="text-sm text-muted-foreground" data-testid="text-submission-id">
              Submission #{submission.id}
            </span>
            <span className="text-sm text-muted-foreground" data-testid="text-submission-date">
              Submitted {formatDate(submission.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Update Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm text-muted-foreground mb-1.5">New Status</p>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="select-new-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleStatusUpdate}
              disabled={!newStatus || updateStatusMutation.isPending}
              data-testid="button-update-status"
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Status
            </Button>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1.5">Admin Notes</p>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add notes about this status change..."
              rows={3}
              data-testid="textarea-admin-notes"
            />
          </div>
          {submission.adminNotes && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Current Notes</p>
              <p className="text-sm">{submission.adminNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

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
              Deal Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <DataField label="Loan Type" value={submission.loanType} />
              <DataField label="Loan Amount" value={formatCurrency(submission.requestedLoanAmount)} />
              <DataField label="LTV / LTC" value={ltvLtcDisplay} />
              <DataField label="Interest Only" value={submission.interestOnly} />
              <DataField label="Desired Close Date" value={formatDate(submission.desiredCloseDate)} />
              {submission.loanType === "BRIDGE" && (
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Sponsor Experience
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <DataField label="Primary Sponsor" value={submission.primarySponsorName} />
              <DataField label="Years of Experience" value={submission.primarySponsorExperienceYears} />
              <DataField label="Similar Projects" value={submission.numberOfSimilarProjects} />
              <DataField label="Net Worth" value={formatCurrency(submission.netWorth)} />
              <DataField label="Liquidity" value={formatCurrency(submission.liquidity)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {submission.documents && submission.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents ({submission.documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {submission.documents.map((doc) => (
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
                        {doc.docType} {doc.fileSize ? `- ${(doc.fileSize / 1024).toFixed(0)} KB` : ""} {doc.uploadedAt ? `- ${formatDate(doc.uploadedAt)}` : ""}
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
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}

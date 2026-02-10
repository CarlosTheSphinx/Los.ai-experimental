import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowLeft, FileText, Building2, DollarSign, Calendar } from "lucide-react";

interface Document {
  id: number;
  docType: string;
  originalFileName: string;
  uploadedAt: string;
}

interface Submission {
  id: number;
  propertyName: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  loanType: string;
  requestedLoanAmount: number;
  status: string;
  createdAt: string;
  documents: Document[];
}

const statusColorMap: Record<string, string> = {
  NEW: "bg-blue-500",
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function CommercialSubmissionConfirmation() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/commercial-submission/:id/confirmation");
  const submissionId = params?.id;

  const { data: submission, isLoading, error } = useQuery<Submission>({
    queryKey: ["/api/commercial-submissions", submissionId],
    enabled: !!submissionId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground" data-testid="text-loading">Loading submission details...</p>
        </div>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-destructive" data-testid="text-error">Failed to load submission details. Please try again.</p>
          <Button onClick={() => navigate("/")} className="mt-4" data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const statusColor = statusColorMap[submission.status] || "bg-gray-500";

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16 text-green-500" data-testid="icon-success-check" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-submission-received">
            Submission Received
          </h1>
          <p className="text-muted-foreground" data-testid="text-confirmation-message">
            Your commercial deal submission has been received and is being reviewed.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1" data-testid="text-submission-id-label">Submission ID</p>
                <p className="text-2xl font-bold text-foreground font-mono" data-testid="text-submission-id">
                  {submission.id}
                </p>
              </div>
              <Badge className={`${statusColor} text-white`} data-testid={`badge-status-${submission.status}`}>
                {submission.status}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-submission-summary">
              <Building2 className="w-5 h-5" />
              Submission Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1" data-testid="text-property-name-label">Property Name</p>
                <p className="font-medium text-foreground" data-testid="text-property-name">
                  {submission.propertyName}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1" data-testid="text-loan-type-label">Loan Type</p>
                <p className="font-medium text-foreground" data-testid="text-loan-type">
                  {submission.loanType === "BRIDGE" ? "Bridge Loan" : "Long-Term Loan"}
                </p>
              </div>

              <div className="md:col-span-2">
                <p className="text-sm text-muted-foreground mb-1" data-testid="text-property-address-label">Property Address</p>
                <p className="font-medium text-foreground" data-testid="text-property-address">
                  {submission.propertyAddress}, {submission.city}, {submission.state} {submission.zip}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1" data-testid="text-loan-amount-label">Requested Loan Amount</p>
                <p className="font-medium text-foreground flex items-center gap-2" data-testid="text-loan-amount">
                  <DollarSign className="w-4 h-4" />
                  {formatCurrency(submission.requestedLoanAmount)}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1" data-testid="text-submitted-date-label">Submitted Date</p>
                <p className="font-medium text-foreground flex items-center gap-2" data-testid="text-submitted-date">
                  <Calendar className="w-4 h-4" />
                  {formatDate(submission.createdAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {submission.documents && submission.documents.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2" data-testid="text-uploaded-documents">
                <FileText className="w-5 h-5" />
                Uploaded Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {submission.documents.map((doc, index) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-md"
                    data-testid={`document-item-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground text-sm" data-testid={`document-name-${index}`}>
                          {doc.originalFileName}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`document-type-${index}`}>
                          {doc.docType}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid={`document-date-${index}`}>
                      {formatDate(doc.uploadedAt)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate("/commercial/dashboard")}
            data-testid="button-back-to-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <Button
            onClick={() => navigate("/commercial-submission/new")}
            data-testid="button-submit-another"
          >
            Submit Another
          </Button>
        </div>
      </div>
    </div>
  );
}

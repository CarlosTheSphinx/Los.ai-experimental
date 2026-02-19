import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  Building2,
  User,
  Calendar,
  FileText,
  Loader2,
  Phone,
  Mail,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
    uploadedAt: string | null;
    reviewedAt: string | null;
    files: Array<{
      id: number;
      fileName: string | null;
      fileSize: number | null;
      uploadedAt: string;
    }>;
  }>;
}

export default function BrokerPortal() {
  const [, params] = useRoute("/broker-portal/:token");
  const token = params?.token;
  const { toast } = useToast();

  const { data, isLoading, isError, error } = useQuery<BrokerPortalData>({
    queryKey: ["broker-portal", token],
    queryFn: async () => {
      if (!token) throw new Error("Token is required");
      const response = await fetch(`/api/broker-portal/${token}`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "on_hold":
        return "bg-orange-100 text-orange-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getDocumentStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "approved":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "rejected":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "$0";
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">The link you're trying to access is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
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
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Deal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {error instanceof Error
                ? error.message
                : "Failed to load the deal. The link may be invalid or the deal may no longer be available."}
            </p>
            <Button
              onClick={() => window.location.href = "/"}
              className="w-full"
            >
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { deal, stages, documents } = data;
  const approvedDocs = documents.filter((d) => d.status === "approved").length;
  const totalRequiredDocs = documents.filter((d) => d.isRequired).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{deal.dealName}</h1>
          <p className="text-gray-600">Deal Overview & Document Status</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

        {/* Deal Details */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Deal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-sm text-gray-700 mb-3">Property Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-3">
                    <Building2 className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600">Address</p>
                      <p className="text-gray-900 font-medium">{deal.propertyAddress}</p>
                    </div>
                  </div>
                  {deal.loanType && (
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-gray-600">Loan Type</p>
                        <p className="text-gray-900 font-medium">{deal.loanType}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-700 mb-3">Borrower Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-3">
                    <User className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-gray-600">Name</p>
                      <p className="text-gray-900 font-medium">{deal.borrowerName}</p>
                    </div>
                  </div>
                  {deal.borrowerEmail && (
                    <div className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-gray-600">Email</p>
                        <p className="text-gray-900 font-medium">{deal.borrowerEmail}</p>
                      </div>
                    </div>
                  )}
                  {deal.borrowerPhone && (
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-gray-600">Phone</p>
                        <p className="text-gray-900 font-medium">{deal.borrowerPhone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-700 mb-3">Loan Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(deal.loanAmount)}</span>
                  </div>
                  {deal.interestRate !== null && deal.interestRate !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Interest Rate</span>
                      <span className="text-gray-900 font-medium">{deal.interestRate}%</span>
                    </div>
                  )}
                  {deal.loanTermMonths && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Term</span>
                      <span className="text-gray-900 font-medium">{deal.loanTermMonths} months</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-700 mb-3">Timeline</h3>
                <div className="space-y-2 text-sm">
                  {deal.applicationDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Application Date</span>
                      <span className="text-gray-900 font-medium">
                        {format(new Date(deal.applicationDate), "MMM dd, yyyy")}
                      </span>
                    </div>
                  )}
                  {deal.targetCloseDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Target Close</span>
                      <span className="text-gray-900 font-medium">
                        {format(new Date(deal.targetCloseDate), "MMM dd, yyyy")}
                      </span>
                    </div>
                  )}
                  {deal.currentStage && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Current Stage</span>
                      <Badge variant="outline">{deal.currentStage}</Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document Checklist */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Document Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents required for this deal.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {getDocumentStatusIcon(doc.status)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm text-gray-900">{doc.documentName}</h4>
                          {doc.isRequired && (
                            <Badge variant="outline" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        {doc.documentDescription && (
                          <p className="text-xs text-muted-foreground mt-1">{doc.documentDescription}</p>
                        )}
                        {doc.files.length > 0 && (
                          <div className="mt-2 text-xs text-gray-600">
                            <p className="font-medium">{doc.files.length} file(s) uploaded</p>
                            {doc.uploadedAt && (
                              <p className="text-gray-500">
                                Uploaded: {format(new Date(doc.uploadedAt), "MMM dd, yyyy")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          doc.status === "approved"
                            ? "default"
                            : doc.status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                        className="text-xs"
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stages */}
        {stages.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">Deal Stages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stages.map((stage, index) => (
                  <div key={stage.id} className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm text-gray-900">{stage.stageName}</h4>
                      {stage.status && (
                        <p className="text-xs text-muted-foreground capitalize">{stage.status}</p>
                      )}
                    </div>
                    <Badge
                      variant={
                        stage.status === "completed"
                          ? "default"
                          : stage.status === "in_progress"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-xs"
                    >
                      {stage.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Don't have an account yet? Create one to manage all your deals in one place.
              </p>
              <Button
                onClick={() => (window.location.href = "/register")}
                className="w-full sm:w-auto"
              >
                Create an Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

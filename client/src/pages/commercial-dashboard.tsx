import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Plus, Filter } from "lucide-react";

interface CommercialSubmission {
  id: number;
  propertyName: string;
  propertyType: string;
  requestedLoanAmount: number;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  aiDecision: string | null;
}

const STATUS_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "NEW", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
];

function getStatusBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    NEW: "bg-info/10 text-info",
    SUBMITTED: "bg-info/10 text-info",
    UNDER_REVIEW: "bg-warning/10 text-warning",
    APPROVED: "bg-success/10 text-success",
    DECLINED: "bg-destructive/10 text-destructive",
    EXPIRED: "bg-muted text-muted-foreground",
  };
  return colors[status] || "bg-muted text-muted-foreground";
}

function getAiDecisionBadgeClass(decision: string | null): string {
  if (!decision) return "";
  const colors: Record<string, string> = {
    auto_approved: "bg-success/10 text-success",
    needs_review: "bg-warning/10 text-warning",
    auto_declined: "bg-destructive/10 text-destructive",
  };
  return colors[decision] || "bg-muted text-muted-foreground";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CommercialDashboard() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState("All");

  const { data, isLoading } = useQuery<CommercialSubmission[]>({
    queryKey: ["/api/commercial-submissions"],
  });

  const submissions = (data || []).filter((s) => {
    if (statusFilter === "All") return true;
    return s.status === statusFilter;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            My Commercial Deals
          </h1>
          <p className="text-muted-foreground">
            Track and manage your commercial deal submissions
          </p>
        </div>
        <Button
          onClick={() => setLocation("/commercial/pre-screen")}
          data-testid="button-new-submission"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Submission
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-4" data-testid="loading-state">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No commercial deals yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by submitting a new deal.
              </p>
              <Button
                onClick={() => setLocation("/commercial/pre-screen")}
                data-testid="button-empty-new-submission"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Submission
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg" data-testid="text-results-count">
              {submissions.length} Deal{submissions.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal Name</TableHead>
                  <TableHead>Property Type</TableHead>
                  <TableHead>Loan Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>AI Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => (
                  <TableRow
                    key={submission.id}
                    className="cursor-pointer"
                    onClick={() => setLocation(`/commercial-submission/${submission.id}`)}
                    data-testid={`row-submission-${submission.id}`}
                  >
                    <TableCell className="font-medium" data-testid={`text-property-${submission.id}`}>
                      {submission.propertyName || "Untitled Deal"}
                    </TableCell>
                    <TableCell data-testid={`text-type-${submission.id}`}>
                      {submission.propertyType || "—"}
                    </TableCell>
                    <TableCell data-testid={`text-amount-${submission.id}`}>
                      {submission.requestedLoanAmount
                        ? formatCurrency(submission.requestedLoanAmount)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={getStatusBadgeClass(submission.status)}
                        data-testid={`badge-status-${submission.id}`}
                      >
                        {submission.status?.replace(/_/g, " ") || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-date-${submission.id}`}>
                      {formatDate(submission.submittedAt || submission.createdAt)}
                    </TableCell>
                    <TableCell>
                      {submission.aiDecision ? (
                        <Badge
                          className={getAiDecisionBadgeClass(submission.aiDecision)}
                          data-testid={`badge-ai-${submission.id}`}
                        >
                          {submission.aiDecision.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

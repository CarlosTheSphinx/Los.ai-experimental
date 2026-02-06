import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Building2, Filter, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CommercialSubmission {
  id: number;
  propertyName: string;
  companyName: string;
  email: string;
  brokerOrDeveloperName: string;
  loanType: string;
  requestedLoanAmount: number;
  status: string;
  createdAt: string;
}

const STATUS_OPTIONS = ["All", "NEW", "IN_REVIEW", "NEEDS_INFO", "DECLINED", "APPROVED"];

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminCommercialSubmissions() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useQuery<CommercialSubmission[]>({
    queryKey: ["/api/admin/commercial-submissions", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "All") {
        params.append("status", statusFilter);
      }
      const res = await fetch(`/api/admin/commercial-submissions?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch commercial submissions");
      return res.json();
    },
  });

  const submissions = (data || []).filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.propertyName?.toLowerCase().includes(term) ||
      s.companyName?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.brokerOrDeveloperName?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Commercial Submissions
        </h1>
        <p className="text-muted-foreground">
          Review and manage commercial deal submissions
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === "All" ? "All Statuses" : status.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by property, company, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3" data-testid="loading-state">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No submissions found</h3>
              <p className="text-muted-foreground">
                {statusFilter !== "All"
                  ? `No commercial submissions with status "${statusFilter.replace("_", " ")}".`
                  : "No commercial submissions have been received yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg" data-testid="text-results-count">
              {submissions.length} Submission{submissions.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">ID</th>
                    <th className="pb-3 pr-4 font-medium">Property Name</th>
                    <th className="pb-3 pr-4 font-medium">Company</th>
                    <th className="pb-3 pr-4 font-medium">Loan Type</th>
                    <th className="pb-3 pr-4 font-medium">Amount</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((submission) => (
                    <tr
                      key={submission.id}
                      className="border-b last:border-0"
                      data-testid={`row-submission-${submission.id}`}
                    >
                      <td className="py-3 pr-4 text-muted-foreground" data-testid={`text-id-${submission.id}`}>
                        #{submission.id}
                      </td>
                      <td className="py-3 pr-4 font-medium" data-testid={`text-property-${submission.id}`}>
                        {submission.propertyName || "N/A"}
                      </td>
                      <td className="py-3 pr-4" data-testid={`text-company-${submission.id}`}>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          {submission.companyName || "N/A"}
                        </div>
                      </td>
                      <td className="py-3 pr-4" data-testid={`text-loantype-${submission.id}`}>
                        {submission.loanType || "N/A"}
                      </td>
                      <td className="py-3 pr-4" data-testid={`text-amount-${submission.id}`}>
                        {submission.requestedLoanAmount ? formatCurrency(submission.requestedLoanAmount) : "N/A"}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          className={getStatusBadgeClass(submission.status)}
                          data-testid={`badge-status-${submission.id}`}
                        >
                          {submission.status?.replace("_", " ") || "N/A"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground" data-testid={`text-date-${submission.id}`}>
                        {submission.createdAt ? formatDate(submission.createdAt) : "N/A"}
                      </td>
                      <td className="py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/admin/commercial-submissions/${submission.id}`)}
                          data-testid={`button-view-${submission.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

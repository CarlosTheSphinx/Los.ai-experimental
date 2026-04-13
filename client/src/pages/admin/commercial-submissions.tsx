import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Building2,
  Eye,
  Check,
  X,
  MessageSquare,
  RefreshCw,
  Loader2,
  ArrowUpDown,
  CheckSquare,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CommercialSubmission {
  id: number;
  propertyName: string;
  companyName: string;
  email: string;
  brokerOrDeveloperName: string;
  loanType: string;
  propertyType: string;
  requestedLoanAmount: number;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  aiDecision: string | null;
  aiDecisionReason: string | null;
  reviewedAt: string | null;
}

const STATUS_TABS = ["All", "NEW", "UNDER_REVIEW", "APPROVED", "DECLINED", "NEEDS_INFO"];

type SortField = "createdAt" | "requestedLoanAmount";
type SortDir = "asc" | "desc";

function getStatusBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    NEW: "bg-info/10 text-info",
    UNDER_REVIEW: "bg-warning/10 text-warning",
    IN_REVIEW: "bg-warning/10 text-warning",
    NEEDS_INFO: "bg-warning/10 text-warning",
    DECLINED: "bg-destructive/10 text-destructive",
    APPROVED: "bg-success/10 text-success",
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

export default function AdminCommercialSubmissions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [dialogType, setDialogType] = useState<"approve" | "decline" | "info" | null>(null);
  const [dialogSubmissionId, setDialogSubmissionId] = useState<number | null>(null);
  const [dialogReason, setDialogReason] = useState("");

  const { data, isLoading } = useQuery<CommercialSubmission[]>({
    queryKey: ["/api/admin/commercial-submissions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/commercial-submissions", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch commercial submissions");
      return res.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: number; status: string; adminNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/commercial-submissions/${id}/status`, { status, adminNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-submissions"] });
      toast({ title: "Status updated successfully" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const rerunAiMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/commercial/submissions/${id}/ai-review`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-submissions"] });
      toast({ title: "AI review triggered successfully" });
    },
    onError: () => {
      toast({ title: "Failed to trigger AI review", variant: "destructive" });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(
        ids.map((id) =>
          apiRequest("PATCH", `/api/admin/commercial-submissions/${id}/status`, { status })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-submissions"] });
      toast({ title: "Bulk update completed" });
      setSelectedIds(new Set());
    },
    onError: () => {
      toast({ title: "Bulk update failed", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogType(null);
    setDialogSubmissionId(null);
    setDialogReason("");
  };

  const handleDialogConfirm = () => {
    if (!dialogSubmissionId || !dialogType) return;
    const statusMap: Record<string, string> = {
      approve: "APPROVED",
      decline: "DECLINED",
      info: "NEEDS_INFO",
    };
    updateStatusMutation.mutate({
      id: dialogSubmissionId,
      status: statusMap[dialogType],
      adminNotes: dialogReason || undefined,
    });
  };

  const openDialog = (type: "approve" | "decline" | "info", id: number) => {
    setDialogType(type);
    setDialogSubmissionId(id);
    setDialogReason("");
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSubmissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubmissions.map((s) => s.id)));
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const allSubmissions = data || [];
  const statusFiltered = statusFilter === "All"
    ? allSubmissions
    : allSubmissions.filter((s) => s.status === statusFilter);

  const searchFiltered = statusFiltered.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.propertyName?.toLowerCase().includes(term) ||
      s.brokerOrDeveloperName?.toLowerCase().includes(term) ||
      s.companyName?.toLowerCase().includes(term)
    );
  });

  const filteredSubmissions = [...searchFiltered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "createdAt") {
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else if (sortField === "requestedLoanAmount") {
      cmp = (a.requestedLoanAmount || 0) - (b.requestedLoanAmount || 0);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const dialogTitles: Record<string, string> = {
    approve: "Approve Submission",
    decline: "Decline Submission",
    info: "Request More Information",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Commercial Deal Review
        </h1>
        <p className="text-muted-foreground">
          Review, approve, or decline commercial deal submissions
        </p>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList data-testid="tabs-status-filter">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} data-testid={`tab-${tab.toLowerCase()}`}>
              {tab === "All" ? "All" : tab.replace(/_/g, " ")}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by property or broker name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select
              value={sortField}
              onValueChange={(v) => {
                setSortField(v as SortField);
                setSortDir("desc");
              }}
            >
              <SelectTrigger className="w-[180px]" data-testid="select-sort">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Submitted Date</SelectItem>
                <SelectItem value="requestedLoanAmount">Loan Amount</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleSort(sortField)}
              data-testid="button-sort-direction"
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium" data-testid="text-selected-count">
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: "APPROVED" })}
                disabled={bulkUpdateMutation.isPending}
                data-testid="button-bulk-approve"
              >
                {bulkUpdateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Approve All
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), status: "DECLINED" })}
                disabled={bulkUpdateMutation.isPending}
                data-testid="button-bulk-decline"
              >
                <X className="h-4 w-4 mr-1" />
                Decline All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-4" data-testid="loading-state">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : filteredSubmissions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-state">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No submissions found</h3>
              <p className="text-muted-foreground">
                {statusFilter !== "All"
                  ? `No submissions with status "${statusFilter.replace(/_/g, " ")}".`
                  : "No commercial submissions have been received yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg" data-testid="text-results-count">
              {filteredSubmissions.length} Submission{filteredSubmissions.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={selectedIds.size === filteredSubmissions.length && filteredSubmissions.length > 0}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Loan Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Decision</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.map((submission) => (
                  <TableRow key={submission.id} data-testid={`row-submission-${submission.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(submission.id)}
                        onCheckedChange={() => toggleSelect(submission.id)}
                        data-testid={`checkbox-select-${submission.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-id-${submission.id}`}>
                      #{submission.id}
                    </TableCell>
                    <TableCell data-testid={`text-broker-${submission.id}`}>
                      <div>
                        <div className="font-medium">{submission.brokerOrDeveloperName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{submission.companyName}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-property-${submission.id}`}>
                      {submission.propertyName || "N/A"}
                    </TableCell>
                    <TableCell data-testid={`text-type-${submission.id}`}>
                      {submission.propertyType || submission.loanType || "—"}
                    </TableCell>
                    <TableCell data-testid={`text-amount-${submission.id}`}>
                      {submission.requestedLoanAmount ? formatCurrency(submission.requestedLoanAmount) : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={getStatusBadgeClass(submission.status)}
                        data-testid={`badge-status-${submission.id}`}
                      >
                        {submission.status?.replace(/_/g, " ") || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {submission.aiDecision ? (
                        <Badge
                          className={getAiDecisionBadgeClass(submission.aiDecision)}
                          data-testid={`badge-ai-decision-${submission.id}`}
                        >
                          {submission.aiDecision.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-date-${submission.id}`}>
                      {formatDate(submission.submittedAt || submission.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/admin/commercial/submissions/${submission.id}`)}
                          data-testid={`button-view-${submission.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog("approve", submission.id)}
                          data-testid={`button-approve-${submission.id}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog("decline", submission.id)}
                          data-testid={`button-decline-${submission.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog("info", submission.id)}
                          data-testid={`button-request-info-${submission.id}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => rerunAiMutation.mutate(submission.id)}
                          disabled={rerunAiMutation.isPending}
                          data-testid={`button-rerun-ai-${submission.id}`}
                        >
                          {rerunAiMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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

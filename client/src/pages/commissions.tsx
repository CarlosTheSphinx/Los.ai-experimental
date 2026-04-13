import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  TrendingUp,
  Briefcase,
  ArrowRight,
  Loader2,
  MapPin,
} from "lucide-react";

interface CommissionRow {
  projectId: number;
  projectName: string;
  projectNumber: string | null;
  loanNumber?: string | null;
  status: string;
  currentStage: string | null;
  loanAmount: number | null;
  loanType: string | null;
  propertyAddress: string | null;
  borrowerName: string | null;
  createdAt: string;
  fundingDate: string | null;
  commission: number | null;
  pointsCharged: number | null;
  pointsAmount: number | null;
  tpoPremiumAmount: number | null;
  totalRevenue: number | null;
  interestRate: string | null;
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "funded":
    case "completed":
      return "default";
    case "active":
      return "secondary";
    case "on_hold":
      return "outline";
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "active": return "Active";
    case "funded": return "Funded";
    case "completed": return "Completed";
    case "on_hold": return "On Hold";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

export default function CommissionsPage() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<{ commissions: CommissionRow[] }>({
    queryKey: ["/api/commissions"],
  });

  const commissions = data?.commissions || [];

  const totalCommission = commissions.reduce((sum, c) => sum + (c.commission || 0), 0);
  const fundedDeals = commissions.filter((c) => c.status === "funded" || c.status === "completed");
  const totalFundedCommission = fundedDeals.reduce((sum, c) => sum + (c.commission || 0), 0);
  const totalLoanVolume = commissions.reduce((sum, c) => sum + (c.loanAmount || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-commissions">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">My Commissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Commission summary across your active loan deals
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card data-testid="card-total-commission">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-commission">{formatCurrency(totalCommission)}</div>
            <p className="text-xs text-muted-foreground mt-1">{commissions.length} deal{commissions.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-funded-commission">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Funded Commission</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-funded-commission">{formatCurrency(totalFundedCommission)}</div>
            <p className="text-xs text-muted-foreground mt-1">{fundedDeals.length} funded deal{fundedDeals.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-loan-volume">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Loan Volume</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-loan-volume">{formatCurrency(totalLoanVolume)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total across all deals</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-commissions-table">
        <CardHeader>
          <CardTitle className="text-lg">Commission Details</CardTitle>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-commissions">
              <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No commissions yet</p>
              <p className="text-sm mt-1">Commissions will appear here once your deals are funded.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-right">Loan Amount</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.projectId} data-testid={`row-commission-${c.projectId}`}>
                      <TableCell className="font-medium">
                        <div>{c.projectName}</div>
                        {(c.loanNumber || c.projectNumber) && (
                          <div className="text-xs text-muted-foreground">{c.loanNumber || c.projectNumber}</div>
                        )}
                      </TableCell>
                      <TableCell>{c.borrowerName || "—"}</TableCell>
                      <TableCell>
                        {c.propertyAddress ? (
                          <div className="flex items-center gap-1 max-w-[200px]">
                            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm">{c.propertyAddress}</span>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(c.loanAmount)}</TableCell>
                      <TableCell className="text-right">{c.interestRate ? `${c.interestRate}%` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div>{formatCurrency(c.pointsAmount)}</div>
                        {c.pointsCharged > 0 && (
                          <div className="text-xs text-muted-foreground">{c.pointsCharged} pts</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(c.commission)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(c.status)} data-testid={`badge-status-${c.projectId}`}>
                          {statusLabel(c.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => navigate(`/deals/${c.projectId}`)}
                          data-testid={`button-view-deal-${c.projectId}`}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

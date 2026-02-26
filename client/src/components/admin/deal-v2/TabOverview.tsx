import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Percent, TrendingUp, Calculator, Activity } from "lucide-react";

function formatCurrency(amount: number | undefined): string {
  if (!amount) return "—";
  return "$" + amount.toLocaleString();
}

function KpiCard({
  label,
  value,
  subtitle,
  tooltip,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tooltip?: string;
  icon: any;
  valueColor?: string;
}) {
  const labelEl = tooltip ? (
    <Tooltip>
      <TooltipTrigger className="flex items-center gap-1 border-b border-dashed border-muted-foreground/40 cursor-help text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} <span className="text-muted-foreground/60">?</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
  );

  return (
    <div className="bg-card border rounded-[10px] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {labelEl}
      </div>
      <div className={`text-2xl font-bold ${valueColor || ''}`}>{value}</div>
      {subtitle && (
        <p className="text-[12px] text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

export default function TabOverview({ deal }: { deal: any }) {
  const propertyValue = deal.propertyValue || deal.loanData?.propertyValue;
  const loanAmount = deal.loanAmount || deal.loanData?.loanAmount;
  const ltv = deal.ltv || deal.loanData?.ltv;
  const dscr = deal.dscr || deal.loanData?.dscr;
  const interestRate = deal.interestRate;
  const termMonths = deal.termMonths || deal.loanTermMonths || deal.loanData?.loanTerm;
  const purpose = deal.loanPurpose || deal.loanData?.loanPurpose || deal.loanType;
  const progress = deal.progressPercentage || deal.completionPercentage || 0;
  const totalDocs = deal.totalDocuments || 0;
  const completedDocs = deal.completedDocuments || 0;
  const totalTasks = deal.totalTasks || 0;
  const completedTasks = deal.completedTasks || 0;
  const totalItems = totalDocs + totalTasks;
  const completedItems = completedDocs + completedTasks;

  const ltvSubtitle = propertyValue ? `of ${formatCurrency(propertyValue)}` : undefined;
  const dscrValue = dscr ? `${dscr}` : "—";
  const dscrSubtitle = dscr
    ? (parseFloat(dscr) >= 1.2 ? `Above threshold (1.20)` : `Below threshold (1.20)`)
    : "Pending";
  const rateValue = interestRate ? `${interestRate}%` : "—";
  const termLabel = termMonths
    ? (typeof termMonths === 'string' && termMonths.includes('month')
        ? (parseInt(termMonths) >= 12 ? `${Math.round(parseInt(termMonths) / 12)}-year` : termMonths)
        : (Number(termMonths) >= 12 ? `${Math.round(Number(termMonths) / 12)}-year` : `${termMonths} months`))
    : "";
  const rateSubtitle = termLabel ? `${termLabel} fixed` : undefined;
  const purposeLabel = purpose
    ? purpose.charAt(0).toUpperCase() + purpose.slice(1).replace(/_/g, ' ')
    : undefined;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Loan Amount"
          value={formatCurrency(loanAmount)}
          subtitle={purposeLabel}
        />
        <KpiCard
          icon={Percent}
          label="LTV"
          value={ltv ? `${ltv}%` : "—"}
          subtitle={ltvSubtitle}
          tooltip="Loan-to-Value — the loan amount as a percentage of the property's appraised value."
        />
        <KpiCard
          icon={TrendingUp}
          label="DSCR"
          value={dscrValue}
          subtitle={dscrSubtitle}
          tooltip="Debt Service Coverage Ratio — net operating income divided by total debt service. Above 1.0 means the property generates enough income to cover the loan."
        />
        <KpiCard
          icon={Calculator}
          label="Interest Rate"
          value={rateValue}
          subtitle={rateSubtitle}
        />
        <KpiCard
          icon={Activity}
          label="Progress"
          value={`${progress}%`}
          subtitle={totalItems > 0 ? `${completedItems} of ${totalItems} items` : undefined}
          valueColor={progress >= 70 ? "text-green-600" : progress >= 40 ? "text-blue-600" : ""}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[14px]">Loan Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
            <div>
              <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wider">Program</span>
              <p className="font-medium mt-0.5">{deal.programName || deal.loanType || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wider">Term</span>
              <p className="font-medium mt-0.5">{termMonths || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wider">Purpose</span>
              <p className="font-medium mt-0.5">{purposeLabel || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px] uppercase font-semibold tracking-wider">Created</span>
              <p className="font-medium mt-0.5">
                {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

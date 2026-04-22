import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, AlertTriangle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_broker: "Waiting on broker",
  resolved: "Resolved",
  closed: "Closed",
};

interface Props {
  submitterId: number | null | undefined;
  submitterName?: string | null;
  currentTicketId: number;
}

export function BrokerContextSidebar({ submitterId, submitterName, currentTicketId }: Props) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/support/tickets", { submitterId, includeArchived: true, limit: 25 }],
    queryFn: async () => {
      if (!submitterId) return { tickets: [] };
      const params = new URLSearchParams();
      params.set("submitterId", String(submitterId));
      params.set("includeArchived", "true");
      params.set("limit", "25");
      const r = await fetch(`/api/support/tickets?${params}`, { credentials: "include" });
      if (!r.ok) return { tickets: [] };
      return r.json();
    },
    enabled: !!submitterId,
  });

  if (!submitterId) return null;
  const tickets = (data?.tickets || []).filter((t: any) => t.id !== currentTicketId);
  const total = (data?.tickets || []).length;
  const openCount = (data?.tickets || []).filter((t: any) => t.status === "open" || t.status === "in_progress" || t.status === "waiting_on_broker").length;
  const breachCount = (data?.tickets || []).filter((t: any) => {
    const due = t.responseDueAt ? new Date(t.responseDueAt) : null;
    return due && !t.lastAdminReplyAt && (t.status === "open" || t.status === "in_progress") && due.getTime() < Date.now();
  }).length;

  return (
    <Card data-testid="card-broker-context">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" /> Broker context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border p-2" data-testid="ctx-stat-total">
            <div className="text-base font-semibold text-foreground">{isLoading ? "—" : total}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">All tickets</div>
          </div>
          <div className="rounded border p-2" data-testid="ctx-stat-open">
            <div className="text-base font-semibold text-foreground">{isLoading ? "—" : openCount}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</div>
          </div>
          <div className={`rounded border p-2 ${breachCount > 0 ? "border-destructive/40 bg-destructive/5" : ""}`} data-testid="ctx-stat-breach">
            <div className={`text-base font-semibold ${breachCount > 0 ? "text-destructive" : "text-foreground"}`}>{isLoading ? "—" : breachCount}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Overdue</div>
          </div>
        </div>

        {tickets.length === 0 ? (
          <div className="text-muted-foreground text-center py-2" data-testid="ctx-empty">
            {submitterName || "This broker"} has no other tickets.
          </div>
        ) : (
          <div className="space-y-1.5" data-testid="ctx-other-tickets">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Other tickets</div>
            {tickets.slice(0, 8).map((t: any) => {
              const due = t.responseDueAt ? new Date(t.responseDueAt) : null;
              const breached = due && !t.lastAdminReplyAt && (t.status === "open" || t.status === "in_progress") && due.getTime() < Date.now();
              return (
                <Link
                  key={t.id}
                  href={`/admin/tickets/${t.id}`}
                  className="block rounded border px-2 py-1.5 hover:bg-muted/40 transition-colors"
                  data-testid={`ctx-ticket-${t.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate flex-1 font-medium text-foreground">{t.subject}</div>
                    {breached && <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">{t.type}</Badge>
                    <span className="text-muted-foreground">{STATUS_LABELS[t.status] || t.status}</span>
                    <span className="text-muted-foreground ml-auto">#{t.id}</span>
                  </div>
                </Link>
              );
            })}
            {tickets.length > 8 && (
              <div className="text-center text-muted-foreground pt-1">+ {tickets.length - 8} more</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

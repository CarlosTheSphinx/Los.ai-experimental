import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LifeBuoy, Loader2, ChevronLeft, ChevronRight, Settings, AlertTriangle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In progress", waiting_on_broker: "Waiting on broker", resolved: "Resolved", closed: "Closed",
};
const TYPE_LABELS: Record<string, string> = { help: "Help", bug: "Bug", feature: "Feature" };
const SEVERITIES = ["blocker", "major", "minor", "cosmetic"];

export default function AdminTicketsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [sortBy, setSortBy] = useState("activity");
  const [page, setPage] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const limit = 25;

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/support/tickets", { search, status, type, severity, sortBy, page, includeArchived }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      if (severity) params.set("severity", severity);
      params.set("sortBy", sortBy);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      if (includeArchived) params.set("includeArchived", "true");
      const r = await fetch(`/api/support/tickets?${params}`, { credentials: "include" });
      return r.json();
    },
  });

  const tickets = data?.tickets || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-7 w-7 text-primary" />
          <h1 className="font-display text-3xl">Support Tickets</h1>
        </div>
        <Link href="/admin/notification-settings">
          <Button variant="outline" data-testid="btn-notification-settings"><Settings className="h-4 w-4 mr-2" /> Notification Settings</Button>
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input placeholder="Search subject..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} data-testid="input-search" />
            <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger data-testid="select-status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type || "all"} onValueChange={(v) => { setType(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger data-testid="select-type"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={severity || "all"} onValueChange={(v) => { setSeverity(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger data-testid="select-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger data-testid="select-sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sla">SLA urgency</SelectItem>
                <SelectItem value="activity">Most recent activity</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={includeArchived ? "default" : "outline"} onClick={() => { setIncludeArchived(!includeArchived); setPage(0); }} data-testid="btn-toggle-archived">
              {includeArchived ? "Hide archived" : "Show archived"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="h-7 w-7 animate-spin mx-auto text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground" data-testid="empty-state">No tickets match these filters.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Broker</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t: any) => {
                  const due = t.responseDueAt ? new Date(t.responseDueAt) : null;
                  const breached = due && !t.lastAdminReplyAt && (t.status === "open" || t.status === "in_progress") && due.getTime() < Date.now();
                  const dueSoon = due && !t.lastAdminReplyAt && (t.status === "open" || t.status === "in_progress") && !breached && (due.getTime() - Date.now()) < 4 * 3600 * 1000;
                  return (
                    <tr key={t.id} className={`border-t hover:bg-muted/40 transition-colors ${breached ? "bg-destructive/5" : ""}`} data-testid={`ticket-row-${t.id}`}>
                      <td className="px-4 py-3"><Badge variant="outline">{TYPE_LABELS[t.type]}</Badge></td>
                      <td className="px-4 py-3 max-w-md">
                        <Link href={`/admin/tickets/${t.id}`} className="font-medium hover:underline" data-testid={`link-ticket-${t.id}`}>{t.subject}</Link>
                        <div className="text-xs text-muted-foreground">#{t.id}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{t.submitter?.fullName || t.submitter?.email || "—"}</td>
                      <td className="px-4 py-3"><Badge>{STATUS_LABELS[t.status]}</Badge></td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{t.severity || "—"}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {breached ? (
                          <Badge variant="destructive" className="gap-1" data-testid={`sla-breach-${t.id}`}>
                            <AlertTriangle className="h-3 w-3" /> Overdue
                          </Badge>
                        ) : dueSoon ? (
                          <Badge variant="outline" className="gap-1 border-yellow-600 text-yellow-700 dark:text-yellow-400" data-testid={`sla-soon-${t.id}`}>
                            Due soon
                          </Badge>
                        ) : t.lastAdminReplyAt ? (
                          <span className="text-muted-foreground">Replied</span>
                        ) : due ? (
                          <span className="text-muted-foreground">{due.toLocaleDateString()}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(t.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">Page {page + 1} of {totalPages} · {total} total</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="btn-prev-page"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="btn-next-page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

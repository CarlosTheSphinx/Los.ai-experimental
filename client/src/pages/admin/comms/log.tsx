import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Search, X, GitBranch } from "lucide-react";

interface BranchPathEntry {
  // Snapshot of the branch decisions that led to this send. Captured at
  // dispatch time so we can show "Branch: Engagement → No" even if the
  // automation tree was edited later.
  nodeId: number;
  nodeType: "branch_engagement" | "branch_loan_state";
  side: "yes" | "no";
  at: string;
}

interface SendLogEntry {
  log: {
    id: number;
    channel: string;
    templateId: number | null;
    templateVersion: number;
    recipientType: string;
    recipientId: number;
    recipientContactValue: string;
    resolvedBody: string;
    resolvedSubject: string | null;
    resolvedMergeTags: Record<string, string> | null;
    status: string;
    failureReason: string | null;
    sentAt: string;
    branchPath?: BranchPathEntry[] | null;
  };
  recipientName: string | null;
  recipientEmail: string | null;
}

function branchLabel(b: BranchPathEntry): string {
  const kind = b.nodeType === "branch_engagement" ? "Engagement" : "Loan State";
  return `${kind} → ${b.side === "yes" ? "Yes" : "No"}`;
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    sent: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    suppressed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    skipped: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };
  const labelMap: Record<string, string> = {
    sent: "Sent", failed: "Failed", suppressed: "Suppressed", skipped: "Skipped",
  };
  return <Badge className={colorMap[status] || ""}>{labelMap[status] || status}</Badge>;
}

function ChannelBadge({ channel }: { channel: string }) {
  const colorMap: Record<string, string> = {
    email: "bg-blue-100 text-blue-800",
    sms: "bg-green-100 text-green-800",
    in_app: "bg-purple-100 text-purple-800",
  };
  const labelMap: Record<string, string> = { email: "Email", sms: "SMS", in_app: "In-App" };
  return <Badge className={colorMap[channel] || ""}>{labelMap[channel] || channel}</Badge>;
}

function LogRow({ entry }: { entry: SendLogEntry }) {
  const [open, setOpen] = useState(false);
  const { log } = entry;
  const displayName = entry.recipientName || entry.recipientEmail || `User #${log.recipientId}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0 transition-colors"
          data-testid={`log-row-${log.id}`}
        >
          {open
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" data-testid={`log-recipient-${log.id}`}>{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{log.recipientContactValue}</p>
              {log.branchPath && log.branchPath.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1" data-testid={`log-branch-path-${log.id}`}>
                  {log.branchPath.map((b, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] py-0 h-4">
                      <GitBranch className="h-2.5 w-2.5 mr-1" />{branchLabel(b)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <ChannelBadge channel={log.channel} />
            <StatusBadge status={log.status} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(log.sentAt).toLocaleDateString()}{" "}
              {new Date(log.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-10 py-4 bg-muted/30 border-b space-y-3">
          {log.resolvedSubject && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</p>
              <p className="text-sm mt-1" data-testid={`log-subject-${log.id}`}>{log.resolvedSubject}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message Body</p>
            <pre
              className="text-xs mt-1 whitespace-pre-wrap font-mono bg-background rounded p-3 max-h-48 overflow-y-auto"
              data-testid={`log-body-${log.id}`}
            >
              {log.resolvedBody}
            </pre>
          </div>
          {log.resolvedMergeTags && Object.keys(log.resolvedMergeTags).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Merge Tag Snapshot</p>
              <div className="mt-1 space-y-1">
                {Object.entries(log.resolvedMergeTags).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="font-mono text-muted-foreground">{`{{${k}}}`}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{v || "(empty)"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {log.failureReason && (
            <div>
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Failure Reason</p>
              <p className="text-sm mt-1 text-red-600">{log.failureReason}</p>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Template v{log.templateVersion} · Recipient type: {log.recipientType}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function CommsSendLogPage() {
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  function resetFilters() {
    setChannelFilter("all");
    setStatusFilter("all");
    setRecipientSearch("");
    setDateFrom("");
    setDateTo("");
    setOffset(0);
  }

  const hasActiveFilters =
    channelFilter !== "all" || statusFilter !== "all" || recipientSearch || dateFrom || dateTo;

  const { data: logs = [], isLoading } = useQuery<SendLogEntry[]>({
    queryKey: ["/api/comms/send-log", channelFilter, statusFilter, recipientSearch, dateFrom, dateTo, offset],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (recipientSearch.trim()) params.set("recipientSearch", recipientSearch.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/comms/send-log?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Send Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Immutable audit log of every send attempt, with full resolved body and merge tag snapshot.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Channel</Label>
              <Select value={channelFilter} onValueChange={v => { setChannelFilter(v); setOffset(0); }}>
                <SelectTrigger className="w-36" data-testid="select-log-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="in_app">In-App</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setOffset(0); }}>
                <SelectTrigger className="w-36" data-testid="select-log-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="suppressed">Suppressed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-40">
              <Label className="text-xs">Recipient</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="Name or email..."
                  value={recipientSearch}
                  onChange={e => { setRecipientSearch(e.target.value); setOffset(0); }}
                  data-testid="input-log-recipient"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setOffset(0); }}
                data-testid="input-log-date-from"
                className="w-36"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setOffset(0); }}
                data-testid="input-log-date-to"
                className="w-36"
              />
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="self-end"
                data-testid="button-clear-log-filters"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading send log...</p>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No send log entries found matching the current filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {logs.map(entry => (
              <LogRow key={entry.log.id} entry={entry} />
            ))}
          </div>
        </Card>
      )}

      {logs.length >= limit && (
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => setOffset(offset + limit)}
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

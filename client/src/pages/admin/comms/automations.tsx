import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Mail, Clock, Play, Pause, ChevronLeft, History, Send, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type AutomationStatus = "draft" | "active" | "paused" | "archived";
type EventName = "loan_status_changed" | "document_uploaded" | "deal_submitted" | "task_completed";
type TriggerKind = "event" | "time_absolute" | "time_recurring" | "time_relative" | "manual";

interface AutomationListItem {
  id: number;
  name: string;
  status: AutomationStatus;
  triggerConfig: any;
  exitConditions: any;
  notifyBrokerOnSend: boolean;
  maxDurationDays: number | null;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  nextRunAt: string | null;
}

interface NodeRow {
  type: "send" | "wait";
  config: Record<string, any>;
}

interface AutomationDetail extends AutomationListItem {
  nodes: Array<{ id: number; orderIndex: number; type: "send" | "wait"; config: any }>;
}

interface AutomationRun {
  id: number;
  subjectType: string;
  subjectId: number;
  startedAt: string;
  status: string;
  exitReason: string | null;
}

interface Template { id: number; name: string; channel: "email" | "sms" | "in_app" }
interface Segment { id: number; name: string }

const STATUS_BADGE: Record<AutomationStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:    { label: "Draft",    variant: "outline" },
  active:   { label: "Active",   variant: "default" },
  paused:   { label: "Paused",   variant: "secondary" },
  archived: { label: "Archived", variant: "destructive" },
};

export default function CommsAutomationsPage() {
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  if (editingId !== null) {
    return <AutomationEditor id={editingId} onClose={() => setEditingId(null)} />;
  }
  return <AutomationsList onEdit={setEditingId} />;
}

function AutomationsList({ onEdit }: { onEdit: (id: number | "new") => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AutomationListItem[]>({ queryKey: ["/api/comms/automations"] });

  const pause = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/comms/automations/${id}/pause`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); toast({ title: "Paused" }); },
    onError: (e: any) => toast({ title: "Pause failed", description: e?.message, variant: "destructive" }),
  });
  const activate = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/comms/automations/${id}/activate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); toast({ title: "Activated" }); },
    onError: (e: any) => toast({ title: "Activate failed", description: e?.message, variant: "destructive" }),
  });
  const archive = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/comms/automations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); toast({ title: "Archived" }); },
  });

  return (
    <div className="space-y-4" data-testid="page-automations-list">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Automations</h2>
          <p className="text-sm text-muted-foreground">Linear sequences triggered by events, schedules, or manual actions.</p>
        </div>
        <Button onClick={() => onEdit("new")} data-testid="button-new-automation"><Plus className="w-4 h-4 mr-2" />New Automation</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No automations yet. Create your first one to start sending messages on triggers.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map(a => (
            <Card key={a.id} data-testid={`card-automation-${a.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button className="font-medium text-left hover:underline" onClick={() => onEdit(a.id)} data-testid={`link-automation-${a.id}`}>
                      {a.name}
                    </button>
                    <Badge variant={STATUS_BADGE[a.status].variant} data-testid={`badge-status-${a.id}`}>
                      {STATUS_BADGE[a.status].label}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.nodeCount} node{a.nodeCount === 1 ? "" : "s"} · trigger: {a.triggerConfig?.kind ?? "—"}
                    {a.nextRunAt && ` · next run ${formatDistanceToNow(new Date(a.nextRunAt), { addSuffix: true })}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.status === "active" ? (
                    <Button size="sm" variant="outline" onClick={() => pause.mutate(a.id)} data-testid={`button-pause-${a.id}`}>
                      <Pause className="w-4 h-4 mr-1" />Pause
                    </Button>
                  ) : a.status !== "archived" ? (
                    <Button size="sm" variant="outline" onClick={() => activate.mutate(a.id)} data-testid={`button-activate-${a.id}`}>
                      <Play className="w-4 h-4 mr-1" />Activate
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => onEdit(a.id)} data-testid={`button-edit-${a.id}`}>Edit</Button>
                  {a.status !== "archived" && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => archive.mutate(a.id)} data-testid={`button-archive-${a.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AutomationEditor({ id, onClose }: { id: number | "new"; onClose: () => void }) {
  const isNew = id === "new";
  const { toast } = useToast();

  const { data: existing } = useQuery<AutomationDetail>({
    queryKey: ["/api/comms/automations", id],
    enabled: !isNew,
  });
  const { data: templates = [] } = useQuery<Template[]>({ queryKey: ["/api/comms/templates"] });
  const { data: segments = [] } = useQuery<Segment[]>({ queryKey: ["/api/comms/segments"] });
  const { data: runs = [] } = useQuery<AutomationRun[]>({
    queryKey: ["/api/comms/automations", id, "runs"],
    enabled: !isNew,
  });

  const [name, setName] = useState("");
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("manual");
  const [eventName, setEventName] = useState<EventName>("loan_status_changed");
  const [eventToStage, setEventToStage] = useState("");
  const [runAt, setRunAt] = useState("");
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [offsetMinutes, setOffsetMinutes] = useState(60);
  const [segmentId, setSegmentId] = useState<number | undefined>();
  const [exitOnOptOut, setExitOnOptOut] = useState(true);
  const [exitOnStatuses, setExitOnStatuses] = useState("funded,cancelled");
  const [maxDurationDays, setMaxDurationDays] = useState<number | "">("");
  const [notifyBrokerOnSend, setNotifyBrokerOnSend] = useState(false);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server once
  useEffect(() => {
    if (isNew || !existing || hydrated) return;
    setName(existing.name);
    const t = existing.triggerConfig;
    if (t?.kind) {
      setTriggerKind(t.kind);
      if (t.kind === "event") { setEventName(t.eventName); setEventToStage(t.filters?.toStage ?? ""); }
      if (t.kind === "time_absolute") { setRunAt(t.runAt ?? ""); setSegmentId(t.segmentId); }
      if (t.kind === "time_recurring") { setEveryMinutes(t.everyMinutes ?? 60); setSegmentId(t.segmentId); }
      if (t.kind === "time_relative") { setEventName(t.anchorEvent); setOffsetMinutes(t.offsetMinutes ?? 60); setEventToStage(t.filters?.toStage ?? ""); }
    }
    const ex = existing.exitConditions;
    if (ex) {
      setExitOnOptOut(!!ex.exitOnOptOut);
      setExitOnStatuses((ex.loanStatusEquals ?? []).join(","));
    }
    setMaxDurationDays(existing.maxDurationDays ?? "");
    setNotifyBrokerOnSend(existing.notifyBrokerOnSend);
    setNodes(existing.nodes.map(n => ({ type: n.type, config: n.config ?? {} })));
    setHydrated(true);
  }, [existing, isNew, hydrated]);

  const buildTriggerConfig = () => {
    switch (triggerKind) {
      case "event": return { kind: "event", eventName, filters: eventToStage ? { toStage: eventToStage } : undefined };
      case "time_absolute": return { kind: "time_absolute", runAt: runAt ? new Date(runAt).toISOString() : new Date().toISOString(), segmentId };
      case "time_recurring": return { kind: "time_recurring", everyMinutes, segmentId };
      case "time_relative": return { kind: "time_relative", anchorEvent: eventName, offsetMinutes, filters: eventToStage ? { toStage: eventToStage } : undefined };
      case "manual": return { kind: "manual" };
    }
  };

  const buildPayload = () => ({
    name,
    triggerConfig: buildTriggerConfig(),
    exitConditions: {
      exitOnOptOut,
      loanStatusEquals: exitOnStatuses.split(",").map(s => s.trim()).filter(Boolean),
    },
    notifyBrokerOnSend,
    maxDurationDays: maxDurationDays === "" ? null : Number(maxDurationDays),
    nodes,
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/comms/automations", buildPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); toast({ title: "Automation created" }); onClose(); },
    onError: (e: any) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/comms/automations/${id}`, buildPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id] }); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });
  const activate = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/automations/${id}/activate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id] }); toast({ title: "Activated" }); },
    onError: (e: any) => toast({ title: "Activate failed", description: e?.message, variant: "destructive" }),
  });
  const pause = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/automations/${id}/pause`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id] }); toast({ title: "Paused" }); },
  });

  const [manualLoanId, setManualLoanId] = useState("");
  const startRun = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/automations/${id}/start-run`, {
      subjectType: "loan", subjectId: Number(manualLoanId),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id, "runs"] }); toast({ title: "Run started" }); setManualLoanId(""); },
    onError: (e: any) => toast({ title: "Start failed", description: e?.message, variant: "destructive" }),
  });

  const updateNode = (idx: number, patch: Partial<NodeRow>) =>
    setNodes(prev => prev.map((n, i) => i === idx ? { ...n, ...patch, config: { ...n.config, ...(patch.config ?? {}) } } : n));
  const removeNode = (idx: number) => setNodes(prev => prev.filter((_, i) => i !== idx));
  const moveNode = (idx: number, dir: -1 | 1) => setNodes(prev => {
    const next = [...prev];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });
  const addNode = (atIdx: number, type: "send" | "wait") => {
    const n: NodeRow = type === "send"
      ? { type: "send", config: { channel: "email", recipientType: "borrower" } }
      : { type: "wait", config: { durationMinutes: 60 } };
    setNodes(prev => [...prev.slice(0, atIdx), n, ...prev.slice(atIdx)]);
  };

  return (
    <div className="space-y-4" data-testid="page-automation-editor">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-back">
          <ChevronLeft className="w-4 h-4 mr-1" />Back
        </Button>
        <div className="flex items-center gap-2">
          {!isNew && existing?.status === "active" && (
            <Button variant="outline" size="sm" onClick={() => pause.mutate()} data-testid="button-pause-editor">
              <Pause className="w-4 h-4 mr-1" />Pause
            </Button>
          )}
          {!isNew && existing && existing.status !== "active" && existing.status !== "archived" && (
            <Button variant="outline" size="sm" onClick={() => activate.mutate()} data-testid="button-activate-editor">
              <Play className="w-4 h-4 mr-1" />Activate
            </Button>
          )}
          <Button onClick={() => isNew ? create.mutate() : save.mutate()} disabled={!name || nodes.length === 0} data-testid="button-save">
            {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Header</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="auto-name">Name</Label>
            <Input id="auto-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Welcome series" data-testid="input-name" />
          </div>
          {!isNew && existing && (
            <div className="text-xs text-muted-foreground">
              Status: <Badge variant={STATUS_BADGE[existing.status].variant}>{STATUS_BADGE[existing.status].label}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Trigger</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Trigger type</Label>
            <Select value={triggerKind} onValueChange={v => setTriggerKind(v as TriggerKind)}>
              <SelectTrigger data-testid="select-trigger-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Event (e.g. loan stage changes)</SelectItem>
                <SelectItem value="time_absolute">Time (one-shot at a specific time)</SelectItem>
                <SelectItem value="time_recurring">Time (recurring every N minutes)</SelectItem>
                <SelectItem value="time_relative">Time (delayed after an event)</SelectItem>
                <SelectItem value="manual">Manual (started via API or button)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(triggerKind === "event" || triggerKind === "time_relative") && (
            <>
              <div>
                <Label>Event</Label>
                <Select value={eventName} onValueChange={v => setEventName(v as EventName)}>
                  <SelectTrigger data-testid="select-event-name"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loan_status_changed">Loan stage changed</SelectItem>
                    <SelectItem value="document_uploaded">Document uploaded</SelectItem>
                    <SelectItem value="deal_submitted">Deal submitted</SelectItem>
                    <SelectItem value="task_completed">Task completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {eventName === "loan_status_changed" && (
                <div>
                  <Label>Only when stage equals (optional)</Label>
                  <Input value={eventToStage} onChange={e => setEventToStage(e.target.value)} placeholder="e.g. underwriting" data-testid="input-to-stage" />
                </div>
              )}
            </>
          )}
          {triggerKind === "time_relative" && (
            <div>
              <Label>Delay (minutes after event)</Label>
              <Input type="number" min={0} value={offsetMinutes} onChange={e => setOffsetMinutes(Number(e.target.value))} data-testid="input-offset" />
            </div>
          )}
          {triggerKind === "time_absolute" && (
            <div>
              <Label>Run at</Label>
              <Input type="datetime-local" value={runAt} onChange={e => setRunAt(e.target.value)} data-testid="input-run-at" />
            </div>
          )}
          {triggerKind === "time_recurring" && (
            <div>
              <Label>Every (minutes)</Label>
              <Input type="number" min={1} value={everyMinutes} onChange={e => setEveryMinutes(Number(e.target.value))} data-testid="input-every-minutes" />
            </div>
          )}
          {(triggerKind === "time_absolute" || triggerKind === "time_recurring") && (
            <div>
              <Label>Audience segment</Label>
              <Select value={segmentId?.toString() ?? ""} onValueChange={v => setSegmentId(v ? Number(v) : undefined)}>
                <SelectTrigger data-testid="select-segment"><SelectValue placeholder="Pick a segment" /></SelectTrigger>
                <SelectContent>
                  {segments.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Exit conditions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="exit-opt-out">Exit if recipient opts out</Label>
            <Switch id="exit-opt-out" checked={exitOnOptOut} onCheckedChange={setExitOnOptOut} data-testid="switch-exit-opt-out" />
          </div>
          <div>
            <Label>Exit if loan status/stage equals (comma-separated)</Label>
            <Input value={exitOnStatuses} onChange={e => setExitOnStatuses(e.target.value)} placeholder="funded,cancelled" data-testid="input-exit-statuses" />
          </div>
          <div>
            <Label>Max run duration (days)</Label>
            <Input type="number" min={1} value={maxDurationDays} onChange={e => setMaxDurationDays(e.target.value === "" ? "" : Number(e.target.value))} data-testid="input-max-duration" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="notify-broker">Notify broker on each send</Label>
            <Switch id="notify-broker" checked={notifyBrokerOnSend} onCheckedChange={setNotifyBrokerOnSend} data-testid="switch-notify-broker" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sequence</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {nodes.length === 0 && (
            <div className="flex justify-center gap-2 py-4">
              <Button variant="outline" size="sm" onClick={() => addNode(0, "send")} data-testid="button-add-first-send">
                <Mail className="w-4 h-4 mr-1" />Add Send
              </Button>
              <Button variant="outline" size="sm" onClick={() => addNode(0, "wait")} data-testid="button-add-first-wait">
                <Clock className="w-4 h-4 mr-1" />Add Wait
              </Button>
            </div>
          )}
          {nodes.map((n, idx) => (
            <div key={idx}>
              <NodeEditor
                node={n}
                templates={templates}
                onChange={p => updateNode(idx, p)}
                onRemove={() => removeNode(idx)}
                onMoveUp={idx > 0 ? () => moveNode(idx, -1) : undefined}
                onMoveDown={idx < nodes.length - 1 ? () => moveNode(idx, 1) : undefined}
                index={idx}
              />
              <div className="flex justify-center gap-2 my-2">
                <Button variant="ghost" size="sm" onClick={() => addNode(idx + 1, "send")} data-testid={`button-add-send-after-${idx}`}>
                  <Plus className="w-3 h-3 mr-1" />Send
                </Button>
                <Button variant="ghost" size="sm" onClick={() => addNode(idx + 1, "wait")} data-testid={`button-add-wait-after-${idx}`}>
                  <Plus className="w-3 h-3 mr-1" />Wait
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {!isNew && existing?.status === "active" && triggerKind === "manual" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Start a manual run</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Loan ID</Label>
              <Input
                type="number" value={manualLoanId} onChange={e => setManualLoanId(e.target.value)}
                placeholder="e.g. 42" data-testid="input-manual-loan-id"
              />
            </div>
            <Button
              onClick={() => startRun.mutate()}
              disabled={!manualLoanId || startRun.isPending}
              data-testid="button-start-run"
            >
              <Send className="w-4 h-4 mr-1" />Start run
            </Button>
          </CardContent>
        </Card>
      )}

      {!isNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" />Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <div className="space-y-1 text-sm">
                {runs.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-1 border-b last:border-0" data-testid={`row-run-${r.id}`}>
                    <span>#{r.id} · {r.subjectType} {r.subjectId}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.startedAt), { addSuffix: true })}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NodeEditor({ node, templates, onChange, onRemove, onMoveUp, onMoveDown, index }: {
  node: NodeRow;
  templates: Template[];
  onChange: (patch: Partial<NodeRow>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  index: number;
}) {
  return (
    <Card data-testid={`card-node-${index}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {node.type === "send" ? <Send className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            <span>Step {index + 1}: {node.type === "send" ? "Send message" : "Wait"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={!onMoveUp} onClick={onMoveUp} data-testid={`button-move-up-${index}`}>
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled={!onMoveDown} onClick={onMoveDown} data-testid={`button-move-down-${index}`}>
              <ChevronDown className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onRemove} data-testid={`button-remove-node-${index}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <Separator />
        {node.type === "send" ? (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={node.config.channel ?? "email"} onValueChange={v => onChange({ config: { channel: v } })}>
                <SelectTrigger data-testid={`select-channel-${index}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="in_app">In-app</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Template</Label>
              <Select value={node.config.templateId?.toString() ?? ""} onValueChange={v => onChange({ config: { templateId: Number(v) } })}>
                <SelectTrigger data-testid={`select-template-${index}`}><SelectValue placeholder="Pick…" /></SelectTrigger>
                <SelectContent>
                  {templates.filter(t => t.channel === (node.config.channel ?? "email")).map(t => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recipient</Label>
              <Select value={node.config.recipientType ?? "borrower"} onValueChange={v => onChange({ config: { recipientType: v } })}>
                <SelectTrigger data-testid={`select-recipient-${index}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrower">Borrower</SelectItem>
                  <SelectItem value="broker">Broker</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Wait duration (minutes)</Label>
            <Input
              type="number" min={1}
              value={node.config.durationMinutes ?? 60}
              onChange={e => onChange({ config: { durationMinutes: Number(e.target.value) } })}
              data-testid={`input-wait-minutes-${index}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

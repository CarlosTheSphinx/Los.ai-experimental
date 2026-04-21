import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, Mail, Clock, Play, Pause, ChevronLeft, History, Send,
  ChevronUp, ChevronDown, GitBranch, Activity, MessageSquare, Tag, Smartphone, Zap, Bell, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type AutomationStatus = "draft" | "active" | "paused" | "archived";
type Channel = "email" | "sms" | "in_app";
type EventName = "loan_status_changed" | "document_uploaded" | "deal_submitted" | "task_completed";
type TriggerKind = "event" | "time_absolute" | "time_recurring" | "time_relative" | "manual";
type SubjectType = "loan" | "broker" | "borrower";
type NodeType = "send" | "wait" | "branch_engagement" | "branch_loan_state";

type TriggerConfig =
  | { kind: "event"; eventName: EventName; filters?: { toStage?: string; fromStage?: string } }
  | { kind: "time_absolute"; runAt: string; segmentId?: number }
  | { kind: "time_recurring"; everyMinutes: number; segmentId?: number }
  | { kind: "time_relative"; anchorEvent: EventName; offsetMinutes: number; filters?: { toStage?: string } }
  | { kind: "manual" };

interface ExitConditions {
  exitOnOptOut?: boolean;
  loanStatusEquals?: string[];
}

// Phase 4 — node config is a free-form bag whose keys depend on node.type.
// Send/Wait keep their original keys; branch_* nodes layer in their own.
interface NodeConfig {
  // send
  templateId?: number;
  recipientType?: "borrower" | "broker";
  channel?: Channel;
  // inline compose — when set, templateId is not required
  inlineBody?: string;
  inlineSubject?: string;
  // wait
  durationMinutes?: number;
  // branch_engagement
  refTopLevelIndex?: number;
  // Phase 4 — full-tree ref path to a prior Send (e.g. [0, 'yes', 1]).
  // Preferred over refTopLevelIndex; the latter is retained only to load
  // legacy automations saved before this field existed.
  refPath?: (number | "yes" | "no")[];
  engagementType?: "delivered" | "opened" | "clicked" | "replied" | "viewed";
  windowMinutes?: number;
  // branch_loan_state
  field?: "currentStage" | "status" | "loanAmount" | "loanType";
  operator?: "eq" | "neq" | "in" | "notIn" | "gt" | "gte" | "lt" | "lte";
  value?: string | number | string[];
}

interface NodeRow {
  type: NodeType;
  config: NodeConfig;
  // Branch nodes carry two child sequences. Editor keeps them undefined for
  // send/wait so the JSON we send back to the server matches the schema.
  yes?: NodeRow[];
  no?: NodeRow[];
}

interface AutomationListItem {
  id: number;
  name: string;
  status: AutomationStatus;
  defaultChannel: Channel;
  triggerConfig: TriggerConfig | null;
  exitConditions: ExitConditions | null;
  notifyBrokerOnSend: boolean;
  maxDurationDays: number | null;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  nextRunAt: string | null;
  channels: Channel[];
}

interface CommsChannelItem {
  id: number;
  type: string;
  isActive: boolean;
  smsEnabled: boolean;
}

interface AutomationDetail extends AutomationListItem {
  // Tree shape coming back from the server (Phase 4).
  nodes: Array<NodeRow & { id: number }>;
}

interface BranchTrailEntry { nodeId: number; nodeType: NodeType; side: "yes" | "no"; at: string; label: string }

interface AutomationRun {
  id: number;
  subjectType: SubjectType;
  subjectId: number;
  startedAt: string;
  status: string;
  exitReason: string | null;
  parkedNode: { id: number; ordinal: number; type: NodeType; label: string } | null;
  branchTrail?: BranchTrailEntry[];
  lastSendLogId: number | null;
}

interface ApiError { message?: string }

interface Template { id: number; name: string; channel: "email" | "sms" | "in_app" }
interface Segment { id: number; name: string }

const STATUS_BADGE: Record<AutomationStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:    { label: "Draft",    variant: "outline" },
  active:   { label: "Active",   variant: "default" },
  paused:   { label: "Paused",   variant: "secondary" },
  archived: { label: "Archived", variant: "destructive" },
};

const NODE_LABEL: Record<NodeType, string> = {
  send: "Send message",
  wait: "Wait",
  branch_engagement: "Branch on Engagement",
  branch_loan_state: "Branch on Loan State",
};

const CHANNEL_ENGAGEMENT_OPTIONS: Record<Channel, { value: string; label: string }[]> = {
  email: [
    { value: "delivered", label: "Delivered" },
    { value: "opened", label: "Opened" },
    { value: "clicked", label: "Clicked" },
    { value: "replied", label: "Replied" },
  ],
  sms: [
    { value: "delivered", label: "Delivered" },
    { value: "replied", label: "Replied" },
  ],
  in_app: [
    { value: "viewed", label: "Viewed" },
  ],
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
  const { data: channelData } = useQuery<CommsChannelItem[]>({ queryKey: ["/api/comms/channels"] });

  const activeChannelTypes = new Set((channelData ?? []).filter(c => c.isActive).map(c => c.type));
  const smsEnabledTypes = new Set(
    (channelData ?? []).filter(c => c.isActive && c.smsEnabled).map(c => c.type)
  );

  const pause = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/comms/automations/${id}/pause`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); toast({ title: "Paused" }); },
    onError: (e: ApiError) => toast({ title: "Pause failed", description: e?.message, variant: "destructive" }),
  });
  const activate = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/comms/automations/${id}/activate`);
      return res.json() as Promise<{ ok: boolean; warnings: string[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] });
      toast({ title: "Activated" });
      for (const w of (data?.warnings ?? [])) {
        toast({ title: "Channel warning", description: w });
      }
    },
    onError: (e: ApiError) => toast({ title: "Activate failed", description: e?.message, variant: "destructive" }),
  });
  const archive = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/comms/automations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); toast({ title: "Archived" }); },
  });

  const channelIconClass = (ch: string) => {
    if (ch === "sms") return activeChannelTypes.has("sms") && smsEnabledTypes.has("sms") ? "" : "opacity-30";
    return activeChannelTypes.has(ch) ? "" : "opacity-30";
  };

  return (
    <div className="space-y-4" data-testid="page-automations-list">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Automations</h2>
          <p className="text-sm text-muted-foreground">Sequences with optional branches, triggered by events, schedules, or manual actions.</p>
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
                    {(a.channels ?? []).length > 0 && (
                      <span className="flex items-center gap-0.5" data-testid={`channel-icons-${a.id}`}>
                        {(a.channels ?? []).includes("email") && (
                          <Mail className={`w-3 h-3 text-muted-foreground ${channelIconClass("email")}`} />
                        )}
                        {(a.channels ?? []).includes("sms") && (
                          <Smartphone className={`w-3 h-3 text-muted-foreground ${channelIconClass("sms")}`} />
                        )}
                        {(a.channels ?? []).includes("in_app") && (
                          <Bell className={`w-3 h-3 text-muted-foreground ${channelIconClass("in_app")}`} />
                        )}
                      </span>
                    )}
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

// Phase 4 helpers — pure tree manipulation. Path is an array of either
// numeric indices (top-level) or { side: "yes"|"no", idx } steps inside a
// branch's children. Centralizing tree updates avoids reimplementing
// recursion at every callsite.
type PathStep = number | { side: "yes" | "no"; idx: number };

// Replace the children array at the parent identified by parentPath (empty = root).
function withChildren(
  nodes: NodeRow[],
  parentPath: PathStep[],
  side: "yes" | "no" | null,
  fn: (arr: NodeRow[]) => NodeRow[],
): NodeRow[] {
  if (parentPath.length === 0) {
    return fn(nodes);
  }
  // Parent path is a prefix; descend by replacing the node at the head.
  const [head, ...rest] = parentPath;
  const idx = typeof head === "number" ? head : head.idx;
  return nodes.map((n, i) => {
    if (i !== idx) return n;
    if (rest.length === 0 && typeof head !== "number") {
      // We are at parentPath end — descend into the matching side from `head`
      // Actually head already moved into the node; rest is empty so the
      // children array to mutate lives on this node under `side`.
    }
    if (rest.length === 0) {
      // We hit the parent node. The side here comes from the caller.
      const childArr = (side === "yes" ? n.yes : side === "no" ? n.no : null) ?? [];
      const next = fn(childArr);
      if (side === "yes") return { ...n, yes: next };
      if (side === "no") return { ...n, no: next };
      return n;
    }
    // Descend into the node's matching side from the next step.
    const nextStep = rest[0];
    if (typeof nextStep === "number") return n;
    const childSide = nextStep.side;
    const childArr = (childSide === "yes" ? n.yes : n.no) ?? [];
    const updatedKids = withChildren(childArr, rest, side, fn);
    if (childSide === "yes") return { ...n, yes: updatedKids };
    return { ...n, no: updatedKids };
  });
}

// Update a node identified by an absolute path (array of {side,idx} steps after
// the first numeric top-level idx).
function updateNodeAtPath(nodes: NodeRow[], path: PathStep[], patch: Partial<NodeRow>): NodeRow[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  const idx = typeof head === "number" ? head : head.idx;
  return nodes.map((n, i) => {
    if (i !== idx) return n;
    if (rest.length === 0) {
      return {
        ...n,
        ...patch,
        config: { ...n.config, ...(patch.config ?? {}) },
      };
    }
    const nextStep = rest[0];
    if (typeof nextStep === "number") return n;
    const childArr = (nextStep.side === "yes" ? n.yes : n.no) ?? [];
    const updated = updateNodeAtPath(childArr, rest, patch);
    if (nextStep.side === "yes") return { ...n, yes: updated };
    return { ...n, no: updated };
  });
}

// Walk the tree and yield top-level Send node descriptors so branch_engagement
// pickers can offer "earlier top-level Send" choices. We only care about
// top-level here because the worker resolves engagement refs by top-level
// position; branches inside branches reference back through the same map.
function listTopLevelSends(nodes: NodeRow[]): Array<{ idx: number; templateId?: number; label: string }> {
  return nodes
    .map((n, idx) => ({ n, idx }))
    .filter(({ n }) => n.type === "send")
    .map(({ n, idx }) => ({
      idx,
      templateId: n.config.templateId,
      label: `Step ${idx + 1}: Send${n.config.templateId ? ` (template #${n.config.templateId})` : ""}`,
    }));
}

// Phase 4 — full-tree enumeration of Send nodes with their path and a
// human-readable breadcrumb label. Lets a branch_engagement picker offer
// Sends that live inside nested branches (so long as they're in a visible
// subtree that isn't the branch's own).
type TreeStep = number | "yes" | "no";
type TreeSend = { path: TreeStep[]; label: string; templateId?: number; channel?: Channel };
// Shared DFS pre-order comparator used by the client validator AND the
// eligible-sends picker. Numeric steps compare numerically (so step 2 is
// before step 10). Side steps compare with explicit "yes" < "no" to match
// the DFS traversal order used everywhere else (yes child visited first).
// A longer path that shares a prefix is treated as LATER in pre-order.
function cmpTreePath(a: TreeStep[], b: TreeStep[]): number {
  const lim = Math.min(a.length, b.length);
  for (let k = 0; k < lim; k++) {
    const av = a[k]; const bv = b[k];
    if (av === bv) continue;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    if (typeof av === "string" && typeof bv === "string") {
      // "yes" visited before "no" in our tree walks.
      return av === "yes" ? -1 : 1;
    }
    // Mixed types shouldn't happen at the same depth in well-formed paths.
    return typeof av === "number" ? -1 : 1;
  }
  return a.length - b.length;
}
function pathIsPrefix(a: TreeStep[], b: TreeStep[]): boolean {
  return a.length <= b.length && a.every((v, i) => v === b[i]);
}
function listTreeSends(nodes: NodeRow[]): TreeSend[] {
  const out: TreeSend[] = [];
  const walk = (seq: NodeRow[], pfx: (number | "yes" | "no")[], lbl: string): void => {
    seq.forEach((n, i) => {
      const here = lbl ? `${lbl} → Step ${i + 1}` : `Step ${i + 1}`;
      const hp: (number | "yes" | "no")[] = [...pfx, i];
      if (n.type === "send") {
        out.push({
          path: hp,
          label: `${here}: Send${n.config.templateId ? ` (template #${n.config.templateId})` : ""}`,
          templateId: n.config.templateId,
          channel: n.config.channel,
        });
      } else if (n.type === "branch_engagement" || n.type === "branch_loan_state") {
        if (n.yes?.length) walk(n.yes, [...hp, "yes"], `${here} → Yes`);
        if (n.no?.length)  walk(n.no,  [...hp, "no" ], `${here} → No`);
      }
    });
  };
  walk(nodes, [], "");
  return out;
}

function newNode(type: NodeType, defaultChannel: Channel): NodeRow {
  switch (type) {
    case "send": return { type: "send", config: { channel: defaultChannel, recipientType: "borrower" } };
    case "wait": return { type: "wait", config: { durationMinutes: 60 } };
    case "branch_engagement":
      return {
        type: "branch_engagement",
        config: { engagementType: "opened", windowMinutes: 1440 },
        yes: [],
        no: [],
      };
    case "branch_loan_state":
      return {
        type: "branch_loan_state",
        config: { field: "currentStage", operator: "eq", value: "" },
        yes: [],
        no: [],
      };
  }
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
  const [defaultChannel, setDefaultChannel] = useState<Channel>("email");
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
  const [clientError, setClientError] = useState<string | null>(null);

  // Hydrate from server once
  useEffect(() => {
    if (isNew || !existing || hydrated) return;
    setName(existing.name);
    setDefaultChannel(existing.defaultChannel ?? "email");
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
    // Strip `id` from server tree (it's display-only). The recursive shape is
    // already what we'll send back, so no transformation is needed.
    const stripId = (n: NodeRow & { id?: number }): NodeRow => ({
      type: n.type,
      config: n.config ?? {},
      ...(n.yes ? { yes: n.yes.map(stripId) } : {}),
      ...(n.no ? { no: n.no.map(stripId) } : {}),
    });
    setNodes((existing.nodes ?? []).map(stripId));
    setHydrated(true);
  }, [existing, isNew, hydrated]);

  const buildTriggerConfig = (): TriggerConfig => {
    switch (triggerKind) {
      case "event": return { kind: "event", eventName, filters: eventToStage ? { toStage: eventToStage } : undefined };
      case "time_absolute": return { kind: "time_absolute", runAt: runAt ? new Date(runAt).toISOString() : new Date().toISOString(), segmentId };
      case "time_recurring": return { kind: "time_recurring", everyMinutes, segmentId };
      case "time_relative": return { kind: "time_relative", anchorEvent: eventName, offsetMinutes, filters: eventToStage ? { toStage: eventToStage } : undefined };
      case "manual": return { kind: "manual" };
    }
  };

  // Ensure every send node has a channel set (fill in defaultChannel if unset)
  const ensureChannel = (n: NodeRow): NodeRow => ({
    ...n,
    config: n.type === "send" ? { ...n.config, channel: n.config.channel ?? defaultChannel } : n.config,
    ...(n.yes ? { yes: n.yes.map(ensureChannel) } : {}),
    ...(n.no ? { no: n.no.map(ensureChannel) } : {}),
  });

  const buildPayload = () => ({
    name,
    defaultChannel,
    triggerConfig: buildTriggerConfig(),
    exitConditions: {
      exitOnOptOut,
      loanStatusEquals: exitOnStatuses.split(",").map(s => s.trim()).filter(Boolean),
    },
    notifyBrokerOnSend,
    maxDurationDays: maxDurationDays === "" ? null : Number(maxDurationDays),
    nodes: nodes.map(ensureChannel),
  });

  // Phase 4 — client-side mirror of the server validator. Catches the same
  // mistakes (missing children, dangling refs, bad windows) before we even
  // submit, so the user gets fast feedback. Server is still the source of
  // truth.
  const validateClient = (): string | null => {
    const topTypes = nodes.map(n => n.type);
    // Phase 4 — build the list of eligible Send paths for a branch node at
    // the given path. A Send is eligible iff it appears strictly before the
    // branch in DFS pre-order AND is not inside the branch's own subtree.
    const pathEq = (a: TreeStep[], b: TreeStep[]): boolean =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    const allSendPaths = listTreeSends(nodes).map(s => s.path);

    const walk = (seq: NodeRow[], path: string, depth: number, branchPath: TreeStep[]): string | null => {
      if (depth > 5) return `Sequence at ${path} is nested too deep (max 5 levels)`;
      for (let i = 0; i < seq.length; i++) {
        const n = seq[i];
        const here = path ? `${path} → step ${i + 1}` : `Step ${i + 1}`;
        const ownPath: TreeStep[] = [...branchPath, i];
        // rootTopIdx is the top-level position this branch lives under; for
        // legacy refTopLevelIndex checks the ref must be strictly less.
        const rootTopIdx = typeof ownPath[0] === "number" ? ownPath[0] : 0;
        if (n.type === "send") {
          if (!n.config.templateId && !n.config.inlineBody) return `${here} (Send) needs a template or a composed message`;
          if (!n.config.recipientType) return `${here} (Send) is missing a recipient`;
        } else if (n.type === "wait") {
          if (!n.config.durationMinutes || n.config.durationMinutes < 1) return `${here} (Wait) duration must be at least 1 minute`;
        } else if (n.type === "branch_engagement") {
          const rPath = n.config.refPath;
          const ref = n.config.refTopLevelIndex;
          if (Array.isArray(rPath)) {
            const target = allSendPaths.find(p => pathEq(p, rPath));
            if (!target) return `${here} (Branch on Engagement) reference must point to a Send step`;
            if (pathIsPrefix(ownPath, target)) return `${here} (Branch on Engagement) cannot reference a Send inside its own branch`;
            if (cmpTreePath(target, ownPath) >= 0) return `${here} (Branch on Engagement) reference must come before this branch`;
          } else if (ref != null) {
            if (ref >= rootTopIdx) return `${here} (Branch on Engagement) reference must come before this branch`;
            if (topTypes[ref] !== "send") return `${here} (Branch on Engagement) reference must point to a Send step`;
          } else {
            return `${here} (Branch on Engagement) must reference an earlier Send step`;
          }
          if (!n.config.windowMinutes || n.config.windowMinutes < 1) return `${here} (Branch on Engagement) window must be at least 1 minute`;
          if (!n.yes?.length) return `${here} "Yes" branch is empty`;
          if (!n.no?.length)  return `${here} "No" branch is empty`;
          const ye = walk(n.yes, `${here} → Yes`, depth + 1, [...ownPath, "yes"]); if (ye) return ye;
          const ne = walk(n.no,  `${here} → No`,  depth + 1, [...ownPath, "no" ]); if (ne) return ne;
        } else if (n.type === "branch_loan_state") {
          if (!n.config.field) return `${here} (Branch on Loan State) needs a field`;
          if (!n.config.operator) return `${here} (Branch on Loan State) needs an operator`;
          const v = n.config.value;
          if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return `${here} (Branch on Loan State) needs a value`;
          const op = String(n.config.operator);
          if ((op === "in" || op === "notIn") && !Array.isArray(v)) {
            return `${here} (Branch on Loan State) operator "${op}" requires a list of values`;
          }
          if (["gt", "gte", "lt", "lte"].includes(op)) {
            const numVal = typeof v === "number" ? v : Number(v);
            if (!Number.isFinite(numVal)) {
              return `${here} (Branch on Loan State) operator "${op}" requires a numeric value`;
            }
          }
          if (!n.yes?.length) return `${here} "Yes" branch is empty`;
          if (!n.no?.length)  return `${here} "No" branch is empty`;
          const ye = walk(n.yes, `${here} → Yes`, depth + 1, [...ownPath, "yes"]); if (ye) return ye;
          const ne = walk(n.no,  `${here} → No`,  depth + 1, [...ownPath, "no" ]); if (ne) return ne;
        }
      }
      return null;
    };
    const err = walk(nodes, "", 0, []);
    if (err) return err;
    return null;
  };

  const onSaveClick = (action: "create" | "save") => {
    const err = validateClient();
    if (err) {
      setClientError(err);
      toast({ title: "Fix sequence first", description: err, variant: "destructive" });
      return;
    }
    setClientError(null);
    if (action === "create") create.mutate();
    else save.mutate();
  };

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/comms/automations", buildPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); toast({ title: "Automation created" }); onClose(); },
    onError: (e: ApiError) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/comms/automations/${id}`, buildPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id] }); toast({ title: "Saved" }); },
    onError: (e: ApiError) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });
  const activate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/comms/automations/${id}/activate`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Activate failed");
      }
      return res.json() as Promise<{ ok: boolean; warnings: string[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id] });
      setShowActivateDialog(false);
      toast({ title: "Activated" });
      for (const w of (data?.warnings ?? [])) {
        toast({ title: "Channel warning", description: w });
      }
    },
    onError: (e: Error) => toast({ title: "Activate failed", description: e.message, variant: "destructive" }),
  });
  const pause = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/automations/${id}/pause`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations"] }); queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id] }); toast({ title: "Paused" }); },
  });

  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [manualSubjectType, setManualSubjectType] = useState<SubjectType>("loan");
  const [manualSubjectId, setManualSubjectId] = useState("");
  const startRun = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/automations/${id}/start-run`, {
      subjectType: manualSubjectType, subjectId: Number(manualSubjectId),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/comms/automations", id, "runs"] }); toast({ title: "Run started" }); setManualSubjectId(""); },
    onError: (e: ApiError) => toast({ title: "Start failed", description: e?.message, variant: "destructive" }),
  });

  // ---- Tree mutation handlers ----
  // parentPath = path to the node owning the children list; empty = top-level.
  // side = which side of the parent's branches; null = top-level list.
  const insertChild = (parentPath: PathStep[], side: "yes" | "no" | null, atIdx: number, type: NodeType) => {
    const fresh = newNode(type, defaultChannel);
    setNodes(prev => withChildren(prev, parentPath, side, arr => [...arr.slice(0, atIdx), fresh, ...arr.slice(atIdx)]));
  };
  const removeAt = (parentPath: PathStep[], side: "yes" | "no" | null, idx: number) => {
    setNodes(prev => withChildren(prev, parentPath, side, arr => arr.filter((_, i) => i !== idx)));
  };
  const moveAt = (parentPath: PathStep[], side: "yes" | "no" | null, idx: number, dir: -1 | 1) => {
    setNodes(prev => withChildren(prev, parentPath, side, arr => {
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    }));
  };
  const updateAt = (path: PathStep[], patch: Partial<NodeRow>) => {
    setNodes(prev => updateNodeAtPath(prev, path, patch));
  };

  const topLevelSends = listTopLevelSends(nodes);
  const treeSends = listTreeSends(nodes);

  // Pre-activation summary (for confirmation dialog)
  const activateTriggerSummary = (() => {
    switch (triggerKind) {
      case "event": return `Event trigger: "${eventName}"${eventToStage ? ` → stage "${eventToStage}"` : ""} — fires on every future matching event.`;
      case "time_absolute": return `One-shot schedule at ${runAt ? new Date(runAt).toLocaleString() : "(no date set)"}.`;
      case "time_recurring": return `Recurring every ${everyMinutes} minutes.`;
      case "time_relative": return `Delayed ${offsetMinutes} min after "${eventName}"${eventToStage ? ` → stage "${eventToStage}"` : ""}`;
      case "manual": return "Manual trigger — runs must be started individually per contact.";
    }
  })();
  const activateFirstRecipient = (() => {
    const walk = (arr: NodeRow[]): "borrower" | "broker" | undefined => {
      for (const n of arr) {
        if (n.type === "send") return n.config.recipientType ?? "borrower";
        const r = walk(n.yes ?? []) ?? walk(n.no ?? []);
        if (r) return r;
      }
      return undefined;
    };
    return walk(nodes) ?? "borrower";
  })();

  const isSavePending = save.isPending || create.isPending;

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
            <Button variant="outline" size="sm" onClick={() => setShowActivateDialog(true)} data-testid="button-activate-editor">
              <Play className="w-4 h-4 mr-1" />Activate
            </Button>
          )}
          <Button onClick={() => onSaveClick(isNew ? "create" : "save")} disabled={!name || nodes.length === 0} data-testid="button-save">
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
          <div>
            <Label>Default channel</Label>
            <Select value={defaultChannel} onValueChange={v => setDefaultChannel(v as Channel)}>
              <SelectTrigger data-testid="select-default-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="in_app">In-app</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Default channel for new send steps. Each step can override this individually for mixed-channel sequences.
            </p>
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
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Sequence</span>
            <span className="text-xs font-normal text-muted-foreground">Branches let you fork on engagement or loan data.</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {clientError && (
            <div className="text-xs text-destructive border border-destructive/30 bg-destructive/5 rounded px-2 py-1" data-testid="text-client-error">
              {clientError}
            </div>
          )}
          <NodeList
            nodes={nodes}
            parentPath={[]}
            side={null}
            templates={templates}
            automationChannel={defaultChannel}
            topLevelSends={topLevelSends}
            treeSends={treeSends}
            onInsert={insertChild}
            onRemove={removeAt}
            onMove={moveAt}
            onUpdate={updateAt}
            onSave={() => onSaveClick("save")}
            isSavePending={isSavePending}
            depth={0}
          />
        </CardContent>
      </Card>

      {!isNew && existing?.status === "active" && triggerKind === "manual" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Start a manual run</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-2">
            <div className="w-32">
              <Label className="text-xs">Subject</Label>
              <Select value={manualSubjectType} onValueChange={v => setManualSubjectType(v as SubjectType)}>
                <SelectTrigger data-testid="select-manual-subject-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loan">Loan</SelectItem>
                  <SelectItem value="broker">Broker</SelectItem>
                  <SelectItem value="borrower">Borrower</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">{manualSubjectType === "loan" ? "Loan ID" : `${manualSubjectType[0].toUpperCase()}${manualSubjectType.slice(1)} user ID`}</Label>
              <Input
                type="number" value={manualSubjectId} onChange={e => setManualSubjectId(e.target.value)}
                placeholder="e.g. 42" data-testid="input-manual-subject-id"
              />
            </div>
            <Button
              onClick={() => startRun.mutate()}
              disabled={!manualSubjectId || startRun.isPending}
              data-testid="button-start-run"
            >
              <Send className="w-4 h-4 mr-1" />Start run
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Activation confirmation dialog */}
      <Dialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <DialogContent data-testid="dialog-activate-confirm">
          <DialogHeader>
            <DialogTitle>Activate automation?</DialogTitle>
            <DialogDescription>Review the details below before activating.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm py-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Trigger</p>
              <p>{activateTriggerSummary}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Primary recipient</p>
              <p className="capitalize">{activateFirstRecipient}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Steps</p>
              <p>{nodes.length} top-level step{nodes.length === 1 ? "" : "s"} in the sequence</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivateDialog(false)} data-testid="button-activate-cancel">Cancel</Button>
            <Button onClick={() => activate.mutate()} disabled={activate.isPending} data-testid="button-activate-confirm">
              <Play className="w-4 h-4 mr-1" />{activate.isPending ? "Activating…" : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <div key={r.id} className="flex items-center justify-between py-1 border-b last:border-0 gap-3" data-testid={`row-run-${r.id}`}>
                    <span className="min-w-0 truncate">
                      #{r.id} · {r.subjectType} {r.subjectId}
                      {r.parkedNode && r.status === "running" && (
                        <span className="ml-2 text-xs text-muted-foreground" data-testid={`text-parked-node-${r.id}`}>
                          parked at step {r.parkedNode.ordinal} ({r.parkedNode.label})
                        </span>
                      )}
                      {r.branchTrail && r.branchTrail.length > 0 && (
                        <span className="ml-2 inline-flex flex-wrap gap-1" data-testid={`text-branch-trail-${r.id}`}>
                          {r.branchTrail.map((b, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] py-0">
                              <GitBranch className="w-3 h-3 mr-1" />{b.label}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {r.lastSendLogId != null && (
                        <a
                          href={`/admin/comms/send-log?id=${r.lastSendLogId}`}
                          className="text-xs underline text-muted-foreground hover:text-foreground"
                          data-testid={`link-send-log-${r.id}`}
                        >
                          view send
                        </a>
                      )}
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

// Recursive list — renders each node and the add-node controls between them.
// `side` is null at the top level and "yes"|"no" inside a branch's children.
function NodeList({
  nodes, parentPath, side, templates, automationChannel, topLevelSends, treeSends,
  onInsert, onRemove, onMove, onUpdate, onSave, isSavePending, depth,
}: {
  nodes: NodeRow[];
  parentPath: PathStep[];
  side: "yes" | "no" | null;
  templates: Template[];
  automationChannel: Channel;
  topLevelSends: ReturnType<typeof listTopLevelSends>;
  treeSends: TreeSend[];
  onInsert: (parentPath: PathStep[], side: "yes" | "no" | null, atIdx: number, type: NodeType) => void;
  onRemove: (parentPath: PathStep[], side: "yes" | "no" | null, idx: number) => void;
  onMove: (parentPath: PathStep[], side: "yes" | "no" | null, idx: number, dir: -1 | 1) => void;
  onUpdate: (path: PathStep[], patch: Partial<NodeRow>) => void;
  onSave: () => void;
  isSavePending: boolean;
  depth: number;
}) {
  // Branches deeper than 5 levels are blocked at validation time, but we
  // also disable the add-node picker at depth >= 5 so the user can't even
  // build something the server will reject.
  const allowBranch = depth < 5;
  return (
    <div className="space-y-1">
      {nodes.length === 0 && (
        <AddNodePicker
          onPick={t => onInsert(parentPath, side, 0, t)}
          allowBranch={allowBranch && side === null /* branches inside branches limited to top-level depth budget */ ? true : allowBranch}
          testIdPrefix={`add-empty-${depth}`}
        />
      )}
      {nodes.map((n, idx) => {
        const path: PathStep[] =
          side === null
            ? [...parentPath, idx]
            : [...parentPath, { side, idx }];
        return (
          <div key={idx}>
            <NodeEditor
              node={n}
              path={path}
              templates={templates}
              automationChannel={automationChannel}
              topLevelSends={topLevelSends}
              treeSends={treeSends}
              onUpdate={onUpdate}
              onRemove={() => onRemove(parentPath, side, idx)}
              onMoveUp={idx > 0 ? () => onMove(parentPath, side, idx, -1) : undefined}
              onMoveDown={idx < nodes.length - 1 ? () => onMove(parentPath, side, idx, 1) : undefined}
              onInsertChild={onInsert}
              onRemoveChild={onRemove}
              onMoveChild={onMove}
              onSave={onSave}
              isSavePending={isSavePending}
              ordinal={idx + 1}
              depth={depth}
            />
            <AddNodePicker
              onPick={t => onInsert(parentPath, side, idx + 1, t)}
              allowBranch={allowBranch}
              testIdPrefix={`add-after-${path.map(p => typeof p === "number" ? p : `${p.side}${p.idx}`).join("-")}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function AddNodePicker({
  onPick, allowBranch, testIdPrefix,
}: { onPick: (t: NodeType) => void; allowBranch: boolean; testIdPrefix: string }) {
  return (
    <div className="flex justify-center gap-2 my-1">
      <Button variant="ghost" size="sm" onClick={() => onPick("send")} data-testid={`button-${testIdPrefix}-send`}>
        <Plus className="w-3 h-3 mr-1" /><Mail className="w-3 h-3 mr-1" />Send
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onPick("wait")} data-testid={`button-${testIdPrefix}-wait`}>
        <Plus className="w-3 h-3 mr-1" /><Clock className="w-3 h-3 mr-1" />Wait
      </Button>
      {allowBranch && (
        <>
          <Button variant="ghost" size="sm" onClick={() => onPick("branch_engagement")} data-testid={`button-${testIdPrefix}-branch-engagement`}>
            <Plus className="w-3 h-3 mr-1" /><Activity className="w-3 h-3 mr-1" />If engaged?
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onPick("branch_loan_state")} data-testid={`button-${testIdPrefix}-branch-loan`}>
            <Plus className="w-3 h-3 mr-1" /><GitBranch className="w-3 h-3 mr-1" />If loan…?
          </Button>
        </>
      )}
    </div>
  );
}

// ── Merge tag helper ──────────────────────────────────────────────────────────
const MERGE_TAGS = [
  { tag: "{{recipient.first_name}}", label: "First name" },
  { tag: "{{recipient.full_name}}", label: "Full name" },
  { tag: "{{recipient.email}}", label: "Email" },
  { tag: "{{recipient.phone}}", label: "Phone" },
  { tag: "{{loan.address}}", label: "Address" },
  { tag: "{{loan.amount}}", label: "Loan amount" },
  { tag: "{{loan.number}}", label: "Loan #" },
  { tag: "{{loan.status}}", label: "Status" },
  { tag: "{{loan.portal_link}}", label: "Portal link" },
  { tag: "{{loan.target_close_date}}", label: "Close date" },
  { tag: "{{lender.name}}", label: "Lender" },
  { tag: "{{broker.full_name}}", label: "Broker" },
  { tag: "{{current_date}}", label: "Today" },
];

function insertAtCursor(el: HTMLTextAreaElement | null, text: string, currentValue: string): string {
  if (!el) return currentValue + text;
  const start = el.selectionStart ?? currentValue.length;
  const end = el.selectionEnd ?? currentValue.length;
  const val = el.value;
  const next = val.slice(0, start) + text + val.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}

// ── Per-send-node channel + compose/template editor ───────────────────────────
function SendNodeEditor({
  node, path, testKey, templates, defaultChannel, onUpdate, onSave, isSavePending,
}: {
  node: NodeRow;
  path: PathStep[];
  testKey: string;
  templates: Template[];
  defaultChannel: Channel;
  onUpdate: (path: PathStep[], patch: Partial<NodeRow>) => void;
  onSave: () => void;
  isSavePending: boolean;
}) {
  const { toast } = useToast();
  const nodeChannel: Channel = node.config.channel ?? defaultChannel;
  const [mode, setMode] = useState<"template" | "compose">(
    node.config.inlineBody ? "compose" : "template",
  );
  const [bodyRef, setBodyRef] = useState<HTMLTextAreaElement | null>(null);
  const [subjRef, setSubjRef] = useState<HTMLTextAreaElement | null>(null);
  const [focusedField, setFocusedField] = useState<"subject" | "body">("body");
  const [makingTemplate, setMakingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const makeTemplate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/comms/templates", {
      name: templateName.trim(),
      channel: nodeChannel,
      subject: node.config.inlineSubject ?? "",
      body: node.config.inlineBody ?? "",
    }),
    onSuccess: async (res) => {
      const created = await res.json() as { id: number; name: string };
      queryClient.invalidateQueries({ queryKey: ["/api/comms/templates"] });
      onUpdate(path, { config: {
        ...node.config,
        templateId: created.id,
        inlineBody: undefined,
        inlineSubject: undefined,
      } });
      setMode("template");
      setMakingTemplate(false);
      setTemplateName("");
      toast({ title: "Template created", description: `"${created.name}" saved and selected` });
    },
    onError: (e: Error) => toast({ title: "Template creation failed", description: e.message, variant: "destructive" }),
  });

  const filteredTemplates = templates.filter(t => t.channel === nodeChannel);

  const insertTag = (tag: string) => {
    if (focusedField === "subject") {
      const next = insertAtCursor(subjRef, tag, node.config.inlineSubject ?? "");
      onUpdate(path, { config: { ...node.config, inlineSubject: next } });
    } else {
      const next = insertAtCursor(bodyRef, tag, node.config.inlineBody ?? "");
      onUpdate(path, { config: { ...node.config, inlineBody: next } });
    }
  };

  const channelIcon = nodeChannel === "email"
    ? <Mail className="w-3 h-3" />
    : nodeChannel === "sms"
      ? <Smartphone className="w-3 h-3" />
      : <Zap className="w-3 h-3" />;

  return (
    <div className="space-y-2">
      {/* Row 1: channel + recipient */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Channel</Label>
          <Select
            value={nodeChannel}
            onValueChange={v => onUpdate(path, { config: { ...node.config, channel: v as Channel, templateId: undefined } })}
          >
            <SelectTrigger data-testid={`select-channel-${testKey}`}>
              <div className="flex items-center gap-1.5">{channelIcon}<SelectValue /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="in_app">In-app</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Recipient</Label>
          <Select
            value={node.config.recipientType ?? "borrower"}
            onValueChange={v => onUpdate(path, { config: { ...node.config, recipientType: v as "borrower" | "broker" } })}
          >
            <SelectTrigger data-testid={`select-recipient-${testKey}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="borrower">Borrower</SelectItem>
              <SelectItem value="broker">Broker</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: mode toggle */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={mode === "template" ? "default" : "outline"}
          className="h-7 text-xs gap-1"
          onClick={() => setMode("template")}
          data-testid={`button-mode-template-${testKey}`}
        >
          <Tag className="w-3 h-3" /> Pick template
        </Button>
        <Button
          size="sm"
          variant={mode === "compose" ? "default" : "outline"}
          className="h-7 text-xs gap-1"
          onClick={() => setMode("compose")}
          data-testid={`button-mode-compose-${testKey}`}
        >
          <MessageSquare className="w-3 h-3" /> Compose
        </Button>
      </div>

      {/* Template picker */}
      {mode === "template" && (
        <div>
          <Label className="text-xs">Template ({nodeChannel})</Label>
          <Select
            value={node.config.templateId?.toString() ?? ""}
            onValueChange={v => onUpdate(path, { config: { ...node.config, templateId: Number(v), inlineBody: undefined, inlineSubject: undefined } })}
          >
            <SelectTrigger data-testid={`select-template-${testKey}`}><SelectValue placeholder="Pick a template…" /></SelectTrigger>
            <SelectContent>
              {filteredTemplates.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No {nodeChannel} templates yet</div>
              )}
              {filteredTemplates.map(t => (
                <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Inline compose */}
      {mode === "compose" && (
        <div className="space-y-2">
          {/* Merge tag bar */}
          <div>
            <Label className="text-xs text-muted-foreground">Insert merge tag into {focusedField === "subject" ? "subject" : "body"}</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {MERGE_TAGS.map(m => (
                <button
                  key={m.tag}
                  type="button"
                  onClick={() => insertTag(m.tag)}
                  className="text-[10px] bg-muted hover:bg-muted/80 border border-border rounded px-1.5 py-0.5 font-mono leading-tight"
                  data-testid={`button-tag-${m.label.replace(/\s/g, "-").toLowerCase()}-${testKey}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject (email only) */}
          {nodeChannel === "email" && (
            <div>
              <Label className="text-xs">Subject</Label>
              <Textarea
                ref={el => setSubjRef(el)}
                rows={1}
                className="text-sm resize-none"
                placeholder="Subject line…"
                value={node.config.inlineSubject ?? ""}
                onFocus={() => setFocusedField("subject")}
                onChange={e => onUpdate(path, { config: { ...node.config, inlineSubject: e.target.value, templateId: undefined } })}
                data-testid={`input-inline-subject-${testKey}`}
              />
            </div>
          )}

          {/* Body */}
          <div>
            <Label className="text-xs">Message body</Label>
            <Textarea
              ref={el => setBodyRef(el)}
              rows={5}
              className="text-sm font-mono resize-y"
              placeholder={nodeChannel === "email"
                ? "Write your email HTML or plain text…"
                : nodeChannel === "sms"
                  ? "Write your SMS message (160 chars per segment)…"
                  : "Write your in-app notification…"
              }
              value={node.config.inlineBody ?? ""}
              onFocus={() => setFocusedField("body")}
              onChange={e => onUpdate(path, { config: { ...node.config, inlineBody: e.target.value, templateId: undefined } })}
              data-testid={`input-inline-body-${testKey}`}
            />
            {nodeChannel === "sms" && node.config.inlineBody && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                ~{Math.ceil((node.config.inlineBody?.length ?? 0) / 160)} segment(s) · {node.config.inlineBody?.length ?? 0} chars
              </p>
            )}
          </div>

          {/* Save step + Make template actions */}
          {makingTemplate ? (
            <div className="flex items-center gap-2 pt-1">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="Template name…"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                data-testid={`input-template-name-${testKey}`}
                onKeyDown={e => { if (e.key === "Enter" && templateName.trim()) makeTemplate.mutate(); }}
              />
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!templateName.trim() || makeTemplate.isPending}
                onClick={() => makeTemplate.mutate()}
                data-testid={`button-template-confirm-${testKey}`}
              >
                {makeTemplate.isPending ? "Saving…" : "Save template"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setMakingTemplate(false); setTemplateName(""); }}
                data-testid={`button-template-cancel-${testKey}`}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={onSave}
                disabled={isSavePending}
                data-testid={`button-save-step-${testKey}`}
              >
                <Save className="w-3 h-3" />{isSavePending ? "Saving…" : "Save step"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setMakingTemplate(true)}
                disabled={!node.config.inlineBody}
                data-testid={`button-make-template-${testKey}`}
              >
                <Tag className="w-3 h-3" />Make template
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NodeEditor({
  node, path, templates, automationChannel, topLevelSends, treeSends,
  onUpdate, onRemove, onMoveUp, onMoveDown,
  onInsertChild, onRemoveChild, onMoveChild,
  onSave, isSavePending,
  ordinal, depth,
}: {
  node: NodeRow;
  path: PathStep[];
  templates: Template[];
  automationChannel: Channel;
  topLevelSends: ReturnType<typeof listTopLevelSends>;
  treeSends: TreeSend[];
  onUpdate: (path: PathStep[], patch: Partial<NodeRow>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onInsertChild: (parentPath: PathStep[], side: "yes" | "no" | null, atIdx: number, type: NodeType) => void;
  onRemoveChild: (parentPath: PathStep[], side: "yes" | "no" | null, idx: number) => void;
  onMoveChild: (parentPath: PathStep[], side: "yes" | "no" | null, idx: number, dir: -1 | 1) => void;
  onSave: () => void;
  isSavePending: boolean;
  ordinal: number;
  depth: number;
}) {
  // Wait unit state — derive initial unit from stored durationMinutes
  const initWaitUnit = (): "minutes" | "hours" | "days" => {
    const dm = node.config.durationMinutes ?? 60;
    if (dm % 1440 === 0 && dm >= 1440) return "days";
    if (dm % 60 === 0 && dm >= 60) return "hours";
    return "minutes";
  };
  const [waitUnit, setWaitUnit] = useState<"minutes" | "hours" | "days">(initWaitUnit);
  const waitDisplayValue = waitUnit === "days"
    ? (node.config.durationMinutes ?? 60) / 1440
    : waitUnit === "hours"
      ? (node.config.durationMinutes ?? 60) / 60
      : (node.config.durationMinutes ?? 60);
  const handleWaitChange = (value: number, unit: "minutes" | "hours" | "days") => {
    const mins = unit === "days" ? value * 1440 : unit === "hours" ? value * 60 : value;
    onUpdate(path, { config: { durationMinutes: Math.max(1, Math.round(mins)) } });
  };
  const isBranch = node.type === "branch_engagement" || node.type === "branch_loan_state";
  const ringByDepth = depth === 0 ? "" : "ml-4 border-l-2 border-l-muted pl-3";
  // Phase 4 — convert the editor's PathStep[] path into the canonical
  // TreeStep[] form so we can compare against treeSends using the shared
  // cmpTreePath helper (numeric-aware, with 'yes' < 'no' matching DFS order).
  const ownPath: TreeStep[] = path.flatMap(p =>
    typeof p === "number" ? [p] : [p.side, p.idx],
  );
  const eligibleTreeSends = treeSends.filter(
    s => cmpTreePath(s.path, ownPath) < 0 && !pathIsPrefix(ownPath, s.path),
  );
  // Legacy picker fallback (for automations saved before refPath existed).
  const myRootTopIdx = typeof path[0] === "number" ? path[0] : 0;
  const eligibleSends = topLevelSends.filter(s => s.idx < myRootTopIdx);

  const testKey = path.map(p => typeof p === "number" ? p : `${p.side}${p.idx}`).join("-");

  // Channel-aware engagement type filtering for branch_engagement nodes.
  const refSend = node.config.refPath
    ? eligibleTreeSends.find(s => JSON.stringify(s.path) === JSON.stringify(node.config.refPath))
    : node.config.refTopLevelIndex != null
      ? eligibleTreeSends.find(s => JSON.stringify(s.path) === JSON.stringify([node.config.refTopLevelIndex]))
      : undefined;
  const refChannel: Channel = refSend?.channel ?? automationChannel;
  const engagementOptions = CHANNEL_ENGAGEMENT_OPTIONS[refChannel] ?? CHANNEL_ENGAGEMENT_OPTIONS.email;
  const engagementValidValue = engagementOptions.some(o => o.value === node.config.engagementType)
    ? (node.config.engagementType as string)
    : engagementOptions[0].value;

  return (
    <Card data-testid={`card-node-${testKey}`} className={ringByDepth}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {node.type === "send" && <Send className="w-4 h-4" />}
            {node.type === "wait" && <Clock className="w-4 h-4" />}
            {node.type === "branch_engagement" && <Activity className="w-4 h-4" />}
            {node.type === "branch_loan_state" && <GitBranch className="w-4 h-4" />}
            <span>Step {ordinal}: {NODE_LABEL[node.type]}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={!onMoveUp} onClick={onMoveUp} data-testid={`button-move-up-${testKey}`}>
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled={!onMoveDown} onClick={onMoveDown} data-testid={`button-move-down-${testKey}`}>
              <ChevronDown className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onRemove} data-testid={`button-remove-node-${testKey}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <Separator />

        {node.type === "send" && (
          <SendNodeEditor
            node={node}
            path={path}
            testKey={testKey}
            templates={templates}
            defaultChannel={automationChannel}
            onUpdate={onUpdate}
            onSave={onSave}
            isSavePending={isSavePending}
          />
        )}

        {node.type === "wait" && (
          <div>
            <Label className="text-xs">Wait duration</Label>
            <div className="flex gap-2">
              <Input
                type="number" min={1}
                className="flex-1"
                value={waitDisplayValue}
                onChange={e => {
                  const v = Number(e.target.value);
                  handleWaitChange(v, waitUnit);
                }}
                data-testid={`input-wait-value-${testKey}`}
              />
              <Select
                value={waitUnit}
                onValueChange={v => {
                  const unit = v as "minutes" | "hours" | "days";
                  setWaitUnit(unit);
                  handleWaitChange(waitDisplayValue, unit);
                }}
              >
                <SelectTrigger className="w-32" data-testid={`select-wait-unit-${testKey}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Stored as {node.config.durationMinutes ?? 60} minute{(node.config.durationMinutes ?? 60) === 1 ? "" : "s"} total
            </p>
          </div>
        )}

        {node.type === "branch_engagement" && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Reference (earlier Send)</Label>
              <Select
                value={
                  node.config.refPath
                    ? JSON.stringify(node.config.refPath)
                    : node.config.refTopLevelIndex != null
                      ? JSON.stringify([node.config.refTopLevelIndex])
                      : ""
                }
                onValueChange={v => {
                  const parsed = JSON.parse(v) as (number | "yes" | "no")[];
                  const patch: NodeConfig = { refPath: parsed };
                  if (parsed.length === 1 && typeof parsed[0] === "number") {
                    patch.refTopLevelIndex = parsed[0];
                  } else {
                    patch.refTopLevelIndex = undefined;
                  }
                  // Reset engagement to first valid option for the new Send node's channel.
                  const newSend = eligibleTreeSends.find(s => JSON.stringify(s.path) === v);
                  const newCh: Channel = newSend?.channel ?? automationChannel;
                  const newOpts = CHANNEL_ENGAGEMENT_OPTIONS[newCh] ?? CHANNEL_ENGAGEMENT_OPTIONS.email;
                  const currentOk = newOpts.some(o => o.value === node.config.engagementType);
                  if (!currentOk) patch.engagementType = newOpts[0].value as NodeConfig["engagementType"];
                  onUpdate(path, { config: patch });
                }}
              >
                <SelectTrigger data-testid={`select-ref-${testKey}`}>
                  <SelectValue placeholder={eligibleTreeSends.length ? "Pick a send" : "No earlier Send"} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleTreeSends.map(s => (
                    <SelectItem key={JSON.stringify(s.path)} value={JSON.stringify(s.path)}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Engagement</Label>
              <Select
                value={engagementValidValue}
                onValueChange={v => onUpdate(path, { config: { engagementType: v as NodeConfig["engagementType"] } })}
              >
                <SelectTrigger data-testid={`select-engagement-${testKey}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {engagementOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Window (minutes)</Label>
              <Input
                type="number" min={1}
                value={node.config.windowMinutes ?? 1440}
                onChange={e => onUpdate(path, { config: { windowMinutes: Number(e.target.value) } })}
                data-testid={`input-window-${testKey}`}
              />
            </div>
            <p className="col-span-3 text-xs text-muted-foreground">
              The run pauses until this window closes, then takes the Yes branch if the engagement happened, otherwise the No branch.
            </p>
          </div>
        )}

        {node.type === "branch_loan_state" && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Loan field</Label>
              <Select
                value={node.config.field ?? "currentStage"}
                onValueChange={v => onUpdate(path, { config: { field: v as NodeConfig["field"] } })}
              >
                <SelectTrigger data-testid={`select-loan-field-${testKey}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="currentStage">Current stage</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="loanAmount">Loan amount</SelectItem>
                  <SelectItem value="loanType">Loan type</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operator</Label>
              <Select
                value={node.config.operator ?? "eq"}
                onValueChange={v => onUpdate(path, { config: { operator: v as NodeConfig["operator"] } })}
              >
                <SelectTrigger data-testid={`select-loan-op-${testKey}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">equals</SelectItem>
                  <SelectItem value="neq">not equals</SelectItem>
                  <SelectItem value="in">is one of (comma list)</SelectItem>
                  <SelectItem value="notIn">is none of (comma list)</SelectItem>
                  <SelectItem value="gt">&gt;</SelectItem>
                  <SelectItem value="gte">&gt;=</SelectItem>
                  <SelectItem value="lt">&lt;</SelectItem>
                  <SelectItem value="lte">&lt;=</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Value</Label>
              <Input
                value={Array.isArray(node.config.value) ? node.config.value.join(",") : (node.config.value ?? "").toString()}
                onChange={e => {
                  const op = node.config.operator ?? "eq";
                  const raw = e.target.value;
                  const next = (op === "in" || op === "notIn")
                    ? raw.split(",").map(s => s.trim()).filter(Boolean)
                    : (op === "gt" || op === "gte" || op === "lt" || op === "lte") && raw && !isNaN(Number(raw))
                      ? Number(raw)
                      : raw;
                  onUpdate(path, { config: { value: next } });
                }}
                placeholder={(node.config.operator === "in" || node.config.operator === "notIn") ? "underwriting,closing" : "e.g. underwriting"}
                data-testid={`input-loan-value-${testKey}`}
              />
            </div>
          </div>
        )}

        {isBranch && (
          <div className="space-y-2 mt-2">
            <div>
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full" />Yes branch
              </div>
              <NodeList
                nodes={node.yes ?? []}
                parentPath={path}
                side="yes"
                templates={templates}
                automationChannel={automationChannel}
                topLevelSends={topLevelSends}
                treeSends={treeSends}
                onInsert={onInsertChild}
                onRemove={onRemoveChild}
                onMove={onMoveChild}
                onUpdate={onUpdate}
                onSave={onSave}
                isSavePending={isSavePending}
                depth={depth + 1}
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-rose-500 rounded-full" />No branch
              </div>
              <NodeList
                nodes={node.no ?? []}
                parentPath={path}
                side="no"
                templates={templates}
                automationChannel={automationChannel}
                topLevelSends={topLevelSends}
                treeSends={treeSends}
                onInsert={onInsertChild}
                onRemove={onRemoveChild}
                onMove={onMoveChild}
                onUpdate={onUpdate}
                onSave={onSave}
                isSavePending={isSavePending}
                depth={depth + 1}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

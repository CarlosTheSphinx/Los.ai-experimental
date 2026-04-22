import { useState, useMemo, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LifeBuoy, Bug, Lightbulb, HelpCircle, Camera, Upload, X, ArrowLeft, Loader2, Inbox, CheckCircle2 } from "lucide-react";

type TicketType = "help" | "bug" | "feature";

interface UploadedFile {
  objectPath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const HELP_CATEGORIES = [
  { value: "deal_submission", label: "Deal submission" },
  { value: "documents", label: "Documents" },
  { value: "pricing", label: "Pricing" },
  { value: "messaging", label: "Messaging" },
  { value: "account", label: "Account" },
  { value: "other", label: "Other" },
];

const SEVERITIES = [
  { value: "blocker", label: "Blocker — I can't work" },
  { value: "major", label: "Major — significant impact" },
  { value: "minor", label: "Minor — workaround available" },
  { value: "cosmetic", label: "Cosmetic — visual issue" },
];

const PRIORITIES = [
  { value: "nice_to_have", label: "Nice to have" },
  { value: "important", label: "Important" },
  { value: "critical", label: "Critical to my workflow" },
];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_broker: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
};

const TYPE_LABELS: Record<string, string> = { help: "Help", bug: "Bug", feature: "Feature" };

function detectBrowserOs(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
  let browser = "Unknown Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  return `${browser} on ${os}`;
}

function getSessionActivity(): Array<{ ts: string; path: string }> {
  try {
    const raw = sessionStorage.getItem("__lendry_recent_routes");
    if (!raw) return [];
    return JSON.parse(raw).slice(-5);
  } catch { return []; }
}

async function uploadFile(file: File): Promise<UploadedFile> {
  const signRes = await apiRequest("POST", "/api/support/uploads/sign", {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
  const { uploadURL, useDirectUpload, objectPath } = await signRes.json();
  if (useDirectUpload) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadURL, { method: "POST", body: fd, credentials: "include" });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return { objectPath: data.objectPath, fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.fileSize };
  }
  const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!put.ok) throw new Error("Upload failed");
  return { objectPath, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
}

function FilePicker({ files, setFiles, hint }: { files: UploadedFile[]; setFiles: (f: UploadedFile[]) => void; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    if (files.length + picked.length > 10) {
      toast({ title: "Too many files", description: "Maximum 10 attachments per ticket.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const f of picked) {
        if (f.size > 50 * 1024 * 1024) {
          toast({ title: `${f.name} too large`, description: "Max 50 MB per file.", variant: "destructive" });
          continue;
        }
        try {
          uploaded.push(await uploadFile(f));
        } catch {
          toast({ title: `Failed to upload ${f.name}`, variant: "destructive" });
        }
      }
      setFiles([...files, ...uploaded]);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" multiple className="hidden" onChange={onChange} data-testid="input-file-picker" />
      <Button type="button" variant="outline" onClick={() => ref.current?.click()} disabled={uploading} data-testid="btn-attach-files">
        {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
        {uploading ? "Uploading..." : "Add attachments"}
      </Button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {files.length > 0 && (
        <ul className="space-y-1 mt-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded border bg-muted/30 text-sm" data-testid={`attachment-${i}`}>
              <span className="truncate">{f.fileName} <span className="text-muted-foreground">· {(f.sizeBytes / 1024).toFixed(0)} KB</span></span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`btn-remove-attachment-${i}`}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypePicker({ onPick }: { onPick: (t: TicketType) => void }) {
  const cards: { type: TicketType; icon: any; title: string; desc: string; testId: string }[] = [
    { type: "help", icon: HelpCircle, title: "Help Question", desc: "How do I do X? Where do I find Y?", testId: "card-type-help" },
    { type: "bug", icon: Bug, title: "Bug Report", desc: "Something is broken or behaving unexpectedly.", testId: "card-type-bug" },
    { type: "feature", icon: Lightbulb, title: "Feature Request", desc: "I'd like to suggest a new capability.", testId: "card-type-feature" },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <button key={c.type} type="button" onClick={() => onPick(c.type)} data-testid={c.testId}
            className="text-left rounded-lg border p-5 hover:border-primary hover:bg-muted/40 transition-colors">
            <Icon className="h-7 w-7 text-primary mb-3" />
            <div className="font-semibold text-base mb-1">{c.title}</div>
            <div className="text-sm text-muted-foreground">{c.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

interface TicketFormProps {
  type: TicketType;
  onCancel: () => void;
  onCreated: (id: number) => void;
}

function TicketForm({ type, onCancel, onCreated }: TicketFormProps) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [pageUrl, setPageUrl] = useState(typeof document !== "undefined" ? document.referrer || window.location.href : "");
  const [browserOs, setBrowserOs] = useState(detectBrowserOs());
  const [useCase, setUseCase] = useState("");
  const [brokerPriority, setBrokerPriority] = useState<string>("");
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const submit = useMutation({
    mutationFn: async () => {
      const payload: any = {
        type,
        subject,
        description,
        pageUrl,
        browserOs,
        sessionActivity: getSessionActivity(),
        attachmentObjectPaths: files,
      };
      if (type === "help") payload.category = category || null;
      if (type === "bug") {
        payload.severity = severity || null;
        payload.stepsToReproduce = steps || null;
        payload.expectedBehavior = expected || null;
        payload.actualBehavior = actual || null;
      }
      if (type === "feature") {
        payload.useCase = useCase || null;
        payload.brokerPriority = brokerPriority || null;
      }
      const res = await apiRequest("POST", "/api/support/tickets", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      onCreated(data.ticket.id);
    },
    onError: (e: any) => toast({ title: "Failed to submit", description: e?.message || "Try again.", variant: "destructive" }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 2 || description.trim().length < 2) {
      toast({ title: "Subject and description are required", variant: "destructive" });
      return;
    }
    if (type === "feature" && !useCase.trim()) {
      toast({ title: "Use case is required for feature requests", variant: "destructive" });
      return;
    }
    submit.mutate();
  };

  const titleByType = type === "help" ? "Help Question" : type === "bug" ? "Bug Report" : "Feature Request";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-2xl">{titleByType}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="btn-back-to-types"><ArrowLeft className="h-4 w-4 mr-1" /> Pick another type</Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5" data-testid="form-new-ticket">
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={e => setSubject(e.target.value)} required data-testid="input-subject" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={5} required data-testid="input-description" />
          </div>

          {type === "help" && (
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-category"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>{HELP_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {type === "bug" && (
            <>
              <div>
                <Label>Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger data-testid="select-severity"><SelectValue placeholder="How bad is it?" /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="steps">Steps to reproduce</Label>
                <Textarea id="steps" value={steps} onChange={e => setSteps(e.target.value)} rows={3} placeholder="1. Go to...&#10;2. Click...&#10;3. Notice that..." data-testid="input-steps" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expected">Expected behavior</Label>
                  <Textarea id="expected" value={expected} onChange={e => setExpected(e.target.value)} rows={2} data-testid="input-expected" />
                </div>
                <div>
                  <Label htmlFor="actual">Actual behavior</Label>
                  <Textarea id="actual" value={actual} onChange={e => setActual(e.target.value)} rows={2} data-testid="input-actual" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="page-url">Page URL</Label>
                  <Input id="page-url" value={pageUrl} onChange={e => setPageUrl(e.target.value)} data-testid="input-page-url" />
                </div>
                <div>
                  <Label htmlFor="browser-os">Browser / OS</Label>
                  <Input id="browser-os" value={browserOs} onChange={e => setBrowserOs(e.target.value)} data-testid="input-browser-os" />
                </div>
              </div>
              <div className="rounded-md border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm flex items-center gap-2">
                <Camera className="h-4 w-4 text-amber-600" />
                A screenshot or short screen recording really helps us diagnose. Please attach one if you can.
              </div>
            </>
          )}

          {type === "feature" && (
            <>
              <div>
                <Label htmlFor="use-case">Use case <span className="text-destructive">*</span></Label>
                <Textarea id="use-case" value={useCase} onChange={e => setUseCase(e.target.value)} rows={3} placeholder="Describe the workflow this would unlock..." required data-testid="input-use-case" />
              </div>
              <div>
                <Label>Priority for you</Label>
                <Select value={brokerPriority} onValueChange={setBrokerPriority}>
                  <SelectTrigger data-testid="select-priority"><SelectValue placeholder="How important is this to you?" /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <Label>Attachments</Label>
            <FilePicker files={files} setFiles={setFiles} hint="Up to 10 files, 50 MB each. Images, PDFs, docs, video allowed." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} data-testid="btn-cancel-ticket">Cancel</Button>
            <Button type="submit" disabled={submit.isPending} data-testid="btn-submit-ticket">
              {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit ticket
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Confirmation({ ticketId, type, onAnother }: { ticketId: number; type: TicketType; onAnother: () => void }) {
  const expected = type === "help" ? "within 4 business hours" : type === "bug" ? "within 24 hours" : "within 5 business days";
  return (
    <Card data-testid="confirmation-card">
      <CardContent className="py-12 text-center">
        <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
        <h2 className="font-display text-2xl mb-2">Ticket #{ticketId} received</h2>
        <p className="text-muted-foreground mb-1">Thanks — we got your message.</p>
        <p className="text-muted-foreground mb-6">Our team will respond {expected}.</p>
        <div className="flex justify-center gap-2">
          <Link href={`/support/tickets/${ticketId}`}>
            <Button data-testid="btn-view-ticket">View this ticket</Button>
          </Link>
          <Button variant="outline" onClick={onAnother} data-testid="btn-create-another">Open another ticket</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MyTicketsList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const { data, isLoading } = useQuery<{ tickets: any[]; total: number }>({
    queryKey: ["/api/support/tickets", { search, status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/support/tickets?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search subject..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" data-testid="input-search" />
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[200px]" data-testid="select-status-filter"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : !data?.tickets?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground" data-testid="empty-tickets">
          <Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" />
          You haven't opened any tickets yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.tickets.map(t => (
            <Link key={t.id} href={`/support/tickets/${t.id}`}>
              <Card className="hover:border-primary cursor-pointer transition-colors" data-testid={`ticket-row-${t.id}`}>
                <CardContent className="py-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{TYPE_LABELS[t.type]}</Badge>
                      <Badge variant={t.status === "resolved" || t.status === "closed" ? "secondary" : "default"}>{STATUS_LABELS[t.status]}</Badge>
                      {t.severity && <Badge variant="outline" className="capitalize">{t.severity}</Badge>}
                    </div>
                    <div className="font-medium truncate">{t.subject}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    #{t.id} · {new Date(t.updatedAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SupportTicketsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"choose" | "form" | "confirm">("choose");
  const [type, setType] = useState<TicketType>("help");
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"new" | "list">("new");

  if (isLoading) return <div className="p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) {
    setLocation("/login");
    return null;
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <LifeBuoy className="h-7 w-7 text-primary" />
        <h1 className="font-display text-3xl">Get Help</h1>
      </div>
      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setView("choose"); setCreatedId(null); }}>
        <TabsList>
          <TabsTrigger value="new" data-testid="tab-new">Open a new ticket</TabsTrigger>
          <TabsTrigger value="list" data-testid="tab-my-tickets">My tickets</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="mt-6">
          {view === "choose" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">What do you need help with?</CardTitle>
                <CardDescription>Pick the type that best matches your request.</CardDescription>
              </CardHeader>
              <CardContent>
                <TypePicker onPick={(t) => { setType(t); setView("form"); }} />
              </CardContent>
            </Card>
          )}
          {view === "form" && (
            <TicketForm type={type} onCancel={() => setView("choose")} onCreated={(id) => { setCreatedId(id); setView("confirm"); }} />
          )}
          {view === "confirm" && createdId && (
            <Confirmation ticketId={createdId} type={type} onAnother={() => { setCreatedId(null); setView("choose"); }} />
          )}
        </TabsContent>
        <TabsContent value="list" className="mt-6">
          <MyTicketsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

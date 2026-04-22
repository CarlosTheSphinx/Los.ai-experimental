import { useState, useRef } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Paperclip, Upload, X, Archive, Mail } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In progress", waiting_on_broker: "Waiting on broker", resolved: "Resolved", closed: "Closed",
};
const TYPE_LABELS: Record<string, string> = { help: "Help", bug: "Bug", feature: "Feature" };
const SEVERITIES = ["blocker", "major", "minor", "cosmetic"];

interface UploadedFile { objectPath: string; fileName: string; mimeType: string; sizeBytes: number; }

async function uploadFile(file: File): Promise<UploadedFile> {
  const signRes = await apiRequest("POST", "/api/support/uploads/sign", {
    fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size,
  });
  const { uploadURL, useDirectUpload, objectPath } = await signRes.json();
  if (useDirectUpload) {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(uploadURL, { method: "POST", body: fd, credentials: "include" });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return { objectPath: data.objectPath, fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.fileSize };
  }
  const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!put.ok) throw new Error("Upload failed");
  return { objectPath, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
}

function AttachmentChip({ a }: { a: any }) {
  const isImage = a.mimeType?.startsWith("image/");
  const isPdf = a.mimeType === "application/pdf";
  const url = `/api/support/attachments/${a.id}/download`;
  return (
    <div className="rounded border bg-muted/30 p-2 flex items-center gap-2 text-sm" data-testid={`attachment-${a.id}`}>
      {isImage ? <img src={url} alt={a.fileName} className="h-12 w-12 object-cover rounded" />
        : isPdf ? <span className="h-12 w-12 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-300">PDF</span>
        : <Paperclip className="h-4 w-4 text-muted-foreground" />}
      <a href={`${url}?download=true`} className="hover:underline truncate flex-1">{a.fileName}</a>
      <span className="text-xs text-muted-foreground">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
    </div>
  );
}

export default function AdminTicketDetailPage() {
  const [, params] = useRoute("/admin/tickets/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/support/tickets", id],
    queryFn: async () => { const r = await fetch(`/api/support/tickets/${id}`, { credentials: "include" }); if (!r.ok) throw new Error("Not found"); return r.json(); },
    enabled: !!id,
  });

  const sendReply = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/support/tickets/${id}/messages`, { body: reply, attachmentObjectPaths: files }),
    onSuccess: () => { setReply(""); setFiles([]); queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", id] }); },
    onError: () => toast({ title: "Failed to send reply", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async (patch: any) => apiRequest("PATCH", `/api/support/tickets/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", id] }),
  });

  const archive = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/support/tickets/${id}`, { archivedByAdmin: true }),
    onSuccess: () => { toast({ title: "Ticket archived" }); queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] }); },
  });

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    setUploading(true);
    try {
      const out: UploadedFile[] = [];
      for (const f of picked) {
        if (f.size > 50 * 1024 * 1024) { toast({ title: `${f.name} too large`, variant: "destructive" }); continue; }
        try { out.push(await uploadFile(f)); } catch { toast({ title: `Upload failed: ${f.name}`, variant: "destructive" }); }
      }
      setFiles([...files, ...out]);
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  if (isLoading) return <div className="p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data?.ticket) return <div className="p-8 text-center text-muted-foreground">Ticket not found.</div>;

  const t = data.ticket;
  const ticketAtts = (data.attachments || []).filter((a: any) => a.ticketId === t.id);
  const msgAttsMap: Record<number, any[]> = {};
  for (const a of (data.attachments || [])) {
    if (a.messageId) (msgAttsMap[a.messageId] = msgAttsMap[a.messageId] || []).push(a);
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4">
      <Link href="/admin/tickets">
        <Button variant="ghost" size="sm" data-testid="btn-back-to-list"><ArrowLeft className="h-4 w-4 mr-1" /> Back to tickets</Button>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="outline">{TYPE_LABELS[t.type]}</Badge>
                    <Badge>{STATUS_LABELS[t.status]}</Badge>
                    {t.severity && <Badge variant="outline" className="capitalize">{t.severity}</Badge>}
                    <span className="text-xs text-muted-foreground">#{t.id}</span>
                  </div>
                  <CardTitle className="font-display text-xl" data-testid="text-ticket-subject">{t.subject}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Opened {new Date(t.createdAt).toLocaleString()}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => archive.mutate()} data-testid="btn-archive">
                  <Archive className="h-4 w-4 mr-1" /> Archive
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="whitespace-pre-wrap text-sm" data-testid="text-description">{t.description}</div>
              {t.type === "bug" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm pt-3 border-t">
                  {t.stepsToReproduce && <div><div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Steps to reproduce</div><div className="whitespace-pre-wrap">{t.stepsToReproduce}</div></div>}
                  {t.expectedBehavior && <div><div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Expected</div><div className="whitespace-pre-wrap">{t.expectedBehavior}</div></div>}
                  {t.actualBehavior && <div><div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Actual</div><div className="whitespace-pre-wrap">{t.actualBehavior}</div></div>}
                </div>
              )}
              {t.type === "feature" && t.useCase && (
                <div className="pt-3 border-t">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Use case</div>
                  <div className="text-sm whitespace-pre-wrap">{t.useCase}</div>
                </div>
              )}
              {t.type === "help" && t.category && (
                <div className="text-xs text-muted-foreground">Category: <span className="capitalize">{t.category.replace(/_/g, " ")}</span></div>
              )}
              {ticketAtts.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 mt-3">Attachments</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ticketAtts.map((a: any) => <AttachmentChip key={a.id} a={a} />)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {(data.messages || []).map((m: any) => (
              <Card key={m.id} className={m.authorRole === "admin" ? "border-primary/30 bg-primary/5" : ""} data-testid={`message-${m.id}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">{m.author?.fullName || m.author?.email || (m.authorRole === "admin" ? "Lendry Support" : "Broker")}</div>
                    <div className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                  {msgAttsMap[m.id]?.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      {msgAttsMap[m.id].map((a: any) => <AttachmentChip key={a.id} a={a} />)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Reply</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={reply} onChange={e => setReply(e.target.value)} rows={4} placeholder="Reply to the broker..." data-testid="input-reply" />
              <input ref={fileRef} type="file" multiple className="hidden" onChange={onPickFiles} />
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="btn-attach">
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Attach
                </Button>
                {files.map((f, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded bg-muted flex items-center gap-1">{f.fileName}
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <div className="flex-1" />
                <Button onClick={() => sendReply.mutate()} disabled={!reply.trim() || sendReply.isPending} data-testid="btn-send-reply">
                  {sendReply.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Send reply
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                <Select value={t.status} onValueChange={(v) => update.mutate({ status: v })}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Severity</div>
                <Select value={t.severity || "none"} onValueChange={(v) => update.mutate({ severity: v === "none" ? null : v })}>
                  <SelectTrigger data-testid="select-severity"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Submitter</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="font-medium">{t.submitter?.fullName || "—"}</div>
              {t.submitter?.email && (
                <a href={`mailto:${t.submitter.email}`} className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {t.submitter.email}
                </a>
              )}
              {t.submitter?.role && <div className="text-xs text-muted-foreground capitalize">Role: {t.submitter.role}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Context</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              {t.pageUrl && <div><div className="uppercase tracking-wider mb-0.5">Page URL</div><div className="break-all text-foreground/80">{t.pageUrl}</div></div>}
              {t.browserOs && <div><div className="uppercase tracking-wider mb-0.5">Browser / OS</div><div className="text-foreground/80">{t.browserOs}</div></div>}
              {Array.isArray(t.sessionActivity) && t.sessionActivity.length > 0 && (
                <div>
                  <div className="uppercase tracking-wider mb-0.5">Recent activity</div>
                  <ul className="space-y-0.5 text-foreground/80">{t.sessionActivity.map((a: any, i: number) => <li key={i} className="truncate">{a.path || JSON.stringify(a)}</li>)}</ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, History, Tag, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface CommsTemplate {
  id: number;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  version: number;
  supersedesId: number | null;
  isActive: boolean;
  createdAt: string;
}

interface MergeTag {
  id: number;
  key: string;
  description: string;
}

interface TemplateFormData {
  name: string;
  channel: string;
  subject: string | null;
  body: string;
}

function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, string> = {
    email: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    sms: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    in_app: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  };
  const labels: Record<string, string> = { email: "Email", sms: "SMS", in_app: "In-App" };
  return <Badge className={map[channel] || ""}>{labels[channel] || channel}</Badge>;
}

function MergeTagPicker({
  tags,
  onInsert,
}: {
  tags: MergeTag[];
  onInsert: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid="button-merge-tag-picker">
          <Tag className="h-3 w-3 mr-1" />
          Insert Tag
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tags..." />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {tags.map(tag => (
                <CommandItem
                  key={tag.id}
                  value={tag.key}
                  onSelect={() => {
                    onInsert(`{{${tag.key}}}`);
                    setOpen(false);
                  }}
                  data-testid={`merge-tag-${tag.id}`}
                >
                  <div>
                    <div className="font-mono text-sm">{`{{${tag.key}}}`}</div>
                    <div className="text-xs text-muted-foreground">{tag.description}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TemplateForm({
  initial,
  tags,
  onSave,
  onCancel,
  isSaving,
}: {
  initial?: Partial<CommsTemplate>;
  tags: MergeTag[];
  onSave: (data: TemplateFormData) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [channel, setChannel] = useState(initial?.channel || "email");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [body, setBody] = useState(initial?.body || "");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const [lastFocused, setLastFocused] = useState<"body" | "subject">("body");

  const insertAtCursor = (tag: string) => {
    if (lastFocused === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const newVal = subject.slice(0, start) + tag + subject.slice(end);
      setSubject(newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const newVal = body.slice(0, start) + tag + body.slice(end);
      setBody(newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, channel, subject: channel === "email" ? subject : null, body });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="template-name">Template Name</Label>
        <Input
          id="template-name"
          data-testid="input-template-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Document Request Reminder"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="template-channel">Channel</Label>
        <Select
          value={channel}
          onValueChange={setChannel}
          disabled={!!initial?.id}
        >
          <SelectTrigger id="template-channel" data-testid="select-template-channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="in_app">In-App</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {channel === "email" && (
        <div className="space-y-2">
          <Label htmlFor="template-subject">Subject Line</Label>
          <Input
            id="template-subject"
            data-testid="input-template-subject"
            ref={subjectRef}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            onFocus={() => setLastFocused("subject")}
            placeholder="Loan Update: {{loan.number}}"
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="template-body">
            {channel === "email" ? "Email Body (HTML)" : channel === "sms" ? "SMS Message" : "Notification Message"}
          </Label>
          <MergeTagPicker tags={tags} onInsert={insertAtCursor} />
        </div>
        <Textarea
          id="template-body"
          data-testid="input-template-body"
          ref={bodyRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onFocus={() => setLastFocused("body")}
          placeholder={
            channel === "email"
              ? "<p>Hello {{recipient.first_name}},</p>\n<p>Your loan at {{loan.address}} needs your attention.</p>"
              : channel === "sms"
              ? "Hi {{recipient.first_name}}, action needed on your loan at {{loan.address}}."
              : "You have an update on loan {{loan.number}}."
          }
          rows={channel === "email" ? 10 : 5}
          required
        />
        {channel === "sms" && (
          <p className="text-xs text-muted-foreground">
            {body.length} characters · {body.length > 160 ? `${Math.ceil(body.length / 153)} SMS segments` : "1 SMS segment"}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
        <Button type="submit" disabled={isSaving} data-testid="button-save-template">
          {isSaving ? "Saving..." : initial?.id ? "Save New Version" : "Create Template"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function CommsTemplatesPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CommsTemplate | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<CommsTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: templates = [], isLoading } = useQuery<CommsTemplate[]>({
    queryKey: ["/api/comms/templates"],
  });

  const { data: tags = [] } = useQuery<MergeTag[]>({
    queryKey: ["/api/comms/merge-tags"],
  });

  const { data: history = [] } = useQuery<CommsTemplate[]>({
    queryKey: ["/api/comms/templates", historyTemplate?.id, "history"],
    queryFn: async () => {
      if (!historyTemplate) return [];
      const res = await apiRequest("GET", `/api/comms/templates/${historyTemplate.id}/history`);
      return res.json();
    },
    enabled: !!historyTemplate,
  });

  const createMutation = useMutation({
    mutationFn: (data: TemplateFormData) => apiRequest("POST", "/api/comms/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/templates"] });
      setShowCreate(false);
      toast({ title: "Template created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: TemplateFormData }) =>
      apiRequest("PUT", `/api/comms/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/templates"] });
      setEditing(null);
      toast({ title: "Template updated (new version saved)" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/comms/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/templates"] });
      setDeletingId(null);
      toast({ title: "Template archived" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = templates.filter(t => {
    const matchChannel = channelFilter === "all" || t.channel === channelFilter;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchChannel && matchSearch;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Template Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage versioned message templates for email, SMS, and in-app notifications.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-template">
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-9"
            data-testid="input-search-templates"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-36" data-testid="select-channel-filter">
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

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading templates...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No templates found. Create your first template to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(t => (
            <Card key={t.id} data-testid={`card-template-${t.id}`}>
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelBadge channel={t.channel} />
                  <div className="min-w-0">
                    <p className="font-medium truncate" data-testid={`text-template-name-${t.id}`}>{t.name}</p>
                    {t.subject && (
                      <p className="text-xs text-muted-foreground truncate">Subject: {t.subject}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">v{t.version}</Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setHistoryTemplate(t)} data-testid={`button-history-${t.id}`}>
                    <History className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(t)} data-testid={`button-edit-template-${t.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeletingId(t.id)} data-testid={`button-delete-template-${t.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <TemplateForm
            tags={tags}
            onSave={data => createMutation.mutate(data)}
            onCancel={() => setShowCreate(false)}
            isSaving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          {editing && (
            <TemplateForm
              initial={editing}
              tags={tags}
              onSave={data => updateMutation.mutate({ id: editing.id, data })}
              onCancel={() => setEditing(null)}
              isSaving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={!!historyTemplate} onOpenChange={v => !v && setHistoryTemplate(null)}>
        <SheetContent className="w-[500px]">
          <SheetHeader>
            <SheetTitle>Version History: {historyTemplate?.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No version history available.</p>
            ) : (
              history.map(h => (
                <Card key={h.id} data-testid={`history-version-${h.version}`}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline">v{h.version}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {h.subject && (
                      <p className="text-xs text-muted-foreground mb-1">Subject: {h.subject}</p>
                    )}
                    <p className="text-sm line-clamp-3 font-mono text-xs bg-muted p-2 rounded">
                      {h.body}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={deletingId !== null} onOpenChange={v => !v && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will archive the template so it no longer appears in the active list.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              data-testid="button-confirm-archive"
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

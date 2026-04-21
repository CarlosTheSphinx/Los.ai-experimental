import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Send, Mail, MessageSquare, Bell, CheckCircle, Clock, AlertCircle } from "lucide-react";
import CommsSendPage from "./send";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CommsSegment {
  id: number;
  name: string;
  filterConfig: { audience: string; filters: { type: string }[] } | null;
}
interface CommsTemplate {
  id: number;
  name: string;
  channel: "email" | "sms" | "in_app";
  subject: string | null;
  body: string;
}
interface PreviewResult {
  resolvedBody: string;
  resolvedSubject: string | null;
  resolvedMergeTags: Record<string, string>;
  isOptedOut: boolean;
  channel: "email" | "sms" | "in_app";
}
interface BatchRow {
  batch_id: string;
  template_id: number;
  scheduled_for: string;
  created_at: string;
  total: number;
  pending: number;
  done: number;
  failed: number;
}

const CHANNEL_ICON = { email: Mail, sms: MessageSquare, in_app: Bell } as const;

export default function CommsBatchSendPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [segmentId, setSegmentId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [show1to1, setShow1to1] = useState(false);

  const { data: segments = [] } = useQuery<CommsSegment[]>({ queryKey: ["/api/comms/segments"] });
  const { data: templates = [] } = useQuery<CommsTemplate[]>({ queryKey: ["/api/comms/templates"] });
  const { data: batches = [] } = useQuery<BatchRow[]>({ queryKey: ["/api/comms/batches"] });

  const segment = segments.find(s => String(s.id) === segmentId);
  const template = templates.find(t => String(t.id) === templateId);

  const previewQuery = useQuery<{ count: number; sample: { id: number; fullName: string | null; email: string }[] }>({
    queryKey: ["/api/comms/segments/preview", segmentId],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/comms/segments/preview", { segmentId: parseInt(segmentId) });
      return res.json();
    },
    enabled: !!segmentId && step >= 3,
  });

  const sampleRecipientId = previewQuery.data?.sample?.[0]?.id;

  const messagePreviewQuery = useQuery<PreviewResult>({
    queryKey: ["/api/comms/templates/preview", templateId, sampleRecipientId],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/comms/templates/${templateId}/preview`, {
        recipientId: sampleRecipientId,
      });
      return res.json();
    },
    enabled: !!templateId && !!sampleRecipientId && step >= 3,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        segmentId: parseInt(segmentId),
        templateId: parseInt(templateId),
      };
      if (scheduleEnabled && scheduleAt) {
        body.scheduledFor = new Date(scheduleAt).toISOString();
      }
      const res = await apiRequest("POST", "/api/comms/batch-send", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/comms/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/comms/send-log"] });
      toast({
        title: scheduleEnabled ? "Batch scheduled" : "Batch dispatched",
        description: `${data.queued} message(s) queued${data.dispatchedNow ? ` · ${data.dispatchedNow} sent immediately` : ""}.`,
      });
      // Reset wizard
      setStep(1);
      setSegmentId("");
      setTemplateId("");
      setScheduleEnabled(false);
      setScheduleAt("");
    },
    onError: (err: Error) => toast({ title: "Send failed", description: err.message, variant: "destructive" }),
  });

  const audienceFilteredTemplates = useMemo(() => {
    // No strict channel filtering by audience yet; show all active templates
    return templates;
  }, [templates]);

  const canAdvance: Record<typeof step, boolean> = useMemo(() => ({
    1: !!segmentId,
    2: !!templateId,
    3: true,
    4: !!segmentId && !!templateId && (!scheduleEnabled || !!scheduleAt),
  }), [segmentId, templateId, scheduleEnabled, scheduleAt]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-batch-title">Batch send</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a segment, choose a template, preview, and send (or schedule) the message.
          </p>
        </div>
        <Button variant="outline" onClick={() => setShow1to1(true)} data-testid="button-send-single">
          <Send className="h-4 w-4 mr-2" />
          Send single message
        </Button>
      </div>

      {/* Wizard step indicators */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => n < step && setStep(n as 1 | 2 | 3 | 4)}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                n === step ? "bg-primary text-primary-foreground" :
                n < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              }`}
              data-testid={`step-indicator-${n}`}
            >
              {n}
            </button>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {n === 1 ? "Segment" : n === 2 ? "Template" : n === 3 ? "Preview" : "Confirm"}
            </span>
            {n < 4 && <div className="flex-1 h-px bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <Label>Choose segment</Label>
              <Select value={segmentId} onValueChange={setSegmentId}>
                <SelectTrigger data-testid="select-batch-segment">
                  <SelectValue placeholder="Select an audience segment..." />
                </SelectTrigger>
                <SelectContent>
                  {segments.length === 0 && <SelectItem value="__none" disabled>No segments yet — create one first</SelectItem>}
                  {segments.map(s => (
                    <SelectItem key={s.id} value={String(s.id)} data-testid={`batch-segment-option-${s.id}`}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {segment && (
                <div className="text-xs text-muted-foreground">
                  Audience: <strong>{segment.filterConfig?.audience}</strong> · {segment.filterConfig?.filters?.length || 0} filters
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Label>Choose template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger data-testid="select-batch-template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {audienceFilteredTemplates.length === 0 && <SelectItem value="__none" disabled>No templates available</SelectItem>}
                  {audienceFilteredTemplates.map(t => {
                    const Icon = CHANNEL_ICON[t.channel];
                    return (
                      <SelectItem key={t.id} value={String(t.id)} data-testid={`batch-template-option-${t.id}`}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-3 w-3" />
                          <span>{t.name}</span>
                          <Badge variant="outline" className="text-xs ml-2">{t.channel}</Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label>Audience size</Label>
                <Card>
                  <CardContent className="pt-5">
                    {previewQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Counting recipients...</p>
                    ) : previewQuery.data ? (
                      <>
                        <p className="text-3xl font-semibold" data-testid="text-batch-recipient-count">
                          {previewQuery.data.count}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">recipients matched</p>
                        {previewQuery.data.sample.length > 0 && (
                          <div className="mt-3 max-h-32 overflow-y-auto border rounded divide-y text-xs">
                            {previewQuery.data.sample.slice(0, 5).map(r => (
                              <div key={r.id} className="px-2 py-1">
                                {r.fullName || r.email} <span className="text-muted-foreground">— {r.email}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-3">
                <Label>Sample message preview</Label>
                <Card>
                  <CardContent className="pt-5">
                    {messagePreviewQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading preview...</p>
                    ) : messagePreviewQuery.data ? (
                      <div className="space-y-2">
                        {messagePreviewQuery.data.resolvedSubject && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Subject</Label>
                            <p className="text-sm font-medium">{messagePreviewQuery.data.resolvedSubject}</p>
                          </div>
                        )}
                        <Separator />
                        {template?.channel === "email" ? (
                          <div
                            className="text-sm border rounded p-2 max-h-48 overflow-y-auto"
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(messagePreviewQuery.data.resolvedBody, {
                                ALLOWED_TAGS: ["p","br","strong","em","b","i","u","a","span","div","h1","h2","h3","h4","ul","ol","li"],
                                ALLOWED_ATTR: ["href","class","style"],
                              }),
                            }}
                            data-testid="text-batch-preview-body"
                          />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap border rounded p-2 max-h-48 overflow-y-auto" data-testid="text-batch-preview-body">
                            {messagePreviewQuery.data.resolvedBody}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {sampleRecipientId ? "Loading preview..." : "No sample recipient available."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You're about to send <strong>{template?.name}</strong> to <strong>{previewQuery.data?.count ?? "?"}</strong> recipients
                  in segment <strong>{segment?.name}</strong>. Opted-out recipients will be skipped automatically.
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="schedule-toggle">Schedule for later</Label>
                  <p className="text-xs text-muted-foreground">
                    Off = send immediately. On = queue for the worker to dispatch at the chosen time.
                  </p>
                </div>
                <Switch
                  id="schedule-toggle"
                  checked={scheduleEnabled}
                  onCheckedChange={setScheduleEnabled}
                  data-testid="switch-schedule"
                />
              </div>

              {scheduleEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="schedule-at">Send at</Label>
                  <Input
                    id="schedule-at"
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={e => setScheduleAt(e.target.value)}
                    data-testid="input-schedule-at"
                  />
                </div>
              )}
            </div>
          )}

          <Separator />

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}
              disabled={step === 1}
              data-testid="button-batch-back"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            {step < 4 ? (
              <Button
                onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                disabled={!canAdvance[step]}
                data-testid="button-batch-next"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={!canAdvance[4] || sendMutation.isPending}
                data-testid="button-batch-confirm"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMutation.isPending ? "Sending..." : scheduleEnabled ? "Schedule batch" : "Send now"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-base font-semibold mb-2">Recent batches</h3>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No batches sent yet.</p>
        ) : (
          <div className="grid gap-2">
            {batches.map(b => {
              const tpl = templates.find(t => t.id === b.template_id);
              return (
                <Card key={b.batch_id} data-testid={`card-batch-${b.batch_id}`}>
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{tpl?.name || `Template #${b.template_id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(b.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1"><Send className="h-3 w-3" /> {b.total}</span>
                      {Number(b.done) > 0 && <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" /> {b.done}</span>}
                      {Number(b.pending) > 0 && <span className="flex items-center gap-1 text-amber-600"><Clock className="h-3 w-3" /> {b.pending}</span>}
                      {Number(b.failed) > 0 && <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> {b.failed}</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={show1to1} onOpenChange={setShow1to1}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Send single message</DialogTitle></DialogHeader>
          <CommsSendPage />
        </DialogContent>
      </Dialog>
    </div>
  );
}

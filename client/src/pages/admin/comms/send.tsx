import { useState } from "react";
import DOMPurify from "dompurify";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Send, Search, Eye, AlertTriangle, CheckCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CommsTemplate {
  id: number;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
}

interface Recipient {
  id: number;
  fullName: string | null;
  email: string;
  phone: string | null;
  role: string;
  companyName: string | null;
}

interface Project {
  id: number;
  projectName: string;
  loanNumber: string | null;
  propertyAddress: string | null;
}

interface PreviewResult {
  resolvedBody: string;
  resolvedSubject: string | null;
  resolvedMergeTags: Record<string, string>;
  isOptedOut: boolean;
  channel: 'email' | 'sms' | 'in_app';
}

function ChannelLabel({ channel }: { channel: string }) {
  const map: Record<string, string> = { email: "Email", sms: "SMS", in_app: "In-App" };
  const colors: Record<string, string> = {
    email: "bg-blue-100 text-blue-800",
    sms: "bg-green-100 text-green-800",
    in_app: "bg-purple-100 text-purple-800",
  };
  return <Badge className={colors[channel] || ""}>{map[channel] || channel}</Badge>;
}

export default function CommsSendPage() {
  const { toast } = useToast();
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedLoanId, setSelectedLoanId] = useState<string>("none");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [sendResult, setSendResult] = useState<{ status: string; error?: string } | null>(null);

  const { data: templates = [] } = useQuery<CommsTemplate[]>({
    queryKey: ["/api/comms/templates"],
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery<Recipient[]>({
    queryKey: ["/api/comms/recipients/search", recipientSearch],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/comms/recipients/search?q=${encodeURIComponent(recipientSearch)}`);
      return res.json();
    },
    enabled: recipientSearch.length >= 1,
  });

  const { data: loans = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/projects");
      return res.json();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error("No template selected");
      const loanIdNum = selectedLoanId && selectedLoanId !== "none" ? parseInt(selectedLoanId) : undefined;
      const res = await apiRequest("POST", `/api/comms/templates/${selectedTemplateId}/preview`, {
        recipientId: selectedRecipient?.id,
        loanId: loanIdNum,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPreview(data);
      setSendResult(null);
    },
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId || !selectedRecipient) throw new Error("Missing required fields");
      const template = templates.find(t => t.id === parseInt(selectedTemplateId));
      if (!template) throw new Error("Template not found");
      const recipientType = selectedRecipient.role === 'broker' ? 'broker' : 
                           selectedRecipient.role === 'borrower' ? 'borrower' : 'lender_user';
      const loanIdNum = selectedLoanId && selectedLoanId !== "none" ? parseInt(selectedLoanId) : undefined;
      const res = await apiRequest("POST", "/api/comms/send", {
        templateId: parseInt(selectedTemplateId),
        recipientType,
        recipientId: selectedRecipient.id,
        loanId: loanIdNum,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSendResult(data);
      if (data.success) {
        toast({ title: "Message sent successfully" });
      } else {
        toast({
          title: "Send failed",
          description: data.status === 'suppressed' ? "Recipient has opted out" : data.error,
          variant: "destructive"
        });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const selectedTemplate = templates.find(t => t.id === parseInt(selectedTemplateId));
  const canSend = !!selectedRecipient && !!selectedTemplateId;
  const canPreview = !!selectedTemplateId;

  const filteredRecipients = recipients.filter(r =>
    !recipientSearch || 
    (r.fullName || '').toLowerCase().includes(recipientSearch.toLowerCase()) ||
    r.email.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    (r.companyName || '').toLowerCase().includes(recipientSearch.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Manual Send</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Send a templated message to a single recipient with merge tags resolved in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Select Recipient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-9"
                  data-testid="input-recipient-search"
                  value={recipientSearch}
                  onChange={e => setRecipientSearch(e.target.value)}
                />
              </div>

              {selectedRecipient && (
                <div className="flex items-center justify-between bg-muted rounded-md p-3" data-testid="selected-recipient">
                  <div>
                    <p className="font-medium text-sm">{selectedRecipient.fullName || selectedRecipient.email}</p>
                    <p className="text-xs text-muted-foreground">{selectedRecipient.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedRecipient(null); setSendResult(null); setPreview(null); }}
                    data-testid="button-clear-recipient"
                  >
                    Clear
                  </Button>
                </div>
              )}

              {!selectedRecipient && filteredRecipients.length > 0 && (
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {filteredRecipients.slice(0, 10).map(r => (
                    <button
                      key={r.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                      onClick={() => { setSelectedRecipient(r); setSendResult(null); setPreview(null); }}
                      data-testid={`recipient-option-${r.id}`}
                    >
                      <p className="text-sm font-medium">{r.fullName || r.email}</p>
                      <p className="text-xs text-muted-foreground">{r.email} · {r.role}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Choose Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedTemplateId} onValueChange={v => { setSelectedTemplateId(v); setPreview(null); setSendResult(null); }}>
                <SelectTrigger data-testid="select-template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={String(t.id)} data-testid={`template-option-${t.id}`}>
                      <div className="flex items-center gap-2">
                        <ChannelLabel channel={t.channel} />
                        <span>{t.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTemplate && (
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  Channel: {selectedTemplate.channel}
                  {selectedTemplate.subject && ` · Subject: "${selectedTemplate.subject}"`}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Loan Context (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedLoanId} onValueChange={v => { setSelectedLoanId(v); setPreview(null); }}>
                <SelectTrigger data-testid="select-loan">
                  <SelectValue placeholder="No loan context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No loan context</SelectItem>
                  {loans.slice(0, 50).map((l: Project) => (
                    <SelectItem key={l.id} value={String(l.id)} data-testid={`loan-option-${l.id}`}>
                      {l.loanNumber || `Loan #${l.id}`} — {l.propertyAddress || l.projectName || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {preview?.isOptedOut && (
            <Alert variant="destructive" data-testid="alert-opted-out">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This recipient has opted out of {preview.channel === 'email' ? 'email' : preview.channel === 'sms' ? 'SMS' : 'in-app'} messages.
                Sending will be suppressed and logged.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={!canPreview || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
              data-testid="button-preview"
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button
              disabled={!canSend || sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
              data-testid="button-send"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? "Sending..." : "Send Now"}
            </Button>
          </div>

          {sendResult && (
            <Alert variant={sendResult.status === 'sent' ? 'default' : 'destructive'} data-testid="send-result">
              {sendResult.status === 'sent' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertDescription>
                {sendResult.status === 'sent' && "Message sent successfully."}
                {sendResult.status === 'suppressed' && "Recipient has opted out of this channel."}
                {sendResult.status === 'skipped' && `Skipped: ${sendResult.error}`}
                {sendResult.status === 'failed' && `Failed: ${sendResult.error}`}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {!preview && !previewMutation.isPending && (
                <div className="text-sm text-muted-foreground text-center py-12">
                  Select a template and click Preview to see the resolved message.
                </div>
              )}
              {previewMutation.isPending && (
                <div className="text-sm text-muted-foreground text-center py-12">Loading preview...</div>
              )}
              {preview && (
                <div className="space-y-3">
                  {preview.resolvedSubject && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Subject</Label>
                      <p className="text-sm font-medium mt-1" data-testid="preview-subject">{preview.resolvedSubject}</p>
                    </div>
                  )}
                  <Separator />
                  <div>
                    <Label className="text-xs text-muted-foreground">Body</Label>
                    {selectedTemplate?.channel === 'email' ? (
                      <div
                        className="mt-1 text-sm border rounded p-3 max-h-80 overflow-y-auto"
                        data-testid="preview-body"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(preview.resolvedBody, {
                            ALLOWED_TAGS: ["p","br","strong","em","b","i","u","a","span","div","h1","h2","h3","h4","ul","ol","li","table","thead","tbody","tr","th","td","img"],
                            ALLOWED_ATTR: ["href","src","alt","class","style","target","rel"],
                            ALLOW_DATA_ATTR: false,
                          })
                        }}
                      />
                    ) : (
                      <p className="mt-1 text-sm whitespace-pre-wrap border rounded p-3" data-testid="preview-body">
                        {preview.resolvedBody}
                      </p>
                    )}
                  </div>
                  {Object.keys(preview.resolvedMergeTags).length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Resolved Tags</Label>
                      <div className="mt-1 space-y-1">
                        {Object.entries(preview.resolvedMergeTags).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs">
                            <span className="font-mono text-muted-foreground">{`{{${k}}}`}</span>
                            <span>→</span>
                            <span>{v || "(empty)"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

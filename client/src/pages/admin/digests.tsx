import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CalendarDays, 
  Mail, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Send,
  Edit3,
  Check,
  X,
  Sparkles,
  Ban,
  Eye,
  Copy
} from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Draft {
  id: number;
  status: string;
  emailSubject: string | null;
  emailBody: string | null;
  smsBody: string | null;
  documentsCount: number;
  updatesCount: number;
  approvedBy: number | null;
  approvedAt: string | null;
  sentAt: string | null;
}

interface ScheduledDigest {
  configId: number;
  projectId: number | null;
  dealId: number | null;
  projectName: string;
  borrowerName: string | null;
  propertyAddress: string | null;
  frequency: string;
  timeOfDay: string;
  timezone: string;
  recipientCount: number;
  recipients: Array<{
    id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    deliveryMethod: string;
  }>;
  contentSettings: {
    includeDocumentsNeeded: boolean;
    includeNotes: boolean;
    includeMessages: boolean;
    includeGeneralUpdates: boolean;
  };
  defaultContent: {
    emailSubject: string | null;
    emailBody: string | null;
    smsBody: string | null;
  };
  draft: Draft | null;
  sentDigests: Array<{
    id: number;
    recipientAddress: string;
    deliveryMethod: string;
    status: string;
    documentsCount: number;
    updatesCount: number;
    sentAt: string;
    errorMessage: string | null;
  }>;
}

interface DigestsResponse {
  date: string;
  digests: ScheduledDigest[];
}

interface DigestTemplate {
  id: number;
  name: string;
  description: string | null;
  emailSubject: string;
  emailBody: string;
  smsBody: string | null;
  isDefault: boolean;
}

interface PreviewData {
  emailSubject: string;
  emailBody: string;
  smsBody: string;
}

export default function AdminDigests() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingDigest, setEditingDigest] = useState<ScheduledDigest | null>(null);
  const [editForm, setEditForm] = useState({
    emailSubject: "",
    emailBody: "",
    smsBody: "",
  });
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: templatesData } = useQuery<{ templates: DigestTemplate[] }>({
    queryKey: ["/api/admin/digest-templates"],
  });
  const templates = templatesData?.templates || [];

  const { data, isLoading, refetch } = useQuery<DigestsResponse>({
    queryKey: ["/api/admin/digests/scheduled", dateStr],
    queryFn: async () => {
      const response = await fetch(`/api/admin/digests/scheduled?date=${dateStr}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch digests');
      }
      return response.json();
    },
  });

  const generateDraftsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/admin/digests/generate-drafts', {
        method: 'POST',
        body: JSON.stringify({ date: dateStr }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data: any) => {
      toast({ title: "Drafts Generated", description: data.message });
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate drafts", variant: "destructive" });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ draftId, data }: { draftId: number; data: any }) => {
      return apiRequest(`/api/admin/digests/drafts/${draftId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({ title: "Draft Updated" });
      setEditingDigest(null);
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update draft", variant: "destructive" });
    },
  });

  const approveDraftMutation = useMutation({
    mutationFn: async (draftId: number) => {
      return apiRequest(`/api/admin/digests/drafts/${draftId}/approve`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: "Draft Approved", description: "Ready to send" });
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve draft", variant: "destructive" });
    },
  });

  const skipDraftMutation = useMutation({
    mutationFn: async (draftId: number) => {
      return apiRequest(`/api/admin/digests/drafts/${draftId}/skip`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: "Draft Skipped" });
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to skip draft", variant: "destructive" });
    },
  });

  const sendDraftMutation = useMutation({
    mutationFn: async (draftId: number) => {
      return apiRequest(`/api/admin/digests/drafts/${draftId}/send`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      toast({ title: "Digest Sent", description: data.message });
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send digest", variant: "destructive" });
    },
  });

  const digests = data?.digests || [];

  const stats = useMemo(() => {
    let drafts = 0, approved = 0, sent = 0, skipped = 0, noDraft = 0;
    digests.forEach(d => {
      if (!d.draft) noDraft++;
      else if (d.draft.status === 'draft') drafts++;
      else if (d.draft.status === 'approved') approved++;
      else if (d.draft.status === 'sent') sent++;
      else if (d.draft.status === 'skipped') skipped++;
    });
    return { drafts, approved, sent, skipped, noDraft, total: digests.length };
  }, [digests]);

  const goToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1));
  const goToNextDay = () => setSelectedDate(prev => addDays(prev, 1));
  const goToToday = () => setSelectedDate(new Date());

  const openEditDialog = (digest: ScheduledDigest) => {
    setEditingDigest(digest);
    setEditForm({
      emailSubject: digest.draft?.emailSubject || digest.defaultContent.emailSubject || "",
      emailBody: digest.draft?.emailBody || digest.defaultContent.emailBody || "",
      smsBody: digest.draft?.smsBody || digest.defaultContent.smsBody || "",
    });
    setPreviewData(null);
  };

  const applyTemplate = (templateId: string) => {
    if (templateId === "none") return;
    const template = templates.find(t => t.id === parseInt(templateId));
    if (template) {
      setEditForm({
        emailSubject: template.emailSubject,
        emailBody: template.emailBody,
        smsBody: template.smsBody || "",
      });
      toast({ title: "Template Applied", description: `Using "${template.name}" template` });
    }
  };

  const loadPreview = async () => {
    if (!editingDigest) return;
    
    setIsLoadingPreview(true);
    try {
      const response = await fetch('/api/admin/digest-templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          emailSubject: editForm.emailSubject,
          emailBody: editForm.emailBody,
          smsBody: editForm.smsBody,
          projectId: editingDigest.projectId,
          dealId: editingDigest.dealId,
          configId: editingDigest.configId,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setPreviewData(data.preview);
      } else {
        toast({ title: "Error", description: "Failed to load preview", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load preview", variant: "destructive" });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSaveEdit = () => {
    if (editingDigest?.draft) {
      updateDraftMutation.mutate({
        draftId: editingDigest.draft.id,
        data: editForm,
      });
    }
  };

  const getStatusBadge = (digest: ScheduledDigest) => {
    if (!digest.draft) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <AlertCircle className="h-3 w-3 mr-1" />
          No Draft
        </Badge>
      );
    }
    switch (digest.draft.status) {
      case 'draft':
        return (
          <Badge variant="secondary">
            <Edit3 className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      case 'approved':
        return (
          <Badge className="bg-green-600">
            <Check className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case 'sent':
        return (
          <Badge variant="default">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Sent
          </Badge>
        );
      case 'skipped':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Ban className="h-3 w-3 mr-1" />
            Skipped
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold" data-testid="text-admin-digests-title">Daily Digests</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => generateDraftsMutation.mutate()}
            disabled={generateDraftsMutation.isPending}
            data-testid="button-generate-drafts"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {generateDraftsMutation.isPending ? "Generating..." : "Generate Drafts"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-digests"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Select Date</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                className="rounded-md border"
                data-testid="calendar-digest-date"
              />
              <div className="flex items-center justify-between mt-3 gap-2">
                <Button variant="outline" size="sm" onClick={goToPreviousDay} data-testid="button-prev-day">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-today">
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={goToNextDay} data-testid="button-next-day">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Summary for {format(selectedDate, "MMM d, yyyy")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Scheduled</span>
                <Badge variant="outline">{stats.total}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Drafts</span>
                <Badge variant="secondary">{stats.drafts}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Approved</span>
                <Badge className="bg-green-600">{stats.approved}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sent</span>
                <Badge variant="default">{stats.sent}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Skipped</span>
                <Badge variant="outline">{stats.skipped}</Badge>
              </div>
              {stats.noDraft > 0 && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Need Drafts</span>
                  <Badge variant="outline" className="text-orange-600">{stats.noDraft}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Digests for {format(selectedDate, "EEEE, MMMM d, yyyy")}
            </CardTitle>
            <CardDescription>
              {digests.length === 0 
                ? "No digests scheduled for this day"
                : `${digests.length} digest${digests.length === 1 ? '' : 's'} scheduled - Review and approve before sending`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : digests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No digests scheduled for this day</p>
                <p className="text-sm mt-2">Digests are configured on individual project pages</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {digests.map((digest) => (
                    <div
                      key={digest.configId}
                      className="border rounded-lg p-4 space-y-3"
                      data-testid={`digest-card-${digest.configId}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{digest.projectName}</h3>
                          {digest.borrowerName && (
                            <p className="text-sm text-muted-foreground truncate">
                              Borrower: {digest.borrowerName}
                            </p>
                          )}
                          {digest.propertyAddress && (
                            <p className="text-sm text-muted-foreground truncate">
                              {digest.propertyAddress}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getStatusBadge(digest)}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {digest.timeOfDay}
                        </div>
                        <div className="flex items-center gap-1">
                          {digest.recipients.some(r => r.deliveryMethod === 'email' || r.deliveryMethod === 'both') && (
                            <Mail className="h-4 w-4" />
                          )}
                          {digest.recipients.some(r => r.deliveryMethod === 'sms' || r.deliveryMethod === 'both') && (
                            <Phone className="h-4 w-4" />
                          )}
                          <span>{digest.recipientCount} recipient{digest.recipientCount === 1 ? '' : 's'}</span>
                        </div>
                        {digest.draft && (
                          <div className="flex items-center gap-1">
                            <FileText className="h-4 w-4" />
                            <span>{digest.draft.documentsCount} docs, {digest.draft.updatesCount} updates</span>
                          </div>
                        )}
                      </div>

                      {digest.draft && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                          {digest.draft.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(digest)}
                                data-testid={`button-edit-draft-${digest.configId}`}
                              >
                                <Edit3 className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => approveDraftMutation.mutate(digest.draft!.id)}
                                disabled={approveDraftMutation.isPending}
                                data-testid={`button-approve-draft-${digest.configId}`}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => skipDraftMutation.mutate(digest.draft!.id)}
                                disabled={skipDraftMutation.isPending}
                                data-testid={`button-skip-draft-${digest.configId}`}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Skip
                              </Button>
                            </>
                          )}
                          {digest.draft.status === 'approved' && (
                            <Button
                              size="sm"
                              onClick={() => sendDraftMutation.mutate(digest.draft!.id)}
                              disabled={sendDraftMutation.isPending}
                              data-testid={`button-send-draft-${digest.configId}`}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              {sendDraftMutation.isPending ? "Sending..." : "Send Now"}
                            </Button>
                          )}
                          {digest.draft.status === 'sent' && digest.draft.sentAt && (
                            <span className="text-sm text-muted-foreground">
                              Sent at {format(new Date(digest.draft.sentAt), "h:mm a")}
                            </span>
                          )}
                        </div>
                      )}

                      {!digest.draft && (
                        <div className="flex items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
                          <AlertCircle className="h-4 w-4" />
                          <span>Click "Generate Drafts" to create a draft for this digest</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editingDigest} onOpenChange={() => setEditingDigest(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Digest Draft</DialogTitle>
            <DialogDescription>
              {editingDigest?.projectName} - {format(selectedDate, "MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Label className="shrink-0">Apply Template:</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger className="w-[250px]" data-testid="select-template">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Select Template --</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name} {template.isDefault && "(Default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs defaultValue="edit" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit" data-testid="tab-edit">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" onClick={loadPreview} data-testid="tab-preview">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="emailSubject">Email Subject</Label>
                  <Input
                    id="emailSubject"
                    value={editForm.emailSubject}
                    onChange={(e) => setEditForm({ ...editForm, emailSubject: e.target.value })}
                    placeholder="Enter email subject..."
                    data-testid="input-draft-email-subject"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="emailBody">Email Body</Label>
                  <Textarea
                    id="emailBody"
                    value={editForm.emailBody}
                    onChange={(e) => setEditForm({ ...editForm, emailBody: e.target.value })}
                    placeholder="Enter email body..."
                    rows={10}
                    data-testid="input-draft-email-body"
                  />
                  <p className="text-xs text-muted-foreground">
                    Merge tags: {"{{recipientName}}"}, {"{{propertyAddress}}"}, {"{{documentsSection}}"}, {"{{updatesSection}}"}, {"{{documentsCount}}"}, {"{{portalLink}}"}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="smsBody">SMS Message</Label>
                  <Textarea
                    id="smsBody"
                    value={editForm.smsBody}
                    onChange={(e) => setEditForm({ ...editForm, smsBody: e.target.value })}
                    placeholder="Enter SMS message..."
                    rows={3}
                    data-testid="input-draft-sms-body"
                  />
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                {isLoadingPreview ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : previewData ? (
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 bg-background">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-muted-foreground">Email Subject</Label>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => navigator.clipboard.writeText(previewData.emailSubject)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="font-medium">{previewData.emailSubject}</p>
                    </div>
                    
                    <div className="border rounded-lg p-4 bg-background">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-muted-foreground">Email Body</Label>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => navigator.clipboard.writeText(previewData.emailBody)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <pre className="whitespace-pre-wrap text-sm font-sans">{previewData.emailBody}</pre>
                    </div>
                    
                    {previewData.smsBody && (
                      <div className="border rounded-lg p-4 bg-background">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-muted-foreground">SMS Message</Label>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(previewData.smsBody)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-sm">{previewData.smsBody}</p>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground text-center">
                      Preview uses real data from this project/deal to populate merge tags
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Click the Preview tab to see your message with real data</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {editingDigest && (
              <div className="border rounded-lg p-3 bg-muted/50">
                <h4 className="font-medium text-sm mb-2">Recipients ({editingDigest.recipients.length})</h4>
                <div className="space-y-1">
                  {editingDigest.recipients.map((r) => (
                    <div key={r.id} className="text-sm flex items-center gap-2">
                      {r.deliveryMethod === 'email' || r.deliveryMethod === 'both' ? <Mail className="h-3 w-3" /> : null}
                      {r.deliveryMethod === 'sms' || r.deliveryMethod === 'both' ? <Phone className="h-3 w-3" /> : null}
                      <span>{r.name || 'Unknown'}</span>
                      <span className="text-muted-foreground">({r.email || r.phone})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDigest(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateDraftMutation.isPending}
            >
              {updateDraftMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

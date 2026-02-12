import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  customDays: number | null;
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
  const [displayMonth, setDisplayMonth] = useState<Date>(new Date());
  const [editingDigest, setEditingDigest] = useState<ScheduledDigest | null>(null);
  const [editForm, setEditForm] = useState({
    emailSubject: "",
    emailBody: "",
    smsBody: "",
    frequency: "daily",
    customDays: 2,
    timeOfDay: "09:00",
  });
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<number>>(new Set());

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
      return apiRequest('POST', '/api/admin/digests/generate-drafts', { date: dateStr });
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
      return apiRequest('PUT', `/api/admin/digests/drafts/${draftId}`, data);
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
      return apiRequest('POST', `/api/admin/digests/drafts/${draftId}/approve`);
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
      return apiRequest('POST', `/api/admin/digests/drafts/${draftId}/skip`);
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
      return apiRequest('POST', `/api/admin/digests/drafts/${draftId}/send`);
    },
    onSuccess: (data: any) => {
      toast({ title: "Digest Sent", description: data.message });
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send digest", variant: "destructive" });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; emailSubject: string; emailBody: string; smsBody: string }) => {
      return apiRequest('POST', '/api/admin/digest-templates', {
        name: data.name,
        emailSubject: data.emailSubject,
        emailBody: data.emailBody,
        smsBody: data.smsBody,
        isDefault: false,
      });
    },
    onSuccess: () => {
      toast({ title: "Template Saved", description: "Your message has been saved as a template" });
      setShowSaveTemplateDialog(false);
      setNewTemplateName("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/digest-templates"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (draftIds: number[]) => {
      return apiRequest('POST', '/api/admin/digests/drafts/bulk-approve', { draftIds });
    },
    onSuccess: (data: any) => {
      toast({ title: "Drafts Approved", description: `${data.count} draft(s) approved` });
      setSelectedDraftIds(new Set());
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve drafts", variant: "destructive" });
    },
  });

  const bulkSkipMutation = useMutation({
    mutationFn: async (draftIds: number[]) => {
      return apiRequest('POST', '/api/admin/digests/drafts/bulk-skip', { draftIds });
    },
    onSuccess: (data: any) => {
      toast({ title: "Drafts Skipped", description: `${data.count} draft(s) skipped` });
      setSelectedDraftIds(new Set());
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to skip drafts", variant: "destructive" });
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

  const goToPreviousDay = () => {
    const newDate = subDays(selectedDate, 1);
    setSelectedDate(newDate);
    setDisplayMonth(newDate);
    setSelectedDraftIds(new Set());
  };
  const goToNextDay = () => {
    const newDate = addDays(selectedDate, 1);
    setSelectedDate(newDate);
    setDisplayMonth(newDate);
    setSelectedDraftIds(new Set());
  };
  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setDisplayMonth(today);
    setSelectedDraftIds(new Set());
  };

  // Get all draft digests that can be approved (status === 'draft')
  const approvableDrafts = useMemo(() => {
    return digests.filter(d => d.draft && d.draft.status === 'draft').map(d => d.draft!.id);
  }, [digests]);

  const toggleDraftSelection = (draftId: number) => {
    setSelectedDraftIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(draftId)) {
        newSet.delete(draftId);
      } else {
        newSet.add(draftId);
      }
      return newSet;
    });
  };

  const selectAllDrafts = () => {
    setSelectedDraftIds(new Set(approvableDrafts));
  };

  const clearSelection = () => {
    setSelectedDraftIds(new Set());
  };

  const openEditDialog = (digest: ScheduledDigest) => {
    setEditingDigest(digest);
    
    // Use the draft content if it exists, otherwise use the default template
    const defaultTemplate = templates.find(t => t.isDefault);
    
    const baseForm = {
      frequency: digest.frequency || "daily",
      customDays: digest.customDays || 2,
      timeOfDay: digest.timeOfDay || "09:00",
    };
    
    if (digest.draft?.emailSubject || digest.draft?.emailBody) {
      // Use existing draft content
      setEditForm({
        ...baseForm,
        emailSubject: digest.draft.emailSubject || "",
        emailBody: digest.draft.emailBody || "",
        smsBody: digest.draft.smsBody || "",
      });
    } else if (defaultTemplate) {
      // Use default template
      setEditForm({
        ...baseForm,
        emailSubject: defaultTemplate.emailSubject,
        emailBody: defaultTemplate.emailBody,
        smsBody: defaultTemplate.smsBody || "",
      });
    } else {
      // Fallback to config defaults
      setEditForm({
        ...baseForm,
        emailSubject: digest.defaultContent.emailSubject || "",
        emailBody: digest.defaultContent.emailBody || "",
        smsBody: digest.defaultContent.smsBody || "",
      });
    }
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
        data: {
          ...editForm,
          configId: editingDigest.configId,
        },
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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-2 md:gap-3 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <CalendarDays className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground shrink-0" />
          <h1 className="text-xl md:text-2xl font-semibold truncate" data-testid="text-admin-digests-title">Daily Digests</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          data-testid="button-refresh-digests"
          className="shrink-0"
        >
          <RefreshCw className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Refresh</span>
        </Button>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Select Date</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => { if (date) { setSelectedDate(date); setSelectedDraftIds(new Set()); } }}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
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
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <FileText className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
              <span className="truncate">Digests for {format(selectedDate, "MMM d, yyyy")}</span>
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {digests.length === 0 
                ? "No digests scheduled for this day"
                : `${digests.length} digest${digests.length === 1 ? '' : 's'} scheduled`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Bulk action bar */}
            {approvableDrafts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-muted/50 rounded-lg border" data-testid="bulk-action-bar">
                <div className="flex items-center gap-2 mr-4">
                  <Checkbox
                    id="select-all"
                    checked={selectedDraftIds.size === approvableDrafts.length && approvableDrafts.length > 0}
                    onCheckedChange={(checked) => checked ? selectAllDrafts() : clearSelection()}
                    data-testid="checkbox-select-all"
                  />
                  <label htmlFor="select-all" className="text-sm cursor-pointer">
                    {selectedDraftIds.size > 0 
                      ? `${selectedDraftIds.size} selected` 
                      : `Select all (${approvableDrafts.length})`}
                  </label>
                </div>
                <Button
                  size="sm"
                  onClick={() => bulkApproveMutation.mutate(approvableDrafts)}
                  disabled={bulkApproveMutation.isPending || approvableDrafts.length === 0}
                  data-testid="button-approve-all"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve All
                </Button>
                {selectedDraftIds.size > 0 && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => bulkApproveMutation.mutate(Array.from(selectedDraftIds))}
                      disabled={bulkApproveMutation.isPending}
                      data-testid="button-approve-selected"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkSkipMutation.mutate(Array.from(selectedDraftIds))}
                      disabled={bulkSkipMutation.isPending}
                      data-testid="button-skip-selected"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Skip Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clearSelection}
                      data-testid="button-clear-selection"
                    >
                      Clear
                    </Button>
                  </>
                )}
              </div>
            )}

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
                <p className="text-sm mt-2">Digests are configured on individual deal pages</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px] md:h-[600px] pr-2 md:pr-4">
                <div className="space-y-3 md:space-y-4">
                  {digests.map((digest) => (
                    <div
                      key={digest.configId}
                      className="border rounded-lg p-3 md:p-4 space-y-2 md:space-y-3"
                      data-testid={`digest-card-${digest.configId}`}
                    >
                      <div className="flex items-start justify-between gap-2 md:gap-4">
                        {/* Checkbox for selecting draft digests */}
                        {digest.draft && digest.draft.status === 'draft' && (
                          <Checkbox
                            checked={selectedDraftIds.has(digest.draft.id)}
                            onCheckedChange={() => toggleDraftSelection(digest.draft!.id)}
                            className="mt-1 shrink-0"
                            data-testid={`checkbox-draft-${digest.configId}`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm md:text-base truncate">{digest.projectName}</h3>
                          {digest.borrowerName && (
                            <p className="text-xs md:text-sm text-muted-foreground truncate">
                              {digest.borrowerName}
                            </p>
                          )}
                          {digest.propertyAddress && (
                            <p className="text-xs md:text-sm text-muted-foreground truncate hidden sm:block">
                              {digest.propertyAddress}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
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
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <h4 className="font-medium text-sm">Schedule Settings</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select 
                    value={editForm.frequency} 
                    onValueChange={(value) => setEditForm({ ...editForm, frequency: value })}
                  >
                    <SelectTrigger data-testid="select-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="every_2_days">Every 2 Days</SelectItem>
                      <SelectItem value="every_3_days">Every 3 Days</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {editForm.frequency === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="customDays">Every X Days</Label>
                    <Input
                      id="customDays"
                      type="number"
                      min={1}
                      max={30}
                      value={editForm.customDays}
                      onChange={(e) => setEditForm({ ...editForm, customDays: parseInt(e.target.value) || 2 })}
                      data-testid="input-custom-days"
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="timeOfDay">Time of Day</Label>
                  <Select 
                    value={editForm.timeOfDay} 
                    onValueChange={(value) => setEditForm({ ...editForm, timeOfDay: value })}
                  >
                    <SelectTrigger data-testid="select-time">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="07:00">7:00 AM</SelectItem>
                      <SelectItem value="08:00">8:00 AM</SelectItem>
                      <SelectItem value="09:00">9:00 AM</SelectItem>
                      <SelectItem value="10:00">10:00 AM</SelectItem>
                      <SelectItem value="11:00">11:00 AM</SelectItem>
                      <SelectItem value="12:00">12:00 PM</SelectItem>
                      <SelectItem value="13:00">1:00 PM</SelectItem>
                      <SelectItem value="14:00">2:00 PM</SelectItem>
                      <SelectItem value="15:00">3:00 PM</SelectItem>
                      <SelectItem value="16:00">4:00 PM</SelectItem>
                      <SelectItem value="17:00">5:00 PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

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
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => setEditingDigest(null)}>
                Cancel
              </Button>
              <Button 
                variant="secondary"
                onClick={() => setShowSaveTemplateDialog(true)}
                data-testid="button-save-as-template"
              >
                <Copy className="h-4 w-4 mr-2" />
                Save as Template
              </Button>
            </div>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateDraftMutation.isPending}
            >
              {updateDraftMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Save this message as a reusable template
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="templateName">Template Name</Label>
            <Input
              id="templateName"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="e.g., Weekly Update, Document Reminder..."
              className="mt-2"
              data-testid="input-template-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveTemplateMutation.mutate({
                name: newTemplateName,
                emailSubject: editForm.emailSubject,
                emailBody: editForm.emailBody,
                smsBody: editForm.smsBody,
              })}
              disabled={!newTemplateName.trim() || saveTemplateMutation.isPending}
              data-testid="button-confirm-save-template"
            >
              {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

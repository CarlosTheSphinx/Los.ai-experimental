import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatTimestamp } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPhoneNumber, getPhoneError, getEmailError } from "@/lib/validation";
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarWidget } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/hooks/use-branding';
import { apiRequest } from '@/lib/queryClient';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Phone, 
  Clock, 
  Calendar, 
  FileText, 
  Users, 
  Plus, 
  Trash2, 
  Send, 
  ChevronDown, 
  ChevronUp,
  History,
  Loader2,
  Edit2,
  Check,
  SkipForward,
  Eye,
  Save,
  X,
  Sparkles,
  Copy
} from 'lucide-react';

interface DigestConfig {
  id: number;
  projectId: number | null;
  dealId: number | null;
  frequency: string;
  customDays: number | null;
  timeOfDay: string;
  timezone: string;
  includeDocumentsNeeded: boolean;
  includeNotes: boolean;
  includeMessages: boolean;
  includeGeneralUpdates: boolean;
  emailSubject: string | null;
  emailBody: string | null;
  smsBody: string | null;
  isEnabled: boolean;
}

interface DigestRecipient {
  id: number;
  configId: number;
  userId: number | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  deliveryMethod: string;
  isActive: boolean;
}

interface PotentialRecipient {
  userId: number | null;
  name: string;
  email: string;
  phone: string | null;
  role: string;
}

interface DigestHistory {
  id: number;
  deliveryMethod: string;
  recipientAddress: string;
  documentsCount: number;
  updatesCount: number;
  status: string;
  sentAt: string;
}

interface DigestDraft {
  id: number;
  configId: number;
  projectId: number | null;
  scheduledDate: string;
  timeOfDay: string;
  emailSubject: string | null;
  emailBody: string | null;
  smsBody: string | null;
  documentsCount: number;
  updatesCount: number;
  status: string;
  approvedBy: number | null;
  approvedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DigestConfigPanelProps {
  dealId: number;
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily', days: 1 },
  { value: 'every_2_days', label: 'Every 2 Days', days: 2 },
  { value: 'every_3_days', label: 'Every 3 Days', days: 3 },
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'custom', label: 'Every X Days...', days: null },
];

const DELIVERY_METHOD_OPTIONS = [
  { value: 'email', label: 'Email Only', icon: Mail },
  { value: 'sms', label: 'SMS Only', icon: Phone },
  { value: 'both', label: 'Email & SMS', icon: MessageSquare },
];

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
];

export function DigestConfigPanel({ dealId }: DigestConfigPanelProps) {
  const { toast } = useToast();
  const { branding } = useBranding();
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [showMessageTemplate, setShowMessageTemplate] = useState(true);
  const [activeTemplateField, setActiveTemplateField] = useState<'subject' | 'emailBody' | 'smsBody'>('emailBody');
  const subjectRef = useRef<HTMLInputElement>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const smsBodyRef = useRef<HTMLTextAreaElement>(null);
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [previewDraftId, setPreviewDraftId] = useState<number | null>(null);
  const [draftEdits, setDraftEdits] = useState<{ emailSubject: string; emailBody: string; smsBody: string }>({ emailSubject: '', emailBody: '', smsBody: '' });
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);
  const [addCommDialogOpen, setAddCommDialogOpen] = useState(false);
  const [newCommForm, setNewCommForm] = useState({ emailSubject: '', emailBody: '', smsBody: '' });
  const [newRecipient, setNewRecipient] = useState({
    userId: null as number | null,
    recipientName: '',
    recipientEmail: '',
    recipientPhone: '',
    deliveryMethod: 'email',
  });

  // Fetch digest config for this deal
  const { data: digestData, isLoading } = useQuery<{ config: DigestConfig | null; recipients: DigestRecipient[] }>({
    queryKey: ['/api/admin/deals', dealId, 'digest'],
  });

  // Fetch potential recipients for this deal
  const { data: potentialRecipientsData } = useQuery<{ recipients: PotentialRecipient[] }>({
    queryKey: ['/api/admin/deals', dealId, 'potential-recipients'],
  });

  // Fetch digest history for this deal
  const { data: historyData } = useQuery<{ history: DigestHistory[] }>({
    queryKey: ['/api/admin/deals', dealId, 'digest/history'],
    enabled: showHistory,
  });

  // Fetch outstanding docs for preview
  const { data: outstandingDocsData } = useQuery<{ documents: Array<{ id: number; name: string; status: string }> }>({
    queryKey: ['/api/admin/deals', dealId, 'outstanding-docs'],
  });

  // Fetch digest drafts
  const { data: draftsData } = useQuery<{ drafts: DigestDraft[] }>({
    queryKey: ['/api/admin/deals', dealId, 'digest/drafts'],
  });

  // Fetch approved AI communications for this deal
  const { data: agentCommsData } = useQuery<any[]>({
    queryKey: ['/api/projects', dealId, 'agent-communications'],
  });
  // Filter approved comms that are NOT yet scheduled as drafts (deduplicate with drafts that have source=ai_communication)
  const scheduledCommIds = new Set(
    (draftsData?.drafts || [])
      .filter((d: any) => d.source === 'ai_communication' && d.sourceCommId)
      .map((d: any) => d.sourceCommId)
  );
  const approvedComms = (agentCommsData || []).filter(
    (c: any) => c.status === 'approved' && !c.sentAt && !scheduledCommIds.has(c.id)
  );

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (data: Partial<DigestConfig>) => {
      const response = await apiRequest('POST', `/api/admin/deals/${dealId}/digest`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest'] });
      toast({ title: 'Communication settings saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Add recipient mutation
  const addRecipientMutation = useMutation({
    mutationFn: async (data: typeof newRecipient) => {
      const response = await apiRequest('POST', `/api/admin/deals/${dealId}/digest/recipients`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest'] });
      setShowAddRecipient(false);
      setNewRecipient({ userId: null, recipientName: '', recipientEmail: '', recipientPhone: '', deliveryMethod: 'email' });
      toast({ title: 'Recipient added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete recipient mutation
  const deleteRecipientMutation = useMutation({
    mutationFn: async (recipientId: number) => {
      const response = await apiRequest('DELETE', `/api/digest/recipients/${recipientId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest'] });
      toast({ title: 'Recipient removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Send test digest mutation
  const sendTestMutation = useMutation({
    mutationFn: async (recipientId: number) => {
      const response = await apiRequest('POST', `/api/admin/deals/${dealId}/digest/test`, { recipientId });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Test digest sent' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update digest draft mutation
  const updateDraftMutation = useMutation({
    mutationFn: async ({ draftId, data }: { draftId: number; data: { emailSubject: string; emailBody: string; smsBody: string } }) => {
      const response = await apiRequest('PUT', `/api/admin/digest/drafts/${draftId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest/drafts'] });
      setEditingDraftId(null);
      toast({ title: 'Draft updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Approve digest draft mutation
  const approveDraftMutation = useMutation({
    mutationFn: async (draftId: number) => {
      const response = await apiRequest('POST', `/api/admin/digest/drafts/${draftId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest/drafts'] });
      toast({ title: 'Digest approved', description: 'This digest will be sent at its scheduled time.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Skip digest draft mutation
  const skipDraftMutation = useMutation({
    mutationFn: async (draftId: number) => {
      const response = await apiRequest('POST', `/api/admin/digest/drafts/${draftId}/skip`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest/drafts'] });
      toast({ title: 'Digest skipped' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createAdHocDraftMutation = useMutation({
    mutationFn: async (data: { date: string; emailSubject?: string; emailBody?: string; smsBody?: string }) => {
      const response = await apiRequest('POST', `/api/admin/deals/${dealId}/digest/drafts`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest/drafts'] });
      setAddCommDialogOpen(false);
      setNewCommForm({ emailSubject: '', emailBody: '', smsBody: '' });
      toast({ title: 'Communication created', description: 'A new draft has been added for the selected date.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const config = digestData?.config;
  const recipients = digestData?.recipients || [];
  const potentialRecipients = potentialRecipientsData?.recipients || [];
  const history = historyData?.history || [];
  const outstandingDocs = outstandingDocsData?.documents || [];
  const drafts = draftsData?.drafts || [];

  const scheduledDates = useMemo(() => {
    if (!config || !config.isEnabled) return { scheduled: new Map<string, string>(), draftDates: new Map<string, DigestDraft>() };

    const scheduled = new Map<string, string>();
    const draftDates = new Map<string, DigestDraft>();

    drafts.forEach(draft => {
      const d = new Date(draft.scheduledDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      draftDates.set(key, draft);
    });

    const configCreated = new Date(config.isEnabled ? (digestData?.config as any)?.createdAt || new Date() : new Date());
    configCreated.setHours(0, 0, 0, 0);

    let interval = 1;
    switch (config.frequency) {
      case 'daily': interval = 1; break;
      case 'every_2_days': interval = 2; break;
      case 'every_3_days': interval = 3; break;
      case 'weekly': interval = 7; break;
      case 'custom': interval = Math.max(1, Math.min(30, config.customDays || 2)); break;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 90);

    const cursor = new Date(today);
    while (cursor <= endDate) {
      const daysSince = Math.floor((cursor.getTime() - configCreated.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 0 && daysSince % interval === 0) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        if (!draftDates.has(key)) {
          scheduled.set(key, 'scheduled');
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return { scheduled, draftDates };
  }, [config, drafts, digestData]);

  // Handle enabling digest (creates config if doesn't exist)
  const handleEnableDigest = async () => {
    await saveConfigMutation.mutateAsync({ isEnabled: true });
  };

  // Handle config updates
  const handleConfigChange = (field: keyof DigestConfig, value: any) => {
    saveConfigMutation.mutate({ [field]: value });
  };

  const insertMergeTag = useCallback((tag: string) => {
    const tagText = `{{${tag}}}`;
    if (activeTemplateField === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const newVal = el.value.substring(0, start) + tagText + el.value.substring(end);
      handleConfigChange('emailSubject', newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tagText.length, start + tagText.length);
      }, 0);
    } else if (activeTemplateField === 'emailBody' && emailBodyRef.current) {
      const el = emailBodyRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const newVal = el.value.substring(0, start) + tagText + el.value.substring(end);
      handleConfigChange('emailBody', newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tagText.length, start + tagText.length);
      }, 0);
    } else if (activeTemplateField === 'smsBody' && smsBodyRef.current) {
      const el = smsBodyRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const newVal = el.value.substring(0, start) + tagText + el.value.substring(end);
      handleConfigChange('smsBody', newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tagText.length, start + tagText.length);
      }, 0);
    }
  }, [activeTemplateField, handleConfigChange]);

  // Handle adding recipient from potential list
  const handleSelectPotentialRecipient = (recipient: PotentialRecipient) => {
    setNewRecipient({
      userId: recipient.userId,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      recipientPhone: recipient.phone || '',
      deliveryMethod: 'email',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // If no config exists, show setup option
  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Loan Digest Notifications
          </CardTitle>
          <CardDescription>
            Set up automated updates to keep borrowers and partners informed about their loan progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">What's included in a digest?</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Outstanding documents needed
                </li>
                <li className="flex items-center gap-2">
                  <History className="h-4 w-4" /> Recent loan updates and status changes
                </li>
                <li className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Direct link to borrower portal
                </li>
              </ul>
            </div>
            
            {outstandingDocs.length > 0 && (
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Preview: {outstandingDocs.length} Outstanding Document(s)</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {outstandingDocs.slice(0, 3).map(doc => (
                    <li key={doc.id}>{doc.name}</li>
                  ))}
                  {outstandingDocs.length > 3 && (
                    <li className="text-muted-foreground">...and {outstandingDocs.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}

            <Button 
              onClick={handleEnableDigest} 
              disabled={saveConfigMutation.isPending}
              data-testid="button-enable-digest"
            >
              {saveConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enable Automated Communications
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Communications
            </CardTitle>
            <CardDescription>
              Automated updates sent to borrowers and partners
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="digest-enabled" className="text-sm">Enabled</Label>
            <Switch 
              id="digest-enabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => handleConfigChange('isEnabled', checked)}
              data-testid="switch-digest-enabled"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Schedule Settings */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Schedule
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <div className="flex gap-2">
                <Select 
                  value={config.frequency} 
                  onValueChange={(value) => {
                    handleConfigChange('frequency', value);
                    // Set default customDays if switching to custom
                    if (value === 'custom' && !config.customDays) {
                      handleConfigChange('customDays', 2);
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-frequency" className={config.frequency === 'custom' ? 'flex-1' : ''}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {config.frequency === 'custom' && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">Every</span>
                    <Input 
                      type="number" 
                      min={1} 
                      max={30}
                      className="w-16"
                      value={config.customDays || 2}
                      onChange={(e) => handleConfigChange('customDays', parseInt(e.target.value) || 1)}
                      data-testid="input-custom-days"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Time of Day</Label>
              <Select 
                value={config.timeOfDay} 
                onValueChange={(value) => handleConfigChange('timeOfDay', value)}
              >
                <SelectTrigger data-testid="select-time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(time => (
                    <SelectItem key={time} value={time}>
                      {parseInt(time) > 12 ? `${parseInt(time) - 12}:00 PM` : `${parseInt(time)}:00 AM`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Timezone</Label>
              <Select 
                value={config.timezone} 
                onValueChange={(value) => handleConfigChange('timezone', value)}
              >
                <SelectTrigger data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Content Settings */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Content Included
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Documents Needed</Label>
                <p className="text-xs text-muted-foreground">List of outstanding documents (most important)</p>
              </div>
              <Switch 
                checked={config.includeDocumentsNeeded}
                onCheckedChange={(checked) => handleConfigChange('includeDocumentsNeeded', checked)}
                data-testid="switch-include-docs"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>General Updates</Label>
                <p className="text-xs text-muted-foreground">Stage changes, status updates</p>
              </div>
              <Switch 
                checked={config.includeGeneralUpdates}
                onCheckedChange={(checked) => handleConfigChange('includeGeneralUpdates', checked)}
                data-testid="switch-include-updates"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Notes</Label>
                <p className="text-xs text-muted-foreground">Internal notes added by staff</p>
              </div>
              <Switch 
                checked={config.includeNotes}
                onCheckedChange={(checked) => handleConfigChange('includeNotes', checked)}
                data-testid="switch-include-notes"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Messages</Label>
                <p className="text-xs text-muted-foreground">Messages from the lender</p>
              </div>
              <Switch 
                checked={config.includeMessages}
                onCheckedChange={(checked) => handleConfigChange('includeMessages', checked)}
                data-testid="switch-include-messages"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Message Template */}
        <div className="space-y-4">
          <Button 
            variant="ghost" 
            className="w-full justify-between p-0 h-auto"
            onClick={() => setShowMessageTemplate(!showMessageTemplate)}
            data-testid="button-toggle-message-template"
          >
            <h4 className="font-medium flex items-center gap-2">
              <Edit2 className="h-4 w-4" />
              Message Template
            </h4>
            {showMessageTemplate ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showMessageTemplate && (
            <div className="space-y-5 border rounded-lg p-4 bg-muted/30">
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Click a merge tag to insert it at your cursor position in the active field below.
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Borrower</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { tag: 'recipientName', label: 'Recipient Name' },
                        { tag: 'portalLink', label: 'Portal Link' },
                      ].map(({ tag, label }) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer font-mono text-xs"
                          onClick={() => insertMergeTag(tag)}
                          data-testid={`merge-tag-${tag}`}
                        >
                          <Copy className="h-3 w-3 mr-1 opacity-60" />
                          {`{{${tag}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Deal Info</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { tag: 'dealId', label: 'Deal ID' },
                        { tag: 'propertyAddress', label: 'Property Address' },
                        { tag: 'loanAmount', label: 'Loan Amount' },
                        { tag: 'loanType', label: 'Loan Type' },
                        { tag: 'currentStage', label: 'Current Stage' },
                        { tag: 'targetCloseDate', label: 'Target Close Date' },
                      ].map(({ tag, label }) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer font-mono text-xs"
                          onClick={() => insertMergeTag(tag)}
                          data-testid={`merge-tag-${tag}`}
                        >
                          <Copy className="h-3 w-3 mr-1 opacity-60" />
                          {`{{${tag}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Content Blocks</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { tag: 'documentsSection', label: 'Documents List' },
                        { tag: 'updatesSection', label: 'Updates List' },
                        { tag: 'documentsCount', label: 'Documents Count' },
                      ].map(({ tag, label }) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer font-mono text-xs"
                          onClick={() => insertMergeTag(tag)}
                          data-testid={`merge-tag-${tag}`}
                        >
                          <Copy className="h-3 w-3 mr-1 opacity-60" />
                          {`{{${tag}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Email Subject
                  {activeTemplateField === 'subject' && (
                    <Badge variant="outline" className="text-[10px] font-normal">Active</Badge>
                  )}
                </Label>
                <Input 
                  ref={subjectRef}
                  value={config.emailSubject || 'Loan Update: Action Required'}
                  onChange={(e) => handleConfigChange('emailSubject', e.target.value)}
                  onFocus={() => setActiveTemplateField('subject')}
                  placeholder="Loan Update: Action Required"
                  className="font-mono text-sm"
                  data-testid="input-email-subject"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Email Body
                  {activeTemplateField === 'emailBody' && (
                    <Badge variant="outline" className="text-[10px] font-normal">Active</Badge>
                  )}
                </Label>
                <Textarea
                  ref={emailBodyRef}
                  value={config.emailBody || `Hello {{recipientName}},\n\nHere's an update on your loan for {{propertyAddress}}.\n\n{{documentsSection}}\n\n{{updatesSection}}\n\nPlease log in to your portal to take any necessary actions.\n\nBest regards,\n${branding.emailSignature}`}
                  onChange={(e) => handleConfigChange('emailBody', e.target.value)}
                  onFocus={() => setActiveTemplateField('emailBody')}
                  className="min-h-[200px] font-mono text-sm"
                  placeholder="Enter email body template..."
                  data-testid="input-email-body"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  SMS Message
                  {activeTemplateField === 'smsBody' && (
                    <Badge variant="outline" className="text-[10px] font-normal">Active</Badge>
                  )}
                </Label>
                <Textarea
                  ref={smsBodyRef}
                  value={config.smsBody || `${branding.smsSignature}: {{documentsCount}} docs needed for your loan. Log in to your portal for details.`}
                  onChange={(e) => handleConfigChange('smsBody', e.target.value)}
                  onFocus={() => setActiveTemplateField('smsBody')}
                  className="min-h-[80px] font-mono text-sm"
                  placeholder="Enter SMS template..."
                  data-testid="input-sms-body"
                />
                <p className="text-xs text-muted-foreground">SMS messages should be concise (under 160 characters recommended)</p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Recipients */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Recipients ({recipients.length})
            </h4>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setShowAddRecipient(true)}
              data-testid="button-add-recipient"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Recipient
            </Button>
          </div>

          {recipients.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No recipients configured. Add someone to start sending digests.
            </div>
          ) : (
            <div className="space-y-2">
              {recipients.map(recipient => (
                <div 
                  key={recipient.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      {recipient.deliveryMethod === 'email' && <Mail className="h-4 w-4" />}
                      {recipient.deliveryMethod === 'sms' && <Phone className="h-4 w-4" />}
                      {recipient.deliveryMethod === 'both' && <MessageSquare className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{recipient.recipientName || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {recipient.recipientEmail}
                        {recipient.recipientPhone && ` | ${recipient.recipientPhone}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={recipient.isActive ? 'default' : 'secondary'}>
                      {recipient.isActive ? 'Active' : 'Paused'}
                    </Badge>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => sendTestMutation.mutate(recipient.id)}
                      disabled={sendTestMutation.isPending}
                      data-testid={`button-send-test-${recipient.id}`}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => deleteRecipientMutation.mutate(recipient.id)}
                      disabled={deleteRecipientMutation.isPending}
                      data-testid={`button-delete-recipient-${recipient.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Recipient Form */}
          {showAddRecipient && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h5 className="font-medium">Add Recipient</h5>
              
              {/* Quick select from potential recipients */}
              {potentialRecipients.length > 0 && (
                <div className="space-y-2">
                  <Label>Quick Select</Label>
                  <div className="flex flex-wrap gap-2">
                    {potentialRecipients.map((pr, idx) => (
                      <Button 
                        key={idx}
                        size="sm" 
                        variant="outline"
                        onClick={() => handleSelectPotentialRecipient(pr)}
                        data-testid={`button-select-recipient-${idx}`}
                      >
                        {pr.name} ({pr.role})
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input 
                    value={newRecipient.recipientName}
                    onChange={(e) => setNewRecipient({...newRecipient, recipientName: e.target.value})}
                    placeholder="Recipient name"
                    data-testid="input-recipient-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newRecipient.recipientEmail}
                    onChange={(e) => setNewRecipient({...newRecipient, recipientEmail: e.target.value})}
                    placeholder="email@example.com"
                    data-testid="input-recipient-email"
                  />
                  {getEmailError(newRecipient.recipientEmail) && (
                    <p className="text-sm text-red-500">{getEmailError(newRecipient.recipientEmail)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Phone (for SMS)</Label>
                  <Input
                    type="tel"
                    value={newRecipient.recipientPhone}
                    onChange={(e) => setNewRecipient({...newRecipient, recipientPhone: formatPhoneNumber(e.target.value)})}
                    placeholder="(123) 456-7890"
                    data-testid="input-recipient-phone"
                  />
                  {getPhoneError(newRecipient.recipientPhone) && (
                    <p className="text-sm text-red-500">{getPhoneError(newRecipient.recipientPhone)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Delivery Method</Label>
                  <Select 
                    value={newRecipient.deliveryMethod}
                    onValueChange={(value) => setNewRecipient({...newRecipient, deliveryMethod: value})}
                  >
                    <SelectTrigger data-testid="select-delivery-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_METHOD_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowAddRecipient(false)}
                  data-testid="button-cancel-add-recipient"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => addRecipientMutation.mutate(newRecipient)}
                  disabled={addRecipientMutation.isPending || !newRecipient.recipientEmail}
                  data-testid="button-save-recipient"
                >
                  {addRecipientMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Recipient
                </Button>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Communications Calendar */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Communications Calendar
          </h4>

          {(() => {
            const { scheduled, draftDates } = scheduledDates;

            const getDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const calendarModifiers: Record<string, Date[]> = {
              scheduledFuture: [] as Date[],
              hasDraft: [] as Date[],
              hasApproved: [] as Date[],
              hasSent: [] as Date[],
              hasSkipped: [] as Date[],
            };

            scheduled.forEach((_status, key) => {
              const [y, m, d] = key.split('-').map(Number);
              calendarModifiers.scheduledFuture.push(new Date(y, m - 1, d));
            });

            draftDates.forEach((draft, key) => {
              const [y, m, d] = key.split('-').map(Number);
              const date = new Date(y, m - 1, d);
              if (draft.status === 'draft') calendarModifiers.hasDraft.push(date);
              else if (draft.status === 'approved') calendarModifiers.hasApproved.push(date);
              else if (draft.status === 'sent') calendarModifiers.hasSent.push(date);
              else if (draft.status === 'skipped' || draft.status === 'superseded') calendarModifiers.hasSkipped.push(date);
            });

            const modifiersStyles: Record<string, React.CSSProperties> = {
              scheduledFuture: { position: 'relative' },
              hasDraft: { position: 'relative' },
              hasApproved: { position: 'relative' },
              hasSent: { position: 'relative' },
              hasSkipped: { position: 'relative' },
            };

            const handleDayClick = (day: Date) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const clickedDate = new Date(day);
              clickedDate.setHours(0, 0, 0, 0);

              if (clickedDate < today) return;

              const key = getDateKey(clickedDate);
              const existingDraft = draftDates.get(key);

              if (existingDraft && existingDraft.status === 'draft') {
                if (editingDraftId === existingDraft.id) {
                  setEditingDraftId(null);
                } else {
                  setEditingDraftId(existingDraft.id);
                  setPreviewDraftId(null);
                  setDraftEdits({
                    emailSubject: existingDraft.emailSubject || '',
                    emailBody: existingDraft.emailBody || '',
                    smsBody: existingDraft.smsBody || '',
                  });
                }
              } else if (existingDraft && existingDraft.status === 'approved') {
                setPreviewDraftId(existingDraft.id);
                setEditingDraftId(null);
              } else if (existingDraft && existingDraft.status === 'sent') {
                toast({ title: 'Already sent', description: 'This communication was already sent on this date.' });
              } else if (!existingDraft || existingDraft.status === 'skipped' || existingDraft.status === 'superseded') {
                setSelectedCalendarDate(clickedDate);
                setNewCommForm({ emailSubject: config?.emailSubject || '', emailBody: config?.emailBody || '', smsBody: config?.smsBody || '' });
                setAddCommDialogOpen(true);
              }
            };

            return (
              <div className="border rounded-lg p-3">
                <CalendarWidget
                  mode="single"
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  modifiers={calendarModifiers}
                  modifiersStyles={modifiersStyles}
                  onDayClick={handleDayClick}
                  disabled={{ before: new Date() }}
                  className="w-full"
                  components={{
                    DayContent: ({ date }: { date: Date }) => {
                      const key = getDateKey(date);
                      const draft = draftDates.get(key);
                      const isScheduled = scheduled.has(key);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const dateNorm = new Date(date);
                      dateNorm.setHours(0, 0, 0, 0);
                      const isPast = dateNorm < today;

                      let dotColor = '';
                      let dotTitle = '';
                      if (draft) {
                        if (draft.status === 'sent') { dotColor = 'bg-blue-500'; dotTitle = 'Sent'; }
                        else if (draft.status === 'approved') { dotColor = 'bg-green-500'; dotTitle = 'Approved'; }
                        else if (draft.status === 'draft') { dotColor = 'bg-amber-500'; dotTitle = 'Draft - needs review'; }
                        else if (draft.status === 'skipped' || draft.status === 'superseded') { dotColor = 'bg-muted-foreground/40'; dotTitle = draft.status === 'superseded' ? 'Superseded by AI' : 'Skipped'; }
                      } else if (isScheduled && !isPast) {
                        dotColor = 'bg-primary/40'; dotTitle = 'Scheduled';
                      }

                      return (
                        <div className="relative flex flex-col items-center" title={dotTitle}>
                          <span>{date.getDate()}</span>
                          {dotColor && (
                            <span className={`absolute -bottom-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} />
                          )}
                        </div>
                      );
                    },
                  }}
                />
                <div className="flex flex-wrap gap-3 mt-2 px-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary/40" /> Scheduled
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Draft
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Approved
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Sent
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 px-1">Click any future date to add or edit a communication.</p>
              </div>
            );
          })()}
        </div>

        <Separator />

        {/* Upcoming Communications list */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Upcoming ({drafts.filter(d => d.status === 'draft' || d.status === 'approved').length + approvedComms.length})
          </h4>

          {drafts.filter(d => d.status !== 'superseded').length === 0 && approvedComms.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg">
              <p>No upcoming communications.</p>
              <p className="text-xs mt-1">Click a date on the calendar above to add one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map(draft => {
                const isEditing = editingDraftId === draft.id;
                const isPreviewing = previewDraftId === draft.id;
                const scheduledDate = new Date(draft.scheduledDate);
                const isToday = scheduledDate.toDateString() === new Date().toDateString();
                const isTomorrow = scheduledDate.toDateString() === new Date(Date.now() + 86400000).toDateString();

                const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeLabel = draft.timeOfDay ? `${parseInt(draft.timeOfDay) > 12 ? `${parseInt(draft.timeOfDay) - 12}:00 PM` : `${parseInt(draft.timeOfDay)}:00 AM`}` : '';

                return (
                  <div key={draft.id} className="border rounded-lg overflow-hidden" data-testid={`digest-draft-${draft.id}`}>
                    <div className="flex items-center justify-between p-3 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col items-center text-center min-w-[56px]">
                          <span className="text-xs font-medium">{dateLabel}</span>
                          <span className="text-xs text-muted-foreground">{timeLabel}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{draft.emailSubject || 'No subject'}</p>
                          <p className="text-xs text-muted-foreground">
                            {draft.documentsCount} docs, {draft.updatesCount} updates
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(draft as any).source === 'ai_communication' && (
                          <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
                            <Sparkles className="h-3 w-3 mr-1" />
                            AI Priority
                          </Badge>
                        )}
                        <Badge variant={
                          draft.status === 'approved' ? 'default' :
                          draft.status === 'sent' ? 'default' :
                          draft.status === 'skipped' ? 'secondary' :
                          draft.status === 'superseded' ? 'secondary' :
                          'outline'
                        }>
                          {draft.status === 'draft' ? 'Needs Review' : 
                           draft.status === 'superseded' ? 'Superseded by AI' :
                           draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
                        </Badge>
                        {draft.status === 'draft' && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (isPreviewing) {
                                  setPreviewDraftId(null);
                                } else {
                                  setPreviewDraftId(draft.id);
                                  setEditingDraftId(null);
                                }
                              }}
                              data-testid={`button-preview-draft-${draft.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingDraftId(null);
                                } else {
                                  setEditingDraftId(draft.id);
                                  setPreviewDraftId(null);
                                  setDraftEdits({
                                    emailSubject: draft.emailSubject || '',
                                    emailBody: draft.emailBody || '',
                                    smsBody: draft.smsBody || '',
                                  });
                                }
                              }}
                              data-testid={`button-edit-draft-${draft.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => approveDraftMutation.mutate(draft.id)}
                              disabled={approveDraftMutation.isPending}
                              data-testid={`button-approve-draft-${draft.id}`}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => skipDraftMutation.mutate(draft.id)}
                              disabled={skipDraftMutation.isPending}
                              data-testid={`button-skip-draft-${draft.id}`}
                            >
                              <SkipForward className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {draft.status === 'approved' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setPreviewDraftId(isPreviewing ? null : draft.id);
                              setEditingDraftId(null);
                            }}
                            data-testid={`button-preview-approved-${draft.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {isPreviewing && (
                      <div className="border-t p-4 bg-muted/30 space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Subject</Label>
                          <p className="text-sm font-medium">{draft.emailSubject || 'No subject'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Email Body</Label>
                          <div className="text-sm whitespace-pre-wrap bg-background border rounded-lg p-3 max-h-[400px] overflow-y-auto">
                            {draft.emailBody || 'No content'}
                          </div>
                        </div>
                        {draft.smsBody && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">SMS</Label>
                            <p className="text-sm bg-background border rounded-lg p-3">{draft.smsBody}</p>
                          </div>
                        )}
                        {draft.sentAt && (
                          <p className="text-xs text-muted-foreground">Sent: {formatTimestamp(draft.sentAt)}</p>
                        )}
                      </div>
                    )}

                    {isEditing && (
                      <div className="border-t p-4 bg-muted/30 space-y-3">
                        <div className="space-y-2">
                          <Label>Subject</Label>
                          <Input
                            value={draftEdits.emailSubject}
                            onChange={(e) => setDraftEdits({ ...draftEdits, emailSubject: e.target.value })}
                            data-testid={`input-draft-subject-${draft.id}`}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email Body</Label>
                          <Textarea
                            value={draftEdits.emailBody}
                            onChange={(e) => setDraftEdits({ ...draftEdits, emailBody: e.target.value })}
                            className="min-h-[300px] font-mono text-sm"
                            data-testid={`input-draft-body-${draft.id}`}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>SMS Body</Label>
                          <Textarea
                            value={draftEdits.smsBody}
                            onChange={(e) => setDraftEdits({ ...draftEdits, smsBody: e.target.value })}
                            className="min-h-[80px] font-mono text-sm"
                            data-testid={`input-draft-sms-${draft.id}`}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => setEditingDraftId(null)}
                            data-testid={`button-cancel-edit-draft-${draft.id}`}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                          <Button
                            onClick={() => updateDraftMutation.mutate({ draftId: draft.id, data: draftEdits })}
                            disabled={updateDraftMutation.isPending}
                            data-testid={`button-save-draft-${draft.id}`}
                          >
                            {updateDraftMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {approvedComms.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI Communications ({approvedComms.length})
              </h4>
              <p className="text-xs text-muted-foreground">
                Approved AI communications are auto-scheduled as the next day's outbound message, taking priority over regular digests. Only one automated message per deal per day.
              </p>
              {approvedComms.map((comm: any) => {
                let displayBody = comm.editedBody || comm.body || '';
                let displaySubject = comm.subject || 'Deal Update';
                try {
                  const trimmed = displayBody.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
                  const parsed = JSON.parse(trimmed);
                  if (parsed.subject) displaySubject = parsed.subject;
                  if (parsed.body) displayBody = parsed.body;
                } catch {}

                return (
                  <div key={comm.id} className="border rounded-lg p-3 space-y-2 border-primary/30 bg-primary/5" data-testid={`approved-comm-deal-${comm.id}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{displaySubject}</span>
                          <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                            Scheduled
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>To: {comm.recipientType || 'borrower'}</span>
                          {comm.approvedAt && (
                            <span>Approved {formatDate(comm.approvedAt)}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(displayBody);
                          toast({ title: 'Copied to clipboard' });
                        }}
                        data-testid={`button-copy-comm-${comm.id}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-2.5 max-h-36 overflow-y-auto">
                      {displayBody.length > 250 ? displayBody.substring(0, 250) + '...' : displayBody}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Separator />

        {/* History */}
        <div className="space-y-4">
          <Button 
            variant="ghost" 
            className="w-full justify-between"
            onClick={() => setShowHistory(!showHistory)}
            data-testid="button-toggle-history"
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Communication History
            </span>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showHistory && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No digests sent yet.
                </div>
              ) : (
                history.map(entry => (
                  <div 
                    key={entry.id} 
                    className="flex items-center justify-between p-3 border rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {entry.deliveryMethod === 'email' ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                      <div>
                        <p className="text-muted-foreground">{entry.recipientAddress}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.documentsCount} docs, {entry.updatesCount} updates
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={entry.status === 'sent' ? 'default' : 'destructive'}>
                        {entry.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimestamp(entry.sentAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={addCommDialogOpen} onOpenChange={setAddCommDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Communication</DialogTitle>
            <DialogDescription>
              {selectedCalendarDate && `Schedule a message for ${selectedCalendarDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-comm-subject">Email Subject</Label>
              <Input
                id="new-comm-subject"
                value={newCommForm.emailSubject}
                onChange={(e) => setNewCommForm({ ...newCommForm, emailSubject: e.target.value })}
                placeholder="Loan Update..."
                className="font-mono text-sm"
                data-testid="input-new-comm-subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-comm-body">Email Body</Label>
              <Textarea
                id="new-comm-body"
                value={newCommForm.emailBody}
                onChange={(e) => setNewCommForm({ ...newCommForm, emailBody: e.target.value })}
                placeholder="Write your message..."
                rows={8}
                className="font-mono text-sm"
                data-testid="input-new-comm-body"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-comm-sms">SMS Message (optional)</Label>
              <Textarea
                id="new-comm-sms"
                value={newCommForm.smsBody}
                onChange={(e) => setNewCommForm({ ...newCommForm, smsBody: e.target.value })}
                placeholder="Short SMS version..."
                rows={2}
                className="font-mono text-sm"
                data-testid="input-new-comm-sms"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddCommDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedCalendarDate) {
                  const dateStr = `${selectedCalendarDate.getFullYear()}-${String(selectedCalendarDate.getMonth() + 1).padStart(2, '0')}-${String(selectedCalendarDate.getDate()).padStart(2, '0')}`;
                  createAdHocDraftMutation.mutate({
                    date: dateStr,
                    emailSubject: newCommForm.emailSubject || undefined,
                    emailBody: newCommForm.emailBody || undefined,
                    smsBody: newCommForm.smsBody || undefined,
                  });
                }
              }}
              disabled={createAdHocDraftMutation.isPending}
              data-testid="button-create-comm"
            >
              {createAdHocDraftMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

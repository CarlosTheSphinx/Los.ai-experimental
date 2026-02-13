import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
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
  Edit2
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
  const [showMessageTemplate, setShowMessageTemplate] = useState(false);
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

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (data: Partial<DigestConfig>) => {
      const response = await apiRequest('POST', `/api/admin/deals/${dealId}/digest`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deals', dealId, 'digest'] });
      toast({ title: 'Digest settings saved' });
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

  const config = digestData?.config;
  const recipients = digestData?.recipients || [];
  const potentialRecipients = potentialRecipientsData?.recipients || [];
  const history = historyData?.history || [];
  const outstandingDocs = outstandingDocsData?.documents || [];

  // Handle enabling digest (creates config if doesn't exist)
  const handleEnableDigest = async () => {
    await saveConfigMutation.mutateAsync({ isEnabled: true });
  };

  // Handle config updates
  const handleConfigChange = (field: keyof DigestConfig, value: any) => {
    saveConfigMutation.mutate({ [field]: value });
  };

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
              Enable Digest Notifications
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
              Loan Digest Notifications
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
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="bg-muted/50 p-3 rounded text-xs text-muted-foreground">
                <p className="font-medium mb-1">Available placeholders:</p>
                <p>{"{{recipientName}}"} - Recipient's name</p>
                <p>{"{{propertyAddress}}"} - Property address</p>
                <p>{"{{documentsSection}}"} - List of outstanding documents</p>
                <p>{"{{updatesSection}}"} - Recent updates</p>
                <p>{"{{documentsCount}}"} - Number of documents needed</p>
                <p>{"{{portalLink}}"} - Link to borrower portal</p>
              </div>

              <div className="space-y-2">
                <Label>Email Subject</Label>
                <Input 
                  value={config.emailSubject || 'Loan Update: Action Required'}
                  onChange={(e) => handleConfigChange('emailSubject', e.target.value)}
                  placeholder="Loan Update: Action Required"
                  data-testid="input-email-subject"
                />
              </div>

              <div className="space-y-2">
                <Label>Email Body</Label>
                <Textarea
                  value={config.emailBody || `Hello {{recipientName}},\n\nHere's an update on your loan for {{propertyAddress}}.\n\n{{documentsSection}}\n\n{{updatesSection}}\n\nPlease log in to your portal to take any necessary actions.\n\nBest regards,\n${branding.emailSignature}`}
                  onChange={(e) => handleConfigChange('emailBody', e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                  placeholder="Enter email body template..."
                  data-testid="input-email-body"
                />
              </div>

              <div className="space-y-2">
                <Label>SMS Message</Label>
                <Textarea
                  value={config.smsBody || `${branding.smsSignature}: {{documentsCount}} docs needed for your loan. Log in to your portal for details.`}
                  onChange={(e) => handleConfigChange('smsBody', e.target.value)}
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
                </div>
                <div className="space-y-2">
                  <Label>Phone (for SMS)</Label>
                  <Input 
                    type="tel"
                    value={newRecipient.recipientPhone}
                    onChange={(e) => setNewRecipient({...newRecipient, recipientPhone: e.target.value})}
                    placeholder="+1234567890"
                    data-testid="input-recipient-phone"
                  />
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
              Digest History
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
                        {new Date(entry.sentAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

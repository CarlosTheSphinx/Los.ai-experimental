import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Send, Mail, MessageSquare, Copy, Check, Plug, AlertTriangle, MessageCircle, Ban, RotateCcw } from 'lucide-react';
import { Link } from 'wouter';

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  contactType: string;
  smsOptedOut?: boolean;
}

interface OutreachMessage {
  id: number;
  contactId: number;
  contact?: Contact;
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  personalizedBody: string;
  status: 'draft' | 'approved' | 'sent' | 'failed' | 'opted_out';
  sentAt?: string;
  createdAt: string;
  twilioMessageSid?: string;
  deliveryStatus?: string;
}

interface SmsThreadEntry {
  id: string;
  direction: 'outbound' | 'inbound';
  body: string;
  status: string;
  deliveryStatus?: string;
  twilioMessageSid?: string;
  fromNumber?: string;
  isOptOut?: boolean;
  timestamp: string;
}

interface GeneratedMessage {
  contactId: number;
  contactName: string;
  email?: string;
  phone?: string;
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  personalizedBody: string;
  aiGenerated: boolean;
}

interface Suggestion {
  id: string;
  title: string;
  description: string;
  contactCount: number;
  actionLabel: string;
  actionType: 'reengagement' | 'birthday' | 'followup' | 'custom';
  metadata: Record<string, any>;
}

export default function BrokerOutreachPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Channel config status
  const { data: channels } = useQuery<any>({
    queryKey: ['/api/broker/channels'],
  });
  const hasChannel = channels?.sms?.connected || channels?.email?.connected;
  const channelsLoaded = channels !== undefined;

  // State
  const [prompt, setPrompt] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [generatedMessages, setGeneratedMessages] = useState<GeneratedMessage[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<number>>(new Set());
  const [messageStatus, setMessageStatus] = useState<'idle' | 'generating' | 'ready' | 'sending'>('idle');
  const [sendingProgress, setSendingProgress] = useState(0);
  const [messageTab, setMessageTab] = useState('drafts');
  const [expandedMessage, setExpandedMessage] = useState<number | null>(null);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [smsThreadContactId, setSmsThreadContactId] = useState<number | null>(null);

  // Fetch contacts
  const { data: contactsData } = useQuery({
    queryKey: ['broker-contacts-all'],
    queryFn: async () => {
      const response = await fetch(`/api/broker/contacts?limit=1000`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
  });

  const allContacts = contactsData?.contacts || [];

  // Fetch suggestions
  const { data: suggestionsData } = useQuery({
    queryKey: ['broker-suggestions'],
    queryFn: async () => {
      const response = await fetch(`/api/broker/suggestions`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      return response.json();
    },
  });

  const suggestions: Suggestion[] = suggestionsData || [];

  // Fetch outreach messages
  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: ['broker-outreach-messages', messageTab],
    queryFn: async () => {
      const response = await fetch(
        `/api/broker/outreach/messages?status=${messageTab}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
  });

  const messages: OutreachMessage[] = messagesData || [];

  // SMS thread for a selected contact
  const { data: smsThreadData } = useQuery<{ contact: Contact; thread: SmsThreadEntry[]; smsOptedOut: boolean }>({
    queryKey: ['broker-sms-thread', smsThreadContactId],
    queryFn: async () => {
      const res = await fetch(`/api/broker/contacts/${smsThreadContactId}/sms-thread`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch thread');
      return res.json();
    },
    enabled: !!smsThreadContactId,
  });

  // Opt-out / opt-in mutations
  const { mutate: optOut } = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await fetch(`/api/broker/contacts/${contactId}/opt-out`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to opt out');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-contacts-all'] });
      queryClient.invalidateQueries({ queryKey: ['broker-sms-thread', smsThreadContactId] });
      toast({ title: 'Contact opted out of SMS' });
    },
  });

  const { mutate: optIn } = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await fetch(`/api/broker/contacts/${contactId}/opt-in`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to opt in');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-contacts-all'] });
      queryClient.invalidateQueries({ queryKey: ['broker-sms-thread', smsThreadContactId] });
      toast({ title: 'Contact re-opted into SMS' });
    },
  });

  // Generate messages mutation
  const { mutate: generateMessages, isPending: isGenerating } = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/broker/outreach/generate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: selectedContacts,
          prompt,
          channel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate messages');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedMessages(data.messages);
      setApprovedIds(new Set());
      setMessageStatus('ready');
      toast({
        title: 'Messages generated',
        description: `${data.messages.length} messages ready for review`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setMessageStatus('idle');
    },
  });

  // Send batch messages mutation
  const { mutate: sendBatchMessages, isPending: isSending } = useMutation({
    mutationFn: async (messageIds: number[]) => {
      const response = await fetch(`/api/broker/outreach/send-batch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send messages');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Messages sent',
        description: `${data.successful} of ${data.total} messages sent successfully`,
      });
      setGeneratedMessages([]);
      setApprovedIds(new Set());
      setMessageStatus('idle');
      setShowSendDialog(false);
      setPrompt('');
      setSelectedContacts([]);
      queryClient.invalidateQueries({ queryKey: ['broker-outreach-messages'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setMessageStatus('idle');
    },
  });

  // Execute suggestion mutation
  const { mutate: executeSuggestion, isPending: isExecuting } = useMutation({
    mutationFn: async (suggestionId: string) => {
      const response = await fetch(
        `/api/broker/suggestions/${suggestionId}/execute`,
        { method: 'POST', credentials: 'include' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute suggestion');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedMessages(data.messages);
      setApprovedIds(new Set());
      setMessageStatus('ready');
      toast({
        title: 'Messages generated',
        description: `${data.messagesGenerated} messages ready for review`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const channelReady = (() => {
    if (!channels) return false;
    if (channel === 'email') return !!channels.email?.connected;
    if (channel === 'sms') return !!channels.sms?.connected;
    if (channel === 'both') return !!channels.email?.connected && !!channels.sms?.connected;
    return false;
  })();

  const handleGenerate = () => {
    if (!channelReady) {
      toast({
        title: 'Channel not connected',
        description: 'Please connect a channel in Settings → Integrations before sending outreach.',
        variant: 'destructive',
      });
      return;
    }

    if (!prompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a message prompt',
        variant: 'destructive',
      });
      return;
    }

    if (selectedContacts.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one contact',
        variant: 'destructive',
      });
      return;
    }

    setMessageStatus('generating');
    generateMessages();
  };

  const handleSend = () => {
    if (approvedIds.size === 0) {
      toast({
        title: 'Error',
        description: 'Please approve at least one message',
        variant: 'destructive',
      });
      return;
    }

    setShowSendDialog(true);
  };

  const confirmSend = () => {
    const messageIds = Array.from(approvedIds);
    setMessageStatus('sending');
    sendBatchMessages(messageIds);
  };

  const toggleApprove = (messageIndex: number) => {
    const newApprovedIds = new Set(approvedIds);
    if (newApprovedIds.has(messageIndex)) {
      newApprovedIds.delete(messageIndex);
    } else {
      newApprovedIds.add(messageIndex);
    }
    setApprovedIds(newApprovedIds);
  };

  const approvedCount = approvedIds.size;
  const totalCount = generatedMessages.length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Smart Prospect</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered outreach to find and engage your next borrower
          </p>
        </div>

        {/* Channel setup notice */}
        {channelsLoaded && !hasChannel && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20" data-testid="banner-no-channel">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Connect a channel before sending</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                You need to connect Twilio (SMS) or Gmail before you can send outreach messages.
              </p>
            </div>
            <Link href="/settings?tab=integrations">
              <button className="shrink-0 text-xs font-medium text-amber-900 dark:text-amber-100 underline underline-offset-4 flex items-center gap-1.5" data-testid="link-setup-integrations">
                <Plug className="h-3.5 w-3.5" />
                Set up integrations
              </button>
            </Link>
          </div>
        )}

        {/* AI Suggestions Section */}
        {suggestions.length > 0 && messageStatus === 'idle' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI Suggestions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="border rounded-lg p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium">{suggestion.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {suggestion.description}
                      </p>
                      <div className="mt-2">
                        <Badge variant="secondary">
                          {suggestion.contactCount} contacts
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!hasChannel) {
                          toast({
                            title: 'Channel not connected',
                            description: 'Connect a channel in Settings → Integrations before sending outreach.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        executeSuggestion(suggestion.id);
                      }}
                      disabled={isExecuting || !hasChannel}
                      className="gap-2"
                      title={!hasChannel ? 'Connect a channel in Settings → Integrations first' : undefined}
                    >
                      <Sparkles className="w-3 h-3" />
                      {suggestion.actionLabel}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message Generator */}
        {messageStatus === 'idle' && (
          <div className="border rounded-lg p-6 space-y-6 bg-card">
            <div className="space-y-3">
              <Label htmlFor="prompt" className="text-base font-semibold">
                What would you like to say?
              </Label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: Check in with clients I haven't spoken to in 30 days and remind them about new loan programs..."
                className="w-full px-4 py-3 border border-input rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="contacts" className="text-base font-semibold">
                  Select Recipients
                </Label>
                <Select
                  value={selectedContacts[0]?.toString() || ''}
                  onValueChange={(value) => {
                    if (value === 'all') {
                      // Exclude opted-out contacts when channel involves SMS
                      const includesSms = channel === 'sms' || channel === 'both';
                      const eligible = includesSms
                        ? allContacts.filter((c) => !c.smsOptedOut)
                        : allContacts;
                      setSelectedContacts(eligible.map((c) => c.id));
                    } else if (value) {
                      setSelectedContacts([...selectedContacts, parseInt(value)]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose contacts..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {(() => {
                        const includesSms = channel === 'sms' || channel === 'both';
                        const eligible = includesSms ? allContacts.filter((c) => !c.smsOptedOut) : allContacts;
                        return `All contacts (${eligible.length}${includesSms && eligible.length < allContacts.length ? ` of ${allContacts.length}, opted-out excluded` : ''})`;
                      })()}
                    </SelectItem>
                    {allContacts.map((contact: Contact) => (
                      <SelectItem
                        key={contact.id}
                        value={contact.id.toString()}
                        disabled={(channel === 'sms' || channel === 'both') && !!contact.smsOptedOut}
                      >
                        {contact.firstName} {contact.lastName}
                        {contact.smsOptedOut && (channel === 'sms' || channel === 'both') && ' · SMS opted out'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedContacts.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {selectedContacts.length} contact(s) selected
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label htmlFor="channel" className="text-base font-semibold">
                  Channel
                </Label>
                <Select value={channel} onValueChange={(value: any) => setChannel(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !channelReady}
              size="lg"
              className="w-full gap-2"
              data-testid="button-generate-messages"
              title={!channelReady ? 'Connect a channel in Settings → Integrations first' : undefined}
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating ? 'Generating...' : 'Generate Messages'}
            </Button>
          </div>
        )}

        {/* Generated Messages */}
        {messageStatus === 'ready' && generatedMessages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Review Messages</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {approvedCount} of {totalCount} approved
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMessageStatus('idle');
                    setGeneratedMessages([]);
                    setApprovedIds(new Set());
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={approvedCount === 0 || isSending}
                  size="lg"
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send {approvedCount} Message{approvedCount !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {generatedMessages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedMessage(expandedMessage === idx ? null : idx)}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={approvedIds.has(idx)}
                      onChange={() => toggleApprove(idx)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium">{msg.contactName}</h3>
                        {msg.channel === 'email' ? (
                          <Mail className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {msg.channel}
                        </Badge>
                      </div>

                      {expandedMessage === idx && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-2 mt-3 pt-3 border-t"
                        >
                          {msg.subject && (
                            <div>
                              <p className="text-xs text-muted-foreground">Subject:</p>
                              <p className="text-sm font-medium">{msg.subject}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-muted-foreground">Message:</p>
                            <p className="text-sm whitespace-pre-wrap">{msg.personalizedBody}</p>
                          </div>
                          {msg.email && (
                            <p className="text-xs text-muted-foreground">To: {msg.email}</p>
                          )}
                          {msg.phone && (
                            <p className="text-xs text-muted-foreground">To: {msg.phone}</p>
                          )}
                          <div className="pt-2 border-t mt-2">
                            <p className="text-xs text-muted-foreground text-right">Generated by Smart Prospect</p>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Message History Tabs */}
        {messageStatus === 'idle' && (
          <Tabs value={messageTab} onValueChange={setMessageTab}>
            <TabsList>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>

            <TabsContent value={messageTab} className="mt-6">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No messages yet. Generate your first message!
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contact</TableHead>
                        <TableHead>Subject / Preview</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Delivery</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((message) => (
                        <TableRow key={message.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {message.contact?.firstName} {message.contact?.lastName}
                              {message.contact?.smsOptedOut && (
                                <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 gap-0.5">
                                  <Ban className="w-2.5 h-2.5" /> Opted out
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                            {message.subject || message.body.substring(0, 50)}
                          </TableCell>
                          <TableCell>
                            {message.channel === 'email' ? (
                              <Mail className="w-4 h-4" />
                            ) : (
                              <MessageSquare className="w-4 h-4" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                message.status === 'sent'
                                  ? 'default'
                                  : message.status === 'opted_out'
                                  ? 'outline'
                                  : message.status === 'draft'
                                  ? 'outline'
                                  : 'destructive'
                              }
                              className={message.status === 'opted_out' ? 'text-rose-600 border-rose-300' : ''}
                            >
                              {message.status === 'opted_out' ? 'Opted out' : message.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {message.deliveryStatus ? (
                              <span className={`text-xs ${message.deliveryStatus === 'delivered' ? 'text-emerald-600' : message.deliveryStatus === 'failed' || message.deliveryStatus === 'undelivered' ? 'text-rose-600' : 'text-muted-foreground'}`}>
                                {message.deliveryStatus}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(message.sentAt || message.createdAt)}
                          </TableCell>
                          <TableCell>
                            {message.channel === 'sms' && message.contactId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs"
                                onClick={() => setSmsThreadContactId(message.contactId)}
                                data-testid={`button-sms-thread-${message.id}`}
                              >
                                <MessageCircle className="w-3 h-3" />
                                Thread
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* SMS Thread Dialog */}
      <Dialog open={!!smsThreadContactId} onOpenChange={(open) => !open && setSmsThreadContactId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              SMS Thread — {smsThreadData?.contact?.firstName} {smsThreadData?.contact?.lastName}
            </DialogTitle>
            <DialogDescription className="flex items-center justify-between">
              <span>{smsThreadData?.contact?.phone || 'No phone number'}</span>
              {smsThreadData?.smsOptedOut ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-rose-600 border-rose-300 gap-1">
                    <Ban className="w-3 h-3" /> Opted out
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => smsThreadContactId && optIn(smsThreadContactId)}
                    data-testid="button-opt-in-contact"
                  >
                    <RotateCcw className="w-3 h-3" /> Re-subscribe
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 text-rose-600 hover:text-rose-700"
                  onClick={() => smsThreadContactId && optOut(smsThreadContactId)}
                  data-testid="button-opt-out-contact"
                >
                  <Ban className="w-3 h-3" /> Mark opted out
                </Button>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[360px] pr-2">
            {!smsThreadData || smsThreadData.thread.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No SMS messages yet for this contact.
              </div>
            ) : (
              <div className="space-y-3 py-2">
                {smsThreadData.thread.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex ${entry.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        entry.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : entry.isOptOut
                          ? 'bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-bl-sm'
                          : 'bg-muted rounded-bl-sm'
                      }`}
                    >
                      <p className="leading-snug">{entry.body}</p>
                      <div className={`flex items-center gap-1.5 mt-1 ${entry.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[10px] opacity-60">
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                        </span>
                        {entry.direction === 'outbound' && entry.deliveryStatus && (
                          <span className={`text-[10px] font-medium ${entry.deliveryStatus === 'delivered' ? 'text-emerald-300' : entry.deliveryStatus === 'failed' ? 'text-rose-300' : 'opacity-60'}`}>
                            · {entry.deliveryStatus}
                          </span>
                        )}
                        {entry.isOptOut && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 text-rose-600 border-rose-300">STOP</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Send confirmation dialog */}
      <AlertDialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Messages</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to send {approvedCount} message{approvedCount !== 1 ? 's' : ''}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSend}
              disabled={isSending}
              className="bg-primary hover:bg-primary/90"
            >
              {isSending ? 'Sending...' : 'Send Messages'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

BrokerOutreachPage.displayName = 'BrokerOutreachPage';

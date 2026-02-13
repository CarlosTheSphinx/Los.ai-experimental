import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Sparkles, Send, Mail, MessageSquare, Copy, Check } from 'lucide-react';
import { api } from '@shared/routes';

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  contactType: string;
}

interface OutreachMessage {
  id: number;
  contactId: number;
  contact?: Contact;
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  personalizedBody: string;
  status: 'draft' | 'approved' | 'sent' | 'failed';
  sentAt?: string;
  createdAt: string;
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

  // Fetch contacts
  const { data: contactsData } = useQuery({
    queryKey: ['broker-contacts-all'],
    queryFn: async () => {
      const response = await fetch(`${api.baseUrl}/api/broker/contacts?limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
  });

  const allContacts = contactsData?.contacts || [];

  // Fetch suggestions
  const { data: suggestionsData } = useQuery({
    queryKey: ['broker-suggestions'],
    queryFn: async () => {
      const response = await fetch(`${api.baseUrl}/api/broker/suggestions`);
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
        `${api.baseUrl}/api/broker/outreach/messages?status=${messageTab}`
      );
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
  });

  const messages: OutreachMessage[] = messagesData || [];

  // Generate messages mutation
  const { mutate: generateMessages, isPending: isGenerating } = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${api.baseUrl}/api/broker/outreach/generate`, {
        method: 'POST',
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
      const response = await fetch(`${api.baseUrl}/api/broker/outreach/send-batch`, {
        method: 'POST',
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
        `${api.baseUrl}/api/broker/suggestions/${suggestionId}/execute`,
        { method: 'POST' }
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

  const handleGenerate = () => {
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
                      onClick={() => executeSuggestion(suggestion.id)}
                      disabled={isExecuting}
                      className="gap-2"
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
                      setSelectedContacts(allContacts.map((c) => c.id));
                    } else if (value) {
                      setSelectedContacts([...selectedContacts, parseInt(value)]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose contacts..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contacts ({allContacts.length})</SelectItem>
                    {allContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id.toString()}>
                        {contact.firstName} {contact.lastName}
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
              disabled={isGenerating}
              size="lg"
              className="w-full gap-2"
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
                        <TableHead>Subject</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((message) => (
                        <TableRow key={message.id}>
                          <TableCell className="font-medium">
                            {message.contact?.firstName} {message.contact?.lastName}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
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
                                  : message.status === 'draft'
                                  ? 'outline'
                                  : 'destructive'
                              }
                            >
                              {message.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(message.sentAt || message.createdAt).toLocaleDateString()}
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

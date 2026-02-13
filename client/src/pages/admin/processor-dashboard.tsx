import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Zap,
  Mail,
  MessageSquare,
  Phone,
  CheckCircle,
  AlertCircle,
  Loader2,
  MoreVertical,
  Edit2,
  Save,
  X,
  Calendar,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';

interface QueueItem {
  id: number;
  dealId: number;
  actionType: 'digest_send' | 'document_review' | 'task_creation' | 'message_send';
  status: 'pending' | 'approved' | 'sent' | 'failed';
  actionData: Record<string, any>;
  editedContent: string | null;
  preRenderedContent?: {
    emailSubject?: string;
    emailBody?: string;
    smsBody?: string;
  };
  dealInfo?: {
    name: string;
    borrowerName: string | null;
    propertyAddress: string | null;
  };
}

interface QueueGroup {
  dealId: number;
  dealInfo: {
    name: string;
    borrowerName: string | null;
    propertyAddress: string | null;
  };
  items: QueueItem[];
}

interface QueueStats {
  total: number;
  pending: number;
  approved: number;
  sent: number;
  failed: number;
  byType: {
    digest_send: number;
    document_review: number;
    task_creation: number;
    message_send: number;
  };
}

export default function ProcessorDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('queue');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showExecuteConfirm, setShowExecuteConfirm] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executedItems, setExecutedItems] = useState<number[]>([]);

  // Fetch daily queue
  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ['processor-queue', selectedDate],
    queryFn: async () => {
      const res = await fetch('/api/processor/daily-queue');
      if (!res.ok) throw new Error('Failed to fetch queue');
      return res.json();
    },
  });

  // Update queue item mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      editedContent,
      status,
    }: {
      itemId: number;
      editedContent?: string;
      status?: string;
    }) => {
      const res = await fetch(`/api/processor/queue/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedContent, status }),
      });
      if (!res.ok) throw new Error('Failed to update item');
      return res.json();
    },
    onSuccess: () => {
      refetchQueue();
      queryClient.invalidateQueries({ queryKey: ['processor-queue'] });
    },
  });

  // Approve all mutation
  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/processor/queue/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to approve all');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Approved',
        description: `${data.approvedCount} items approved`,
      });
      refetchQueue();
    },
  });

  // Execute queue mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/processor/queue/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to execute queue');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Execution Complete',
        description: `${data.sent} items sent, ${data.failed} failed`,
      });
      refetchQueue();
      setIsExecuting(false);
    },
  });

  // Handle approve item
  const handleApproveItem = async (itemId: number) => {
    try {
      await updateItemMutation.mutateAsync({
        itemId,
        status: 'approved',
      });
      toast({
        title: 'Item approved',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to approve item',
        variant: 'destructive',
      });
    }
  };

  // Handle execute all
  const handleExecuteAll = async () => {
    setIsExecuting(true);
    setExecutionProgress(0);
    const startTime = Date.now();

    try {
      const result = await executeMutation.mutateAsync();

      // Simulate progress animation
      for (let i = 0; i < result.results.length; i++) {
        setExecutionProgress((i / result.results.length) * 100);
        setExecutedItems(prev => [...prev, result.results[i].itemId]);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      setExecutionProgress(100);
      playSuccessSound();

      // Play confetti
      celebrateSuccess();

      setTimeout(() => {
        setShowExecuteConfirm(false);
        setExecutedItems([]);
        setExecutionProgress(0);
      }, 2000);
    } catch (error) {
      toast({
        title: 'Execution failed',
        description: String(error),
        variant: 'destructive',
      });
      setIsExecuting(false);
    }
  };

  // Play success sound
  const playSuccessSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('Sound playback not supported');
    }
  };

  // Celebrate success
  const celebrateSuccess = () => {
    // Simple confetti simulation with CSS
    const confettiCount = 50;
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.style.position = 'fixed';
      confetti.style.width = '10px';
      confetti.style.height = '10px';
      confetti.style.backgroundColor = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffd93d', '#6bcf7f'][Math.floor(Math.random() * 5)];
      confetti.style.left = Math.random() * window.innerWidth + 'px';
      confetti.style.top = '-10px';
      confetti.style.borderRadius = '50%';
      confetti.style.pointerEvents = 'none';
      confetti.style.zIndex = '9999';
      document.body.appendChild(confetti);

      const duration = 2000 + Math.random() * 1000;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;

        if (progress < 1) {
          confetti.style.top = (progress * window.innerHeight) + 'px';
          confetti.style.left = (parseFloat(confetti.style.left) + (Math.random() - 0.5) * 2) + 'px';
          confetti.style.opacity = String(1 - progress);
          requestAnimationFrame(animate);
        } else {
          confetti.remove();
        }
      };

      animate();
    }
  };

  const queue = queueData?.queue || [];
  const stats: QueueStats = queueData?.stats || {};
  const approvedCount = stats.approved || 0;

  const toggleItemExpanded = (itemId: number) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setExpandedItems(newSet);
  };

  const getActionTypeIcon = (type: string) => {
    switch (type) {
      case 'digest_send':
        return <Mail className="h-4 w-4" />;
      case 'document_review':
        return <FileText className="h-4 w-4" />;
      case 'task_creation':
        return <CheckCircle className="h-4 w-4" />;
      case 'message_send':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'digest_send':
        return 'Digest Send';
      case 'document_review':
        return 'Document Review';
      case 'task_creation':
        return 'Task Creation';
      case 'message_send':
        return 'Message Send';
      default:
        return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-blue-100 text-blue-800';
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (queueLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-8 w-8 text-blue-600" />
              One-Click Processing
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Powered by Lane — AI Document Review</p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => refetchQueue()}
              disabled={queueLoading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-900">{stats.total || 0}</div>
              <p className="text-sm text-blue-700">Total Items</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-900">{stats.pending || 0}</div>
              <p className="text-sm text-yellow-700">Pending</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-900">{stats.approved || 0}</div>
              <p className="text-sm text-purple-700">Approved</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-900">{stats.sent || 0}</div>
              <p className="text-sm text-green-700">Sent</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-50 to-red-100">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-900">{stats.failed || 0}</div>
              <p className="text-sm text-red-700">Failed</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-emerald-900">~12 hrs</div>
              <p className="text-sm text-emerald-700">Est. Time Saved</p>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1"
          >
            <Button
              onClick={() => approveAllMutation.mutate()}
              variant="outline"
              className="w-full"
              disabled={stats.pending === 0 || approveAllMutation.isPending}
            >
              {approveAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Approve All
            </Button>
          </motion.div>

          {/* THE GO BUTTON */}
          <motion.div
            whileHover={approvedCount > 0 ? { scale: 1.05 } : {}}
            whileTap={approvedCount > 0 ? { scale: 0.95 } : {}}
            animate={approvedCount > 0 ? { boxShadow: ['0 0 0 0 rgba(59, 130, 246, 0.7)', '0 0 0 10px rgba(59, 130, 246, 0)'] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex-1"
          >
            <Button
              onClick={() => setShowExecuteConfirm(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-6 h-auto text-lg"
              disabled={approvedCount === 0 || isExecuting}
            >
              {isExecuting ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Zap className="h-5 w-5 mr-2" />
              )}
              {isExecuting
                ? 'Processing...'
                : `Send ${approvedCount} Items`}
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="queue">Queue Items</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          {queue.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="text-lg font-semibold">All caught up!</p>
                <p className="text-muted-foreground">No deals in the processing queue.</p>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence>
              {queue.map((group: QueueGroup, groupIdx) => (
                <motion.div
                  key={`group-${group.dealId}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIdx * 0.1 }}
                >
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{group.dealInfo.name}</CardTitle>
                          <CardDescription className="mt-1 space-y-1">
                            {group.dealInfo.borrowerName && (
                              <div>Borrower: {group.dealInfo.borrowerName}</div>
                            )}
                            {group.dealInfo.propertyAddress && (
                              <div>Property: {group.dealInfo.propertyAddress}</div>
                            )}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">{group.items.length} items</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <AnimatePresence>
                        {group.items.map((item, idx) => (
                          <QueueItemCard
                            key={item.id}
                            item={item}
                            idx={idx}
                            isExpanded={expandedItems.has(item.id)}
                            onToggleExpand={() => toggleItemExpanded(item.id)}
                            onApprove={() => handleApproveItem(item.id)}
                            isExecuted={executedItems.includes(item.id)}
                            isExecuting={isExecuting}
                          />
                        ))}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                History view coming soon
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Execution Confirmation Dialog */}
      <AlertDialog open={showExecuteConfirm} onOpenChange={setShowExecuteConfirm}>
        <AlertDialogContent>
          <AlertDialogTitle>Execute Queue</AlertDialogTitle>
          <AlertDialogDescription>
            You're about to send {approvedCount} items. This action cannot be undone.
            Continue?
          </AlertDialogDescription>
          {isExecuting && (
            <div className="space-y-2">
              <Progress value={executionProgress} />
              <p className="text-sm text-muted-foreground">
                {executedItems.length} of {approvedCount} items processed...
              </p>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={isExecuting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecuteAll}
              disabled={isExecuting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isExecuting ? 'Processing...' : 'Execute'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Overlay */}
      {executionProgress === 100 && !isExecuting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 flex items-center justify-center bg-black/50 pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-lg p-8 text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            </motion.div>
            <h2 className="text-2xl font-bold mb-2">All Done!</h2>
            <p className="text-muted-foreground">Queue processed successfully</p>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Queue Item Card Component
 */
function QueueItemCard({
  item,
  idx,
  isExpanded,
  onToggleExpand,
  onApprove,
  isExecuted,
  isExecuting,
}: {
  item: QueueItem;
  idx: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApprove: () => void;
  isExecuted: boolean;
  isExecuting: boolean;
}) {
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editedContent, setEditedContent] = useState(item.editedContent || '');

  const getActionTypeIcon = (type: string) => {
    switch (type) {
      case 'digest_send':
        return <Mail className="h-4 w-4" />;
      case 'document_review':
        return <FileText className="h-4 w-4" />;
      case 'task_creation':
        return <CheckCircle className="h-4 w-4" />;
      case 'message_send':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'digest_send':
        return 'Digest Send';
      case 'document_review':
        return 'Document Review';
      case 'task_creation':
        return 'Task Creation';
      case 'message_send':
        return 'Message Send';
      default:
        return type;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={isExecuted ? { opacity: 0, x: 100 } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {getActionTypeIcon(item.actionType)}
            <span className="font-medium">{getActionTypeLabel(item.actionType)}</span>
            <Badge variant={item.status === 'approved' ? 'default' : 'outline'}>
              {item.status}
            </Badge>
          </div>

          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 mt-3"
            >
              {item.preRenderedContent && (
                <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                  {item.preRenderedContent.emailSubject && (
                    <div>
                      <p className="font-semibold text-xs text-gray-600">Subject:</p>
                      <p>{item.preRenderedContent.emailSubject}</p>
                    </div>
                  )}
                  {item.preRenderedContent.emailBody && (
                    <div>
                      <p className="font-semibold text-xs text-gray-600">Message:</p>
                      <p className="whitespace-pre-wrap">{item.preRenderedContent.emailBody}</p>
                    </div>
                  )}
                </div>
              )}

              {item.actionType === 'digest_send' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Add a note for this recipient:</label>
                  <Textarea
                    placeholder="Add any notes or changes..."
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="text-sm"
                  />
                </div>
              )}
            </motion.div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>

          {item.status === 'pending' && (
            <Button
              variant="default"
              size="sm"
              onClick={onApprove}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Approve
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

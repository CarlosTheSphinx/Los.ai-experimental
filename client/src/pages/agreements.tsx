import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  MoreVertical,
  Search,
  CheckCircle,
  Clock,
  Send,
  XCircle,
  Eye,
  RefreshCw,
  Trash2,
  Edit,
  Bell,
  Ban,
  ClipboardList,
  Users,
  Calendar,
  ChevronRight,
  MessageSquare
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Signer {
  id: number;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'viewed' | 'signed';
  signedAt?: string;
  tokenExpiresAt?: string;
}

interface Agreement {
  id: number;
  title: string;
  status: 'draft' | 'pending' | 'sent' | 'in_progress' | 'completed' | 'voided' | 'voided_edited' | 'expired';
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
  voidedAt?: string;
  quoteId?: number;
  totalSigners: number;
  signedCount: number;
  signers: Signer[];
}

type FilterTab = 'all' | 'draft' | 'sent' | 'in_progress' | 'completed' | 'voided';

const filterTabs: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'sent', label: 'Sent' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' }
];

export default function Agreements() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const { data, isLoading } = useQuery<{ success: boolean; agreements: Agreement[] }>({
    queryKey: ['/api/esignature/agreements']
  });

  const voidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      return apiRequest('POST', `/api/esignature/agreements/${id}/void`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Document Voided", description: "The document has been cancelled and signers notified." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
      setVoidDialogOpen(false);
      setVoidReason('');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to void document", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/esignature/agreements/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Draft Deleted", description: "The draft has been removed." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
      setDeleteDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete draft", variant: "destructive" });
    }
  });

  const resendAllMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/esignature/agreements/${id}/resend-all`, { senderName: "Sphinx Capital" });
    },
    onSuccess: (data: any) => {
      toast({ title: "Emails Resent", description: data.message || "Signing requests resent." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resend emails", variant: "destructive" });
    }
  });

  const remindMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/esignature/agreements/${id}/remind`, { senderName: "Sphinx Capital" });
    },
    onSuccess: (data: any) => {
      toast({ title: "Reminders Sent", description: data.message || "Reminders sent to pending signers." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send reminders", variant: "destructive" });
    }
  });

  const editMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/esignature/agreements/${id}/edit`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
      if (data.newDocumentId) {
        toast({ title: "Document Copied", description: "Opening the new draft for editing." });
        setLocation(`/agreements/${data.newDocumentId}`);
      } else {
        toast({ title: "Document Copied", description: "You can now edit and resend the document." });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create editable copy", variant: "destructive" });
    }
  });

  const agreements = data?.agreements || [];
  
  const filteredAgreements = agreements.filter(a => {
    const matchesFilter = activeFilter === 'all' || 
      (activeFilter === 'voided' && (a.status === 'voided' || a.status === 'voided_edited')) ||
      (activeFilter === 'sent' && (a.status === 'sent' || a.status === 'pending')) ||
      a.status === activeFilter;
    
    const matchesSearch = searchQuery === '' || 
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.signers.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesFilter && matchesSearch;
  });

  const getFilterCount = (filter: FilterTab) => {
    if (filter === 'all') return agreements.length;
    if (filter === 'voided') return agreements.filter(a => a.status === 'voided' || a.status === 'voided_edited').length;
    if (filter === 'sent') return agreements.filter(a => a.status === 'sent' || a.status === 'pending').length;
    return agreements.filter(a => a.status === filter).length;
  };

  const getStatusBadge = (agreement: Agreement) => {
    const status = agreement.status;
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" data-testid={`badge-status-${agreement.id}`}>Draft</Badge>;
      case 'pending':
      case 'sent':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200" data-testid={`badge-status-${agreement.id}`}>Sent</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200" data-testid={`badge-status-${agreement.id}`}>In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 border-green-200" data-testid={`badge-status-${agreement.id}`}>Completed</Badge>;
      case 'voided':
      case 'voided_edited':
        return <Badge variant="destructive" data-testid={`badge-status-${agreement.id}`}>Voided</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`badge-status-${agreement.id}`}>{status}</Badge>;
    }
  };

  const getSignerProgress = (agreement: Agreement) => {
    if (agreement.totalSigners === 0) return null;
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Users className="w-4 h-4" />
        <span>{agreement.signedCount}/{agreement.totalSigners} signed</span>
      </div>
    );
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handleVoid = (agreement: Agreement) => {
    setSelectedAgreement(agreement);
    setVoidDialogOpen(true);
  };

  const handleDelete = (agreement: Agreement) => {
    setSelectedAgreement(agreement);
    setDeleteDialogOpen(true);
  };

  const canVoid = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canResend = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canRemind = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canEdit = (status: string) => status !== 'completed';
  const canDelete = (status: string) => status === 'draft';

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-primary">Agreements</h1>
              <p className="text-sm text-slate-500">Manage and track all your e-signature documents</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {filterTabs.map(tab => (
              <Button
                key={tab.value}
                variant={activeFilter === tab.value ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveFilter(tab.value)}
                data-testid={`tab-filter-${tab.value}`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-70">({getFilterCount(tab.value)})</span>
              </Button>
            ))}
          </div>
          
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search agreements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-agreements"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredAgreements.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 mb-2">No Agreements Found</h3>
              <p className="text-slate-400">
                {activeFilter === 'all' 
                  ? "Create a quote and send it for signature to get started." 
                  : `No agreements with status "${activeFilter}".`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredAgreements.map((agreement) => (
              <Card 
                key={agreement.id} 
                className="hover-elevate cursor-pointer transition-shadow" 
                data-testid={`card-agreement-${agreement.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/agreements/${agreement.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h3 className="font-semibold text-slate-800 truncate" data-testid={`text-agreement-title-${agreement.id}`}>
                              {agreement.title}
                            </h3>
                            {getStatusBadge(agreement)}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {agreement.sentAt ? `Sent ${formatDate(agreement.sentAt)}` : `Created ${formatDate(agreement.createdAt)}`}
                            </span>
                            {getSignerProgress(agreement)}
                            {agreement.completedAt && (
                              <span className="flex items-center gap-1.5 text-green-600">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Completed {formatDate(agreement.completedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <ChevronRight className="w-5 h-5 text-slate-400 hidden sm:block" />
                      </div>
                    </Link>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`button-actions-${agreement.id}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/agreements/${agreement.id}`} className="flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        
                        {agreement.quoteId && (
                          <DropdownMenuItem asChild>
                            <Link 
                              href={`/messages?dealId=${agreement.quoteId}&new=true`} 
                              className="flex items-center gap-2"
                              data-testid={`action-message-${agreement.id}`}
                            >
                              <MessageSquare className="w-4 h-4" />
                              Message about Deal
                            </Link>
                          </DropdownMenuItem>
                        )}
                        
                        {canResend(agreement.status) && (
                          <DropdownMenuItem 
                            onClick={() => resendAllMutation.mutate(agreement.id)}
                            disabled={resendAllMutation.isPending}
                            data-testid={`action-resend-${agreement.id}`}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Resend to All
                          </DropdownMenuItem>
                        )}
                        
                        {canRemind(agreement.status) && (
                          <DropdownMenuItem 
                            onClick={() => remindMutation.mutate(agreement.id)}
                            disabled={remindMutation.isPending}
                            data-testid={`action-remind-${agreement.id}`}
                          >
                            <Bell className="w-4 h-4 mr-2" />
                            Send Reminder
                          </DropdownMenuItem>
                        )}
                        
                        {canEdit(agreement.status) && agreement.status !== 'draft' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => editMutation.mutate(agreement.id)}
                              disabled={editMutation.isPending}
                              data-testid={`action-edit-${agreement.id}`}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit & Resend
                            </DropdownMenuItem>
                          </>
                        )}
                        
                        {canVoid(agreement.status) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleVoid(agreement)}
                              className="text-red-600"
                              data-testid={`action-void-${agreement.id}`}
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              Void Document
                            </DropdownMenuItem>
                          </>
                        )}
                        
                        {canDelete(agreement.status) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(agreement)}
                              className="text-red-600"
                              data-testid={`action-delete-${agreement.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Draft
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the draft "{selectedAgreement?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAgreement && deleteMutation.mutate(selectedAgreement.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Document</DialogTitle>
            <DialogDescription>
              This will cancel the document "{selectedAgreement?.title}" and notify all signers. They will no longer be able to sign.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-slate-700">Reason (optional)</label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Enter a reason for voiding this document..."
              className="mt-2"
              data-testid="input-void-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)} data-testid="button-cancel-void">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedAgreement && voidMutation.mutate({ id: selectedAgreement.id, reason: voidReason })}
              disabled={voidMutation.isPending}
              data-testid="button-confirm-void"
            >
              {voidMutation.isPending ? "Voiding..." : "Void Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

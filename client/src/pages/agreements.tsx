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
  MessageSquare,
  ExternalLink
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";
import type { SavedQuote } from "@shared/schema";

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
  vendor?: 'local' | 'pandadoc';
  externalDocumentId?: string;
  editorUrl?: string;
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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editDocumentId, setEditDocumentId] = useState<number | null>(null);
  const [editQuoteData, setEditQuoteData] = useState<SavedQuote | null>(null);

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

  const sendPandadocMutation = useMutation({
    mutationFn: async ({ envelopeId, sendMethod }: { envelopeId: number; sendMethod?: string }) => {
      return apiRequest('POST', `/api/esign/pandadoc/documents/${envelopeId}/send`, { sendMethod: sendMethod || 'email' });
    },
    onSuccess: () => {
      toast({ title: "Document Sent", description: "The PandaDoc document has been sent for signing." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send PandaDoc document", variant: "destructive" });
    }
  });

  const getStatusBadge = (agreement: Agreement) => {
    const status = agreement.status;
    const isPandadoc = agreement.vendor === 'pandadoc';
    const badges = [];
    
    if (isPandadoc) {
      badges.push(
        <Badge key="vendor" className="bg-purple-100 text-purple-700 border-purple-200" data-testid={`badge-vendor-${agreement.id}`}>
          PandaDoc
        </Badge>
      );
    }
    
    switch (status) {
      case 'draft':
        badges.push(<Badge key="status" variant="secondary" data-testid={`badge-status-${agreement.id}`}>Draft</Badge>);
        break;
      case 'pending':
      case 'sent':
        badges.push(<Badge key="status" className="bg-amber-100 text-amber-700 border-amber-200" data-testid={`badge-status-${agreement.id}`}>Sent</Badge>);
        break;
      case 'in_progress':
        badges.push(<Badge key="status" className="bg-blue-100 text-blue-700 border-blue-200" data-testid={`badge-status-${agreement.id}`}>In Progress</Badge>);
        break;
      case 'completed':
        badges.push(<Badge key="status" className="bg-green-100 text-green-700 border-green-200" data-testid={`badge-status-${agreement.id}`}>Completed</Badge>);
        break;
      case 'voided':
      case 'voided_edited':
        badges.push(<Badge key="status" variant="destructive" data-testid={`badge-status-${agreement.id}`}>Voided</Badge>);
        break;
      default:
        badges.push(<Badge key="status" variant="secondary" data-testid={`badge-status-${agreement.id}`}>{status}</Badge>);
    }
    
    return <>{badges}</>;
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

  const handleEditDocument = async (agreement: Agreement) => {
    if (agreement.vendor === 'pandadoc') {
      if (agreement.editorUrl) {
        window.open(agreement.editorUrl, '_blank');
      }
      return;
    }
    
    try {
      let targetDocId = agreement.id;
      
      if (agreement.status === 'sent' || agreement.status === 'pending' || agreement.status === 'in_progress') {
        const editRes = await apiRequest('POST', `/api/esignature/agreements/${agreement.id}/edit`);
        const editData = await editRes.json();
        if (editData.success && editData.newDocumentId) {
          targetDocId = editData.newDocumentId;
          queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
        } else {
          toast({ title: "Error", description: editData.error || "Failed to create editable copy", variant: "destructive" });
          return;
        }
      }
      
      if (agreement.quoteId) {
        const quoteRes = await fetch(`/api/quotes/${agreement.quoteId}`, { credentials: 'include' });
        const quoteData = await quoteRes.json();
        if (quoteData) {
          setEditQuoteData(quoteData);
        } else {
          setEditQuoteData({ id: agreement.quoteId, quoteName: agreement.title } as any);
        }
      } else {
        setEditQuoteData({ id: 0, quoteName: agreement.title } as any);
      }
      
      setEditDocumentId(targetDocId);
      setEditModalOpen(true);
    } catch (err) {
      console.error('Failed to open editor:', err);
      toast({ title: "Error", description: "Failed to open editor", variant: "destructive" });
    }
  };

  const handleSendDocument = async (agreement: Agreement) => {
    if (agreement.vendor === 'pandadoc') {
      sendPandadocMutation.mutate({ envelopeId: agreement.id });
      return;
    }
    
    try {
      const res = await apiRequest('POST', `/api/documents/${agreement.id}/send`, { senderName: 'Sphinx Capital' });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Document Sent!", description: `Signing invitations sent to ${agreement.totalSigners} signer(s)` });
        queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
      } else {
        toast({ title: "Error", description: data.error || "Failed to send", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send document", variant: "destructive" });
    }
  };

  const canVoid = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canResend = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canRemind = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canEdit = (status: string) => !['completed', 'voided', 'voided_edited'].includes(status);
  const canDelete = (status: string) => status === 'draft';

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3">
            <ClipboardList className="w-5 h-5 md:w-6 md:h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-primary truncate">Term Sheets</h1>
              <p className="text-xs md:text-sm text-slate-500 hidden sm:block">Manage and track all your e-signature documents</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-3 md:space-y-4">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="relative w-full sm:hidden">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search term sheets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-agreements-mobile"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-1 flex-wrap overflow-x-auto w-full sm:w-auto">
              {filterTabs.map(tab => (
                <Button
                  key={tab.value}
                  variant={activeFilter === tab.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveFilter(tab.value)}
                  data-testid={`tab-filter-${tab.value}`}
                  className="text-xs sm:text-sm shrink-0"
                >
                  {tab.label}
                  <span className="ml-1 text-xs opacity-70">({getFilterCount(tab.value)})</span>
                </Button>
              ))}
            </div>
            
            <div className="relative w-64 hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search term sheets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-agreements"
              />
            </div>
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
              <h3 className="text-xl font-semibold text-slate-600 mb-2">No Term Sheets Found</h3>
              <p className="text-slate-400">
                {activeFilter === 'all' 
                  ? "Create a quote and send it for signature to get started." 
                  : `No term sheets with status "${activeFilter}".`}
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
                    {agreement.vendor === 'pandadoc' ? (
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        data-testid={`link-pandadoc-${agreement.id}`}
                        onClick={() => {
                          if (agreement.editorUrl) {
                            window.open(agreement.editorUrl, '_blank');
                          }
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-purple-100">
                            <ExternalLink className="w-5 h-5 text-purple-600" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                          
                          <ExternalLink className="w-5 h-5 text-slate-400 hidden sm:block" />
                        </div>
                      </div>
                    ) : (
                      <Link href={`/agreements/${agreement.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center gap-4">
                          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                    )}
                    
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
                        {agreement.vendor === 'pandadoc' ? (
                          <>
                            {agreement.editorUrl && (
                              <DropdownMenuItem 
                                onClick={() => window.open(agreement.editorUrl, '_blank')}
                                data-testid={`action-open-pandadoc-${agreement.id}`}
                              >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Open in PandaDoc
                              </DropdownMenuItem>
                            )}
                            
                            {agreement.status === 'draft' && (
                              <DropdownMenuItem 
                                onClick={() => sendPandadocMutation.mutate({ envelopeId: agreement.id })}
                                disabled={sendPandadocMutation.isPending}
                                data-testid={`action-send-pandadoc-${agreement.id}`}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                Send for Signature
                              </DropdownMenuItem>
                            )}
                            
                            {agreement.quoteId && (
                              <>
                                <DropdownMenuSeparator />
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
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem asChild>
                              <Link href={`/agreements/${agreement.id}`} className="flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            
                            {agreement.status === 'draft' && (
                              <DropdownMenuItem 
                                onClick={() => handleEditDocument(agreement)}
                                data-testid={`action-edit-draft-${agreement.id}`}
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            
                            {agreement.status === 'draft' && (
                              <DropdownMenuItem 
                                onClick={() => handleSendDocument(agreement)}
                                data-testid={`action-send-${agreement.id}`}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                Send for Signature
                              </DropdownMenuItem>
                            )}
                            
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
                                  onClick={() => handleEditDocument(agreement)}
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

      {editQuoteData && (
        <DocumentSigningModal
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditDocumentId(null);
            setEditQuoteData(null);
            queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
          }}
          quote={editQuoteData as any}
          existingDocumentId={editDocumentId || undefined}
        />
      )}
    </div>
  );
}

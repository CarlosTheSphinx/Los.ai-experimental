import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ArrowLeft,
  Download,
  MoreVertical,
  CheckCircle,
  Clock,
  Send,
  XCircle,
  RefreshCw,
  Bell,
  Ban,
  User,
  Eye,
  Edit,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Document, Page, pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Signer {
  id: number;
  name: string;
  email: string;
  color: string;
  status: 'pending' | 'sent' | 'viewed' | 'signed';
  signedAt?: string;
  tokenExpiresAt?: string;
  token?: string;
}

interface Field {
  id: number;
  fieldType: string;
  signerId: number | null;
  signerName: string | null;
  signerColor: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string | null;
  label: string | null;
  signed: boolean;
}

interface AgreementDetail {
  id: number;
  title: string;
  fileName: string;
  fileData: string;
  pageCount: number;
  status: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
  voidedAt?: string;
  voidedReason?: string;
  signers: Signer[];
  fields: Field[];
}

export default function AgreementDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/agreements/:id");
  const agreementId = params?.id;

  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [pdfError, setPdfError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ success: boolean; agreement: AgreementDetail }>({
    queryKey: ['/api/esignature/agreements', agreementId],
    enabled: !!agreementId
  });

  const agreement = data?.agreement;

  const voidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      return apiRequest('POST', `/api/esignature/agreements/${id}/void`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Document Voided", description: "The document has been cancelled and signers notified." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements', agreementId] });
      setVoidDialogOpen(false);
      setVoidReason('');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to void document", variant: "destructive" });
    }
  });

  const resendAllMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/esignature/agreements/${id}/resend-all`, { senderName: "Lendry.AI" });
    },
    onSuccess: (result: any) => {
      toast({ title: "Emails Resent", description: result.message || "Signing requests resent." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements', agreementId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resend emails", variant: "destructive" });
    }
  });

  const resendSignerMutation = useMutation({
    mutationFn: async ({ docId, signerId }: { docId: number; signerId: number }) => {
      return apiRequest('POST', `/api/esignature/agreements/${docId}/resend-signer/${signerId}`, { senderName: "Lendry.AI" });
    },
    onSuccess: (result: any) => {
      toast({ title: "Email Resent", description: result.message || "Email sent." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements', agreementId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resend email", variant: "destructive" });
    }
  });

  const remindMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('POST', `/api/esignature/agreements/${id}/remind`, { senderName: "Lendry.AI" });
    },
    onSuccess: (result: any) => {
      toast({ title: "Reminders Sent", description: result.message || "Reminders sent to pending signers." });
      queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements', agreementId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send reminders", variant: "destructive" });
    }
  });

  const [, navigate] = useLocation();

  const editMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/esignature/agreements/${id}/edit`, {});
      return res.json();
    },
    onSuccess: (result: any) => {
      if (result.success && result.newDocumentId) {
        toast({ title: "Document Copied", description: "A new draft has been created for editing." });
        queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
        navigate(`/quotes`);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create editable copy", variant: "destructive" });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'pending':
      case 'sent':
        return <Badge className="bg-warning/10 text-warning border-border">Sent</Badge>;
      case 'in_progress':
        return <Badge className="bg-info/10 text-info border-border">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-success/10 text-success border-border">Completed</Badge>;
      case 'voided':
      case 'voided_edited':
        return <Badge variant="destructive">Voided</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSignerStatusIcon = (status: string) => {
    switch (status) {
      case 'signed':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'viewed':
        return <Eye className="w-4 h-4 text-info" />;
      case 'sent':
        return <Send className="w-4 h-4 text-warning" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const canVoid = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canResend = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canRemind = (status: string) => ['sent', 'pending', 'in_progress'].includes(status);
  const canEdit = (status: string) => ['draft', 'sent', 'pending', 'in_progress'].includes(status);
  const canDownload = (status: string) => ['completed', 'voided', 'voided_edited'].includes(status) || true;

  const currentPageFields = agreement?.fields.filter(f => f.pageNumber === currentPage) || [];

  // Handle both cases: fileData with or without the data URL prefix
  const pdfDataUrl = agreement?.fileData 
    ? (agreement.fileData.startsWith('data:') 
        ? agreement.fileData 
        : `data:application/pdf;base64,${agreement.fileData}`)
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="p-6">
        <Card className="text-center py-12">
          <CardContent>
            <XCircle className="w-16 h-16 mx-auto text-destructive/40 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Term Sheet Not Found</h3>
            <p className="text-muted-foreground mb-4">The term sheet you're looking for doesn't exist.</p>
            <Link href="/agreements">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Term Sheets
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/agreements">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-foreground tracking-tight" data-testid="text-agreement-title">
                    {agreement.title}
                  </h1>
                  {getStatusBadge(agreement.status)}
                </div>
                <p className="text-sm text-muted-foreground">{agreement.fileName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {agreement.status === 'completed' && (
                <a href={`/api/documents/${agreement.id}/download`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" data-testid="button-download">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </a>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="button-actions">
                    Actions
                    <MoreVertical className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild data-testid="action-download">
                    <a href={`/api/documents/${agreement.id}/download`} target="_blank" rel="noopener noreferrer">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </a>
                  </DropdownMenuItem>
                  
                  {canEdit(agreement.status) && (
                    <DropdownMenuItem
                      onClick={() => editMutation.mutate(agreement.id)}
                      disabled={editMutation.isPending}
                      data-testid="action-edit"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit & Resend
                    </DropdownMenuItem>
                  )}
                  
                  {canResend(agreement.status) && (
                    <DropdownMenuItem
                      onClick={() => resendAllMutation.mutate(agreement.id)}
                      disabled={resendAllMutation.isPending}
                      data-testid="action-resend-all"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Resend to All
                    </DropdownMenuItem>
                  )}
                  
                  {canRemind(agreement.status) && (
                    <DropdownMenuItem
                      onClick={() => remindMutation.mutate(agreement.id)}
                      disabled={remindMutation.isPending}
                      data-testid="action-remind"
                    >
                      <Bell className="w-4 h-4 mr-2" />
                      Send Reminder
                    </DropdownMenuItem>
                  )}
                  
                  {canVoid(agreement.status) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setVoidDialogOpen(true)}
                        className="text-destructive"
                        data-testid="action-void"
                      >
                        <Ban className="w-4 h-4 mr-2" />
                        Cancel Document
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        <div className="flex-1 p-6">
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-foreground">
                    Page {currentPage} of {agreement.pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => Math.min(agreement.pageCount, p + 1))}
                    disabled={currentPage === agreement.pageCount}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                    disabled={scale <= 0.5}
                    data-testid="button-zoom-out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-foreground w-16 text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setScale(s => Math.min(2, s + 0.25))}
                    disabled={scale >= 2}
                    data-testid="button-zoom-in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="relative bg-muted rounded overflow-auto max-h-[600px] flex justify-center">
                <div className="relative">
                  {pdfError && (
                    <div className="flex flex-col items-center justify-center p-20 text-center">
                      <XCircle className="w-12 h-12 text-destructive mb-4" />
                      <p className="text-foreground mb-2">Unable to load PDF preview</p>
                      <p className="text-sm text-muted-foreground">{pdfError}</p>
                    </div>
                  )}
                  {pdfDataUrl && !pdfError && (
                    <Document
                      file={pdfDataUrl}
                      loading={
                        <div className="flex items-center justify-center p-20">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                      }
                      onLoadError={(error) => {
                        console.error('PDF load error:', error);
                        setPdfError(error?.message || 'Failed to load PDF');
                      }}
                      onLoadSuccess={() => setPdfError(null)}
                    >
                      <Page
                        pageNumber={currentPage}
                        scale={scale}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                  )}
                  {currentPageFields.map(field => (
                    <div
                      key={field.id}
                      className="absolute border-2 rounded flex items-center justify-center text-xs"
                      style={{
                        left: field.x * scale,
                        top: field.y * scale,
                        width: field.width * scale,
                        height: field.height * scale,
                        borderColor: field.signerColor,
                        backgroundColor: field.signed ? `${field.signerColor}20` : `${field.signerColor}10`
                      }}
                      data-testid={`field-overlay-${field.id}`}
                    >
                      {field.signed ? (
                        field.fieldType === 'signature' ? (
                          <CheckCircle className="w-4 h-4" style={{ color: field.signerColor }} />
                        ) : (
                          <span className="truncate px-1" style={{ color: field.signerColor }}>
                            {field.value}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">{field.fieldType}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-80 border-l bg-white p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Document Details
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{formatDate(agreement.createdAt)}</span>
              </div>
              {agreement.sentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sent</span>
                  <span className="text-foreground">{formatDate(agreement.sentAt)}</span>
                </div>
              )}
              {agreement.completedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="text-success">{formatDate(agreement.completedAt)}</span>
                </div>
              )}
              {agreement.voidedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voided</span>
                  <span className="text-destructive">{formatDate(agreement.voidedAt)}</span>
                </div>
              )}
              {agreement.voidedReason && (
                <div className="pt-2 border-t">
                  <span className="text-muted-foreground block mb-1">Void Reason</span>
                  <span className="text-foreground">{agreement.voidedReason}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Signers ({agreement.signers.length})
            </h3>
            <div className="space-y-3">
              {agreement.signers.map(signer => (
                <Card key={signer.id} data-testid={`signer-card-${signer.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                          style={{ backgroundColor: signer.color }}
                        >
                          {signer.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate text-sm">{signer.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{signer.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {getSignerStatusIcon(signer.status)}
                        {signer.status !== 'signed' && canResend(agreement.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6"
                            onClick={() => resendSignerMutation.mutate({
                              docId: agreement.id,
                              signerId: signer.id
                            })}
                            disabled={resendSignerMutation.isPending}
                            title="Resend email"
                            data-testid={`button-resend-signer-${signer.id}`}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {signer.signedAt && (
                      <p className="text-xs text-success mt-2 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Signed {formatDate(signer.signedAt)}
                      </p>
                    )}
                    {signer.tokenExpiresAt && signer.status !== 'signed' && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires {formatDate(signer.tokenExpiresAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Document</DialogTitle>
            <DialogDescription>
              This will cancel the document and notify all signers. They will no longer be able to sign.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground">Reason (optional)</label>
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
              onClick={() => voidMutation.mutate({ id: agreement.id, reason: voidReason })}
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

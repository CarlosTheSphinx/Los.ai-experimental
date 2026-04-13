import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Download, Send, CheckCircle2, Loader2, FileSignature, Pencil, X, Save, Mail, Eye, EyeOff, ChevronDown, ChevronUp, User, MapPin, DollarSign, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SavedQuote } from "@shared/schema";
import { Document as PDFDocument, Page as PDFPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function safeNumber(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[$,%\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

interface EditFormData {
  customerFirstName: string;
  customerLastName: string;
  customerCompanyName: string;
  propertyAddress: string;
  interestRate: string;
  pointsCharged: string;
  loanAmount: string;
  propertyValue: string;
  ficoScore: string;
  dscr: string;
  prepaymentPenalty: string;
  loanPurpose: string;
  propertyType: string;
}

function getEditFormData(quote: SavedQuote): EditFormData {
  const ld = (quote.loanData || {}) as Record<string, any>;
  return {
    customerFirstName: quote.customerFirstName || '',
    customerLastName: quote.customerLastName || '',
    customerCompanyName: quote.customerCompanyName || '',
    propertyAddress: quote.propertyAddress || '',
    interestRate: quote.interestRate || '',
    pointsCharged: String(quote.pointsCharged ?? ''),
    loanAmount: String(ld.loanAmount || ld.requestedLoanAmount || ld.loanamount || ''),
    propertyValue: String(ld.propertyValue || ld.estValuePurchasePrice || ld.estimatedValue || ld.purchasePrice || ''),
    ficoScore: String(ld.ficoScore || ld.statedFicoScore || ld.creditScore || ld.fico || ''),
    dscr: String(ld.calculatedDscr || ld.dscr || ld.dscrRatio || ld.estimatedDscr || ''),
    prepaymentPenalty: String(ld.prepaymentPenalty || ld.prepayment_penalty || ''),
    loanPurpose: String(ld.loanPurpose || ld.loan_purpose || ld.purpose || ''),
    propertyType: String(ld.propertyType || ld.property_type || ''),
  };
}

interface InternalDocStatus {
  quoteId: number;
  documentId: number;
  documentName: string;
  status: string;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  signerStatus: string | null;
  signerEmail: string | null;
  signerName: string | null;
  hasProject: boolean;
}

function TermSheetProgressBar({ step }: { step: number }) {
  const stages = [
    { label: 'Created', icon: FileText },
    { label: 'Sent', icon: Send },
    { label: 'Opened', icon: Eye },
    { label: 'Signed', icon: CheckCircle2 },
  ];

  return (
    <div className="flex items-center gap-0 w-full" data-testid="term-sheet-progress">
      {stages.map((stage, i) => {
        const isCompleted = i < step;
        const isCurrent = i === step;
        const Icon = stage.icon;
        return (
          <div key={stage.label} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5 relative z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isCompleted
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                    ? 'bg-primary text-white ring-2 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
                data-testid={`progress-step-${stage.label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-[11px] font-medium ${
                isCompleted ? 'text-emerald-600' : isCurrent ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mt-[-18px] ${
                isCompleted ? 'bg-emerald-500' : 'bg-muted'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function QuoteDocuments() {
  const [, params] = useRoute("/quotes/:id/documents");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const quoteId = params?.id ? parseInt(params.id) : null;
  const [downloadingTemplateId, setDownloadingTemplateId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfBlobUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const templateInitializedRef = useRef(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData | null>(null);
  const [pdfVersion, setPdfVersion] = useState(0);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [signatureSent, setSignatureSent] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sendName, setSendName] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const { data: quoteData, isLoading: quoteLoading } = useQuery<{ success: boolean; quote: SavedQuote }>({
    queryKey: ['/api/quotes', quoteId],
    enabled: !!quoteId,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: ['/api/quote-pdf-templates'],
  });

  const { data: internalDocData } = useQuery<{ documents: InternalDocStatus[] }>({
    queryKey: ['/api/internal-documents/bulk', quoteId ? String(quoteId) : ''],
    queryFn: async () => {
      if (!quoteId) return { documents: [] };
      const res = await fetch(`/api/internal-documents/bulk?quoteIds=${quoteId}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!quoteId,
    staleTime: 10000,
  });

  const internalDoc = internalDocData?.documents?.[0] || null;
  const termSheetStep = internalDoc
    ? (internalDoc.status === 'completed' || internalDoc.signerStatus === 'signed') ? 3
      : internalDoc.signerStatus === 'viewed' ? 2
      : (internalDoc.status === 'sent' || internalDoc.signerStatus === 'sent') ? 1
      : 0
    : 0;

  const quote = quoteData?.quote;
  const loanData = quote?.loanData as Record<string, any> | null;

  const availableTemplates = templates || [];

  useEffect(() => {
    if (!templateInitializedRef.current && availableTemplates.length > 0 && selectedTemplateId === null) {
      templateInitializedRef.current = true;
      setSelectedTemplateId(availableTemplates[0].id);
    }
  }, [availableTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!quoteId || templatesLoading || quoteLoading || !quote) return;
    if (availableTemplates.length > 0 && selectedTemplateId === null) return;
    if (!showPdfPreview) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPdfLoading(true);
    setPdfError(null);

    const url = selectedTemplateId
      ? `/api/quotes/${quoteId}/pdf?templateId=${selectedTemplateId}`
      : `/api/quotes/${quoteId}/pdf`;

    fetch(url, { credentials: 'include', signal: controller.signal })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to generate PDF preview');
        }
        return res.blob();
      })
      .then(blob => {
        if (controller.signal.aborted) return;
        if (pdfBlobUrlRef.current) {
          window.URL.revokeObjectURL(pdfBlobUrlRef.current);
        }
        const newUrl = window.URL.createObjectURL(blob);
        pdfBlobUrlRef.current = newUrl;
        setPdfBlobUrl(newUrl);
        setPdfError(null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Failed to load PDF preview";
        setPdfError(msg);
        setPdfBlobUrl(null);
        toast({
          title: "Preview Error",
          description: msg,
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPdfLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [quoteId, selectedTemplateId, templatesLoading, quoteLoading, quote, availableTemplates.length, toast, pdfVersion, showPdfPreview]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        window.URL.revokeObjectURL(pdfBlobUrlRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!pdfContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    observer.observe(pdfContainerRef.current);
    return () => observer.disconnect();
  }, [showPdfPreview]);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPdfError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF render error:', error);
    const msg = 'Unable to render document preview. Try downloading the PDF instead.';
    setPdfError(msg);
    toast({
      title: "Preview Error",
      description: msg,
      variant: "destructive",
    });
  }, [toast]);

  const handleDownloadPdf = async () => {
    if (!quoteId) return;
    setDownloadingTemplateId(selectedTemplateId ?? -1);
    try {
      const url = selectedTemplateId
        ? `/api/quotes/${quoteId}/pdf?templateId=${selectedTemplateId}`
        : `/api/quotes/${quoteId}/pdf`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${quote?.loanNumber || `Quote-${quoteId}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to download PDF",
        variant: "destructive",
      });
    } finally {
      setDownloadingTemplateId(null);
    }
  };

  const handleOpenEdit = () => {
    if (quote) {
      setEditForm(getEditFormData(quote));
      setShowEditPanel(true);
    }
  };

  const updateQuoteMutation = useMutation({
    mutationFn: async (formData: EditFormData) => {
      const response = await apiRequest('PATCH', `/api/quotes/${quoteId}`, {
        customerFirstName: formData.customerFirstName,
        customerLastName: formData.customerLastName,
        customerCompanyName: formData.customerCompanyName || null,
        propertyAddress: formData.propertyAddress,
        interestRate: formData.interestRate,
        pointsCharged: parseFloat(formData.pointsCharged) || 0,
        loanData: {
          ...((quote?.loanData || {}) as Record<string, any>),
          loanAmount: formData.loanAmount,
          propertyValue: formData.propertyValue,
          ficoScore: formData.ficoScore,
          dscr: formData.dscr,
          ...(formData.dscr && /^\d+(\.\d+)?$/.test(formData.dscr.trim()) ? { calculatedDscr: formData.dscr } : {}),
          prepaymentPenalty: formData.prepaymentPenalty,
          loanPurpose: formData.loanPurpose,
          propertyType: formData.propertyType,
        },
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Quote updated successfully." });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes', quoteId] });
      setShowEditPanel(false);
      setPdfVersion(v => v + 1);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update quote",
        variant: "destructive",
      });
    },
  });

  const sendSignatureMutation = useMutation({
    mutationFn: async ({ email, name }: { email: string; name: string }) => {
      const response = await apiRequest('POST', `/api/quotes/${quoteId}/send-internal-signature`, {
        recipientEmail: email,
        recipientName: name,
        templateId: selectedTemplateId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sent", description: data.message || "Term sheet sent for signature." });
      setShowSendDialog(false);
      setSignatureSent(true);
      queryClient.invalidateQueries({ queryKey: ['/api/internal-documents/bulk'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send for signature",
        variant: "destructive",
      });
    },
  });

  const handleOpenSendDialog = () => {
    if (quote) {
      setSendEmail(quote.customerEmail || '');
      setSendName([quote.customerFirstName, quote.customerLastName].filter(Boolean).join(' '));
    }
    setShowSendDialog(true);
  };

  const handleSendSignature = () => {
    if (!sendEmail.trim()) {
      toast({ title: "Error", description: "Please enter an email address", variant: "destructive" });
      return;
    }
    sendSignatureMutation.mutate({ email: sendEmail.trim(), name: sendName.trim() });
  };

  const handleEditField = (field: keyof EditFormData, value: string) => {
    if (editForm) {
      setEditForm({ ...editForm, [field]: value });
    }
  };

  if (quoteLoading || templatesLoading) {
    return (
      <div className="h-full p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Quote not found.</p>
          <Button variant="outline" onClick={() => setLocation('/quotes')} data-testid="button-back-quotes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Quotes
          </Button>
        </div>
      </div>
    );
  }

  if (signatureSent) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="signature-sent-confirmation">
        <div className="text-center space-y-6 max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-display text-foreground" data-testid="text-sent-title">
              Term Sheet Sent
            </h2>
            <p className="text-muted-foreground" data-testid="text-sent-description">
              The term sheet for <span className="font-medium text-foreground">{quote.loanNumber || `Quote #${quote.id}`}</span> has been sent for signature.
            </p>
          </div>
          <Button onClick={() => setLocation('/quotes')} data-testid="button-go-to-quotes">
            Go to Quotes
          </Button>
        </div>
      </div>
    );
  }

  const loanAmount = safeNumber(loanData?.loanAmount || loanData?.requestedLoanAmount || loanData?.loanamount);
  const borrowerName = [quote.customerFirstName, quote.customerLastName].filter(Boolean).join(' ') || 'N/A';
  const propertyAddress = quote.propertyAddress || 'N/A';
  const propertyType = loanData?.propertyType || loanData?.property_type || 'N/A';
  const interestRate = quote.interestRate || 'N/A';
  const pointsCharged = quote.pointsCharged ?? 0;
  const loanPurpose = loanData?.loanPurpose || loanData?.loan_purpose || loanData?.purpose || 'N/A';

  const selectedTemplate = availableTemplates.find((t: any) => t.id === selectedTemplateId);
  const selectedTemplateName = selectedTemplate?.name || 'Default';
  const isLoi = selectedTemplate?.config?.templateType === 'loi';

  return (
    <div className="h-full overflow-y-auto" data-testid="page-quote-documents">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setLocation('/quotes')} className="mb-2 -ml-2 text-muted-foreground" data-testid="button-back-quotes">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Quotes
            </Button>
            <h1 className="text-2xl font-bold font-display text-foreground" data-testid="text-page-title">
              {quote.loanNumber || `Quote #${quote.id}`}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review, customize, and send your term sheet
            </p>
          </div>
        </div>

        {internalDoc && (
          <Card className="bg-card border rounded-[10px] shadow-sm" data-testid="card-term-sheet-progress">
            <CardContent className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Term Sheet Status</h3>
                {internalDoc.signerEmail && (
                  <span className="text-xs text-muted-foreground">
                    Sent to {internalDoc.signerName || internalDoc.signerEmail}
                  </span>
                )}
              </div>
              <TermSheetProgressBar step={termSheetStep} />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border rounded-[10px] shadow-sm" data-testid="card-borrower-info">
            <CardContent className="px-5 py-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Borrower</h3>
              </div>
              <p className="text-[15px] font-semibold text-foreground" data-testid="text-borrower-name">{borrowerName}</p>
              {quote.customerCompanyName && (
                <p className="text-[13px] text-muted-foreground mt-0.5">{quote.customerCompanyName}</p>
              )}
              {quote.customerEmail && (
                <p className="text-[13px] text-muted-foreground mt-0.5">{quote.customerEmail}</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border rounded-[10px] shadow-sm" data-testid="card-property-info">
            <CardContent className="px-5 py-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-7 w-7 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Property</h3>
              </div>
              <p className="text-[15px] font-semibold text-foreground truncate" data-testid="text-property-address">{propertyAddress}</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">{propertyType}</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">{loanPurpose}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border rounded-[10px] shadow-sm" data-testid="card-loan-info">
            <CardContent className="px-5 py-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan Terms</h3>
              </div>
              <p className="text-[21px] font-bold text-foreground" data-testid="text-loan-amount">${loanAmount.toLocaleString()}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[15px] font-semibold text-primary">{interestRate}</span>
                <span className="text-[13px] text-muted-foreground">{pointsCharged} pts</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border rounded-[10px] shadow-sm" data-testid="card-document-actions">
          <CardContent className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Document Template</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={handleOpenEdit} className="text-[13px] h-8" data-testid="button-edit-quote">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit Quote
              </Button>
            </div>

            <div className="flex items-center gap-3 mb-5">
              {availableTemplates.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {availableTemplates.map((template: any) => {
                    const tIsLoi = template.config?.templateType === 'loi';
                    const isSelected = selectedTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-foreground font-medium'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                        }`}
                        data-testid={`button-template-${template.id}`}
                      >
                        {tIsLoi ? (
                          <FileSignature className="w-3.5 h-3.5 text-amber-600" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-primary" />
                        )}
                        {template.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary bg-primary/5 text-sm font-medium">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  Default PDF
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownloadPdf}
                variant="outline"
                disabled={downloadingTemplateId !== null}
                className="gap-1.5"
                data-testid="button-download-pdf"
              >
                {downloadingTemplateId !== null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download PDF
              </Button>
              <Button
                onClick={handleOpenSendDialog}
                className="gap-1.5 shadow-md"
                data-testid="button-send-signature"
              >
                <Send className="h-4 w-4" />
                Send for Signature
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowPdfPreview(!showPdfPreview)}
                className="gap-1.5 ml-auto text-muted-foreground"
                data-testid="button-toggle-preview"
              >
                {showPdfPreview ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    Hide Preview
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Preview Document
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {showPdfPreview && (
          <Card className="bg-card border rounded-[10px] shadow-sm overflow-hidden" data-testid="card-pdf-preview">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                {isLoi ? (
                  <FileSignature className="w-4 h-4 text-amber-600" />
                ) : (
                  <FileText className="w-4 h-4 text-primary" />
                )}
                <span className="text-sm font-medium text-foreground">{selectedTemplateName}</span>
              </div>
              <div className="flex items-center gap-2">
                {pdfLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowPdfPreview(false)} className="h-7 w-7 p-0" data-testid="button-close-preview">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto bg-muted/30" ref={pdfContainerRef} data-testid="preview-pdf">
              {pdfError ? (
                <div className="h-96 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <FileText className="h-10 w-10 text-destructive/50 mx-auto" />
                    <p className="text-sm text-destructive font-medium">Preview Failed</p>
                    <p className="text-xs text-muted-foreground max-w-xs">{pdfError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPdfError(null); setPdfVersion(v => v + 1); }}
                      className="mt-2"
                      data-testid="button-retry-preview"
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              ) : pdfLoading && !pdfBlobUrl ? (
                <div className="h-96 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-sm text-muted-foreground">Generating document preview...</p>
                  </div>
                </div>
              ) : pdfBlobUrl ? (
                <div className="flex flex-col items-center py-4 gap-4">
                  <PDFDocument
                    file={pdfBlobUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading={
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    }
                  >
                    {Array.from({ length: numPages }, (_, i) => (
                      <div key={`page-${i + 1}`} className="relative mb-4 last:mb-0">
                        <PDFPage
                          pageNumber={i + 1}
                          width={containerWidth > 48 ? containerWidth - 48 : containerWidth}
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                          loading={
                            <div className="flex items-center justify-center py-12">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          }
                        />
                        <div
                          className="text-center text-xs text-muted-foreground mt-1"
                          data-testid={`text-page-indicator-${i + 1}`}
                        >
                          Page {i + 1} of {numPages}
                        </div>
                      </div>
                    ))}
                  </PDFDocument>
                </div>
              ) : (
                <div className="h-96 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto" />
                    <p className="text-sm text-muted-foreground">Select a template to preview</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {showEditPanel && editForm && (
          <Card className="bg-card border rounded-[10px] shadow-sm overflow-hidden" data-testid="panel-edit-quote">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-sm font-semibold text-foreground">Edit Quote Details</h3>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowEditPanel(false)} data-testid="button-close-edit">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardContent className="px-5 py-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Borrower</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">First Name</Label>
                      <Input
                        value={editForm.customerFirstName}
                        onChange={(e) => handleEditField('customerFirstName', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-firstName"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Last Name</Label>
                      <Input
                        value={editForm.customerLastName}
                        onChange={(e) => handleEditField('customerLastName', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-lastName"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Entity Name</Label>
                      <Input
                        value={editForm.customerCompanyName}
                        onChange={(e) => handleEditField('customerCompanyName', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-entityName"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Property</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Address</Label>
                      <Input
                        value={editForm.propertyAddress}
                        onChange={(e) => handleEditField('propertyAddress', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-address"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Property Type</Label>
                      <Select value={editForm.propertyType} onValueChange={(v) => handleEditField('propertyType', v)}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-edit-propertyType">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Single Family">Single Family</SelectItem>
                          <SelectItem value="2-4 Unit">2-4 Unit</SelectItem>
                          <SelectItem value="Condo">Condo</SelectItem>
                          <SelectItem value="Townhome">Townhome</SelectItem>
                          <SelectItem value="Mixed Use">Mixed Use</SelectItem>
                          <SelectItem value="5+ Unit">5+ Unit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Property Value</Label>
                      <Input
                        value={editForm.propertyValue}
                        onChange={(e) => handleEditField('propertyValue', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-propertyValue"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loan</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Loan Amount</Label>
                      <Input
                        value={editForm.loanAmount}
                        onChange={(e) => handleEditField('loanAmount', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-loanAmount"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Interest Rate</Label>
                      <Input
                        value={editForm.interestRate}
                        onChange={(e) => handleEditField('interestRate', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-interestRate"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Points</Label>
                      <Input
                        value={editForm.pointsCharged}
                        onChange={(e) => handleEditField('pointsCharged', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-points"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">FICO Score</Label>
                      <Input
                        value={editForm.ficoScore}
                        onChange={(e) => handleEditField('ficoScore', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-fico"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">DSCR</Label>
                      <Input
                        value={editForm.dscr}
                        onChange={(e) => handleEditField('dscr', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-dscr"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Prepayment Penalty</Label>
                      <Input
                        value={editForm.prepaymentPenalty}
                        onChange={(e) => handleEditField('prepaymentPenalty', e.target.value)}
                        className="h-8 text-sm"
                        data-testid="input-edit-prepayment"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Loan Purpose</Label>
                      <Select value={editForm.loanPurpose} onValueChange={(v) => handleEditField('loanPurpose', v)}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-edit-loanPurpose">
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Purchase">Purchase</SelectItem>
                          <SelectItem value="Refinance">Refinance</SelectItem>
                          <SelectItem value="Cash Out">Cash Out</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  onClick={() => editForm && updateQuoteMutation.mutate(editForm)}
                  disabled={updateQuoteMutation.isPending}
                  className="gap-1.5"
                  data-testid="button-save-edit"
                >
                  {updateQuoteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save & Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Send for Signature
            </DialogTitle>
            <DialogDescription>
              Send this term sheet to the borrower for electronic signature.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="send-name">Recipient Name</Label>
              <Input
                id="send-name"
                value={sendName}
                onChange={(e) => setSendName(e.target.value)}
                placeholder="Borrower name"
                data-testid="input-send-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="send-email">Recipient Email</Label>
              <Input
                id="send-email"
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="borrower@example.com"
                data-testid="input-send-email"
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <p>The borrower will receive an email with a secure link to review and sign the document. The signature field is pre-positioned on the document.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowSendDialog(false)} data-testid="button-cancel-send">
                Cancel
              </Button>
              <Button
                onClick={handleSendSignature}
                disabled={sendSignatureMutation.isPending || !sendEmail.trim()}
                data-testid="button-confirm-send"
              >
                {sendSignatureMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Term Sheet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
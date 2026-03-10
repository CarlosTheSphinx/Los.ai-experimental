import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Download, Send, CheckCircle2, Loader2, FileSignature, Pencil, X, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";
import type { SavedQuote } from "@shared/schema";
import { Document as PDFDocument, Page as PDFPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
    dscr: String(ld.dscr || ld.dscrRatio || ld.estimatedDscr || ''),
    prepaymentPenalty: String(ld.prepaymentPenalty || ld.prepayment_penalty || ''),
    loanPurpose: String(ld.loanPurpose || ld.loan_purpose || ld.purpose || ''),
    propertyType: String(ld.propertyType || ld.property_type || ''),
  };
}

export default function QuoteDocuments() {
  const [, params] = useRoute("/quotes/:id/documents");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const quoteId = params?.id ? parseInt(params.id) : null;
  const [downloadingTemplateId, setDownloadingTemplateId] = useState<number | null>(null);
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfBlobUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const templateInitializedRef = useRef(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData | null>(null);
  const [pdfVersion, setPdfVersion] = useState(0);

  const { data: quoteData, isLoading: quoteLoading } = useQuery<{ success: boolean; quote: SavedQuote }>({
    queryKey: ['/api/quotes', quoteId],
    enabled: !!quoteId,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: ['/api/quote-pdf-templates'],
  });

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

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPdfLoading(true);

    const url = selectedTemplateId
      ? `/api/quotes/${quoteId}/pdf?templateId=${selectedTemplateId}`
      : `/api/quotes/${quoteId}/pdf`;

    fetch(url, { credentials: 'include', signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Failed to generate PDF preview');
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
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        toast({
          title: "Preview Error",
          description: err instanceof Error ? err.message : "Failed to load PDF preview",
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
  }, [quoteId, selectedTemplateId, templatesLoading, quoteLoading, quote, availableTemplates.length, toast, pdfVersion]);

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
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

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
      a.download = `Quote-${quoteId}.pdf`;
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
          loanAmount: formData.loanAmount,
          propertyValue: formData.propertyValue,
          ficoScore: formData.ficoScore,
          dscr: formData.dscr,
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
        <div className="flex gap-4 flex-1">
          <Skeleton className="h-[600px] w-56" />
          <Skeleton className="h-[600px] flex-1" />
        </div>
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

  const loanAmount = safeNumber(loanData?.loanAmount || loanData?.requestedLoanAmount || loanData?.loanamount);
  const borrowerName = [quote.customerFirstName, quote.customerLastName].filter(Boolean).join(' ') || 'N/A';
  const propertyAddress = quote.propertyAddress || 'N/A';

  const selectedTemplate = availableTemplates.find((t: any) => t.id === selectedTemplateId);
  const selectedTemplateName = selectedTemplate?.name || 'Default';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground" data-testid="text-page-title">
              Document Preview
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Preview, download, or send your quote document.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenEdit} data-testid="button-edit-quote">
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit Quote
            </Button>
            <Button variant="outline" onClick={() => setLocation('/quotes')} data-testid="button-back-quotes">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Quotes
            </Button>
          </div>
        </div>

        <Card className="border-primary/10" data-testid="card-quote-summary">
          <CardContent className="px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-success" />
              </div>
              <div className="flex items-center gap-6 flex-1 min-w-0 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Quote #{quote.id}</span>
                  <span className="text-lg font-bold text-primary">{quote.interestRate || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Loan: </span>
                  <span className="font-medium">${loanAmount.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Borrower: </span>
                  <span className="font-medium" data-testid="text-borrower-name">{borrowerName}</span>
                </div>
                <div className="hidden md:block truncate">
                  <span className="text-muted-foreground">Property: </span>
                  <span className="font-medium">{propertyAddress}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 flex gap-4 px-6 pb-5 min-h-0">
        <div className="w-56 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Templates
          </h2>

          {availableTemplates.length === 0 ? (
            <Card
              className="cursor-pointer border-primary bg-primary/5"
              data-testid="card-template-default"
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">Default PDF</p>
                    <p className="text-[11px] text-muted-foreground">Standard</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            availableTemplates.map((template: any) => {
              const isLoi = template.config?.templateType === 'loi';
              const isSelected = selectedTemplateId === template.id;
              return (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/30'
                  }`}
                  onClick={() => setSelectedTemplateId(template.id)}
                  data-testid={`card-template-${template.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isLoi ? 'bg-amber-500/10' : 'bg-primary/10'
                      }`}>
                        {isLoi ? (
                          <FileSignature className="w-3.5 h-3.5 text-amber-600" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{template.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {isLoi ? 'Letter of Intent' : 'Summary'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          <div className="mt-auto pt-3 space-y-2">
            <Button
              className="w-full"
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={downloadingTemplateId !== null}
              data-testid="button-download-pdf"
            >
              {downloadingTemplateId !== null ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
            <Button
              className="w-full bg-gradient-to-r from-primary to-primary"
              onClick={() => setShowSigningModal(true)}
              data-testid="button-send-signature"
            >
              <Send className="mr-2 h-4 w-4" />
              Send for Signature
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/quotes')}
              className="w-full text-muted-foreground text-xs"
              data-testid="button-skip-to-quotes"
            >
              Skip — Go to Quotes
            </Button>
          </div>
        </div>

        <div className="flex-1 min-w-0 rounded-lg border bg-muted/30 overflow-hidden flex flex-col" data-testid="pdf-preview-container">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-card/50">
            <span className="text-sm font-medium text-foreground">{selectedTemplateName}</span>
            {pdfLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating...
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto" ref={pdfContainerRef} data-testid="preview-pdf">
            {pdfLoading && !pdfBlobUrl ? (
              <div className="h-full flex items-center justify-center">
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
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-2">
                  <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto" />
                  <p className="text-sm text-muted-foreground">Select a template to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {showEditPanel && editForm && (
          <div className="w-80 flex-shrink-0 border rounded-lg bg-card overflow-hidden flex flex-col" data-testid="panel-edit-quote">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
              <h3 className="text-sm font-semibold text-foreground">Edit Quote</h3>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowEditPanel(false)} data-testid="button-close-edit">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
            <div className="border-t px-4 py-3">
              <Button
                className="w-full"
                onClick={() => editForm && updateQuoteMutation.mutate(editForm)}
                disabled={updateQuoteMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateQuoteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save & Regenerate
              </Button>
            </div>
          </div>
        )}
      </div>

      {quote && (
        <DocumentSigningModal
          open={showSigningModal}
          onClose={() => setShowSigningModal(false)}
          quote={quote}
        />
      )}
    </div>
  );
}

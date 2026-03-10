import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, Download, Send, CheckCircle2, Loader2, FileSignature } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";
import type { SavedQuote } from "@shared/schema";

function safeNumber(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[$,%\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
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
  }, [quoteId, selectedTemplateId, templatesLoading, quoteLoading, quote, availableTemplates.length, toast]);

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
          <Button variant="outline" onClick={() => setLocation('/quotes')} data-testid="button-back-quotes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quotes
          </Button>
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
          <div className="flex-1 min-h-0">
            {pdfLoading && !pdfBlobUrl ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">Generating document preview...</p>
                </div>
              </div>
            ) : pdfBlobUrl ? (
              <embed
                src={pdfBlobUrl}
                type="application/pdf"
                className="w-full h-full"
                data-testid="preview-pdf"
              />
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

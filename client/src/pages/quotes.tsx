import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Trash2, 
  DollarSign, 
  MapPin, 
  User, 
  Calendar, 
  Percent, 
  FileText, 
  Send,
  RefreshCw,
  Clock,
  CheckCircle,
  Edit,
  MessageSquare,
  ExternalLink
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import type { SavedQuote } from "@shared/schema";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";
import { TermSheetStatus } from "@/components/TermSheetStatus";

interface DocumentInfo {
  id: number;
  status: 'draft' | 'pending' | 'completed' | 'expired';
  createdAt: string;
  vendor?: string;
  pandadocDocumentId?: string;
  signers: Array<{
    id: number;
    name: string;
    email: string;
    status: string;
    tokenExpiresAt?: string;
  }>;
}

function QuoteDocumentStatus({ quoteId }: { quoteId: number }) {
  const { toast } = useToast();
  const { branding } = useBranding();

  const { data, isLoading } = useQuery<{ success: boolean; documents: DocumentInfo[] }>({
    queryKey: ['/api/quotes', quoteId, 'documents'],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/documents`);
      return res.json();
    }
  });

  const resendMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await apiRequest('POST', `/api/documents/${documentId}/pandadoc/send`, {
        subject: 'Reminder: Please sign this document',
        message: `This is a reminder to review and sign the attached document from ${branding.companyName}.`,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/quotes', quoteId, 'documents'] });
      if (data.requiresManualSend && data.editorUrl) {
        toast({ title: "Document Created in PandaDoc", description: "Opening PandaDoc editor to send..." });
        window.open(data.editorUrl, '_blank');
      } else {
        toast({ title: "Resent via PandaDoc", description: "The signing request has been resent via PandaDoc." });
      }
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to resend signing request", 
        variant: "destructive" 
      });
    }
  });

  if (isLoading) {
    return null;
  }

  const documents = data?.documents || [];
  const latestDoc = documents.find(d => d.status !== 'draft');

  if (!latestDoc || !latestDoc.signers || latestDoc.signers.length === 0) {
    return null;
  }

  const sentDate = new Date(latestDoc.createdAt);
  const firstSigner = latestDoc.signers[0];
  const expirationDate = firstSigner?.tokenExpiresAt ? new Date(firstSigner.tokenExpiresAt) : null;
  const isExpired = expirationDate ? expirationDate < new Date() : false;
  const effectiveStatus = isExpired && latestDoc.status === 'pending' ? 'expired' : latestDoc.status;

  const getStatusBadge = () => {
    switch (effectiveStatus) {
      case 'pending':
        return (
          <Badge className="bg-warning/10 text-warning border-border">
            <Clock className="w-3 h-3 mr-1" />
            Awaiting Signature
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-success/10 text-success border-border">
            <CheckCircle className="w-3 h-3 mr-1" />
            Signed
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="destructive">
            <Clock className="w-3 h-3 mr-1" />
            Expired
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mt-4 p-4 bg-info/5 rounded-lg border border-info/20">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {getStatusBadge()}
          <span className="text-sm text-foreground flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Sent: {sentDate.toLocaleDateString()}
          </span>
          {expirationDate && (
            <span className={`text-sm flex items-center gap-1 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
              <Clock className="w-3.5 h-3.5" />
              {isExpired ? 'Expired' : 'Expires'}: {expirationDate.toLocaleDateString()}
            </span>
          )}
        </div>
        {(effectiveStatus === 'pending' || effectiveStatus === 'expired') && (latestDoc.vendor === 'pandadoc' || latestDoc.pandadocDocumentId) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resendMutation.mutate(latestDoc.id)}
            disabled={resendMutation.isPending}
            data-testid={`button-resend-${latestDoc.id}`}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
            Resend via PandaDoc
          </Button>
        )}
      </div>
    </div>
  );
}

interface EsignEnvelope {
  id: number;
  vendor: string;
  status: string;
  documentName: string;
  sentAt: string | null;
  completedAt: string | null;
  signedPdfUrl: string | null;
  externalDocumentId: string;
  signingUrl: string | null;
}

function QuoteEsignStatus({ quoteId }: { quoteId: number }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ envelopes: EsignEnvelope[] }>({
    queryKey: ['/api/esign/envelopes/quote', quoteId],
    queryFn: async () => {
      const res = await fetch(`/api/esign/envelopes/quote/${quoteId}`);
      return res.json();
    }
  });

  const sendPandadocMutation = useMutation({
    mutationFn: async ({ envelopeId }: { envelopeId: number }) => {
      return apiRequest('POST', `/api/esign/pandadoc/documents/${envelopeId}/send`, { sendMethod: 'email' });
    },
    onSuccess: () => {
      toast({ title: "Document Sent", description: "The PandaDoc document has been sent for signing." });
      queryClient.invalidateQueries({ queryKey: ['/api/esign/envelopes/quote', quoteId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send PandaDoc document", variant: "destructive" });
    }
  });

  if (isLoading || !data?.envelopes?.length) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary"><Edit className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'sent':
        return <Badge className="bg-warning/10 text-warning border-border"><Clock className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'viewed':
        return <Badge className="bg-info/10 text-info border-border"><FileText className="w-3 h-3 mr-1" />Viewed</Badge>;
      case 'completed':
        return <Badge className="bg-success/10 text-success border-border"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'declined':
        return <Badge variant="destructive">Declined</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {data.envelopes.map(envelope => (
        <div key={envelope.id} className="p-3 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-primary border-primary/30">PandaDoc</Badge>
              {getStatusBadge(envelope.status)}
              <span className="text-sm text-muted-foreground">{envelope.documentName}</span>
            </div>
            <div className="flex items-center gap-2">
              {envelope.sentAt && (
                <span className="text-xs text-muted-foreground">
                  Sent: {new Date(envelope.sentAt).toLocaleDateString()}
                </span>
              )}
              {envelope.status === 'draft' && envelope.signingUrl && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(envelope.signingUrl!, '_blank')}
                    data-testid={`button-open-pandadoc-draft-${envelope.id}`}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open in PandaDoc
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => sendPandadocMutation.mutate({ envelopeId: envelope.id })}
                    disabled={sendPandadocMutation.isPending}
                    data-testid={`button-send-pandadoc-${envelope.id}`}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    Send
                  </Button>
                </>
              )}
              {envelope.status === 'completed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/esign/pandadoc/documents/${envelope.externalDocumentId}/download`, '_blank')}
                  data-testid={`button-download-${envelope.id}`}
                >
                  Download PDF
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Quotes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [signingQuote, setSigningQuote] = useState<SavedQuote | null>(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const { data, isLoading } = useQuery<{ success: boolean; quotes: SavedQuote[] }>({
    queryKey: ['/api/quotes']
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/quotes/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Quote Deleted", description: "The quote has been removed." });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete quote", variant: "destructive" });
    }
  });

  const handleEditQuote = (quote: SavedQuote) => {
    const loanData = quote.loanData as Record<string, any>;
    const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;
    
    // Store quote data in sessionStorage for the edit page
    sessionStorage.setItem('editQuote', JSON.stringify({
      quoteId: quote.id,
      isRTL: isRTLQuote,
      loanData: loanData,
      customerFirstName: quote.customerFirstName,
      customerLastName: quote.customerLastName,
      propertyAddress: quote.propertyAddress,
      pointsCharged: quote.pointsCharged
    }));
    
    navigate('/');
  };

  const quotes = data?.quotes || [];

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3">
            <FileText className="w-5 h-5 md:w-6 md:h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-primary truncate tracking-tight">Saved Quotes</h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">View and manage your saved quotes</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : quotes.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Saved Quotes</h3>
              <p className="text-muted-foreground">Generate a loan pricing quote and save it to see it here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => {
              const loanData = quote.loanData as Record<string, any>;
              const createdAt = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A';
              
              // Detect if this is an RTL quote (has asIsValue or arv in loanData)
              const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;
              
              // Calculate max loan for RTL quotes
              const asIsValue = loanData?.asIsValue || 0;
              const arv = loanData?.arv || 0;
              const rehabBudget = loanData?.rehabBudget || 0;
              const totalCost = asIsValue + rehabBudget;
              
              // For RTL, commission is (points - 2) * totalCost / 100 (additional points only)
              const additionalPoints = Math.max(0, (quote.pointsCharged || 0) - 2);
              const rtlCommission = (totalCost * additionalPoints) / 100;
              
              // For DSCR, commission is (points - 1) * loanAmount / 100 (additional points above 1 min)
              const dscrAdditionalPoints = Math.max(0, (quote.pointsCharged || 0) - 1);
              const dscrLoanAmount = loanData?.loanAmount || 0;
              const dscrCommission = (dscrLoanAmount * dscrAdditionalPoints) / 100;
              
              // Display loan amount: for RTL use totalCost, for DSCR use loanAmount
              const displayLoanAmount = isRTLQuote ? totalCost : loanData?.loanAmount;
              const displayProgram = isRTLQuote 
                ? loanData?.loanType?.replace(/_/g, ' ').toUpperCase() 
                : loanData?.loanType;
              
              return (
                <Card key={quote.id} className="overflow-hidden" data-testid={`card-quote-${quote.id}`}>
                  <CardHeader className="bg-muted/50 border-b border-border py-3 md:py-4 px-4 md:px-6">
                    <div className="flex items-start md:items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base md:text-lg truncate">
                            {quote.customerFirstName} {quote.customerLastName}
                          </CardTitle>
                          <div className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{quote.propertyAddress}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {createdAt}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteMutation.mutate(quote.id)}
                          disabled={deleteMutation.isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                          data-testid={`button-delete-quote-${quote.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 md:p-5">
                    <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Interest Rate</div>
                        <div className="text-xl font-bold text-primary">{quote.interestRate}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">{isRTLQuote ? 'Total Cost' : 'Loan Amount'}</div>
                        <div className="font-semibold">${displayLoanAmount?.toLocaleString() || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Points</div>
                        <div className="font-semibold flex items-center gap-1">
                          <Percent className="w-3 h-3 text-muted-foreground" />
                          {quote.pointsCharged?.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Program</div>
                        <div className="font-semibold">{displayProgram || 'N/A'}</div>
                      </div>
                    </div>

                    {isRTLQuote ? (
                      <div className="bg-muted/50 rounded-lg p-4 border border-border">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">As-Is Value</div>
                            <div className="font-medium">${asIsValue.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">ARV</div>
                            <div className="font-medium">${arv.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Rehab Budget</div>
                            <div className="font-medium">${rehabBudget.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Total Loan Amount</div>
                            <div className="font-semibold text-primary">${totalCost.toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Additional Points (above 2 min)</div>
                            <div className="font-medium">{additionalPoints.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Points Amount</div>
                            <div className="font-semibold text-success">${rtlCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-4 border border-border">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Loan Amount</div>
                            <div className="font-semibold text-primary">${dscrLoanAmount.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Points Charged</div>
                            <div className="font-medium">{quote.pointsCharged?.toFixed(2) || '0.00'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">TPO Premium</div>
                            <div className="font-medium">${(quote.tpoPremiumAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Total Revenue</div>
                            <div className="font-medium">${(quote.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Additional Points (above 1 min)</div>
                            <div className="font-medium">{dscrAdditionalPoints.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Your Earnings</div>
                            <div className="font-semibold text-success">${dscrCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 bg-success/10 rounded-lg p-4 border border-success/20 flex items-center justify-between">
                      <span className="font-semibold text-success flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Your Commission
                      </span>
                      <span className="text-2xl font-bold text-success" data-testid={`text-commission-${quote.id}`}>
                        ${isRTLQuote 
                          ? rtlCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : dscrCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        }
                      </span>
                    </div>

                    <QuoteDocumentStatus quoteId={quote.id} />
                    <QuoteEsignStatus quoteId={quote.id} />

                    <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleEditQuote(quote)}
                          className="flex-1"
                          data-testid={`button-edit-quote-${quote.id}`}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Quote
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => navigate(`/messages?dealId=${quote.id}&new=true`)}
                          data-testid={`button-message-quote-${quote.id}`}
                          title="Message about this deal"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      </div>
                      <TermSheetStatus quoteId={quote.id} />
                      <Button
                        onClick={() => navigate(`/quotes/${quote.id}/documents`)}
                        className="w-full"
                        data-testid={`button-send-signature-${quote.id}`}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Send Term Sheet for Signature
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {signingQuote && (
        <DocumentSigningModal
          open={!!signingQuote}
          onClose={() => {
            setSigningQuote(null);
            queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
          }}
          quote={signingQuote}
        />
      )}
    </div>
  );
}

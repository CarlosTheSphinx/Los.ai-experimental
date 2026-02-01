import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  CheckCircle
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedQuote } from "@shared/schema";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";

interface DocumentInfo {
  id: number;
  status: 'draft' | 'pending' | 'completed' | 'expired';
  createdAt: string;
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

  const { data, isLoading } = useQuery<{ success: boolean; documents: DocumentInfo[] }>({
    queryKey: ['/api/quotes', quoteId, 'documents'],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${quoteId}/documents`);
      return res.json();
    }
  });

  const resendMutation = useMutation({
    mutationFn: async (documentId: number) => {
      return apiRequest('POST', `/api/documents/${documentId}/send`, {
        senderName: "Sphinx Capital"
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Email Resent", 
        description: "The signing request has been resent." 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes', quoteId, 'documents'] });
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
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
            <Clock className="w-3 h-3 mr-1" />
            Awaiting Signature
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
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
    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {getStatusBadge()}
          <span className="text-sm text-slate-600 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Sent: {sentDate.toLocaleDateString()}
          </span>
          {expirationDate && (
            <span className={`text-sm flex items-center gap-1 ${isExpired ? 'text-red-500' : 'text-slate-500'}`}>
              <Clock className="w-3.5 h-3.5" />
              {isExpired ? 'Expired' : 'Expires'}: {expirationDate.toLocaleDateString()}
            </span>
          )}
        </div>
        {(effectiveStatus === 'pending' || effectiveStatus === 'expired') && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resendMutation.mutate(latestDoc.id)}
            disabled={resendMutation.isPending}
            data-testid={`button-resend-${latestDoc.id}`}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
            Resend
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Quotes() {
  const { toast } = useToast();
  const [signingQuote, setSigningQuote] = useState<SavedQuote | null>(null);

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

  const quotes = data?.quotes || [];

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-primary">Saved Quotes</h1>
              <p className="text-sm text-slate-500">View your commission details</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : quotes.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 mb-2">No Saved Quotes</h3>
              <p className="text-slate-400">Generate a loan pricing quote and save it to see it here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => {
              const loanData = quote.loanData as Record<string, any>;
              const createdAt = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A';
              
              return (
                <Card key={quote.id} className="overflow-hidden" data-testid={`card-quote-${quote.id}`}>
                  <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {quote.customerFirstName} {quote.customerLastName}
                          </CardTitle>
                          <div className="flex items-center gap-1 text-sm text-slate-500">
                            <MapPin className="w-3 h-3" />
                            {quote.propertyAddress}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right mr-4">
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {createdAt}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteMutation.mutate(quote.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          data-testid={`button-delete-quote-${quote.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">Interest Rate</div>
                        <div className="text-xl font-bold text-primary">{quote.interestRate}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">Loan Amount</div>
                        <div className="font-semibold">${loanData?.loanAmount?.toLocaleString() || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">Points</div>
                        <div className="font-semibold flex items-center gap-1">
                          <Percent className="w-3 h-3 text-slate-400" />
                          {quote.pointsCharged?.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">Program</div>
                        <div className="font-semibold">{loanData?.loanType || 'N/A'}</div>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-slate-500">Points Amount</div>
                          <div className="font-medium">
                            ${(quote.pointsAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">TPO Premium</div>
                          <div className="font-medium">${(quote.tpoPremiumAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Total Revenue</div>
                          <div className="font-semibold text-primary">${(quote.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 bg-green-50 rounded-lg p-4 border border-green-200 flex items-center justify-between">
                      <span className="font-semibold text-green-700 flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Your Commission (30%)
                      </span>
                      <span className="text-2xl font-bold text-green-600" data-testid={`text-commission-${quote.id}`}>
                        ${quote.commission?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                      </span>
                    </div>

                    <QuoteDocumentStatus quoteId={quote.id} />

                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <Button
                        onClick={() => setSigningQuote(quote)}
                        className="w-full"
                        data-testid={`button-send-signature-${quote.id}`}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Send Quote for Signature
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

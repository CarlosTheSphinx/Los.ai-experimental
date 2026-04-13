import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  DollarSign,
  MapPin,
  User,
  Calendar,
  FileText,
  CheckCircle,
  Home,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedQuote } from "@shared/schema";

export default function BorrowerQuotes() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

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

  const acceptMutation = useMutation({
    mutationFn: async (quoteId: number) => {
      return apiRequest('POST', `/api/quotes/${quoteId}/accept`);
    },
    onSuccess: () => {
      toast({ title: "Quote Accepted!", description: "Your loan application has been submitted. You can track its progress from My Loans." });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      navigate('/');
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to accept quote", variant: "destructive" });
    }
  });

  const quotes = data?.quotes || [];

  return (
    <div className="min-h-screen" data-testid="page-borrower-quotes">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3">
            <FileText className="w-5 h-5 md:w-6 md:h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-primary truncate" data-testid="text-page-title">My Quotes</h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block" data-testid="text-page-subtitle">Review and accept your loan quotes</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20" data-testid="loading-spinner">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : quotes.length === 0 ? (
          <Card className="text-center py-12" data-testid="empty-state">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-muted mb-4" />
              <h3 className="text-xl font-semibold text-muted-foreground mb-2">No Quotes Yet</h3>
              <p className="text-muted-foreground">You don't have any saved quotes. Once a quote is generated for you, it will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => {
              const loanData = quote.loanData as Record<string, any>;
              const createdAt = formatDate(quote.createdAt, 'N/A');

              const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;

              const asIsValue = loanData?.asIsValue || 0;
              const rehabBudget = loanData?.rehabBudget || 0;
              const rtlTotalCost = asIsValue + rehabBudget;

              const dscrFees = (loanData?.loanAmount || 0) * 0.01;
              const rtlFees = rtlTotalCost * 0.02;
              const estimatedFees = isRTLQuote ? rtlFees : dscrFees;

              const displayLoanAmount = isRTLQuote ? rtlTotalCost : loanData?.loanAmount;
              const displayProgram = isRTLQuote
                ? loanData?.loanType?.replace(/_/g, ' ').toUpperCase()
                : loanData?.loanType;

              return (
                <Card key={quote.id} className="overflow-visible" data-testid={`card-quote-${quote.id}`}>
                  <CardHeader className="bg-muted border-b border-border py-3 md:py-4 px-4 md:px-6">
                    <div className="flex items-start md:items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base md:text-lg truncate" data-testid={`text-customer-name-${quote.id}`}>
                            {quote.customerFirstName} {quote.customerLastName}
                          </CardTitle>
                          <div className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate" data-testid={`text-property-address-${quote.id}`}>{quote.propertyAddress}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-date-${quote.id}`}>
                            <Calendar className="w-3 h-3" />
                            {createdAt}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 md:p-5">
                    <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Interest Rate</div>
                        <div className="text-xl font-bold text-primary" data-testid={`text-interest-rate-${quote.id}`}>{quote.interestRate}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Loan Amount</div>
                        <div className="font-semibold" data-testid={`text-loan-amount-${quote.id}`}>${displayLoanAmount?.toLocaleString() || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Program</div>
                        <div className="font-semibold" data-testid={`text-program-${quote.id}`}>
                          <Badge variant="secondary">{displayProgram || 'N/A'}</Badge>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Date Saved</div>
                        <div className="font-semibold text-sm" data-testid={`text-date-saved-${quote.id}`}>{createdAt}</div>
                      </div>
                    </div>

                    <div className="bg-info/10 border border-info/20 rounded-md p-4 mb-4" data-testid={`box-estimated-fees-${quote.id}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="w-4 h-4 text-info" />
                        <span className="text-sm font-medium text-info">Total Estimated Fees</span>
                      </div>
                      <div className="text-2xl font-bold text-info" data-testid={`text-estimated-fees-${quote.id}`}>
                        ${estimatedFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-info/80 mt-1">
                        {isRTLQuote ? '2 points on total cost' : '1 point on loan amount'}
                      </div>
                    </div>

                    {isRTLQuote && (
                      <div className="bg-muted rounded-md p-4 border border-border mb-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <div className="text-muted-foreground">As-Is Value</div>
                            <div className="font-medium">${asIsValue.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">ARV</div>
                            <div className="font-medium">${(loanData?.arv || 0).toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Rehab Budget</div>
                            <div className="font-medium">${rehabBudget.toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <Button
                        onClick={() => acceptMutation.mutate(quote.id)}
                        disabled={acceptMutation.isPending}
                        data-testid={`button-accept-quote-${quote.id}`}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {acceptMutation.isPending ? 'Accepting...' : 'Accept Quote'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => deleteMutation.mutate(quote.id)}
                        disabled={deleteMutation.isPending}
                        className="text-destructive"
                        data-testid={`button-delete-quote-${quote.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Quote
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

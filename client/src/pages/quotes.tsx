import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, Trash2, DollarSign, MapPin, User, Calendar, Percent, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedQuote } from "@shared/schema";
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";

export default function Quotes() {
  const { toast } = useToast();

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img 
              src={sphinxLogo} 
              alt="Sphinx Capital" 
              className="h-16 w-auto object-contain rounded-lg shadow-sm"
            />
            <div>
              <h1 className="text-xl font-bold text-primary">Saved Quotes</h1>
              <p className="text-sm text-slate-500">View your commission details</p>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline" data-testid="button-back-home">
              <ArrowLeft className="mr-2 h-4 w-4" />
              New Quote
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : quotes.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 mb-2">No Saved Quotes</h3>
              <p className="text-slate-400 mb-6">Generate a loan pricing quote and save it to see it here.</p>
              <Link href="/">
                <Button data-testid="button-create-first-quote">Create Your First Quote</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => {
              const loanData = quote.loanData as Record<string, any>;
              const createdAt = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A';
              
              return (
                <Card key={quote.id} className="overflow-hidden hover-elevate" data-testid={`card-quote-${quote.id}`}>
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

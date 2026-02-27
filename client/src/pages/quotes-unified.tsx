import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Search,
  Send,
  Trash2,
  Edit,
  Calculator,
  MessageSquare,
  Eye,
  CheckCircle,
  Clock,
  ExternalLink,
  FolderPlus,
  RefreshCw,
  Loader2,
  DollarSign,
  FileSignature,
  TrendingUp,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";
import type { SavedQuote } from "@shared/schema";
import { LoanForm } from "@/components/LoanForm";
import { RTLLoanForm } from "@/components/RTLLoanForm";
import { PricingResult } from "@/components/PricingResult";
import { RTLPricingResult } from "@/components/RTLPricingResult";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse, type RTLPricingFormData, type RTLPricingResponse } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface Envelope {
  id: number;
  vendor: string;
  quoteId: number;
  externalDocumentId: string;
  documentName: string;
  status: string;
  signingUrl: string | null;
  viewedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  hasProject: boolean;
  events: Array<{
    id: number;
    eventType: string;
    createdAt: string;
  }>;
}

interface ProgramWithPricing {
  id: number;
  name: string;
  loanType: string;
  description: string | null;
  hasActiveRuleset: boolean;
  activeRulesetId?: number;
  activeRulesetVersion?: number;
}

function formatShortDate(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatQuoteNumber(id: number, createdAt: string | null) {
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `Q-${year}-${String(id).padStart(4, '0')}`;
}

function getEnvelopeStatusDisplay(envelope: Envelope | null) {
  if (!envelope) return { label: 'No Term Sheet', color: 'bg-gray-100 text-gray-600', dotColor: 'bg-gray-400' };
  const s = envelope.status.toLowerCase();
  if (s === 'completed') return { label: 'Signed', color: 'bg-emerald-50 text-emerald-700', dotColor: 'bg-emerald-500' };
  if (s === 'viewed') return { label: 'Viewed', color: 'bg-blue-50 text-blue-700', dotColor: 'bg-blue-500' };
  if (s === 'sent') return { label: 'Sent — Awaiting Signature', color: 'bg-amber-50 text-amber-700', dotColor: 'bg-amber-500' };
  if (s === 'draft') return { label: 'Draft', color: 'bg-gray-100 text-gray-600', dotColor: 'bg-gray-400' };
  if (s === 'declined') return { label: 'Declined', color: 'bg-red-50 text-red-700', dotColor: 'bg-red-500' };
  return { label: envelope.status, color: 'bg-gray-100 text-gray-600', dotColor: 'bg-gray-400' };
}

function QuoteCardEnvelope({ envelope, isBorrower }: { envelope: Envelope | null; isBorrower: boolean }) {
  const { toast } = useToast();

  const syncMutation = useMutation({
    mutationFn: async (envelopeId: number) => {
      const res = await apiRequest("POST", `/api/esign/envelopes/${envelopeId}/sync`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.changed) {
        toast({ title: "Status Updated", description: `Status changed to "${data.newStatus}"` });
      } else {
        toast({ title: "Status Current", description: `Already up to date (${data.newStatus})` });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/esign/envelopes/bulk'] });
    },
    onError: () => {
      toast({ title: "Sync Failed", description: "Failed to sync document status", variant: "destructive" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (envelopeId: number) => {
      const res = await apiRequest("POST", `/api/envelopes/${envelopeId}/create-deal`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Deal Created", description: `Loan deal ${data.project?.loanNumber || ''} created successfully.` });
      queryClient.invalidateQueries({ queryKey: ['/api/esign/envelopes/bulk'] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create deal", variant: "destructive" });
    },
  });

  if (!envelope) {
    const noStatus = getEnvelopeStatusDisplay(null);
    return (
      <div className="border-t border-border/50 px-5 py-3 bg-slate-50/50 dark:bg-muted/20">
        <div className="flex items-center gap-3">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-medium ${noStatus.color}`} data-testid="badge-no-termsheet">
            <span className={`w-1.5 h-1.5 rounded-full ${noStatus.dotColor}`} />
            {noStatus.label}
          </span>
        </div>
      </div>
    );
  }

  const latest = envelope;
  const status = getEnvelopeStatusDisplay(latest);
  const s = latest.status.toLowerCase();
  const viewCount = latest.events?.filter(e => e.eventType === 'document_viewed').length || 0;

  return (
    <div className="border-t border-border/50 px-5 py-3 bg-slate-50/50 dark:bg-muted/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-medium ${status.color}`} data-testid={`badge-envelope-status-${latest.quoteId}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
              {status.label}
            </span>
            {s === 'sent' && viewCount > 0 && (
              <span className="text-[13px] text-muted-foreground flex items-center gap-1" data-testid={`text-viewed-count-${latest.quoteId}`}>
                <Eye className="h-3.5 w-3.5" /> Viewed {viewCount} time{viewCount > 1 ? 's' : ''}
              </span>
            )}
            {s === 'completed' && latest.completedAt && (
              <span className="text-[13px] text-emerald-600 flex items-center gap-1" data-testid={`text-signed-date-${latest.quoteId}`}>
                <CheckCircle className="h-3.5 w-3.5" /> Signed {formatShortDate(latest.completedAt)}
              </span>
            )}
            {s === 'sent' && latest.sentAt && (
              <span className="text-[13px] text-muted-foreground" data-testid={`text-sent-date-${latest.quoteId}`}>
                Sent {formatShortDate(latest.sentAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isBorrower && s !== 'completed' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => syncMutation.mutate(latest.id)}
              disabled={syncMutation.isPending}
              className="h-7 text-[13px] px-2"
              data-testid={`button-sync-${latest.quoteId}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          )}
          {isBorrower && latest.signingUrl && s !== 'completed' && (
            <Button
              size="sm"
              onClick={() => window.open(latest.signingUrl || "", "_blank")}
              className="h-8 text-[13px] gap-1.5"
              data-testid={`button-sign-${latest.quoteId}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Sign Now
            </Button>
          )}
          {!isBorrower && s === 'completed' && !latest.hasProject && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => createProjectMutation.mutate(latest.id)}
              disabled={createProjectMutation.isPending}
              className="h-8 text-[13px] gap-1.5"
              data-testid={`button-convert-deal-${latest.quoteId}`}
            >
              {createProjectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
              Convert to Deal
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function useBulkEnvelopes(quoteIds: number[]) {
  const quoteIdsStr = quoteIds.join(',');
  return useQuery<{ envelopes: Envelope[] }>({
    queryKey: ['/api/esign/envelopes/bulk', quoteIdsStr],
    queryFn: async () => {
      if (quoteIds.length === 0) return { envelopes: [] };
      const res = await fetch(`/api/esign/envelopes/bulk?quoteIds=${quoteIdsStr}`);
      return res.json();
    },
    staleTime: 30000,
    enabled: quoteIds.length > 0,
  });
}

function buildEnvelopeMap(envelopes: Envelope[]): Map<number, Envelope> {
  const map = new Map<number, Envelope>();
  for (const env of envelopes) {
    const existing = map.get(env.quoteId);
    if (!existing || new Date(env.createdAt) > new Date(existing.createdAt)) {
      map.set(env.quoteId, env);
    }
  }
  return map;
}

export default function QuotesUnified() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isBorrower = user?.userType === 'borrower';

  const [loanProductType, setLoanProductType] = useState<"dscr" | "rtl">("dscr");
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [dscrResult, setDscrResult] = useState<PricingResponse | null>(null);
  const [dscrFormData, setDscrFormData] = useState<LoanPricingFormData | null>(null);
  const [rtlResult, setRtlResult] = useState<RTLPricingResponse | null>(null);
  const [rtlFormData, setRtlFormData] = useState<RTLPricingFormData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [signingQuote, setSigningQuote] = useState<SavedQuote | null>(null);

  const { mutate: getPricing, isPending: dscrPending } = usePricing();

  const rtlPricingMutation = useMutation({
    mutationFn: async (data: RTLPricingFormData) => {
      const res = await apiRequest("POST", "/api/pricing/rtl", data);
      return res.json();
    },
    onSuccess: (data: RTLPricingResponse) => {
      setRtlResult(data);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate RTL pricing", variant: "destructive" });
    },
  });

  const { data: quotesData, isLoading: quotesLoading } = useQuery<{ success: boolean; quotes: SavedQuote[] }>({
    queryKey: ['/api/quotes']
  });

  const { data: programsData } = useQuery<{ programs: ProgramWithPricing[] }>({
    queryKey: ["/api/programs-with-pricing"],
  });

  const allActivePrograms = programsData?.programs || [];

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

  const handleDSCRSubmit = (data: LoanPricingFormData) => {
    setDscrFormData(data);
    getPricing(data, {
      onSuccess: (response) => {
        setDscrResult(response);
      },
    });
  };

  const handleRTLSubmit = (data: RTLPricingFormData) => {
    setRtlFormData(data);
    rtlPricingMutation.mutate(data);
  };

  const handleReset = () => {
    setDscrResult(null);
    setRtlResult(null);
  };

  const handleEditQuote = (quote: SavedQuote) => {
    const loanData = quote.loanData as Record<string, any>;
    const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;

    sessionStorage.setItem('editQuote', JSON.stringify({
      quoteId: quote.id,
      isRTL: isRTLQuote,
      loanData: loanData,
      programId: quote.programId,
      customerFirstName: quote.customerFirstName,
      customerLastName: quote.customerLastName,
      propertyAddress: quote.propertyAddress,
      pointsCharged: quote.pointsCharged
    }));

    navigate('/');
  };

  const quotes = quotesData?.quotes || [];
  const quoteIds = quotes.map(q => q.id);
  const { data: bulkEnvData } = useBulkEnvelopes(quoteIds);
  const envelopeMap = buildEnvelopeMap(bulkEnvData?.envelopes || []);

  const filteredQuotes = quotes.filter(q => {
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase();
    return (
      `${q.customerFirstName} ${q.customerLastName}`.toLowerCase().includes(s) ||
      (q.propertyAddress || '').toLowerCase().includes(s) ||
      (q.customerEmail || '').toLowerCase().includes(s)
    );
  });

  const totalCommission = quotes.reduce((sum, q) => sum + (q.commission || 0), 0);

  const pending = Array.from(envelopeMap.values()).filter(e => ['sent', 'viewed'].includes(e.status.toLowerCase())).length;
  const signed = Array.from(envelopeMap.values()).filter(e => e.status.toLowerCase() === 'completed').length;
  const noTermSheet = quotes.length - envelopeMap.size;

  const hasResult = (loanProductType === "dscr" && dscrResult) || (loanProductType === "rtl" && rtlResult);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight" data-testid="text-page-title">Quotes</h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">
            {isBorrower ? 'View your loan quotes and term sheets.' : 'Manage quotes, term sheets, and deal conversions.'}
          </p>
        </div>
      </div>

      {!quotesLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-row">
          <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-total-quotes">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Total Quotes</span>
            </div>
            <div className="text-[26px] font-bold">{quotes.length}</div>
          </div>
          <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-pending">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Signature</span>
            </div>
            <div className="text-[26px] font-bold text-amber-600">{pending}</div>
          </div>
          <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-signed">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Signed</span>
            </div>
            <div className="text-[26px] font-bold text-emerald-600">{signed}</div>
          </div>
          {!isBorrower ? (
            <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-commission">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Total Commission</span>
              </div>
              <div className="text-[26px] font-bold text-emerald-600">
                ${totalCommission.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>
          ) : (
            <div className="bg-card border rounded-[10px] shadow-sm px-5 py-4" data-testid="stat-no-termsheet">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Awaiting Quote</span>
              </div>
              <div className="text-[26px] font-bold text-blue-600">{noTermSheet}</div>
            </div>
          )}
        </div>
      )}

      <div>
        <Tabs defaultValue={isBorrower ? "quotes" : "quotes"} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-5">
            <TabsTrigger value="quotes" className="text-[16px]" data-testid="tab-quotes">
              <FileText className="w-4 h-4 mr-2" />
              {isBorrower ? 'My Quotes' : 'Quotes'}
            </TabsTrigger>
            <TabsTrigger value="create" className="text-[16px]" data-testid="tab-create-quote">
              <Calculator className="w-4 h-4 mr-2" />
              Create Quote
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quotes" className="space-y-5">
            {quotes.length > 3 && (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, address, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10 text-[15px]"
                  data-testid="input-search-quotes"
                />
              </div>
            )}

            {quotesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-card border rounded-[10px] shadow-sm overflow-hidden p-6">
                    <div className="h-6 w-48 bg-muted animate-pulse rounded mb-3" />
                    <div className="h-4 w-72 bg-muted animate-pulse rounded mb-4" />
                    <div className="grid grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map(j => (
                        <div key={j} className="h-12 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredQuotes.length === 0 ? (
              <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-foreground mb-1">
                    {searchQuery ? 'No quotes match your search' : 'No Quotes Yet'}
                  </h3>
                  <p className="text-[13px] text-muted-foreground max-w-sm">
                    {searchQuery ? 'Try a different search term.' : 'Create a loan pricing quote to get started.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredQuotes.map((quote) => (
                  <QuoteCard
                    key={quote.id}
                    quote={quote}
                    isBorrower={isBorrower}
                    latestEnvelope={envelopeMap.get(quote.id) || null}
                    onEdit={() => handleEditQuote(quote)}
                    onDelete={() => deleteMutation.mutate(quote.id)}
                    onSendTermSheet={() => setSigningQuote(quote)}
                    onMessage={() => navigate(`/messages?dealId=${quote.id}&new=true`)}
                    deleteIsPending={deleteMutation.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-5">
            {!hasResult ? (
              <>
                <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden px-5 py-4">
                  <h3 className="text-[16px] font-semibold mb-1">Loan Program</h3>
                  <p className="text-[13px] text-muted-foreground mb-3">Select the loan program to price</p>
                  <div>
                    {allActivePrograms.length > 0 ? (
                      <Select
                        value={selectedProgramId?.toString() || ""}
                        onValueChange={(v) => {
                          const prog = allActivePrograms.find(p => p.id === parseInt(v));
                          if (prog) {
                            setSelectedProgramId(prog.id);
                            const derivedType = (prog.loanType === "dscr" ? "dscr" : "rtl") as "dscr" | "rtl";
                            setLoanProductType(derivedType);
                            setDscrResult(null);
                            setRtlResult(null);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full md:w-96" data-testid="select-loan-program">
                          <SelectValue placeholder="Select a loan program" />
                        </SelectTrigger>
                        <SelectContent>
                          {allActivePrograms.map((program) => (
                            <SelectItem key={program.id} value={program.id.toString()}>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11.5px] font-medium bg-gray-100 text-gray-600">
                                  {program.loanType.toUpperCase()}
                                </span>
                                <span className="text-[16px]">{program.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={loanProductType}
                        onValueChange={(v: "dscr" | "rtl") => {
                          setLoanProductType(v);
                          setSelectedProgramId(null);
                          setDscrResult(null);
                          setRtlResult(null);
                        }}
                      >
                        <SelectTrigger className="w-full md:w-80" data-testid="select-loan-product-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dscr">DSCR</SelectItem>
                          <SelectItem value="rtl">Fix and Flip/Ground Up Construction</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {selectedProgramId && (
                <div className="max-w-4xl mx-auto">
                  {loanProductType === "dscr" ? (
                    <LoanForm
                      onSubmit={handleDSCRSubmit}
                      isLoading={dscrPending}
                      defaultData={dscrFormData}
                      visibleFields={allActivePrograms.find(p => p.id === selectedProgramId)?.quoteFormFields as any}
                    />
                  ) : (
                    <RTLLoanForm
                      onSubmit={handleRTLSubmit}
                      isLoading={rtlPricingMutation.isPending}
                      defaultData={rtlFormData}
                      visibleFields={allActivePrograms.find(p => p.id === selectedProgramId)?.quoteFormFields as any}
                    />
                  )}
                </div>
                )}

                {!selectedProgramId && (
                  <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Calculator className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <h3 className="text-[15px] font-semibold text-foreground mb-1">Select a loan program above to get started</h3>
                      <p className="text-[13px] text-muted-foreground max-w-sm">The form fields will appear based on the program you choose</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="max-w-2xl mx-auto space-y-6">
                {loanProductType === "dscr" && dscrResult && (
                  <PricingResult
                    result={dscrResult}
                    formData={dscrFormData}
                    onReset={handleReset}
                    programId={selectedProgramId}
                  />
                )}
                {loanProductType === "rtl" && rtlResult && (
                  <RTLPricingResult
                    result={rtlResult}
                    formData={rtlFormData}
                    onReset={handleReset}
                    programId={selectedProgramId}
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
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

function QuoteCard({
  quote,
  isBorrower,
  latestEnvelope,
  onEdit,
  onDelete,
  onSendTermSheet,
  onMessage,
  deleteIsPending,
}: {
  quote: SavedQuote;
  isBorrower: boolean;
  latestEnvelope: Envelope | null;
  onEdit: () => void;
  onDelete: () => void;
  onSendTermSheet: () => void;
  onMessage: () => void;
  deleteIsPending: boolean;
}) {
  const loanData = quote.loanData as Record<string, any>;
  const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;

  const asIsValue = loanData?.asIsValue || 0;
  const rehabBudget = loanData?.rehabBudget || 0;
  const totalCost = asIsValue + rehabBudget;
  const dscrLoanAmount = loanData?.loanAmount || 0;
  const displayLoanAmount = isRTLQuote ? totalCost : dscrLoanAmount;

  const programName = loanData?.programName || (isRTLQuote
    ? loanData?.loanType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : loanData?.loanType || 'N/A');

  const ltv = loanData?.ltv || loanData?.ltvRatio || (loanData?.propertyValue && displayLoanAmount
    ? ((displayLoanAmount / loanData.propertyValue) * 100).toFixed(1)
    : '—');

  const dscr = loanData?.dscr || loanData?.dscrRatio || '—';
  const term = loanData?.loanTerm || loanData?.term || '—';
  const ysp = quote.yspAmount || 0;
  const points = quote.pointsCharged || 0;
  const commission = quote.commission || 0;

  const createdAt = quote.createdAt ? formatShortDate(quote.createdAt) : 'N/A';
  const quoteNumber = formatQuoteNumber(quote.id, quote.createdAt);
  const statusDisplay = getEnvelopeStatusDisplay(latestEnvelope);

  return (
    <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden" data-testid={`card-quote-${quote.id}`}>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0 flex-1">
            <h3 className="text-[18px] font-bold tracking-tight truncate" data-testid={`text-borrower-${quote.id}`}>
              {quote.customerFirstName} {quote.customerLastName}
              {quote.propertyAddress && (
                <span className="text-muted-foreground font-normal text-[16px]"> — {quote.propertyAddress.split(',')[0]}</span>
              )}
            </h3>
            <p className="text-[13px] text-muted-foreground mt-0.5" data-testid={`text-quote-meta-${quote.id}`}>
              {quoteNumber} · Created {createdAt}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${statusDisplay.color}`} data-testid={`badge-status-${quote.id}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dotColor}`} />
              {statusDisplay.label}
            </span>
            {!isBorrower && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={deleteIsPending}
                className="text-muted-foreground hover:text-destructive h-8 w-8"
                data-testid={`button-delete-quote-${quote.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-4" data-testid={`grid-metrics-row1-${quote.id}`}>
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Program</div>
            <div className="text-[15px] font-semibold truncate">{programName}</div>
          </div>
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{isRTLQuote ? 'Total Cost' : 'Loan Amount'}</div>
            <div className="text-[15px] font-semibold">${displayLoanAmount?.toLocaleString() || 'N/A'}</div>
          </div>
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Interest Rate</div>
            <div className="text-[18px] font-bold">{quote.interestRate || 'TBD'}</div>
          </div>
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">LTV</div>
            <div className="text-[15px] font-semibold">{typeof ltv === 'number' ? `${ltv}%` : ltv}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-3" data-testid={`grid-metrics-row2-${quote.id}`}>
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{isRTLQuote ? 'Term' : 'DSCR'}</div>
            <div className="text-[15px] font-semibold">{isRTLQuote ? term : dscr}</div>
          </div>
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Points</div>
            <div className="text-[15px] font-semibold">{points.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">YSP</div>
            <div className="text-[15px] font-semibold">{ysp ? `${ysp}%` : '—'}</div>
          </div>
          {!isBorrower ? (
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Commission</div>
              <div className="text-[15px] font-semibold text-emerald-600">
                ${commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{isRTLQuote ? 'Loan Purpose' : 'Term'}</div>
              <div className="text-[15px] font-semibold">{isRTLQuote ? (loanData?.loanPurpose || loanData?.purpose || '—') : term}</div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-2">
          {!isBorrower && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="h-8 text-[13px] gap-1.5"
                data-testid={`button-edit-quote-${quote.id}`}
              >
                <Edit className="h-3.5 w-3.5" />
                Edit Quote
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onMessage}
                className="h-8 w-8"
                data-testid={`button-message-quote-${quote.id}`}
                title="Message about this quote"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
              {(!latestEnvelope || latestEnvelope.status.toLowerCase() === 'draft') && (
                <Button
                  onClick={onSendTermSheet}
                  size="sm"
                  className="h-8 text-[13px] gap-1.5 ml-auto shadow-md"
                  data-testid={`button-send-signature-${quote.id}`}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Term Sheet
                </Button>
              )}
              {latestEnvelope && latestEnvelope.status.toLowerCase() === 'sent' && (
                <Button
                  onClick={onSendTermSheet}
                  variant="outline"
                  size="sm"
                  className="h-8 text-[13px] gap-1.5 ml-auto"
                  data-testid={`button-resend-${quote.id}`}
                >
                  <Send className="h-3.5 w-3.5" />
                  Resend
                </Button>
              )}
            </>
          )}
          {isBorrower && latestEnvelope?.signingUrl && latestEnvelope.status.toLowerCase() !== 'completed' && (
            <Button
              size="sm"
              onClick={() => window.open(latestEnvelope.signingUrl || "", "_blank")}
              className="h-8 text-[13px] gap-1.5"
              data-testid={`button-view-termsheet-${quote.id}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View & Sign Term Sheet
            </Button>
          )}
        </div>
      </div>

      <QuoteCardEnvelope envelope={latestEnvelope} isBorrower={isBorrower} />
    </div>
  );
}

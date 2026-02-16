import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Search,
  CheckCircle,
  Clock,
  Send,
  Trash2,
  Edit,
  Calculator,
  MapPin,
  User,
  Calendar,
  Percent,
  DollarSign,
  MessageSquare,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";
import { TermSheetStatus } from "@/components/TermSheetStatus";
import type { SavedQuote } from "@shared/schema";
import { LoanForm } from "@/components/LoanForm";
import { RTLLoanForm } from "@/components/RTLLoanForm";
import { PricingResult } from "@/components/PricingResult";
import { RTLPricingResult } from "@/components/RTLPricingResult";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse, type RTLPricingFormData, type RTLPricingResponse } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface ProgramWithPricing {
  id: number;
  name: string;
  loanType: string;
  description: string | null;
  hasActiveRuleset: boolean;
  activeRulesetId?: number;
  activeRulesetVersion?: number;
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

function QuoteDocumentStatus({ quoteId }: { quoteId: number }) {
  const { toast } = useToast();
  const { branding } = require("@/hooks/use-branding").useBranding();

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
        message: `This is a reminder to review and sign the attached document.`,
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

  return null;
}

function QuoteEsignStatus({ quoteId }: { quoteId: number }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ envelopes: any[] }>({
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

  return null;
}

export default function QuotesUnified() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isBorrower = user?.userType === 'borrower';

  // Quote Creation State
  const [loanProductType, setLoanProductType] = useState<"dscr" | "rtl">("dscr");
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [dscrResult, setDscrResult] = useState<PricingResponse | null>(null);
  const [dscrFormData, setDscrFormData] = useState<LoanPricingFormData | null>(null);
  const [rtlResult, setRtlResult] = useState<RTLPricingResponse | null>(null);
  const [rtlFormData, setRtlFormData] = useState<RTLPricingFormData | null>(null);

  // Term Sheets State
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [signingQuote, setSigningQuote] = useState<SavedQuote | null>(null);

  // Mutations
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

  // Fetch Quotes
  const { data: quotesData, isLoading: quotesLoading } = useQuery<{ success: boolean; quotes: SavedQuote[] }>({
    queryKey: ['/api/quotes']
  });

  // Fetch Agreements
  const { data: agreementsData, isLoading: agreementsLoading } = useQuery<{ success: boolean; agreements: Agreement[] }>({
    queryKey: ['/api/esignature/agreements']
  });

  // Fetch Programs
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
      customerFirstName: quote.customerFirstName,
      customerLastName: quote.customerLastName,
      propertyAddress: quote.propertyAddress,
      pointsCharged: quote.pointsCharged
    }));

    navigate('/');
  };

  const quotes = quotesData?.quotes || [];
  const agreements = agreementsData?.agreements || [];

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

  const hasResult = (loanProductType === "dscr" && dscrResult) || (loanProductType === "rtl" && rtlResult);

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3">
            <FileText className="w-5 h-5 md:w-6 md:h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-primary truncate tracking-tight">Quotes</h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">Manage quotes and term sheets</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6">
        <Tabs defaultValue={isBorrower ? "create" : "saved"} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="create">
              <Calculator className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Create Quote</span>
              <span className="sm:hidden">Create</span>
            </TabsTrigger>
            <TabsTrigger value="saved">
              <FileText className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Saved Quotes</span>
              <span className="sm:hidden">Saved</span>
            </TabsTrigger>
            <TabsTrigger value="term-sheets">
              <FileText className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Term Sheets</span>
              <span className="sm:hidden">Sheets</span>
            </TabsTrigger>
          </TabsList>

          {/* CREATE QUOTE TAB */}
          <TabsContent value="create" className="space-y-6">
            {!hasResult ? (
              <>
                <Card className="mb-6">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Loan Program</CardTitle>
                    <CardDescription>Select the loan program to price</CardDescription>
                  </CardHeader>
                  <CardContent>
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
                                <Badge variant="secondary" className="text-xs">
                                  {program.loanType.toUpperCase()}
                                </Badge>
                                {program.name}
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
                  </CardContent>
                </Card>

                <div className="max-w-4xl mx-auto">
                  {loanProductType === "dscr" ? (
                    <LoanForm onSubmit={handleDSCRSubmit} isLoading={dscrPending} defaultData={dscrFormData} />
                  ) : (
                    <RTLLoanForm onSubmit={handleRTLSubmit} isLoading={rtlPricingMutation.isPending} defaultData={rtlFormData} />
                  )}
                </div>
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

          {/* SAVED QUOTES TAB */}
          <TabsContent value="saved" className="space-y-4">
            {quotesLoading ? (
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

                  const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;

                  const asIsValue = loanData?.asIsValue || 0;
                  const arv = loanData?.arv || 0;
                  const rehabBudget = loanData?.rehabBudget || 0;
                  const totalCost = asIsValue + rehabBudget;

                  const additionalPoints = Math.max(0, (quote.pointsCharged || 0) - 2);
                  const rtlCommission = (totalCost * additionalPoints) / 100;

                  const dscrAdditionalPoints = Math.max(0, (quote.pointsCharged || 0) - 1);
                  const dscrLoanAmount = loanData?.loanAmount || 0;
                  const dscrCommission = (dscrLoanAmount * dscrAdditionalPoints) / 100;

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

                        <div className="bg-muted/50 rounded-lg p-4 border border-border mb-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">
                                {isRTLQuote ? 'Total Project Cost' : 'Loan Amount'}
                              </div>
                              <div className="font-medium">
                                ${(isRTLQuote ? totalCost : dscrLoanAmount).toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Your Commission</div>
                              <div className="font-semibold text-success">
                                ${isRTLQuote
                                  ? rtlCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : dscrCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                }
                              </div>
                            </div>
                          </div>
                        </div>

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
                            onClick={() => setSigningQuote(quote)}
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
          </TabsContent>

          {/* TERM SHEETS TAB */}
          <TabsContent value="term-sheets" className="space-y-4">
            <div className="flex flex-col gap-3 md:gap-4">
              <div className="relative w-full sm:hidden">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search term sheets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
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
                      className="text-xs sm:text-sm shrink-0"
                    >
                      {tab.label}
                      <span className="ml-1 text-xs opacity-70">({getFilterCount(tab.value)})</span>
                    </Button>
                  ))}
                </div>

                <div className="relative w-64 hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search term sheets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {agreementsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : filteredAgreements.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <FileText className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">No Term Sheets Found</h3>
                  <p className="text-muted-foreground">
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
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-foreground truncate">
                              {agreement.title}
                            </h3>
                            <Badge variant={
                              agreement.status === 'completed' ? 'default' :
                              agreement.status === 'draft' ? 'secondary' :
                              'outline'
                            }>
                              {agreement.status}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {agreement.sentAt ? `Sent ${new Date(agreement.sentAt).toLocaleDateString()}` : `Created ${new Date(agreement.createdAt).toLocaleDateString()}`}
                            </span>
                            {agreement.totalSigners > 0 && (
                              <span className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" />
                                {agreement.signedCount}/{agreement.totalSigners} signed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
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

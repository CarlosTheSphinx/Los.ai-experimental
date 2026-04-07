import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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
  Plus,
  ArrowLeft,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Bug,
  ArrowUpDown,
  List,
  LayoutGrid,
  Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExpandableRow } from "@/components/ui/phase1/expandable-row";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { DocumentSigningModal } from "@/components/DocumentSigningModal";
import type { SavedQuote } from "@shared/schema";
import { LoanForm } from "@/components/LoanForm";
import { RTLLoanForm } from "@/components/RTLLoanForm";
import { DynamicQuoteForm } from "@/components/DynamicQuoteForm";
import { PricingResult } from "@/components/PricingResult";
import { RTLPricingResult } from "@/components/RTLPricingResult";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse, type RTLPricingFormData, type RTLPricingResponse } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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

interface ProgramWithPricing {
  id: number;
  name: string;
  loanType: string;
  description: string | null;
  hasActiveRuleset: boolean;
  activeRulesetId?: number;
  activeRulesetVersion?: number;
  quoteFormFields?: any[];
  pricingMode?: string;
  externalPricingConfig?: {
    scraperUrl?: string;
    textInputs?: Array<{ id: string; fieldKey: string; label: string; sourceType?: string }>;
    dropdowns?: Array<{ label: string; fieldKey: string; options: string[]; sourceType?: string }>;
  } | null;
}

function normalizeFieldKey(key: string): string {
  return key.replace(/[-_]/g, '').toLowerCase();
}

function buildPricingFields(program: ProgramWithPricing, baseQuoteFields?: any[]): {
  pricingFields: any[];
  pricingNormalizedKeys: Set<string>;
  keyAliases: Record<string, string>;
} {
  if (program.pricingMode !== 'external' || !program.externalPricingConfig) {
    return { pricingFields: [], pricingNormalizedKeys: new Set(), keyAliases: {} };
  }
  const cfg = program.externalPricingConfig;
  const pricingFields: any[] = [];
  const pricingNormalizedKeys = new Set<string>();
  const keyAliases: Record<string, string> = {};

  const baseKeysByNormalized: Record<string, string> = {};
  (baseQuoteFields || []).forEach((f: any) => {
    baseKeysByNormalized[normalizeFieldKey(f.fieldKey)] = f.fieldKey;
  });

  (cfg.textInputs || []).forEach(ti => {
    if (ti.sourceType !== 'borrower') return;
    const formKey = ti.fieldKey;
    const normalized = normalizeFieldKey(formKey);
    if (pricingNormalizedKeys.has(normalized)) return;
    const isCurrency = /amount|value|price|budget/i.test(ti.label);
    pricingFields.push({
      fieldKey: formKey,
      label: ti.label,
      fieldType: isCurrency ? 'currency' : 'text',
      required: false,
      visible: true,
      displayGroup: 'pricing_questions',
    });
    pricingNormalizedKeys.add(normalized);
    const origKey = baseKeysByNormalized[normalized];
    if (origKey && origKey !== formKey) {
      keyAliases[formKey] = origKey;
    }
  });

  (cfg.dropdowns || []).forEach(dd => {
    if (dd.sourceType !== 'borrower') return;
    const formKey = dd.fieldKey;
    const normalized = normalizeFieldKey(formKey);
    if (pricingNormalizedKeys.has(normalized)) return;
    pricingFields.push({
      fieldKey: formKey,
      label: dd.label,
      fieldType: 'select',
      options: dd.options.filter(o => o),
      required: false,
      visible: true,
      displayGroup: 'pricing_questions',
    });
    pricingNormalizedKeys.add(normalized);
    const origKey = baseKeysByNormalized[normalized];
    if (origKey && origKey !== formKey) {
      keyAliases[formKey] = origKey;
    }
  });

  return { pricingFields, pricingNormalizedKeys, keyAliases };
}

function applyKeyAliases(data: Record<string, any>, aliases: Record<string, string>): Record<string, any> {
  const result = { ...data };
  for (const [pricingKey, origKey] of Object.entries(aliases)) {
    if (pricingKey in result && !(origKey in result)) {
      result[origKey] = result[pricingKey];
    }
  }
  return result;
}

function formatShortDate(dateStr: string | Date | null | undefined) {
  if (!dateStr) return '';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatQuoteNumber(id: number, createdAt: string | Date | null) {
  const d = createdAt ? (createdAt instanceof Date ? createdAt : new Date(createdAt)) : new Date();
  const year = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
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

function getInternalDocStatusDisplay(doc: InternalDocStatus | null) {
  if (!doc) return { label: 'No Term Sheet', color: 'bg-gray-100 text-gray-600', dotColor: 'bg-gray-400', step: 0 };
  const signerStatus = doc.signerStatus?.toLowerCase() || '';
  const docStatus = doc.status.toLowerCase();
  if (docStatus === 'completed' || signerStatus === 'signed') return { label: 'Signed', color: 'bg-emerald-50 text-emerald-700', dotColor: 'bg-emerald-500', step: 3 };
  if (signerStatus === 'viewed') return { label: 'Opened', color: 'bg-blue-50 text-blue-700', dotColor: 'bg-blue-500', step: 2 };
  if (docStatus === 'sent' || signerStatus === 'sent') return { label: 'Sent', color: 'bg-amber-50 text-amber-700', dotColor: 'bg-amber-500', step: 1 };
  return { label: 'Draft', color: 'bg-gray-100 text-gray-600', dotColor: 'bg-gray-400', step: 0 };
}

function QuoteCardEnvelope({ envelope, isBorrower, onResendTermSheet }: { envelope: Envelope | null; isBorrower: boolean; onResendTermSheet?: () => void }) {
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
      <div className="px-5 py-3">
        <div className="flex items-center gap-3">
          <FileSignature className="h-4.5 w-4.5 text-muted-foreground" />
          <span className="text-[15px] font-medium text-muted-foreground" data-testid="text-pandadoc-label">PandaDoc:</span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[14px] font-medium ${noStatus.color}`} data-testid="badge-no-termsheet">
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
    <div className="px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileSignature className="h-4.5 w-4.5 text-muted-foreground" />
          <span className="text-[15px] font-medium text-muted-foreground" data-testid={`text-pandadoc-label-${latest.quoteId}`}>PandaDoc:</span>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[14px] font-medium ${status.color}`} data-testid={`badge-envelope-status-${latest.quoteId}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
              {status.label}
            </span>
            {(s === 'sent' || s === 'viewed') && viewCount > 0 && (
              <span className="text-[15px] text-muted-foreground flex items-center gap-1" data-testid={`text-viewed-count-${latest.quoteId}`}>
                <Eye className="h-4 w-4" /> Viewed {viewCount} time{viewCount > 1 ? 's' : ''}
              </span>
            )}
            {s === 'completed' && latest.completedAt && (
              <span className="text-[15px] text-emerald-600 flex items-center gap-1" data-testid={`text-signed-date-${latest.quoteId}`}>
                <CheckCircle className="h-4 w-4" /> Signed {formatShortDate(latest.completedAt)}
              </span>
            )}
            {(s === 'sent' || s === 'viewed') && latest.sentAt && (
              <span className="text-[15px] text-muted-foreground" data-testid={`text-sent-date-${latest.quoteId}`}>
                Sent {formatShortDate(latest.sentAt)}
              </span>
            )}
            {s === 'completed' && latest.hasProject && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[14px] font-medium bg-emerald-50 text-emerald-700" data-testid={`badge-deal-created-${latest.quoteId}`}>
                <CheckCircle className="h-3.5 w-3.5" />
                Deal Created
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
              className="h-7 text-[14px] px-2"
              data-testid={`button-sync-${latest.quoteId}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          )}
          {!isBorrower && (s === 'sent' || s === 'viewed') && onResendTermSheet && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResendTermSheet}
              className="h-8 text-[14px] gap-1.5 rounded-full"
              data-testid={`button-resend-bar-${latest.quoteId}`}
            >
              <Send className="h-3.5 w-3.5" />
              Resend
            </Button>
          )}
          {isBorrower && latest.signingUrl && s !== 'completed' && (
            <Button
              size="sm"
              onClick={() => window.open(latest.signingUrl || "", "_blank")}
              className="h-8 text-[14px] gap-1.5"
              data-testid={`button-sign-${latest.quoteId}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Sign Now
            </Button>
          )}
          {s === 'completed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/esign/pandadoc/documents/${latest.externalDocumentId}/download`, "_blank")}
              className="h-8 text-[14px] gap-1.5 rounded-full"
              data-testid={`button-download-pdf-${latest.quoteId}`}
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          )}
          {!isBorrower && s === 'completed' && !latest.hasProject && (
            <Button
              size="sm"
              onClick={() => createProjectMutation.mutate(latest.id)}
              disabled={createProjectMutation.isPending}
              className="h-8 text-[14px] gap-1.5 rounded-full"
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

function useBulkInternalDocs(quoteIds: number[]) {
  const quoteIdsStr = quoteIds.join(',');
  return useQuery<{ documents: InternalDocStatus[] }>({
    queryKey: ['/api/internal-documents/bulk', quoteIdsStr],
    queryFn: async () => {
      if (quoteIds.length === 0) return { documents: [] };
      const res = await fetch(`/api/internal-documents/bulk?quoteIds=${quoteIdsStr}`, { credentials: 'include' });
      return res.json();
    },
    staleTime: 15000,
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

function buildInternalDocMap(docs: InternalDocStatus[]): Map<number, InternalDocStatus> {
  const map = new Map<number, InternalDocStatus>();
  for (const doc of docs) {
    map.set(doc.quoteId, doc);
  }
  return map;
}

export default function QuotesUnified() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isBorrower = user?.role === 'borrower';
  const isAdminRole = ['super_admin', 'lender', 'processor'].includes(user?.role || '');

  const [loanProductType, setLoanProductType] = useState<"dscr" | "rtl">("dscr");
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [dscrResult, setDscrResult] = useState<PricingResponse | null>(null);
  const [dscrFormData, setDscrFormData] = useState<LoanPricingFormData | null>(null);
  const [rtlResult, setRtlResult] = useState<RTLPricingResponse | null>(null);
  const [rtlFormData, setRtlFormData] = useState<RTLPricingFormData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | "no_term_sheet" | "sent" | "opened" | "signed">("all");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [expandedQuoteId, setExpandedQuoteId] = useState<number | null>(null);
  const [testDataKey, setTestDataKey] = useState(0);
  const [generatedTestData, setGeneratedTestData] = useState<Record<string, any> | null>(null);
  const [scraperDebug, setScraperDebug] = useState<{
    url?: string;
    textInputs?: Array<{ label: string; value: string }>;
    dropdowns?: Array<{ label: string; value: string }>;
    formResult?: any;
    bodySnippet?: string;
    error?: string;
  } | null>(null);
  const [showScraperDebug, setShowScraperDebug] = useState(false);
  const [signingQuote, setSigningQuote] = useState<SavedQuote | null>(null);
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendName, setResendName] = useState('');
  const [resendQuoteId, setResendQuoteId] = useState<number | null>(null);

  const [resendDocumentId, setResendDocumentId] = useState<number | null>(null);

  const resendMutation = useMutation({
    mutationFn: async ({ quoteId, email, name, existingDocumentId }: { quoteId: number; email: string; name: string; existingDocumentId?: number }) => {
      const response = await apiRequest('POST', `/api/quotes/${quoteId}/send-internal-signature`, {
        recipientEmail: email,
        recipientName: name,
        resend: true,
        existingDocumentId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sent", description: data.message || "Term sheet resent for signature." });
      setShowResendDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/internal-documents/bulk'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to resend term sheet",
        variant: "destructive",
      });
    },
  });

  const handleOpenResendDialog = (quote: SavedQuote, documentId?: number) => {
    setResendEmail(quote.customerEmail || '');
    setResendName([quote.customerFirstName, quote.customerLastName].filter(Boolean).join(' '));
    setResendQuoteId(quote.id);
    setResendDocumentId(documentId || null);
    setShowResendDialog(true);
  };

  const handleResendSignature = () => {
    if (!resendEmail.trim()) {
      toast({ title: "Error", description: "Please enter an email address", variant: "destructive" });
      return;
    }
    if (resendQuoteId) {
      resendMutation.mutate({ quoteId: resendQuoteId, email: resendEmail.trim(), name: resendName.trim(), existingDocumentId: resendDocumentId || undefined });
    }
  };

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

  const { data: programsData, isLoading: programsLoading } = useQuery<{ programs: ProgramWithPricing[] }>({
    queryKey: ["/api/programs-with-pricing"],
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const allActivePrograms = programsData?.programs || [];
  const programsFetched = !programsLoading && !!programsData;

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

  const handleDSCRSubmit = (data: Record<string, any>) => {
    setDscrFormData(data as any);
    setScraperDebug(null);
    setShowScraperDebug(false);
    const payload = { ...data, programId: selectedProgramId ?? undefined };
    getPricing(payload, {
      onSuccess: (response: any) => {
        setDscrResult(response);
        if (response.scraperPayload) {
          setScraperDebug({
            ...response.scraperPayload,
            formResult: response.formResult,
          });
        }
      },
      onError: (error: any) => {
        if (error.scraperPayload) {
          setScraperDebug({
            ...error.scraperPayload,
            error: error.message,
            formResult: error.debug?.formResult,
            bodySnippet: error.debug?.rateDebugInfo?.bodySnippet,
          });
          setShowScraperDebug(true);
        }
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

  const generateTestData = () => {
    const selectedProgram = allActivePrograms.find(p => p.id === selectedProgramId);
    const quoteFields = selectedProgram?.quoteFormFields;
    const testValues: Record<string, any> = {};

    const fieldDefaults: Record<string, any> = {
      firstName: 'John', lastName: 'Doe', email: 'test@example.com',
      phone: '(555) 555-1234', address: '123 Main St, Miami, FL 33101',
      propertyAddress: '456 Oak Ave, Miami, FL 33101', propertyState: 'FL', propertyZip: '33101',
      loanAmount: 500000, propertyValue: 650000, asIsValue: 650000, purchasePrice: 650000,
      arv: 850000, rehabBudget: 150000, originalPurchasePrice: 550000,
      grossMonthlyRent: 4500, monthlyTaxes: 450, monthlyInsurance: 150,
      annualTaxes: 5400, annualInsurance: 1800, annualHOA: 3600,
      ficoScore: 740, dscr: 1.25, ltv: 75, entityName: 'Test Holdings LLC',
      entityType: 'LLC', entityMemberCount: 2,
      member1FirstName: 'John', member1LastName: 'Doe', member1Email: 'john@test.com',
      member1Phone: '(555) 555-5678', member1CreditScore: 740,
      member1MailingAddress: '123 Main St, Miami, FL 33101',
      member1NetWorth: 1500000, member1Liquidity: 350000,
      member1PropertiesOwned: 5, member1PropertiesSold2Yrs: 3,
      member1IsGuarantor: 'Yes', propertyUnits: '1',
    };

    if (Array.isArray(quoteFields) && quoteFields.length > 0) {
      quoteFields.forEach((f: any) => {
        if (!f.visible) return;
        if (fieldDefaults[f.fieldKey] !== undefined) {
          testValues[f.fieldKey] = fieldDefaults[f.fieldKey];
        } else if (f.fieldType === 'select' && f.options?.length > 0) {
          testValues[f.fieldKey] = f.options[0];
        } else if (f.fieldType === 'yes_no') {
          testValues[f.fieldKey] = 'No';
        } else if (f.fieldType === 'currency') {
          testValues[f.fieldKey] = 500000;
        } else if (f.fieldType === 'number') {
          testValues[f.fieldKey] = 100;
        } else if (f.fieldType === 'percentage') {
          testValues[f.fieldKey] = 7.5;
        } else if (f.fieldType === 'date') {
          testValues[f.fieldKey] = '2024-01-15';
        } else if (f.fieldType === 'email') {
          testValues[f.fieldKey] = 'test@example.com';
        } else if (f.fieldType === 'phone') {
          testValues[f.fieldKey] = '(555) 555-0000';
        } else {
          testValues[f.fieldKey] = 'Test';
        }
      });
    } else {
      Object.assign(testValues, fieldDefaults);
    }

    setGeneratedTestData(testValues);
    setTestDataKey(prev => prev + 1);
    toast({ title: 'Test data generated', description: 'Form filled with sample values. Review and submit.' });
  };

  const handleEditQuote = (quote: SavedQuote) => {
    const loanData = quote.loanData as Record<string, any>;
    const isRTLQuote = !!(loanData?.asIsValue || loanData?.arv || (loanData?.rehabBudget !== undefined && loanData?.rehabBudget !== null));

    if (quote.programId) {
      setSelectedProgramId(quote.programId);
    }

    const derivedType = isRTLQuote ? "rtl" : "dscr";
    setLoanProductType(derivedType);

    if (isRTLQuote) {
      setRtlFormData(loanData as any);
      setRtlResult(null);
    } else {
      setDscrFormData(loanData as any);
      setDscrResult(null);
    }

    setGeneratedTestData(null);
    setTestDataKey(prev => prev + 1);
    setActiveView("create");

    toast({
      title: "Editing Quote",
      description: `${quote.loanNumber || 'Quote'} loaded — make changes and resubmit.`,
    });
  };

  const quotes = quotesData?.quotes || [];
  const quoteIds = quotes.map(q => q.id);
  const { data: bulkEnvData } = useBulkEnvelopes(quoteIds);
  const { data: bulkInternalDocData } = useBulkInternalDocs(quoteIds);
  const envelopeMap = buildEnvelopeMap(bulkEnvData?.envelopes || []);
  const internalDocMap = buildInternalDocMap(bulkInternalDocData?.documents || []);

  const filteredQuotes = quotes.filter(q => {
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      const matches =
        `${q.customerFirstName} ${q.customerLastName}`.toLowerCase().includes(s) ||
        (q.propertyAddress || '').toLowerCase().includes(s) ||
        (q.customerEmail || '').toLowerCase().includes(s) ||
        (q.loanNumber || '').toLowerCase().includes(s);
      if (!matches) return false;
    }

    if (statusFilter !== "all") {
      const intDoc = internalDocMap.get(q.id);
      const env = envelopeMap.get(q.id);
      const hasDoc = !!intDoc || !!env;
      const docStatus = intDoc?.status?.toLowerCase() || '';
      const signerStatus = intDoc?.signerStatus?.toLowerCase() || '';
      const envStatus = env?.status?.toLowerCase() || '';
      if (statusFilter === "no_term_sheet" && hasDoc) return false;
      if (statusFilter === "sent") {
        const isSent = (intDoc && (docStatus === 'sent' || signerStatus === 'sent') && signerStatus !== 'viewed' && signerStatus !== 'signed') ||
          (!intDoc && env && envStatus === 'sent');
        if (!isSent) return false;
      }
      if (statusFilter === "opened") {
        const isOpened = (intDoc && signerStatus === 'viewed') ||
          (!intDoc && env && envStatus === 'viewed');
        if (!isOpened) return false;
      }
      if (statusFilter === "signed") {
        const isSigned = (intDoc && (signerStatus === 'signed' || docStatus === 'completed')) ||
          (!intDoc && env && envStatus === 'completed');
        if (!isSigned) return false;
      }
    }

    if (programFilter !== "all") {
      const ld = q.loanData as Record<string, any>;
      const pName = ld?.programName || ld?.loanType || '';
      if (pName !== programFilter) return false;
    }

    return true;
  }).sort((a, b) => {
    const toMs = (v: any) => { if (!v) return 0; const t = (v instanceof Date ? v : new Date(v)).getTime(); return Number.isFinite(t) ? t : 0; };
    const dateA = toMs(a.createdAt);
    const dateB = toMs(b.createdAt);
    return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
  });

  const totalCommission = quotes.reduce((sum, q) => sum + (q.commission || 0), 0);

  const envPending = Array.from(envelopeMap.values()).filter(e => ['sent', 'viewed'].includes(e.status.toLowerCase())).length;
  const envSigned = Array.from(envelopeMap.values()).filter(e => e.status.toLowerCase() === 'completed').length;
  const intPending = Array.from(internalDocMap.values()).filter(d => ['sent', 'in_progress'].includes(d.status.toLowerCase()) && d.signerStatus !== 'signed').length;
  const intSigned = Array.from(internalDocMap.values()).filter(d => d.status.toLowerCase() === 'completed' || d.signerStatus === 'signed').length;
  const pending = envPending + intPending;
  const signed = envSigned + intSigned;
  const noTermSheet = quotes.length - envelopeMap.size - internalDocMap.size + Array.from(internalDocMap.keys()).filter(k => envelopeMap.has(k)).length;

  const [activeView, setActiveView] = useState<"quotes" | "create">("quotes");
  const hasResult = (loanProductType === "dscr" && dscrResult) || (loanProductType === "rtl" && rtlResult);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-display font-bold" data-testid="text-page-title">
            {activeView === "create" ? "New Quote" : "Quotes"}
          </h1>
          <p className="text-[16px] text-muted-foreground mt-0.5">
            {activeView === "create"
              ? "Create a new loan pricing quote."
              : isBorrower ? 'View your loan quotes and term sheets.' : 'Manage quotes, term sheets, and deal conversions.'}
          </p>
        </div>
        {activeView === "quotes" && (
          <Button
            onClick={() => setActiveView("create")}
            className="h-10 px-5 text-[15px] gap-2 rounded-full shadow-md"
            data-testid="button-new-quote"
          >
            <Plus className="h-4 w-4" />
            New Quote
          </Button>
        )}
        {activeView === "create" && (
          <Button
            variant="outline"
            onClick={() => { setActiveView("quotes"); handleReset(); }}
            className="h-10 px-5 text-[15px] gap-2"
            data-testid="button-back-quotes"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Quotes
          </Button>
        )}
      </div>

      {activeView === "quotes" && !quotesLoading && (
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

      {activeView === "quotes" && (
        <div className="space-y-5">
          <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative max-w-[320px] w-[320px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by borrower, address, or loan #..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-[16px]"
                      data-testid="input-search-quotes"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-1.5 text-[16px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    data-testid="button-more-filters"
                  >
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${showFilters ? "rotate-90" : ""}`} />
                    More Filters
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                    className="flex items-center gap-1.5 h-9 px-3 text-[16px] font-medium border rounded-md bg-white hover:bg-gray-50 transition-colors dark:bg-card dark:hover:bg-muted"
                    data-testid="button-sort-order"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    {sortOrder === "newest" ? "Newest First" : "Oldest First"}
                  </button>

                  <div className="flex items-center border rounded-md overflow-hidden" data-testid="view-toggle-group">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`flex items-center justify-center h-9 w-9 transition-colors ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-card dark:hover:bg-muted"}`}
                      data-testid="button-view-list"
                      title="List view"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("card")}
                      className={`flex items-center justify-center h-9 w-9 border-l transition-colors ${viewMode === "card" ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-card dark:hover:bg-muted"}`}
                      data-testid="button-view-card"
                      title="Card view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {showFilters && (
                <div className="mt-3 pt-3 border-t border-border/50 animate-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[16px] font-semibold">Filter Quotes</span>
                    <button
                      onClick={() => { setStatusFilter("all"); setProgramFilter("all"); }}
                      className="text-[13px] text-blue-600 hover:text-blue-700 font-medium"
                      data-testid="button-clear-filters"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Term Sheet Status</label>
                      <select
                        className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground dark:bg-card"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        data-testid="select-status-filter"
                      >
                        <option value="all">All Statuses</option>
                        <option value="no_term_sheet">No Term Sheet</option>
                        <option value="sent">Sent</option>
                        <option value="opened">Opened</option>
                        <option value="signed">Signed</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Program</label>
                      <select
                        className="w-full h-9 px-3 text-[16px] border rounded-md bg-white text-foreground dark:bg-card"
                        value={programFilter}
                        onChange={(e) => setProgramFilter(e.target.value)}
                        data-testid="select-program-filter"
                      >
                        <option value="all">All Programs</option>
                        {Array.from(new Set(quotes.map(q => {
                          const ld = q.loanData as Record<string, any>;
                          return ld?.programName || ld?.loanType || '';
                        }).filter(Boolean))).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {quotesLoading ? (
            <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 w-full bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden">
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground mb-1">
                  {searchQuery || statusFilter !== "all" || programFilter !== "all" ? 'No quotes match your filters' : 'No Quotes Yet'}
                </h3>
                <p className="text-[13px] text-muted-foreground max-w-sm">
                  {searchQuery || statusFilter !== "all" || programFilter !== "all" ? 'Try adjusting your search or filters.' : 'Create a loan pricing quote to get started.'}
                </p>
              </div>
            </div>
          ) : viewMode === "list" ? (
            <div className="bg-card border rounded-[10px] shadow-sm overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b-2">
                    <th className="w-8" />
                    <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Loan #
                    </th>
                    <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Borrower
                    </th>
                    <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Property
                    </th>
                    <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Amount
                    </th>
                    <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Rate
                    </th>
                    <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Term Sheet
                    </th>
                    <th className="text-left px-3 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => {
                    const ld = quote.loanData as Record<string, any>;
                    const isRTL = ld?.asIsValue || ld?.arv || ld?.rehabBudget !== undefined;
                    const loanAmt = isRTL ? ((ld?.asIsValue || 0) + (ld?.rehabBudget || 0)) : (ld?.loanAmount || 0);
                    const intDoc = internalDocMap.get(quote.id) || null;
                    const env = envelopeMap.get(quote.id) || null;
                    const hasIntDoc = !!intDoc;
                    const sDisplay = hasIntDoc ? getInternalDocStatusDisplay(intDoc) : getEnvelopeStatusDisplay(env);
                    const borrowerName = [quote.customerFirstName, quote.customerLastName].filter(Boolean).join(' ') || '—';
                    const initials = borrowerName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                    const createdDate = formatShortDate(quote.createdAt) || '—';
                    const qNumber = quote.loanNumber || formatQuoteNumber(quote.id, quote.createdAt);
                    const progName = ld?.programName || (isRTL
                      ? ld?.loanType?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                      : ld?.loanType || '—');
                    const ltv = ld?.ltv || ld?.ltvRatio || (ld?.propertyValue && loanAmt
                      ? ((loanAmt / ld.propertyValue) * 100).toFixed(1)
                      : '—');
                    const dscr = ld?.dscr || ld?.dscrRatio || '—';
                    const term = ld?.loanTerm || ld?.term || '—';
                    const ysp = quote.yspAmount || 0;
                    const points = quote.pointsCharged || 0;
                    const commission = quote.commission || 0;
                    const envelopeStatus = env?.status.toLowerCase() || '';
                    const internalSignerStatus = intDoc?.signerStatus?.toLowerCase() || '';
                    const hasAnyTermSheet = hasIntDoc || !!env;

                    return (
                      <ExpandableRow
                        key={quote.id}
                        columns={7}
                        isExpanded={expandedQuoteId === quote.id}
                        onToggle={(expanded) => setExpandedQuoteId(expanded ? quote.id : null)}
                        summary={
                          <>
                            <td className="px-3 py-3 text-[16px] font-medium text-blue-600" data-testid={`text-loan-number-${quote.id}`}>
                              {qNumber}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-md flex items-center justify-center text-[13px] font-semibold shrink-0 bg-amber-100 text-amber-800" data-testid={`avatar-borrower-${quote.id}`}>
                                  {initials}
                                </div>
                                <div>
                                  <div className="text-[16px] font-medium" data-testid={`text-borrower-${quote.id}`}>{borrowerName}</div>
                                  {quote.customerEmail && (
                                    <div className="text-[13px] text-muted-foreground">{quote.customerEmail}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[16px]">{quote.propertyAddress?.split(',')[0] || '—'}</div>
                              {quote.propertyAddress?.includes(',') && (
                                <div className="text-[13px] text-muted-foreground">
                                  {quote.propertyAddress.split(',').slice(1).join(',').trim()}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-[16px] font-semibold" data-testid={`text-amount-${quote.id}`}>
                              {loanAmt ? `$${loanAmt.toLocaleString()}` : '—'}
                            </td>
                            <td className="px-3 py-3 text-[16px] font-semibold text-primary" data-testid={`text-rate-${quote.id}`}>
                              {quote.interestRate || '—'}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[13px] font-medium ${sDisplay.color}`} data-testid={`badge-status-${quote.id}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sDisplay.dotColor}`} />
                                {sDisplay.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-[14px] text-muted-foreground" data-testid={`text-created-${quote.id}`}>
                              {createdDate}
                            </td>
                          </>
                        }
                        details={
                          <div data-testid={`details-quote-${quote.id}`}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-5">
                              <div>
                                <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Loan Details</h4>
                                <div className="space-y-2 text-[15px]">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Program</span><span className="font-medium">{progName}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">LTV</span><span className="font-medium">{typeof ltv === 'number' ? `${ltv}%` : ltv}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'Term' : 'DSCR'}</span><span className="font-medium">{isRTL ? term : dscr}</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Points</span><span className="font-medium">{points.toFixed(2)}</span></div>
                                </div>
                              </div>
                              <div>
                                <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Revenue</h4>
                                <div className="space-y-2 text-[15px]">
                                  <div className="flex justify-between"><span className="text-muted-foreground">YSP</span><span className="font-medium">{ysp ? `${ysp}%` : '—'}</span></div>
                                  {!isBorrower && (
                                    <div className="flex justify-between"><span className="text-muted-foreground">Commission</span><span className="font-medium text-emerald-600">${commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Term Sheet</h4>
                                <div className="space-y-2 text-[15px]">
                                  {hasIntDoc && intDoc ? (
                                    <>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[13px] font-medium ${sDisplay.color}`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${sDisplay.dotColor}`} />{sDisplay.label}
                                        </span>
                                      </div>
                                      {intDoc.signerEmail && <div className="flex justify-between"><span className="text-muted-foreground">Sent to</span><span className="font-medium">{intDoc.signerName || intDoc.signerEmail}</span></div>}
                                      {intDoc.signerEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{intDoc.signerEmail}</span></div>}
                                      {intDoc.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">Sent</span><span className="font-medium">{formatShortDate(intDoc.sentAt)}</span></div>}
                                      {intDoc.completedAt && <div className="flex justify-between"><span className="text-muted-foreground">Signed</span><span className="font-medium text-emerald-600">{formatShortDate(intDoc.completedAt)}</span></div>}
                                      {intDoc.hasProject && (
                                        <div className="flex justify-between"><span className="text-muted-foreground">Deal</span>
                                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle className="h-3.5 w-3.5" /> Created</span>
                                        </div>
                                      )}
                                    </>
                                  ) : env ? (
                                    <>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[13px] font-medium ${sDisplay.color}`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${sDisplay.dotColor}`} />{sDisplay.label}
                                        </span>
                                      </div>
                                      {env.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">Sent</span><span className="font-medium">{formatShortDate(env.sentAt)}</span></div>}
                                      {env.completedAt && <div className="flex justify-between"><span className="text-muted-foreground">Signed</span><span className="font-medium text-emerald-600">{formatShortDate(env.completedAt)}</span></div>}
                                    </>
                                  ) : (
                                    <div className="text-muted-foreground">No term sheet sent</div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                              {!isBorrower && (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => handleEditQuote(quote)} className="h-8 rounded-full text-[14px] gap-1.5 px-3" data-testid={`button-edit-${quote.id}`}>
                                    <Edit className="h-3.5 w-3.5" /> Edit
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => navigate(`/messages?dealId=${quote.id}&new=true`)} className="h-8 rounded-full text-[14px] gap-1.5 px-3" data-testid={`button-message-${quote.id}`}>
                                    <MessageSquare className="h-3.5 w-3.5" /> Message
                                  </Button>
                                  {!hasAnyTermSheet && (
                                    <Button size="sm" onClick={() => navigate(`/quotes/${quote.id}/documents`)} className="h-8 rounded-full text-[14px] gap-1.5 px-3 shadow-md" data-testid={`button-send-${quote.id}`}>
                                      <Send className="h-3.5 w-3.5" /> Send Term Sheet
                                    </Button>
                                  )}
                                  {hasAnyTermSheet && !(internalSignerStatus === 'signed' || intDoc?.status === 'completed') && !(envelopeStatus === 'completed') && (
                                    <Button variant="outline" size="sm" onClick={() => handleOpenResendDialog(quote, intDoc?.documentId)} className="h-8 rounded-full text-[14px] gap-1.5 px-3" data-testid={`button-resend-${quote.id}`}>
                                      <Send className="h-3.5 w-3.5" /> Resend
                                    </Button>
                                  )}
                                </>
                              )}
                              <Button variant="outline" size="sm" onClick={async () => {
                                try {
                                  const res = await fetch(`/api/quotes/${quote.id}/pdf`, { credentials: 'include' });
                                  if (!res.ok) throw new Error('Failed');
                                  const blob = await res.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a'); a.href = url; a.download = `quote-${quote.id}.pdf`;
                                  document.body.appendChild(a); a.click(); a.remove();
                                  window.URL.revokeObjectURL(url);
                                } catch { toast({ title: "Error", description: "Failed to download PDF", variant: "destructive" }); }
                              }} className="h-8 rounded-full text-[14px] gap-1.5 px-3" data-testid={`button-download-${quote.id}`}>
                                <Download className="h-3.5 w-3.5" /> PDF
                              </Button>
                              {!isBorrower && (
                                <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(quote.id)} disabled={deleteMutation.isPending} className="h-8 rounded-full text-[14px] gap-1.5 px-3 text-muted-foreground hover:text-destructive ml-auto" data-testid={`button-delete-${quote.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </Button>
                              )}
                            </div>
                          </div>
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQuotes.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  quote={quote}
                  isBorrower={isBorrower}
                  latestEnvelope={envelopeMap.get(quote.id) || null}
                  internalDoc={internalDocMap.get(quote.id) || null}
                  onEdit={() => handleEditQuote(quote)}
                  onDelete={() => deleteMutation.mutate(quote.id)}
                  onSendTermSheet={() => navigate(`/quotes/${quote.id}/documents`)}
                  onResendTermSheet={() => handleOpenResendDialog(quote, internalDocMap.get(quote.id)?.documentId)}
                  onMessage={() => navigate(`/messages?dealId=${quote.id}&new=true`)}
                  deleteIsPending={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === "create" && (
        <div className="space-y-5">
          {!hasResult ? (
            <>
              <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden px-5 py-4">
                <h3 className="text-[16px] font-semibold mb-1">Loan Program</h3>
                <p className="text-[13px] text-muted-foreground mb-3">Select the loan program to price</p>
                <div>
                  {programsLoading ? (
                    <SelectTrigger className="w-full md:w-96" data-testid="select-loan-program-loading" disabled>
                      <SelectValue placeholder="Loading programs..." />
                    </SelectTrigger>
                  ) : allActivePrograms.length > 0 ? (
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
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-muted-foreground/30 text-sm text-muted-foreground" data-testid="text-no-programs">
                      No loan programs available — contact your lender to set up programs.
                    </div>
                  )}
                </div>
              </div>

              {selectedProgramId && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateTestData}
                    data-testid="button-generate-test-quote"
                  >
                    <Calculator className="h-3.5 w-3.5 mr-1.5" />
                    Generate Test Quote
                  </Button>
                </div>
              )}

              {selectedProgramId && (() => {
                const selectedProgram = allActivePrograms.find(p => p.id === selectedProgramId);
                const baseQuoteFields = selectedProgram?.quoteFormFields;
                const { pricingFields, pricingNormalizedKeys, keyAliases } = selectedProgram
                  ? buildPricingFields(selectedProgram, Array.isArray(baseQuoteFields) ? baseQuoteFields : undefined)
                  : { pricingFields: [], pricingNormalizedKeys: new Set<string>(), keyAliases: {} as Record<string, string> };
                const filteredBaseFields = Array.isArray(baseQuoteFields) && pricingNormalizedKeys.size > 0
                  ? baseQuoteFields.filter((f: any) => !pricingNormalizedKeys.has(normalizeFieldKey(f.fieldKey)))
                  : baseQuoteFields;
                const quoteFields = Array.isArray(filteredBaseFields) && filteredBaseFields.length > 0
                  ? [...filteredBaseFields, ...pricingFields]
                  : pricingFields.length > 0 ? pricingFields : filteredBaseFields;
                const hasDynamicFields = Array.isArray(quoteFields) && quoteFields.length > 0;

                return (
                  <div className="max-w-4xl mx-auto">
                    {hasDynamicFields ? (
                      <DynamicQuoteForm
                        key={`${selectedProgramId}-${testDataKey}`}
                        fields={quoteFields}
                        onSubmit={(data) => {
                          const augmented = applyKeyAliases(data as Record<string, any>, keyAliases);
                          if (loanProductType === "dscr") {
                            handleDSCRSubmit(augmented as any);
                          } else {
                            handleRTLSubmit(augmented as any);
                          }
                        }}
                        isLoading={loanProductType === "dscr" ? dscrPending : rtlPricingMutation.isPending}
                        defaultData={generatedTestData || (loanProductType === "dscr" ? dscrFormData : rtlFormData)}
                        programName={selectedProgram?.name}
                      />
                    ) : loanProductType === "dscr" ? (
                      <LoanForm
                        key={`dscr-${testDataKey}`}
                        onSubmit={handleDSCRSubmit}
                        isLoading={dscrPending}
                        defaultData={generatedTestData || dscrFormData}
                        visibleFields={quoteFields as any}
                      />
                    ) : (
                      <RTLLoanForm
                        key={`rtl-${testDataKey}`}
                        onSubmit={handleRTLSubmit}
                        isLoading={rtlPricingMutation.isPending}
                        defaultData={generatedTestData || rtlFormData}
                        visibleFields={quoteFields as any}
                      />
                    )}
                  </div>
                );
              })()}

              {!selectedProgramId && programsFetched && allActivePrograms.length === 0 && (
                <div className="max-w-4xl mx-auto">
                  {loanProductType === "dscr" ? (
                    <LoanForm onSubmit={handleDSCRSubmit} isLoading={dscrPending} defaultData={dscrFormData} />
                  ) : (
                    <RTLLoanForm onSubmit={handleRTLSubmit} isLoading={rtlPricingMutation.isPending} defaultData={rtlFormData} />
                  )}
                </div>
              )}

              {!selectedProgramId && allActivePrograms.length > 0 && (
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
              {scraperDebug && isAdminRole && (
                <div className="border rounded-[10px] overflow-hidden bg-card" data-testid="scraper-debug-panel">
                  <button
                    onClick={() => setShowScraperDebug(!showScraperDebug)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                    data-testid="button-toggle-scraper-debug"
                  >
                    <span className="flex items-center gap-2">
                      <Bug className="h-4 w-4" />
                      Scraper Debug
                      {scraperDebug.error && <span className="text-xs text-destructive font-normal">(error)</span>}
                    </span>
                    {showScraperDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {showScraperDebug && (
                    <div className="border-t px-4 py-3 space-y-3 text-[13px] font-ui">
                      {scraperDebug.error && (
                        <div className="bg-destructive/10 text-destructive rounded px-3 py-2">
                          {scraperDebug.error}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-muted-foreground">URL:</span>{' '}
                        <a href={scraperDebug.url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
                          {scraperDebug.url}
                        </a>
                      </div>
                      {scraperDebug.textInputs && scraperDebug.textInputs.length > 0 && (
                        <div>
                          <span className="font-semibold text-muted-foreground block mb-1">Text Inputs Sent:</span>
                          <div className="grid grid-cols-2 gap-1">
                            {scraperDebug.textInputs.map((ti, i) => (
                              <div key={i} className="flex justify-between bg-muted/30 rounded px-2 py-1">
                                <span>{ti.label}</span>
                                <span className="font-mono text-foreground">{ti.value || <span className="text-destructive italic">empty</span>}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {scraperDebug.dropdowns && scraperDebug.dropdowns.length > 0 && (
                        <div>
                          <span className="font-semibold text-muted-foreground block mb-1">Dropdowns Sent:</span>
                          <div className="grid grid-cols-2 gap-1">
                            {scraperDebug.dropdowns.map((dd, i) => (
                              <div key={i} className="flex justify-between bg-muted/30 rounded px-2 py-1">
                                <span>{dd.label}</span>
                                <span className={`font-mono ${dd.value ? 'text-foreground' : 'text-destructive italic'}`}>
                                  {dd.value || 'empty'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {scraperDebug.formResult && (
                        <div>
                          <span className="font-semibold text-muted-foreground block mb-1">Page Response:</span>
                          <div className="space-y-0.5">
                            {scraperDebug.formResult.textInputs?.map((ti: string, i: number) => (
                              <div key={`ti-${i}`} className={`text-xs px-2 py-0.5 rounded ${ti.startsWith('✅') ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                                {ti}
                              </div>
                            ))}
                            {scraperDebug.formResult.dropdowns?.map((dd: string, i: number) => (
                              <div key={`dd-${i}`} className={`text-xs px-2 py-0.5 rounded ${dd.startsWith('✅') ? 'text-green-700 dark:text-green-400' : dd.startsWith('❌') ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
                                {dd}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

      <Dialog open={showResendDialog} onOpenChange={setShowResendDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Resend Term Sheet
            </DialogTitle>
            <DialogDescription>
              Update the recipient details if needed, then resend the term sheet for signature.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="resend-name">Recipient Name</Label>
              <Input
                id="resend-name"
                value={resendName}
                onChange={(e) => setResendName(e.target.value)}
                placeholder="Borrower name"
                data-testid="input-resend-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resend-email">Recipient Email</Label>
              <Input
                id="resend-email"
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="borrower@example.com"
                data-testid="input-resend-email"
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <p>The borrower will receive an email with a secure link to review and sign the document.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowResendDialog(false)} data-testid="button-cancel-resend">
                Cancel
              </Button>
              <Button
                onClick={handleResendSignature}
                disabled={resendMutation.isPending || !resendEmail.trim()}
                data-testid="button-confirm-resend"
              >
                {resendMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Resend Term Sheet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuoteCard({
  quote,
  isBorrower,
  latestEnvelope,
  internalDoc,
  onEdit,
  onDelete,
  onSendTermSheet,
  onResendTermSheet,
  onMessage,
  deleteIsPending,
}: {
  quote: SavedQuote;
  isBorrower: boolean;
  latestEnvelope: Envelope | null;
  internalDoc: InternalDocStatus | null;
  onEdit: () => void;
  onDelete: () => void;
  onSendTermSheet: () => void;
  onResendTermSheet: () => void;
  onMessage: () => void;
  deleteIsPending: boolean;
}) {
  const { toast } = useToast();
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/pdf`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote-${quote.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to download PDF",
        variant: "destructive",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };
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
  const internalDocStatus = getInternalDocStatusDisplay(internalDoc);
  const hasInternalDoc = !!internalDoc;
  const statusDisplay = hasInternalDoc ? internalDocStatus : getEnvelopeStatusDisplay(latestEnvelope);
  const envelopeStatus = latestEnvelope?.status.toLowerCase() || '';
  const internalSignerStatus = internalDoc?.signerStatus?.toLowerCase() || '';
  const hasAnyTermSheet = hasInternalDoc || !!latestEnvelope;

  return (
    <div className="bg-card border rounded-[10px] shadow-sm overflow-hidden" data-testid={`card-quote-${quote.id}`}>
      <div className="px-6 pt-5 pb-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0 flex-1">
            <h3 className="text-[21px] font-bold tracking-tight truncate" data-testid={`text-borrower-${quote.id}`}>
              {quote.customerFirstName} {quote.customerLastName}
              {quote.propertyAddress && (
                <span className="text-muted-foreground font-normal text-[18px]"> — {quote.propertyAddress.split(',')[0]}</span>
              )}
            </h3>
            <p className="text-[15px] text-muted-foreground mt-0.5" data-testid={`text-quote-meta-${quote.id}`}>
              Quote #{quoteNumber} · Created {createdAt}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[14px] font-medium ${statusDisplay.color}`} data-testid={`badge-status-${quote.id}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dotColor}`} />
              {statusDisplay.label}
            </span>
            {!isBorrower && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="h-8 rounded-full text-[14px] gap-1.5 px-3"
                  data-testid={`button-edit-quote-${quote.id}`}
                >
                  <Edit className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onMessage}
                  className="h-8 rounded-full text-[14px] gap-1.5 px-3"
                  data-testid={`button-message-quote-${quote.id}`}
                  title="Message Borrower"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message Borrower
                </Button>
                {!hasAnyTermSheet && (
                  <Button
                    onClick={onSendTermSheet}
                    size="sm"
                    className="h-8 rounded-full text-[14px] gap-1.5 px-3 shadow-md"
                    data-testid={`button-send-signature-${quote.id}`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send Term Sheet
                  </Button>
                )}
                {hasInternalDoc && internalSignerStatus !== 'signed' && internalDoc?.status !== 'completed' && (
                  <Button
                    onClick={onResendTermSheet}
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full text-[14px] gap-1.5 px-3"
                    data-testid={`button-resend-${quote.id}`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Resend
                  </Button>
                )}
                {!hasInternalDoc && (envelopeStatus === 'sent' || envelopeStatus === 'viewed') && (
                  <Button
                    onClick={onResendTermSheet}
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full text-[14px] gap-1.5 px-3"
                    data-testid={`button-resend-env-${quote.id}`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Resend
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="h-8 rounded-full text-[14px] gap-1.5 px-3"
                  data-testid={`button-download-quote-pdf-${quote.id}`}
                >
                  {downloadingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {downloadingPdf ? "Generating..." : "PDF"}
                </Button>
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
              </>
            )}
            {isBorrower && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="h-8 rounded-full text-[14px] gap-1.5 px-3"
                data-testid={`button-download-quote-pdf-borrower-${quote.id}`}
              >
                {downloadingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloadingPdf ? "Generating..." : "PDF"}
              </Button>
            )}
            {isBorrower && latestEnvelope?.signingUrl && envelopeStatus !== 'completed' && (
              <Button
                size="sm"
                onClick={() => window.open(latestEnvelope.signingUrl || "", "_blank")}
                className="h-8 rounded-full text-[14px] gap-1.5 px-3"
                data-testid={`button-view-termsheet-${quote.id}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View & Sign Term Sheet
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-b border-border/50 bg-slate-100/80 dark:bg-muted/40 px-6 py-4">
        <div className="grid grid-cols-4 gap-4" data-testid={`grid-metrics-row1-${quote.id}`}>
          <div>
            <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Program</div>
            <div className="text-[17px] font-semibold truncate">{programName}</div>
          </div>
          <div>
            <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{isRTLQuote ? 'Total Cost' : 'Loan Amount'}</div>
            <div className="text-[17px] font-semibold">${displayLoanAmount?.toLocaleString() || 'N/A'}</div>
          </div>
          <div>
            <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Interest Rate</div>
            <div className="text-[21px] font-bold">{quote.interestRate || 'TBD'}</div>
          </div>
          <div>
            <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">LTV</div>
            <div className="text-[17px] font-semibold">{typeof ltv === 'number' ? `${ltv}%` : ltv}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-3" data-testid={`grid-metrics-row2-${quote.id}`}>
          <div>
            <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{isRTLQuote ? 'Term' : 'DSCR'}</div>
            <div className="text-[17px] font-semibold">{isRTLQuote ? term : dscr}</div>
          </div>
          <div>
            <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Points</div>
            <div className="text-[17px] font-semibold">{points.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">YSP</div>
            <div className="text-[17px] font-semibold">{ysp ? `${ysp}%` : '—'}</div>
          </div>
          {!isBorrower ? (
            <div>
              <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Commission</div>
              <div className="text-[17px] font-semibold text-emerald-600">
                ${commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{isRTLQuote ? 'Loan Purpose' : 'Term'}</div>
              <div className="text-[17px] font-semibold">{isRTLQuote ? (loanData?.loanPurpose || loanData?.purpose || '—') : term}</div>
            </div>
          )}
        </div>
      </div>

      {hasInternalDoc ? (
        <div className="px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileSignature className="h-4.5 w-4.5 text-muted-foreground" />
              <span className="text-[15px] font-medium text-muted-foreground" data-testid={`text-internal-doc-label-${quote.id}`}>Term Sheet:</span>
              <div className="flex items-center gap-2.5">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[14px] font-medium ${internalDocStatus.color}`} data-testid={`badge-internal-status-${quote.id}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${internalDocStatus.dotColor}`} />
                  {internalDocStatus.label}
                </span>
                {internalDoc.sentAt && internalSignerStatus !== 'signed' && internalDoc.status !== 'completed' && (
                  <span className="text-[15px] text-muted-foreground" data-testid={`text-internal-sent-${quote.id}`}>
                    Sent {formatShortDate(internalDoc.sentAt)}
                  </span>
                )}
                {(internalSignerStatus === 'signed' || internalDoc.status === 'completed') && internalDoc.completedAt && (
                  <span className="text-[15px] text-emerald-600 flex items-center gap-1" data-testid={`text-internal-signed-${quote.id}`}>
                    <CheckCircle className="h-4 w-4" /> Signed {formatShortDate(internalDoc.completedAt)}
                  </span>
                )}
                {internalDoc.hasProject && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[14px] font-medium bg-emerald-50 text-emerald-700" data-testid={`badge-deal-created-internal-${quote.id}`}>
                    <CheckCircle className="h-3.5 w-3.5" />
                    Deal Created
                  </span>
                )}
              </div>
            </div>
            {internalDoc.signerEmail && (
              <span className="text-[13px] text-muted-foreground" data-testid={`text-internal-signer-${quote.id}`}>
                {internalDoc.signerName || internalDoc.signerEmail}
              </span>
            )}
          </div>
        </div>
      ) : (
        <QuoteCardEnvelope envelope={latestEnvelope} isBorrower={isBorrower} onResendTermSheet={onResendTermSheet} />
      )}
    </div>
  );
}

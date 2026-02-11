import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Users, FileText, Send, Plus, Trash2, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Check, Mail, ZoomIn, ZoomOut, FileStack, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedQuote } from "@shared/schema";
import { Document as PDFDocument, Page as PDFPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentTemplate {
  id: number;
  name: string;
  description: string | null;
  pdfUrl: string;
  pdfFileName: string;
  pageCount: number;
  category: string | null;
  loanType: string | null;
}

interface TemplateField {
  id: number;
  fieldName: string;
  fieldKey: string;
  fieldType: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  signerRole: string | null;
  isRequired: boolean;
  defaultValue: string | null;
}

interface DocumentSigningModalProps {
  open: boolean;
  onClose: () => void;
  quote: SavedQuote;
}

const SIGNER_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

const SIGNATURE_FIELD_TYPES = [
  { type: "signature", label: "Signature", width: 200, height: 50 },
  { type: "initial", label: "Initials", width: 80, height: 40 },
  { type: "text", label: "Text", width: 150, height: 30 },
  { type: "date", label: "Date", width: 120, height: 30 }
];

// Common fields for all loan types
const COMMON_FIELD_TYPES = [
  { type: "fullName", label: "Full Name", width: 180, height: 25 },
  { type: "firstName", label: "First Name", width: 120, height: 25 },
  { type: "fullAddress", label: "Full Address", width: 250, height: 25 },
  { type: "interestRate", label: "Interest Rate", width: 80, height: 25 },
  { type: "originationFee", label: "Origination Fee", width: 120, height: 25 },
  { type: "propertyType", label: "Property Type", width: 120, height: 25 },
  { type: "fico", label: "FICO", width: 60, height: 25 },
];

// DSCR-specific fields
const DSCR_FIELD_TYPES = [
  { type: "loanAmount", label: "Loan Amount", width: 120, height: 25 },
  { type: "propertyValue", label: "Property Value", width: 120, height: 25 },
  { type: "ltv", label: "LTV", width: 80, height: 25 },
  { type: "loanPurpose", label: "Loan Purpose", width: 120, height: 25 },
  { type: "prepaymentPenalty", label: "Prepay Penalty", width: 100, height: 25 },
  { type: "estimatedDscr", label: "Est. DSCR", width: 80, height: 25 },
  { type: "grossMonthlyRent", label: "Gross Monthly Rent", width: 120, height: 25 },
  { type: "annualTaxes", label: "Annual Taxes", width: 100, height: 25 },
  { type: "annualInsurance", label: "Annual Insurance", width: 100, height: 25 },
];

// RTL (Fix and Flip) specific fields
const RTL_FIELD_TYPES = [
  { type: "loanAmount", label: "Loan Amount", width: 120, height: 25 },
  { type: "rtlLoanType", label: "Loan Type", width: 120, height: 25 },
  { type: "purpose", label: "Purpose", width: 100, height: 25 },
  { type: "asIsValue", label: "As-Is Value", width: 120, height: 25 },
  { type: "arv", label: "After Repair Value", width: 130, height: 25 },
  { type: "rehabBudget", label: "Rehab Budget", width: 120, height: 25 },
  { type: "totalCost", label: "Total Cost", width: 120, height: 25 },
  { type: "ltc", label: "LTC", width: 60, height: 25 },
  { type: "ltarv", label: "LTARV", width: 70, height: 25 },
  { type: "ltaiv", label: "LTAIV", width: 70, height: 25 },
  { type: "experienceTier", label: "Experience Tier", width: 120, height: 25 },
  { type: "completedProjects", label: "Completed Projects", width: 120, height: 25 },
  { type: "cashOutAmount", label: "Cash-Out Amount", width: 120, height: 25 },
];

// All prepopulated field types (for checking if a field type is prepopulated)
const ALL_PREPOPULATED_FIELD_TYPES = [...COMMON_FIELD_TYPES, ...DSCR_FIELD_TYPES, ...RTL_FIELD_TYPES];

// Helper to check if quote is RTL
function isRTLQuote(loanData: Record<string, unknown>): boolean {
  return !!(loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined);
}

// Get prepopulated field types based on loan type
function getPrepopulatedFieldTypes(loanData: Record<string, unknown>) {
  if (isRTLQuote(loanData)) {
    return [...COMMON_FIELD_TYPES, ...RTL_FIELD_TYPES];
  }
  return [...COMMON_FIELD_TYPES, ...DSCR_FIELD_TYPES];
}

function getFieldValue(type: string, quote: SavedQuote): string {
  const loanData = quote.loanData as Record<string, unknown> || {};
  
  const formatCurrency = (val: number | string | null | undefined) => {
    if (val === null || val === undefined || val === '') return '';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };
  
  const formatPercent = (val: number | string | null | undefined) => {
    if (val === null || val === undefined || val === '') return '';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '';
    return `${num.toFixed(2)}%`;
  };

  // Common fields
  switch (type) {
    case 'fullName': return `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim();
    case 'firstName': return quote.customerFirstName || '';
    case 'fullAddress': return quote.propertyAddress || '';
    case 'interestRate': return formatPercent(quote.interestRate);
    case 'originationFee': return formatCurrency(quote.pointsAmount);
    case 'propertyType': return String(loanData.propertyType || '');
    case 'fico': return String(loanData.ficoScore || loanData.fico || '');
    
    // DSCR-specific fields
    case 'loanAmount': return formatCurrency(loanData.loanAmount as number);
    case 'propertyValue': return formatCurrency(loanData.propertyValue as number);
    case 'ltv': return loanData.ltv ? `${loanData.ltv}%` : '';
    case 'loanPurpose': return String(loanData.loanPurpose || '');
    case 'prepaymentPenalty': return String(loanData.prepaymentPenalty || '');
    case 'estimatedDscr': return String(loanData.calculatedDscr || loanData.dscr || '');
    case 'grossMonthlyRent': return formatCurrency(loanData.grossMonthlyRent as number);
    case 'annualTaxes': return formatCurrency(loanData.annualTaxes as number);
    case 'annualInsurance': return formatCurrency(loanData.annualInsurance as number);
    
    // RTL-specific fields
    case 'rtlLoanType': return String(loanData.loanType || '');
    case 'purpose': return String(loanData.purpose || '');
    case 'asIsValue': return formatCurrency(loanData.asIsValue as number);
    case 'arv': return formatCurrency(loanData.arv as number);
    case 'rehabBudget': return formatCurrency(loanData.rehabBudget as number);
    case 'totalCost': {
      const asIs = (loanData.asIsValue as number) || 0;
      const rehab = (loanData.rehabBudget as number) || 0;
      return formatCurrency(asIs + rehab);
    }
    case 'ltc': return loanData.ltc ? `${loanData.ltc}%` : '';
    case 'ltarv': return loanData.ltarv ? `${loanData.ltarv}%` : '';
    case 'ltaiv': return loanData.ltaiv ? `${loanData.ltaiv}%` : '';
    case 'experienceTier': return String(loanData.experienceTier || '');
    case 'completedProjects': return String(loanData.completedProjects || '');
    case 'cashOutAmount': return formatCurrency(loanData.cashOutAmount as number);
    
    default: return '';
  }
}

interface FieldData {
  id?: number;
  signerId: number;
  pageNumber: number;
  fieldType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
}

interface DraggableFieldProps {
  field: FieldData;
  index: number;
  signer: { id?: number; name: string; email: string; color: string } | undefined;
  onUpdate: (index: number, updates: Partial<FieldData>) => void;
  onRemove: (index: number) => void;
  containerWidth: number;
  containerHeight: number;
  scale: number;
}

function DraggableResizableField({ field, index, signer, onUpdate, onRemove, containerWidth, containerHeight, scale }: DraggableFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [position, setPosition] = useState({ x: field.x, y: field.y });
  const [size, setSize] = useState({ width: field.width, height: field.height });
  
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const isPrepopulated = ALL_PREPOPULATED_FIELD_TYPES.some(f => f.type === field.fieldType);
  const fieldLabel = [...SIGNATURE_FIELD_TYPES, ...ALL_PREPOPULATED_FIELD_TYPES].find(f => f.type === field.fieldType)?.label || field.fieldType;

  useEffect(() => {
    setPosition({ x: field.x, y: field.y });
    setSize({ width: field.width, height: field.height });
  }, [field.x, field.y, field.width, field.height]);

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x * scale,
      y: e.clientY - position.y * scale
    };
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = (e.clientX - dragStartRef.current.x) / scale;
      const newY = (e.clientY - dragStartRef.current.y) / scale;
      
      const clampedX = Math.max(0, Math.min(newX, containerWidth - size.width));
      const clampedY = Math.max(0, Math.min(newY, containerHeight - size.height));
      
      setPosition({ x: clampedX, y: clampedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onUpdate(index, { x: position.x, y: position.y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position, size, scale, containerWidth, containerHeight, index, onUpdate]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - resizeStartRef.current.x) / scale;
      const deltaY = (e.clientY - resizeStartRef.current.y) / scale;
      
      const newWidth = Math.max(40, Math.min(400, resizeStartRef.current.width + deltaX));
      const newHeight = Math.max(20, Math.min(100, resizeStartRef.current.height + deltaY));
      
      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onUpdate(index, { width: size.width, height: size.height });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, size, scale, index, onUpdate]);

  const isActive = isDragging || isResizing;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x * scale}px`,
        top: `${position.y * scale}px`,
        width: `${size.width * scale}px`,
        height: `${size.height * scale}px`,
        border: `2px solid ${signer?.color || '#3B82F6'}`,
        backgroundColor: isPrepopulated ? '#FEF3C7' : `${signer?.color || '#3B82F6'}20`,
        borderRadius: '4px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: isActive ? 1000 : 10,
        boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto'
      }}
      onMouseDown={handleMouseDownDrag}
      data-testid={`field-${field.fieldType}-${index}`}
    >
      <span 
        className="text-xs font-medium truncate px-1 pointer-events-none" 
        style={{ 
          color: isPrepopulated ? '#92400E' : signer?.color,
          fontSize: `${Math.max(10, 12 * scale)}px`
        }}
      >
        {isPrepopulated && field.value ? field.value : fieldLabel}
      </span>
      
      <button
        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
        style={{ zIndex: 1001 }}
        onClick={(e) => { 
          e.stopPropagation(); 
          onRemove(index); 
        }}
        onMouseDown={(e) => e.stopPropagation()}
        data-testid={`remove-field-${index}`}
      >
        <X className="w-3 h-3" />
      </button>
      
      <div
        onMouseDown={handleMouseDownResize}
        style={{
          position: 'absolute',
          right: '-4px',
          bottom: '-4px',
          width: '12px',
          height: '12px',
          backgroundColor: 'white',
          border: `2px solid ${signer?.color || '#3B82F6'}`,
          borderRadius: '50%',
          cursor: 'nwse-resize',
          zIndex: 100
        }}
        data-testid={`resize-field-${index}`}
      />
    </div>
  );
}

export function DocumentSigningModal({ open, onClose, quote }: DocumentSigningModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"upload" | "signers" | "fields" | "send">("upload");
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [signers, setSigners] = useState<Array<{ id?: number; name: string; email: string; color: string }>>([]);
  const [newSignerName, setNewSignerName] = useState("");
  const [newSignerEmail, setNewSignerEmail] = useState("");
  const [fields, setFields] = useState<FieldData[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<string | null>(null);
  const [selectedSignerIndex, setSelectedSignerIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [senderName, setSenderName] = useState("Sphinx Capital");
  const [pdfScale, setPdfScale] = useState(1.0);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 612, height: 792 });
  
  const [uploadMode, setUploadMode] = useState<"template" | "manual" | "pandadoc">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateFieldsLoaded, setTemplateFieldsLoaded] = useState(false);
  const [templateDimensions, setTemplateDimensions] = useState<{ width: number; height: number } | null>(null);
  const [rawTemplateFields, setRawTemplateFields] = useState<FieldData[] | null>(null);
  
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  
  // PandaDoc state
  const [pandadocTemplateId, setPandadocTemplateId] = useState<string>("");
  const [pandadocRecipients, setPandadocRecipients] = useState<Array<{ name: string; email: string; role: string }>>([
    { name: `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim(), email: quote.customerEmail || '', role: '' }
  ]);
  const [pandadocSendMethod, setPandadocSendMethod] = useState<"email" | "embedded">("email");
  const [pandadocResult, setPandadocResult] = useState<{ success: boolean; signingUrl?: string; envelopeId?: number } | null>(null);
  const [pandadocDraft, setPandadocDraft] = useState<{ envelopeId: number; externalDocumentId: string; editorUrl: string } | null>(null);
  const [pandadocEditorToken, setPandadocEditorToken] = useState<string | null>(null);
  const [pandadocEditorLoading, setPandadocEditorLoading] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [templateRoles, setTemplateRoles] = useState<Array<{ name: string }>>([]);
  const [templateRolesLoading, setTemplateRolesLoading] = useState(false);
  const [templateRolesError, setTemplateRolesError] = useState<string | null>(null);
  const [showTokenPreview, setShowTokenPreview] = useState(false);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: templatesData, isLoading: templatesLoading, isError: templatesError } = useQuery<{ templates: DocumentTemplate[] }>({
    queryKey: ["/api/document-templates"],
    enabled: open,
  });

  // Query for PandaDoc templates
  const { data: pandadocTemplatesData, isLoading: pandadocTemplatesLoading } = useQuery<{ templates: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/esign/pandadoc/templates"],
    enabled: open && uploadMode === "pandadoc",
  });

  const { data: tokenPreviewData } = useQuery<{ tokens: Array<{ name: string; value: string }>; availableTokenNames: string[] }>({
    queryKey: ["/api/esign/pandadoc/quote", quote.id, "tokens"],
    enabled: open && uploadMode === "pandadoc" && showTokenPreview,
  });

  // PandaDoc create draft mutation
  const createPandadocDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/esign/pandadoc/documents/create', {
        quoteId: quote.id,
        pandadocTemplateId,
        recipients: pandadocRecipients.map(r => ({
          name: r.name,
          firstName: r.name.split(' ')[0],
          lastName: r.name.split(' ').slice(1).join(' '),
          email: r.email,
          role: r.role,
        })),
        sendMethod: pandadocSendMethod,
        subject: `Document for Signature: ${quote.quoteName || 'Loan Agreement'}`,
        message: `Please review and sign the attached document for your loan application.`,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.success) {
        const draftInfo = {
          envelopeId: data.envelope.id,
          externalDocumentId: data.envelope.externalDocumentId,
          editorUrl: data.envelope.editorUrl,
        };
        setPandadocDraft(draftInfo);
        setPandadocEditorLoading(true);
        try {
          const sessionRes = await apiRequest('POST', `/api/esign/pandadoc/documents/${draftInfo.externalDocumentId}/editing-session`, {});
          const sessionData = await sessionRes.json();
          if (sessionData.success && sessionData.token) {
            setPandadocEditorToken(sessionData.token);
          } else {
            console.warn('Editing session created but no token returned, falling back to external editor');
          }
        } catch (err: any) {
          console.error('Failed to create editing session:', err);
          toast({
            title: "Embedded editor unavailable",
            description: "You can still review the document by opening it in PandaDoc.",
          });
        } finally {
          setPandadocEditorLoading(false);
        }
        toast({ 
          title: "Draft Created", 
          description: "Your term sheet is ready for review. Edit it below before sending." 
        });
      } else {
        toast({ title: "Error", description: data.error || "Failed to create document", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create PandaDoc document", variant: "destructive" });
    },
  });

  // PandaDoc send draft mutation
  const sendPandadocDraftMutation = useMutation({
    mutationFn: async () => {
      if (!pandadocDraft) throw new Error('No draft to send');
      const res = await apiRequest('POST', `/api/esign/pandadoc/documents/${pandadocDraft.envelopeId}/send`, {
        sendMethod: pandadocSendMethod,
        subject: `Document for Signature: ${quote.quoteName || 'Loan Agreement'}`,
        message: `Please review and sign the attached document for your loan application.`,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPandadocResult({
          success: true,
          signingUrl: data.envelope?.signingUrl,
          envelopeId: data.envelope?.id,
        });
        setPandadocDraft(null);
        setPandadocEditorToken(null);
        toast({ 
          title: "Term Sheet Sent!", 
          description: pandadocSendMethod === 'email' 
            ? "The recipient will receive an email with the signing link." 
            : "Opening signing session..." 
        });
        if (data.envelope?.signingUrl) {
          window.open(data.envelope.signingUrl, '_blank');
        }
      } else {
        toast({ title: "Error", description: data.error || "Failed to send document", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to send document", variant: "destructive" });
    },
  });

  // Fetch template roles when template ID changes
  useEffect(() => {
    if (!pandadocTemplateId) {
      setTemplateRoles([]);
      setTemplateRolesError(null);
      return;
    }

    const fetchTemplateDetails = async () => {
      setTemplateRolesLoading(true);
      setTemplateRolesError(null);
      try {
        const res = await fetch(`/api/esign/pandadoc/templates/${pandadocTemplateId}/details`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to fetch template details');
        }
        const data = await res.json();
        const roles = data.roles || [];
        setTemplateRoles(roles);
        
        // Update recipient roles to first available role if they're empty
        if (roles.length > 0) {
          setPandadocRecipients(prev => prev.map(r => ({
            ...r,
            role: r.role || roles[0].name,
          })));
        }
      } catch (error: any) {
        console.error('Error fetching template details:', error);
        setTemplateRolesError(error.message);
        setTemplateRoles([]);
      } finally {
        setTemplateRolesLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchTemplateDetails, 500);
    return () => clearTimeout(debounceTimer);
  }, [pandadocTemplateId]);

  useEffect(() => {
    if (!pandadocEditorToken || !editorContainerRef.current) return;
    
    const containerId = 'pandadoc-editor-container';
    editorContainerRef.current.id = containerId;
    
    let editorInstance: any = null;
    
    const initEditor = async () => {
      try {
        const { Editor } = await import('pandadoc-editor');
        const container = document.getElementById(containerId);
        const containerWidth = container?.clientWidth || 1200;
        const containerHeight = container?.clientHeight || 700;
        editorInstance = new Editor(containerId, {
          width: containerWidth,
          height: containerHeight,
          token: pandadocEditorToken,
          fieldPlacementOnly: false,
        });
        editorInstance.open();
      } catch (err) {
        console.error('Failed to initialize PandaDoc editor:', err);
      }
    };
    
    initEditor();
    
    return () => {
      if (editorInstance) {
        try {
          editorInstance.close?.();
        } catch (e) {
          // ignore cleanup errors
        }
      }
    };
  }, [pandadocEditorToken]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setPageCount(numPages);
  };

  const onPageLoadSuccess = (page: any) => {
    const viewport = page.getViewport({ scale: 1.0 });
    setPdfDimensions({ width: viewport.width, height: viewport.height });
  };

  // Rescale template fields when PDF dimensions are known
  useEffect(() => {
    if (!rawTemplateFields || !templateDimensions) return;
    
    // Only rescale if PDF dimensions have been updated from defaults
    const scaleX = pdfDimensions.width / templateDimensions.width;
    const scaleY = pdfDimensions.height / templateDimensions.height;
    
    // Apply scaling to all fields
    const scaledFields = rawTemplateFields.map(field => ({
      ...field,
      x: field.x * scaleX,
      y: field.y * scaleY,
      width: field.width * scaleX,
      height: field.height * scaleY,
    }));
    
    setFields(scaledFields);
    // Clear raw fields after scaling to prevent re-scaling
    setRawTemplateFields(null);
    setTemplateDimensions(null);
  }, [pdfDimensions, rawTemplateFields, templateDimensions]);

  const createDocumentMutation = useMutation({
    mutationFn: async (data: { name: string; fileName: string; fileData: string; pageCount: number }) => {
      const res = await apiRequest('POST', '/api/documents', {
        quoteId: quote.id,
        ...data
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.document) {
        setDocumentId(data.document.id);
        toast({ title: "Document Uploaded", description: "PDF uploaded successfully" });
        setStep("signers");
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload document", variant: "destructive" });
    }
  });

  const useTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const templateRes = await fetch(`/api/document-templates/${templateId}`, { credentials: 'include' });
      if (!templateRes.ok) throw new Error('Failed to load template');
      const templateData = await templateRes.json();
      
      const pdfRes = await fetch(templateData.template.pdfUrl);
      if (!pdfRes.ok) throw new Error('Failed to load template PDF');
      const pdfBlob = await pdfRes.blob();
      const reader = new FileReader();
      
      return new Promise<{ template: DocumentTemplate; fields: TemplateField[]; pdfBase64: string }>((resolve, reject) => {
        reader.onload = () => {
          resolve({
            template: templateData.template,
            fields: templateData.fields,
            pdfBase64: reader.result as string,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });
    },
    onSuccess: async (data) => {
      try {
        setPdfData(data.pdfBase64);
        setFileName(data.template.pdfFileName);
        setPageCount(data.template.pageCount);
        
        const docRes = await apiRequest('POST', '/api/documents', {
          quoteId: quote.id,
          name: `${data.template.name} - ${quote.customerFirstName} ${quote.customerLastName}`,
          fileName: data.template.pdfFileName,
          fileData: data.pdfBase64,
          pageCount: data.template.pageCount,
        });
        const docData = await docRes.json();
        
        if (!docData.success || !docData.document) {
          throw new Error(docData.error || 'Failed to create document');
        }
        
        setDocumentId(docData.document.id);
        
        const uniqueSignerRoles = [...new Set(data.fields.filter(f => f.signerRole).map(f => f.signerRole))];
        const defaultSigners: { name: string; email: string; color: string }[] = [];
        
        if (uniqueSignerRoles.includes('borrower') || uniqueSignerRoles.length === 0) {
          defaultSigners.push({
            name: `${quote.customerFirstName} ${quote.customerLastName}`.trim() || 'Borrower',
            email: quote.customerEmail || '',
            color: SIGNER_COLORS[0],
          });
        }
        
        const createdSigners: Array<{ id: number; name: string; email: string; color: string }> = [];
        for (const signer of defaultSigners) {
          if (signer.email) {
            try {
              const signerRes = await apiRequest('POST', `/api/documents/${docData.document.id}/signers`, signer);
              const signerData = await signerRes.json();
              if (signerData.success && signerData.signer) {
                createdSigners.push(signerData.signer);
              }
            } catch (signerError) {
              console.error('Failed to create signer:', signerError);
            }
          }
        }
        setSigners(createdSigners);
        
        if (data.fields && data.fields.length > 0) {
          // Get template's original PDF dimensions for coordinate scaling
          const templateDims = Array.isArray(data.template.pageDimensions) && data.template.pageDimensions[0]
            ? data.template.pageDimensions[0]
            : { width: 612, height: 792 }; // Standard letter size as fallback
          
          const templateFields: FieldData[] = data.fields.map((tf, index) => {
            const signerIndex = tf.signerRole === 'borrower' ? 0 : (tf.signerRole === 'lender' ? 1 : 0);
            const signer = createdSigners[signerIndex] || createdSigners[0];
            
            // Use current quote data for prepopulated fields, fall back to template default
            const isPrepopulated = ALL_PREPOPULATED_FIELD_TYPES.some(f => f.type === tf.fieldType);
            const currentQuoteValue = isPrepopulated ? getFieldValue(tf.fieldType, quote) : '';
            
            // Calculate scale ratios to handle different PDF render sizes
            // Use template dimensions as stored, current PDF dimensions default to 612x792
            const scaleX = pdfDimensions.width / (templateDims.width || 612);
            const scaleY = pdfDimensions.height / (templateDims.height || 792);
            
            return {
              fieldType: tf.fieldType,
              signerId: signer?.id || 0,
              pageNumber: tf.pageNumber,
              x: tf.x * scaleX,
              y: tf.y * scaleY,
              width: tf.width * scaleX,
              height: tf.height * scaleY,
              value: currentQuoteValue || tf.defaultValue || '',
            };
          });
          setFields(templateFields);
          setTemplateFieldsLoaded(true);
        }
        
        toast({ title: "Template Loaded", description: "Template and fields loaded. Add signers and review." });
        setStep("signers");
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to set up document", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to load template", variant: "destructive" });
    }
  });

  const addSignerMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; color: string }) => {
      const res = await apiRequest('POST', `/api/documents/${documentId}/signers`, data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.signer) {
        setSigners(prev => [...prev, { ...data.signer }]);
        setNewSignerName("");
        setNewSignerEmail("");
      }
    }
  });

  const deleteSignerMutation = useMutation({
    mutationFn: async (signerId: number) => {
      await apiRequest('DELETE', `/api/signers/${signerId}`);
      return signerId;
    },
    onSuccess: (signerId) => {
      setSigners(prev => prev.filter(s => s.id !== signerId));
      setFields(prev => prev.filter(f => f.signerId !== signerId));
    }
  });

  const saveFieldsMutation = useMutation({
    mutationFn: async () => {
      console.log('Saving fields:', fields);
      console.log('Document ID:', documentId);
      const res = await apiRequest('POST', `/api/documents/${documentId}/fields/bulk`, { fields });
      const data = await res.json();
      console.log('Save fields response:', data);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save fields');
      }
      return data;
    },
    onSuccess: () => {
      toast({ title: "Fields Saved", description: "Signature fields saved successfully" });
      setStep("send");
    },
    onError: (error: Error) => {
      console.error('Save fields error:', error);
      toast({ title: "Error", description: error.message || "Failed to save fields", variant: "destructive" });
    }
  });

  const sendDocumentMutation = useMutation({
    mutationFn: async () => {
      console.log('Sending document with ID:', documentId);
      const res = await apiRequest('POST', `/api/documents/${documentId}/send`, { senderName });
      const data = await res.json();
      console.log('Send response:', data);
      if (!data.success) {
        throw new Error(data.error || 'Failed to send document');
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Document Sent!", description: `Signing invitations sent to ${signers.length} signer(s)` });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      onClose();
    },
    onError: (error: Error) => {
      console.error('Send error:', error);
      toast({ title: "Error", description: error.message || "Failed to send document", variant: "destructive" });
    }
  });

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: "Error", description: "Template name is required", variant: "destructive" });
      return;
    }
    
    if (!pdfData || fields.length === 0) {
      toast({ title: "Error", description: "Please ensure you have a PDF and at least one field placed", variant: "destructive" });
      return;
    }
    
    setIsSavingTemplate(true);
    
    try {
      const blob = await fetch(pdfData).then(r => r.blob());
      const pdfFileName = fileName || "template.pdf";
      
      // Step 1: Request presigned upload URL from object storage
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: pdfFileName,
          size: blob.size,
          contentType: "application/pdf"
        })
      });
      
      if (!urlRes.ok) {
        throw new Error("Failed to get upload URL");
      }
      
      const { uploadURL, objectPath } = await urlRes.json();
      
      // Step 2: Upload directly to the presigned URL
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "application/pdf" }
      });
      
      if (!uploadRes.ok) {
        throw new Error("Failed to upload PDF");
      }
      
      // Use the objectPath as the URL for the template
      const uploadData = { url: objectPath };
      
      const templateRes = await apiRequest("POST", "/api/admin/document-templates", {
        name: templateName,
        description: templateDescription || null,
        category: templateCategory || null,
        loanType: (quote.loanData as any)?.loanType || (quote.loanData as any)?.selectedLoanType || null,
        pdfUrl: uploadData.url,
        pdfFileName: fileName || "template.pdf",
        pageCount: pageCount,
        pageDimensions: [{ width: pdfDimensions.width, height: pdfDimensions.height }],
      });
      
      const templateData = await templateRes.json();
      
      if (!templateData.template?.id) {
        throw new Error("Failed to create template");
      }
      
      const templateFields = fields.map((field, index) => ({
        fieldName: `Field ${index + 1}`,
        fieldKey: `field_${index + 1}`,
        fieldType: field.fieldType,
        pageNumber: field.pageNumber,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        fontSize: 12,
        signerRole: signers.find(s => s.id === field.signerId) ? 'borrower' : null,
        isRequired: true,
        defaultValue: field.value || null,
      }));
      
      if (templateFields.length > 0) {
        await apiRequest("PUT", `/api/admin/document-templates/${templateData.template.id}/fields`, {
          fields: templateFields,
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/document-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-templates"] });
      
      toast({ title: "Template Saved!", description: `"${templateName}" saved with ${fields.length} field(s)` });
      setShowSaveAsTemplate(false);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateCategory("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save template", variant: "destructive" });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({ title: "Invalid File", description: "Please upload a PDF file", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPdfData(base64);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleUploadSubmit = () => {
    if (!pdfData || !fileName) return;
    createDocumentMutation.mutate({
      name: `Agreement for ${quote.customerFirstName} ${quote.customerLastName}`,
      fileName,
      fileData: pdfData,
      pageCount
    });
  };

  const handleAddSigner = () => {
    if (!newSignerName.trim() || !newSignerEmail.trim()) {
      toast({ title: "Missing Info", description: "Please enter name and email", variant: "destructive" });
      return;
    }
    
    const color = SIGNER_COLORS[signers.length % SIGNER_COLORS.length];
    addSignerMutation.mutate({ name: newSignerName, email: newSignerEmail, color });
  };

  const handlePdfClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedFieldType || selectedSignerIndex < 0 || !signers[selectedSignerIndex]?.id) return;
    
    const container = pdfContainerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / pdfScale;
    const y = (e.clientY - rect.top) / pdfScale;
    
    const loanData = quote.loanData as Record<string, unknown> || {};
    const prepopulatedFields = getPrepopulatedFieldTypes(loanData);
    const allFieldTypes = [...SIGNATURE_FIELD_TYPES, ...prepopulatedFields];
    const fieldConfig = allFieldTypes.find(f => f.type === selectedFieldType);
    if (!fieldConfig) return;
    
    const isPrepopulated = prepopulatedFields.some(f => f.type === selectedFieldType);
    const value = isPrepopulated ? getFieldValue(selectedFieldType, quote) : undefined;
    
    const clampedX = Math.max(0, Math.min(x, pdfDimensions.width - fieldConfig.width));
    const clampedY = Math.max(0, Math.min(y, pdfDimensions.height - fieldConfig.height));
    
    const newField: FieldData = {
      signerId: signers[selectedSignerIndex].id!,
      pageNumber: currentPage,
      fieldType: selectedFieldType,
      x: clampedX,
      y: clampedY,
      width: fieldConfig.width,
      height: fieldConfig.height,
      value
    };
    
    setFields(prev => [...prev, newField]);
    setSelectedFieldType(null);
  };

  const updateField = useCallback((index: number, updates: Partial<FieldData>) => {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  }, []);

  const removeField = useCallback((index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  }, []);

  const currentPageFields = fields.filter(f => f.pageNumber === currentPage);
  const scaledWidth = pdfDimensions.width * pdfScale;
  const scaledHeight = pdfDimensions.height * pdfScale;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className={`max-h-[90vh] overflow-hidden flex flex-col ${pandadocDraft && pandadocEditorToken ? 'max-w-[95vw] w-[95vw] h-[90vh]' : 'max-w-5xl'}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Send Quote for Signature
          </DialogTitle>
        </DialogHeader>

        <Tabs value={step} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="upload" disabled={step !== "upload" && !documentId}>
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="signers" disabled={!documentId}>
              <Users className="w-4 h-4 mr-2" />
              Signers
            </TabsTrigger>
            <TabsTrigger value="fields" disabled={signers.length === 0}>
              <FileText className="w-4 h-4 mr-2" />
              Fields
            </TabsTrigger>
            <TabsTrigger value="send" disabled={fields.length === 0}>
              <Send className="w-4 h-4 mr-2" />
              Send
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="flex-1 overflow-auto p-4">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  <div className="flex justify-center gap-4 mb-6">
                    <Button
                      variant={uploadMode === "template" ? "default" : "outline"}
                      onClick={() => setUploadMode("template")}
                      className="flex items-center gap-2"
                      data-testid="button-use-template"
                    >
                      <FileStack className="w-4 h-4" />
                      Use Template
                    </Button>
                    <Button
                      variant={uploadMode === "manual" ? "default" : "outline"}
                      onClick={() => setUploadMode("manual")}
                      className="flex items-center gap-2"
                      data-testid="button-upload-manual"
                    >
                      <Upload className="w-4 h-4" />
                      Upload PDF
                    </Button>
                    <Button
                      variant={uploadMode === "pandadoc" ? "default" : "outline"}
                      onClick={() => setUploadMode("pandadoc")}
                      className="flex items-center gap-2"
                      data-testid="button-use-pandadoc"
                    >
                      <ExternalLink className="w-4 h-4" />
                      PandaDoc
                    </Button>
                  </div>

                  {uploadMode === "template" && (
                    <div className="space-y-4">
                      <div className="text-center mb-4">
                        <Sparkles className="w-10 h-10 mx-auto text-blue-500 mb-2" />
                        <h3 className="text-lg font-semibold">Choose a Template</h3>
                        <p className="text-sm text-muted-foreground">
                          Templates have pre-configured fields that auto-populate with loan data
                        </p>
                      </div>
                      
                      {templatesLoading ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                          <p>Loading templates...</p>
                        </div>
                      ) : templatesError ? (
                        <div className="text-center py-8 text-destructive">
                          <FileStack className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Failed to load templates</p>
                          <p className="text-sm">Please try again or upload a PDF manually</p>
                        </div>
                      ) : templatesData?.templates && templatesData.templates.length > 0 ? (
                        <div className="max-w-md mx-auto space-y-4">
                          <Select
                            value={selectedTemplateId}
                            onValueChange={setSelectedTemplateId}
                          >
                            <SelectTrigger data-testid="select-template">
                              <SelectValue placeholder="Select a document template" />
                            </SelectTrigger>
                            <SelectContent>
                              {templatesData.templates.map((template) => (
                                <SelectItem key={template.id} value={template.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <FileStack className="w-4 h-4 text-blue-500" />
                                    <span>{template.name}</span>
                                    {template.category && (
                                      <Badge variant="outline" className="ml-2 text-xs">
                                        {template.category}
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {selectedTemplateId && (
                            <Button
                              onClick={() => useTemplateMutation.mutate(parseInt(selectedTemplateId))}
                              disabled={useTemplateMutation.isPending}
                              className="w-full"
                              data-testid="button-load-template"
                            >
                              {useTemplateMutation.isPending ? (
                                <>Loading Template...</>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  Use This Template
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileStack className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No templates available</p>
                          <p className="text-sm">Upload a PDF manually or ask an admin to create templates</p>
                        </div>
                      )}
                    </div>
                  )}

                  {uploadMode === "manual" && (
                    <div className="text-center space-y-4">
                      <div 
                        className="border-2 border-dashed rounded-lg p-8 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="upload-area"
                      >
                        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">Click to upload PDF</p>
                        <p className="text-sm text-muted-foreground">or drag and drop</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                          data-testid="file-input"
                        />
                      </div>
                  
                      {pdfData && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-center gap-2 text-green-600">
                            <Check className="w-5 h-5" />
                            <span>{fileName}</span>
                          </div>
                          <div className="border rounded-lg overflow-hidden max-h-[300px]">
                            <PDFDocument file={pdfData} onLoadSuccess={onDocumentLoadSuccess}>
                              <PDFPage pageNumber={1} width={400} />
                            </PDFDocument>
                          </div>
                          <Button 
                            onClick={handleUploadSubmit} 
                            disabled={createDocumentMutation.isPending}
                            data-testid="button-upload-continue"
                          >
                            {createDocumentMutation.isPending ? "Uploading..." : "Continue"}
                            <ChevronRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {uploadMode === "pandadoc" && (
                    <div className="space-y-6">
                      <div className="text-center mb-4">
                        <ExternalLink className="w-10 h-10 mx-auto text-purple-500 mb-2" />
                        <h3 className="text-lg font-semibold">Send via PandaDoc</h3>
                        <p className="text-sm text-muted-foreground">
                          Use your PandaDoc templates with automatic token population from quote data
                        </p>
                      </div>

                      {pandadocResult?.success ? (
                        <div className="text-center space-y-4 py-8">
                          <div className="w-16 h-16 rounded-full bg-green-100 mx-auto flex items-center justify-center">
                            <Check className="w-8 h-8 text-green-600" />
                          </div>
                          <h3 className="text-lg font-semibold text-green-600">Term Sheet Sent Successfully!</h3>
                          <p className="text-muted-foreground">
                            {pandadocSendMethod === 'email' 
                              ? 'The recipient will receive an email with the signing link.' 
                              : 'A signing session has been created.'}
                          </p>
                          {pandadocResult.signingUrl && (
                            <Button 
                              variant="outline" 
                              onClick={() => window.open(pandadocResult.signingUrl, '_blank')}
                              data-testid="button-open-signing-url"
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Open Signing Link
                            </Button>
                          )}
                          <Button onClick={onClose} data-testid="button-close-success">Close</Button>
                        </div>
                      ) : pandadocDraft ? (
                        <div className="flex flex-col h-full gap-4">
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              <FileText className="w-5 h-5 text-primary" />
                              <h3 className="font-semibold">Review & Edit Draft</h3>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(pandadocDraft.editorUrl, '_blank')}
                                data-testid="button-open-pandadoc-external"
                              >
                                <ExternalLink className="w-4 h-4 mr-1" />
                                Open in PandaDoc
                              </Button>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={pandadocSendMethod === "email" ? "default" : "outline"}
                                  onClick={() => setPandadocSendMethod("email")}
                                  data-testid="button-draft-send-email"
                                >
                                  <Mail className="w-4 h-4 mr-1" />
                                  Email
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={pandadocSendMethod === "embedded" ? "default" : "outline"}
                                  onClick={() => setPandadocSendMethod("embedded")}
                                  data-testid="button-draft-send-embedded"
                                >
                                  <ExternalLink className="w-4 h-4 mr-1" />
                                  Embedded
                                </Button>
                              </div>
                              <Button
                                onClick={() => sendPandadocDraftMutation.mutate()}
                                disabled={sendPandadocDraftMutation.isPending}
                                size="sm"
                                data-testid="button-send-draft"
                              >
                                {sendPandadocDraftMutation.isPending ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    Sending...
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-4 h-4 mr-1" />
                                    Send for Signature
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          
                          <div className="flex-1 min-h-[600px] border rounded-lg overflow-hidden relative" style={{ height: 'calc(90vh - 180px)' }}>
                            {pandadocEditorLoading ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                                <div className="text-center space-y-2">
                                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                                  <p className="text-sm text-muted-foreground">Loading editor...</p>
                                </div>
                              </div>
                            ) : !pandadocEditorToken ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                                <div className="text-center space-y-3 max-w-sm">
                                  <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
                                  <p className="text-sm text-muted-foreground">
                                    Embedded editor not available. You can still review and edit in PandaDoc directly.
                                  </p>
                                  <Button
                                    variant="outline"
                                    onClick={() => window.open(pandadocDraft.editorUrl, '_blank')}
                                    data-testid="button-review-pandadoc-fallback"
                                  >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Open in PandaDoc
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                            <div ref={editorContainerRef} className="w-full h-full min-h-[500px]" />
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-lg mx-auto space-y-6">
                          <div className="space-y-2">
                            <Label>Select Template</Label>
                            {pandadocTemplatesLoading ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading templates...
                              </div>
                            ) : pandadocTemplatesData?.templates && pandadocTemplatesData.templates.length > 0 ? (
                              <Select
                                value={pandadocTemplateId}
                                onValueChange={(value) => setPandadocTemplateId(value)}
                              >
                                <SelectTrigger data-testid="select-pandadoc-template">
                                  <SelectValue placeholder="Choose a PandaDoc template" />
                                </SelectTrigger>
                                <SelectContent>
                                  {pandadocTemplatesData.templates.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                      {t.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                placeholder="Enter PandaDoc template UUID"
                                value={pandadocTemplateId}
                                onChange={(e) => setPandadocTemplateId(e.target.value)}
                                data-testid="input-pandadoc-template"
                              />
                            )}
                            <p className="text-xs text-muted-foreground">
                              Select a template or paste a Template ID from PandaDoc
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label>Send Method</Label>
                            <div className="flex gap-4">
                              <Button
                                type="button"
                                variant={pandadocSendMethod === "email" ? "default" : "outline"}
                                onClick={() => setPandadocSendMethod("email")}
                                className="flex-1"
                                data-testid="button-send-email"
                              >
                                <Mail className="w-4 h-4 mr-2" />
                                Email
                              </Button>
                              <Button
                                type="button"
                                variant={pandadocSendMethod === "embedded" ? "default" : "outline"}
                                onClick={() => setPandadocSendMethod("embedded")}
                                className="flex-1"
                                data-testid="button-send-embedded"
                              >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Embedded
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label>Recipients</Label>
                            {pandadocRecipients.map((recipient, idx) => (
                              <div key={idx} className="flex gap-2 items-center flex-wrap">
                                <Input
                                  placeholder="Name"
                                  value={recipient.name}
                                  onChange={(e) => {
                                    const updated = [...pandadocRecipients];
                                    updated[idx].name = e.target.value;
                                    setPandadocRecipients(updated);
                                  }}
                                  className="flex-1 min-w-[120px]"
                                  data-testid={`input-recipient-name-${idx}`}
                                />
                                <Input
                                  placeholder="Email"
                                  type="email"
                                  value={recipient.email}
                                  onChange={(e) => {
                                    const updated = [...pandadocRecipients];
                                    updated[idx].email = e.target.value;
                                    setPandadocRecipients(updated);
                                  }}
                                  className="flex-1 min-w-[140px]"
                                  data-testid={`input-recipient-email-${idx}`}
                                />
                                {templateRoles.length > 0 ? (
                                  <Select
                                    value={recipient.role}
                                    onValueChange={(value) => {
                                      const updated = [...pandadocRecipients];
                                      updated[idx].role = value;
                                      setPandadocRecipients(updated);
                                    }}
                                  >
                                    <SelectTrigger className="w-32" data-testid={`select-recipient-role-${idx}`}>
                                      <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {templateRoles.map((role) => (
                                        <SelectItem key={role.name} value={role.name}>
                                          {role.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    placeholder="Role"
                                    value={recipient.role}
                                    onChange={(e) => {
                                      const updated = [...pandadocRecipients];
                                      updated[idx].role = e.target.value;
                                      setPandadocRecipients(updated);
                                    }}
                                    className="w-32"
                                    data-testid={`input-recipient-role-${idx}`}
                                  />
                                )}
                                {pandadocRecipients.length > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPandadocRecipients(prev => prev.filter((_, i) => i !== idx))}
                                    data-testid={`button-remove-recipient-${idx}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPandadocRecipients(prev => [...prev, { 
                                name: '', 
                                email: '', 
                                role: templateRoles.length > 0 ? templateRoles[0].name : '' 
                              }])}
                              data-testid="button-add-recipient"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add Recipient
                            </Button>
                            
                            {templateRolesLoading && (
                              <p className="text-sm text-muted-foreground mt-2">Loading template roles...</p>
                            )}
                            {templateRolesError && (
                              <p className="text-sm text-destructive mt-2">Error: {templateRolesError}</p>
                            )}
                            {templateRoles.length > 0 && !templateRolesLoading && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Available roles: {templateRoles.map(r => r.name).join(', ')}
                              </p>
                            )}
                          </div>

                          <div className="border-t pt-4">
                            <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="font-medium">Fields Auto-Populated from Quote</h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowTokenPreview(!showTokenPreview)}
                                  data-testid="button-toggle-tokens"
                                >
                                  {showTokenPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  {showTokenPreview ? 'Hide All' : 'Show All'}
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div><span className="text-muted-foreground">Borrower:</span> {quote.customerFirstName} {quote.customerLastName}</div>
                                <div><span className="text-muted-foreground">Loan Amount:</span> ${((quote.loanData as any)?.loanAmount || 0).toLocaleString()}</div>
                                <div><span className="text-muted-foreground">Interest Rate:</span> {quote.interestRate}%</div>
                                <div><span className="text-muted-foreground">Property:</span> {quote.propertyAddress}</div>
                                {(quote.loanData as any)?.loanTerm && (
                                  <div><span className="text-muted-foreground">Loan Term:</span> {(quote.loanData as any).loanTerm}</div>
                                )}
                                {(quote.loanData as any)?.loanType && (
                                  <div><span className="text-muted-foreground">Loan Type:</span> {(quote.loanData as any).loanType}</div>
                                )}
                                {quote.pointsCharged > 0 && (
                                  <div><span className="text-muted-foreground">Points:</span> {quote.pointsCharged}%</div>
                                )}
                                {(quote.loanData as any)?.dscr && (
                                  <div><span className="text-muted-foreground">DSCR:</span> {(quote.loanData as any).dscr}</div>
                                )}
                              </div>
                              {showTokenPreview && tokenPreviewData && (
                                <div className="border-t mt-3 pt-3">
                                  <p className="text-xs text-muted-foreground mb-2">
                                    These token names can be used in your PandaDoc template as {'{{token_name}}'}:
                                  </p>
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {tokenPreviewData.tokens
                                      .filter((t: { name: string; value: string }) => t.value)
                                      .map((t: { name: string; value: string }) => (
                                        <div key={t.name} className="flex items-center gap-2 text-xs font-mono">
                                          <span className="text-muted-foreground min-w-[180px]">{`{{${t.name}}}`}</span>
                                          <span className="truncate">{t.value}</span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {pandadocTemplateId && templateRolesError && (
                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4" data-testid="error-template-fetch">
                              <p className="text-sm text-destructive">
                                Could not fetch template roles. Please verify your Template ID is correct.
                              </p>
                            </div>
                          )}
                          {pandadocTemplateId && !templateRolesLoading && templateRoles.length === 0 && !templateRolesError && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4" data-testid="warning-no-roles">
                              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                                No roles found in this template. Please ensure your PandaDoc template has roles defined, or check the Template ID.
                              </p>
                            </div>
                          )}
                          {templateRoles.length > 0 && pandadocRecipients.some(r => r.role && !templateRoles.some(tr => tr.name === r.role)) && (
                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4" data-testid="error-role-mismatch">
                              <p className="text-sm text-destructive">
                                Some recipient roles don't match template roles. Please select a valid role for each recipient.
                              </p>
                            </div>
                          )}

                          <Button
                            onClick={() => createPandadocDraftMutation.mutate()}
                            disabled={
                              !pandadocTemplateId || 
                              pandadocRecipients.some(r => !r.email || !r.role.trim()) || 
                              templateRolesLoading ||
                              !!templateRolesError ||
                              (pandadocTemplateId && templateRoles.length === 0 && !templateRolesLoading) ||
                              (templateRoles.length > 0 && pandadocRecipients.some(r => !templateRoles.some(tr => tr.name === r.role.trim()))) ||
                              createPandadocDraftMutation.isPending
                            }
                            className="w-full"
                            data-testid="button-create-pandadoc-draft"
                          >
                            {createPandadocDraftMutation.isPending ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating Draft...
                              </>
                            ) : (
                              <>
                                <FileText className="w-4 h-4 mr-2" />
                                Create Term Sheet Draft
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signers" className="flex-1 overflow-auto p-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Signer Name"
                    value={newSignerName}
                    onChange={(e) => setNewSignerName(e.target.value)}
                    data-testid="input-signer-name"
                  />
                  <Input
                    placeholder="Email Address"
                    type="email"
                    value={newSignerEmail}
                    onChange={(e) => setNewSignerEmail(e.target.value)}
                    data-testid="input-signer-email"
                  />
                  <Button onClick={handleAddSigner} disabled={addSignerMutation.isPending} data-testid="button-add-signer">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {signers.map((signer, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`signer-${i}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: signer.color }} />
                        <div>
                          <p className="font-medium">{signer.name}</p>
                          <p className="text-sm text-muted-foreground">{signer.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => signer.id && deleteSignerMutation.mutate(signer.id)}
                        data-testid={`delete-signer-${i}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                {signers.length > 0 && (
                  <Button onClick={() => setStep("fields")} data-testid="button-signers-continue">
                    Continue to Place Fields
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fields" className="flex-1 min-h-0 p-4">
            <div className="flex gap-4 h-full">
              <div className="w-64 space-y-4 flex-shrink-0 overflow-y-auto">
                <div>
                  <Label className="text-sm font-medium">Select Signer</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {signers.map((signer, i) => (
                      <Badge
                        key={i}
                        variant={selectedSignerIndex === i ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setSelectedSignerIndex(i)}
                        style={selectedSignerIndex === i ? { backgroundColor: signer.color } : { borderColor: signer.color, color: signer.color }}
                        data-testid={`select-signer-${i}`}
                      >
                        {signer.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Signature Fields</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {SIGNATURE_FIELD_TYPES.map(ft => (
                      <Button
                        key={ft.type}
                        variant={selectedFieldType === ft.type ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedFieldType(selectedFieldType === ft.type ? null : ft.type)}
                        className="text-xs"
                        data-testid={`field-type-${ft.type}`}
                      >
                        {ft.label}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">
                    Data Fields {isRTLQuote(quote.loanData as Record<string, unknown> || {}) ? '(RTL)' : '(DSCR)'}
                  </Label>
                  <div className="grid grid-cols-1 gap-1 mt-2 max-h-[200px] overflow-auto">
                    {getPrepopulatedFieldTypes(quote.loanData as Record<string, unknown> || {}).map(ft => {
                      const value = getFieldValue(ft.type, quote);
                      return (
                        <Button
                          key={ft.type}
                          variant={selectedFieldType === ft.type ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedFieldType(selectedFieldType === ft.type ? null : ft.type)}
                          className="text-xs justify-start h-auto py-1"
                          data-testid={`field-type-${ft.type}`}
                        >
                          <span className="truncate">{ft.label}: {value || '—'}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    {selectedFieldType 
                      ? `Click on the PDF to place a ${selectedFieldType} field`
                      : "Select a field type, then click on the PDF to place it"
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Drag fields to move. Use corner handle to resize.
                  </p>
                </div>
                
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                    data-testid="zoom-out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">{Math.round(pdfScale * 100)}%</span>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setPdfScale(s => Math.min(2, s + 0.1))}
                    data-testid="zoom-in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="pt-2">
                  <Badge variant="secondary">{fields.length} field(s) placed</Badge>
                </div>
                
                <div className="space-y-2">
                  <Button 
                    onClick={() => saveFieldsMutation.mutate()} 
                    disabled={fields.length === 0 || saveFieldsMutation.isPending}
                    className="w-full"
                    data-testid="button-save-fields"
                  >
                    {saveFieldsMutation.isPending ? "Saving..." : "Save & Continue"}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={() => setShowSaveAsTemplate(true)}
                    disabled={fields.length === 0}
                    className="w-full"
                    data-testid="button-save-as-template"
                  >
                    <FileStack className="w-4 h-4 mr-2" />
                    Save as Template
                  </Button>
                </div>
              </div>
              
              <div 
                className="flex-1 border rounded-lg bg-slate-100 min-h-0 overflow-auto"
              >
                <div className="p-4 inline-block min-w-full">
                  {pageCount > 1 && (
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                        data-testid="prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm">Page {currentPage} of {pageCount}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= pageCount}
                        onClick={() => setCurrentPage(p => p + 1)}
                        data-testid="next-page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  
                  <div 
                    ref={pdfContainerRef}
                    className="relative inline-block"
                    onClick={handlePdfClick}
                    style={{ 
                      cursor: selectedFieldType ? 'crosshair' : 'default',
                      width: scaledWidth,
                      height: scaledHeight
                    }}
                    data-testid="pdf-container"
                  >
                    {pdfData ? (
                      <PDFDocument file={pdfData}>
                        <PDFPage 
                          pageNumber={currentPage} 
                          scale={pdfScale}
                          onLoadSuccess={onPageLoadSuccess}
                        />
                      </PDFDocument>
                    ) : (
                      <div className="flex items-center justify-center text-slate-400 w-full h-full">
                        <div className="text-center">
                          <FileText className="w-16 h-16 mx-auto mb-2 opacity-50" />
                          <p>PDF Preview Area</p>
                        </div>
                      </div>
                    )}
                    
                    <div 
                      style={{ 
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: scaledWidth, 
                        height: scaledHeight,
                        pointerEvents: 'none'
                      }}
                    >
                      {currentPageFields.map((field, i) => {
                        const globalIndex = fields.findIndex(f => f === field);
                        const signer = signers.find(s => s.id === field.signerId);
                        return (
                          <DraggableResizableField
                            key={globalIndex}
                            field={field}
                            index={globalIndex}
                            signer={signer}
                            onUpdate={updateField}
                            onRemove={removeField}
                            containerWidth={pdfDimensions.width}
                            containerHeight={pdfDimensions.height}
                            scale={pdfScale}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="send" className="flex-1 overflow-auto p-4">
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="text-center space-y-2">
                  <Mail className="w-12 h-12 mx-auto text-primary" />
                  <h3 className="text-xl font-semibold">Ready to Send</h3>
                  <p className="text-muted-foreground">
                    Your document will be sent to {signers.length} signer(s) for signature
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>From (Sender Name)</Label>
                  <Input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Your name or company"
                    data-testid="input-sender-name"
                  />
                </div>
                
                <div className="border rounded-lg p-4 space-y-2">
                  <h4 className="font-medium">Recipients:</h4>
                  {signers.map((signer, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: signer.color }} />
                      <span>{signer.name}</span>
                      <span className="text-muted-foreground">({signer.email})</span>
                    </div>
                  ))}
                </div>
                
                <div className="border rounded-lg p-4 space-y-2">
                  <h4 className="font-medium">Fields to Complete:</h4>
                  <p className="text-sm text-muted-foreground">
                    {fields.length} field(s) across {pageCount} page(s)
                  </p>
                </div>
                
                <Button 
                  onClick={() => sendDocumentMutation.mutate()} 
                  disabled={sendDocumentMutation.isPending}
                  className="w-full"
                  size="lg"
                  data-testid="button-send-document"
                >
                  {sendDocumentMutation.isPending ? "Sending..." : "Send for Signature"}
                  <Send className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
      
      <Dialog open={showSaveAsTemplate} onOpenChange={setShowSaveAsTemplate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileStack className="w-5 h-5 text-primary" />
              Save as Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Save this document and field layout as a reusable template for future quotes.
            </p>
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Standard Loan Agreement"
                data-testid="input-save-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-desc">Description (optional)</Label>
              <Input
                id="template-desc"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Brief description..."
                data-testid="input-save-template-desc"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={templateCategory} onValueChange={setTemplateCategory}>
                <SelectTrigger data-testid="select-save-template-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agreement">Agreement</SelectItem>
                  <SelectItem value="disclosure">Disclosure</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="addendum">Addendum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm font-medium">Template will include:</p>
              <p className="text-xs text-muted-foreground mt-1">
                • {pageCount} page(s) from "{fileName}"<br />
                • {fields.length} positioned field(s)
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSaveAsTemplate(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveAsTemplate}
              disabled={isSavingTemplate || !templateName.trim()}
              data-testid="button-confirm-save-template"
            >
              {isSavingTemplate ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

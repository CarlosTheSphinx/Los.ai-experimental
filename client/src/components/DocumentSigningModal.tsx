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
import { Upload, Users, FileText, Send, Plus, Trash2, X, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Check, Mail, ZoomIn, ZoomOut, FileStack, Sparkles, ExternalLink, Loader2, Copy, BookmarkPlus, PanelRightOpen, PanelRightClose, Save, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/use-branding";
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
  existingDocumentId?: number | null;
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
  { type: "completedProjects", label: "Completed Deals", width: 120, height: 25 },
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

function computeFontSize(height: number, width: number, text: string): number {
  const MIN_FONT = 8;
  const MAX_FONT = 24;
  let fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, height * 0.6));
  if (text && text.length > 0) {
    const avgCharWidth = fontSize * 0.6;
    const charsPerLine = Math.floor(width / avgCharWidth);
    if (charsPerLine > 0 && text.length > charsPerLine) {
      const needed = text.length / charsPerLine;
      const shrunk = height / (needed * 1.3);
      fontSize = Math.min(fontSize, Math.max(MIN_FONT, shrunk));
    }
  }
  return Math.round(fontSize * 10) / 10;
}

function DraggableResizableField({ field, index, signer, onUpdate, onRemove, containerWidth, containerHeight, scale }: DraggableFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [position, setPosition] = useState({ x: field.x, y: field.y });
  const [size, setSize] = useState({ width: field.width, height: field.height });
  const [textValue, setTextValue] = useState(field.value || '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const isPrepopulated = ALL_PREPOPULATED_FIELD_TYPES.some(f => f.type === field.fieldType);
  const isTextField = field.fieldType === 'text';
  const fieldLabel = [...SIGNATURE_FIELD_TYPES, ...ALL_PREPOPULATED_FIELD_TYPES].find(f => f.type === field.fieldType)?.label || field.fieldType;

  const dynamicFontSize = computeFontSize(size.height, size.width, textValue || field.value || fieldLabel);

  useEffect(() => {
    setPosition({ x: field.x, y: field.y });
    setSize({ width: field.width, height: field.height });
  }, [field.x, field.y, field.width, field.height]);

  useEffect(() => {
    if (field.value !== undefined && field.value !== textValue) {
      setTextValue(field.value);
    }
  }, [field.value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const textValueRef = useRef(textValue);
  textValueRef.current = textValue;

  useEffect(() => {
    return () => {
      if (isTextField && !isPrepopulated) {
        onUpdate(index, { value: textValueRef.current });
      }
    };
  }, []);

  const commitText = useCallback(() => {
    setIsEditing(false);
    onUpdate(index, { value: textValue });
  }, [index, textValue, onUpdate]);

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x * scale,
      y: e.clientY - position.y * scale
    };
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isTextField && !isPrepopulated) {
      e.stopPropagation();
      e.preventDefault();
      setIsEditing(true);
    }
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

  const displayContent = () => {
    if (isTextField && !isPrepopulated) {
      if (isEditing) {
        return (
          <textarea
            ref={inputRef}
            value={textValue}
            onChange={(e) => {
              setTextValue(e.target.value);
              onUpdate(index, { value: e.target.value });
            }}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                commitText();
              }
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            placeholder="Type here..."
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: '2px 4px',
              fontSize: `${dynamicFontSize * scale}px`,
              lineHeight: 1.3,
              color: signer?.color || '#3B82F6',
              fontFamily: 'inherit',
              overflow: 'auto',
              cursor: 'text'
            }}
            data-testid={`input-text-field-${index}`}
          />
        );
      }
      return (
        <span 
          className="font-medium px-1 w-full h-full flex items-center" 
          style={{ 
            color: textValue ? (signer?.color || '#3B82F6') : '#9CA3AF',
            fontSize: `${dynamicFontSize * scale}px`,
            lineHeight: 1.3,
            overflow: 'hidden',
            wordBreak: 'break-word'
          }}
        >
          {textValue || 'Type here...'}
        </span>
      );
    }
    return (
      <span 
        className="font-medium truncate px-1" 
        style={{ 
          color: isPrepopulated ? '#92400E' : signer?.color,
          fontSize: `${dynamicFontSize * scale}px`
        }}
      >
        {isPrepopulated && field.value ? field.value : fieldLabel}
      </span>
    );
  };

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
        cursor: isEditing ? 'text' : isDragging ? 'grabbing' : 'grab',
        userSelect: isEditing ? 'text' : 'none',
        zIndex: isActive || isEditing ? 1000 : 10,
        boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.3)' : isEditing ? '0 0 0 2px rgba(59,130,246,0.5)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        overflow: 'hidden'
      }}
      onMouseDown={handleMouseDownDrag}
      onDoubleClick={handleDoubleClick}
      data-testid={`field-${field.fieldType}-${index}`}
    >
      {displayContent()}
      
      <button
        className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/90 transition-colors"
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

export function DocumentSigningModal({ open, onClose, quote, existingDocumentId }: DocumentSigningModalProps) {
  const { toast } = useToast();
  const { branding } = useBranding();
  type Step = "upload" | "fields" | "send";
  const [step, setStep] = useState<Step>("upload");
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [signers, setSigners] = useState<Array<{ id?: number; name: string; email: string; color: string }>>([]);
  const [fields, setFields] = useState<FieldData[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<string | null>(null);
  const [selectedSignerIndex, setSelectedSignerIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [senderName, setSenderName] = useState(branding.emailSignature);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 612, height: 792 });
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateFieldsLoaded, setTemplateFieldsLoaded] = useState(false);
  const [templateDimensions, setTemplateDimensions] = useState<{ width: number; height: number } | null>(null);
  const [rawTemplateFields, setRawTemplateFields] = useState<FieldData[] | null>(null);
  
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  
  const [pandadocRecipients, setPandadocRecipients] = useState<Array<{ name: string; email: string; role: string }>>([
    { name: `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim(), email: quote.customerEmail || '', role: 'Signer' }
  ]);
  const [pdfUploaded, setPdfUploaded] = useState(false);

  const canGoToFields = pdfUploaded && pandadocRecipients.some(r => r.email.trim() && r.role.trim());
  const canGoToSend = fields.length > 0;

  const goToStep = (target: Step) => {
    if (target === "fields" && !canGoToFields) return;
    if (target === "send" && !canGoToSend) return;
    setStep(target);
  };

  const goBack = () => {
    if (step === "send") setStep("fields");
    else if (step === "fields") setStep("upload");
  };
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: templatesData, isLoading: templatesLoading, isError: templatesError } = useQuery<{ templates: DocumentTemplate[] }>({
    queryKey: ["/api/document-templates"],
    enabled: open,
  });

  const [existingDocLoaded, setExistingDocLoaded] = useState(false);

  useEffect(() => {
    if (!open || !existingDocumentId || existingDocLoaded) return;
    
    const loadExistingDocument = async () => {
      try {
        const res = await fetch(`/api/esignature/agreements/${existingDocumentId}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success || !data.agreement) {
          toast({ title: "Error", description: "Failed to load document for editing", variant: "destructive" });
          return;
        }
        const agreement = data.agreement;
        setDocumentId(agreement.id);
        setFileName(agreement.fileName || 'document.pdf');
        setPdfData(agreement.fileData);
        setPageCount(agreement.pageCount || 1);
        
        if (agreement.signers && agreement.signers.length > 0) {
          setSigners(agreement.signers.map((s: any) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            color: s.color || SIGNER_COLORS[0],
          })));
        }
        
        if (agreement.fields && agreement.fields.length > 0) {
          setFields(agreement.fields.map((f: any) => ({
            id: f.id,
            signerId: f.signerId,
            pageNumber: f.pageNumber || 1,
            fieldType: f.fieldType,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            value: f.value || '',
          })));
        }
        
        setPdfUploaded(true);
        setExistingDocLoaded(true);
        
        if (agreement.signers && agreement.signers.length > 0 && agreement.fields && agreement.fields.length > 0) {
          setStep("fields");
        } else {
          setStep("upload");
        }
      } catch (err) {
        console.error('Failed to load existing document:', err);
        toast({ title: "Error", description: "Failed to load document", variant: "destructive" });
      }
    };
    
    loadExistingDocument();
  }, [open, existingDocumentId, existingDocLoaded]);

  useEffect(() => {
    if (!open) {
      setExistingDocLoaded(false);
    }
  }, [open]);




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
        
        setPdfUploaded(true);
        toast({ title: "Template Loaded", description: "Template and fields loaded. Review recipients and continue." });
        setStep("upload");
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
      if (documentId && Number.isFinite(documentId)) {
        const res = await apiRequest('POST', `/api/documents/${documentId}/signers`, data);
        return res.json();
      }
      const tempId = -(Date.now());
      return { success: true, signer: { id: tempId, ...data, status: 'pending' } };
    },
    onSuccess: (data) => {
      if (data.success && data.signer) {
        setSigners(prev => [...prev, { ...data.signer }]);
      }
    }
  });

  const deleteSignerMutation = useMutation({
    mutationFn: async (signerId: number) => {
      if (signerId > 0) {
        await apiRequest('DELETE', `/api/signers/${signerId}`);
      }
      return signerId;
    },
    onSuccess: (signerId) => {
      setSigners(prev => prev.filter(s => s.id !== signerId));
      setFields(prev => prev.filter(f => f.signerId !== signerId));
    }
  });

  const saveFieldsMutation = useMutation({
    mutationFn: async () => {
      let activeDocId = documentId;
      
      if (!activeDocId || !Number.isFinite(activeDocId)) {
        if (!pdfData || !fileName) {
          throw new Error('Please upload a PDF document first.');
        }
        const docRes = await apiRequest('POST', '/api/documents', {
          quoteId: quote.id,
          name: `${quote.quoteName || 'Document'} - ${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim(),
          fileName,
          fileData: pdfData,
          pageCount: pageCount || 1,
        });
        const docData = await docRes.json();
        if (!docData.success || !docData.document) {
          throw new Error(docData.error || 'Failed to create document');
        }
        activeDocId = docData.document.id;
        setDocumentId(activeDocId);
      }
      
      const sanitizedFields = fields.map(f => ({
        ...f,
        signerId: Number.isFinite(f.signerId) ? f.signerId : null,
        pageNumber: Number.isFinite(f.pageNumber) ? Math.max(1, f.pageNumber) : 1,
        x: Number.isFinite(f.x) ? f.x : 0,
        y: Number.isFinite(f.y) ? f.y : 0,
        width: Number.isFinite(f.width) ? Math.max(10, f.width) : 100,
        height: Number.isFinite(f.height) ? Math.max(10, f.height) : 30,
      }));
      const res = await apiRequest('POST', `/api/documents/${activeDocId}/fields/bulk`, { 
        fields: sanitizedFields,
        signers: signers.map(s => ({ id: s.id, name: s.name, email: s.email, color: s.color }))
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save fields');
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data.signers && Array.isArray(data.signers)) {
        setSigners(data.signers.map((s: any) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          color: s.color || SIGNER_COLORS[0],
        })));
      }
      if (data.fields && Array.isArray(data.fields)) {
        setFields(data.fields.map((f: any) => ({
          id: f.id,
          signerId: f.signerId,
          pageNumber: f.pageNumber || 1,
          fieldType: f.fieldType,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          value: f.value || '',
        })));
      }
      toast({ title: "Fields Saved", description: "Signature fields saved successfully" });
      setStep("send");
    },
    onError: (error: Error) => {
      console.error('Save fields error:', error);
      toast({ title: "Error", description: error.message || "Failed to save fields", variant: "destructive" });
    }
  });


  const pandadocDebugQuery = useQuery({
    queryKey: ['/api/pandadoc/debug'],
    enabled: step === 'send',
    staleTime: 60000,
  });

  const pandadocDebug = pandadocDebugQuery.data as any;

  const [pandadocEditorUrl, setPandadocEditorUrl] = useState<string | null>(null);
  const [pandadocFallbackReason, setPandadocFallbackReason] = useState<string | null>(null);

  const sendViaPandadocMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error('No document to send');
      const res = await apiRequest('POST', `/api/documents/${documentId}/pandadoc/send`, {
        subject: `Please sign: ${quote.quoteName || 'Document'}`,
        message: `Please review and sign this document from ${senderName || branding.companyName}.`,
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to send via PandaDoc');
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data.requiresManualSend) {
        setPandadocEditorUrl(data.editorUrl);
        setPandadocFallbackReason(data.fallbackReason);
        toast({ 
          title: "Document Created in PandaDoc", 
          description: "Open PandaDoc to send the document to recipients.",
        });
        queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
        queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
      } else {
        toast({ 
          title: "Sent via PandaDoc", 
          description: `Document sent to ${data.recipients?.length || signers.length} signer(s) for signature` 
        });
        queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
        queryClient.invalidateQueries({ queryKey: ['/api/esignature/agreements'] });
        onClose();
      }
    },
    onError: (error: Error) => {
      console.error('PandaDoc send error:', error);
      toast({ title: "Error", description: error.message || "Failed to send via PandaDoc", variant: "destructive" });
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



  const handlePdfClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedFieldType || selectedSignerIndex < 0 || !signers[selectedSignerIndex]?.id) return;
    
    const container = pdfContainerRef.current;
    if (!container) return;
    
    const canvas = container.querySelector('canvas');
    const measureTarget = canvas || container;
    const rect = measureTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / pdfScale;
    const y = (e.clientY - rect.top) / pdfScale;
    
    const loanData = quote.loanData as Record<string, unknown> || {};
    const prepopulatedFields = getPrepopulatedFieldTypes(loanData);
    const allFieldTypes = [...SIGNATURE_FIELD_TYPES, ...prepopulatedFields];
    const fieldConfig = allFieldTypes.find(f => f.type === selectedFieldType);
    if (!fieldConfig) return;
    
    const isPrepopulated = prepopulatedFields.some(f => f.type === selectedFieldType);
    const value = isPrepopulated ? getFieldValue(selectedFieldType, quote) : undefined;
    
    const centeredX = x - fieldConfig.width / 2;
    const centeredY = y - fieldConfig.height / 2;
    const clampedX = Math.max(0, Math.min(centeredX, pdfDimensions.width - fieldConfig.width));
    const clampedY = Math.max(0, Math.min(centeredY, pdfDimensions.height - fieldConfig.height));
    
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
      <DialogContent className="overflow-hidden flex flex-col max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Send Quote for Signature
          </DialogTitle>
        </DialogHeader>

        <Tabs value={step} onValueChange={(v) => goToStep(v as Step)} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="upload" data-testid="step-upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload & Recipients
            </TabsTrigger>
            <TabsTrigger value="fields" disabled={!canGoToFields} data-testid="step-fields">
              <FileText className="w-4 h-4 mr-2" />
              Fields
            </TabsTrigger>
            <TabsTrigger value="send" disabled={!canGoToSend} data-testid="step-send">
              <Send className="w-4 h-4 mr-2" />
              Send
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="flex-1 overflow-auto p-4">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  <div className="text-center mb-2">
                    <Send className="w-10 h-10 mx-auto text-primary mb-2" />
                    <h3 className="text-lg font-semibold">Send via PandaDoc</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload your PDF, add recipients, place fields, then send via PandaDoc
                    </p>
                  </div>

                  {templatesData?.templates && templatesData.templates.length > 0 && (
                    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <FileStack className="w-4 h-4 text-primary" />
                        <Label className="text-sm font-medium">Use a Saved Template</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Select a previously saved template with pre-positioned fields
                      </p>
                      <div className="flex gap-2 items-end flex-wrap">
                        <Select
                          value={selectedTemplateId}
                          onValueChange={setSelectedTemplateId}
                        >
                          <SelectTrigger className="flex-1 min-w-[200px]" data-testid="select-template">
                            <SelectValue placeholder="Select a template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {templatesData.templates.map((template) => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <FileStack className="w-4 h-4 text-primary" />
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
                            data-testid="button-load-template"
                          >
                            {useTemplateMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                            ) : (
                              <>Use Template</>
                            )}
                          </Button>
                        )}
                      </div>
                      {templateFieldsLoaded && (
                        <p className="text-xs text-success flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Template loaded with pre-positioned fields
                        </p>
                      )}
                    </div>
                  )}

                  <div className="max-w-lg mx-auto space-y-6">
                    {templatesData?.templates && templatesData.templates.length > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 border-t" />
                        <span className="text-xs text-muted-foreground uppercase">or upload a new PDF</span>
                        <div className="flex-1 border-t" />
                      </div>
                    )}

                    <div className="text-center space-y-4">
                      <div
                        className="border-2 border-dashed rounded-lg p-8 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="upload-area"
                      >
                        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">Upload your Term Sheet</p>
                        <p className="text-sm text-muted-foreground">PDF, Word, Excel, images, and more</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ods,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.tif,.webp,.svg,.heic"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setPdfData(ev.target?.result as string);
                              setFileName(file.name);
                              setPdfUploaded(true);
                              setTemplateFieldsLoaded(false);
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="hidden"
                          data-testid="file-input"
                        />
                      </div>

                      {pdfData && pdfUploaded && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-center gap-2 text-success">
                            <Check className="w-5 h-5" />
                            <span>{fileName}</span>
                          </div>
                          {fileName?.toLowerCase().endsWith('.pdf') ? (
                            <div className="border rounded-lg overflow-hidden max-h-[200px]">
                              <PDFDocument file={pdfData} onLoadSuccess={onDocumentLoadSuccess}>
                                <PDFPage pageNumber={1} width={400} />
                              </PDFDocument>
                            </div>
                          ) : (
                            <div className="border rounded-lg p-6 text-center bg-muted/30">
                              <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">Document uploaded successfully</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {pdfData && pdfUploaded && (
                      <>
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
                              <Input
                                placeholder="Role (e.g. Signer)"
                                value={recipient.role}
                                onChange={(e) => {
                                  const updated = [...pandadocRecipients];
                                  updated[idx].role = e.target.value;
                                  setPandadocRecipients(updated);
                                }}
                                className="w-32"
                                data-testid={`input-recipient-role-${idx}`}
                              />
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
                            onClick={() => setPandadocRecipients(prev => [...prev, { name: '', email: '', role: 'Signer' }])}
                            data-testid="button-add-recipient"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Recipient
                          </Button>
                        </div>

                        <Button
                          onClick={() => {
                            const recipientSigners = pandadocRecipients.map((r, i) => ({
                              id: i + 1,
                              name: r.name,
                              email: r.email,
                              color: SIGNER_COLORS[i % SIGNER_COLORS.length],
                            }));
                            setSigners(recipientSigners);
                            setStep("fields");
                          }}
                          disabled={pandadocRecipients.some(r => !r.email.trim() || !r.role.trim())}
                          className="w-full"
                          data-testid="button-continue-fields"
                        >
                          Continue to Place Fields
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fields" className="flex-1 min-h-0 overflow-hidden p-4">
            {fileName && !fileName.toLowerCase().endsWith('.pdf') ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <FileText className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Field placement is not available for this file type</h3>
                <p className="text-sm text-muted-foreground mb-1 max-w-md">
                  Signature and data fields can only be placed on PDF documents. Your {fileName.split('.').pop()?.toUpperCase()} file will be sent as-is to PandaDoc for signing.
                </p>
                <p className="text-sm text-muted-foreground mb-6 max-w-md">
                  To use field placement, upload a PDF version of your document.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={goBack} data-testid="button-fields-back-nonpdf">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button onClick={() => setStep("send")} data-testid="button-skip-to-send">
                    Skip to Send
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            ) : (
            <div className="flex gap-4 h-full">
              <div className="w-64 flex-shrink-0 flex flex-col max-h-full">
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                  <div>
                    <Label className="text-sm font-medium">Select Signer</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
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
                    <div className="grid grid-cols-2 gap-1 mt-1">
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
                    <div className="grid grid-cols-1 gap-1 mt-1 max-h-[150px] overflow-auto">
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
                  
                  <div className="pt-1 border-t">
                    <p className="text-xs text-muted-foreground">
                      {selectedFieldType 
                        ? `Click on the PDF to place a ${selectedFieldType} field`
                        : "Select a field type, then click on the PDF to place it"
                      }
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
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
                    <Badge variant="secondary" className="ml-auto">{fields.length} field(s)</Badge>
                  </div>
                </div>
                
                <div className="flex-shrink-0 space-y-2 pt-3 border-t mt-2">
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

                  <Button 
                    variant="ghost"
                    onClick={goBack}
                    className="w-full"
                    data-testid="button-fields-back"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                </div>
              </div>
              
              <div
                className="flex-1 border rounded-lg bg-muted/20 min-h-0 overflow-auto"
                style={{ maxHeight: 'calc(100vh - 220px)' }}
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
                    className="relative inline-block overflow-hidden"
                    onClick={handlePdfClick}
                    style={{ 
                      cursor: selectedFieldType ? 'crosshair' : 'default',
                      width: scaledWidth,
                      height: scaledHeight,
                      fontSize: 0,
                      lineHeight: 0,
                    }}
                    data-testid="pdf-container"
                  >
                    {pdfData ? (
                      <PDFDocument file={pdfData}>
                        <PDFPage 
                          pageNumber={currentPage} 
                          scale={pdfScale}
                          onLoadSuccess={onPageLoadSuccess}
                          renderAnnotationLayer={false}
                        />
                      </PDFDocument>
                    ) : (
                      <div className="flex items-center justify-center text-muted-foreground w-full h-full">
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
            )}
          </TabsContent>

          <TabsContent value="send" className="flex-1 overflow-auto p-4">
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="text-center space-y-2">
                  <Mail className="w-12 h-12 mx-auto text-primary" />
                  <h3 className="text-xl font-semibold">Ready to Send</h3>
                  <p className="text-muted-foreground">
                    Your document will be sent to {signers.length} signer(s) for signature via PandaDoc
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
                
                {pandadocEditorUrl ? (
                  <div className="space-y-3">
                    <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                        <p className="text-sm font-medium">Document created — manual send required</p>
                      </div>
                      {pandadocFallbackReason && (
                        <p className="text-sm text-muted-foreground">{pandadocFallbackReason}</p>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => window.open(pandadocEditorUrl, '_blank')}
                      data-testid="button-open-pandadoc-editor"
                    >
                      Open in PandaDoc to Send<ExternalLink className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveAsTemplate(true)}
                      disabled={fields.length === 0}
                      className="w-full"
                      data-testid="button-fallback-save-template"
                    >
                      <BookmarkPlus className="w-4 h-4 mr-2" />
                      Save as Template
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={onClose}
                      data-testid="button-close-after-create"
                    >
                      Close
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button 
                      onClick={() => sendViaPandadocMutation.mutate()} 
                      disabled={sendViaPandadocMutation.isPending}
                      className="w-full"
                      size="lg"
                      data-testid="button-send-pandadoc"
                    >
                      {sendViaPandadocMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending via PandaDoc...</>
                      ) : (
                        <>Send via PandaDoc<Send className="w-4 h-4 ml-2" /></>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveAsTemplate(true)}
                      disabled={fields.length === 0}
                      className="w-full"
                      data-testid="button-send-save-template"
                    >
                      <BookmarkPlus className="w-4 h-4 mr-2" />
                      Save as Template
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={goBack}
                      data-testid="button-send-back"
                    >
                      <ChevronLeft className="w-4 h-4 mr-2" />
                      Back to Fields
                    </Button>
                    {import.meta.env.DEV && signers.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs opacity-60"
                        onClick={async () => {
                          try {
                            const firstSigner = signers[0];
                            const res = await apiRequest('POST', '/api/pandadoc/debug-field-placement', {
                              email: firstSigner.email,
                              name: firstSigner.name,
                            });
                            const data = await res.json();
                            if (data.editorUrl) {
                              window.open(data.editorUrl, '_blank');
                              toast({ title: 'Calibration doc sent', description: `Check ${data.editorUrl}` });
                            }
                          } catch (e: any) {
                            toast({ title: 'Calibration failed', description: e.message, variant: 'destructive' });
                          }
                        }}
                        data-testid="button-send-calibration"
                      >
                        Send Calibration Doc (Dev)
                      </Button>
                    )}
                  </div>
                )}
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
                • PDF document: "{fileName}" ({pageCount} page{pageCount !== 1 ? 's' : ''})<br />
                • {fields.length} field{fields.length !== 1 ? 's' : ''} with saved positions and types<br />
                • Field coordinates preserved for reuse
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

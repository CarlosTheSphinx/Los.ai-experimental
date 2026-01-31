import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Users, FileText, Send, Plus, Trash2, X, ChevronRight, ChevronLeft, Check, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedQuote, Document, Signer, DocumentField } from "@shared/schema";

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

const PREPOPULATED_FIELD_TYPES = [
  { type: "loanAmount", label: "Loan Amount", width: 120, height: 25 },
  { type: "interestRate", label: "Interest Rate", width: 80, height: 25 },
  { type: "propertyType", label: "Property Type", width: 120, height: 25 },
  { type: "loanPurpose", label: "Loan Purpose", width: 120, height: 25 },
  { type: "fullName", label: "Full Name", width: 180, height: 25 },
  { type: "firstName", label: "First Name", width: 120, height: 25 },
  { type: "propertyValue", label: "Property Value", width: 120, height: 25 },
  { type: "fico", label: "FICO", width: 60, height: 25 },
  { type: "ltv", label: "LTV", width: 80, height: 25 },
  { type: "prepaymentPenalty", label: "Prepay Penalty", width: 100, height: 25 },
  { type: "estimatedDscr", label: "Est. DSCR", width: 80, height: 25 },
  { type: "fullAddress", label: "Full Address", width: 250, height: 25 },
  { type: "originationFee", label: "Origination Fee", width: 120, height: 25 }
];

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
    return `${num.toFixed(3)}%`;
  };

  switch (type) {
    case 'loanAmount': return formatCurrency(loanData.loanAmount as number);
    case 'interestRate': return formatPercent(quote.interestRate);
    case 'propertyType': return String(loanData.propertyType || '');
    case 'loanPurpose': return String(loanData.loanPurpose || '');
    case 'fullName': return `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim();
    case 'firstName': return quote.customerFirstName || '';
    case 'propertyValue': return formatCurrency(loanData.propertyValue as number);
    case 'fico': return String(loanData.ficoScore || '');
    case 'ltv': return loanData.ltv ? `${loanData.ltv}%` : '';
    case 'prepaymentPenalty': return String(loanData.prepaymentPenalty || '');
    case 'estimatedDscr': return String(loanData.calculatedDscr || loanData.dscr || '');
    case 'fullAddress': return quote.propertyAddress || '';
    case 'originationFee': return formatCurrency(quote.pointsAmount);
    default: return '';
  }
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
  const [fields, setFields] = useState<Array<{
    id?: number;
    signerId: number;
    pageNumber: number;
    fieldType: string;
    x: number;
    y: number;
    width: number;
    height: number;
    value?: string;
  }>>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<string | null>(null);
  const [selectedSignerIndex, setSelectedSignerIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [senderName, setSenderName] = useState("Sphinx Capital");
  const [dragState, setDragState] = useState<{
    fieldIndex: number;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startFieldX: number;
    startFieldY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const res = await apiRequest('POST', `/api/documents/${documentId}/fields/bulk`, { fields });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Fields Saved", description: "Signature fields saved successfully" });
      setStep("send");
    }
  });

  const sendDocumentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/documents/${documentId}/send`, { senderName });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Document Sent!", description: `Signing invitations sent to ${signers.length} signer(s)` });
        queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
        onClose();
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send document", variant: "destructive" });
    }
  });

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
      setPageCount(1);
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const allFieldTypes = [...SIGNATURE_FIELD_TYPES, ...PREPOPULATED_FIELD_TYPES];
    const fieldConfig = allFieldTypes.find(f => f.type === selectedFieldType);
    if (!fieldConfig) return;
    
    const isPrepopulated = PREPOPULATED_FIELD_TYPES.some(f => f.type === selectedFieldType);
    const value = isPrepopulated ? getFieldValue(selectedFieldType, quote) : undefined;
    
    const newField = {
      signerId: signers[selectedSignerIndex].id!,
      pageNumber: currentPage,
      fieldType: selectedFieldType,
      x,
      y,
      width: fieldConfig.width,
      height: fieldConfig.height,
      value
    };
    
    setFields(prev => [...prev, newField]);
    setSelectedFieldType(null);
  };

  const removeField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleFieldMouseDown = (e: React.MouseEvent, fieldIndex: number, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    const field = fields[fieldIndex];
    if (!field) return;
    
    setDragState({
      fieldIndex,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startFieldX: field.x,
      startFieldY: field.y,
      startWidth: field.width,
      startHeight: field.height
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    
    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;
    
    setFields(prev => prev.map((field, i) => {
      if (i !== dragState.fieldIndex) return field;
      
      if (dragState.mode === 'move') {
        return {
          ...field,
          x: Math.max(0, dragState.startFieldX + deltaX),
          y: Math.max(0, dragState.startFieldY + deltaY)
        };
      } else {
        return {
          ...field,
          width: Math.max(40, dragState.startWidth + deltaX),
          height: Math.max(20, dragState.startHeight + deltaY)
        };
      }
    }));
  }, [dragState]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Add global mouse event listeners for drag/resize
  useEffect(() => {
    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  const currentPageFields = fields.filter(f => f.pageNumber === currentPage);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
            <div className="space-y-6">
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-pdf-upload"
                />
                
                {pdfData ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <Check className="w-6 h-6" />
                      <span className="font-medium">{fileName}</span>
                    </div>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      Choose Different File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 mx-auto text-slate-400" />
                    <div>
                      <p className="text-lg font-medium text-slate-700">Upload Agreement PDF</p>
                      <p className="text-sm text-slate-500">Drag and drop or click to select</p>
                    </div>
                    <Button onClick={() => fileInputRef.current?.click()} data-testid="button-select-pdf">
                      Select PDF File
                    </Button>
                  </div>
                )}
              </div>

              {pdfData && (
                <>
                  <div className="border rounded-lg overflow-hidden">
                    <iframe 
                      src={pdfData}
                      title="PDF Preview"
                      className="w-full h-[300px] border-0"
                      data-testid="pdf-preview-upload"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleUploadSubmit}
                      disabled={createDocumentMutation.isPending}
                      data-testid="button-continue-signers"
                    >
                      Continue to Signers
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="signers" className="flex-1 overflow-auto p-4">
            <div className="space-y-6">
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium mb-4">Add Signers</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={newSignerName}
                        onChange={(e) => setNewSignerName(e.target.value)}
                        placeholder="John Doe"
                        data-testid="input-signer-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newSignerEmail}
                        onChange={(e) => setNewSignerEmail(e.target.value)}
                        placeholder="john@example.com"
                        data-testid="input-signer-email"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={handleAddSigner}
                    disabled={addSignerMutation.isPending}
                    data-testid="button-add-signer"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Signer
                  </Button>
                </CardContent>
              </Card>

              {signers.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-4">Signers ({signers.length})</h3>
                    <div className="space-y-2">
                      {signers.map((signer, i) => (
                        <div 
                          key={signer.id || i}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: signer.color }}
                            />
                            <div>
                              <div className="font-medium">{signer.name}</div>
                              <div className="text-sm text-slate-500">{signer.email}</div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => signer.id && deleteSignerMutation.mutate(signer.id)}
                            data-testid={`button-delete-signer-${i}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button 
                  onClick={() => setStep("fields")}
                  disabled={signers.length === 0}
                  data-testid="button-continue-fields"
                >
                  Continue to Fields
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fields" className="flex-1 overflow-hidden flex flex-col p-4">
            <div className="flex gap-4 h-full">
              <div className="w-48 space-y-4 flex-shrink-0">
                <div>
                  <h4 className="font-medium mb-2 text-sm">Select Signer</h4>
                  <div className="space-y-1">
                    {signers.map((signer, i) => (
                      <Button
                        key={signer.id || i}
                        variant={selectedSignerIndex === i ? "default" : "outline"}
                        className="w-full justify-start"
                        onClick={() => setSelectedSignerIndex(i)}
                        style={selectedSignerIndex === i ? { backgroundColor: signer.color } : {}}
                      >
                        <div 
                          className="w-3 h-3 rounded-full mr-2 border border-white" 
                          style={{ backgroundColor: signer.color }}
                        />
                        <span className="truncate">{signer.name}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2 text-sm">Signature Fields</h4>
                  <div className="space-y-1">
                    {SIGNATURE_FIELD_TYPES.map(ft => (
                      <Button
                        key={ft.type}
                        variant={selectedFieldType === ft.type ? "default" : "outline"}
                        className="w-full justify-start text-xs"
                        size="sm"
                        onClick={() => setSelectedFieldType(ft.type)}
                        data-testid={`button-field-${ft.type}`}
                      >
                        {ft.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-2 text-sm">Data Fields</h4>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {PREPOPULATED_FIELD_TYPES.map(ft => {
                      const value = getFieldValue(ft.type, quote);
                      return (
                        <Button
                          key={ft.type}
                          variant={selectedFieldType === ft.type ? "default" : "outline"}
                          className="w-full justify-start text-xs"
                          size="sm"
                          onClick={() => setSelectedFieldType(ft.type)}
                          data-testid={`button-field-${ft.type}`}
                          title={value || 'No value'}
                        >
                          <span className="truncate">{ft.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {selectedFieldType && (
                  <Badge variant="secondary" className="text-xs">
                    Click on PDF to place {selectedFieldType}
                  </Badge>
                )}
              </div>

              <div className="flex-1 overflow-auto border rounded-lg bg-slate-100">
                <div
                  ref={pdfContainerRef}
                  className="relative min-h-[600px] bg-white cursor-crosshair"
                  onClick={handlePdfClick}
                >
                  {pdfData ? (
                    <iframe 
                      src={pdfData}
                      title="PDF Preview"
                      className="w-full h-[600px] pointer-events-none border-0"
                    />
                  ) : (
                    <div className="absolute inset-4 flex items-center justify-center text-slate-400 pointer-events-none">
                      <div className="text-center">
                        <FileText className="w-16 h-16 mx-auto mb-2 opacity-50" />
                        <p>PDF Preview Area</p>
                        <p className="text-sm">Click to place signature fields</p>
                      </div>
                    </div>
                  )}

                  {currentPageFields.map((field, i) => {
                    const globalIndex = fields.findIndex(f => f === field);
                    const signer = signers.find(s => s.id === field.signerId);
                    const isPrepopulated = PREPOPULATED_FIELD_TYPES.some(f => f.type === field.fieldType);
                    const fieldLabel = [...SIGNATURE_FIELD_TYPES, ...PREPOPULATED_FIELD_TYPES].find(f => f.type === field.fieldType)?.label || field.fieldType;
                    const isDragging = dragState?.fieldIndex === globalIndex;
                    return (
                      <div
                        key={i}
                        className={`absolute border-2 rounded flex items-center justify-center cursor-move group ${isDragging ? 'opacity-80 z-50' : ''}`}
                        style={{
                          left: field.x,
                          top: field.y,
                          width: field.width,
                          height: field.height,
                          borderColor: signer?.color || '#3B82F6',
                          backgroundColor: isPrepopulated ? '#FEF3C7' : `${signer?.color || '#3B82F6'}20`
                        }}
                        onMouseDown={(e) => handleFieldMouseDown(e, globalIndex, 'move')}
                      >
                        <span className="text-xs font-medium truncate px-1 select-none" style={{ color: isPrepopulated ? '#92400E' : signer?.color }}>
                          {isPrepopulated && field.value ? field.value : fieldLabel}
                        </span>
                        {/* Delete button */}
                        <button
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                          onClick={(e) => { e.stopPropagation(); removeField(globalIndex); }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <X className="w-3 h-3" />
                        </button>
                        {/* Resize handle */}
                        <div
                          className="absolute bottom-0 right-0 w-3 h-3 bg-slate-600 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
                          onMouseDown={(e) => handleFieldMouseDown(e, globalIndex, 'resize')}
                          style={{ borderTopLeftRadius: '2px' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={() => setStep("signers")}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={() => saveFieldsMutation.mutate()}
                disabled={fields.length === 0 || saveFieldsMutation.isPending}
                data-testid="button-continue-send"
              >
                {saveFieldsMutation.isPending ? "Saving..." : "Continue to Send"}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="send" className="flex-1 overflow-auto p-4">
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-medium mb-4 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    Ready to Send
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Sender Name</Label>
                      <Input
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="Your name or company"
                        data-testid="input-sender-name"
                      />
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Document</span>
                        <span className="font-medium">Agreement for {quote.customerFirstName} {quote.customerLastName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Signers</span>
                        <span className="font-medium">{signers.length} person(s)</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Signature Fields</span>
                        <span className="font-medium">{fields.length} field(s)</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Signers will receive:</h4>
                      {signers.map((signer, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: signer.color }} />
                          <span>{signer.name}</span>
                          <span className="text-slate-400">({signer.email})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("fields")}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button 
                  onClick={() => sendDocumentMutation.mutate()}
                  disabled={sendDocumentMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-send-document"
                >
                  {sendDocumentMutation.isPending ? "Sending..." : "Send for Signature"}
                  <Send className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

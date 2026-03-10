import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Check, AlertCircle, PenTool, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Document, Page, pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDF_PAGE_WIDTH = 612;

interface SigningData {
  success: boolean;
  error?: string;
  document?: {
    id: number;
    name: string;
    fileData: string;
    pageCount: number;
  };
  signer?: {
    id: number;
    name: string;
    email: string;
    color: string;
  };
  fields?: Array<{
    id: number;
    pageNumber: number;
    fieldType: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
    value?: string | null;
  }>;
}

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
  const [preFilledFieldIds, setPreFilledFieldIds] = useState<Set<number>>(new Set());
  const [signingComplete, setSigningComplete] = useState(false);
  const [activeSignatureField, setActiveSignatureField] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<SigningData>({
    queryKey: ['/api/sign', token],
    enabled: !!token
  });

  useEffect(() => {
    if (data?.fields) {
      const initialValues: Record<number, string> = {};
      const preFilledIds = new Set<number>();
      data.fields.forEach(field => {
        if (field.value) {
          initialValues[field.id] = field.value;
          preFilledIds.add(field.id);
        }
      });
      setFieldValues(prev => ({ ...initialValues, ...prev }));
      setPreFilledFieldIds(preFilledIds);
    }
  }, [data?.fields]);

  useEffect(() => {
    const container = pdfContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scale = containerWidth / PDF_PAGE_WIDTH;

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/sign/${token}/complete`, { fieldValues });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        setSigningComplete(true);
        toast({ title: "Signed!", description: result.message });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to complete signing", variant: "destructive" });
    }
  });

  useEffect(() => {
    if (activeSignatureField !== null && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }
  }, [activeSignatureField]);

  const getCanvasCoords = useCallback((canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(canvas, e.clientX, e.clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawing = () => {
    setIsDrawing(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas || !touch) return;
    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(canvas, touch.clientX, touch.clientY);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas || !touch) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(canvas, touch.clientX, touch.clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const saveSignature = () => {
    if (!canvasRef.current || activeSignatureField === null) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    setFieldValues(prev => ({ ...prev, [activeSignatureField]: dataUrl }));
    setActiveSignatureField(null);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleTextChange = (fieldId: number, value: string) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleDateClick = (fieldId: number) => {
    const today = new Date().toLocaleDateString();
    setFieldValues(prev => ({ ...prev, [fieldId]: today }));
  };

  const [numPages, setNumPages] = useState<number>(1);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const allFieldsFilled = data?.fields?.every(f => preFilledFieldIds.has(f.id) || fieldValues[f.id]) ?? false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Unable to Access Document</h2>
            <p className="text-muted-foreground">{data?.error || "This signing link may be invalid or expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signingComplete) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-success" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Document Signed!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for signing. You will receive a copy of the completed document via email once all parties have signed.
            </p>
            <p className="text-sm text-muted-foreground">You can close this window now.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { document: doc, signer, fields } = data;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-background border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-foreground" data-testid="text-doc-name">{doc?.name}</h1>
              <p className="text-sm text-muted-foreground">Signing as: {signer?.name}</p>
            </div>
          </div>
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={!allFieldsFilled || completeMutation.isPending}
            className="bg-success hover:bg-success/90"
            data-testid="button-complete-signing"
          >
            {completeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Complete Signing
              </>
            )}
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-background rounded-lg shadow-lg overflow-hidden">
            <div ref={pdfContainerRef} className="relative bg-muted">
              {doc?.fileData && (
                <Document
                  file={doc.fileData}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  }
                >
                  {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
                    const pageFields = fields?.filter(f => f.pageNumber === pageNum) || [];
                    return (
                      <div key={pageNum} className="relative shadow-xl mb-4 last:mb-0">
                        <Page
                          pageNumber={pageNum}
                          width={containerWidth}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                        {pageFields.map((field) => {
                          const isPreFilled = preFilledFieldIds.has(field.id);
                          const hasValue = !!fieldValues[field.id];
                          return (
                            <div
                              key={field.id}
                              className={`absolute transition-all ${isPreFilled ? 'cursor-default' : 'cursor-pointer'}`}
                              style={{
                                left: field.x * scale,
                                top: field.y * scale,
                                width: field.width * scale,
                                height: field.height * scale,
                                border: isPreFilled
                                  ? '2px solid #64748b'
                                  : `2px solid ${signer?.color}`,
                                backgroundColor: isPreFilled
                                  ? '#f1f5f9'
                                  : hasValue
                                    ? `${signer?.color}20`
                                    : `${signer?.color}40`,
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                              }}
                              onClick={() => {
                                if (isPreFilled) return;
                                if (field.fieldType === 'signature' || field.fieldType === 'initial') {
                                  setActiveSignatureField(field.id);
                                } else if (field.fieldType === 'date') {
                                  handleDateClick(field.id);
                                }
                              }}
                              data-testid={`field-${field.id}`}
                            >
                              {hasValue ? (
                                field.fieldType === 'signature' || field.fieldType === 'initial' ? (
                                  <img
                                    src={fieldValues[field.id]}
                                    alt="Signature"
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <span className={`text-xs font-medium px-1 truncate ${isPreFilled ? 'text-foreground' : ''}`}>
                                    {fieldValues[field.id]}
                                  </span>
                                )
                              ) : (
                                <span className="text-xs font-medium px-1" style={{ color: signer?.color }}>
                                  {field.fieldType === 'signature' ? 'Click to Sign' :
                                   field.fieldType === 'initial' ? 'Click to Initial' :
                                   field.fieldType === 'date' ? 'Click for Date' :
                                   'Click to Edit'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </Document>
              )}
            </div>
          </div>

          <Card className="mt-6">
            <CardHeader className="bg-muted border-b border-border py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PenTool className="w-4 h-4 text-primary" />
                Fields to Complete ({fields?.filter(f => !preFilledFieldIds.has(f.id) && fieldValues[f.id]).length || 0}/{fields?.filter(f => !preFilledFieldIds.has(f.id)).length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {fields?.map((field) => {
                  const isPreFilled = preFilledFieldIds.has(field.id);
                  const hasValue = !!fieldValues[field.id];
                  return (
                    <div
                      key={field.id}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        isPreFilled
                          ? 'bg-muted border-border'
                          : hasValue
                            ? 'bg-success/10 border-success/20'
                            : ''
                      }`}
                      style={{
                        borderColor: isPreFilled ? undefined : hasValue ? undefined : signer?.color,
                        backgroundColor: isPreFilled ? undefined : hasValue ? undefined : `${signer?.color}10`
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isPreFilled ? (
                            <Check className="w-4 h-4 text-muted-foreground" />
                          ) : hasValue ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <AlertCircle className="w-4 h-4" style={{ color: signer?.color }} />
                          )}
                          <span className={`text-sm font-medium capitalize ${isPreFilled ? 'text-muted-foreground' : ''}`}>
                            {field.fieldType}
                            {field.label && <span className="text-muted-foreground ml-1">({field.label})</span>}
                            {isPreFilled && <span className="text-muted-foreground ml-1">(pre-filled)</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">Page {field.pageNumber}</span>
                        </div>
                        {field.fieldType === 'text' && !hasValue && !isPreFilled && (
                          <Input
                            value={fieldValues[field.id] || ''}
                            onChange={(e) => handleTextChange(field.id, e.target.value)}
                            placeholder="Enter text..."
                            className="h-7 text-xs max-w-[120px]"
                            data-testid={`input-text-field-${field.id}`}
                          />
                        )}
                        {(field.fieldType === 'signature' || field.fieldType === 'initial') && !hasValue && !isPreFilled && (
                          <Button
                            size="sm"
                            onClick={() => setActiveSignatureField(field.id)}
                            style={{ backgroundColor: signer?.color }}
                            className="h-7 text-xs"
                            data-testid={`button-sign-field-${field.id}`}
                          >
                            {field.fieldType === 'signature' ? 'Sign' : 'Initial'}
                          </Button>
                        )}
                        {field.fieldType === 'date' && !hasValue && !isPreFilled && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDateClick(field.id)}
                            className="h-7 text-xs"
                            data-testid={`button-date-field-${field.id}`}
                          >
                            Add Date
                          </Button>
                        )}
                        {isPreFilled && hasValue && (
                          <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {fieldValues[field.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!allFieldsFilled && (
                <p className="text-sm text-warning mt-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Please complete all fields before submitting
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {activeSignatureField !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <CardTitle>Draw Your {fields?.find(f => f.id === activeSignatureField)?.fieldType === 'initial' ? 'Initials' : 'Signature'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-border rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={450}
                  height={150}
                  className="w-full cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  data-testid="canvas-signature"
                />
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={clearSignature} data-testid="button-clear-signature">
                  Clear
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setActiveSignatureField(null)} data-testid="button-cancel-signature">
                    Cancel
                  </Button>
                  <Button onClick={saveSignature} style={{ backgroundColor: signer?.color }} data-testid="button-apply-signature">
                    Apply Signature
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Check, AlertCircle, PenTool, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
  }>;
}

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
  const [signingComplete, setSigningComplete] = useState(false);
  const [activeSignatureField, setActiveSignatureField] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const { data, isLoading, error } = useQuery<SigningData>({
    queryKey: ['/api/sign', token],
    enabled: !!token
  });

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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const endDrawing = () => {
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

  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number>(1);
  const [pdfScale, setPdfScale] = useState(1);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const allFieldsFilled = data?.fields?.every(f => fieldValues[f.id]) ?? false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-slate-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Unable to Access Document</h2>
            <p className="text-slate-600">{data?.error || "This signing link may be invalid or expired."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signingComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Document Signed!</h2>
            <p className="text-slate-600 mb-6">
              Thank you for signing. You will receive a copy of the completed document via email once all parties have signed.
            </p>
            <p className="text-sm text-slate-500">You can close this window now.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { document: doc, signer, fields } = data;
  
  // Get fields for current page
  const currentPageFields = fields?.filter(f => f.pageNumber === currentPage) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800">{doc?.name}</h1>
              <p className="text-sm text-slate-500">Signing as: {signer?.name}</p>
            </div>
          </div>
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={!allFieldsFilled || completeMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
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
          {/* Page Navigation */}
          <div className="flex items-center justify-center gap-4 mb-4 bg-white rounded-lg p-3 shadow-sm">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {numPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* PDF Document with Fields */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div ref={pdfContainerRef} className="relative flex justify-center p-4 bg-slate-100">
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
                  <div className="relative shadow-xl">
                    <Page
                      pageNumber={currentPage}
                      width={600}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    
                    {/* Render fields on top of the PDF */}
                    {currentPageFields.map((field) => (
                      <div
                        key={field.id}
                        className="absolute cursor-pointer transition-all"
                        style={{
                          left: field.x,
                          top: field.y,
                          width: field.width,
                          height: field.height,
                          border: `2px solid ${signer?.color}`,
                          backgroundColor: fieldValues[field.id] 
                            ? `${signer?.color}20` 
                            : `${signer?.color}40`,
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                        onClick={() => {
                          if (field.fieldType === 'signature' || field.fieldType === 'initial') {
                            setActiveSignatureField(field.id);
                          } else if (field.fieldType === 'date') {
                            handleDateClick(field.id);
                          }
                        }}
                        data-testid={`field-${field.id}`}
                      >
                        {fieldValues[field.id] ? (
                          field.fieldType === 'signature' || field.fieldType === 'initial' ? (
                            <img 
                              src={fieldValues[field.id]} 
                              alt="Signature" 
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-xs font-medium px-1 truncate">
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
                    ))}
                  </div>
                </Document>
              )}
            </div>
          </div>

          {/* Field Summary Panel */}
          <Card className="mt-6">
            <CardHeader className="bg-slate-50 border-b py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PenTool className="w-4 h-4 text-primary" />
                Fields to Complete ({fields?.filter(f => fieldValues[f.id]).length || 0}/{fields?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {fields?.map((field) => (
                  <div
                    key={field.id}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      fieldValues[field.id] ? 'bg-green-50 border-green-300' : ''
                    }`}
                    style={{ 
                      borderColor: fieldValues[field.id] ? undefined : signer?.color,
                      backgroundColor: fieldValues[field.id] ? undefined : `${signer?.color}10`
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {fieldValues[field.id] ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4" style={{ color: signer?.color }} />
                        )}
                        <span className="text-sm font-medium capitalize">
                          {field.fieldType}
                          {field.label && <span className="text-slate-500 ml-1">({field.label})</span>}
                        </span>
                        <span className="text-xs text-slate-400">Page {field.pageNumber}</span>
                      </div>
                      
                      {field.fieldType === 'text' && !fieldValues[field.id] && (
                        <Input
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleTextChange(field.id, e.target.value)}
                          placeholder="Enter text..."
                          className="h-7 text-xs max-w-[120px]"
                          data-testid={`input-text-field-${field.id}`}
                        />
                      )}
                      
                      {(field.fieldType === 'signature' || field.fieldType === 'initial') && !fieldValues[field.id] && (
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
                      
                      {field.fieldType === 'date' && !fieldValues[field.id] && (
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
                    </div>
                  </div>
                ))}
              </div>

              {!allFieldsFilled && (
                <p className="text-sm text-amber-600 mt-4 flex items-center gap-2">
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
              <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={450}
                  height={150}
                  className="w-full cursor-crosshair"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                />
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={clearSignature}>
                  Clear
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setActiveSignatureField(null)}>
                    Cancel
                  </Button>
                  <Button onClick={saveSignature} style={{ backgroundColor: signer?.color }}>
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

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Check, AlertCircle, PenTool, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <PenTool className="w-5 h-5 text-primary" />
              Complete the fields below
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-slate-600 mb-4">
              Please complete all {fields?.length || 0} field(s) highlighted in your color ({signer?.name}).
            </p>

            <div className="space-y-4">
              {fields?.map((field, i) => (
                <div
                  key={field.id}
                  className="p-4 rounded-lg border-2"
                  style={{ borderColor: signer?.color, backgroundColor: `${signer?.color}10` }}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <span className="font-medium capitalize">{field.fieldType}</span>
                      {field.label && <span className="text-slate-500 ml-2">({field.label})</span>}
                    </div>

                    {field.fieldType === 'signature' || field.fieldType === 'initial' ? (
                      fieldValues[field.id] ? (
                        <div className="flex items-center gap-2">
                          <img 
                            src={fieldValues[field.id]} 
                            alt="Your signature" 
                            className="h-12 border rounded"
                          />
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setActiveSignatureField(field.id)}
                          >
                            Redo
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setActiveSignatureField(field.id)}
                          style={{ backgroundColor: signer?.color }}
                          data-testid={`button-sign-field-${field.id}`}
                        >
                          Click to {field.fieldType === 'signature' ? 'Sign' : 'Initial'}
                        </Button>
                      )
                    ) : field.fieldType === 'date' ? (
                      fieldValues[field.id] ? (
                        <span className="font-medium">{fieldValues[field.id]}</span>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => handleDateClick(field.id)}
                          data-testid={`button-date-field-${field.id}`}
                        >
                          Click to add today's date
                        </Button>
                      )
                    ) : (
                      <Input
                        value={fieldValues[field.id] || ''}
                        onChange={(e) => handleTextChange(field.id, e.target.value)}
                        placeholder="Enter text..."
                        className="max-w-xs"
                        data-testid={`input-text-field-${field.id}`}
                      />
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

import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Upload,
  Move,
  Type,
  Hash,
  Calendar,
  CheckSquare,
  PenTool,
  GripVertical,
  Eye,
  Settings,
  X,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface DocumentTemplate {
  id: number;
  name: string;
  description: string | null;
  pdfUrl: string;
  pdfFileName: string;
  pageDimensions: { page: number; width: number; height: number }[];
  pageCount: number;
  category: string | null;
  loanType: string | null;
  isActive: boolean;
}

interface TemplateField {
  id?: number;
  templateId?: number;
  fieldName: string;
  fieldKey: string;
  fieldType: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontColor: string;
  textAlign: string;
  signerRole: string | null;
  isRequired: boolean;
  defaultValue: string | null;
  tabOrder: number;
}

interface TemplateResponse {
  template: DocumentTemplate;
  fields: TemplateField[];
}

const fieldTypeIcons: Record<string, any> = {
  text: Type,
  number: Hash,
  date: Calendar,
  checkbox: CheckSquare,
  signature: PenTool,
};

const fieldTypeColors: Record<string, string> = {
  text: "bg-blue-100 border-blue-400 text-blue-800",
  number: "bg-green-100 border-green-400 text-green-800",
  date: "bg-purple-100 border-purple-400 text-purple-800",
  checkbox: "bg-orange-100 border-orange-400 text-orange-800",
  signature: "bg-red-100 border-red-400 text-red-800",
};

const BINDING_KEYS = [
  { key: "borrower.firstName", label: "Borrower First Name" },
  { key: "borrower.lastName", label: "Borrower Last Name" },
  { key: "borrower.fullName", label: "Borrower Full Name" },
  { key: "borrower.email", label: "Borrower Email" },
  { key: "borrower.phone", label: "Borrower Phone" },
  { key: "borrower.address", label: "Borrower Address" },
  { key: "borrower.signature", label: "Borrower Signature" },
  { key: "coBorrower.fullName", label: "Co-Borrower Full Name" },
  { key: "coBorrower.signature", label: "Co-Borrower Signature" },
  { key: "property.address", label: "Property Address" },
  { key: "property.city", label: "Property City" },
  { key: "property.state", label: "Property State" },
  { key: "property.zip", label: "Property ZIP" },
  { key: "property.asIsValue", label: "As-Is Value" },
  { key: "property.arv", label: "ARV" },
  { key: "loan.amount", label: "Loan Amount" },
  { key: "loan.interestRate", label: "Interest Rate" },
  { key: "loan.term", label: "Loan Term" },
  { key: "loan.type", label: "Loan Type" },
  { key: "loan.purpose", label: "Loan Purpose" },
  { key: "loan.closingDate", label: "Closing Date" },
  { key: "loan.points", label: "Points" },
  { key: "company.name", label: "Company Name" },
  { key: "today.date", label: "Today's Date" },
];

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const templateId = parseInt(id || "0");

  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPages, setPdfPages] = useState<HTMLCanvasElement[]>([]);
  const [pdfScale, setPdfScale] = useState(1);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [selectedField, setSelectedField] = useState<TemplateField | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number }>({ width: 612, height: 792 });
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data, isLoading, refetch } = useQuery<TemplateResponse>({
    queryKey: ["/api/admin/document-templates", templateId],
    enabled: !!templateId,
  });

  useEffect(() => {
    if (data?.fields) {
      setFields(data.fields);
    }
  }, [data?.fields]);

  const loadPdf = useCallback(async (pdfUrl: string) => {
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const pages: HTMLCanvasElement[] = [];
      const dimensions: { page: number; width: number; height: number }[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        pages.push(canvas);
        dimensions.push({
          page: i,
          width: viewport.width / 1.5,
          height: viewport.height / 1.5,
        });
      }

      setPdfPages(pages);
      setPdfScale(1.5);
      if (dimensions.length > 0) {
        setPdfDimensions({ width: dimensions[0].width, height: dimensions[0].height });
      }

      if (data?.template && (!data.template.pageDimensions || data.template.pageDimensions.length === 0)) {
        updateTemplateMutation.mutate({
          pageDimensions: dimensions,
          pageCount: pdf.numPages,
        });
      }
    } catch (error) {
      console.error("Error loading PDF:", error);
      toast({
        title: "Error",
        description: "Failed to load PDF. Please try re-uploading.",
        variant: "destructive",
      });
    }
  }, [data?.template]);

  useEffect(() => {
    if (data?.template?.pdfUrl && data.template.pdfUrl.trim()) {
      loadPdf(data.template.pdfUrl);
    }
  }, [data?.template?.pdfUrl, loadPdf]);

  useEffect(() => {
    if (pdfPages.length > 0 && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      const sourcePage = pdfPages[currentPage - 1];
      if (ctx && sourcePage) {
        canvasRef.current.width = sourcePage.width;
        canvasRef.current.height = sourcePage.height;
        ctx.drawImage(sourcePage, 0, 0);
      }
    }
  }, [pdfPages, currentPage]);

  const updateTemplateMutation = useMutation({
    mutationFn: async (updates: any) => {
      return apiRequest("PATCH", `/api/admin/document-templates/${templateId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-templates", templateId] });
    },
  });

  const saveFieldsMutation = useMutation({
    mutationFn: async (fieldsData: TemplateField[]) => {
      return apiRequest("PUT", `/api/admin/document-templates/${templateId}/fields`, { fields: fieldsData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-templates", templateId] });
      toast({
        title: "Fields Saved",
        description: "All field positions have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save fields",
        variant: "destructive",
      });
    },
  });

  const uploadPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isPublic", "false");
      
      const response = await fetch("/api/object-storage/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to upload PDF");
      }
      
      const result = await response.json();
      return result;
    },
    onSuccess: async (result: any) => {
      await updateTemplateMutation.mutateAsync({
        pdfUrl: result.url,
        pdfFileName: result.fileName,
      });
      refetch();
      setShowUploadDialog(false);
      toast({
        title: "PDF Uploaded",
        description: "PDF has been uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload PDF",
        variant: "destructive",
      });
    },
  });

  const handleAddField = (type: string) => {
    const newField: TemplateField = {
      fieldName: `New ${type} field`,
      fieldKey: "",
      fieldType: type,
      pageNumber: currentPage,
      x: 100,
      y: pdfDimensions.height - 150,
      width: type === "checkbox" ? 20 : type === "signature" ? 150 : 120,
      height: type === "checkbox" ? 20 : type === "signature" ? 40 : 20,
      fontSize: 12,
      fontColor: "#000000",
      textAlign: "left",
      signerRole: type === "signature" ? "borrower" : null,
      isRequired: false,
      defaultValue: null,
      tabOrder: fields.length,
    };
    
    setFields([...fields, newField]);
    setSelectedField(newField);
    setShowFieldDialog(true);
  };

  const handleFieldMouseDown = (e: React.MouseEvent, field: TemplateField, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const container = pdfContainerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / pdfScale;
    const y = (e.clientY - rect.top) / pdfScale;
    
    setSelectedField({ ...field, tabOrder: index });
    setDragOffset({ x: x - field.x, y: y - (pdfDimensions.height - field.y - field.height) });
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !selectedField || !pdfContainerRef.current) return;
    
    const rect = pdfContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / pdfScale - dragOffset.x;
    const y = (e.clientY - rect.top) / pdfScale - dragOffset.y;
    
    const pdfY = pdfDimensions.height - y - selectedField.height;
    
    setFields(fields.map((f, i) => 
      i === selectedField.tabOrder 
        ? { ...f, x: Math.max(0, x), y: Math.max(0, pdfY) }
        : f
    ));
  }, [isDragging, selectedField, pdfScale, dragOffset, fields, pdfDimensions]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  const updateSelectedField = (updates: Partial<TemplateField>) => {
    if (!selectedField) return;
    
    const updatedField = { ...selectedField, ...updates };
    setSelectedField(updatedField);
    setFields(fields.map((f, i) => 
      i === selectedField.tabOrder ? updatedField : f
    ));
  };

  const deleteSelectedField = () => {
    if (!selectedField) return;
    setFields(fields.filter((_, i) => i !== selectedField.tabOrder));
    setSelectedField(null);
    setShowFieldDialog(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      uploadPdfMutation.mutate(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a PDF file.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-[300px_1fr] gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  if (!data?.template) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Template not found.</p>
      </div>
    );
  }

  const currentPageFields = fields.filter(f => f.pageNumber === currentPage);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/document-templates")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{data.template.name}</h1>
            <p className="text-sm text-slate-500">{data.template.pdfFileName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload PDF
          </Button>
          <Button
            onClick={() => saveFieldsMutation.mutate(fields)}
            disabled={saveFieldsMutation.isPending}
            className="bg-gradient-to-r from-green-600 to-emerald-600"
            data-testid="button-save-fields"
          >
            {saveFieldsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Template
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r bg-slate-50 flex flex-col">
          <div className="p-4 border-b bg-white">
            <h3 className="font-semibold text-slate-700 mb-3">Add Field</h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(fieldTypeIcons).map(([type, Icon]) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddField(type)}
                  className="flex flex-col items-center py-3 h-auto"
                  data-testid={`button-add-${type}`}
                >
                  <Icon className="h-5 w-5 mb-1" />
                  <span className="text-xs capitalize">{type}</span>
                </Button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              <h3 className="font-semibold text-slate-700 text-sm mb-3">
                Fields on Page {currentPage} ({currentPageFields.length})
              </h3>
              {currentPageFields.map((field, index) => {
                const Icon = fieldTypeIcons[field.fieldType] || Type;
                const globalIndex = fields.findIndex(f => f === field);
                return (
                  <div
                    key={index}
                    onClick={() => {
                      setSelectedField({ ...field, tabOrder: globalIndex });
                      setShowFieldDialog(true);
                    }}
                    className={`p-3 rounded-lg border cursor-pointer hover-elevate ${
                      selectedField?.tabOrder === globalIndex
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                    data-testid={`field-item-${index}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium truncate flex-1">
                        {field.fieldName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">
                      {field.fieldKey || "No binding set"}
                    </p>
                  </div>
                );
              })}
              {currentPageFields.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">
                  No fields on this page
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 bg-slate-100 p-6 overflow-auto">
          {!data.template.pdfUrl || !data.template.pdfUrl.trim() ? (
            <Card className="max-w-md mx-auto mt-12">
              <CardContent className="py-12 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <h3 className="text-lg font-semibold mb-2">Upload PDF Template</h3>
                <p className="text-slate-500 mb-4">
                  Upload a PDF to start adding fields
                </p>
                <Button onClick={() => setShowUploadDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload PDF
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center">
              <div className="mb-4 flex items-center gap-4 bg-white rounded-lg px-4 py-2 shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm text-slate-600">
                  Page {currentPage} of {pdfPages.length || data.template.pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={currentPage >= (pdfPages.length || data.template.pageCount)}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div
                ref={pdfContainerRef}
                className="relative bg-white shadow-lg"
                style={{
                  width: pdfPages[0]?.width || 612 * 1.5,
                  height: pdfPages[0]?.height || 792 * 1.5,
                }}
              >
                <canvas ref={canvasRef} className="block" />
                
                {currentPageFields.map((field, index) => {
                  const Icon = fieldTypeIcons[field.fieldType] || Type;
                  const colorClass = fieldTypeColors[field.fieldType] || fieldTypeColors.text;
                  const globalIndex = fields.findIndex(f => f === field);
                  
                  const screenX = field.x * pdfScale;
                  const screenY = (pdfDimensions.height - field.y - field.height) * pdfScale;
                  const screenW = field.width * pdfScale;
                  const screenH = field.height * pdfScale;
                  
                  return (
                    <div
                      key={index}
                      className={`absolute border-2 cursor-move flex items-center justify-center ${colorClass} ${
                        selectedField?.tabOrder === globalIndex ? "ring-2 ring-blue-500" : ""
                      }`}
                      style={{
                        left: screenX,
                        top: screenY,
                        width: screenW,
                        height: screenH,
                        opacity: 0.85,
                      }}
                      onMouseDown={(e) => handleFieldMouseDown(e, field, globalIndex)}
                      onDoubleClick={() => {
                        setSelectedField({ ...field, tabOrder: globalIndex });
                        setShowFieldDialog(true);
                      }}
                      data-testid={`field-overlay-${index}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs ml-1 truncate max-w-[80px]">
                        {field.fieldName}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showFieldDialog} onOpenChange={setShowFieldDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
            <DialogDescription>
              Configure the field properties and data binding
            </DialogDescription>
          </DialogHeader>
          {selectedField && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Field Name</Label>
                <Input
                  value={selectedField.fieldName}
                  onChange={(e) => updateSelectedField({ fieldName: e.target.value })}
                  placeholder="Display name for this field"
                  data-testid="input-field-name"
                />
              </div>
              
              <div>
                <Label>Data Binding</Label>
                <Select
                  value={selectedField.fieldKey}
                  onValueChange={(value) => updateSelectedField({ fieldKey: value })}
                >
                  <SelectTrigger data-testid="select-field-binding">
                    <SelectValue placeholder="Select data binding" />
                  </SelectTrigger>
                  <SelectContent>
                    {BINDING_KEYS.map((binding) => (
                      <SelectItem key={binding.key} value={binding.key}>
                        {binding.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  This field will be auto-filled with the selected data
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Width (pts)</Label>
                  <Input
                    type="number"
                    value={selectedField.width}
                    onChange={(e) => updateSelectedField({ width: parseFloat(e.target.value) || 100 })}
                    data-testid="input-field-width"
                  />
                </div>
                <div>
                  <Label>Height (pts)</Label>
                  <Input
                    type="number"
                    value={selectedField.height}
                    onChange={(e) => updateSelectedField({ height: parseFloat(e.target.value) || 20 })}
                    data-testid="input-field-height"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Font Size</Label>
                  <Input
                    type="number"
                    value={selectedField.fontSize}
                    onChange={(e) => updateSelectedField({ fontSize: parseInt(e.target.value) || 12 })}
                    data-testid="input-font-size"
                  />
                </div>
                <div>
                  <Label>Text Align</Label>
                  <Select
                    value={selectedField.textAlign}
                    onValueChange={(value) => updateSelectedField({ textAlign: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedField.fieldType === "signature" && (
                <div>
                  <Label>Signer Role</Label>
                  <Select
                    value={selectedField.signerRole || "borrower"}
                    onValueChange={(value) => updateSelectedField({ signerRole: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="borrower">Borrower</SelectItem>
                      <SelectItem value="co-borrower">Co-Borrower</SelectItem>
                      <SelectItem value="guarantor">Guarantor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label>Required Field</Label>
                <Switch
                  checked={selectedField.isRequired}
                  onCheckedChange={(checked) => updateSelectedField({ isRequired: checked })}
                />
              </div>

              <div>
                <Label>Default Value</Label>
                <Input
                  value={selectedField.defaultValue || ""}
                  onChange={(e) => updateSelectedField({ defaultValue: e.target.value || null })}
                  placeholder="Optional default value"
                  data-testid="input-default-value"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button
              variant="destructive"
              onClick={deleteSelectedField}
              data-testid="button-delete-field"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button onClick={() => setShowFieldDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload PDF Template</DialogTitle>
            <DialogDescription>
              Select a PDF file to use as the template base
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex flex-col items-center justify-center">
                <Upload className="h-8 w-8 mb-2 text-slate-400" />
                <p className="text-sm text-slate-600">
                  {uploadPdfMutation.isPending ? "Uploading..." : "Click to upload PDF"}
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={uploadPdfMutation.isPending}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

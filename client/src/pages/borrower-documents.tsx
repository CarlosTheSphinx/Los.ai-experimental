import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import {
  FolderOpen,
  Upload,
  FileText,
  Trash2,
  Loader2,
  Search,
  Calendar,
  HardDrive,
  Star,
  LinkIcon,
} from "lucide-react";

const DOCUMENT_CATEGORIES = [
  { value: "id_document", label: "ID / Driver's License" },
  { value: "tax_return", label: "Tax Returns" },
  { value: "bank_statement", label: "Bank Statements" },
  { value: "pay_stub", label: "Pay Stubs" },
  { value: "entity_docs", label: "Entity Documents" },
  { value: "insurance", label: "Insurance" },
  { value: "appraisal", label: "Appraisal" },
  { value: "title", label: "Title / Survey" },
  { value: "financial_statement", label: "Financial Statements" },
  { value: "general", label: "Other" },
];

function getCategoryLabel(val: string) {
  return DOCUMENT_CATEGORIES.find(c => c.value === val)?.label || val;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BorrowerDocumentsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    fileName: "",
    category: "general",
    description: "",
  });

  const { data: documents = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/borrower/documents"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/borrower/documents", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/borrower/documents"] });
      setShowUpload(false);
      setUploadForm({ fileName: "", category: "general", description: "" });
      toast({ title: "Document added" });
    },
    onError: () => {
      toast({ title: "Failed to add document", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: number) => {
      return await apiRequest("DELETE", `/api/borrower/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/borrower/documents"] });
      toast({ title: "Document removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove document", variant: "destructive" });
    },
  });

  const classificationMutation = useMutation({
    mutationFn: async ({ docId, classification }: { docId: number; classification: string }) => {
      return await apiRequest("PATCH", `/api/borrower/documents/${docId}/classification`, {
        documentClassification: classification,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/borrower/documents"] });
    },
    onError: () => {
      toast({ title: "Failed to update document", variant: "destructive" });
    },
  });

  const filteredDocs = documents.filter((doc: any) => {
    const matchSearch = !searchTerm || doc.fileName?.toLowerCase().includes(searchTerm.toLowerCase()) || doc.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = filterCategory === "all" || doc.category === filterCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-documents-title">My Documents</h1>
          <p className="text-muted-foreground text-sm mt-1">All documents you've uploaded across your loans — your permanent document vault</p>
        </div>
        <Button onClick={() => setShowUpload(!showUpload)} data-testid="button-add-document">
          <Upload className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      {showUpload && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add a Document</CardTitle>
            <CardDescription>Documents added here will be available across all your loans</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Document Name</Label>
                <Input
                  value={uploadForm.fileName}
                  onChange={(e) => setUploadForm({ ...uploadForm, fileName: e.target.value })}
                  placeholder="e.g. 2024 Tax Return"
                  data-testid="input-doc-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={uploadForm.category} onValueChange={(v) => setUploadForm({ ...uploadForm, category: v })}>
                  <SelectTrigger data-testid="select-doc-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description (optional)</Label>
              <Input
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                placeholder="Any notes about this document"
                data-testid="input-doc-description"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowUpload(false)} data-testid="button-cancel-upload">Cancel</Button>
              <Button
                onClick={() => uploadMutation.mutate(uploadForm)}
                disabled={uploadMutation.isPending || !uploadForm.fileName.trim()}
                data-testid="button-submit-document"
              >
                {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Document
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-documents"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48" data-testid="select-filter-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {DOCUMENT_CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground font-medium">
              {documents.length === 0 ? "No documents yet" : "No documents match your filters"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {documents.length === 0 ? "Add your first document to get started — it will carry over to all your future loans" : "Try adjusting your search or category filter"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc: any) => (
            <Card key={doc.id} className="hover:bg-muted/30 transition-colors" data-testid={`doc-row-${doc.id}`}>
              <CardContent className="flex items-center gap-4 py-3 px-4">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${doc.documentClassification === 'profile' ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
                  {doc.documentClassification === 'profile' ? (
                    <Star className="h-5 w-5 text-amber-500" />
                  ) : (
                    <FileText className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.fileName}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{getCategoryLabel(doc.category)}</Badge>
                    {doc.documentClassification === 'profile' && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-200">
                        <Star className="h-2.5 w-2.5 mr-0.5" /> Kept for future deals
                      </Badge>
                    )}
                    {doc.sourceDealName && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <LinkIcon className="h-2.5 w-2.5" />
                        From: {doc.sourceDealName}
                      </span>
                    )}
                    {doc.fileSize && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <HardDrive className="h-2.5 w-2.5" />
                        {formatFileSize(doc.fileSize)}
                      </span>
                    )}
                    {doc.uploadedAt && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" />
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{doc.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5" title="Keep for future deals">
                    <Switch
                      checked={doc.documentClassification === 'profile'}
                      onCheckedChange={(checked) =>
                        classificationMutation.mutate({
                          docId: doc.id,
                          classification: checked ? 'profile' : 'standalone',
                        })
                      }
                      data-testid={`toggle-keep-doc-${doc.id}`}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">Keep</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-doc-${doc.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground pt-2">
        {documents.length} document{documents.length !== 1 ? "s" : ""} total
      </div>
    </div>
  );
}

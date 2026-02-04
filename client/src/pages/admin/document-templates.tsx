import { useQuery, useMutation } from "@tanstack/react-query";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Search,
  Plus,
  FileText,
  Edit,
  Trash2,
  Loader2,
  Eye,
  Upload,
  Settings2,
  Calendar,
  CheckSquare,
  Type,
  Hash,
  PenTool,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useLocation } from "wouter";

interface DocumentTemplate {
  id: number;
  name: string;
  description: string | null;
  pdfUrl: string;
  pdfFileName: string;
  pageDimensions: any[];
  pageCount: number;
  category: string | null;
  loanType: string | null;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplatesResponse {
  templates: DocumentTemplate[];
}

function getCategoryBadgeVariant(category: string | null): "default" | "secondary" | "outline" {
  switch (category) {
    case "agreement":
      return "default";
    case "disclosure":
      return "secondary";
    case "contract":
      return "outline";
    default:
      return "outline";
  }
}

const fieldTypeIcons = {
  text: Type,
  number: Hash,
  date: Calendar,
  checkbox: CheckSquare,
  signature: PenTool,
};

export default function DocumentTemplatesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    loanType: "",
  });

  const { data, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ["/api/admin/document-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (templateData: any) => {
      return apiRequest("POST", "/api/admin/document-templates", templateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-templates"] });
      setShowCreateDialog(false);
      setFormData({ name: "", description: "", category: "", loanType: "" });
      toast({
        title: "Template Created",
        description: "Document template has been created. Now upload a PDF and configure fields.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create template",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId: number) => {
      return apiRequest("DELETE", `/api/admin/document-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-templates"] });
      setDeleteTemplateId(null);
      toast({
        title: "Template Deleted",
        description: "Document template has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/document-templates/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-templates"] });
    },
  });

  const filteredTemplates = data?.templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.pdfFileName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  }) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Document Templates</h1>
          <p className="text-slate-500 mt-1">
            Create reusable PDF templates with positioned fields for auto-population
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover-elevate"
          data-testid="button-create-template"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-lg">All Templates</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-templates"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No templates found</p>
              <p className="text-sm mt-1">Create your first document template to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Loan Type</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{template.name}</p>
                          <p className="text-sm text-slate-500 truncate max-w-xs">
                            {template.description || template.pdfFileName}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {template.category ? (
                        <Badge variant={getCategoryBadgeVariant(template.category)}>
                          {template.category}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.loanType ? (
                        <Badge variant="outline">
                          {template.loanType.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-slate-600">{template.pageCount}</span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={template.isActive}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: template.id, isActive: checked })
                        }
                        data-testid={`switch-active-${template.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">
                        {format(new Date(template.createdAt), "MMM d, yyyy")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/admin/document-templates/${template.id}`)}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(template.pdfUrl, "_blank")}
                          data-testid={`button-preview-${template.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTemplateId(template.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          data-testid={`button-delete-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Document Template</DialogTitle>
            <DialogDescription>
              Create a new template. After creation, you'll upload a PDF and configure field positions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Loan Agreement - RTL"
                data-testid="input-template-name"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this template..."
                rows={3}
                data-testid="input-template-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger data-testid="select-category">
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
              <div>
                <Label>Loan Type</Label>
                <Select
                  value={formData.loanType}
                  onValueChange={(value) => setFormData({ ...formData, loanType: value })}
                >
                  <SelectTrigger data-testid="select-loan-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="light_rehab">Light Rehab</SelectItem>
                    <SelectItem value="heavy_rehab">Heavy Rehab</SelectItem>
                    <SelectItem value="bridge_no_rehab">Bridge</SelectItem>
                    <SelectItem value="guc">GUC</SelectItem>
                    <SelectItem value="dscr">DSCR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!formData.name.trim()) {
                  toast({
                    title: "Error",
                    description: "Template name is required",
                    variant: "destructive",
                  });
                  return;
                }
                createMutation.mutate({
                  name: formData.name,
                  description: formData.description || null,
                  category: formData.category || null,
                  loanType: formData.loanType === "all" ? null : formData.loanType || null,
                  pdfUrl: "", // Placeholder - will be set when PDF is uploaded
                  pdfFileName: "pending-upload.pdf",
                  pageCount: 1,
                  pageDimensions: [],
                });
              }}
              disabled={createMutation.isPending}
              data-testid="button-submit-template"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTemplateId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTemplateId && deleteMutation.mutate(deleteTemplateId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

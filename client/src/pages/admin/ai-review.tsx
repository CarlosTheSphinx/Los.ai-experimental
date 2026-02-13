import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Info,
  Settings2,
  Search,
  CheckCircle2,
  FolderOpen,
  Upload,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LoanProgram {
  id: number;
  name: string;
  loanType: string;
  isActive: boolean;
  documentCount?: number;
}

interface ProgramDocument {
  id: number;
  programId: number;
  documentName: string;
  documentCategory: string;
  documentDescription: string | null;
  isRequired: boolean;
  sortOrder: number;
  stepId: number | null;
}

interface DocumentReviewRule {
  id?: number;
  programId: number;
  documentName: string;
  documentCategory: string;
  ruleName: string;
  ruleDescription: string;
  ruleConfig: Record<string, any>;
  severity: 'required' | 'recommended' | 'info';
  isActive: boolean;
  confidence?: number;
  createdByName?: string;
}

interface ReviewRule {
  id?: number;
  ruleTitle: string;
  ruleDescription: string;
  ruleType: string;
  severity: string;
  isActive: boolean;
}

const SEVERITY_OPTIONS = [
  { value: "required", label: "Required", color: "text-destructive", bg: "bg-destructive/10", description: "Must pass - blocks approval" },
  { value: "recommended", label: "Recommended", color: "text-warning", bg: "bg-warning/10", description: "Should pass - flagged if not" },
  { value: "info", label: "Info", color: "text-info", bg: "bg-info/10", description: "Informational - noted in report" },
];

const CATEGORY_LABELS: Record<string, string> = {
  borrower_docs: "Borrower Documents",
  entity_docs: "Entity Documents",
  property_docs: "Property Documents",
  financial_docs: "Financial Documents",
  closing_docs: "Closing Documents",
  compliance_docs: "Compliance Documents",
};

// Guidelines uploader component
function GuidelineUploader({ programId, onSuccess }: { programId: number; onSuccess: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: "Invalid file",
        description: "Please upload a PDF file",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(
        `/api/admin/programs/${programId}/guideline-upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadRes.json();
      const guidelineUploadId = uploadData.id;

      // Now trigger AI analysis
      setAnalyzing(true);
      const generateRes = await apiRequest(
        'POST',
        `/api/admin/programs/${programId}/review-rules/generate`,
        { guidelineUploadId }
      );

      if (generateRes.success) {
        toast({
          title: "Success",
          description: `Generated ${generateRes.rules?.length || 0} document review rules from guidelines`
        });
        onSuccess();
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload and analyze guidelines",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-blue-600" />
              Auto-Generate Rules from Guidelines
            </h3>
            <p className="text-sm text-muted-foreground">
              Upload your guidelines and Lane will auto-generate review rules
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              disabled={uploading || analyzing}
              style={{ display: 'none' }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || analyzing}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {uploading || analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploading ? 'Uploading...' : 'Analyzing...'}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Guidelines PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Document review rules table
function DocumentReviewRulesTable({ programId }: { programId: number }) {
  const { toast } = useToast();
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<number | null>(null);

  const { data: rulesData, isLoading } = useQuery<DocumentReviewRule[]>({
    queryKey: [`/api/admin/programs/${programId}/review-rules`],
    enabled: !!programId
  });

  const rules = rulesData || [];

  const approveMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      return apiRequest('POST', `/api/admin/review-rules/${ruleId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/programs/${programId}/review-rules`]
      });
      toast({
        title: "Success",
        description: "Rule approved and activated"
      });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (rule: DocumentReviewRule) => {
      return apiRequest('PUT', `/api/admin/review-rules/${rule.id}`, {
        isActive: !rule.isActive
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/programs/${programId}/review-rules`]
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      return apiRequest('DELETE', `/api/admin/review-rules/${ruleId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/programs/${programId}/review-rules`]
      });
      toast({
        title: "Success",
        description: "Rule deleted"
      });
    }
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (rules.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">No document review rules configured yet</p>
          <p className="text-xs text-muted-foreground mt-2">Upload guidelines above to auto-generate rules</p>
        </CardContent>
      </Card>
    );
  }

  // Group by document name
  const grouped = rules.reduce((acc, rule) => {
    const key = `${rule.documentCategory}::${rule.documentName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(rule);
    return acc;
  }, {} as Record<string, DocumentReviewRule[]>);

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([key, docRules]) => (
        <Card key={key}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {docRules[0].documentName}
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {CATEGORY_LABELS[docRules[0].documentCategory] || docRules[0].documentCategory}
                </CardDescription>
              </div>
              <Badge variant="outline">{docRules.length} rules</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {docRules.map((rule) => (
                <div key={rule.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{rule.ruleName}</h4>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            rule.severity === 'required' && 'bg-destructive/10 text-destructive',
                            rule.severity === 'recommended' && 'bg-warning/10 text-warning',
                            rule.severity === 'info' && 'bg-info/10 text-info'
                          )}
                        >
                          {rule.severity}
                        </Badge>
                        {!rule.isActive && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        {rule.confidence && (
                          <Badge variant="outline" className="text-xs">
                            {Math.round(rule.confidence * 100)}% confidence
                          </Badge>
                        )}
                      </div>
                      {rule.ruleDescription && (
                        <p className="text-sm text-muted-foreground">{rule.ruleDescription}</p>
                      )}
                      {rule.createdByName && (
                        <p className="text-xs text-muted-foreground mt-1">Added by {rule.createdByName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActiveMutation.mutate(rule)}
                        disabled={toggleActiveMutation.isPending}
                        className="h-8 w-8 p-0"
                        title={rule.isActive ? "Deactivate" : "Activate"}
                      >
                        {rule.isActive ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                      </Button>
                      {!rule.isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMutation.mutate(rule.id || 0)}
                          disabled={approveMutation.isPending}
                          className="h-8 text-xs"
                        >
                          Approve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(rule.id || 0)}
                        disabled={deleteMutation.isPending}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AIReviewPage() {
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");

  const { data: programsData, isLoading: loadingPrograms } = useQuery<LoanProgram[]>({
    queryKey: ["/api/admin/programs"],
  });

  const programs = programsData || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-ai-review-title">
          <Sparkles className="h-6 w-6 text-primary" />
          Lane - Document Review Configuration
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure intelligent document review rules for your loan programs. Upload guidelines to auto-generate rules, or create them manually.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Select Loan Program
            </CardTitle>
            <CardDescription>
              Choose a program to configure its document review rules
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loadingPrograms ? (
            <Skeleton className="h-10 w-64" />
          ) : (
            <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a program..." />
              </SelectTrigger>
              <SelectContent>
                {programs.map((prog) => (
                  <SelectItem key={prog.id} value={prog.id.toString()}>
                    {prog.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedProgramId && (
        <div className="space-y-6">
          <GuidelineUploader
            programId={parseInt(selectedProgramId)}
            onSuccess={() => {
              queryClient.invalidateQueries({
                queryKey: [`/api/admin/programs/${selectedProgramId}/review-rules`]
              });
            }}
          />

          <div>
            <h2 className="text-lg font-semibold mb-4">Document Review Rules</h2>
            <DocumentReviewRulesTable programId={parseInt(selectedProgramId)} />
          </div>
        </div>
      )}

      {!selectedProgramId && !loadingPrograms && (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary opacity-30" />
            <h3 className="font-semibold text-lg mb-2">
              Configure Lane Document Review
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Select a loan program above to configure AI review rules. You can either upload guidelines
              to auto-generate rules, or create rules manually.
            </p>
            <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1.5">
                <Upload className="h-4 w-4 text-primary" />
                Upload guidelines
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500" />
                Auto-generate rules
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Review & approve
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Auto-review documents
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

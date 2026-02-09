import { useState, useEffect } from "react";
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

interface ReviewRule {
  id?: number;
  ruleTitle: string;
  ruleDescription: string;
  ruleType: string;
  severity: string;
  isActive: boolean;
}

const RULE_TYPE_OPTIONS = [
  { value: "presence", label: "Presence Check", description: "Verify that required information exists in the document" },
  { value: "numeric_threshold", label: "Numeric Threshold", description: "Check numeric values against expected ranges" },
  { value: "format", label: "Format / Structure", description: "Validate document format, structure, or layout" },
  { value: "consistency", label: "Cross-Reference", description: "Cross-check data consistency across pages or fields" },
  { value: "red_flag", label: "Red Flag Detection", description: "Flag suspicious patterns or anomalies" },
  { value: "signature_date", label: "Signature / Date", description: "Verify signatures and date fields" },
  { value: "general", label: "General", description: "General review instruction" },
];

const SEVERITY_OPTIONS = [
  { value: "fail", label: "Fail", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", description: "Must pass - blocks approval" },
  { value: "warn", label: "Warning", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", description: "Should review - flagged for attention" },
  { value: "info", label: "Info", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", description: "Informational - noted in report" },
];

const CATEGORY_LABELS: Record<string, string> = {
  borrower_docs: "Borrower Documents",
  entity_docs: "Entity Documents",
  property_docs: "Property Documents",
  financial_docs: "Financial Documents",
  closing_docs: "Closing Documents",
  title_docs: "Title Documents",
  insurance_docs: "Insurance Documents",
  appraisal_docs: "Appraisal Documents",
  legal_docs: "Legal Documents",
  misc_docs: "Miscellaneous",
};

function TemplateRulesEditor({
  templateId,
  programId,
  documentName,
}: {
  templateId: number;
  programId: number;
  documentName: string;
}) {
  const { toast } = useToast();
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: rulesData, isLoading } = useQuery<{ rules: any[] }>({
    queryKey: [`/api/admin/document-templates/${templateId}/review-rules`],
  });

  useEffect(() => {
    if (rulesData?.rules) {
      setRules(
        rulesData.rules.map((r: any) => ({
          id: r.id,
          ruleTitle: r.ruleTitle || "",
          ruleDescription: r.ruleDescription || "",
          ruleType: r.ruleType || "general",
          severity: r.severity || "fail",
          isActive: r.isActive !== false,
        }))
      );
      setHasChanges(false);
    }
  }, [rulesData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/document-templates/${templateId}/review-rules`,
        {
          programId,
          rules: rules
            .filter((r) => r.ruleTitle.trim())
            .map((r, idx) => ({
              ruleTitle: r.ruleTitle.trim(),
              ruleDescription: r.ruleDescription.trim(),
              ruleType: r.ruleType,
              severity: r.severity,
              documentType: documentName,
              isActive: r.isActive,
              sortOrder: idx,
            })),
        }
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rules saved successfully" });
      setHasChanges(false);
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/document-templates/${templateId}/review-rules`],
      });
    },
    onError: () => {
      toast({ title: "Failed to save rules", variant: "destructive" });
    },
  });

  const addRule = () => {
    setRules([
      ...rules,
      {
        ruleTitle: "",
        ruleDescription: "",
        ruleType: "general",
        severity: "fail",
        isActive: true,
      },
    ]);
    setHasChanges(true);
  };

  const updateRule = (index: number, field: keyof ReviewRule, value: any) => {
    const updated = [...rules];
    (updated[index] as any)[field] = value;
    setRules(updated);
    setHasChanges(true);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const moveRule = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rules.length) return;
    const updated = [...rules];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setRules(updated);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {rules.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No AI review rules configured for this document.</p>
          <p className="text-xs mt-1">
            Add rules to tell the AI what to check when reviewing this document type.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div
              key={idx}
              className="border rounded-md p-4 space-y-3 bg-background"
              data-testid={`ai-rule-row-${templateId}-${idx}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5 mt-2">
                  <button
                    onClick={() => moveRule(idx, "up")}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    data-testid={`button-ai-rule-up-${templateId}-${idx}`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveRule(idx, "down")}
                    disabled={idx === rules.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    data-testid={`button-ai-rule-down-${templateId}-${idx}`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-3">
                  <Input
                    placeholder="Rule title (e.g., Verify borrower name matches across all pages)"
                    value={rule.ruleTitle}
                    onChange={(e) => updateRule(idx, "ruleTitle", e.target.value)}
                    data-testid={`input-ai-rule-title-${templateId}-${idx}`}
                  />
                  <Textarea
                    placeholder="Detailed instructions for the AI reviewer... Be specific about what to check, what values are acceptable, and what should be flagged."
                    value={rule.ruleDescription}
                    onChange={(e) =>
                      updateRule(idx, "ruleDescription", e.target.value)
                    }
                    className="min-h-[80px]"
                    data-testid={`input-ai-rule-desc-${templateId}-${idx}`}
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Rule Type</span>
                      <Select
                        value={rule.ruleType}
                        onValueChange={(v) => updateRule(idx, "ruleType", v)}
                      >
                        <SelectTrigger
                          className="w-[200px]"
                          data-testid={`select-ai-rule-type-${templateId}-${idx}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RULE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Severity</span>
                      <Select
                        value={rule.severity}
                        onValueChange={(v) => updateRule(idx, "severity", v)}
                      >
                        <SelectTrigger
                          className="w-[150px]"
                          data-testid={`select-ai-rule-severity-${templateId}-${idx}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className={opt.color}>{opt.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-5 text-xs no-default-hover-elevate no-default-active-elevate",
                        SEVERITY_OPTIONS.find((s) => s.value === rule.severity)?.bg
                      )}
                    >
                      {rule.severity === "fail" && (
                        <AlertTriangle className="h-3 w-3 mr-1 text-red-600" />
                      )}
                      {rule.severity === "warn" && (
                        <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />
                      )}
                      {rule.severity === "info" && (
                        <Info className="h-3 w-3 mr-1 text-blue-600" />
                      )}
                      {SEVERITY_OPTIONS.find((s) => s.value === rule.severity)
                        ?.description}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeRule(idx)}
                  className="text-destructive flex-shrink-0"
                  data-testid={`button-ai-remove-rule-${templateId}-${idx}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          variant="outline"
          onClick={addRule}
          data-testid={`button-ai-add-rule-${templateId}`}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
        {hasChanges && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid={`button-ai-save-rules-${templateId}`}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Save Rules
          </Button>
        )}
      </div>
    </div>
  );
}

function DocumentTemplateCard({
  doc,
  programId,
  isExpanded,
  onToggle,
}: {
  doc: ProgramDocument;
  programId: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { data: rulesData } = useQuery<{ rules: any[] }>({
    queryKey: [`/api/admin/document-templates/${doc.id}/review-rules`],
  });

  const ruleCount = rulesData?.rules?.length || 0;

  return (
    <Card data-testid={`card-ai-doc-${doc.id}`}>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer" data-testid={`trigger-ai-doc-${doc.id}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-sm" data-testid={`text-ai-doc-name-${doc.id}`}>
                    {doc.documentName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {CATEGORY_LABELS[doc.documentCategory] || doc.documentCategory}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {doc.isRequired && (
                  <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                    Required
                  </Badge>
                )}
                <Badge
                  variant={ruleCount > 0 ? "default" : "outline"}
                  className={cn(
                    "text-xs no-default-hover-elevate no-default-active-elevate",
                    ruleCount > 0 ? "" : "text-muted-foreground"
                  )}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {ruleCount} {ruleCount === 1 ? "rule" : "rules"}
                </Badge>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t">
            <TemplateRulesEditor
              templateId={doc.id}
              programId={programId}
              documentName={doc.documentName}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function AIReviewPage() {
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  const { data: programsData, isLoading: loadingPrograms } = useQuery<LoanProgram[]>({
    queryKey: ["/api/admin/programs"],
  });

  const programs = programsData || [];

  const { data: programDetail, isLoading: loadingDetail } = useQuery<{
    program: LoanProgram;
    documents: ProgramDocument[];
  }>({
    queryKey: ["/api/admin/programs", parseInt(selectedProgramId)],
    enabled: !!selectedProgramId,
  });

  const documents = programDetail?.documents || [];
  const filteredDocs = searchFilter
    ? documents.filter(
        (d) =>
          d.documentName.toLowerCase().includes(searchFilter.toLowerCase()) ||
          d.documentCategory.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : documents;

  const groupedDocs = filteredDocs.reduce<Record<string, ProgramDocument[]>>(
    (acc, doc) => {
      const cat = doc.documentCategory || "misc_docs";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(doc);
      return acc;
    },
    {}
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-ai-review-title">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Document Review
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure rules that the AI uses when reviewing uploaded loan documents. Select a program to manage its document review rules.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Select Program
            </CardTitle>
            <CardDescription>
              Choose a loan program to configure its document review rules
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loadingPrograms ? (
            <Skeleton className="h-9 w-full max-w-md" />
          ) : (
            <Select
              value={selectedProgramId}
              onValueChange={(v) => {
                setSelectedProgramId(v);
                setExpandedDocId(null);
                setSearchFilter("");
              }}
            >
              <SelectTrigger className="max-w-md" data-testid="select-ai-program">
                <SelectValue placeholder="Select a loan program..." />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    <span className="flex items-center gap-2">
                      {p.name}
                      {!p.isActive && (
                        <span className="text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedProgramId && (
        <>
          {loadingDetail ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : documents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <h3 className="font-semibold text-lg mb-1">No Document Templates</h3>
                <p className="text-muted-foreground text-sm">
                  This program has no document templates yet. Add documents in the Programs section first.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-lg" data-testid="text-ai-program-name">
                    {programDetail?.program.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {documents.length} document {documents.length === 1 ? "template" : "templates"}
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="pl-9 w-[250px]"
                    data-testid="input-ai-search-docs"
                  />
                </div>
              </div>

              {Object.keys(groupedDocs).length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No documents match your search.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedDocs)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([category, docs]) => (
                      <div key={category} className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          {CATEGORY_LABELS[category] || category}
                          <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">
                            {docs.length}
                          </Badge>
                        </h3>
                        <div className="space-y-2">
                          {docs
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((doc) => (
                              <DocumentTemplateCard
                                key={doc.id}
                                doc={doc}
                                programId={parseInt(selectedProgramId)}
                                isExpanded={expandedDocId === doc.id}
                                onToggle={() =>
                                  setExpandedDocId(
                                    expandedDocId === doc.id ? null : doc.id
                                  )
                                }
                              />
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {!selectedProgramId && !loadingPrograms && (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary opacity-30" />
            <h3 className="font-semibold text-lg mb-2">
              Get Started with AI Document Review
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Select a loan program above to configure AI review rules for each document type. 
              The AI will use these rules when reviewing uploaded documents to automatically check 
              for compliance, completeness, and potential issues.
            </p>
            <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Presence checks
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Red flag detection
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Consistency validation
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

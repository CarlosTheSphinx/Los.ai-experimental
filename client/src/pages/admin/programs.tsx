import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  Percent,
  Calendar,
  FileText,
  ListChecks,
  Settings2,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import ProgramWorkflowEditor from "@/components/ProgramWorkflowEditor";

interface LoanProgram {
  id: number;
  name: string;
  description: string | null;
  loanType: string;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  minLtv: number | null;
  maxLtv: number | null;
  minInterestRate: number | null;
  maxInterestRate: number | null;
  termOptions: string | null;
  eligiblePropertyTypes: string[] | null;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
  documentCount?: number;
  taskCount?: number;
}

interface ProgramDocument {
  id: number;
  programId: number;
  documentName: string;
  documentCategory: string;
  documentDescription: string | null;
  isRequired: boolean;
  sortOrder: number;
}

interface ProgramTask {
  id: number;
  programId: number;
  taskName: string;
  taskDescription: string | null;
  taskCategory: string | null;
  priority: string;
  sortOrder: number;
}

const propertyTypeOptions = [
  { value: "single-family", label: "Single Family" },
  { value: "multi-family", label: "Multi-Family" },
  { value: "commercial", label: "Commercial" },
  { value: "mixed-use", label: "Mixed Use" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "industrial", label: "Industrial" },
];

const documentCategories = [
  { value: "borrower_docs", label: "Borrower Documents" },
  { value: "entity_docs", label: "Entity Documents" },
  { value: "property_docs", label: "Property Documents" },
  { value: "financial_docs", label: "Financial Documents" },
  { value: "closing_docs", label: "Closing Documents" },
  { value: "other", label: "Other" },
];

const taskCategories = [
  { value: "application_review", label: "Application Review" },
  { value: "credit_check", label: "Credit Check" },
  { value: "appraisal", label: "Appraisal" },
  { value: "title_search", label: "Title Search" },
  { value: "underwriting", label: "Underwriting" },
  { value: "closing", label: "Closing" },
  { value: "other", label: "Other" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function formatCurrency(value: number | null): string {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getLoanTypeLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "rtl":
      return "RTL";
    case "dscr":
      return "DSCR";
    default:
      return type;
  }
}

export default function AdminPrograms() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("programs");
  const [selectedProgram, setSelectedProgram] = useState<LoanProgram | null>(null);
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [showEditProgram, setShowEditProgram] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [workflowEditorProgram, setWorkflowEditorProgram] = useState<LoanProgram | null>(null);

  // Inline document/task templates for program creation
  interface InlineDocument {
    id: string;
    documentName: string;
    documentCategory: string;
    documentDescription: string;
    isRequired: boolean;
  }

  interface InlineTask {
    id: string;
    taskName: string;
    taskDescription: string;
    taskCategory: string;
    priority: string;
  }

  // Form states
  const [programForm, setProgramForm] = useState({
    name: "",
    description: "",
    loanType: "rtl",
    minLoanAmount: "100000",
    maxLoanAmount: "1000000",
    minLtv: "65",
    maxLtv: "80",
    minInterestRate: "9",
    maxInterestRate: "12",
    termOptions: "12, 24",
    eligiblePropertyTypes: [] as string[],
  });

  const [inlineDocuments, setInlineDocuments] = useState<InlineDocument[]>([]);
  const [inlineTasks, setInlineTasks] = useState<InlineTask[]>([]);

  const [documentForm, setDocumentForm] = useState({
    documentName: "",
    documentCategory: "borrower_docs",
    documentDescription: "",
    isRequired: true,
  });

  const [taskForm, setTaskForm] = useState({
    taskName: "",
    taskDescription: "",
    taskCategory: "other",
    priority: "medium",
  });

  // Queries
  const { data: programs, isLoading: loadingPrograms } = useQuery<LoanProgram[]>({
    queryKey: ["/api/admin/programs"],
  });

  const { data: programDetails, isLoading: loadingDetails } = useQuery<{
    program: LoanProgram;
    documents: ProgramDocument[];
    tasks: ProgramTask[];
  }>({
    queryKey: ["/api/admin/programs", selectedProgram?.id],
    enabled: !!selectedProgram?.id,
  });

  // Mutations
  const createProgram = useMutation({
    mutationFn: async (data: typeof programForm) => {
      // Filter out any documents/tasks with empty names
      const validDocuments = inlineDocuments
        .filter(doc => doc.documentName.trim())
        .map(({ id, ...doc }) => doc);
      const validTasks = inlineTasks
        .filter(task => task.taskName.trim())
        .map(({ id, ...task }) => task);
      
      return apiRequest("/api/admin/programs", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          documents: validDocuments,
          tasks: validTasks,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddProgram(false);
      resetProgramForm();
      setInlineDocuments([]);
      setInlineTasks([]);
      toast({ title: "Program created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create program", variant: "destructive" });
    },
  });

  const updateProgram = useMutation({
    mutationFn: async (data: typeof programForm & { id: number }) => {
      return apiRequest("PUT", `/api/admin/programs/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowEditProgram(false);
      setSelectedProgram(null);
      resetProgramForm();
      toast({ title: "Program updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update program", variant: "destructive" });
    },
  });

  const toggleProgram = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/admin/programs/${id}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
    },
    onError: () => {
      toast({ title: "Failed to toggle program", variant: "destructive" });
    },
  });

  const deleteProgram = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/programs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete program", variant: "destructive" });
    },
  });

  const createDocument = useMutation({
    mutationFn: async (data: typeof documentForm) => {
      return apiRequest("POST", `/api/admin/programs/${selectedProgram?.id}/documents`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddDocument(false);
      resetDocumentForm();
      toast({ title: "Document template added" });
    },
    onError: () => {
      toast({ title: "Failed to add document", variant: "destructive" });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (docId: number) => {
      return apiRequest("DELETE", `/api/admin/programs/${selectedProgram?.id}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Document template removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove document", variant: "destructive" });
    },
  });

  const createTask = useMutation({
    mutationFn: async (data: typeof taskForm) => {
      return apiRequest("POST", `/api/admin/programs/${selectedProgram?.id}/tasks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddTask(false);
      resetTaskForm();
      toast({ title: "Task template added" });
    },
    onError: () => {
      toast({ title: "Failed to add task", variant: "destructive" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest("DELETE", `/api/admin/programs/${selectedProgram?.id}/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Task template removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove task", variant: "destructive" });
    },
  });

  const resetProgramForm = () => {
    setProgramForm({
      name: "",
      description: "",
      loanType: "rtl",
      minLoanAmount: "100000",
      maxLoanAmount: "1000000",
      minLtv: "65",
      maxLtv: "80",
      minInterestRate: "9",
      maxInterestRate: "12",
      termOptions: "12, 24",
      eligiblePropertyTypes: [],
    });
    setInlineDocuments([]);
    setInlineTasks([]);
  };

  const addInlineDocument = () => {
    setInlineDocuments([
      ...inlineDocuments,
      {
        id: crypto.randomUUID(),
        documentName: "",
        documentCategory: "borrower_docs",
        documentDescription: "",
        isRequired: true,
      },
    ]);
  };

  const updateInlineDocument = (id: string, field: keyof InlineDocument, value: any) => {
    setInlineDocuments(
      inlineDocuments.map((doc) =>
        doc.id === id ? { ...doc, [field]: value } : doc
      )
    );
  };

  const removeInlineDocument = (id: string) => {
    setInlineDocuments(inlineDocuments.filter((doc) => doc.id !== id));
  };

  const addInlineTask = () => {
    setInlineTasks([
      ...inlineTasks,
      {
        id: crypto.randomUUID(),
        taskName: "",
        taskDescription: "",
        taskCategory: "other",
        priority: "medium",
      },
    ]);
  };

  const updateInlineTask = (id: string, field: keyof InlineTask, value: any) => {
    setInlineTasks(
      inlineTasks.map((task) =>
        task.id === id ? { ...task, [field]: value } : task
      )
    );
  };

  const removeInlineTask = (id: string) => {
    setInlineTasks(inlineTasks.filter((task) => task.id !== id));
  };

  const resetDocumentForm = () => {
    setDocumentForm({
      documentName: "",
      documentCategory: "borrower_docs",
      documentDescription: "",
      isRequired: true,
    });
  };

  const resetTaskForm = () => {
    setTaskForm({
      taskName: "",
      taskDescription: "",
      taskCategory: "other",
      priority: "medium",
    });
  };

  const handleEditProgram = (program: LoanProgram) => {
    setProgramForm({
      name: program.name,
      description: program.description || "",
      loanType: program.loanType,
      minLoanAmount: String(program.minLoanAmount || 100000),
      maxLoanAmount: String(program.maxLoanAmount || 1000000),
      minLtv: String(program.minLtv || 65),
      maxLtv: String(program.maxLtv || 80),
      minInterestRate: String(program.minInterestRate || 9),
      maxInterestRate: String(program.maxInterestRate || 12),
      termOptions: program.termOptions || "",
      eligiblePropertyTypes: program.eligiblePropertyTypes || [],
    });
    setSelectedProgram(program);
    setShowEditProgram(true);
  };

  const handlePropertyTypeToggle = (type: string) => {
    setProgramForm((prev) => ({
      ...prev,
      eligiblePropertyTypes: prev.eligiblePropertyTypes.includes(type)
        ? prev.eligiblePropertyTypes.filter((t) => t !== type)
        : [...prev.eligiblePropertyTypes, type],
    }));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Customize Platform
        </h1>
        <p className="text-muted-foreground">
          Configure loan programs, document requirements, and task workflows
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="programs" className="gap-2" data-testid="tab-programs">
            <Settings2 className="h-4 w-4" />
            Loan Programs
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2" data-testid="tab-documents">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2" data-testid="tab-tasks">
            <ListChecks className="h-4 w-4" />
            Tasks
          </TabsTrigger>
        </TabsList>

        {/* Loan Programs Tab */}
        <TabsContent value="programs" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Loan Programs</h2>
              <p className="text-muted-foreground text-sm">
                Configure the loan programs you offer to borrowers
              </p>
            </div>
            <Dialog open={showAddProgram} onOpenChange={setShowAddProgram}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-program">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Program
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Loan Program</DialogTitle>
                  <DialogDescription>
                    Configure a new loan program for your borrowers.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Program Name</Label>
                    <Input
                      placeholder="e.g., Fix & Flip Express"
                      value={programForm.name}
                      onChange={(e) =>
                        setProgramForm({ ...programForm, name: e.target.value })
                      }
                      data-testid="input-program-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Brief description of this loan program..."
                      value={programForm.description}
                      onChange={(e) =>
                        setProgramForm({ ...programForm, description: e.target.value })
                      }
                      data-testid="input-program-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Loan Type</Label>
                    <Select
                      value={programForm.loanType}
                      onValueChange={(v) =>
                        setProgramForm({ ...programForm, loanType: v })
                      }
                    >
                      <SelectTrigger data-testid="select-loan-type">
                        <SelectValue placeholder="Select loan type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rtl">RTL (Fix & Flip)</SelectItem>
                        <SelectItem value="dscr">DSCR (Rental)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min Loan Amount ($)</Label>
                      <Input
                        type="number"
                        value={programForm.minLoanAmount}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, minLoanAmount: e.target.value })
                        }
                        data-testid="input-min-loan"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Loan Amount ($)</Label>
                      <Input
                        type="number"
                        value={programForm.maxLoanAmount}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, maxLoanAmount: e.target.value })
                        }
                        data-testid="input-max-loan"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min LTV (%)</Label>
                      <Input
                        type="number"
                        value={programForm.minLtv}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, minLtv: e.target.value })
                        }
                        data-testid="input-min-ltv"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max LTV (%)</Label>
                      <Input
                        type="number"
                        value={programForm.maxLtv}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, maxLtv: e.target.value })
                        }
                        data-testid="input-max-ltv"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min Interest Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={programForm.minInterestRate}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, minInterestRate: e.target.value })
                        }
                        data-testid="input-min-rate"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Interest Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={programForm.maxInterestRate}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, maxInterestRate: e.target.value })
                        }
                        data-testid="input-max-rate"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Term Options (months)</Label>
                    <Input
                      placeholder="Enter term options separated by commas"
                      value={programForm.termOptions}
                      onChange={(e) =>
                        setProgramForm({ ...programForm, termOptions: e.target.value })
                      }
                      data-testid="input-term-options"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Eligible Property Types</Label>
                    <div className="flex flex-wrap gap-2">
                      {propertyTypeOptions.map((type) => (
                        <Badge
                          key={type.value}
                          variant={
                            programForm.eligiblePropertyTypes.includes(type.value)
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer"
                          onClick={() => handlePropertyTypeToggle(type.value)}
                          data-testid={`badge-property-${type.value}`}
                        >
                          {type.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Inline Documents Section */}
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Document Requirements ({inlineDocuments.length})
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addInlineDocument}
                        data-testid="button-add-inline-document"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Document
                      </Button>
                    </div>
                    {inlineDocuments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No document requirements added yet. Click "Add Document" to add one.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {inlineDocuments.map((doc, index) => (
                          <Card key={doc.id} className="p-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    placeholder="Document name"
                                    value={doc.documentName}
                                    onChange={(e) =>
                                      updateInlineDocument(doc.id, "documentName", e.target.value)
                                    }
                                    data-testid={`input-doc-name-${index}`}
                                  />
                                  <Select
                                    value={doc.documentCategory}
                                    onValueChange={(v) =>
                                      updateInlineDocument(doc.id, "documentCategory", v)
                                    }
                                  >
                                    <SelectTrigger data-testid={`select-doc-category-${index}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {documentCategories.map((cat) => (
                                        <SelectItem key={cat.value} value={cat.value}>
                                          {cat.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Input
                                  placeholder="Description (optional)"
                                  value={doc.documentDescription}
                                  onChange={(e) =>
                                    updateInlineDocument(doc.id, "documentDescription", e.target.value)
                                  }
                                  data-testid={`input-doc-desc-${index}`}
                                />
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={doc.isRequired}
                                    onCheckedChange={(checked) =>
                                      updateInlineDocument(doc.id, "isRequired", checked)
                                    }
                                    data-testid={`switch-doc-required-${index}`}
                                  />
                                  <Label className="text-sm">Required</Label>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeInlineDocument(doc.id)}
                                data-testid={`button-remove-doc-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Inline Tasks Section */}
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        Task Workflow ({inlineTasks.length})
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addInlineTask}
                        data-testid="button-add-inline-task"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Task
                      </Button>
                    </div>
                    {inlineTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No tasks added yet. Click "Add Task" to add one.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {inlineTasks.map((task, index) => (
                          <Card key={task.id} className="p-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <Input
                                  placeholder="Task name"
                                  value={task.taskName}
                                  onChange={(e) =>
                                    updateInlineTask(task.id, "taskName", e.target.value)
                                  }
                                  data-testid={`input-task-name-${index}`}
                                />
                                <Input
                                  placeholder="Description (optional)"
                                  value={task.taskDescription}
                                  onChange={(e) =>
                                    updateInlineTask(task.id, "taskDescription", e.target.value)
                                  }
                                  data-testid={`input-task-desc-${index}`}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <Select
                                    value={task.taskCategory}
                                    onValueChange={(v) =>
                                      updateInlineTask(task.id, "taskCategory", v)
                                    }
                                  >
                                    <SelectTrigger data-testid={`select-task-category-${index}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {taskCategories.map((cat) => (
                                        <SelectItem key={cat.value} value={cat.value}>
                                          {cat.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={task.priority}
                                    onValueChange={(v) =>
                                      updateInlineTask(task.id, "priority", v)
                                    }
                                  >
                                    <SelectTrigger data-testid={`select-task-priority-${index}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {priorityOptions.map((p) => (
                                        <SelectItem key={p.value} value={p.value}>
                                          {p.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeInlineTask(task.id)}
                                data-testid={`button-remove-task-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddProgram(false);
                      resetProgramForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createProgram.mutate(programForm)}
                    disabled={createProgram.isPending || !programForm.name}
                    data-testid="button-save-program"
                  >
                    {createProgram.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Create Program
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loadingPrograms ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : programs && programs.length > 0 ? (
            <div className="space-y-4">
              {programs.map((program) => (
                <Card key={program.id} data-testid={`card-program-${program.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">{program.name}</h3>
                          <Badge variant={program.isActive ? "default" : "secondary"}>
                            {program.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {program.description && (
                          <p className="text-muted-foreground text-sm">
                            {program.description}
                          </p>
                        )}
                        <div className="grid grid-cols-4 gap-6 text-sm">
                          <div>
                            <div className="text-muted-foreground flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              Loan Amount
                            </div>
                            <div className="font-medium">
                              {formatCurrency(program.minLoanAmount)} -{" "}
                              {formatCurrency(program.maxLoanAmount)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground flex items-center gap-1">
                              <Percent className="h-3 w-3" />
                              LTV Range
                            </div>
                            <div className="font-medium">
                              {program.minLtv}% - {program.maxLtv}%
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground flex items-center gap-1">
                              <Percent className="h-3 w-3" />
                              Interest Rate
                            </div>
                            <div className="font-medium">
                              {program.minInterestRate}% - {program.maxInterestRate}%
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Term Options
                            </div>
                            <div className="font-medium">
                              {program.termOptions
                                ? `${program.termOptions} months`
                                : "N/A"}
                            </div>
                          </div>
                        </div>
                        {program.eligiblePropertyTypes &&
                          program.eligiblePropertyTypes.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {getLoanTypeLabel(program.loanType)}
                              </Badge>
                              {program.eligiblePropertyTypes.map((type) => (
                                <Badge key={type} variant="outline">
                                  {propertyTypeOptions.find((o) => o.value === type)
                                    ?.label || type}
                                </Badge>
                              ))}
                            </div>
                          )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setWorkflowEditorProgram(program)}
                          data-testid={`button-configure-workflow-${program.id}`}
                          className="gap-1"
                        >
                          <Workflow className="h-4 w-4" />
                          Configure Workflow
                        </Button>
                        <Switch
                          checked={program.isActive}
                          onCheckedChange={() => toggleProgram.mutate(program.id)}
                          data-testid={`switch-program-${program.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditProgram(program)}
                          data-testid={`button-edit-program-${program.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (
                              confirm(
                                "Are you sure you want to delete this program? This will also remove all associated document and task templates."
                              )
                            ) {
                              deleteProgram.mutate(program.id);
                            }
                          }}
                          data-testid={`button-delete-program-${program.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">No Programs Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first loan program to get started.
                </p>
                <Button onClick={() => setShowAddProgram(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Program
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Document Templates</h2>
              <p className="text-muted-foreground text-sm">
                Configure required documents for each loan program
              </p>
            </div>
          </div>

          {!programs || programs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">No Programs Available</h3>
                <p className="text-muted-foreground">
                  Create a loan program first to add document templates.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {programs.map((program) => (
                <Card key={program.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{program.name}</h3>
                        <Badge variant="outline">
                          {program.documentCount || 0} documents
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedProgram(program);
                          setShowAddDocument(true);
                        }}
                        data-testid={`button-add-doc-${program.id}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Document
                      </Button>
                    </div>
                    <DocumentList programId={program.id} onDelete={deleteDocument.mutate} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Task Templates</h2>
              <p className="text-muted-foreground text-sm">
                Configure workflow tasks for each loan program
              </p>
            </div>
          </div>

          {!programs || programs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <ListChecks className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">No Programs Available</h3>
                <p className="text-muted-foreground">
                  Create a loan program first to add task templates.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {programs.map((program) => (
                <Card key={program.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{program.name}</h3>
                        <Badge variant="outline">{program.taskCount || 0} tasks</Badge>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedProgram(program);
                          setShowAddTask(true);
                        }}
                        data-testid={`button-add-task-${program.id}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Task
                      </Button>
                    </div>
                    <TaskList programId={program.id} onDelete={deleteTask.mutate} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Program Dialog */}
      <Dialog open={showEditProgram} onOpenChange={setShowEditProgram}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Loan Program</DialogTitle>
            <DialogDescription>Update the loan program settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Program Name</Label>
              <Input
                value={programForm.name}
                onChange={(e) =>
                  setProgramForm({ ...programForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={programForm.description}
                onChange={(e) =>
                  setProgramForm({ ...programForm, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Loan Type</Label>
              <Select
                value={programForm.loanType}
                onValueChange={(v) => setProgramForm({ ...programForm, loanType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtl">RTL (Fix & Flip)</SelectItem>
                  <SelectItem value="dscr">DSCR (Rental)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Loan Amount ($)</Label>
                <Input
                  type="number"
                  value={programForm.minLoanAmount}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, minLoanAmount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max Loan Amount ($)</Label>
                <Input
                  type="number"
                  value={programForm.maxLoanAmount}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, maxLoanAmount: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min LTV (%)</Label>
                <Input
                  type="number"
                  value={programForm.minLtv}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, minLtv: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max LTV (%)</Label>
                <Input
                  type="number"
                  value={programForm.maxLtv}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, maxLtv: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Interest Rate (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={programForm.minInterestRate}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, minInterestRate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max Interest Rate (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={programForm.maxInterestRate}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, maxInterestRate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Term Options (months)</Label>
              <Input
                value={programForm.termOptions}
                onChange={(e) =>
                  setProgramForm({ ...programForm, termOptions: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Eligible Property Types</Label>
              <div className="flex flex-wrap gap-2">
                {propertyTypeOptions.map((type) => (
                  <Badge
                    key={type.value}
                    variant={
                      programForm.eligiblePropertyTypes.includes(type.value)
                        ? "default"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => handlePropertyTypeToggle(type.value)}
                  >
                    {type.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditProgram(false);
                setSelectedProgram(null);
                resetProgramForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                updateProgram.mutate({
                  ...programForm,
                  id: selectedProgram!.id,
                })
              }
              disabled={updateProgram.isPending || !programForm.name}
            >
              {updateProgram.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={showAddDocument} onOpenChange={setShowAddDocument}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document Template</DialogTitle>
            <DialogDescription>
              Add a required document for {selectedProgram?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input
                placeholder="e.g., Government ID"
                value={documentForm.documentName}
                onChange={(e) =>
                  setDocumentForm({ ...documentForm, documentName: e.target.value })
                }
                data-testid="input-doc-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={documentForm.documentCategory}
                onValueChange={(v) =>
                  setDocumentForm({ ...documentForm, documentCategory: v })
                }
              >
                <SelectTrigger data-testid="select-doc-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Additional details about this document..."
                value={documentForm.documentDescription}
                onChange={(e) =>
                  setDocumentForm({
                    ...documentForm,
                    documentDescription: e.target.value,
                  })
                }
                data-testid="input-doc-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={documentForm.isRequired}
                onCheckedChange={(v) =>
                  setDocumentForm({ ...documentForm, isRequired: v })
                }
                data-testid="switch-doc-required"
              />
              <Label>Required Document</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDocument(false);
                resetDocumentForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createDocument.mutate(documentForm)}
              disabled={createDocument.isPending || !documentForm.documentName}
              data-testid="button-save-document"
            >
              {createDocument.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Add Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task Template</DialogTitle>
            <DialogDescription>
              Add a workflow task for {selectedProgram?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Name</Label>
              <Input
                placeholder="e.g., Review Credit Report"
                value={taskForm.taskName}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, taskName: e.target.value })
                }
                data-testid="input-task-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={taskForm.taskCategory}
                onValueChange={(v) => setTaskForm({ ...taskForm, taskCategory: v })}
              >
                <SelectTrigger data-testid="select-task-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taskCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={taskForm.priority}
                onValueChange={(v) => setTaskForm({ ...taskForm, priority: v })}
              >
                <SelectTrigger data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Additional details about this task..."
                value={taskForm.taskDescription}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, taskDescription: e.target.value })
                }
                data-testid="input-task-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddTask(false);
                resetTaskForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createTask.mutate(taskForm)}
              disabled={createTask.isPending || !taskForm.taskName}
              data-testid="button-save-task"
            >
              {createTask.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {workflowEditorProgram && (
        <ProgramWorkflowEditor
          programId={workflowEditorProgram.id}
          programName={workflowEditorProgram.name}
          open={!!workflowEditorProgram}
          onOpenChange={(open) => {
            if (!open) setWorkflowEditorProgram(null);
          }}
        />
      )}
    </div>
  );
}

// Sub-component for Document List
function DocumentList({
  programId,
  onDelete,
}: {
  programId: number;
  onDelete: (id: number) => void;
}) {
  const { data, isLoading } = useQuery<{
    program: LoanProgram;
    documents: ProgramDocument[];
    tasks: ProgramTask[];
  }>({
    queryKey: ["/api/admin/programs", programId],
  });

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!data?.documents || data.documents.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4 text-center">
        No document templates added yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-3 rounded-md border"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">{doc.documentName}</div>
              <div className="text-xs text-muted-foreground">
                {documentCategories.find((c) => c.value === doc.documentCategory)
                  ?.label || doc.documentCategory}
                {doc.isRequired && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Required
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(doc.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// Sub-component for Task List
function TaskList({
  programId,
  onDelete,
}: {
  programId: number;
  onDelete: (id: number) => void;
}) {
  const { data, isLoading } = useQuery<{
    program: LoanProgram;
    documents: ProgramDocument[];
    tasks: ProgramTask[];
  }>({
    queryKey: ["/api/admin/programs", programId],
  });

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!data?.tasks || data.tasks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-4 text-center">
        No task templates added yet.
      </p>
    );
  }

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "critical":
        return "destructive";
      case "high":
        return "default";
      case "medium":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-2">
      {data.tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center justify-between p-3 rounded-md border"
        >
          <div className="flex items-center gap-3">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">{task.taskName}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                {taskCategories.find((c) => c.value === task.taskCategory)?.label ||
                  task.taskCategory}
                <Badge variant={getPriorityVariant(task.priority) as any}>
                  {task.priority}
                </Badge>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

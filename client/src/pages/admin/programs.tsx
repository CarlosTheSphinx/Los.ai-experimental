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
  Sparkles,
  GripVertical,
  ShieldCheck,
  AlertTriangle,
  Info,
  ArrowLeft,
  Eye,
  UserCheck,
  Copy,
  BookTemplate,
  Mic,
  MicOff,
  Check,
  Upload,
  Download,
  FileUp,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import ProgramWorkflowEditor from "@/components/ProgramWorkflowEditor";
import CreditPoliciesTab from "@/components/CreditPoliciesTab";

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
  quoteFormFields: any | null;
  isActive: boolean;
  isTemplate: boolean;
  sortOrder: number | null;
  reviewGuidelines: string | null;
  createdAt: string;
  documentCount?: number;
  taskCount?: number;
}

interface ProgramDocument {
  id: number;
  programId: number;
  stepId: number | null;
  documentName: string;
  documentCategory: string;
  documentDescription: string | null;
  isRequired: boolean;
  assignedTo: string | null;
  visibility: string | null;
  sortOrder: number;
  templateUrl: string | null;
  templateFileName: string | null;
}

interface ProgramTask {
  id: number;
  programId: number;
  stepId: number | null;
  taskName: string;
  taskDescription: string | null;
  taskCategory: string | null;
  assignToRole: string | null;
  visibility: string | null;
  priority: string;
  sortOrder: number;
}

const propertyTypeOptions = [
  { value: "single-family-residence", label: "Single Family Residence" },
  { value: "2-4-unit", label: "2-4 Unit" },
  { value: "multifamily-5-plus", label: "Multifamily (5+ Units)" },
  { value: "rental-portfolio", label: "Rental Portfolio" },
  { value: "mixed-use", label: "Mixed-Use" },
  { value: "infill-lot", label: "Infill Lot" },
  { value: "land", label: "Land" },
  { value: "office", label: "Office" },
  { value: "retail", label: "Retail" },
  { value: "hospitality", label: "Hospitality" },
  { value: "industrial", label: "Industrial" },
  { value: "medical", label: "Medical" },
  { value: "agricultural", label: "Agricultural" },
  { value: "special-purpose", label: "Special Purpose" },
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

// Quote form fields configuration
const DSCR_QUOTE_FIELDS = [
  { fieldKey: "loanAmount", label: "Loan Amount", defaultRequired: true },
  { fieldKey: "propertyValue", label: "Property Value", defaultRequired: true },
  { fieldKey: "loanPurpose", label: "Loan Purpose", defaultRequired: true },
  { fieldKey: "loanType", label: "Loan Type (Fixed/ARM)", defaultRequired: true },
  { fieldKey: "propertyType", label: "Property Type", defaultRequired: true },
  { fieldKey: "ficoScore", label: "FICO Score", defaultRequired: true },
  { fieldKey: "grossMonthlyRent", label: "Gross Monthly Rent", defaultRequired: false },
  { fieldKey: "annualTaxes", label: "Annual Taxes", defaultRequired: false },
  { fieldKey: "annualInsurance", label: "Annual Insurance", defaultRequired: false },
  { fieldKey: "interestOnly", label: "Interest Only", defaultRequired: false },
  { fieldKey: "prepaymentPenalty", label: "Prepayment Penalty", defaultRequired: false },
  { fieldKey: "appraisalValue", label: "Appraisal Value", defaultRequired: false },
];

const RTL_QUOTE_FIELDS = [
  { fieldKey: "loanType", label: "Loan Type (Light/Heavy Rehab)", defaultRequired: true },
  { fieldKey: "purpose", label: "Purpose (Purchase/Refi)", defaultRequired: true },
  { fieldKey: "asIsValue", label: "As-Is Value", defaultRequired: true },
  { fieldKey: "arv", label: "After Repair Value (ARV)", defaultRequired: true },
  { fieldKey: "rehabBudget", label: "Rehab Budget", defaultRequired: true },
  { fieldKey: "propertyType", label: "Property Type", defaultRequired: true },
  { fieldKey: "ficoScore", label: "FICO Score", defaultRequired: true },
  { fieldKey: "propertyUnits", label: "Property Units", defaultRequired: false },
  { fieldKey: "isMidstream", label: "Is Midstream", defaultRequired: false },
  { fieldKey: "borrowingEntityType", label: "Borrowing Entity Type", defaultRequired: false },
  { fieldKey: "completedProjects", label: "Completed Projects", defaultRequired: false },
  { fieldKey: "hasFullGuaranty", label: "Has Full Guaranty", defaultRequired: false },
  { fieldKey: "exitStrategy", label: "Exit Strategy", defaultRequired: false },
  { fieldKey: "appraisalValue", label: "Appraisal Value", defaultRequired: false },
];

interface QuoteFormField {
  fieldKey: string;
  label: string;
  required: boolean;
  visible: boolean;
}

const standardDocuments = [
  {
    category: "borrower_docs",
    categoryLabel: "Borrower Docs",
    documents: [
      { id: "gov_id", name: "Government-Issued Photo ID" },
      { id: "ssn_card", name: "Social Security Card" },
      { id: "auth_release", name: "Authorization to Release Information" },
    ],
  },
  {
    category: "financial_docs",
    categoryLabel: "Financial Docs",
    documents: [
      { id: "personal_bank_stmt", name: "2 Months Personal Bank Statements" },
      { id: "business_bank_stmt", name: "2 Months Business Bank Statements" },
      { id: "pfs", name: "Personal Financial Statement (PFS)" },
      { id: "tax_returns", name: "Most Recent Tax Returns (2 Years)" },
      { id: "w2_1099", name: "W-2s / 1099s (2 Years)" },
      { id: "pl_statement", name: "Profit & Loss Statement (YTD)" },
    ],
  },
  {
    category: "entity_docs",
    categoryLabel: "Entity Docs",
    documents: [
      { id: "articles_org", name: "Articles of Organization / Incorporation" },
      { id: "operating_agreement", name: "Operating Agreement" },
      { id: "good_standing", name: "Certificate of Good Standing" },
      { id: "ein_letter", name: "EIN Letter (IRS)" },
    ],
  },
  {
    category: "property_docs",
    categoryLabel: "Property Docs",
    documents: [
      { id: "purchase_contract", name: "Purchase Contract / LOI" },
      { id: "property_photos", name: "Property Photos" },
      { id: "sreo", name: "Schedule of Real Estate Owned (SREO)" },
      { id: "rent_roll", name: "Rent Roll (if applicable)" },
      { id: "insurance_binder", name: "Insurance Binder / Dec Page" },
      { id: "appraisal", name: "Appraisal (if applicable)" },
      { id: "title_commitment", name: "Title Commitment / Preliminary Title Report" },
    ],
  },
  {
    category: "closing_docs",
    categoryLabel: "Closing Docs",
    documents: [
      { id: "hud1_cd", name: "HUD-1 / Closing Disclosure (if refinance)" },
      { id: "payoff_stmt", name: "Payoff Statement (if refinance)" },
    ],
  },
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

function getDefaultQuoteFields(loanType: string): QuoteFormField[] {
  const baseFields = loanType.toLowerCase() === "dscr" ? DSCR_QUOTE_FIELDS : RTL_QUOTE_FIELDS;
  return baseFields.map((field) => ({
    fieldKey: field.fieldKey,
    label: field.label,
    required: field.defaultRequired,
    visible: true,
  }));
}

export default function AdminPrograms() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("programs");
  const [selectedProgram, setSelectedProgram] = useState<LoanProgram | null>(null);
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [showEditProgram, setShowEditProgram] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ProgramDocument | null>(null);
  const [showQuickAddSection, setShowQuickAddSection] = useState(true);
  const [selectedStandardDocs, setSelectedStandardDocs] = useState<Set<string>>(new Set());
  const [showAddTask, setShowAddTask] = useState(false);
  const [collapsedDocPrograms, setCollapsedDocPrograms] = useState<Set<number>>(new Set());
  const [collapsedTaskPrograms, setCollapsedTaskPrograms] = useState<Set<number>>(new Set());
  const [workflowEditorProgram, setWorkflowEditorProgram] = useState<LoanProgram | null>(null);

  // Inline document/task templates for program creation
  interface InlineDocument {
    id: string;
    documentName: string;
    documentCategory: string;
    documentDescription: string;
    isRequired: boolean;
    stepIndex: number | null;
    assignedTo: string;
    visibility: string;
  }

  interface InlineTask {
    id: string;
    taskName: string;
    taskDescription: string;
    taskCategory: string;
    priority: string;
    stepIndex: number | null;
    assignedTo: string;
    visibility: string;
  }

  interface InlineStep {
    id: string;
    stepName: string;
    stepDefinitionId: number | null;
    isRequired: boolean;
  }

  const visibilityOptions = [
    { value: "admin", label: "Team Only" },
    { value: "broker", label: "Team + Broker" },
    { value: "all", label: "Team + Broker + Borrower" },
    { value: "borrower", label: "Team + Borrower" },
  ];

  const assignedToOptions = [
    { value: "admin", label: "Team Only" },
    { value: "broker", label: "Team + Broker" },
    { value: "all", label: "Team + Broker + Borrower" },
    { value: "borrower", label: "Team + Borrower" },
  ];

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
    minUnits: "",
    maxUnits: "",
    termOptions: "12, 24",
    eligiblePropertyTypes: [] as string[],
    quoteFormFields: [] as QuoteFormField[],
    reviewGuidelines: "",
    creditPolicyId: null as number | null,
  });

  const [inlineDocuments, setInlineDocuments] = useState<InlineDocument[]>([]);
  const [inlineTasks, setInlineTasks] = useState<InlineTask[]>([]);
  const [inlineSteps, setInlineSteps] = useState<InlineStep[]>([]);
  const [editDataInitialized, setEditDataInitialized] = useState(false);

  const [documentForm, setDocumentForm] = useState({
    documentName: "",
    documentCategory: "borrower_docs",
    documentDescription: "",
    isRequired: true,
    stepId: null as number | null,
    stepDefinitionId: null as number | null,
    assignedTo: "borrower",
    visibility: "all",
  });

  const [taskForm, setTaskForm] = useState({
    taskName: "",
    taskDescription: "",
    taskCategory: "other",
    priority: "medium",
    stepId: null as number | null,
    stepDefinitionId: null as number | null,
    assignedTo: "admin",
    visibility: "all",
  });


  // Queries
  const { data: programs, isLoading: loadingPrograms } = useQuery<LoanProgram[]>({
    queryKey: ["/api/admin/programs"],
  });

  type CreditPolicyOption = { id: number; name: string; ruleCount: number };
  const { data: creditPolicies } = useQuery<CreditPolicyOption[]>({
    queryKey: ["/api/admin/credit-policies"],
  });

  const { data: availableSteps } = useQuery<{ id: number; name: string; key: string; description: string | null; color: string | null; icon: string | null }[]>({
    queryKey: ["/api/admin/workflow-steps"],
  });

  const { data: programDetails, isLoading: loadingDetails } = useQuery<{
    program: LoanProgram;
    documents: ProgramDocument[];
    tasks: ProgramTask[];
    workflowSteps: { id: number; programId: number; stepDefinitionId: number; stepOrder: number; isRequired: boolean; estimatedDays: number | null; createdAt: string; definition: { id: number; name: string; key: string; description: string | null; color: string | null; icon: string | null } }[];
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
      const validSteps = inlineSteps
        .filter(step => step.stepName.trim() || step.stepDefinitionId)
        .map(({ id, ...step }) => step);
      
      return apiRequest("POST", "/api/admin/programs", {
        ...data,
        documents: validDocuments,
        tasks: validTasks,
        steps: validSteps,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddProgram(false);
      resetProgramForm();
      setInlineDocuments([]);
      setInlineTasks([]);
      setInlineSteps([]);
      toast({ title: "Program created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create program", variant: "destructive" });
    },
  });

  const updateProgram = useMutation({
    mutationFn: async (data: typeof programForm & { id: number }) => {
      const payload: any = { ...data };

      if (editDataInitialized) {
        payload.documents = inlineDocuments
          .filter(doc => doc.documentName.trim())
          .map(({ id, ...doc }) => doc);
        payload.tasks = inlineTasks
          .filter(task => task.taskName.trim())
          .map(({ id, ...task }) => task);
        payload.steps = inlineSteps
          .filter(step => step.stepName.trim() || step.stepDefinitionId)
          .map(({ id, ...step }) => step);
      }

      return apiRequest("PUT", `/api/admin/programs/${data.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowEditProgram(false);
      setSelectedProgram(null);
      resetProgramForm();
      setInlineSteps([]);
      setInlineDocuments([]);
      setInlineTasks([]);
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

  const duplicateProgram = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/admin/programs/${id}/duplicate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program duplicated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate program", variant: "destructive" });
    },
  });

  const toggleTemplate = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/admin/programs/${id}/template`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Template status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update template status", variant: "destructive" });
    },
  });

  const createDocument = useMutation({
    mutationFn: async (data: typeof documentForm) => {
      return apiRequest("POST", `/api/admin/programs/${selectedProgram?.id}/documents`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id, "workflow-steps"] });
      setShowAddDocument(false);
      resetDocumentForm();
      toast({ title: "Document template added" });
    },
    onError: () => {
      toast({ title: "Failed to add document", variant: "destructive" });
    },
  });

  const updateDocument = useMutation({
    mutationFn: async (data: typeof documentForm) => {
      if (!editingDocument) throw new Error("No document selected for editing");
      return apiRequest("PUT", `/api/admin/programs/${selectedProgram?.id}/documents/${editingDocument.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setShowAddDocument(false);
      setEditingDocument(null);
      resetDocumentForm();
      toast({ title: "Document template updated" });
    },
    onError: () => {
      toast({ title: "Failed to update document", variant: "destructive" });
    },
  });

  const bulkCreateDocuments = useMutation({
    mutationFn: async (docNames: string[]) => {
      const promises = docNames.map(docName => {
        const categoryGroup = standardDocuments.find(cat =>
          cat.documents.some(doc => doc.name === docName)
        );
        return apiRequest("POST", `/api/admin/programs/${selectedProgram?.id}/documents`, {
          documentName: docName,
          documentCategory: categoryGroup?.category || "other",
          documentDescription: "",
          isRequired: true,
          stepId: null,
          assignedTo: "borrower",
          visibility: "all",
        });
      });
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      setSelectedStandardDocs(new Set());
      toast({ title: "Documents added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add some documents", variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", selectedProgram?.id, "workflow-steps"] });
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
      minUnits: "",
      maxUnits: "",
      termOptions: "12, 24",
      eligiblePropertyTypes: [],
      quoteFormFields: [],
      reviewGuidelines: "",
      creditPolicyId: null,
    });
    setInlineDocuments([]);
    setInlineTasks([]);
    setInlineSteps([]);
  };

  const addInlineDocument = (stepIdx: number | null = null) => {
    setInlineDocuments([
      ...inlineDocuments,
      {
        id: crypto.randomUUID(),
        documentName: "",
        documentCategory: "borrower_docs",
        documentDescription: "",
        isRequired: true,
        stepIndex: stepIdx,
        assignedTo: "borrower",
        visibility: "all",
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

  const addInlineTask = (stepIdx: number | null = null) => {
    setInlineTasks([
      ...inlineTasks,
      {
        id: crypto.randomUUID(),
        taskName: "",
        taskDescription: "",
        taskCategory: "other",
        priority: "medium",
        stepIndex: stepIdx,
        assignedTo: "admin",
        visibility: "all",
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

  const addInlineStep = () => {
    setInlineSteps([
      ...inlineSteps,
      {
        id: crypto.randomUUID(),
        stepName: "",
        stepDefinitionId: null,
        isRequired: true,
      },
    ]);
  };

  const updateInlineStep = (id: string, field: keyof InlineStep, value: any) => {
    setInlineSteps(
      inlineSteps.map((step) =>
        step.id === id ? { ...step, [field]: value } : step
      )
    );
  };

  const removeInlineStep = (id: string) => {
    setInlineSteps(inlineSteps.filter((step) => step.id !== id));
  };

  const resetDocumentForm = () => {
    setDocumentForm({
      documentName: "",
      documentCategory: "borrower_docs",
      documentDescription: "",
      isRequired: true,
      stepId: null,
      stepDefinitionId: null,
      assignedTo: "borrower",
      visibility: "all",
    });
  };

  const loadDocumentForEditing = (doc: ProgramDocument) => {
    setEditingDocument(doc);
    setDocumentForm({
      documentName: doc.documentName,
      documentCategory: doc.documentCategory,
      documentDescription: doc.documentDescription || "",
      isRequired: doc.isRequired,
      stepId: doc.stepId,
      assignedTo: doc.assignedTo || "borrower",
      visibility: doc.visibility || "all",
    });
    setShowAddDocument(true);
  };

  const resetTaskForm = () => {
    setTaskForm({
      taskName: "",
      taskDescription: "",
      taskCategory: "other",
      priority: "medium",
      stepId: null,
      stepDefinitionId: null,
      assignedTo: "admin",
      visibility: "all",
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
      minUnits: program.minUnits != null ? String(program.minUnits) : "",
      maxUnits: program.maxUnits != null ? String(program.maxUnits) : "",
      termOptions: program.termOptions || "",
      eligiblePropertyTypes: program.eligiblePropertyTypes || [],
      quoteFormFields: (program.quoteFormFields as QuoteFormField[]) || [],
      reviewGuidelines: program.reviewGuidelines || "",
      creditPolicyId: (program as any).creditPolicyId || null,
    });
    setSelectedProgram(program);
    setCustomLoanType("");
    setCustomPropertyType("");
    setInlineSteps([]);
    setInlineDocuments([]);
    setInlineTasks([]);
    setEditDataInitialized(false);
    setShowEditProgram(true);
  };

  useEffect(() => {
    if (showEditProgram && programDetails) {
      const steps = (programDetails.workflowSteps || [])
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((ws) => ({
          id: crypto.randomUUID(),
          stepName: ws.definition?.name || "",
          stepDefinitionId: ws.stepDefinitionId,
          isRequired: ws.isRequired,
        }));
      setInlineSteps(steps);

      const stepIdToIndex = new Map<number, number>();
      (programDetails.workflowSteps || [])
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .forEach((ws, idx) => {
          stepIdToIndex.set(ws.id, idx);
        });

      setInlineDocuments(
        (programDetails.documents || []).map((doc) => ({
          id: crypto.randomUUID(),
          documentName: doc.documentName,
          documentCategory: doc.documentCategory || "borrower_docs",
          documentDescription: doc.documentDescription || "",
          isRequired: doc.isRequired,
          stepIndex: doc.stepId != null ? (stepIdToIndex.get(doc.stepId) ?? null) : null,
          assignedTo: doc.assignedTo || "borrower",
          visibility: doc.visibility || "all",
        }))
      );
      setInlineTasks(
        (programDetails.tasks || []).map((task) => ({
          id: crypto.randomUUID(),
          taskName: task.taskName,
          taskDescription: task.taskDescription || "",
          taskCategory: task.taskCategory || "other",
          priority: task.priority || "medium",
          stepIndex: task.stepId != null ? (stepIdToIndex.get(task.stepId) ?? null) : null,
          assignedTo: task.assignToRole || "admin",
          visibility: task.visibility || "all",
        }))
      );
      setEditDataInitialized(true);
    }
  }, [showEditProgram, programDetails]);

  // Update quote form fields when loan type changes
  useEffect(() => {
    if (showAddProgram || showEditProgram) {
      // If no quote fields are set yet, or if we're changing loan type, initialize with defaults
      if (!programForm.quoteFormFields || programForm.quoteFormFields.length === 0) {
        setProgramForm((prev) => ({
          ...prev,
          quoteFormFields: getDefaultQuoteFields(prev.loanType),
        }));
      }
    }
  }, [programForm.loanType, showAddProgram, showEditProgram]);

  const [customLoanType, setCustomLoanType] = useState("");
  const [customPropertyType, setCustomPropertyType] = useState("");

  const loanTypeOptions = [
    { value: "dscr", label: "DSCR (Rental)" },
    { value: "rtl", label: "RTL (Fix & Flip)" },
  ];

  const allPropertyTypeOptions = [
    ...propertyTypeOptions,
    ...programForm.eligiblePropertyTypes
      .filter((t) => !propertyTypeOptions.some((p) => p.value === t))
      .map((t) => ({ value: t, label: t })),
  ];

  const handlePropertyTypeToggle = (type: string) => {
    setProgramForm((prev) => ({
      ...prev,
      eligiblePropertyTypes: prev.eligiblePropertyTypes.includes(type)
        ? prev.eligiblePropertyTypes.filter((t) => t !== type)
        : [...prev.eligiblePropertyTypes, type],
    }));
  };

  const handleAddCustomPropertyType = () => {
    const trimmed = customPropertyType.trim();
    if (!trimmed) return;
    if (!programForm.eligiblePropertyTypes.includes(trimmed)) {
      setProgramForm((prev) => ({
        ...prev,
        eligiblePropertyTypes: [...prev.eligiblePropertyTypes, trimmed],
      }));
    }
    setCustomPropertyType("");
  };

  const isCustomLoanType = programForm.loanType && !loanTypeOptions.some((o) => o.value === programForm.loanType);

  const handleToggleFieldVisibility = (fieldKey: string) => {
    setProgramForm((prev) => ({
      ...prev,
      quoteFormFields: prev.quoteFormFields.map((field) =>
        field.fieldKey === fieldKey
          ? { ...field, visible: !field.visible, required: field.visible ? false : field.required }
          : field
      ),
    }));
  };

  const handleToggleFieldRequired = (fieldKey: string) => {
    setProgramForm((prev) => ({
      ...prev,
      quoteFormFields: prev.quoteFormFields.map((field) =>
        field.fieldKey === fieldKey
          ? { ...field, required: !field.required }
          : field
      ),
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
          <TabsTrigger value="credit-policies" className="gap-2" data-testid="tab-credit-policies">
            <ShieldCheck className="h-4 w-4" />
            Credit Policies
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
              <DialogContent className="fixed inset-0 max-w-none w-screen h-screen rounded-none translate-x-0 translate-y-0 top-0 left-0 flex flex-col overflow-hidden p-0 border-none [&>button]:hidden" style={{ transform: 'none' }}>
                <div className="flex-shrink-0 z-50 flex items-center justify-between gap-3 px-6 py-3 border-b bg-background">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setShowAddProgram(false); resetProgramForm(); }}
                      data-testid="button-back-add-program"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                      <h2 className="text-lg font-semibold leading-tight">Add New Loan Program</h2>
                      <p className="text-xs text-muted-foreground">Configure a new loan program for your borrowers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowAddProgram(false); resetProgramForm(); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => createProgram.mutate(programForm)}
                      disabled={createProgram.isPending || !programForm.name}
                      data-testid="button-save-program-top"
                    >
                      {createProgram.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      Create Program
                    </Button>
                  </div>
                </div>
                <div className="flex flex-1 min-h-0">
                  <div className="w-1/2 overflow-y-auto p-6 md:p-8 border-r">
                <DialogHeader className="sr-only">
                  <DialogTitle>Add New Loan Program</DialogTitle>
                  <DialogDescription>Configure a new loan program</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
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
                    <div className="flex flex-wrap gap-2 mb-2">
                      {loanTypeOptions.map((opt) => (
                        <Badge
                          key={opt.value}
                          variant={programForm.loanType === opt.value ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => {
                            setProgramForm({ ...programForm, loanType: opt.value });
                            setCustomLoanType("");
                          }}
                          data-testid={`badge-loan-type-${opt.value}`}
                        >
                          {opt.label}
                        </Badge>
                      ))}
                      {isCustomLoanType && (
                        <Badge variant="default" data-testid="badge-loan-type-custom">
                          {programForm.loanType}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Or type a custom loan type..."
                        value={customLoanType}
                        onChange={(e) => setCustomLoanType(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customLoanType.trim()) {
                            e.preventDefault();
                            setProgramForm({ ...programForm, loanType: customLoanType.trim() });
                            setCustomLoanType("");
                          }
                        }}
                        data-testid="input-custom-loan-type"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!customLoanType.trim()}
                        onClick={() => {
                          setProgramForm({ ...programForm, loanType: customLoanType.trim() });
                          setCustomLoanType("");
                        }}
                        data-testid="button-add-custom-loan-type"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min Units (optional)</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 1"
                        value={programForm.minUnits}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, minUnits: e.target.value })
                        }
                        data-testid="input-min-units"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Units (optional)</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 100"
                        value={programForm.maxUnits}
                        onChange={(e) =>
                          setProgramForm({ ...programForm, maxUnits: e.target.value })
                        }
                        data-testid="input-max-units"
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
                      {allPropertyTypeOptions.map((type) => (
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
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Add custom property type..."
                        value={customPropertyType}
                        onChange={(e) => setCustomPropertyType(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddCustomPropertyType();
                          }
                        }}
                        data-testid="input-custom-property-type"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!customPropertyType.trim()}
                        onClick={handleAddCustomPropertyType}
                        data-testid="button-add-custom-property-type"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Credit Policy</Label>
                    <Select
                      value={programForm.creditPolicyId ? String(programForm.creditPolicyId) : "none"}
                      onValueChange={(v) =>
                        setProgramForm({ ...programForm, creditPolicyId: v === "none" ? null : parseInt(v) })
                      }
                    >
                      <SelectTrigger data-testid="select-credit-policy">
                        <SelectValue placeholder="Select a credit policy..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {creditPolicies?.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} ({p.ruleCount} rules)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Assign a credit policy to enable AI document review for this program.
                    </p>
                  </div>

                  <div className="border-t pt-6 mt-6 space-y-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Quote Form Fields
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Configure which fields appear in quotes for this {getLoanTypeLabel(programForm.loanType)} program
                    </p>
                    <div className="space-y-2 max-h-80 overflow-y-auto border rounded-md p-3">
                      {programForm.quoteFormFields.map((field) => (
                        <div
                          key={field.fieldKey}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted"
                        >
                          <span className="text-sm font-medium flex-1">{field.label}</span>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Visible</Label>
                              <Switch
                                checked={field.visible}
                                onCheckedChange={() => handleToggleFieldVisibility(field.fieldKey)}
                                data-testid={`switch-field-visible-${field.fieldKey}`}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Required</Label>
                              <Switch
                                checked={field.required}
                                onCheckedChange={() => handleToggleFieldRequired(field.fieldKey)}
                                disabled={!field.visible}
                                data-testid={`switch-field-required-${field.fieldKey}`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                  </div>
                  <div className="w-1/2 overflow-y-auto p-6 md:p-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <Workflow className="h-4 w-4" />
                          Stages ({inlineSteps.length})
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addInlineStep}
                          data-testid="button-add-inline-step"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Stage
                        </Button>
                      </div>
                      {inlineSteps.length === 0 ? (
                        <div className="text-center py-8">
                          <Workflow className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                          <p className="text-sm text-muted-foreground">
                            No stages added yet. Click "Add Stage" to add one.
                          </p>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-border" />
                          {inlineSteps.map((step, index) => {
                            const stageDocs = inlineDocuments.filter(d => d.stepIndex === index);
                            const stageTasks = inlineTasks.filter(t => t.stepIndex === index);
                            return (
                              <div key={step.id} className="relative pl-10 pb-4">
                                <div className="absolute left-2.5 top-4 w-3 h-3 rounded-full bg-primary border-2 border-background z-[1]" />
                                <Card className="p-3">
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 space-y-2">
                                      <Input
                                        placeholder="Stage name (e.g., Underwriting)"
                                        value={step.stepName}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const match = availableSteps?.find(
                                            (s) => s.name.toLowerCase() === val.trim().toLowerCase()
                                          );
                                          setInlineSteps((prev) =>
                                            prev.map((s) =>
                                              s.id === step.id
                                                ? { ...s, stepName: val, stepDefinitionId: match ? match.id : null }
                                                : s
                                            )
                                          );
                                        }}
                                        list={`step-suggestions-${index}`}
                                        data-testid={`input-step-name-${index}`}
                                      />
                                      {availableSteps && availableSteps.length > 0 && (
                                        <datalist id={`step-suggestions-${index}`}>
                                          {availableSteps.map((s) => (
                                            <option key={s.id} value={s.name} />
                                          ))}
                                        </datalist>
                                      )}
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-2">
                                          <Switch
                                            checked={step.isRequired}
                                            onCheckedChange={(v) =>
                                              updateInlineStep(step.id, "isRequired", v)
                                            }
                                            data-testid={`switch-step-required-${index}`}
                                          />
                                          <Label className="text-sm">Required</Label>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => addInlineDocument(index)}
                                            data-testid={`button-add-stage-doc-${index}`}
                                          >
                                            <FileText className="h-3 w-3 mr-1" />
                                            Doc
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => addInlineTask(index)}
                                            data-testid={`button-add-stage-task-${index}`}
                                          >
                                            <ListChecks className="h-3 w-3 mr-1" />
                                            Task
                                          </Button>
                                        </div>
                                      </div>
                                      {stageDocs.map((doc) => (
                                        <div key={doc.id} className="space-y-1.5 border rounded-md px-2 py-1.5 bg-muted/30">
                                          <div className="flex items-center gap-2">
                                            <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            <Input
                                              className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                              placeholder="Document name"
                                              value={doc.documentName}
                                              onChange={(e) => updateInlineDocument(doc.id, "documentName", e.target.value)}
                                              data-testid={`input-stage-doc-name-${index}-${doc.id}`}
                                            />
                                            {doc.isRequired && <Badge variant="secondary" className="text-xs flex-shrink-0">Req</Badge>}
                                            <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineDocument(doc.id)} data-testid={`button-remove-stage-doc-${index}-${doc.id}`}>
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                          <div className="flex items-center gap-2 flex-wrap pl-5">
                                            <div className="flex items-center gap-1">
                                              <Eye className="h-3 w-3 text-muted-foreground" />
                                              <Select value={doc.visibility} onValueChange={(v) => updateInlineDocument(doc.id, "visibility", v)}>
                                                <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-doc-visibility-${doc.id}`}>
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {visibilityOptions.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <UserCheck className="h-3 w-3 text-muted-foreground" />
                                              <Select value={doc.assignedTo} onValueChange={(v) => updateInlineDocument(doc.id, "assignedTo", v)}>
                                                <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-doc-assigned-${doc.id}`}>
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {assignedToOptions.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <Select value={doc.stepIndex != null ? String(doc.stepIndex) : "none"} onValueChange={(v) => updateInlineDocument(doc.id, "stepIndex", v === "none" ? null : parseInt(v))}>
                                              <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`select-doc-stage-${doc.id}`}>
                                                <SelectValue placeholder="Stage" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="none">No stage</SelectItem>
                                                {inlineSteps.map((s, si) => {
                                                  const sName = s.stepName || (availableSteps?.find(av => av.id === s.stepDefinitionId)?.name) || `Stage ${si + 1}`;
                                                  return sName.trim() ? <SelectItem key={s.id} value={String(si)}>{sName}</SelectItem> : null;
                                                })}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </div>
                                      ))}
                                      {stageTasks.map((task) => (
                                        <div key={task.id} className="space-y-1.5 border rounded-md px-2 py-1.5 bg-muted/30">
                                          <div className="flex items-center gap-2">
                                            <ListChecks className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                            <Input
                                              className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                              placeholder="Task name"
                                              value={task.taskName}
                                              onChange={(e) => updateInlineTask(task.id, "taskName", e.target.value)}
                                              data-testid={`input-stage-task-name-${index}-${task.id}`}
                                            />
                                            <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineTask(task.id)} data-testid={`button-remove-stage-task-${index}-${task.id}`}>
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                          <div className="flex items-center gap-2 flex-wrap pl-5">
                                            <div className="flex items-center gap-1">
                                              <Eye className="h-3 w-3 text-muted-foreground" />
                                              <Select value={task.visibility} onValueChange={(v) => updateInlineTask(task.id, "visibility", v)}>
                                                <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-task-visibility-${task.id}`}>
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {visibilityOptions.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <UserCheck className="h-3 w-3 text-muted-foreground" />
                                              <Select value={task.assignedTo} onValueChange={(v) => updateInlineTask(task.id, "assignedTo", v)}>
                                                <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-task-assigned-${task.id}`}>
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {assignedToOptions.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <Select value={task.stepIndex != null ? String(task.stepIndex) : "none"} onValueChange={(v) => updateInlineTask(task.id, "stepIndex", v === "none" ? null : parseInt(v))}>
                                              <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`select-task-stage-${task.id}`}>
                                                <SelectValue placeholder="Stage" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="none">No stage</SelectItem>
                                                {inlineSteps.map((s, si) => {
                                                  const sName = s.stepName || (availableSteps?.find(av => av.id === s.stepDefinitionId)?.name) || `Stage ${si + 1}`;
                                                  return sName.trim() ? <SelectItem key={s.id} value={String(si)}>{sName}</SelectItem> : null;
                                                })}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeInlineStep(step.id)}
                                      data-testid={`button-remove-step-${index}`}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </Card>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(() => {
                        const unassignedDocs = inlineDocuments.filter(d => d.stepIndex === null);
                        const unassignedTasks = inlineTasks.filter(t => t.stepIndex === null);
                        return (
                          <div className="space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <Label className="text-sm font-medium text-muted-foreground">{inlineSteps.length > 0 ? "Unassigned Items" : "Documents & Tasks"}</Label>
                              <div className="flex items-center gap-1">
                                <Button type="button" variant="ghost" size="sm" onClick={() => addInlineDocument()} data-testid="button-add-inline-document">
                                  <FileText className="h-3 w-3 mr-1" />
                                  Doc
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => addInlineTask()} data-testid="button-add-inline-task">
                                  <ListChecks className="h-3 w-3 mr-1" />
                                  Task
                                </Button>
                              </div>
                            </div>
                            {unassignedDocs.length === 0 && unassignedTasks.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2" data-testid="text-no-unassigned">No unassigned documents or tasks. Use the buttons above to add some.</p>
                            ) : (
                              <div className="space-y-2">
                                {unassignedDocs.map((doc) => (
                                  <div key={doc.id} className="space-y-1.5 border rounded-md px-2 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <Input
                                        className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                        placeholder="Document name"
                                        value={doc.documentName}
                                        onChange={(e) => updateInlineDocument(doc.id, "documentName", e.target.value)}
                                        data-testid={`input-unassigned-doc-${doc.id}`}
                                      />
                                      <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineDocument(doc.id)} data-testid={`button-remove-unassigned-doc-${doc.id}`}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap pl-5">
                                      <div className="flex items-center gap-1">
                                        <Eye className="h-3 w-3 text-muted-foreground" />
                                        <Select value={doc.visibility} onValueChange={(v) => updateInlineDocument(doc.id, "visibility", v)}>
                                          <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-unassigned-doc-visibility-${doc.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {visibilityOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <UserCheck className="h-3 w-3 text-muted-foreground" />
                                        <Select value={doc.assignedTo} onValueChange={(v) => updateInlineDocument(doc.id, "assignedTo", v)}>
                                          <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-unassigned-doc-assigned-${doc.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {assignedToOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {inlineSteps.length > 0 && (
                                        <Select value="none" onValueChange={(v) => updateInlineDocument(doc.id, "stepIndex", v === "none" ? null : parseInt(v))}>
                                          <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`select-assign-doc-${doc.id}`}>
                                            <SelectValue placeholder="Assign stage..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">No stage</SelectItem>
                                            {inlineSteps.map((s, si) => {
                                              const name = s.stepName || (availableSteps?.find(av => av.id === s.stepDefinitionId)?.name) || `Stage ${si + 1}`;
                                              return name.trim() ? <SelectItem key={s.id} value={String(si)}>{name}</SelectItem> : null;
                                            })}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {unassignedTasks.map((task) => (
                                  <div key={task.id} className="space-y-1.5 border rounded-md px-2 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <ListChecks className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <Input
                                        className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                        placeholder="Task name"
                                        value={task.taskName}
                                        onChange={(e) => updateInlineTask(task.id, "taskName", e.target.value)}
                                        data-testid={`input-unassigned-task-${task.id}`}
                                      />
                                      <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineTask(task.id)} data-testid={`button-remove-unassigned-task-${task.id}`}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap pl-5">
                                      <div className="flex items-center gap-1">
                                        <Eye className="h-3 w-3 text-muted-foreground" />
                                        <Select value={task.visibility} onValueChange={(v) => updateInlineTask(task.id, "visibility", v)}>
                                          <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-unassigned-task-visibility-${task.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {visibilityOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <UserCheck className="h-3 w-3 text-muted-foreground" />
                                        <Select value={task.assignedTo} onValueChange={(v) => updateInlineTask(task.id, "assignedTo", v)}>
                                          <SelectTrigger className="h-7 text-xs w-[150px]" data-testid={`select-unassigned-task-assigned-${task.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {assignedToOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {inlineSteps.length > 0 && (
                                        <Select value="none" onValueChange={(v) => updateInlineTask(task.id, "stepIndex", v === "none" ? null : parseInt(v))}>
                                          <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`select-assign-task-${task.id}`}>
                                            <SelectValue placeholder="Assign stage..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">No stage</SelectItem>
                                            {inlineSteps.map((s, si) => {
                                              const name = s.stepName || (availableSteps?.find(av => av.id === s.stepDefinitionId)?.name) || `Stage ${si + 1}`;
                                              return name.trim() ? <SelectItem key={s.id} value={String(si)}>{name}</SelectItem> : null;
                                            })}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
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
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-lg">{program.name}</h3>
                          <Badge variant={program.isActive ? "default" : "secondary"}>
                            {program.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {program.isTemplate && (
                            <Badge variant="outline" className="gap-1">
                              <BookTemplate className="h-3 w-3" />
                              Template
                            </Badge>
                          )}
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
                      <div className="flex items-center gap-2 flex-wrap">
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
                        <Button
                          variant={program.isTemplate ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleTemplate.mutate(program.id)}
                          data-testid={`button-template-${program.id}`}
                          className="gap-1"
                          disabled={toggleTemplate.isPending}
                        >
                          <BookTemplate className="h-4 w-4" />
                          {program.isTemplate ? "Template" : "Make Template"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => duplicateProgram.mutate(program.id)}
                          data-testid={`button-duplicate-${program.id}`}
                          className="gap-1"
                          disabled={duplicateProgram.isPending}
                        >
                          <Copy className="h-4 w-4" />
                          Duplicate
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
              {programs.map((program) => {
                const isCollapsed = collapsedDocPrograms.has(program.id);
                return (
                  <Card key={program.id}>
                    <CardContent className="p-6">
                      <div
                        className="flex items-center justify-between cursor-pointer select-none"
                        onClick={() => {
                          setCollapsedDocPrograms(prev => {
                            const next = new Set(prev);
                            if (next.has(program.id)) next.delete(program.id);
                            else next.add(program.id);
                            return next;
                          });
                        }}
                        data-testid={`toggle-doc-section-${program.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                          <h3 className="font-semibold">{program.name}</h3>
                          <Badge variant="outline">
                            {program.documentCount || 0} documents
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProgram(program);
                            setShowAddDocument(true);
                          }}
                          data-testid={`button-add-doc-${program.id}`}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Document
                        </Button>
                      </div>
                      {!isCollapsed && (
                        <div className="mt-4 space-y-4">
                          {/* Quick Add Standard Documents Section */}
                          <div className="border rounded-md bg-muted/30 p-4">
                            <div
                              className="flex items-center gap-2 cursor-pointer select-none"
                              onClick={() => setShowQuickAddSection(!showQuickAddSection)}
                            >
                              {showQuickAddSection ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                              <BookTemplate className="h-4 w-4" />
                              <span className="font-medium text-sm">Quick Add Standard Documents</span>
                            </div>
                            {showQuickAddSection && (
                              <div className="mt-4 space-y-4">
                                {standardDocuments.map((categoryGroup) => {
                                  const existingDocs = programDetails?.documents || [];
                                  const existingNames = new Set(existingDocs.map(d => d.documentName));
                                  return (
                                    <div key={categoryGroup.category}>
                                      <h4 className="text-sm font-medium mb-2">{categoryGroup.categoryLabel}</h4>
                                      <div className="space-y-2 pl-2">
                                        {categoryGroup.documents.map((doc) => {
                                          const isAdded = existingNames.has(doc.name);
                                          const isSelected = selectedStandardDocs.has(doc.name);
                                          return (
                                            <div key={doc.id} className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                id={`std-doc-${doc.id}`}
                                                checked={isSelected}
                                                disabled={isAdded}
                                                onChange={(e) => {
                                                  const newSelected = new Set(selectedStandardDocs);
                                                  if (e.target.checked) {
                                                    newSelected.add(doc.name);
                                                  } else {
                                                    newSelected.delete(doc.name);
                                                  }
                                                  setSelectedStandardDocs(newSelected);
                                                }}
                                                className="h-4 w-4 rounded"
                                              />
                                              <label
                                                htmlFor={`std-doc-${doc.id}`}
                                                className={`text-sm cursor-pointer flex items-center gap-2 ${isAdded ? 'text-muted-foreground line-through' : ''}`}
                                              >
                                                {doc.name}
                                                {isAdded && <Check className="h-3 w-3 text-green-600" />}
                                              </label>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                                <Button
                                  size="sm"
                                  className="w-full mt-2"
                                  onClick={() => {
                                    if (selectedStandardDocs.size > 0) {
                                      bulkCreateDocuments.mutate(Array.from(selectedStandardDocs));
                                    }
                                  }}
                                  disabled={bulkCreateDocuments.isPending || selectedStandardDocs.size === 0}
                                >
                                  {bulkCreateDocuments.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                                  Add Selected ({selectedStandardDocs.size})
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Document List */}
                          <DocumentList programId={program.id} onDelete={deleteDocument.mutate} onEdit={loadDocumentForEditing} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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
              {programs.map((program) => {
                const isCollapsed = collapsedTaskPrograms.has(program.id);
                return (
                  <Card key={program.id}>
                    <CardContent className="p-6">
                      <div
                        className="flex items-center justify-between cursor-pointer select-none"
                        onClick={() => {
                          setCollapsedTaskPrograms(prev => {
                            const next = new Set(prev);
                            if (next.has(program.id)) next.delete(program.id);
                            else next.add(program.id);
                            return next;
                          });
                        }}
                        data-testid={`toggle-task-section-${program.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                          <h3 className="font-semibold">{program.name}</h3>
                          <Badge variant="outline">{program.taskCount || 0} tasks</Badge>
                        </div>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProgram(program);
                            setShowAddTask(true);
                          }}
                          data-testid={`button-add-task-${program.id}`}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Task
                        </Button>
                      </div>
                      {!isCollapsed && (
                        <div className="mt-4">
                          <TaskList programId={program.id} onDelete={deleteTask.mutate} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Credit Policies Tab */}
        <TabsContent value="credit-policies" className="space-y-4">
          <CreditPoliciesTab />
        </TabsContent>
      </Tabs>

      {/* Edit Program Dialog */}
      <Dialog open={showEditProgram} onOpenChange={setShowEditProgram}>
        <DialogContent className="fixed inset-0 max-w-none w-screen h-screen rounded-none translate-x-0 translate-y-0 top-0 left-0 flex flex-col overflow-hidden p-0 border-none [&>button]:hidden" style={{ transform: 'none' }}>
          <div className="flex-shrink-0 z-50 flex items-center justify-between gap-3 px-6 py-3 border-b bg-background">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setShowEditProgram(false); setSelectedProgram(null); resetProgramForm(); }}
                data-testid="button-back-edit-program"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-lg font-semibold leading-tight">Edit Loan Program</h2>
                <p className="text-xs text-muted-foreground">Update the loan program settings</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowEditProgram(false); setSelectedProgram(null); resetProgramForm(); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => updateProgram.mutate({ ...programForm, id: selectedProgram!.id })}
                disabled={updateProgram.isPending || !programForm.name || (loadingDetails && !editDataInitialized)}
                data-testid="button-save-edit-program-top"
              >
                {updateProgram.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="w-1/2 overflow-y-auto p-6 md:p-8 border-r">
          <DialogHeader className="sr-only">
            <DialogTitle>Edit Loan Program</DialogTitle>
            <DialogDescription>Update settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              <div className="flex flex-wrap gap-2 mb-2">
                {loanTypeOptions.map((opt) => (
                  <Badge
                    key={opt.value}
                    variant={programForm.loanType === opt.value ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      setProgramForm({ ...programForm, loanType: opt.value });
                      setCustomLoanType("");
                    }}
                    data-testid={`badge-edit-loan-type-${opt.value}`}
                  >
                    {opt.label}
                  </Badge>
                ))}
                {isCustomLoanType && (
                  <Badge variant="default" data-testid="badge-edit-loan-type-custom">
                    {programForm.loanType}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Or type a custom loan type..."
                  value={customLoanType}
                  onChange={(e) => setCustomLoanType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customLoanType.trim()) {
                      e.preventDefault();
                      setProgramForm({ ...programForm, loanType: customLoanType.trim() });
                      setCustomLoanType("");
                    }
                  }}
                  data-testid="input-edit-custom-loan-type"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!customLoanType.trim()}
                  onClick={() => {
                    setProgramForm({ ...programForm, loanType: customLoanType.trim() });
                    setCustomLoanType("");
                  }}
                  data-testid="button-edit-add-custom-loan-type"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Units (optional)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1"
                  value={programForm.minUnits}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, minUnits: e.target.value })
                  }
                  data-testid="input-edit-min-units"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Units (optional)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 100"
                  value={programForm.maxUnits}
                  onChange={(e) =>
                    setProgramForm({ ...programForm, maxUnits: e.target.value })
                  }
                  data-testid="input-edit-max-units"
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
                {allPropertyTypeOptions.map((type) => (
                  <Badge
                    key={type.value}
                    variant={
                      programForm.eligiblePropertyTypes.includes(type.value)
                        ? "default"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => handlePropertyTypeToggle(type.value)}
                    data-testid={`badge-edit-property-${type.value}`}
                  >
                    {type.label}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Add custom property type..."
                  value={customPropertyType}
                  onChange={(e) => setCustomPropertyType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomPropertyType();
                    }
                  }}
                  data-testid="input-edit-custom-property-type"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!customPropertyType.trim()}
                  onClick={handleAddCustomPropertyType}
                  data-testid="button-edit-add-custom-property-type"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Credit Policy</Label>
              <Select
                value={programForm.creditPolicyId ? String(programForm.creditPolicyId) : "none"}
                onValueChange={(v) =>
                  setProgramForm({ ...programForm, creditPolicyId: v === "none" ? null : parseInt(v) })
                }
              >
                <SelectTrigger data-testid="select-edit-credit-policy">
                  <SelectValue placeholder="Select a credit policy..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {creditPolicies?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} ({p.ruleCount} rules)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Assign a credit policy to enable AI document review for this program.
              </p>
            </div>
          </div>
            </div>
            <div className="w-1/2 overflow-y-auto p-6 md:p-8">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Workflow className="h-4 w-4" />
                      Stages ({inlineSteps.length})
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addInlineStep}
                      data-testid="button-edit-add-inline-step"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Stage
                    </Button>
                  </div>
                  {inlineSteps.length === 0 ? (
                    <div className="text-center py-8">
                      <Workflow className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No stages added yet. Click "Add Stage" to add one.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-border" />
                      {inlineSteps.map((step, index) => {
                        const stageDocs = inlineDocuments.filter(d => d.stepIndex === index);
                        const stageTasks = inlineTasks.filter(t => t.stepIndex === index);
                        return (
                          <div key={step.id} className="relative pl-10 pb-4">
                            <div className="absolute left-2.5 top-4 w-3 h-3 rounded-full bg-primary border-2 border-background z-[1]" />
                            <Card className="p-3">
                              <div className="flex items-start gap-2">
                                <div className="flex-1 space-y-2">
                                  <Input
                                    placeholder="Stage name (e.g., Underwriting)"
                                    value={step.stepName}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const match = availableSteps?.find(
                                        (s) => s.name.toLowerCase() === val.trim().toLowerCase()
                                      );
                                      setInlineSteps((prev) =>
                                        prev.map((s) =>
                                          s.id === step.id
                                            ? { ...s, stepName: val, stepDefinitionId: match ? match.id : null }
                                            : s
                                        )
                                      );
                                    }}
                                    list={`edit-step-suggestions-${index}`}
                                    data-testid={`input-edit-step-name-${index}`}
                                  />
                                  {availableSteps && availableSteps.length > 0 && (
                                    <datalist id={`edit-step-suggestions-${index}`}>
                                      {availableSteps.map((s) => (
                                        <option key={s.id} value={s.name} />
                                      ))}
                                    </datalist>
                                  )}
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={step.isRequired}
                                        onCheckedChange={(v) =>
                                          updateInlineStep(step.id, "isRequired", v)
                                        }
                                        data-testid={`switch-edit-step-required-${index}`}
                                      />
                                      <Label className="text-sm">Required</Label>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setInlineDocuments(prev => [...prev, {
                                            id: crypto.randomUUID(),
                                            documentName: "",
                                            documentCategory: "borrower_docs",
                                            documentDescription: "",
                                            isRequired: true,
                                            stepIndex: index,
                                          }]);
                                        }}
                                        data-testid={`button-edit-add-stage-doc-${index}`}
                                      >
                                        <FileText className="h-3 w-3 mr-1" />
                                        Doc
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setInlineTasks(prev => [...prev, {
                                            id: crypto.randomUUID(),
                                            taskName: "",
                                            taskDescription: "",
                                            taskCategory: "other",
                                            priority: "medium",
                                            stepIndex: index,
                                          }]);
                                        }}
                                        data-testid={`button-edit-add-stage-task-${index}`}
                                      >
                                        <ListChecks className="h-3 w-3 mr-1" />
                                        Task
                                      </Button>
                                    </div>
                                  </div>
                                  {stageDocs.map((doc) => (
                                    <div key={doc.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 bg-muted/30">
                                      <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <Input
                                        className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                        placeholder="Document name"
                                        value={doc.documentName}
                                        onChange={(e) => updateInlineDocument(doc.id, "documentName", e.target.value)}
                                        data-testid={`input-edit-stage-doc-name-${index}-${doc.id}`}
                                      />
                                      {doc.isRequired && <Badge variant="secondary" className="text-xs flex-shrink-0">Req</Badge>}
                                      <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineDocument(doc.id)} data-testid={`button-edit-remove-stage-doc-${doc.id}`}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                  {stageTasks.map((task) => (
                                    <div key={task.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 bg-muted/30">
                                      <ListChecks className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <Input
                                        className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                        placeholder="Task name"
                                        value={task.taskName}
                                        onChange={(e) => updateInlineTask(task.id, "taskName", e.target.value)}
                                        data-testid={`input-edit-stage-task-name-${index}-${task.id}`}
                                      />
                                      <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineTask(task.id)} data-testid={`button-edit-remove-stage-task-${task.id}`}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeInlineStep(step.id)}
                                  data-testid={`button-edit-remove-step-${index}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(() => {
                    const unassignedDocs = inlineDocuments.filter(d => d.stepIndex === null);
                    const unassignedTasks = inlineTasks.filter(t => t.stepIndex === null);
                    return (unassignedDocs.length > 0 || unassignedTasks.length > 0 || inlineSteps.length > 0) ? (
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Label className="text-sm font-medium text-muted-foreground">Unassigned Items</Label>
                          <div className="flex items-center gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={addInlineDocument} data-testid="button-edit-add-unassigned-document">
                              <FileText className="h-3 w-3 mr-1" />
                              Doc
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={addInlineTask} data-testid="button-edit-add-unassigned-task">
                              <ListChecks className="h-3 w-3 mr-1" />
                              Task
                            </Button>
                          </div>
                        </div>
                        {unassignedDocs.length === 0 && unassignedTasks.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2" data-testid="text-edit-no-unassigned">No unassigned documents or tasks</p>
                        ) : (
                          <div className="space-y-2">
                            {unassignedDocs.map((doc) => (
                              <div key={doc.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5">
                                <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <Input
                                  className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                  placeholder="Document name"
                                  value={doc.documentName}
                                  onChange={(e) => updateInlineDocument(doc.id, "documentName", e.target.value)}
                                  data-testid={`input-edit-unassigned-doc-${doc.id}`}
                                />
                                {inlineSteps.length > 0 && (
                                  <Select
                                    value="none"
                                    onValueChange={(v) => updateInlineDocument(doc.id, "stepIndex", v === "none" ? null : parseInt(v))}
                                  >
                                    <SelectTrigger className="w-[120px] text-xs" data-testid={`select-edit-assign-doc-${doc.id}`}>
                                      <SelectValue placeholder="Assign..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No stage</SelectItem>
                                      {inlineSteps.map((s, si) => {
                                        const name = s.stepName || (availableSteps?.find(av => av.id === s.stepDefinitionId)?.name) || `Stage ${si + 1}`;
                                        return name.trim() ? <SelectItem key={s.id} value={String(si)}>{name}</SelectItem> : null;
                                      })}
                                    </SelectContent>
                                  </Select>
                                )}
                                <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineDocument(doc.id)} data-testid={`button-edit-remove-unassigned-doc-${doc.id}`}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                            {unassignedTasks.map((task) => (
                              <div key={task.id} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5">
                                <ListChecks className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <Input
                                  className="text-sm border-0 bg-transparent focus-visible:ring-0"
                                  placeholder="Task name"
                                  value={task.taskName}
                                  onChange={(e) => updateInlineTask(task.id, "taskName", e.target.value)}
                                  data-testid={`input-edit-unassigned-task-${task.id}`}
                                />
                                {inlineSteps.length > 0 && (
                                  <Select
                                    value="none"
                                    onValueChange={(v) => updateInlineTask(task.id, "stepIndex", v === "none" ? null : parseInt(v))}
                                  >
                                    <SelectTrigger className="w-[120px] text-xs" data-testid={`select-edit-assign-task-${task.id}`}>
                                      <SelectValue placeholder="Assign..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No stage</SelectItem>
                                      {inlineSteps.map((s, si) => {
                                        const name = s.stepName || (availableSteps?.find(av => av.id === s.stepDefinitionId)?.name) || `Stage ${si + 1}`;
                                        return name.trim() ? <SelectItem key={s.id} value={String(si)}>{name}</SelectItem> : null;
                                      })}
                                    </SelectContent>
                                  </Select>
                                )}
                                <Button type="button" variant="ghost" size="sm" className="flex-shrink-0" onClick={() => removeInlineTask(task.id)} data-testid={`button-edit-remove-unassigned-task-${task.id}`}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={showAddDocument} onOpenChange={(open) => {
        setShowAddDocument(open);
        if (!open) {
          resetDocumentForm();
          setEditingDocument(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDocument ? "Edit Document Template" : "Add Document Template"}</DialogTitle>
            <DialogDescription>
              {editingDocument ? "Update the document template" : "Add a required document"} for {selectedProgram?.name}
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
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={documentForm.visibility}
                onValueChange={(v) => setDocumentForm({ ...documentForm, visibility: v })}
              >
                <SelectTrigger data-testid="select-doc-visibility-standalone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibilityOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select
                value={documentForm.assignedTo}
                onValueChange={(v) => setDocumentForm({ ...documentForm, assignedTo: v })}
              >
                <SelectTrigger data-testid="select-doc-assigned-standalone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignedToOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign to Stage</Label>
              <Select
                value={
                  programDetails?.workflowSteps?.length
                    ? (documentForm.stepId ? String(documentForm.stepId) : "none")
                    : (documentForm.stepDefinitionId ? `def:${documentForm.stepDefinitionId}` : "none")
                }
                onValueChange={(v) => {
                  if (v === "none") {
                    setDocumentForm({ ...documentForm, stepId: null, stepDefinitionId: null });
                  } else if (v.startsWith("def:")) {
                    setDocumentForm({ ...documentForm, stepId: null, stepDefinitionId: parseInt(v.replace("def:", "")) });
                  } else {
                    setDocumentForm({ ...documentForm, stepId: parseInt(v), stepDefinitionId: null });
                  }
                }}
              >
                <SelectTrigger data-testid="select-doc-step">
                  <SelectValue placeholder="No stage assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No stage assigned</SelectItem>
                  {programDetails?.workflowSteps?.length
                    ? programDetails.workflowSteps.map((step) => (
                        <SelectItem key={step.id} value={String(step.id)}>
                          {step.definition.name}
                        </SelectItem>
                      ))
                    : availableSteps?.map((def) => (
                        <SelectItem key={def.id} value={`def:${def.id}`}>
                          {def.name}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDocument(false);
                resetDocumentForm();
                setEditingDocument(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingDocument) {
                  updateDocument.mutate(documentForm);
                } else {
                  createDocument.mutate(documentForm);
                }
              }}
              disabled={(editingDocument ? updateDocument.isPending : createDocument.isPending) || !documentForm.documentName}
              data-testid="button-save-document"
            >
              {(editingDocument ? updateDocument.isPending : createDocument.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingDocument ? "Save Changes" : "Add Document"}
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
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={taskForm.visibility}
                onValueChange={(v) => setTaskForm({ ...taskForm, visibility: v })}
              >
                <SelectTrigger data-testid="select-task-visibility-standalone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibilityOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select
                value={taskForm.assignedTo}
                onValueChange={(v) => setTaskForm({ ...taskForm, assignedTo: v })}
              >
                <SelectTrigger data-testid="select-task-assigned-standalone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignedToOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign to Stage</Label>
              <Select
                value={
                  programDetails?.workflowSteps?.length
                    ? (taskForm.stepId ? String(taskForm.stepId) : "none")
                    : (taskForm.stepDefinitionId ? `def:${taskForm.stepDefinitionId}` : "none")
                }
                onValueChange={(v) => {
                  if (v === "none") {
                    setTaskForm({ ...taskForm, stepId: null, stepDefinitionId: null });
                  } else if (v.startsWith("def:")) {
                    setTaskForm({ ...taskForm, stepId: null, stepDefinitionId: parseInt(v.replace("def:", "")) });
                  } else {
                    setTaskForm({ ...taskForm, stepId: parseInt(v), stepDefinitionId: null });
                  }
                }}
              >
                <SelectTrigger data-testid="select-task-step">
                  <SelectValue placeholder="No stage assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No stage assigned</SelectItem>
                  {programDetails?.workflowSteps?.length
                    ? programDetails.workflowSteps.map((step) => (
                        <SelectItem key={step.id} value={String(step.id)}>
                          {step.definition.name}
                        </SelectItem>
                      ))
                    : availableSteps?.map((def) => (
                        <SelectItem key={def.id} value={`def:${def.id}`}>
                          {def.name}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
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
interface ReviewRule {
  id?: number;
  ruleTitle: string;
  ruleDescription: string;
  ruleType: string;
  severity: string;
  isActive: boolean;
}

const ruleTypeOptions = [
  { value: "presence", label: "Presence Check" },
  { value: "numeric_threshold", label: "Numeric Threshold" },
  { value: "format", label: "Format / Structure" },
  { value: "consistency", label: "Cross-Reference / Consistency" },
  { value: "red_flag", label: "Red Flag Detection" },
  { value: "signature_date", label: "Signature / Date Check" },
  { value: "general", label: "General" },
];

const severityOptions = [
  { value: "fail", label: "Fail", icon: AlertTriangle, color: "text-destructive" },
  { value: "warn", label: "Warning", icon: AlertTriangle, color: "text-warning" },
  { value: "info", label: "Info", icon: Info, color: "text-info" },
];

function DocumentRulesEditor({ templateId, programId, documentName }: { templateId: number; programId: number; documentName: string }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [pendingAiRule, setPendingAiRule] = useState<{ rule: ReviewRule; transcript: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processVoiceRecording(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast({ title: "Microphone access denied. Please allow microphone access and try again.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processVoiceRecording = async (audioBlob: Blob) => {
    setIsProcessingVoice(true);
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const res = await apiRequest('POST', `/api/admin/document-templates/${templateId}/generate-rule-from-voice`, {
        audio: base64,
        documentName,
      });
      const data = await res.json();

      setPendingAiRule({
        transcript: data.transcript,
        rule: {
          ruleTitle: data.rule.ruleTitle,
          ruleDescription: data.rule.ruleDescription,
          ruleType: data.rule.ruleType,
          severity: data.rule.severity,
          isActive: true,
        },
      });
    } catch (err) {
      toast({ title: "Failed to generate rule from voice. Please try again.", variant: "destructive" });
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const acceptAiRule = () => {
    if (pendingAiRule) {
      setRules([...rules, pendingAiRule.rule]);
      setHasChanges(true);
      setPendingAiRule(null);
    }
  };

  const discardAiRule = () => {
    setPendingAiRule(null);
  };

  const { data: rulesData, isLoading } = useQuery<{ rules: any[] }>({
    queryKey: [`/api/admin/document-templates/${templateId}/review-rules`],
  });

  useEffect(() => {
    if (rulesData?.rules) {
      setRules(rulesData.rules.map((r: any) => ({
        id: r.id,
        ruleTitle: r.ruleTitle || '',
        ruleDescription: r.ruleDescription || '',
        ruleType: r.ruleType || 'general',
        severity: r.severity || 'fail',
        isActive: r.isActive !== false,
      })));
      setHasChanges(false);
    }
  }, [rulesData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/admin/document-templates/${templateId}/review-rules`, {
        programId,
        rules: rules.filter(r => r.ruleTitle.trim()).map((r, idx) => ({
          ruleTitle: r.ruleTitle.trim(),
          ruleDescription: r.ruleDescription.trim(),
          ruleType: r.ruleType,
          severity: r.severity,
          documentType: documentName,
          isActive: r.isActive,
          sortOrder: idx,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Rules saved' });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/document-templates', templateId, 'review-rules'] });
    },
    onError: () => {
      toast({ title: 'Failed to save rules', variant: 'destructive' });
    },
  });

  const addRule = () => {
    setRules([...rules, { ruleTitle: '', ruleDescription: '', ruleType: 'general', severity: 'fail', isActive: true }]);
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

  const moveRule = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rules.length) return;
    const updated = [...rules];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setRules(updated);
    setHasChanges(true);
  };

  if (isLoading) return <Skeleton className="h-8 w-full" />;

  return (
    <div className="space-y-3">
      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          No review rules configured. Add rules to enable AI document review for this document type.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={idx} className="border rounded-md p-3 space-y-2 bg-muted/20" data-testid={`rule-row-${templateId}-${idx}`}>
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-0.5 mt-1">
                  <button onClick={() => moveRule(idx, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-rule-up-${idx}`}>
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => moveRule(idx, 'down')} disabled={idx === rules.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" data-testid={`button-rule-down-${idx}`}>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder="Rule title (e.g., Verify borrower name matches across all pages)"
                    value={rule.ruleTitle}
                    onChange={(e) => updateRule(idx, 'ruleTitle', e.target.value)}
                    className="text-sm"
                    data-testid={`input-rule-title-${idx}`}
                  />
                  <Textarea
                    placeholder="Detailed instructions for the AI reviewer..."
                    value={rule.ruleDescription}
                    onChange={(e) => updateRule(idx, 'ruleDescription', e.target.value)}
                    className="text-sm min-h-[60px]"
                    data-testid={`input-rule-description-${idx}`}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={rule.ruleType} onValueChange={(v) => updateRule(idx, 'ruleType', v)}>
                      <SelectTrigger className="w-[180px] text-xs h-8" data-testid={`select-rule-type-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ruleTypeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={rule.severity} onValueChange={(v) => updateRule(idx, 'severity', v)}>
                      <SelectTrigger className="w-[130px] text-xs h-8" data-testid={`select-rule-severity-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {severityOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className={opt.color}>{opt.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeRule(idx)} className="text-destructive flex-shrink-0" data-testid={`button-remove-rule-${idx}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {pendingAiRule && (
        <div className="border-2 border-primary/30 rounded-md p-4 space-y-3 bg-primary/5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-Generated Rule
          </div>
          <p className="text-xs text-muted-foreground italic">
            You said: &ldquo;{pendingAiRule.transcript}&rdquo;
          </p>
          <div className="space-y-2">
            <Input
              value={pendingAiRule.rule.ruleTitle}
              onChange={(e) => setPendingAiRule({ ...pendingAiRule, rule: { ...pendingAiRule.rule, ruleTitle: e.target.value } })}
              className="text-sm"
              data-testid={`input-ai-rule-title-${templateId}`}
            />
            <Textarea
              value={pendingAiRule.rule.ruleDescription}
              onChange={(e) => setPendingAiRule({ ...pendingAiRule, rule: { ...pendingAiRule.rule, ruleDescription: e.target.value } })}
              className="text-sm min-h-[60px]"
              data-testid={`input-ai-rule-description-${templateId}`}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={pendingAiRule.rule.ruleType} onValueChange={(v) => setPendingAiRule({ ...pendingAiRule, rule: { ...pendingAiRule.rule, ruleType: v } })}>
                <SelectTrigger className="w-[180px] text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ruleTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={pendingAiRule.rule.severity} onValueChange={(v) => setPendingAiRule({ ...pendingAiRule, rule: { ...pendingAiRule.rule, severity: v } })}>
                <SelectTrigger className="w-[120px] text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {severityOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={acceptAiRule} data-testid={`button-accept-ai-rule-${templateId}`}>
              <Check className="h-3 w-3 mr-1" />
              Accept Rule
            </Button>
            <Button size="sm" variant="outline" onClick={discardAiRule} data-testid={`button-discard-ai-rule-${templateId}`}>
              <X className="h-3 w-3 mr-1" />
              Discard
            </Button>
          </div>
        </div>
      )}

      {isProcessingVoice && (
        <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Transcribing and generating rule...</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={addRule} data-testid={`button-add-rule-${templateId}`}>
            <Plus className="h-3 w-3 mr-1" />
            Add Rule
          </Button>
          <Button
            size="sm"
            variant={isRecording ? "destructive" : "outline"}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessingVoice}
            data-testid={`button-voice-rule-${templateId}`}
          >
            {isRecording ? (
              <>
                <MicOff className="h-3 w-3 mr-1" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="h-3 w-3 mr-1" />
                Speak to AI
              </>
            )}
          </Button>
          {isRecording && (
            <span className="text-xs text-destructive animate-pulse">Recording... Describe your rule, then click Stop</span>
          )}
        </div>
        {hasChanges && (
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid={`button-save-rules-${templateId}`}>
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
            Save Rules
          </Button>
        )}
      </div>
    </div>
  );
}

function DocumentList({
  programId,
  onDelete,
  onEdit,
}: {
  programId: number;
  onDelete: (id: number) => void;
  onEdit: (doc: ProgramDocument) => void;
}) {
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{
    program: LoanProgram;
    documents: ProgramDocument[];
    tasks: ProgramTask[];
    workflowSteps: { id: number; programId: number; stepDefinitionId: number; stepOrder: number; isRequired: boolean; estimatedDays: number | null; createdAt: string; definition: { id: number; name: string; key: string; description: string | null; color: string | null; icon: string | null } }[];
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
        <div key={doc.id} className="space-y-0">
          <div
            className={`flex items-center justify-between p-3 rounded-md border ${expandedDocId === doc.id ? 'rounded-b-none border-b-0' : ''}`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-sm">{doc.documentName}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                  {documentCategories.find((c) => c.value === doc.documentCategory)
                    ?.label || doc.documentCategory}
                  {doc.isRequired && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      Required
                    </Badge>
                  )}
                  {doc.stepId && data?.workflowSteps && (() => {
                    const step = data.workflowSteps.find(s => s.id === doc.stepId);
                    return step ? (
                      <Badge variant="outline" className="ml-1 text-xs">
                        {step.definition.name}
                      </Badge>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant={expandedDocId === doc.id ? "default" : "outline"}
                size="sm"
                onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}
                data-testid={`button-rules-${doc.id}`}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                AI Rules
              </Button>
              {doc.templateUrl ? (
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 gap-1 text-green-600 border-green-200"
                    onClick={() => window.open(doc.templateUrl!, '_blank')}
                    title={`Download: ${doc.templateFileName}`}
                  >
                    <Download className="h-3 w-3" />
                    Template
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.pdf,.doc,.docx';
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('file', file);
                        try {
                          await fetch(`/api/admin/programs/${programId}/documents/${doc.id}/template`, {
                            method: 'POST',
                            body: formData,
                          });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
                        } catch (err) {
                          console.error('Template upload failed:', err);
                        }
                      };
                      input.click();
                    }}
                    title="Replace template"
                  >
                    <FileUp className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf,.doc,.docx';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      const formData = new FormData();
                      formData.append('file', file);
                      try {
                        await fetch(`/api/admin/programs/${programId}/documents/${doc.id}/template`, {
                          method: 'POST',
                          body: formData,
                        });
                        queryClient.invalidateQueries({ queryKey: ["/api/admin/programs", programId] });
                      } catch (err) {
                        console.error('Template upload failed:', err);
                      }
                    };
                    input.click();
                  }}
                  title="Upload a template file for borrowers to download"
                >
                  <Upload className="h-3 w-3" />
                  Template
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(doc)}
                data-testid={`button-edit-doc-${doc.id}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => onDelete(doc.id)}
                data-testid={`button-delete-doc-${doc.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {expandedDocId === doc.id && (
            <div className="border border-t-0 rounded-b-md p-4 bg-muted/10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">AI Review Rules for "{doc.documentName}"</span>
              </div>
              <DocumentRulesEditor templateId={doc.id} programId={programId} documentName={doc.documentName} />
            </div>
          )}
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
    workflowSteps: { id: number; programId: number; stepDefinitionId: number; stepOrder: number; isRequired: boolean; estimatedDays: number | null; createdAt: string; definition: { id: number; name: string; key: string; description: string | null; color: string | null; icon: string | null } }[];
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
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                {taskCategories.find((c) => c.value === task.taskCategory)?.label ||
                  task.taskCategory}
                <Badge variant={getPriorityVariant(task.priority) as any}>
                  {task.priority}
                </Badge>
                {task.stepId && data?.workflowSteps && (() => {
                  const step = data.workflowSteps.find(s => s.id === task.stepId);
                  return step ? (
                    <Badge variant="outline" className="text-xs">
                      {step.definition.name}
                    </Badge>
                  ) : null;
                })()}
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

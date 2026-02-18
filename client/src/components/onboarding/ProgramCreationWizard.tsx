import type { DragEvent, ChangeEvent } from 'react';
import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Layers,
  Plus,
  Trash2,
  FileText,
  ListChecks,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Info,
  ShieldCheck,
  Sparkles,
  GripVertical,
  Link2,
  X,
  Upload,
  Brain,
  Eye,
  ClipboardCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────

const loanTypeOptions = [
  { value: 'dscr', label: 'DSCR (Rental)' },
  { value: 'rtl', label: 'RTL (Fix & Flip)' },
];

const propertyTypeOptions = [
  { value: 'single-family-residence', label: 'Single Family Residence' },
  { value: '2-4-unit', label: '2-4 Unit' },
  { value: 'multifamily-5-plus', label: 'Multifamily (5+ Units)' },
  { value: 'rental-portfolio', label: 'Rental Portfolio' },
  { value: 'mixed-use', label: 'Mixed-Use' },
  { value: 'infill-lot', label: 'Infill Lot' },
  { value: 'land', label: 'Land' },
  { value: 'office', label: 'Office' },
  { value: 'retail', label: 'Retail' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'medical', label: 'Medical' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'special-purpose', label: 'Special Purpose' },
];

const documentCategories = [
  { value: 'borrower_docs', label: 'Borrower Documents' },
  { value: 'entity_docs', label: 'Entity Documents' },
  { value: 'property_docs', label: 'Property Documents' },
  { value: 'financial_docs', label: 'Financial Documents' },
  { value: 'closing_docs', label: 'Closing Documents' },
  { value: 'other', label: 'Other' },
];

const taskCategories = [
  { value: 'application_review', label: 'Application Review' },
  { value: 'credit_check', label: 'Credit Check' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'title_search', label: 'Title Search' },
  { value: 'underwriting', label: 'Underwriting' },
  { value: 'closing', label: 'Closing' },
  { value: 'other', label: 'Other' },
];

const standardDocuments = [
  {
    category: 'borrower_docs',
    categoryLabel: 'Borrower Docs',
    documents: [
      { id: 'gov_id', name: 'Government-Issued Photo ID' },
      { id: 'ssn_card', name: 'Social Security Card' },
      { id: 'auth_release', name: 'Authorization to Release Information' },
    ],
  },
  {
    category: 'financial_docs',
    categoryLabel: 'Financial Docs',
    documents: [
      { id: 'personal_bank_stmt', name: '2 Months Personal Bank Statements' },
      { id: 'business_bank_stmt', name: '2 Months Business Bank Statements' },
      { id: 'pfs', name: 'Personal Financial Statement (PFS)' },
      { id: 'tax_returns', name: 'Most Recent Tax Returns (2 Years)' },
      { id: 'w2_1099', name: 'W-2s / 1099s (2 Years)' },
      { id: 'pl_statement', name: 'Profit & Loss Statement (YTD)' },
    ],
  },
  {
    category: 'entity_docs',
    categoryLabel: 'Entity Docs',
    documents: [
      { id: 'articles_org', name: 'Articles of Organization / Incorporation' },
      { id: 'operating_agreement', name: 'Operating Agreement' },
      { id: 'good_standing', name: 'Certificate of Good Standing' },
      { id: 'ein_letter', name: 'EIN Letter (IRS)' },
    ],
  },
  {
    category: 'property_docs',
    categoryLabel: 'Property Docs',
    documents: [
      { id: 'purchase_contract', name: 'Purchase Contract / LOI' },
      { id: 'property_photos', name: 'Property Photos' },
      { id: 'sreo', name: 'Schedule of Real Estate Owned (SREO)' },
      { id: 'rent_roll', name: 'Rent Roll (if applicable)' },
      { id: 'insurance_binder', name: 'Insurance Binder / Dec Page' },
      { id: 'appraisal', name: 'Appraisal (if applicable)' },
      { id: 'title_commitment', name: 'Title Commitment / Preliminary Title Report' },
    ],
  },
  {
    category: 'closing_docs',
    categoryLabel: 'Closing Docs',
    documents: [
      { id: 'hud1_cd', name: 'HUD-1 / Closing Disclosure (if refinance)' },
      { id: 'payoff_stmt', name: 'Payoff Statement (if refinance)' },
    ],
  },
];

const DSCR_QUOTE_FIELDS = [
  { fieldKey: 'loanAmount', label: 'Loan Amount', defaultRequired: true },
  { fieldKey: 'propertyValue', label: 'Property Value', defaultRequired: true },
  { fieldKey: 'loanPurpose', label: 'Loan Purpose', defaultRequired: true },
  { fieldKey: 'loanType', label: 'Loan Type (Fixed/ARM)', defaultRequired: true },
  { fieldKey: 'propertyType', label: 'Property Type', defaultRequired: true },
  { fieldKey: 'ficoScore', label: 'FICO Score', defaultRequired: true },
  { fieldKey: 'grossMonthlyRent', label: 'Gross Monthly Rent', defaultRequired: false },
  { fieldKey: 'annualTaxes', label: 'Annual Taxes', defaultRequired: false },
  { fieldKey: 'annualInsurance', label: 'Annual Insurance', defaultRequired: false },
  { fieldKey: 'interestOnly', label: 'Interest Only', defaultRequired: false },
  { fieldKey: 'prepaymentPenalty', label: 'Prepayment Penalty', defaultRequired: false },
  { fieldKey: 'appraisalValue', label: 'Appraisal Value', defaultRequired: false },
];

const RTL_QUOTE_FIELDS = [
  { fieldKey: 'loanType', label: 'Loan Type (Light/Heavy Rehab)', defaultRequired: true },
  { fieldKey: 'purpose', label: 'Purpose (Purchase/Refi)', defaultRequired: true },
  { fieldKey: 'asIsValue', label: 'As-Is Value', defaultRequired: true },
  { fieldKey: 'arv', label: 'After Repair Value (ARV)', defaultRequired: true },
  { fieldKey: 'rehabBudget', label: 'Rehab Budget', defaultRequired: true },
  { fieldKey: 'propertyType', label: 'Property Type', defaultRequired: true },
  { fieldKey: 'ficoScore', label: 'FICO Score', defaultRequired: true },
  { fieldKey: 'propertyUnits', label: 'Property Units', defaultRequired: false },
  { fieldKey: 'isMidstream', label: 'Is Midstream?', defaultRequired: false },
  { fieldKey: 'borrowingEntityType', label: 'Borrowing Entity Type', defaultRequired: false },
  { fieldKey: 'completedProjects', label: 'Completed Projects', defaultRequired: false },
  { fieldKey: 'hasFullGuaranty', label: 'Full Guaranty?', defaultRequired: false },
  { fieldKey: 'exitStrategy', label: 'Exit Strategy', defaultRequired: false },
  { fieldKey: 'appraisalValue', label: 'Appraisal Value', defaultRequired: false },
];

function getDefaultQuoteFields(loanType: string) {
  const baseFields = loanType.toLowerCase() === 'dscr' ? DSCR_QUOTE_FIELDS : RTL_QUOTE_FIELDS;
  return baseFields.map((field) => ({
    fieldKey: field.fieldKey,
    label: field.label,
    required: field.defaultRequired,
    visible: true,
  }));
}

// ─── Default stages ────────────────────────────────────────────

const defaultStages = [
  { stepName: 'Application', estimatedDays: 3, isRequired: true },
  { stepName: 'Processing', estimatedDays: 5, isRequired: true },
  { stepName: 'Underwriting', estimatedDays: 7, isRequired: true },
  { stepName: 'Closing', estimatedDays: 5, isRequired: true },
];

// ─── Types ──────────────────────────────────────────────────────

interface StageEntry {
  stepName: string;
  estimatedDays: number;
  isRequired: boolean;
}

interface DocEntry {
  documentName: string;
  documentCategory: string;
  isRequired: boolean;
  stepIndex: number | null;
}

interface TaskEntry {
  taskName: string;
  taskCategory: string;
  priority: string;
  assignToRole: string;
  stepIndex: number | null;
}

interface RuleEntry {
  ruleTitle: string;
  documentType: string;
  severity: string;
  stepIndex: number | null;
}

// ─── Wizard Steps ───────────────────────────────────────────────

type WizardStep = 'credit-policy' | 'program-details' | 'stages' | 'documents' | 'tasks' | 'review-rules' | 'summary';

const wizardSteps: { key: WizardStep; label: string; number: number }[] = [
  { key: 'credit-policy', label: 'Credit Policy', number: 1 },
  { key: 'program-details', label: 'Program Details', number: 2 },
  { key: 'stages', label: 'Stages', number: 3 },
  { key: 'documents', label: 'Documents', number: 4 },
  { key: 'tasks', label: 'Tasks', number: 5 },
  { key: 'review-rules', label: 'AI Rules', number: 6 },
  { key: 'summary', label: 'Review & Create', number: 7 },
];

// ─── DSCR Example Defaults ───────────────────────────────────────

const dscrDefaultStages: StageEntry[] = [
  { stepName: 'Application', estimatedDays: 3, isRequired: true },
  { stepName: 'Processing', estimatedDays: 5, isRequired: true },
  { stepName: 'Underwriting', estimatedDays: 7, isRequired: true },
  { stepName: 'Appraisal & Title', estimatedDays: 10, isRequired: true },
  { stepName: 'Closing', estimatedDays: 5, isRequired: true },
];

const dscrDefaultDocuments: DocEntry[] = [
  // Application stage docs
  { documentName: 'Government-Issued Photo ID', documentCategory: 'borrower_docs', isRequired: true, stepIndex: 0 },
  { documentName: 'Authorization to Release Information', documentCategory: 'borrower_docs', isRequired: true, stepIndex: 0 },
  { documentName: 'Purchase Contract / LOI', documentCategory: 'property_docs', isRequired: true, stepIndex: 0 },
  // Processing stage docs
  { documentName: '2 Months Personal Bank Statements', documentCategory: 'financial_docs', isRequired: true, stepIndex: 1 },
  { documentName: '2 Months Business Bank Statements', documentCategory: 'financial_docs', isRequired: true, stepIndex: 1 },
  { documentName: 'Most Recent Tax Returns (2 Years)', documentCategory: 'financial_docs', isRequired: true, stepIndex: 1 },
  { documentName: 'Personal Financial Statement (PFS)', documentCategory: 'financial_docs', isRequired: true, stepIndex: 1 },
  { documentName: 'Articles of Organization / Incorporation', documentCategory: 'entity_docs', isRequired: true, stepIndex: 1 },
  { documentName: 'Operating Agreement', documentCategory: 'entity_docs', isRequired: true, stepIndex: 1 },
  { documentName: 'EIN Letter (IRS)', documentCategory: 'entity_docs', isRequired: true, stepIndex: 1 },
  // Underwriting stage docs
  { documentName: 'Rent Roll', documentCategory: 'property_docs', isRequired: true, stepIndex: 2 },
  { documentName: 'Schedule of Real Estate Owned (SREO)', documentCategory: 'property_docs', isRequired: true, stepIndex: 2 },
  { documentName: 'Property Photos', documentCategory: 'property_docs', isRequired: true, stepIndex: 2 },
  // Appraisal & Title stage docs
  { documentName: 'Appraisal (if applicable)', documentCategory: 'property_docs', isRequired: true, stepIndex: 3 },
  { documentName: 'Title Commitment / Preliminary Title Report', documentCategory: 'property_docs', isRequired: true, stepIndex: 3 },
  { documentName: 'Insurance Binder / Dec Page', documentCategory: 'property_docs', isRequired: true, stepIndex: 3 },
  // Closing stage docs
  { documentName: 'HUD-1 / Closing Disclosure (if refinance)', documentCategory: 'closing_docs', isRequired: false, stepIndex: 4 },
  { documentName: 'Payoff Statement (if refinance)', documentCategory: 'closing_docs', isRequired: false, stepIndex: 4 },
];

const dscrDefaultTasks: TaskEntry[] = [
  // Application
  { taskName: 'Review loan application for completeness', taskCategory: 'application_review', priority: 'high', assignToRole: 'processor', stepIndex: 0 },
  { taskName: 'Verify borrower identity', taskCategory: 'application_review', priority: 'high', assignToRole: 'processor', stepIndex: 0 },
  { taskName: 'Pull credit report', taskCategory: 'credit_check', priority: 'high', assignToRole: 'processor', stepIndex: 0 },
  // Processing
  { taskName: 'Verify income and bank statements', taskCategory: 'application_review', priority: 'high', assignToRole: 'processor', stepIndex: 1 },
  { taskName: 'Validate entity documentation', taskCategory: 'application_review', priority: 'medium', assignToRole: 'processor', stepIndex: 1 },
  { taskName: 'Calculate DSCR ratio', taskCategory: 'underwriting', priority: 'high', assignToRole: 'admin', stepIndex: 1 },
  // Underwriting
  { taskName: 'Underwrite deal against credit policy', taskCategory: 'underwriting', priority: 'critical', assignToRole: 'admin', stepIndex: 2 },
  { taskName: 'Review rent roll and property cash flow', taskCategory: 'underwriting', priority: 'high', assignToRole: 'admin', stepIndex: 2 },
  { taskName: 'Verify SREO and existing liabilities', taskCategory: 'underwriting', priority: 'medium', assignToRole: 'admin', stepIndex: 2 },
  // Appraisal & Title
  { taskName: 'Order appraisal', taskCategory: 'appraisal', priority: 'high', assignToRole: 'processor', stepIndex: 3 },
  { taskName: 'Review appraisal report', taskCategory: 'appraisal', priority: 'high', assignToRole: 'admin', stepIndex: 3 },
  { taskName: 'Order title search', taskCategory: 'title_search', priority: 'high', assignToRole: 'processor', stepIndex: 3 },
  { taskName: 'Review title commitment', taskCategory: 'title_search', priority: 'high', assignToRole: 'admin', stepIndex: 3 },
  // Closing
  { taskName: 'Prepare closing documents', taskCategory: 'closing', priority: 'critical', assignToRole: 'admin', stepIndex: 4 },
  { taskName: 'Schedule closing', taskCategory: 'closing', priority: 'high', assignToRole: 'processor', stepIndex: 4 },
  { taskName: 'Fund loan', taskCategory: 'closing', priority: 'critical', assignToRole: 'admin', stepIndex: 4 },
];

const dscrDefaultRules: RuleEntry[] = [
  { ruleTitle: 'Verify borrower name matches across all submitted documents', documentType: 'General', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Check that government ID is not expired', documentType: 'Government-Issued Photo ID', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Verify bank statements are from the most recent 2 months', documentType: '2 Months Personal Bank Statements', severity: 'warning', stepIndex: null },
  { ruleTitle: 'Confirm DSCR ratio meets minimum threshold of 1.0', documentType: 'Rent Roll', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Check that appraisal is dated within 120 days', documentType: 'Appraisal (if applicable)', severity: 'warning', stepIndex: null },
  { ruleTitle: 'Verify property insurance coverage meets loan amount', documentType: 'Insurance Binder / Dec Page', severity: 'warning', stepIndex: null },
  { ruleTitle: 'Confirm entity is in good standing in its state of formation', documentType: 'Certificate of Good Standing', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Flag if LTV exceeds 80%', documentType: 'General', severity: 'fail', stepIndex: null },
];

// ─── Main Component ─────────────────────────────────────────────

export function ProgramCreationWizard({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [wizardStep, setWizardStep] = useState<WizardStep>('credit-policy');

  // Credit policy
  const [selectedCreditPolicyId, setSelectedCreditPolicyId] = useState<number | null>(null);

  // Program basics — empty with placeholder examples
  const [programName, setProgramName] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [loanType, setLoanType] = useState('dscr');
  const [minLoanAmount, setMinLoanAmount] = useState('');
  const [maxLoanAmount, setMaxLoanAmount] = useState('');
  const [minLtv, setMinLtv] = useState('');
  const [maxLtv, setMaxLtv] = useState('');
  const [minInterestRate, setMinInterestRate] = useState('');
  const [maxInterestRate, setMaxInterestRate] = useState('');
  const [termOptions, setTermOptions] = useState('');
  const [eligiblePropertyTypes, setEligiblePropertyTypes] = useState<string[]>([
    'single-family-residence', '2-4-unit', 'multifamily-5-plus', 'rental-portfolio', 'mixed-use',
  ]);
  const [quoteFormFields, setQuoteFormFields] = useState(getDefaultQuoteFields('dscr'));

  // Stages — pre-populated
  const [stages, setStages] = useState<StageEntry[]>([...dscrDefaultStages]);

  // Documents — pre-populated
  const [documents, setDocuments] = useState<DocEntry[]>([...dscrDefaultDocuments]);

  // Tasks — pre-populated
  const [tasks, setTasks] = useState<TaskEntry[]>([...dscrDefaultTasks]);

  // Review rules — pre-populated
  const [reviewRules, setReviewRules] = useState<RuleEntry[]>([...dscrDefaultRules]);

  // Fetch credit policies
  const { data: creditPoliciesData } = useQuery<{ policies: any[] }>({
    queryKey: ['/api/admin/credit-policies'],
  });

  // Create program mutation
  const createProgramMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest('POST', '/api/admin/programs', payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/programs'] });
      // If we have review rules, save them
      if (reviewRules.length > 0 && data.program?.id) {
        saveReviewRules(data.program.id);
      }
      toast({ title: 'Program created successfully!' });
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create program',
        description: error?.message || 'Please check the form and try again.',
        variant: 'destructive',
      });
    },
  });

  const saveReviewRules = async (programId: number) => {
    try {
      const rules = reviewRules.map((rule, i) => ({
        ruleTitle: rule.ruleTitle,
        documentType: rule.documentType || 'General',
        severity: rule.severity,
        ruleType: 'general',
        isActive: true,
        sortOrder: i,
      }));
      await apiRequest('POST', `/api/admin/programs/${programId}/review-rules`, { rules });
    } catch {
      // Don't block program creation if rules fail
    }
  };

  // Update quote fields when loan type changes
  const handleLoanTypeChange = (type: string) => {
    setLoanType(type);
    setQuoteFormFields(getDefaultQuoteFields(type));
  };

  const handlePropertyTypeToggle = (type: string) => {
    setEligiblePropertyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Navigation
  const currentStepIndex = wizardSteps.findIndex((s) => s.key === wizardStep);

  const goNext = () => {
    if (currentStepIndex < wizardSteps.length - 1) {
      setWizardStep(wizardSteps[currentStepIndex + 1].key);
    }
  };

  const goBack = () => {
    if (currentStepIndex > 0) {
      setWizardStep(wizardSteps[currentStepIndex - 1].key);
    }
  };

  const handleCreate = () => {
    if (!programName.trim()) {
      toast({ title: 'Program name is required', variant: 'destructive' });
      return;
    }

    createProgramMutation.mutate({
      name: programName.trim(),
      description: programDescription.trim(),
      loanType,
      minLoanAmount,
      maxLoanAmount,
      minLtv,
      maxLtv,
      minInterestRate,
      maxInterestRate,
      termOptions,
      eligiblePropertyTypes,
      quoteFormFields,
      creditPolicyId: selectedCreditPolicyId,
      isActive: true,
      steps: stages.map((s) => ({
        stepName: s.stepName,
        estimatedDays: s.estimatedDays,
        isRequired: s.isRequired,
      })),
      documents: documents.map((d) => ({
        documentName: d.documentName,
        documentCategory: d.documentCategory,
        isRequired: d.isRequired,
        stepIndex: d.stepIndex,
      })),
      tasks: tasks.map((t) => ({
        taskName: t.taskName,
        taskCategory: t.taskCategory,
        priority: t.priority,
        assignToRole: t.assignToRole,
        stepIndex: t.stepIndex,
      })),
    });
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-1 text-xs">
        {wizardSteps.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1">
            <button
              onClick={() => setWizardStep(step.key)}
              className={`px-2 py-1 rounded-md transition-colors ${
                step.key === wizardStep
                  ? 'bg-primary text-primary-foreground font-medium'
                  : i < currentStepIndex
                  ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {step.number}. {step.label}
            </button>
            {i < wizardSteps.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {wizardStep === 'credit-policy' && (
        <CreditPolicyStep
          creditPolicies={creditPoliciesData?.policies || []}
          selectedId={selectedCreditPolicyId}
          onSelect={setSelectedCreditPolicyId}
        />
      )}

      {wizardStep === 'program-details' && (
        <ProgramDetailsStep
          programName={programName}
          setProgramName={setProgramName}
          programDescription={programDescription}
          setProgramDescription={setProgramDescription}
          loanType={loanType}
          onLoanTypeChange={handleLoanTypeChange}
          minLoanAmount={minLoanAmount}
          setMinLoanAmount={setMinLoanAmount}
          maxLoanAmount={maxLoanAmount}
          setMaxLoanAmount={setMaxLoanAmount}
          minLtv={minLtv}
          setMinLtv={setMinLtv}
          maxLtv={maxLtv}
          setMaxLtv={setMaxLtv}
          minInterestRate={minInterestRate}
          setMinInterestRate={setMinInterestRate}
          maxInterestRate={maxInterestRate}
          setMaxInterestRate={setMaxInterestRate}
          termOptions={termOptions}
          setTermOptions={setTermOptions}
          eligiblePropertyTypes={eligiblePropertyTypes}
          onPropertyTypeToggle={handlePropertyTypeToggle}
          quoteFormFields={quoteFormFields}
          setQuoteFormFields={setQuoteFormFields}
        />
      )}

      {wizardStep === 'stages' && (
        <StagesStep stages={stages} setStages={setStages} />
      )}

      {wizardStep === 'documents' && (
        <DocumentsStep
          documents={documents}
          setDocuments={setDocuments}
          stages={stages}
        />
      )}

      {wizardStep === 'tasks' && (
        <TasksStep
          tasks={tasks}
          setTasks={setTasks}
          stages={stages}
        />
      )}

      {wizardStep === 'review-rules' && (
        <ReviewRulesStep
          reviewRules={reviewRules}
          setReviewRules={setReviewRules}
          stages={stages}
          documents={documents}
        />
      )}

      {wizardStep === 'summary' && (
        <SummaryStep
          programName={programName}
          loanType={loanType}
          stages={stages}
          documents={documents}
          tasks={tasks}
          reviewRules={reviewRules}
          selectedCreditPolicyId={selectedCreditPolicyId}
          creditPolicies={creditPoliciesData?.policies || []}
        />
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" onClick={goBack} disabled={currentStepIndex === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {wizardStep === 'summary' ? (
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={createProgramMutation.isPending || !programName.trim()}
          >
            {createProgramMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Create Program
              </>
            )}
          </Button>
        ) : (
          <Button size="sm" onClick={goNext}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Credit Policy ──────────────────────────────────────

function CreditPolicyStep({
  creditPolicies,
  selectedId,
  onSelect,
}: {
  creditPolicies: any[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [extractedRules, setExtractedRules] = useState<{ documentType: string; ruleTitle: string; ruleDescription: string; category?: string }[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyDescription, setNewPolicyDescription] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const createPolicyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/credit-policies', {
        name: newPolicyName,
        description: newPolicyDescription || null,
        sourceFileName: uploadedFileName || null,
        rules: extractedRules,
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-policies'] });
      onSelect(data.id);
      setShowCreateForm(false);
      setExtractedRules([]);
      setUploadedFileName('');
      setNewPolicyName('');
      setNewPolicyDescription('');
      toast({ title: 'Credit policy created and attached to this program' });
    },
    onError: () => {
      toast({ title: 'Failed to create credit policy', variant: 'destructive' });
    },
  });

  const handleFileUpload = useCallback(async (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|txt)$/i)) {
      toast({ title: 'Please upload a PDF, Word document, or text file', variant: 'destructive' });
      return;
    }

    setIsExtracting(true);
    setUploadedFileName(file.name);
    setShowCreateForm(true);
    if (!newPolicyName) {
      const baseName = file.name.replace(/\.(pdf|docx?|txt)$/i, '').replace(/[_-]/g, ' ');
      setNewPolicyName(baseName);
    }

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiRequest('POST', '/api/admin/credit-policies/extract-rules', {
        fileContent: base64,
        fileName: file.name,
      });
      const data = await response.json();
      if (data.rules && Array.isArray(data.rules)) {
        setExtractedRules(data.rules);
        const groups: Record<string, boolean> = {};
        data.rules.forEach((r: any) => { groups[r.documentType || 'General'] = true; });
        setExpandedGroups(groups);
        toast({ title: `Extracted ${data.rules.length} rules from ${file.name}` });
      }
    } catch (error: any) {
      toast({ title: 'Failed to extract rules', description: error.message, variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  }, [newPolicyName, toast]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const rulesByGroup = extractedRules.reduce<Record<string, typeof extractedRules>>((acc, rule) => {
    const group = rule.documentType || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(rule);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Credit Policy
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </CardTitle>
          <CardDescription>
            A credit policy defines your lending guidelines — minimum FICO scores, maximum LTV ratios, allowed property types, and other underwriting criteria. Upload your policy document and the AI will automatically extract the rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {creditPolicies.length > 0 && !showCreateForm && (
            <div className="space-y-2">
              <Label className="text-sm">Select an existing credit policy</Label>
              <Select
                value={selectedId?.toString() || 'none'}
                onValueChange={(val) => onSelect(val === 'none' ? null : parseInt(val))}
              >
                <SelectTrigger data-testid="select-credit-policy">
                  <SelectValue placeholder="No credit policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No credit policy</SelectItem>
                  {creditPolicies.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.ruleCount || 0} rules)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 pt-1">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>
            </div>
          )}

          {!showCreateForm ? (
            <div
              className={`relative border-2 border-dashed rounded-md p-8 text-center transition-colors cursor-pointer ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/40'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-credit-policy"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
                data-testid="input-credit-policy-file"
              />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
              <p className="text-sm font-medium">Upload your credit policy document</p>
              <p className="text-xs text-muted-foreground mt-1">
                Drop a PDF, Word document, or text file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The AI will read your document and extract individual lending rules automatically
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium flex-1 truncate">{uploadedFileName}</span>
                {isExtracting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {!isExtracting && extractedRules.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {extractedRules.length} rules extracted
                  </Badge>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setExtractedRules([]);
                    setUploadedFileName('');
                    setNewPolicyName('');
                    setNewPolicyDescription('');
                  }}
                  data-testid="button-remove-uploaded-file"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {isExtracting && (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="text-sm font-medium">Analyzing your credit policy document...</p>
                    <p className="text-xs text-muted-foreground">The AI is reading and extracting individual lending rules</p>
                  </div>
                </div>
              )}

              {!isExtracting && extractedRules.length > 0 && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Policy Name</Label>
                    <Input
                      value={newPolicyName}
                      onChange={(e) => setNewPolicyName(e.target.value)}
                      placeholder="e.g. DSCR Credit Policy 2026"
                      data-testid="input-policy-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Description (optional)</Label>
                    <Input
                      value={newPolicyDescription}
                      onChange={(e) => setNewPolicyDescription(e.target.value)}
                      placeholder="Brief description of this policy"
                      data-testid="input-policy-description"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Extracted Rules
                    </Label>
                    <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                      {Object.entries(rulesByGroup).map(([group, groupRules]) => (
                        <div key={group}>
                          <button
                            type="button"
                            className="flex items-center justify-between gap-2 w-full px-3 py-2 text-left hover-elevate"
                            onClick={() => setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))}
                            data-testid={`toggle-rule-group-${group}`}
                          >
                            <span className="text-xs font-medium">{group}</span>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-xs">{groupRules.length}</Badge>
                              {expandedGroups[group] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </div>
                          </button>
                          {expandedGroups[group] && (
                            <div className="px-3 pb-2 space-y-1.5">
                              {groupRules.map((rule, i) => (
                                <div key={i} className="text-xs p-2 bg-muted/30 rounded">
                                  <p className="font-medium">{rule.ruleTitle}</p>
                                  <p className="text-muted-foreground mt-0.5">{rule.ruleDescription}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => createPolicyMutation.mutate()}
                    disabled={!newPolicyName.trim() || createPolicyMutation.isPending}
                    data-testid="button-save-credit-policy"
                  >
                    {createPolicyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 mr-2" />
                    )}
                    Save Credit Policy & Attach to Program
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">How AI Uses Your Credit Policy</p>
              <p className="text-xs text-muted-foreground mt-1">
                When you attach a credit policy, the AI continuously works in the background to protect your lending standards throughout the entire loan lifecycle.
              </p>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3">
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Eye className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">Document Review</p>
                <p className="text-xs text-muted-foreground">
                  Every document uploaded to a deal is automatically checked against your credit policy rules. The AI flags issues like expired insurance, low FICO scores, or LTV violations before they reach underwriting.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">Ongoing Compliance Monitoring</p>
                <p className="text-xs text-muted-foreground">
                  As deals progress through stages, the AI re-evaluates new information against your policy. If a borrower's credit report shows a score below your minimum, or a property appraisal reveals an issue, you'll be alerted immediately.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">Risk Flagging & Exceptions</p>
                <p className="text-xs text-muted-foreground">
                  When the AI detects an out-of-policy condition, it creates a visible flag on the deal with a clear explanation. Your team can then decide whether to request updated documents, adjust terms, or approve an exception.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 2: Program Details ───────────────────────────────────

function ProgramDetailsStep({
  programName,
  setProgramName,
  programDescription,
  setProgramDescription,
  loanType,
  onLoanTypeChange,
  minLoanAmount,
  setMinLoanAmount,
  maxLoanAmount,
  setMaxLoanAmount,
  minLtv,
  setMinLtv,
  maxLtv,
  setMaxLtv,
  minInterestRate,
  setMinInterestRate,
  maxInterestRate,
  setMaxInterestRate,
  termOptions,
  setTermOptions,
  eligiblePropertyTypes,
  onPropertyTypeToggle,
  quoteFormFields,
  setQuoteFormFields,
}: {
  programName: string;
  setProgramName: (v: string) => void;
  programDescription: string;
  setProgramDescription: (v: string) => void;
  loanType: string;
  onLoanTypeChange: (v: string) => void;
  minLoanAmount: string;
  setMinLoanAmount: (v: string) => void;
  maxLoanAmount: string;
  setMaxLoanAmount: (v: string) => void;
  minLtv: string;
  setMinLtv: (v: string) => void;
  maxLtv: string;
  setMaxLtv: (v: string) => void;
  minInterestRate: string;
  setMinInterestRate: (v: string) => void;
  maxInterestRate: string;
  setMaxInterestRate: (v: string) => void;
  termOptions: string;
  setTermOptions: (v: string) => void;
  eligiblePropertyTypes: string[];
  onPropertyTypeToggle: (type: string) => void;
  quoteFormFields: any[];
  setQuoteFormFields: (v: any[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Program Details
        </CardTitle>
        <CardDescription>
          Define your loan program type, parameters, and the quote fields borrowers will see.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Program Name *</Label>
            <Input
              placeholder="ex. DSCR Rental Program"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              placeholder="ex. Standard DSCR loan program for investment rental properties"
              value={programDescription}
              onChange={(e) => setProgramDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loan Type *</Label>
            <Select value={loanType} onValueChange={onLoanTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {loanTypeOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Term Options</Label>
            <Input
              placeholder="ex. 12, 24, 36, 60"
              value={termOptions}
              onChange={(e) => setTermOptions(e.target.value)}
            />
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs font-medium">Loan Parameters</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Min Loan ($)</Label>
              <Input placeholder="ex. 150000" value={minLoanAmount} onChange={(e) => setMinLoanAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Max Loan ($)</Label>
              <Input placeholder="ex. 2000000" value={maxLoanAmount} onChange={(e) => setMaxLoanAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Min LTV (%)</Label>
              <Input placeholder="ex. 50%" value={minLtv} onChange={(e) => setMinLtv(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Max LTV (%)</Label>
              <Input placeholder="ex. 80%" value={maxLtv} onChange={(e) => setMaxLtv(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Min Rate (%)</Label>
              <Input placeholder="ex. 7%" value={minInterestRate} onChange={(e) => setMinInterestRate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Max Rate (%)</Label>
              <Input placeholder="ex. 12%" value={maxInterestRate} onChange={(e) => setMaxInterestRate(e.target.value)} />
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs font-medium">Eligible Property Types</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {propertyTypeOptions.map((pt) => (
              <Badge
                key={pt.value}
                variant={eligiblePropertyTypes.includes(pt.value) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => onPropertyTypeToggle(pt.value)}
              >
                {pt.label}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-medium">Quote Form Fields</Label>
            <p className="text-[11px] text-muted-foreground">
              These are the input fields borrowers fill out when requesting a quote for this program.
            </p>
          </div>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {quoteFormFields.map((field, i) => (
              <div key={field.fieldKey} className="flex items-center justify-between gap-3 py-1 px-2 bg-muted/40 rounded">
                <span className="text-xs flex-1">{field.label}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-[11px]">
                    <Switch
                      checked={field.visible}
                      onCheckedChange={() => {
                        const updated = [...quoteFormFields];
                        updated[i] = { ...field, visible: !field.visible, required: field.visible ? false : field.required };
                        setQuoteFormFields(updated);
                      }}
                      className="scale-75"
                    />
                    Visible
                  </label>
                  <label className="flex items-center gap-1 text-[11px]">
                    <Switch
                      checked={field.required}
                      disabled={!field.visible}
                      onCheckedChange={() => {
                        const updated = [...quoteFormFields];
                        updated[i] = { ...field, required: !field.required };
                        setQuoteFormFields(updated);
                      }}
                      className="scale-75"
                    />
                    Required
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 3: Stages ─────────────────────────────────────────────

function StagesStep({
  stages,
  setStages,
}: {
  stages: StageEntry[];
  setStages: (s: StageEntry[]) => void;
}) {
  const addStage = () => {
    setStages([...stages, { stepName: '', estimatedDays: 5, isRequired: true }]);
  };

  const removeStage = (i: number) => {
    setStages(stages.filter((_, idx) => idx !== i));
  };

  const updateStage = (i: number, field: keyof StageEntry, value: any) => {
    const updated = [...stages];
    updated[i] = { ...updated[i], [field]: value };
    setStages(updated);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Workflow Stages
        </CardTitle>
        <CardDescription>
          Define the stages each deal goes through from application to closing. The order below is the order deals will progress through your pipeline. Documents and tasks will be linked to these stages in the next steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Badge variant="outline" className="text-xs w-6 h-6 flex items-center justify-center p-0 flex-shrink-0">
              {i + 1}
            </Badge>
            <Input
              className="h-8 text-sm flex-1"
              placeholder="Stage name"
              value={stage.stepName}
              onChange={(e) => updateStage(i, 'stepName', e.target.value)}
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <Input
                className="h-8 text-sm w-16"
                type="number"
                value={stage.estimatedDays}
                onChange={(e) => updateStage(i, 'estimatedDays', parseInt(e.target.value) || 0)}
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={() => removeStage(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addStage}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Stage
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Step 4: Documents ──────────────────────────────────────────

function DocumentsStep({
  documents,
  setDocuments,
  stages,
}: {
  documents: DocEntry[];
  setDocuments: (d: DocEntry[]) => void;
  stages: StageEntry[];
}) {
  const addDocument = () => {
    setDocuments([...documents, { documentName: '', documentCategory: 'borrower_docs', isRequired: true, stepIndex: null }]);
  };

  const removeDocument = (i: number) => {
    setDocuments(documents.filter((_, idx) => idx !== i));
  };

  const updateDocument = (i: number, field: keyof DocEntry, value: any) => {
    const updated = [...documents];
    updated[i] = { ...updated[i], [field]: value };
    setDocuments(updated);
  };

  const addStandardDocs = (category: string) => {
    const catDocs = standardDocuments.find((c) => c.category === category);
    if (!catDocs) return;
    const existing = new Set(documents.map((d) => d.documentName));
    const newDocs = catDocs.documents
      .filter((d) => !existing.has(d.name))
      .map((d) => ({
        documentName: d.name,
        documentCategory: category,
        isRequired: true,
        stepIndex: null,
      }));
    if (newDocs.length > 0) {
      setDocuments([...documents, ...newDocs]);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Required Documents
        </CardTitle>
        <CardDescription>
          Specify which documents borrowers need to upload. You can link each document to a specific stage so it shows up at the right time in the pipeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Quick add standard documents:</Label>
          <div className="flex flex-wrap gap-1.5">
            {standardDocuments.map((cat) => (
              <Button key={cat.category} variant="outline" size="sm" className="text-xs h-7" onClick={() => addStandardDocs(cat.category)}>
                <Plus className="h-3 w-3 mr-1" />
                {cat.categoryLabel}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {documents.length === 0 ? (
          <div className="bg-muted/50 rounded-md p-4 text-sm text-muted-foreground text-center">
            No documents added yet. Use the quick-add buttons above or add documents manually below.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {documents.map((doc, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-muted/40 rounded-md">
                <div className="flex-1 space-y-1.5">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Document name"
                    value={doc.documentName}
                    onChange={(e) => updateDocument(i, 'documentName', e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Select value={doc.documentCategory} onValueChange={(v) => updateDocument(i, 'documentCategory', v)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {documentCategories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={doc.stepIndex !== null ? doc.stepIndex.toString() : 'none'}
                      onValueChange={(v) => updateDocument(i, 'stepIndex', v === 'none' ? null : parseInt(v))}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Link to stage..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No stage</SelectItem>
                        {stages.map((s, si) => (
                          <SelectItem key={si} value={si.toString()}>{s.stepName || `Stage ${si + 1}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => removeDocument(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={addDocument}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Document Manually
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Step 5: Tasks ──────────────────────────────────────────────

function TasksStep({
  tasks,
  setTasks,
  stages,
}: {
  tasks: TaskEntry[];
  setTasks: (t: TaskEntry[]) => void;
  stages: StageEntry[];
}) {
  const addTask = () => {
    setTasks([...tasks, { taskName: '', taskCategory: 'other', priority: 'medium', assignToRole: 'admin', stepIndex: null }]);
  };

  const removeTask = (i: number) => {
    setTasks(tasks.filter((_, idx) => idx !== i));
  };

  const updateTask = (i: number, field: keyof TaskEntry, value: any) => {
    const updated = [...tasks];
    updated[i] = { ...updated[i], [field]: value };
    setTasks(updated);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" />
          Tasks
        </CardTitle>
        <CardDescription>
          Define the action items that need to be completed at each stage. Tasks can be assigned to admins, processors, or borrowers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <div className="bg-muted/50 rounded-md p-4 text-sm text-muted-foreground text-center">
            No tasks added yet. You can add them now or configure them later from the program settings.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {tasks.map((task, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-muted/40 rounded-md">
                <div className="flex-1 space-y-1.5">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Task name"
                    value={task.taskName}
                    onChange={(e) => updateTask(i, 'taskName', e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Select value={task.taskCategory} onValueChange={(v) => updateTask(i, 'taskCategory', v)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {taskCategories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={task.assignToRole} onValueChange={(v) => updateTask(i, 'assignToRole', v)}>
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="processor">Processor</SelectItem>
                        <SelectItem value="user">Borrower</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={task.stepIndex !== null ? task.stepIndex.toString() : 'none'}
                      onValueChange={(v) => updateTask(i, 'stepIndex', v === 'none' ? null : parseInt(v))}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Link to stage..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No stage</SelectItem>
                        {stages.map((s, si) => (
                          <SelectItem key={si} value={si.toString()}>{s.stepName || `Stage ${si + 1}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => removeTask(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={addTask}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Task
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Step 6: Review Rules (AI Rules) ────────────────────────────

function ReviewRulesStep({
  reviewRules,
  setReviewRules,
  stages,
  documents,
}: {
  reviewRules: RuleEntry[];
  setReviewRules: (r: RuleEntry[]) => void;
  stages: StageEntry[];
  documents: DocEntry[];
}) {
  const addRule = () => {
    setReviewRules([...reviewRules, { ruleTitle: '', documentType: '', severity: 'warning', stepIndex: null }]);
  };

  const removeRule = (i: number) => {
    setReviewRules(reviewRules.filter((_, idx) => idx !== i));
  };

  const updateRule = (i: number, field: keyof RuleEntry, value: any) => {
    const updated = [...reviewRules];
    updated[i] = { ...updated[i], [field]: value };
    setReviewRules(updated);
  };

  // Get unique document names for linking
  const docNames = [...new Set(documents.map((d) => d.documentName).filter(Boolean))];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI Review Rules
        </CardTitle>
        <CardDescription>
          Define what the AI agent should check when reviewing documents. Rules are tied to document types and can be flagged as failures, warnings, or informational notes. These rules power the automated document intelligence pipeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Example rules: "Verify borrower name matches across all documents", "Check that appraisal value is within 90 days", "Flag if FICO score is below 680". You can refine these later from the program settings.
          </p>
        </div>

        {reviewRules.length === 0 ? (
          <div className="bg-muted/50 rounded-md p-4 text-sm text-muted-foreground text-center">
            No AI rules added yet. You can add them now or configure them later.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {reviewRules.map((rule, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-muted/40 rounded-md">
                <div className="flex-1 space-y-1.5">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Rule description, e.g., 'Verify borrower ID is not expired'"
                    value={rule.ruleTitle}
                    onChange={(e) => updateRule(i, 'ruleTitle', e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Select value={rule.documentType || 'general'} onValueChange={(v) => updateRule(i, 'documentType', v)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Document type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">General (all documents)</SelectItem>
                        {docNames.map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={rule.severity} onValueChange={(v) => updateRule(i, 'severity', v)}>
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fail">Fail</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => removeRule(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={addRule}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Rule
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Step 7: Summary ────────────────────────────────────────────

function SummaryStep({
  programName,
  loanType,
  stages,
  documents,
  tasks,
  reviewRules,
  selectedCreditPolicyId,
  creditPolicies,
}: {
  programName: string;
  loanType: string;
  stages: StageEntry[];
  documents: DocEntry[];
  tasks: TaskEntry[];
  reviewRules: RuleEntry[];
  selectedCreditPolicyId: number | null;
  creditPolicies: any[];
}) {
  const policyName = selectedCreditPolicyId
    ? creditPolicies.find((p: any) => p.id === selectedCreditPolicyId)?.name || 'Unknown'
    : 'None';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Review & Create
        </CardTitle>
        <CardDescription>
          Review your program configuration before creating it. You can always edit these settings later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Program Name</span>
            <p className="font-medium">{programName || '(not set)'}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Loan Type</span>
            <p className="font-medium">{loanType.toUpperCase()}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Credit Policy</span>
            <p className="font-medium">{policyName}</p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-md p-3 text-center">
            <p className="text-2xl font-bold">{stages.filter((s) => s.stepName.trim()).length}</p>
            <p className="text-xs text-muted-foreground">Stages</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3 text-center">
            <p className="text-2xl font-bold">{documents.filter((d) => d.documentName.trim()).length}</p>
            <p className="text-xs text-muted-foreground">Documents</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3 text-center">
            <p className="text-2xl font-bold">{tasks.filter((t) => t.taskName.trim()).length}</p>
            <p className="text-xs text-muted-foreground">Tasks</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3 text-center">
            <p className="text-2xl font-bold">{reviewRules.filter((r) => r.ruleTitle.trim()).length}</p>
            <p className="text-xs text-muted-foreground">AI Rules</p>
          </div>
        </div>

        {stages.filter((s) => s.stepName.trim()).length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Pipeline Flow</Label>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {stages.filter((s) => s.stepName.trim()).map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">{s.stepName}</Badge>
                  {i < stages.filter((s) => s.stepName.trim()).length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!programName.trim() && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-md">
            <Info className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700">Program name is required to create the program. Go back to step 2 to set it.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import type { DragEvent, ChangeEvent } from 'react';
import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
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
  ArrowUp,
  ArrowDown,
  Settings2,
  FormInput,
  Pencil,
  Check,
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

// ─── Quote Form Field Types ─────────────────────────────────────

type QuoteFormField = {
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'number' | 'currency' | 'email' | 'phone' | 'select' | 'yes_no' | 'percentage';
  required: boolean;
  visible: boolean;
  isDefault: boolean;
  options?: string[];
  conditionalOn?: string;
  conditionalValue?: string;
};

const FIELD_TYPE_OPTIONS: { value: QuoteFormField['fieldType']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency ($)' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'yes_no', label: 'Yes / No' },
];

const CONTACT_FIELDS: QuoteFormField[] = [
  { fieldKey: 'firstName', label: 'First Name', fieldType: 'text', required: true, visible: true, isDefault: true },
  { fieldKey: 'lastName', label: 'Last Name', fieldType: 'text', required: true, visible: true, isDefault: true },
  { fieldKey: 'email', label: 'Email', fieldType: 'email', required: true, visible: true, isDefault: true },
  { fieldKey: 'phone', label: 'Phone Number', fieldType: 'phone', required: false, visible: true, isDefault: true },
  { fieldKey: 'address', label: 'Address', fieldType: 'text', required: false, visible: true, isDefault: true },
];

const DSCR_QUOTE_FIELDS: Omit<QuoteFormField, 'isDefault'>[] = [
  { fieldKey: 'loanAmount', label: 'Loan Amount', fieldType: 'currency', required: true, visible: true },
  { fieldKey: 'propertyValue', label: 'Property Value', fieldType: 'currency', required: true, visible: true },
  { fieldKey: 'loanPurpose', label: 'Loan Purpose', fieldType: 'select', required: true, visible: true, options: ['Purchase', 'Refinance', 'Cash-Out Refinance'] },
  { fieldKey: 'loanType', label: 'Loan Type (Fixed/ARM)', fieldType: 'select', required: true, visible: true, options: ['Fixed', 'ARM'] },
  { fieldKey: 'propertyType', label: 'Property Type', fieldType: 'select', required: true, visible: true, options: ['Single Family', '2-4 Unit', 'Condo', 'Townhouse', 'Multifamily 5+'] },
  { fieldKey: 'ficoScore', label: 'FICO Score', fieldType: 'number', required: true, visible: true },
  { fieldKey: 'grossMonthlyRent', label: 'Gross Monthly Rent', fieldType: 'currency', required: false, visible: true },
  { fieldKey: 'annualTaxes', label: 'Annual Taxes', fieldType: 'currency', required: false, visible: true },
  { fieldKey: 'annualInsurance', label: 'Annual Insurance', fieldType: 'currency', required: false, visible: true },
  { fieldKey: 'interestOnly', label: 'Interest Only', fieldType: 'yes_no', required: false, visible: true },
  { fieldKey: 'prepaymentPenalty', label: 'Prepayment Penalty', fieldType: 'select', required: false, visible: true, options: ['None', '1 Year', '2 Years', '3 Years', '5 Years'] },
  { fieldKey: 'appraisalValue', label: 'Appraisal Value', fieldType: 'currency', required: false, visible: true },
];

const RTL_QUOTE_FIELDS: Omit<QuoteFormField, 'isDefault'>[] = [
  { fieldKey: 'loanType', label: 'Loan Type (Light/Heavy Rehab)', fieldType: 'select', required: true, visible: true, options: ['Light Rehab', 'Heavy Rehab', 'Ground Up'] },
  { fieldKey: 'purpose', label: 'Purpose (Purchase/Refi)', fieldType: 'select', required: true, visible: true, options: ['Purchase', 'Refinance'] },
  { fieldKey: 'asIsValue', label: 'As-Is Value', fieldType: 'currency', required: true, visible: true },
  { fieldKey: 'arv', label: 'After Repair Value (ARV)', fieldType: 'currency', required: true, visible: true },
  { fieldKey: 'rehabBudget', label: 'Rehab Budget', fieldType: 'currency', required: true, visible: true },
  { fieldKey: 'propertyType', label: 'Property Type', fieldType: 'select', required: true, visible: true, options: ['Single Family', '2-4 Unit', 'Condo', 'Townhouse', 'Multifamily 5+'] },
  { fieldKey: 'ficoScore', label: 'FICO Score', fieldType: 'number', required: true, visible: true },
  { fieldKey: 'propertyUnits', label: 'Property Units', fieldType: 'number', required: false, visible: true },
  { fieldKey: 'isMidstream', label: 'Is Midstream?', fieldType: 'yes_no', required: false, visible: true },
  { fieldKey: 'borrowingEntityType', label: 'Borrowing Entity Type', fieldType: 'select', required: false, visible: true, options: ['LLC', 'Corporation', 'Individual', 'Trust', 'Partnership'] },
  { fieldKey: 'completedProjects', label: 'Completed Projects', fieldType: 'number', required: false, visible: true },
  { fieldKey: 'hasFullGuaranty', label: 'Full Guaranty?', fieldType: 'yes_no', required: false, visible: true },
  { fieldKey: 'exitStrategy', label: 'Exit Strategy', fieldType: 'select', required: false, visible: true, options: ['Sell', 'Refinance', 'Hold'] },
  { fieldKey: 'appraisalValue', label: 'Appraisal Value', fieldType: 'currency', required: false, visible: true },
];

function getDefaultQuoteFields(loanType: string): QuoteFormField[] {
  const baseFields = loanType.toLowerCase() === 'dscr' ? DSCR_QUOTE_FIELDS : RTL_QUOTE_FIELDS;
  return [
    ...CONTACT_FIELDS,
    ...baseFields.map((field) => ({ ...field, isDefault: true })),
  ];
}

// ─── Default stages ────────────────────────────────────────────

const defaultStages = [
  { stepName: 'Application', isRequired: true },
  { stepName: 'Processing', isRequired: true },
  { stepName: 'Underwriting', isRequired: true },
  { stepName: 'Closing', isRequired: true },
];

// ─── Types ──────────────────────────────────────────────────────

interface StageEntry {
  stepName: string;
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

type WizardStep = 'credit-policy' | 'program-details' | 'quote-form' | 'stages' | 'documents' | 'tasks' | 'review-rules' | 'summary';

const wizardSteps: { key: WizardStep; label: string; number: number }[] = [
  { key: 'credit-policy', label: 'Credit Policy', number: 1 },
  { key: 'program-details', label: 'Program Details', number: 2 },
  { key: 'quote-form', label: 'Quote Form', number: 3 },
  { key: 'stages', label: 'Stages', number: 4 },
  { key: 'documents', label: 'Documents', number: 5 },
  { key: 'tasks', label: 'Tasks', number: 6 },
  { key: 'review-rules', label: 'AI Rules', number: 7 },
  { key: 'summary', label: 'Review & Create', number: 8 },
];

// ─── DSCR Example Defaults ───────────────────────────────────────

const dscrDefaultStages: StageEntry[] = [
  { stepName: 'Application', isRequired: true },
  { stepName: 'Processing', isRequired: true },
  { stepName: 'Underwriting', isRequired: true },
  { stepName: 'Appraisal & Title', isRequired: true },
  { stepName: 'Closing', isRequired: true },
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
  const [quoteFormFields, setQuoteFormFields] = useState<QuoteFormField[]>(getDefaultQuoteFields('dscr'));

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

  const { data: teamData } = useQuery<{ teamMembers: { id: number; fullName: string; role: string }[] }>({
    queryKey: ['/api/admin/team-members'],
  });
  const teamMembers = teamData?.teamMembers || [];

  // Create program mutation
  const createProgramMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest('POST', '/api/admin/programs', payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/programs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/programs-with-pricing'] });
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
        />
      )}

      {wizardStep === 'quote-form' && (
        <QuoteFormBuilderStep
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
          teamMembers={teamMembers}
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
          quoteFormFields={quoteFormFields}
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
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [editingRuleData, setEditingRuleData] = useState<{ ruleTitle: string; ruleDescription: string }>({ ruleTitle: '', ruleDescription: '' });

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

  const rulesByGroup = extractedRules.reduce<Record<string, { rule: typeof extractedRules[0]; globalIndex: number }[]>>((acc, rule, index) => {
    const group = rule.documentType || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push({ rule, globalIndex: index });
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Credit Policy
            <Badge className="text-xs bg-blue-500 text-white hover:bg-blue-600">Optional</Badge>
          </CardTitle>
          <CardDescription>
            A credit policy defines your lending guidelines — minimum FICO scores, maximum LTV ratios, allowed property types, and other underwriting criteria. This step is optional and can be added later from your program settings. Upload your policy document and the AI will automatically extract the rules.
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
                    <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
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
                              {groupRules.map(({ rule, globalIndex }) => (
                                  <div key={globalIndex} className="text-xs p-2 bg-muted/30 rounded group relative">
                                    {editingRuleIndex === globalIndex ? (
                                      <div className="space-y-2">
                                        <Input
                                          value={editingRuleData.ruleTitle}
                                          onChange={(e) => setEditingRuleData(prev => ({ ...prev, ruleTitle: e.target.value }))}
                                          className="h-7 text-xs"
                                          placeholder="Rule title"
                                          data-testid={`input-edit-rule-title-${globalIndex}`}
                                        />
                                        <Textarea
                                          value={editingRuleData.ruleDescription}
                                          onChange={(e) => setEditingRuleData(prev => ({ ...prev, ruleDescription: e.target.value }))}
                                          className="text-xs min-h-[60px]"
                                          placeholder="Rule description"
                                          data-testid={`input-edit-rule-desc-${globalIndex}`}
                                        />
                                        <div className="flex items-center gap-1">
                                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => {
                                            setExtractedRules(prev => prev.map((r, i) => i === globalIndex ? { ...r, ruleTitle: editingRuleData.ruleTitle, ruleDescription: editingRuleData.ruleDescription } : r));
                                            setEditingRuleIndex(null);
                                          }} data-testid={`button-save-rule-${globalIndex}`}>
                                            <Check className="h-3 w-3 mr-1" /> Save
                                          </Button>
                                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingRuleIndex(null)} data-testid={`button-cancel-edit-rule-${globalIndex}`}>
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1">
                                            <p className="font-medium">{rule.ruleTitle}</p>
                                            <p className="text-muted-foreground mt-0.5">{rule.ruleDescription}</p>
                                          </div>
                                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => {
                                              setEditingRuleIndex(globalIndex);
                                              setEditingRuleData({ ruleTitle: rule.ruleTitle, ruleDescription: rule.ruleDescription || '' });
                                            }} data-testid={`button-edit-rule-${globalIndex}`}>
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => {
                                              setExtractedRules(prev => prev.filter((_, i) => i !== globalIndex));
                                            }} data-testid={`button-delete-rule-${globalIndex}`}>
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      {extractedRules.length} rule{extractedRules.length !== 1 ? 's' : ''} ready to save
                    </p>
                    <Button
                      onClick={() => createPolicyMutation.mutate()}
                      disabled={!newPolicyName.trim() || extractedRules.length === 0 || createPolicyMutation.isPending}
                      data-testid="button-save-credit-policy"
                    >
                      {createPolicyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Accept & Save Credit Policy
                    </Button>
                  </div>
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
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Program Details
        </CardTitle>
        <CardDescription>
          Define your loan program type and parameters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Program Name (borrowers will see this) *</Label>
            <Input
              placeholder="ex. 30-Year Rental Loan"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              data-testid="input-program-name"
            />
            <p className="text-xs text-muted-foreground">
              This name appears on quotes and borrower-facing pages. Choose something clear and professional.
            </p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Internal Description</Label>
            <Textarea
              placeholder="ex. Standard DSCR program for investment rentals — internal team reference"
              value={programDescription}
              onChange={(e) => setProgramDescription(e.target.value)}
              rows={2}
              data-testid="input-program-description"
            />
            <p className="text-xs text-muted-foreground">
              For your team only. Use this to note internal naming or guidelines.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loan Type *</Label>
            <LoanTypeSelector value={loanType} onChange={onLoanTypeChange} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Term Options (months)</Label>
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

      </CardContent>
    </Card>
  );
}

function LoanTypeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isCustom, setIsCustom] = useState(
    !loanTypeOptions.some((o) => o.value === value) && value !== ''
  );
  const [customValue, setCustomValue] = useState(
    !loanTypeOptions.some((o) => o.value === value) ? value : ''
  );

  if (isCustom) {
    return (
      <div className="flex items-center gap-2">
        <Input
          className="h-9 text-sm flex-1"
          placeholder="ex. Bridge, Construction, SBA"
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            onChange(e.target.value);
          }}
          data-testid="input-custom-loan-type"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setIsCustom(false);
            setCustomValue('');
            onChange('dscr');
          }}
          data-testid="button-cancel-custom-loan-type"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === '__custom__') {
          setIsCustom(true);
          setCustomValue('');
          onChange('');
        } else {
          onChange(v);
        }
      }}
    >
      <SelectTrigger data-testid="select-loan-type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {loanTypeOptions.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
        <SelectItem value="__custom__">Other (custom)...</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Step 3: Quote Form Builder ─────────────────────────────────

const CONTACT_FIELD_KEYS = new Set(CONTACT_FIELDS.map((f) => f.fieldKey));

function QuoteFormBuilderStep({
  quoteFormFields,
  setQuoteFormFields,
}: {
  quoteFormFields: QuoteFormField[];
  setQuoteFormFields: (v: QuoteFormField[]) => void;
}) {
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<QuoteFormField['fieldType']>('text');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [configuringIndex, setConfiguringIndex] = useState<number | null>(null);

  const contactFields = quoteFormFields.filter((f) => CONTACT_FIELD_KEYS.has(f.fieldKey));
  const programFields = quoteFormFields.filter((f) => !CONTACT_FIELD_KEYS.has(f.fieldKey));

  const addCustomField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    const fieldKey = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
    setQuoteFormFields([
      ...quoteFormFields,
      { fieldKey, label: name, fieldType: newFieldType, required: false, visible: true, isDefault: false },
    ]);
    setNewFieldName('');
    setNewFieldType('text');
  };

  const removeField = (fieldKey: string) => {
    const removed = quoteFormFields.find((f) => f.fieldKey === fieldKey);
    let updated = quoteFormFields.filter((f) => f.fieldKey !== fieldKey);
    if (removed) {
      updated = updated.map((f) => f.conditionalOn === fieldKey ? { ...f, conditionalOn: undefined, conditionalValue: undefined } : f);
    }
    setQuoteFormFields(updated);
  };

  const updateField = (fieldKey: string, changes: Partial<QuoteFormField>) => {
    let updated = quoteFormFields.map((f) => (f.fieldKey === fieldKey ? { ...f, ...changes } : f));

    const changedField = updated.find((f) => f.fieldKey === fieldKey);
    if (changedField) {
      const isNoLongerConditionalParent =
        (changes.fieldType && changes.fieldType !== 'select' && changes.fieldType !== 'yes_no') ||
        (changes.visible === false);
      if (isNoLongerConditionalParent) {
        updated = updated.map((f) =>
          f.conditionalOn === fieldKey ? { ...f, conditionalOn: undefined, conditionalValue: undefined } : f
        );
      }
      if (changes.fieldType && changes.fieldType !== 'select') {
        const idx = updated.findIndex((f) => f.fieldKey === fieldKey);
        if (idx !== -1) updated[idx] = { ...updated[idx], options: undefined };
      }
    }

    setQuoteFormFields(updated);
  };

  const moveField = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const contactCount = contactFields.length;
    const actualFrom = contactCount + fromIdx;
    const actualTo = contactCount + toIdx;
    const updated = [...quoteFormFields];
    const [moved] = updated.splice(actualFrom, 1);
    updated.splice(actualTo, 0, moved);
    setQuoteFormFields(updated);
  };

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: DragEvent) => e.preventDefault();
  const handleDrop = (targetIdx: number) => {
    if (dragIndex !== null && dragIndex !== targetIdx) moveField(dragIndex, targetIdx);
    setDragIndex(null);
  };

  const getFieldTypeLabel = (type: QuoteFormField['fieldType']) =>
    FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label || type;

  const availableConditionalFields = quoteFormFields.filter(
    (f) => f.visible && (f.fieldType === 'select' || f.fieldType === 'yes_no')
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FormInput className="h-4 w-4" />
          Quote Form Fields
        </CardTitle>
        <CardDescription>
          Configure the fields borrowers and brokers will fill out when requesting a quote for this program. Set field types, required status, and conditional logic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Contact Information (always included)</Label>
          <div className="space-y-1.5 mt-2">
            {contactFields.map((field) => (
              <div
                key={field.fieldKey}
                className="flex items-center justify-between gap-3 py-2 px-3 bg-muted/30 rounded-md border border-dashed"
              >
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-sm">{field.label}</span>
                  <Badge variant="outline" className="text-[10px]">{getFieldTypeLabel(field.fieldType)}</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={field.visible}
                      onCheckedChange={(checked) => updateField(field.fieldKey, { visible: checked, required: checked ? field.required : false })}
                      className="scale-75"
                      data-testid={`switch-visible-${field.fieldKey}`}
                    />
                    Visible
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch
                      checked={field.required}
                      disabled={!field.visible}
                      onCheckedChange={(checked) => updateField(field.fieldKey, { required: checked })}
                      className="scale-75"
                      data-testid={`switch-required-${field.fieldKey}`}
                    />
                    Required
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs font-medium text-muted-foreground">Program-Specific Fields (drag to reorder)</Label>
          <div className="space-y-1.5 mt-2">
            {programFields.map((field, pIdx) => {
              const isConfiguring = configuringIndex === pIdx;
              const condField = field.conditionalOn
                ? quoteFormFields.find((f) => f.fieldKey === field.conditionalOn)
                : null;
              return (
                <div key={field.fieldKey}>
                  <div
                    draggable
                    onDragStart={() => handleDragStart(pIdx)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(pIdx)}
                    className={`flex items-center gap-2 py-2 px-3 rounded-md border transition-colors ${
                      dragIndex === pIdx ? 'border-primary bg-primary/5' : 'bg-muted/40'
                    } ${field.conditionalOn ? 'ml-6 border-l-2 border-l-primary/40' : ''}`}
                    data-testid={`field-row-${field.fieldKey}`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />

                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm truncate">{field.label}</span>
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">{getFieldTypeLabel(field.fieldType)}</Badge>
                      {field.conditionalOn && condField && (
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          if {condField.label} = {field.conditionalValue}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => pIdx > 0 && moveField(pIdx, pIdx - 1)}
                          disabled={pIdx === 0}
                          data-testid={`button-move-up-${field.fieldKey}`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => pIdx < programFields.length - 1 && moveField(pIdx, pIdx + 1)}
                          disabled={pIdx === programFields.length - 1}
                          data-testid={`button-move-down-${field.fieldKey}`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <label className="flex items-center gap-1.5 text-xs">
                        <Switch
                          checked={field.visible}
                          onCheckedChange={(checked) => updateField(field.fieldKey, { visible: checked, required: checked ? field.required : false })}
                          className="scale-75"
                          data-testid={`switch-visible-${field.fieldKey}`}
                        />
                        Visible
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <Switch
                          checked={field.required}
                          disabled={!field.visible}
                          onCheckedChange={(checked) => updateField(field.fieldKey, { required: checked })}
                          className="scale-75"
                          data-testid={`switch-required-${field.fieldKey}`}
                        />
                        Required
                      </label>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfiguringIndex(isConfiguring ? null : pIdx)}
                        data-testid={`button-configure-${field.fieldKey}`}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>

                      {!field.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeField(field.fieldKey)}
                          data-testid={`button-remove-field-${field.fieldKey}`}
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isConfiguring && (
                    <div className="ml-6 mt-1 p-3 bg-muted/20 rounded-md border space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Field Label</Label>
                          <Input
                            value={field.label}
                            onChange={(e) => updateField(field.fieldKey, { label: e.target.value })}
                            data-testid={`input-label-${field.fieldKey}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Field Type</Label>
                          <Select
                            value={field.fieldType}
                            onValueChange={(v) => updateField(field.fieldKey, {
                              fieldType: v as QuoteFormField['fieldType'],
                              options: v === 'select' ? (field.options?.length ? field.options : ['Option 1']) : undefined,
                            })}
                          >
                            <SelectTrigger data-testid={`select-field-type-${field.fieldKey}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {field.fieldType === 'select' && (
                        <div className="space-y-1">
                          <Label className="text-xs">Dropdown Options (one per line)</Label>
                          <Textarea
                            value={(field.options || []).join('\n')}
                            onChange={(e) => updateField(field.fieldKey, { options: e.target.value.split('\n').filter(Boolean) })}
                            rows={3}
                            placeholder="Option 1&#10;Option 2&#10;Option 3"
                            data-testid={`textarea-options-${field.fieldKey}`}
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs">Conditional Logic</Label>
                        <p className="text-[11px] text-muted-foreground mb-1">
                          Only show this field when another field has a specific answer.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Select
                            value={field.conditionalOn || '__none__'}
                            onValueChange={(v) => updateField(field.fieldKey, {
                              conditionalOn: v === '__none__' ? undefined : v,
                              conditionalValue: v === '__none__' ? undefined : field.conditionalValue,
                            })}
                          >
                            <SelectTrigger data-testid={`select-conditional-on-${field.fieldKey}`}>
                              <SelectValue placeholder="Show when..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Always show</SelectItem>
                              {availableConditionalFields
                                .filter((f) => f.fieldKey !== field.fieldKey)
                                .map((f) => (
                                  <SelectItem key={f.fieldKey} value={f.fieldKey}>{f.label}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>

                          {field.conditionalOn && (() => {
                            const parentField = quoteFormFields.find((f) => f.fieldKey === field.conditionalOn);
                            if (!parentField) return null;
                            if (parentField.fieldType === 'yes_no') {
                              return (
                                <Select
                                  value={field.conditionalValue || ''}
                                  onValueChange={(v) => updateField(field.fieldKey, { conditionalValue: v })}
                                >
                                  <SelectTrigger data-testid={`select-conditional-value-${field.fieldKey}`}>
                                    <SelectValue placeholder="equals..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Yes">Yes</SelectItem>
                                    <SelectItem value="No">No</SelectItem>
                                  </SelectContent>
                                </Select>
                              );
                            }
                            if (parentField.fieldType === 'select' && parentField.options) {
                              return (
                                <Select
                                  value={field.conditionalValue || ''}
                                  onValueChange={(v) => updateField(field.fieldKey, { conditionalValue: v })}
                                >
                                  <SelectTrigger data-testid={`select-conditional-value-${field.fieldKey}`}>
                                    <SelectValue placeholder="equals..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {parentField.options.map((opt) => (
                                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            }
                            return (
                              <Input
                                value={field.conditionalValue || ''}
                                onChange={(e) => updateField(field.fieldKey, { conditionalValue: e.target.value })}
                                placeholder="equals..."
                                data-testid={`input-conditional-value-${field.fieldKey}`}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs font-medium text-muted-foreground">Add Custom Field</Label>
          <div className="flex items-center gap-2 mt-2">
            <Input
              className="flex-1"
              placeholder="Field name..."
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }}
              data-testid="input-new-quote-field"
            />
            <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as QuoteFormField['fieldType'])}>
              <SelectTrigger className="w-36" data-testid="select-new-field-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={addCustomField}
              disabled={!newFieldName.trim()}
              data-testid="button-add-quote-field"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Field
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 4: Stages ─────────────────────────────────────────────

function StagesStep({
  stages,
  setStages,
}: {
  stages: StageEntry[];
  setStages: (s: StageEntry[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addStage = () => {
    setStages([...stages, { stepName: '', isRequired: true }]);
  };

  const removeStage = (i: number) => {
    setStages(stages.filter((_, idx) => idx !== i));
  };

  const updateStage = (i: number, field: keyof StageEntry, value: any) => {
    const updated = [...stages];
    updated[i] = { ...updated[i], [field]: value };
    setStages(updated);
  };

  const moveStage = (from: number, to: number) => {
    if (from === to) return;
    const updated = [...stages];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
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
          Define the stages each deal goes through from application to closing. Drag to reorder. Documents and tasks will be linked to these stages in the next steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {stages.map((stage, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 p-2 rounded-md border transition-colors",
              dragIdx === i ? "border-primary bg-primary/5" : "border-transparent bg-muted/40"
            )}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null) { moveStage(dragIdx, i); setDragIdx(null); } }}
            onDragEnd={() => setDragIdx(null)}
            data-testid={`stage-row-${i}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing" />
            <Badge variant="outline" className="text-xs w-6 h-6 flex items-center justify-center p-0 flex-shrink-0">
              {i + 1}
            </Badge>
            <Input
              className="h-8 text-sm flex-1"
              placeholder="Stage name"
              value={stage.stepName}
              onChange={(e) => updateStage(i, 'stepName', e.target.value)}
              data-testid={`input-stage-name-${i}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={() => removeStage(i)}
              data-testid={`button-remove-stage-${i}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addStage} data-testid="button-add-stage">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Stage
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Step 5: Documents ──────────────────────────────────────────

function DocumentsStep({
  documents,
  setDocuments,
  stages,
}: {
  documents: DocEntry[];
  setDocuments: (d: DocEntry[]) => void;
  stages: StageEntry[];
}) {
  const [newDocName, setNewDocName] = useState('');

  const addDocument = (name?: string) => {
    const docName = name || newDocName.trim();
    if (!docName) return;
    setDocuments([...documents, { documentName: docName, documentCategory: 'borrower_docs', isRequired: true, stepIndex: null }]);
    setNewDocName('');
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
          Configure which documents are required for this program. Toggle each document on/off and assign the stage it belongs to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length === 0 ? (
          <div className="bg-muted/50 rounded-md p-4 text-sm text-muted-foreground text-center">
            No documents added yet. Add one manually below.
          </div>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {documents.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/30 group" data-testid={`doc-row-${i}`}>
                <span className="text-sm flex-1 min-w-0 truncate" title={doc.documentName}>{doc.documentName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={doc.isRequired}
                      onCheckedChange={(v) => updateDocument(i, 'isRequired', v)}
                      data-testid={`switch-doc-required-${i}`}
                    />
                    <span className="text-xs text-muted-foreground w-16">{doc.isRequired ? 'Required' : 'Optional'}</span>
                  </div>
                  <Select
                    value={doc.stepIndex !== null ? doc.stepIndex.toString() : 'none'}
                    onValueChange={(v) => updateDocument(i, 'stepIndex', v === 'none' ? null : parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs w-36" data-testid={`select-doc-stage-${i}`}>
                      <SelectValue placeholder="Select stage..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No stage</SelectItem>
                      {stages.map((s, si) => (
                        <SelectItem key={si} value={si.toString()}>{s.stepName || `Stage ${si + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={() => removeDocument(i)}
                    data-testid={`button-remove-doc-${i}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            className="h-8 text-sm flex-1"
            placeholder="Add a document..."
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDocument(); } }}
            data-testid="input-new-document"
          />
          <Button variant="outline" size="sm" onClick={() => addDocument()} disabled={!newDocName.trim()} data-testid="button-add-document">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 6: Tasks ──────────────────────────────────────────────

function TasksStep({
  tasks,
  setTasks,
  stages,
  teamMembers,
}: {
  tasks: TaskEntry[];
  setTasks: (t: TaskEntry[]) => void;
  stages: StageEntry[];
  teamMembers: { id: number; fullName: string; role: string }[];
}) {
  const [newTaskName, setNewTaskName] = useState('');

  const addTask = () => {
    if (!newTaskName.trim()) return;
    setTasks([...tasks, { taskName: newTaskName.trim(), taskCategory: 'other', priority: 'medium', assignToRole: 'admin', stepIndex: null }]);
    setNewTaskName('');
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
          Define the action items that need to be completed at each stage. Assign a team member and the stage each task belongs to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <div className="bg-muted/50 rounded-md p-4 text-sm text-muted-foreground text-center">
            No tasks added yet. Add tasks below or configure them later from the program settings.
          </div>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            <div className="flex items-center gap-3 px-3 pb-1">
              <span className="flex-1" />
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-medium text-muted-foreground w-44">Assigned To</span>
                <span className="text-xs font-medium text-muted-foreground w-36">Stage Assigned</span>
                <span className="w-5" />
              </div>
            </div>
            {tasks.map((task, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/30 group" data-testid={`task-row-${i}`}>
                <span className="text-sm flex-1 min-w-0 truncate" title={task.taskName}>{task.taskName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Select value={task.assignToRole} onValueChange={(v) => updateTask(i, 'assignToRole', v)}>
                    <SelectTrigger className="h-7 text-xs w-44" data-testid={`select-task-assignee-${i}`}>
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.length > 0 ? (
                        teamMembers.map((m) => (
                          <SelectItem key={m.id} value={`user_${m.id}`}>{m.fullName} ({m.role})</SelectItem>
                        ))
                      ) : null}
                      <SelectItem value="admin">Admin (role)</SelectItem>
                      <SelectItem value="processor">Processor (role)</SelectItem>
                      <SelectItem value="user">Borrower</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={task.stepIndex !== null ? task.stepIndex.toString() : 'none'}
                    onValueChange={(v) => updateTask(i, 'stepIndex', v === 'none' ? null : parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs w-36" data-testid={`select-task-stage-${i}`}>
                      <SelectValue placeholder="Select stage..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No stage</SelectItem>
                      {stages.map((s, si) => (
                        <SelectItem key={si} value={si.toString()}>{s.stepName || `Stage ${si + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={() => removeTask(i)}
                    data-testid={`button-remove-task-${i}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            className="h-8 text-sm flex-1"
            placeholder="Add a task..."
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }}
            data-testid="input-new-task"
          />
          <Button variant="outline" size="sm" onClick={addTask} disabled={!newTaskName.trim()} data-testid="button-add-task">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 7: Review Rules (AI Rules) ────────────────────────────

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
  const [addingForDoc, setAddingForDoc] = useState<string | null>(null);
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleSeverity, setNewRuleSeverity] = useState('warning');

  const addRule = (docName: string) => {
    if (!newRuleTitle.trim()) return;
    setReviewRules([...reviewRules, { ruleTitle: newRuleTitle.trim(), documentType: docName, severity: newRuleSeverity, stepIndex: null }]);
    setNewRuleTitle('');
    setNewRuleSeverity('warning');
    setAddingForDoc(null);
  };

  const removeRule = (i: number) => {
    setReviewRules(reviewRules.filter((_, idx) => idx !== i));
  };

  const updateRule = (i: number, field: keyof RuleEntry, value: any) => {
    const updated = [...reviewRules];
    updated[i] = { ...updated[i], [field]: value };
    setReviewRules(updated);
  };

  const docNames = ['General', ...new Set(documents.map((d) => d.documentName).filter(Boolean))];

  const severityConfig: Record<string, { label: string; color: string; desc: string }> = {
    fail: { label: 'Fail', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', desc: 'Blocks the deal if not passed' },
    warning: { label: 'Warning', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', desc: 'Alerts the internal team only' },
    info: { label: 'Info', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', desc: 'Informational note for the team' },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI Review Rules
          <Badge className="text-xs bg-blue-500 text-white hover:bg-blue-600">Optional</Badge>
        </CardTitle>
        <CardDescription>
          Define what the AI should check when reviewing each document type. Add rules to specific documents or general rules that apply to all. You can refine these later from program settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1 max-h-[28rem] overflow-y-auto">
          {docNames.map((docName) => {
            const rulesForDoc = reviewRules
              .map((r, origIdx) => ({ ...r, origIdx }))
              .filter((r) => r.documentType === docName);
            const isAdding = addingForDoc === docName;

            return (
              <div key={docName} className="rounded-md border border-border/60" data-testid={`doc-rules-section-${docName}`}>
                <div className="flex items-center justify-between px-3 py-2 bg-blue-600 dark:bg-blue-700 rounded-t-md">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-white/80 flex-shrink-0" />
                    <span className="text-sm font-medium truncate text-white">{docName === 'General' ? 'General (all documents)' : docName}</span>
                    {rulesForDoc.length > 0 && (
                      <Badge className="text-xs h-5 px-1.5 bg-white/20 text-white border-0">{rulesForDoc.length}</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-white hover:text-white hover:bg-white/10"
                    onClick={() => { setAddingForDoc(isAdding ? null : docName); setNewRuleTitle(''); setNewRuleSeverity('warning'); }}
                    data-testid={`button-add-rule-${docName}`}
                  >
                    {isAdding ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                    {isAdding ? 'Cancel' : 'Add Rule'}
                  </Button>
                </div>

                {rulesForDoc.length > 0 && (
                  <div className="px-3 py-1 space-y-1">
                    {rulesForDoc.map((rule) => (
                      <div key={rule.origIdx} className="flex items-center gap-2 py-1 group" data-testid={`rule-row-${rule.origIdx}`}>
                        <span className="text-xs flex-1 min-w-0 truncate" title={rule.ruleTitle}>{rule.ruleTitle}</span>
                        <Select value={rule.severity} onValueChange={(v) => updateRule(rule.origIdx, 'severity', v)}>
                          <SelectTrigger className="h-6 text-xs w-24 flex-shrink-0" data-testid={`select-rule-severity-${rule.origIdx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fail">
                              <span className="text-red-600 font-medium">Fail</span>
                            </SelectItem>
                            <SelectItem value="warning">
                              <span className="text-yellow-600 font-medium">Warning</span>
                            </SelectItem>
                            <SelectItem value="info">
                              <span className="text-blue-600 font-medium">Info</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={() => removeRule(rule.origIdx)}
                          data-testid={`button-remove-rule-${rule.origIdx}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {isAdding && (
                  <div className="px-3 py-2 border-t border-border/40 bg-muted/10 space-y-2">
                    <Input
                      className="h-8 text-sm"
                      placeholder="Describe what the AI should check..."
                      value={newRuleTitle}
                      onChange={(e) => setNewRuleTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(docName); } }}
                      autoFocus
                      data-testid="input-new-rule-title"
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {Object.entries(severityConfig).map(([key, config]) => (
                          <button
                            key={key}
                            type="button"
                            className={cn(
                              "px-2 py-1 rounded text-xs font-medium transition-all",
                              newRuleSeverity === key ? config.color + ' ring-1 ring-offset-1 ring-current' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            )}
                            onClick={() => setNewRuleSeverity(key)}
                            data-testid={`button-severity-${key}`}
                          >
                            {config.label}
                          </button>
                        ))}
                      </div>
                      <Button size="sm" className="h-7 text-xs" onClick={() => addRule(docName)} disabled={!newRuleTitle.trim()} data-testid="button-confirm-add-rule">
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {severityConfig[newRuleSeverity]?.desc}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 8: Summary ────────────────────────────────────────────

function SummaryStep({
  programName,
  loanType,
  stages,
  documents,
  tasks,
  reviewRules,
  quoteFormFields,
  selectedCreditPolicyId,
  creditPolicies,
}: {
  programName: string;
  loanType: string;
  stages: StageEntry[];
  documents: DocEntry[];
  tasks: TaskEntry[];
  reviewRules: RuleEntry[];
  quoteFormFields: QuoteFormField[];
  selectedCreditPolicyId: number | null;
  creditPolicies: any[];
}) {
  const policyName = selectedCreditPolicyId
    ? creditPolicies.find((p: any) => p.id === selectedCreditPolicyId)?.name || 'Unknown'
    : 'None';

  const visibleFields = quoteFormFields.filter((f) => f.visible);
  const requiredFields = quoteFormFields.filter((f) => f.required);
  const conditionalFields = quoteFormFields.filter((f) => f.conditionalOn);

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

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-muted/50 rounded-md p-3 text-center">
            <p className="text-2xl font-bold">{visibleFields.length}</p>
            <p className="text-xs text-muted-foreground">Form Fields</p>
          </div>
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

        {visibleFields.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Quote Form ({requiredFields.length} required, {conditionalFields.length} conditional)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {visibleFields.map((f) => (
                <Badge key={f.fieldKey} variant={f.required ? 'default' : 'outline'} className="text-xs">
                  {f.label}
                  {f.conditionalOn && ' *'}
                </Badge>
              ))}
            </div>
          </div>
        )}

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

import type { DragEvent, ChangeEvent } from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PricingConfiguration } from '@/components/onboarding/PricingConfiguration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
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
  Home,
  RefreshCw,
  Landmark,
  HardHat,
  Building2,
  FileIcon,
  ArrowLeft,
  ArrowRight,
  Lightbulb,
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

const simplifiedPropertyTypes = [
  { value: 'single-family', label: 'SFR' },
  { value: '2-4-unit', label: '2-4 Unit' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'pud', label: 'PUD' },
  { value: 'multi-family', label: 'Multi-Family (5+)' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed-use', label: 'Mixed Use' },
  { value: 'other', label: 'Other' },
  { value: 'special-purpose', label: 'Special Purpose' },
];

const templateOptions = [
  { id: 'dscr-residential', title: 'DSCR Residential', description: 'Standard rental investment loan program based on debt service coverage ratio.', icon: Home },
  { id: 'bridge-fix-flip', title: 'Bridge / Fix & Flip', description: 'Short-term financing for property acquisition and renovation projects.', icon: RefreshCw },
  { id: 'bank-statement', title: 'Bank Statement', description: 'Income verified through bank statement analysis instead of tax returns.', icon: Landmark },
  { id: 'construction', title: 'Construction', description: 'Ground-up construction financing with draw schedules and inspections.', icon: HardHat },
  { id: 'commercial', title: 'Commercial', description: 'Commercial real estate lending for office, retail, and industrial properties.', icon: Building2 },
  { id: 'blank', title: 'Blank Template', description: 'Start from scratch with an empty program configuration.', icon: FileIcon },
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

type DisplayGroup = 'loan_details' | 'property_details' | 'borrower_details';

type QuoteFormField = {
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'number' | 'currency' | 'email' | 'phone' | 'select' | 'yes_no' | 'percentage' | 'date' | 'radio' | 'address';
  required: boolean;
  visible: boolean;
  isDefault: boolean;
  displayGroup?: DisplayGroup;
  options?: string[];
  conditionalOn?: string;
  conditionalValue?: string;
  readOnly?: boolean;
  autoFilledFrom?: string;
  computedFrom?: string[];
  repeatable?: boolean;
  repeatGroupKey?: string;
};

const DISPLAY_GROUP_OPTIONS: { value: DisplayGroup; label: string }[] = [
  { value: 'loan_details', label: 'Loan Details' },
  { value: 'property_details', label: 'Property Details' },
  { value: 'borrower_details', label: 'Borrower Details' },
];

const FIELD_TYPE_OPTIONS: { value: QuoteFormField['fieldType']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency ($)' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'percentage', label: 'Percentage (%)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'date', label: 'Date' },
  { value: 'radio', label: 'Radio (Yes/No)' },
  { value: 'address', label: 'Address' },
];

const CONTACT_FIELDS: QuoteFormField[] = [
  { fieldKey: 'firstName', label: 'First Name', fieldType: 'text', required: true, visible: true, isDefault: true, displayGroup: 'borrower_details' },
  { fieldKey: 'lastName', label: 'Last Name', fieldType: 'text', required: true, visible: true, isDefault: true, displayGroup: 'borrower_details' },
  { fieldKey: 'email', label: 'Email', fieldType: 'email', required: true, visible: true, isDefault: true, displayGroup: 'borrower_details' },
  { fieldKey: 'phone', label: 'Phone Number', fieldType: 'phone', required: false, visible: true, isDefault: true, displayGroup: 'borrower_details' },
  { fieldKey: 'address', label: 'Address', fieldType: 'text', required: false, visible: true, isDefault: true, displayGroup: 'borrower_details' },
];

const DSCR_QUOTE_FIELDS: Omit<QuoteFormField, 'isDefault'>[] = [
  // ── Loan Details ──
  { fieldKey: 'loanAmount', label: 'Loan Amount', fieldType: 'currency', required: true, visible: true, displayGroup: 'loan_details' },
  { fieldKey: 'loanPurpose', label: 'Loan Purpose', fieldType: 'select', required: true, visible: true, options: ['Purchase', 'Refinance', 'Cash-Out Refinance'], displayGroup: 'loan_details' },
  { fieldKey: 'loanType', label: 'Loan Type (Fixed/ARM)', fieldType: 'select', required: true, visible: true, options: ['Fixed', 'ARM'], displayGroup: 'loan_details' },
  { fieldKey: 'interestOnly', label: 'Interest Only', fieldType: 'yes_no', required: false, visible: true, displayGroup: 'loan_details' },
  { fieldKey: 'prepaymentPenalty', label: 'Prepayment Penalty', fieldType: 'select', required: false, visible: true, options: ['None', '1 Year', '2 Years', '3 Years', '5 Years'], displayGroup: 'loan_details' },

  // ── Property Details ──
  { fieldKey: 'propertyAddress', label: 'Property Address', fieldType: 'address', required: true, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'propertyState', label: 'State', fieldType: 'text', required: false, visible: true, displayGroup: 'property_details', readOnly: true, autoFilledFrom: 'propertyAddress' },
  { fieldKey: 'propertyZip', label: 'Zip Code', fieldType: 'text', required: false, visible: true, displayGroup: 'property_details', readOnly: true, autoFilledFrom: 'propertyAddress' },
  { fieldKey: 'propertyType', label: 'Property Type', fieldType: 'select', required: true, visible: true, options: ['Single Family Residence', 'Duplex', 'Triplex', 'Quadplex', '5+ Unit Multifamily'], displayGroup: 'property_details' },
  { fieldKey: 'propertyUnits', label: 'Number of Units', fieldType: 'number', required: false, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'originalPurchaseDate', label: 'Original Purchase Date', fieldType: 'date', required: false, visible: true, displayGroup: 'property_details', conditionalOn: 'loanPurpose', conditionalValue: 'Refinance' },
  { fieldKey: 'originalPurchasePrice', label: 'Original Purchase Price', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details', conditionalOn: 'loanPurpose', conditionalValue: 'Refinance' },
  { fieldKey: 'asIsValue', label: 'As-Is Value', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details', conditionalOn: 'loanPurpose', conditionalValue: 'Refinance' },
  { fieldKey: 'purchasePrice', label: 'Purchase Price', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details', conditionalOn: 'loanPurpose', conditionalValue: 'Purchase' },
  { fieldKey: 'grossMonthlyRent', label: 'Monthly Rent', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'annualTaxes', label: 'Annual Taxes', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'annualInsurance', label: 'Annual Insurance', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'annualHOA', label: 'Annual HOA', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'dscr', label: 'DSCR', fieldType: 'number', required: false, visible: true, displayGroup: 'property_details', readOnly: true, computedFrom: ['loanAmount', 'grossMonthlyRent', 'annualTaxes', 'annualInsurance', 'annualHOA', 'interestRate'] },

  // ── Borrower Details ──
  { fieldKey: 'entityName', label: 'Entity Name', fieldType: 'text', required: true, visible: true, displayGroup: 'borrower_details' },
  { fieldKey: 'entityType', label: 'Entity Type', fieldType: 'select', required: true, visible: true, options: ['LLC', 'Corporation', 'Limited Partnership', 'Trust'], displayGroup: 'borrower_details' },
  { fieldKey: 'entityMemberCount', label: 'Number of Entity Members', fieldType: 'number', required: false, visible: true, displayGroup: 'borrower_details' },
  { fieldKey: 'member1FirstName', label: 'Member 1 First Name', fieldType: 'text', required: true, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1LastName', label: 'Member 1 Last Name', fieldType: 'text', required: true, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1Email', label: 'Member 1 Email', fieldType: 'email', required: true, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1Phone', label: 'Member 1 Phone', fieldType: 'phone', required: false, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1MailingAddress', label: 'Member 1 Mailing Address', fieldType: 'address', required: false, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1CreditScore', label: 'Member 1 Credit Score', fieldType: 'number', required: true, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1NetWorth', label: 'Member 1 Estimated Net Worth', fieldType: 'currency', required: false, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1Liquidity', label: 'Member 1 Liquidity', fieldType: 'currency', required: false, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1PropertiesOwned', label: 'Member 1 Properties Owned', fieldType: 'number', required: false, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1PropertiesSold2Yrs', label: 'Member 1 Properties Sold (Last 2 Years)', fieldType: 'number', required: false, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
  { fieldKey: 'member1IsGuarantor', label: 'Is Member 1 a Guarantor?', fieldType: 'yes_no', required: false, visible: true, displayGroup: 'borrower_details', repeatable: true, repeatGroupKey: 'member' },
];

const RTL_QUOTE_FIELDS: Omit<QuoteFormField, 'isDefault'>[] = [
  { fieldKey: 'loanType', label: 'Loan Type (Light/Heavy Rehab)', fieldType: 'select', required: true, visible: true, options: ['Light Rehab', 'Heavy Rehab', 'Ground Up'], displayGroup: 'loan_details' },
  { fieldKey: 'purpose', label: 'Purpose (Purchase/Refi)', fieldType: 'select', required: true, visible: true, options: ['Purchase', 'Refinance'], displayGroup: 'loan_details' },
  { fieldKey: 'asIsValue', label: 'As-Is Value', fieldType: 'currency', required: true, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'arv', label: 'After Repair Value (ARV)', fieldType: 'currency', required: true, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'rehabBudget', label: 'Rehab Budget', fieldType: 'currency', required: true, visible: true, displayGroup: 'loan_details' },
  { fieldKey: 'propertyType', label: 'Property Type', fieldType: 'select', required: true, visible: true, options: ['Single Family', '2-4 Unit', 'Condo', 'Townhouse', 'Multifamily 5+'], displayGroup: 'property_details' },
  { fieldKey: 'ficoScore', label: 'FICO Score', fieldType: 'number', required: true, visible: true, displayGroup: 'borrower_details' },
  { fieldKey: 'propertyUnits', label: 'Property Units', fieldType: 'number', required: false, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'isMidstream', label: 'Is Midstream?', fieldType: 'yes_no', required: false, visible: true, displayGroup: 'property_details' },
  { fieldKey: 'borrowingEntityType', label: 'Borrowing Entity Type', fieldType: 'select', required: false, visible: true, options: ['LLC', 'Corporation', 'Individual', 'Trust', 'Partnership'], displayGroup: 'borrower_details' },
  { fieldKey: 'completedProjects', label: 'Completed Projects', fieldType: 'number', required: false, visible: true, displayGroup: 'borrower_details' },
  { fieldKey: 'hasFullGuaranty', label: 'Full Guaranty?', fieldType: 'yes_no', required: false, visible: true, displayGroup: 'borrower_details' },
  { fieldKey: 'exitStrategy', label: 'Exit Strategy', fieldType: 'select', required: false, visible: true, options: ['Sell', 'Refinance', 'Hold'], displayGroup: 'borrower_details' },
  { fieldKey: 'appraisalValue', label: 'Appraisal Value', fieldType: 'currency', required: false, visible: true, displayGroup: 'property_details' },
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
  { stepName: 'Application', isRequired: true, description: 'Default stage for new deals' },
  { stepName: 'Processing', isRequired: true, description: 'Document collection and verification' },
  { stepName: 'Underwriting', isRequired: true, description: 'Credit and risk analysis' },
  { stepName: 'Closing', isRequired: true, description: 'Final documents and funding' },
];

// ─── Types ──────────────────────────────────────────────────────

interface StageEntry {
  id?: number;
  stepName: string;
  isRequired: boolean;
  description?: string;
}

interface DocEntry {
  id?: number;
  documentName: string;
  documentCategory: string;
  isRequired: boolean;
  stepIndex: number | null;
}

interface TaskEntry {
  id?: number;
  taskName: string;
  taskCategory: string;
  priority: string;
  assignToRole: string;
  stepIndex: number | null;
  formTemplateId?: number | null;
}

interface RuleEntry {
  ruleTitle: string;
  documentType: string;
  severity: string;
  stepIndex: number | null;
}

// ─── Wizard Steps ───────────────────────────────────────────────

type WizardStep = 'template' | 'credit-policy' | 'program-details' | 'quote-form' | 'stages' | 'documents' | 'tasks' | 'review-rules' | 'pricing' | 'summary';

const wizardSteps: { key: WizardStep; label: string; number: number }[] = [
  { key: 'template', label: 'Template', number: 1 },
  { key: 'credit-policy', label: 'Credit Policy', number: 2 },
  { key: 'program-details', label: 'Program Details', number: 3 },
  { key: 'quote-form', label: 'Quote Form', number: 4 },
  { key: 'stages', label: 'Stages', number: 5 },
  { key: 'documents', label: 'Documents', number: 6 },
  { key: 'tasks', label: 'Tasks', number: 7 },
  { key: 'review-rules', label: 'AI Rules', number: 8 },
  { key: 'pricing', label: 'Pricing', number: 9 },
  { key: 'summary', label: 'Review & Create', number: 10 },
];

// ─── DSCR Example Defaults ───────────────────────────────────────

const dscrDefaultStages: StageEntry[] = [
  { stepName: 'Application', isRequired: true, description: 'Default stage for new deals' },
  { stepName: 'Processing', isRequired: true, description: 'Document collection and verification' },
  { stepName: 'Underwriting', isRequired: true, description: 'Credit and risk analysis' },
  { stepName: 'Appraisal & Title', isRequired: true, description: 'Third-party valuation and title search' },
  { stepName: 'Closing', isRequired: true, description: 'Final documents and funding' },
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
  { ruleTitle: 'Verify bank statements are from the most recent 2 months', documentType: '2 Months Personal Bank Statements', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Confirm DSCR ratio meets minimum threshold of 1.0', documentType: 'Rent Roll', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Check that appraisal is dated within 120 days', documentType: 'Appraisal (if applicable)', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Verify property insurance coverage meets loan amount', documentType: 'Insurance Binder / Dec Page', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Confirm entity is in good standing in its state of formation', documentType: 'Certificate of Good Standing', severity: 'fail', stepIndex: null },
  { ruleTitle: 'Flag if LTV exceeds 80%', documentType: 'General', severity: 'fail', stepIndex: null },
];

// ─── Main Component ─────────────────────────────────────────────

export function ProgramCreationWizard({
  onComplete,
  onCancel,
  editProgram,
}: {
  onComplete: () => void;
  onCancel?: () => void;
  editProgram?: { id: number } | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [wizardStep, setWizardStep] = useState<WizardStep>('template');
  const [editDataLoaded, setEditDataLoaded] = useState(false);

  const isEditMode = !!editProgram;

  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<string>('dscr-residential');

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
  const [minDscr, setMinDscr] = useState('');
  const [minFico, setMinFico] = useState('');
  const [eligiblePropertyTypes, setEligiblePropertyTypes] = useState<string[]>([
    'single-family', '2-4-unit', 'multi-family', 'mixed-use',
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

  // Activation mode for review step
  const [activationMode, setActivationMode] = useState<'draft' | 'active'>('draft');

  const { data: editProgramData } = useQuery<{
    program: any;
    documents: any[];
    tasks: any[];
    workflowSteps: any[];
  }>({
    queryKey: ['/api/admin/programs', editProgram?.id],
    enabled: !!editProgram?.id,
  });

  const { data: editReviewRulesData } = useQuery<any[]>({
    queryKey: [`/api/admin/programs/${editProgram?.id}/review-rules`],
    enabled: !!editProgram?.id,
  });

  useEffect(() => {
    if (!editProgram?.id || editDataLoaded || !editProgramData?.program) return;
    const p = editProgramData.program;
    setProgramName(p.name || '');
    setProgramDescription(p.description || '');
    setLoanType(p.loanType || 'dscr');
    setMinLoanAmount(p.minLoanAmount != null ? String(p.minLoanAmount) : '');
    setMaxLoanAmount(p.maxLoanAmount != null ? String(p.maxLoanAmount) : '');
    setMinLtv(p.minLtv != null ? String(p.minLtv) : '');
    setMaxLtv(p.maxLtv != null ? String(p.maxLtv) : '');
    setMinInterestRate(p.minInterestRate != null ? String(p.minInterestRate) : '');
    setMaxInterestRate(p.maxInterestRate != null ? String(p.maxInterestRate) : '');
    setTermOptions(p.termOptions || '');
    setMinDscr(p.minDscr != null ? String(p.minDscr) : '');
    setMinFico(p.minFico != null ? String(p.minFico) : '');
    setEligiblePropertyTypes(p.eligiblePropertyTypes || []);
    setQuoteFormFields((p.quoteFormFields as QuoteFormField[]) || getDefaultQuoteFields(p.loanType || 'dscr'));
    setSelectedCreditPolicyId(p.creditPolicyId || null);
    setActivationMode(p.isActive ? 'active' : 'draft');

    if (editProgramData.workflowSteps?.length > 0) {
      setStages(editProgramData.workflowSteps.map((s: any) => ({
        id: s.id,
        stepName: s.definition?.name || '',
        isRequired: s.isRequired !== false,
        description: s.definition?.description || s.description || '',
      })));
    } else {
      setStages([]);
    }

    if (editProgramData.documents?.length > 0) {
      setDocuments(editProgramData.documents.map((d: any) => ({
        id: d.id,
        documentName: d.documentName || '',
        documentCategory: d.documentCategory || 'other',
        isRequired: d.isRequired !== false,
        stepIndex: d.stepId != null ? editProgramData.workflowSteps.findIndex((s: any) => s.id === d.stepId) : null,
      })));
    } else {
      setDocuments([]);
    }

    if (editProgramData.tasks?.length > 0) {
      setTasks(editProgramData.tasks.map((t: any) => ({
        id: t.id,
        taskName: t.taskName || '',
        taskCategory: t.taskCategory || 'other',
        priority: t.priority || 'medium',
        assignToRole: t.assignToRole || 'admin',
        stepIndex: t.stepId != null ? editProgramData.workflowSteps.findIndex((s: any) => s.id === t.stepId) : null,
        formTemplateId: t.formTemplateId || null,
      })));
    } else {
      setTasks([]);
    }

    if (editReviewRulesData && editReviewRulesData.length > 0) {
      setReviewRules(editReviewRulesData.map((r: any) => ({
        ruleTitle: r.ruleTitle || '',
        documentType: r.documentType || 'General',
        severity: 'fail',
        stepIndex: null,
      })));
    } else if (editProgram?.id) {
      setReviewRules([]);
    }

    setEditDataLoaded(true);
  }, [editProgram?.id, editProgramData, editReviewRulesData, editDataLoaded]);

  // Fetch credit policies
  const { data: creditPoliciesData } = useQuery<{ policies: any[] }>({
    queryKey: ['/api/admin/credit-policies'],
  });

  const { data: teamData } = useQuery<{ teamMembers: { id: number; fullName: string; role: string }[] }>({
    queryKey: ['/api/admin/team-members'],
  });
  const teamMembers = teamData?.teamMembers || [];

  const createProgramMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (isEditMode && editProgram?.id) {
        const res = await apiRequest('PUT', `/api/admin/programs/${editProgram.id}`, payload);
        return res.json();
      }
      const res = await apiRequest('POST', '/api/admin/programs', payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/programs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/programs-with-pricing'] });
      const programId = isEditMode ? editProgram?.id : data.program?.id;
      if (reviewRules.length > 0 && programId) {
        saveReviewRules(programId);
      }
      toast({ title: isEditMode ? 'Program updated successfully!' : 'Program created successfully!' });
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: isEditMode ? 'Failed to update program' : 'Failed to create program',
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

  const buildProgramPayload = (forceActive?: boolean) => ({
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
    minDscr: minDscr ? parseFloat(minDscr) : null,
    minFico: minFico ? parseInt(minFico) : null,
    eligiblePropertyTypes,
    quoteFormFields,
    creditPolicyId: selectedCreditPolicyId,
    isActive: forceActive !== undefined ? forceActive : activationMode === 'active',
    steps: stages.map((s) => ({
      id: s.id,
      stepName: s.stepName,
      isRequired: s.isRequired,
      description: s.description || '',
    })),
    documents: documents.map((d) => ({
      id: d.id,
      documentName: d.documentName,
      documentCategory: d.documentCategory,
      isRequired: d.isRequired,
      stepIndex: d.stepIndex,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      taskName: t.taskName,
      taskCategory: t.taskCategory,
      priority: t.priority,
      assignToRole: t.assignToRole,
      stepIndex: t.stepIndex,
      formTemplateId: t.formTemplateId || null,
    })),
  });

  const handleCreate = () => {
    if (!programName.trim()) {
      toast({ title: 'Program name is required', variant: 'destructive' });
      return;
    }

    createProgramMutation.mutate(buildProgramPayload());
  };

  const handleSaveAsDraft = () => {
    if (!programName.trim()) {
      toast({ title: 'Program name is required', variant: 'destructive' });
      return;
    }

    createProgramMutation.mutate(buildProgramPayload(false));
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
  };

  const applyTemplateDefaults = () => {
    switch (selectedTemplate) {
      case 'dscr-residential':
        handleLoanTypeChange('dscr');
        break;
      case 'bridge-fix-flip':
        handleLoanTypeChange('rtl');
        break;
      case 'bank-statement':
        handleLoanTypeChange('dscr');
        break;
      case 'construction':
        handleLoanTypeChange('rtl');
        break;
      case 'commercial':
        handleLoanTypeChange('dscr');
        break;
      case 'blank':
        setProgramName('');
        setProgramDescription('');
        setLoanType('dscr');
        setMinLoanAmount('');
        setMaxLoanAmount('');
        setMinLtv('');
        setMaxLtv('');
        setMinDscr('');
        setMinFico('');
        setEligiblePropertyTypes([]);
        setStages([...defaultStages]);
        setDocuments([]);
        setTasks([]);
        setReviewRules([]);
        break;
    }
  };

  const progressPercent = Math.round(((currentStepIndex + 1) / wizardSteps.length) * 100);

  // ─── Render ─────────────────────────────────────────────────

  const stepContent = (
    <>
      {wizardStep === 'template' && (
        <TemplateSelectionStep
          selectedTemplate={selectedTemplate}
          onSelect={handleTemplateSelect}
        />
      )}

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
          minDscr={minDscr}
          setMinDscr={setMinDscr}
          minFico={minFico}
          setMinFico={setMinFico}
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

      {wizardStep === 'pricing' && (
        <PricingConfiguration hideNavigation />
      )}

      {wizardStep === 'summary' && (
        <SummaryStep
          programName={programName}
          programDescription={programDescription}
          loanType={loanType}
          selectedTemplate={selectedTemplate}
          stages={stages}
          documents={documents}
          tasks={tasks}
          reviewRules={reviewRules}
          quoteFormFields={quoteFormFields}
          selectedCreditPolicyId={selectedCreditPolicyId}
          creditPolicies={creditPoliciesData?.policies || []}
          eligiblePropertyTypes={eligiblePropertyTypes}
          minLtv={minLtv}
          maxLtv={maxLtv}
          minLoanAmount={minLoanAmount}
          maxLoanAmount={maxLoanAmount}
          minDscr={minDscr}
          minFico={minFico}
          activationMode={activationMode}
          setActivationMode={setActivationMode}
          onEditStep={setWizardStep}
        />
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {onCancel && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onCancel} data-testid="button-back-from-wizard">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold leading-tight">{isEditMode ? 'Edit Loan Program' : 'Add New Loan Program'}</h2>
              <p className="text-xs text-muted-foreground">{isEditMode ? 'Update your loan program configuration' : 'Configure a new loan program for your borrowers'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        <div className="w-72 min-w-[288px] shrink-0 flex flex-col border-r border-border pr-6 bg-blue-50/40 rounded-l-[10px] p-6">
          <h3 className="text-[19px] font-semibold mb-6 text-center">
            {isEditMode ? 'Edit Program' : 'New Program'}
          </h3>

          <div className="space-y-2 flex-1 flex flex-col items-center">
            {wizardSteps.map((step, i) => {
              const isCompleted = i < currentStepIndex;
              const isCurrent = i === currentStepIndex;
              return (
                <button
                  key={step.key}
                  onClick={() => setWizardStep(step.key)}
                  className="flex items-center gap-3 w-full py-2.5 px-2 rounded-md transition-colors text-left"
                  data-testid={`sidebar-step-${step.key}`}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-semibold shrink-0 transition-colors",
                      isCompleted && "bg-emerald-500 text-white",
                      isCurrent && "bg-primary text-white",
                      !isCompleted && !isCurrent && "border-2 border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      step.number
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[17px]",
                      isCurrent && "font-medium text-foreground",
                      !isCurrent && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[15px] font-medium text-muted-foreground">Progress</span>
              <span className="text-[15px] text-muted-foreground">
                {currentStepIndex + 1} of {wizardSteps.length} steps
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-4">
          {stepContent}

          <div className="flex items-center justify-between pt-2 gap-4">
            <Button
              variant="outline"
              onClick={() => {
                if (currentStepIndex === 0 && onCancel) {
                  onCancel();
                } else {
                  goBack();
                }
              }}
              disabled={currentStepIndex === 0 && !onCancel}
              className="text-[16px]"
              data-testid="button-wizard-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>

            <div className="flex items-center gap-3">
              {wizardStep !== 'summary' && (
                <Button
                  variant="ghost"
                  onClick={goNext}
                  className="text-[14px] text-muted-foreground"
                  data-testid="button-wizard-skip"
                >
                  Skip this step
                </Button>
              )}

              {wizardStep === 'summary' ? (
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleSaveAsDraft}
                    disabled={createProgramMutation.isPending || !programName.trim()}
                    className="text-[16px]"
                    data-testid="button-wizard-save-draft"
                  >
                    {createProgramMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : null}
                    Save as Draft
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createProgramMutation.isPending || !programName.trim()}
                    className="text-[16px] bg-primary"
                    data-testid="button-wizard-create"
                  >
                    {createProgramMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        {isEditMode ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        {isEditMode ? 'Update Program' : 'Create Program'}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    if (wizardStep === 'template') {
                      applyTemplateDefaults();
                    }
                    goNext();
                  }}
                  className="text-[16px]"
                  data-testid="button-wizard-continue"
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Template Selection ─────────────────────────────────

function TemplateSelectionStep({
  selectedTemplate,
  onSelect,
}: {
  selectedTemplate: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-[26px] font-bold" data-testid="text-template-title">Choose a Template</h2>
      <p className="text-[16px] text-muted-foreground mt-0.5 mb-5">
        Select a starting template for your loan program. You can customize everything in the following steps.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templateOptions.map((tmpl) => {
          const isSelected = selectedTemplate === tmpl.id;
          const IconComp = tmpl.icon;
          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onSelect(tmpl.id)}
              className={cn(
                "rounded-[10px] border p-5 text-left transition-all",
                isSelected
                  ? "border-primary bg-blue-50/50 shadow-sm dark:bg-blue-950/20"
                  : "border-border hover:border-primary/50"
              )}
              data-testid={`template-card-${tmpl.id}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-9 h-9 rounded-md flex items-center justify-center",
                  isSelected ? "bg-primary/10" : "bg-muted"
                )}>
                  <IconComp className={cn("h-5 w-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                </div>
              </div>
              <p className="text-[16px] font-bold">{tmpl.title}</p>
              <p className="text-[13px] text-muted-foreground mt-1">{tmpl.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Credit Policy ──────────────────────────────────────

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
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [extractedRules, setExtractedRules] = useState<{ documentType: string; ruleTitle: string; ruleDescription: string; category?: string }[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyDescription, setNewPolicyDescription] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [editingRuleData, setEditingRuleData] = useState<{ ruleTitle: string; ruleDescription: string }>({ ruleTitle: '', ruleDescription: '' });
  const [justCreatedPolicy, setJustCreatedPolicy] = useState<{ id: number; name: string; ruleCount: number } | null>(null);
  const [viewPolicyOpen, setViewPolicyOpen] = useState(false);
  const [isAppending, setIsAppending] = useState(false);
  const [appendExtractedRules, setAppendExtractedRules] = useState<{ documentType: string; ruleTitle: string; ruleDescription: string; category?: string }[]>([]);
  const [appendFileName, setAppendFileName] = useState('');

  const { data: policyDetails } = useQuery<any>({
    queryKey: [`/api/admin/credit-policies/${selectedId}`],
    enabled: !!selectedId,
  });

  const selectedPolicy = selectedId
    ? creditPolicies.find((p: any) => p.id === selectedId)
      || (justCreatedPolicy && justCreatedPolicy.id === selectedId ? { id: justCreatedPolicy.id, name: justCreatedPolicy.name, ruleCount: justCreatedPolicy.ruleCount } : null)
      || (policyDetails ? { id: policyDetails.id, name: policyDetails.name, ruleCount: policyDetails.rules?.length || 0 } : null)
    : null;

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
      setJustCreatedPolicy({ id: data.id, name: newPolicyName, ruleCount: extractedRules.length });
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

  const handleAppendFileUpload = useCallback(async (file: File) => {
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

    setIsAppending(true);
    setAppendFileName(file.name);
    setAppendExtractedRules([]);

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
        setAppendExtractedRules(data.rules);
        toast({ title: `Extracted ${data.rules.length} additional rules from ${file.name}` });
      }
    } catch (error: any) {
      let msg = 'Failed to extract rules';
      try {
        const jsonMatch = error.message?.match(/\{.*\}/s);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) msg = parsed.error;
        } else if (error.message) {
          msg = error.message;
        }
      } catch { /* use default msg */ }
      toast({ title: 'Analysis failed', description: msg, variant: 'destructive' });
      setAppendFileName('');
    } finally {
      setIsAppending(false);
    }
  }, [toast]);

  const appendRulesMutation = useMutation({
    mutationFn: async () => {
      const existingRules = (policyDetails?.rules || []).map((r: any) => ({
        documentType: r.documentType || 'General',
        ruleTitle: r.ruleTitle,
        ruleDescription: r.ruleDescription || null,
        category: r.category || null,
        isActive: r.isActive !== false,
      }));
      const mergedRules = [...existingRules, ...appendExtractedRules];
      return apiRequest('PUT', `/api/admin/credit-policies/${selectedId}`, {
        rules: mergedRules,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/credit-policies/${selectedId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-policies'] });
      if (justCreatedPolicy && justCreatedPolicy.id === selectedId) {
        setJustCreatedPolicy({ ...justCreatedPolicy, ruleCount: justCreatedPolicy.ruleCount + appendExtractedRules.length });
      }
      toast({ title: `${appendExtractedRules.length} rules added to policy` });
      setAppendExtractedRules([]);
      setAppendFileName('');
    },
    onError: () => {
      toast({ title: 'Failed to add rules to policy', variant: 'destructive' });
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
    setExtractError(null);
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
      let msg = 'Failed to extract rules';
      try {
        const jsonMatch = error.message?.match(/\{.*\}/s);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) msg = parsed.error;
        } else if (error.message) {
          msg = error.message;
        }
      } catch { /* use default msg */ }
      setExtractError(msg);
      toast({ title: 'Analysis failed', description: msg, variant: 'destructive' });
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

  const policyRuleCount = selectedPolicy?.ruleCount || policyDetails?.rules?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[26px] font-bold tracking-tight">Link Credit Policy</h2>
        <p className="text-[16px] text-muted-foreground mt-1">
          Optionally link this program to an existing credit policy. The policy's guidelines will be imported as AI review rules.
        </p>
      </div>

      {creditPolicies.length > 0 && !showCreateForm && (
        <div className="space-y-2">
          <Label className="text-[14px] font-medium">Select Credit Policy</Label>
          <Select
            value={selectedId?.toString() || 'none'}
            onValueChange={(val) => onSelect(val === 'none' ? null : parseInt(val))}
          >
            <SelectTrigger className="w-full" data-testid="select-credit-policy">
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
          <p className="text-[13px] text-muted-foreground">
            Credit policies define the underwriting guidelines and eligibility rules for this program.
          </p>
        </div>
      )}

      {selectedPolicy && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-[10px] px-5 py-3" data-testid="linked-policy-bar">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-600" />
              <span className="text-[14px] font-semibold text-blue-700 dark:text-blue-400">Linked: {selectedPolicy.name}</span>
            </div>
            <button
              className="text-[13px] text-blue-600 hover:text-blue-800 font-medium"
              data-testid="button-view-policy"
              onClick={() => setViewPolicyOpen(true)}
            >
              View Policy →
            </button>
          </div>

          <div className="border rounded-[10px] p-5" data-testid="policy-import-summary">
            <p className="text-[14px] font-bold mb-3">Policy will import:</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <span className="text-[13px]">{policyRuleCount} review rules</span>
              </div>
              {policyDetails?.rules && (
                <>
                  {(() => {
                    const rules = policyDetails.rules || [];
                    const categories = new Set(rules.map((r: any) => r.documentType || r.category).filter(Boolean));
                    return (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        <span className="text-[13px]">{categories.size} rule categories</span>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          <div className="border rounded-[10px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-medium">Add rules from another document</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => appendFileInputRef.current?.click()}
                disabled={isAppending}
                data-testid="button-add-document"
              >
                {isAppending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Add Document
              </Button>
              <input
                ref={appendFileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAppendFileUpload(file);
                  e.target.value = '';
                }}
                data-testid="input-append-file"
              />
            </div>

            {isAppending && (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <div>
                  <p className="text-[13px] font-medium">Analyzing {appendFileName}...</p>
                  <p className="text-[12px] text-muted-foreground">Extracting rules — this may take 60–90 seconds</p>
                </div>
              </div>
            )}

            {!isAppending && appendExtractedRules.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-md">
                  <FileText className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-[13px] font-medium flex-1 truncate">{appendFileName}</span>
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {appendExtractedRules.length} new rules
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => { setAppendExtractedRules([]); setAppendFileName(''); }}
                    data-testid="button-discard-append"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {appendExtractedRules.map((rule, idx) => (
                    <div key={idx} className="px-3 py-2 text-[13px]">
                      <p className="font-medium">{rule.ruleTitle}</p>
                      {rule.ruleDescription && <p className="text-muted-foreground mt-0.5">{rule.ruleDescription}</p>}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => appendRulesMutation.mutate()}
                    disabled={appendRulesMutation.isPending || !policyDetails?.rules}
                    data-testid="button-merge-rules"
                  >
                    {appendRulesMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Add {appendExtractedRules.length} Rules to Policy
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={viewPolicyOpen} onOpenChange={setViewPolicyOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" data-testid="dialog-view-policy">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-bold">{selectedPolicy?.name || 'Credit Policy'}</DialogTitle>
            {policyDetails?.sourceFileName && (
              <p className="text-[13px] text-muted-foreground mt-1">
                Source: {policyDetails.sourceFileName}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {!policyDetails ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-[13px] text-muted-foreground">Loading policy rules...</p>
              </div>
            ) : policyDetails.rules && policyDetails.rules.length > 0 ? (
              <div className="space-y-4 pb-4">
                <p className="text-[13px] text-muted-foreground">{policyDetails.rules.length} rules total</p>
                {(() => {
                  const grouped = (policyDetails.rules as any[]).reduce<Record<string, any[]>>((acc, rule) => {
                    const group = rule.documentType || 'General';
                    if (!acc[group]) acc[group] = [];
                    acc[group].push(rule);
                    return acc;
                  }, {});
                  return Object.entries(grouped).map(([group, rules]) => (
                    <div key={group} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[14px] font-semibold">{group}</h4>
                        <Badge variant="secondary" className="text-xs">{rules.length}</Badge>
                      </div>
                      <div className="space-y-1.5">
                        {rules.map((rule: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted/30 rounded-md text-[13px]">
                            <p className="font-medium">{rule.ruleTitle}</p>
                            {rule.ruleDescription && (
                              <p className="text-muted-foreground mt-0.5">{rule.ruleDescription}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground py-6 text-center">No rules found in this policy.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!selectedPolicy && !showCreateForm && (
        <>
          {creditPolicies.length > 0 && (
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-[13px] text-muted-foreground">or create a new policy</span>
              <Separator className="flex-1" />
            </div>
          )}

          <div
            className={cn(
              "relative border-2 border-dashed rounded-[10px] p-8 text-center transition-colors cursor-pointer",
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/40'
            )}
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
            <p className="text-[14px] font-medium">Upload your credit policy document</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Drop a PDF, Word document, or text file here, or click to browse
            </p>
            <p className="text-[13px] text-muted-foreground mt-1">
              The AI will read your document and extract individual lending rules automatically
            </p>
          </div>
        </>
      )}

      {showCreateForm && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-[10px]">
            <FileText className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-[14px] font-medium flex-1 truncate">{uploadedFileName}</span>
            {isExtracting && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-[13px] text-muted-foreground">Analyzing document — this may take 60–90 seconds...</span>
              </div>
            )}
            {!isExtracting && extractedRules.length > 0 && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {extractedRules.length} rules extracted successfully
                </Badge>
              </div>
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
                <p className="text-[14px] font-medium">Analyzing your credit policy document...</p>
                <p className="text-[13px] text-muted-foreground">The AI is reading and extracting individual lending rules</p>
              </div>
            </div>
          )}

          {!isExtracting && extractError && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="rounded-full bg-destructive/10 p-2">
                <X className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-destructive">{extractError}</p>
                <p className="text-[13px] text-muted-foreground mt-1">You can try again or upload a different file.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                data-testid="button-retry-extract"
                onClick={() => {
                  if (fileInputRef.current?.files?.[0]) {
                    handleFileUpload(fileInputRef.current.files[0]);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
              >
                Try Again
              </Button>
            </div>
          )}

          {!isExtracting && !extractError && extractedRules.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[14px] font-medium">Policy Name</Label>
                <Input
                  value={newPolicyName}
                  onChange={(e) => setNewPolicyName(e.target.value)}
                  placeholder="e.g. DSCR Credit Policy 2026"
                  data-testid="input-policy-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[14px] font-medium">Description (optional)</Label>
                <Input
                  value={newPolicyDescription}
                  onChange={(e) => setNewPolicyDescription(e.target.value)}
                  placeholder="Brief description of this policy"
                  data-testid="input-policy-description"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[14px] font-medium flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Extracted Rules
                </Label>
                <div className="border rounded-[10px] divide-y max-h-80 overflow-y-auto">
                  {Object.entries(rulesByGroup).map(([group, groupRules]) => (
                    <div key={group}>
                      <button
                        type="button"
                        className="flex items-center justify-between gap-2 w-full px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))}
                        data-testid={`toggle-rule-group-${group}`}
                      >
                        <span className="text-[13px] font-medium">{group}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs">{groupRules.length}</Badge>
                          {expandedGroups[group] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </div>
                      </button>
                      {expandedGroups[group] && (
                        <div className="px-4 pb-3 space-y-1.5">
                          {groupRules.map(({ rule, globalIndex }) => (
                              <div key={globalIndex} className="text-[13px] p-2.5 bg-muted/30 rounded-md group relative">
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
                <p className="text-[13px] text-muted-foreground">
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
    </div>
  );
}

// ─── Step 3: Program Details ───────────────────────────────────

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
  minDscr,
  setMinDscr,
  minFico,
  setMinFico,
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
  minDscr: string;
  setMinDscr: (v: string) => void;
  minFico: string;
  setMinFico: (v: string) => void;
  minInterestRate: string;
  setMinInterestRate: (v: string) => void;
  maxInterestRate: string;
  setMaxInterestRate: (v: string) => void;
  termOptions: string;
  setTermOptions: (v: string) => void;
  eligiblePropertyTypes: string[];
  onPropertyTypeToggle: (type: string) => void;
}) {
  const formatCurrency = (val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, ''));
    if (isNaN(num)) return val;
    return `$${num.toLocaleString()}`;
  };

  const parseCurrency = (val: string) => {
    return val.replace(/[^0-9]/g, '');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[26px] font-bold" data-testid="text-program-details-title">Program Details</h2>
        <p className="text-[16px] text-muted-foreground mt-0.5">
          Configure the core lending parameters for this program.
        </p>
        <p className="text-[13px] text-muted-foreground/70 mt-2">Fields marked with * are required.</p>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Program Name <span className="text-muted-foreground font-normal text-[12px]">(Visible to Borrowers/Brokers)</span> *</Label>
          <Input
            className="h-11"
            placeholder="ex. 30-Year Rental Loan"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            data-testid="input-program-name"
          />
        </div>
        <div className="w-[200px] space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Program Type</Label>
          <LoanTypeSelector value={loanType} onChange={onLoanTypeChange} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[14px] underline decoration-muted-foreground/30">Description</Label>
        <Textarea
          className="min-h-[80px]"
          placeholder="Brief description of this loan product..."
          value={programDescription}
          onChange={(e) => setProgramDescription(e.target.value)}
          rows={3}
          data-testid="input-program-description"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Min LTV</Label>
          <Input className="h-11" placeholder="50%" value={minLtv} onChange={(e) => setMinLtv(e.target.value)} data-testid="input-min-ltv" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Max LTV</Label>
          <Input className="h-11" placeholder="80%" value={maxLtv} onChange={(e) => setMaxLtv(e.target.value)} data-testid="input-max-ltv" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Min DSCR</Label>
          <Input className="h-11" placeholder="1.0" value={minDscr} onChange={(e) => setMinDscr(e.target.value)} data-testid="input-min-dscr" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Min Loan Amount</Label>
          <Input
            className="h-11"
            placeholder="$100,000"
            value={minLoanAmount ? formatCurrency(minLoanAmount) : ''}
            onChange={(e) => setMinLoanAmount(parseCurrency(e.target.value))}
            data-testid="input-min-loan-amount"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Max Loan Amount</Label>
          <Input
            className="h-11"
            placeholder="$2,000,000"
            value={maxLoanAmount ? formatCurrency(maxLoanAmount) : ''}
            onChange={(e) => setMaxLoanAmount(parseCurrency(e.target.value))}
            data-testid="input-max-loan-amount"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[14px] underline decoration-muted-foreground/30">Min FICO</Label>
          <Input className="h-11" placeholder="660" value={minFico} onChange={(e) => setMinFico(e.target.value)} data-testid="input-min-fico" />
        </div>
      </div>

      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Property Types
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {simplifiedPropertyTypes.map((pt) => (
            <label
              key={pt.value}
              className="flex items-center gap-2.5 cursor-pointer"
              data-testid={`checkbox-property-${pt.value}`}
            >
              <Checkbox
                checked={eligiblePropertyTypes.includes(pt.value)}
                onCheckedChange={() => onPropertyTypeToggle(pt.value)}
              />
              <span className="text-[14px]">{pt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
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
      { fieldKey, label: name, fieldType: newFieldType, required: false, visible: true, isDefault: false, displayGroup: 'loan_details' as DisplayGroup },
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

  const getFieldTypeDescription = (field: QuoteFormField) => {
    const base = getFieldTypeLabel(field.fieldType);
    if (field.fieldType === 'select' && field.options?.length) {
      return `${base} (${field.options.join(' / ')})`;
    }
    if (field.fieldType === 'number' && field.fieldKey === 'ficoScore') {
      return 'Number (min: 300, max: 850)';
    }
    if (field.fieldType === 'percentage' && field.fieldKey === 'dscr') {
      return 'Decimal';
    }
    return base;
  };

  const getFieldStatus = (field: QuoteFormField): 'required' | 'optional' | 'hidden' => {
    if (!field.visible) return 'hidden';
    return field.required ? 'required' : 'optional';
  };

  const handleStatusChange = (fieldKey: string, status: string) => {
    switch (status) {
      case 'required':
        updateField(fieldKey, { visible: true, required: true });
        break;
      case 'optional':
        updateField(fieldKey, { visible: true, required: false });
        break;
      case 'hidden':
        updateField(fieldKey, { visible: false, required: false });
        break;
    }
  };

  const availableConditionalFields = quoteFormFields.filter(
    (f) => f.visible && (f.fieldType === 'select' || f.fieldType === 'yes_no')
  );

  const allFields = [...contactFields, ...programFields];
  const requiredCount = allFields.filter((f) => f.required && f.visible).length;
  const optionalCount = allFields.filter((f) => !f.required && f.visible).length;
  const [showAddField, setShowAddField] = useState(false);

  const renderFieldRow = (field: QuoteFormField, pIdx: number, isDraggable: boolean) => {
    const isConfiguring = configuringIndex === pIdx;
    const condField = field.conditionalOn
      ? quoteFormFields.find((f) => f.fieldKey === field.conditionalOn)
      : null;
    const status = getFieldStatus(field);

    return (
      <div key={field.fieldKey}>
        <div
          draggable={isDraggable}
          onDragStart={isDraggable ? () => handleDragStart(pIdx) : undefined}
          onDragOver={isDraggable ? handleDragOver : undefined}
          onDrop={isDraggable ? () => handleDrop(pIdx) : undefined}
          className={cn(
            "flex items-center gap-3 py-3 px-4 border-b border-border/60 transition-colors",
            dragIndex === pIdx && "bg-primary/5 border-primary",
            field.conditionalOn && "ml-6 border-l-2 border-l-primary/40"
          )}
          data-testid={`field-row-${field.fieldKey}`}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab flex-shrink-0" />

          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[15px] font-semibold truncate">{field.label}</span>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-[12px] font-medium",
                status === 'required' && "text-red-500",
                status === 'optional' && "text-muted-foreground",
                status === 'hidden' && "text-muted-foreground/50"
              )}>
                {status === 'required' ? 'Required' : status === 'optional' ? 'Optional' : 'Hidden'}
              </span>
              <span className="text-[12px] text-muted-foreground">
                Type: {getFieldTypeDescription(field)}
              </span>
              {field.conditionalOn && condField && (
                <span className="text-[11px] text-primary/70">
                  if {condField.label} = {field.conditionalValue}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isDraggable && (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => pIdx > 0 && moveField(pIdx, pIdx - 1)}
                  disabled={pIdx === 0}
                  data-testid={`button-move-up-${field.fieldKey}`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => pIdx < programFields.length - 1 && moveField(pIdx, pIdx + 1)}
                  disabled={pIdx === programFields.length - 1}
                  data-testid={`button-move-down-${field.fieldKey}`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <Select
              value={getFieldStatus(field)}
              onValueChange={(v) => handleStatusChange(field.fieldKey, v)}
            >
              <SelectTrigger
                className={cn(
                  "w-[120px] h-9 text-[13px]",
                  status === 'required' && "border-primary/40 text-primary"
                )}
                data-testid={`select-status-${field.fieldKey}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setConfiguringIndex(isConfiguring ? null : pIdx)}
              data-testid={`button-configure-${field.fieldKey}`}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>

            {!field.isDefault && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => removeField(field.fieldKey)}
                data-testid={`button-remove-field-${field.fieldKey}`}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>

        {isConfiguring && (
          <div className="ml-6 mt-1 mb-2 p-3 bg-muted/20 rounded-md border space-y-3">
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
              <div className="space-y-1">
                <Label className="text-xs">Display Section</Label>
                <Select
                  value={field.displayGroup || 'loan_details'}
                  onValueChange={(v) => updateField(field.fieldKey, { displayGroup: v as DisplayGroup })}
                >
                  <SelectTrigger data-testid={`select-display-group-${field.fieldKey}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPLAY_GROUP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">Where this field appears on the deal detail page</p>
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
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold leading-tight">Quote Form Fields</h2>
        <p className="text-[16px] text-muted-foreground mt-1">
          Configure which fields brokers see when requesting a quote for this program. Drag to reorder.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[14px] text-muted-foreground">
          {allFields.length} fields configured &mdash; {requiredCount} required, {optionalCount} optional
        </span>
        <Button
          variant="outline"
          onClick={() => setShowAddField(!showAddField)}
          data-testid="button-toggle-add-field"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Custom Field
        </Button>
      </div>

      {showAddField && (
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-[10px] border">
          <Input
            className="flex-1"
            placeholder="Field name..."
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); setShowAddField(false); } }}
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
            variant="default"
            onClick={() => { addCustomField(); setShowAddField(false); }}
            disabled={!newFieldName.trim()}
            data-testid="button-add-quote-field"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      )}

      <div className="rounded-[10px] border bg-white overflow-hidden">
        {contactFields.map((field, cIdx) => renderFieldRow(field, cIdx, false))}
        {programFields.map((field, pIdx) => renderFieldRow(field, pIdx, true))}
      </div>

      <div className="rounded-[10px] border border-blue-200 bg-blue-50/60 p-4 flex gap-3">
        <Lightbulb className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="text-[14px] font-semibold text-blue-700">Tip: </span>
          <span className="text-[14px] text-blue-800">
            The quote form is what brokers fill out to request pricing on a deal. Required fields must be filled before a quote can be generated. Hidden fields won't appear on the form but can still be used in pricing rules.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Stages ─────────────────────────────────────────────

const STAGE_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#EC4899', '#6366F1'];

function StagesStep({
  stages,
  setStages,
}: {
  stages: StageEntry[];
  setStages: (s: StageEntry[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);

  const addStage = () => {
    setStages([...stages, { stepName: '', isRequired: true, description: '' }]);
    setTimeout(() => {
      nameRefs.current[stages.length]?.focus();
    }, 50);
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
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold leading-tight">Workflow Stages</h2>
        <p className="text-[16px] text-muted-foreground mt-1">
          Define the stages each deal goes through from application to closing. Drag to reorder.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[14px] text-muted-foreground">
          {stages.length} stages configured
        </span>
        <Button variant="outline" onClick={addStage} data-testid="button-add-stage">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Stage
        </Button>
      </div>

      <div className="relative pl-6">
        {stages.length > 1 && (
          <div
            className="absolute left-[11px] top-[24px] w-[2px] bg-blue-200"
            style={{ height: `calc(100% - 48px)` }}
          />
        )}

        <div className="space-y-0">
          {stages.map((stage, i) => {
            const color = STAGE_COLORS[i % STAGE_COLORS.length];

            return (
              <div
                key={i}
                className="relative"
                draggable
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTargetIdx(i);
                }}
                onDragLeave={() => {
                  if (dropTargetIdx === i) setDropTargetIdx(null);
                }}
                onDrop={() => {
                  if (dragIdx !== null) {
                    moveStage(dragIdx, i);
                    setDragIdx(null);
                  }
                  setDropTargetIdx(null);
                }}
                onDragEnd={() => { setDragIdx(null); setDropTargetIdx(null); }}
                data-testid={`stage-row-${i}`}
              >
                <div
                  className="absolute left-[-13px] top-[22px] w-3 h-3 rounded-full z-10 border-2 border-white"
                  style={{ backgroundColor: color }}
                />

                <div
                  className={cn(
                    "ml-4 rounded-[10px] border bg-white py-3 px-4 mb-3 transition-all group",
                    dragIdx === i && "border-blue-400 shadow-md bg-blue-50/30 opacity-60",
                    dropTargetIdx === i && dragIdx !== i && "border-blue-300 bg-blue-50/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1.5 cursor-grab active:cursor-grabbing flex-shrink-0">
                      <GripVertical className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span style={{ color }} className="text-[14px] flex-shrink-0">●</span>
                        <span className="text-[13px] text-muted-foreground/60 flex-shrink-0 font-medium">{i + 1}.</span>
                        <input
                          ref={(el) => { nameRefs.current[i] = el; }}
                          className="text-[15px] font-bold text-foreground bg-transparent border-0 outline-none w-full placeholder:text-muted-foreground/40 focus:bg-muted/30 focus:px-2 rounded transition-all -ml-0.5 px-0"
                          placeholder="Stage name"
                          value={stage.stepName}
                          onChange={(e) => updateStage(i, 'stepName', e.target.value)}
                          data-testid={`input-stage-name-${i}`}
                        />
                      </div>
                      <div className="ml-6">
                        <input
                          className="text-[13px] text-muted-foreground bg-transparent border-0 outline-none w-full placeholder:text-muted-foreground/30 focus:bg-muted/30 focus:px-2 rounded transition-all px-0"
                          placeholder="Add a description..."
                          value={stage.description || ''}
                          onChange={(e) => updateStage(i, 'description', e.target.value)}
                          data-testid={`input-stage-desc-${i}`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => i > 0 && moveStage(i, i - 1)}
                        disabled={i === 0}
                        data-testid={`button-move-up-stage-${i}`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => i < stages.length - 1 && moveStage(i, i + 1)}
                        disabled={i === stages.length - 1}
                        data-testid={`button-move-down-stage-${i}`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <button
                        className="text-red-400 hover:text-red-600 transition-colors p-1"
                        onClick={() => removeStage(i)}
                        data-testid={`button-remove-stage-${i}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[10px] border border-blue-200 bg-blue-50/60 p-4 flex gap-3">
        <Lightbulb className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="text-[14px] font-semibold text-blue-700">Tip: </span>
          <span className="text-[14px] text-blue-800">
            Stages define your deal workflow from application to closing. Documents and tasks in the next steps will be linked to these stages. Required stages must be completed before a deal can advance.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Documents ──────────────────────────────────────────

const DOC_CATEGORY_LABELS: Record<string, string> = {
  borrower_docs: 'Borrower',
  financial_docs: 'Financial',
  entity_docs: 'Entity',
  property_docs: 'Property',
  closing_docs: 'Closing',
  other: 'Other',
};

const DOC_CATEGORY_COLORS: Record<string, string> = {
  borrower_docs: 'bg-blue-100 text-blue-700',
  financial_docs: 'bg-emerald-100 text-emerald-700',
  entity_docs: 'bg-purple-100 text-purple-700',
  property_docs: 'bg-amber-100 text-amber-700',
  closing_docs: 'bg-rose-100 text-rose-700',
  other: 'bg-gray-100 text-gray-600',
};

function SortableDocRow({
  id,
  doc,
  globalIdx,
  stages,
  updateDocument,
  removeDocument,
}: {
  id: number;
  doc: DocEntry;
  globalIdx: number;
  stages: StageEntry[];
  updateDocument: (i: number, field: keyof DocEntry, value: any) => void;
  removeDocument: (i: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 group transition-colors"
      data-testid={`doc-row-${globalIdx}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0" data-testid={`drag-doc-${globalIdx}`}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <FileText className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
      <input
        className="text-[14px] text-foreground bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40 focus:bg-muted/30 focus:px-2 rounded transition-all px-0"
        value={doc.documentName}
        onChange={(e) => updateDocument(globalIdx, 'documentName', e.target.value)}
        placeholder="Document name"
        data-testid={`input-doc-name-${globalIdx}`}
      />
      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0", DOC_CATEGORY_COLORS[doc.documentCategory] || DOC_CATEGORY_COLORS.other)}>
        {DOC_CATEGORY_LABELS[doc.documentCategory] || 'Other'}
      </span>
      <Select
        value={doc.isRequired ? 'required' : 'optional'}
        onValueChange={(v) => updateDocument(globalIdx, 'isRequired', v === 'required')}
      >
        <SelectTrigger className={cn("w-[100px] h-7 text-[12px]", doc.isRequired && "border-primary/30 text-primary")} data-testid={`select-doc-required-${globalIdx}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="required">Required</SelectItem>
          <SelectItem value="optional">Optional</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={doc.stepIndex !== null ? doc.stepIndex.toString() : 'none'}
        onValueChange={(v) => updateDocument(globalIdx, 'stepIndex', v === 'none' ? null : parseInt(v))}
      >
        <SelectTrigger className="h-7 text-[12px] w-[130px]" data-testid={`select-doc-stage-${globalIdx}`}>
          <SelectValue placeholder="Assign stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {stages.map((s, si) => (
            <SelectItem key={si} value={si.toString()}>{s.stepName || `Stage ${si + 1}`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        className="text-muted-foreground/40 hover:text-red-500 transition-colors p-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0"
        onClick={() => removeDocument(globalIdx)}
        data-testid={`button-remove-doc-${globalIdx}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DocumentsStep({
  documents,
  setDocuments,
  stages,
}: {
  documents: DocEntry[];
  setDocuments: (d: DocEntry[]) => void;
  stages: StageEntry[];
}) {
  const [addingToStage, setAddingToStage] = useState<number | 'unassigned' | null>(null);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('borrower_docs');
  const newDocRef = useRef<HTMLInputElement>(null);

  const startAdding = (target: number | 'unassigned') => {
    setAddingToStage(target);
    setNewDocName('');
    setNewDocCategory('borrower_docs');
    setTimeout(() => newDocRef.current?.focus(), 50);
  };

  const addDocument = (target: number | 'unassigned') => {
    const docName = newDocName.trim();
    if (!docName) return;
    const stepIndex = typeof target === 'number' ? target : null;
    setDocuments([...documents, { documentName: docName, documentCategory: newDocCategory, isRequired: true, stepIndex }]);
    setNewDocName('');
    setNewDocCategory('borrower_docs');
    setAddingToStage(null);
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
        stepIndex: null as number | null,
      }));
    if (newDocs.length > 0) {
      setDocuments([...documents, ...newDocs]);
    }
  };

  const docsByStage = stages.map((_, si) => documents.map((d, di) => ({ doc: d, idx: di })).filter((e) => e.doc.stepIndex === si));
  const unassigned = documents.map((d, di) => ({ doc: d, idx: di })).filter((e) => e.doc.stepIndex === null);
  const requiredCount = documents.filter((d) => d.isRequired).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDocDragEnd = (event: DragEndEvent, stageGroupIndices: number[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldLocalIdx = stageGroupIndices.indexOf(active.id as number);
    const newLocalIdx = stageGroupIndices.indexOf(over.id as number);
    if (oldLocalIdx === -1 || newLocalIdx === -1) return;
    const itemsInGroup = stageGroupIndices.map(i => documents[i]);
    const reorderedItems = arrayMove(itemsInGroup, oldLocalIdx, newLocalIdx);
    const updated = [...documents];
    stageGroupIndices.forEach((globalIdx, localIdx) => {
      updated[globalIdx] = reorderedItems[localIdx];
    });
    setDocuments(updated);
  };

  const renderDocRow = (doc: DocEntry, globalIdx: number) => (
    <SortableDocRow
      key={`doc-${globalIdx}`}
      id={globalIdx}
      doc={doc}
      globalIdx={globalIdx}
      stages={stages}
      updateDocument={updateDocument}
      removeDocument={removeDocument}
    />
  );

  const renderAddDocInline = (target: number | 'unassigned') => {
    if (addingToStage !== target) return null;
    return (
      <div className="flex items-center gap-2 py-2 px-3 bg-muted/20 rounded-lg mt-1">
        <FileText className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
        <input
          ref={newDocRef}
          className="text-[14px] bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40"
          placeholder="Document name..."
          value={newDocName}
          onChange={(e) => setNewDocName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDocument(target); } if (e.key === 'Escape') { setAddingToStage(null); setNewDocName(''); } }}
          data-testid="input-new-document"
        />
        <Select value={newDocCategory} onValueChange={setNewDocCategory}>
          <SelectTrigger className="h-7 text-[12px] w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {standardDocuments.map((cat) => (
              <SelectItem key={cat.category} value={cat.category}>{cat.categoryLabel}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 text-[12px] text-primary" onClick={() => addDocument(target)} disabled={!newDocName.trim()} data-testid="button-confirm-add-doc">
          <Check className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
        <button className="text-muted-foreground/40 hover:text-muted-foreground p-0.5" onClick={() => { setAddingToStage(null); setNewDocName(''); }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold leading-tight">Required Documents</h2>
        <p className="text-[16px] text-muted-foreground mt-1">
          Configure which documents borrowers and brokers need to provide at each stage. Documents are organized by the stage where they'll be collected.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[14px] text-muted-foreground">
          {documents.length} documents configured &mdash; {requiredCount} required, {documents.length - requiredCount} optional
        </span>
        <Button
          variant="outline"
          onClick={() => startAdding('unassigned')}
          data-testid="button-add-document"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Document
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {standardDocuments.map((cat) => (
          <Button
            key={cat.category}
            variant="outline"
            size="sm"
            className="text-[12px] h-7"
            onClick={() => addStandardDocs(cat.category)}
            data-testid={`button-quickadd-${cat.category}`}
          >
            <Plus className="h-3 w-3 mr-1" />
            {cat.categoryLabel}
          </Button>
        ))}
      </div>

      <div className="relative pl-6">
        {stages.length > 1 && (
          <div
            className="absolute left-[11px] top-[24px] w-[2px] bg-blue-200"
            style={{ height: `calc(100% - 48px)` }}
          />
        )}

        <div className="space-y-0">
          {stages.map((stage, si) => {
            const color = STAGE_COLORS[si % STAGE_COLORS.length];
            const stageDocs = docsByStage[si];

            return (
              <div key={si} className="relative" data-testid={`doc-stage-group-${si}`}>
                <div
                  className="absolute left-[-13px] top-[14px] w-3 h-3 rounded-full z-10 border-2 border-white"
                  style={{ backgroundColor: color }}
                />

                <div className="ml-4 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span style={{ color }} className="text-[13px]">●</span>
                      <span className="text-[15px] font-bold text-foreground">
                        {stage.stepName || `Stage ${si + 1}`}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        ({stageDocs.length} {stageDocs.length === 1 ? 'doc' : 'docs'})
                      </span>
                    </div>
                    <button
                      className="text-[12px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                      onClick={() => startAdding(si)}
                      data-testid={`button-add-doc-to-stage-${si}`}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>

                  <div className="rounded-[10px] border bg-white overflow-hidden">
                    {stageDocs.length === 0 && addingToStage !== si ? (
                      <div className="py-3 px-4 text-[13px] text-muted-foreground/60 text-center">
                        No documents for this stage yet
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDocDragEnd(e, stageDocs.map(d => d.idx))}>
                        <SortableContext items={stageDocs.map(d => d.idx)} strategy={verticalListSortingStrategy}>
                          <div className="divide-y divide-border/40">
                            {stageDocs.map((entry) => renderDocRow(entry.doc, entry.idx))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    {renderAddDocInline(si)}
                  </div>
                </div>
              </div>
            );
          })}

          {(unassigned.length > 0 || addingToStage === 'unassigned') && (
            <div className="relative" data-testid="doc-stage-group-unassigned">
              <div className="absolute left-[-13px] top-[14px] w-3 h-3 rounded-full z-10 border-2 border-white bg-gray-400" />

              <div className="ml-4 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-gray-400">●</span>
                    <span className="text-[15px] font-bold text-muted-foreground">Unassigned</span>
                    {unassigned.length > 0 && (
                      <span className="text-[12px] text-amber-600 font-medium">
                        — assign these to a stage
                      </span>
                    )}
                  </div>
                  <button
                    className="text-[12px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                    onClick={() => startAdding('unassigned')}
                    data-testid="button-add-doc-unassigned"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>

                <div className="rounded-[10px] border border-amber-200 bg-amber-50/30 overflow-hidden">
                  {unassigned.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDocDragEnd(e, unassigned.map(d => d.idx))}>
                      <SortableContext items={unassigned.map(d => d.idx)} strategy={verticalListSortingStrategy}>
                        <div className="divide-y divide-border/40">
                          {unassigned.map((entry) => renderDocRow(entry.doc, entry.idx))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                  {renderAddDocInline('unassigned')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[10px] border border-blue-200 bg-blue-50/60 p-4 flex gap-3">
        <Lightbulb className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="text-[14px] font-semibold text-blue-700">Tip: </span>
          <span className="text-[14px] text-blue-800">
            Documents assigned to a stage will appear in the deal checklist at the right time. Required documents must be uploaded before a deal can advance past that stage. Use the quick-add buttons above to bulk-add common document sets.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Step 6: Tasks ──────────────────────────────────────────────

const PRIORITY_LABELS: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

function SortableTaskRow({
  id,
  task,
  globalIdx,
  stages,
  teamMembers,
  formTemplates,
  updateTask,
  removeTask,
  getAssigneeLabel,
}: {
  id: number;
  task: TaskEntry;
  globalIdx: number;
  stages: StageEntry[];
  teamMembers: { id: number; fullName: string; role: string }[];
  formTemplates: { id: number; name: string }[];
  updateTask: (i: number, field: keyof TaskEntry, value: any) => void;
  removeTask: (i: number) => void;
  getAssigneeLabel: (v: string) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const showFormDropdown = task.assignToRole === 'user' || task.assignToRole === 'all';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 group transition-colors"
      data-testid={`task-row-${globalIdx}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0" data-testid={`drag-task-${globalIdx}`}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <ListChecks className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <input
          className="text-[14px] text-foreground bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40 focus:bg-muted/30 focus:px-2 rounded transition-all px-0"
          value={task.taskName}
          onChange={(e) => updateTask(globalIdx, 'taskName', e.target.value)}
          placeholder="Task name"
          data-testid={`input-task-name-${globalIdx}`}
        />
        {task.formTemplateId && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0 gap-1" data-testid={`badge-form-attached-${globalIdx}`}>
            <FormInput className="h-2.5 w-2.5" />
            Form
          </Badge>
        )}
      </div>
      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0", PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium)}>
        {PRIORITY_LABELS[task.priority] || 'Medium'}
      </span>
      <Select value={task.priority} onValueChange={(v) => updateTask(globalIdx, 'priority', v)}>
        <SelectTrigger className="w-[90px] h-7 text-[12px]" data-testid={`select-task-priority-${globalIdx}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
      <Select value={task.assignToRole} onValueChange={(v) => updateTask(globalIdx, 'assignToRole', v)}>
        <SelectTrigger className="w-[140px] h-7 text-[12px]" data-testid={`select-task-assignee-${globalIdx}`}>
          <SelectValue placeholder="Assign to..." />
        </SelectTrigger>
        <SelectContent>
          {teamMembers.length > 0 && teamMembers.map((m) => (
            <SelectItem key={m.id} value={`user_${m.id}`}>{m.fullName}</SelectItem>
          ))}
          <SelectItem value="admin">Admin (role)</SelectItem>
          <SelectItem value="processor">Processor (role)</SelectItem>
          <SelectItem value="user">Borrower</SelectItem>
          <SelectItem value="broker">Broker</SelectItem>
        </SelectContent>
      </Select>
      {showFormDropdown && formTemplates.length > 0 && (
        <Select
          value={task.formTemplateId ? task.formTemplateId.toString() : 'none'}
          onValueChange={(v) => updateTask(globalIdx, 'formTemplateId', v === 'none' ? null : parseInt(v))}
        >
          <SelectTrigger className="w-[130px] h-7 text-[12px]" data-testid={`select-task-form-${globalIdx}`}>
            <SelectValue placeholder="Form..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Form</SelectItem>
            {formTemplates.map((ft) => (
              <SelectItem key={ft.id} value={ft.id.toString()}>{ft.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        value={task.stepIndex !== null ? task.stepIndex.toString() : 'none'}
        onValueChange={(v) => updateTask(globalIdx, 'stepIndex', v === 'none' ? null : parseInt(v))}
      >
        <SelectTrigger className="h-7 text-[12px] w-[130px]" data-testid={`select-task-stage-${globalIdx}`}>
          <SelectValue placeholder="Assign stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {stages.map((s, si) => (
            <SelectItem key={si} value={si.toString()}>{s.stepName || `Stage ${si + 1}`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        className="text-muted-foreground/40 hover:text-red-500 transition-colors p-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0"
        onClick={() => removeTask(globalIdx)}
        data-testid={`button-remove-task-${globalIdx}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

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
  const { data: formTemplatesData } = useQuery<{ templates: { id: number; name: string }[] }>({
    queryKey: ['/api/admin/inquiry-form-templates'],
  });
  const formTemplates = formTemplatesData?.templates || [];
  const [addingToStage, setAddingToStage] = useState<number | 'unassigned' | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const newTaskRef = useRef<HTMLInputElement>(null);

  const startAdding = (target: number | 'unassigned') => {
    setAddingToStage(target);
    setNewTaskName('');
    setTimeout(() => newTaskRef.current?.focus(), 50);
  };

  const addTask = (target: number | 'unassigned') => {
    const name = newTaskName.trim();
    if (!name) return;
    const stepIndex = typeof target === 'number' ? target : null;
    setTasks([...tasks, { taskName: name, taskCategory: 'other', priority: 'medium', assignToRole: 'admin', stepIndex, formTemplateId: null }]);
    setNewTaskName('');
    setAddingToStage(null);
  };

  const removeTask = (i: number) => {
    setTasks(tasks.filter((_, idx) => idx !== i));
  };

  const updateTask = (i: number, field: keyof TaskEntry, value: any) => {
    const updated = [...tasks];
    updated[i] = { ...updated[i], [field]: value };
    setTasks(updated);
  };

  const getAssigneeLabel = (value: string) => {
    if (value.startsWith('user_')) {
      const member = teamMembers.find((m) => `user_${m.id}` === value);
      return member ? member.fullName : value;
    }
    const roleLabels: Record<string, string> = { admin: 'Admin', processor: 'Processor', user: 'Borrower', broker: 'Broker' };
    return roleLabels[value] || value;
  };

  const tasksByStage = stages.map((_, si) => tasks.map((t, ti) => ({ task: t, idx: ti })).filter((e) => e.task.stepIndex === si));
  const unassigned = tasks.map((t, ti) => ({ task: t, idx: ti })).filter((e) => e.task.stepIndex === null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleTaskDragEnd = (event: DragEndEvent, stageGroupIndices: number[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldLocalIdx = stageGroupIndices.indexOf(active.id as number);
    const newLocalIdx = stageGroupIndices.indexOf(over.id as number);
    if (oldLocalIdx === -1 || newLocalIdx === -1) return;
    const itemsInGroup = stageGroupIndices.map(i => tasks[i]);
    const reorderedItems = arrayMove(itemsInGroup, oldLocalIdx, newLocalIdx);
    const updated = [...tasks];
    stageGroupIndices.forEach((globalIdx, localIdx) => {
      updated[globalIdx] = reorderedItems[localIdx];
    });
    setTasks(updated);
  };

  const renderTaskRow = (task: TaskEntry, globalIdx: number) => (
    <SortableTaskRow
      key={`task-${globalIdx}`}
      id={globalIdx}
      task={task}
      globalIdx={globalIdx}
      stages={stages}
      teamMembers={teamMembers}
      formTemplates={formTemplates}
      updateTask={updateTask}
      removeTask={removeTask}
      getAssigneeLabel={getAssigneeLabel}
    />
  );

  const renderAddTaskInline = (target: number | 'unassigned') => {
    if (addingToStage !== target) return null;
    return (
      <div className="flex items-center gap-2 py-2 px-3 bg-muted/20 rounded-lg mt-1">
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
        <input
          ref={newTaskRef}
          className="text-[14px] bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40"
          placeholder="Task name..."
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(target); } if (e.key === 'Escape') { setAddingToStage(null); setNewTaskName(''); } }}
          data-testid="input-new-task"
        />
        <Button variant="ghost" size="sm" className="h-7 text-[12px] text-primary" onClick={() => addTask(target)} disabled={!newTaskName.trim()} data-testid="button-confirm-add-task">
          <Check className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
        <button className="text-muted-foreground/40 hover:text-muted-foreground p-0.5" onClick={() => { setAddingToStage(null); setNewTaskName(''); }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold leading-tight">Tasks & Checklist</h2>
        <p className="text-[16px] text-muted-foreground mt-1">
          Define the action items that need to be completed at each stage. Assign team members and set priority levels.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[14px] text-muted-foreground">
          {tasks.length} tasks configured
        </span>
        <Button
          variant="outline"
          onClick={() => startAdding('unassigned')}
          data-testid="button-add-task"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Task
        </Button>
      </div>

      <div className="relative pl-6">
        {stages.length > 1 && (
          <div
            className="absolute left-[11px] top-[24px] w-[2px] bg-blue-200"
            style={{ height: `calc(100% - 48px)` }}
          />
        )}

        <div className="space-y-0">
          {stages.map((stage, si) => {
            const color = STAGE_COLORS[si % STAGE_COLORS.length];
            const stageTasks = tasksByStage[si];

            return (
              <div key={si} className="relative" data-testid={`task-stage-group-${si}`}>
                <div
                  className="absolute left-[-13px] top-[14px] w-3 h-3 rounded-full z-10 border-2 border-white"
                  style={{ backgroundColor: color }}
                />

                <div className="ml-4 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span style={{ color }} className="text-[13px]">●</span>
                      <span className="text-[15px] font-bold text-foreground">
                        {stage.stepName || `Stage ${si + 1}`}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        ({stageTasks.length} {stageTasks.length === 1 ? 'task' : 'tasks'})
                      </span>
                    </div>
                    <button
                      className="text-[12px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                      onClick={() => startAdding(si)}
                      data-testid={`button-add-task-to-stage-${si}`}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>

                  <div className="rounded-[10px] border bg-white overflow-hidden">
                    {stageTasks.length === 0 && addingToStage !== si ? (
                      <div className="py-3 px-4 text-[13px] text-muted-foreground/60 text-center">
                        No tasks for this stage yet
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleTaskDragEnd(e, stageTasks.map(t => t.idx))}>
                        <SortableContext items={stageTasks.map(t => t.idx)} strategy={verticalListSortingStrategy}>
                          <div className="divide-y divide-border/40">
                            {stageTasks.map((entry) => renderTaskRow(entry.task, entry.idx))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    {renderAddTaskInline(si)}
                  </div>
                </div>
              </div>
            );
          })}

          {(unassigned.length > 0 || addingToStage === 'unassigned') && (
            <div className="relative" data-testid="task-stage-group-unassigned">
              <div className="absolute left-[-13px] top-[14px] w-3 h-3 rounded-full z-10 border-2 border-white bg-gray-400" />

              <div className="ml-4 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-gray-400">●</span>
                    <span className="text-[15px] font-bold text-muted-foreground">Unassigned</span>
                    {unassigned.length > 0 && (
                      <span className="text-[12px] text-amber-600 font-medium">
                        — assign these to a stage
                      </span>
                    )}
                  </div>
                  <button
                    className="text-[12px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                    onClick={() => startAdding('unassigned')}
                    data-testid="button-add-task-unassigned"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>

                <div className="rounded-[10px] border border-amber-200 bg-amber-50/30 overflow-hidden">
                  {unassigned.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleTaskDragEnd(e, unassigned.map(t => t.idx))}>
                      <SortableContext items={unassigned.map(t => t.idx)} strategy={verticalListSortingStrategy}>
                        <div className="divide-y divide-border/40">
                          {unassigned.map((entry) => renderTaskRow(entry.task, entry.idx))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                  {renderAddTaskInline('unassigned')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[10px] border border-blue-200 bg-blue-50/60 p-4 flex gap-3">
        <Lightbulb className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="text-[14px] font-semibold text-blue-700">Tip: </span>
          <span className="text-[14px] text-blue-800">
            Tasks assigned to a stage will appear in the deal checklist when the deal reaches that stage. Assign tasks to specific team members or roles so everyone knows what they're responsible for.
          </span>
        </div>
      </div>
    </div>
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
  const newRuleRef = useRef<HTMLInputElement>(null);

  const startAdding = (docName: string) => {
    setAddingForDoc(docName);
    setNewRuleTitle('');
    setTimeout(() => newRuleRef.current?.focus(), 50);
  };

  const addRule = (docName: string) => {
    if (!newRuleTitle.trim()) return;
    setReviewRules([...reviewRules, { ruleTitle: newRuleTitle.trim(), documentType: docName, severity: 'fail', stepIndex: null }]);
    setNewRuleTitle('');
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

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-[26px] font-bold leading-tight">AI Review Rules</h2>
          <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Optional</span>
        </div>
        <p className="text-[16px] text-muted-foreground mt-1">
          Define what the AI should check when reviewing each document. Your team will be notified when a rule fails.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[14px] text-muted-foreground">
          {reviewRules.length} rules configured across {docNames.filter((dn) => reviewRules.some((r) => r.documentType === dn)).length} documents
        </span>
        <Button
          variant="outline"
          onClick={() => startAdding('General')}
          data-testid="button-add-rule"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Rule
        </Button>
      </div>

      <div className="space-y-3">
        {docNames.map((docName) => {
          const rulesForDoc = reviewRules
            .map((r, origIdx) => ({ ...r, origIdx }))
            .filter((r) => r.documentType === docName);
          const isAdding = addingForDoc === docName;

          return (
            <div key={docName} data-testid={`doc-rules-section-${docName}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
                  <span className="text-[15px] font-bold text-foreground">
                    {docName === 'General' ? 'General (all documents)' : docName}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    ({rulesForDoc.length} {rulesForDoc.length === 1 ? 'rule' : 'rules'})
                  </span>
                </div>
                <button
                  className="text-[12px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                  onClick={() => startAdding(docName)}
                  data-testid={`button-add-rule-${docName}`}
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>

              <div className="rounded-[10px] border bg-white overflow-hidden">
                {rulesForDoc.length === 0 && !isAdding ? (
                  <div className="py-3 px-4 text-[13px] text-muted-foreground/60 text-center">
                    No rules for this document yet
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {rulesForDoc.map((rule) => (
                      <div
                        key={rule.origIdx}
                        className="flex items-center gap-3 py-2.5 px-4 hover:bg-muted/30 group transition-colors"
                        data-testid={`rule-row-${rule.origIdx}`}
                      >
                        <Brain className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                        <input
                          className="text-[14px] text-foreground bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40 focus:bg-muted/30 focus:px-2 rounded transition-all px-0"
                          value={rule.ruleTitle}
                          onChange={(e) => updateRule(rule.origIdx, 'ruleTitle', e.target.value)}
                          placeholder="Rule description"
                          data-testid={`input-rule-title-${rule.origIdx}`}
                        />
                        <button
                          className="text-muted-foreground/40 hover:text-red-500 transition-colors p-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={() => removeRule(rule.origIdx)}
                          data-testid={`button-remove-rule-${rule.origIdx}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isAdding && (
                  <div className="flex items-center gap-2 py-2.5 px-4 bg-muted/20 border-t border-border/40">
                    <Brain className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                    <input
                      ref={newRuleRef}
                      className="text-[14px] bg-transparent border-0 outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40"
                      placeholder="Describe what the AI should check..."
                      value={newRuleTitle}
                      onChange={(e) => setNewRuleTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(docName); } if (e.key === 'Escape') { setAddingForDoc(null); setNewRuleTitle(''); } }}
                      data-testid="input-new-rule-title"
                    />
                    <Button variant="ghost" size="sm" className="h-7 text-[12px] text-primary" onClick={() => addRule(docName)} disabled={!newRuleTitle.trim()} data-testid="button-confirm-add-rule">
                      <Check className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                    <button className="text-muted-foreground/40 hover:text-muted-foreground p-0.5" onClick={() => { setAddingForDoc(null); setNewRuleTitle(''); }} data-testid="button-cancel-add-rule">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-[10px] border border-blue-200 bg-blue-50/60 p-4">
        <p className="text-[14px] text-blue-800">
          <span className="font-semibold text-blue-700">Tip: </span>
          When the AI reviews a document and a rule fails, your team will be notified so they can take action. You can refine these rules later from program settings.
        </p>
      </div>
    </div>
  );
}

// ─── Step 10: Review & Create ────────────────────────────────────

const PROPERTY_ABBREVIATIONS: Record<string, string> = {
  'single-family': 'SFR',
  '2-4-unit': '2-4',
  'condo': 'Condo',
  'townhouse': 'TH',
  'pud': 'PUD',
  'multi-family': 'MF',
  'commercial': 'Comm',
  'mixed-use': 'MU',
  'other': 'Other',
  'special-purpose': 'SP',
};

function formatLoanAmount(val: string): string {
  if (!val) return '—';
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num}`;
}

function SummaryStep({
  programName,
  programDescription,
  loanType,
  selectedTemplate,
  stages,
  documents,
  tasks,
  reviewRules,
  quoteFormFields,
  selectedCreditPolicyId,
  creditPolicies,
  eligiblePropertyTypes,
  minLtv,
  maxLtv,
  minLoanAmount,
  maxLoanAmount,
  minDscr,
  minFico,
  activationMode,
  setActivationMode,
  onEditStep,
}: {
  programName: string;
  programDescription: string;
  loanType: string;
  selectedTemplate: string;
  stages: StageEntry[];
  documents: DocEntry[];
  tasks: TaskEntry[];
  reviewRules: RuleEntry[];
  quoteFormFields: QuoteFormField[];
  selectedCreditPolicyId: number | null;
  creditPolicies: any[];
  eligiblePropertyTypes: string[];
  minLtv: string;
  maxLtv: string;
  minLoanAmount: string;
  maxLoanAmount: string;
  minDscr: string;
  minFico: string;
  activationMode: 'draft' | 'active';
  setActivationMode: (mode: 'draft' | 'active') => void;
  onEditStep: (step: WizardStep) => void;
}) {
  const policyName = selectedCreditPolicyId
    ? creditPolicies.find((p: any) => p.id === selectedCreditPolicyId)?.name || 'Unknown'
    : 'None';

  const templateName = templateOptions.find((t) => t.id === selectedTemplate)?.title || selectedTemplate;

  const visibleFields = quoteFormFields.filter((f) => f.visible);
  const requiredFields = visibleFields.filter((f) => f.required);
  const optionalFields = visibleFields.filter((f) => !f.required);

  const validStages = stages.filter((s) => s.stepName.trim());
  const validDocs = documents.filter((d) => d.documentName.trim());
  const requiredDocs = validDocs.filter((d) => d.isRequired);
  const optionalDocs = validDocs.filter((d) => !d.isRequired);
  const uniqueCategories = new Set(validDocs.map((d) => d.documentCategory).filter(Boolean));

  const validTasks = tasks.filter((t) => t.taskName.trim());
  const highPriorityTasks = validTasks.filter((t) => t.priority === 'high' || t.priority === 'critical');
  const mediumTasks = validTasks.filter((t) => t.priority === 'medium');
  const lowTasks = validTasks.filter((t) => t.priority === 'low');

  const propertyAbbrevs = eligiblePropertyTypes.map((p) => PROPERTY_ABBREVIATIONS[p] || p).join(', ');

  const ltvRange = minLtv && maxLtv ? `${minLtv}% – ${maxLtv}%` : minLtv ? `≥ ${minLtv}%` : maxLtv ? `≤ ${maxLtv}%` : '—';
  const loanRange = minLoanAmount && maxLoanAmount ? `${formatLoanAmount(minLoanAmount)} – ${formatLoanAmount(maxLoanAmount)}` : minLoanAmount ? `≥ ${formatLoanAmount(minLoanAmount)}` : maxLoanAmount ? `≤ ${formatLoanAmount(maxLoanAmount)}` : '—';

  return (
    <div className="space-y-6" data-testid="summary-step">
      <div>
        <h2 className="text-[26px] font-bold tracking-tight">Review & Create</h2>
        <p className="text-[16px] text-muted-foreground mt-1">
          Review your program configuration before creating. You can edit any section after creation.
        </p>
      </div>

      <div className="border rounded-[10px] p-5" data-testid="summary-program-identity">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[20px] font-bold">{programName || '(not set)'}</h3>
            {programDescription && (
              <p className="text-[14px] text-muted-foreground mt-0.5">{programDescription}</p>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[12px]",
              activationMode === 'active'
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            )}
            data-testid="badge-status"
          >
            {activationMode === 'active' ? 'Active' : 'Draft'}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <Badge variant="secondary" className="text-[12px]" data-testid="badge-loan-type">{loanType.toUpperCase()}</Badge>
          <span className="text-[13px] text-muted-foreground">Template: {templateName}</span>
          <span className="text-[13px] text-muted-foreground">Policy: {policyName}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4" data-testid="summary-cards-grid">
        <div className="border rounded-[10px] bg-slate-50/80 dark:bg-muted/30 overflow-hidden" data-testid="summary-card-loan-params">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h4 className="text-[16px] font-bold">Loan Parameters</h4>
            <button className="text-[13px] text-muted-foreground hover:text-primary" onClick={() => onEditStep('program-details')} data-testid="button-edit-loan-params">Edit</button>
          </div>
          <div className="divide-y text-[14px]">
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">LTV Range</span><span className="font-semibold">{ltvRange}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Min DSCR</span><span className="font-semibold">{minDscr || '—'}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Loan Range</span><span className="font-semibold">{loanRange}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Min FICO</span><span className="font-semibold">{minFico || '—'}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Properties</span><span className="font-semibold">{propertyAbbrevs || '—'}</span></div>
          </div>
        </div>

        <div className="border rounded-[10px] bg-slate-50/80 dark:bg-muted/30 overflow-hidden" data-testid="summary-card-quote-form">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h4 className="text-[16px] font-bold">Quote Form</h4>
            <button className="text-[13px] text-muted-foreground hover:text-primary" onClick={() => onEditStep('quote-form')} data-testid="button-edit-quote-form">Edit</button>
          </div>
          <div className="divide-y text-[14px]">
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Required Fields</span><span className="font-semibold">{requiredFields.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Optional Fields</span><span className="font-semibold">{optionalFields.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Total Fields</span><span className="font-semibold">{visibleFields.length}</span></div>
          </div>
        </div>

        <div className="border rounded-[10px] bg-slate-50/80 dark:bg-muted/30 overflow-hidden" data-testid="summary-card-workflow">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h4 className="text-[16px] font-bold">Workflow</h4>
            <button className="text-[13px] text-muted-foreground hover:text-primary" onClick={() => onEditStep('stages')} data-testid="button-edit-workflow">Edit</button>
          </div>
          <div className="divide-y text-[14px]">
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Stages</span><span className="font-semibold">{validStages.length}</span></div>
          </div>
          {validStages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t">
              {validStages.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length] }} />
                  <span className="text-[13px]">{s.stepName}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border rounded-[10px] bg-slate-50/80 dark:bg-muted/30 overflow-hidden" data-testid="summary-card-documents">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h4 className="text-[16px] font-bold">Documents</h4>
            <button className="text-[13px] text-muted-foreground hover:text-primary" onClick={() => onEditStep('documents')} data-testid="button-edit-documents">Edit</button>
          </div>
          <div className="divide-y text-[14px]">
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Total</span><span className="font-semibold">{validDocs.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Required</span><span className="font-semibold">{requiredDocs.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Optional</span><span className="font-semibold">{optionalDocs.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Categories</span><span className="font-semibold">{uniqueCategories.size}</span></div>
          </div>
        </div>

        <div className="border rounded-[10px] bg-slate-50/80 dark:bg-muted/30 overflow-hidden" data-testid="summary-card-tasks">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h4 className="text-[16px] font-bold">Tasks</h4>
            <button className="text-[13px] text-muted-foreground hover:text-primary" onClick={() => onEditStep('tasks')} data-testid="button-edit-tasks">Edit</button>
          </div>
          <div className="divide-y text-[14px]">
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Total Tasks</span><span className="font-semibold">{validTasks.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">High Priority</span><span className="font-semibold text-blue-700">{highPriorityTasks.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Medium</span><span className="font-semibold text-amber-600">{mediumTasks.length}</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Low</span><span className="font-semibold">{lowTasks.length}</span></div>
          </div>
        </div>

        <div className="border rounded-[10px] bg-slate-50/80 dark:bg-muted/30 overflow-hidden" data-testid="summary-card-pricing">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h4 className="text-[16px] font-bold">Pricing</h4>
            <button className="text-[13px] text-muted-foreground hover:text-primary" onClick={() => onEditStep('pricing')} data-testid="button-edit-pricing">Edit</button>
          </div>
          <div className="divide-y text-[14px]">
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Mode</span><span className="font-semibold">Rule-Based</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Base Rate</span><span className="font-semibold">—</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">YSP</span><span className="font-semibold">—</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Points</span><span className="font-semibold">—</span></div>
            <div className="flex justify-between px-5 py-2.5"><span className="text-muted-foreground">Adjuster Groups</span><span className="font-semibold">—</span></div>
          </div>
        </div>
      </div>

      <div className="border rounded-[10px] p-5" data-testid="summary-activation">
        <h4 className="text-[16px] font-bold mb-4">Activation</h4>
        <div className="flex items-start gap-8">
          <label className="flex items-start gap-3 cursor-pointer" data-testid="radio-save-as-draft">
            <input
              type="radio"
              name="activation"
              checked={activationMode === 'draft'}
              onChange={() => setActivationMode('draft')}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-[14px] font-semibold">Save as Draft</p>
              <p className="text-[13px] text-muted-foreground">Program will not be visible to brokers</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer" data-testid="radio-activate-immediately">
            <input
              type="radio"
              name="activation"
              checked={activationMode === 'active'}
              onChange={() => setActivationMode('active')}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-[14px] font-semibold">Activate Immediately</p>
              <p className="text-[13px] text-muted-foreground">Program will be live and accepting quotes</p>
            </div>
          </label>
        </div>
      </div>

      {!programName.trim() && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-[10px]">
          <Info className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-[13px] text-amber-700">Program name is required to create the program. Go back to Program Details to set it.</p>
        </div>
      )}
    </div>
  );
}

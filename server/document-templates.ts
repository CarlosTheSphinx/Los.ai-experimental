export interface DocumentTemplate {
  name: string;
  category: string;
  description?: string;
  isRequired: boolean;
}

export const DSCR_DOCUMENTS: DocumentTemplate[] = [
  {
    name: "Loan Application",
    category: "borrower_docs",
    description: "Complete loan application form (template provided)",
    isRequired: true,
  },
  {
    name: "Title Company Contact Info",
    category: "closing_docs",
    description: "Name, phone, and email of title company contact",
    isRequired: true,
  },
  {
    name: "Insurance Agent Contact Info",
    category: "closing_docs",
    description: "Name, phone, and email of insurance agent",
    isRequired: true,
  },
  {
    name: "Borrower ID (All Entity Members)",
    category: "borrower_docs",
    description: "Valid government-issued ID for all entity members",
    isRequired: true,
  },
  {
    name: "Articles of Organization (LLC/Corporation)",
    category: "entity_docs",
    description: "Formation documents for LLC or Corporation",
    isRequired: true,
  },
  {
    name: "Operating Agreement or Bylaws",
    category: "entity_docs",
    description: "LLC Operating Agreement or Corporate Bylaws",
    isRequired: true,
  },
  {
    name: "EIN Letter or W9 Form",
    category: "entity_docs",
    description: "IRS EIN confirmation letter or completed W9",
    isRequired: true,
  },
  {
    name: "List of Properties Owned",
    category: "financial_docs",
    description: "Schedule of real estate owned (template provided or any version)",
    isRequired: true,
  },
  {
    name: "Personal Financial Statement",
    category: "financial_docs",
    description: "Personal financial statement (template provided or any version)",
    isRequired: true,
  },
  {
    name: "Original Settlement Statement",
    category: "property_docs",
    description: "HUD-1 or Closing Disclosure from original purchase (required for refinance)",
    isRequired: false,
  },
  {
    name: "Purchase Contract",
    category: "property_docs",
    description: "Fully executed purchase agreement (required for purchase)",
    isRequired: false,
  },
  {
    name: "Bank Statements (2 Months)",
    category: "financial_docs",
    description: "Two most recent months of bank statements",
    isRequired: true,
  },
  {
    name: "Lease Agreements (All Units)",
    category: "property_docs",
    description: "Current lease agreements for all rental units",
    isRequired: true,
  },
  {
    name: "Verification of Rent Deposits",
    category: "property_docs",
    description: "Bank statement or rental ledger showing rent deposits",
    isRequired: true,
  },
  {
    name: "Payoff Statement",
    category: "closing_docs",
    description: "Current mortgage payoff statement (required for refinance)",
    isRequired: false,
  },
  {
    name: "Condo Association Insurance Policy",
    category: "property_docs",
    description: "Master insurance policy from HOA/Condo Association (required for condos)",
    isRequired: false,
  },
];

export const RTL_DOCUMENTS: DocumentTemplate[] = [
  {
    name: "Loan Application",
    category: "borrower_docs",
    description: "Complete loan application form (template provided)",
    isRequired: true,
  },
  {
    name: "Title Company Contact Info",
    category: "closing_docs",
    description: "Name, phone, and email of title company contact",
    isRequired: true,
  },
  {
    name: "Insurance Agent Contact Info",
    category: "closing_docs",
    description: "Name, phone, and email of insurance agent",
    isRequired: true,
  },
  {
    name: "Borrower ID (All Entity Members)",
    category: "borrower_docs",
    description: "Valid government-issued ID for all entity members",
    isRequired: true,
  },
  {
    name: "Articles of Organization (LLC/Corporation)",
    category: "entity_docs",
    description: "Formation documents for LLC or Corporation",
    isRequired: true,
  },
  {
    name: "Operating Agreement or Bylaws",
    category: "entity_docs",
    description: "LLC Operating Agreement or Corporate Bylaws",
    isRequired: true,
  },
  {
    name: "EIN Letter or W9 Form",
    category: "entity_docs",
    description: "IRS EIN confirmation letter or completed W9",
    isRequired: true,
  },
  {
    name: "Track Record",
    category: "financial_docs",
    description: "History of completed real estate transactions (template provided or any version)",
    isRequired: true,
  },
  {
    name: "Past Project Settlement Statements",
    category: "financial_docs",
    description: "HUD-1s or Closing Disclosures from previous projects",
    isRequired: true,
  },
  {
    name: "Scope of Work",
    category: "property_docs",
    description: "Detailed renovation budget and timeline (required for renovation projects)",
    isRequired: false,
  },
  {
    name: "Original Settlement Statement",
    category: "property_docs",
    description: "HUD-1 or Closing Disclosure from original purchase (required for refinance)",
    isRequired: false,
  },
  {
    name: "Purchase Contract",
    category: "property_docs",
    description: "Fully executed purchase agreement",
    isRequired: true,
  },
  {
    name: "Bank Statements (2 Months)",
    category: "financial_docs",
    description: "Two most recent months of bank statements",
    isRequired: true,
  },
  {
    name: "Plans",
    category: "property_docs",
    description: "Architectural/construction plans (required for new construction)",
    isRequired: false,
  },
  {
    name: "Permits",
    category: "property_docs",
    description: "Building permits (required for new construction, if available)",
    isRequired: false,
  },
  {
    name: "GC Info",
    category: "property_docs",
    description: "General Contractor contact info and license (required for new construction)",
    isRequired: false,
  },
  {
    name: "Payoff Statement",
    category: "closing_docs",
    description: "Current mortgage payoff statement (required for refinance)",
    isRequired: false,
  },
];

export function getDocumentTemplatesForLoanType(loanType: string): DocumentTemplate[] {
  const normalizedType = loanType?.toLowerCase() || '';
  
  if (normalizedType === 'dscr') {
    return DSCR_DOCUMENTS;
  }
  
  return RTL_DOCUMENTS;
}

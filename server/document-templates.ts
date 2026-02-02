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
    description: "This will be sent to you to complete online",
    isRequired: true,
  },
  {
    name: "Copy of ID",
    category: "borrower_docs",
    description: "Copy or picture of driver license or passport for all borrowers",
    isRequired: true,
  },
  {
    name: "Entity Formation Document",
    category: "entity_docs",
    description: "Typically called the Articles of Incorporation or Certificate of Formation",
    isRequired: true,
  },
  {
    name: "Entity Operating Agreement or Bylaws",
    category: "entity_docs",
    description: "LLCs use Operating Agreements, Corporations use Bylaws. Must be signed by all entity members and include the % of ownership for each",
    isRequired: true,
  },
  {
    name: "Entity EIN Letter or W9 Form",
    category: "entity_docs",
    description: "If you don't have a copy of the original EIN Letter, we'll send you the W9",
    isRequired: true,
  },
  {
    name: "Schedule of Real Estate Owned",
    category: "financial_docs",
    description: "Used to verify past property ownership experience. Must include the address, owner on title, estimated value, and date acquired",
    isRequired: true,
  },
  {
    name: "Lease Agreements",
    category: "property_docs",
    description: "Make sure to include all pages and signatures",
    isRequired: true,
  },
  {
    name: "Proof of Rent Received / Rental Ledgers",
    category: "property_docs",
    description: "Verifies that tenants are making their payments on time. Can be a bank statement showing rent deposits, or a ledger from a rental software",
    isRequired: true,
  },
  {
    name: "Voided Check",
    category: "financial_docs",
    description: "Verifies the account that you will make loan payments from",
    isRequired: true,
  },
  {
    name: "Two Months' Bank Statements",
    category: "financial_docs",
    description: "Verifies available liquidity",
    isRequired: true,
  },
  {
    name: "Original Settlement Statement",
    category: "property_docs",
    description: "Verifies property ownership and acquisition price (refinance only)",
    isRequired: false,
  },
  {
    name: "Purchase Contract",
    category: "property_docs",
    description: "Please ensure the contract is signed and all addendums are included (purchase only)",
    isRequired: false,
  },
  {
    name: "Payoff Statement",
    category: "closing_docs",
    description: "Typically the title company will request this from your lender as well (refinance only)",
    isRequired: false,
  },
  {
    name: "Scope of Work",
    category: "property_docs",
    description: "Used to determine how much $ has been spent on the property (for recently renovated properties)",
    isRequired: false,
  },
  {
    name: "Appraisal",
    category: "lender_ordered",
    description: "The appraiser will contact you to complete the inspection (ordered by lender)",
    isRequired: false,
  },
  {
    name: "Evidence of Insurance",
    category: "lender_ordered",
    description: "We will order this directly from your insurance agent (ordered by lender)",
    isRequired: false,
  },
  {
    name: "Credit Report",
    category: "lender_ordered",
    description: "We use a soft pull and the middle of your three scores to price the loan (ordered by lender)",
    isRequired: false,
  },
  {
    name: "Entity Certificate of Good Standing",
    category: "lender_ordered",
    description: "Please ensure that your entity is in Good Standing with the state (ordered by lender)",
    isRequired: false,
  },
  {
    name: "Background Report",
    category: "lender_ordered",
    description: "Checks civil and criminal databases for any past activity (ordered by lender)",
    isRequired: false,
  },
  {
    name: "Preliminary Title Report",
    category: "lender_ordered",
    description: "Verifies the chain of ownership for the property and any liens (ordered by lender)",
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

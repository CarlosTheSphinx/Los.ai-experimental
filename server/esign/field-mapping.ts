import { SavedQuote } from "@shared/schema";

export interface PandaDocToken {
  name: string;
  value: string;
}

interface LoanData {
  loanAmount?: number | string;
  propertyValue?: number | string;
  ltv?: number | string;
  loanType?: string;
  interestOnly?: string;
  loanPurpose?: string;
  propertyType?: string;
  propertyState?: string;
  propertyCity?: string;
  propertyZip?: string;
  grossMonthlyRent?: number | string;
  annualTaxes?: number | string;
  annualInsurance?: number | string;
  calculatedDscr?: string;
  dscr?: string;
  ficoScore?: string;
  fico?: string;
  prepaymentPenalty?: string;
  tpoPremium?: string;
  loanTerm?: number | string;
  asIsValue?: number | string;
  arv?: number | string;
  rehabBudget?: number | string;
  purchasePrice?: number | string;
  ltc?: number | string;
  ltarv?: number | string;
  ltaiv?: number | string;
  experienceTier?: string;
  selectedLoanType?: string;
  [key: string]: unknown;
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return `${num.toFixed(2)}%`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function mapQuoteToPandaTokens(quote: SavedQuote): PandaDocToken[] {
  const tokens: PandaDocToken[] = [];
  
  const loanData = (quote.loanData || {}) as LoanData;
  
  const addToken = (name: string, value: string | number | null | undefined) => {
    tokens.push({
      name,
      value: value?.toString() || "",
    });
  };
  
  // Borrower info (from saved quote top-level fields)
  addToken("borrower_first_name", quote.customerFirstName);
  addToken("borrower_last_name", quote.customerLastName);
  addToken("borrower_name", `${quote.customerFirstName || ""} ${quote.customerLastName || ""}`.trim());
  addToken("borrower_full_name", `${quote.customerFirstName || ""} ${quote.customerLastName || ""}`.trim());
  addToken("borrower_email", quote.customerEmail);
  addToken("borrower_phone", quote.customerPhone);
  addToken("borrower_company", quote.customerCompanyName);
  
  // Property info (address from saved quote, details from loanData)
  addToken("property_address", quote.propertyAddress);
  addToken("property_type", loanData.propertyType);
  addToken("property_city", loanData.propertyCity);
  addToken("property_state", loanData.propertyState);
  addToken("property_zip", loanData.propertyZip);
  
  // Determine loan type from loanData
  const loanType = loanData.loanType || loanData.selectedLoanType;
  addToken("loan_type", loanType);
  
  // Loan amounts and values
  addToken("loan_amount", formatCurrency(loanData.loanAmount));
  addToken("property_value", formatCurrency(loanData.propertyValue));
  
  // Interest rate from saved quote top-level
  addToken("interest_rate", quote.interestRate ? `${quote.interestRate}%` : "");
  
  // DSCR-specific fields
  addToken("gross_monthly_rent", formatCurrency(loanData.grossMonthlyRent));
  addToken("annual_taxes", formatCurrency(loanData.annualTaxes));
  addToken("annual_insurance", formatCurrency(loanData.annualInsurance));
  addToken("dscr", loanData.dscr || loanData.calculatedDscr);
  addToken("ltv", formatPercent(loanData.ltv));
  
  // RTL (Fix & Flip) specific fields
  addToken("as_is_value", formatCurrency(loanData.asIsValue));
  addToken("arv", formatCurrency(loanData.arv));
  addToken("rehab_budget", formatCurrency(loanData.rehabBudget));
  addToken("purchase_price", formatCurrency(loanData.purchasePrice));
  addToken("ltc", formatPercent(loanData.ltc));
  addToken("ltarv", formatPercent(loanData.ltarv));
  addToken("ltaiv", formatPercent(loanData.ltaiv));
  
  // Loan details from loanData
  addToken("loan_purpose", loanData.loanPurpose);
  addToken("loan_term", loanData.loanTerm);
  addToken("interest_only", loanData.interestOnly);
  addToken("prepayment_penalty", loanData.prepaymentPenalty);
  addToken("fico", loanData.ficoScore || loanData.fico);
  addToken("fico_score", loanData.ficoScore || loanData.fico);
  addToken("experience_tier", loanData.experienceTier);
  
  // Commission/fees from saved quote
  addToken("points_charged", formatPercent(quote.pointsCharged));
  addToken("points_amount", formatCurrency(quote.pointsAmount));
  addToken("tpo_premium", formatCurrency(quote.tpoPremiumAmount));
  addToken("commission", formatCurrency(quote.commission));
  addToken("total_revenue", formatCurrency(quote.totalRevenue));
  
  // Dates
  addToken("today_date", formatDate(new Date()));
  addToken("quote_date", formatDate(quote.createdAt));
  
  // Quote reference
  addToken("quote_id", quote.id);
  addToken("deal_stage", quote.stage);
  
  // Partner info
  addToken("partner_name", quote.partnerName);
  
  return tokens;
}

export function fieldKeyToPandaTokenName(fieldKey: string): string {
  return fieldKey
    .replace(/\./g, "_")
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/__+/g, "_");
}

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
  purpose?: string;
  propertyType?: string;
  propertyState?: string;
  propertyCity?: string;
  propertyZip?: string;
  propertyAddress?: string;
  propertyUnits?: number | string;
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
  loanProductType?: string;
  borrowingEntityType?: string;
  completedProjects?: number | string;
  hasFullGuaranty?: boolean | string;
  includeNonGuarantorOwnerInExposure?: boolean | string;
  isDecliningMarket?: boolean | string;
  isForeignNational?: boolean | string;
  isListedLast12Months?: boolean | string;
  isMidstream?: boolean | string;
  mortgageLate30Last24?: boolean | string;
  mortgageLate60Last24?: boolean | string;
  baseRate?: number | string;
  finalRate?: number | string;
  points?: number | string;
  appliedAdjusters?: Array<{ id?: string; label: string; rateAdd: number; pointsAdd: number }>;
  caps?: { maxLTC?: number; maxLTV?: number; maxLTAIV?: number; maxLTARV?: number };
  reasons?: string[];
  monthlyPayment?: number | string;
  closingCosts?: number | string;
  originationFee?: number | string;
  processingFee?: number | string;
  lenderFee?: number | string;
  totalFees?: number | string;
  estimatedClosingDate?: string;
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
  const str = String(value);
  if (str.includes("%")) return str;
  const num = parseFloat(str);
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

function formatBoolean(value: boolean | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return value ? "Yes" : "No";
}

const EXPLICITLY_MAPPED_KEYS = new Set([
  "loanAmount", "propertyValue", "ltv", "loanType", "selectedLoanType", "loanProductType",
  "interestOnly", "loanPurpose", "purpose", "propertyType", "propertyState", "propertyCity",
  "propertyZip", "propertyAddress", "propertyUnits", "grossMonthlyRent", "annualTaxes",
  "annualInsurance", "calculatedDscr", "dscr", "ficoScore", "fico", "prepaymentPenalty",
  "tpoPremium", "loanTerm", "asIsValue", "arv", "rehabBudget", "purchasePrice",
  "ltc", "ltarv", "ltaiv", "experienceTier", "borrowingEntityType", "completedProjects",
  "hasFullGuaranty", "includeNonGuarantorOwnerInExposure", "isDecliningMarket",
  "isForeignNational", "isListedLast12Months", "isMidstream", "mortgageLate30Last24",
  "mortgageLate60Last24", "baseRate", "finalRate", "points", "appliedAdjusters", "caps",
  "reasons", "monthlyPayment", "closingCosts", "originationFee", "processingFee",
  "lenderFee", "totalFees", "estimatedClosingDate",
]);

export function mapQuoteToPandaTokens(quote: SavedQuote): PandaDocToken[] {
  const tokens: PandaDocToken[] = [];
  const loanData = (quote.loanData || {}) as LoanData;

  const addToken = (name: string, value: string | number | null | undefined) => {
    tokens.push({ name, value: value?.toString() || "" });
  };

  // ── Borrower info ──
  addToken("borrower_first_name", quote.customerFirstName);
  addToken("borrower_last_name", quote.customerLastName);
  const fullName = `${quote.customerFirstName || ""} ${quote.customerLastName || ""}`.trim();
  addToken("borrower_name", fullName);
  addToken("borrower_full_name", fullName);
  addToken("borrower_email", quote.customerEmail);
  addToken("borrower_phone", quote.customerPhone);
  addToken("borrower_company", quote.customerCompanyName);

  // ── Property info ──
  addToken("property_address", quote.propertyAddress || loanData.propertyAddress);
  addToken("property_type", loanData.propertyType);
  addToken("property_city", loanData.propertyCity);
  addToken("property_state", loanData.propertyState);
  addToken("property_zip", loanData.propertyZip);
  addToken("property_units", loanData.propertyUnits);

  // ── Loan type ──
  const loanType = loanData.loanType || loanData.selectedLoanType || loanData.loanProductType;
  addToken("loan_type", loanType);
  addToken("loan_product_type", loanData.loanProductType || loanType);

  // ── Loan amounts and values ──
  addToken("loan_amount", formatCurrency(loanData.loanAmount));
  addToken("loan_amount_raw", loanData.loanAmount);
  addToken("property_value", formatCurrency(loanData.propertyValue));
  addToken("property_value_raw", loanData.propertyValue);
  addToken("purchase_price", formatCurrency(loanData.purchasePrice));

  // ── Interest rate ──
  const rateStr = quote.interestRate || "";
  addToken("interest_rate", rateStr.includes("%") ? rateStr : rateStr ? `${rateStr}%` : "");
  addToken("interest_rate_raw", quote.interestRate);
  addToken("base_rate", formatPercent(loanData.baseRate));
  addToken("final_rate", formatPercent(loanData.finalRate));

  // ── DSCR-specific fields ──
  addToken("gross_monthly_rent", formatCurrency(loanData.grossMonthlyRent));
  addToken("annual_taxes", formatCurrency(loanData.annualTaxes));
  addToken("annual_insurance", formatCurrency(loanData.annualInsurance));
  addToken("dscr", loanData.dscr || loanData.calculatedDscr);
  addToken("calculated_dscr", loanData.calculatedDscr || loanData.dscr);
  addToken("ltv", formatPercent(loanData.ltv));

  // ── RTL (Fix & Flip / Ground Up) specific fields ──
  addToken("as_is_value", formatCurrency(loanData.asIsValue));
  addToken("arv", formatCurrency(loanData.arv));
  addToken("rehab_budget", formatCurrency(loanData.rehabBudget));
  addToken("ltc", formatPercent(loanData.ltc));
  addToken("ltarv", formatPercent(loanData.ltarv));
  addToken("ltaiv", formatPercent(loanData.ltaiv));

  // ── Loan details ──
  addToken("loan_purpose", loanData.loanPurpose || loanData.purpose);
  addToken("loan_term", loanData.loanTerm);
  addToken("interest_only", loanData.interestOnly);
  addToken("prepayment_penalty", loanData.prepaymentPenalty);
  addToken("fico", loanData.ficoScore || loanData.fico || (loanData as any).statedFicoScore);
  addToken("fico_score", loanData.ficoScore || loanData.fico || (loanData as any).statedFicoScore);
  addToken("experience_tier", loanData.experienceTier);
  addToken("completed_projects", loanData.completedProjects);
  addToken("borrowing_entity_type", loanData.borrowingEntityType);

  // ── Qualification flags ──
  addToken("has_full_guaranty", formatBoolean(loanData.hasFullGuaranty));
  addToken("is_declining_market", formatBoolean(loanData.isDecliningMarket));
  addToken("is_foreign_national", formatBoolean(loanData.isForeignNational));
  addToken("is_listed_last_12_months", formatBoolean(loanData.isListedLast12Months));
  addToken("is_midstream", formatBoolean(loanData.isMidstream));
  addToken("include_non_guarantor_owner", formatBoolean(loanData.includeNonGuarantorOwnerInExposure));
  addToken("mortgage_late_30_last_24", formatBoolean(loanData.mortgageLate30Last24));
  addToken("mortgage_late_60_last_24", formatBoolean(loanData.mortgageLate60Last24));

  // ── Rate adjusters ──
  if (loanData.appliedAdjusters && Array.isArray(loanData.appliedAdjusters)) {
    const adjusterLabels = loanData.appliedAdjusters.map(a => a.label).join(", ");
    const adjusterDetails = loanData.appliedAdjusters.map(a => {
      const parts = [a.label];
      if (a.rateAdd) parts.push(`Rate: +${a.rateAdd}%`);
      if (a.pointsAdd) parts.push(`Points: +${a.pointsAdd}`);
      return parts.join(" (") + (parts.length > 1 ? ")" : "");
    }).join("; ");
    const totalRateAdj = loanData.appliedAdjusters.reduce((sum, a) => sum + (a.rateAdd || 0), 0);
    const totalPointsAdj = loanData.appliedAdjusters.reduce((sum, a) => sum + (a.pointsAdd || 0), 0);

    addToken("rate_adjusters", adjusterLabels);
    addToken("rate_adjusters_detail", adjusterDetails);
    addToken("rate_adjusters_count", loanData.appliedAdjusters.length);
    addToken("total_rate_adjustment", formatPercent(totalRateAdj));
    addToken("total_points_adjustment", totalPointsAdj.toFixed(2));

    loanData.appliedAdjusters.forEach((adj, i) => {
      const idx = i + 1;
      addToken(`adjuster_${idx}_label`, adj.label);
      addToken(`adjuster_${idx}_rate`, formatPercent(adj.rateAdd));
      addToken(`adjuster_${idx}_points`, adj.pointsAdd?.toString() || "0");
    });
  } else {
    addToken("rate_adjusters", "");
    addToken("rate_adjusters_detail", "");
    addToken("rate_adjusters_count", "0");
    addToken("total_rate_adjustment", "");
    addToken("total_points_adjustment", "");
  }

  // ── Leverage caps ──
  if (loanData.caps) {
    addToken("max_ltc", formatPercent(loanData.caps.maxLTC));
    addToken("max_ltv", formatPercent(loanData.caps.maxLTV));
    addToken("max_ltaiv", formatPercent(loanData.caps.maxLTAIV));
    addToken("max_ltarv", formatPercent(loanData.caps.maxLTARV));
  } else {
    addToken("max_ltc", "");
    addToken("max_ltv", "");
    addToken("max_ltaiv", "");
    addToken("max_ltarv", "");
  }

  // ── Disqualification reasons ──
  if (loanData.reasons && Array.isArray(loanData.reasons)) {
    addToken("disqualification_reasons", loanData.reasons.join("; "));
  } else {
    addToken("disqualification_reasons", "");
  }

  // ── Fees & costs ──
  addToken("monthly_payment", formatCurrency(loanData.monthlyPayment));
  addToken("closing_costs", formatCurrency(loanData.closingCosts));
  addToken("origination_fee", formatCurrency(loanData.originationFee));
  addToken("processing_fee", formatCurrency(loanData.processingFee));
  addToken("lender_fee", formatCurrency(loanData.lenderFee));
  addToken("total_fees", formatCurrency(loanData.totalFees));

  // ── Commission/fees from saved quote top-level ──
  addToken("points_charged", formatPercent(quote.pointsCharged));
  addToken("points_amount", formatCurrency(quote.pointsAmount));
  addToken("tpo_premium", formatCurrency(quote.tpoPremiumAmount));
  addToken("tpo_premium_amount", formatCurrency(quote.tpoPremiumAmount));
  addToken("commission", formatCurrency(quote.commission));
  addToken("total_revenue", formatCurrency(quote.totalRevenue));
  addToken("points_raw", quote.pointsCharged);

  // ── Dates ──
  addToken("today_date", formatDate(new Date()));
  addToken("quote_date", formatDate(quote.createdAt));
  addToken("estimated_closing_date", loanData.estimatedClosingDate || "");

  // ── Quote reference ──
  addToken("quote_id", quote.id);
  addToken("deal_stage", quote.stage);

  // ── Partner info ──
  addToken("partner_name", quote.partnerName);

  // ── Program info ──
  addToken("program_id", quote.programId);

  // ── Dynamic catch-all: map any remaining loanData keys not explicitly handled ──
  for (const [key, value] of Object.entries(loanData)) {
    if (EXPLICITLY_MAPPED_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;

    const tokenName = fieldKeyToPandaTokenName(key);
    addToken(tokenName, value as string | number);
  }

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

export function getAllAvailableTokenNames(): string[] {
  return [
    "borrower_first_name", "borrower_last_name", "borrower_name", "borrower_full_name",
    "borrower_email", "borrower_phone", "borrower_company",
    "property_address", "property_type", "property_city", "property_state", "property_zip", "property_units",
    "loan_type", "loan_product_type",
    "loan_amount", "loan_amount_raw", "property_value", "property_value_raw", "purchase_price",
    "interest_rate", "interest_rate_raw", "base_rate", "final_rate",
    "gross_monthly_rent", "annual_taxes", "annual_insurance", "dscr", "calculated_dscr", "ltv",
    "as_is_value", "arv", "rehab_budget", "ltc", "ltarv", "ltaiv",
    "loan_purpose", "loan_term", "interest_only", "prepayment_penalty",
    "fico", "fico_score", "experience_tier", "completed_projects", "borrowing_entity_type",
    "has_full_guaranty", "is_declining_market", "is_foreign_national",
    "is_listed_last_12_months", "is_midstream", "include_non_guarantor_owner",
    "mortgage_late_30_last_24", "mortgage_late_60_last_24",
    "rate_adjusters", "rate_adjusters_detail", "rate_adjusters_count",
    "total_rate_adjustment", "total_points_adjustment",
    "max_ltc", "max_ltv", "max_ltaiv", "max_ltarv",
    "disqualification_reasons",
    "monthly_payment", "closing_costs", "origination_fee", "processing_fee",
    "lender_fee", "total_fees",
    "points_charged", "points_amount", "points_raw",
    "tpo_premium", "tpo_premium_amount", "commission", "total_revenue",
    "today_date", "quote_date", "estimated_closing_date",
    "quote_id", "deal_stage", "partner_name", "program_id",
  ];
}

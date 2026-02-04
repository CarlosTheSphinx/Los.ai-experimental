import type { RTLPricingFormData, RTLPricingResponse } from "@shared/schema";

interface Disqualifier {
  id: string;
  message: string;
}

interface Flag {
  id: string;
  message: string;
}

interface Adjuster {
  id: string;
  label: string;
  rateAdd: number;
}

const BASE_RATES: Record<string, number> = {
  light_rehab: 9.25,
  heavy_rehab: 9.50,
  bridge_no_rehab: 9.25,
  guc: 10.00,
};

const DEFAULT_POINTS = 2.0;

const INELIGIBLE_ENTITY_TYPES = ["natural_person", "irrevocable_trust", "cooperative", "community_land_trust"];

export function calculateRTLPricing(input: RTLPricingFormData): RTLPricingResponse {
  const disqualifiers: Disqualifier[] = [];
  const flags: Flag[] = [];
  const appliedAdjusters: Adjuster[] = [];

  // Run all disqualifiers
  runDisqualifiers(input, disqualifiers);

  // If any disqualifiers, return ineligible
  if (disqualifiers.length > 0) {
    return {
      eligible: false,
      disqualifiers,
      flags: runFlags(input),
    };
  }

  // Calculate rate
  const baseRate = BASE_RATES[input.loanType] || 9.25;
  let rate = baseRate;

  // Apply rate adjusters
  if (input.isMidstream) {
    rate += 0.25;
    appliedAdjusters.push({ id: "ADJ-MIDSTREAM", label: "Midstream", rateAdd: 0.25 });
  }

  if (input.purpose === "cash_out") {
    rate += 0.50;
    appliedAdjusters.push({ id: "ADJ-CASHOUT", label: "Cash-Out", rateAdd: 0.50 });
  }

  if (input.propertyType === "multifamily") {
    rate += 1.00;
    appliedAdjusters.push({ id: "ADJ-MULTIFAMILY", label: "Multifamily Property", rateAdd: 1.00 });
  }

  if (input.fico < 700) {
    rate += 0.25;
    appliedAdjusters.push({ id: "ADJ-FICO-LOW", label: "FICO < 700", rateAdd: 0.25 });
  }

  // Calculate leverage caps
  const caps = calculateLeverageCaps(input);

  return {
    eligible: true,
    baseRate,
    finalRate: Math.round(rate * 1000) / 1000,
    points: DEFAULT_POINTS,
    caps,
    appliedAdjusters,
    flags: runFlags(input),
  };
}

function runDisqualifiers(input: RTLPricingFormData, disqualifiers: Disqualifier[]): void {
  const loanAmount = input.loanAmount;
  
  // Only check loan amount limits if a specific loan amount is provided
  if (loanAmount && loanAmount > 0) {
    // DQ-LOAN-001: Below minimum loan amount
    if (loanAmount < 125000) {
      disqualifiers.push({ id: "DQ-LOAN-001", message: "Minimum loan amount is $125,000." });
    }

    // DQ-LOAN-002: Below minimum loan amount for GUC
    if (input.loanType === "guc" && loanAmount < 150000) {
      disqualifiers.push({ id: "DQ-LOAN-002", message: "Minimum loan amount for GUC is $150,000." });
    }

    // DQ-LOAN-003: Exceeds maximum loan amount
    if (loanAmount > 5000000) {
      disqualifiers.push({ id: "DQ-LOAN-003", message: "Maximum loan amount is $5,000,000." });
    }
  }

  // DQ-CREDIT-001: FICO below minimum
  if (input.fico < 660) {
    disqualifiers.push({ id: "DQ-CREDIT-001", message: "Minimum FICO is 660." });
  }

  // DQ-CREDIT-002: No full guaranty requires higher FICO
  if (!input.hasFullGuaranty && input.fico < 700) {
    disqualifiers.push({ id: "DQ-CREDIT-002", message: "Without a full guaranty, minimum FICO is 700." });
  }

  // DQ-CREDIT-003: Mortgage history exceeds allowed lates
  if (input.mortgageLate60Last24 > 0) {
    disqualifiers.push({ id: "DQ-CREDIT-003a", message: "Mortgage history must have 0x60 day lates in the past 24 months." });
  }
  if (input.mortgageLate30Last24 > 1) {
    disqualifiers.push({ id: "DQ-CREDIT-003b", message: "Mortgage history must have no more than 1x30 day late in the past 24 months." });
  }

  // DQ-CREDIT-004: BK seasoning < 60 months
  if (input.monthsSinceBK !== null && input.monthsSinceBK !== undefined && input.monthsSinceBK < 60) {
    disqualifiers.push({ id: "DQ-CREDIT-004", message: "Bankruptcy must be seasoned 60+ months." });
  }

  // DQ-CREDIT-005: Foreclosure seasoning < 60 months
  if (input.monthsSinceForeclosure !== null && input.monthsSinceForeclosure !== undefined && input.monthsSinceForeclosure < 60) {
    disqualifiers.push({ id: "DQ-CREDIT-005", message: "Foreclosure must be seasoned 60+ months." });
  }

  // DQ-CREDIT-006: Short sale / DIL seasoning < 60 months
  if (input.monthsSinceShortSaleOrDIL !== null && input.monthsSinceShortSaleOrDIL !== undefined && input.monthsSinceShortSaleOrDIL < 60) {
    disqualifiers.push({ id: "DQ-CREDIT-006", message: "DIL/Short sale must be seasoned 60+ months." });
  }

  // DQ-EXP-001: No experience cannot do Heavy Rehab
  if (input.experienceTier === "no_experience" && input.loanType === "heavy_rehab") {
    disqualifiers.push({ id: "DQ-EXP-001", message: "Heavy Rehab is not available for no-experience borrowers." });
  }

  // DQ-EXP-002: No experience cannot do GUC
  if (input.experienceTier === "no_experience" && input.loanType === "guc") {
    disqualifiers.push({ id: "DQ-EXP-002", message: "Ground-up construction requires experienced or institutional sponsorship." });
  }

  // DQ-EXP-003: Cash-out Bridge not allowed for no experience
  if (input.experienceTier === "no_experience" && input.loanType === "bridge_no_rehab" && input.purpose === "cash_out") {
    disqualifiers.push({ id: "DQ-EXP-003", message: "Cash-out bridge is not allowed for no-experience borrowers." });
  }

  // DQ-EXP-004: GUC requires 5+ completed projects if "Experienced"
  if (input.loanType === "guc" && input.experienceTier === "experienced" && input.completedProjects < 5) {
    disqualifiers.push({ id: "DQ-EXP-004", message: "GUC requires 5+ completed projects for experienced borrowers." });
  }

  // DQ-PROP-001: Units > 20 not allowed
  if (input.propertyUnits > 20) {
    disqualifiers.push({ id: "DQ-PROP-001", message: "Maximum unit count is 20." });
  }

  // DQ-PROP-002: >4 unit property requires experienced/institutional
  if (input.propertyUnits >= 5 && input.experienceTier === "no_experience") {
    disqualifiers.push({ id: "DQ-PROP-002", message: "Properties with 5+ units require experienced sponsorship." });
  }

  // DQ-PROP-003: >4 unit property cannot be GUC
  if (input.propertyUnits >= 5 && input.loanType === "guc") {
    disqualifiers.push({ id: "DQ-PROP-003", message: "GUC is not allowed on 5+ unit properties under this program." });
  }

  // DQ-CO-001: Cash-out exceeds general maximum
  if (input.purpose === "cash_out" && input.cashOutAmount && input.cashOutAmount > 500000) {
    // Check for bridge special case
    if (input.loanType !== "bridge_no_rehab") {
      disqualifiers.push({ id: "DQ-CO-001", message: "Cash-out is capped at $500,000." });
    }
  }

  // DQ-CO-002: Cash-out bridge cap logic
  if (input.loanType === "bridge_no_rehab" && input.purpose === "cash_out") {
    const ltv = input.ltv || 0;
    if (ltv > 50 && input.cashOutAmount && input.cashOutAmount > 1500000) {
      disqualifiers.push({ id: "DQ-CO-002", message: "Cash-out bridge is capped at $1,500,000 unless LTV is 50% or lower." });
    }
  }

  // DQ-CO-003: FICO < 680 cash-out not allowed
  if (input.fico < 680 && input.purpose === "cash_out") {
    disqualifiers.push({ id: "DQ-CO-003", message: "Cash-out is not allowed if FICO is below 680." });
  }

  // DQ-GUC-001: Initial draw to land exceeds max
  if (input.loanType === "guc" && input.initialDrawToLandPct !== undefined) {
    if (input.initialDrawToLandPct > 70) {
      disqualifiers.push({ id: "DQ-GUC-001a", message: "Initial draw to land cannot exceed 70%." });
    } else if (input.initialDrawToLandPct > 60 && !input.hasBuildingPermitsIssued) {
      disqualifiers.push({ id: "DQ-GUC-001b", message: "Initial draw to land is capped at 60% (up to 70% only with issued permits and case-by-case approval)." });
    }
  }

  // DQ-GUC-002: Stalled project rule
  if (input.loanType === "guc" && input.monthsSinceWorkPerformed !== undefined && input.monthsSinceWorkPerformed >= 3) {
    disqualifiers.push({ id: "DQ-GUC-002", message: "GUC is ineligible if no work has been completed in the past 3 months." });
  }

  // DQ-GUC-003: GUC Development Project requires institutional + FICO 700
  if (input.loanType === "guc" && input.propertyUnits >= 10 && ["sfr_1_4", "condo"].includes(input.propertyType)) {
    if (input.experienceTier !== "institutional") {
      disqualifiers.push({ id: "DQ-GUC-003a", message: "GUC development projects (10+ units) require institutional experience." });
    }
    if (input.fico < 700) {
      disqualifiers.push({ id: "DQ-GUC-003b", message: "GUC development projects (10+ units) require 700+ FICO." });
    }
  }

  // DQ-ENT-001: Ineligible borrowing entity
  if (input.borrowingEntityType && INELIGIBLE_ENTITY_TYPES.includes(input.borrowingEntityType)) {
    disqualifiers.push({ id: "DQ-ENT-001", message: "Borrower must be a US-domiciled legal entity (LLC/LP/Corp/Sole Prop/Revocable Trust). Natural persons and certain trusts/entities are not eligible." });
  }
}

function runFlags(input: RTLPricingFormData): Flag[] {
  const flags: Flag[] = [];

  // FLAG-001: Multifamily case-by-case
  if (input.propertyType === "multifamily") {
    flags.push({ id: "FLAG-001", message: "Multifamily properties require case-by-case review." });
  }

  // FLAG-002: Condo case-by-case
  if (input.propertyType === "condo") {
    flags.push({ id: "FLAG-002", message: "Condos require case-by-case review." });
  }

  // FLAG-003: Foreign national
  if (input.isForeignNational) {
    flags.push({ id: "FLAG-003", message: "Foreign national borrower - additional documentation required." });
  }

  // FLAG-004: Listed property
  if (input.isListedLast12Months && input.daysOnMarket && input.daysOnMarket >= 120) {
    flags.push({ id: "FLAG-004", message: "Property listed 120+ days - requires 3rd party valuation." });
  }

  // FLAG-005: Declining market
  if (input.isDecliningMarket) {
    flags.push({ id: "FLAG-005", message: "Declining market - leverage reductions may apply." });
  }

  return flags;
}

interface LeverageReduction {
  reason: string;
  ltcDelta: number;
  ltaivDelta: number;
  ltarvDelta: number;
}

function calculateLeverageCaps(input: RTLPricingFormData): { maxLTC?: number; maxLTAIV?: number; maxLTARV?: number | null; reductions?: LeverageReduction[] } {
  const reductions: LeverageReduction[] = [];
  
  const isPurchase = input.purpose === "purchase";
  
  // Base caps by experience tier and loan type
  // Values from leverage caps matrix - null means N/A (not applicable)
  // For Institutional Light Rehab: Purchase gets 95/90, Refi gets 90/85
  const baseCaps: Record<string, Record<string, { ltc: number; ltaiv: number; ltarv: number | null }>> = {
    institutional: {
      light_rehab: isPurchase 
        ? { ltc: 95, ltaiv: 90, ltarv: 75 }  // Purchase: 95/90/75
        : { ltc: 90, ltaiv: 85, ltarv: 75 }, // Refi: 90/85/75
      heavy_rehab: { ltc: 85, ltaiv: 85, ltarv: 75 },
      bridge_no_rehab: { ltc: 80, ltaiv: 85, ltarv: null }, // Bridge: LTARV N/A
      guc: { ltc: 85, ltaiv: 85, ltarv: null }, // GUC Institutional: LTARV N/A
    },
    experienced: {
      light_rehab: { ltc: 85, ltaiv: 85, ltarv: 70 },
      heavy_rehab: { ltc: 85, ltaiv: 85, ltarv: 70 },
      bridge_no_rehab: { ltc: 75, ltaiv: 75, ltarv: null }, // Bridge: LTARV N/A
      guc: { ltc: 85, ltaiv: 85, ltarv: null }, // GUC: LTARV N/A
    },
    no_experience: {
      light_rehab: { ltc: 80, ltaiv: 75, ltarv: null }, // No experience: LTARV N/A
      heavy_rehab: { ltc: 0, ltaiv: 0, ltarv: null }, // Disqualified - handled elsewhere
      bridge_no_rehab: { ltc: 70, ltaiv: 70, ltarv: null }, // Bridge: LTARV N/A
      guc: { ltc: 0, ltaiv: 0, ltarv: null }, // Disqualified - handled elsewhere
    },
  };

  const tierCaps = baseCaps[input.experienceTier]?.[input.loanType] || { ltc: 70, ltaiv: 70, ltarv: null };
  let { ltc, ltaiv, ltarv } = tierCaps;

  // Apply leverage overlays/reductions

  // FICO < 680: -10% across leverage + cash-out not allowed (handled in disqualifiers)
  if (input.fico < 680) {
    ltc -= 10;
    ltaiv -= 10;
    if (ltarv !== null) ltarv -= 10;
    reductions.push({ reason: "FICO < 680", ltcDelta: -10, ltaivDelta: -10, ltarvDelta: ltarv !== null ? -10 : 0 });
  }

  // Declining market: -10% LTC and LTARV
  if (input.isDecliningMarket) {
    ltc -= 10;
    if (ltarv !== null) ltarv -= 10;
    reductions.push({ reason: "Declining market", ltcDelta: -10, ltaivDelta: 0, ltarvDelta: ltarv !== null ? -10 : 0 });
  }

  // Listed 120+ days: -5% leverage reduction + requires 3rd party valuation
  if (input.isListedLast12Months && input.daysOnMarket && input.daysOnMarket >= 120) {
    ltc -= 5;
    ltaiv -= 5;
    if (ltarv !== null) ltarv -= 5;
    reductions.push({ reason: "Listed 120+ days", ltcDelta: -5, ltaivDelta: -5, ltarvDelta: ltarv !== null ? -5 : 0 });
  }

  // >4 units: cap LTAIV/LTC at 80%
  if (input.propertyUnits >= 5) {
    const prevLtc = ltc;
    const prevLtaiv = ltaiv;
    ltc = Math.min(ltc, 80);
    ltaiv = Math.min(ltaiv, 80);
    if (prevLtc > 80 || prevLtaiv > 80) {
      reductions.push({ reason: ">4 units property", ltcDelta: Math.min(0, 80 - prevLtc), ltaivDelta: Math.min(0, 80 - prevLtaiv), ltarvDelta: 0 });
    }
  }

  // Florida bridge no rehab: -5% across leverage
  const isFloridaProperty = input.propertyAddress && 
    (input.propertyAddress.toUpperCase().includes(" FL ") || 
     input.propertyAddress.toUpperCase().includes(", FL") ||
     input.propertyAddress.toUpperCase().includes("FLORIDA"));
  if (isFloridaProperty && input.loanType === "bridge_no_rehab") {
    ltc -= 5;
    ltaiv -= 5;
    if (ltarv !== null) ltarv -= 5;
    reductions.push({ reason: "FL bridge no rehab", ltcDelta: -5, ltaivDelta: -5, ltarvDelta: ltarv !== null ? -5 : 0 });
  }

  // GUC development project (10+ units): additional restrictions already in disqualifiers
  if (input.loanType === "guc") {
    const prevLtc = ltc;
    ltc = Math.min(ltc, 80);
    if (prevLtc > 80) {
      reductions.push({ reason: "GUC development cap", ltcDelta: 80 - prevLtc, ltaivDelta: 0, ltarvDelta: 0 });
    }
  }

  // Clamp to sane bounds
  ltc = Math.max(0, Math.min(95, ltc));
  ltaiv = Math.max(0, Math.min(95, ltaiv));
  if (ltarv !== null) {
    ltarv = Math.max(0, Math.min(95, ltarv));
  }

  return {
    maxLTC: ltc,
    maxLTAIV: ltaiv,
    maxLTARV: ltarv,
    reductions: reductions.length > 0 ? reductions : undefined,
  };
}

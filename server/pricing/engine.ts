import { matches, type PricingInputs } from "./matcher";
import type { PricingRules, RuleAdjuster, LeverageCap, Overlay, EligibilityRule } from "@shared/schema";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export interface AppliedAdjuster {
  id: string;
  label: string;
  rateAdd: number;
  pointsAdd: number;
}

export interface PricingResult {
  eligible: boolean;
  reasons?: string[];
  baseRate?: number;
  finalRate?: number;
  points?: number;
  caps?: {
    maxLTC: number;
    maxLTAIV: number;
    maxLTARV: number;
  };
  appliedAdjusters?: AppliedAdjuster[];
  notes?: string[];
}

export function validateRuleset(rules: unknown): string[] {
  const errors: string[] = [];
  
  if (!rules || typeof rules !== 'object') {
    errors.push("Rules must be an object");
    return errors;
  }
  
  const r = rules as Record<string, unknown>;
  
  if (!r.product) errors.push("Missing rules.product");
  if (!r.baseRates || typeof r.baseRates !== 'object') errors.push("Missing rules.baseRates");
  if (!Array.isArray(r.leverageCaps)) errors.push("Missing rules.leverageCaps[]");
  
  return errors;
}

export function priceQuote(rules: PricingRules, inputs: PricingInputs): PricingResult {
  const errors = validateRuleset(rules);
  if (errors.length) return { eligible: false, reasons: errors };

  const baseRate = rules.baseRates?.[inputs.loanType || ''];
  if (typeof baseRate !== "number") {
    return { eligible: false, reasons: [`Unknown loanType: ${inputs.loanType}`] };
  }

  const reasons: string[] = [];
  for (const r of rules.eligibilityRules ?? []) {
    if (matches(r.when, inputs)) {
      if (r.result === "ineligible") reasons.push(r.label);
    }
  }
  if (reasons.length) return { eligible: false, reasons };

  const cap = (rules.leverageCaps ?? []).find(
    (c) => c.tier === inputs.tier && (c.loanTypes ?? []).includes(inputs.loanType || '')
  );

  let maxLTC = cap?.max?.ltc ?? 0;
  let maxLTAIV = cap?.max?.ltaiv ?? 0;
  let maxLTARV = cap?.max?.ltarv ?? 0;

  const notes: string[] = [];
  for (const o of rules.overlays ?? []) {
    if (matches(o.when, inputs)) {
      if (o.effects?.ltcAdd) maxLTC += o.effects.ltcAdd;
      if (o.effects?.ltaivAdd) maxLTAIV += o.effects.ltaivAdd;
      if (o.effects?.ltarvAdd) maxLTARV += o.effects.ltarvAdd;
      notes.push(o.label);
    }
  }

  maxLTC = clamp(maxLTC, 0, 0.95);
  maxLTAIV = clamp(maxLTAIV, 0, 0.95);
  maxLTARV = clamp(maxLTARV, 0, 0.95);

  let rate = baseRate;
  let points = rules.points?.default ?? 0;
  const appliedAdjusters: AppliedAdjuster[] = [];

  for (const a of rules.adjusters ?? []) {
    if (matches(a.when, inputs)) {
      const rateAdd = a.rateAdd ?? 0;
      const pointsAdd = a.pointsAdd ?? 0;
      rate += rateAdd;
      points += pointsAdd;
      appliedAdjusters.push({ id: a.id, label: a.label, rateAdd, pointsAdd });
    }
  }

  return {
    eligible: true,
    baseRate,
    finalRate: Number(rate.toFixed(3)),
    points: Number(points.toFixed(3)),
    caps: { maxLTC, maxLTAIV, maxLTARV },
    appliedAdjusters,
    notes
  };
}

export const SAMPLE_RTL_RULESET: PricingRules = {
  product: "RTL",
  baseRates: {
    light_rehab: 9.25,
    heavy_rehab: 9.5,
    bridge_no_rehab: 9.25,
    guc: 10.0
  },
  points: { default: 2.0 },
  adjusters: [
    { id: "mff", label: "Multifamily", when: { propertyType: "multifamily-5-plus" }, rateAdd: 1.0 },
    { id: "fico_lt_700", label: "FICO < 700", when: { ficoLt: 700 }, rateAdd: 0.25 },
    { id: "fico_lt_660", label: "FICO < 660", when: { ficoLt: 660 }, rateAdd: 0.5 },
    { id: "midstream", label: "Midstream", when: { isMidstream: true }, rateAdd: 0.25 },
    { id: "cash_out", label: "Cash Out", when: { purpose: "cash_out" }, rateAdd: 0.5 },
    { id: "high_ltv", label: "LTV > 75%", when: { ltvGte: 75 }, rateAdd: 0.25 },
  ],
  leverageCaps: [
    {
      tier: "institutional",
      loanTypes: ["light_rehab", "heavy_rehab", "bridge_no_rehab", "guc"],
      max: { ltc: 0.9, ltaiv: 0.85, ltarv: 0.75 }
    },
    {
      tier: "experienced",
      loanTypes: ["light_rehab", "heavy_rehab", "bridge_no_rehab", "guc"],
      max: { ltc: 0.85, ltaiv: 0.85, ltarv: 0.75 }
    },
    {
      tier: "no_experience",
      loanTypes: ["light_rehab", "heavy_rehab", "bridge_no_rehab", "guc"],
      max: { ltc: 0.75, ltaiv: 0.75, ltarv: 0.7 }
    }
  ],
  overlays: [
    {
      id: "msa_5pct_ltc_reduction",
      label: "Selected MSAs require 5% reduction to LTC",
      when: { msaIn: ["Austin", "Bay Area, CA", "Boise", "Baltimore", "Sacramento", "San Jose"] },
      effects: { ltcAdd: -0.05 }
    },
    {
      id: "fl_bridge_no_rehab_reduction",
      label: "FL no-rehab bridge requires 5% reduction to leverage metrics",
      when: { state: "FL", loanType: "bridge_no_rehab" },
      effects: { ltcAdd: -0.05, ltaivAdd: -0.05, ltarvAdd: -0.05 }
    }
  ],
  eligibilityRules: [
    {
      id: "no_exp_cash_out_bridge_not_allowed",
      label: "Cash-out bridge not allowed for no-experience borrowers",
      when: { tier: "no_experience", loanType: "bridge_no_rehab", purpose: "cash_out" },
      result: "ineligible"
    },
    {
      id: "fico_below_620",
      label: "FICO below 620 not eligible",
      when: { ficoLt: 620 },
      result: "ineligible"
    }
  ]
};

export const SAMPLE_DSCR_RULESET: PricingRules = {
  product: "DSCR",
  baseRates: {
    "30yr_fixed": 7.5,
    "5yr_arm": 7.25,
    "7yr_arm": 7.35,
    "10yr_arm": 7.45,
    interest_only: 7.75
  },
  points: { default: 1.5 },
  adjusters: [
    { id: "dscr_lt_1", label: "DSCR < 1.0", when: { dscrLt: 1.0 }, rateAdd: 0.5 },
    { id: "dscr_lt_1_25", label: "DSCR < 1.25", when: { dscrLt: 1.25, dscrGte: 1.0 }, rateAdd: 0.25 },
    { id: "fico_lt_700", label: "FICO < 700", when: { ficoLt: 700 }, rateAdd: 0.25 },
    { id: "fico_lt_680", label: "FICO < 680", when: { ficoLt: 680 }, rateAdd: 0.25 },
    { id: "high_ltv", label: "LTV > 75%", when: { ltvGte: 75 }, rateAdd: 0.25 },
    { id: "large_loan", label: "Loan > $1.5M", when: { loanAmountGte: 1500000 }, rateAdd: -0.125 },
    { id: "cash_out", label: "Cash Out", when: { purpose: "cash_out" }, rateAdd: 0.5 },
  ],
  leverageCaps: [
    {
      tier: "experienced",
      loanTypes: ["30yr_fixed", "5yr_arm", "7yr_arm", "10yr_arm", "interest_only"],
      max: { ltc: 0.80, ltaiv: 0.80, ltarv: 0.75 }
    },
    {
      tier: "no_experience",
      loanTypes: ["30yr_fixed", "5yr_arm", "7yr_arm", "10yr_arm"],
      max: { ltc: 0.75, ltaiv: 0.75, ltarv: 0.70 }
    }
  ],
  overlays: [],
  eligibilityRules: [
    {
      id: "dscr_below_0_75",
      label: "DSCR below 0.75 not eligible",
      when: { dscrLt: 0.75 },
      result: "ineligible"
    },
    {
      id: "fico_below_660",
      label: "FICO below 660 not eligible for DSCR",
      when: { ficoLt: 660 },
      result: "ineligible"
    }
  ]
};

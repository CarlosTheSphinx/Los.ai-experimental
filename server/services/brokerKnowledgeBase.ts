/**
 * Broker Knowledge Base
 * Compiles a text knowledge pack from active loan programs, program review
 * rules, and broker-shareable fund knowledge entries that brokers are allowed
 * to ask the AI assistant about. Cached in-memory for a short TTL to keep
 * latency low.
 *
 * Important: Fund / lender names are NEVER included — only generic guidance.
 */

import { db } from "../db";
import {
  loanPrograms,
  programReviewRules,
  fundKnowledgeEntries,
  funds,
  type LoanProgram,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface KBCacheEntry {
  text: string;
  builtAt: number;
}

interface ReviewRuleRow {
  programId: number | null;
  title: string;
  description: string | null;
  severity: string | null;
  category: string | null;
}

interface KnowledgeEntryRow {
  category: string;
  content: string;
}

const cache = new Map<number, KBCacheEntry>();

// Categories that are safe to surface to brokers (no internal pricing or
// lender identification). 'specialty' is intentionally excluded because
// such notes often reference specific fund niches.
const BROKER_SHAREABLE_CATEGORIES = new Set(["general", "eligibility"]);

function fmtRange(
  min: number | null | undefined,
  max: number | null | undefined,
  suffix = "",
): string {
  if (min == null && max == null) return "n/a";
  const lo = min == null ? "—" : `${min}${suffix}`;
  const hi = max == null ? "—" : `${max}${suffix}`;
  return `${lo} to ${hi}`;
}

function formatTerms(termOptions: string | null): string | null {
  if (!termOptions) return null;
  const parts = termOptions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return `${parts.join(", ")} months`;
}

export async function buildBrokerKnowledgePack(
  tenantId: number,
): Promise<string> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.text;
  }

  const programs: LoanProgram[] = await db
    .select()
    .from(loanPrograms)
    .where(
      and(eq(loanPrograms.isActive, true), eq(loanPrograms.tenantId, tenantId)),
    );

  const programIds = programs.map((p) => p.id);

  const allRules: ReviewRuleRow[] = await db
    .select({
      programId: programReviewRules.programId,
      title: programReviewRules.ruleTitle,
      description: programReviewRules.ruleDescription,
      severity: programReviewRules.severity,
      category: programReviewRules.category,
    })
    .from(programReviewRules)
    .where(eq(programReviewRules.isActive, true));

  // Tenant-scope rules: only include rules attached to this tenant's programs.
  // Orphan rules (no program attachment) are excluded because the table has
  // no tenant column, so we cannot prove they are safe to surface here.
  const programIdSet = new Set(programIds);
  const rules = allRules.filter(
    (r) => r.programId != null && programIdSet.has(r.programId),
  );

  // Tenant-scoped, broker-shareable fund knowledge — fund names are
  // intentionally NOT selected/exposed.
  const tenantFunds = await db
    .select({ id: funds.id, allowedStates: funds.allowedStates })
    .from(funds)
    .where(eq(funds.tenantId, tenantId));
  const fundIds = tenantFunds.map((f) => f.id);

  // Aggregate state coverage across all of this tenant's funds (no fund
  // identification — just the union of states the platform can lend in).
  const stateSet = new Set<string>();
  for (const f of tenantFunds) {
    const arr = f.allowedStates;
    if (Array.isArray(arr)) {
      for (const s of arr) {
        if (typeof s === "string" && s.trim()) stateSet.add(s.trim().toUpperCase());
      }
    }
  }
  const lendingStates = Array.from(stateSet).sort();

  let knowledge: KnowledgeEntryRow[] = [];
  if (fundIds.length) {
    knowledge = await db
      .select({
        category: fundKnowledgeEntries.category,
        content: fundKnowledgeEntries.content,
      })
      .from(fundKnowledgeEntries)
      .where(inArray(fundKnowledgeEntries.fundId, fundIds));
    knowledge = knowledge.filter((k) =>
      BROKER_SHAREABLE_CATEGORIES.has(k.category),
    );
  }

  const rulesByProgram = new Map<number | null, ReviewRuleRow[]>();
  for (const r of rules) {
    const k = r.programId ?? null;
    const arr = rulesByProgram.get(k) ?? [];
    arr.push(r);
    rulesByProgram.set(k, arr);
  }

  const lines: string[] = [];
  if (lendingStates.length) {
    lines.push("# LENDING STATES");
    lines.push(
      `Sphinx Capital can place loans in the following states: ${lendingStates.join(", ")}.`,
    );
    lines.push(
      "If a state is not listed, we generally cannot lend there — tell the broker to confirm with their loan officer.",
    );
    lines.push("");
  }
  lines.push("# SPHINX CAPITAL LOAN PROGRAMS");
  lines.push("");
  for (const p of programs) {
    lines.push(`## ${p.name} (${p.loanType ?? "n/a"})`);
    if (p.description) lines.push(p.description);
    lines.push(`- Loan amount: ${fmtRange(p.minLoanAmount, p.maxLoanAmount)}`);
    lines.push(`- LTV: ${fmtRange(p.minLtv, p.maxLtv, "%")}`);
    lines.push(
      `- Indicative rate range: ${fmtRange(p.minInterestRate, p.maxInterestRate, "%")} (subject to pricing engine)`,
    );
    const term = formatTerms(p.termOptions);
    if (term) lines.push(`- Term options: ${term}`);
    if (p.minDscr != null) lines.push(`- Min DSCR: ${p.minDscr}`);
    if (p.minFico != null) lines.push(`- Min FICO: ${p.minFico}`);
    if (p.minUnits != null || p.maxUnits != null) {
      lines.push(`- Units: ${fmtRange(p.minUnits, p.maxUnits)}`);
    }
    const propTypes = p.eligiblePropertyTypes;
    if (Array.isArray(propTypes) && propTypes.length) {
      lines.push(`- Eligible property types: ${propTypes.join(", ")}`);
    }

    const programRules = rulesByProgram.get(p.id) ?? [];
    if (programRules.length) {
      lines.push("");
      lines.push(`### Underwriting & Eligibility Rules`);
      for (const r of programRules) {
        const sev = r.severity ? ` [${r.severity}]` : "";
        const cat = r.category ? ` (${r.category})` : "";
        lines.push(`- **${r.title}**${cat}${sev}`);
        if (r.description) {
          lines.push(`  ${r.description.replace(/\s+/g, " ").trim()}`);
        }
      }
    }
    lines.push("");
  }

  // Rules without a program attachment
  const orphanRules = rulesByProgram.get(null) ?? [];
  if (orphanRules.length) {
    lines.push("# GENERAL UNDERWRITING & ELIGIBILITY RULES");
    for (const r of orphanRules) {
      const sev = r.severity ? ` [${r.severity}]` : "";
      const cat = r.category ? ` (${r.category})` : "";
      lines.push(`- **${r.title}**${cat}${sev}`);
      if (r.description) {
        lines.push(`  ${r.description.replace(/\s+/g, " ").trim()}`);
      }
    }
    lines.push("");
  }

  if (knowledge.length) {
    lines.push("# GENERAL LENDING-PARTNER GUIDELINES");
    lines.push(
      "(Broker-shareable notes; do not attribute to any specific lender or fund.)",
    );
    for (const k of knowledge) {
      const trimmed = k.content.replace(/\s+/g, " ").trim();
      if (trimmed) lines.push(`- ${trimmed}`);
    }
    lines.push("");
  }

  const text = lines.join("\n");
  cache.set(tenantId, { text, builtAt: Date.now() });
  return text;
}

export function invalidateBrokerKnowledgeCache(tenantId?: number): void {
  if (tenantId == null) cache.clear();
  else cache.delete(tenantId);
}

// ─── Lender Knowledge Pack ────────────────────────────────────────────────────
// A superset of the broker pack:
//   • All active loan programs + underwriting rules (same as broker)
//   • ALL fund knowledge categories (no broker-safe filter)
//   • Full fund structured fields + fund names (lenders need them)
// Cached separately with the same 10-min TTL.

const lenderCache = new Map<number, KBCacheEntry>();

export async function buildLenderKnowledgePack(tenantId: number): Promise<string> {
  const cached = lenderCache.get(tenantId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.text;
  }

  const programs: LoanProgram[] = await db
    .select()
    .from(loanPrograms)
    .where(and(eq(loanPrograms.isActive, true), eq(loanPrograms.tenantId, tenantId)));

  const programIds = programs.map((p) => p.id);
  const programIdSet = new Set(programIds);

  const allRules: ReviewRuleRow[] = await db
    .select({
      programId: programReviewRules.programId,
      title: programReviewRules.ruleTitle,
      description: programReviewRules.ruleDescription,
      severity: programReviewRules.severity,
      category: programReviewRules.category,
    })
    .from(programReviewRules)
    .where(eq(programReviewRules.isActive, true));

  const rules = allRules.filter(
    (r) => r.programId != null && programIdSet.has(r.programId),
  );

  // All tenant funds (including names — lenders can see fund identity)
  const tenantFunds = await db
    .select()
    .from(funds)
    .where(eq(funds.tenantId, tenantId));

  const fundIds = tenantFunds.map((f) => f.id);

  // ALL knowledge entry categories — no broker-safe filter
  let allKnowledge: (KnowledgeEntryRow & { fundId: number })[] = [];
  if (fundIds.length) {
    const rows = await db
      .select({
        fundId: fundKnowledgeEntries.fundId,
        category: fundKnowledgeEntries.category,
        content: fundKnowledgeEntries.content,
      })
      .from(fundKnowledgeEntries)
      .where(inArray(fundKnowledgeEntries.fundId, fundIds));
    allKnowledge = rows;
  }

  const knowledgeByFund = new Map<number, (KnowledgeEntryRow & { fundId: number })[]>();
  for (const k of allKnowledge) {
    const arr = knowledgeByFund.get(k.fundId) ?? [];
    arr.push(k);
    knowledgeByFund.set(k.fundId, arr);
  }

  const rulesByProgram = new Map<number | null, ReviewRuleRow[]>();
  for (const r of rules) {
    const k = r.programId ?? null;
    const arr = rulesByProgram.get(k) ?? [];
    arr.push(r);
    rulesByProgram.set(k, arr);
  }

  const lines: string[] = [];

  // ── Loan Programs ──────────────────────────────────────────────
  lines.push("# SPHINX CAPITAL LOAN PROGRAMS");
  lines.push("");
  for (const p of programs) {
    lines.push(`## ${p.name} (${p.loanType ?? "n/a"})`);
    if (p.description) lines.push(p.description);
    lines.push(`- Loan amount: ${fmtRange(p.minLoanAmount, p.maxLoanAmount)}`);
    lines.push(`- LTV: ${fmtRange(p.minLtv, p.maxLtv, "%")}`);
    lines.push(
      `- Indicative rate range: ${fmtRange(p.minInterestRate, p.maxInterestRate, "%")}`,
    );
    const term = formatTerms(p.termOptions);
    if (term) lines.push(`- Term options: ${term}`);
    if (p.minDscr != null) lines.push(`- Min DSCR: ${p.minDscr}`);
    if (p.minFico != null) lines.push(`- Min FICO: ${p.minFico}`);
    if (p.minUnits != null || p.maxUnits != null) {
      lines.push(`- Units: ${fmtRange(p.minUnits, p.maxUnits)}`);
    }
    const propTypes = p.eligiblePropertyTypes;
    if (Array.isArray(propTypes) && propTypes.length) {
      lines.push(`- Eligible property types: ${propTypes.join(", ")}`);
    }

    const programRules = rulesByProgram.get(p.id) ?? [];
    if (programRules.length) {
      lines.push("");
      lines.push("### Underwriting & Eligibility Rules");
      for (const r of programRules) {
        const sev = r.severity ? ` [${r.severity}]` : "";
        const cat = r.category ? ` (${r.category})` : "";
        lines.push(`- **${r.title}**${cat}${sev}`);
        if (r.description) lines.push(`  ${r.description.replace(/\s+/g, " ").trim()}`);
      }
    }
    lines.push("");
  }

  const orphanRules = rulesByProgram.get(null) ?? [];
  if (orphanRules.length) {
    lines.push("# GENERAL UNDERWRITING & ELIGIBILITY RULES");
    for (const r of orphanRules) {
      const sev = r.severity ? ` [${r.severity}]` : "";
      const cat = r.category ? ` (${r.category})` : "";
      lines.push(`- **${r.title}**${cat}${sev}`);
      if (r.description) lines.push(`  ${r.description.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("");
  }

  // ── Aggregate lending states across all active funds ───────────
  const allStates = new Set<string>();
  for (const f of tenantFunds) {
    if (f.isActive && Array.isArray(f.allowedStates)) {
      for (const s of f.allowedStates) allStates.add(s);
    }
  }
  if (allStates.size > 0) {
    lines.push("# LENDING STATES (union of all active funds)");
    lines.push(Array.from(allStates).sort().join(", "));
    lines.push("");
  }

  // ── Funds ──────────────────────────────────────────────────────
  if (tenantFunds.length) {
    lines.push("# LENDING PARTNERS / FUNDS");
    lines.push("");
    for (const f of tenantFunds) {
      if (!f.isActive) continue;
      lines.push(`## ${f.fundName}${f.providerName ? ` (${f.providerName})` : ""}`);
      if (f.fundDescription) lines.push(f.fundDescription);
      if (f.loanAmountMin != null || f.loanAmountMax != null)
        lines.push(`- Loan amount: ${fmtRange(f.loanAmountMin, f.loanAmountMax)}`);
      if (f.ltvMin != null || f.ltvMax != null)
        lines.push(`- LTV: ${fmtRange(f.ltvMin, f.ltvMax, "%")}`);
      if (f.ltcMin != null || f.ltcMax != null)
        lines.push(`- LTC: ${fmtRange(f.ltcMin, f.ltcMax, "%")}`);
      if (f.interestRateMin != null || f.interestRateMax != null)
        lines.push(`- Interest rate: ${fmtRange(f.interestRateMin, f.interestRateMax, "%")}`);
      if (f.termMin != null || f.termMax != null)
        lines.push(`- Term: ${fmtRange(f.termMin, f.termMax, " months")}`);
      if (f.recourseType) lines.push(`- Recourse: ${f.recourseType}`);
      if (f.minDscr != null) lines.push(`- Min DSCR: ${f.minDscr}`);
      if (f.minCreditScore != null) lines.push(`- Min credit score: ${f.minCreditScore}`);
      if (f.prepaymentTerms) lines.push(`- Prepayment: ${f.prepaymentTerms}`);
      if (f.closingTimeline) lines.push(`- Closing timeline: ${f.closingTimeline}`);
      if (f.originationFeeMin != null || f.originationFeeMax != null)
        lines.push(`- Origination fee: ${fmtRange(f.originationFeeMin, f.originationFeeMax, "%")}`);
      const assetTypes = f.allowedAssetTypes;
      if (Array.isArray(assetTypes) && assetTypes.length)
        lines.push(`- Asset types: ${assetTypes.join(", ")}`);
      const loanTypes = f.loanTypes;
      if (Array.isArray(loanTypes) && loanTypes.length)
        lines.push(`- Loan types: ${loanTypes.join(", ")}`);
      const states = f.allowedStates;
      if (Array.isArray(states) && states.length)
        lines.push(`- States: ${states.join(", ")}`);
      if (f.contactName || f.contactEmail || f.contactPhone) {
        const contact = [f.contactName, f.contactEmail, f.contactPhone].filter(Boolean).join(" | ");
        lines.push(`- Contact: ${contact}`);
      }

      const knowledge = knowledgeByFund.get(f.id) ?? [];
      if (knowledge.length) {
        lines.push("- Notes:");
        for (const k of knowledge) {
          const trimmed = k.content.replace(/\s+/g, " ").trim();
          if (trimmed) lines.push(`  [${k.category}] ${trimmed}`);
        }
      }
      lines.push("");
    }
  }

  const text = lines.join("\n");
  lenderCache.set(tenantId, { text, builtAt: Date.now() });
  return text;
}

export function invalidateLenderKnowledgeCache(tenantId?: number): void {
  if (tenantId == null) lenderCache.clear();
  else lenderCache.delete(tenantId);
}

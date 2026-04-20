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

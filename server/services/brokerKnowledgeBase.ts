/**
 * Broker Knowledge Base
 * Compiles a text knowledge pack from active loan programs, program review
 * rules, and credit policies that brokers are allowed to ask the AI assistant
 * about. Cached in-memory for a short TTL to keep latency low.
 */

import { db } from "../db";
import { loanPrograms, programReviewRules, creditPolicies } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface KBCacheEntry {
  text: string;
  builtAt: number;
}

const cache = new Map<number, KBCacheEntry>();

function fmtRange(min: number | null | undefined, max: number | null | undefined, suffix = "") {
  if (min == null && max == null) return "n/a";
  const lo = min == null ? "—" : `${min}${suffix}`;
  const hi = max == null ? "—" : `${max}${suffix}`;
  return `${lo} to ${hi}`;
}

export async function buildBrokerKnowledgePack(tenantId: number): Promise<string> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.text;
  }

  const programs = await db
    .select()
    .from(loanPrograms)
    .where(and(eq(loanPrograms.isActive, true), eq(loanPrograms.tenantId, tenantId)));

  const policies = await db
    .select()
    .from(creditPolicies)
    .where(eq(creditPolicies.isActive, true));

  const allRules = await db
    .select({
      programId: programReviewRules.programId,
      title: programReviewRules.ruleTitle,
      description: programReviewRules.ruleDescription,
      severity: programReviewRules.severity,
      category: programReviewRules.category,
    })
    .from(programReviewRules)
    .where(eq(programReviewRules.isActive, true));

  // Tenant-scope rules: only include rules attached to this tenant's programs
  // (or orphan rules with no program attachment — treated as global).
  const programIds = new Set(programs.map((p) => p.id));
  const rules = allRules.filter(
    (r) => r.programId == null || programIds.has(r.programId),
  );

  const programNameById = new Map<number, string>();
  for (const p of programs) programNameById.set(p.id, p.name);

  const rulesByProgram = new Map<number | null, typeof rules>();
  for (const r of rules) {
    const k = r.programId ?? null;
    const arr = rulesByProgram.get(k) ?? [];
    arr.push(r);
    rulesByProgram.set(k, arr);
  }

  const lines: string[] = [];
  lines.push("# SPHINX CAPITAL LOAN PROGRAMS");
  lines.push("");
  for (const p of programs) {
    lines.push(`## ${p.name} (${p.loanType ?? "n/a"})`);
    if (p.description) lines.push(p.description);
    lines.push(`- Loan amount: ${fmtRange(p.minLoanAmount as any, p.maxLoanAmount as any, "")}`);
    lines.push(`- LTV: ${fmtRange(p.minLtv as any, p.maxLtv as any, "%")}`);
    if (p.minDscr != null) lines.push(`- Min DSCR: ${p.minDscr}`);
    if (p.minFico != null) lines.push(`- Min FICO: ${p.minFico}`);
    const propTypes = (p.eligiblePropertyTypes as any) || [];
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

  if (policies.length) {
    lines.push("# CREDIT POLICY DOCUMENTS");
    for (const cp of policies) {
      lines.push(`- ${cp.name}${cp.description ? `: ${cp.description}` : ""}`);
    }
  }

  const text = lines.join("\n");
  cache.set(tenantId, { text, builtAt: Date.now() });
  return text;
}

export function invalidateBrokerKnowledgeCache(tenantId?: number) {
  if (tenantId == null) cache.clear();
  else cache.delete(tenantId);
}

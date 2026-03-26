import { db } from "../db";
import { funds, intakeDeals, intakeAiAnalysis, intakeDealStatusHistory, intakeDealDocuments, agentConfigurations, fundKnowledgeEntries } from "@shared/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { OrchestrationTracer } from "../services/orchestrationTracing";
import OpenAI from "openai";
import { INTAKE_AGENT_PROMPTS } from "./intakePrompts";
import { AI_REFERENCE_KEY } from "@shared/loanConstants";
import { generateEmbedding } from "../services/embeddings";

const OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

async function getAgentConfig(agentType: string): Promise<{ systemPrompt: string; modelName: string; temperature: number; maxTokens: number } | null> {
  try {
    const config = await db.select().from(agentConfigurations)
      .where(and(eq(agentConfigurations.agentType, agentType), eq(agentConfigurations.isActive, true)))
      .orderBy(desc(agentConfigurations.version))
      .then(rows => rows[0]);
    if (config) {
      return { systemPrompt: config.systemPrompt, modelName: config.modelName, temperature: config.temperature, maxTokens: config.maxTokens };
    }
  } catch (e) {}
  return null;
}

async function callOpenAI(systemPrompt: string, userMessage: string, model: string = "gpt-4o-mini", temperature: number = 0.3): Promise<any> {
  if (!openai) {
    console.warn("[Intake AI] No OpenAI API key, returning null");
    return null;
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from OpenAI");
  return JSON.parse(content);
}

const DEFAULT_PROMPTS = {
  validator: INTAKE_AGENT_PROMPTS.VALIDATOR,
  fundMatcher: INTAKE_AGENT_PROMPTS.FUND_MATCHER,
  feedbackGenerator: INTAKE_AGENT_PROMPTS.FEEDBACK_GENERATOR,
};

const JSON_FORMAT_SUFFIX = {
  validator: `\n\nCRITICAL: You MUST respond with ONLY a valid JSON object using EXACTLY these field names:
{
  "validation_status": "valid" | "invalid",
  "validation_errors": [{"field": "...", "error": "...", "severity": "critical|high|medium|low"}],
  "structured_deal": {
    "basic_info": { "deal_name": "...", "loan_amount": 0, "asset_type": "...", "property_address": "...", "property_city": "...", "property_state": "...", "property_zip": "..." },
    "borrower_info": { "name": "...", "entity_type": "...", "credit_score": 0, "has_guarantor": false },
    "metrics": { "property_value": 0, "ltv_pct": 0, "noi_annual": 0, "dscr": 0, "occupancy_pct": 0 },
    "documents_submitted": ["doc_type1"],
    "documents_missing": ["doc_type2"]
  }
}`,
  fundMatcher: `\n\nIMPORTANT MATCHING RULES:
- You MUST evaluate EVERY fund in the list, not just ones with complete criteria.
- If a fund has null/empty/missing criteria for a field (e.g. ltv_max is null, allowed_states is empty), treat that as NO RESTRICTION — the fund accepts any value for that field.
- A fund with no criteria set at all should be treated as a POTENTIAL MATCH (score 60-70) because it has no disqualifying restrictions.
- Only mark a fund as non-matching if it has an explicit criterion that the deal violates.
- Use the fund_summary, description, and knowledge fields to understand each fund's specialty and lending focus.
- Set total_funds_checked to the actual number of funds you evaluated (should equal the total funds provided).
- Include ALL funds that could potentially work in eligible_funds (score >= 50).

CRITICAL: You MUST respond with ONLY a valid JSON object using EXACTLY these field names:
{
  "eligible_funds": [{ "fund_id": 0, "fund_name": "...", "match_score": 0, "match_reason": "..." }],
  "total_funds_checked": 0,
  "deal_health": {
    "borrower_risk_score": 0, "borrower_risk_detail": "...",
    "property_risk_score": 0, "property_risk_detail": "...",
    "loan_structure_risk_score": 0, "loan_structure_risk_detail": "...",
    "documentation_risk_score": 0, "documentation_risk_detail": "..."
  }
}`,
  feedbackGenerator: `\n\nCRITICAL: You MUST respond with ONLY a valid JSON object using EXACTLY these field names:
{
  "overall_verdict": "pass" | "conditional" | "fail",
  "confidence_score": 0,
  "confidence_breakdown": { "fund_fit": 0, "deal_health": 0 },
  "key_flaws": [{ "flaw": "...", "severity": "critical|high|medium|low", "detail": "...", "remediation": "..." }],
  "strengths": [{ "strength": "...", "detail": "..." }],
  "fund_recommendations": [{ "fund_name": "...", "match_score": 0, "recommendation": "..." }],
  "next_steps": ["..."]
}`,
};

function normalizeAgent1Result(result: any): any {
  if (!result || typeof result !== "object") return result;
  return {
    ...result,
    validation_status: result.validation_status || result.validationStatus || result.status || "valid",
    validation_errors: result.validation_errors || result.validationErrors || result.errors || [],
    structured_deal: result.structured_deal || result.structuredDeal || result.deal || result,
  };
}

function normalizeAgent2Result(result: any): any {
  if (!result || typeof result !== "object") return result;

  let allFunds = result.fund_matches || result.eligible_funds || result.eligibleFunds || result.matched_funds || result.matchedFunds || [];

  const eligible = allFunds.filter((f: any) => {
    const verdict = (f.match_verdict || "").toLowerCase();
    const score = f.match_score ?? f.fit_score ?? 0;
    if (verdict === "yes" || verdict === "maybe") return true;
    if (score >= 50) return true;
    return false;
  }).map((f: any) => ({
    fund_id: f.fund_id,
    fund_name: f.fund_name,
    match_score: f.match_score ?? f.fit_score ?? 0,
    match_reason: f.recommendation || f.match_reason || "",
    match_verdict: f.match_verdict,
  }));

  const totalChecked = result.total_funds_checked || result.totalFundsChecked
    || result.summary?.total_funds_evaluated || allFunds.length || 0;

  const forFeedback = result.for_feedback_agent || {};

  return {
    ...result,
    eligible_funds: eligible,
    fund_matches: eligible,
    total_funds_checked: totalChecked,
    for_feedback_agent: {
      eligible_funds: forFeedback.eligible_funds || eligible.map((f: any) => ({
        fund_id: f.fund_id, fund_name: f.fund_name, fit_score: f.match_score,
      })),
      matching_challenges: forFeedback.matching_challenges || [],
    },
    deal_health: result.deal_health || result.dealHealth || result.risk_assessment || result.riskAssessment || {
      borrower_risk_score: 50, borrower_risk_detail: "Not assessed",
      property_risk_score: 50, property_risk_detail: "Not assessed",
      loan_structure_risk_score: 50, loan_structure_risk_detail: "Not assessed",
      documentation_risk_score: 50, documentation_risk_detail: "Not assessed",
    },
  };
}

function normalizeVerdict(v: string): string {
  if (!v) return "conditional";
  const lower = v.toLowerCase().trim();
  if (["pass", "approved", "accept", "strong"].includes(lower)) return "pass";
  if (["fail", "reject", "denied", "decline"].includes(lower)) return "fail";
  return "conditional";
}

function normalizeAgent3Result(result: any): any {
  if (!result || typeof result !== "object") return result;
  const rawVerdict = result.overall_verdict || result.overallVerdict || result.verdict || "conditional";
  const verdict = normalizeVerdict(rawVerdict);
  const confidence = result.confidence_score ?? result.confidenceScore ?? result.confidence ?? 50;
  return {
    ...result,
    overall_verdict: verdict,
    confidence_score: typeof confidence === "number" ? confidence : parseInt(confidence) || 50,
    confidence_breakdown: result.confidence_breakdown || result.confidenceBreakdown || { fund_fit: 50, deal_health: 50 },
    key_flaws: result.key_flaws || result.keyFlaws || result.flaws || result.issues || result.concerns || [],
    strengths: result.strengths || result.positives || result.strong_points || [],
    fund_recommendations: result.fund_recommendations || result.fundRecommendations || result.recommendations || [],
    next_steps: result.next_steps || result.nextSteps || result.action_items || result.actionItems || [],
  };
}

async function agent1ValidateAndStructure(deal: any, documents: any[], sessionId?: string): Promise<any> {
  const config = await getAgentConfig("intake_validator");
  const basePrompt = config?.systemPrompt || DEFAULT_PROMPTS.validator;
  const systemPrompt = basePrompt + "\n\n" + AI_REFERENCE_KEY + JSON_FORMAT_SUFFIX.validator;
  const model = config?.modelName || "gpt-4o-mini";
  const temperature = config?.temperature ?? 0.3;

  const userMessage = JSON.stringify({
    deal_data: {
      deal_name: deal.dealName, loan_amount: deal.loanAmount, asset_type: deal.assetType,
      property_address: deal.propertyAddress, property_city: deal.propertyCity,
      property_state: deal.propertyState, property_zip: deal.propertyZip,
      property_value: deal.propertyValue, noi_annual: deal.noiAnnual,
      occupancy_pct: deal.occupancyPct, borrower_name: deal.borrowerName,
      borrower_entity_type: deal.borrowerEntityType, borrower_credit_score: deal.borrowerCreditScore,
      has_guarantor: deal.hasGuarantor,
    },
    deal_story: deal.dealStoryTranscript || null,
    documents: documents.filter(d => d.isCurrent).map(d => ({ type: d.documentType, file_name: d.fileName, version: d.version })),
  });

  const agentFn = async () => {
    const result = await callOpenAI(systemPrompt, userMessage, model, temperature);
    if (!result) {
      const ltvPct = deal.propertyValue ? ((deal.loanAmount || 0) / deal.propertyValue * 100) : 0;
      const dscr = deal.noiAnnual && deal.loanAmount ? (deal.noiAnnual / (deal.loanAmount * 0.07)) : 0;
      return {
        validation_status: deal.dealName && deal.loanAmount && deal.assetType ? "valid" : "invalid",
        validation_errors: [],
        structured_deal: {
          basic_info: { deal_name: deal.dealName, loan_amount: deal.loanAmount, asset_type: deal.assetType, property_address: deal.propertyAddress, property_city: deal.propertyCity, property_state: deal.propertyState, property_zip: deal.propertyZip },
          borrower_info: { name: deal.borrowerName, entity_type: deal.borrowerEntityType, credit_score: deal.borrowerCreditScore, has_guarantor: deal.hasGuarantor },
          metrics: { property_value: deal.propertyValue, ltv_pct: parseFloat(ltvPct.toFixed(2)), noi_annual: deal.noiAnnual, dscr: parseFloat(dscr.toFixed(2)), occupancy_pct: deal.occupancyPct },
          documents_submitted: documents.filter(d => d.isCurrent).map(d => d.documentType),
          documents_missing: [],
        },
      };
    }
    return normalizeAgent1Result(result);
  };

  if (sessionId && OrchestrationTracer.hasSubscribers()) {
    return OrchestrationTracer.traceAgent("intake_validator", 0, { deal_id: deal.id, deal_name: deal.dealName }, agentFn, systemPrompt, sessionId);
  }
  return agentFn();
}

async function agent2MatchFunds(structuredDeal: any, activeFunds: any[], sessionId?: string): Promise<any> {
  const config = await getAgentConfig("intake_fund_matcher");
  const basePrompt = config?.systemPrompt || DEFAULT_PROMPTS.fundMatcher;
  const systemPrompt = basePrompt + "\n\n" + AI_REFERENCE_KEY + JSON_FORMAT_SUFFIX.fundMatcher;
  const model = config?.modelName || "gpt-4o-mini";
  const temperature = config?.temperature ?? 0.3;

  const metrics = structuredDeal.structured_deal?.metrics || structuredDeal.metrics || {};
  const basicInfo = structuredDeal.structured_deal?.basic_info || structuredDeal.basic_info || {};
  const dealLtv = metrics.ltv_pct || 0;
  const dealAmount = basicInfo.loan_amount || 0;
  const dealState = basicInfo.property_state || "";
  const dealAsset = basicInfo.asset_type || "";
  const dealLoanType = basicInfo.loan_type || structuredDeal.structured_deal?.loan_type || structuredDeal.loan_type || "";

  const candidateFunds = activeFunds.filter(f => {
    const hasAnyCriteria = f.ltvMax || f.loanAmountMin || f.loanAmountMax || 
      (f.allowedAssetTypes && f.allowedAssetTypes.length > 0) || 
      (f.allowedStates && f.allowedStates.length > 0);
    if (!hasAnyCriteria) return true;

    const fundLoanTypes = f.loanTypes;
    if (dealLoanType && fundLoanTypes && fundLoanTypes.length > 0) {
      if (!fundLoanTypes.includes(dealLoanType)) return false;
    }
    if (f.ltvMax && dealLtv > 0 && dealLtv > f.ltvMax * 1.5) return false;
    if (f.loanAmountMin && dealAmount > 0 && dealAmount < f.loanAmountMin * 0.3) return false;
    if (f.loanAmountMax && dealAmount > 0 && dealAmount > f.loanAmountMax * 3) return false;
    return true;
  });

  const fundsToUse = candidateFunds.length >= 3 ? candidateFunds : activeFunds;
  console.log(`[Intake AI] Fund pre-filter: ${candidateFunds.length}/${activeFunds.length} passed (using ${fundsToUse.length})`);

  let knowledgeByFund: Record<number, string[]> = {};
  let fundSimilarityScores: Record<number, number> = {};
  const dealSummary = `${dealAsset} property in ${dealState}, loan amount $${dealAmount}, LTV ${dealLtv}%${dealLoanType ? `, ${dealLoanType} loan` : ""}, borrower: ${structuredDeal.structured_deal?.borrower_info?.name || "unknown"}, DSCR ${metrics.dscr || "N/A"}`;
  let embeddingsAvailable = false;

  if (fundsToUse.length > 0) {
    const fundIds = fundsToUse.map(f => f.id);

    try {
      const dealEmbedding = await generateEmbedding(dealSummary);

      if (dealEmbedding) {
        embeddingsAvailable = true;
        const embeddingStr = `[${dealEmbedding.join(",")}]`;

        interface DescSimilarityRow { id: number; similarity: string }
        interface KnowledgeRow { fund_id: number; content: string; category: string }

        const fundIdsArr = `{${fundIds.join(",")}}`;

        const descScores = await db.execute(
          sql`SELECT id, 1 - (description_embedding <=> ${embeddingStr}::vector) AS similarity
              FROM funds
              WHERE id = ANY(${fundIdsArr}::int[])
                AND description_embedding IS NOT NULL`
        );
        for (const row of descScores.rows as DescSimilarityRow[]) {
          fundSimilarityScores[row.id] = parseFloat(row.similarity) || 0;
        }

        const similarRows = await db.execute(
          sql`SELECT fund_id, content, category FROM (
                SELECT fund_id, content, category,
                       ROW_NUMBER() OVER (PARTITION BY fund_id ORDER BY embedding <=> ${embeddingStr}::vector) AS rn
                FROM fund_knowledge_entries
                WHERE fund_id = ANY(${fundIdsArr}::int[])
                  AND embedding IS NOT NULL
              ) ranked WHERE rn <= 8`
        );
        for (const row of similarRows.rows as KnowledgeRow[]) {
          const fid = row.fund_id;
          if (!knowledgeByFund[fid]) knowledgeByFund[fid] = [];
          knowledgeByFund[fid].push(`[${row.category}] ${row.content}`);
        }
      } else {
        console.warn("[Intake AI] Deal embedding failed — using text-only fund context");
      }
    } catch (e) {
      console.warn("[Intake AI] Embedding similarity unavailable, using text-only fund context:", (e as Error).message);
    }

    try {
      const fundsNeedingKnowledge = fundIds.filter(id => !knowledgeByFund[id] || knowledgeByFund[id].length === 0);
      if (fundsNeedingKnowledge.length > 0) {
        const fallbackRows = await db.select({
          fundId: fundKnowledgeEntries.fundId,
          content: fundKnowledgeEntries.content,
          category: fundKnowledgeEntries.category,
        }).from(fundKnowledgeEntries)
          .where(inArray(fundKnowledgeEntries.fundId, fundsNeedingKnowledge));
        for (const row of fallbackRows) {
          if (!knowledgeByFund[row.fundId]) knowledgeByFund[row.fundId] = [];
          if (knowledgeByFund[row.fundId].length < 8) {
            knowledgeByFund[row.fundId].push(`[${row.category}] ${row.content}`);
          }
        }
      }
    } catch (e2) {
      console.error("Knowledge fallback retrieval error:", e2);
    }
  }

  const rankedFunds = [...fundsToUse].sort((a, b) => {
    const scoreA = fundSimilarityScores[a.id] || 0;
    const scoreB = fundSimilarityScores[b.id] || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    const aHasKnowledge = (knowledgeByFund[a.id]?.length || 0) > 0 ? 1 : 0;
    const bHasKnowledge = (knowledgeByFund[b.id]?.length || 0) > 0 ? 1 : 0;
    return bHasKnowledge - aHasKnowledge;
  });

  console.log(`[Intake AI] Fund context: embeddings=${embeddingsAvailable}, knowledge_funds=${Object.keys(knowledgeByFund).length}/${fundsToUse.length}`);

  const userMessage = JSON.stringify({
    deal: structuredDeal,
    funds: rankedFunds.map(f => {
      const fundContext: string[] = [];
      const fundLoanTypes = f.loanTypes;
      if (fundLoanTypes && fundLoanTypes.length > 0) fundContext.push(`Loan types: ${fundLoanTypes.join(", ")}`);
      if (f.loanStrategy) fundContext.push(`Loan strategy: ${f.loanStrategy}`);
      if (f.fundDescription) fundContext.push(`Description: ${f.fundDescription}`);
      if (f.allowedAssetTypes?.length) fundContext.push(`Asset types: ${f.allowedAssetTypes.join(", ")}`);
      if (f.allowedStates?.length) {
        fundContext.push(`States: ${f.allowedStates.length >= 45 ? "Nationwide" : f.allowedStates.join(", ")}`);
      }
      if (f.loanAmountMin || f.loanAmountMax) {
        fundContext.push(`Loan range: $${(f.loanAmountMin || 0).toLocaleString()} - $${(f.loanAmountMax || 0).toLocaleString()}`);
      }
      if (f.ltvMax) fundContext.push(`Max LTV: ${f.ltvMax}%`);
      if (f.minDscr) fundContext.push(`Min DSCR: ${f.minDscr}x`);
      if (f.recourseType) fundContext.push(`Recourse: ${f.recourseType}`);
      if (f.interestRateMin || f.interestRateMax) {
        fundContext.push(`Rate: ${f.interestRateMin || '?'}% - ${f.interestRateMax || '?'}%`);
      }

      return {
        fund_id: f.id, fund_name: f.fundName,
        loan_types: f.loanTypes || null,
        loan_strategy: f.loanStrategy || null,
        ltv_min: f.ltvMin, ltv_max: f.ltvMax, ltc_min: f.ltcMin, ltc_max: f.ltcMax,
        loan_amount_min: f.loanAmountMin, loan_amount_max: f.loanAmountMax,
        interest_rate_min: f.interestRateMin, interest_rate_max: f.interestRateMax,
        min_dscr: f.minDscr, min_credit_score: f.minCreditScore,
        recourse_type: f.recourseType,
        allowed_states: f.allowedStates, allowed_asset_types: f.allowedAssetTypes,
        description: f.fundDescription || null,
        fund_summary: fundContext.join(" | "),
        description_similarity: fundSimilarityScores[f.id] !== undefined
          ? Math.round(fundSimilarityScores[f.id] * 100) / 100 : null,
        knowledge: knowledgeByFund[f.id]?.slice(0, 8) || [],
      };
    }),
  });

  const agentFn = async () => {
    const result = await callOpenAI(systemPrompt, userMessage, model, temperature);
    if (!result) {
      const metrics = structuredDeal.structured_deal?.metrics || structuredDeal.metrics || {};
      const basicInfo = structuredDeal.structured_deal?.basic_info || structuredDeal.basic_info || {};
      const borrowerInfo = structuredDeal.structured_deal?.borrower_info || structuredDeal.borrower_info || {};
      const eligibleFunds = activeFunds.filter(f => {
        const ltv = metrics.ltv_pct || 0;
        const amount = basicInfo.loan_amount || 0;
        const state = basicInfo.property_state || "";
        const asset = basicInfo.asset_type || "";
        const hasAnyCriteria = f.ltvMax || f.ltvMin || f.loanAmountMin || f.loanAmountMax ||
          (f.allowedStates && f.allowedStates.length > 0) ||
          (f.allowedAssetTypes && f.allowedAssetTypes.length > 0);
        if (!hasAnyCriteria) return true;
        if (f.ltvMin && ltv > 0 && ltv < f.ltvMin) return false;
        if (f.ltvMax && ltv > 0 && ltv > f.ltvMax) return false;
        if (f.loanAmountMin && amount > 0 && amount < f.loanAmountMin) return false;
        if (f.loanAmountMax && amount > 0 && amount > f.loanAmountMax) return false;
        if (f.allowedStates?.length && state && !f.allowedStates.includes(state)) return false;
        if (f.allowedAssetTypes?.length && asset && !assetTypeMatches(f.allowedAssetTypes, asset)) return false;
        return true;
      }).map(f => ({ fund_id: f.id, fund_name: f.fundName, match_score: 75, match_reason: "Meets basic criteria" }));
      const creditScore = borrowerInfo.credit_score || 0;
      return normalizeAgent2Result({
        eligible_funds: eligibleFunds, total_funds_checked: activeFunds.length,
        deal_health: {
          borrower_risk_score: creditScore >= 720 ? 15 : creditScore >= 680 ? 30 : 50,
          borrower_risk_detail: `Credit score ${creditScore}. ${creditScore >= 720 ? 'Strong' : creditScore >= 680 ? 'Adequate' : 'Needs improvement'} borrower profile.`,
          property_risk_score: (metrics.occupancy_pct || 0) >= 90 ? 20 : 40,
          property_risk_detail: `Occupancy ${metrics.occupancy_pct || 'N/A'}%. NOI $${(metrics.noi_annual || 0).toLocaleString()}.`,
          loan_structure_risk_score: (metrics.ltv_pct || 0) <= 75 ? 20 : 45,
          loan_structure_risk_detail: `LTV ${metrics.ltv_pct || 0}%. DSCR ${metrics.dscr || 0}x.`,
          documentation_risk_score: 25,
          documentation_risk_detail: "Documentation assessment based on submitted documents.",
        },
      });
    }
    return normalizeAgent2Result(result);
  };

  if (sessionId && OrchestrationTracer.hasSubscribers()) {
    return OrchestrationTracer.traceAgent("intake_fund_matcher", 1, { funds_count: fundsToUse.length, total_funds: activeFunds.length, knowledge_funds: Object.keys(knowledgeByFund).length }, agentFn, systemPrompt, sessionId);
  }
  return agentFn();
}

async function agent3GenerateFeedback(matchingReport: any, structuredDeal: any, sessionId?: string): Promise<any> {
  const config = await getAgentConfig("intake_feedback_generator");
  const basePrompt = config?.systemPrompt || DEFAULT_PROMPTS.feedbackGenerator;
  const systemPrompt = basePrompt + JSON_FORMAT_SUFFIX.feedbackGenerator;
  const model = config?.modelName || "gpt-4o-mini";
  const temperature = config?.temperature ?? 0.3;

  const userMessage = JSON.stringify({ matching_report: matchingReport, deal: structuredDeal });

  const agentFn = async () => {
    const result = await callOpenAI(systemPrompt, userMessage, model, temperature);
    if (!result) {
      const eligibleFunds = matchingReport.eligible_funds || [];
      const health = matchingReport.deal_health || {};
      const avgRisk = ((health.borrower_risk_score || 50) + (health.property_risk_score || 50) + (health.loan_structure_risk_score || 50) + (health.documentation_risk_score || 50)) / 4;
      const dealHealthScore = Math.max(0, 100 - avgRisk);
      const fundFitScore = eligibleFunds.length > 0 ? Math.min(100, eligibleFunds[0]?.match_score || 60) : 20;
      const confidenceScore = Math.round(fundFitScore * 0.6 + dealHealthScore * 0.4);
      const verdict = confidenceScore > 75 ? "pass" : confidenceScore >= 50 ? "conditional" : "fail";
      return {
        overall_verdict: verdict, confidence_score: confidenceScore,
        confidence_breakdown: { fund_fit: fundFitScore, deal_health: Math.round(dealHealthScore) },
        key_flaws: [], strengths: [{ strength: "Deal submitted with required information", detail: "All key fields provided." }],
        fund_recommendations: eligibleFunds.map((f: any) => ({ fund_name: f.fund_name, match_score: f.match_score, recommendation: f.match_reason })),
        next_steps: eligibleFunds.length > 0 ? ["Review AI analysis", "Consider sending to matched funds"] : ["No fund matches found — review deal parameters"],
      };
    }
    return normalizeAgent3Result(result);
  };

  if (sessionId && OrchestrationTracer.hasSubscribers()) {
    return OrchestrationTracer.traceAgent("intake_feedback_generator", 2, { eligible_funds: matchingReport.eligible_funds?.length || 0 }, agentFn, systemPrompt, sessionId);
  }
  return agentFn();
}

function assetTypeMatches(fundTypes: string[], dealType: string): boolean {
  if (!fundTypes || fundTypes.length === 0) return true;
  if (!dealType) return true;
  const dealLower = dealType.toLowerCase();
  const related: Record<string, string[]> = {
    "multifamily": ["residential", "multifamily", "mfr", "apartment"],
    "residential": ["multifamily", "residential", "sfr"],
    "office": ["office", "commercial"],
    "commercial": ["office", "retail", "industrial", "mixed use"],
    "retail": ["retail", "commercial"],
    "industrial": ["industrial", "commercial", "warehouse"],
    "land": ["land", "land development"],
    "development": ["development", "land development", "construction"],
    "mixed use": ["mixed use", "commercial"],
    "hotel": ["hotel", "hospitality"],
    "self storage": ["self storage", "storage"],
  };
  for (const ft of fundTypes) {
    const ftLower = ft.toLowerCase();
    if (ftLower === dealLower) return true;
    const relatedTypes = related[dealLower] || [];
    if (relatedTypes.includes(ftLower)) return true;
    const fundRelated = related[ftLower] || [];
    if (fundRelated.includes(dealLower)) return true;
  }
  return false;
}

function ruleBasedFallback(deal: any, activeFunds: any[]) {
  const ltv = deal.ltvPct || 0;
  const dscr = deal.dscr || 0;
  const loanAmt = deal.loanAmount || 0;

  const eligibleFunds = activeFunds.filter(f => {
    const hasAnyCriteria = f.ltvMax || f.ltvMin || f.loanAmountMin || f.loanAmountMax ||
      (f.allowedStates && f.allowedStates.length > 0) ||
      (f.allowedAssetTypes && f.allowedAssetTypes.length > 0);
    if (!hasAnyCriteria) return true;

    if (f.ltvMax && ltv > 0 && ltv > f.ltvMax) return false;
    if (f.ltvMin && ltv > 0 && ltv < f.ltvMin) return false;
    if (f.loanAmountMin && loanAmt > 0 && loanAmt < f.loanAmountMin) return false;
    if (f.loanAmountMax && loanAmt > 0 && loanAmt > f.loanAmountMax) return false;
    if (f.allowedStates?.length > 0 && deal.propertyState && !f.allowedStates.includes(deal.propertyState)) return false;
    if (f.allowedAssetTypes?.length > 0 && deal.assetType && !assetTypeMatches(f.allowedAssetTypes, deal.assetType)) return false;
    return true;
  });

  const flaws: any[] = [];
  const strengths: any[] = [];
  if (ltv > 80) flaws.push({ flaw: "High LTV", severity: "high", detail: `LTV of ${ltv}% exceeds 80% threshold`, remediation: "Consider reducing loan amount or providing additional collateral" });
  if (dscr < 1.25 && dscr > 0) flaws.push({ flaw: "Low DSCR", severity: "high", detail: `DSCR of ${dscr}x is below 1.25x minimum`, remediation: "Improve NOI or reduce loan amount" });
  if (!deal.borrowerCreditScore) flaws.push({ flaw: "Missing credit score", severity: "medium", detail: "No credit score provided", remediation: "Submit borrower credit report" });
  if (dscr >= 1.25) strengths.push({ strength: "Strong DSCR", detail: `DSCR of ${dscr}x indicates healthy debt service coverage` });
  if (ltv <= 75) strengths.push({ strength: "Conservative LTV", detail: `LTV of ${ltv}% is within conservative range` });
  if (deal.noiAnnual && deal.noiAnnual > 0) strengths.push({ strength: "Positive NOI", detail: `Annual NOI of $${deal.noiAnnual.toLocaleString()}` });

  let verdict = "conditional";
  let confidence = 50;
  if (flaws.filter(f => f.severity === "critical" || f.severity === "high").length === 0 && eligibleFunds.length > 0) { verdict = "pass"; confidence = 70; }
  if (flaws.filter(f => f.severity === "critical").length > 0 || eligibleFunds.length === 0) { verdict = "fail"; confidence = 60; }

  return {
    agent1: { validation_status: "valid", validation_errors: [], completeness_score: deal.borrowerName && deal.loanAmount && deal.assetType ? 85 : 60 },
    agent2: { eligible_funds: eligibleFunds.map(f => ({ fund_id: f.id, fund_name: f.fundName, match_score: 65, match_reasons: ["Rule-based match"] })), fund_matches: eligibleFunds.map(f => ({ fund_id: f.id, fund_name: f.fundName, match_score: 65, match_reasons: ["Rule-based match"] })), ineligible_funds: [] },
    agent3: {
      overall_verdict: verdict, confidence_score: confidence, confidence_breakdown: { fund_fit: eligibleFunds.length > 0 ? 70 : 30, deal_health: flaws.length === 0 ? 80 : 50 },
      key_flaws: flaws, strengths,
      fund_recommendations: eligibleFunds.slice(0, 3).map(f => ({ fund_name: f.fundName, match_score: 65, recommendation: "Matched by criteria (rule-based)" })),
      next_steps: ["Complete any missing documentation", "Review deal details for accuracy", eligibleFunds.length > 0 ? "Consider submitting to matched funds" : "Adjust deal parameters to match available funds"],
    },
  };
}

export async function runIntakeAiPipeline(dealId: number): Promise<void> {
  console.log(`[Intake AI] Starting pipeline for deal ${dealId}`);

  const [deal] = await db.select().from(intakeDeals).where(eq(intakeDeals.id, dealId));
  if (!deal) throw new Error(`Deal ${dealId} not found`);

  const documents = await db.select().from(intakeDealDocuments)
    .where(eq(intakeDealDocuments.dealId, dealId));

  const tenantConditions = [];
  if (deal.tenantId) tenantConditions.push(eq(funds.tenantId, deal.tenantId));
  tenantConditions.push(eq(funds.isActive, true));
  const activeFunds = await db.select().from(funds).where(and(...tenantConditions));

  let tracingSessionId: string | undefined;
  if (OrchestrationTracer.hasSubscribers()) {
    tracingSessionId = OrchestrationTracer.startSession();
  }

  try {
    console.log(`[Intake AI] Agent 1: Validating deal...`);
    const agent1Result = await agent1ValidateAndStructure(deal, documents, tracingSessionId);
    console.log(`[Intake AI] Agent 1 complete: ${agent1Result.validation_status}`);

    if (agent1Result.validation_status === "invalid" && agent1Result.validation_errors?.length > 0) {
      await db.insert(intakeAiAnalysis).values({ dealId, agent1Validation: agent1Result, overallVerdict: "fail", confidenceScore: 0 });
      await db.update(intakeDeals).set({ status: "analyzed", updatedAt: new Date() }).where(eq(intakeDeals.id, dealId));
      await db.insert(intakeDealStatusHistory).values({ dealId, fromStatus: "submitted", toStatus: "analyzed", notes: "AI analysis complete — validation failed" });
      if (tracingSessionId) OrchestrationTracer.endSession(tracingSessionId);
      return;
    }

    console.log(`[Intake AI] Agent 2: Matching funds (${activeFunds.length} funds)...`);
    const agent2Result = await agent2MatchFunds(agent1Result, activeFunds, tracingSessionId);
    console.log(`[Intake AI] Agent 2 complete: ${agent2Result.eligible_funds?.length || 0} matches`);

    console.log(`[Intake AI] Agent 3: Generating feedback...`);
    const agent3Result = await agent3GenerateFeedback(agent2Result, agent1Result, tracingSessionId);
    console.log(`[Intake AI] Agent 3 complete: verdict=${agent3Result.overall_verdict}, confidence=${agent3Result.confidence_score}`);

    await db.insert(intakeAiAnalysis).values({
      dealId, agent1Validation: agent1Result, agent2Matching: agent2Result, agent3Feedback: agent3Result,
      overallVerdict: agent3Result.overall_verdict, confidenceScore: agent3Result.confidence_score,
    });

    const newStatus = agent3Result.overall_verdict === "fail" && (agent2Result.eligible_funds?.length || 0) === 0 ? "no_match" : "analyzed";
    await db.update(intakeDeals).set({ status: newStatus, updatedAt: new Date() }).where(eq(intakeDeals.id, dealId));
    await db.insert(intakeDealStatusHistory).values({ dealId, fromStatus: "submitted", toStatus: newStatus, notes: `AI analysis complete — ${agent3Result.overall_verdict} (confidence: ${agent3Result.confidence_score}%)` });

    if (tracingSessionId) OrchestrationTracer.endSession(tracingSessionId);
    console.log(`[Intake AI] Pipeline complete for deal ${dealId}`);
  } catch (err: any) {
    console.log(`[Intake AI] AI pipeline error, using rule-based fallback: ${err.message}`);

    if (tracingSessionId) {
      OrchestrationTracer.traceAgent("rule_based_fallback", 0, { reason: err.message }, async () => "fallback_used", undefined, tracingSessionId).catch(() => {});
    }

    const fallback = ruleBasedFallback(deal, activeFunds);
    await db.insert(intakeAiAnalysis).values({
      dealId, agent1Validation: fallback.agent1, agent2Matching: fallback.agent2, agent3Feedback: fallback.agent3,
      overallVerdict: fallback.agent3.overall_verdict, confidenceScore: fallback.agent3.confidence_score,
    });

    const newStatus = fallback.agent3.overall_verdict === "fail" && fallback.agent2.eligible_funds.length === 0 ? "no_match" : "analyzed";
    await db.update(intakeDeals).set({ status: newStatus, updatedAt: new Date() }).where(eq(intakeDeals.id, dealId));
    await db.insert(intakeDealStatusHistory).values({ dealId, fromStatus: "submitted", toStatus: newStatus, notes: `Rule-based analysis complete — ${fallback.agent3.overall_verdict} (confidence: ${fallback.agent3.confidence_score}%)` });

    if (tracingSessionId) OrchestrationTracer.endSession(tracingSessionId);
    console.log(`[Intake AI] Rule-based fallback complete for deal ${dealId}`);
  }
}

import { db } from "../db";
import { funds, intakeDeals, intakeAiAnalysis, intakeDealStatusHistory, intakeDealDocuments, agentConfigurations } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { OrchestrationTracer } from "../services/orchestrationTracing";
import OpenAI from "openai";

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
  validator: `You are a Commercial Real Estate Deal Validator AI Agent. Your job is to:
1. Parse and validate all deal fields from a commercial real estate submission
2. Validate data types (amounts must be positive numbers, percentages 0-100, dates valid, state codes 2-letter)
3. Calculate key metrics:
   - LTV = (loan_amount / property_value) * 100
   - DSCR = NOI / (loan_amount * 0.07) (approximate annual debt service at 7%)
4. Flag missing or invalid data
5. Produce a clean structured deal JSON

Return a JSON object with:
{
  "validation_status": "valid" | "invalid",
  "validation_errors": [{"field": "...", "error": "..."}],
  "structured_deal": {
    "basic_info": { "deal_name", "loan_amount", "asset_type", "property_address", "property_city", "property_state", "property_zip" },
    "borrower_info": { "name", "entity_type", "credit_score", "has_guarantor" },
    "metrics": { "property_value", "ltv_pct", "noi_annual", "dscr", "occupancy_pct" },
    "documents_submitted": ["doc_type1", ...],
    "documents_missing": []
  }
}`,
  fundMatcher: `You are a Commercial Real Estate Fund Matcher & Risk Analyzer AI Agent. Your job is to:
1. Compare a validated deal against available fund criteria
2. For each fund, check: LTV in range, LTC in range (if applicable), loan amount in range, state/geography eligible, asset type eligible
3. Score each eligible fund 0-100 based on how well the deal fits
4. Assess deal health across 4 risk categories (each scored 0-100, lower is better/less risky):
   - Borrower risk: Based on credit score, entity type, financial strength
   - Property risk: Based on metrics, occupancy, NOI, market
   - Loan structure risk: Based on LTV, DSCR, amortization
   - Documentation risk: Based on completeness of documents

Return a JSON object with:
{
  "eligible_funds": [{ "fund_id": N, "fund_name": "...", "match_score": 0-100, "match_reason": "..." }],
  "total_funds_checked": N,
  "deal_health": {
    "borrower_risk_score": 0-100, "borrower_risk_detail": "...",
    "property_risk_score": 0-100, "property_risk_detail": "...",
    "loan_structure_risk_score": 0-100, "loan_structure_risk_detail": "...",
    "documentation_risk_score": 0-100, "documentation_risk_detail": "..."
  }
}`,
  feedbackGenerator: `You are a Commercial Real Estate Deal Feedback Generator AI Agent. Your job is to:
1. Analyze the fund matching report and deal health assessment
2. Identify key flaws with severity (critical, high, medium, low) and remediation suggestions
3. List deal strengths
4. Calculate composite confidence score: (fund_fit_score * 0.6) + (deal_health_score * 0.4)
   - fund_fit_score: based on number of matching funds and match quality
   - deal_health_score: inverse average of risk scores (100 - avg_risk)
5. Generate verdict: >75 = "pass", 50-75 = "conditional", <50 = "fail"
6. Provide per-fund recommendations and next steps

Return a JSON object with:
{
  "overall_verdict": "pass" | "conditional" | "fail",
  "confidence_score": 0-100,
  "confidence_breakdown": { "fund_fit": 0-100, "deal_health": 0-100 },
  "key_flaws": [{ "flaw": "...", "severity": "critical|high|medium|low", "detail": "...", "remediation": "..." }],
  "strengths": [{ "strength": "...", "detail": "..." }],
  "fund_recommendations": [{ "fund_name": "...", "match_score": 0-100, "recommendation": "..." }],
  "next_steps": ["..."]
}`,
};

async function agent1ValidateAndStructure(deal: any, documents: any[], sessionId?: string): Promise<any> {
  const config = await getAgentConfig("intake_validator");
  const systemPrompt = config?.systemPrompt || DEFAULT_PROMPTS.validator;
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
    return result;
  };

  if (sessionId && OrchestrationTracer.hasSubscribers()) {
    return OrchestrationTracer.traceAgent("intake_validator", 0, { deal_id: deal.id, deal_name: deal.dealName }, agentFn, systemPrompt, sessionId);
  }
  return agentFn();
}

async function agent2MatchFunds(structuredDeal: any, activeFunds: any[], sessionId?: string): Promise<any> {
  const config = await getAgentConfig("intake_fund_matcher");
  const systemPrompt = config?.systemPrompt || DEFAULT_PROMPTS.fundMatcher;
  const model = config?.modelName || "gpt-4o-mini";
  const temperature = config?.temperature ?? 0.3;

  const userMessage = JSON.stringify({
    deal: structuredDeal,
    funds: activeFunds.map(f => ({
      fund_id: f.id, fund_name: f.fundName,
      ltv_min: f.ltvMin, ltv_max: f.ltvMax, ltc_min: f.ltcMin, ltc_max: f.ltcMax,
      loan_amount_min: f.loanAmountMin, loan_amount_max: f.loanAmountMax,
      allowed_states: f.allowedStates, allowed_asset_types: f.allowedAssetTypes,
    })),
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
        if (f.ltvMin && ltv < f.ltvMin) return false;
        if (f.ltvMax && ltv > f.ltvMax) return false;
        if (f.loanAmountMin && amount < f.loanAmountMin) return false;
        if (f.loanAmountMax && amount > f.loanAmountMax) return false;
        if (f.allowedStates?.length && !f.allowedStates.includes(state)) return false;
        if (f.allowedAssetTypes?.length && !f.allowedAssetTypes.includes(asset)) return false;
        return true;
      }).map(f => ({ fund_id: f.id, fund_name: f.fundName, match_score: 75, match_reason: "Meets basic criteria" }));
      const creditScore = borrowerInfo.credit_score || 0;
      return {
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
      };
    }
    return result;
  };

  if (sessionId && OrchestrationTracer.hasSubscribers()) {
    return OrchestrationTracer.traceAgent("intake_fund_matcher", 1, { funds_count: activeFunds.length }, agentFn, systemPrompt, sessionId);
  }
  return agentFn();
}

async function agent3GenerateFeedback(matchingReport: any, structuredDeal: any, sessionId?: string): Promise<any> {
  const config = await getAgentConfig("intake_feedback_generator");
  const systemPrompt = config?.systemPrompt || DEFAULT_PROMPTS.feedbackGenerator;
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
    return result;
  };

  if (sessionId && OrchestrationTracer.hasSubscribers()) {
    return OrchestrationTracer.traceAgent("intake_feedback_generator", 2, { eligible_funds: matchingReport.eligible_funds?.length || 0 }, agentFn, systemPrompt, sessionId);
  }
  return agentFn();
}

function ruleBasedFallback(deal: any, activeFunds: any[]) {
  const ltv = deal.ltvPct || 0;
  const dscr = deal.dscr || 0;
  const loanAmt = deal.loanAmount || 0;

  const eligibleFunds = activeFunds.filter(f => {
    if (f.ltvMax && ltv > f.ltvMax) return false;
    if (f.ltvMin && ltv < f.ltvMin) return false;
    if (f.loanAmountMin && loanAmt < f.loanAmountMin) return false;
    if (f.loanAmountMax && loanAmt > f.loanAmountMax) return false;
    if (f.allowedStates?.length > 0 && deal.propertyState && !f.allowedStates.includes(deal.propertyState)) return false;
    if (f.allowedAssetTypes?.length > 0 && deal.assetType && !f.allowedAssetTypes.includes(deal.assetType)) return false;
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
    agent2: { eligible_funds: eligibleFunds.map(f => ({ fund_id: f.id, fund_name: f.fundName, match_score: 65, match_reasons: ["Rule-based match"] })), ineligible_funds: [] },
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

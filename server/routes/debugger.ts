import { type Request, type Response } from 'express';
import { executeAgent, type AgentType } from '../agents/agentRunner';
import { OrchestrationTracer } from '../services/orchestrationTracing';
import { db } from '../db';
import { agentConfigurations, systemSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const AGENT_SEQUENCE: AgentType[] = ['document_intelligence', 'processor', 'communication'];

function normalizeRule(r: any): any {
  const getField = (...keys: string[]) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
    }
    for (const key of Object.keys(r)) {
      const lower = key.toLowerCase().replace(/[\s_-]/g, '');
      for (const k of keys) {
        if (lower === k.toLowerCase().replace(/[\s_-]/g, '')) return r[key];
      }
    }
    return undefined;
  };
  return {
    ruleTitle: getField('ruleTitle', 'rule_title', 'RULE_TITLE', 'RULE TITLE', 'rule_text', 'RULE_TEXT', 'RULE TEXT', 'ruleText', 'title', 'rule', 'name') || 'Untitled rule',
    category: getField('category', 'CATEGORY', 'rule_category') || 'General',
    subcategory: getField('subcategory', 'SUBCATEGORY', 'sub_category') || '',
    ruleDescription: getField('ruleDescription', 'rule_description', 'RULE_DESCRIPTION', 'description', 'condition', 'CONDITION', 'details') || '',
    confidence: getField('confidence', 'CONFIDENCE', 'priority', 'PRIORITY') || 'high',
    sourceSection: getField('sourceSection', 'source_section', 'SOURCE_SECTION', 'SOURCE SECTION', 'section') || '',
    sourcePage: getField('sourcePage', 'source_page', 'SOURCE_PAGE', 'SOURCE PAGE(S)', 'SOURCE_PAGE(S)', 'page') || '',
    ruleType: getField('ruleType', 'rule_type', 'RULE_TYPE', 'type') || '',
    ruleId: getField('ruleId', 'rule_id', 'RULE_ID', 'RULE ID', 'id') || '',
    clarificationNeeded: getField('clarificationNeeded', 'clarification_needed', 'CLARIFICATION_NEEDED') || false,
    exception: getField('exception', 'EXCEPTION', 'exceptions') || '',
  };
}

function findRulesInResponse(parsed: any): any[] | null {
  if (parsed.rules && Array.isArray(parsed.rules)) return parsed.rules;
  for (const key of Object.keys(parsed)) {
    if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
      const first = parsed[key][0];
      if (typeof first === 'object' && first !== null) return parsed[key];
    }
  }
  return null;
}

const replayContextCache = new Map<string, { documentText: string; fileName: string; timestamp: number }>();

const MAX_CACHE_ENTRIES = 20;
const CACHE_TTL_MS = 30 * 60 * 1000;

function pruneCache() {
  const now = Date.now();
  for (const [key, val] of replayContextCache) {
    if (now - val.timestamp > CACHE_TTL_MS) {
      replayContextCache.delete(key);
    }
  }
  if (replayContextCache.size > MAX_CACHE_ENTRIES) {
    const oldest = [...replayContextCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (replayContextCache.size > MAX_CACHE_ENTRIES) {
      replayContextCache.delete(oldest.shift()![0]);
    }
  }
}

export function cacheReplayContext(sessionId: string, documentText: string, fileName: string) {
  pruneCache();
  replayContextCache.set(sessionId, { documentText, fileName, timestamp: Date.now() });
}

export function registerDebuggerRoutes(app: any, deps: { authenticateUser: any; requireSuperAdmin: any }) {

  app.post('/api/debug/replay-agent', deps.authenticateUser, deps.requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { agentName, input, customPrompt, replayMode } = req.body;

      if (!agentName || !input) {
        return res.status(400).json({ success: false, error: 'agentName and input are required' });
      }

      const sessionId = OrchestrationTracer.startSession();

      if (replayMode === 'isolated') {
        const result = await OrchestrationTracer.traceAgent(
          agentName,
          AGENT_SEQUENCE.indexOf(agentName as AgentType),
          input,
          () => executeAgent({
            agentType: agentName as AgentType,
            projectId: input.projectId || 0,
            triggerType: 'debug_replay',
            contextData: input,
          }),
          customPrompt,
          sessionId
        );

        OrchestrationTracer.endSession(sessionId);
        return res.json({ success: true, result, sessionId });
      } else if (replayMode === 'cascade') {
        const startIndex = AGENT_SEQUENCE.indexOf(agentName as AgentType);
        if (startIndex === -1) {
          return res.status(400).json({ success: false, error: `Unknown agent: ${agentName}` });
        }

        const results: Record<string, any> = {};
        let currentInput = { ...input };

        for (let i = startIndex; i < AGENT_SEQUENCE.length; i++) {
          const agent = AGENT_SEQUENCE[i];
          const result = await OrchestrationTracer.traceAgent(
            agent,
            i,
            currentInput,
            () => executeAgent({
              agentType: agent,
              projectId: input.projectId || 0,
              triggerType: 'debug_replay',
              contextData: currentInput,
            }),
            i === startIndex ? customPrompt : undefined,
            sessionId
          );

          results[agent] = result;
          if (result && typeof result === 'object') {
            currentInput = { ...currentInput, ...result };
          }
        }

        OrchestrationTracer.endSession(sessionId);
        return res.json({ success: true, results, sessionId });
      }

      return res.status(400).json({ success: false, error: 'Invalid replayMode. Use "isolated" or "cascade".' });
    } catch (error: any) {
      console.error('Debug replay error:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Replay failed' });
    }
  });

  app.post('/api/debug/replay-credit-extraction', deps.authenticateUser, deps.requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { originalSessionId, customPrompt } = req.body;

      if (!originalSessionId || !customPrompt) {
        return res.status(400).json({ success: false, error: 'originalSessionId and customPrompt are required' });
      }

      pruneCache();
      const cached = replayContextCache.get(originalSessionId);
      if (!cached) {
        return res.status(404).json({ success: false, error: 'Session context expired or not found. Please re-upload the document.' });
      }

      const replaySessionId = OrchestrationTracer.startSession();

      OrchestrationTracer.emit({
        eventType: 'agent_start',
        agentName: 'creditPolicyExtractor',
        agentIndex: 0,
        timestamp: new Date().toISOString(),
        sessionId: replaySessionId,
        input: { fileName: cached.fileName, textLength: cached.documentText.length, replay: true, originalSessionId },
      });

      const replaySettings = await getActiveCreditExtractionSettings();

      OrchestrationTracer.emit({
        eventType: 'agent_processing',
        agentName: 'creditPolicyExtractor',
        agentIndex: 0,
        timestamp: new Date().toISOString(),
        sessionId: replaySessionId,
        prompt: customPrompt,
        metadata: { model: replaySettings.model, temperature: replaySettings.temperature },
      });

      const startTime = Date.now();

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const aiPromise = openai.chat.completions.create({
        model: replaySettings.model,
        messages: [
          { role: 'system', content: customPrompt },
          {
            role: 'user',
            content: `Extract ALL review rules from the following credit policy document. Be exhaustive — scan every section, extract every constraint, requirement, prohibition, permission, calculation, and conditional statement. Do not skip any section. Return your response as a JSON object with a "rules" array.\n\n${cached.documentText}`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: replaySettings.maxTokens,
        temperature: replaySettings.temperature,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`AI analysis timed out after ${replaySettings.timeout} seconds`)), replaySettings.timeout * 1000)
      );

      const response = await Promise.race([aiPromise, timeoutPromise]);
      const content = response.choices[0]?.message?.content;

      if (!content) {
        OrchestrationTracer.emit({ eventType: 'agent_error', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, error: 'AI returned empty response', duration: Date.now() - startTime });
        OrchestrationTracer.endSession(replaySessionId);
        return res.status(500).json({ success: false, error: 'AI returned empty response' });
      }

      let parsed: { rules: any[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        OrchestrationTracer.emit({ eventType: 'agent_error', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, error: 'AI returned invalid JSON', rawResponse: content.slice(0, 2000), duration: Date.now() - startTime });
        OrchestrationTracer.endSession(replaySessionId);
        return res.status(500).json({ success: false, error: 'AI returned invalid response format' });
      }

      const rulesArray = findRulesInResponse(parsed);
      if (!rulesArray) {
        OrchestrationTracer.emit({ eventType: 'agent_error', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, error: 'Missing rules array', duration: Date.now() - startTime });
        OrchestrationTracer.endSession(replaySessionId);
        return res.status(500).json({ success: false, error: 'AI did not return rules in expected format' });
      }

      const normalizedRules = rulesArray.map(r => normalizeRule(r));

      normalizedRules.forEach((r: any, idx: number) => {
        OrchestrationTracer.emit({
          eventType: 'credit_rule_extracted',
          agentName: 'creditPolicyExtractor',
          agentIndex: 0,
          timestamp: new Date().toISOString(),
          sessionId: replaySessionId,
          rules: [{ id: `rule_${idx}`, rule: r.ruleTitle, category: r.category, confidence: r.confidence === 'high' || r.confidence === 'Critical' || r.confidence === '100%' ? 0.95 : r.confidence === 'medium' || r.confidence === 'High' ? 0.75 : 0.5, reasoning: r.ruleDescription }],
          progress: { current: idx + 1, total: normalizedRules.length, percentage: ((idx + 1) / normalizedRules.length) * 100 },
        });
      });

      OrchestrationTracer.emit({ eventType: 'agent_complete', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, output: { rulesExtracted: normalizedRules.length, replay: true }, duration: Date.now() - startTime });
      OrchestrationTracer.endSession(replaySessionId);

      cacheReplayContext(replaySessionId, cached.documentText, cached.fileName);

      return res.json({ success: true, rules: normalizedRules, sessionId: replaySessionId });
    } catch (error: any) {
      console.error('Credit extraction replay error:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Replay failed' });
    }
  });

  app.get('/api/debug/agent-configs', deps.authenticateUser, deps.requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const configs = await db
        .select({
          agentType: agentConfigurations.agentType,
          systemPrompt: agentConfigurations.systemPrompt,
          modelName: agentConfigurations.modelName,
          modelProvider: agentConfigurations.modelProvider,
          temperature: agentConfigurations.temperature,
          maxTokens: agentConfigurations.maxTokens,
        })
        .from(agentConfigurations)
        .where(eq(agentConfigurations.isActive, true));

      return res.json({ success: true, configs });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message });
    }
  });

  app.get('/api/debug/credit-extraction-settings', deps.authenticateUser, deps.requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const defaults = { model: 'gpt-4o', maxTokens: 16384, temperature: 0, timeout: 180, documentLimit: 200000 };
      const [saved] = await db
        .select({ settingValue: systemSettings.settingValue })
        .from(systemSettings)
        .where(eq(systemSettings.settingKey, 'credit_policy_extraction_settings'))
        .limit(1);
      const settings = saved?.settingValue ? { ...defaults, ...JSON.parse(saved.settingValue) } : defaults;
      return res.json({ success: true, settings, defaults });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message });
    }
  });

  app.put('/api/debug/credit-extraction-settings', deps.authenticateUser, deps.requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { model, maxTokens, temperature, timeout, documentLimit } = req.body;
      const parsedTemp = Number(temperature);
      const parsedMaxTokens = Number(maxTokens);
      const parsedTimeout = Number(timeout);
      const parsedDocLimit = Number(documentLimit);
      const settings = {
        model: model || 'gpt-4o',
        maxTokens: Math.min(Math.max(Number.isFinite(parsedMaxTokens) ? parsedMaxTokens : 16384, 1024), 65536),
        temperature: Math.min(Math.max(Number.isFinite(parsedTemp) ? parsedTemp : 0, 0), 2),
        timeout: Math.min(Math.max(Number.isFinite(parsedTimeout) ? parsedTimeout : 180, 30), 600),
        documentLimit: Math.min(Math.max(Number.isFinite(parsedDocLimit) ? parsedDocLimit : 200000, 10000), 500000),
      };
      const userId = (req as any).user?.id;
      const [existing] = await db
        .select({ id: systemSettings.id })
        .from(systemSettings)
        .where(eq(systemSettings.settingKey, 'credit_policy_extraction_settings'))
        .limit(1);
      if (existing) {
        await db.update(systemSettings)
          .set({ settingValue: JSON.stringify(settings), updatedBy: userId, updatedAt: new Date() })
          .where(eq(systemSettings.id, existing.id));
      } else {
        await db.insert(systemSettings).values({
          settingKey: 'credit_policy_extraction_settings',
          settingValue: JSON.stringify(settings),
          settingDescription: 'Credit policy extraction model settings',
          updatedBy: userId,
          updatedAt: new Date(),
        });
      }
      return res.json({ success: true, settings });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message });
    }
  });

  app.get('/api/debug/credit-extraction-prompt', deps.authenticateUser, deps.requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const defaultPrompt = getCreditExtractionDefaultPrompt();
      const [saved] = await db
        .select({ settingValue: systemSettings.settingValue })
        .from(systemSettings)
        .where(eq(systemSettings.settingKey, 'credit_policy_extraction_prompt'))
        .limit(1);
      return res.json({
        success: true,
        prompt: saved?.settingValue || defaultPrompt,
        defaultPrompt,
        isCustom: !!saved?.settingValue,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message });
    }
  });

  app.put('/api/debug/credit-extraction-prompt', deps.authenticateUser, deps.requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ success: false, error: 'prompt is required' });
      }
      const userId = (req as any).user?.id;
      const [existing] = await db
        .select({ id: systemSettings.id })
        .from(systemSettings)
        .where(eq(systemSettings.settingKey, 'credit_policy_extraction_prompt'))
        .limit(1);

      if (existing) {
        await db.update(systemSettings)
          .set({
            settingValue: prompt,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existing.id));
      } else {
        await db.insert(systemSettings).values({
          settingKey: 'credit_policy_extraction_prompt',
          settingValue: prompt,
          settingDescription: 'Custom credit policy extraction system prompt',
          updatedBy: userId,
          updatedAt: new Date(),
        });
      }

      return res.json({ success: true, message: 'Prompt saved' });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message });
    }
  });

  app.get('/api/debug/credit-extraction-sessions', deps.authenticateUser, deps.requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      pruneCache();
      const sessions = [...replayContextCache.entries()].map(([sessionId, ctx]) => ({
        sessionId,
        fileName: ctx.fileName,
        textLength: ctx.documentText.length,
        cachedAt: new Date(ctx.timestamp).toISOString(),
      }));
      return res.json({ success: true, sessions });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message });
    }
  });
}

export async function getActiveCreditExtractionSettings(): Promise<{ model: string; maxTokens: number; temperature: number; timeout: number; documentLimit: number }> {
  const defaults = { model: 'gpt-4o', maxTokens: 16384, temperature: 0, timeout: 180, documentLimit: 200000 };
  try {
    const [saved] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, 'credit_policy_extraction_settings'))
      .limit(1);
    if (saved?.settingValue) {
      const parsed = JSON.parse(saved.settingValue);
      return {
        model: typeof parsed.model === 'string' && parsed.model ? parsed.model : defaults.model,
        maxTokens: Number.isFinite(parsed.maxTokens) ? Math.min(Math.max(parsed.maxTokens, 1024), 65536) : defaults.maxTokens,
        temperature: Number.isFinite(parsed.temperature) ? Math.min(Math.max(parsed.temperature, 0), 2) : defaults.temperature,
        timeout: Number.isFinite(parsed.timeout) ? Math.min(Math.max(parsed.timeout, 30), 600) : defaults.timeout,
        documentLimit: Number.isFinite(parsed.documentLimit) ? Math.min(Math.max(parsed.documentLimit, 10000), 500000) : defaults.documentLimit,
      };
    }
  } catch {}
  return defaults;
}

export async function getActiveCreditExtractionPrompt(): Promise<string> {
  try {
    const [saved] = await db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, 'credit_policy_extraction_prompt'))
      .limit(1);
    if (saved?.settingValue) return saved.settingValue;
  } catch {}
  return getCreditExtractionDefaultPrompt();
}

export function getCreditExtractionDefaultPrompt(): string {
  return `You are an expert at analyzing loan credit policy documents and extracting ALL specific, actionable review rules with exhaustive, zero-miss accuracy.

## Definition of a "Rule"

A rule is any explicit constraint, requirement, prohibition, permission, calculation, or conditional statement that governs lending decisions or borrower/property eligibility.

### What IS a Rule:
- Eligibility Requirements: "Non-owner-occupied residential properties only"
- Disqualification Rules: "Mixed-use properties are NOT eligible"
- Numerical Constraints: "Minimum FICO score is 660"
- Conditional Logic: "If property is SFR, then no occupancy requirement"
- Calculation Methods: "DSCR is calculated by dividing property cash flow by debt service"
- Threshold Rules: "LTV cannot exceed 75%, except for cash-out where it's limited to 70%"
- Permission/Prohibition Statements: "ARM options include 5/6, 7/6, and 10/6 terms"
- Option/Alternative Statements: "Borrower can choose P&I or I/O payment types"
- Documentation/Process Requirements: "Property tax must be escrowed"
- Qualification Requirements: "Guarantor must have at least 20% ownership"
- Exception Rules: "Flood insurance required unless property is outside FEMA designated area"
- Cross-Reference Rules: "Reference Guideline Matrix for [specific details]"
- Status/Applicability Rules: "Section X is deleted and not applicable"

### What is NOT a Rule:
- Generic descriptions: "This section covers loan terms"
- Explanatory text: "The following explains how LTV is calculated"
- Examples for illustration only (EXCEPTION: if example shows a specific required calculation, it IS a rule)
- Historical context: "Previously, we allowed X, but now..."
- Contact information or form references without requirements

## Extraction Categories (scan every section for these)

1. **Eligibility & Property Type** — eligible/ineligible property types, restrictions, sub-conditions (e.g. Section 8 housing)
2. **Financial Constraints** — loan size min/max, LTV, LTC, DSCR, interest rates, with all conditions and matrix references
3. **Loan Purpose & Payment Type** — purchase, refinance, cash-out, delayed purchase, P&I, I/O, ARM variants (extract each ARM option separately)
4. **Prepayment & Partial Release** — each prepayment penalty option as ONE rule, partial release structure
5. **Subordination & Loan Position** — first trust deed, subordinate financing, assumability
6. **Property & Location Requirements** — improvement status, accessibility, amenities, condition, GLA minimums, heat source, code compliance
7. **Location/State-Specific** — prohibited states, state-by-state licensing/closing requirements
8. **Lease & Occupancy** — lease requirements, month-to-month rules, corporate leases, vacant unit underwriting, family member leases, STVR rules
9. **Insurance Requirements** — fire/hazard, rent loss, liability, loss payee, carrier ratings (A.M. Best, Demotech, S&P separately), deductibles, escrow
10. **Title Insurance** — policy requirements, endorsements, exceptions, chain of title, condominium requirements, survey exceptions
11. **Flood Insurance** — FEMA zones, coverage amounts, conformance, waiver conditions, escrow
12. **Escrow Holdbacks** — property tax escrow, insurance escrow, calculation methods
13. **Property Management** — self-management vs. dedicated manager, experience requirements (distance, type, duration, volume)
14. **Ground Lease** — case-by-case rules
15. **Borrower & Guarantor Requirements** — entity structure, documentation, SPE requirements, personal guaranty, background checks, disqualifications, credit checks (FICO, trade lines, late payments, judgments), liquidity requirements
16. **Deleted/Not Applicable Sections** — extract as explicit status rules

## Cross-Reference Matrix Handling

When the document says "Reference Guideline Matrix for details":
- Extract the matrix reference as a rule with format: "[CATEGORY]: Specific details and thresholds found in Guideline Matrix. Matrix factors include: [list known factors if mentioned]"
- Common matrix dependencies: Loan Size, LTV, LTC, DSCR, Occupancy, Liquid Reserves

## Edge Case Handling

- "Should" vs "Must": Extract as stated; flag with clarificationNeeded if subjective language used
- Compound conditions with multiple if-then branches: Extract each branch as separate rule
- Conflicting rules: Extract both; flag for review
- Multi-condition rules (e.g. "FRM - NOT allowed for MF or MU loans >$2M"): Keep as ONE rule, do not split

## Quality Assurance

Before finalizing:
1. Completeness: Confirm no section skipped
2. Uniqueness: No duplicate rules
3. Clarity: Each rule is unambiguous and testable
4. Traceability: Each rule references its source section
5. Cross-Reference: Matrix dependencies properly noted

## Output Format

Group rules by document type. Common document types: Credit Report, Bank Statements, Tax Returns, Appraisal, Title Report, Insurance, Entity Documents, Income Verification, Property Inspection, Environmental Report, Purchase Contract, General / All Documents.

Respond ONLY with valid JSON in this format:
{
  "rules": [
    {
      "documentType": "Credit Report",
      "ruleTitle": "Minimum credit score",
      "ruleDescription": "Borrower must have a minimum FICO score of 660. Score 660-680 requires preapproval.",
      "category": "Credit",
      "confidence": "high",
      "sourceSection": "Section 5.3 - Credit Check",
      "ruleType": "numerical_constraint",
      "clarificationNeeded": false
    }
  ]
}

For each rule, provide:
- documentType: which document type this rule applies to
- ruleTitle: a short, clear title
- ruleDescription: detailed description of what to check, including all conditions, exceptions, and thresholds
- category: one of "Eligibility", "Credit", "Income", "Property", "Compliance", "LTV", "DSCR", "Financial", "Insurance", "Title", "Flood", "Escrow", "Management", "Borrower", "Guarantor", "Documentation", "Reserves", "Location"
- confidence: "high" if clearly stated, "medium" if implied or partially stated, "low" if uncertain
- sourceSection: the section number/heading where this rule was found in the document
- ruleType: one of "eligibility", "disqualification", "numerical_constraint", "conditional", "calculation", "threshold", "permission", "prohibition", "documentation", "qualification", "exception", "cross_reference", "status"
- clarificationNeeded: true if the rule uses subjective language, has ambiguous terms, or could be interpreted multiple ways; false otherwise`;
}

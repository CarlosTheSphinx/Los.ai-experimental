import OpenAI from "openai";
import { db } from "../db";
import { documentReviewRules, users } from "@shared/schema";

const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!aiApiKey) {
  console.warn('⚠️  AI_INTEGRATIONS_OPENAI_API_KEY not set. AI review config generation will be disabled.');
}

const openai = new OpenAI({
  apiKey: aiApiKey || 'disabled',
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ReviewRuleProposal {
  documentName: string;
  documentCategory: string;
  ruleName: string;
  ruleDescription: string;
  ruleConfig: Record<string, any>;
  severity: 'required' | 'recommended' | 'info';
  confidence: number;
}

export interface GenerationResult {
  success: boolean;
  rules?: ReviewRuleProposal[];
  explanation?: string;
  error?: string;
}

const SYSTEM_PROMPT = `You are an expert document review specialist for loan underwriting. Your job is to analyze loan program document stipulations and guidelines to extract structured document review rules.

You will receive guidelines that describe what documents must be submitted, what conditions they must meet, what information must be verified, and any special requirements.

Your task is to extract and structure document review rules:

1. **Document Types** - Identify all document types mentioned (lease, bank statement, entity docs, etc.)

2. **For Each Document Type**, identify rules for:
   - Date range requirements (e.g., "within 12 months of closing")
   - Signature/signature line requirements (e.g., "must be signed by all parties")
   - Information requirements (e.g., "must show specific fields filled")
   - Completeness requirements (e.g., "all pages required")
   - Matching/verification requirements (e.g., "dates must match application")

3. **Severity Levels**:
   - "required": Document or condition is mandatory; deal cannot proceed without it
   - "recommended": Document or condition is strongly encouraged but not strictly mandatory
   - "info": Informational requirement or nice-to-have

4. **Rule Configuration** - Include specific check criteria in the ruleConfig JSON, such as:
   - date_range: { field, maxMonthsFromClosing, minMonthsFromClosing }
   - signatures_present: { requiredOn, parties }
   - field_validation: { fields, required }
   - completeness: { requireAllPages }
   - matching: { field, shouldMatch }

Output a valid JSON array of rules. Each rule should follow this structure:
{
  "documentName": "Lease Agreement",
  "documentCategory": "property_docs",
  "ruleName": "Lease dates within acceptable range",
  "ruleDescription": "Lease start date must be within 12 months of loan closing date",
  "ruleConfig": { "check": "date_range", "field": "lease_start_date", "maxMonthsFromClosing": 12 },
  "severity": "required",
  "confidence": 0.95
}

Valid documentCategory values:
- "borrower_docs" - Borrower personal documents (IDs, credit authorization)
- "entity_docs" - Business entity documents (formation docs, ownership)
- "property_docs" - Property related documents (lease, deed, appraisal)
- "financial_docs" - Financial documents (bank statements, tax returns, P&L)
- "closing_docs" - Closing and legal documents (note, mortgage, closing disclosure)
- "compliance_docs" - Compliance documents (insurance, approvals)

Be conservative - only include rules you can clearly extract from the guidelines. If something is ambiguous, assign lower confidence rather than guess.

Respond ONLY with a valid JSON array of rule objects.`;

export async function generateDocumentReviewRules(
  programId: number,
  guidelineText: string,
  guidelineUploadId: number,
  userId?: number
): Promise<GenerationResult> {
  if (!aiApiKey) {
    return {
      success: false,
      error: 'AI document review rule generation is not available. AI_INTEGRATIONS_OPENAI_API_KEY is not configured.'
    };
  }

  try {
    const userPrompt = `Analyze the following loan program document guidelines and extract structured document review rules.

DOCUMENT GUIDELINES:
---
${guidelineText}
---

Extract all document requirements, conditions, and verification rules. For each document type mentioned, identify:
1. What conditions/dates must be verified
2. What signatures or approvals must be present
3. What information must be matched to the application
4. Severity level (required vs recommended vs informational)
5. Your confidence in the extraction (0-1)

Return a JSON array of rule objects with documentName, documentCategory, ruleName, ruleDescription, ruleConfig, severity, and confidence.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'No response from AI' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { success: false, error: 'AI returned invalid JSON format' };
    }

    // Handle both direct array and wrapped object
    const rulesArray = Array.isArray(parsed) ? parsed : (parsed.rules || []);

    if (!Array.isArray(rulesArray)) {
      return { success: false, error: 'AI response does not contain rules array' };
    }

    // Validate and normalize the rules
    const validatedRules: ReviewRuleProposal[] = [];
    for (const rule of rulesArray) {
      if (!rule.documentName || !rule.documentCategory || !rule.ruleName || !rule.severity) {
        console.warn('Skipping invalid rule:', rule);
        continue;
      }

      validatedRules.push({
        documentName: rule.documentName,
        documentCategory: rule.documentCategory,
        ruleName: rule.ruleName,
        ruleDescription: rule.ruleDescription || rule.ruleName,
        ruleConfig: rule.ruleConfig || {},
        severity: ['required', 'recommended', 'info'].includes(rule.severity)
          ? rule.severity
          : 'info',
        confidence: typeof rule.confidence === 'number' ? Math.min(1, Math.max(0, rule.confidence)) : 0.8,
      });
    }

    if (validatedRules.length === 0) {
      return {
        success: false,
        error: 'No valid rules could be extracted from the guidelines'
      };
    }

    return {
      success: true,
      rules: validatedRules,
      explanation: `Successfully extracted ${validatedRules.length} document review rules from guidelines.`
    };
  } catch (error) {
    console.error('AI review config generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate review rules'
    };
  }
}

export async function saveProposedRules(
  programId: number,
  rules: ReviewRuleProposal[],
  guidelineUploadId: number,
  userId: number
): Promise<{ success: boolean; savedRules?: number[]; error?: string }> {
  try {
    const ruleIds: number[] = [];

    for (const rule of rules) {
      const [result] = await db.insert(documentReviewRules).values({
        programId,
        documentCategory: rule.documentCategory,
        documentName: rule.documentName,
        ruleName: rule.ruleName,
        ruleDescription: rule.ruleDescription,
        ruleConfig: rule.ruleConfig,
        severity: rule.severity,
        isActive: false, // Proposed rules are inactive until approved
        sourceGuidelineId: guidelineUploadId,
        confidence: rule.confidence,
        createdBy: userId,
      }).returning();

      if (result) {
        ruleIds.push(result.id);
      }
    }

    return {
      success: true,
      savedRules: ruleIds
    };
  } catch (error) {
    console.error('Error saving proposed rules:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save proposed rules'
    };
  }
}

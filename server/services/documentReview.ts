import OpenAI from "openai";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
const objectStorageService = new ObjectStorageService();
import { storage } from "../storage";
import { db } from "../db";
import { loanPrograms, dealDocuments, projects, savedQuotes, programReviewRules, programDocumentTemplates } from "@shared/schema";
import { eq, and, or, asc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function extractTextFromDocument(filePath: string, mimeType?: string | null): Promise<string> {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(filePath);
    const [buffer] = await objectFile.download();
    
    if (mimeType?.includes('pdf') || filePath.toLowerCase().endsWith('.pdf')) {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      const textParts: string[] = [];
      
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
        textParts.push(`[Page ${i}]\n${pageText}`);
      }
      
      return textParts.join('\n\n');
    }
    
    return buffer.toString('utf-8');
  } catch (error: any) {
    console.error('Document text extraction error:', error.message);
    throw new Error(`Failed to extract text from document: ${error.message}`);
  }
}

interface ReviewFinding {
  ruleId?: number;
  ruleName: string;
  ruleType: string;
  severity: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  title: string;
  detail: string;
  evidence?: string;
  pageReference?: string;
}

interface ReviewResult {
  overallStatus: 'pass' | 'fail' | 'needs_review';
  summary: string;
  findings: ReviewFinding[];
}

interface RuleForReview {
  id: number;
  ruleTitle: string;
  ruleDescription: string | null;
  ruleType: string | null;
  severity: string | null;
  documentType: string;
}

export async function reviewDocument(
  documentId: number,
  projectId: number,
  userId: number
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, documentId));
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    if (!doc.filePath) {
      return { success: false, error: 'No file uploaded for this document' };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    let programId: number | null = null;
    let documentTemplateId: number | null = null;
    let rules: RuleForReview[] = [];

    if (project.programId) {
      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, project.programId));
      if (program) {
        programId = program.id;

        if (doc.programDocumentTemplateId) {
          documentTemplateId = doc.programDocumentTemplateId;
          const templateRules = await db.select().from(programReviewRules)
            .where(and(
              eq(programReviewRules.documentTemplateId, doc.programDocumentTemplateId),
              eq(programReviewRules.isActive, true)
            ))
            .orderBy(asc(programReviewRules.sortOrder));

          if (templateRules.length > 0) {
            rules = templateRules;
          }
        }

        if (rules.length === 0) {
          const ruleConditions = [];
          ruleConditions.push(eq(programReviewRules.programId, program.id));
          if (program.creditPolicyId) {
            ruleConditions.push(eq(programReviewRules.creditPolicyId, program.creditPolicyId));
          }

          const programRules = await db.select().from(programReviewRules)
            .where(and(
              or(...ruleConditions),
              eq(programReviewRules.isActive, true)
            ))
            .orderBy(programReviewRules.sortOrder);

          if (programRules.length > 0) {
            const docCategory = doc.documentCategory || 'General';
            const docName = (doc.documentName || doc.fileName || '').toLowerCase();

            const relevantRules = programRules.filter(r => {
              if (r.documentTemplateId) return false;
              const ruleDocType = (r.documentType || '').toLowerCase();
              if (ruleDocType === 'general' || ruleDocType === 'all documents' || ruleDocType === 'general / all documents') return true;
              if (ruleDocType.includes(docCategory.toLowerCase())) return true;
              if (docName.includes(ruleDocType.replace(/\s+/g, ' ').trim())) return true;
              const ruleWords = ruleDocType.split(/[\s\/]+/).filter(w => w.length > 3);
              return ruleWords.some(w => docName.includes(w) || docCategory.toLowerCase().includes(w));
            });

            rules = relevantRules.length > 0 ? relevantRules : programRules.filter(r => !r.documentTemplateId);
          }
        }
      }
    }

    if (rules.length === 0) {
      return { success: false, error: 'No review rules configured for this document. Add rules to the document template in Admin > Programs, or assign review rules at the program level.' };
    }

    let documentText: string;
    try {
      documentText = await extractTextFromDocument(doc.filePath, doc.mimeType);
    } catch (err: any) {
      return { success: false, error: `Could not read document: ${err.message}` };
    }

    if (!documentText || documentText.trim().length < 10) {
      return { success: false, error: 'Could not extract meaningful text from this document. It may be an image-only PDF or an unsupported format.' };
    }

    const truncatedText = documentText.slice(0, 30000);

    let dealInfo = '';
    if (project.dealId) {
      const [deal] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, project.dealId));
      if (deal) {
        dealInfo = `
Loan Details:
- Borrower: ${deal.customerFirstName || ''} ${deal.customerLastName || ''}
- Property Address: ${deal.propertyAddress || 'N/A'}
- Loan Amount: ${deal.loanAmount ? `$${Number(deal.loanAmount).toLocaleString()}` : 'N/A'}
- Loan Type: ${deal.loanType || 'N/A'}
- Property Type: ${deal.propertyType || 'N/A'}
`;
      }
    }

    const rulesForPrompt = rules.map((r, idx) => ({
      ruleIndex: idx + 1,
      ruleId: r.id,
      ruleName: r.ruleTitle,
      ruleType: r.ruleType || 'general',
      severity: r.severity || 'fail',
      instructions: r.ruleDescription || r.ruleTitle,
    }));

    const systemPrompt = `You are an expert loan document reviewer for a private lending company. You review documents against specific rules and produce structured, rule-by-rule findings.

For EACH rule provided, you must produce exactly one finding with:
- "ruleIndex": the rule number from the input
- "status": one of "pass", "fail", "warning", "info"
  - Use the rule's severity to guide your assessment:
    - FAIL severity rules: use "fail" if not met, "pass" if met
    - WARN severity rules: use "warning" if not clearly met, "pass" if met
    - INFO severity rules: use "info" with relevant observations, or "pass" if clearly met
- "title": a short title for the finding
- "detail": detailed explanation of what you found
- "evidence": the specific text, value, or excerpt from the document that supports your finding. Quote directly from the document when possible.
- "pageReference": which page(s) of the document are relevant (e.g. "Page 1", "Pages 2-3")

Also provide:
- "overallStatus": "pass" if all FAIL-severity rules pass, "fail" if any FAIL-severity rule fails, "needs_review" if only WARN/INFO rules have issues
- "summary": 1-2 sentence summary

Respond ONLY with valid JSON in this exact format:
{
  "overallStatus": "pass" | "fail" | "needs_review",
  "summary": "Brief summary",
  "findings": [
    {
      "ruleIndex": 1,
      "status": "pass" | "fail" | "warning" | "info",
      "title": "Short title",
      "detail": "Detailed explanation",
      "evidence": "Quoted text or extracted value from document",
      "pageReference": "Page X"
    }
  ]
}`;

    const userPrompt = `## Document Being Reviewed
**Document Name:** ${doc.documentName || doc.fileName || 'Unknown'}
**Document Category:** ${doc.documentCategory || 'General'}
${dealInfo}

## Rules to Check (${rulesForPrompt.length} rules)
${rulesForPrompt.map(r => `Rule ${r.ruleIndex} [ID:${r.ruleId}] (${r.ruleType.toUpperCase()}, Severity: ${r.severity.toUpperCase()}):
  "${r.ruleName}"
  Instructions: ${r.instructions}`).join('\n\n')}

## Document Content
${truncatedText}

Review this document against ALL ${rulesForPrompt.length} rules above. Produce one finding per rule.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'AI returned empty response' };
    }

    let reviewResult: ReviewResult;
    try {
      const parsed = JSON.parse(content);
      const enrichedFindings = (parsed.findings || []).map((f: any) => {
        const ruleIdx = f.ruleIndex ? f.ruleIndex - 1 : -1;
        const matchedRule = ruleIdx >= 0 && ruleIdx < rulesForPrompt.length ? rulesForPrompt[ruleIdx] : null;
        return {
          ruleId: matchedRule?.ruleId || null,
          ruleName: matchedRule?.ruleName || f.title || 'Unknown Rule',
          ruleType: matchedRule?.ruleType || 'general',
          severity: matchedRule?.severity || 'fail',
          status: f.status || 'info',
          title: f.title || matchedRule?.ruleName || '',
          detail: f.detail || '',
          evidence: f.evidence || null,
          pageReference: f.pageReference || null,
        };
      });

      reviewResult = {
        overallStatus: parsed.overallStatus || 'needs_review',
        summary: parsed.summary || '',
        findings: enrichedFindings,
      };
    } catch {
      return { success: false, error: 'AI returned invalid response format' };
    }

    const rulesPassed = reviewResult.findings.filter(f => f.status === 'pass').length;
    const rulesFailed = reviewResult.findings.filter(f => f.status === 'fail').length;
    const rulesWarning = reviewResult.findings.filter(f => f.status === 'warning').length;

    const savedReview = await storage.createDocumentReview({
      documentId,
      projectId,
      programId,
      documentTemplateId,
      overallStatus: reviewResult.overallStatus,
      summary: reviewResult.summary,
      findings: JSON.stringify(reviewResult.findings),
      rulesUsed: rules.length,
      rulesPassed,
      rulesFailed,
      rulesWarning,
      model: 'gpt-5-mini',
      reviewedBy: userId,
    });

    return {
      success: true,
      result: {
        ...savedReview,
        findings: reviewResult.findings,
      },
    };
  } catch (error: any) {
    console.error('Document review error:', error);
    return { success: false, error: `Review failed: ${error.message}` };
  }
}

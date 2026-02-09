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

const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function isImageMimeType(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return SUPPORTED_IMAGE_MIMES.includes(mimeType);
}

function isImageFile(filePath: string, mimeType?: string | null): boolean {
  if (isImageMimeType(mimeType)) return true;
  const ext = filePath.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
}

function getImageMediaType(mimeType?: string | null, filePath?: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (mimeType === 'image/png') return 'image/png';
  if (mimeType === 'image/gif') return 'image/gif';
  if (mimeType === 'image/webp') return 'image/webp';
  if (filePath) {
    const ext = filePath.toLowerCase().split('.').pop();
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
  }
  return 'image/jpeg';
}

async function downloadDocumentBuffer(filePath: string): Promise<Buffer> {
  const objectFile = await objectStorageService.getObjectEntityFile(filePath);
  const [buffer] = await objectFile.download();
  return buffer;
}

async function extractTextFromDocument(filePath: string, mimeType?: string | null): Promise<string> {
  try {
    const buffer = await downloadDocumentBuffer(filePath);
    
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

    const isImage = isImageFile(doc.filePath, doc.mimeType);
    let documentText: string | null = null;
    let imageBase64: string | null = null;
    let imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

    if (isImage) {
      try {
        const buffer = await downloadDocumentBuffer(doc.filePath);
        imageBase64 = buffer.toString('base64');
        imageMediaType = getImageMediaType(doc.mimeType, doc.filePath);
      } catch (err: any) {
        return { success: false, error: `Could not read image document: ${err.message}` };
      }
    } else {
      try {
        documentText = await extractTextFromDocument(doc.filePath, doc.mimeType);
      } catch (err: any) {
        return { success: false, error: `Could not read document: ${err.message}` };
      }

      if (!documentText || documentText.trim().length < 10) {
        return { success: false, error: 'Could not extract meaningful text from this document. It may be an image-only PDF or an unsupported format.' };
      }

      documentText = documentText.slice(0, 30000);
    }

    let dealInfo = '';
    const referenceDataParts: string[] = [];

    referenceDataParts.push(`Project/Application Reference Data:`);
    if (project.borrowerName) referenceDataParts.push(`- Borrower Name (from application): ${project.borrowerName}`);
    if (project.borrowerEmail) referenceDataParts.push(`- Borrower Email (from application): ${project.borrowerEmail}`);
    if (project.borrowerPhone) referenceDataParts.push(`- Borrower Phone (from application): ${project.borrowerPhone}`);
    if (project.propertyAddress) referenceDataParts.push(`- Property Address (from application): ${project.propertyAddress}`);
    if (project.propertyType) referenceDataParts.push(`- Property Type (from application): ${project.propertyType}`);
    if (project.loanAmount) referenceDataParts.push(`- Loan Amount (from application): $${Number(project.loanAmount).toLocaleString()}`);
    if (project.loanType) referenceDataParts.push(`- Loan Type (from application): ${project.loanType}`);
    if (project.interestRate) referenceDataParts.push(`- Interest Rate (from application): ${project.interestRate}%`);

    if (project.quoteId) {
      const [quote] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, project.quoteId));
      if (quote) {
        const fullName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim();
        if (fullName) referenceDataParts.push(`- Borrower Full Name (from quote): ${fullName}`);
        if (quote.customerCompanyName) referenceDataParts.push(`- Company Name (from quote): ${quote.customerCompanyName}`);
        if (quote.customerEmail) referenceDataParts.push(`- Email (from quote): ${quote.customerEmail}`);
        if (quote.customerPhone) referenceDataParts.push(`- Phone (from quote): ${quote.customerPhone}`);
        if (quote.propertyAddress) referenceDataParts.push(`- Property Address (from quote): ${quote.propertyAddress}`);
      }
    }

    dealInfo = referenceDataParts.join('\n');

    const rulesForPrompt = rules.map((r, idx) => ({
      ruleIndex: idx + 1,
      ruleId: r.id,
      ruleName: r.ruleTitle,
      ruleType: r.ruleType || 'general',
      severity: r.severity || 'fail',
      instructions: r.ruleDescription || r.ruleTitle,
    }));

    const systemPrompt = `You are an expert loan document reviewer for a private lending company. You review documents against specific rules and produce structured, rule-by-rule findings.
${isImage ? '\nIMPORTANT: The document is provided as an IMAGE. You must visually examine the image to read all text, names, dates, numbers, and other information visible in the document. Look carefully at the full image content.\n' : ''}
For EACH rule provided, you must produce exactly one finding with:
- "ruleIndex": the rule number from the input
- "status": one of "pass", "fail", "warning", "info"
  - Use the rule's severity to guide your assessment:
    - FAIL severity rules: use "fail" if not met, "pass" if met
    - WARN severity rules: use "warning" if not clearly met, "pass" if met
    - INFO severity rules: use "info" with relevant observations, or "pass" if clearly met
- "title": a short title for the finding
- "detail": detailed explanation of what you found
- "evidence": the specific text, value, or excerpt from the document that supports your finding. Quote directly from the document when possible.${isImage ? ' Describe what you see in the image.' : ''}
  IMPORTANT FOR CROSS-REFERENCE/COMPARISON RULES: When a rule requires matching, comparing, or cross-referencing information between this document and the application/project data (e.g. name matching, address verification, amount verification), you MUST present BOTH sides of the comparison in your evidence. Format it as:
  "Found on document: [value from document] | Application/reference data: [value from reference data]"
  This allows the reviewer to see exactly what is being compared. Always show both values even when they match.
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

    const rulesText = rulesForPrompt.map(r => `Rule ${r.ruleIndex} [ID:${r.ruleId}] (${r.ruleType.toUpperCase()}, Severity: ${r.severity.toUpperCase()}):
  "${r.ruleName}"
  Instructions: ${r.instructions}`).join('\n\n');

    const userTextContent = `## Document Being Reviewed
**Document Name:** ${doc.documentName || doc.fileName || 'Unknown'}
**Document Category:** ${doc.documentCategory || 'General'}

## Application & Reference Data (use this for cross-referencing)
${dealInfo}

## Rules to Check (${rulesForPrompt.length} rules)
${rulesText}
${!isImage ? `\n## Document Content\n${documentText}` : '\n## Document Image\nThe document image is attached. Please visually examine it to verify each rule.'}

Review this document against ALL ${rulesForPrompt.length} rules above. Produce one finding per rule.`;

    if (isImage && !imageBase64) {
      return { success: false, error: 'Failed to load image data for vision analysis.' };
    }

    let messages: any[];
    if (isImage && imageBase64) {
      messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userTextContent },
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageMediaType};base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ];
    } else {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userTextContent },
      ];
    }

    const response = await openai.chat.completions.create({
      model: isImage ? 'gpt-4o' : 'gpt-5-mini',
      messages,
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
      model: isImage ? 'gpt-4o' : 'gpt-5-mini',
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

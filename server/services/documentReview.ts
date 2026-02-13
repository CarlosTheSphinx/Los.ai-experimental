import OpenAI from "openai";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
const objectStorageService = new ObjectStorageService();
import { storage } from "../storage";
import { db } from "../db";
import { loanPrograms, dealDocuments, dealDocumentFiles, dealProperties, projects, savedQuotes, programReviewRules, programDocumentTemplates, documentReviewRules } from "@shared/schema";
import { eq, and, or, asc } from "drizzle-orm";

const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!aiApiKey) {
  console.warn('⚠️  AI_INTEGRATIONS_OPENAI_API_KEY not set. Document AI review features will be disabled.');
}

const openai = new OpenAI({
  apiKey: aiApiKey || 'disabled',
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

function isPdfFile(filePath: string, mimeType?: string | null): boolean {
  if (mimeType?.includes('pdf')) return true;
  return filePath.toLowerCase().endsWith('.pdf');
}

async function renderPdfPagesToImages(buffer: Buffer, maxPages: number = 10): Promise<Array<{ base64: string; pageNum: number }>> {
  try {
    const { createCanvas } = await import('canvas');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    class NodeCanvasFactory {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return { canvas, context };
      }
      reset(canvasAndContext: any, width: number, height: number) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      }
      destroy(canvasAndContext: any) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      }
    }

    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      canvasFactory: new NodeCanvasFactory() as any,
    }).promise;

    const pages: Array<{ base64: string; pageNum: number }> = [];
    const numPages = Math.min(doc.numPages, maxPages);

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });

      const canvasFactory = new NodeCanvasFactory();
      const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

      await page.render({
        canvasContext: context as any,
        viewport: viewport,
      }).promise;

      const pngBuffer = canvas.toBuffer('image/png');
      pages.push({
        base64: pngBuffer.toString('base64'),
        pageNum: i,
      });
    }

    await doc.destroy();
    return pages;
  } catch (error: any) {
    console.error('PDF to image rendering error:', error.message);
    return [];
  }
}

async function extractTextFromDocument(filePath: string, mimeType?: string | null): Promise<string> {
  try {
    const buffer = await downloadDocumentBuffer(filePath);
    
    if (isPdfFile(filePath, mimeType)) {
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

function hasSubstantialText(text: string): boolean {
  const cleaned = text.replace(/\[Page \d+\]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 100;
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
  if (!aiApiKey) {
    throw new Error('AI document review is not available. AI_INTEGRATIONS_OPENAI_API_KEY is not configured.');
  }

  try {
    const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, documentId));
    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    const docFiles = await db.select().from(dealDocumentFiles)
      .where(eq(dealDocumentFiles.documentId, documentId));

    if (!doc.filePath && docFiles.length === 0) {
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

    const filesToProcess = docFiles.length > 0 ? docFiles : (doc.filePath ? [{
      filePath: doc.filePath,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      id: 0,
    }] : []);

    if (filesToProcess.length === 0) {
      return { success: false, error: 'No files uploaded for this document' };
    }

    let hasImages = false;
    let documentText: string | null = null;
    const imageContents: Array<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; fileName: string }> = [];
    const textParts: string[] = [];

    for (const file of filesToProcess) {
      const fp = file.filePath;
      const mt = file.mimeType;
      const fn = file.fileName || 'file';

      if (isImageFile(fp, mt)) {
        hasImages = true;
        try {
          const buffer = await downloadDocumentBuffer(fp);
          imageContents.push({
            base64: buffer.toString('base64'),
            mediaType: getImageMediaType(mt, fp),
            fileName: fn,
          });
        } catch (err: any) {
          console.error(`Could not read image file ${fn}:`, err.message);
        }
      } else if (isPdfFile(fp, mt)) {
        try {
          const text = await extractTextFromDocument(fp, mt);
          const textIsSubstantial = hasSubstantialText(text);
          
          if (textIsSubstantial) {
            textParts.push(`--- File: ${fn} ---\n${text}`);
          }
          
          if (!textIsSubstantial) {
            console.log(`PDF "${fn}" has sparse text (${text.replace(/\[Page \d+\]/g, '').trim().length} chars), rendering pages as images for vision analysis`);
            const buffer = await downloadDocumentBuffer(fp);
            const pdfImages = await renderPdfPagesToImages(buffer);
            if (pdfImages.length > 0) {
              hasImages = true;
              for (const pdfImg of pdfImages) {
                imageContents.push({
                  base64: pdfImg.base64,
                  mediaType: 'image/png',
                  fileName: `${fn} - Page ${pdfImg.pageNum}`,
                });
              }
            } else if (text && text.trim().length > 5) {
              textParts.push(`--- File: ${fn} ---\n${text}`);
            }
          }
        } catch (err: any) {
          console.error(`Could not read PDF file ${fn}:`, err.message);
        }
      } else {
        try {
          const text = await extractTextFromDocument(fp, mt);
          if (text && text.trim().length > 5) {
            textParts.push(`--- File: ${fn} ---\n${text}`);
          }
        } catch (err: any) {
          console.error(`Could not read file ${fn}:`, err.message);
        }
      }
    }

    if (imageContents.length === 0 && textParts.length === 0) {
      return { success: false, error: 'Could not extract content from any of the uploaded files.' };
    }

    const isImage = imageContents.length > 0;
    documentText = textParts.length > 0 ? textParts.join('\n\n').slice(0, 30000) : null;

    let dealInfo = '';
    const referenceDataParts: string[] = [];

    referenceDataParts.push(`Project/Application Reference Data:`);
    if (project.borrowerName) referenceDataParts.push(`- Borrower Name (from application): ${project.borrowerName}`);
    if (project.borrowerEmail) referenceDataParts.push(`- Borrower Email (from application): ${project.borrowerEmail}`);
    if (project.borrowerPhone) referenceDataParts.push(`- Borrower Phone (from application): ${project.borrowerPhone}`);
    if (project.loanAmount) referenceDataParts.push(`- Loan Amount (from application): $${Number(project.loanAmount).toLocaleString()}`);
    if (project.loanType) referenceDataParts.push(`- Loan Type (from application): ${project.loanType}`);
    if (project.interestRate) referenceDataParts.push(`- Interest Rate (from application): ${project.interestRate}%`);

    const props = await db.select().from(dealProperties).where(eq(dealProperties.dealId, project.id)).orderBy(dealProperties.sortOrder);
    if (props.length > 0) {
      referenceDataParts.push(`\nProperty Addresses on this loan (${props.length} ${props.length === 1 ? 'property' : 'properties'}):`);
      props.forEach((p, idx) => {
        const label = p.isPrimary ? 'Primary' : `Property ${idx + 1}`;
        referenceDataParts.push(`- ${label}: ${p.address}${p.city ? `, ${p.city}` : ''}${p.state ? `, ${p.state}` : ''}${p.zip ? ` ${p.zip}` : ''}`);
        if (p.propertyType) referenceDataParts.push(`  Type: ${p.propertyType}`);
        if (p.estimatedValue) referenceDataParts.push(`  Estimated Value: $${Number(p.estimatedValue).toLocaleString()}`);
      });
      referenceDataParts.push(`\nIMPORTANT: When checking address matching rules, the document address should match ANY of the ${props.length} property addresses listed above. A match to any one of them constitutes a pass.`);
    } else {
      if (project.propertyAddress) referenceDataParts.push(`- Property Address (from application): ${project.propertyAddress}`);
      if (project.propertyType) referenceDataParts.push(`- Property Type (from application): ${project.propertyType}`);
    }

    if (project.quoteId) {
      const [quote] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, project.quoteId));
      if (quote) {
        const fullName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim();
        if (fullName) referenceDataParts.push(`- Borrower Full Name (from quote): ${fullName}`);
        if (quote.customerCompanyName) referenceDataParts.push(`- Company Name (from quote): ${quote.customerCompanyName}`);
        if (quote.customerEmail) referenceDataParts.push(`- Email (from quote): ${quote.customerEmail}`);
        if (quote.customerPhone) referenceDataParts.push(`- Phone (from quote): ${quote.customerPhone}`);
        if (!props.length && quote.propertyAddress) referenceDataParts.push(`- Property Address (from quote): ${quote.propertyAddress}`);
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
IMPORTANT — SIGNATURE RECOGNITION GUIDANCE:
When checking whether a document is "signed", you must recognize ALL of these as valid forms of signing:
- Handwritten (wet ink) signatures
- Electronic/digital signatures (e.g., "/s/ John Doe", typed names in signature blocks, DocuSign stamps)
- Certification or attestation statements where a named individual certifies the document (e.g., "I certify that...", "I have prepared this as a true and accurate account...")
- Settlement agent attestations with a named person and/or timestamp (e.g., "Printed on [date] by [name]")
- Notary acknowledgments or seals
- Any signature block that includes a printed name, title, date, or "Prepared by" / "Reviewed by" attribution
A document should be considered "signed" if ANY of these indicators are present. Do NOT require a visible handwritten signature when other valid signing methods are evident.

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
${isImage && imageContents.length > 0 ? `\n## Document Images (${imageContents.length} file${imageContents.length > 1 ? 's' : ''})\n${imageContents.map((ic, i) => `Image ${i + 1}: ${ic.fileName}`).join('\n')}\nThe document images are attached. Please visually examine all images to verify each rule.` : ''}
${documentText ? `\n## Document Content${filesToProcess.length > 1 ? ` (${textParts.length} file${textParts.length > 1 ? 's' : ''})` : ''}\n${documentText}` : ''}

Review this document against ALL ${rulesForPrompt.length} rules above. Produce one finding per rule.`;

    if (isImage && imageContents.length === 0) {
      return { success: false, error: 'Failed to load image data for vision analysis.' };
    }

    let messages: any[];
    if (isImage) {
      const contentParts: any[] = [{ type: 'text', text: userTextContent }];
      for (const ic of imageContents) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${ic.mediaType};base64,${ic.base64}`,
            detail: 'high',
          },
        });
      }
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
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

export async function reviewDocumentWithRules(
  documentId: number,
  filePath: string,
  programId: number,
  userId: number
): Promise<{
  status: 'approved' | 'denied' | 'error';
  reason: string;
  confidence: number;
}> {
  if (!aiApiKey) {
    return {
      status: 'error',
      reason: 'AI document review is not available. AI_INTEGRATIONS_OPENAI_API_KEY is not configured.',
      confidence: 0
    };
  }

  try {
    // Get the document
    const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, documentId));
    if (!doc) {
      return {
        status: 'error',
        reason: 'Document not found',
        confidence: 0
      };
    }

    // Get applicable review rules for this document
    const rules = await db.select().from(documentReviewRules).where(
      and(
        eq(documentReviewRules.programId, programId),
        eq(documentReviewRules.isActive, true),
        or(
          eq(documentReviewRules.documentName, doc.documentName),
          eq(documentReviewRules.documentCategory, doc.documentCategory || '')
        )
      )
    );

    if (rules.length === 0) {
      return {
        status: 'approved',
        reason: 'No review rules configured for this document type. Document approved by default.',
        confidence: 0.5
      };
    }

    // Process the document file
    let hasImages = false;
    let documentText: string | null = null;
    const imageContents: Array<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; fileName: string }> = [];
    const textParts: string[] = [];

    const fp = filePath;
    const mt = doc.mimeType;
    const fn = doc.fileName || 'file';

    try {
      if (isImageFile(fp, mt)) {
        hasImages = true;
        const buffer = await downloadDocumentBuffer(fp);
        imageContents.push({
          base64: buffer.toString('base64'),
          mediaType: getImageMediaType(mt, fp),
          fileName: fn,
        });
      } else if (isPdfFile(fp, mt)) {
        const text = await extractTextFromDocument(fp, mt);
        const textIsSubstantial = hasSubstantialText(text);

        if (textIsSubstantial) {
          textParts.push(`--- File: ${fn} ---\n${text}`);
        }

        if (!textIsSubstantial) {
          const buffer = await downloadDocumentBuffer(fp);
          const pdfImages = await renderPdfPagesToImages(buffer);
          if (pdfImages.length > 0) {
            hasImages = true;
            for (const pdfImg of pdfImages) {
              imageContents.push({
                base64: pdfImg.base64,
                mediaType: 'image/png',
                fileName: `${fn} - Page ${pdfImg.pageNum}`,
              });
            }
          } else if (text && text.trim().length > 5) {
            textParts.push(`--- File: ${fn} ---\n${text}`);
          }
        }
      } else {
        const text = await extractTextFromDocument(fp, mt);
        if (text && text.trim().length > 5) {
          textParts.push(`--- File: ${fn} ---\n${text}`);
        }
      }
    } catch (err: any) {
      console.error(`Could not read file ${fn}:`, err.message);
      return {
        status: 'error',
        reason: `Failed to read document file: ${err.message}`,
        confidence: 0
      };
    }

    if (imageContents.length === 0 && textParts.length === 0) {
      return {
        status: 'error',
        reason: 'Could not extract content from the uploaded file.',
        confidence: 0
      };
    }

    const isImage = imageContents.length > 0;
    documentText = textParts.length > 0 ? textParts.join('\n\n').slice(0, 30000) : null;

    // Build rules text for the prompt
    const rulesText = rules.map((r, idx) => `Rule ${idx + 1} [${r.severity.toUpperCase()}]:
  "${r.ruleName}"
  Details: ${r.ruleDescription}
  Config: ${JSON.stringify(r.ruleConfig)}`).join('\n\n');

    const systemPrompt = `You are an expert loan document reviewer. You review documents against specific rules and determine if the document passes review.

${isImage ? '\nIMPORTANT: The document is provided as an IMAGE. You must visually examine the image to read all text, names, dates, numbers, and other information visible in the document.\n' : ''}

For each rule, evaluate whether the document meets the requirement. Then provide:
- "overallStatus": "approved" if all REQUIRED rules pass, "denied" if any REQUIRED rule fails, "warning" if only WARNING/INFO rules have issues
- "findings": array of findings for each rule with status (pass/fail/warning/info) and details
- "confidence": your confidence in the assessment (0-1)

Respond ONLY with valid JSON.`;

    const userPrompt = `## Document Being Reviewed
**Document Name:** ${doc.documentName || doc.fileName || 'Unknown'}
**Document Category:** ${doc.documentCategory || 'General'}

## Rules to Check (${rules.length} rules)
${rulesText}

${isImage && imageContents.length > 0 ? `## Document Images (${imageContents.length} file${imageContents.length > 1 ? 's' : ''})
The document images are attached. Please visually examine all images to verify each rule.` : ''}

${documentText ? `## Document Content
${documentText}` : ''}

Review this document against ALL ${rules.length} rules above. For each rule, determine if it's met or not. Return JSON with overallStatus (approved/denied/warning), findings array, and confidence score.`;

    let messages: any[];
    if (isImage && imageContents.length > 0) {
      const contentParts: any[] = [{ type: 'text', text: userPrompt }];
      for (const ic of imageContents) {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${ic.mediaType};base64,${ic.base64}`,
            detail: 'high',
          },
        });
      }
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
      ];
    } else {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
    }

    const response = await openai.chat.completions.create({
      model: isImage ? 'gpt-4o' : 'gpt-5-mini',
      messages,
      response_format: { type: 'json_object' },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        status: 'error',
        reason: 'AI returned empty response',
        confidence: 0
      };
    }

    let result: any;
    try {
      result = JSON.parse(content);
    } catch {
      return {
        status: 'error',
        reason: 'AI returned invalid JSON format',
        confidence: 0
      };
    }

    const status = result.overallStatus === 'approved' ? 'approved' : 'denied';
    const confidence = typeof result.confidence === 'number' ? result.confidence : 0.8;
    const reason = result.summary || result.reason || 'Review completed by AI';

    return {
      status,
      reason,
      confidence
    };
  } catch (error: any) {
    console.error('Document review with rules error:', error);
    return {
      status: 'error',
      reason: `Review failed: ${error.message}`,
      confidence: 0
    };
  }
}

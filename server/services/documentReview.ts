import OpenAI from "openai";
import { objectStorageService } from "../replit_integrations/object_storage/objectStorage";
import { storage } from "../storage";
import { db } from "../db";
import { loanPrograms, dealDocuments, projects, savedQuotes } from "@shared/schema";
import { eq } from "drizzle-orm";

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
        textParts.push(pageText);
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
  category: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  title: string;
  detail: string;
}

interface ReviewResult {
  overallStatus: 'pass' | 'fail' | 'needs_review';
  summary: string;
  findings: ReviewFinding[];
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

    let guidelines: string | null = null;
    let programId: number | null = null;

    if (project.programId) {
      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, project.programId));
      if (program) {
        guidelines = program.reviewGuidelines;
        programId = program.id;
      }
    }

    if (!guidelines) {
      return { success: false, error: 'No review guidelines configured for this loan program. Please add guidelines in the program settings first.' };
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

    const systemPrompt = `You are an expert loan document reviewer for a private lending company. Your job is to review uploaded documents against specific loan program guidelines and flag any issues, missing information, or items that don't meet requirements.

Review the document carefully and provide structured findings. For each finding, assign a status:
- "pass" — meets the guideline requirement
- "fail" — does not meet the guideline requirement  
- "warning" — potentially problematic or needs manual verification
- "info" — informational note

Provide an overall status:
- "pass" — document meets all critical guidelines
- "fail" — document has critical issues that must be addressed
- "needs_review" — document needs manual review for some items

Be specific and actionable in your findings. Reference specific parts of the document and guidelines.

Respond ONLY with valid JSON in this exact format:
{
  "overallStatus": "pass" | "fail" | "needs_review",
  "summary": "Brief 1-2 sentence summary of findings",
  "findings": [
    {
      "category": "Category name (e.g. Credit, Income, Property, Compliance, etc.)",
      "status": "pass" | "fail" | "warning" | "info",
      "title": "Short title of the finding",
      "detail": "Detailed explanation"
    }
  ]
}`;

    const userPrompt = `## Document Being Reviewed
**Document Name:** ${doc.documentName || doc.fileName || 'Unknown'}
**Document Type:** ${doc.documentCategory || 'General'}
${dealInfo}

## Loan Program Guidelines
${guidelines}

## Document Content
${truncatedText}

Please review this document against the guidelines and provide your structured findings.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'AI returned empty response' };
    }

    let reviewResult: ReviewResult;
    try {
      reviewResult = JSON.parse(content);
    } catch {
      return { success: false, error: 'AI returned invalid response format' };
    }

    const savedReview = await storage.createDocumentReview({
      documentId,
      projectId,
      programId,
      overallStatus: reviewResult.overallStatus,
      summary: reviewResult.summary,
      findings: JSON.stringify(reviewResult.findings),
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

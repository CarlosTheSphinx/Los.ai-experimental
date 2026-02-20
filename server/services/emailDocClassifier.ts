/**
 * Email Document Classifier Service
 * Uses AI to classify email attachments into lending document types.
 * Leverages the existing agentRunner infrastructure for execution,
 * configuration, and cost tracking.
 */

import { executeAgent, fillTemplate } from '../agents/agentRunner';
import type { ExecuteAgentResult } from '../agents/agentRunner';
import { getAttachment } from './gmail';

export interface ClassifyAttachmentParams {
  accountId: number;
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  emailSubject: string;
  senderEmail: string;
  senderName: string;
  dealId: number;
  dealName: string;
  borrowerName: string;
  userId?: number;
}

export interface ClassificationResult {
  documentType: string;
  documentTypeLabel: string;
  confidence: number;
  suggestedAction: string;
  reasoning: string;
  agentRunId: number;
  success: boolean;
  error?: string;
}

// Lending document types the classifier can identify
export const DOCUMENT_TYPES = [
  { value: 'pay_stub', label: 'Pay Stub' },
  { value: 'w2', label: 'W-2' },
  { value: 'tax_return', label: 'Tax Return' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'title_commitment', label: 'Title Commitment' },
  { value: 'insurance_certificate', label: 'Insurance Certificate' },
  { value: 'purchase_agreement', label: 'Purchase Agreement' },
  { value: 'closing_disclosure', label: 'Closing Disclosure' },
  { value: 'loan_estimate', label: 'Loan Estimate' },
  { value: 'credit_report', label: 'Credit Report' },
  { value: 'employment_verification', label: 'Employment Verification' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'property_photo', label: 'Property Photo' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * Classify an email attachment using the email_doc_classifier agent.
 * Optionally fetches the attachment content for preview if it's a text-based document.
 */
export async function classifyEmailAttachment(
  params: ClassifyAttachmentParams
): Promise<ClassificationResult> {
  try {
    // Try to get a document preview for better classification
    let documentPreview = '';
    const textMimeTypes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/rtf',
    ];

    if (textMimeTypes.some((t) => params.mimeType.startsWith(t))) {
      try {
        const attachment = await getAttachment(
          params.accountId,
          params.messageId,
          params.attachmentId
        );
        if (attachment?.data) {
          // For PDFs, we can only pass filename/type context (vision would need separate handling)
          // For text files, extract first 500 chars as preview
          if (params.mimeType === 'text/plain' || params.mimeType === 'text/csv') {
            documentPreview = attachment.data.toString('utf-8').slice(0, 500);
          }
        }
      } catch (err) {
        console.log('Could not fetch attachment preview, classifying by metadata only');
      }
    }

    // Build context data for the agent template
    const contextData: Record<string, any> = {
      filename: params.filename,
      mime_type: params.mimeType,
      email_subject: params.emailSubject,
      sender_email: params.senderEmail,
      sender_name: params.senderName || params.senderEmail,
      deal_name: params.dealName,
      borrower_name: params.borrowerName,
      document_preview: documentPreview || 'No preview available — classify based on filename and context.',
    };

    // Execute the classifier agent via the standard agentRunner
    const result: ExecuteAgentResult = await executeAgent({
      agentType: 'email_doc_classifier' as any,
      projectId: params.dealId,
      triggeredBy: params.userId,
      triggerType: 'email_attachment_detected',
      contextData,
    });

    // Parse the AI response (expects JSON)
    let parsed: any;
    try {
      const text = result.response || '';
      // Handle markdown code blocks in response
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      parsed = JSON.parse(jsonMatch[1].trim());
    } catch (parseErr) {
      console.error('Failed to parse classifier response:', result.response);
      return {
        documentType: 'other',
        documentTypeLabel: 'Other',
        confidence: 0,
        suggestedAction: 'review',
        reasoning: 'Could not parse AI classification response',
        agentRunId: result.agentRunId,
        success: false,
        error: 'Parse error',
      };
    }

    return {
      documentType: parsed.document_type || 'other',
      documentTypeLabel: parsed.document_type_label || 'Other',
      confidence: parsed.confidence || 0,
      suggestedAction: parsed.suggested_action || 'review',
      reasoning: parsed.reasoning || '',
      agentRunId: result.agentRunId,
      success: true,
    };
  } catch (error: any) {
    console.error('Email document classification failed:', error.message);
    return {
      documentType: 'other',
      documentTypeLabel: 'Other',
      confidence: 0,
      suggestedAction: 'review',
      reasoning: error.message,
      agentRunId: 0,
      success: false,
      error: error.message,
    };
  }
}

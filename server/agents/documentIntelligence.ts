/**
 * Document Intelligence Agent
 * Agent 1: Extracts structured information from loan documents
 * Identifies document types, anomalies, and quality issues
 */

import { db } from "../db";
import {
  documentExtractions,
  projects,
  dealDocuments,
  type DocumentExtraction,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { executeAgent } from "./agentRunner";

export interface ExtractDocumentParams {
  projectId: number;
  dealDocumentId: number;
  documentText: string;
  metadata: {
    fileName: string;
    declaredDocType: string;
    borrowerName: string;
  };
}

export interface ExtractionResult extends DocumentExtraction {
  extractedFieldsJson?: Record<string, any>;
}

/**
 * Extract structured information from a document
 * Stores results in documentExtractions table
 */
export async function extractDocument(
  params: ExtractDocumentParams
): Promise<ExtractionResult> {
  try {
    console.log(
      `📄 Extracting document ${params.dealDocumentId} for project ${params.projectId}`
    );

    // Fetch project details for context
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .then((rows) => rows[0]);

    if (!project) {
      throw new Error(`Project ${params.projectId} not found`);
    }

    // Fetch deal document for additional context
    const dealDoc = await db
      .select()
      .from(dealDocuments)
      .where(eq(dealDocuments.id, params.dealDocumentId))
      .then((rows) => rows[0]);

    if (!dealDoc) {
      throw new Error(`Deal document ${params.dealDocumentId} not found`);
    }

    // Build context data for the agent
    const contextData = {
      project: {
        id: project.id,
        name: project.projectName,
        borrowerName: project.borrowerName,
        loanAmount: project.loanAmount,
        propertyAddress: project.propertyAddress,
      },
      document: {
        fileName: params.metadata.fileName,
        declaredType: params.metadata.declaredDocType,
        borrowerName: params.metadata.borrowerName,
        textPreview: params.documentText.substring(0, 2000), // First 2000 chars
        textLength: params.documentText.length,
      },
    };

    // Call agent
    const result = await executeAgent({
      agentType: "document_intelligence",
      projectId: params.projectId,
      triggerType: "document_upload",
      contextData,
    });

    // Parse JSON response
    let extractedFields: Record<string, any> = {};
    let qualityAssessment: Record<string, any> = {};
    let anomalies: Record<string, any> = {};
    let confidenceScore = 0;
    let classificationMatch = false;
    let confirmedDocType: string | null = null;

    try {
      const parsed = JSON.parse(result.response);

      extractedFields = parsed.extractedFields || {};
      qualityAssessment = parsed.qualityAssessment || {};
      anomalies = parsed.anomalies || {};
      confidenceScore = parsed.confidenceScore || 0;
      classificationMatch = parsed.classificationMatch || false;
      confirmedDocType = parsed.confirmedDocType || null;
    } catch (parseError) {
      console.warn(
        "⚠️ Failed to parse agent response as JSON, storing as-is"
      );
      extractedFields = { rawResponse: result.response };
    }

    // Store in database
    const extraction = await db
      .insert(documentExtractions)
      .values({
        dealDocumentId: params.dealDocumentId,
        projectId: params.projectId,
        documentType: confirmedDocType || params.metadata.declaredDocType,
        extractedFields,
        qualityAssessment,
        anomalies,
        confidenceScore,
        classificationMatch,
        confirmedDocType,
        agentRunId: result.agentRunId,
      })
      .returning();

    const storedExtraction = extraction[0];

    console.log(
      `✅ Document extraction stored with confidence ${confidenceScore}`
    );

    return {
      ...storedExtraction,
      extractedFieldsJson: extractedFields,
    };
  } catch (error) {
    console.error(
      `❌ Document extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

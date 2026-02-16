/**
 * Processor Agent
 * Agent 2: Analyzes deals against credit policies and document requirements
 * Produces comprehensive findings and recommendations
 */

import { db } from "../db";
import {
  agentFindings,
  documentExtractions,
  creditPolicies,
  programDocumentTemplates,
  dealDocuments,
  agentCorrections,
  projects,
  loanPrograms,
  type AgentFinding,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { executeAgent } from "./agentRunner";

export interface AnalyzeDealsParams {
  projectId: number;
  triggeredBy?: number;
}

/**
 * Analyze a deal against credit policies and document requirements
 * Stores findings in agentFindings table
 */
export async function analyzeDeals(
  params: AnalyzeDealsParams
): Promise<AgentFinding> {
  try {
    console.log(
      `🔍 Analyzing deal for project ${params.projectId} against credit policies`
    );

    // Fetch project details
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .then((rows) => rows[0]);

    if (!project) {
      throw new Error(`Project ${params.projectId} not found`);
    }

    // Fetch all document extractions for this project
    const extractions = await db
      .select()
      .from(documentExtractions)
      .where(eq(documentExtractions.projectId, params.projectId));

    // Fetch program details and credit policies
    let creditPoliciesData = [];
    let programDocTemplates = [];

    if (project.programId) {
      creditPoliciesData = await db
        .select()
        .from(creditPolicies)
        .where(eq(creditPolicies.programId, project.programId));

      programDocTemplates = await db
        .select()
        .from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, project.programId));
    }

    // Fetch received documents
    const receivedDocs = await db
      .select()
      .from(dealDocuments)
      .where(eq(dealDocuments.dealId, params.projectId));

    // Fetch previous findings (latest)
    const previousFindings = await db
      .select()
      .from(agentFindings)
      .where(eq(agentFindings.projectId, params.projectId))
      .orderBy(desc(agentFindings.createdAt))
      .then((rows) => rows[0] || null);

    // Fetch tenant corrections for this project (processor type)
    const corrections = await db
      .select()
      .from(agentCorrections)
      .where(
        and(
          eq(agentCorrections.projectId, params.projectId),
          eq(agentCorrections.agentType, "processor")
        )
      );

    // Build context data
    const contextData = {
      project: {
        id: project.id,
        name: project.projectName,
        borrowerName: project.borrowerName,
        loanAmount: project.loanAmount,
        propertyAddress: project.propertyAddress,
        programId: project.programId,
        currentStage: project.currentStage,
      },
      documentExtractions: extractions.map((e) => ({
        id: e.id,
        dealDocumentId: e.dealDocumentId,
        documentType: e.documentType,
        extractedFields: e.extractedFields,
        anomalies: e.anomalies,
        confidenceScore: e.confidenceScore,
        classificationMatch: e.classificationMatch,
      })),
      creditPolicies: creditPoliciesData.map((p) => ({
        id: p.id,
        name: p.policyName,
        requirements: p.requirements,
      })),
      documentRequirements: programDocTemplates.map((t) => ({
        id: t.id,
        documentType: t.documentType,
        displayName: t.displayName,
        isRequired: t.isRequired,
        notes: t.notes,
      })),
      receivedDocuments: receivedDocs.map((d) => ({
        id: d.id,
        fileName: d.documentName,
        documentType: d.documentType,
        status: d.status,
        uploadedAt: d.uploadedAt,
      })),
      previousFindings: previousFindings
        ? {
            overallStatus: previousFindings.overallStatus,
            policyFindings: previousFindings.policyFindings,
            documentRequirementFindings:
              previousFindings.documentRequirementFindings,
          }
        : null,
      corrections: corrections.map((c) => ({
        originalOutput: c.originalOutput,
        correctedOutput: c.correctedOutput,
        correctionType: c.correctionType,
        context: c.context,
      })),
    };

    // Call agent
    const result = await executeAgent({
      agentType: "processor",
      projectId: params.projectId,
      triggeredBy: params.triggeredBy,
      triggerType: "manual",
      contextData,
    });

    // Parse JSON response
    let overallStatus = "incomplete_data";
    let policyFindings: Record<string, any> = {};
    let documentRequirementFindings: Record<string, any> = {};
    let crossDocumentConsistency: Record<string, any> = {};
    let missingDocuments: Record<string, any> = {};
    let dealHealthSummary: Record<string, any> = {};
    let recommendedNextActions: Record<string, any> = {};

    try {
      const parsed = JSON.parse(result.response);

      overallStatus = parsed.overallStatus || "incomplete_data";
      policyFindings = parsed.policyFindings || {};
      documentRequirementFindings = parsed.documentRequirementFindings || {};
      crossDocumentConsistency = parsed.crossDocumentConsistency || {};
      missingDocuments = parsed.missingDocuments || {};
      dealHealthSummary = parsed.dealHealthSummary || {};
      recommendedNextActions = parsed.recommendedNextActions || {};
    } catch (parseError) {
      console.warn(
        "⚠️ Failed to parse agent response as JSON, storing as-is"
      );
      dealHealthSummary = { rawResponse: result.response };
    }

    // Store findings in database
    const finding = await db
      .insert(agentFindings)
      .values({
        projectId: params.projectId,
        programId: project.programId,
        agentRunId: result.agentRunId,
        overallStatus,
        policyFindings,
        documentRequirementFindings,
        crossDocumentConsistency,
        missingDocuments,
        dealHealthSummary,
        recommendedNextActions,
      })
      .returning();

    const storedFinding = finding[0];

    console.log(`✅ Deal analysis completed with status: ${overallStatus}`);

    return storedFinding;
  } catch (error) {
    console.error(
      `❌ Deal analysis failed: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Communication Agent
 * Agent 3: Drafts borrower and broker communications based on findings
 * Creates professional messages requesting documents or conveying conditions
 */

import { db } from "../db";
import {
  agentCommunications,
  agentFindings,
  projects,
  agentCorrections,
  type AgentCommunication,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { executeAgent } from "./agentRunner";

export interface DraftCommunicationsParams {
  projectId: number;
  findingsId: number;
  triggeredBy?: number;
}

export interface DraftedCommunication extends AgentCommunication {
  parsedBody?: string;
}

/**
 * Draft communications based on findings
 * Stores drafted messages in agentCommunications table
 */
export async function draftCommunications(
  params: DraftCommunicationsParams
): Promise<AgentCommunication[]> {
  try {
    console.log(
      `✉️ Drafting communications for project ${params.projectId} based on findings`
    );

    // Fetch findings
    const findings = await db
      .select()
      .from(agentFindings)
      .where(eq(agentFindings.id, params.findingsId))
      .then((rows) => rows[0]);

    if (!findings) {
      throw new Error(`Findings ${params.findingsId} not found`);
    }

    // Fetch project details
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .then((rows) => rows[0]);

    if (!project) {
      throw new Error(`Project ${params.projectId} not found`);
    }

    // Fetch previous communications for context
    const previousCommunications = await db
      .select()
      .from(agentCommunications)
      .where(eq(agentCommunications.projectId, params.projectId))
      .orderBy(desc(agentCommunications.createdAt));

    // Fetch communication corrections for this project
    const corrections = await db
      .select()
      .from(agentCorrections)
      .where(
        and(
          eq(agentCorrections.projectId, params.projectId),
          eq(agentCorrections.agentType, "communication")
        )
      );

    // Build context data
    const contextData = {
      project: {
        id: project.id,
        name: project.projectName,
        borrowerName: project.borrowerName,
        borrowerEmail: project.borrowerEmail,
        brokerName: project.brokerName,
        brokerEmail: project.brokerEmail,
        loanAmount: project.loanAmount,
        propertyAddress: project.propertyAddress,
        currentStage: project.currentStage,
      },
      findings: {
        id: findings.id,
        overallStatus: findings.overallStatus,
        policyFindings: findings.policyFindings,
        documentRequirementFindings: findings.documentRequirementFindings,
        missingDocuments: findings.missingDocuments,
        recommendedNextActions: findings.recommendedNextActions,
      },
      communicationHistory: previousCommunications.map((c) => ({
        id: c.id,
        recipientType: c.recipientType,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt,
      })),
      corrections: corrections.map((c) => ({
        originalOutput: c.originalOutput,
        correctedOutput: c.correctedOutput,
        correctionType: c.correctionType,
      })),
    };

    // Call agent
    const result = await executeAgent({
      agentType: "communication",
      projectId: params.projectId,
      triggeredBy: params.triggeredBy,
      triggerType: "manual",
      contextData,
    });

    // Parse response which should be an array of drafted messages
    let messages: Array<{
      recipientType: string;
      recipientName?: string;
      recipientEmail?: string;
      subject: string;
      body: string;
      htmlBody?: string;
      priority: string;
    }> = [];

    try {
      const parsed = JSON.parse(result.response);
      messages = Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseError) {
      console.warn(
        "⚠️ Failed to parse agent response as JSON, wrapping as single message"
      );
      messages = [
        {
          recipientType: "borrower",
          subject: "Loan Application - Additional Information Needed",
          body: result.response,
          priority: "routine",
        },
      ];
    }

    // Store each drafted communication
    const draftedCommunications: AgentCommunication[] = [];

    for (const msg of messages) {
      const communication = await db
        .insert(agentCommunications)
        .values({
          projectId: params.projectId,
          agentRunId: result.agentRunId,
          recipientType: msg.recipientType as
            | "borrower"
            | "broker"
            | "internal",
          recipientName: msg.recipientName || null,
          recipientEmail: msg.recipientEmail || null,
          subject: msg.subject,
          body: msg.body,
          htmlBody: msg.htmlBody || null,
          priority: (msg.priority || "routine") as
            | "routine"
            | "urgent"
            | "high",
          status: "draft",
          findingIds: [params.findingsId],
        })
        .returning();

      if (communication.length > 0) {
        draftedCommunications.push(communication[0]);
      }
    }

    console.log(
      `✅ Drafted ${draftedCommunications.length} communications for project ${params.projectId}`
    );

    return draftedCommunications;
  } catch (error) {
    console.error(
      `❌ Communication drafting failed: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

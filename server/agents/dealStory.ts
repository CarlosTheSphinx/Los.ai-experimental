/**
 * Deal Story System
 * Compiles agent outputs into a living narrative of the deal
 * Creates a comprehensive, human-readable story updated by agents and humans
 */

import { db } from "../db";
import {
  dealStories,
  projects,
  documentExtractions,
  agentFindings,
  agentCommunications,
  projectStages,
  projectTasks,
  dealDocuments,
  type DealStory,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface UpdateDealStoryParams {
  projectId: number;
  updateSource: string; // 'document_extraction' | 'processor_findings' | 'communications' | 'manual'
  updateData?: any;
}

/**
 * Update the deal story narrative with latest information
 * Builds a structured, readable narrative from all agent data
 */
export async function updateDealStory(
  params: UpdateDealStoryParams
): Promise<DealStory> {
  try {
    console.log(
      `📖 Updating deal story for project ${params.projectId} from ${params.updateSource}`
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

    // Fetch document extractions
    const extractions = await db
      .select()
      .from(documentExtractions)
      .where(eq(documentExtractions.projectId, params.projectId))
      .orderBy(desc(documentExtractions.createdAt));

    // Fetch latest findings
    const findings = await db
      .select()
      .from(agentFindings)
      .where(eq(agentFindings.projectId, params.projectId))
      .orderBy(desc(agentFindings.createdAt))
      .then((rows) => rows[0] || null);

    // Fetch communications
    const communications = await db
      .select()
      .from(agentCommunications)
      .where(eq(agentCommunications.projectId, params.projectId))
      .orderBy(desc(agentCommunications.createdAt));

    // Fetch project stages for timeline
    const stages = await db
      .select()
      .from(projectStages)
      .where(eq(projectStages.projectId, params.projectId))
      .orderBy(projectStages.stageOrder);

    // Fetch open tasks
    const tasks = await db
      .select()
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, params.projectId),
          eq(projectTasks.status, "pending")
        )
      )
      .orderBy(projectTasks.dueDate);

    // Fetch received documents
    const receivedDocs = await db
      .select()
      .from(dealDocuments)
      .where(eq(dealDocuments.dealId, params.projectId));

    // Compile narrative
    const narrative = compileNarrative({
      project,
      extractions,
      findings,
      communications,
      stages,
      tasks,
      receivedDocs,
    });

    // Calculate metadata stats
    const metadata = {
      total_documents_received: receivedDocs.length,
      total_documents_extracted: extractions.length,
      policy_findings_count: findings
        ? Object.keys(findings.policyFindings || {}).length
        : 0,
      document_requirement_findings_count: findings
        ? Object.keys(findings.documentRequirementFindings || {}).length
        : 0,
      communications_drafted: communications.filter(
        (c) => c.status === "draft"
      ).length,
      communications_sent: communications.filter((c) => c.status === "sent")
        .length,
      open_tasks_count: tasks.length,
      overall_deal_health: findings?.overallStatus || "unknown",
      last_updated_source: params.updateSource,
      last_updated_at: new Date().toISOString(),
    };

    // Fetch or create deal story record
    const existingStory = await db
      .select()
      .from(dealStories)
      .where(eq(dealStories.projectId, params.projectId))
      .then((rows) => rows[0] || null);

    let storyRecord: DealStory;

    if (existingStory) {
      // Update existing
      const updated = await db
        .update(dealStories)
        .set({
          currentNarrative: narrative,
          lastUpdatedSection: params.updateSource,
          storyVersion: existingStory.storyVersion + 1,
          metadata,
          lastAgentUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dealStories.id, existingStory.id))
        .returning();

      storyRecord = updated[0];
    } else {
      // Create new
      const created = await db
        .insert(dealStories)
        .values({
          projectId: params.projectId,
          currentNarrative: narrative,
          lastUpdatedSection: params.updateSource,
          storyVersion: 1,
          metadata,
          lastAgentUpdate: new Date(),
        })
        .returning();

      storyRecord = created[0];
    }

    console.log(
      `✅ Deal story updated - version ${storyRecord.storyVersion}`
    );

    return storyRecord;
  } catch (error) {
    console.error(
      `❌ Deal story update failed: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Compile all deal information into a readable narrative
 */
function compileNarrative(data: {
  project: typeof projects.$inferSelect;
  extractions: Array<typeof documentExtractions.$inferSelect>;
  findings: typeof agentFindings.$inferSelect | null;
  communications: Array<typeof agentCommunications.$inferSelect>;
  stages: Array<typeof projectStages.$inferSelect>;
  tasks: Array<typeof projectTasks.$inferSelect>;
  receivedDocs: Array<typeof dealDocuments.$inferSelect>;
}): string {
  const sections: string[] = [];

  // Deal Overview
  sections.push("=== DEAL OVERVIEW ===\n");
  sections.push(`Borrower: ${data.project.borrowerName || "Unknown"}`);
  sections.push(
    `Property Address: ${data.project.propertyAddress || "Not provided"}`
  );
  sections.push(`Loan Amount: $${data.project.loanAmount?.toLocaleString()}`);
  if (data.project.programId) {
    sections.push(`Program ID: ${data.project.programId}`);
  }
  sections.push(`Current Stage: ${data.project.currentStage || "Initial Review"}`);
  sections.push(
    `Progress: ${data.project.progressPercentage || 0}% complete\n`
  );

  // Document Status
  sections.push("=== DOCUMENT STATUS ===\n");
  sections.push(`Total Documents Received: ${data.receivedDocs.length}`);

  const docsByStatus = data.receivedDocs.reduce(
    (acc, doc) => {
      acc[doc.status] = (acc[doc.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  for (const [status, count] of Object.entries(docsByStatus)) {
    sections.push(`  - ${status}: ${count}`);
  }

  if (data.extractions.length > 0) {
    sections.push(`\nDocument Extractions: ${data.extractions.length}`);
    for (const extraction of data.extractions.slice(0, 5)) {
      const confidence = (extraction.confidenceScore || 0 * 100).toFixed(0);
      sections.push(
        `  - ${extraction.documentType} (confidence: ${confidence}%)`
      );
    }
    if (data.extractions.length > 5) {
      sections.push(`  ... and ${data.extractions.length - 5} more`);
    }
  }
  sections.push("");

  // Findings Section
  sections.push("=== FINDINGS ===\n");
  if (data.findings) {
    sections.push(
      `Overall Status: ${data.findings.overallStatus || "Unknown"}\n`
    );

    if (data.findings.policyFindings) {
      const policyCount = Object.keys(data.findings.policyFindings).length;
      if (policyCount > 0) {
        sections.push(`Policy Findings: ${policyCount} items`);
        const findings = data.findings.policyFindings as Record<string, any>;
        for (const [key, value] of Object.entries(findings).slice(0, 3)) {
          sections.push(`  - ${key}: ${JSON.stringify(value).substring(0, 50)}`);
        }
        if (policyCount > 3) {
          sections.push(`  ... and ${policyCount - 3} more findings`);
        }
      }
    }

    if (data.findings.missingDocuments) {
      const missingCount = Object.keys(data.findings.missingDocuments).length;
      if (missingCount > 0) {
        sections.push(
          `\nMissing Documents: ${missingCount} items identified`
        );
      }
    }

    if (data.findings.recommendedNextActions) {
      const actions = data.findings.recommendedNextActions as Record<
        string,
        any
      >;
      if (Object.keys(actions).length > 0) {
        sections.push("\nRecommended Next Actions:");
        for (const [key, value] of Object.entries(actions).slice(0, 3)) {
          sections.push(`  - ${key}: ${JSON.stringify(value).substring(0, 50)}`);
        }
      }
    }
  } else {
    sections.push("No findings yet. Awaiting processor agent analysis.\n");
  }

  // Communications Section
  sections.push("\n=== COMMUNICATIONS ===\n");
  const draftedComms = data.communications.filter((c) => c.status === "draft");
  const sentComms = data.communications.filter((c) => c.status === "sent");

  sections.push(`Drafted Messages: ${draftedComms.length}`);
  for (const comm of draftedComms.slice(0, 3)) {
    sections.push(
      `  - To ${comm.recipientType}: "${comm.subject}" (${comm.priority})`
    );
  }
  if (draftedComms.length > 3) {
    sections.push(`  ... and ${draftedComms.length - 3} more drafted`);
  }

  sections.push(`\nSent Messages: ${sentComms.length}`);
  for (const comm of sentComms.slice(0, 3)) {
    sections.push(
      `  - To ${comm.recipientType}: "${comm.subject}" (sent ${comm.sentAt?.toLocaleDateString()})`
    );
  }

  // Timeline Section
  sections.push("\n=== TIMELINE ===\n");
  for (const stage of data.stages) {
    const statusIcon =
      stage.status === "completed"
        ? "✓"
        : stage.status === "in_progress"
          ? "→"
          : "○";
    sections.push(
      `${statusIcon} ${stage.stageName} (${stage.status})${stage.completedDate ? ` - completed ${stage.completedDate.toLocaleDateString()}` : ""}`
    );
  }

  // Next Steps Section
  sections.push("\n=== NEXT STEPS ===\n");
  if (data.tasks.length > 0) {
    sections.push(`Open Tasks: ${data.tasks.length}`);
    for (const task of data.tasks.slice(0, 5)) {
      const dueDate = task.dueDate
        ? task.dueDate.toLocaleDateString()
        : "No due date";
      sections.push(
        `  - ${task.taskTitle} (due: ${dueDate}, assigned to: ${task.assignedTo})`
      );
    }
    if (data.tasks.length > 5) {
      sections.push(`  ... and ${data.tasks.length - 5} more tasks`);
    }
  } else {
    sections.push("No open tasks");
  }

  if (data.findings?.recommendedNextActions) {
    const actions = data.findings.recommendedNextActions as Record<
      string,
      string
    >;
    const actionCount = Object.keys(actions).length;
    if (actionCount > 0) {
      sections.push(`\nRecommended by Processor Agent:`);
      for (const [, action] of Object.entries(actions).slice(0, 3)) {
        sections.push(`  - ${action}`);
      }
    }
  }

  return sections.join("\n");
}

/**
 * Pipeline Orchestrator
 * Chains AI agents: Document Intelligence → Processor → Communication
 * Each agent's output feeds as context into the next agent
 */

import { db } from "../db";
import {
  agentPipelineRuns,
  pipelineStepLogs,
  pipelineAgentSteps,
  documentExtractions,
  agentFindings,
  agentCommunications,
  dealStories,
  projects,
  dealDocuments,
  dealMemoryEntries,
  dealNotes,
  users,
  digestHistory,
  type AgentPipelineRun,
} from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { executeAgent, type AgentType } from "./agentRunner";
import { extractAllDealDocuments } from "./documentExtractor";

const DEFAULT_SEQUENCE: AgentType[] = [
  "document_intelligence",
  "processor",
  "communication",
];

/**
 * Load the pipeline sequence from the database (pipeline_agent_steps table).
 * Falls back to the hardcoded DEFAULT_SEQUENCE if no steps are configured.
 */
export async function getConfiguredPipelineSequence(): Promise<AgentType[]> {
  try {
    const steps = await db
      .select()
      .from(pipelineAgentSteps)
      .where(eq(pipelineAgentSteps.isEnabled, true))
      .orderBy(asc(pipelineAgentSteps.stepOrder));

    if (steps.length > 0) {
      return steps.map(s => s.agentType as AgentType);
    }
  } catch (error) {
    console.error("Failed to load pipeline steps from DB, using defaults:", error);
  }
  return DEFAULT_SEQUENCE;
}

/**
 * Start a new pipeline run for a deal
 */
export async function startPipeline(
  projectId: number,
  triggeredBy: number | null,
  triggerType: string = "manual",
  agentSequence?: AgentType[]
): Promise<AgentPipelineRun> {
  const sequence = agentSequence || await getConfiguredPipelineSequence();
  console.log(`Starting pipeline for project ${projectId} — sequence: ${sequence.join(" → ")}`);

  const [pipelineRun] = await db
    .insert(agentPipelineRuns)
    .values({
      projectId,
      status: "running",
      agentSequence: sequence as any,
      currentAgentIndex: 0,
      triggerType,
      triggeredBy,
    })
    .returning();

  for (let i = 0; i < sequence.length; i++) {
    await db.insert(pipelineStepLogs).values({
      pipelineRunId: pipelineRun.id,
      agentType: sequence[i],
      sequenceIndex: i,
      status: i === 0 ? "running" : "pending",
      executedAt: i === 0 ? new Date() : null,
    });
  }

  try {
    await executeNextAgent(pipelineRun.id, projectId, sequence, 0, triggeredBy);
  } catch (error) {
    console.error(`Pipeline failed at agent index 0:`, error);
    await markPipelineFailed(pipelineRun.id, error instanceof Error ? error.message : String(error));
  }

  const [updated] = await db
    .select()
    .from(agentPipelineRuns)
    .where(eq(agentPipelineRuns.id, pipelineRun.id));

  return updated;
}

/**
 * Execute the next agent in the pipeline sequence
 */
async function executeNextAgent(
  pipelineRunId: number,
  projectId: number,
  agentSequence: AgentType[],
  agentIndex: number,
  triggeredBy: number | null
): Promise<void> {
  if (agentIndex >= agentSequence.length) {
    // Pipeline complete
    await markPipelineCompleted(pipelineRunId);
    await compileDealStory(projectId);
    return;
  }

  const agentType = agentSequence[agentIndex];
  console.log(`🔄 Pipeline step ${agentIndex + 1}/${agentSequence.length}: ${agentType}`);

  // Update pipeline current index
  await db
    .update(agentPipelineRuns)
    .set({ currentAgentIndex: agentIndex })
    .where(eq(agentPipelineRuns.id, pipelineRunId));

  // Build context from previous agents' outputs
  const contextData = await compileContextForAgent(projectId, agentType, agentIndex);

  // Get the project info for context
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Merge project info into context
  const fullContext = {
    ...contextData,
    deal_name: project.name || `Deal #${project.id}`,
    borrower_name: (project as any).borrowerName || "Unknown",
    property_address: (project as any).propertyAddress || "N/A",
    loan_type: project.loanType || "N/A",
  };

  try {
    // Execute the agent
    const result = await executeAgent({
      agentType,
      projectId,
      triggeredBy: triggeredBy || undefined,
      triggerType: "pipeline",
      contextData: fullContext,
    });

    // Parse agent response and store structured output
    let outputSummary: any = {};
    try {
      let responseText = result.response;
      // Strip markdown code fences if present (```json ... ```)
      const codeFenceMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeFenceMatch) {
        responseText = codeFenceMatch[1].trim();
      }
      outputSummary = JSON.parse(responseText);
    } catch {
      outputSummary = { raw_response: result.response };
    }

    // Store the output based on agent type
    await storeAgentOutput(agentType, projectId, result.agentRunId, outputSummary);

    // Update step log
    await db
      .update(pipelineStepLogs)
      .set({
        agentRunId: result.agentRunId,
        status: "completed",
        outputSummary,
        inputContext: fullContext,
        durationMs: result.durationMs,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(pipelineStepLogs.pipelineRunId, pipelineRunId),
          eq(pipelineStepLogs.sequenceIndex, agentIndex)
        )
      );

    // Update deal story after each agent step
    await compileDealStory(projectId);

    // Mark next step as running
    if (agentIndex + 1 < agentSequence.length) {
      await db
        .update(pipelineStepLogs)
        .set({ status: "running", executedAt: new Date() })
        .where(
          and(
            eq(pipelineStepLogs.pipelineRunId, pipelineRunId),
            eq(pipelineStepLogs.sequenceIndex, agentIndex + 1)
          )
        );
    }

    // Continue to next agent
    await executeNextAgent(pipelineRunId, projectId, agentSequence, agentIndex + 1, triggeredBy);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Update step log with failure
    await db
      .update(pipelineStepLogs)
      .set({
        status: "failed",
        errorMessage: errorMsg,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(pipelineStepLogs.pipelineRunId, pipelineRunId),
          eq(pipelineStepLogs.sequenceIndex, agentIndex)
        )
      );

    throw error;
  }
}

/**
 * Build context for the current agent from previous agents' outputs
 */
async function compileContextForAgent(
  projectId: number,
  agentType: AgentType,
  agentIndex: number
): Promise<Record<string, any>> {
  const context: Record<string, any> = {};

  if (agentType === "document_intelligence" || agentIndex === 0) {
    try {
      const docContents = await extractAllDealDocuments(projectId);
      const uploadedDocs = docContents.filter(d => d.textLength > 0);
      const pendingDocs = docContents.filter(d => d.textLength === 0 && !d.error);
      const failedDocs = docContents.filter(d => !!d.error);

      context.total_documents = docContents.length;
      context.uploaded_documents_count = uploadedDocs.length;
      context.pending_documents_count = pendingDocs.length;

      context.documents = uploadedDocs.map(d => ({
        deal_document_id: d.dealDocumentId,
        document_name: d.documentName,
        category: d.documentCategory,
        page_count: d.pageCount,
        text_length: d.textLength,
        text_truncated: d.textLength > 8000,
        text_content: d.textContent,
      }));

      context.pending_documents = pendingDocs.map(d => ({
        deal_document_id: d.dealDocumentId,
        document_name: d.documentName,
        category: d.documentCategory,
        status: d.status,
      }));

      if (failedDocs.length > 0) {
        context.extraction_errors = failedDocs.map(d => ({
          document_name: d.documentName,
          error: d.error,
        }));
      }

      console.log(`📄 Document Intelligence context: ${uploadedDocs.length} docs with text, ${pendingDocs.length} pending`);
    } catch (error) {
      console.error("Failed to extract deal documents:", error);
      context.documents = [];
      context.extraction_error = error instanceof Error ? error.message : String(error);
    }
    return context;
  }

  if (agentType === "processor" || agentIndex === 1) {
    // Processor gets document extraction results
    const extractions = await db
      .select()
      .from(documentExtractions)
      .where(eq(documentExtractions.projectId, projectId))
      .orderBy(desc(documentExtractions.createdAt));

    context.document_summaries = extractions
      .map(
        (e) =>
          `Document: ${e.documentType || "Unknown"}\nExtracted Fields: ${JSON.stringify(e.extractedFields || {})}\nQuality: ${JSON.stringify(e.qualityAssessment || {})}\nAnomalies: ${JSON.stringify(e.anomalies || [])}\nConfidence: ${e.confidenceScore}%`
      )
      .join("\n\n---\n\n");

    context.total_documents = extractions.length;
    return context;
  }

  if (agentType === "communication" || agentIndex === 2) {
    const findings = await db
      .select()
      .from(agentFindings)
      .where(eq(agentFindings.projectId, projectId))
      .orderBy(desc(agentFindings.createdAt));

    context.findings_summary = findings
      .map(
        (f) => {
          const healthSummary = f.dealHealthSummary
            ? (typeof f.dealHealthSummary === 'object'
                ? (f.dealHealthSummary as any).summary || JSON.stringify(f.dealHealthSummary)
                : String(f.dealHealthSummary))
            : "";
          return `Status: ${f.overallStatus || "pending"}\nHealth: ${healthSummary}\nMissing Documents: ${JSON.stringify(f.missingDocuments || [])}\nRecommended Actions: ${JSON.stringify(f.recommendedNextActions || [])}`;
        }
      )
      .join("\n\n");

    const allDocs = await db
      .select()
      .from(dealDocuments)
      .where(eq(dealDocuments.dealId, projectId));

    const received = allDocs.filter(d => d.status === 'uploaded' || d.status === 'approved' || d.status === 'ai_reviewed');
    const outstanding = allDocs.filter(d => d.status === 'pending');
    const rejected = allDocs.filter(d => d.status === 'rejected');

    context.document_status_report = {
      total: allDocs.length,
      received: received.map(d => ({ name: d.documentName, category: d.documentCategory, status: d.status })),
      outstanding: outstanding.map(d => ({ name: d.documentName, category: d.documentCategory, required: d.isRequired })),
      rejected: rejected.map(d => ({ name: d.documentName, category: d.documentCategory, notes: d.notes })),
    };

    const project = await db
      .select({
        borrowerPortalToken: projects.borrowerPortalToken,
        brokerPortalToken: projects.brokerPortalToken,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .then(rows => rows[0]);

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.BASE_URL || 'https://app.sphinxcap.com');

    if (project?.borrowerPortalToken) {
      context.borrower_portal_url = `${baseUrl}/portal/${project.borrowerPortalToken}`;
    }
    if (project?.brokerPortalToken) {
      context.broker_portal_url = `${baseUrl}/portal/broker/${project.brokerPortalToken}`;
    }

    // Inject deal memory - past events and communications for AI context
    const memoryEntries = await db
      .select()
      .from(dealMemoryEntries)
      .where(eq(dealMemoryEntries.dealId, projectId))
      .orderBy(desc(dealMemoryEntries.createdAt))
      .limit(50);

    if (memoryEntries.length > 0) {
      context.deal_memory = memoryEntries.map(e => 
        `[${new Date(e.createdAt!).toLocaleDateString()}] ${e.entryType}: ${e.title}${e.description ? ` - ${e.description}` : ''}`
      ).join('\n');
    }

    // Inject admin notes - especially AI instructions
    const adminNotes = await db
      .select({
        id: dealNotes.id,
        content: dealNotes.content,
        noteType: dealNotes.noteType,
        createdAt: dealNotes.createdAt,
        userName: users.fullName,
      })
      .from(dealNotes)
      .leftJoin(users, eq(dealNotes.userId, users.id))
      .where(eq(dealNotes.dealId, projectId))
      .orderBy(desc(dealNotes.createdAt))
      .limit(30);

    if (adminNotes.length > 0) {
      const aiInstructions = adminNotes.filter(n => n.noteType === 'ai_instruction');
      const regularNotes = adminNotes.filter(n => n.noteType !== 'ai_instruction');
      
      if (aiInstructions.length > 0) {
        context.ai_instructions = aiInstructions.map(n =>
          `[${new Date(n.createdAt!).toLocaleDateString()}] ${n.userName || 'Admin'}: ${n.content}`
        ).join('\n');
      }
      if (regularNotes.length > 0) {
        context.admin_notes = regularNotes.map(n =>
          `[${new Date(n.createdAt!).toLocaleDateString()}] ${n.userName || 'Admin'}: ${n.content}`
        ).join('\n');
      }
    }

    // Inject past agent communications to avoid repeating messages
    const pastComms = await db
      .select()
      .from(agentCommunications)
      .where(eq(agentCommunications.projectId, projectId))
      .orderBy(desc(agentCommunications.createdAt))
      .limit(5);

    if (pastComms.length > 0) {
      context.past_agent_messages = pastComms.map(c =>
        `[${new Date(c.createdAt!).toLocaleDateString()}] To: ${c.recipientType} | Subject: ${c.subject}\nStatus: ${c.status}\nBody preview: ${(c.body || '').substring(0, 200)}...`
      ).join('\n\n---\n\n');
    }

    // Inject past digest history to avoid repeating communications
    const pastDigests = await db
      .select()
      .from(digestHistory)
      .where(eq(digestHistory.projectId, projectId))
      .orderBy(desc(digestHistory.sentAt))
      .limit(5);

    if (pastDigests.length > 0) {
      context.past_communications = pastDigests.map(d =>
        `[${new Date(d.sentAt!).toLocaleDateString()}] Sent to: ${d.recipientAddress} via ${d.deliveryMethod} (${d.documentsCount} docs, ${d.updatesCount} updates) Status: ${d.status}`
      ).join('\n');
    }

    context.communication_type = "status_update";
    context.recipient_name = "Borrower";
    context.recipient_type = "borrower";
    return context;
  }

  return context;
}

/**
 * Store agent output in the appropriate table based on agent type
 */
async function storeAgentOutput(
  agentType: AgentType,
  projectId: number,
  agentRunId: number,
  output: any
): Promise<void> {
  try {
    if (agentType === "document_intelligence") {
      const docResults = output.documents || [output];
      const docs = Array.isArray(docResults) ? docResults : [docResults];

      for (const doc of docs) {
        await db.insert(documentExtractions).values({
          projectId,
          agentRunId,
          dealDocumentId: doc.deal_document_id || null,
          documentType: doc.confirmed_doc_type || doc.document_type || "auto_detected",
          extractedFields: doc.extracted_fields || {},
          qualityAssessment: doc.quality_assessment || null,
          anomalies: doc.anomalies || null,
          confidenceScore: doc.confidence_score || 0,
          classificationMatch: doc.classification_match ?? true,
          confirmedDocType: doc.confirmed_doc_type || null,
        });
      }

      // Mark successfully extracted documents as 'ai_reviewed'
      for (const doc of docs) {
        if (doc.deal_document_id) {
          await db.update(dealDocuments)
            .set({ status: 'ai_reviewed' })
            .where(
              and(
                eq(dealDocuments.id, doc.deal_document_id),
                eq(dealDocuments.status, 'uploaded')
              )
            );
        }
      }
    } else if (agentType === "processor") {
      const docRules = output.documentRules || output.document_rules || null;
      const docReqFindings = output.documentRequirementFindings || output.document_requirement_findings || null;
      await db.insert(agentFindings).values({
        projectId,
        agentRunId,
        overallStatus: output.overallStatus || output.overall_status || "incomplete_data",
        policyFindings: output.policyFindings || output.policy_findings || null,
        documentRequirementFindings: docRules || docReqFindings || null,
        crossDocumentConsistency: output.crossDocumentConsistency || output.cross_document_consistency || null,
        missingDocuments: output.missingDocuments || output.missing_documents || null,
        dealHealthSummary: output.dealHealthSummary || output.deal_health_summary || null,
        recommendedNextActions: output.recommendedNextActions || output.recommended_next_actions || null,
      });
    } else if (agentType === "communication") {
      await db.insert(agentCommunications).values({
        projectId,
        agentRunId,
        recipientType: output.recipient_type || "borrower",
        subject: output.subject || "Deal Update",
        body: typeof output.body === 'string' ? output.body : JSON.stringify(output.body || output),
        status: "draft",
      });
    }
  } catch (error) {
    console.error(`⚠️ Failed to store ${agentType} output:`, error);
    // Don't throw — output storage failure shouldn't kill the pipeline
  }
}

/**
 * Compile or update the Deal Story from all agent outputs
 */
async function compileDealStory(projectId: number): Promise<void> {
  try {
    const extractions = await db
      .select()
      .from(documentExtractions)
      .where(eq(documentExtractions.projectId, projectId));

    const findings = await db
      .select()
      .from(agentFindings)
      .where(eq(agentFindings.projectId, projectId));

    const communications = await db
      .select()
      .from(agentCommunications)
      .where(eq(agentCommunications.projectId, projectId));

    // Build narrative sections
    const sections: string[] = [];

    if (extractions.length > 0) {
      sections.push(
        `## Documents Analyzed\n${extractions.length} document(s) processed. ` +
          extractions
            .map((e) => `- ${e.documentType}: Confidence ${e.confidenceScore}%`)
            .join("\n")
      );
    }

    if (findings.length > 0) {
      const latestFinding = findings[findings.length - 1];
      const status = latestFinding.overallStatus || "pending_review";
      const healthSummary = latestFinding.dealHealthSummary
        ? (typeof latestFinding.dealHealthSummary === 'object'
            ? (latestFinding.dealHealthSummary as any).summary || JSON.stringify(latestFinding.dealHealthSummary)
            : String(latestFinding.dealHealthSummary))
        : "No health summary available.";
      sections.push(
        `## Processor Findings\nOverall Status: **${status}**\n${healthSummary}`
      );
    }

    if (communications.length > 0) {
      sections.push(
        `## Drafted Communications\n${communications.length} draft(s) pending review.`
      );
    }

    const narrative =
      sections.length > 0
        ? sections.join("\n\n")
        : "No AI analysis has been run on this deal yet.";

    // Upsert deal story
    const [existing] = await db
      .select()
      .from(dealStories)
      .where(eq(dealStories.projectId, projectId));

    if (existing) {
      await db
        .update(dealStories)
        .set({
          currentNarrative: narrative,
          lastAgentUpdate: new Date(),
          storyVersion: existing.storyVersion + 1,
          metadata: {
            total_extractions: extractions.length,
            total_findings: findings.length,
            total_communications: communications.length,
          },
          updatedAt: new Date(),
        })
        .where(eq(dealStories.projectId, projectId));
    } else {
      await db.insert(dealStories).values({
        projectId,
        currentNarrative: narrative,
        lastAgentUpdate: new Date(),
        metadata: {
          total_extractions: extractions.length,
          total_findings: findings.length,
          total_communications: communications.length,
        },
      });
    }

    console.log(`📖 Deal story updated for project ${projectId}`);
  } catch (error) {
    console.error(`⚠️ Failed to compile deal story:`, error);
  }
}

/**
 * Mark pipeline as completed
 */
async function markPipelineCompleted(pipelineRunId: number): Promise<void> {
  const [run] = await db
    .select()
    .from(agentPipelineRuns)
    .where(eq(agentPipelineRuns.id, pipelineRunId));

  const totalDurationMs = run?.startedAt
    ? Date.now() - new Date(run.startedAt).getTime()
    : 0;

  await db
    .update(agentPipelineRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      totalDurationMs,
    })
    .where(eq(agentPipelineRuns.id, pipelineRunId));

  console.log(`✅ Pipeline ${pipelineRunId} completed in ${totalDurationMs}ms`);
}

/**
 * Mark pipeline as failed
 */
async function markPipelineFailed(
  pipelineRunId: number,
  errorMessage: string
): Promise<void> {
  await db
    .update(agentPipelineRuns)
    .set({
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    })
    .where(eq(agentPipelineRuns.id, pipelineRunId));

  console.log(`❌ Pipeline ${pipelineRunId} failed: ${errorMessage}`);
}

/**
 * Get pipeline status for a project
 */
export async function getPipelineStatus(projectId: number) {
  const latestRun = await db
    .select()
    .from(agentPipelineRuns)
    .where(eq(agentPipelineRuns.projectId, projectId))
    .orderBy(desc(agentPipelineRuns.startedAt))
    .limit(1)
    .then((rows) => rows[0]);

  if (!latestRun) {
    return { hasRun: false, latestRun: null, steps: [] };
  }

  const steps = await db
    .select()
    .from(pipelineStepLogs)
    .where(eq(pipelineStepLogs.pipelineRunId, latestRun.id))
    .orderBy(pipelineStepLogs.sequenceIndex);

  return { hasRun: true, latestRun, steps };
}

/**
 * Get all pipeline runs for a project
 */
export async function getPipelineHistory(projectId: number, limit = 10) {
  const runs = await db
    .select()
    .from(agentPipelineRuns)
    .where(eq(agentPipelineRuns.projectId, projectId))
    .orderBy(desc(agentPipelineRuns.startedAt))
    .limit(limit);

  return runs;
}

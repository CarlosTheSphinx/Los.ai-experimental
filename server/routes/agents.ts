/**
 * Agent Routes
 * Endpoints for AI agent configuration, execution, audit logging, and deal-specific data management
 */

import type { Express, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { eq, desc, and, or } from 'drizzle-orm';
import {
  agentConfigurations,
  agentRuns,
  agentPipelineRuns,
  pipelineStepLogs,
  pipelineAgentSteps,
  documentExtractions,
  agentFindings,
  agentCommunications,
  agentCorrections,
  dealStories,
  platformSettings,
  projects,
  users,
  loanDigestConfigs,
  loanDigestRecipients,
  scheduledDigestDrafts,
  dealMemoryEntries,
  systemSettings,
  lenderAgentCustomizations
} from '@shared/schema';
import { asc, gte, lte, sql } from 'drizzle-orm';
import { startPipeline, getPipelineStatus, getPipelineHistory } from '../agents/orchestrator';
import { getSettings as getEmailDocCheckSettings, updateSettings as updateEmailDocCheckSettings, runEmailDocCheck, restartEmailDocCheckPolling } from '../services/emailDocCheck';

// ==================== DEFAULT AGENT PROMPTS ====================

const DEFAULT_AGENT_PROMPTS = {
  DOCUMENT_EXTRACTION: `You are a document extraction specialist. Analyze the uploaded document and extract structured data.

Document type: {{declared_doc_type}}
Borrower: {{borrower_name}}
Property: {{property_address}}
Document text:
{{extracted_text}}

Extract and return a JSON object with the following fields:
- confirmed_doc_type: Confirmed type of the document
- extracted_fields: Object with key-value pairs of extracted data
- quality_assessment: Assessment of document quality and clarity
- anomalies: List of any unusual or missing data
- confidence_score: Confidence level (0-100) of the extraction
- recommendations: Any recommendations for follow-up`,

  DEAL_PROCESSOR: `You are a commercial real estate deal analyzer. Analyze all documents and data for this deal and produce comprehensive findings.

Deal: {{deal_name}}
Borrower: {{borrower_name}}
Property: {{property_address}}
Loan Type: {{loan_type}}

Provided documents:
{{document_summaries}}

Analyze and return a JSON object with:
- deal_summary: Brief overview of the deal structure
- key_findings: Array of critical findings
- risk_assessment: Overall risk level and specific risks
- financial_metrics: Key financial metrics extracted
- document_completeness: Assessment of required documents
- missing_items: What information is still needed
- recommendations: Next steps and recommendations`,

  COMMUNICATION_DRAFT: `You are an expert at drafting professional communications for commercial real estate transactions.

Deal: {{deal_name}}
Borrower: {{borrower_name}}
Findings Summary: {{findings_summary}}
Communication Type: {{communication_type}}
Recipient: {{recipient_name}}

Draft a professional {{communication_type}} message that:
- Addresses the recipient appropriately for {{recipient_type}}
- References specific findings and issues
- Provides clear action items or next steps
- Maintains a professional but approachable tone
- Is concise and actionable

Return a JSON object with:
- subject: Email subject line (if applicable)
- body: Full message body
- tone: Tone classification (informational, urgent, collaborative, etc.)
- call_to_action: What action is requested
- estimated_response_time: Expected timeframe for response`,

  EMAIL_DOC_CLASSIFIER: `You are a lending document classifier. Analyze email attachments and identify the document type.

Context:
- Sender: {{sender_name}} ({{sender_email}})
- Email Subject: {{email_subject}}
- Deal: {{deal_name}} — Borrower: {{borrower_name}}

Attachment:
- Filename: {{filename}}
- MIME Type: {{mime_type}}

Document Preview:
{{document_preview}}

Classify into one of these lending document types:
pay_stub, w2, tax_return, bank_statement, appraisal, title_commitment,
insurance_certificate, purchase_agreement, closing_disclosure, loan_estimate,
credit_report, employment_verification, id_document, property_photo, other

Return JSON (no markdown, raw JSON only):
{
  "document_type": "one of the types above",
  "document_type_label": "Human readable label",
  "confidence": 0-100,
  "suggested_action": "review|approve|archive|request_modification",
  "reasoning": "brief explanation of why you classified it this way"
}`
};

/**
 * Auto-seed default agent configurations on server startup.
 * Only inserts configs that don't already exist — safe to call on every boot.
 */
export async function seedDefaultAgentConfigs(db: RouteDeps['db']): Promise<void> {
  const defaultConfigs = [
    {
      agentType: 'document_intelligence',
      name: 'Document Intelligence Agent',
      systemPrompt: DEFAULT_AGENT_PROMPTS.DOCUMENT_EXTRACTION,
      toolDefinitions: ['document_extraction', 'text_analysis'],
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      maxTokens: 2048,
      temperature: 0.3
    },
    {
      agentType: 'processor',
      name: 'Deal Processor Agent',
      systemPrompt: DEFAULT_AGENT_PROMPTS.DEAL_PROCESSOR,
      toolDefinitions: ['document_analysis', 'data_extraction', 'risk_assessment'],
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      maxTokens: 4096,
      temperature: 0.5
    },
    {
      agentType: 'communication',
      name: 'Communication Draft Agent',
      systemPrompt: DEFAULT_AGENT_PROMPTS.COMMUNICATION_DRAFT,
      toolDefinitions: ['communication_generation', 'tone_adjustment'],
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      maxTokens: 2048,
      temperature: 0.7
    },
    {
      agentType: 'email_doc_classifier',
      name: 'Email Document Classifier',
      systemPrompt: DEFAULT_AGENT_PROMPTS.EMAIL_DOC_CLASSIFIER,
      toolDefinitions: ['document_classification'],
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      maxTokens: 1024,
      temperature: 0.2
    }
  ];

  let created = 0;
  for (const config of defaultConfigs) {
    const existing = await db
      .select()
      .from(agentConfigurations)
      .where(eq(agentConfigurations.agentType, config.agentType));

    if (existing.length === 0) {
      await db.insert(agentConfigurations).values({
        ...config,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      created++;
    }
  }

  if (created > 0) {
    console.log(`🤖 Auto-seeded ${created} default agent configuration(s)`);
  } else {
    console.log(`🤖 Agent configurations already present (${defaultConfigs.length} found)`);
  }
}

/**
 * Register agent routes
 */
export function registerAgentRoutes(app: Express, deps: RouteDeps): void {
  const { storage, db, authenticateUser, requireAdmin } = deps;

  // ==================== AGENT CONFIGURATION CRUD ====================

  /**
   * GET /api/admin/agents/configurations
   * List all agent configurations
   */
  app.get(
    '/api/admin/agents/configurations',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const configs = await db
          .select()
          .from(agentConfigurations)
          .orderBy(desc(agentConfigurations.createdAt));

        res.json(configs);
      } catch (error) {
        console.error('Error fetching agent configurations:', error);
        res.status(500).json({ error: 'Failed to fetch agent configurations' });
      }
    }
  );

  /**
   * GET /api/admin/agents/configurations/:id
   * Get a single agent configuration
   */
  app.get(
    '/api/admin/agents/configurations/:id',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const configId = parseInt(req.params.id);

        const [config] = await db
          .select()
          .from(agentConfigurations)
          .where(eq(agentConfigurations.id, configId));

        if (!config) {
          return res.status(404).json({ error: 'Agent configuration not found' });
        }

        res.json(config);
      } catch (error) {
        console.error('Error fetching agent configuration:', error);
        res.status(500).json({ error: 'Failed to fetch agent configuration' });
      }
    }
  );

  /**
   * POST /api/admin/agents/configurations
   * Create a new agent configuration
   */
  app.post(
    '/api/admin/agents/configurations',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agentType, name, systemPrompt, toolDefinitions, modelProvider, modelName, maxTokens, temperature } = req.body;

        if (!agentType || !name) {
          return res.status(400).json({ error: 'agentType and name are required' });
        }

        const [config] = await db
          .insert(agentConfigurations)
          .values({
            agentType,
            name,
            systemPrompt: systemPrompt || '',
            toolDefinitions: toolDefinitions || null,
            modelProvider: modelProvider || 'openai',
            modelName: modelName || 'gpt-4o',
            maxTokens: maxTokens || 4096,
            temperature: temperature || 0.7,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: req.user?.id
          })
          .returning();

        res.status(201).json(config);
      } catch (error) {
        console.error('Error creating agent configuration:', error);
        res.status(500).json({ error: 'Failed to create agent configuration' });
      }
    }
  );

  /**
   * PUT /api/admin/agents/configurations/:id
   * Update an agent configuration
   */
  app.put(
    '/api/admin/agents/configurations/:id',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const configId = parseInt(req.params.id);
        const { name, systemPrompt, toolDefinitions, modelProvider, modelName, maxTokens, temperature, isActive } = req.body;

        const [config] = await db
          .update(agentConfigurations)
          .set({
            ...(name && { name }),
            ...(systemPrompt !== undefined && { systemPrompt }),
            ...(toolDefinitions !== undefined && { toolDefinitions }),
            ...(modelProvider && { modelProvider }),
            ...(modelName && { modelName }),
            ...(maxTokens !== undefined && { maxTokens }),
            ...(temperature !== undefined && { temperature }),
            ...(isActive !== undefined && { isActive }),
            updatedAt: new Date()
          })
          .where(eq(agentConfigurations.id, configId))
          .returning();

        if (!config) {
          return res.status(404).json({ error: 'Agent configuration not found' });
        }

        res.json(config);
      } catch (error) {
        console.error('Error updating agent configuration:', error);
        res.status(500).json({ error: 'Failed to update agent configuration' });
      }
    }
  );

  /**
   * DELETE /api/admin/agents/configurations/:id
   * Deactivate an agent configuration
   */
  app.delete(
    '/api/admin/agents/configurations/:id',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const configId = parseInt(req.params.id);

        const [config] = await db
          .update(agentConfigurations)
          .set({
            isActive: false,
            updatedAt: new Date()
          })
          .where(eq(agentConfigurations.id, configId))
          .returning();

        if (!config) {
          return res.status(404).json({ error: 'Agent configuration not found' });
        }

        res.json({ success: true, message: 'Agent configuration deactivated' });
      } catch (error) {
        console.error('Error deleting agent configuration:', error);
        res.status(500).json({ error: 'Failed to deactivate agent configuration' });
      }
    }
  );

  // ==================== AGENT EXECUTION ====================

  /**
   * POST /api/admin/agents/run
   * Manually trigger an agent
   */
  app.post(
    '/api/admin/agents/run',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agentType, projectId } = req.body;

        if (!agentType || !projectId) {
          return res.status(400).json({ error: 'agentType and projectId are required' });
        }

        // Verify project exists
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, parseInt(projectId)));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // Get agent configuration
        const [config] = await db
          .select()
          .from(agentConfigurations)
          .where(and(
            eq(agentConfigurations.agentType, agentType),
            eq(agentConfigurations.isActive, true)
          ));

        if (!config) {
          return res.status(404).json({ error: 'No active agent configuration found for this agent type' });
        }

        const [run] = await db
          .insert(agentRuns)
          .values({
            agentType,
            configurationId: config.id,
            projectId: parseInt(projectId),
            status: 'running',
            triggerType: 'manual',
            triggeredBy: req.user?.id
          })
          .returning();

        // TODO: Execute agent asynchronously
        // In production, this would trigger the actual agent execution
        // For now, return the run record

        res.status(202).json({
          success: true,
          runId: run.id,
          status: 'queued',
          message: 'Agent execution initiated'
        });
      } catch (error) {
        console.error('Error triggering agent:', error);
        res.status(500).json({ error: 'Failed to trigger agent' });
      }
    }
  );

  /**
   * POST /api/admin/agents/test
   * Test an agent with sample data (does not save results)
   */
  app.post(
    '/api/admin/agents/test',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agentType, testPrompt, testContext } = req.body;

        if (!agentType || !testPrompt) {
          return res.status(400).json({ error: 'agentType and testPrompt are required' });
        }

        // Get agent configuration
        const [config] = await db
          .select()
          .from(agentConfigurations)
          .where(and(
            eq(agentConfigurations.agentType, agentType),
            eq(agentConfigurations.isActive, true)
          ));

        if (!config) {
          return res.status(404).json({ error: 'No active agent configuration found for this agent type' });
        }

        // TODO: Execute agent test
        // In production, this would call the agent with test data
        // and return the response without saving it

        res.json({
          success: true,
          message: 'Agent test executed',
          response: {
            // Placeholder response
            result: 'Test completed successfully',
            executionTime: '1.2s'
          }
        });
      } catch (error) {
        console.error('Error testing agent:', error);
        res.status(500).json({ error: 'Failed to test agent' });
      }
    }
  );

  // ==================== AGENT RUNS (AUDIT LOG) ====================

  /**
   * GET /api/admin/agents/runs
   * List recent agent runs with pagination and filtering
   */
  app.get(
    '/api/admin/agents/runs',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agentType, limit = '50', offset = '0' } = req.query;
        const pageLimit = parseInt(limit as string) || 50;
        const pageOffset = parseInt(offset as string) || 0;

        const whereClause = agentType
          ? eq(agentRuns.agentType, agentType as string)
          : undefined;

        const runs = whereClause
          ? await db.select().from(agentRuns).where(whereClause).orderBy(desc(agentRuns.startedAt)).limit(pageLimit).offset(pageOffset)
          : await db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)).limit(pageLimit).offset(pageOffset);

        const countResult = whereClause
          ? await db.select({ count: sql<number>`count(*)` }).from(agentRuns).where(whereClause)
          : await db.select({ count: sql<number>`count(*)` }).from(agentRuns);

        const serializedRuns = runs.map(r => ({
          ...r,
          startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt || null,
          completedAt: (r as any).completedAt instanceof Date ? (r as any).completedAt.toISOString() : (r as any).completedAt || null,
        }));

        res.json({
          runs: serializedRuns,
          pagination: {
            total: countResult[0]?.count || 0,
            limit: pageLimit,
            offset: pageOffset
          }
        });
      } catch (error) {
        console.error('Error fetching agent runs:', error);
        res.status(500).json({ error: 'Failed to fetch agent runs' });
      }
    }
  );

  /**
   * GET /api/admin/agents/runs/:id
   * Get details of a single agent run
   */
  app.get(
    '/api/admin/agents/runs/:id',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const runId = parseInt(req.params.id);

        const [run] = await db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.id, runId));

        if (!run) {
          return res.status(404).json({ error: 'Agent run not found' });
        }

        res.json(run);
      } catch (error) {
        console.error('Error fetching agent run:', error);
        res.status(500).json({ error: 'Failed to fetch agent run' });
      }
    }
  );

  // ==================== DEAL-SPECIFIC AGENT DATA ====================

  /**
   * GET /api/projects/:id/extractions
   * Get document extractions for a deal
   */
  app.get(
    '/api/projects/:id/extractions',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const extractions = await db
          .select()
          .from(documentExtractions)
          .where(eq(documentExtractions.projectId, projectId))
          .orderBy(desc(documentExtractions.createdAt));

        res.json(extractions);
      } catch (error) {
        console.error('Error fetching document extractions:', error);
        res.status(500).json({ error: 'Failed to fetch document extractions' });
      }
    }
  );

  /**
   * GET /api/projects/:id/pipeline-runs
   * Get pipeline runs with step logs (input/output) for debugging agent prompts
   */
  app.get(
    '/api/projects/:id/pipeline-runs',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const runs = await db
          .select()
          .from(agentPipelineRuns)
          .where(eq(agentPipelineRuns.projectId, projectId))
          .orderBy(desc(agentPipelineRuns.startedAt));

        const runsWithSteps = await Promise.all(
          runs.map(async (run) => {
            const steps = await db
              .select()
              .from(pipelineStepLogs)
              .where(eq(pipelineStepLogs.pipelineRunId, run.id))
              .orderBy(asc(pipelineStepLogs.sequenceIndex));
            return { ...run, steps };
          })
        );

        res.json(runsWithSteps);
      } catch (error) {
        console.error('Error fetching pipeline runs:', error);
        res.status(500).json({ error: 'Failed to fetch pipeline runs' });
      }
    }
  );

  /**
   * GET /api/projects/:id/findings
   * Get agent findings for a deal
   */
  app.get(
    '/api/projects/:id/findings',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const findings = await db
          .select()
          .from(agentFindings)
          .where(eq(agentFindings.projectId, projectId))
          .orderBy(desc(agentFindings.createdAt));

        res.json(findings);
      } catch (error) {
        console.error('Error fetching agent findings:', error);
        res.status(500).json({ error: 'Failed to fetch agent findings' });
      }
    }
  );

  /**
   * GET /api/projects/:id/agent-communications
   * Get drafted communications for a deal
   */
  app.get(
    '/api/projects/:id/agent-communications',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const communications = await db
          .select()
          .from(agentCommunications)
          .where(eq(agentCommunications.projectId, projectId))
          .orderBy(desc(agentCommunications.createdAt));

        res.json(communications);
      } catch (error) {
        console.error('Error fetching agent communications:', error);
        res.status(500).json({ error: 'Failed to fetch agent communications' });
      }
    }
  );

  /**
   * GET /api/admin/approved-communications
   * Get all approved but unsent AI communications across all deals
   */
  app.get(
    '/api/admin/approved-communications',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const comms = await db
          .select({
            id: agentCommunications.id,
            projectId: agentCommunications.projectId,
            recipientType: agentCommunications.recipientType,
            recipientName: agentCommunications.recipientName,
            recipientEmail: agentCommunications.recipientEmail,
            subject: agentCommunications.subject,
            body: agentCommunications.body,
            editedBody: agentCommunications.editedBody,
            priority: agentCommunications.priority,
            status: agentCommunications.status,
            approvedAt: agentCommunications.approvedAt,
            approvedBy: agentCommunications.approvedBy,
            sentAt: agentCommunications.sentAt,
            createdAt: agentCommunications.createdAt,
            projectName: projects.projectName,
          })
          .from(agentCommunications)
          .leftJoin(projects, eq(agentCommunications.projectId, projects.id))
          .where(
            and(
              eq(agentCommunications.status, 'approved'),
              sql`${agentCommunications.sentAt} IS NULL`
            )
          )
          .orderBy(desc(agentCommunications.approvedAt));

        res.json({ communications: comms });
      } catch (error) {
        console.error('Error fetching approved communications:', error);
        res.status(500).json({ error: 'Failed to fetch approved communications' });
      }
    }
  );

  /**
   * PUT /api/projects/:id/agent-communications/:commId/approve
   * Approve a drafted communication
   */
  app.put(
    '/api/projects/:id/agent-communications/:commId/approve',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const commId = parseInt(req.params.commId);

        // Verify project exists
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const [comm] = await db
          .update(agentCommunications)
          .set({
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: req.user?.id,
          })
          .where(and(
            eq(agentCommunications.id, commId),
            eq(agentCommunications.projectId, projectId)
          ))
          .returning();

        if (!comm) {
          return res.status(404).json({ error: 'Communication not found' });
        }

        let digestResult: { queued: boolean; draftId?: number; message: string } = {
          queued: false,
          message: 'No communication config found for this deal'
        };

        try {
          const [digestConfig] = await db.select()
            .from(loanDigestConfigs)
            .where(and(
              or(
                eq(loanDigestConfigs.projectId, projectId),
                eq(loanDigestConfigs.dealId, projectId)
              ),
              eq(loanDigestConfigs.isEnabled, true)
            ))
            .limit(1);

          if (digestConfig) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const endOfTomorrow = new Date(tomorrow);
            endOfTomorrow.setHours(23, 59, 59, 999);

            // Supersede any existing regular digest drafts for tomorrow
            // AI communication takes priority over regular digests (one system message per day per deal)
            await db.update(scheduledDigestDrafts)
              .set({ status: 'superseded', updatedAt: new Date() })
              .where(and(
                eq(scheduledDigestDrafts.configId, digestConfig.id),
                gte(scheduledDigestDrafts.scheduledDate, tomorrow),
                lte(scheduledDigestDrafts.scheduledDate, endOfTomorrow),
                sql`${scheduledDigestDrafts.status} IN ('draft', 'approved')`,
                eq(scheduledDigestDrafts.source, 'digest')
              ));

            let finalBody = comm.editedBody || comm.body || '';
            let finalSubject = comm.subject || 'Deal Update';
            try {
              const trimmed = finalBody.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
              const parsed = JSON.parse(trimmed);
              if (parsed.subject) finalSubject = parsed.subject;
              if (parsed.body) finalBody = parsed.body;
            } catch {}

            const recipients = await db.select()
              .from(loanDigestRecipients)
              .where(and(
                eq(loanDigestRecipients.configId, digestConfig.id),
                eq(loanDigestRecipients.isActive, true)
              ));

            if (recipients.length > 0) {
              const [newDraft] = await db.insert(scheduledDigestDrafts).values({
                configId: digestConfig.id,
                projectId,
                scheduledDate: tomorrow,
                timeOfDay: digestConfig.timeOfDay || '09:00',
                emailSubject: finalSubject,
                emailBody: finalBody,
                smsBody: finalBody.substring(0, 160),
                documentsCount: 0,
                updatesCount: 1,
                recipients: JSON.stringify(recipients),
                status: 'approved',
                source: 'ai_communication',
                sourceCommId: comm.id,
                approvedBy: req.user?.id,
                approvedAt: new Date(),
              }).returning();

              digestResult = { queued: true, draftId: newDraft.id, message: 'AI communication scheduled for tomorrow (takes priority over regular digest)' };
            } else {
              digestResult = { queued: false, message: 'Communication config exists but has no active recipients' };
            }
          }
        } catch (digestError) {
          console.error('Failed to queue AI communication (non-blocking):', digestError);
          digestResult = { queued: false, message: 'Failed to queue communication' };
        }

        try {
          await db.insert(dealMemoryEntries).values({
            dealId: projectId,
            entryType: 'communication_approved',
            title: `Communication approved: ${comm.subject || 'Deal Update'}`,
            description: `To: ${comm.recipientType || 'borrower'}${comm.recipientName ? ` (${comm.recipientName})` : ''}`,
            sourceType: 'admin',
            sourceUserId: req.user?.id || null,
            metadata: { commId: comm.id, subject: comm.subject, recipientType: comm.recipientType },
          });
        } catch (e) { console.error('Memory entry error:', e); }

        res.json({
          success: true,
          message: 'Communication approved',
          communication: comm,
          digest: digestResult
        });
      } catch (error) {
        console.error('Error approving communication:', error);
        res.status(500).json({ error: 'Failed to approve communication' });
      }
    }
  );

  /**
   * PATCH /api/projects/:id/agent-communications/:commId
   * Edit a communication's body/subject
   */
  app.patch(
    '/api/projects/:id/agent-communications/:commId',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const commId = parseInt(req.params.commId);
        const { body, subject } = req.body;

        if (body === undefined && subject === undefined) {
          return res.status(400).json({ error: 'Body or subject required' });
        }
        if (body !== undefined && typeof body !== 'string') {
          return res.status(400).json({ error: 'Body must be a string' });
        }
        if (subject !== undefined && typeof subject !== 'string') {
          return res.status(400).json({ error: 'Subject must be a string' });
        }

        const updateFields: any = {};
        if (body !== undefined) updateFields.editedBody = body;
        if (subject !== undefined) updateFields.subject = subject;

        const [comm] = await db
          .update(agentCommunications)
          .set(updateFields)
          .where(and(
            eq(agentCommunications.id, commId),
            eq(agentCommunications.projectId, projectId)
          ))
          .returning();

        if (!comm) {
          return res.status(404).json({ error: 'Communication not found' });
        }

        res.json({ success: true, communication: comm });
      } catch (error) {
        console.error('Error editing communication:', error);
        res.status(500).json({ error: 'Failed to edit communication' });
      }
    }
  );

  /**
   * PUT /api/projects/:id/agent-communications/:commId/reject
   * Reject a drafted communication
   */
  app.put(
    '/api/projects/:id/agent-communications/:commId/reject',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const commId = parseInt(req.params.commId);
        const { reason } = req.body;

        // Verify project exists
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const [comm] = await db
          .update(agentCommunications)
          .set({
            status: 'rejected',
            rejectionReason: reason || null,
            rejectedAt: new Date(),
            rejectedBy: req.user?.id,
            updatedAt: new Date()
          })
          .where(and(
            eq(agentCommunications.id, commId),
            eq(agentCommunications.projectId, projectId)
          ))
          .returning();

        if (!comm) {
          return res.status(404).json({ error: 'Communication not found' });
        }

        res.json({
          success: true,
          message: 'Communication rejected',
          communication: comm
        });
      } catch (error) {
        console.error('Error rejecting communication:', error);
        res.status(500).json({ error: 'Failed to reject communication' });
      }
    }
  );

  /**
   * PUT /api/projects/:id/agent-communications/:commId/edit
   * Edit a drafted communication before approval
   */
  app.put(
    '/api/projects/:id/agent-communications/:commId/edit',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const commId = parseInt(req.params.commId);
        const { subject, body, correction } = req.body;

        // Verify project exists
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const [comm] = await db
          .update(agentCommunications)
          .set({
            ...(subject && { subject }),
            ...(body && { body }),
            updatedAt: new Date()
          })
          .where(and(
            eq(agentCommunications.id, commId),
            eq(agentCommunications.projectId, projectId)
          ))
          .returning();

        if (!comm) {
          return res.status(404).json({ error: 'Communication not found' });
        }

        // Store correction if provided
        if (correction) {
          await db.insert(agentCorrections).values({
            communicationId: commId,
            correction,
            correctedBy: req.user?.id,
            createdAt: new Date()
          });
        }

        res.json({
          success: true,
          message: 'Communication updated',
          communication: comm
        });
      } catch (error) {
        console.error('Error editing communication:', error);
        res.status(500).json({ error: 'Failed to edit communication' });
      }
    }
  );

  /**
   * GET /api/projects/:id/story
   * Get the deal story
   */
  app.get(
    '/api/projects/:id/story',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const [story] = await db
          .select()
          .from(dealStories)
          .where(eq(dealStories.projectId, projectId));

        if (!story) {
          return res.status(404).json({ error: 'Deal story not found' });
        }

        res.json(story);
      } catch (error) {
        console.error('Error fetching deal story:', error);
        res.status(500).json({ error: 'Failed to fetch deal story' });
      }
    }
  );

  app.post(
    '/api/projects/:id/story/refresh',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const { updateDealStory } = await import('../agents/dealStory');
        const story = await updateDealStory({
          projectId,
          updateSource: 'manual_refresh',
        });
        res.json(story);
      } catch (error) {
        console.error('Error refreshing deal story:', error);
        res.status(500).json({ error: 'Failed to refresh deal story' });
      }
    }
  );

  /**
   * POST /api/projects/:id/findings/:findingId/override
   * Override a finding (stores correction)
   */
  app.post(
    '/api/projects/:id/findings/:findingId/override',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const findingId = parseInt(req.params.findingId);
        const { overrideReason, correctedValue } = req.body;

        // Verify project exists
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // Verify finding exists
        const [finding] = await db
          .select()
          .from(agentFindings)
          .where(and(
            eq(agentFindings.id, findingId),
            eq(agentFindings.projectId, projectId)
          ));

        if (!finding) {
          return res.status(404).json({ error: 'Finding not found' });
        }

        // Update finding with override
        const [updated] = await db
          .update(agentFindings)
          .set({
            isOverridden: true,
            overrideReason: overrideReason || null,
            correctedValue: correctedValue || null,
            overriddenBy: req.user?.id,
            overriddenAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(agentFindings.id, findingId))
          .returning();

        // Store correction
        await db.insert(agentCorrections).values({
          findingId: findingId,
          correction: overrideReason || '',
          correctedBy: req.user?.id,
          createdAt: new Date()
        });

        res.json({
          success: true,
          message: 'Finding overridden',
          finding: updated
        });
      } catch (error) {
        console.error('Error overriding finding:', error);
        res.status(500).json({ error: 'Failed to override finding' });
      }
    }
  );

  // ==================== PIPELINE ORCHESTRATION ====================

  /**
   * POST /api/admin/agents/pipeline/start
   * Start the full AI pipeline (Doc Intel → Processor → Communication) for a deal
   */
  app.post(
    '/api/admin/agents/pipeline/start',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { projectId, agentSequence } = req.body;

        if (!projectId) {
          return res.status(400).json({ error: 'projectId is required' });
        }

        // Verify project exists
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, parseInt(projectId)));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const [existingRun] = await db
          .select()
          .from(agentPipelineRuns)
          .where(and(
            eq(agentPipelineRuns.projectId, parseInt(projectId)),
            eq(agentPipelineRuns.status, 'running')
          ));

        if (existingRun) {
          const startedAt = existingRun.startedAt ? new Date(existingRun.startedAt).getTime() : 0;
          const ageMs = Date.now() - startedAt;
          const STALE_THRESHOLD_MS = 10 * 60 * 1000;
          if (ageMs > STALE_THRESHOLD_MS) {
            await db.update(agentPipelineRuns)
              .set({ status: 'failed', completedAt: new Date().toISOString(), errorMessage: 'Auto-expired: exceeded 10 minute timeout' })
              .where(eq(agentPipelineRuns.id, existingRun.id));
          } else {
            return res.status(409).json({
              error: 'A pipeline is already running for this deal',
              pipelineRunId: existingRun.id,
            });
          }
        }

        const sequence = agentSequence || ['document_intelligence', 'processor', 'communication'];
        const pipelineRun = await startPipeline(
          parseInt(projectId),
          req.user?.id || null,
          'manual',
          sequence
        );

        res.status(202).json({
          success: true,
          pipelineRunId: pipelineRun.id,
          status: pipelineRun.status,
          message: 'Pipeline started'
        });
      } catch (error) {
        console.error('Error starting pipeline:', error);
        res.status(500).json({ error: 'Failed to start pipeline' });
      }
    }
  );

  /**
   * POST /api/admin/agents/pipeline/generate-communication
   * Run only Agent 3 (Communication) for a deal using the latest findings
   */
  app.post(
    '/api/admin/agents/pipeline/generate-communication',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { projectId } = req.body;

        if (!projectId) {
          return res.status(400).json({ error: 'projectId is required' });
        }

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, parseInt(projectId)));

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const [existingRun] = await db
          .select()
          .from(agentPipelineRuns)
          .where(and(
            eq(agentPipelineRuns.projectId, parseInt(projectId)),
            eq(agentPipelineRuns.status, 'running')
          ));

        if (existingRun) {
          return res.status(409).json({
            error: 'A pipeline is already running for this deal',
            pipelineRunId: existingRun.id,
          });
        }

        const pipelineRun = await startPipeline(
          parseInt(projectId),
          req.user?.id || null,
          'manual_communication',
          ['communication']
        );

        res.status(202).json({
          success: true,
          pipelineRunId: pipelineRun.id,
          status: pipelineRun.status,
          message: 'Communication agent started'
        });
      } catch (error) {
        console.error('Error starting communication pipeline:', error);
        res.status(500).json({ error: 'Failed to start communication agent' });
      }
    }
  );

  /**
   * PATCH /api/projects/:id/findings/:findingId/decision
   * Save lender decision on AI findings
   */
  app.patch(
    '/api/projects/:id/findings/:findingId/decision',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const findingId = parseInt(req.params.findingId);
        const { decision, notes } = req.body;

        if (!decision || !['approve', 'conditional', 'deny', 'at_risk'].includes(decision)) {
          return res.status(400).json({ error: 'Valid decision required: approve, conditional, deny, at_risk' });
        }

        const [updated] = await db
          .update(agentFindings)
          .set({
            lenderDecision: decision,
            lenderDecisionBy: req.user?.id || null,
            lenderDecisionAt: new Date(),
            lenderDecisionNotes: notes || null,
          })
          .where(and(
            eq(agentFindings.id, findingId),
            eq(agentFindings.projectId, projectId)
          ))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: 'Finding not found' });
        }

        try {
          await db.insert(dealMemoryEntries).values({
            dealId: projectId,
            entryType: 'lender_decision',
            title: `Deal marked as ${decision.replace('_', ' ')}`,
            description: notes || null,
            sourceType: 'admin',
            sourceUserId: req.user?.id || null,
            metadata: { findingId, decision },
          });
        } catch (e) { console.error('Memory entry error:', e); }

        res.json({ success: true, finding: updated });
      } catch (error) {
        console.error('Error saving finding decision:', error);
        res.status(500).json({ error: 'Failed to save decision' });
      }
    }
  );

  /**
   * GET /api/projects/:id/pipeline/status
   * Get current pipeline status for a deal
   */
  app.get(
    '/api/projects/:id/pipeline/status',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const status = await getPipelineStatus(projectId);
        res.json(status);
      } catch (error) {
        console.error('Error getting pipeline status:', error);
        res.status(500).json({ error: 'Failed to get pipeline status' });
      }
    }
  );

  /**
   * GET /api/projects/:id/pipeline/history
   * Get pipeline run history for a deal
   */
  app.get(
    '/api/projects/:id/pipeline/history',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const projectId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit as string) || 10;
        const history = await getPipelineHistory(projectId, limit);
        res.json(history);
      } catch (error) {
        console.error('Error getting pipeline history:', error);
        res.status(500).json({ error: 'Failed to get pipeline history' });
      }
    }
  );

  /**
   * GET /api/admin/agents/pipeline/settings
   * Get auto-trigger settings
   */
  app.get(
    '/api/admin/agents/pipeline/settings',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const [settings] = await db.select().from(platformSettings).limit(1);
        res.json({
          autoRunPipeline: settings?.autoRunPipeline ?? false,
        });
      } catch (error) {
        console.error('Error getting pipeline settings:', error);
        res.status(500).json({ error: 'Failed to get pipeline settings' });
      }
    }
  );

  /**
   * PATCH /api/admin/agents/pipeline/settings
   * Update auto-trigger settings
   */
  app.patch(
    '/api/admin/agents/pipeline/settings',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { autoRunPipeline } = req.body;

        const [existing] = await db.select().from(platformSettings).limit(1);

        if (existing) {
          await db
            .update(platformSettings)
            .set({ autoRunPipeline: !!autoRunPipeline, updatedAt: new Date() })
            .where(eq(platformSettings.id, existing.id));
        } else {
          await db.insert(platformSettings).values({
            autoRunPipeline: !!autoRunPipeline,
          });
        }

        res.json({ success: true, autoRunPipeline: !!autoRunPipeline });
      } catch (error) {
        console.error('Error updating pipeline settings:', error);
        res.status(500).json({ error: 'Failed to update pipeline settings' });
      }
    }
  );

  /**
   * GET /api/admin/agents/pipeline/recent
   * Get recent pipeline runs across all deals (for AI Agents dashboard)
   */
  app.get(
    '/api/admin/agents/pipeline/recent',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 20;
        const runs = await db
          .select()
          .from(agentPipelineRuns)
          .orderBy(desc(agentPipelineRuns.startedAt))
          .limit(limit);

        const serializedRuns = runs.map(r => ({
          ...r,
          startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt || null,
          completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : r.completedAt || null,
        }));

        res.json(serializedRuns);
      } catch (error) {
        console.error('Error fetching recent pipeline runs:', error);
        res.status(500).json({ error: 'Failed to fetch recent pipeline runs' });
      }
    }
  );

  // ==================== LENDER AI CUSTOMIZATIONS ====================

  /**
   * GET /api/admin/agents/customizations
   * Get all AI customizations for the current lender user
   */
  app.get(
    '/api/admin/agents/customizations',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const customizations = await db
          .select()
          .from(lenderAgentCustomizations)
          .where(eq(lenderAgentCustomizations.userId, userId))
          .orderBy(asc(lenderAgentCustomizations.agentType));

        res.json(customizations);
      } catch (error) {
        console.error('Error fetching lender AI customizations:', error);
        res.status(500).json({ error: 'Failed to fetch AI customizations' });
      }
    }
  );

  /**
   * PUT /api/admin/agents/customizations
   * Upsert a lender AI customization for a specific agent type.
   * If a record already exists for this user + agentType, it updates. Otherwise inserts.
   */
  app.put(
    '/api/admin/agents/customizations',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { agentType, additionalPrompt, isActive } = req.body;

        if (!agentType || typeof additionalPrompt !== 'string') {
          return res.status(400).json({ error: 'agentType and additionalPrompt are required' });
        }

        // Check if this user already has a customization for this agent type
        const existing = await db
          .select()
          .from(lenderAgentCustomizations)
          .where(
            and(
              eq(lenderAgentCustomizations.userId, userId),
              eq(lenderAgentCustomizations.agentType, agentType)
            )
          )
          .then((r) => r[0]);

        let result;
        if (existing) {
          [result] = await db
            .update(lenderAgentCustomizations)
            .set({
              additionalPrompt,
              isActive: isActive !== undefined ? isActive : existing.isActive,
              updatedAt: new Date(),
            })
            .where(eq(lenderAgentCustomizations.id, existing.id))
            .returning();
        } else {
          [result] = await db
            .insert(lenderAgentCustomizations)
            .values({
              userId,
              agentType,
              additionalPrompt,
              isActive: isActive !== undefined ? isActive : true,
            })
            .returning();
        }

        res.json(result);
      } catch (error) {
        console.error('Error saving lender AI customization:', error);
        res.status(500).json({ error: 'Failed to save AI customization' });
      }
    }
  );

  /**
   * DELETE /api/admin/agents/customizations/:id
   * Delete a specific lender AI customization
   */
  app.delete(
    '/api/admin/agents/customizations/:id',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const customizationId = parseInt(req.params.id);
        const userId = req.user!.id;

        // Ensure the user owns this customization
        const existing = await db
          .select()
          .from(lenderAgentCustomizations)
          .where(
            and(
              eq(lenderAgentCustomizations.id, customizationId),
              eq(lenderAgentCustomizations.userId, userId)
            )
          )
          .then((r) => r[0]);

        if (!existing) {
          return res.status(404).json({ error: 'Customization not found' });
        }

        await db.delete(lenderAgentCustomizations).where(eq(lenderAgentCustomizations.id, customizationId));
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting lender AI customization:', error);
        res.status(500).json({ error: 'Failed to delete AI customization' });
      }
    }
  );

  // ==================== DEFAULT PROMPTS SEEDING ====================

  /**
   * POST /api/admin/agents/seed-defaults
   * Seeds the 3 default agent configurations
   */
  app.post(
    '/api/admin/agents/seed-defaults',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const defaultConfigs = [
          {
            agentType: 'document_intelligence',
            name: 'Document Intelligence Agent',
            systemPrompt: DEFAULT_AGENT_PROMPTS.DOCUMENT_EXTRACTION,
            toolDefinitions: ['document_extraction', 'text_analysis'],
            modelProvider: 'openai',
            modelName: 'gpt-4o',
            maxTokens: 2048,
            temperature: 0.3
          },
          {
            agentType: 'processor',
            name: 'Deal Processor Agent',
            systemPrompt: DEFAULT_AGENT_PROMPTS.DEAL_PROCESSOR,
            toolDefinitions: ['document_analysis', 'data_extraction', 'risk_assessment'],
            modelProvider: 'openai',
            modelName: 'gpt-4o',
            maxTokens: 4096,
            temperature: 0.5
          },
          {
            agentType: 'communication',
            name: 'Communication Draft Agent',
            systemPrompt: DEFAULT_AGENT_PROMPTS.COMMUNICATION_DRAFT,
            toolDefinitions: ['communication_generation', 'tone_adjustment'],
            modelProvider: 'openai',
            modelName: 'gpt-4o',
            maxTokens: 2048,
            temperature: 0.7
          },
          {
            agentType: 'email_doc_classifier',
            name: 'Email Document Classifier',
            systemPrompt: DEFAULT_AGENT_PROMPTS.EMAIL_DOC_CLASSIFIER,
            toolDefinitions: ['document_classification'],
            modelProvider: 'openai',
            modelName: 'gpt-4o',
            maxTokens: 1024,
            temperature: 0.2
          },
          {
            agentType: 'intake_validator',
            name: 'Commercial Intake Validator',
            systemPrompt: `You are a Commercial Real Estate Deal Validator AI Agent. Your job is to:\n1. Parse and validate all deal fields from a commercial real estate submission\n2. Validate data types (amounts must be positive numbers, percentages 0-100, dates valid, state codes 2-letter)\n3. Calculate key metrics:\n   - LTV = (loan_amount / property_value) * 100\n   - DSCR = NOI / (loan_amount * 0.07) (approximate annual debt service at 7%)\n4. Flag missing or invalid data\n5. Produce a clean structured deal JSON\n\nReturn a JSON object with:\n{\n  "validation_status": "valid" | "invalid",\n  "validation_errors": [{"field": "...", "error": "..."}],\n  "structured_deal": {\n    "basic_info": { "deal_name", "loan_amount", "asset_type", "property_address", "property_city", "property_state", "property_zip" },\n    "borrower_info": { "name", "entity_type", "credit_score", "has_guarantor" },\n    "metrics": { "property_value", "ltv_pct", "noi_annual", "dscr", "occupancy_pct" },\n    "documents_submitted": ["doc_type1", ...],\n    "documents_missing": []\n  }\n}`,
            toolDefinitions: ['deal_validation', 'metrics_calculation'],
            modelProvider: 'openai',
            modelName: 'gpt-4o-mini',
            maxTokens: 2048,
            temperature: 0.3
          },
          {
            agentType: 'intake_fund_matcher',
            name: 'Commercial Fund Matcher',
            systemPrompt: `You are a Commercial Real Estate Fund Matcher & Risk Analyzer AI Agent. Your job is to:\n1. Compare a validated deal against available fund criteria\n2. For each fund, check: LTV in range, LTC in range (if applicable), loan amount in range, state/geography eligible, asset type eligible\n3. Score each eligible fund 0-100 based on how well the deal fits\n4. Assess deal health across 4 risk categories (each scored 0-100, lower is better/less risky):\n   - Borrower risk, Property risk, Loan structure risk, Documentation risk\n\nReturn JSON with:\n{\n  "eligible_funds": [{ "fund_id": N, "fund_name": "...", "match_score": 0-100, "match_reason": "..." }],\n  "total_funds_checked": N,\n  "deal_health": {\n    "borrower_risk_score": 0-100, "borrower_risk_detail": "...",\n    "property_risk_score": 0-100, "property_risk_detail": "...",\n    "loan_structure_risk_score": 0-100, "loan_structure_risk_detail": "...",\n    "documentation_risk_score": 0-100, "documentation_risk_detail": "..."\n  }\n}`,
            toolDefinitions: ['fund_matching', 'risk_analysis'],
            modelProvider: 'openai',
            modelName: 'gpt-4o-mini',
            maxTokens: 2048,
            temperature: 0.3
          },
          {
            agentType: 'intake_feedback_generator',
            name: 'Commercial Feedback Generator',
            systemPrompt: `You are a Commercial Real Estate Deal Feedback Generator AI Agent. Your job is to:\n1. Analyze the fund matching report and deal health assessment\n2. Identify key flaws with severity (critical, high, medium, low) and remediation suggestions\n3. List deal strengths\n4. Calculate composite confidence score: (fund_fit_score * 0.6) + (deal_health_score * 0.4)\n5. Generate verdict: >75 = "pass", 50-75 = "conditional", <50 = "fail"\n6. Provide per-fund recommendations and next steps\n\nReturn JSON with:\n{\n  "overall_verdict": "pass" | "conditional" | "fail",\n  "confidence_score": 0-100,\n  "confidence_breakdown": { "fund_fit": 0-100, "deal_health": 0-100 },\n  "key_flaws": [{ "flaw": "...", "severity": "critical|high|medium|low", "detail": "...", "remediation": "..." }],\n  "strengths": [{ "strength": "...", "detail": "..." }],\n  "fund_recommendations": [{ "fund_name": "...", "match_score": 0-100, "recommendation": "..." }],\n  "next_steps": ["..."]\n}`,
            toolDefinitions: ['feedback_generation', 'verdict_calculation'],
            modelProvider: 'openai',
            modelName: 'gpt-4o-mini',
            maxTokens: 2048,
            temperature: 0.3
          }
        ];

        const results = [];

        for (const config of defaultConfigs) {
          // Check if configuration already exists
          const existing = await db
            .select()
            .from(agentConfigurations)
            .where(eq(agentConfigurations.agentType, config.agentType));

          if (existing.length === 0) {
            const [newConfig] = await db
              .insert(agentConfigurations)
              .values({
                ...config,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: req.user?.id
              })
              .returning();

            results.push({
              status: 'created',
              agentType: config.agentType,
              id: newConfig.id
            });
          } else {
            results.push({
              status: 'already_exists',
              agentType: config.agentType,
              id: existing[0].id
            });
          }
        }

        res.json({
          success: true,
          message: 'Default agent configurations seeded',
          results
        });
      } catch (error) {
        console.error('Error seeding default agents:', error);
        res.status(500).json({ error: 'Failed to seed default agents' });
      }
    }
  );

  // ==================== PIPELINE AGENT STEPS CRUD ====================

  app.get(
    '/api/admin/agents/pipeline/steps',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const steps = await db
          .select()
          .from(pipelineAgentSteps)
          .orderBy(asc(pipelineAgentSteps.stepOrder));
        res.json(steps);
      } catch (error) {
        console.error('Error getting pipeline steps:', error);
        res.status(500).json({ error: 'Failed to get pipeline steps' });
      }
    }
  );

  app.post(
    '/api/admin/agents/pipeline/steps',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { agentType, name, description, stepOrder, isEnabled, triggerCondition, inputMapping, outputMapping, retryOnFailure, maxRetries, timeoutSeconds } = req.body;
        const maxOrder = await db.select().from(pipelineAgentSteps).orderBy(desc(pipelineAgentSteps.stepOrder)).limit(1);
        const nextOrder = stepOrder ?? ((maxOrder[0]?.stepOrder ?? -1) + 1);
        const [step] = await db.insert(pipelineAgentSteps).values({
          agentType,
          name,
          description: description || null,
          stepOrder: nextOrder,
          isEnabled: isEnabled ?? true,
          triggerCondition: triggerCondition || { type: 'previous_step_complete', config: {} },
          inputMapping: inputMapping || {},
          outputMapping: outputMapping || {},
          retryOnFailure: retryOnFailure ?? false,
          maxRetries: maxRetries ?? 1,
          timeoutSeconds: timeoutSeconds ?? 300,
          createdBy: req.user!.id,
        }).returning();
        res.json(step);
      } catch (error) {
        console.error('Error creating pipeline step:', error);
        res.status(500).json({ error: 'Failed to create pipeline step' });
      }
    }
  );

  app.put(
    '/api/admin/agents/pipeline/steps/:id',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const stepId = parseInt(req.params.id);
        const { name, description, isEnabled, triggerCondition, inputMapping, outputMapping, retryOnFailure, maxRetries, timeoutSeconds } = req.body;
        const updateData: any = { updatedAt: new Date() };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
        if (triggerCondition !== undefined) updateData.triggerCondition = triggerCondition;
        if (inputMapping !== undefined) updateData.inputMapping = inputMapping;
        if (outputMapping !== undefined) updateData.outputMapping = outputMapping;
        if (retryOnFailure !== undefined) updateData.retryOnFailure = retryOnFailure;
        if (maxRetries !== undefined) updateData.maxRetries = maxRetries;
        if (timeoutSeconds !== undefined) updateData.timeoutSeconds = timeoutSeconds;

        const [updated] = await db
          .update(pipelineAgentSteps)
          .set(updateData)
          .where(eq(pipelineAgentSteps.id, stepId))
          .returning();
        if (!updated) return res.status(404).json({ error: 'Step not found' });
        res.json(updated);
      } catch (error) {
        console.error('Error updating pipeline step:', error);
        res.status(500).json({ error: 'Failed to update pipeline step' });
      }
    }
  );

  app.delete(
    '/api/admin/agents/pipeline/steps/:id',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const stepId = parseInt(req.params.id);
        const [deleted] = await db
          .delete(pipelineAgentSteps)
          .where(eq(pipelineAgentSteps.id, stepId))
          .returning();
        if (!deleted) return res.status(404).json({ error: 'Step not found' });
        const remaining = await db.select().from(pipelineAgentSteps).orderBy(asc(pipelineAgentSteps.stepOrder));
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].stepOrder !== i) {
            await db.update(pipelineAgentSteps).set({ stepOrder: i }).where(eq(pipelineAgentSteps.id, remaining[i].id));
          }
        }
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting pipeline step:', error);
        res.status(500).json({ error: 'Failed to delete pipeline step' });
      }
    }
  );

  app.put(
    '/api/admin/agents/pipeline/steps/reorder',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { stepIds } = req.body;
        if (!Array.isArray(stepIds)) return res.status(400).json({ error: 'stepIds array required' });
        for (let i = 0; i < stepIds.length; i++) {
          await db
            .update(pipelineAgentSteps)
            .set({ stepOrder: i, updatedAt: new Date() })
            .where(eq(pipelineAgentSteps.id, stepIds[i]));
        }
        const steps = await db.select().from(pipelineAgentSteps).orderBy(asc(pipelineAgentSteps.stepOrder));
        res.json(steps);
      } catch (error) {
        console.error('Error reordering pipeline steps:', error);
        res.status(500).json({ error: 'Failed to reorder pipeline steps' });
      }
    }
  );

  // ==================== EMAIL DOC CHECK ORCHESTRATION ====================

  /**
   * GET /api/admin/agents/email-doc-check/settings
   * Returns polling settings (interval, enabled, lastRun, totalClassifications)
   */
  app.get(
    '/api/admin/agents/email-doc-check/settings',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const settings = await getEmailDocCheckSettings();
        res.json(settings);
      } catch (error) {
        console.error('Error getting email doc check settings:', error);
        res.status(500).json({ error: 'Failed to get settings' });
      }
    }
  );

  /**
   * PATCH /api/admin/agents/email-doc-check/settings
   * Update polling settings. Restarts polling if interval changes.
   */
  app.patch(
    '/api/admin/agents/email-doc-check/settings',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { enabled, intervalMinutes } = req.body;
        const updates: Record<string, any> = {};

        if (typeof enabled === 'boolean') updates.enabled = enabled;
        if (typeof intervalMinutes === 'number' && intervalMinutes >= 15 && intervalMinutes <= 360) {
          updates.intervalMinutes = intervalMinutes;
        }

        const settings = await updateEmailDocCheckSettings(updates);

        // Restart polling with new settings
        await restartEmailDocCheckPolling();

        res.json(settings);
      } catch (error) {
        console.error('Error updating email doc check settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
      }
    }
  );

  /**
   * POST /api/admin/agents/email-doc-check/trigger
   * Manually trigger an email document check run
   */
  app.post(
    '/api/admin/agents/email-doc-check/trigger',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        res.status(202).json({ message: 'Email doc check triggered' });

        // Run asynchronously after responding
        runEmailDocCheck().catch((err) =>
          console.error('Manual email doc check error:', err)
        );
      } catch (error) {
        console.error('Error triggering email doc check:', error);
        res.status(500).json({ error: 'Failed to trigger check' });
      }
    }
  );

  /**
   * GET /api/admin/agents/email-doc-check/runs
   * Get recent classification runs (agentRuns where agentType = 'email_doc_classifier')
   */
  app.get(
    '/api/admin/agents/email-doc-check/runs',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;

        const runs = await db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.agentType, 'email_doc_classifier'))
          .orderBy(desc(agentRuns.createdAt))
          .limit(limit)
          .offset(offset);

        res.json(runs);
      } catch (error) {
        console.error('Error getting email doc check runs:', error);
        res.status(500).json({ error: 'Failed to get runs' });
      }
    }
  );
}

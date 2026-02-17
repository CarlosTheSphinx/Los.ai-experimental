/**
 * Agent Routes
 * Endpoints for AI agent configuration, execution, audit logging, and deal-specific data management
 */

import type { Express, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { eq, desc, and } from 'drizzle-orm';
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
  users
} from '@shared/schema';
import { asc } from 'drizzle-orm';
import { startPipeline, getPipelineStatus, getPipelineHistory } from '../agents/orchestrator';

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
- estimated_response_time: Expected timeframe for response`
};

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

        let query = db.select().from(agentRuns);

        if (agentType) {
          query = query.where(eq(agentRuns.agentType, agentType as string));
        }

        const runs = await query
          .orderBy(desc(agentRuns.createdAt))
          .limit(pageLimit)
          .offset(pageOffset);

        // Get total count
        let countQuery = db.select().from(agentRuns);
        if (agentType) {
          countQuery = countQuery.where(eq(agentRuns.agentType, agentType as string));
        }
        const countResult = await countQuery;

        res.json({
          runs,
          pagination: {
            total: countResult.length,
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
          message: 'Communication approved',
          communication: comm
        });
      } catch (error) {
        console.error('Error approving communication:', error);
        res.status(500).json({ error: 'Failed to approve communication' });
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

        // Check if there's already a running pipeline for this project
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

        // Start the pipeline (runs asynchronously)
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

        res.json(runs);
      } catch (error) {
        console.error('Error fetching recent pipeline runs:', error);
        res.status(500).json({ error: 'Failed to fetch recent pipeline runs' });
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
}

import type { Express, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { eq, sql, inArray, and } from 'drizzle-orm';
import {
  loanPrograms,
  programDocumentTemplates,
  programTaskTemplates,
  workflowStepDefinitions,
  programWorkflowSteps,
  projectStages,
  projects,
  creditPolicies,
  documentReviewResults,
  programReviewRules
} from '@shared/schema';

export function registerAdminProgramsRoutes(app: Express, deps: RouteDeps) {
  const { storage, db, authenticateUser, requireAdmin, requirePermission } = deps;

  async function verifyProgramOwnership(req: AuthRequest, res: Response, programId: number): Promise<boolean> {
    const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, programId));
    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return false;
    }
    const user = await storage.getUserById(req.user!.id);
    if (user?.role !== 'super_admin' && program.createdBy !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to access this program' });
      return false;
    }
    return true;
  }

  // ==================== LOAN PROGRAMS ROUTES ====================

  app.get('/api/admin/programs', authenticateUser, requireAdmin, requirePermission('programs.view'), async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      const isSuperAdmin = user?.role === 'super_admin';
      const programs = await db.select().from(loanPrograms)
        .where(isSuperAdmin ? undefined : eq(loanPrograms.createdBy, req.user!.id))
        .orderBy(loanPrograms.sortOrder);

      const programsWithCounts = await Promise.all(programs.map(async (program) => {
        const docs = await db.select().from(programDocumentTemplates).where(eq(programDocumentTemplates.programId, program.id));
        const tasks = await db.select().from(programTaskTemplates).where(eq(programTaskTemplates.programId, program.id));

        return {
          ...program,
          documentCount: docs.length,
          taskCount: tasks.length,
        };
      }));

      res.json(programsWithCounts);
    } catch (error) {
      console.error('Get programs error:', error);
      res.status(500).json({ error: 'Failed to load programs' });
    }
  });

  // Get single program with documents and tasks
  app.get('/api/admin/programs/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));

      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && program.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to view this program' });
      }

      const documents = await db.select().from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, program.id))
        .orderBy(programDocumentTemplates.sortOrder);

      const tasks = await db.select().from(programTaskTemplates)
        .where(eq(programTaskTemplates.programId, program.id))
        .orderBy(programTaskTemplates.sortOrder);

      const workflowSteps = await db.select({
        id: programWorkflowSteps.id,
        programId: programWorkflowSteps.programId,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
        stepOrder: programWorkflowSteps.stepOrder,
        isRequired: programWorkflowSteps.isRequired,
        estimatedDays: programWorkflowSteps.estimatedDays,
        createdAt: programWorkflowSteps.createdAt,
        definition: {
          id: workflowStepDefinitions.id,
          name: workflowStepDefinitions.name,
          key: workflowStepDefinitions.key,
          description: workflowStepDefinitions.description,
          color: workflowStepDefinitions.color,
          icon: workflowStepDefinitions.icon,
        }
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, program.id))
        .orderBy(programWorkflowSteps.stepOrder);

      res.json({ program, documents, tasks, workflowSteps });
    } catch (error) {
      console.error('Get program error:', error);
      res.status(500).json({ error: 'Failed to load program' });
    }
  });

  // Create loan program
  app.post('/api/admin/programs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const {
        name, description, loanType,
        minLoanAmount, maxLoanAmount,
        minLtv, maxLtv,
        minInterestRate, maxInterestRate,
        termOptions, eligiblePropertyTypes,
        isActive,
        documents,
        tasks,
        creditPolicyId
      } = req.body;

      if (!name || !loanType) {
        return res.status(400).json({ error: 'Name and loan type are required' });
      }

      // Use a transaction to ensure atomicity of program + templates creation
      const result = await db.transaction(async (tx) => {
        const [program] = await tx.insert(loanPrograms).values({
          name,
          description,
          loanType,
          minLoanAmount: minLoanAmount ? parseFloat(minLoanAmount) : 100000,
          maxLoanAmount: maxLoanAmount ? parseFloat(maxLoanAmount) : 5000000,
          minLtv: minLtv ? parseFloat(minLtv) : 50,
          maxLtv: maxLtv ? parseFloat(maxLtv) : 80,
          minInterestRate: minInterestRate ? parseFloat(minInterestRate) : 8,
          maxInterestRate: maxInterestRate ? parseFloat(maxInterestRate) : 15,
          termOptions,
          eligiblePropertyTypes: eligiblePropertyTypes || [],
          isActive: isActive !== false,
          creditPolicyId: creditPolicyId ? parseInt(creditPolicyId) : null,
          createdBy: req.user!.id,
        }).returning();

        // Create inline document templates if provided
        if (documents && Array.isArray(documents) && documents.length > 0) {
          // Filter out documents with empty names
          const validDocs = documents.filter((doc: any) => doc.documentName?.trim());
          if (validDocs.length > 0) {
            const documentEntries = validDocs.map((doc: any, index: number) => ({
              programId: program.id,
              documentName: doc.documentName.trim(),
              documentCategory: doc.documentCategory || 'other',
              documentDescription: doc.documentDescription || null,
              isRequired: doc.isRequired !== false,
              sortOrder: index,
            }));
            await tx.insert(programDocumentTemplates).values(documentEntries);
          }
        }

        // Create inline task templates if provided
        if (tasks && Array.isArray(tasks) && tasks.length > 0) {
          // Filter out tasks with empty names
          const validTasks = tasks.filter((task: any) => task.taskName?.trim());
          if (validTasks.length > 0) {
            const taskEntries = validTasks.map((task: any, index: number) => ({
              programId: program.id,
              taskName: task.taskName.trim(),
              taskDescription: task.taskDescription || null,
              taskCategory: task.taskCategory || 'other',
              priority: task.priority || 'medium',
              sortOrder: index,
            }));
            await tx.insert(programTaskTemplates).values(taskEntries);
          }
        }

        return program;
      });

      res.json({ program: result });
    } catch (error) {
      console.error('Create program error:', error);
      res.status(500).json({ error: 'Failed to create program' });
    }
  });

  // Update loan program
  app.put('/api/admin/programs/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [existingProgram] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));
      if (!existingProgram) return res.status(404).json({ error: 'Program not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && existingProgram.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to modify this program' });
      }

      const {
        name, description, loanType,
        minLoanAmount, maxLoanAmount,
        minLtv, maxLtv,
        minInterestRate, maxInterestRate,
        termOptions, eligiblePropertyTypes,
        isActive, reviewGuidelines, creditPolicyId
      } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (loanType !== undefined) updateData.loanType = loanType;
      if (minLoanAmount !== undefined) updateData.minLoanAmount = parseFloat(minLoanAmount);
      if (maxLoanAmount !== undefined) updateData.maxLoanAmount = parseFloat(maxLoanAmount);
      if (minLtv !== undefined) updateData.minLtv = parseFloat(minLtv);
      if (maxLtv !== undefined) updateData.maxLtv = parseFloat(maxLtv);
      if (minInterestRate !== undefined) updateData.minInterestRate = parseFloat(minInterestRate);
      if (maxInterestRate !== undefined) updateData.maxInterestRate = parseFloat(maxInterestRate);
      if (termOptions !== undefined) updateData.termOptions = termOptions;
      if (eligiblePropertyTypes !== undefined) updateData.eligiblePropertyTypes = eligiblePropertyTypes;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (reviewGuidelines !== undefined) updateData.reviewGuidelines = reviewGuidelines;
      if (creditPolicyId !== undefined) updateData.creditPolicyId = creditPolicyId ? parseInt(creditPolicyId) : null;

      const [program] = await db.update(loanPrograms)
        .set(updateData)
        .where(eq(loanPrograms.id, parseInt(id)))
        .returning();

      res.json({ program });
    } catch (error) {
      console.error('Update program error:', error);
      res.status(500).json({ error: 'Failed to update program' });
    }
  });

  // Toggle program active status
  app.patch('/api/admin/programs/:id/toggle', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));
      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && program.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to modify this program' });
      }

      const [updated] = await db.update(loanPrograms)
        .set({ isActive: !program.isActive, updatedAt: new Date() })
        .where(eq(loanPrograms.id, parseInt(id)))
        .returning();

      res.json({ program: updated });
    } catch (error) {
      console.error('Toggle program error:', error);
      res.status(500).json({ error: 'Failed to toggle program' });
    }
  });

  // Delete loan program
  app.delete('/api/admin/programs/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const [existingProgram] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));
      if (!existingProgram) return res.status(404).json({ error: 'Program not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && existingProgram.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to delete this program' });
      }

      await db.delete(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));

      res.json({ success: true });
    } catch (error) {
      console.error('Delete program error:', error);
      res.status(500).json({ error: 'Failed to delete program' });
    }
  });

  // ==================== PROGRAM DOCUMENT TEMPLATES ROUTES ====================

  // Add document template to program
  app.post('/api/admin/programs/:programId/documents', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder, stepId } = req.body;

      if (!documentName || !documentCategory) {
        return res.status(400).json({ error: 'Document name and category are required' });
      }

      const [doc] = await db.insert(programDocumentTemplates).values({
        programId: parseInt(programId),
        documentName,
        documentCategory,
        documentDescription,
        isRequired: isRequired !== false,
        sortOrder: sortOrder || 0,
        stepId: stepId || null,
      }).returning();

      res.json({ document: doc });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Add program document error:', error);
      res.status(500).json({ error: 'Failed to add document template' });
    }
  });

  // Batch update document step assignments (MUST be before :docId route)
  app.put('/api/admin/programs/:programId/documents/batch-step', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { assignments } = req.body;
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ error: 'Assignments must be an array' });
      }
      await db.transaction(async (tx) => {
        for (const assignment of assignments) {
          await tx.update(programDocumentTemplates)
            .set({ stepId: assignment.stepId ?? null })
            .where(eq(programDocumentTemplates.id, assignment.documentId));
        }
      });
      res.json({ success: true });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Batch update document steps error:', error);
      res.status(500).json({ error: 'Failed to update document assignments' });
    }
  });

  // Update document template
  app.put('/api/admin/programs/:programId/documents/:docId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId, docId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder, stepId } = req.body;

      const updateData: any = {};
      if (documentName !== undefined) updateData.documentName = documentName;
      if (documentCategory !== undefined) updateData.documentCategory = documentCategory;
      if (documentDescription !== undefined) updateData.documentDescription = documentDescription;
      if (isRequired !== undefined) updateData.isRequired = isRequired;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (stepId !== undefined) updateData.stepId = stepId;

      const [doc] = await db.update(programDocumentTemplates)
        .set(updateData)
        .where(eq(programDocumentTemplates.id, parseInt(docId)))
        .returning();

      res.json({ document: doc });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(req.params.programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Update program document error:', error);
      res.status(500).json({ error: 'Failed to update document template' });
    }
  });

  // Delete document template
  app.delete('/api/admin/programs/:programId/documents/:docId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId, docId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;

      await db.delete(programDocumentTemplates).where(eq(programDocumentTemplates.id, parseInt(docId)));

      res.json({ success: true });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Delete program document error:', error);
      res.status(500).json({ error: 'Failed to delete document template' });
    }
  });

  // ==================== PROGRAM TASK TEMPLATES ROUTES ====================

  // Add task template to program
  app.post('/api/admin/programs/:programId/tasks', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { taskName, taskDescription, taskCategory, priority, sortOrder, stepId, assignToRole } = req.body;

      if (!taskName) {
        return res.status(400).json({ error: 'Task name is required' });
      }

      const [task] = await db.insert(programTaskTemplates).values({
        programId: parseInt(programId),
        taskName,
        taskDescription,
        taskCategory,
        priority: priority || 'medium',
        sortOrder: sortOrder || 0,
        stepId: stepId || null,
        assignToRole: assignToRole || 'admin',
      }).returning();

      res.json({ task });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Add program task error:', error);
      res.status(500).json({ error: 'Failed to add task template' });
    }
  });

  // Batch update task step assignments (MUST be before :taskId route)
  app.put('/api/admin/programs/:programId/tasks/batch-step', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { assignments } = req.body;
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ error: 'Assignments must be an array' });
      }
      await db.transaction(async (tx) => {
        for (const assignment of assignments) {
          const updateData: any = { stepId: assignment.stepId ?? null };
          if (assignment.assignToRole !== undefined) updateData.assignToRole = assignment.assignToRole;
          await tx.update(programTaskTemplates)
            .set(updateData)
            .where(eq(programTaskTemplates.id, assignment.taskId));
        }
      });
      res.json({ success: true });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Batch update task steps error:', error);
      res.status(500).json({ error: 'Failed to update task assignments' });
    }
  });

  // Update task template
  app.put('/api/admin/programs/:programId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId, taskId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { taskName, taskDescription, taskCategory, priority, sortOrder, stepId, assignToRole } = req.body;

      const updateData: any = {};
      if (taskName !== undefined) updateData.taskName = taskName;
      if (taskDescription !== undefined) updateData.taskDescription = taskDescription;
      if (taskCategory !== undefined) updateData.taskCategory = taskCategory;
      if (priority !== undefined) updateData.priority = priority;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (stepId !== undefined) updateData.stepId = stepId;
      if (assignToRole !== undefined) updateData.assignToRole = assignToRole;

      const [task] = await db.update(programTaskTemplates)
        .set(updateData)
        .where(eq(programTaskTemplates.id, parseInt(taskId)))
        .returning();

      res.json({ task });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(req.params.programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Update program task error:', error);
      res.status(500).json({ error: 'Failed to update task template' });
    }
  });

  // Delete task template
  app.delete('/api/admin/programs/:programId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId, taskId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;

      await db.delete(programTaskTemplates).where(eq(programTaskTemplates.id, parseInt(taskId)));

      res.json({ success: true });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Delete program task error:', error);
      res.status(500).json({ error: 'Failed to delete task template' });
    }
  });

  // ==================== WORKFLOW STEP DEFINITIONS ROUTES ====================

  // Get all workflow step definitions
  app.get('/api/admin/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const steps = await db.select().from(workflowStepDefinitions)
        .where(eq(workflowStepDefinitions.isActive, true))
        .orderBy(workflowStepDefinitions.sortOrder);
      res.json(steps);
    } catch (error) {
      console.error('Get workflow steps error:', error);
      res.status(500).json({ error: 'Failed to load workflow steps' });
    }
  });

  // Create workflow step definition
  app.post('/api/admin/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, color, icon } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Step name is required' });
      }
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const existing = await db.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.key, key));
      if (existing.length > 0) {
        return res.status(400).json({ error: 'A step with this name already exists' });
      }
      const maxOrder = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(workflowStepDefinitions);
      const [step] = await db.insert(workflowStepDefinitions).values({
        name,
        key,
        description: description || null,
        color: color || '#6366f1',
        icon: icon || null,
        isDefault: false,
        isActive: true,
        sortOrder: (maxOrder[0]?.max || 0) + 1,
      }).returning();
      res.json({ step });
    } catch (error) {
      console.error('Create workflow step error:', error);
      res.status(500).json({ error: 'Failed to create workflow step' });
    }
  });

  // Update workflow step definition
  app.put('/api/admin/workflow-steps/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, color, icon } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (color !== undefined) updateData.color = color;
      if (icon !== undefined) updateData.icon = icon;
      const [step] = await db.update(workflowStepDefinitions)
        .set(updateData)
        .where(eq(workflowStepDefinitions.id, parseInt(id)))
        .returning();
      res.json({ step });
    } catch (error) {
      console.error('Update workflow step error:', error);
      res.status(500).json({ error: 'Failed to update workflow step' });
    }
  });

  // Delete (soft) workflow step definition
  app.delete('/api/admin/workflow-steps/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await db.update(workflowStepDefinitions)
        .set({ isActive: false })
        .where(eq(workflowStepDefinitions.id, parseInt(id)));
      res.json({ success: true });
    } catch (error) {
      console.error('Delete workflow step error:', error);
      res.status(500).json({ error: 'Failed to delete workflow step' });
    }
  });

  // ==================== PROGRAM WORKFLOW STEPS ROUTES ====================

  // Get workflow steps for a program
  app.get('/api/admin/programs/:programId/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const steps = await db.select({
        id: programWorkflowSteps.id,
        programId: programWorkflowSteps.programId,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
        stepOrder: programWorkflowSteps.stepOrder,
        isRequired: programWorkflowSteps.isRequired,
        estimatedDays: programWorkflowSteps.estimatedDays,
        createdAt: programWorkflowSteps.createdAt,
        definition: {
          id: workflowStepDefinitions.id,
          name: workflowStepDefinitions.name,
          key: workflowStepDefinitions.key,
          description: workflowStepDefinitions.description,
          color: workflowStepDefinitions.color,
          icon: workflowStepDefinitions.icon,
        }
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, parseInt(programId)))
        .orderBy(programWorkflowSteps.stepOrder);
      res.json(steps);
    } catch (error) {
      console.error('Get program workflow steps error:', error);
      res.status(500).json({ error: 'Failed to load workflow steps' });
    }
  });

  // Save/replace all workflow steps for a program (batch operation)
  app.put('/api/admin/programs/:programId/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { steps } = req.body;
      if (!Array.isArray(steps)) {
        return res.status(400).json({ error: 'Steps must be an array' });
      }
      const pid = parseInt(programId);
      const oldSteps = await db.select({
        id: programWorkflowSteps.id,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
      }).from(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid));

      const oldDefIdToStepId = new Map<number, number>();
      for (const s of oldSteps) {
        oldDefIdToStepId.set(s.stepDefinitionId, s.id);
      }

      await db.transaction(async (tx) => {
        await tx.delete(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid));
        if (steps.length > 0) {
          const entries = steps.map((step: any, index: number) => ({
            programId: pid,
            stepDefinitionId: step.stepDefinitionId,
            stepOrder: index + 1,
            isRequired: step.isRequired !== false,
            estimatedDays: step.estimatedDays || null,
          }));
          await tx.insert(programWorkflowSteps).values(entries);
        }
      });

      const newSteps = await db.select({
        id: programWorkflowSteps.id,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
      }).from(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid));

      const newDefIdToStepId = new Map<number, number>();
      for (const s of newSteps) {
        newDefIdToStepId.set(s.stepDefinitionId, s.id);
      }

      const oldStepIdToNew = new Map<number, number | null>();
      for (const [defId, oldId] of oldDefIdToStepId.entries()) {
        const newId = newDefIdToStepId.get(defId) ?? null;
        oldStepIdToNew.set(oldId, newId);
      }

      const docsToRemap = await db.select({ id: programDocumentTemplates.id, stepId: programDocumentTemplates.stepId })
        .from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, pid));

      for (const doc of docsToRemap) {
        if (doc.stepId) {
          const newStepId = oldStepIdToNew.get(doc.stepId) ?? null;
          if (newStepId !== doc.stepId) {
            await db.update(programDocumentTemplates)
              .set({ stepId: newStepId })
              .where(eq(programDocumentTemplates.id, doc.id));
          }
        }
      }

      const tasksToRemap = await db.select({ id: programTaskTemplates.id, stepId: programTaskTemplates.stepId })
        .from(programTaskTemplates)
        .where(eq(programTaskTemplates.programId, pid));

      for (const task of tasksToRemap) {
        if (task.stepId) {
          const newStepId = oldStepIdToNew.get(task.stepId) ?? null;
          if (newStepId !== task.stepId) {
            await db.update(programTaskTemplates)
              .set({ stepId: newStepId })
              .where(eq(programTaskTemplates.id, task.id));
          }
        }
      }

      const stagesToRemap = await db.select({ id: projectStages.id, programStepId: projectStages.programStepId })
        .from(projectStages)
        .innerJoin(projects, eq(projectStages.projectId, projects.id))
        .where(eq(projects.programId, pid));

      for (const stage of stagesToRemap) {
        if (stage.programStepId) {
          const newStepId = oldStepIdToNew.get(stage.programStepId) ?? null;
          if (newStepId !== stage.programStepId) {
            await db.update(projectStages)
              .set({ programStepId: newStepId })
              .where(eq(projectStages.id, stage.id));
          }
        }
      }
      const updated = await db.select({
        id: programWorkflowSteps.id,
        programId: programWorkflowSteps.programId,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
        stepOrder: programWorkflowSteps.stepOrder,
        isRequired: programWorkflowSteps.isRequired,
        estimatedDays: programWorkflowSteps.estimatedDays,
        createdAt: programWorkflowSteps.createdAt,
        definition: {
          id: workflowStepDefinitions.id,
          name: workflowStepDefinitions.name,
          key: workflowStepDefinitions.key,
          description: workflowStepDefinitions.description,
          color: workflowStepDefinitions.color,
          icon: workflowStepDefinitions.icon,
        }
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, parseInt(programId)))
        .orderBy(programWorkflowSteps.stepOrder);
      res.json(updated);
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Save program workflow steps error:', error);
      res.status(500).json({ error: 'Failed to save workflow steps' });
    }
  });

  // ==================== PROGRAM REVIEW RULES ROUTES ====================

  app.get('/api/admin/programs/:programId/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const programId = parseInt(req.params.programId);
      if (!await verifyProgramOwnership(req, res, programId)) return;
      const rules = await storage.getReviewRulesByProgramId(programId);
      res.json({ rules });
    } catch (error: any) {
      console.error('Get review rules error:', error);
      res.status(500).json({ error: 'Failed to fetch review rules' });
    }
  });

  app.post('/api/admin/programs/:programId/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const programId = parseInt(req.params.programId);
      if (!await verifyProgramOwnership(req, res, programId)) return;
      const { rules } = req.body;
      if (!Array.isArray(rules)) {
        return res.status(400).json({ error: 'rules must be an array' });
      }
      await storage.deleteReviewRulesByProgramId(programId);
      const created = await storage.createReviewRules(
        rules.map((r: any, idx: number) => ({
          programId,
          documentType: r.documentType || 'General',
          ruleTitle: r.ruleTitle,
          ruleDescription: r.ruleDescription || null,
          category: r.category || null,
          isActive: r.isActive !== false,
          sortOrder: idx,
        }))
      );
      const guidelinesText = created.map(r => `[${r.documentType}] ${r.ruleTitle}: ${r.ruleDescription || ''}`).join('\n');
      await db.update(loanPrograms).set({ reviewGuidelines: guidelinesText }).where(eq(loanPrograms.id, programId));
      res.json({ rules: created });
    } catch (error: any) {
      console.error('Save review rules error:', error);
      res.status(500).json({ error: 'Failed to save review rules' });
    }
  });

  app.put('/api/admin/programs/:programId/review-rules/:ruleId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ruleId = parseInt(req.params.ruleId);
      const { ruleTitle, ruleDescription, documentType, category, isActive } = req.body;
      const updated = await storage.updateReviewRule(ruleId, {
        ...(ruleTitle !== undefined && { ruleTitle }),
        ...(ruleDescription !== undefined && { ruleDescription }),
        ...(documentType !== undefined && { documentType }),
        ...(category !== undefined && { category }),
        ...(isActive !== undefined && { isActive }),
      });
      res.json(updated);
    } catch (error: any) {
      console.error('Update review rule error:', error);
      res.status(500).json({ error: 'Failed to update review rule' });
    }
  });

  app.delete('/api/admin/programs/:programId/review-rules/:ruleId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ruleId = parseInt(req.params.ruleId);
      await storage.deleteReviewRule(ruleId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete review rule error:', error);
      res.status(500).json({ error: 'Failed to delete review rule' });
    }
  });
}

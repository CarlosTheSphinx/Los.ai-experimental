import type { Express, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import multer from 'multer';
import { eq, sql, inArray, and } from 'drizzle-orm';
import { getTenantId } from '../utils/tenant';
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
  programReviewRules,
  documentReviewRules,
  pricingFieldTemplates
} from '@shared/schema';

export function registerAdminProgramsRoutes(app: Express, deps: RouteDeps) {
  const { storage, db, authenticateUser, requireAdmin, requirePermission, objectStorageService } = deps;

  async function resolveUserTenantId(userId: number): Promise<number | null> {
    const user = await storage.getUserById(userId);
    if (!user) return null;
    return getTenantId({ id: user.id, role: user.role, tenantId: user.tenantId ?? null });
  }

  async function verifyProgramOwnership(req: AuthRequest, res: Response, programId: number): Promise<boolean> {
    const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, programId));
    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return false;
    }
    const user = await storage.getUserById(req.user!.id);
    if (user?.role === 'super_admin') {
      return true;
    }
    const userTenantId = await resolveUserTenantId(req.user!.id);
    if (program.tenantId != null && userTenantId != null && program.tenantId === userTenantId) {
      return true;
    }
    if (program.createdBy === req.user!.id) {
      return true;
    }
    res.status(403).json({ error: 'Not authorized to access this program' });
    return false;
  }

  // ==================== LOAN PROGRAMS ROUTES ====================

  app.get('/api/admin/programs', authenticateUser, requireAdmin, requirePermission('programs.view'), async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      const isSuperAdmin = user?.role === 'super_admin';
      const userTenantId = isSuperAdmin ? null : await resolveUserTenantId(req.user!.id);
      const programs = await db.select().from(loanPrograms)
        .where(isSuperAdmin ? undefined : (userTenantId != null ? eq(loanPrograms.tenantId, userTenantId) : eq(loanPrograms.createdBy, req.user!.id)))
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
        minDscr, minFico,
        minUnits, maxUnits,
        termOptions, eligiblePropertyTypes,
        isActive,
        quoteFormFields,
        documents,
        tasks,
        steps,
        creditPolicyId,
        pricingMode, externalPricingConfig,
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
          minDscr: minDscr ? parseFloat(minDscr) : null,
          minFico: minFico ? parseInt(minFico) : null,
          minUnits: minUnits ? parseInt(minUnits) : null,
          maxUnits: maxUnits ? parseInt(maxUnits) : null,
          termOptions,
          eligiblePropertyTypes: eligiblePropertyTypes || [],
          quoteFormFields: quoteFormFields || null,
          isActive: isActive !== false,
          creditPolicyId: creditPolicyId ? parseInt(creditPolicyId) : null,
          createdBy: req.user!.id,
          tenantId: await resolveUserTenantId(req.user!.id),
          pricingMode: pricingMode || 'none',
          externalPricingConfig: externalPricingConfig || null,
        }).returning();

        // Create inline workflow steps if provided (must be created before docs/tasks to resolve stepIndex)
        const createdStepIds: number[] = [];
        if (steps && Array.isArray(steps) && steps.length > 0) {
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            let stepDefId = step.stepDefinitionId;

            // If no existing step definition, create a new one
            if (!stepDefId && step.stepName?.trim()) {
              const key = step.stepName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
              const existing = await tx.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.key, key));
              if (existing.length > 0) {
                stepDefId = existing[0].id;
              } else {
                const maxOrder = await tx.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(workflowStepDefinitions);
                const [newStep] = await tx.insert(workflowStepDefinitions).values({
                  name: step.stepName.trim(),
                  key,
                  sortOrder: (maxOrder[0]?.max || 0) + 1,
                  isActive: true,
                  isDefault: false,
                }).returning();
                stepDefId = newStep.id;
              }
            }

            if (stepDefId) {
              const [createdStep] = await tx.insert(programWorkflowSteps).values({
                programId: program.id,
                stepDefinitionId: stepDefId,
                stepOrder: i + 1,
                isRequired: step.isRequired !== false,
                estimatedDays: step.estimatedDays ? parseInt(step.estimatedDays) : null,
              }).returning();
              createdStepIds.push(createdStep.id);
            } else {
              createdStepIds.push(-1);
            }
          }
        }

        // Create inline document templates if provided (after steps so stepIndex can be resolved)
        if (documents && Array.isArray(documents) && documents.length > 0) {
          const validDocs = documents.filter((doc: any) => doc.documentName?.trim());
          if (validDocs.length > 0) {
            const documentEntries = validDocs.map((doc: any, index: number) => ({
              programId: program.id,
              documentName: doc.documentName.trim(),
              documentCategory: doc.documentCategory || 'other',
              documentDescription: doc.documentDescription || null,
              isRequired: doc.isRequired !== false,
              assignedTo: doc.assignedTo || 'borrower',
              visibility: doc.visibility || 'all',
              sortOrder: index,
              stepId: doc.stepIndex !== null && doc.stepIndex !== undefined && doc.stepIndex >= 0 && doc.stepIndex < createdStepIds.length && createdStepIds[doc.stepIndex] > 0 ? createdStepIds[doc.stepIndex] : null,
            }));
            await tx.insert(programDocumentTemplates).values(documentEntries);

            const docNames = validDocs.map((d: any) => d.documentName.trim());
            const existingRules = await tx.select()
              .from(documentReviewRules)
              .where(
                and(
                  inArray(documentReviewRules.documentName, docNames),
                  inArray(
                    documentReviewRules.programId,
                    tx.select({ id: loanPrograms.id }).from(loanPrograms).where(eq(loanPrograms.createdBy, req.user!.id))
                  )
                )
              );

            if (existingRules.length > 0) {
              const seenRules = new Set<string>();
              const rulesToInsert = [];
              for (const rule of existingRules) {
                const key = `${rule.documentName}::${rule.ruleName}`;
                if (!seenRules.has(key)) {
                  seenRules.add(key);
                  rulesToInsert.push({
                    programId: program.id,
                    documentCategory: rule.documentCategory,
                    documentName: rule.documentName,
                    ruleName: rule.ruleName,
                    ruleDescription: rule.ruleDescription,
                    ruleConfig: rule.ruleConfig,
                    severity: rule.severity,
                    isActive: rule.isActive,
                    createdBy: req.user!.id,
                  });
                }
              }
              if (rulesToInsert.length > 0) {
                await tx.insert(documentReviewRules).values(rulesToInsert);
              }
            }
          }
        }

        // Create inline task templates if provided (after steps so stepIndex can be resolved)
        if (tasks && Array.isArray(tasks) && tasks.length > 0) {
          const validTasks = tasks.filter((task: any) => task.taskName?.trim());
          if (validTasks.length > 0) {
            const taskEntries = validTasks.map((task: any, index: number) => ({
              programId: program.id,
              taskName: task.taskName.trim(),
              taskDescription: task.taskDescription || null,
              taskCategory: task.taskCategory || 'other',
              priority: task.priority || 'medium',
              sortOrder: index,
              stepId: task.stepIndex !== null && task.stepIndex !== undefined && task.stepIndex >= 0 && task.stepIndex < createdStepIds.length && createdStepIds[task.stepIndex] > 0 ? createdStepIds[task.stepIndex] : null,
              assignToRole: task.assignToRole || task.assignee || null,
              formTemplateId: task.formTemplateId || null,
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
      const programId = parseInt(id);

      const [existingProgram] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, programId));
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
        minDscr, minFico,
        minUnits, maxUnits,
        termOptions, eligiblePropertyTypes,
        isActive, quoteFormFields, reviewGuidelines, creditPolicyId,
        steps, documents, tasks,
        pricingMode, externalPricingConfig,
      } = req.body;

      const result = await db.transaction(async (tx) => {
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
        if (minDscr !== undefined) updateData.minDscr = minDscr ? parseFloat(minDscr) : null;
        if (minFico !== undefined) updateData.minFico = minFico ? parseInt(minFico) : null;
        if (minUnits !== undefined) updateData.minUnits = minUnits ? parseInt(minUnits) : null;
        if (maxUnits !== undefined) updateData.maxUnits = maxUnits ? parseInt(maxUnits) : null;
        if (termOptions !== undefined) updateData.termOptions = termOptions;
        if (eligiblePropertyTypes !== undefined) updateData.eligiblePropertyTypes = eligiblePropertyTypes;
        if (quoteFormFields !== undefined) updateData.quoteFormFields = quoteFormFields || null;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (reviewGuidelines !== undefined) updateData.reviewGuidelines = reviewGuidelines;
        if (creditPolicyId !== undefined) updateData.creditPolicyId = creditPolicyId ? parseInt(creditPolicyId) : null;
        if (pricingMode !== undefined) updateData.pricingMode = pricingMode;
        if (externalPricingConfig !== undefined) updateData.externalPricingConfig = externalPricingConfig;

        const [program] = await tx.update(loanPrograms)
          .set(updateData)
          .where(eq(loanPrograms.id, programId))
          .returning();

        let stepIds: number[] = [];
        if (steps && Array.isArray(steps)) {
          const existingSteps = await tx.select()
            .from(programWorkflowSteps)
            .where(eq(programWorkflowSteps.programId, programId))
            .orderBy(programWorkflowSteps.stepOrder);
          const existingStepMap = new Map(existingSteps.map(s => [s.id, s]));
          const keptStepIds = new Set<number>();

          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            let stepDefId = step.stepDefinitionId;

            if (!stepDefId && step.stepName?.trim()) {
              const key = step.stepName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
              const existing = await tx.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.key, key));
              if (existing.length > 0) {
                stepDefId = existing[0].id;
              } else {
                const maxOrder = await tx.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(workflowStepDefinitions);
                const [newStep] = await tx.insert(workflowStepDefinitions).values({
                  name: step.stepName.trim(),
                  key,
                  sortOrder: (maxOrder[0]?.max || 0) + 1,
                  isActive: true,
                  isDefault: false,
                }).returning();
                stepDefId = newStep.id;
              }
            }

            if (stepDefId) {
              if (step.id && existingStepMap.has(step.id)) {
                await tx.update(programWorkflowSteps)
                  .set({
                    stepDefinitionId: stepDefId,
                    stepOrder: i + 1,
                    isRequired: step.isRequired !== false,
                    estimatedDays: step.estimatedDays ? parseInt(step.estimatedDays) : null,
                  })
                  .where(eq(programWorkflowSteps.id, step.id));
                stepIds.push(step.id);
                keptStepIds.add(step.id);
              } else {
                const [createdStep] = await tx.insert(programWorkflowSteps).values({
                  programId,
                  stepDefinitionId: stepDefId,
                  stepOrder: i + 1,
                  isRequired: step.isRequired !== false,
                  estimatedDays: step.estimatedDays ? parseInt(step.estimatedDays) : null,
                }).returning();
                stepIds.push(createdStep.id);
              }
            } else {
              stepIds.push(-1);
            }
          }

          const removedStepIds = existingSteps.filter(s => !keptStepIds.has(s.id)).map(s => s.id);
          if (removedStepIds.length > 0) {
            await tx.delete(programWorkflowSteps).where(inArray(programWorkflowSteps.id, removedStepIds));
          }
        }

        if (stepIds.length === 0 && (documents || tasks)) {
          const existingSteps = await tx.select({ id: programWorkflowSteps.id })
            .from(programWorkflowSteps)
            .where(eq(programWorkflowSteps.programId, programId))
            .orderBy(programWorkflowSteps.stepOrder);
          stepIds = existingSteps.map(s => s.id);
        }

        if (documents && Array.isArray(documents)) {
          const existingDocs = await tx.select()
            .from(programDocumentTemplates)
            .where(eq(programDocumentTemplates.programId, programId));
          const existingDocMap = new Map(existingDocs.map(d => [d.id, d]));
          const keptDocIds = new Set<number>();

          const validDocs = documents.filter((doc: any) => doc.documentName?.trim());
          for (let i = 0; i < validDocs.length; i++) {
            const doc = validDocs[i];
            const resolvedStepId = doc.stepIndex !== null && doc.stepIndex !== undefined && doc.stepIndex >= 0 && doc.stepIndex < stepIds.length && stepIds[doc.stepIndex] > 0 ? stepIds[doc.stepIndex] : null;

            if (doc.id && existingDocMap.has(doc.id)) {
              await tx.update(programDocumentTemplates)
                .set({
                  documentName: doc.documentName.trim(),
                  documentCategory: doc.documentCategory || 'other',
                  documentDescription: doc.documentDescription || null,
                  isRequired: doc.isRequired !== false,
                  assignedTo: doc.assignedTo || 'borrower',
                  visibility: doc.visibility || 'all',
                  sortOrder: i,
                  stepId: resolvedStepId,
                })
                .where(eq(programDocumentTemplates.id, doc.id));
              keptDocIds.add(doc.id);
            } else {
              await tx.insert(programDocumentTemplates).values({
                programId,
                documentName: doc.documentName.trim(),
                documentCategory: doc.documentCategory || 'other',
                documentDescription: doc.documentDescription || null,
                isRequired: doc.isRequired !== false,
                assignedTo: doc.assignedTo || 'borrower',
                visibility: doc.visibility || 'all',
                sortOrder: i,
                stepId: resolvedStepId,
              });
            }
          }

          const removedDocIds = existingDocs.filter(d => !keptDocIds.has(d.id)).map(d => d.id);
          if (removedDocIds.length > 0) {
            await tx.delete(programDocumentTemplates).where(inArray(programDocumentTemplates.id, removedDocIds));
          }
        }

        if (tasks && Array.isArray(tasks)) {
          const existingTasks = await tx.select()
            .from(programTaskTemplates)
            .where(eq(programTaskTemplates.programId, programId));
          const existingTaskMap = new Map(existingTasks.map(t => [t.id, t]));
          const keptTaskIds = new Set<number>();

          const validTasks = tasks.filter((task: any) => task.taskName?.trim());
          for (let i = 0; i < validTasks.length; i++) {
            const task = validTasks[i];
            const resolvedStepId = task.stepIndex !== null && task.stepIndex !== undefined && task.stepIndex >= 0 && task.stepIndex < stepIds.length && stepIds[task.stepIndex] > 0 ? stepIds[task.stepIndex] : null;

            if (task.id && existingTaskMap.has(task.id)) {
              await tx.update(programTaskTemplates)
                .set({
                  taskName: task.taskName.trim(),
                  taskDescription: task.taskDescription || null,
                  taskCategory: task.taskCategory || 'other',
                  priority: task.priority || 'medium',
                  sortOrder: i,
                  stepId: resolvedStepId,
                  assignToRole: task.assignToRole || task.assignee || null,
                  formTemplateId: task.formTemplateId || null,
                })
                .where(eq(programTaskTemplates.id, task.id));
              keptTaskIds.add(task.id);
            } else {
              await tx.insert(programTaskTemplates).values({
                programId,
                taskName: task.taskName.trim(),
                taskDescription: task.taskDescription || null,
                taskCategory: task.taskCategory || 'other',
                priority: task.priority || 'medium',
                sortOrder: i,
                stepId: resolvedStepId,
                assignToRole: task.assignToRole || task.assignee || null,
                formTemplateId: task.formTemplateId || null,
              });
            }
          }

          const removedTaskIds = existingTasks.filter(t => !keptTaskIds.has(t.id)).map(t => t.id);
          if (removedTaskIds.length > 0) {
            await tx.delete(programTaskTemplates).where(inArray(programTaskTemplates.id, removedTaskIds));
          }
        }

        return program;
      });

      res.json({ program: result });

      if (steps || documents || tasks) {
        const { syncProgramToProjects } = await import('../services/projectPipeline');
        syncProgramToProjects(programId).catch(err => console.error('[ProgramSync] Error syncing after program update:', err));
      }
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

      const newIsActive = !program.isActive;
      const [updated] = await db.update(loanPrograms)
        .set({ isActive: newIsActive, updatedAt: new Date() })
        .where(eq(loanPrograms.id, parseInt(id)))
        .returning();

      console.log(`Program ${id} toggled: isActive=${updated.isActive} by user ${req.user!.id}`);
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

  // Duplicate loan program
  app.post('/api/admin/programs/:id/duplicate', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const programId = parseInt(id);

      const [sourceProgram] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, programId));
      if (!sourceProgram) {
        return res.status(404).json({ error: 'Program not found' });
      }

      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin') {
        const userTenantId = await resolveUserTenantId(req.user!.id);
        const hasTenantAccess = sourceProgram.tenantId != null && userTenantId != null && sourceProgram.tenantId === userTenantId;
        if (!hasTenantAccess && sourceProgram.createdBy !== req.user!.id) {
          return res.status(403).json({ error: 'Not authorized to duplicate this program' });
        }
      }

      const sourceDocs = await db.select().from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, programId))
        .orderBy(programDocumentTemplates.sortOrder);

      const sourceTasks = await db.select().from(programTaskTemplates)
        .where(eq(programTaskTemplates.programId, programId))
        .orderBy(programTaskTemplates.sortOrder);

      const sourceSteps = await db.select().from(programWorkflowSteps)
        .where(eq(programWorkflowSteps.programId, programId))
        .orderBy(programWorkflowSteps.stepOrder);

      const result = await db.transaction(async (tx) => {
        const [newProgram] = await tx.insert(loanPrograms).values({
          name: `${sourceProgram.name} (Copy)`,
          description: sourceProgram.description,
          loanType: sourceProgram.loanType,
          minLoanAmount: sourceProgram.minLoanAmount,
          maxLoanAmount: sourceProgram.maxLoanAmount,
          minLtv: sourceProgram.minLtv,
          maxLtv: sourceProgram.maxLtv,
          minInterestRate: sourceProgram.minInterestRate,
          maxInterestRate: sourceProgram.maxInterestRate,
          minDscr: sourceProgram.minDscr,
          minFico: sourceProgram.minFico,
          minUnits: sourceProgram.minUnits,
          maxUnits: sourceProgram.maxUnits,
          termOptions: sourceProgram.termOptions,
          eligiblePropertyTypes: sourceProgram.eligiblePropertyTypes,
          quoteFormFields: sourceProgram.quoteFormFields,
          yspEnabled: sourceProgram.yspEnabled,
          yspBrokerCanToggle: sourceProgram.yspBrokerCanToggle,
          yspFixedAmount: sourceProgram.yspFixedAmount,
          yspMin: sourceProgram.yspMin,
          yspMax: sourceProgram.yspMax,
          yspStep: sourceProgram.yspStep,
          basePoints: sourceProgram.basePoints,
          basePointsMin: sourceProgram.basePointsMin,
          basePointsMax: sourceProgram.basePointsMax,
          brokerPointsEnabled: sourceProgram.brokerPointsEnabled,
          brokerPointsMax: sourceProgram.brokerPointsMax,
          brokerPointsStep: sourceProgram.brokerPointsStep,
          isActive: false,
          creditPolicyId: sourceProgram.creditPolicyId,
          createdBy: req.user!.id,
          tenantId: await resolveUserTenantId(req.user!.id),
          reviewGuidelines: sourceProgram.reviewGuidelines,
        }).returning();

        const stepIdMap = new Map<number, number>();
        for (const step of sourceSteps) {
          const [newStep] = await tx.insert(programWorkflowSteps).values({
            programId: newProgram.id,
            stepDefinitionId: step.stepDefinitionId,
            stepOrder: step.stepOrder,
            isRequired: step.isRequired,
            estimatedDays: step.estimatedDays,
          }).returning();
          stepIdMap.set(step.id, newStep.id);
        }

        for (const doc of sourceDocs) {
          await tx.insert(programDocumentTemplates).values({
            programId: newProgram.id,
            documentName: doc.documentName,
            documentCategory: doc.documentCategory,
            documentDescription: doc.documentDescription,
            isRequired: doc.isRequired,
            sortOrder: doc.sortOrder,
            stepId: doc.stepId ? (stepIdMap.get(doc.stepId) || null) : null,
            assignedTo: doc.assignedTo,
            visibility: doc.visibility,
            templateUrl: doc.templateUrl,
            templateFileName: doc.templateFileName,
          });
        }

        for (const task of sourceTasks) {
          await tx.insert(programTaskTemplates).values({
            programId: newProgram.id,
            taskName: task.taskName,
            taskDescription: task.taskDescription,
            taskCategory: task.taskCategory,
            priority: task.priority,
            sortOrder: task.sortOrder,
            stepId: task.stepId ? (stepIdMap.get(task.stepId) || null) : null,
            assignToRole: task.assignToRole || null,
            formTemplateId: task.formTemplateId || null,
          });
        }

        return newProgram;
      });

      res.json({ program: result });
    } catch (error) {
      console.error('Duplicate program error:', error);
      res.status(500).json({ error: 'Failed to duplicate program' });
    }
  });

  // ==================== PROGRAM DOCUMENT TEMPLATES ROUTES ====================

  // Get lender's document library (all unique documents across their programs, with AI rules)
  app.get('/api/admin/document-library', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      const isSuperAdmin = user?.role === 'super_admin';

      const userProgramsQuery = db.select({ id: loanPrograms.id }).from(loanPrograms);
      const userPrograms = isSuperAdmin
        ? await userProgramsQuery
        : await userProgramsQuery.where(eq(loanPrograms.createdBy, req.user!.id));
      const programIds = userPrograms.map(p => p.id);

      if (programIds.length === 0) {
        return res.json({ documents: [] });
      }

      const allDocs = await db.select({
        documentName: programDocumentTemplates.documentName,
        documentCategory: programDocumentTemplates.documentCategory,
        assignedTo: programDocumentTemplates.assignedTo,
        visibility: programDocumentTemplates.visibility,
        isRequired: programDocumentTemplates.isRequired,
        templateUrl: programDocumentTemplates.templateUrl,
        templateFileName: programDocumentTemplates.templateFileName,
      })
        .from(programDocumentTemplates)
        .where(inArray(programDocumentTemplates.programId, programIds));

      const uniqueDocsMap = new Map<string, {
        documentName: string;
        documentCategory: string;
        assignedTo: string | null;
        visibility: string | null;
        isRequired: boolean;
        templateUrl: string | null;
        templateFileName: string | null;
      }>();

      for (const doc of allDocs) {
        if (!uniqueDocsMap.has(doc.documentName)) {
          uniqueDocsMap.set(doc.documentName, {
            documentName: doc.documentName,
            documentCategory: doc.documentCategory,
            assignedTo: doc.assignedTo,
            visibility: doc.visibility,
            isRequired: doc.isRequired,
            templateUrl: doc.templateUrl,
            templateFileName: doc.templateFileName,
          });
        } else if (doc.templateUrl && !uniqueDocsMap.get(doc.documentName)!.templateUrl) {
          const existing = uniqueDocsMap.get(doc.documentName)!;
          existing.templateUrl = doc.templateUrl;
          existing.templateFileName = doc.templateFileName;
        }
      }

      const allRules = await db.select()
        .from(documentReviewRules)
        .where(inArray(documentReviewRules.programId, programIds));

      const rulesByDocName = new Map<string, any[]>();
      for (const rule of allRules) {
        const existing = rulesByDocName.get(rule.documentName) || [];
        const alreadyHas = existing.some(r => r.ruleName === rule.ruleName);
        if (!alreadyHas) {
          existing.push({
            ruleName: rule.ruleName,
            ruleDescription: rule.ruleDescription,
            ruleConfig: rule.ruleConfig,
            severity: rule.severity,
            documentCategory: rule.documentCategory,
            isActive: rule.isActive,
          });
          rulesByDocName.set(rule.documentName, existing);
        }
      }

      const documents = Array.from(uniqueDocsMap.values()).map(doc => ({
        ...doc,
        rules: rulesByDocName.get(doc.documentName) || [],
      }));

      res.json({ documents });
    } catch (error) {
      console.error('Get document library error:', error);
      res.status(500).json({ error: 'Failed to load document library' });
    }
  });

  // Add document template to program
  app.post('/api/admin/programs/:programId/documents', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder, stepId, visibility, assignedTo } = req.body;

      if (!documentName || !documentCategory) {
        return res.status(400).json({ error: 'Document name and category are required' });
      }

      const pid = parseInt(programId);
      const [doc] = await db.insert(programDocumentTemplates).values({
        programId: pid,
        documentName,
        documentCategory,
        documentDescription,
        isRequired: isRequired !== false,
        assignedTo: assignedTo || 'borrower',
        visibility: visibility || 'all',
        sortOrder: sortOrder || 0,
        stepId: stepId || null,
      }).returning();

      const existingRules = await db.select()
        .from(documentReviewRules)
        .where(
          and(
            eq(documentReviewRules.documentName, documentName),
            inArray(
              documentReviewRules.programId,
              db.select({ id: loanPrograms.id }).from(loanPrograms).where(eq(loanPrograms.createdBy, req.user!.id))
            )
          )
        );

      if (existingRules.length > 0) {
        const seenRules = new Set<string>();
        const rulesToInsert = [];
        for (const rule of existingRules) {
          const key = `${rule.documentName}::${rule.ruleName}`;
          if (!seenRules.has(key) && rule.programId !== pid) {
            seenRules.add(key);
            rulesToInsert.push({
              programId: pid,
              documentCategory: rule.documentCategory,
              documentName: rule.documentName,
              ruleName: rule.ruleName,
              ruleDescription: rule.ruleDescription,
              ruleConfig: rule.ruleConfig,
              severity: rule.severity,
              isActive: rule.isActive,
              createdBy: req.user!.id,
            });
          }
        }
        if (rulesToInsert.length > 0) {
          await db.insert(documentReviewRules).values(rulesToInsert);
        }
      }

      res.json({ document: doc });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(pid).catch(err => console.error('[ProgramSync] Error syncing after document add:', err));
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
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('[ProgramSync] Error syncing after document batch-step update:', err));
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
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder, stepId, templateUrl, templateFileName } = req.body;

      const updateData: any = {};
      if (documentName !== undefined) updateData.documentName = documentName;
      if (documentCategory !== undefined) updateData.documentCategory = documentCategory;
      if (documentDescription !== undefined) updateData.documentDescription = documentDescription;
      if (isRequired !== undefined) updateData.isRequired = isRequired;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (stepId !== undefined) updateData.stepId = stepId;
      if (templateUrl !== undefined) updateData.templateUrl = templateUrl;
      if (templateFileName !== undefined) updateData.templateFileName = templateFileName;

      const [doc] = await db.update(programDocumentTemplates)
        .set(updateData)
        .where(eq(programDocumentTemplates.id, parseInt(docId)))
        .returning();

      res.json({ document: doc });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(req.params.programId)).catch(err => console.error('[ProgramSync] Error syncing after document update:', err));
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
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('[ProgramSync] Error syncing after document delete:', err));
    } catch (error) {
      console.error('Delete program document error:', error);
      res.status(500).json({ error: 'Failed to delete document template' });
    }
  });

  // ==================== PROGRAM DOCUMENT TEMPLATE UPLOADS ====================

  // Configure multer for in-memory file uploads (limited to PDF files)
  const uploadMemory = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
      const allowedMimeTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const allowedExtensions = ['.pdf', '.doc', '.docx'];
      const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();

      if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only PDF and Word documents are allowed'));
      }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
  });

  // Upload template for document
  app.post('/api/admin/programs/:programId/documents/:docId/template',
    authenticateUser,
    requireAdmin,
    uploadMemory.single('file'),
    async (req: AuthRequest, res: Response) => {
      try {
        const { programId, docId } = req.params;
        if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;

        if (!req.file) {
          return res.status(400).json({ error: 'No file provided' });
        }

        // Get the document to verify it exists
        const [doc] = await db.select().from(programDocumentTemplates)
          .where(eq(programDocumentTemplates.id, parseInt(docId)));

        if (!doc) {
          return res.status(404).json({ error: 'Document template not found' });
        }

        const result = await objectStorageService.uploadFile(
          req.file.buffer,
          `programs/${programId}/documents/${docId}/${Date.now()}-${req.file.originalname}`,
          req.file.mimetype || 'application/octet-stream'
        );
        const objectPath = result.objectPath;

        const [updated] = await db.update(programDocumentTemplates)
          .set({
            templateUrl: objectPath,
            templateFileName: req.file.originalname
          })
          .where(eq(programDocumentTemplates.id, parseInt(docId)))
          .returning();

        res.json({ document: updated });
      } catch (error) {
        console.error('Upload template error:', error);
        if (error instanceof Error && error.message.includes('Only')) {
          return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to upload template' });
      }
    }
  );

  // Delete template for document
  app.delete('/api/admin/programs/:programId/documents/:docId/template',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { programId, docId } = req.params;
        if (!await verifyProgramOwnership(req, res, parseInt(programId))) return;

        // Get the document to verify it exists
        const [doc] = await db.select().from(programDocumentTemplates)
          .where(eq(programDocumentTemplates.id, parseInt(docId)));

        if (!doc) {
          return res.status(404).json({ error: 'Document template not found' });
        }

        // If there's a templateUrl, delete it from storage
        if (doc.templateUrl) {
          try {
            // You may want to add a method to objectStorageService to delete files
            // For now, we'll just clear the database fields
            // await objectStorageService.deleteObject(doc.templateUrl);
          } catch (storageError) {
            console.error('Error deleting file from storage:', storageError);
            // Continue anyway - clear the database record
          }
        }

        // Clear template fields
        const [updated] = await db.update(programDocumentTemplates)
          .set({
            templateUrl: null,
            templateFileName: null
          })
          .where(eq(programDocumentTemplates.id, parseInt(docId)))
          .returning();

        res.json({ document: updated, success: true });
      } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Failed to delete template' });
      }
    }
  );

  // Download/stream template for document (authenticated, not admin-only)
  app.get('/api/programs/:programId/documents/:docId/template',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const { programId, docId } = req.params;

        // Get the document
        const [doc] = await db.select().from(programDocumentTemplates)
          .where(eq(programDocumentTemplates.id, parseInt(docId)));

        if (!doc) {
          return res.status(404).json({ error: 'Document template not found' });
        }

        if (!doc.templateUrl) {
          return res.status(404).json({ error: 'No template file available for this document' });
        }

        // For now, return the URL/path. In a production scenario, you might:
        // 1. Stream the file directly
        // 2. Return a presigned download URL
        // 3. Check permissions before allowing download
        res.json({
          fileName: doc.templateFileName,
          templateUrl: doc.templateUrl,
          documentName: doc.documentName
        });
      } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Failed to retrieve template' });
      }
    }
  );

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
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('[ProgramSync] Error syncing after task add:', err));
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
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('[ProgramSync] Error syncing after task batch-step update:', err));
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
      const { taskName, taskDescription, taskCategory, priority, sortOrder, stepId, assignToRole, formTemplateId } = req.body;

      const updateData: any = {};
      if (taskName !== undefined) updateData.taskName = taskName;
      if (taskDescription !== undefined) updateData.taskDescription = taskDescription;
      if (taskCategory !== undefined) updateData.taskCategory = taskCategory;
      if (priority !== undefined) updateData.priority = priority;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (stepId !== undefined) updateData.stepId = stepId;
      if (assignToRole !== undefined) updateData.assignToRole = assignToRole;
      if (formTemplateId !== undefined) updateData.formTemplateId = formTemplateId;

      const [task] = await db.update(programTaskTemplates)
        .set(updateData)
        .where(eq(programTaskTemplates.id, parseInt(taskId)))
        .returning();

      res.json({ task });
      const { syncProgramToProjects } = await import('../services/projectPipeline');
      syncProgramToProjects(parseInt(req.params.programId)).catch(err => console.error('[ProgramSync] Error syncing after task update:', err));
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
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('[ProgramSync] Error syncing after task delete:', err));
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
            color: step.color || null,
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
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('[ProgramSync] Error syncing after workflow steps update:', err));
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
      const created = await db.transaction(async (tx) => {
        await tx.delete(programReviewRules).where(eq(programReviewRules.programId, programId));
        const ruleValues = rules.map((r: any, idx: number) => ({
          programId,
          documentType: r.documentType || 'General',
          ruleTitle: r.ruleTitle,
          ruleDescription: r.ruleDescription || null,
          ruleType: r.ruleType || 'general',
          severity: r.severity || 'fail',
          category: r.category || null,
          isActive: r.isActive !== false,
          sortOrder: idx,
        }));
        const inserted = ruleValues.length > 0
          ? await tx.insert(programReviewRules).values(ruleValues).returning()
          : [];
        const guidelinesText = inserted.map(r => `[${r.documentType}] ${r.ruleTitle}: ${r.ruleDescription || ''}`).join('\n');
        await tx.update(loanPrograms).set({ reviewGuidelines: guidelinesText }).where(eq(loanPrograms.id, programId));
        return inserted;
      });
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

  // Get quote form fields for a program
  app.get('/api/programs/:programId/quote-fields', async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(programId)));

      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      // If program has configured quote form fields, return them
      if (program.quoteFormFields) {
        const fields = typeof program.quoteFormFields === 'string'
          ? JSON.parse(program.quoteFormFields)
          : program.quoteFormFields;
        return res.json({ quoteFormFields: fields });
      }

      // Otherwise, return default fields based on loan type
      const defaultFields = program.loanType?.toLowerCase() === 'dscr'
        ? [
            { fieldKey: "loanAmount", label: "Loan Amount", required: true, visible: true },
            { fieldKey: "propertyValue", label: "Property Value", required: true, visible: true },
            { fieldKey: "loanPurpose", label: "Loan Purpose", required: true, visible: true },
            { fieldKey: "loanType", label: "Loan Type (Fixed/ARM)", required: true, visible: true },
            { fieldKey: "propertyType", label: "Property Type", required: true, visible: true },
            { fieldKey: "ficoScore", label: "FICO Score", required: true, visible: true },
            { fieldKey: "grossMonthlyRent", label: "Gross Monthly Rent", required: false, visible: true },
            { fieldKey: "annualTaxes", label: "Annual Taxes", required: false, visible: true },
            { fieldKey: "annualInsurance", label: "Annual Insurance", required: false, visible: true },
            { fieldKey: "interestOnly", label: "Interest Only", required: false, visible: true },
            { fieldKey: "prepaymentPenalty", label: "Prepayment Penalty", required: false, visible: true },
            { fieldKey: "appraisalValue", label: "Appraisal Value", required: false, visible: true },
          ]
        : [
            { fieldKey: "loanType", label: "Loan Type (Light/Heavy Rehab)", required: true, visible: true },
            { fieldKey: "purpose", label: "Purpose (Purchase/Refi)", required: true, visible: true },
            { fieldKey: "asIsValue", label: "As-Is Value", required: true, visible: true },
            { fieldKey: "arv", label: "After Repair Value (ARV)", required: true, visible: true },
            { fieldKey: "rehabBudget", label: "Rehab Budget", required: true, visible: true },
            { fieldKey: "propertyType", label: "Property Type", required: true, visible: true },
            { fieldKey: "ficoScore", label: "FICO Score", required: true, visible: true },
            { fieldKey: "propertyUnits", label: "Property Units", required: false, visible: true },
            { fieldKey: "isMidstream", label: "Is Midstream", required: false, visible: true },
            { fieldKey: "borrowingEntityType", label: "Borrowing Entity Type", required: false, visible: true },
            { fieldKey: "completedProjects", label: "Completed Projects", required: false, visible: true },
            { fieldKey: "hasFullGuaranty", label: "Has Full Guaranty", required: false, visible: true },
            { fieldKey: "exitStrategy", label: "Exit Strategy", required: false, visible: true },
            { fieldKey: "appraisalValue", label: "Appraisal Value", required: false, visible: true },
          ];

      res.json({ quoteFormFields: defaultFields });
    } catch (error) {
      console.error('Get quote fields error:', error);
      res.status(500).json({ error: 'Failed to get quote fields' });
    }
  });

  // ==================== PRICING FIELD TEMPLATES ====================

  app.get('/api/admin/pricing-templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = await resolveUserTenantId(req.user!.id);
      const templates = await db.select()
        .from(pricingFieldTemplates)
        .where(eq(pricingFieldTemplates.tenantId, tenantId!))
        .orderBy(pricingFieldTemplates.name);
      res.json({ templates });
    } catch (error) {
      console.error('List pricing templates error:', error);
      res.status(500).json({ error: 'Failed to list pricing templates' });
    }
  });

  app.post('/api/admin/pricing-templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, textInputs, dropdowns } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Template name is required' });
      }
      const tenantId = await resolveUserTenantId(req.user!.id);
      const [template] = await db.insert(pricingFieldTemplates).values({
        name: name.trim(),
        tenantId,
        textInputs: textInputs || [],
        dropdowns: dropdowns || [],
        createdBy: req.user!.id,
      }).returning();
      res.json({ template });
    } catch (error) {
      console.error('Create pricing template error:', error);
      res.status(500).json({ error: 'Failed to create pricing template' });
    }
  });

  app.delete('/api/admin/pricing-templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const tenantId = await resolveUserTenantId(req.user!.id);
      const [existing] = await db.select().from(pricingFieldTemplates)
        .where(and(eq(pricingFieldTemplates.id, templateId), eq(pricingFieldTemplates.tenantId, tenantId!)));
      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }
      await db.delete(pricingFieldTemplates).where(and(eq(pricingFieldTemplates.id, templateId), eq(pricingFieldTemplates.tenantId, tenantId!)));
      res.json({ success: true });
    } catch (error) {
      console.error('Delete pricing template error:', error);
      res.status(500).json({ error: 'Failed to delete pricing template' });
    }
  });
}

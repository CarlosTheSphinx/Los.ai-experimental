import { db } from "../db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  projects, projectStages, projectTasks, dealDocuments,
  loanPrograms, programWorkflowSteps, workflowStepDefinitions,
  programTaskTemplates, programDocumentTemplates
} from "@shared/schema";
import type * as schemaTypes from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { storage } from "../storage";

interface PipelineResult {
  stagesCreated: number;
  tasksCreated: number;
  documentsCreated: number;
  usedProgramTemplate: boolean;
  programName?: string;
}

export async function buildProjectPipelineFromProgram(
  projectId: number,
  programId: number | null | undefined,
  _quoteId?: number,
  tx?: NodePgDatabase<typeof schemaTypes>
): Promise<PipelineResult> {
  const dbOrTx = tx || db;

  if (!programId) {
    return buildProjectPipelineFromLegacyTemplate(projectId, tx);
  }

  const [program] = await dbOrTx.select()
    .from(loanPrograms)
    .where(eq(loanPrograms.id, programId))
    .limit(1);

  if (!program) {
    console.warn(`Program ${programId} not found, falling back to legacy template`);
    return buildProjectPipelineFromLegacyTemplate(projectId, tx);
  }

  const workflowSteps = await dbOrTx.select({
    stepId: programWorkflowSteps.id,
    stepOrder: programWorkflowSteps.stepOrder,
    isRequired: programWorkflowSteps.isRequired,
    estimatedDays: programWorkflowSteps.estimatedDays,
    defName: workflowStepDefinitions.name,
    defKey: workflowStepDefinitions.key,
    defDescription: workflowStepDefinitions.description,
    defColor: workflowStepDefinitions.color,
  })
    .from(programWorkflowSteps)
    .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
    .where(eq(programWorkflowSteps.programId, programId))
    .orderBy(asc(programWorkflowSteps.stepOrder));

  if (workflowSteps.length === 0) {
    console.warn(`No workflow steps for program ${programId}, falling back to legacy template`);
    return buildProjectPipelineFromLegacyTemplate(projectId, tx);
  }

  let stagesCreated = 0;
  let tasksCreated = 0;
  let documentsCreated = 0;

  const stageIdByOrder = new Map<number, number>();
  const stageIdByStepId = new Map<number, number>();

  const now = new Date();
  const defaultDueDayOffsets: Record<number, number> = { 1: 3, 2: 7, 3: 14 };
  const defaultFallbackOffset = 21;

  for (const step of workflowSteps) {
    const [stage] = await dbOrTx.insert(projectStages).values({
      projectId,
      programStepId: step.stepId,
      stageName: step.defName,
      stageKey: step.defKey,
      stageOrder: step.stepOrder,
      stageDescription: step.defDescription || null,
      estimatedDurationDays: step.estimatedDays || null,
      status: step.stepOrder === 1 ? 'in_progress' : 'pending',
      visibleToBorrower: true,
      startedAt: step.stepOrder === 1 ? new Date() : null,
    }).returning();
    stageIdByOrder.set(step.stepOrder, stage.id);
    stageIdByStepId.set(step.stepId, stage.id);
    stagesCreated++;

    const dueDayOffset = step.estimatedDays
      ? cumulativeDaysForStage(workflowSteps, step.stepOrder)
      : (defaultDueDayOffsets[step.stepOrder] ?? defaultFallbackOffset);

    const tasks = await dbOrTx.select()
      .from(programTaskTemplates)
      .where(and(
        eq(programTaskTemplates.programId, programId),
        eq(programTaskTemplates.stepId, step.stepId)
      ))
      .orderBy(asc(programTaskTemplates.sortOrder));

    for (const task of tasks) {
      const taskVisibility = task.visibility || 'all';
      const isBorrowerVisible = taskVisibility === 'all' || taskVisibility === 'borrower';
      const assignRole = (task.assignToRole || '').toLowerCase();
      const isBorrowerAssigned = assignRole === 'user' || assignRole === 'borrower';
      const taskDueDate = new Date(now);
      taskDueDate.setDate(taskDueDate.getDate() + dueDayOffset);
      await dbOrTx.insert(projectTasks).values({
        projectId,
        stageId: stage.id,
        programTaskTemplateId: task.id,
        taskTitle: task.taskName,
        taskDescription: task.taskDescription,
        taskType: task.taskCategory || 'general',
        priority: task.priority || 'medium',
        assignedTo: isBorrowerAssigned ? 'borrower' : (assignRole || 'admin'),
        requiresDocument: false,
        visibleToBorrower: isBorrowerVisible,
        borrowerActionRequired: isBorrowerAssigned || !!task.formTemplateId,
        status: 'pending',
        formTemplateId: task.formTemplateId || null,
        dueDate: taskDueDate,
      });
      tasksCreated++;
    }
  }

  const docTemplates = await dbOrTx.select()
    .from(programDocumentTemplates)
    .where(eq(programDocumentTemplates.programId, programId))
    .orderBy(asc(programDocumentTemplates.sortOrder));

  if (docTemplates.length > 0) {
    const existingDocs = await dbOrTx.select({
      id: dealDocuments.id,
      programDocumentTemplateId: dealDocuments.programDocumentTemplateId,
      documentName: dealDocuments.documentName,
    }).from(dealDocuments).where(eq(dealDocuments.dealId, projectId));

    const existingByTemplateId = new Set(existingDocs.filter(d => d.programDocumentTemplateId).map(d => d.programDocumentTemplateId));
    const existingByName = new Set(existingDocs.map(d => (d.documentName || '').trim().toLowerCase()));

    const docsToInsert = docTemplates.filter((doc) => {
      if (existingByTemplateId.has(doc.id)) return false;
      if (existingByName.has((doc.documentName || '').trim().toLowerCase())) return false;
      return true;
    });

    if (docsToInsert.length > 0) {
      const newDocuments = docsToInsert.map((doc, index) => ({
        dealId: projectId,
        programDocumentTemplateId: doc.id,
        documentName: doc.documentName,
        documentCategory: doc.documentCategory,
        documentDescription: doc.documentDescription,
        isRequired: doc.isRequired ?? true,
        assignedTo: doc.assignedTo || 'borrower',
        visibility: doc.visibility || 'all',
        sortOrder: doc.sortOrder || index,
        status: 'pending' as const,
        stageId: doc.stepId ? (stageIdByStepId.get(doc.stepId) || stageIdByOrder.get(doc.stepId) || null) : null,
      }));

      await dbOrTx.insert(dealDocuments).values(newDocuments);
      documentsCreated = newDocuments.length;
    }
  }

  // Always ensure a "Signed Agreement" placeholder exists in Stage 1
  const stage1Id = stageIdByOrder.get(1) || null;
  if (stage1Id) {
    const hasSignedAgreement = docTemplates.some(
      d => d.documentName === 'Signed Agreement'
    );
    if (!hasSignedAgreement) {
      const existingSignedAgreement = await dbOrTx.select({ id: dealDocuments.id })
        .from(dealDocuments)
        .where(and(eq(dealDocuments.dealId, projectId), eq(dealDocuments.documentName, 'Signed Agreement')));
      if (existingSignedAgreement.length === 0) {
        await dbOrTx.insert(dealDocuments).values({
          dealId: projectId,
          stageId: stage1Id,
          documentName: 'Signed Agreement',
          documentCategory: 'closing_docs',
          documentDescription: 'PandaDoc signed agreement — auto-populated when the borrower signs',
          status: 'pending',
          isRequired: true,
          assignedTo: 'admin',
          visibility: 'all',
          sortOrder: 0,
        });
        documentsCreated++;
      }
    }
  }

  return {
    stagesCreated,
    tasksCreated,
    documentsCreated,
    usedProgramTemplate: true,
    programName: program.name,
  };
}

export async function rebuildProjectPipelineFromProgram(
  projectId: number,
  programId: number,
  tx?: NodePgDatabase<typeof schemaTypes>
): Promise<PipelineResult> {
  const dbOrTx = tx || db;

  await dbOrTx.delete(projectTasks).where(eq(projectTasks.projectId, projectId));
  await dbOrTx.delete(projectStages).where(eq(projectStages.projectId, projectId));
  await dbOrTx.delete(dealDocuments).where(eq(dealDocuments.dealId, projectId));

  return buildProjectPipelineFromProgram(projectId, programId, projectId, tx);
}

export async function convertDealToProgram(
  projectId: number,
  newProgramId: number,
): Promise<PipelineResult & { documentsPreserved: number }> {
  return await db.transaction(async (tx) => {
    const [program] = await tx.select()
      .from(loanPrograms)
      .where(eq(loanPrograms.id, newProgramId))
      .limit(1);

    if (!program) {
      throw new Error(`Program ${newProgramId} not found`);
    }

    const workflowSteps = await tx.select({
      stepId: programWorkflowSteps.id,
      stepOrder: programWorkflowSteps.stepOrder,
      isRequired: programWorkflowSteps.isRequired,
      estimatedDays: programWorkflowSteps.estimatedDays,
      defName: workflowStepDefinitions.name,
      defKey: workflowStepDefinitions.key,
      defDescription: workflowStepDefinitions.description,
    })
      .from(programWorkflowSteps)
      .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
      .where(eq(programWorkflowSteps.programId, newProgramId))
      .orderBy(asc(programWorkflowSteps.stepOrder));

    const docTemplates = await tx.select()
      .from(programDocumentTemplates)
      .where(eq(programDocumentTemplates.programId, newProgramId))
      .orderBy(asc(programDocumentTemplates.sortOrder));

    const taskTemplates = await tx.select()
      .from(programTaskTemplates)
      .where(eq(programTaskTemplates.programId, newProgramId))
      .orderBy(asc(programTaskTemplates.sortOrder));

    const delta = await syncSingleProject(projectId, workflowSteps, docTemplates, taskTemplates, tx);

    return {
      stagesCreated: delta.stagesCreated,
      tasksCreated: delta.tasksCreated,
      documentsCreated: delta.documentsCreated,
      usedProgramTemplate: true,
      programName: program.name,
      documentsPreserved: delta.documentsPreserved,
    };
  });
}

export async function syncDealToCurrentProgram(
  projectId: number,
): Promise<PipelineResult & { documentsPreserved: number }> {
  const [project] = await db.select({ programId: projects.programId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project || !project.programId) {
    throw new Error('No program linked to this project');
  }

  return convertDealToProgram(projectId, project.programId);
}

async function buildProjectPipelineFromLegacyTemplate(
  projectId: number,
  tx?: NodePgDatabase<typeof schemaTypes>
): Promise<PipelineResult> {
  const { LOAN_CLOSING_STAGES } = await import('../config/loanStages');
  const dbOrTx = tx || db;

  let stagesCreated = 0;
  let tasksCreated = 0;
  let documentsCreated = 0;
  let stage1Id: number | null = null;

  for (const stageTemplate of LOAN_CLOSING_STAGES) {
    const [stage] = await dbOrTx.insert(projectStages).values({
      projectId,
      stageName: stageTemplate.stage_name,
      stageKey: stageTemplate.stage_key,
      stageOrder: stageTemplate.stage_order,
      stageDescription: stageTemplate.stage_description,
      estimatedDurationDays: stageTemplate.estimated_duration_days,
      status: stageTemplate.stage_order === 1 ? 'in_progress' : 'pending',
      visibleToBorrower: stageTemplate.visible_to_borrower,
      startedAt: stageTemplate.stage_order === 1 ? new Date() : null,
    }).returning();
    stagesCreated++;

    if (stageTemplate.stage_order === 1) {
      stage1Id = stage.id;
    }

    for (const taskTemplate of stageTemplate.tasks) {
      await dbOrTx.insert(projectTasks).values({
        projectId,
        stageId: stage.id,
        taskTitle: taskTemplate.task_title,
        taskType: taskTemplate.task_type,
        priority: taskTemplate.priority,
        requiresDocument: taskTemplate.requires_document || false,
        visibleToBorrower: taskTemplate.visible_to_borrower,
        borrowerActionRequired: taskTemplate.borrower_action_required || false,
        status: 'pending',
      });
      tasksCreated++;
    }
  }

  // Add "Signed Agreement" placeholder in Stage 1
  if (stage1Id) {
    await dbOrTx.insert(dealDocuments).values({
      dealId: projectId,
      stageId: stage1Id,
      documentName: 'Signed Agreement',
      documentCategory: 'closing_docs',
      documentDescription: 'PandaDoc signed agreement — auto-populated when the borrower signs',
      status: 'pending',
      isRequired: true,
      assignedTo: 'admin',
      visibility: 'all',
      sortOrder: 0,
    });
    documentsCreated++;
  }

  return {
    stagesCreated,
    tasksCreated,
    documentsCreated,
    usedProgramTemplate: false,
  };
}

export async function syncProgramToProjects(
  programId: number,
  tx?: NodePgDatabase<typeof schemaTypes>
): Promise<{ projectsSynced: number }> {
  const dbOrTx = tx || db;
  console.log(`[ProgramSync] Starting sync for program ${programId}`);

  const linkedProjects = await dbOrTx.select({ id: projects.id })
    .from(projects)
    .where(eq(projects.programId, programId));

  if (linkedProjects.length === 0) {
    console.log(`[ProgramSync] No linked projects found for program ${programId}`);
    return { projectsSynced: 0 };
  }

  console.log(`[ProgramSync] Found ${linkedProjects.length} linked project(s) for program ${programId}`);

  const workflowSteps = await dbOrTx.select({
    stepId: programWorkflowSteps.id,
    stepOrder: programWorkflowSteps.stepOrder,
    isRequired: programWorkflowSteps.isRequired,
    estimatedDays: programWorkflowSteps.estimatedDays,
    defName: workflowStepDefinitions.name,
    defKey: workflowStepDefinitions.key,
    defDescription: workflowStepDefinitions.description,
  })
    .from(programWorkflowSteps)
    .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
    .where(eq(programWorkflowSteps.programId, programId))
    .orderBy(asc(programWorkflowSteps.stepOrder));

  const docTemplates = await dbOrTx.select()
    .from(programDocumentTemplates)
    .where(eq(programDocumentTemplates.programId, programId))
    .orderBy(asc(programDocumentTemplates.sortOrder));

  const taskTemplates = await dbOrTx.select()
    .from(programTaskTemplates)
    .where(eq(programTaskTemplates.programId, programId))
    .orderBy(asc(programTaskTemplates.sortOrder));

  let successCount = 0;
  for (const project of linkedProjects) {
    try {
      await syncSingleProject(project.id, workflowSteps, docTemplates, taskTemplates, tx);
      successCount++;
      console.log(`[ProgramSync] Successfully synced project ${project.id}`);
    } catch (err) {
      console.error(`[ProgramSync] Failed to sync project ${project.id} for program ${programId}:`, err);
    }
  }

  console.log(`[ProgramSync] Completed sync for program ${programId}: ${successCount}/${linkedProjects.length} projects synced`);
  return { projectsSynced: successCount };
}

interface SyncDelta {
  stagesCreated: number;
  tasksCreated: number;
  documentsCreated: number;
  documentsPreserved: number;
}

async function syncSingleProject(
  projectId: number,
  workflowSteps: Array<{ stepId: number; stepOrder: number; isRequired: boolean | null; estimatedDays: number | null; defName: string; defKey: string; defDescription: string | null }>,
  docTemplates: Array<any>,
  taskTemplates: Array<any>,
  tx?: NodePgDatabase<typeof schemaTypes>
): Promise<SyncDelta> {
  const dbOrTx = tx || db;
  let stagesCreated = 0;
  let tasksCreated = 0;
  let documentsCreated = 0;
  let documentsPreserved = 0;

  const existingStages = await dbOrTx.select()
    .from(projectStages)
    .where(eq(projectStages.projectId, projectId));

  const stageByProgramStepId = new Map<number, typeof existingStages[0]>();
  const stageByKey = new Map<string, typeof existingStages[0]>();
  for (const s of existingStages) {
    if (s.programStepId) {
      stageByProgramStepId.set(s.programStepId, s);
    } else if (s.stageKey) {
      stageByKey.set(s.stageKey, s);
    }
  }

  const newStageIdByStepId = new Map<number, number>();

  for (const step of workflowSteps) {
    let existingStage = stageByProgramStepId.get(step.stepId) || stageByKey.get(step.defKey);
    if (existingStage) {
      await dbOrTx.update(projectStages)
        .set({
          programStepId: step.stepId,
          stageName: step.defName,
          stageKey: step.defKey,
          stageOrder: step.stepOrder,
          stageDescription: step.defDescription || null,
          estimatedDurationDays: step.estimatedDays || null,
        })
        .where(eq(projectStages.id, existingStage.id));
      newStageIdByStepId.set(step.stepId, existingStage.id);
    } else {
      const [stage] = await dbOrTx.insert(projectStages).values({
        projectId,
        programStepId: step.stepId,
        stageName: step.defName,
        stageKey: step.defKey,
        stageOrder: step.stepOrder,
        stageDescription: step.defDescription || null,
        estimatedDurationDays: step.estimatedDays || null,
        status: 'pending',
        visibleToBorrower: true,
        startedAt: null,
      }).returning();
      newStageIdByStepId.set(step.stepId, stage.id);
      stagesCreated++;
    }
  }

  const currentStepIds = new Set(workflowSteps.map(s => s.stepId));
  for (const stage of existingStages) {
    if (stage.programStepId && !currentStepIds.has(stage.programStepId)) {
      if (stage.status !== 'completed') {
        await dbOrTx.update(projectStages)
          .set({ status: 'skipped' })
          .where(eq(projectStages.id, stage.id));
      }
    }
  }

  const existingTasks = await dbOrTx.select()
    .from(projectTasks)
    .where(eq(projectTasks.projectId, projectId));

  const taskByTemplateId = new Map<number, typeof existingTasks[0]>();
  const taskByName = new Map<string, typeof existingTasks[0]>();
  const matchedTaskIds = new Set<number>();
  for (const t of existingTasks) {
    if (t.programTaskTemplateId) {
      taskByTemplateId.set(t.programTaskTemplateId, t);
      matchedTaskIds.add(t.id);
    } else {
      const key = (t.taskTitle || '').trim().toLowerCase();
      if (key && !taskByName.has(key)) {
        taskByName.set(key, t);
      }
    }
  }

  const currentTaskTemplateIds = new Set(taskTemplates.map(t => t.id));

  for (const template of taskTemplates) {
    const stageId = template.stepId ? (newStageIdByStepId.get(template.stepId) || null) : null;
    let existingTask = taskByTemplateId.get(template.id);
    if (!existingTask) {
      const nameKey = (template.taskName || '').trim().toLowerCase();
      const byName = taskByName.get(nameKey);
      if (byName && !matchedTaskIds.has(byName.id)) {
        existingTask = byName;
        matchedTaskIds.add(byName.id);
      }
    }

    if (existingTask) {
      const updates: Record<string, any> = {};
      if (!existingTask.programTaskTemplateId) updates.programTaskTemplateId = template.id;
      if (existingTask.taskTitle !== template.taskName) updates.taskTitle = template.taskName;
      if (existingTask.taskDescription !== template.taskDescription) updates.taskDescription = template.taskDescription;
      if (existingTask.taskType !== (template.taskCategory || 'general')) updates.taskType = template.taskCategory || 'general';
      if (existingTask.stageId !== stageId) updates.stageId = stageId;
      if (existingTask.priority !== (template.priority || 'medium')) updates.priority = template.priority || 'medium';

      if (Object.keys(updates).length > 0) {
        await dbOrTx.update(projectTasks)
          .set(updates)
          .where(eq(projectTasks.id, existingTask.id));
      }
    } else {
      const taskVis = template.visibility || 'all';
      const borrowerVis = taskVis === 'all' || taskVis === 'borrower';
      const syncAssignRole = (template.assignToRole || '').toLowerCase();
      const syncIsBorrower = syncAssignRole === 'user' || syncAssignRole === 'borrower';
      await dbOrTx.insert(projectTasks).values({
        projectId,
        stageId,
        programTaskTemplateId: template.id,
        taskTitle: template.taskName,
        taskDescription: template.taskDescription,
        taskType: template.taskCategory || 'general',
        priority: template.priority || 'medium',
        assignedTo: syncIsBorrower ? 'borrower' : (syncAssignRole || 'admin'),
        requiresDocument: false,
        visibleToBorrower: borrowerVis,
        borrowerActionRequired: syncIsBorrower || !!template.formTemplateId,
        status: 'pending',
        formTemplateId: template.formTemplateId || null,
      });
      tasksCreated++;
    }
  }

  for (const task of existingTasks) {
    if (task.programTaskTemplateId && !currentTaskTemplateIds.has(task.programTaskTemplateId)) {
      if (task.status !== 'completed') {
        await dbOrTx.update(projectTasks)
          .set({ status: 'not_applicable' })
          .where(eq(projectTasks.id, task.id));
      }
    }
  }

  const existingDocs = await dbOrTx.select()
    .from(dealDocuments)
    .where(eq(dealDocuments.dealId, projectId));

  const docByTemplateId = new Map<number, typeof existingDocs[0]>();
  const docByName = new Map<string, typeof existingDocs[0]>();
  const matchedDocIds = new Set<number>();
  for (const d of existingDocs) {
    if (d.programDocumentTemplateId) {
      docByTemplateId.set(d.programDocumentTemplateId, d);
      matchedDocIds.add(d.id);
    } else {
      const key = (d.documentName || '').trim().toLowerCase();
      if (key && !docByName.has(key)) {
        docByName.set(key, d);
      }
    }
  }

  const currentDocTemplateIds = new Set(docTemplates.map(d => d.id));

  for (const template of docTemplates) {
    const stageId = template.stepId ? (newStageIdByStepId.get(template.stepId) || null) : null;
    let existingDoc = docByTemplateId.get(template.id);
    if (!existingDoc) {
      const nameKey = (template.documentName || '').trim().toLowerCase();
      const byName = docByName.get(nameKey);
      if (byName && !matchedDocIds.has(byName.id)) {
        existingDoc = byName;
        matchedDocIds.add(byName.id);
      }
    }

    if (existingDoc) {
      const updates: Record<string, any> = {};
      if (!existingDoc.programDocumentTemplateId) updates.programDocumentTemplateId = template.id;
      if (existingDoc.documentName !== template.documentName) updates.documentName = template.documentName;
      if (existingDoc.documentCategory !== template.documentCategory) updates.documentCategory = template.documentCategory;
      if (existingDoc.documentDescription !== template.documentDescription) updates.documentDescription = template.documentDescription;
      if (existingDoc.isRequired !== (template.isRequired ?? true)) updates.isRequired = template.isRequired ?? true;
      if (existingDoc.assignedTo !== (template.assignedTo || 'borrower')) updates.assignedTo = template.assignedTo || 'borrower';
      if (existingDoc.visibility !== (template.visibility || 'all')) updates.visibility = template.visibility || 'all';
      if (existingDoc.sortOrder !== template.sortOrder) updates.sortOrder = template.sortOrder;
      if (existingDoc.stageId !== stageId) updates.stageId = stageId;

      if (Object.keys(updates).length > 0) {
        await dbOrTx.update(dealDocuments)
          .set(updates)
          .where(eq(dealDocuments.id, existingDoc.id));
      }
    } else {
      await dbOrTx.insert(dealDocuments).values({
        dealId: projectId,
        programDocumentTemplateId: template.id,
        documentName: template.documentName,
        documentCategory: template.documentCategory,
        documentDescription: template.documentDescription,
        isRequired: template.isRequired ?? true,
        assignedTo: template.assignedTo || 'borrower',
        visibility: template.visibility || 'all',
        sortOrder: template.sortOrder || 0,
        status: 'pending',
        stageId,
      });
      documentsCreated++;
    }
  }

  for (const doc of existingDocs) {
    if (doc.programDocumentTemplateId && !currentDocTemplateIds.has(doc.programDocumentTemplateId)) {
      if (!doc.filePath) {
        await dbOrTx.update(dealDocuments)
          .set({ status: 'not_applicable', isRequired: false })
          .where(eq(dealDocuments.id, doc.id));
      }
    }
    if (doc.filePath) {
      documentsPreserved++;
    }
  }

  return { stagesCreated, tasksCreated, documentsCreated, documentsPreserved };
}

function cumulativeDaysForStage(
  steps: { stepOrder: number; estimatedDays: number | null }[],
  targetOrder: number
): number {
  let total = 0;
  for (const s of steps) {
    if (s.stepOrder <= targetOrder) {
      total += s.estimatedDays || 7;
    }
  }
  return total;
}

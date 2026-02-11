import { db } from "../db";
import { 
  projects, projectStages, projectTasks, dealDocuments,
  loanPrograms, programWorkflowSteps, workflowStepDefinitions,
  programTaskTemplates, programDocumentTemplates
} from "@shared/schema";
import { eq, and, asc, isNull, isNotNull, inArray } from "drizzle-orm";
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
  _quoteId?: number
): Promise<PipelineResult> {
  if (!programId) {
    return buildProjectPipelineFromLegacyTemplate(projectId);
  }

  const [program] = await db.select()
    .from(loanPrograms)
    .where(eq(loanPrograms.id, programId))
    .limit(1);

  if (!program) {
    console.warn(`Program ${programId} not found, falling back to legacy template`);
    return buildProjectPipelineFromLegacyTemplate(projectId);
  }

  const workflowSteps = await db.select({
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
    return buildProjectPipelineFromLegacyTemplate(projectId);
  }

  let stagesCreated = 0;
  let tasksCreated = 0;
  let documentsCreated = 0;

  const stageIdByOrder = new Map<number, number>();
  const stageIdByStepId = new Map<number, number>();

  for (const step of workflowSteps) {
    const stage = await storage.createProjectStage({
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
    });
    stageIdByOrder.set(step.stepOrder, stage.id);
    stageIdByStepId.set(step.stepId, stage.id);
    stagesCreated++;

    const tasks = await db.select()
      .from(programTaskTemplates)
      .where(and(
        eq(programTaskTemplates.programId, programId),
        eq(programTaskTemplates.stepId, step.stepId)
      ))
      .orderBy(asc(programTaskTemplates.sortOrder));

    for (const task of tasks) {
      await storage.createProjectTask({
        projectId,
        stageId: stage.id,
        programTaskTemplateId: task.id,
        taskTitle: task.taskName,
        taskDescription: task.taskDescription,
        taskType: task.taskCategory || 'general',
        priority: task.priority || 'medium',
        requiresDocument: false,
        visibleToBorrower: true,
        borrowerActionRequired: false,
        status: 'pending',
      });
      tasksCreated++;
    }
  }

  const docTemplates = await db.select()
    .from(programDocumentTemplates)
    .where(eq(programDocumentTemplates.programId, programId))
    .orderBy(asc(programDocumentTemplates.sortOrder));

  if (docTemplates.length > 0) {
    const newDocuments = docTemplates.map((doc, index) => ({
      dealId: projectId,
      programDocumentTemplateId: doc.id,
      documentName: doc.documentName,
      documentCategory: doc.documentCategory,
      documentDescription: doc.documentDescription,
      isRequired: doc.isRequired ?? true,
      sortOrder: doc.sortOrder || index,
      status: 'pending' as const,
      stageId: doc.stepId ? (stageIdByStepId.get(doc.stepId) || stageIdByOrder.get(doc.stepId) || null) : null,
    }));

    await db.insert(dealDocuments).values(newDocuments);
    documentsCreated = newDocuments.length;
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
  programId: number
): Promise<PipelineResult> {
  await db.delete(projectTasks).where(eq(projectTasks.projectId, projectId));
  await db.delete(projectStages).where(eq(projectStages.projectId, projectId));
  await db.delete(dealDocuments).where(eq(dealDocuments.dealId, projectId));

  return buildProjectPipelineFromProgram(projectId, programId, projectId);
}

async function buildProjectPipelineFromLegacyTemplate(projectId: number): Promise<PipelineResult> {
  const { LOAN_CLOSING_STAGES } = await import('../config/loanStages');

  let stagesCreated = 0;
  let tasksCreated = 0;

  for (const stageTemplate of LOAN_CLOSING_STAGES) {
    const stage = await storage.createProjectStage({
      projectId,
      stageName: stageTemplate.stage_name,
      stageKey: stageTemplate.stage_key,
      stageOrder: stageTemplate.stage_order,
      stageDescription: stageTemplate.stage_description,
      estimatedDurationDays: stageTemplate.estimated_duration_days,
      status: stageTemplate.stage_order === 1 ? 'in_progress' : 'pending',
      visibleToBorrower: stageTemplate.visible_to_borrower,
      startedAt: stageTemplate.stage_order === 1 ? new Date() : null,
    });
    stagesCreated++;

    for (const taskTemplate of stageTemplate.tasks) {
      await storage.createProjectTask({
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

  return {
    stagesCreated,
    tasksCreated,
    documentsCreated: 0,
    usedProgramTemplate: false,
  };
}

export async function syncProgramToProjects(programId: number): Promise<{ projectsSynced: number }> {
  const linkedProjects = await db.select({ id: projects.id })
    .from(projects)
    .where(eq(projects.programId, programId));

  if (linkedProjects.length === 0) {
    return { projectsSynced: 0 };
  }

  const workflowSteps = await db.select({
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

  const docTemplates = await db.select()
    .from(programDocumentTemplates)
    .where(eq(programDocumentTemplates.programId, programId))
    .orderBy(asc(programDocumentTemplates.sortOrder));

  const taskTemplates = await db.select()
    .from(programTaskTemplates)
    .where(eq(programTaskTemplates.programId, programId))
    .orderBy(asc(programTaskTemplates.sortOrder));

  for (const project of linkedProjects) {
    await syncSingleProject(project.id, workflowSteps, docTemplates, taskTemplates);
  }

  return { projectsSynced: linkedProjects.length };
}

async function syncSingleProject(
  projectId: number,
  workflowSteps: Array<{ stepId: number; stepOrder: number; isRequired: boolean | null; estimatedDays: number | null; defName: string; defKey: string; defDescription: string | null }>,
  docTemplates: Array<any>,
  taskTemplates: Array<any>
) {
  const existingStages = await db.select()
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
      await db.update(projectStages)
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
      const stage = await storage.createProjectStage({
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
      });
      newStageIdByStepId.set(step.stepId, stage.id);
    }
  }

  const currentStepIds = new Set(workflowSteps.map(s => s.stepId));
  for (const stage of existingStages) {
    if (stage.programStepId && !currentStepIds.has(stage.programStepId)) {
      if (stage.status !== 'completed') {
        await db.update(projectStages)
          .set({ status: 'skipped' })
          .where(eq(projectStages.id, stage.id));
      }
    }
  }

  const existingTasks = await db.select()
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
        await db.update(projectTasks)
          .set(updates)
          .where(eq(projectTasks.id, existingTask.id));
      }
    } else {
      await storage.createProjectTask({
        projectId,
        stageId,
        programTaskTemplateId: template.id,
        taskTitle: template.taskName,
        taskDescription: template.taskDescription,
        taskType: template.taskCategory || 'general',
        priority: template.priority || 'medium',
        requiresDocument: false,
        visibleToBorrower: true,
        borrowerActionRequired: false,
        status: 'pending',
      });
    }
  }

  for (const task of existingTasks) {
    if (task.programTaskTemplateId && !currentTaskTemplateIds.has(task.programTaskTemplateId)) {
      if (task.status !== 'completed') {
        await db.update(projectTasks)
          .set({ status: 'not_applicable' })
          .where(eq(projectTasks.id, task.id));
      }
    }
  }

  const existingDocs = await db.select()
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
      if (existingDoc.sortOrder !== template.sortOrder) updates.sortOrder = template.sortOrder;
      if (existingDoc.stageId !== stageId) updates.stageId = stageId;

      if (Object.keys(updates).length > 0) {
        await db.update(dealDocuments)
          .set(updates)
          .where(eq(dealDocuments.id, existingDoc.id));
      }
    } else {
      await db.insert(dealDocuments).values({
        dealId: projectId,
        programDocumentTemplateId: template.id,
        documentName: template.documentName,
        documentCategory: template.documentCategory,
        documentDescription: template.documentDescription,
        isRequired: template.isRequired ?? true,
        sortOrder: template.sortOrder || 0,
        status: 'pending',
        stageId,
      });
    }
  }

  for (const doc of existingDocs) {
    if (doc.programDocumentTemplateId && !currentDocTemplateIds.has(doc.programDocumentTemplateId)) {
      if (!doc.filePath) {
        await db.update(dealDocuments)
          .set({ status: 'not_applicable', isRequired: false })
          .where(eq(dealDocuments.id, doc.id));
      }
    }
  }
}

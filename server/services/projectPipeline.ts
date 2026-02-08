import { db } from "../db";
import { 
  projects, projectStages, projectTasks, dealDocuments,
  loanPrograms, programWorkflowSteps, workflowStepDefinitions,
  programTaskTemplates, programDocumentTemplates
} from "@shared/schema";
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
  dealId?: number
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
        eq(programTaskTemplates.stepId, step.stepOrder)
      ))
      .orderBy(asc(programTaskTemplates.sortOrder));

    for (const task of tasks) {
      await storage.createProjectTask({
        projectId,
        stageId: stage.id,
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

  const docTargetId = dealId || projectId;
  const docTemplates = await db.select()
    .from(programDocumentTemplates)
    .where(eq(programDocumentTemplates.programId, programId))
    .orderBy(asc(programDocumentTemplates.sortOrder));

  if (docTemplates.length > 0) {
    const newDocuments = docTemplates.map((doc, index) => ({
      dealId: docTargetId,
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

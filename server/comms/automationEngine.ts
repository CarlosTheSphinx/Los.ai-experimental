import { db } from '../db';
import {
  commsAutomations,
  commsAutomationNodes,
  commsAutomationRuns,
  commsScheduledExecutions,
  type CommsAutomationRun,
  type CommsAutomationNode,
} from '@shared/schema';
import { and, eq, lte, not } from 'drizzle-orm';
import { sendCommsMessage } from './sendService';
import { projects, users } from '@shared/schema';

export type AutomationEvent =
  | 'loan_stage_change'
  | 'loan_created'
  | 'document_requested';

export interface AutomationTriggerContext {
  loanId: number;
  tenantId: number;
  stageKey?: string;
}

interface RunContext {
  loanId: number;
  tenantId: number;
}

interface SendNodeConfig {
  templateId: number;
  recipientType: 'broker' | 'borrower' | 'lender_user';
}

interface WaitNodeConfig {
  delayDays: number;
  delayHours?: number;
}

interface BranchLoanStateConfig {
  field: string;
  operator: 'eq' | 'neq';
  value: string;
  trueBranchOrderIndex: number;
  falseBranchOrderIndex: number;
}

async function resolveRecipientId(
  recipientType: 'broker' | 'borrower' | 'lender_user',
  loanId: number,
  tenantId: number
): Promise<number | null> {
  const [loan] = await db.select({
    userId: projects.userId,
    borrowerEmail: projects.borrowerEmail,
    brokerId: projects.brokerId,
  }).from(projects).where(eq(projects.id, loanId)).limit(1);

  if (!loan) return null;

  if (recipientType === 'borrower' && loan.borrowerEmail) {
    const [borrower] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.email, loan.borrowerEmail), eq(users.tenantId, tenantId)))
      .limit(1);
    return borrower?.id ?? null;
  }

  if (recipientType === 'broker' && loan.brokerId) {
    const [broker] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, loan.brokerId), eq(users.tenantId, tenantId)))
      .limit(1);
    return broker?.id ?? null;
  }

  if (recipientType === 'lender_user' && loan.userId) {
    return loan.userId;
  }

  return null;
}

async function evaluateBranchCondition(config: BranchLoanStateConfig, loanId: number): Promise<boolean> {
  const [loan] = await db.select().from(projects).where(eq(projects.id, loanId)).limit(1);
  if (!loan) return false;

  const fieldValue = String((loan as Record<string, unknown>)[config.field] ?? '');
  if (config.operator === 'eq') return fieldValue === config.value;
  if (config.operator === 'neq') return fieldValue !== config.value;
  return false;
}

async function executeNode(
  run: CommsAutomationRun,
  node: CommsAutomationNode,
  allNodes: CommsAutomationNode[],
  ctx: RunContext
): Promise<void> {
  const cfg = (node.config ?? {}) as Record<string, unknown>;

  if (node.type === 'send') {
    const sendCfg = cfg as unknown as SendNodeConfig;
    const recipientId = await resolveRecipientId(sendCfg.recipientType, ctx.loanId, ctx.tenantId);

    if (recipientId !== null) {
      await sendCommsMessage({
        tenantId: ctx.tenantId,
        templateId: sendCfg.templateId,
        recipientType: sendCfg.recipientType,
        recipientId,
        loanId: ctx.loanId,
        runId: run.id,
        nodeId: node.id,
      });
    }

    await advanceToNextNode(run, node, allNodes, ctx);
    return;
  }

  if (node.type === 'wait') {
    const waitCfg = cfg as unknown as WaitNodeConfig;
    const delayMs =
      ((waitCfg.delayDays ?? 0) * 24 * 60 * 60 * 1000) +
      ((waitCfg.delayHours ?? 0) * 60 * 60 * 1000);
    const scheduledFor = new Date(Date.now() + delayMs);

    const nextNode = getNextNodeInOrder(node, allNodes);
    if (!nextNode) {
      await completeRun(run.id);
      return;
    }

    await db.insert(commsScheduledExecutions).values({
      runId: run.id,
      nodeId: nextNode.id,
      scheduledFor,
      status: 'pending',
      attempts: 0,
    });

    await db.update(commsAutomationRuns)
      .set({ currentNodeId: nextNode.id, status: 'running' })
      .where(eq(commsAutomationRuns.id, run.id));
    return;
  }

  if (node.type === 'branch_loan_state') {
    const branchCfg = cfg as unknown as BranchLoanStateConfig;
    const conditionMet = await evaluateBranchCondition(branchCfg, ctx.loanId);
    const targetOrderIndex = conditionMet
      ? branchCfg.trueBranchOrderIndex
      : branchCfg.falseBranchOrderIndex;

    const targetNode = allNodes.find(n => n.orderIndex === targetOrderIndex);
    if (!targetNode) {
      await completeRun(run.id);
      return;
    }

    await db.update(commsAutomationRuns)
      .set({ currentNodeId: targetNode.id })
      .where(eq(commsAutomationRuns.id, run.id));

    const updatedRun = { ...run, currentNodeId: targetNode.id };
    await executeNode(updatedRun, targetNode, allNodes, ctx);
    return;
  }

  await advanceToNextNode(run, node, allNodes, ctx);
}

function getNextNodeInOrder(
  current: CommsAutomationNode,
  allNodes: CommsAutomationNode[]
): CommsAutomationNode | null {
  const sorted = [...allNodes].sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = sorted.findIndex(n => n.id === current.id);
  return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
}

async function advanceToNextNode(
  run: CommsAutomationRun,
  current: CommsAutomationNode,
  allNodes: CommsAutomationNode[],
  ctx: RunContext
): Promise<void> {
  const nextNode = getNextNodeInOrder(current, allNodes);
  if (!nextNode) {
    await completeRun(run.id);
    return;
  }

  await db.update(commsAutomationRuns)
    .set({ currentNodeId: nextNode.id })
    .where(eq(commsAutomationRuns.id, run.id));

  const updatedRun = { ...run, currentNodeId: nextNode.id };
  await executeNode(updatedRun, nextNode, allNodes, ctx);
}

async function completeRun(runId: number): Promise<void> {
  await db.update(commsAutomationRuns)
    .set({ status: 'completed' })
    .where(eq(commsAutomationRuns.id, runId));
}

export async function triggerAutomations(
  event: AutomationEvent,
  ctx: AutomationTriggerContext
): Promise<void> {
  try {
    const automations = await db.select().from(commsAutomations)
      .where(and(
        eq(commsAutomations.tenantId, ctx.tenantId),
        eq(commsAutomations.status, 'active')
      ));

    const matching = automations.filter(automation => {
      const trigger = (automation.triggerConfig ?? {}) as Record<string, unknown>;
      if (trigger.event !== event) return false;
      if (event === 'loan_stage_change' && ctx.stageKey) {
        if (trigger.stageKey && trigger.stageKey !== ctx.stageKey) return false;
      }
      return true;
    });

    for (const automation of matching) {
      await startAutomationRun(automation.id, ctx);
    }
  } catch (err) {
    console.error('[automationEngine] triggerAutomations error:', err);
  }
}

async function startAutomationRun(
  automationId: number,
  ctx: AutomationTriggerContext
): Promise<void> {
  const nodes = await db.select().from(commsAutomationNodes)
    .where(eq(commsAutomationNodes.automationId, automationId))
    .orderBy(commsAutomationNodes.orderIndex);

  if (nodes.length === 0) return;

  const firstNode = nodes[0];
  const [run] = await db.insert(commsAutomationRuns).values({
    automationId,
    subjectType: 'loan',
    subjectId: ctx.loanId,
    currentNodeId: firstNode.id,
    status: 'running',
    startedAt: new Date(),
  }).returning();

  await executeNode(run, firstNode, nodes, { loanId: ctx.loanId, tenantId: ctx.tenantId });
}

export async function processScheduledExecutions(): Promise<void> {
  try {
    const now = new Date();
    const due = await db.select().from(commsScheduledExecutions)
      .where(and(
        eq(commsScheduledExecutions.status, 'pending'),
        lte(commsScheduledExecutions.scheduledFor, now)
      ))
      .limit(50);

    for (const execution of due) {
      await db.update(commsScheduledExecutions)
        .set({ status: 'executing', lockedAt: now, attempts: execution.attempts + 1 })
        .where(and(
          eq(commsScheduledExecutions.id, execution.id),
          eq(commsScheduledExecutions.status, 'pending')
        ));

      try {
        const [run] = await db.select().from(commsAutomationRuns)
          .where(eq(commsAutomationRuns.id, execution.runId)).limit(1);

        if (!run || run.status !== 'running') {
          await db.update(commsScheduledExecutions)
            .set({ status: 'done' })
            .where(eq(commsScheduledExecutions.id, execution.id));
          continue;
        }

        const [node] = await db.select().from(commsAutomationNodes)
          .where(eq(commsAutomationNodes.id, execution.nodeId)).limit(1);

        if (!node) {
          await db.update(commsScheduledExecutions)
            .set({ status: 'done' })
            .where(eq(commsScheduledExecutions.id, execution.id));
          continue;
        }

        const allNodes = await db.select().from(commsAutomationNodes)
          .where(eq(commsAutomationNodes.automationId, node.automationId))
          .orderBy(commsAutomationNodes.orderIndex);

        const [automation] = await db.select({ tenantId: commsAutomations.tenantId })
          .from(commsAutomations).where(eq(commsAutomations.id, node.automationId)).limit(1);

        if (!automation) {
          await db.update(commsScheduledExecutions)
            .set({ status: 'done' })
            .where(eq(commsScheduledExecutions.id, execution.id));
          continue;
        }

        await executeNode(run, node, allNodes, {
          loanId: run.subjectId,
          tenantId: automation.tenantId,
        });

        await db.update(commsScheduledExecutions)
          .set({ status: 'done' })
          .where(eq(commsScheduledExecutions.id, execution.id));
      } catch (err) {
        console.error('[automationEngine] Scheduled execution failed:', err);
        await db.update(commsScheduledExecutions)
          .set({ status: 'failed' })
          .where(eq(commsScheduledExecutions.id, execution.id));
      }
    }
  } catch (err) {
    console.error('[automationEngine] processScheduledExecutions error:', err);
  }
}

export function startScheduler(): void {
  setInterval(() => {
    processScheduledExecutions().catch(err =>
      console.error('[automationEngine] Scheduler tick error:', err)
    );
  }, 60_000);
  console.log('[automationEngine] Scheduler started (60s interval)');
}

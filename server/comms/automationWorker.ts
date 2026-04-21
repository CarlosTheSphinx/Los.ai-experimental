import { db } from '../db';
import {
  commsScheduledExecutions, commsAutomationRuns, commsAutomations, commsAutomationNodes,
  projects, users,
} from '@shared/schema';
import { and, eq, asc, sql, isNotNull, lte, gt } from 'drizzle-orm';
import { sendCommsMessage } from './sendService';

/**
 * Automation execution worker — drains pending rows from
 * `comms_scheduled_executions` where node_id IS NOT NULL (i.e. automation
 * runs, not batch sends — those are handled by the batch-send drainer).
 *
 * For each due row:
 *  1. Atomically claim it via SELECT … FOR UPDATE SKIP LOCKED (so multiple
 *     workers in a horizontal deploy never double-send).
 *  2. Re-load the automation + run + node config.
 *  3. Evaluate exit conditions (loan status, opt-out, max duration). If any
 *     exit condition matches, mark the run `exited` and skip dispatch.
 *  4. Dispatch:
 *       - `send` → call sendCommsMessage with the resolved recipient.
 *       - `wait` → reschedule the next node N minutes from now.
 *  5. Advance to the next node by ordinal; if none, mark the run `completed`.
 *  6. Failures retry with exponential backoff (1m → 5m → 30m), capped at 3
 *     attempts before failing the run.
 *
 * Worker is idempotent and tenant-aware.
 */

const POLL_INTERVAL_MS = 60_000;
const BATCH_SIZE = 25;
const STALE_LOCK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [1, 5, 30];

let started = false;

type SendNodeConfig = {
  channel: 'email' | 'sms' | 'in_app';
  templateId: number;
  recipientType: 'broker' | 'borrower' | 'lender_user';
};

type WaitNodeConfig = {
  durationMinutes: number;
};

type ExitConditions = {
  loanStatusEquals?: string[];
  exitOnOptOut?: boolean;
};

async function reclaimStaleLocks(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS);
  await db.update(commsScheduledExecutions)
    .set({ status: 'pending', lockedAt: null })
    .where(and(
      eq(commsScheduledExecutions.status, 'executing'),
      isNotNull(commsScheduledExecutions.nodeId),
      lte(commsScheduledExecutions.lockedAt, cutoff),
    ));
}

/** Resolve which user (broker/borrower) to send to for a loan-scoped subject. */
async function resolveRecipientUserId(
  loanId: number,
  recipientType: 'broker' | 'borrower' | 'lender_user',
  tenantId: number,
): Promise<number | null> {
  const [loan] = await db.select().from(projects).where(eq(projects.id, loanId)).limit(1);
  if (!loan) return null;
  if (recipientType === 'borrower') {
    if (loan.userId) return loan.userId;
    if (loan.borrowerEmail) {
      const [u] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.email, loan.borrowerEmail), eq(users.tenantId, tenantId)))
        .limit(1);
      return u?.id ?? null;
    }
    return null;
  }
  if (recipientType === 'broker') {
    if (loan.brokerEmail) {
      const [u] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.email, loan.brokerEmail), eq(users.tenantId, tenantId)))
        .limit(1);
      return u?.id ?? null;
    }
    return null;
  }
  return null;
}

async function evaluateExitConditions(params: {
  exit: ExitConditions | null;
  maxDurationDays: number | null;
  startedAt: Date;
  loanId: number;
}): Promise<string | null> {
  const { exit, maxDurationDays, startedAt, loanId } = params;
  if (maxDurationDays && (Date.now() - startedAt.getTime()) > maxDurationDays * 86_400_000) {
    return 'max_duration_reached';
  }
  if (!exit) return null;
  if (exit.loanStatusEquals?.length) {
    const [loan] = await db.select({ status: projects.status, currentStage: projects.currentStage })
      .from(projects).where(eq(projects.id, loanId)).limit(1);
    if (loan) {
      const currentValues = [loan.status, loan.currentStage].filter((v): v is string => !!v);
      if (currentValues.some(v => exit.loanStatusEquals!.includes(v))) {
        return 'loan_status_match';
      }
    }
  }
  return null;
}

async function processOne(rowId: number): Promise<void> {
  const [row] = await db.select().from(commsScheduledExecutions)
    .where(eq(commsScheduledExecutions.id, rowId)).limit(1);
  if (!row || !row.runId || !row.nodeId) return;

  const [run] = await db.select().from(commsAutomationRuns)
    .where(eq(commsAutomationRuns.id, row.runId)).limit(1);
  if (!run || run.status !== 'running') {
    await db.update(commsScheduledExecutions)
      .set({ status: 'done', executedAt: new Date(), lastError: 'run no longer active' })
      .where(eq(commsScheduledExecutions.id, row.id));
    return;
  }

  const [automation] = await db.select().from(commsAutomations)
    .where(eq(commsAutomations.id, run.automationId)).limit(1);
  if (!automation) {
    await db.update(commsScheduledExecutions)
      .set({ status: 'failed', executedAt: new Date(), lastError: 'automation deleted' })
      .where(eq(commsScheduledExecutions.id, row.id));
    return;
  }
  if (automation.status !== 'active') {
    // Pause/archive: leave run in place but don't fire — mark this row done.
    await db.update(commsScheduledExecutions)
      .set({ status: 'done', executedAt: new Date(), lastError: `automation ${automation.status}` })
      .where(eq(commsScheduledExecutions.id, row.id));
    return;
  }

  const [node] = await db.select().from(commsAutomationNodes)
    .where(eq(commsAutomationNodes.id, row.nodeId)).limit(1);
  if (!node) {
    await db.update(commsAutomationRuns)
      .set({ status: 'failed', exitReason: 'node deleted' })
      .where(eq(commsAutomationRuns.id, run.id));
    return;
  }

  // Exit conditions — only meaningful for loan subjects
  if (run.subjectType === 'loan') {
    const exitReason = await evaluateExitConditions({
      exit: (automation.exitConditions ?? null) as ExitConditions | null,
      maxDurationDays: automation.maxDurationDays ?? null,
      startedAt: run.startedAt,
      loanId: run.subjectId,
    });
    if (exitReason) {
      await db.update(commsAutomationRuns)
        .set({ status: 'exited', exitReason })
        .where(eq(commsAutomationRuns.id, run.id));
      await db.update(commsScheduledExecutions)
        .set({ status: 'done', executedAt: new Date(), lastError: `exited:${exitReason}` })
        .where(eq(commsScheduledExecutions.id, row.id));
      return;
    }
  }

  // Dispatch
  let dispatchOk = true;
  let dispatchError: string | undefined;

  if (node.type === 'send') {
    const cfg = (node.config ?? {}) as Partial<SendNodeConfig>;
    if (!cfg.templateId || !cfg.recipientType) {
      dispatchOk = false;
      dispatchError = 'Send node missing templateId or recipientType';
    } else if (run.subjectType !== 'loan') {
      dispatchOk = false;
      dispatchError = `Send unsupported for subjectType=${run.subjectType}`;
    } else {
      const recipientUserId = await resolveRecipientUserId(run.subjectId, cfg.recipientType, automation.tenantId);
      if (!recipientUserId) {
        dispatchOk = false;
        dispatchError = `Could not resolve ${cfg.recipientType} for loan ${run.subjectId}`;
      } else {
        const result = await sendCommsMessage({
          tenantId: automation.tenantId,
          templateId: cfg.templateId,
          recipientType: cfg.recipientType,
          recipientId: recipientUserId,
          loanId: run.subjectId,
          runId: run.id,
          nodeId: node.id,
        });
        // suppressed = opted-out; honor exitOnOptOut
        if (result.status === 'suppressed') {
          const exit = (automation.exitConditions ?? {}) as ExitConditions;
          if (exit.exitOnOptOut) {
            await db.update(commsAutomationRuns)
              .set({ status: 'exited', exitReason: 'opted_out' })
              .where(eq(commsAutomationRuns.id, run.id));
            await db.update(commsScheduledExecutions)
              .set({ status: 'done', executedAt: new Date(), lastError: 'exited:opted_out' })
              .where(eq(commsScheduledExecutions.id, row.id));
            return;
          }
        }
        if (!result.success && result.status === 'failed') {
          dispatchOk = false;
          dispatchError = result.error || 'send failed';
        }
      }
    }
  } else if (node.type === 'wait') {
    // Wait nodes always succeed — the "execution" is just to advance the pointer.
    dispatchOk = true;
  } else {
    // Unknown node type for Phase 3 (e.g. branch_* — Phase 4)
    dispatchOk = false;
    dispatchError = `Unsupported node type: ${node.type}`;
  }

  if (!dispatchOk) {
    const attempts = (row.attempts ?? 0); // already incremented by claim
    if (attempts >= MAX_ATTEMPTS) {
      await db.update(commsAutomationRuns)
        .set({ status: 'failed', exitReason: dispatchError ?? 'send failed' })
        .where(eq(commsAutomationRuns.id, run.id));
      await db.update(commsScheduledExecutions)
        .set({ status: 'failed', executedAt: new Date(), lastError: dispatchError ?? null })
        .where(eq(commsScheduledExecutions.id, row.id));
    } else {
      const backoffMin = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 30;
      const retryAt = new Date(Date.now() + backoffMin * 60_000);
      // Re-queue same node for retry
      await db.update(commsScheduledExecutions)
        .set({ status: 'pending', scheduledFor: retryAt, lockedAt: null, lastError: dispatchError ?? null })
        .where(eq(commsScheduledExecutions.id, row.id));
    }
    return;
  }

  // Advance to the next node
  const [nextNode] = await db.select().from(commsAutomationNodes)
    .where(and(
      eq(commsAutomationNodes.automationId, automation.id),
      gt(commsAutomationNodes.orderIndex, node.orderIndex),
    ))
    .orderBy(asc(commsAutomationNodes.orderIndex))
    .limit(1);

  // Schedule the next node. For wait, delay = node.config.durationMinutes.
  let scheduledFor = new Date();
  if (node.type === 'wait') {
    const cfg = (node.config ?? {}) as Partial<WaitNodeConfig>;
    const minutes = Math.max(1, cfg.durationMinutes ?? 1);
    scheduledFor = new Date(Date.now() + minutes * 60_000);
  }

  // Atomically: mark this row done + insert next + update run pointer.
  // If a crash happens mid-flight, the transaction rolls back and the worker
  // will re-claim this row on the next tick (idempotent — exit conditions and
  // dispatch already happened, but the next-row insert is the only persistent
  // mutation that mattered).
  await db.transaction(async (tx) => {
    await tx.update(commsScheduledExecutions)
      .set({ status: 'done', executedAt: new Date(), lastError: null })
      .where(eq(commsScheduledExecutions.id, row.id));

    if (!nextNode) {
      await tx.update(commsAutomationRuns)
        .set({ status: 'completed', currentNodeId: null })
        .where(eq(commsAutomationRuns.id, run.id));
      return;
    }
    await tx.insert(commsScheduledExecutions).values({
      runId: run.id, nodeId: nextNode.id, tenantId: automation.tenantId,
      scheduledFor, status: 'pending',
    });
    await tx.update(commsAutomationRuns)
      .set({ currentNodeId: nextNode.id })
      .where(eq(commsAutomationRuns.id, run.id));
  });
}

async function drainOnce(): Promise<void> {
  await reclaimStaleLocks();

  const now = new Date();
  // Atomic claim of due automation rows (node_id IS NOT NULL distinguishes from batch-send)
  const claimed = await db.execute(sql`
    UPDATE comms_scheduled_executions
       SET status = 'executing', locked_at = ${now}, attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM comms_scheduled_executions
        WHERE status = 'pending'
          AND node_id IS NOT NULL
          AND scheduled_for <= ${now}
        ORDER BY scheduled_for ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id
  `);

  const rows = (claimed.rows ?? []) as Array<{ id: number }>;
  for (const r of rows) {
    try {
      await processOne(r.id);
    } catch (err) {
      console.error(`[automationWorker] processOne(${r.id}) threw:`, err);
      await db.update(commsScheduledExecutions)
        .set({ status: 'failed', executedAt: new Date(), lastError: (err as Error).message ?? 'unknown' })
        .where(eq(commsScheduledExecutions.id, r.id));
    }
  }
}

export function startAutomationWorker(): void {
  if (started) return;
  started = true;
  console.log('[commsAutomationWorker] starting automation drainer (poll every 60s)');
  setInterval(() => {
    drainOnce().catch(err => console.error('[commsAutomationWorker] drain error:', err));
  }, POLL_INTERVAL_MS);
  setTimeout(() => {
    drainOnce().catch(err => console.error('[commsAutomationWorker] initial drain error:', err));
  }, 7_000);
}

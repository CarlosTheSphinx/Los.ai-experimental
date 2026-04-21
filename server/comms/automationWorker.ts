import { db } from '../db';
import {
  commsScheduledExecutions, commsAutomationRuns, commsAutomations, commsAutomationNodes,
  commsSendLog, projects, users,
} from '@shared/schema';
import { and, eq, asc, sql, isNotNull, lte, gt, isNull } from 'drizzle-orm';
import { sendCommsMessage } from './sendService';
import { isOptedOut } from './optOutService';
import { storage } from '../storage';

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

type BranchEngagementConfig = {
  refNodeId: number;                                  // resolved at save time → id of a previous Send node in this run's automation
  engagementType: 'delivered' | 'opened' | 'clicked' | 'replied';
  windowMinutes: number;                              // how long to wait for the engagement event
};

type BranchLoanStateConfig = {
  field: 'currentStage' | 'status' | 'loanAmount' | 'loanType';
  operator: 'eq' | 'neq' | 'in' | 'notIn' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string | number | string[];
};

// Phase 4 — branch decision snapshot, persisted on commsAutomationRuns.branchPath
// AND on each commsSendLog row dispatched after the branch. The richer shape
// (nodeType + side) lets the Run history and Send Log render badges like
// "Branch: Engagement → No" without joining back to the node table.
type BranchPathEntry = {
  nodeId: number;
  nodeType: 'branch_engagement' | 'branch_loan_state';
  side: 'yes' | 'no';
  at: string;
};

type ExitConditions = {
  loanStatusEquals?: string[];
  exitOnOptOut?: boolean;
};

/**
 * Compute the next allowed dispatch time for SMS sends. Returns null if the
 * current time is outside any quiet-hours window (i.e. dispatch may proceed).
 *
 * Reads two tenant settings (UTC times, "HH:MM"):
 *   comms_sms_quiet_hours_start  (default "21:00")
 *   comms_sms_quiet_hours_end    (default "08:00")
 * If start > end the window wraps midnight (e.g. 21:00→08:00 spans the night).
 * If either setting is the literal "off", quiet hours are disabled.
 */
async function computeSmsQuietHoursDefer(tenantId: number, now: Date): Promise<Date | null> {
  try {
    const [startSetting, endSetting] = await Promise.all([
      storage.getSettingByKey('comms_sms_quiet_hours_start', tenantId),
      storage.getSettingByKey('comms_sms_quiet_hours_end', tenantId),
    ]);
    const startStr = (startSetting?.settingValue ?? '21:00').trim();
    const endStr = (endSetting?.settingValue ?? '08:00').trim();
    if (startStr.toLowerCase() === 'off' || endStr.toLowerCase() === 'off') return null;
    const parse = (s: string): number | null => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(s);
      if (!m) return null;
      const h = parseInt(m[1], 10), mn = parseInt(m[2], 10);
      if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
      return h * 60 + mn;
    };
    const startMin = parse(startStr);
    const endMin = parse(endStr);
    if (startMin == null || endMin == null) return null;
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const inWindow = startMin === endMin
      ? false
      : startMin < endMin
        ? (nowMin >= startMin && nowMin < endMin)
        : (nowMin >= startMin || nowMin < endMin); // wraps midnight
    if (!inWindow) return null;
    // Defer to today's endMin (UTC), or tomorrow's if endMin already passed today.
    const defer = new Date(now);
    defer.setUTCSeconds(0, 0);
    defer.setUTCHours(Math.floor(endMin / 60), endMin % 60);
    if (defer.getTime() <= now.getTime()) defer.setUTCDate(defer.getUTCDate() + 1);
    return defer;
  } catch {
    // On any config read failure, prefer to allow the send (fail-open) rather
    // than indefinitely deferring.
    return null;
  }
}

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

/**
 * Phase 4 — tree-aware "what's next?" walk.
 *
 * Each row in commsAutomationNodes carries (parentNodeId, branchSide,
 * orderIndex). Top-level nodes have parentNodeId=null, branchSide=null.
 * Branch children have parentNodeId=<branch id>, branchSide='yes'|'no'.
 *
 * After executing a node `n`, the next node is:
 *   1. the next sibling: same parent + same branchSide, with orderIndex >
 *      n.orderIndex (lowest such).
 *   2. if no sibling: walk up to n's parent and find ITS next sibling.
 *   3. if we reach a top-level node with no siblings, the run is done.
 *
 * For branch nodes specifically, when we choose to ENTER a side, the "next"
 * is the first child of that side (lowest orderIndex among children with the
 * matching branchSide). If that side is empty, we fall back to the
 * after-branch walk above.
 */
async function findFirstChild(automationId: number, parentId: number, side: 'yes' | 'no') {
  const [child] = await db.select().from(commsAutomationNodes)
    .where(and(
      eq(commsAutomationNodes.automationId, automationId),
      eq(commsAutomationNodes.parentNodeId, parentId),
      eq(commsAutomationNodes.branchSide, side),
    ))
    .orderBy(asc(commsAutomationNodes.orderIndex))
    .limit(1);
  return child ?? null;
}

async function findAfterNode(
  automationId: number,
  node: { id: number; parentNodeId: number | null; branchSide: string | null; orderIndex: number },
): Promise<{ id: number; orderIndex: number; type: string; config: unknown; parentNodeId: number | null; branchSide: string | null } | null> {
  // 1. next sibling under same parent + branchSide
  const sibQuery = db.select().from(commsAutomationNodes)
    .where(and(
      eq(commsAutomationNodes.automationId, automationId),
      node.parentNodeId == null
        ? isNull(commsAutomationNodes.parentNodeId)
        : eq(commsAutomationNodes.parentNodeId, node.parentNodeId),
      node.branchSide == null
        ? isNull(commsAutomationNodes.branchSide)
        : eq(commsAutomationNodes.branchSide, node.branchSide),
      gt(commsAutomationNodes.orderIndex, node.orderIndex),
    ))
    .orderBy(asc(commsAutomationNodes.orderIndex))
    .limit(1);
  const [sibling] = await sibQuery;
  if (sibling) return sibling;

  // 2. no sibling → walk up to parent's next sibling.
  if (node.parentNodeId == null) return null;
  const [parent] = await db.select().from(commsAutomationNodes)
    .where(eq(commsAutomationNodes.id, node.parentNodeId)).limit(1);
  if (!parent) return null;
  return findAfterNode(automationId, parent);
}

/** Evaluate a branch_engagement node by inspecting send_log for the referenced send. */
async function evaluateEngagementBranch(
  runId: number,
  cfg: BranchEngagementConfig,
): Promise<'yes' | 'no' | 'defer'> {
  if (!cfg.refNodeId) return 'no';
  const [ref] = await db.select({
    id: commsSendLog.id, status: commsSendLog.status, sentAt: commsSendLog.sentAt,
    deliveryEvents: commsSendLog.deliveryEvents,
  })
    .from(commsSendLog)
    .where(and(eq(commsSendLog.runId, runId), eq(commsSendLog.nodeId, cfg.refNodeId)))
    .orderBy(asc(commsSendLog.id))
    .limit(1);
  if (!ref) return 'no';
  const sentAt = ref.sentAt ? new Date(ref.sentAt as unknown as string) : null;
  if (!sentAt) return 'no';
  const windowMs = Math.max(1, cfg.windowMinutes ?? 0) * 60_000;
  const cutoff = new Date(sentAt.getTime() + windowMs);
  // Until the window closes, defer the decision (caller will reschedule).
  if (Date.now() < cutoff.getTime()) return 'defer';

  if (cfg.engagementType === 'delivered') {
    return ref.status === 'sent' ? 'yes' : 'no';
  }
  // For opened/clicked/replied, scan deliveryEvents (provider webhook events).
  const events = (Array.isArray(ref.deliveryEvents) ? ref.deliveryEvents : []) as Array<{ type?: string; at?: string }>;
  const matchType = cfg.engagementType; // 'opened' | 'clicked' | 'replied'
  const found = events.some(e => {
    if (e.type !== matchType) return false;
    if (!e.at) return true;
    const evAt = new Date(e.at).getTime();
    return evAt >= sentAt.getTime() && evAt <= cutoff.getTime();
  });
  return found ? 'yes' : 'no';
}

/** Evaluate a branch_loan_state node against the run's subject loan. */
async function evaluateLoanStateBranch(
  loanId: number,
  cfg: BranchLoanStateConfig,
): Promise<'yes' | 'no'> {
  const [loan] = await db.select().from(projects).where(eq(projects.id, loanId)).limit(1);
  if (!loan) return 'no';
  let actual: unknown;
  switch (cfg.field) {
    case 'currentStage': actual = loan.currentStage; break;
    case 'status':       actual = loan.status; break;
    case 'loanAmount':   actual = loan.loanAmount != null ? Number(loan.loanAmount) : null; break;
    case 'loanType':     actual = (loan as Record<string, unknown>).loanType ?? null; break;
    default:             return 'no';
  }
  const v = cfg.value;
  switch (cfg.operator) {
    case 'eq':    return String(actual ?? '') === String(v) ? 'yes' : 'no';
    case 'neq':   return String(actual ?? '') !== String(v) ? 'yes' : 'no';
    case 'in':    return Array.isArray(v) && v.map(String).includes(String(actual ?? '')) ? 'yes' : 'no';
    case 'notIn': return Array.isArray(v) && !v.map(String).includes(String(actual ?? '')) ? 'yes' : 'no';
    case 'gt':    return typeof actual === 'number' && actual >  Number(v) ? 'yes' : 'no';
    case 'gte':   return typeof actual === 'number' && actual >= Number(v) ? 'yes' : 'no';
    case 'lt':    return typeof actual === 'number' && actual <  Number(v) ? 'yes' : 'no';
    case 'lte':   return typeof actual === 'number' && actual <= Number(v) ? 'yes' : 'no';
    default:      return 'no';
  }
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

  // Exit conditions — loan-status / max-duration only meaningful for loan subjects.
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

  // Opt-out short-circuit: re-check on EVERY tick (including wait nodes) so a
  // recipient who opts out mid-sequence exits the run immediately instead of
  // waiting until the next send dispatch. The recipient depends on the next
  // node — but for runs whose only known "person" is the subject itself
  // (broker / borrower subjects), we can resolve right away. For loan
  // subjects we resolve via the upcoming send node's recipientType; for wait
  // nodes we look ahead to the next send to know whom to check.
  {
    const exit = (automation.exitConditions ?? {}) as ExitConditions;
    if (exit.exitOnOptOut) {
      let checkUserId: number | null = null;
      let recipientType: 'broker' | 'borrower' | null = null;

      if (run.subjectType === 'broker' || run.subjectType === 'borrower') {
        checkUserId = run.subjectId;
        recipientType = run.subjectType;
      } else if (run.subjectType === 'loan') {
        // Phase 4 — tree-aware lookahead: walk forward from the current node
        // through the tree (findAfterNode) to find the next Send whose
        // recipientType we can resolve. Stays within the current branch arm
        // and ascends back up the tree when an arm ends, so we don't target
        // an unrelated subtree's recipient.
        type SendCandidate = { id: number; type: string; config: unknown };
        type TraversalCursor = {
          id: number;
          parentNodeId: number | null;
          branchSide: string | null;
          orderIndex: number;
        };
        let nextSend: SendCandidate | null = null;
        // If the current node is itself a send, include it as a candidate.
        if (node.type === 'send') {
          nextSend = { id: node.id, type: node.type, config: node.config };
        } else {
          let cursor: TraversalCursor | null = {
            id: node.id,
            parentNodeId: node.parentNodeId ?? null,
            branchSide: node.branchSide ?? null,
            orderIndex: node.orderIndex,
          };
          while (cursor) {
            const step = await findAfterNode(automation.id, cursor);
            if (!step) break;
            if (step.type === 'send') {
              nextSend = { id: step.id, type: step.type, config: step.config };
              break;
            }
            cursor = {
              id: step.id,
              parentNodeId: step.parentNodeId,
              branchSide: step.branchSide,
              orderIndex: step.orderIndex,
            };
          }
        }
        if (nextSend) {
          const cfg = (nextSend.config ?? {}) as Partial<SendNodeConfig>;
          if (cfg.recipientType === 'borrower' || cfg.recipientType === 'broker') {
            recipientType = cfg.recipientType;
            checkUserId = await resolveRecipientUserId(run.subjectId, cfg.recipientType, automation.tenantId);
          }
        }
      }

      if (checkUserId && recipientType) {
        const channel = automation.defaultChannel as 'email' | 'sms' | 'in_app';
        // Resolve the recipient's actual contact value for the automation's
        // channel — opt-outs are keyed by contact value, not user id.
        const [recip] = await db.select({ id: users.id, email: users.email, phone: users.phone })
          .from(users)
          .where(and(eq(users.id, checkUserId), eq(users.tenantId, automation.tenantId)))
          .limit(1);
        let contactValue: string | null = null;
        if (recip) {
          if (channel === 'email') contactValue = recip.email ?? null;
          else if (channel === 'sms') contactValue = recip.phone ?? null;
          else if (channel === 'in_app') contactValue = `user:${recip.id}`;
        }
        if (contactValue && await isOptedOut(contactValue, channel, automation.tenantId)) {
          await db.update(commsAutomationRuns)
            .set({ status: 'exited', exitReason: 'opted_out' })
            .where(eq(commsAutomationRuns.id, run.id));
          await db.update(commsScheduledExecutions)
            .set({ status: 'done', executedAt: new Date(), lastError: 'exited:opted_out' })
            .where(eq(commsScheduledExecutions.id, row.id));
          return;
        }
      }
    }
  }

  // Phase 4 — Branch nodes don't dispatch; they evaluate, append to
  // branchPath, and schedule the first child of the chosen side (or after-
  // branch fallback when that side is empty).
  if (node.type === 'branch_engagement' || node.type === 'branch_loan_state') {
    let chosen: 'yes' | 'no';
    try {
      if (node.type === 'branch_engagement') {
        const cfg = (node.config ?? {}) as BranchEngagementConfig;
        const result = await evaluateEngagementBranch(run.id, cfg);
        // If the engagement window hasn't elapsed yet, defer this row to the
        // exact end-of-window moment so we don't tight-loop.
        if (result === 'defer') {
          const [ref] = await db.select({ sentAt: commsSendLog.sentAt }).from(commsSendLog)
            .where(and(eq(commsSendLog.runId, run.id), eq(commsSendLog.nodeId, cfg.refNodeId)))
            .orderBy(asc(commsSendLog.id))
            .limit(1);
          const sentAt = ref?.sentAt ? new Date(ref.sentAt as unknown as string) : new Date();
          const deferUntil = new Date(sentAt.getTime() + Math.max(1, cfg.windowMinutes ?? 0) * 60_000);
          await db.update(commsScheduledExecutions)
            .set({
              scheduledFor: deferUntil, status: 'pending', lockedAt: null,
              attempts: Math.max(0, (row.attempts ?? 1) - 1),
              lastError: 'deferred:branch_engagement_window',
            })
            .where(eq(commsScheduledExecutions.id, row.id));
          return;
        }
        chosen = result;
      } else {
        if (run.subjectType !== 'loan') {
          // branch_loan_state requires a loan subject; fall to 'no' (false branch)
          // so the run continues deterministically rather than failing.
          chosen = 'no';
        } else {
          const cfg = (node.config ?? {}) as BranchLoanStateConfig;
          chosen = await evaluateLoanStateBranch(run.subjectId, cfg);
        }
      }
    } catch (err) {
      console.error(`[automationWorker] branch evaluation failed for node ${node.id}:`, err);
      // Fail the row with retry/backoff via the normal !dispatchOk path below.
      const attempts = row.attempts ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        await db.update(commsAutomationRuns)
          .set({ status: 'failed', exitReason: 'branch evaluation failed' })
          .where(eq(commsAutomationRuns.id, run.id));
        await db.update(commsScheduledExecutions)
          .set({ status: 'failed', executedAt: new Date(), lastError: (err as Error).message ?? 'branch error' })
          .where(eq(commsScheduledExecutions.id, row.id));
      } else {
        const backoffMin = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 30;
        await db.update(commsScheduledExecutions)
          .set({
            status: 'pending', scheduledFor: new Date(Date.now() + backoffMin * 60_000),
            lockedAt: null, lastError: (err as Error).message ?? 'branch error',
          })
          .where(eq(commsScheduledExecutions.id, row.id));
      }
      return;
    }

    const newPathEntry: BranchPathEntry = {
      nodeId: node.id,
      nodeType: node.type as BranchPathEntry['nodeType'],
      side: chosen,
      at: new Date().toISOString(),
    };
    const existingPath = (Array.isArray(run.branchPath) ? run.branchPath : []) as BranchPathEntry[];
    const updatedPath = [...existingPath, newPathEntry];

    const firstChild = await findFirstChild(automation.id, node.id, chosen);
    const followUp = firstChild ?? await findAfterNode(automation.id, {
      id: node.id,
      parentNodeId: node.parentNodeId ?? null,
      branchSide: node.branchSide ?? null,
      orderIndex: node.orderIndex,
    });

    await db.transaction(async (tx) => {
      await tx.update(commsScheduledExecutions)
        .set({ status: 'done', executedAt: new Date(), lastError: null })
        .where(eq(commsScheduledExecutions.id, row.id));
      await tx.update(commsAutomationRuns)
        .set({ branchPath: updatedPath, currentNodeId: followUp ? followUp.id : null,
               status: followUp ? 'running' : 'completed' })
        .where(eq(commsAutomationRuns.id, run.id));
      if (followUp) {
        await tx.insert(commsScheduledExecutions).values({
          runId: run.id, nodeId: followUp.id, tenantId: automation.tenantId,
          scheduledFor: new Date(), status: 'pending',
        });
      }
    });
    return;
  }

  // Dispatch
  let dispatchOk = true;
  let dispatchError: string | undefined;

  if (node.type === 'send') {
    const cfg = (node.config ?? {}) as Partial<SendNodeConfig>;
    if (!cfg.templateId || !cfg.recipientType) {
      dispatchOk = false;
      dispatchError = 'Send node missing templateId or recipientType';
    } else {
      // SMS quiet hours — defer dispatch (don't fail) when within the
      // tenant's configured no-send window so we don't text people overnight.
      // Email and in-app are not subject to quiet hours.
      if (automation.defaultChannel === 'sms') {
        const deferUntil = await computeSmsQuietHoursDefer(automation.tenantId, new Date());
        if (deferUntil) {
          // Release the lock and re-queue immediately at the deferred time so
          // the next drain picks it up on schedule (don't wait for stale-lock
          // reclamation). Don't burn an attempt on a deferral.
          await db.update(commsScheduledExecutions)
            .set({
              scheduledFor: deferUntil,
              status: 'pending',
              lockedAt: null,
              attempts: Math.max(0, (row.attempts ?? 1) - 1),
              lastError: 'deferred:sms_quiet_hours',
            })
            .where(eq(commsScheduledExecutions.id, row.id));
          return;
        }
      }

      // Idempotency guard: if a send_log entry already exists for this
      // run/node, the previous attempt actually delivered (or recorded an
      // outcome) before the row finalize crashed. Skip the resend and just
      // advance the pointer.
      const existingLog = await db.select({ id: commsSendLog.id }).from(commsSendLog)
        .where(and(eq(commsSendLog.runId, run.id), eq(commsSendLog.nodeId, node.id)))
        .limit(1);
      if (existingLog.length > 0) {
        dispatchOk = true;
      } else {

      // Resolve recipient based on the run's subject type:
      //   loan     → look up the borrower/broker on the project
      //   broker   → recipient IS the user identified by subjectId (must be a broker)
      //   borrower → recipient IS the user identified by subjectId
      let recipientUserId: number | null = null;
      let resolvedLoanId: number | null = null;
      if (run.subjectType === 'loan') {
        recipientUserId = await resolveRecipientUserId(run.subjectId, cfg.recipientType, automation.tenantId);
        resolvedLoanId = run.subjectId;
      } else if (run.subjectType === 'broker' || run.subjectType === 'borrower') {
        // Tenant-scoped user lookup
        const [u] = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.id, run.subjectId), eq(users.tenantId, automation.tenantId)))
          .limit(1);
        recipientUserId = u?.id ?? null;
      }

      if (!recipientUserId) {
        dispatchOk = false;
        dispatchError = `Could not resolve ${cfg.recipientType} for ${run.subjectType} ${run.subjectId}`;
      } else {
        const result = await sendCommsMessage({
          tenantId: automation.tenantId,
          templateId: cfg.templateId,
          recipientType: cfg.recipientType,
          recipientId: recipientUserId,
          loanId: resolvedLoanId ?? undefined,
          runId: run.id,
          nodeId: node.id,
          // Phase 4 — snapshot the run's branch decisions onto the send_log row
          // so the Send Log + run-detail UI can render "Branch: Engagement → No"
          // without re-querying the run state.
          branchPath: (Array.isArray(run.branchPath) ? run.branchPath : []) as BranchPathEntry[],
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
      } // end idempotency-guard else
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

  // Advance to the next node — tree-aware. Use findAfterNode so we move to
  // the next sibling within the same parent+branchSide, or ascend back to the
  // branch parent's next sibling when a branch arm is exhausted. Phase 4:
  // global orderIndex is only sibling-scoped, so the old linear lookup would
  // jump into unrelated subtrees after a nested send/wait.
  const nextNode = await findAfterNode(automation.id, {
    id: node.id,
    parentNodeId: node.parentNodeId ?? null,
    branchSide: node.branchSide ?? null,
    orderIndex: node.orderIndex,
  });

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

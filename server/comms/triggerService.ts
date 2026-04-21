import { db } from '../db';
import {
  commsAutomations, commsAutomationNodes, commsAutomationRuns,
  commsScheduledExecutions,
} from '@shared/schema';
import { and, eq, asc } from 'drizzle-orm';
import { commsEventBus, type CommsEventName, type CommsEventMap } from './eventBus';
import { resolveSegment, type SegmentFilterConfig } from './segmentService';

/**
 * Trigger system for Phase 3 linear automations.
 *
 * On boot — and whenever an automation is activated — `wireAutomation()` is
 * called: it inspects the trigger config and either subscribes to a domain
 * event or registers a recurring/absolute scheduler entry. When the trigger
 * fires it calls `startRun()`, which creates one `comms_automation_runs` row
 * and enqueues the first node into `comms_scheduled_executions` for the
 * automation worker to drain.
 *
 * Manual triggers expose `startManualRun()` for the API layer to call.
 */

export type EventTriggerConfig = {
  kind: 'event';
  eventName: CommsEventName;
  filters?: { toStage?: string; fromStage?: string };
};

export type TimeAbsoluteTriggerConfig = {
  kind: 'time_absolute';
  runAt: string;            // ISO datetime
  segmentId?: number;       // audience to enumerate at fire time
};

export type TimeRecurringTriggerConfig = {
  kind: 'time_recurring';
  everyMinutes: number;     // simple interval; no cron parser needed for v1
  segmentId?: number;
};

export type TimeRelativeTriggerConfig = {
  kind: 'time_relative';
  anchorEvent: CommsEventName;
  offsetMinutes: number;
  filters?: { toStage?: string };
};

export type ManualTriggerConfig = { kind: 'manual' };

export type TriggerConfig =
  | EventTriggerConfig
  | TimeAbsoluteTriggerConfig
  | TimeRecurringTriggerConfig
  | TimeRelativeTriggerConfig
  | ManualTriggerConfig;

type WiredAutomation = {
  unsubscribe?: () => void;
  intervalHandle?: ReturnType<typeof setInterval>;
  timeoutHandle?: ReturnType<typeof setTimeout>;
};

const wired = new Map<number, WiredAutomation>();

export async function startRun(params: {
  automationId: number;
  tenantId: number;
  subjectType: 'loan' | 'broker' | 'borrower';
  subjectId: number;
}): Promise<number | null> {
  const { automationId, tenantId, subjectType, subjectId } = params;

  // Load first node (lowest orderIndex) for this automation
  const [firstNode] = await db.select().from(commsAutomationNodes)
    .where(eq(commsAutomationNodes.automationId, automationId))
    .orderBy(asc(commsAutomationNodes.orderIndex))
    .limit(1);

  if (!firstNode) {
    console.warn(`[triggerService] automation ${automationId} has no nodes — run not started`);
    return null;
  }

  const [run] = await db.insert(commsAutomationRuns).values({
    automationId,
    subjectType,
    subjectId,
    currentNodeId: firstNode.id,
    status: 'running',
  }).returning();

  await db.insert(commsScheduledExecutions).values({
    runId: run.id,
    nodeId: firstNode.id,
    tenantId,
    scheduledFor: new Date(),
    status: 'pending',
  });

  return run.id;
}

/** Manual API entry point — start a run on-demand. */
export async function startManualRun(params: {
  automationId: number;
  tenantId: number;
  subjectType: 'loan' | 'broker' | 'borrower';
  subjectId: number;
}): Promise<{ runId: number | null; error?: string }> {
  const [automation] = await db.select().from(commsAutomations)
    .where(and(eq(commsAutomations.id, params.automationId), eq(commsAutomations.tenantId, params.tenantId)))
    .limit(1);
  if (!automation) return { runId: null, error: 'Automation not found' };
  const runId = await startRun(params);
  if (!runId) return { runId: null, error: 'Automation has no nodes' };
  return { runId };
}

/** Subscribe to an event and start a run for the loan in the payload. */
function wireEventTrigger(
  automationId: number,
  tenantId: number,
  cfg: EventTriggerConfig,
): WiredAutomation {
  const handler = async (payload: CommsEventMap[CommsEventName]) => {
    if (payload.tenantId !== tenantId) return;

    // Optional toStage filter (only meaningful for loan_status_changed)
    if (cfg.eventName === 'loan_status_changed' && cfg.filters?.toStage) {
      const p = payload as CommsEventMap['loan_status_changed'];
      if (p.toStage !== cfg.filters.toStage) return;
    }
    if (cfg.eventName === 'loan_status_changed' && cfg.filters?.fromStage) {
      const p = payload as CommsEventMap['loan_status_changed'];
      if (p.fromStage !== cfg.filters.fromStage) return;
    }

    const loanId = (payload as { loanId?: number }).loanId;
    if (!loanId) return;
    await startRun({ automationId, tenantId, subjectType: 'loan', subjectId: loanId });
  };

  const unsubscribe = commsEventBus.subscribe(cfg.eventName, handler);
  return { unsubscribe };
}

/** Resolve a segment into loan ids for a time-based trigger. */
async function audienceForTimeTrigger(tenantId: number, segmentId?: number): Promise<number[]> {
  if (!segmentId) return [];
  // Load the segment row, then resolve via the segment service
  const { commsSegments } = await import('@shared/schema');
  const [seg] = await db.select().from(commsSegments)
    .where(and(eq(commsSegments.id, segmentId), eq(commsSegments.tenantId, tenantId)))
    .limit(1);
  if (!seg) return [];
  const result = await resolveSegment(tenantId, (seg.filterConfig ?? {}) as SegmentFilterConfig);
  return result.loanIds ?? [];
}

function wireTimeAbsoluteTrigger(
  automationId: number,
  tenantId: number,
  cfg: TimeAbsoluteTriggerConfig,
): WiredAutomation {
  const fireAt = new Date(cfg.runAt).getTime();
  if (Number.isNaN(fireAt) || fireAt <= Date.now()) {
    // Past or invalid — do not schedule. Activation endpoint already enforces
    // future-only; this guards against legacy rows / clock skew on boot.
    console.warn(`[triggerService] automation ${automationId} time_absolute runAt is in the past — skipped`);
    return {};
  }
  const delay = fireAt - Date.now();
  const timeoutHandle = setTimeout(async () => {
    const loanIds = await audienceForTimeTrigger(tenantId, cfg.segmentId);
    for (const loanId of loanIds) {
      await startRun({ automationId, tenantId, subjectType: 'loan', subjectId: loanId });
    }
  }, delay);
  return { timeoutHandle };
}

function wireTimeRecurringTrigger(
  automationId: number,
  tenantId: number,
  cfg: TimeRecurringTriggerConfig,
): WiredAutomation {
  const intervalMs = Math.max(60_000, cfg.everyMinutes * 60_000); // floor: 1 min
  const intervalHandle = setInterval(async () => {
    const loanIds = await audienceForTimeTrigger(tenantId, cfg.segmentId);
    for (const loanId of loanIds) {
      await startRun({ automationId, tenantId, subjectType: 'loan', subjectId: loanId });
    }
  }, intervalMs);
  return { intervalHandle };
}

function wireTimeRelativeTrigger(
  automationId: number,
  tenantId: number,
  cfg: TimeRelativeTriggerConfig,
): WiredAutomation {
  // Listen for the anchor event then enqueue a delayed first node.
  const handler = async (payload: CommsEventMap[CommsEventName]) => {
    if (payload.tenantId !== tenantId) return;
    if (cfg.anchorEvent === 'loan_status_changed' && cfg.filters?.toStage) {
      const p = payload as CommsEventMap['loan_status_changed'];
      if (p.toStage !== cfg.filters.toStage) return;
    }
    const loanId = (payload as { loanId?: number }).loanId;
    if (!loanId) return;

    // Bypass startRun — we want a delayed first execution
    const [firstNode] = await db.select().from(commsAutomationNodes)
      .where(eq(commsAutomationNodes.automationId, automationId))
      .orderBy(asc(commsAutomationNodes.orderIndex))
      .limit(1);
    if (!firstNode) return;

    const [run] = await db.insert(commsAutomationRuns).values({
      automationId, subjectType: 'loan', subjectId: loanId,
      currentNodeId: firstNode.id, status: 'running',
    }).returning();

    const scheduledFor = new Date(Date.now() + cfg.offsetMinutes * 60_000);
    await db.insert(commsScheduledExecutions).values({
      runId: run.id, nodeId: firstNode.id, tenantId,
      scheduledFor, status: 'pending',
    });
  };
  const unsubscribe = commsEventBus.subscribe(cfg.anchorEvent, handler);
  return { unsubscribe };
}

export function wireAutomation(automationId: number, tenantId: number, triggerConfig: TriggerConfig): void {
  unwireAutomation(automationId);
  let w: WiredAutomation = {};
  switch (triggerConfig.kind) {
    case 'event':          w = wireEventTrigger(automationId, tenantId, triggerConfig); break;
    case 'time_absolute':  w = wireTimeAbsoluteTrigger(automationId, tenantId, triggerConfig); break;
    case 'time_recurring': w = wireTimeRecurringTrigger(automationId, tenantId, triggerConfig); break;
    case 'time_relative':  w = wireTimeRelativeTrigger(automationId, tenantId, triggerConfig); break;
    case 'manual':         /* no wiring — driven by API */ break;
  }
  wired.set(automationId, w);
}

export function unwireAutomation(automationId: number): void {
  const existing = wired.get(automationId);
  if (!existing) return;
  if (existing.unsubscribe) existing.unsubscribe();
  if (existing.intervalHandle) clearInterval(existing.intervalHandle);
  if (existing.timeoutHandle) clearTimeout(existing.timeoutHandle);
  wired.delete(automationId);
}

/** On boot: re-wire every active automation. */
export async function initializeTriggerSystem(): Promise<void> {
  const active = await db.select().from(commsAutomations)
    .where(eq(commsAutomations.status, 'active'));
  for (const a of active) {
    if (!a.triggerConfig) continue;
    try {
      wireAutomation(a.id, a.tenantId, a.triggerConfig as TriggerConfig);
    } catch (err) {
      console.error(`[triggerService] failed to wire automation ${a.id}:`, err);
    }
  }
  console.log(`[triggerService] initialized — wired ${active.length} active automation(s)`);
}

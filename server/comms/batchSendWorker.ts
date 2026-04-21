import { db } from '../db';
import { commsScheduledExecutions } from '@shared/schema';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { sendCommsMessage } from './sendService';

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 25;
const STALE_LOCK_MS = 5 * 60_000;

let started = false;

/** Drain due rows from comms_scheduled_executions where node_id IS NULL (batch send rows).
 *  Automation-engine rows (node_id IS NOT NULL) are intentionally left untouched —
 *  Phase 3 will introduce the automation worker that handles those. */
async function drainOnce(): Promise<void> {
  const now = new Date();
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS);

  // Reclaim stale 'executing' rows whose lock expired
  await db.update(commsScheduledExecutions)
    .set({ status: 'pending', lockedAt: null })
    .where(and(
      eq(commsScheduledExecutions.status, 'executing'),
      isNull(commsScheduledExecutions.nodeId),
      lte(commsScheduledExecutions.lockedAt, staleCutoff),
    ));

  // Atomic claim of due batch-send rows. Subquery selects ids; outer UPDATE locks them.
  const claimed = await db.execute(sql`
    UPDATE comms_scheduled_executions
       SET status = 'executing', locked_at = ${now}, attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM comms_scheduled_executions
        WHERE status = 'pending'
          AND node_id IS NULL
          AND scheduled_for <= ${now}
        ORDER BY scheduled_for ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, tenant_id, template_id, recipient_id, recipient_type, loan_id, sender_user_id
  `);

  const rows = (claimed.rows ?? []) as Array<{
    id: number;
    tenant_id: number;
    template_id: number | null;
    recipient_id: number | null;
    recipient_type: string | null;
    loan_id: number | null;
    sender_user_id: number | null;
  }>;

  for (const row of rows) {
    try {
      if (!row.template_id || !row.recipient_id || !row.recipient_type) {
        await db.update(commsScheduledExecutions)
          .set({ status: 'failed', lastError: 'Missing template/recipient context', executedAt: new Date() })
          .where(eq(commsScheduledExecutions.id, row.id));
        continue;
      }

      const result = await sendCommsMessage({
        tenantId: row.tenant_id,
        templateId: row.template_id,
        recipientType: row.recipient_type as 'broker' | 'borrower' | 'lender_user',
        recipientId: row.recipient_id,
        loanId: row.loan_id ?? undefined,
        senderUserId: row.sender_user_id,
      });

      await db.update(commsScheduledExecutions)
        .set({
          status: result.success || result.status === 'suppressed' || result.status === 'skipped' ? 'done' : 'failed',
          lastError: result.error ?? null,
          executedAt: new Date(),
        })
        .where(eq(commsScheduledExecutions.id, row.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.update(commsScheduledExecutions)
        .set({ status: 'failed', lastError: msg, executedAt: new Date() })
        .where(eq(commsScheduledExecutions.id, row.id));
    }
  }
}

export function startBatchSendWorker(): void {
  if (started) return;
  started = true;
  console.log('[commsBatchWorker] starting batch-send drainer (poll every 30s)');
  setInterval(() => {
    drainOnce().catch(err => console.error('[commsBatchWorker] drain error:', err));
  }, POLL_INTERVAL_MS);
  // First drain shortly after boot
  setTimeout(() => {
    drainOnce().catch(err => console.error('[commsBatchWorker] initial drain error:', err));
  }, 5_000);
}

import { db } from '../db';
import { commsOptOuts } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Normalize contact values before opt-out lookups/writes to prevent
 * suppression misses due to case or formatting differences.
 * - Email: lowercase + trim
 * - Phone: trim only (full E.164 canonicalization is deferred to Phase 2)
 * - In-app (user:<id>): no change needed
 */
function normalizeContactValue(contactValue: string, channel: string): string {
  const trimmed = contactValue.trim();
  if (channel === 'email') return trimmed.toLowerCase();
  return trimmed;
}

export async function isOptedOut(contactValue: string, channel: string, tenantId: number): Promise<boolean> {
  const normalized = normalizeContactValue(contactValue, channel);
  const [row] = await db
    .select({ id: commsOptOuts.id })
    .from(commsOptOuts)
    .where(
      and(
        eq(commsOptOuts.contactValue, normalized),
        eq(commsOptOuts.channel, channel),
        eq(commsOptOuts.tenantId, tenantId)
      )
    )
    .limit(1);
  return !!row;
}

export async function addOptOut(params: {
  tenantId: number;
  contactValue: string;
  channel: string;
  source: string;
  recipientId?: number | null;
}): Promise<void> {
  const normalized = normalizeContactValue(params.contactValue, params.channel);
  await db
    .insert(commsOptOuts)
    .values({
      tenantId: params.tenantId,
      contactValue: normalized,
      channel: params.channel,
      source: params.source,
      recipientId: params.recipientId || null,
    })
    .onConflictDoNothing();
}

export async function removeOptOut(params: {
  tenantId: number;
  contactValue: string;
  channel: string;
}): Promise<void> {
  const normalized = normalizeContactValue(params.contactValue, params.channel);
  await db
    .delete(commsOptOuts)
    .where(
      and(
        eq(commsOptOuts.contactValue, normalized),
        eq(commsOptOuts.channel, params.channel),
        eq(commsOptOuts.tenantId, params.tenantId)
      )
    );
}

export async function listOptOuts(tenantId: number) {
  return await db
    .select()
    .from(commsOptOuts)
    .where(eq(commsOptOuts.tenantId, tenantId))
    .orderBy(commsOptOuts.optedOutAt);
}

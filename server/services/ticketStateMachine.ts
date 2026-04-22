import { db } from '../db';
import { supportTickets, supportTicketStatusHistory } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_broker' | 'resolved' | 'closed';

const ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['waiting_on_broker', 'resolved', 'closed'],
  waiting_on_broker: ['in_progress', 'resolved', 'closed'],
  resolved: ['in_progress', 'closed'], // reopen, or auto-close
  closed: [],
};

export function isLegalTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true; // no-op is fine
  return ALLOWED[from]?.includes(to) ?? false;
}

export function nextLegalStatuses(from: TicketStatus): TicketStatus[] {
  return ALLOWED[from] ?? [];
}

export interface TransitionInput {
  ticketId: number;
  toStatus: TicketStatus;
  changedById: number | null;
  note?: string | null;
  // Skip the legal-transition check (for system-driven moves)
  force?: boolean;
}

export async function transitionTicket(input: TransitionInput): Promise<{ ok: boolean; error?: string; from?: TicketStatus; to?: TicketStatus }> {
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1);
  if (!ticket) return { ok: false, error: 'Ticket not found' };
  const from = (ticket.status as TicketStatus) || 'open';
  const to = input.toStatus;
  if (from === to) return { ok: true, from, to };
  if (!input.force && !isLegalTransition(from, to)) {
    return { ok: false, error: `Illegal transition: ${from} → ${to}`, from, to };
  }
  const updates: any = { status: to, updatedAt: new Date() };
  if (to === 'resolved') updates.resolvedAt = new Date();
  if (from === 'resolved' && to === 'in_progress') updates.resolvedAt = null;

  await db.update(supportTickets).set(updates).where(eq(supportTickets.id, input.ticketId));

  await db.insert(supportTicketStatusHistory).values({
    ticketId: input.ticketId,
    fromStatus: from,
    toStatus: to,
    changedById: input.changedById,
    note: input.note ?? null,
  });

  return { ok: true, from, to };
}

// Convenience wrapper for system events that should always succeed (used by auto-close, reopen).
export async function forceTransition(ticketId: number, toStatus: TicketStatus, note: string): Promise<void> {
  await transitionTicket({ ticketId, toStatus, changedById: null, note, force: true });
}

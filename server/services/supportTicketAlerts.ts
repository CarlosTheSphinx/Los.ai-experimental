import { db } from '../db';
import {
  supportTickets,
  supportTicketMessages,
  adminNotificationSettings,
  users,
  notifications,
  type SupportTicket,
} from '@shared/schema';
import { and, desc, eq, gte, sql, inArray } from 'drizzle-orm';
import { sendSms } from '../smsService';
import { getResendClient } from '../email';
import { forceTransition } from './ticketStateMachine';

const APP_URL = process.env.BASE_URL
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
const FROM_EMAIL = process.env.FROM_EMAIL || 'Lendry AI <noreply@lendry.ai>';

const SMS_MAX = 160;

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function getSettings(tenantId: number) {
  const [row] = await db.select().from(adminNotificationSettings).where(eq(adminNotificationSettings.tenantId, tenantId)).limit(1);
  return row || null;
}

async function notifyAdminUsers(tenantId: number, payload: { title: string; message: string; link?: string }) {
  const adminRoles = ['admin', 'staff', 'super_admin', 'lender', 'processor'];
  const admins = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.role, adminRoles)));
  if (!admins.length) return;
  await db.insert(notifications).values(admins.map(a => ({
    userId: a.id,
    type: 'support_ticket_alert',
    title: payload.title,
    message: payload.message,
    link: payload.link ?? null,
  })));
}

function formatBugSms(args: { brokerName: string; severity: string | null; subject: string; ticketId: number }): string {
  const link = `${APP_URL}/admin/tickets/${args.ticketId}`;
  const sev = args.severity ? args.severity.toUpperCase() : 'UNSPEC';
  const broker = args.brokerName || 'broker';
  // Reserve room for: "[Lendry] New BUG from {broker} ({sev}): {subject}. View: {link}"
  const prefix = `[Lendry] New BUG from ${broker} (${sev}): `;
  const suffix = `. View: ${link}`;
  const room = SMS_MAX - prefix.length - suffix.length;
  let subj = args.subject;
  if (room < 10) {
    // Link too long even with empty subject — fall back to short message + link only
    return `[Lendry] New BUG #${args.ticketId} (${sev}): ${args.subject}`.slice(0, SMS_MAX);
  }
  if (subj.length > room) subj = subj.slice(0, Math.max(0, room - 1)) + '…';
  return `${prefix}${subj}${suffix}`;
}

export async function sendBugAlertSms(ticket: SupportTicket, brokerName: string): Promise<void> {
  try {
    const settings = await getSettings(ticket.tenantId);
    if (!settings?.smsPhone) {
      console.warn('[support-alerts] No SMS phone configured for tenant', ticket.tenantId);
      await notifyAdminUsers(ticket.tenantId, {
        title: 'Bug SMS not sent',
        message: `Ticket #${ticket.id}: no SMS phone configured. Set one in notification settings.`,
        link: `/admin/notification-settings`,
      });
      return;
    }
    const message = formatBugSms({
      brokerName,
      severity: ticket.severity,
      subject: ticket.subject,
      ticketId: ticket.id,
    });
    const result = await sendSms(settings.smsPhone, message);
    if (!result.success) {
      console.error('[support-alerts] SMS send failed:', result.error);
      await notifyAdminUsers(ticket.tenantId, {
        title: 'Bug SMS delivery failure',
        message: `Ticket #${ticket.id}: ${result.error || 'unknown error'}`,
        link: `/admin/tickets/${ticket.id}`,
      });
    }
  } catch (err: any) {
    console.error('[support-alerts] sendBugAlertSms exception:', err);
    try {
      await notifyAdminUsers(ticket.tenantId, {
        title: 'Bug SMS delivery failure',
        message: `Ticket #${ticket.id}: ${err?.message || 'exception thrown'}`,
        link: `/admin/tickets/${ticket.id}`,
      });
    } catch {}
  }
}

// ---------- Daily Digest ----------

interface DigestData {
  openByType: { help: number; bug: number; feature: number };
  oldestUnresolved: { id: number; subject: string; createdAt: Date; type: string } | null;
  slaBreaches: Array<{ id: number; subject: string; type: string; dueAt: Date | null }>;
  recentBrokerActivity: Array<{ id: number; subject: string; type: string; lastReplyAt: Date }>;
  totalOpen: number;
}

export async function buildDigest(tenantId: number): Promise<DigestData> {
  const openStatuses = ['open', 'in_progress', 'waiting_on_broker'];

  const openTickets = await db.select().from(supportTickets)
    .where(and(
      eq(supportTickets.tenantId, tenantId),
      inArray(supportTickets.status, openStatuses),
      eq(supportTickets.archivedByAdmin, false),
    ));

  const openByType = { help: 0, bug: 0, feature: 0 } as DigestData['openByType'];
  for (const t of openTickets) {
    if (t.type === 'help') openByType.help++;
    else if (t.type === 'bug') openByType.bug++;
    else if (t.type === 'feature') openByType.feature++;
  }

  let oldestUnresolved: DigestData['oldestUnresolved'] = null;
  if (openTickets.length > 0) {
    const sorted = [...openTickets].sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime());
    const o = sorted[0];
    oldestUnresolved = { id: o.id, subject: o.subject, createdAt: new Date(o.createdAt as any), type: o.type };
  }

  // SLA breaches: only populated once Phase 3 lands the response_due_at column.
  // For Phase 2 we render the section empty when the column is missing or no rows qualify.
  let slaBreaches: DigestData['slaBreaches'] = [];
  try {
    const rows = await db.execute(sql`
      SELECT id, subject, type, response_due_at
      FROM support_tickets
      WHERE tenant_id = ${tenantId}
        AND status IN ('open','in_progress')
        AND archived_by_admin = false
        AND response_due_at IS NOT NULL
        AND response_due_at < NOW()
        AND last_admin_reply_at IS NULL
      ORDER BY response_due_at ASC
      LIMIT 25
    `);
    slaBreaches = (rows.rows as any[]).map(r => ({
      id: r.id,
      subject: r.subject,
      type: r.type,
      dueAt: r.response_due_at ? new Date(r.response_due_at) : null,
    }));
  } catch {
    slaBreaches = [];
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.select({
    id: supportTickets.id,
    subject: supportTickets.subject,
    type: supportTickets.type,
    lastReplyAt: sql<Date>`MAX(${supportTicketMessages.createdAt})`,
  })
    .from(supportTickets)
    .innerJoin(supportTicketMessages, eq(supportTicketMessages.ticketId, supportTickets.id))
    .where(and(
      eq(supportTickets.tenantId, tenantId),
      eq(supportTicketMessages.authorRole, 'broker'),
      gte(supportTicketMessages.createdAt, cutoff),
      eq(supportTickets.archivedByAdmin, false),
    ))
    .groupBy(supportTickets.id, supportTickets.subject, supportTickets.type)
    .orderBy(desc(sql`MAX(${supportTicketMessages.createdAt})`))
    .limit(25);

  return {
    openByType,
    oldestUnresolved,
    slaBreaches,
    recentBrokerActivity: recent.map(r => ({
      id: r.id,
      subject: r.subject,
      type: r.type,
      lastReplyAt: new Date(r.lastReplyAt as any),
    })),
    totalOpen: openTickets.length,
  };
}

function ticketTypeLabel(t: string): string {
  if (t === 'bug') return 'Bug';
  if (t === 'help') return 'Help';
  if (t === 'feature') return 'Feature';
  return t;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderDigestHtml(data: DigestData): string {
  const adminBase = APP_URL;
  const link = (id: number) => `${adminBase}/admin/tickets/${id}`;
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });

  const oldestSection = data.oldestUnresolved
    ? `<p style="margin:0 0 8px"><a href="${link(data.oldestUnresolved.id)}" style="color:#C9A84C;text-decoration:none">#${data.oldestUnresolved.id} — ${escapeHtml(data.oldestUnresolved.subject)}</a> <span style="color:#777">(${ticketTypeLabel(data.oldestUnresolved.type)}, opened ${fmtDate(data.oldestUnresolved.createdAt)})</span></p>`
    : `<p style="color:#777;margin:0">None — all tickets resolved.</p>`;

  const slaSection = data.slaBreaches.length === 0
    ? `<p style="color:#777;margin:0">No SLA breaches.</p>`
    : data.slaBreaches.map(b => `<p style="margin:0 0 6px"><a href="${link(b.id)}" style="color:#C9A84C;text-decoration:none">#${b.id} — ${escapeHtml(b.subject)}</a> <span style="color:#c33">${b.dueAt ? `due ${fmtDate(b.dueAt)}` : ''}</span></p>`).join('');

  const recentSection = data.recentBrokerActivity.length === 0
    ? `<p style="color:#777;margin:0">No broker replies in the last 24 hours.</p>`
    : data.recentBrokerActivity.map(r => `<p style="margin:0 0 6px"><a href="${link(r.id)}" style="color:#C9A84C;text-decoration:none">#${r.id} — ${escapeHtml(r.subject)}</a> <span style="color:#777">(${ticketTypeLabel(r.type)}, ${fmtDate(r.lastReplyAt)})</span></p>`).join('');

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0F1629;color:#E5E7EB;padding:24px;border-radius:8px;max-width:640px;margin:0 auto">
    <h1 style="color:#C9A84C;margin:0 0 4px;font-size:22px">Lendry Support — Daily Digest</h1>
    <p style="color:#9CA3AF;margin:0 0 20px;font-size:13px">${today}</p>

    <div style="background:#1A2238;border-radius:6px;padding:16px;margin-bottom:16px">
      <h2 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px">Open tickets (${data.totalOpen})</h2>
      <table style="width:100%;color:#E5E7EB;font-size:14px"><tr>
        <td style="padding:6px 0">Help: <strong>${data.openByType.help}</strong></td>
        <td style="padding:6px 0">Bugs: <strong>${data.openByType.bug}</strong></td>
        <td style="padding:6px 0">Features: <strong>${data.openByType.feature}</strong></td>
      </tr></table>
    </div>

    <div style="background:#1A2238;border-radius:6px;padding:16px;margin-bottom:16px">
      <h2 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px">Oldest unresolved</h2>
      ${oldestSection}
    </div>

    <div style="background:#1A2238;border-radius:6px;padding:16px;margin-bottom:16px">
      <h2 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px">SLA breaches</h2>
      ${slaSection}
    </div>

    <div style="background:#1A2238;border-radius:6px;padding:16px;margin-bottom:16px">
      <h2 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px">New broker activity (last 24h)</h2>
      ${recentSection}
    </div>

    <p style="color:#6B7280;font-size:12px;margin:20px 0 0;text-align:center">
      <a href="${adminBase}/admin/tickets" style="color:#C9A84C">Open ticket inbox</a> ·
      <a href="${adminBase}/admin/notification-settings" style="color:#C9A84C">Notification settings</a>
    </p>
  </div>`;
}

function renderDigestText(data: DigestData): string {
  const lines: string[] = [];
  lines.push('Lendry Support — Daily Digest');
  lines.push('');
  lines.push(`Open: ${data.totalOpen}  (Help ${data.openByType.help} · Bugs ${data.openByType.bug} · Features ${data.openByType.feature})`);
  lines.push('');
  lines.push('Oldest unresolved:');
  lines.push(data.oldestUnresolved ? `  #${data.oldestUnresolved.id} — ${data.oldestUnresolved.subject}` : '  None');
  lines.push('');
  lines.push('SLA breaches:');
  if (!data.slaBreaches.length) lines.push('  None');
  else data.slaBreaches.forEach(b => lines.push(`  #${b.id} — ${b.subject}`));
  lines.push('');
  lines.push('Recent broker activity (24h):');
  if (!data.recentBrokerActivity.length) lines.push('  None');
  else data.recentBrokerActivity.forEach(r => lines.push(`  #${r.id} — ${r.subject}`));
  return lines.join('\n');
}

export async function sendDailyDigest(tenantId: number): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
  try {
    const settings = await getSettings(tenantId);
    if (!settings?.email) {
      return { ok: false, error: 'No notification email configured for tenant' };
    }
    const data = await buildDigest(tenantId);
    const html = renderDigestHtml(data);
    const text = renderDigestText(data);
    const resend = await getResendClient();
    if (!resend.client) {
      return { ok: false, error: 'Resend not configured' };
    }
    const result = await resend.client.emails.send({
      from: FROM_EMAIL,
      to: settings.email,
      subject: `[Lendry] Support digest — ${data.totalOpen} open · ${data.openByType.bug} bugs`,
      html,
      text,
    });
    if ((result as any)?.error) {
      console.error('[support-alerts] digest send error:', (result as any).error);
      await notifyAdminUsers(tenantId, {
        title: 'Daily digest failed to send',
        message: (result as any).error?.message || 'Unknown Resend error',
      });
      return { ok: false, error: (result as any).error?.message || 'send failed' };
    }
    return { ok: true, sentTo: settings.email };
  } catch (err: any) {
    console.error('[support-alerts] sendDailyDigest exception:', err);
    try {
      await notifyAdminUsers(tenantId, {
        title: 'Daily digest failed to send',
        message: err?.message || 'exception thrown',
      });
    } catch {}
    return { ok: false, error: err?.message };
  }
}

// ---------- Auto-close (Phase 3) ----------
// Resolved tickets with no activity in the last 14 days are auto-closed.

export async function runAutoCloseJob(): Promise<{ closed: number }> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const candidates = await db.select({
    id: supportTickets.id,
    tenantId: supportTickets.tenantId,
    submitterId: supportTickets.submitterId,
    subject: supportTickets.subject,
    resolvedAt: supportTickets.resolvedAt,
    updatedAt: supportTickets.updatedAt,
  })
    .from(supportTickets)
    .where(and(
      eq(supportTickets.status, 'resolved'),
      sql`COALESCE(${supportTickets.resolvedAt}, ${supportTickets.updatedAt}) < ${cutoff}`,
    ));

  let closed = 0;
  for (const t of candidates) {
    try {
      // Verify last activity is older than cutoff
      const [lastMsg] = await db.select({ createdAt: supportTicketMessages.createdAt })
        .from(supportTicketMessages)
        .where(eq(supportTicketMessages.ticketId, t.id))
        .orderBy(desc(supportTicketMessages.createdAt))
        .limit(1);
      const lastActivity = lastMsg?.createdAt
        ? new Date(lastMsg.createdAt as any)
        : (t.resolvedAt ? new Date(t.resolvedAt as any) : new Date(t.updatedAt as any));
      if (lastActivity > cutoff) continue;

      await forceTransition(t.id, 'closed', 'Auto-closed after 14 days of inactivity');
      closed++;

      if (t.submitterId) {
        await db.insert(notifications).values({
          userId: t.submitterId,
          type: 'support_ticket',
          title: `Ticket #${t.id} closed`,
          message: `Your ticket "${t.subject}" was automatically closed after 14 days. Please open a new ticket if you need further help.`,
          link: `/support/tickets/${t.id}`,
        });
      }
    } catch (err) {
      console.error('[support-alerts] auto-close failed for ticket', t.id, err);
    }
  }
  return { closed };
}

// ---------- Scheduler ----------

let timer: ReturnType<typeof setInterval> | null = null;
const sentDates = new Map<number, string>(); // tenantId -> YYYY-MM-DD already sent
let lastAutoCloseDate = '';

function nyHourAndDate(): { hour: number; date: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return {
    hour: parseInt(get('hour'), 10),
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

async function tick() {
  const { hour, date } = nyHourAndDate();

  // Auto-close runs once per day, at any time after the first tick of a new day
  if (lastAutoCloseDate !== date) {
    lastAutoCloseDate = date;
    runAutoCloseJob().catch(err => console.error('[support-alerts] auto-close error:', err));
  }

  if (hour !== 9) return;
  // Find all tenants with notification settings configured
  const rows = await db.select({ tenantId: adminNotificationSettings.tenantId, email: adminNotificationSettings.email })
    .from(adminNotificationSettings);
  for (const r of rows) {
    if (!r.email) continue;
    if (sentDates.get(r.tenantId) === date) continue;
    try {
      await sendDailyDigest(r.tenantId);
      sentDates.set(r.tenantId, date);
    } catch (err) {
      console.error('[support-alerts] digest tick failed for tenant', r.tenantId, err);
    }
  }
}

export function startSupportDigestScheduler() {
  if (timer) return;
  // Check every minute; send at 9:00 ET, once per day per tenant.
  timer = setInterval(() => { tick().catch(err => console.error('[support-alerts] tick error:', err)); }, 60 * 1000);
  console.log('[support-alerts] Daily digest scheduler started (9:00 America/New_York)');
}

export function stopSupportDigestScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

// Test entry point — used by "Send test SMS"
export async function sendTestBugSms(tenantId: number): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettings(tenantId);
  if (!settings?.smsPhone) return { ok: false, error: 'No SMS phone configured' };
  const msg = formatBugSms({ brokerName: 'Test Broker', severity: 'high', subject: 'Test bug alert from notification settings', ticketId: 0 });
  const r = await sendSms(settings.smsPhone, msg);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true };
}

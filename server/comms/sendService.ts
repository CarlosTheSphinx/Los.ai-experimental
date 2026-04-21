import { db } from '../db';
import { commsSendLog, commsTemplates, commsChannels, notifications, users } from '@shared/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { isOptedOut } from './optOutService';
import { resolveTemplate, buildContext, type MergeTagContext } from './mergeTagResolver';
import { getResendClient } from '../email';

interface SmsChannelConfig {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  fromNumber: string;
}

export interface SendParams {
  tenantId: number;
  // Either templateId (pick a saved template) OR inlineBody (compose inline).
  // When inlineBody is provided templateId is optional.
  templateId?: number | null;
  inlineBody?: string;
  inlineSubject?: string;
  inlineChannel?: 'email' | 'sms' | 'in_app';
  recipientType: 'broker' | 'borrower' | 'lender_user';
  recipientId: number;
  loanId?: number;
  senderUserId?: number | null; // used to prefer per-user SMS channel (owner_user_id)
  runId?: number | null;
  nodeId?: number | null;
  overrideContext?: Partial<MergeTagContext>;
  // Phase 4 — snapshot of the run's branch decision trail at this send.
  // Lets the Send Log show "Branch: Engagement → No" without re-querying the run.
  branchPath?: Array<{
    nodeId: number;
    nodeType: 'branch_engagement' | 'branch_loan_state';
    side: 'yes' | 'no';
    at: string;
  }>;
}

export interface SendResult {
  success: boolean;
  status: 'sent' | 'skipped' | 'failed' | 'suppressed';
  logId?: number;
  error?: string;
}

export async function sendCommsMessage(params: SendParams): Promise<SendResult> {
  const {
    tenantId, templateId, inlineBody, inlineSubject, inlineChannel,
    recipientId, recipientType,
    loanId, senderUserId = null, runId = null, nodeId = null,
    branchPath = [],
  } = params;

  // ── Inline compose path (no saved template required) ──────────────────────
  if (inlineBody) {
    const channel = inlineChannel ?? 'email';
    const [recipient] = await db.select().from(users)
      .where(and(eq(users.id, recipientId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!recipient) {
      const logEntry = await writeLog({
        tenantId, channel, templateId: null, templateVersion: 0,
        recipientType, recipientId, recipientContactValue: '',
        resolvedBody: inlineBody, resolvedSubject: inlineSubject ?? null,
        resolvedMergeTags: {}, status: 'failed',
        failureReason: 'Recipient not found or not in your tenant', runId, nodeId,
      });
      return { success: false, status: 'failed', logId: logEntry?.id, error: 'Recipient not found or not in your tenant' };
    }
    const ctx = await buildContext({ recipientId, loanId, tenantId });
    const { resolvedBody, resolvedSubject, resolvedMergeTags } = resolveTemplate(
      inlineBody, inlineSubject ?? null, ctx, channel
    );
    // Route inline body through the same dispatch helpers used for templates.
    return dispatchAndLog({
      tenantId, channel, template: null, templateId: null, templateVersion: 0,
      recipientId, recipientType, recipient, loanId, senderUserId, runId, nodeId,
      resolvedBody, resolvedSubject, resolvedMergeTags, branchPath,
    });
  }

  // ── Template path ──────────────────────────────────────────────────────────
  if (!templateId) {
    return { success: false, status: 'failed', error: 'Send node requires either a templateId or inlineBody' };
  }

  // Tenant-scoped template lookup
  const [template] = await db.select().from(commsTemplates)
    .where(and(eq(commsTemplates.id, templateId), eq(commsTemplates.tenantId, tenantId)))
    .limit(1);
  if (!template) {
    // Pass null templateId to avoid FK violation — the requested template doesn't exist
    const logEntry = await writeLog({
      tenantId, channel: 'unknown', templateId: null, templateVersion: 0,
      recipientType, recipientId, recipientContactValue: '',
      resolvedBody: '', resolvedSubject: null,
      resolvedMergeTags: {}, status: 'failed',
      failureReason: `Template ${templateId} not found or not in your tenant`, runId, nodeId,
    });
    return { success: false, status: 'failed', logId: logEntry?.id, error: 'Template not found or not in your tenant' };
  }

  // Tenant-scoped recipient lookup
  const [recipient] = await db.select().from(users)
    .where(and(eq(users.id, recipientId), eq(users.tenantId, tenantId)))
    .limit(1);
  if (!recipient) {
    // Resolve with empty context so log has best-effort content even without recipient
    const ctx = await buildContext({ loanId, tenantId });
    const { resolvedBody, resolvedSubject, resolvedMergeTags } = resolveTemplate(
      template.body, template.subject, ctx, template.channel as 'email' | 'sms' | 'in_app'
    );
    const logEntry = await writeLog({
      tenantId, channel: template.channel, templateId, templateVersion: template.version,
      recipientType, recipientId, recipientContactValue: '',
      resolvedBody, resolvedSubject, resolvedMergeTags, status: 'failed',
      failureReason: 'Recipient not found or not in your tenant', runId, nodeId,
    });
    return { success: false, status: 'failed', logId: logEntry?.id, error: 'Recipient not found or not in your tenant' };
  }

  const channel = template.channel as 'email' | 'sms' | 'in_app';

  // Build context and resolve template FIRST so all log entries have full resolved content
  const ctx = await buildContext({ recipientId, loanId, tenantId });
  if (params.overrideContext) {
    Object.assign(ctx, params.overrideContext);
  }
  const { resolvedBody, resolvedSubject, resolvedMergeTags } = resolveTemplate(
    template.body, template.subject, ctx, channel
  );

  return dispatchAndLog({
    tenantId, channel, template, templateId, templateVersion: template.version,
    recipientId, recipientType, recipient, loanId, senderUserId, runId, nodeId,
    resolvedBody, resolvedSubject, resolvedMergeTags, branchPath,
  });
}

// ── Shared dispatch + log helper ───────────────────────────────────────────────
// Called by both the template path and the inline-compose path.
async function dispatchAndLog(p: {
  tenantId: number;
  channel: 'email' | 'sms' | 'in_app';
  template: { version: number } | null;
  templateId: number | null;
  templateVersion: number;
  recipientId: number;
  recipientType: string;
  recipient: { id: number; email: string; phone?: string | null };
  loanId?: number;
  senderUserId?: number | null;
  runId?: number | null;
  nodeId?: number | null;
  resolvedBody: string;
  resolvedSubject: string | null;
  resolvedMergeTags: Record<string, string>;
  branchPath?: Array<{ nodeId: number; nodeType: 'branch_engagement' | 'branch_loan_state'; side: 'yes' | 'no'; at: string }>;
}): Promise<SendResult> {
  const { tenantId, channel, templateId, templateVersion, recipientId, recipientType,
    recipient, loanId, senderUserId = null, runId = null, nodeId = null,
    resolvedBody, resolvedSubject, resolvedMergeTags, branchPath = [] } = p;

  let contactValue = '';
  if (channel === 'email') {
    contactValue = recipient.email;
  } else if (channel === 'sms') {
    contactValue = recipient.phone || '';
    if (!contactValue) {
      const logEntry = await writeLog({
        tenantId, channel, templateId, templateVersion,
        recipientType, recipientId, recipientContactValue: '',
        resolvedBody, resolvedSubject, resolvedMergeTags, status: 'skipped',
        failureReason: 'No phone number on file', runId, nodeId,
      });
      return { success: false, status: 'skipped', logId: logEntry?.id, error: 'No phone number on file' };
    }
  } else if (channel === 'in_app') {
    contactValue = `user:${recipient.id}`;
  }

  // Opt-out gate applies to every channel including in_app
  if (contactValue) {
    const suppressed = await isOptedOut(contactValue, channel, tenantId);
    if (suppressed) {
      const logEntry = await writeLog({
        tenantId, channel, templateId, templateVersion,
        recipientType, recipientId, recipientContactValue: contactValue,
        resolvedBody, resolvedSubject, resolvedMergeTags, status: 'suppressed',
        failureReason: 'Recipient has opted out', runId, nodeId,
      });
      return { success: false, status: 'suppressed', logId: logEntry?.id };
    }
  }

  // Helper: find best SMS channel — prefer sender's owned channel, fall back to shared
  async function resolveSmsChannel() {
    if (senderUserId) {
      const [ownedChannel] = await db.select().from(commsChannels)
        .where(and(
          eq(commsChannels.tenantId, tenantId),
          eq(commsChannels.type, 'sms'),
          eq(commsChannels.isActive, true),
          eq(commsChannels.ownerUserId, senderUserId)
        ))
        .limit(1);
      if (ownedChannel) return ownedChannel;
    }
    const [sharedChannel] = await db.select().from(commsChannels)
      .where(and(
        eq(commsChannels.tenantId, tenantId),
        eq(commsChannels.type, 'sms'),
        eq(commsChannels.isActive, true),
        isNull(commsChannels.ownerUserId)
      ))
      .limit(1);
    return sharedChannel ?? null;
  }

  let resolvedSmsChannel: typeof import('@shared/schema').commsChannels.$inferSelect | null = null;
  if (channel === 'sms') {
    resolvedSmsChannel = await resolveSmsChannel();
    if (!resolvedSmsChannel) {
      const logEntry = await writeLog({
        tenantId, channel, templateId, templateVersion,
        recipientType, recipientId, recipientContactValue: contactValue,
        resolvedBody, resolvedSubject, resolvedMergeTags, status: 'skipped',
        failureReason: 'No active SMS channel configured for this tenant', runId, nodeId,
      });
      return { success: false, status: 'skipped', logId: logEntry?.id, error: 'No active SMS channel configured for this tenant' };
    }
    if (!resolvedSmsChannel.smsEnabled) {
      const logEntry = await writeLog({
        tenantId, channel, templateId, templateVersion,
        recipientType, recipientId, recipientContactValue: contactValue,
        resolvedBody, resolvedSubject, resolvedMergeTags, status: 'skipped',
        failureReason: 'SMS sending is disabled on this channel (pending 10DLC approval)', runId, nodeId,
      });
      return { success: false, status: 'skipped', logId: logEntry?.id, error: 'SMS sending is disabled on this channel (pending 10DLC approval)' };
    }
  }

  let dispatchStatus: 'sent' | 'failed' = 'sent';
  let failureReason: string | undefined;

  try {
    if (channel === 'email') {
      const { client, fromEmail } = await getResendClient();
      await client.emails.send({
        from: fromEmail || 'Lendry.AI <info@lendry.ai>',
        to: contactValue,
        subject: resolvedSubject || '(no subject)',
        html: resolvedBody,
      });
    } else if (channel === 'sms') {
      if (!resolvedSmsChannel || !resolvedSmsChannel.config) {
        throw new Error('No SMS channel configuration found');
      }
      const cfg = resolvedSmsChannel.config as SmsChannelConfig;
      if (!cfg.accountSid || !cfg.apiKey || !cfg.apiKeySecret || !cfg.fromNumber) {
        throw new Error('Incomplete SMS channel credentials');
      }
      const twilio = (await import('twilio')).default;
      const twilioClient = twilio(cfg.apiKey, cfg.apiKeySecret, { accountSid: cfg.accountSid });
      await twilioClient.messages.create({
        body: resolvedBody,
        from: cfg.fromNumber,
        to: contactValue,
      });
    } else if (channel === 'in_app') {
      await db.insert(notifications).values({
        userId: recipientId,
        type: 'comms',
        title: resolvedSubject || 'New Message',
        message: resolvedBody,
        isRead: false,
      });
    }
  } catch (err: unknown) {
    dispatchStatus = 'failed';
    failureReason = err instanceof Error ? err.message : 'Unknown error';
  }

  const logEntry = await writeLog({
    tenantId, channel, templateId, templateVersion,
    recipientType, recipientId, recipientContactValue: contactValue,
    resolvedBody, resolvedSubject: resolvedSubject || null,
    resolvedMergeTags, status: dispatchStatus,
    failureReason: failureReason || null, runId, nodeId,
    branchPath,
  });

  return {
    success: dispatchStatus === 'sent',
    status: dispatchStatus,
    logId: logEntry?.id,
    error: failureReason,
  };
}

async function writeLog(p: {
  tenantId: number;
  channel: string;
  templateId: number | null;
  templateVersion: number;
  recipientType: string;
  recipientId: number;
  recipientContactValue: string;
  resolvedBody: string;
  resolvedSubject: string | null | undefined;
  resolvedMergeTags: Record<string, string>;
  status: string;
  failureReason?: string | null;
  runId?: number | null;
  nodeId?: number | null;
  branchPath?: Array<{
    nodeId: number;
    nodeType: 'branch_engagement' | 'branch_loan_state';
    side: 'yes' | 'no';
    at: string;
  }>;
}) {
  try {
    const [entry] = await db.insert(commsSendLog).values({
      tenantId: p.tenantId,
      channel: p.channel,
      templateId: p.templateId,
      templateVersion: p.templateVersion,
      recipientType: p.recipientType,
      recipientId: p.recipientId,
      recipientContactValue: p.recipientContactValue,
      resolvedBody: p.resolvedBody,
      resolvedSubject: p.resolvedSubject || null,
      resolvedMergeTags: p.resolvedMergeTags,
      status: p.status,
      failureReason: p.failureReason || null,
      runId: p.runId || null,
      nodeId: p.nodeId || null,
      deliveryEvents: [],
      branchPath: p.branchPath ?? [],
    }).returning();
    return entry;
  } catch (err) {
    console.error('[sendService] Failed to write send log:', err);
    return null;
  }
}

export interface PreviewResult {
  resolvedBody: string;
  resolvedSubject: string | null;
  resolvedMergeTags: Record<string, string>;
  /** True when the recipient has opted out — UI should display a pre-send warning. */
  isOptedOut: boolean;
  channel: 'email' | 'sms' | 'in_app';
}

export async function previewTemplate(params: {
  templateId: number;
  recipientId?: number;
  loanId?: number;
  tenantId: number;
}): Promise<PreviewResult | null> {
  // Tenant-scoped template lookup
  const [template] = await db.select().from(commsTemplates)
    .where(and(eq(commsTemplates.id, params.templateId), eq(commsTemplates.tenantId, params.tenantId)))
    .limit(1);
  if (!template) return null;

  const channel = template.channel as 'email' | 'sms' | 'in_app';

  // If recipientId provided, verify it belongs to this tenant
  let recipientContactValue: string | null = null;
  if (params.recipientId) {
    const [recipientRow] = await db.select({ id: users.id, email: users.email, phone: users.phone }).from(users)
      .where(and(eq(users.id, params.recipientId), eq(users.tenantId, params.tenantId)))
      .limit(1);
    if (!recipientRow) return null;
    if (channel === 'email') recipientContactValue = recipientRow.email;
    else if (channel === 'sms') recipientContactValue = recipientRow.phone ?? null;
    else if (channel === 'in_app') recipientContactValue = `user:${recipientRow.id}`;
  }

  const ctx = await buildContext({
    recipientId: params.recipientId,
    loanId: params.loanId,
    tenantId: params.tenantId,
  });

  const resolved = resolveTemplate(template.body, template.subject, ctx, channel);

  // Check opt-out so UI can warn before dispatch
  let optedOut = false;
  if (recipientContactValue) {
    optedOut = await isOptedOut(recipientContactValue, channel, params.tenantId);
  }

  return { ...resolved, isOptedOut: optedOut, channel };
}

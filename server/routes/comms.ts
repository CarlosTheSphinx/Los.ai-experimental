import type { Express, Response } from 'express';
import { db } from '../db';
import {
  commsChannels, commsTemplates, commsMergeTags,
  commsSendLog, commsOptOuts,
  commsSegments, commsScheduledExecutions,
  commsAutomations, commsAutomationNodes, commsAutomationRuns,
  insertCommsChannelSchema, insertCommsTemplateSchema, insertCommsOptOutSchema,
  insertCommsAutomationSchema,
  projects, users, tenants,
} from '@shared/schema';
import { eq, and, desc, asc, gte, lte, ilike, or, sql, SQL } from 'drizzle-orm';
import { wireAutomation, unwireAutomation, startManualRun, type TriggerConfig } from '../comms/triggerService';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { AuthRequest } from '../auth';
import { isOptedOut, addOptOut, removeOptOut, listOptOuts } from '../comms/optOutService';
import { sendCommsMessage, previewTemplate } from '../comms/sendService';
import { resolveSegment, type SegmentFilterConfig } from '../comms/segmentService';

function getTenantId(req: AuthRequest): number | null {
  if (!req.user) return null;
  return req.user.tenantId ?? null;
}

function requireTenantId(req: AuthRequest, res: Response): number | null {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    res.status(400).json({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

/** Ensure ownerUserId belongs to the same tenant — reject if not found or mismatched. */
async function validateOwnerTenant(ownerUserId: number, tenantId: number): Promise<boolean> {
  const [owner] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, ownerUserId), eq(users.tenantId, tenantId))).limit(1);
  return !!owner;
}

interface SmsChannelConfig {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  fromNumber: string;
}

type RequestMiddleware = (req: AuthRequest, res: Response, next: () => void) => void;

export function registerCommsRoutes(
  app: Express,
  { authenticateUser, requireAdmin, requireSuperAdmin }: {
    authenticateUser: RequestMiddleware;
    requireAdmin: RequestMiddleware;
    requireSuperAdmin: RequestMiddleware;
  }
) {

  // ==================== CHANNEL CONFIG ====================

  /** Redact sensitive Twilio secrets before sending channel data to the client */
  function redactChannelConfig(ch: typeof commsChannels.$inferSelect) {
    if (ch.type !== 'sms' || !ch.config) return ch;
    const cfg = ch.config as SmsChannelConfig;
    return {
      ...ch,
      config: {
        accountSid: cfg.accountSid,
        apiKey: cfg.apiKey,
        apiKeySecret: cfg.apiKeySecret ? '••••••••••••••••••••••••••••••••' : '',
        fromNumber: cfg.fromNumber,
      },
    };
  }

  app.get('/api/comms/channels', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const channels = await db.select().from(commsChannels)
        .where(eq(commsChannels.tenantId, tenantId))
        .orderBy(asc(commsChannels.createdAt));
      res.json(channels.map(redactChannelConfig));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.post('/api/comms/channels', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      // smsEnabled is a 10DLC compliance gate — only super_admin may set it to true at creation
      const payload = { ...req.body, tenantId };
      if (req.user?.role !== 'super_admin') {
        payload.smsEnabled = false;
      }

      const parsed = insertCommsChannelSchema.safeParse(payload);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      // Validate ownerUserId belongs to this tenant
      if (parsed.data.ownerUserId != null) {
        const valid = await validateOwnerTenant(parsed.data.ownerUserId, tenantId);
        if (!valid) return res.status(400).json({ error: 'ownerUserId does not belong to this tenant' });
      }

      if (parsed.data.type === 'sms' && parsed.data.config) {
        const cfg = parsed.data.config as SmsChannelConfig;
        if (!cfg.accountSid || !cfg.apiKey || !cfg.apiKeySecret || !cfg.fromNumber) {
          return res.status(400).json({ error: 'SMS config requires accountSid, apiKey, apiKeySecret, and fromNumber' });
        }
        try {
          const twilio = (await import('twilio')).default;
          const testClient = twilio(cfg.apiKey, cfg.apiKeySecret, { accountSid: cfg.accountSid });
          await testClient.api.accounts(cfg.accountSid).fetch();
        } catch (twilioErr: unknown) {
          const twilioMsg = twilioErr instanceof Error ? twilioErr.message : 'invalid credentials';
          return res.status(400).json({ error: `Twilio validation failed: ${twilioMsg}` });
        }
      }

      const [channel] = await db.insert(commsChannels).values(parsed.data).returning();
      res.status(201).json(redactChannelConfig(channel));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.patch('/api/comms/channels/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      const [existing] = await db.select().from(commsChannels)
        .where(and(eq(commsChannels.id, id), eq(commsChannels.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: 'Channel not found' });

      // Strict field allowlist with Zod validation — rejects non-JSON boolean strings like "false"
      const patchChannelSchema = z.object({
        config: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
        ownerUserId: z.number().nullable().optional(),
        smsEnabled: z.boolean().optional(),
      });
      const patchParsed = patchChannelSchema.safeParse(req.body);
      if (!patchParsed.success) {
        return res.status(400).json({ error: patchParsed.error.errors[0].message });
      }
      const updates = patchParsed.data;

      // Validate ownerUserId belongs to this tenant
      if (updates.ownerUserId != null) {
        const valid = await validateOwnerTenant(updates.ownerUserId, tenantId);
        if (!valid) return res.status(400).json({ error: 'ownerUserId does not belong to this tenant' });
      }

      // smsEnabled is a compliance-sensitive 10DLC gate — super_admin only
      if ('smsEnabled' in patchParsed.data && patchParsed.data.smsEnabled !== undefined) {
        if (req.user?.role !== 'super_admin') {
          return res.status(403).json({ error: 'Only platform administrators can toggle SMS enablement' });
        }
      }

      // Validate Twilio credentials if config is being updated for SMS channels
      if (existing.type === 'sms' && updates.config) {
        const cfg = updates.config as SmsChannelConfig;
        const existingCfg = (existing.config ?? {}) as Partial<SmsChannelConfig>;
        const accountSid = cfg.accountSid || existingCfg.accountSid;
        const apiKey = cfg.apiKey || existingCfg.apiKey;
        // Frontend sends redacted placeholder — use existing secret when placeholder detected
        const apiKeySecret = (cfg.apiKeySecret && !cfg.apiKeySecret.startsWith('•'))
          ? cfg.apiKeySecret
          : existingCfg.apiKeySecret;
        if (accountSid && apiKey && apiKeySecret) {
          try {
            const twilio = (await import('twilio')).default;
            const testClient = twilio(apiKey, apiKeySecret, { accountSid });
            await testClient.api.accounts(accountSid).fetch();
          } catch (twilioErr: unknown) {
            const twilioMsg = twilioErr instanceof Error ? twilioErr.message : 'invalid credentials';
            return res.status(400).json({ error: `Twilio validation failed: ${twilioMsg}` });
          }
        }
      }

      // If SMS config updated with redacted placeholder, restore actual secret from DB
      const sanitizedUpdates = { ...updates };
      if (existing.type === 'sms' && updates.config) {
        const incomingCfg = updates.config as SmsChannelConfig;
        if (incomingCfg.apiKeySecret?.startsWith('•')) {
          const existingCfg = (existing.config ?? {}) as Partial<SmsChannelConfig>;
          sanitizedUpdates.config = {
            ...incomingCfg,
            apiKeySecret: existingCfg.apiKeySecret ?? '',
          } as SmsChannelConfig;
        }
      }

      const [updated] = await db.update(commsChannels).set(sanitizedUpdates)
        .where(eq(commsChannels.id, id)).returning();
      res.json(redactChannelConfig(updated));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // Super-admin only: toggle smsEnabled on a channel
  app.patch('/api/comms/channels/:id/sms-enabled', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      const { smsEnabled } = req.body;
      if (typeof smsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'smsEnabled must be a boolean' });
      }
      const [existing] = await db.select().from(commsChannels)
        .where(and(eq(commsChannels.id, id), eq(commsChannels.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: 'Channel not found' });

      const [updated] = await db.update(commsChannels).set({ smsEnabled })
        .where(eq(commsChannels.id, id)).returning();
      res.json(redactChannelConfig(updated));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.delete('/api/comms/channels/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      await db.delete(commsChannels)
        .where(and(eq(commsChannels.id, id), eq(commsChannels.tenantId, tenantId)));
      res.json({ success: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== TEMPLATES ====================

  app.get('/api/comms/templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const channel = req.query.channel as string | undefined;
      const channelCondition = channel ? eq(commsTemplates.channel, channel) : undefined;
      const templates = await db.select().from(commsTemplates)
        .where(and(
          eq(commsTemplates.tenantId, tenantId),
          eq(commsTemplates.isActive, true),
          channelCondition
        ))
        .orderBy(desc(commsTemplates.createdAt));
      res.json(templates);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.get('/api/comms/templates/all', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const templates = await db.select().from(commsTemplates)
        .where(eq(commsTemplates.tenantId, tenantId))
        .orderBy(desc(commsTemplates.createdAt));
      res.json(templates);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.get('/api/comms/templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      const [template] = await db.select().from(commsTemplates)
        .where(and(eq(commsTemplates.id, id), eq(commsTemplates.tenantId, tenantId))).limit(1);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json(template);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.get('/api/comms/templates/:id/history', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);

      const allVersions: typeof commsTemplates.$inferSelect[] = [];
      let currentId: number | null = id;

      while (currentId !== null) {
        const [t] = await db.select().from(commsTemplates)
          .where(and(eq(commsTemplates.id, currentId), eq(commsTemplates.tenantId, tenantId))).limit(1);
        if (!t) break;
        allVersions.push(t);
        currentId = t.supersedesId ?? null;
      }

      res.json(allVersions);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  /** Throws if SMS templates are being marked active while no SMS channel
   *  has been approved (smsEnabled=true) for this tenant. Internal helper. */
  async function assertSmsAllowed(tenantId: number, channel: string, isActive: boolean): Promise<string | null> {
    if (channel !== 'sms' || !isActive) return null;
    const enabled = await db.select({ id: commsChannels.id }).from(commsChannels)
      .where(and(
        eq(commsChannels.tenantId, tenantId),
        eq(commsChannels.type, 'sms'),
        eq(commsChannels.smsEnabled, true),
        eq(commsChannels.isActive, true),
      ))
      .limit(1);
    if (!enabled.length) {
      return 'SMS templates cannot be activated until an SMS channel is approved (10DLC). Set up SMS in the Setup tab and ask a platform admin to enable it.';
    }
    return null;
  }

  app.post('/api/comms/templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const parsed = insertCommsTemplateSchema.safeParse({
        ...req.body,
        tenantId,
        createdBy: req.user?.id,
        version: 1,
      });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      const gateError = await assertSmsAllowed(tenantId, parsed.data.channel, parsed.data.isActive ?? true);
      if (gateError) return res.status(400).json({ error: gateError });

      const [template] = await db.insert(commsTemplates).values(parsed.data).returning();
      res.status(201).json(template);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.put('/api/comms/templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);

      const [existing] = await db.select().from(commsTemplates)
        .where(and(eq(commsTemplates.id, id), eq(commsTemplates.tenantId, tenantId))).limit(1);
      if (!existing) return res.status(404).json({ error: 'Template not found' });

      const gateError = await assertSmsAllowed(tenantId, existing.channel, true);
      if (gateError) return res.status(400).json({ error: gateError });

      await db.update(commsTemplates).set({ isActive: false }).where(eq(commsTemplates.id, id));

      const [newVersion] = await db.insert(commsTemplates).values({
        tenantId,
        name: req.body.name || existing.name,
        channel: existing.channel,
        subject: req.body.subject ?? existing.subject,
        body: req.body.body || existing.body,
        version: existing.version + 1,
        supersedesId: id,
        isActive: true,
        createdBy: req.user?.id,
      }).returning();

      res.json(newVersion);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.delete('/api/comms/templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      await db.update(commsTemplates).set({ isActive: false })
        .where(and(eq(commsTemplates.id, id), eq(commsTemplates.tenantId, tenantId)));
      res.json({ success: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== MERGE TAGS ====================

  app.get('/api/comms/merge-tags', authenticateUser, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const tags = await db.select().from(commsMergeTags).orderBy(asc(commsMergeTags.key));
      res.json(tags);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== TEMPLATE PREVIEW ====================

  app.post('/api/comms/templates/:id/preview', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      const { recipientId, loanId } = req.body;

      const result = await previewTemplate({
        templateId: id,
        recipientId: recipientId ? parseInt(recipientId) : undefined,
        loanId: loanId ? parseInt(loanId) : undefined,
        tenantId,
      });

      if (!result) return res.status(404).json({ error: 'Template not found' });
      res.json(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== MANUAL 1:1 SEND ====================

  const sendSchema = z.object({
    templateId: z.number(),
    recipientType: z.enum(['broker', 'borrower', 'lender_user']),
    recipientId: z.number(),
    loanId: z.number().optional(),
  });

  app.post('/api/comms/send', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;

      const parsed = sendSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      const result = await sendCommsMessage({
        tenantId,
        templateId: parsed.data.templateId,
        recipientType: parsed.data.recipientType,
        recipientId: parsed.data.recipientId,
        loanId: parsed.data.loanId,
        senderUserId: req.user?.id ?? null,
      });

      res.json(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  /** Test-send: dispatch a one-off built-in test message on a given channel
   *  to verify channel configuration. Recipient is the calling user (so we
   *  never bother real users while testing). Uses the existing send pipeline
   *  to honor opt-outs and tenant scoping. */
  app.post('/api/comms/channels/:id/test-send', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const channelId = parseInt(req.params.id);
      if (!req.user?.id) return res.status(401).json({ error: 'No user' });

      const [channel] = await db.select().from(commsChannels)
        .where(and(eq(commsChannels.id, channelId), eq(commsChannels.tenantId, tenantId)))
        .limit(1);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type === 'sms' && !channel.smsEnabled) {
        return res.status(400).json({ error: 'SMS is disabled until 10DLC approval is granted' });
      }

      // Find or create a one-shot test template for this channel
      const testName = `__channel_test_${channel.type}`;
      let [tpl] = await db.select().from(commsTemplates)
        .where(and(
          eq(commsTemplates.tenantId, tenantId),
          eq(commsTemplates.name, testName),
        ))
        .limit(1);
      if (!tpl) {
        const body = channel.type === 'email'
          ? '<p>This is a test message from your Lendry communications setup. If you received this, your channel is configured correctly.</p>'
          : 'Test message from Lendry: your channel is configured correctly.';
        const inserted = await db.insert(commsTemplates).values({
          tenantId,
          name: testName,
          channel: channel.type,
          subject: channel.type === 'email' ? 'Lendry test message' : null,
          body,
          createdBy: req.user.id,
        }).returning();
        tpl = inserted[0];
      }

      // Recipient = the calling user. They are tenant-scoped by definition.
      const recipientType = ['super_admin', 'lender', 'processor'].includes(req.user.role)
        ? 'lender_user' : (req.user.role as 'broker' | 'borrower');

      const result = await sendCommsMessage({
        tenantId,
        templateId: tpl.id,
        recipientType,
        recipientId: req.user.id,
        senderUserId: req.user.id,
      });
      res.json(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errMsg });
    }
  });

  // ==================== SEND LOG ====================

  app.get('/api/comms/send-log', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;

      const limit = Math.min(parseInt(req.query.limit as string || '50'), 200);
      const offset = parseInt(req.query.offset as string || '0');
      const channelFilter = req.query.channel as string | undefined;
      const statusFilter = req.query.status as string | undefined;
      const recipientIdFilter = req.query.recipientId as string | undefined;
      const recipientSearch = req.query.recipientSearch as string | undefined;
      // Accept both dateFrom/dateTo (UI) and after/before (legacy) for date range
      const afterDate = (req.query.dateFrom || req.query.after) as string | undefined;
      const beforeDate = (req.query.dateTo || req.query.before) as string | undefined;

      const conditions: SQL[] = [eq(commsSendLog.tenantId, tenantId)];
      if (channelFilter && ['email', 'sms', 'in_app'].includes(channelFilter)) {
        conditions.push(eq(commsSendLog.channel, channelFilter));
      }
      if (statusFilter && ['sent', 'failed', 'suppressed', 'skipped'].includes(statusFilter)) {
        conditions.push(eq(commsSendLog.status, statusFilter));
      }
      if (recipientIdFilter && !isNaN(parseInt(recipientIdFilter))) {
        conditions.push(eq(commsSendLog.recipientId, parseInt(recipientIdFilter)));
      }
      if (recipientSearch && recipientSearch.trim()) {
        const term = `%${recipientSearch.trim()}%`;
        // Search recipient contact value OR joined user name/email
        conditions.push(
          or(
            ilike(commsSendLog.recipientContactValue, term),
            ilike(users.fullName, term),
            ilike(users.email, term)
          ) as SQL
        );
      }
      if (afterDate) {
        conditions.push(gte(commsSendLog.sentAt, new Date(afterDate)));
      }
      if (beforeDate) {
        // Include the full day of dateTo by advancing to end-of-day
        const toDate = new Date(beforeDate);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(commsSendLog.sentAt, toDate));
      }

      const logs = await db.select({
        log: commsSendLog,
        recipientName: users.fullName,
        recipientEmail: users.email,
      })
        .from(commsSendLog)
        .leftJoin(users, and(eq(commsSendLog.recipientId, users.id), eq(users.tenantId, tenantId)))
        .where(and(...conditions))
        .orderBy(desc(commsSendLog.sentAt))
        .limit(limit)
        .offset(offset);

      res.json(logs);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== OPT-OUTS ====================

  app.get('/api/comms/opt-outs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const list = await listOptOuts(tenantId);
      res.json(list);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  const optOutAddSchema = z.object({
    contactValue: z.string().min(1),
    channel: z.enum(['email', 'sms', 'in_app']),
    source: z.enum(['stop_keyword', 'unsubscribe_link', 'in_app', 'manual', 'admin']).default('admin'),
    recipientId: z.number().optional(),
  });

  const optOutDeleteSchema = z.object({
    contactValue: z.string().min(1),
    channel: z.enum(['email', 'sms', 'in_app']),
  });

  app.post('/api/comms/opt-outs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;

      const parsed = optOutAddSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      await addOptOut({ tenantId, ...parsed.data });
      res.json({ success: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.delete('/api/comms/opt-outs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;

      const deleteParsed = optOutDeleteSchema.safeParse(req.body);
      if (!deleteParsed.success) return res.status(400).json({ error: deleteParsed.error.errors[0].message });

      await removeOptOut({ tenantId, ...deleteParsed.data });
      res.json({ success: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== SEGMENTS ====================

  const segmentFilterSchema = z.object({
    type: z.enum([
      'has_loan_in_stage', 'has_loan_in_status', 'closing_within_days',
      'stalled_days', 'created_within_days', 'has_phone',
      'has_email_consent', 'has_sms_consent',
    ]),
    values: z.array(z.string()).optional(),
    value: z.union([z.number(), z.boolean()]).optional(),
  });
  const segmentFilterConfigSchema = z.object({
    audience: z.enum(['broker', 'borrower', 'lender_user']),
    filters: z.array(segmentFilterSchema).default([]),
  });
  const segmentBodySchema = z.object({
    name: z.string().min(1).max(255),
    filterConfig: segmentFilterConfigSchema,
  });

  app.get('/api/comms/segments', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const rows = await db.select().from(commsSegments)
        .where(eq(commsSegments.tenantId, tenantId))
        .orderBy(desc(commsSegments.createdAt));
      res.json(rows);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.post('/api/comms/segments', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const parsed = segmentBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
      const [row] = await db.insert(commsSegments).values({
        tenantId,
        name: parsed.data.name,
        filterConfig: parsed.data.filterConfig,
        createdBy: req.user?.id ?? null,
      }).returning();
      res.status(201).json(row);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.put('/api/comms/segments/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      const parsed = segmentBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
      const [row] = await db.update(commsSegments)
        .set({ name: parsed.data.name, filterConfig: parsed.data.filterConfig })
        .where(and(eq(commsSegments.id, id), eq(commsSegments.tenantId, tenantId)))
        .returning();
      if (!row) return res.status(404).json({ error: 'Segment not found' });
      res.json(row);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.delete('/api/comms/segments/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id as string);
      await db.delete(commsSegments)
        .where(and(eq(commsSegments.id, id), eq(commsSegments.tenantId, tenantId)));
      res.json({ success: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  /** Preview a filter config without persisting. Accepts either {filterConfig} or {segmentId}. */
  app.post('/api/comms/segments/preview', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      let cfg: SegmentFilterConfig | null = null;

      if (req.body.segmentId) {
        const [row] = await db.select().from(commsSegments)
          .where(and(eq(commsSegments.id, req.body.segmentId), eq(commsSegments.tenantId, tenantId)))
          .limit(1);
        if (!row) return res.status(404).json({ error: 'Segment not found' });
        cfg = row.filterConfig as SegmentFilterConfig;
      } else {
        const parsed = segmentFilterConfigSchema.safeParse(req.body.filterConfig);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
        cfg = parsed.data;
      }

      const result = await resolveSegment(cfg, tenantId, { limit: 10 });
      res.json({ count: result.count, sample: result.recipients });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== BATCH SEND ====================

  const batchSendSchema = z.object({
    segmentId: z.number(),
    templateId: z.number(),
    scheduledFor: z.string().datetime().optional(),
  });

  app.post('/api/comms/batch-send', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;

      const parsed = batchSendSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      // Tenant-scoped segment & template
      const [seg] = await db.select().from(commsSegments)
        .where(and(eq(commsSegments.id, parsed.data.segmentId), eq(commsSegments.tenantId, tenantId)))
        .limit(1);
      if (!seg) return res.status(404).json({ error: 'Segment not found' });

      const [tpl] = await db.select().from(commsTemplates)
        .where(and(eq(commsTemplates.id, parsed.data.templateId), eq(commsTemplates.tenantId, tenantId)))
        .limit(1);
      if (!tpl) return res.status(404).json({ error: 'Template not found' });

      const cfg = seg.filterConfig as SegmentFilterConfig;
      if (!cfg) return res.status(400).json({ error: 'Segment has no filter config' });

      const { recipients } = await resolveSegment(cfg, tenantId);
      if (!recipients.length) return res.json({ batchId: null, queued: 0, dispatchedNow: 0 });

      const recipientType: 'broker' | 'borrower' | 'lender_user' =
        cfg.audience === 'lender_user' ? 'lender_user' : cfg.audience;

      const batchId = randomUUID();
      const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : new Date();
      const senderUserId = req.user?.id ?? null;
      const isFuture = scheduledFor.getTime() > Date.now() + 5_000;

      // Always queue rows (send-now still goes through the worker so all sends go through the same path)
      const rowsToInsert = recipients.map(r => ({
        runId: null,
        nodeId: null,
        tenantId,
        templateId: tpl.id,
        recipientId: r.id,
        recipientType,
        loanId: null,
        senderUserId,
        batchId,
        scheduledFor,
        status: 'pending' as const,
      }));

      // Insert in chunks to avoid query size limits
      const CHUNK = 100;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
        await db.insert(commsScheduledExecutions).values(rowsToInsert.slice(i, i + CHUNK));
      }

      let dispatchedNow = 0;
      if (!isFuture) {
        // Synchronous dispatch on the request thread for "send now" — every recipient
        // is processed before we respond. The worker also drains as a backup if the
        // request crashes mid-loop.
        const due = await db.select().from(commsScheduledExecutions)
          .where(and(
            eq(commsScheduledExecutions.batchId, batchId),
            eq(commsScheduledExecutions.status, 'pending'),
          ));

        for (const row of due) {
          // Claim the row first to prevent the worker from double-sending
          const [claimed] = await db.update(commsScheduledExecutions)
            .set({ status: 'executing', lockedAt: new Date(), attempts: sql`${commsScheduledExecutions.attempts} + 1` })
            .where(and(
              eq(commsScheduledExecutions.id, row.id),
              eq(commsScheduledExecutions.status, 'pending'),
            ))
            .returning();
          if (!claimed) continue;

          try {
            const result = await sendCommsMessage({
              tenantId,
              templateId: tpl.id,
              recipientType,
              recipientId: row.recipientId!,
              senderUserId,
            });
            await db.update(commsScheduledExecutions)
              .set({
                status: result.success || result.status === 'suppressed' || result.status === 'skipped' ? 'done' : 'failed',
                lastError: result.error ?? null,
                executedAt: new Date(),
              })
              .where(eq(commsScheduledExecutions.id, row.id));
            if (result.success) dispatchedNow++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await db.update(commsScheduledExecutions)
              .set({ status: 'failed', lastError: msg, executedAt: new Date() })
              .where(eq(commsScheduledExecutions.id, row.id));
          }
        }
      }

      res.json({
        batchId,
        queued: rowsToInsert.length,
        dispatchedNow,
        scheduledFor: scheduledFor.toISOString(),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  /** List recent batches with aggregate counts */
  app.get('/api/comms/batches', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const limit = Math.min(parseInt(req.query.limit as string || '25'), 100);

      const rows = await db.execute(sql`
        SELECT batch_id,
               MIN(template_id) AS template_id,
               MIN(scheduled_for) AS scheduled_for,
               MIN(created_at) AS created_at,
               COUNT(*) AS total,
               SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
               SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
               SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
          FROM comms_scheduled_executions
         WHERE tenant_id = ${tenantId}
           AND batch_id IS NOT NULL
           AND node_id IS NULL
         GROUP BY batch_id
         ORDER BY MIN(created_at) DESC
         LIMIT ${limit}
      `);
      res.json(rows.rows ?? []);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== RECIPIENT SEARCH ====================

  app.get('/api/comms/recipients/search', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const q = (req.query.q as string || '').trim();
      const searchPattern = `%${q}%`;

      // Apply ILIKE filter in SQL so results are not constrained to a fetch page
      const searchCondition: SQL | undefined = q
        ? or(
            ilike(users.fullName, searchPattern),
            ilike(users.email, searchPattern),
            ilike(users.companyName, searchPattern)
          )
        : undefined;

      const results = await db.select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        companyName: users.companyName,
      })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), searchCondition))
        .orderBy(asc(users.fullName))
        .limit(50);

      res.json(results);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // ==================== AUTOMATIONS (Phase 3) ====================

  /** Validate trigger config shape — required when activating an automation. */
  const triggerConfigSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('event'), eventName: z.enum(['loan_status_changed', 'document_uploaded', 'deal_submitted', 'task_completed']), filters: z.object({ toStage: z.string().optional(), fromStage: z.string().optional() }).optional() }),
    z.object({ kind: z.literal('time_absolute'), runAt: z.string(), segmentId: z.number().optional() }),
    z.object({ kind: z.literal('time_recurring'), everyMinutes: z.number().int().min(1), segmentId: z.number().optional() }),
    z.object({ kind: z.literal('time_relative'), anchorEvent: z.enum(['loan_status_changed', 'document_uploaded', 'deal_submitted', 'task_completed']), offsetMinutes: z.number().int().min(0), filters: z.object({ toStage: z.string().optional() }).optional() }),
    z.object({ kind: z.literal('manual') }),
  ]);

  const exitConditionsSchema = z.object({
    loanStatusEquals: z.array(z.string()).optional(),
    exitOnOptOut: z.boolean().optional(),
  }).optional().nullable();

  const nodeSchema = z.object({
    type: z.enum(['send', 'wait']),
    config: z.record(z.unknown()),
  });

  const channelEnum = z.enum(['email', 'sms', 'in_app']);

  const automationBodySchema = z.object({
    name: z.string().min(1).max(255),
    defaultChannel: channelEnum.default('email'),
    triggerConfig: triggerConfigSchema.optional().nullable(),
    exitConditions: exitConditionsSchema,
    notifyBrokerOnSend: z.boolean().optional(),
    maxDurationDays: z.number().int().positive().optional().nullable(),
    nodes: z.array(nodeSchema).optional(),
  });

  /**
   * Pre-save node validation. We refuse to persist invalid nodes so the editor
   * surfaces problems immediately, instead of letting them slip through to
   * activation time. Also enforces the single-channel rule against both the
   * node's declared channel AND the underlying template's actual channel.
   */
  type NodeIn = z.infer<typeof nodeSchema>;
  async function validateNodesForSave(
    nodes: NodeIn[],
    defaultChannel: 'email' | 'sms' | 'in_app',
    tenantId: number,
  ): Promise<string | null> {
    const templateIds: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const cfg = (n.config ?? {}) as Record<string, unknown>;
      if (n.type === 'send') {
        if (!cfg.templateId || typeof cfg.templateId !== 'number') {
          return `Send step #${i + 1} is missing a template`;
        }
        if (!cfg.recipientType || (cfg.recipientType !== 'borrower' && cfg.recipientType !== 'broker')) {
          return `Send step #${i + 1} is missing a recipient`;
        }
        if (cfg.channel && cfg.channel !== defaultChannel) {
          return `Send step #${i + 1} channel (${cfg.channel}) must match automation channel (${defaultChannel})`;
        }
        templateIds.push(cfg.templateId);
      } else if (n.type === 'wait') {
        const dm = cfg.durationMinutes;
        if (typeof dm !== 'number' || dm < 1) {
          return `Wait step #${i + 1} must have a duration of at least 1 minute`;
        }
      }
    }
    if (templateIds.length) {
      const tpls = await db.select({ id: commsTemplates.id, channel: commsTemplates.channel, tenantId: commsTemplates.tenantId })
        .from(commsTemplates)
        .where(sql`${commsTemplates.id} = ANY(${templateIds})`);
      const tplMap = new Map(tpls.map(t => [t.id, t]));
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.type !== 'send') continue;
        const tid = (n.config as Record<string, unknown>).templateId as number;
        const tpl = tplMap.get(tid);
        if (!tpl || tpl.tenantId !== tenantId) {
          return `Send step #${i + 1} references a template not in your workspace`;
        }
        if (tpl.channel !== defaultChannel) {
          return `Send step #${i + 1} template channel (${tpl.channel}) must match automation channel (${defaultChannel})`;
        }
      }
    }
    return null;
  }

  app.get('/api/comms/automations', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const list = await db.select().from(commsAutomations)
        .where(eq(commsAutomations.tenantId, tenantId))
        .orderBy(desc(commsAutomations.updatedAt));

      // Annotate each with node count + next scheduled run time
      const ids = list.map(a => a.id);
      const nodeCounts = ids.length ? await db.execute(sql`
        SELECT automation_id, COUNT(*)::int AS node_count
          FROM comms_automation_nodes
         WHERE automation_id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::int[]`)})
         GROUP BY automation_id
      `) : { rows: [] as Array<{ automation_id: number; node_count: number }> };
      const nextRuns = ids.length ? await db.execute(sql`
        SELECT a.id AS automation_id, MIN(s.scheduled_for) AS next_run
          FROM comms_automations a
          LEFT JOIN comms_automation_runs r ON r.automation_id = a.id
          LEFT JOIN comms_scheduled_executions s ON s.run_id = r.id AND s.status = 'pending'
         WHERE a.id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::int[]`)})
         GROUP BY a.id
      `) : { rows: [] as Array<{ automation_id: number; next_run: string | null }> };

      const countMap = new Map<number, number>();
      for (const r of (nodeCounts.rows ?? []) as Array<{ automation_id: number; node_count: number }>) {
        countMap.set(r.automation_id, r.node_count);
      }
      const nextMap = new Map<number, string | null>();
      for (const r of (nextRuns.rows ?? []) as Array<{ automation_id: number; next_run: string | null }>) {
        nextMap.set(r.automation_id, r.next_run);
      }

      res.json(list.map(a => ({
        ...a,
        nodeCount: countMap.get(a.id) ?? 0,
        nextRunAt: nextMap.get(a.id) ?? null,
      })));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.get('/api/comms/automations/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id);
      const [a] = await db.select().from(commsAutomations)
        .where(and(eq(commsAutomations.id, id), eq(commsAutomations.tenantId, tenantId)))
        .limit(1);
      if (!a) return res.status(404).json({ error: 'Automation not found' });
      const nodes = await db.select().from(commsAutomationNodes)
        .where(eq(commsAutomationNodes.automationId, id))
        .orderBy(asc(commsAutomationNodes.orderIndex));
      res.json({ ...a, nodes });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.post('/api/comms/automations', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const parsed = automationBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      if (parsed.data.nodes?.length) {
        const nodeErr = await validateNodesForSave(parsed.data.nodes, parsed.data.defaultChannel, tenantId);
        if (nodeErr) return res.status(400).json({ error: nodeErr });
      }

      const [created] = await db.insert(commsAutomations).values({
        tenantId,
        name: parsed.data.name,
        status: 'draft',
        defaultChannel: parsed.data.defaultChannel,
        triggerConfig: parsed.data.triggerConfig ?? null,
        exitConditions: parsed.data.exitConditions ?? null,
        notifyBrokerOnSend: parsed.data.notifyBrokerOnSend ?? false,
        maxDurationDays: parsed.data.maxDurationDays ?? null,
        createdBy: req.user?.id ?? null,
      }).returning();

      if (parsed.data.nodes?.length) {
        await db.insert(commsAutomationNodes).values(
          parsed.data.nodes.map((n, idx) => ({
            automationId: created.id,
            orderIndex: idx,
            type: n.type,
            config: n.config,
          }))
        );
      }
      res.status(201).json(created);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.put('/api/comms/automations/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(commsAutomations)
        .where(and(eq(commsAutomations.id, id), eq(commsAutomations.tenantId, tenantId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Automation not found' });

      const parsed = automationBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      if (parsed.data.nodes?.length) {
        const nodeErr = await validateNodesForSave(parsed.data.nodes, parsed.data.defaultChannel, tenantId);
        if (nodeErr) return res.status(400).json({ error: nodeErr });
      }

      // Editing an active automation rewires it after save
      const wasActive = existing.status === 'active';

      await db.update(commsAutomations).set({
        name: parsed.data.name,
        defaultChannel: parsed.data.defaultChannel,
        triggerConfig: parsed.data.triggerConfig ?? null,
        exitConditions: parsed.data.exitConditions ?? null,
        notifyBrokerOnSend: parsed.data.notifyBrokerOnSend ?? false,
        maxDurationDays: parsed.data.maxDurationDays ?? null,
        updatedAt: new Date(),
      }).where(eq(commsAutomations.id, id));

      if (parsed.data.nodes) {
        // Replace node set wholesale — runs already in flight reference frozen ids
        // via cascading FK on commsAutomationRuns.currentNodeId (set null), so this
        // is safe: in-flight runs whose current node is deleted will be marked
        // failed by the worker on next tick.
        await db.delete(commsAutomationNodes).where(eq(commsAutomationNodes.automationId, id));
        if (parsed.data.nodes.length) {
          await db.insert(commsAutomationNodes).values(
            parsed.data.nodes.map((n, idx) => ({
              automationId: id, orderIndex: idx, type: n.type, config: n.config,
            }))
          );
        }
      }

      // Always unwire on edit; re-wire only if still active AND has a trigger config.
      // Prevents listener/timer leaks when triggerConfig becomes null on an active automation.
      unwireAutomation(id);
      if (wasActive && parsed.data.triggerConfig) {
        wireAutomation(id, tenantId, parsed.data.triggerConfig as TriggerConfig);
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.delete('/api/comms/automations/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(commsAutomations)
        .where(and(eq(commsAutomations.id, id), eq(commsAutomations.tenantId, tenantId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Automation not found' });
      unwireAutomation(id);
      // Explicitly exit any in-flight runs so they don't stay 'running' forever
      // after their queue rows drain. Mirror the pause flow's queue cleanup.
      await db.update(commsAutomationRuns)
        .set({ status: 'exited', exitReason: 'automation_archived' })
        .where(and(eq(commsAutomationRuns.automationId, id), eq(commsAutomationRuns.status, 'running')));
      await db.update(commsScheduledExecutions)
        .set({ status: 'done', executedAt: new Date(), lastError: 'exited:automation_archived' })
        .where(and(
          isNotNull(commsScheduledExecutions.runId),
          eq(commsScheduledExecutions.status, 'pending'),
          sql`${commsScheduledExecutions.runId} IN (SELECT id FROM comms_automation_runs WHERE automation_id = ${id})`,
        ));
      await db.update(commsAutomations).set({ status: 'archived', updatedAt: new Date() })
        .where(eq(commsAutomations.id, id));
      res.json({ ok: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.post('/api/comms/automations/:id/activate', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id);
      const [a] = await db.select().from(commsAutomations)
        .where(and(eq(commsAutomations.id, id), eq(commsAutomations.tenantId, tenantId)))
        .limit(1);
      if (!a) return res.status(404).json({ error: 'Automation not found' });
      if (!a.triggerConfig) return res.status(400).json({ error: 'Trigger must be configured before activation' });

      // Re-validate trigger config (in case it was saved before stricter rules existed).
      const triggerOk = triggerConfigSchema.safeParse(a.triggerConfig);
      if (!triggerOk.success) {
        return res.status(400).json({ error: `Invalid trigger config: ${triggerOk.error.errors[0].message}` });
      }
      // For time_absolute, refuse to activate if the runAt is in the past.
      if (triggerOk.data.kind === 'time_absolute') {
        const at = new Date(triggerOk.data.runAt).getTime();
        if (Number.isNaN(at) || at <= Date.now()) {
          return res.status(400).json({ error: 'time_absolute runAt must be in the future' });
        }
      }

      const nodes = await db.select().from(commsAutomationNodes)
        .where(eq(commsAutomationNodes.automationId, id))
        .orderBy(asc(commsAutomationNodes.orderIndex));
      if (nodes.length === 0) {
        return res.status(400).json({ error: 'At least one node is required to activate' });
      }
      // Validate per-node config so we never activate an automation that will fail at dispatch.
      // Single-channel automations: every send node must use the automation's defaultChannel,
      // AND the underlying template's own channel must match — otherwise a crafted PUT payload
      // could slip a mismatched template past the explicit-channel check.
      const templateIds: number[] = [];
      for (const n of nodes) {
        const cfg = (n.config ?? {}) as Record<string, unknown>;
        if (n.type === 'send') {
          if (!cfg.templateId || !cfg.recipientType) {
            return res.status(400).json({ error: `Send node #${n.orderIndex + 1} is missing template/recipient` });
          }
          if (cfg.channel && cfg.channel !== a.defaultChannel) {
            return res.status(400).json({
              error: `Send node #${n.orderIndex + 1} channel (${cfg.channel}) must match automation channel (${a.defaultChannel})`,
            });
          }
          templateIds.push(Number(cfg.templateId));
        } else if (n.type === 'wait') {
          const dm = cfg.durationMinutes;
          if (typeof dm !== 'number' || dm < 1) {
            return res.status(400).json({ error: `Wait node #${n.orderIndex + 1} must have durationMinutes >= 1` });
          }
        }
      }

      if (templateIds.length) {
        const tpls = await db.select({ id: commsTemplates.id, channel: commsTemplates.channel, tenantId: commsTemplates.tenantId })
          .from(commsTemplates)
          .where(sql`${commsTemplates.id} = ANY(${templateIds})`);
        const tplMap = new Map(tpls.map(t => [t.id, t]));
        for (const n of nodes) {
          if (n.type !== 'send') continue;
          const cfg = (n.config ?? {}) as Record<string, unknown>;
          const tid = Number(cfg.templateId);
          const tpl = tplMap.get(tid);
          if (!tpl || tpl.tenantId !== tenantId) {
            return res.status(400).json({ error: `Send node #${n.orderIndex + 1} references template ${tid} which is not in your tenant` });
          }
          if (tpl.channel !== a.defaultChannel) {
            return res.status(400).json({
              error: `Send node #${n.orderIndex + 1} template channel (${tpl.channel}) must match automation channel (${a.defaultChannel})`,
            });
          }
        }
      }

      await db.update(commsAutomations).set({ status: 'active', updatedAt: new Date() })
        .where(eq(commsAutomations.id, id));
      wireAutomation(id, tenantId, a.triggerConfig as TriggerConfig);
      res.json({ ok: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.post('/api/comms/automations/:id/pause', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id);
      const [a] = await db.select().from(commsAutomations)
        .where(and(eq(commsAutomations.id, id), eq(commsAutomations.tenantId, tenantId)))
        .limit(1);
      if (!a) return res.status(404).json({ error: 'Automation not found' });
      unwireAutomation(id);
      await db.update(commsAutomations).set({ status: 'paused', updatedAt: new Date() })
        .where(eq(commsAutomations.id, id));
      // Terminate in-flight runs so they don't sit forever in `running`.
      // Re-activating an automation does not auto-resume paused runs — fire fresh ones.
      await db.update(commsAutomationRuns)
        .set({ status: 'exited', exitReason: 'automation_paused' })
        .where(and(eq(commsAutomationRuns.automationId, id), eq(commsAutomationRuns.status, 'running')));
      res.json({ ok: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  // Manual runs accept loan / borrower / broker subjects. Each subject is
  // tenant-scope-validated before any run is created.
  const startRunBody = z.object({
    subjectType: z.enum(['loan', 'broker', 'borrower']),
    subjectId: z.number().int().positive(),
  });
  app.post('/api/comms/automations/:id/start-run', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id);
      const parsed = startRunBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      // Tenant scope check on the subject — never let an admin start a run
      // against another tenant's loan or user.
      if (parsed.data.subjectType === 'loan') {
        const [loan] = await db.select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, parsed.data.subjectId), eq(projects.tenantId, tenantId)))
          .limit(1);
        if (!loan) return res.status(404).json({ error: 'Loan not found in your tenant' });
      } else {
        const expectedRole = parsed.data.subjectType; // 'broker' | 'borrower'
        const [u] = await db.select({ id: users.id, role: users.role })
          .from(users)
          .where(and(eq(users.id, parsed.data.subjectId), eq(users.tenantId, tenantId)))
          .limit(1);
        if (!u) return res.status(404).json({ error: `${expectedRole} not found in your tenant` });
        if (u.role !== expectedRole) {
          return res.status(400).json({ error: `User ${parsed.data.subjectId} is not a ${expectedRole}` });
        }
      }

      const result = await startManualRun({
        automationId: id,
        tenantId,
        subjectType: parsed.data.subjectType,
        subjectId: parsed.data.subjectId,
      });
      if (result.error) return res.status(400).json({ error: result.error });
      res.json({ runId: result.runId });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });

  app.get('/api/comms/automations/:id/runs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const id = parseInt(req.params.id);
      // Tenant scope via the parent automation
      const [a] = await db.select({ id: commsAutomations.id }).from(commsAutomations)
        .where(and(eq(commsAutomations.id, id), eq(commsAutomations.tenantId, tenantId)))
        .limit(1);
      if (!a) return res.status(404).json({ error: 'Automation not found' });

      const runs = await db.select().from(commsAutomationRuns)
        .where(eq(commsAutomationRuns.automationId, id))
        .orderBy(desc(commsAutomationRuns.startedAt))
        .limit(50);

      // Enrich each run with parked-node info (current step) plus the latest
      // send-log id for that run so the UI can deep-link into the Send Log.
      const nodeIds = Array.from(new Set(runs.map(r => r.currentNodeId).filter((x): x is number => !!x)));
      const nodes = nodeIds.length
        ? await db.select().from(commsAutomationNodes).where(sql`${commsAutomationNodes.id} = ANY(${nodeIds})`)
        : [];
      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      const runIds = runs.map(r => r.id);
      let lastSendByRun = new Map<number, number>();
      if (runIds.length) {
        const sendLogs = await db.select({ id: commsSendLog.id, runId: commsSendLog.runId })
          .from(commsSendLog)
          .where(sql`${commsSendLog.runId} = ANY(${runIds})`)
          .orderBy(desc(commsSendLog.id));
        for (const r of sendLogs) {
          if (r.runId != null && !lastSendByRun.has(r.runId)) lastSendByRun.set(r.runId, r.id);
        }
      }

      const enriched = runs.map(r => {
        const n = r.currentNodeId ? nodeMap.get(r.currentNodeId) : null;
        return {
          ...r,
          parkedNode: n ? {
            id: n.id,
            ordinal: n.orderIndex + 1,
            type: n.type,
            label: n.type === 'send' ? 'Send message' : 'Wait',
          } : null,
          lastSendLogId: lastSendByRun.get(r.id) ?? null,
        };
      });
      res.json(enriched);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err); res.status(500).json({ error: errMsg });
    }
  });
}

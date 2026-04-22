// Broker AI SDR / CRM API Routes
import crypto from 'crypto';
import { Express, Response } from 'express';
import { AuthRequest, authenticateUser } from '../auth';
import { db } from '../db';
import {
  brokerContacts,
  brokerOutreachMessages,
  brokerChannelConfigs,
  brokerSmsReplies,
  emailAccounts,
  users,
} from '@shared/schema';
import { eq, and, or, ilike, desc, asc, inArray } from 'drizzle-orm';
import * as sdrService from '../services/brokerSdr';
import { encryptToken, decryptToken } from '../utils/encryption';

interface TwilioConfig {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  fromNumber: string;
  authToken?: string;      // Account Auth Token (encrypted) — used to verify X-Twilio-Signature
  webhookToken?: string;   // Per-broker UUID embedded in the webhook URL for a second auth layer
}

/**
 * Middleware: Ensure user is a broker
 */
const requireBroker = async (req: AuthRequest, res: Response, next: Function) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await db.query.users.findFirst({
      where: (u) => eq(u.id, req.user!.id),
    });

    if (!user || user.role !== 'broker') {
      return res.status(403).json({ error: 'Broker access required' });
    }

    next();
  } catch (error) {
    console.error('Broker auth error:', error);
    res.status(500).json({ error: 'Authorization failed' });
  }
};

// One-time startup backfill: generate webhookToken for any existing SMS configs that lack one
// so that inbound reply capture works without requiring brokers to re-save their credentials.
async function backfillSmsWebhookTokens() {
  try {
    const rows = await db.select().from(brokerChannelConfigs)
      .where(and(eq(brokerChannelConfigs.type, 'sms'), eq(brokerChannelConfigs.isActive, true)));

    let updated = 0;
    for (const row of rows) {
      const cfg = row.config as TwilioConfig;
      if (!cfg.webhookToken) {
        await db.update(brokerChannelConfigs)
          .set({ config: { ...cfg, webhookToken: crypto.randomUUID() } })
          .where(eq(brokerChannelConfigs.id, row.id));
        updated++;
      }
    }

    if (updated > 0) {
      console.log(`[BrokerSMS] Backfilled webhookToken for ${updated} SMS config(s)`);
    }
  } catch (err) {
    console.warn('[BrokerSMS] webhookToken backfill failed (non-fatal):', err);
  }
}

export function registerBrokerSdrRoutes(app: Express) {
  // Run the one-time backfill asynchronously at startup (non-blocking)
  backfillSmsWebhookTokens();

  // ==================== CONTACTS CRUD ====================

  // Get all contacts for broker
  app.get('/api/broker/contacts', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const { search, type, isActive, limit = '50', offset = '0' } = req.query;

      // Apply filters
      const conditions: any[] = [eq(brokerContacts.brokerId, brokerId)];

      if (search && typeof search === 'string') {
        conditions.push(
          or(
            ilike(brokerContacts.firstName, `%${search}%`),
            ilike(brokerContacts.lastName, `%${search}%`),
            ilike(brokerContacts.email || '', `%${search}%`),
            ilike(brokerContacts.company || '', `%${search}%`)
          )
        );
      }

      if (type && typeof type === 'string') {
        conditions.push(eq(brokerContacts.contactType, type));
      }

      if (isActive !== undefined) {
        conditions.push(eq(brokerContacts.isActive, isActive === 'true'));
      }

      const contacts = await db.query.brokerContacts.findMany({
        where: and(...conditions),
        orderBy: (c) => desc(c.createdAt),
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      // Get total count
      const total = await db.query.brokerContacts.findMany({
        where: (c) => eq(c.brokerId, brokerId),
      });

      res.json({
        contacts,
        total: total.length,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
    } catch (error: any) {
      console.error('Error fetching contacts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a contact
  app.post('/api/broker/contacts', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const contactData = req.body;

      const contact = await db.insert(brokerContacts).values({
        brokerId,
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        email: contactData.email,
        phone: contactData.phone,
        company: contactData.company,
        contactType: contactData.contactType || 'prospect',
        notes: contactData.notes,
        tags: contactData.tags || [],
        source: contactData.source,
        isActive: true,
      } as any).returning();

      res.status(201).json(contact[0]);
    } catch (error: any) {
      console.error('Error creating contact:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update a contact
  app.put('/api/broker/contacts/:id', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const contactId = parseInt(req.params.id, 10);
      const contactData = req.body;

      // Verify ownership
      const contact = await db.query.brokerContacts.findFirst({
        where: (c) => and(eq(c.id, contactId), eq(c.brokerId, brokerId)),
      });

      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const updated = await db.update(brokerContacts)
        .set({
          firstName: contactData.firstName || contact.firstName,
          lastName: contactData.lastName || contact.lastName,
          email: contactData.email || contact.email,
          phone: contactData.phone || contact.phone,
          company: contactData.company || contact.company,
          contactType: contactData.contactType || contact.contactType,
          notes: contactData.notes !== undefined ? contactData.notes : contact.notes,
          tags: contactData.tags || contact.tags,
          source: contactData.source || contact.source,
          isActive: contactData.isActive !== undefined ? contactData.isActive : contact.isActive,
          lastContactedAt: contactData.lastContactedAt || contact.lastContactedAt,
          updatedAt: new Date(),
        } as any)
        .where(eq(brokerContacts.id, contactId))
        .returning();

      res.json(updated[0]);
    } catch (error: any) {
      console.error('Error updating contact:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a contact
  app.delete('/api/broker/contacts/:id', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const contactId = parseInt(req.params.id, 10);

      // Verify ownership
      const contact = await db.query.brokerContacts.findFirst({
        where: (c) => and(eq(c.id, contactId), eq(c.brokerId, brokerId)),
      });

      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      await db.delete(brokerContacts).where(eq(brokerContacts.id, contactId));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting contact:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk import contacts from CSV
  app.post('/api/broker/contacts/import', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const { csvContent } = req.body;

      if (!csvContent) {
        return res.status(400).json({ error: 'CSV content required' });
      }

      // Simple CSV parsing (no external dependency needed)
      const rows = csvContent.trim().split('\n');
      const headers = rows[0].split(',').map(h => h.trim());
      const data = rows.slice(1).map(row => {
        const values = row.split(',').map(v => v.trim());
        const obj: any = {};
        headers.forEach((header, i) => {
          obj[header.toLowerCase()] = values[i];
        });
        return obj;
      });

      const importedContacts = [];
      const errors = [];

      for (const row of data) {
        try {
          const [contact] = await db.insert(brokerContacts).values({
            brokerId,
            firstName: row.firstname || row.first_name || '',
            lastName: row.lastname || row.last_name || '',
            email: row.email,
            phone: row.phone,
            company: row.company,
            contactType: row.contacttype || row.contact_type || 'prospect',
            notes: row.notes,
            tags: row.tags ? (Array.isArray(row.tags) ? row.tags : row.tags.split(',')) : [],
            source: row.source || 'csv_import',
            isActive: true,
          } as any).returning();

          importedContacts.push(contact);
        } catch (error: any) {
          errors.push({
            row: row,
            error: error.message,
          });
        }
      }

      res.json({
        imported: importedContacts.length,
        total: data.length,
        errors,
      });
    } catch (error: any) {
      console.error('Error importing contacts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== OUTREACH MESSAGES ====================

  // Generate AI outreach messages
  app.post('/api/broker/outreach/generate', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const { contactIds, prompt, channel } = req.body;

      if (!contactIds || !prompt || !channel) {
        return res.status(400).json({ error: 'contactIds, prompt, and channel are required' });
      }

      // Generate messages
      const messages = await sdrService.generateOutreachMessages({
        brokerId,
        contactIds,
        prompt,
        channel,
      });

      // Save as drafts
      const savedMessages = await sdrService.saveDraftMessages(brokerId, messages);

      res.json({
        messages: messages,
        savedCount: savedMessages.length,
      });
    } catch (error: any) {
      console.error('Error generating messages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get outreach messages for broker
  app.get('/api/broker/outreach/messages', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const { status = 'draft', limit = '50', offset = '0' } = req.query;

      // When status==='all', return every status so failed/opted_out entries are visible
      const applyStatusFilter = status && status !== 'all';
      const messages = await db.query.brokerOutreachMessages.findMany({
        where: (m) =>
          and(
            eq(m.brokerId, brokerId),
            applyStatusFilter ? eq(m.status, status as string) : undefined
          ),
        orderBy: (m) => desc(m.createdAt),
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      // Enhance with contact info
      const enhanced = await Promise.all(
        messages.map(async (msg) => {
          const contact = msg.contactId
            ? await db.query.brokerContacts.findFirst({
                where: (c) => eq(c.id, msg.contactId),
              })
            : null;

          return {
            ...msg,
            contact,
          };
        })
      );

      res.json(enhanced);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update a draft message
  app.put('/api/broker/outreach/messages/:id', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const messageId = parseInt(req.params.id, 10);
      const { subject, body, personalizedBody } = req.body;

      // Verify ownership and draft status
      const message = await db.query.brokerOutreachMessages.findFirst({
        where: (m) =>
          and(
            eq(m.id, messageId),
            eq(m.brokerId, brokerId),
            eq(m.status, 'draft')
          ),
      });

      if (!message) {
        return res.status(404).json({ error: 'Draft message not found' });
      }

      const updated = await db.update(brokerOutreachMessages)
        .set({
          subject: subject || message.subject,
          body: body || message.body,
          personalizedBody: personalizedBody || message.personalizedBody,
        } as any)
        .where(eq(brokerOutreachMessages.id, messageId))
        .returning();

      res.json(updated[0]);
    } catch (error: any) {
      console.error('Error updating message:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send a single message
  app.post('/api/broker/outreach/messages/:id/send', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const messageId = parseInt(req.params.id, 10);

      const result = await sdrService.sendOutreachMessage(messageId, brokerId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, sentAt: result.sentAt });
    } catch (error: any) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send batch messages
  app.post('/api/broker/outreach/send-batch', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const { messageIds } = req.body;

      if (!messageIds || !Array.isArray(messageIds)) {
        return res.status(400).json({ error: 'messageIds array is required' });
      }

      const results = await sdrService.sendBatchMessages(messageIds, brokerId);

      const successful = results.filter((r) => r.success).length;

      res.json({
        total: results.length,
        successful,
        failed: results.length - successful,
        results,
      });
    } catch (error: any) {
      console.error('Error sending batch:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== AI SUGGESTIONS ====================

  // Get AI-generated suggestions
  app.get('/api/broker/suggestions', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const suggestions = await sdrService.suggestAutomations(brokerId);

      res.json(suggestions);
    } catch (error: any) {
      console.error('Error getting suggestions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Execute a suggestion (generates messages)
  app.post('/api/broker/suggestions/:id/execute', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const suggestionId = req.params.id;

      const suggestions = await sdrService.suggestAutomations(brokerId);
      const suggestion = suggestions.find((s) => s.id === suggestionId);

      if (!suggestion) {
        return res.status(404).json({ error: 'Suggestion not found' });
      }

      let prompt = '';
      const contactIds = suggestion.metadata.contactIds || [];

      switch (suggestion.actionType) {
        case 'reengagement':
          prompt = `Send a friendly re-engagement check-in message. We haven't talked to this person in a while, so be warm and genuine. Remind them about the great things we can help with.`;
          break;
        case 'followup':
          if (suggestion.metadata.type === 'new_leads') {
            prompt = `Send a friendly welcome message to this new lead. Introduce yourself, mention that we'd love to help with their lending needs, and ask if they'd like to chat.`;
          } else {
            prompt = `Send a follow-up message checking in on their progress. Reference anything specific that we discussed if possible.`;
          }
          break;
        case 'birthday':
          prompt = `Send a warm birthday message wishing them a great year ahead. Keep it brief and personable.`;
          break;
        default:
          prompt = `Send a personalized outreach message.`;
      }

      const messages = await sdrService.generateOutreachMessages({
        brokerId,
        contactIds,
        prompt,
        channel: 'email',
      });

      const saved = await sdrService.saveDraftMessages(brokerId, messages);

      res.json({
        suggestionId,
        messagesGenerated: messages.length,
        savedCount: saved.length,
        messages,
      });
    } catch (error: any) {
      console.error('Error executing suggestion:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== STATS ====================

  // Get broker stats
  app.get('/api/broker/stats', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;

      const allContacts = await db.query.brokerContacts.findMany({
        where: (c) => eq(c.brokerId, brokerId),
      });

      const thisWeek = new Date();
      thisWeek.setDate(thisWeek.getDate() - 7);

      const thisMonth = new Date();
      thisMonth.setMonth(thisMonth.getMonth() - 1);

      const sentThisWeek = await db.query.brokerOutreachMessages.findMany({
        where: (m) =>
          and(
            eq(m.brokerId, brokerId),
            eq(m.status, 'sent')
            // TODO: Add date filtering when Drizzle supports it better
          ),
      });

      const sentThisMonth = await db.query.brokerOutreachMessages.findMany({
        where: (m) =>
          and(
            eq(m.brokerId, brokerId),
            eq(m.status, 'sent')
          ),
      });

      const opened = await db.query.brokerOutreachMessages.findMany({
        where: (m) =>
          and(
            eq(m.brokerId, brokerId),
            eq(m.status, 'sent')
            // TODO: Filter by opened emails
          ),
      });

      res.json({
        totalContacts: allContacts.length,
        activeContacts: allContacts.filter((c) => c.isActive).length,
        messagesSentThisWeek: sentThisWeek.filter(
          (m) => new Date(m.sentAt!) > thisWeek
        ).length,
        messagesSentThisMonth: sentThisMonth.filter(
          (m) => new Date(m.sentAt!) > thisMonth
        ).length,
        openRate:
          sentThisMonth.length > 0
            ? (opened.length / sentThisMonth.length) * 100
            : 0,
        lastActivityDate: allContacts.length
          ? allContacts
              .filter((c) => c.lastContactedAt)
              .sort(
                (a, b) =>
                  new Date(b.lastContactedAt!).getTime() -
                  new Date(a.lastContactedAt!).getTime()
              )[0]?.lastContactedAt
          : null,
      });
    } catch (error: any) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== BROKER CHANNEL CONFIG ====================

  // GET /api/broker/channels — return SMS config + Gmail email account status
  app.get('/api/broker/channels', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;

      const [smsRow] = await db.select().from(brokerChannelConfigs)
        .where(and(eq(brokerChannelConfigs.brokerId, brokerId), eq(brokerChannelConfigs.type, 'sms')));

      const [emailRow] = await db.select({
        id: emailAccounts.id,
        emailAddress: emailAccounts.emailAddress,
        isActive: emailAccounts.isActive,
        lastSyncAt: emailAccounts.lastSyncAt,
      }).from(emailAccounts)
        .where(and(eq(emailAccounts.userId, brokerId), eq(emailAccounts.isActive, true)));

      const smsConfig = smsRow ? (smsRow.config as TwilioConfig) : null;

      res.json({
        sms: smsRow ? {
          connected: true,
          accountSid: smsConfig?.accountSid || '',
          fromNumber: smsConfig?.fromNumber || '',
          smsApproved: smsRow.smsApproved,
          hasApiKey: !!(smsConfig?.apiKey),
          hasAuthToken: !!(smsConfig?.authToken), // whether X-Twilio-Signature verification is active
          webhookToken: smsConfig?.webhookToken || '',
        } : { connected: false },
        email: emailRow ? {
          connected: true,
          emailAddress: emailRow.emailAddress,
          lastSyncAt: emailRow.lastSyncAt,
        } : { connected: false },
      });
    } catch (error: any) {
      console.error('Error fetching broker channels:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/broker/channels/sms — save & validate Twilio credentials
  app.post('/api/broker/channels/sms', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const { accountSid, apiKey, apiKeySecret, fromNumber, authToken } = req.body;

      if (!accountSid || !apiKey || !apiKeySecret || !fromNumber) {
        return res.status(400).json({ error: 'accountSid, apiKey, apiKeySecret, and fromNumber are required' });
      }

      // Validate credentials against Twilio API
      try {
        const twilio = (await import('twilio')).default;
        const client = twilio(apiKey, apiKeySecret, { accountSid });
        await client.api.accounts(accountSid).fetch();
      } catch (twilioErr: any) {
        return res.status(400).json({ error: `Twilio validation failed: ${twilioErr.message || 'Invalid credentials'}` });
      }

      // Upsert config
      const [existing] = await db.select().from(brokerChannelConfigs)
        .where(and(eq(brokerChannelConfigs.brokerId, brokerId), eq(brokerChannelConfigs.type, 'sms')));

      // Preserve existing webhookToken so the broker's Twilio webhook URL stays stable on re-save
      const existingCfg = existing ? (existing.config as TwilioConfig) : null;
      const webhookToken = existingCfg?.webhookToken || crypto.randomUUID();

      const configPayload: TwilioConfig = {
        accountSid,
        apiKey: encryptToken(apiKey),
        apiKeySecret: encryptToken(apiKeySecret),
        fromNumber,
        webhookToken,
        // Encrypt the Account Auth Token if provided (used for webhook signature validation)
        ...(authToken ? { authToken: encryptToken(authToken) } : (existingCfg?.authToken ? { authToken: existingCfg.authToken } : {})),
      };

      if (existing) {
        await db.update(brokerChannelConfigs)
          .set({ config: configPayload, isActive: true, updatedAt: new Date() })
          .where(eq(brokerChannelConfigs.id, existing.id));
      } else {
        await db.insert(brokerChannelConfigs).values({
          brokerId,
          type: 'sms',
          config: configPayload,
          isActive: true,
          smsApproved: false,
        });
      }

      res.json({ success: true, message: 'SMS channel connected successfully' });
    } catch (error: any) {
      console.error('Error saving SMS channel:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/broker/channels/sms — disconnect SMS channel
  app.delete('/api/broker/channels/sms', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      await db.delete(brokerChannelConfigs)
        .where(and(eq(brokerChannelConfigs.brokerId, brokerId), eq(brokerChannelConfigs.type, 'sms')));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/broker/channels/sms/test — send test SMS to the broker's own phone
  app.post('/api/broker/channels/sms/test', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;

      // Fetch the broker's own phone number — test can only go to broker's account
      const brokerUser = await db.query.users.findFirst({ where: (u) => eq(u.id, brokerId) });
      const brokerPhone = brokerUser?.phone;

      if (!brokerPhone) {
        return res.status(400).json({
          error: 'No phone number on your profile. Please add your phone number in Settings → Profile before testing.',
        });
      }

      const [smsRow] = await db.select().from(brokerChannelConfigs)
        .where(and(eq(brokerChannelConfigs.brokerId, brokerId), eq(brokerChannelConfigs.type, 'sms')));

      if (!smsRow) {
        return res.status(400).json({ error: 'No SMS channel configured. Please save your credentials first.' });
      }

      const cfg = smsRow.config as TwilioConfig;
      const twilio = (await import('twilio')).default;
      const client = twilio(decryptToken(cfg.apiKey), decryptToken(cfg.apiKeySecret), { accountSid: cfg.accountSid });

      await client.messages.create({
        body: 'Test message from Lendry.AI — your SMS channel is connected and working! 🎉',
        from: cfg.fromNumber,
        to: brokerPhone,
      });

      res.json({ success: true, message: `Test SMS sent to ${brokerPhone}` });
    } catch (error: any) {
      console.error('Error sending test SMS:', error);
      res.status(500).json({ error: `Failed to send test SMS: ${error.message}` });
    }
  });

  // GET /api/broker/channels/email — email account status (read from emailAccounts table)
  app.get('/api/broker/channels/email', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const [emailRow] = await db.select({
        id: emailAccounts.id,
        emailAddress: emailAccounts.emailAddress,
        isActive: emailAccounts.isActive,
        lastSyncAt: emailAccounts.lastSyncAt,
      }).from(emailAccounts)
        .where(and(eq(emailAccounts.userId, req.user!.id), eq(emailAccounts.isActive, true)));

      if (emailRow) {
        res.json({ connected: true, emailAddress: emailRow.emailAddress, lastSyncAt: emailRow.lastSyncAt });
      } else {
        res.json({ connected: false });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/broker/channels/email — disconnect Gmail
  app.delete('/api/broker/channels/email', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      await db.update(emailAccounts)
        .set({ isActive: false })
        .where(eq(emailAccounts.userId, req.user!.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== SMS OPT-OUT MANAGEMENT ====================

  // POST /api/broker/contacts/:id/opt-out — manually mark contact as SMS opted-out
  app.post('/api/broker/contacts/:id/opt-out', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const contactId = parseInt(req.params.id, 10);
      const contact = await db.query.brokerContacts.findFirst({
        where: (c) => and(eq(c.id, contactId), eq(c.brokerId, brokerId)),
      });
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      await db.update(brokerContacts).set({ smsOptedOut: true }).where(eq(brokerContacts.id, contactId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/broker/contacts/:id/opt-in — remove SMS opt-out for contact
  app.post('/api/broker/contacts/:id/opt-in', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const contactId = parseInt(req.params.id, 10);
      const contact = await db.query.brokerContacts.findFirst({
        where: (c) => and(eq(c.id, contactId), eq(c.brokerId, brokerId)),
      });
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      await db.update(brokerContacts).set({ smsOptedOut: false }).where(eq(brokerContacts.id, contactId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/broker/contacts/:id/sms-thread — sent messages + inbound replies for a contact
  app.get('/api/broker/contacts/:id/sms-thread', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const contactId = parseInt(req.params.id, 10);

      const contact = await db.query.brokerContacts.findFirst({
        where: (c) => and(eq(c.id, contactId), eq(c.brokerId, brokerId)),
      });
      if (!contact) return res.status(404).json({ error: 'Contact not found' });

      const sentMessages = await db.query.brokerOutreachMessages.findMany({
        where: (m) => and(eq(m.brokerId, brokerId), eq(m.contactId, contactId), eq(m.channel, 'sms')),
        orderBy: (m) => m.createdAt,
      });

      const replies = await db.query.brokerSmsReplies.findMany({
        where: (r) => and(eq(r.brokerId, brokerId), eq(r.contactId, contactId)),
        orderBy: (r) => r.receivedAt,
      });

      // Merge into chronological thread
      const thread = [
        ...sentMessages.map((m) => ({
          id: `sent-${m.id}`,
          direction: 'outbound' as const,
          body: m.personalizedBody || m.body,
          status: m.status,
          deliveryStatus: m.deliveryStatus,
          twilioMessageSid: m.twilioMessageSid,
          timestamp: m.sentAt || m.createdAt,
        })),
        ...replies.map((r) => ({
          id: `reply-${r.id}`,
          direction: 'inbound' as const,
          body: r.body,
          status: r.isOptOut ? 'opted_out' : 'received',
          fromNumber: r.fromNumber,
          isOptOut: r.isOptOut,
          timestamp: r.receivedAt,
        })),
      ].sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());

      res.json({ contact, thread, smsOptedOut: contact.smsOptedOut });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== TWILIO INBOUND WEBHOOK ====================

  // POST /api/broker/twilio/inbound — Twilio calls this when a prospect replies.
  //
  // Security model (layered):
  //   1. Primary routing: broker identified by matching Twilio `To` number against
  //      broker_channel_configs.config.fromNumber (as specified).
  //   2. Request authenticity:
  //      a. If the broker stored an Account Auth Token, we verify the X-Twilio-Signature
  //         header using twilio.validateRequest() — the standard Twilio approach.
  //      b. Otherwise we fall back to validating the per-broker ?token=<webhookToken>
  //         URL parameter that was generated at connect time.
  //   Requests that pass neither check are rejected before any DB mutation.
  app.post('/api/broker/twilio/inbound', async (req: any, res: Response) => {
    const twimlOk = () => res.set('Content-Type', 'text/xml').send('<Response></Response>');

    try {
      const { From, To, Body, MessageSid } = req.body;

      if (!From || !To || !Body) {
        return res.status(400).send('<Response></Response>');
      }

      const normalizedTo = To.replace(/\s/g, '');
      const normalizedFrom = From.replace(/\s/g, '');
      const bodyTrimmed = Body.trim();

      // ---- Step 1: Route by To number (spec-required primary dispatch) ----
      const allSmsConfigs = await db.select().from(brokerChannelConfigs)
        .where(and(eq(brokerChannelConfigs.type, 'sms'), eq(brokerChannelConfigs.isActive, true)));

      let matchedBrokerId: number | null = null;
      let matchedConfig: TwilioConfig | null = null;

      for (const row of allSmsConfigs) {
        const cfg = row.config as TwilioConfig;
        const cfgFrom = (cfg.fromNumber || '').replace(/\s/g, '');
        if (cfgFrom === normalizedTo) {
          matchedBrokerId = row.brokerId;
          matchedConfig = cfg;
          break;
        }
      }

      if (!matchedBrokerId || !matchedConfig) {
        console.warn(`[TwilioInbound] No broker found for To number: ${normalizedTo}`);
        return res.status(200).send('<Response></Response>');
      }

      // ---- Step 2: Authenticate the request before mutating any data ----
      const twilio = (await import('twilio')).default;

      if (matchedConfig.authToken) {
        // 2a. Verify Twilio request signature using the Account Auth Token
        const decryptedAuthToken = decryptToken(matchedConfig.authToken);
        const twilioSig = req.headers['x-twilio-signature'] as string | undefined;

        // Reconstruct the full URL Twilio signed (must match exactly what's in the Twilio console)
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const fullUrl = `${proto}://${host}${req.originalUrl}`;

        const isValid = twilio.validateRequest(decryptedAuthToken, twilioSig || '', fullUrl, req.body);
        if (!isValid) {
          console.warn(`[TwilioInbound] Signature validation failed for broker ${matchedBrokerId} — rejected`);
          return res.status(403).send('<Response></Response>');
        }
      } else {
        // 2b. Fall back to per-broker webhookToken in the query string
        const incomingToken = (req.query.token as string | undefined) || '';
        if (!incomingToken || incomingToken !== (matchedConfig.webhookToken || '')) {
          console.warn(`[TwilioInbound] Token mismatch for broker ${matchedBrokerId} — rejected`);
          return res.status(403).send('<Response></Response>');
        }
      }

      // ---- Step 3: Process the authenticated inbound message ----

      // Find matching contact by phone number (best-effort; unknown senders are still stored)
      const allContacts = await db.query.brokerContacts.findMany({
        where: (c) => eq(c.brokerId, matchedBrokerId!),
      });

      const matchedContact = allContacts.find((c) => {
        if (!c.phone) return false;
        const normalized = c.phone.replace(/\D/g, '');
        const incomingNorm = normalizedFrom.replace(/\D/g, '');
        return normalized === incomingNorm || normalized === incomingNorm.replace(/^1/, '');
      });

      // Detect opt-out keywords (per TCPA standards)
      const isOptOut = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(bodyTrimmed);

      // Store the reply
      await db.insert(brokerSmsReplies).values({
        brokerId: matchedBrokerId,
        contactId: matchedContact?.id ?? null,
        fromNumber: normalizedFrom,
        toNumber: normalizedTo,
        body: bodyTrimmed,
        isOptOut,
        twilioMessageSid: MessageSid || null,
      });

      // If opt-out keyword received, mark contact as opted out
      if (isOptOut && matchedContact) {
        await db.update(brokerContacts)
          .set({ smsOptedOut: true })
          .where(eq(brokerContacts.id, matchedContact.id));
        console.log(`[TwilioInbound] Opt-out received from ${normalizedFrom} — contact ${matchedContact.id} marked opted-out`);
      }

      return twimlOk();
    } catch (error: any) {
      console.error('[TwilioInbound] Error processing inbound SMS:', error);
      return res.status(200).set('Content-Type', 'text/xml').send('<Response></Response>');
    }
  });
}

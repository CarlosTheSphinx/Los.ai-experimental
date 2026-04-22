// Broker AI SDR / CRM API Routes
import { Express, Response } from 'express';
import { AuthRequest, authenticateUser } from '../auth';
import { db } from '../db';
import {
  brokerContacts,
  brokerOutreachMessages,
  brokerChannelConfigs,
  emailAccounts,
  users,
} from '@shared/schema';
import { eq, and, or, ilike, desc, asc, inArray } from 'drizzle-orm';
import * as sdrService from '../services/brokerSdr';
import { encryptToken, decryptToken } from '../utils/encryption';

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

export function registerBrokerSdrRoutes(app: Express) {
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

      const messages = await db.query.brokerOutreachMessages.findMany({
        where: (m) =>
          and(
            eq(m.brokerId, brokerId),
            status ? eq(m.status, status as any) : undefined
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

      const smsConfig = smsRow ? (smsRow.config as any) : null;

      res.json({
        sms: smsRow ? {
          connected: true,
          accountSid: smsConfig?.accountSid || '',
          fromNumber: smsConfig?.fromNumber || '',
          smsApproved: smsRow.smsApproved,
          hasApiKey: !!(smsConfig?.apiKey),
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
      const { accountSid, apiKey, apiKeySecret, fromNumber } = req.body;

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

      const configPayload = {
        accountSid,
        apiKey: encryptToken(apiKey),
        apiKeySecret: encryptToken(apiKeySecret),
        fromNumber,
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

  // POST /api/broker/channels/sms/test — send test SMS to broker's phone
  app.post('/api/broker/channels/sms/test', authenticateUser, requireBroker, async (req: AuthRequest, res: Response) => {
    try {
      const brokerId = req.user!.id;
      const { toNumber } = req.body;

      if (!toNumber) {
        return res.status(400).json({ error: 'toNumber is required' });
      }

      const [smsRow] = await db.select().from(brokerChannelConfigs)
        .where(and(eq(brokerChannelConfigs.brokerId, brokerId), eq(brokerChannelConfigs.type, 'sms')));

      if (!smsRow) {
        return res.status(400).json({ error: 'No SMS channel configured. Please save your credentials first.' });
      }

      const cfg = smsRow.config as any;
      const twilio = (await import('twilio')).default;
      const client = twilio(decryptToken(cfg.apiKey), decryptToken(cfg.apiKeySecret), { accountSid: cfg.accountSid });

      await client.messages.create({
        body: 'Test message from Lendry.AI — your SMS channel is connected and working! 🎉',
        from: cfg.fromNumber,
        to: toNumber,
      });

      res.json({ success: true, message: 'Test SMS sent successfully' });
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
}

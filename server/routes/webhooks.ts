import type { Express, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  validateWebhookUrl,
  deliverWebhook,
  getWebhookStats,
  deleteWebhook,
  retryFailedDeliveries,
} from '../utils/webhooks';
import { getAvailableWebhookEvents, validateEventSubscription } from '../utils/webhookEvents';
import { createAuditLog } from '../utils/audit';
import { webhookEndpoints, webhookDeliveryLogs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: any;
}

export function setupWebhookRoutes(
  app: Express,
  deps: { db: any; authenticateUser: any }
) {
  const { db, authenticateUser } = deps;

  app.post('/api/webhooks', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { name, url, events, rateLimitPerSecond, retryPolicy, headers } = req.body;

      if (!name || !url || !events || !Array.isArray(events)) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'name, url, and events (array) are required.',
        });
      }

      if (!validateWebhookUrl(url)) {
        return res.status(400).json({
          error: 'invalid_url',
          message: 'Webhook URL must be HTTPS and not point to a private IP address.',
        });
      }

      const allEvents = getAvailableWebhookEvents();
      const availableEventIds = allEvents.map((e) => e.id);

      for (const event of events) {
        const eventPattern = event.includes('*') ? event.replace('*', '') : event;
        const isValid =
          availableEventIds.includes(event) || availableEventIds.some((e: string) => e.startsWith(eventPattern));

        if (!isValid) {
          return res.status(400).json({
            error: 'invalid_event',
            message: `Unknown event: ${event}. Available events: ${availableEventIds.join(', ')}`,
          });
        }

        const validation = validateEventSubscription(event, req.user?.role);
        if (!validation.valid) {
          return res.status(403).json({
            error: 'forbidden',
            message: validation.reason || 'You do not have permission to subscribe to this event.',
          });
        }
      }

      const secret = bcrypt.hashSync(crypto.randomUUID(), 12);

      const [created] = await db
        .insert(webhookEndpoints)
        .values({
          userId: req.user!.id,
          name,
          url,
          events,
          active: true,
          secret,
          rateLimitPerSecond: rateLimitPerSecond || 10,
          retryPolicy: retryPolicy || { maxRetries: 5, backoffStrategy: 'exponential' },
          headers: headers || null,
        })
        .returning();

      await createAuditLog(db, {
        userId: req.user!.id,
        action: 'webhook.created',
        resourceType: 'webhook',
        resourceId: created.id,
        newValues: { name, url, events },
        success: true,
      });

      res.status(201).json({
        id: created.id,
        name: created.name,
        url: created.url,
        events: created.events,
        active: created.active,
        rateLimitPerSecond: created.rateLimitPerSecond,
        createdAt: created.createdAt,
        message: 'Webhook created successfully. It is now active and will receive events.',
      });
    } catch (error) {
      console.error('Error creating webhook:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to create webhook.' });
    }
  });

  app.get('/api/webhooks', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userWebhooks = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.userId, req.user!.id));

      res.json({
        webhooks: userWebhooks.map((w: any) => ({
          id: w.id,
          name: w.name,
          url: w.url,
          events: w.events,
          active: w.active,
          rateLimitPerSecond: w.rateLimitPerSecond,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          lastTriggeredAt: w.lastTriggeredAt,
          failureCount: w.failureCount,
        })),
      });
    } catch (error) {
      console.error('Error listing webhooks:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to list webhooks.' });
    }
  });

  app.get('/api/webhooks/available-events', async (_req: Request, res: Response) => {
    try {
      const events = getAvailableWebhookEvents();

      res.json({
        events: events.map((e) => ({
          id: e.id,
          name: e.name,
          description: e.description,
          resourceType: e.resourceType,
          critical: e.critical || false,
          samplePayload: e.samplePayload,
        })),
      });
    } catch (error) {
      console.error('Error getting webhook events:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to get webhook events.' });
    }
  });

  app.get('/api/webhooks/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.userId, req.user!.id)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Webhook not found.' });
      }

      const w = rows[0];
      res.json({
        id: w.id,
        name: w.name,
        url: w.url,
        events: w.events,
        active: w.active,
        rateLimitPerSecond: w.rateLimitPerSecond,
        retryPolicy: w.retryPolicy,
        headers: w.headers,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        lastTriggeredAt: w.lastTriggeredAt,
        failureCount: w.failureCount,
      });
    } catch (error) {
      console.error('Error getting webhook:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to get webhook.' });
    }
  });

  app.patch('/api/webhooks/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { name, url, events, active, rateLimitPerSecond } = req.body;

      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.userId, req.user!.id)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Webhook not found.' });
      }

      if (url && !validateWebhookUrl(url)) {
        return res.status(400).json({
          error: 'invalid_url',
          message: 'Webhook URL must be HTTPS and not point to a private IP address.',
        });
      }

      const updates: any = { updatedAt: new Date() };
      if (name) updates.name = name;
      if (url) updates.url = url;
      if (events) updates.events = events;
      if (active !== undefined) updates.active = active;
      if (rateLimitPerSecond) updates.rateLimitPerSecond = rateLimitPerSecond;

      await db.update(webhookEndpoints).set(updates).where(eq(webhookEndpoints.id, req.params.id));

      await createAuditLog(db, {
        userId: req.user!.id,
        action: 'webhook.updated',
        resourceType: 'webhook',
        resourceId: req.params.id,
        newValues: updates,
        success: true,
      });

      const [updated] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, req.params.id))
        .limit(1);

      res.json({
        id: updated.id,
        name: updated.name,
        url: updated.url,
        events: updated.events,
        active: updated.active,
        rateLimitPerSecond: updated.rateLimitPerSecond,
      });
    } catch (error) {
      console.error('Error updating webhook:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to update webhook.' });
    }
  });

  app.delete('/api/webhooks/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.userId, req.user!.id)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Webhook not found.' });
      }

      await deleteWebhook(req.params.id);

      await createAuditLog(db, {
        userId: req.user!.id,
        action: 'webhook.deleted',
        resourceType: 'webhook',
        resourceId: req.params.id,
        success: true,
      });

      res.json({ message: 'Webhook deleted successfully.', id: req.params.id });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to delete webhook.' });
    }
  });

  app.post('/api/webhooks/:id/test', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.userId, req.user!.id)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Webhook not found.' });
      }

      const w = rows[0];
      const { deliverWebhook: deliver } = await import('../utils/webhooks');

      const result = await deliver(
        {
          id: w.id,
          userId: w.userId,
          name: w.name,
          url: w.url,
          events: w.events || [],
          active: w.active,
          secret: w.secret,
          rateLimitPerSecond: w.rateLimitPerSecond,
          retryPolicy: w.retryPolicy as any,
          headers: w.headers as any,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          lastTriggeredAt: w.lastTriggeredAt,
          failureCount: w.failureCount,
        },
        {
          id: 'system.health',
          name: 'System Health',
          resourceType: 'system',
          timestamp: new Date(),
          data: { status: 'test', message: 'This is a test webhook delivery', timestamp: new Date().toISOString() },
        }
      );

      res.json({
        success: result.success,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error,
      });
    } catch (error) {
      console.error('Error testing webhook:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to test webhook.' });
    }
  });

  app.get('/api/webhooks/:id/deliveries', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.userId, req.user!.id)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Webhook not found.' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const deliveries = await db
        .select()
        .from(webhookDeliveryLogs)
        .where(eq(webhookDeliveryLogs.webhookId, req.params.id))
        .limit(limit);

      res.json({
        deliveries: deliveries.map((d: any) => ({
          id: d.id,
          eventId: d.eventId,
          succeeded: d.succeeded,
          statusCode: d.statusCode,
          responseTime: d.responseTimeMs,
          error: d.errorMessage,
          timestamp: d.timestamp,
          retriedAt: d.retriedAt,
        })),
      });
    } catch (error) {
      console.error('Error getting webhook deliveries:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to get webhook deliveries.' });
    }
  });

  app.get('/api/webhooks/:id/stats', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.userId, req.user!.id)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Webhook not found.' });
      }

      const stats = await getWebhookStats(req.params.id);
      res.json(stats);
    } catch (error) {
      console.error('Error getting webhook stats:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to get webhook stats.' });
    }
  });

  app.post('/api/webhooks/:id/retry', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.userId, req.user!.id)))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found', message: 'Webhook not found.' });
      }

      await retryFailedDeliveries();
      res.json({ message: 'Retrying failed deliveries...' });
    } catch (error) {
      console.error('Error retrying webhook deliveries:', error);
      res.status(500).json({ error: 'internal_error', message: 'Failed to retry deliveries.' });
    }
  });
}

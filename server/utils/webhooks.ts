import crypto from 'crypto';
import { webhookEndpoints, webhookDeliveryLogs } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';

export interface Webhook {
  id: string;
  userId: number;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  rateLimitPerSecond: number;
  retryPolicy: {
    maxRetries: number;
    backoffStrategy: 'exponential' | 'linear';
  };
  headers?: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date | null;
  failureCount: number;
}

export interface WebhookEvent {
  id: string;
  name: string;
  resourceType: 'deal' | 'document' | 'borrower' | 'user' | 'audit' | 'system';
  timestamp: Date;
  data: any;
}

export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  responseTime: number;
  error?: string;
  retriedAt?: Date[];
}

export function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = generateSignature(payload, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

export function calculateBackoff(retryCount: number, strategy: 'exponential' | 'linear' = 'exponential'): number {
  if (strategy === 'exponential') {
    return Math.min(Math.pow(2, retryCount) * 1000, 60 * 1000);
  } else {
    return Math.min((retryCount + 1) * 1000, 60 * 1000);
  }
}

export function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:' && !parsed.hostname.includes('localhost')) {
      return false;
    }

    const hostname = parsed.hostname;
    const blocked = [
      /^localhost$/i,
      /^127\./,
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^::1$/,
      /^fe80:/,
      /^fc00:/,
    ];

    for (const pattern of blocked) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function deliverWebhook(webhook: Webhook, event: WebhookEvent): Promise<DeliveryResult> {
  const payload = JSON.stringify({
    id: crypto.randomUUID(),
    timestamp: event.timestamp.toISOString(),
    event: event.id,
    data: event.data,
  });

  const signature = generateSignature(payload, webhook.secret);
  const maxRetries = webhook.retryPolicy?.maxRetries || 5;
  let lastError: string | undefined;
  let lastStatusCode: number | undefined;
  let responseTime = 0;
  const retriedAt: Date[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': webhook.id,
          'X-Event-Id': event.id,
          'X-Timestamp': event.timestamp.toISOString(),
          ...(webhook.headers || {}),
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          responseTime,
          retriedAt: retriedAt.length > 0 ? retriedAt : undefined,
        };
      }

      lastStatusCode = response.status;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      responseTime = 0;
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }

    if (attempt < maxRetries) {
      const delay = calculateBackoff(attempt, webhook.retryPolicy?.backoffStrategy);
      await new Promise((resolve) => setTimeout(resolve, delay));
      retriedAt.push(new Date());
    }
  }

  return {
    success: false,
    statusCode: lastStatusCode,
    responseTime,
    error: lastError,
    retriedAt: retriedAt.length > 0 ? retriedAt : undefined,
  };
}

export async function logDelivery(
  webhookId: string,
  eventId: string,
  payload: string,
  result: DeliveryResult
): Promise<void> {
  try {
    await db
      .insert(webhookDeliveryLogs)
      .values({
        webhookId,
        eventId,
        payload: JSON.parse(payload),
        statusCode: result.statusCode || null,
        responseTimeMs: result.responseTime,
        errorMessage: result.error || null,
        retriedAt: result.retriedAt || null,
        succeeded: result.success,
      });
  } catch (err) {
    console.error('Error logging webhook delivery:', err);
  }
}

function dbRowToWebhook(w: any): Webhook {
  return {
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
  };
}

export async function triggerWebhookEvent(event: WebhookEvent): Promise<void> {
  const allWebhooks = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.active, true));

  const subscribedWebhooks = allWebhooks.filter((w) =>
    (w.events || []).includes(event.id) || (w.events || []).includes(`${event.id.split('.')[0]}.*`)
  );

  for (const row of subscribedWebhooks) {
    try {
      const webhook = dbRowToWebhook(row);
      const result = await deliverWebhook(webhook, event);

      await logDelivery(
        webhook.id,
        event.id,
        JSON.stringify({ timestamp: event.timestamp.toISOString(), event: event.id, data: event.data }),
        result
      );

      await db
        .update(webhookEndpoints)
        .set({
          lastTriggeredAt: new Date(),
          failureCount: result.success ? 0 : row.failureCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, row.id));
    } catch (error) {
      console.error(`Error delivering webhook ${row.id}:`, error);
    }
  }
}

export async function retryFailedDeliveries(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const failedDeliveries = await db
    .select()
    .from(webhookDeliveryLogs)
    .where(and(eq(webhookDeliveryLogs.succeeded, false), gt(webhookDeliveryLogs.timestamp, oneHourAgo)));

  for (const delivery of failedDeliveries) {
    try {
      const webhookRows = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, delivery.webhookId))
        .limit(1);

      if (webhookRows.length === 0) continue;

      const w = webhookRows[0];
      const retryCount = delivery.retriedAt?.length || 0;
      const maxRetries = (w.retryPolicy as any)?.maxRetries || 5;

      if (retryCount >= maxRetries) continue;

      const webhook = dbRowToWebhook(w);
      const event: WebhookEvent = {
        id: delivery.eventId,
        name: delivery.eventId,
        resourceType: 'system',
        timestamp: delivery.timestamp,
        data: delivery.payload,
      };

      const result = await deliverWebhook(webhook, event);

      if (result.success) {
        await db
          .update(webhookDeliveryLogs)
          .set({
            succeeded: true,
            statusCode: result.statusCode || null,
            responseTimeMs: result.responseTime,
            retriedAt: delivery.retriedAt ? [...delivery.retriedAt, new Date()] : [new Date()],
          })
          .where(eq(webhookDeliveryLogs.id, delivery.id));
      }
    } catch (error) {
      console.error('Error retrying failed delivery:', error);
    }
  }
}

export async function getWebhookStats(
  webhookId: string,
  timeframeMinutes: number = 1440
): Promise<{
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  averageResponseTimeMs: number;
}> {
  const startTime = new Date(Date.now() - timeframeMinutes * 60 * 1000);

  const deliveries = await db
    .select()
    .from(webhookDeliveryLogs)
    .where(and(eq(webhookDeliveryLogs.webhookId, webhookId), gt(webhookDeliveryLogs.timestamp, startTime)));

  const successful = deliveries.filter((d) => d.succeeded).length;
  const totalResponseTime = deliveries.reduce((sum, d) => sum + (d.responseTimeMs || 0), 0);

  return {
    totalDeliveries: deliveries.length,
    successfulDeliveries: successful,
    failedDeliveries: deliveries.length - successful,
    successRate: deliveries.length > 0 ? (successful / deliveries.length) * 100 : 0,
    averageResponseTimeMs: deliveries.length > 0 ? totalResponseTime / deliveries.length : 0,
  };
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, webhookId));
}

export async function triggerWebhook(projectId: number | string, eventType: string, data: any): Promise<void> {
  try {
    const event: WebhookEvent = {
      id: `deals.${eventType}`,
      name: eventType,
      resourceType: 'deal',
      timestamp: new Date(),
      data: {
        projectId,
        ...data,
      },
    };
    await triggerWebhookEvent(event);
  } catch (error) {
    console.error(`Error triggering webhook for project ${projectId}, event ${eventType}:`, error);
  }
}

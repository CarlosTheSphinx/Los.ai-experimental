import type { Express, Response, NextFunction } from 'express';
import { db } from '../db';
import {
  supportTickets,
  supportTicketMessages,
  supportTicketAttachments,
  adminNotificationSettings,
  notifications,
  users,
  insertSupportTicketSchema,
} from '@shared/schema';
import { eq, and, or, desc, asc, ilike, sql, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import type { AuthRequest } from '../auth';
import type { ObjectStorageService } from '../replit_integrations/object_storage';
import { getResendClient } from '../email';

type RequestMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => void | Promise<void>;

const TICKET_TYPES = ['help', 'bug', 'feature'] as const;
const TICKET_STATUSES = ['open', 'in_progress', 'waiting_on_broker', 'resolved', 'closed'] as const;
const SEVERITIES = ['blocker', 'major', 'minor', 'cosmetic'] as const;
const HELP_CATEGORIES = ['deal_submission', 'documents', 'pricing', 'messaging', 'account', 'other'] as const;
const PRIORITIES = ['nice_to_have', 'important', 'critical'] as const;

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

const MAX_FILES_PER_TICKET = 10;
const MAX_BYTES_PER_FILE = 50 * 1024 * 1024;

// In-memory store of upload paths recently issued to a user.
// Prevents clients from referencing arbitrary object paths in ticket/message attachments.
const UPLOAD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const uploadTokens = new Map<string, { userId: number; expiresAt: number }>();
function rememberUploadToken(userId: number, objectPath: string) {
  uploadTokens.set(objectPath, { userId, expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS });
  // Opportunistic cleanup
  if (uploadTokens.size > 5000) {
    const now = Date.now();
    for (const [k, v] of uploadTokens) if (v.expiresAt < now) uploadTokens.delete(k);
  }
}
function consumeUploadToken(userId: number, objectPath: string): boolean {
  const t = uploadTokens.get(objectPath);
  if (!t) return false;
  if (t.userId !== userId || t.expiresAt < Date.now()) { uploadTokens.delete(objectPath); return false; }
  uploadTokens.delete(objectPath);
  return true;
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-\s]/g, '_').slice(0, 200) || 'file';
}

function isAdminRole(role: string | undefined): boolean {
  return !!role && ['admin', 'staff', 'super_admin', 'lender', 'processor'].includes(role);
}

function ticketTypeLabel(type: string): string {
  if (type === 'help') return 'Help Question';
  if (type === 'bug') return 'Bug Report';
  if (type === 'feature') return 'Feature Request';
  return type;
}

function expectedResponseCopy(type: string): string {
  if (type === 'help') return 'within 4 business hours';
  if (type === 'bug') return 'within 24 hours';
  if (type === 'feature') return 'within 5 business days';
  return 'shortly';
}

const baseTicketBody = z.object({
  type: z.enum(TICKET_TYPES),
  subject: z.string().min(2).max(255),
  description: z.string().min(2),
  category: z.enum(HELP_CATEGORIES).optional().nullable(),
  severity: z.enum(SEVERITIES).optional().nullable(),
  stepsToReproduce: z.string().optional().nullable(),
  expectedBehavior: z.string().optional().nullable(),
  actualBehavior: z.string().optional().nullable(),
  useCase: z.string().optional().nullable(),
  brokerPriority: z.enum(PRIORITIES).optional().nullable(),
  pageUrl: z.string().optional().nullable(),
  browserOs: z.string().optional().nullable(),
  sessionActivity: z.any().optional().nullable(),
  attachmentObjectPaths: z.array(z.object({
    objectPath: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
  })).optional().default([]),
});

async function getAdminEmail(tenantId: number): Promise<string | null> {
  const [row] = await db.select().from(adminNotificationSettings).where(eq(adminNotificationSettings.tenantId, tenantId)).limit(1);
  return row?.email ?? null;
}

async function notifyAdmins(tenantId: number, payload: { title: string; message: string; link: string }) {
  const adminUsers = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.role, ['super_admin', 'admin', 'lender', 'staff'])));
  if (adminUsers.length === 0) return;
  await db.insert(notifications).values(
    adminUsers.map(u => ({
      userId: u.id,
      type: 'support_ticket',
      title: payload.title,
      message: payload.message,
      link: payload.link,
    }))
  );
}

async function sendEmail(to: string | null, subject: string, html: string) {
  if (!to) return;
  try {
    const resend = await getResendClient();
    if (!resend) return;
    const fromEmail = process.env.FROM_EMAIL || 'Lendry AI <noreply@lendry.ai>';
    await resend.emails.send({ from: fromEmail, to, subject, html });
  } catch (err) {
    console.error('[support-tickets] email send failed:', err);
  }
}

function buildAppUrl(): string {
  return process.env.APP_URL || process.env.REPLIT_DEV_DOMAIN
    ? (process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`)
    : '';
}

export function registerSupportTicketRoutes(
  app: Express,
  {
    authenticateUser,
    requireAdmin,
    objectStorageService,
  }: {
    authenticateUser: RequestMiddleware;
    requireAdmin: RequestMiddleware;
    objectStorageService: ObjectStorageService;
  }
) {
  // ==================== UPLOADS ====================

  // Get a presigned upload URL (or local-upload endpoint) for ticket attachments.
  // Used both at intake (before ticket exists) and on reply (before message persists).
  app.post('/api/support/uploads/sign', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { fileName, mimeType, sizeBytes } = req.body || {};
      if (!fileName || !mimeType || typeof sizeBytes !== 'number') {
        return res.status(400).json({ error: 'fileName, mimeType, sizeBytes required' });
      }
      if (!ALLOWED_MIME.has(mimeType)) {
        return res.status(400).json({ error: 'File type not allowed' });
      }
      if (sizeBytes > MAX_BYTES_PER_FILE) {
        return res.status(400).json({ error: 'File exceeds 50 MB limit' });
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const isLocal = uploadURL.startsWith('__local__:');
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      rememberUploadToken(req.user!.id, objectPath);
      res.json({
        uploadURL: isLocal ? '/api/support/uploads/direct' : uploadURL,
        objectPath,
        useDirectUpload: isLocal,
      });
    } catch (err) {
      console.error('[support-tickets] sign upload error:', err);
      res.status(500).json({ error: 'Failed to prepare upload' });
    }
  });

  const supportMulter = multer({
    dest: path.join(process.cwd(), 'uploads', 'temp'),
    limits: { fileSize: MAX_BYTES_PER_FILE },
  });
  app.post('/api/support/uploads/direct', authenticateUser, supportMulter.single('file'), async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file provided' });
      if (!ALLOWED_MIME.has(req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'File type not allowed' });
      }
      const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const objectId = randomUUID();
      const destPath = path.join(uploadsDir, objectId);
      fs.renameSync(req.file.path, destPath);
      fs.writeFileSync(destPath + '.meta', JSON.stringify({
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      }));
      const objectPath = `/objects/uploads/${objectId}`;
      rememberUploadToken(req.user!.id, objectPath);
      res.json({
        objectPath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (err) {
      console.error('[support-tickets] direct upload error:', err);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Stream an attachment (gated to ticket participants).
  app.get('/api/support/attachments/:id/download', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const tenantId = req.user!.tenantId;
      const attachmentId = parseInt(req.params.id);
      if (!attachmentId) return res.status(400).json({ error: 'Invalid id' });

      const [att] = await db.select().from(supportTicketAttachments).where(eq(supportTicketAttachments.id, attachmentId)).limit(1);
      if (!att) return res.status(404).json({ error: 'Attachment not found' });

      // Resolve ticket via attachment's ticket_id (direct on ticket attachment) or via message
      let ticketId = att.ticketId;
      if (!ticketId && att.messageId) {
        const [m] = await db.select({ ticketId: supportTicketMessages.ticketId }).from(supportTicketMessages).where(eq(supportTicketMessages.id, att.messageId)).limit(1);
        ticketId = m?.ticketId ?? null;
      }
      if (!ticketId) return res.status(404).json({ error: 'Attachment not found' });

      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      if (ticket.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
      if (!isAdminRole(role) && ticket.submitterId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const objectFile = await objectStorageService.getObjectEntityFile(att.fileUrl);
      const safeName = att.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
      res.set('X-Frame-Options', 'SAMEORIGIN');
      res.removeHeader('Content-Security-Policy');
      if (req.query.download === 'true') {
        res.set('Content-Disposition', `attachment; filename="${safeName}"`);
      } else {
        res.set('Content-Disposition', `inline; filename="${safeName}"`);
      }
      res.set('Content-Type', att.mimeType);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (err: any) {
      if (err?.name === 'ObjectNotFoundError') return res.status(404).json({ error: 'File not found' });
      console.error('[support-tickets] download error:', err);
      res.status(500).json({ error: 'Failed to download attachment' });
    }
  });

  // ==================== TICKETS ====================

  // List tickets — admin sees all (filterable), broker sees only their own.
  app.get('/api/support/tickets', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId!;
      const role = req.user!.role;
      if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

      const isAdmin = isAdminRole(role);
      const limit = Math.min(parseInt((req.query.limit as string) || '50'), 200);
      const offset = parseInt((req.query.offset as string) || '0');
      const search = (req.query.search as string || '').trim();
      const status = req.query.status as string;
      const type = req.query.type as string;
      const severity = req.query.severity as string;
      const submitterId = req.query.submitterId ? parseInt(req.query.submitterId as string) : undefined;
      const includeArchived = req.query.includeArchived === 'true';
      const sortBy = (req.query.sortBy as string) || 'newest'; // newest | oldest | activity

      const where: any[] = [eq(supportTickets.tenantId, tenantId)];
      if (!isAdmin) {
        where.push(eq(supportTickets.submitterId, userId));
        if (!includeArchived) where.push(eq(supportTickets.archivedByBroker, false));
      } else {
        if (!includeArchived) where.push(eq(supportTickets.archivedByAdmin, false));
      }
      if (status) where.push(eq(supportTickets.status, status));
      if (type) where.push(eq(supportTickets.type, type));
      if (severity) where.push(eq(supportTickets.severity, severity));
      if (submitterId) where.push(eq(supportTickets.submitterId, submitterId));
      if (search) where.push(ilike(supportTickets.subject, `%${search}%`));

      const orderCol = sortBy === 'oldest' ? asc(supportTickets.createdAt) : desc(supportTickets.updatedAt);

      const rows = await db.select({
        ticket: supportTickets,
        submitter: { id: users.id, fullName: users.fullName, email: users.email },
      })
        .from(supportTickets)
        .leftJoin(users, eq(users.id, supportTickets.submitterId))
        .where(and(...where))
        .orderBy(orderCol)
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(supportTickets)
        .where(and(...where));

      res.json({
        tickets: rows.map(r => ({ ...r.ticket, submitter: r.submitter })),
        total: count,
        limit,
        offset,
      });
    } catch (err) {
      console.error('[support-tickets] list error:', err);
      res.status(500).json({ error: 'Failed to list tickets' });
    }
  });

  // Get single ticket with messages and attachments.
  app.get('/api/support/tickets/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId!;
      const role = req.user!.role;
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });

      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
      const isAdmin = isAdminRole(role);
      if (!isAdmin && ticket.submitterId !== userId) return res.status(403).json({ error: 'Access denied' });

      const [submitter] = ticket.submitterId
        ? await db.select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role }).from(users).where(eq(users.id, ticket.submitterId)).limit(1)
        : [null];

      let msgQ = db.select({
        message: supportTicketMessages,
        author: { id: users.id, fullName: users.fullName, email: users.email },
      })
        .from(supportTicketMessages)
        .leftJoin(users, eq(users.id, supportTicketMessages.authorId))
        .where(eq(supportTicketMessages.ticketId, id))
        .orderBy(asc(supportTicketMessages.createdAt));
      const messageRows = await msgQ;
      const filteredMessages = isAdmin ? messageRows : messageRows.filter(r => !r.message.isInternal);
      const messageIds = filteredMessages.map(r => r.message.id);

      const allAttachments = await db.select().from(supportTicketAttachments)
        .where(or(
          eq(supportTicketAttachments.ticketId, id),
          messageIds.length > 0 ? inArray(supportTicketAttachments.messageId, messageIds) : sql`false`,
        ));

      // Strip session_activity from broker response
      const safeTicket = isAdmin ? ticket : { ...ticket, sessionActivity: null };

      res.json({
        ticket: { ...safeTicket, submitter },
        messages: filteredMessages.map(r => ({ ...r.message, author: r.author })),
        attachments: allAttachments,
      });
    } catch (err) {
      console.error('[support-tickets] get error:', err);
      res.status(500).json({ error: 'Failed to load ticket' });
    }
  });

  // Create a new ticket.
  app.post('/api/support/tickets', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId!;
      if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

      const parsed = baseTicketBody.parse(req.body);
      const attachments = parsed.attachmentObjectPaths || [];
      if (attachments.length > MAX_FILES_PER_TICKET) {
        return res.status(400).json({ error: `Too many attachments (max ${MAX_FILES_PER_TICKET})` });
      }
      for (const a of attachments) {
        if (!ALLOWED_MIME.has(a.mimeType)) return res.status(400).json({ error: `File type not allowed: ${a.fileName}` });
        if (a.sizeBytes > MAX_BYTES_PER_FILE) return res.status(400).json({ error: `File too large: ${a.fileName}` });
        if (!consumeUploadToken(userId, a.objectPath)) {
          return res.status(400).json({ error: `Invalid upload reference for ${a.fileName}` });
        }
      }

      const [ticket] = await db.insert(supportTickets).values({
        tenantId,
        type: parsed.type,
        subject: parsed.subject,
        description: parsed.description,
        category: parsed.category ?? null,
        severity: parsed.severity ?? null,
        stepsToReproduce: parsed.stepsToReproduce ?? null,
        expectedBehavior: parsed.expectedBehavior ?? null,
        actualBehavior: parsed.actualBehavior ?? null,
        useCase: parsed.useCase ?? null,
        brokerPriority: parsed.brokerPriority ?? null,
        pageUrl: parsed.pageUrl ?? null,
        browserOs: parsed.browserOs ?? null,
        sessionActivity: parsed.sessionActivity ?? null,
        submitterId: userId,
      }).returning();

      if (attachments.length > 0) {
        await db.insert(supportTicketAttachments).values(attachments.map(a => ({
          ticketId: ticket.id,
          messageId: null,
          fileName: safeFileName(a.fileName),
          fileUrl: a.objectPath,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          uploadedById: userId,
        })));
      }

      // Notifications
      const adminEmail = await getAdminEmail(tenantId);
      const [submitter] = await db.select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      const appUrl = buildAppUrl();
      const adminLink = `${appUrl}/admin/tickets/${ticket.id}`;
      const brokerLink = `${appUrl}/support/tickets/${ticket.id}`;

      await notifyAdmins(tenantId, {
        title: `New ${ticketTypeLabel(parsed.type)} from ${submitter?.fullName || 'broker'}`,
        message: parsed.subject,
        link: `/admin/tickets/${ticket.id}`,
      });

      // Broker confirmation in-app notification
      await db.insert(notifications).values({
        userId,
        type: 'support_ticket',
        title: `Ticket #${ticket.id} received`,
        message: `We'll respond ${expectedResponseCopy(parsed.type)}.`,
        link: `/support/tickets/${ticket.id}`,
      });

      // Email — admin
      await sendEmail(adminEmail, `[Lendry] New ${ticketTypeLabel(parsed.type)}: ${parsed.subject}`, `
        <p><strong>${submitter?.fullName || 'A broker'}</strong> opened a new ${ticketTypeLabel(parsed.type)}.</p>
        <p><strong>Subject:</strong> ${escapeHtml(parsed.subject)}</p>
        <p><strong>Description:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(parsed.description)}</p>
        <p><a href="${adminLink}">View ticket #${ticket.id}</a></p>
      `);

      // Email — broker confirmation
      if (submitter?.email) {
        await sendEmail(submitter.email, `[Lendry] Ticket #${ticket.id} received`, `
          <p>Thanks ${submitter?.fullName ? escapeHtml(submitter.fullName) : ''} — we received your ${ticketTypeLabel(parsed.type)}.</p>
          <p><strong>Subject:</strong> ${escapeHtml(parsed.subject)}</p>
          <p>Our team will respond ${expectedResponseCopy(parsed.type)}.</p>
          <p><a href="${brokerLink}">View your ticket</a></p>
        `);
      }

      res.status(201).json({ ticket });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error('[support-tickets] create error:', err);
      res.status(500).json({ error: 'Failed to create ticket' });
    }
  });

  // Add a reply message to a ticket.
  app.post('/api/support/tickets/:id/messages', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId!;
      const role = req.user!.role;
      const id = parseInt(req.params.id);
      const { body, attachmentObjectPaths } = req.body || {};
      if (!body || typeof body !== 'string' || body.trim().length === 0) {
        return res.status(400).json({ error: 'Message body required' });
      }
      const isAdmin = isAdminRole(role);

      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
      if (!isAdmin && ticket.submitterId !== userId) return res.status(403).json({ error: 'Access denied' });

      const atts: Array<{ objectPath: string; fileName: string; mimeType: string; sizeBytes: number }> = Array.isArray(attachmentObjectPaths) ? attachmentObjectPaths : [];
      if (atts.length > MAX_FILES_PER_TICKET) {
        return res.status(400).json({ error: `Too many attachments (max ${MAX_FILES_PER_TICKET})` });
      }
      for (const a of atts) {
        if (!ALLOWED_MIME.has(a.mimeType)) return res.status(400).json({ error: `File type not allowed: ${a.fileName}` });
        if (a.sizeBytes > MAX_BYTES_PER_FILE) return res.status(400).json({ error: `File too large: ${a.fileName}` });
        if (!consumeUploadToken(userId, a.objectPath)) {
          return res.status(400).json({ error: `Invalid upload reference for ${a.fileName}` });
        }
      }

      const [message] = await db.insert(supportTicketMessages).values({
        ticketId: id,
        authorId: userId,
        authorRole: isAdmin ? 'admin' : 'broker',
        body: body.trim(),
        isInternal: false,
      }).returning();

      if (atts.length > 0) {
        await db.insert(supportTicketAttachments).values(atts.map((a: any) => ({
          ticketId: null,
          messageId: message.id,
          fileName: safeFileName(a.fileName),
          fileUrl: a.objectPath,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          uploadedById: userId,
        })));
      }

      await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, id));

      // Notifications
      const appUrl = buildAppUrl();
      if (isAdmin) {
        // Notify broker
        if (ticket.submitterId) {
          await db.insert(notifications).values({
            userId: ticket.submitterId,
            type: 'support_ticket',
            title: `Reply on ticket #${ticket.id}`,
            message: `Lendry support replied to "${ticket.subject}"`,
            link: `/support/tickets/${ticket.id}`,
          });
          const [s] = await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, ticket.submitterId)).limit(1);
          if (s?.email) {
            await sendEmail(s.email, `[Lendry] Reply on ticket #${ticket.id}`, `
              <p>Lendry support replied to your ticket "<strong>${escapeHtml(ticket.subject)}</strong>".</p>
              <p><a href="${appUrl}/support/tickets/${ticket.id}">View the reply</a></p>
            `);
          }
        }
      } else {
        // Notify admins
        await notifyAdmins(tenantId, {
          title: `Broker replied on ticket #${ticket.id}`,
          message: ticket.subject,
          link: `/admin/tickets/${ticket.id}`,
        });
        const adminEmail = await getAdminEmail(tenantId);
        const [s] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)).limit(1);
        await sendEmail(adminEmail, `[Lendry] Broker reply on ticket #${ticket.id}`, `
          <p><strong>${s?.fullName || 'Broker'}</strong> replied on ticket "<strong>${escapeHtml(ticket.subject)}</strong>".</p>
          <p><a href="${appUrl}/admin/tickets/${ticket.id}">View the reply</a></p>
        `);
      }

      res.status(201).json({ message });
    } catch (err) {
      console.error('[support-tickets] reply error:', err);
      res.status(500).json({ error: 'Failed to post reply' });
    }
  });

  // Update ticket (admin: status/severity; broker: archive only)
  app.patch('/api/support/tickets/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId!;
      const role = req.user!.role;
      const id = parseInt(req.params.id);
      const isAdmin = isAdminRole(role);

      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.tenantId !== tenantId) return res.status(403).json({ error: 'Access denied' });
      if (!isAdmin && ticket.submitterId !== userId) return res.status(403).json({ error: 'Access denied' });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (isAdmin) {
        if (typeof req.body.status === 'string' && (TICKET_STATUSES as readonly string[]).includes(req.body.status)) {
          updates.status = req.body.status;
        }
        if (req.body.severity === null || (typeof req.body.severity === 'string' && (SEVERITIES as readonly string[]).includes(req.body.severity))) {
          updates.severity = req.body.severity;
        }
        if (typeof req.body.archivedByAdmin === 'boolean') updates.archivedByAdmin = req.body.archivedByAdmin;
      }
      if (typeof req.body.archivedByBroker === 'boolean' && (isAdmin || ticket.submitterId === userId)) {
        updates.archivedByBroker = req.body.archivedByBroker;
      }

      const [updated] = await db.update(supportTickets).set(updates).where(eq(supportTickets.id, id)).returning();
      res.json({ ticket: updated });
    } catch (err) {
      console.error('[support-tickets] update error:', err);
      res.status(500).json({ error: 'Failed to update ticket' });
    }
  });

  // Ticket counts (for badges/dashboard)
  app.get('/api/support/tickets-summary', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId!;
      const role = req.user!.role;
      const userId = req.user!.id;
      const isAdmin = isAdminRole(role);

      const where: any[] = [eq(supportTickets.tenantId, tenantId)];
      if (!isAdmin) where.push(eq(supportTickets.submitterId, userId));

      const rows = await db.select({
        status: supportTickets.status,
        type: supportTickets.type,
        count: sql<number>`count(*)::int`,
      })
        .from(supportTickets)
        .where(and(...where))
        .groupBy(supportTickets.status, supportTickets.type);

      res.json({ summary: rows });
    } catch (err) {
      console.error('[support-tickets] summary error:', err);
      res.status(500).json({ error: 'Failed to load summary' });
    }
  });

  // ==================== ADMIN NOTIFICATION SETTINGS ====================

  app.get('/api/admin/notification-settings', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId!;
      const [row] = await db.select().from(adminNotificationSettings).where(eq(adminNotificationSettings.tenantId, tenantId)).limit(1);
      if (!row) {
        // Auto-seed if missing
        const [created] = await db.insert(adminNotificationSettings).values({
          tenantId,
          email: req.user!.email || 'admin@lendry.ai',
          smsPhone: null,
        }).returning();
        return res.json({ settings: created });
      }
      res.json({ settings: row });
    } catch (err) {
      console.error('[support-tickets] get settings error:', err);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  app.put('/api/admin/notification-settings', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId!;
      const schema = z.object({
        email: z.string().email(),
        smsPhone: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const existing = await db.select().from(adminNotificationSettings).where(eq(adminNotificationSettings.tenantId, tenantId)).limit(1);
      let row;
      if (existing.length === 0) {
        [row] = await db.insert(adminNotificationSettings).values({
          tenantId,
          email: parsed.email,
          smsPhone: parsed.smsPhone ?? null,
        }).returning();
      } else {
        [row] = await db.update(adminNotificationSettings)
          .set({ email: parsed.email, smsPhone: parsed.smsPhone ?? null, updatedAt: new Date() })
          .where(eq(adminNotificationSettings.tenantId, tenantId))
          .returning();
      }
      res.json({ settings: row });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
      console.error('[support-tickets] update settings error:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

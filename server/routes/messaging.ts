import type { Express, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { eq, desc, and, sql, gt } from 'drizzle-orm';
import { messageThreads, messages, messageReads, users, projects } from '@shared/schema';

export function registerMessagingRoutes(app: Express, deps: RouteDeps) {
  const { storage, db, authenticateUser, requireAdmin } = deps;

  const isAdminRole = (role: string | undefined) => role === 'admin' || role === 'super_admin' || role === 'staff' || role === 'lender' || role === 'processor';

  // Get all threads (admin sees all, user sees only their own)
  app.get('/api/messages/threads', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const { dealId, userId: filterUserId } = req.query;

      let threads;
      if (isAdminRole(role)) {
        // Admin can see all threads or filter by query params
        if (dealId) {
          threads = await db.select().from(messageThreads)
            .where(eq(messageThreads.dealId, parseInt(dealId as string)))
            .orderBy(desc(messageThreads.lastMessageAt))
            .limit(100);
        } else if (filterUserId) {
          threads = await db.select().from(messageThreads)
            .where(eq(messageThreads.userId, parseInt(filterUserId as string)))
            .orderBy(desc(messageThreads.lastMessageAt))
            .limit(100);
        } else {
          threads = await db.select().from(messageThreads)
            .orderBy(desc(messageThreads.lastMessageAt))
            .limit(100);
        }
      } else {
        // User sees only their threads
        threads = await db.select().from(messageThreads)
          .where(eq(messageThreads.userId, userId))
          .orderBy(desc(messageThreads.lastMessageAt))
          .limit(100);
      }

      const currentUserId = userId;
      const threadsWithContext = await Promise.all(threads.map(async (thread) => {
        const threadUser = await db.select({ fullName: users.fullName, email: users.email, userType: users.role })
          .from(users).where(eq(users.id, thread.userId)).limit(1);

        let dealName = null;
        let dealIdentifier = null;
        let propertyAddress = null;
        let currentStage = null;
        if (thread.dealId) {
          const deal = await db.select({
            projectName: projects.projectName,
            propertyAddress: projects.propertyAddress,
            loanNumber: projects.loanNumber,
            currentStage: projects.currentStage,
          }).from(projects).where(eq(projects.id, thread.dealId)).limit(1);
          if (deal[0]) {
            dealName = deal[0].projectName;
            dealIdentifier = deal[0].loanNumber || `DEAL-${thread.dealId}`;
            propertyAddress = deal[0].propertyAddress;
            currentStage = deal[0].currentStage || null;
          }
        }

        const lastMsg = await db.select({ body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId })
          .from(messages)
          .where(eq(messages.threadId, thread.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        let unreadCount = 0;
        const readRecord = await db.select().from(messageReads)
          .where(and(eq(messageReads.threadId, thread.id), eq(messageReads.userId, currentUserId)))
          .limit(1);

        if (readRecord[0]) {
          const unreadResult = await db.select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(and(
              eq(messages.threadId, thread.id),
              gt(messages.createdAt, readRecord[0].lastReadAt)
            ));
          unreadCount = unreadResult[0]?.count || 0;
        } else {
          const allCount = await db.select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(eq(messages.threadId, thread.id));
          unreadCount = allCount[0]?.count || 0;
        }

        return {
          ...thread,
          createdAt: thread.createdAt instanceof Date ? thread.createdAt.toISOString() : thread.createdAt,
          lastMessageAt: (thread as any).lastMessageAt instanceof Date ? (thread as any).lastMessageAt.toISOString() : (thread as any).lastMessageAt,
          userName: threadUser[0]?.fullName || threadUser[0]?.email || 'Unknown',
          userType: threadUser[0]?.userType || null,
          dealName,
          dealIdentifier,
          propertyAddress,
          currentStage,
          lastMessagePreview: lastMsg[0]?.body?.substring(0, 100) || null,
          lastMessageSenderId: lastMsg[0]?.senderId || null,
          lastMessageCreatedAt: lastMsg[0]?.createdAt instanceof Date ? lastMsg[0].createdAt.toISOString() : lastMsg[0]?.createdAt || null,
          unreadCount,
        };
      }));

      res.json({ threads: threadsWithContext });
    } catch (error) {
      console.error('Get threads error:', error);
      res.status(500).json({ error: 'Failed to get threads' });
    }
  });

  // Get single thread with messages
  app.get('/api/messages/threads/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const userId = req.user!.id;
      const role = req.user!.role;

      const thread = await db.select().from(messageThreads)
        .where(eq(messageThreads.id, threadId)).limit(1);

      if (!thread[0]) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Auth check: user can only view own threads
      if (!isAdminRole(role) && thread[0].userId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const threadMessages = await db.select().from(messages)
        .where(eq(messages.threadId, threadId))
        .orderBy(messages.createdAt)
        .limit(500);

      // Get sender names for messages
      const messagesWithSenders = await Promise.all(threadMessages.map(async (msg) => {
        const serialized = {
          ...msg,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
          readAt: msg.readAt instanceof Date ? msg.readAt.toISOString() : msg.readAt,
        };
        if (msg.senderId) {
          const sender = await db.select({ fullName: users.fullName, email: users.email })
            .from(users).where(eq(users.id, msg.senderId)).limit(1);
          return { ...serialized, senderName: sender[0]?.fullName || sender[0]?.email || 'Unknown' };
        }
        return { ...serialized, senderName: 'System' };
      }));

      const threadSerialized = {
        ...thread[0],
        createdAt: thread[0].createdAt instanceof Date ? thread[0].createdAt.toISOString() : thread[0].createdAt,
        lastMessageAt: (thread[0] as any).lastMessageAt instanceof Date ? (thread[0] as any).lastMessageAt.toISOString() : (thread[0] as any).lastMessageAt,
      };
      res.json({ thread: threadSerialized, messages: messagesWithSenders });
    } catch (error) {
      console.error('Get thread error:', error);
      res.status(500).json({ error: 'Failed to get thread' });
    }
  });

  // Create or get thread (by dealId + userId)
  app.post('/api/messages/threads', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { dealId, userId: targetUserId, subject = null } = req.body;
      const requesterRole = req.user!.role;
      const requesterId = req.user!.id;

      if (!dealId) {
        return res.status(400).json({ error: 'dealId is required' });
      }

      if (!targetUserId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Users can only create threads for themselves, admins can create for anyone
      if (!isAdminRole(requesterRole) && parseInt(targetUserId) !== requesterId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Check if thread already exists for this user + deal combination
      const existing = await db.select().from(messageThreads)
        .where(and(
          eq(messageThreads.userId, parseInt(targetUserId)),
          eq(messageThreads.dealId, parseInt(dealId))
        )).limit(1);

      if (existing[0]) {
        const existingSerialized = {
          ...existing[0],
          createdAt: existing[0].createdAt instanceof Date ? existing[0].createdAt.toISOString() : existing[0].createdAt,
          lastMessageAt: (existing[0] as any).lastMessageAt instanceof Date ? (existing[0] as any).lastMessageAt.toISOString() : (existing[0] as any).lastMessageAt,
        };
        return res.json({ thread: existingSerialized });
      }

      // Create new thread
      const newThread = await db.insert(messageThreads).values({
        dealId: parseInt(dealId),
        userId: parseInt(targetUserId),
        createdBy: requesterId,
        subject: subject
      }).returning();

      // Initialize read receipt for the target user
      await db.insert(messageReads).values({
        threadId: newThread[0].id,
        userId: parseInt(targetUserId),
        lastReadAt: new Date('1970-01-01')
      }).onConflictDoNothing();

      const threadSerialized = {
        ...newThread[0],
        createdAt: newThread[0].createdAt instanceof Date ? newThread[0].createdAt.toISOString() : newThread[0].createdAt,
        lastMessageAt: (newThread[0] as any).lastMessageAt instanceof Date ? (newThread[0] as any).lastMessageAt.toISOString() : (newThread[0] as any).lastMessageAt,
      };
      res.json({ thread: threadSerialized });
    } catch (error) {
      console.error('Create thread error:', error);
      res.status(500).json({ error: 'Failed to create thread' });
    }
  });

  // Send message/notification
  app.post('/api/messages/threads/:id/messages', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const { body, type = 'message', meta = null } = req.body;
      const userId = req.user!.id;
      const role = req.user!.role;

      if (!body || typeof body !== 'string') {
        return res.status(400).json({ error: 'body is required' });
      }

      if (!['message', 'notification'].includes(type)) {
        return res.status(400).json({ error: 'invalid type' });
      }

      const thread = await db.select().from(messageThreads)
        .where(eq(messageThreads.id, threadId)).limit(1);

      if (!thread[0]) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Auth check: user can only post to own thread
      if (!isAdminRole(role) && thread[0].userId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const senderRole = isAdminRole(role) ? 'admin' : 'user';

      const newMessage = await db.insert(messages).values({
        threadId,
        senderId: userId,
        senderRole,
        type,
        body,
        meta
      }).returning();

      // Update thread's lastMessageAt
      await db.update(messageThreads)
        .set({ lastMessageAt: new Date() })
        .where(eq(messageThreads.id, threadId));

      const msgSerialized = {
        ...newMessage[0],
        createdAt: newMessage[0].createdAt instanceof Date ? newMessage[0].createdAt.toISOString() : newMessage[0].createdAt,
        readAt: newMessage[0].readAt instanceof Date ? newMessage[0].readAt.toISOString() : newMessage[0].readAt,
      };
      res.json({ message: msgSerialized });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Mark thread as read
  app.post('/api/messages/threads/:id/read', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const userId = req.user!.id;
      const role = req.user!.role;

      const thread = await db.select().from(messageThreads)
        .where(eq(messageThreads.id, threadId)).limit(1);

      if (!thread[0]) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      if (!isAdminRole(role) && thread[0].userId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Upsert read receipt
      const existing = await db.select().from(messageReads)
        .where(and(
          eq(messageReads.threadId, threadId),
          eq(messageReads.userId, userId)
        )).limit(1);

      if (existing[0]) {
        await db.update(messageReads)
          .set({ lastReadAt: new Date() })
          .where(and(
            eq(messageReads.threadId, threadId),
            eq(messageReads.userId, userId)
          ));
      } else {
        await db.insert(messageReads).values({
          threadId,
          userId,
          lastReadAt: new Date()
        });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Mark read error:', error);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // Get unread count for badge
  app.get('/api/messages/unread-count', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      let unreadCount = 0;

      if (isAdminRole(role)) {
        // Admin unread = messages from users after admin's last_read_at
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM messages m
          JOIN message_threads t ON t.id = m.thread_id
          LEFT JOIN message_reads r ON r.thread_id = t.id AND r.user_id = ${userId}
          WHERE m.sender_role = 'user'
            AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')
        `);
        unreadCount = (result.rows[0] as any)?.count || 0;
      } else {
        // User unread = messages from admins/system after user's last_read_at
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM messages m
          JOIN message_threads t ON t.id = m.thread_id
          LEFT JOIN message_reads r ON r.thread_id = t.id AND r.user_id = ${userId}
          WHERE t.user_id = ${userId}
            AND m.sender_role IN ('admin', 'system')
            AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')
        `);
        unreadCount = (result.rows[0] as any)?.count || 0;
      }

      res.json({ unreadCount });
    } catch (error) {
      console.error('Unread count error:', error);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  // ==================== NOTIFICATION HELPER ====================

  // Internal helper to post a notification to a user's thread (creates thread if needed)
  async function postDealNotification(userId: number, dealId: number, message: string, meta?: any) {
    try {
      // Find or create thread for this user + deal
      let thread = await db.select().from(messageThreads)
        .where(and(
          eq(messageThreads.userId, userId),
          eq(messageThreads.dealId, dealId)
        )).limit(1);

      if (!thread[0]) {
        // Create thread for this deal
        const newThread = await db.insert(messageThreads).values({
          dealId,
          userId,
          createdBy: null, // System created
          subject: `Deal #${dealId} Updates`
        }).returning();
        thread = newThread;

        // Initialize read receipt
        await db.insert(messageReads).values({
          threadId: newThread[0].id,
          userId,
          lastReadAt: new Date('1970-01-01')
        }).onConflictDoNothing();
      }

      // Post notification message
      await db.insert(messages).values({
        threadId: thread[0].id,
        senderId: null,
        senderRole: 'system',
        type: 'notification',
        body: message,
        meta
      });

      // Update thread's lastMessageAt
      await db.update(messageThreads)
        .set({ lastMessageAt: new Date() })
        .where(eq(messageThreads.id, thread[0].id));

      return thread[0];
    } catch (error) {
      console.error('Failed to post deal notification:', error);
      return null;
    }
  }

  // API endpoint for posting notifications (admin only)
  app.post('/api/messages/notify', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { userId, dealId, message, meta } = req.body;

      if (!userId || !message) {
        return res.status(400).json({ error: 'userId and message are required' });
      }

      const thread = await postDealNotification(userId, dealId || null, message, meta);

      if (!thread) {
        return res.status(500).json({ error: 'Failed to send notification' });
      }

      res.json({ success: true, threadId: thread.id });
    } catch (error) {
      console.error('Notify error:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });
}

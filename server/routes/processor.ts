// Processor routes for queue management and one-click processing
import type { Express, Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../auth";
import { db } from "../db";
import {
  processorDailyQueue,
  type ProcessorDailyQueue,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  generateDailyQueue,
  executeQueueItem,
  executeAllApproved,
  getProcessorQueue,
  updateQueueItem,
  getQueueStats,
} from "../services/processorQueue";

/**
 * Register processor routes
 */
export function registerProcessorRoutes(app: Express) {
  // Middleware: require processor role
  const requireProcessor = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userRoles = req.user.roles || [req.user.role];
      if (!userRoles.includes('processor')) {
        return res.status(403).json({ error: 'Processor access required' });
      }

      next();
    } catch (error) {
      console.error('Processor auth error:', error);
      res.status(500).json({ error: 'Authorization failed' });
    }
  };

  /**
   * GET /api/processor/daily-queue
   * Get the current processor's daily queue
   * Auto-generates if none exists for today
   */
  app.get('/api/processor/daily-queue', requireProcessor, async (req: AuthRequest, res: Response) => {
    try {
      const processorId = req.user?.id;
      if (!processorId) {
        return res.status(401).json({ error: 'User ID not found' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if queue exists for today
      let queueItems = await getProcessorQueue(processorId, today);

      // If no queue items, generate them
      if (queueItems.length === 0) {
        await generateDailyQueue(processorId);
        queueItems = await getProcessorQueue(processorId, today);

        // Insert generated items into database
        for (const item of queueItems) {
          await db.insert(processorDailyQueue).values({
            processorId,
            dealId: item.dealId,
            queueDate: today,
            actionType: item.actionType,
            actionData: item.actionData,
            status: 'pending',
            editedContent: item.editedContent,
            createdAt: new Date(),
          });
        }

        // Re-fetch with IDs
        queueItems = await getProcessorQueue(processorId, today);
      }

      // Get stats
      const stats = await getQueueStats(processorId, today);

      // Group by deal
      const groupedByDeal = queueItems.reduce((acc: Record<number, any>, item) => {
        if (!acc[item.dealId]) {
          acc[item.dealId] = {
            dealId: item.dealId,
            dealInfo: item.dealInfo,
            items: [],
          };
        }
        acc[item.dealId].items.push(item);
        return acc;
      }, {});

      res.json({
        date: today,
        queue: Object.values(groupedByDeal),
        stats,
      });
    } catch (error) {
      console.error('Error fetching daily queue:', error);
      res.status(500).json({ error: 'Failed to fetch queue' });
    }
  });

  /**
   * PUT /api/processor/queue/:itemId
   * Update a queue item (edit content, change status)
   */
  app.put('/api/processor/queue/:itemId', requireProcessor, async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const { editedContent, status } = req.body;

      if (!itemId || isNaN(itemId)) {
        return res.status(400).json({ error: 'Invalid item ID' });
      }

      const processorId = req.user?.id;
      if (!processorId) {
        return res.status(401).json({ error: 'User ID not found' });
      }

      // Verify processor owns this queue item
      const item = await db
        .select()
        .from(processorDailyQueue)
        .where(
          and(
            eq(processorDailyQueue.id, itemId),
            eq(processorDailyQueue.processorId, processorId)
          )
        )
        .limit(1);

      if (!item || item.length === 0) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      const result = await updateQueueItem(itemId, {
        editedContent,
        status,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Fetch updated item
      const updated = await db
        .select()
        .from(processorDailyQueue)
        .where(eq(processorDailyQueue.id, itemId))
        .limit(1);

      res.json({ success: true, item: updated[0] });
    } catch (error) {
      console.error('Error updating queue item:', error);
      res.status(500).json({ error: 'Failed to update queue item' });
    }
  });

  /**
   * POST /api/processor/queue/:itemId/approve
   * Mark a single item as approved
   */
  app.post('/api/processor/queue/:itemId/approve', requireProcessor, async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const processorId = req.user?.id;

      if (!processorId) {
        return res.status(401).json({ error: 'User ID not found' });
      }

      // Verify processor owns this queue item
      const item = await db
        .select()
        .from(processorDailyQueue)
        .where(
          and(
            eq(processorDailyQueue.id, itemId),
            eq(processorDailyQueue.processorId, processorId)
          )
        )
        .limit(1);

      if (!item || item.length === 0) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      const result = await updateQueueItem(itemId, {
        status: 'approved',
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error approving queue item:', error);
      res.status(500).json({ error: 'Failed to approve item' });
    }
  });

  /**
   * POST /api/processor/queue/approve-all
   * Approve all pending items for today
   */
  app.post('/api/processor/queue/approve-all', requireProcessor, async (req: AuthRequest, res: Response) => {
    try {
      const processorId = req.user?.id;
      if (!processorId) {
        return res.status(401).json({ error: 'User ID not found' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all pending items for today
      const pendingItems = await db
        .select()
        .from(processorDailyQueue)
        .where(
          and(
            eq(processorDailyQueue.processorId, processorId),
            eq(processorDailyQueue.queueDate, today),
            eq(processorDailyQueue.status, 'pending')
          )
        );

      // Update all to approved
      for (const item of pendingItems) {
        await updateQueueItem(item.id, { status: 'approved' });
      }

      res.json({
        success: true,
        approvedCount: pendingItems.length,
      });
    } catch (error) {
      console.error('Error approving all items:', error);
      res.status(500).json({ error: 'Failed to approve items' });
    }
  });

  /**
   * POST /api/processor/queue/execute
   * THE GO BUTTON - Execute all approved items
   * Returns streaming results
   */
  app.post('/api/processor/queue/execute', requireProcessor, async (req: AuthRequest, res: Response) => {
    try {
      const processorId = req.user?.id;
      if (!processorId) {
        return res.status(401).json({ error: 'User ID not found' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Execute all approved items
      const results = await executeAllApproved(processorId, today);

      // Count by status
      const summary = {
        total: results.length,
        sent: results.filter(r => r.status === 'sent').length,
        failed: results.filter(r => r.status === 'failed').length,
        results,
      };

      res.json(summary);
    } catch (error) {
      console.error('Error executing queue:', error);
      res.status(500).json({ error: 'Failed to execute queue' });
    }
  });

  /**
   * GET /api/processor/queue/stats
   * Get queue statistics
   */
  app.get('/api/processor/queue/stats', requireProcessor, async (req: AuthRequest, res: Response) => {
    try {
      const processorId = req.user?.id;
      if (!processorId) {
        return res.status(401).json({ error: 'User ID not found' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stats = await getQueueStats(processorId, today);

      res.json(stats);
    } catch (error) {
      console.error('Error getting queue stats:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });
}

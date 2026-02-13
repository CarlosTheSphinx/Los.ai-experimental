// Processor Daily Queue Service
// Generates and executes daily queue items for processors
// Handles digest sending, document review, task creation, and messages

import { db } from '../db';
import {
  processorDailyQueue,
  dealProcessors,
  projects,
  digestState,
  loanDigestConfigs,
  loanDigestRecipients,
  dealDocuments,
  projectTasks,
  dealTasks,
  users,
  type ProcessorDailyQueue,
  type Project,
  type User,
  type DealDocument,
  type LoanDigestConfig,
  type LoanDigestRecipient,
} from '@shared/schema';
import { eq, and, or, lte, isNull, sql, inArray, gt } from 'drizzle-orm';
import { getOutstandingDocuments, getRecentUpdates } from '../digestService';
import { getResendClient } from '../email';
import { sendSms } from '../smsService';

export interface QueueItem extends ProcessorDailyQueue {
  dealInfo?: {
    name: string;
    borrowerName: string | null;
    propertyAddress: string | null;
  };
  preRenderedContent?: {
    emailSubject?: string;
    emailBody?: string;
    smsBody?: string;
  };
}

export interface ExecutionResult {
  itemId: number;
  status: 'sent' | 'failed';
  timestamp: Date;
  error?: string;
  details?: Record<string, any>;
}

const BASE_URL = process.env.BASE_URL || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000');

/**
 * Generate daily queue for a processor
 * Finds all deals assigned to processor and generates queue items for:
 * - Digest notifications due today
 * - Documents uploaded but not reviewed
 * - Tasks due today or overdue
 * - Pending AI review results to confirm
 */
export async function generateDailyQueue(processorId: number): Promise<QueueItem[]> {
  const queueItems: QueueItem[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    // Find all deals assigned to this processor
    const assignedDeals = await db
      .select({
        projectId: dealProcessors.projectId,
        dealId: projects.id,
        dealName: projects.projectName,
        borrowerName: projects.borrowerName,
        propertyAddress: projects.propertyAddress,
      })
      .from(dealProcessors)
      .innerJoin(projects, eq(dealProcessors.projectId, projects.id))
      .where(
        and(
          eq(dealProcessors.userId, processorId),
          eq(projects.isArchived, false),
          eq(projects.status, 'active')
        )
      );

    for (const deal of assignedDeals) {
      // 1. Check for digest notifications due today
      await generateDigestQueueItems(
        processorId,
        deal.dealId,
        deal.dealName,
        deal.borrowerName,
        deal.propertyAddress,
        today,
        tomorrow,
        queueItems
      );

      // 2. Check for documents uploaded but not reviewed
      await generateDocumentReviewItems(
        processorId,
        deal.dealId,
        deal.dealName,
        deal.borrowerName,
        deal.propertyAddress,
        queueItems
      );

      // 3. Check for tasks due today or overdue
      await generateTaskQueueItems(
        processorId,
        deal.dealId,
        deal.dealName,
        deal.borrowerName,
        deal.propertyAddress,
        today,
        queueItems
      );
    }

    // Sort by priority and creation time
    queueItems.sort((a, b) => {
      const priorityMap: Record<string, number> = {
        'digest_send': 1,
        'document_review': 2,
        'task_creation': 3,
        'message_send': 4,
      };
      const aPriority = priorityMap[a.actionType] || 99;
      const bPriority = priorityMap[b.actionType] || 99;
      return aPriority - bPriority;
    });

    return queueItems;
  } catch (error) {
    console.error('Error generating daily queue:', error);
    throw error;
  }
}

/**
 * Generate digest queue items for a deal
 */
async function generateDigestQueueItems(
  processorId: number,
  dealId: number,
  dealName: string,
  borrowerName: string | null,
  propertyAddress: string | null,
  today: Date,
  tomorrow: Date,
  queueItems: QueueItem[]
) {
  try {
    // Find digest configs for this deal
    const digestConfigs = await db
      .select()
      .from(loanDigestConfigs)
      .where(
        and(
          eq(loanDigestConfigs.dealId, dealId),
          eq(loanDigestConfigs.isEnabled, true)
        )
      );

    for (const config of digestConfigs) {
      // Check digest state for each recipient
      const digestStates = await db
        .select({
          stateId: digestState.id,
          recipientId: digestState.recipientId,
          nextDueAt: digestState.nextDigestDueAt,
          recipient: loanDigestRecipients,
        })
        .from(digestState)
        .innerJoin(loanDigestRecipients, eq(digestState.recipientId, loanDigestRecipients.id))
        .where(
          and(
            eq(digestState.configId, config.id),
            eq(loanDigestRecipients.isActive, true),
            and(
              lte(digestState.nextDigestDueAt, tomorrow),
              gt(digestState.nextDigestDueAt, today)
            )
          )
        );

      for (const digestItem of digestStates) {
        if (!digestItem.recipient) continue;

        // Get outstanding documents for this deal
        const outstandingDocs = await getOutstandingDocuments(dealId);
        const recentUpdates = await getRecentUpdates(dealId);

        // Pre-render email/SMS content with merge tags
        const preRenderedContent = renderDigestContent(
          config,
          digestItem.recipient,
          {
            dealName,
            borrowerName,
            propertyAddress,
            outstandingDocs,
            recentUpdates,
          }
        );

        // Create queue item for digest
        const queueItem: QueueItem = {
          id: 0,
          processorId,
          dealId,
          queueDate: today,
          actionType: 'digest_send',
          actionData: {
            configId: config.id,
            recipientId: digestItem.recipientId,
            recipient: digestItem.recipient,
            channels: config.communicationChannels || { email: true, sms: false, inApp: true },
          },
          status: 'pending',
          editedContent: null,
          approvedBy: null,
          approvedAt: null,
          sentAt: null,
          createdAt: new Date(),
          preRenderedContent,
          dealInfo: {
            name: dealName,
            borrowerName,
            propertyAddress,
          },
        };

        queueItems.push(queueItem);
      }
    }
  } catch (error) {
    console.error(`Error generating digest queue items for deal ${dealId}:`, error);
  }
}

/**
 * Generate document review queue items
 */
async function generateDocumentReviewItems(
  processorId: number,
  dealId: number,
  dealName: string,
  borrowerName: string | null,
  propertyAddress: string | null,
  queueItems: QueueItem[]
) {
  try {
    // Find documents uploaded but not reviewed
    const uploadedDocs = await db
      .select()
      .from(dealDocuments)
      .where(
        and(
          eq(dealDocuments.dealId, dealId),
          eq(dealDocuments.status, 'uploaded'),
          isNull(dealDocuments.reviewedAt)
        )
      );

    for (const doc of uploadedDocs) {
      const queueItem: QueueItem = {
        id: 0,
        processorId,
        dealId,
        queueDate: new Date(),
        actionType: 'document_review',
        actionData: {
          documentId: doc.id,
          documentName: doc.documentName,
          aiReviewStatus: doc.aiReviewStatus,
          aiReviewReason: doc.aiReviewReason,
          aiReviewConfidence: doc.aiReviewConfidence,
        },
        status: 'pending',
        editedContent: null,
        approvedBy: null,
        approvedAt: null,
        sentAt: null,
        createdAt: new Date(),
        dealInfo: {
          name: dealName,
          borrowerName,
          propertyAddress,
        },
      };

      queueItems.push(queueItem);
    }
  } catch (error) {
    console.error(`Error generating document review items for deal ${dealId}:`, error);
  }
}

/**
 * Generate task queue items
 */
async function generateTaskQueueItems(
  processorId: number,
  dealId: number,
  dealName: string,
  borrowerName: string | null,
  propertyAddress: string | null,
  today: Date,
  queueItems: QueueItem[]
) {
  try {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find project tasks and deal tasks due today or overdue
    const projectTasksDue = await db
      .select()
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, dealId),
          eq(projectTasks.status, 'pending'),
          lte(projectTasks.dueDate, tomorrow),
          gt(projectTasks.dueDate, new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) // within last 30 days
        )
      );

    for (const task of projectTasksDue) {
      const queueItem: QueueItem = {
        id: 0,
        processorId,
        dealId,
        queueDate: today,
        actionType: 'task_creation',
        actionData: {
          taskId: task.id,
          taskTitle: task.taskTitle,
          taskDescription: task.taskDescription,
          dueDate: task.dueDate,
          priority: task.priority,
        },
        status: 'pending',
        editedContent: null,
        approvedBy: null,
        approvedAt: null,
        sentAt: null,
        createdAt: new Date(),
        dealInfo: {
          name: dealName,
          borrowerName,
          propertyAddress,
        },
      };

      queueItems.push(queueItem);
    }
  } catch (error) {
    console.error(`Error generating task queue items for deal ${dealId}:`, error);
  }
}

/**
 * Render digest content with merge tags
 */
function renderDigestContent(
  config: LoanDigestConfig,
  recipient: LoanDigestRecipient,
  context: {
    dealName: string;
    borrowerName: string | null;
    propertyAddress: string | null;
    outstandingDocs: any[];
    recentUpdates: any[];
  }
): { emailSubject: string; emailBody: string; smsBody?: string } {
  const mergeTags = {
    '{{recipientName}}': recipient.recipientName || 'Borrower',
    '{{dealName}}': context.dealName,
    '{{propertyAddress}}': context.propertyAddress || 'Property',
    '{{borrowerName}}': context.borrowerName || 'Borrower',
    '{{documentsCount}}': String(context.outstandingDocs.length),
    '{{documentsSection}}': renderDocumentsSection(context.outstandingDocs),
    '{{updatesSection}}': renderUpdatesSection(context.recentUpdates),
  };

  let emailSubject = config.emailSubject || 'Loan Update: Action Required';
  let emailBody = config.emailBody || '';
  let smsBody = config.smsBody || '';

  // Replace merge tags
  Object.entries(mergeTags).forEach(([tag, value]) => {
    emailSubject = emailSubject.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
    emailBody = emailBody.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
    smsBody = smsBody.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
  });

  return {
    emailSubject,
    emailBody,
    smsBody: smsBody || undefined,
  };
}

/**
 * Render outstanding documents section for digest
 */
function renderDocumentsSection(docs: any[]): string {
  if (docs.length === 0) {
    return 'No outstanding documents.';
  }

  const docList = docs
    .map(doc => `- ${doc.name} (${doc.status})`)
    .join('\n');

  return `Documents Needed:\n${docList}`;
}

/**
 * Render updates section for digest
 */
function renderUpdatesSection(updates: any[]): string {
  if (updates.length === 0) {
    return 'No recent updates.';
  }

  const updateList = updates
    .slice(0, 5)
    .map(update => `- ${update.summary}`)
    .join('\n');

  return `Recent Updates:\n${updateList}`;
}

/**
 * Execute a single queue item
 */
export async function executeQueueItem(itemId: number, editedContent?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const item = await db
      .select()
      .from(processorDailyQueue)
      .where(eq(processorDailyQueue.id, itemId))
      .limit(1);

    if (!item || item.length === 0) {
      return { success: false, error: 'Queue item not found' };
    }

    const queueItem = item[0];

    switch (queueItem.actionType) {
      case 'digest_send':
        return await executeDigestSend(queueItem, editedContent);

      case 'document_review':
        return await executeDocumentReview(queueItem);

      case 'task_creation':
        return await executeTaskCreation(queueItem);

      case 'message_send':
        return await executeMessageSend(queueItem, editedContent);

      default:
        return { success: false, error: `Unknown action type: ${queueItem.actionType}` };
    }
  } catch (error) {
    console.error(`Error executing queue item ${itemId}:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Execute digest send action
 */
async function executeDigestSend(queueItem: ProcessorDailyQueue, editedContent?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const actionData = queueItem.actionData as any;
    const recipient = actionData.recipient as LoanDigestRecipient;

    // Use edited content if provided, otherwise use pre-rendered content
    let emailSubject = '';
    let emailBody = '';
    let smsBody = '';

    if (editedContent) {
      // Parse edited content (should be JSON with emailSubject, emailBody, smsBody)
      const parsed = JSON.parse(editedContent);
      emailSubject = parsed.emailSubject || '';
      emailBody = parsed.emailBody || '';
      smsBody = parsed.smsBody || '';
    } else if (queueItem.editedContent) {
      const parsed = JSON.parse(queueItem.editedContent);
      emailSubject = parsed.emailSubject || '';
      emailBody = parsed.emailBody || '';
      smsBody = parsed.smsBody || '';
    }

    const channels = actionData.channels || { email: true, sms: false, inApp: true };

    // Send via enabled channels
    if (channels.email && recipient.recipientEmail) {
      const { client, fromEmail } = await getResendClient();
      await client.emails.send({
        from: fromEmail,
        to: recipient.recipientEmail,
        subject: emailSubject || 'Loan Update',
        html: `<p>${emailBody.replace(/\n/g, '<br>')}</p>`,
      });
    }

    if (channels.sms && recipient.recipientPhone && smsBody) {
      await sendSms(recipient.recipientPhone, smsBody);
    }

    // In-app messages would be created in a messages table
    if (channels.inApp) {
      // TODO: Create in-app message if message system is available
    }

    // Update queue item status
    await db
      .update(processorDailyQueue)
      .set({
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(processorDailyQueue.id, queueItem.id));

    return { success: true };
  } catch (error) {
    console.error('Error sending digest:', error);
    await db
      .update(processorDailyQueue)
      .set({
        status: 'failed',
      })
      .where(eq(processorDailyQueue.id, queueItem.id));

    return { success: false, error: String(error) };
  }
}

/**
 * Execute document review action
 */
async function executeDocumentReview(queueItem: ProcessorDailyQueue): Promise<{ success: boolean; error?: string }> {
  try {
    const actionData = queueItem.actionData as any;
    const documentId = actionData.documentId;

    // Get the queue item's edited content for approval status
    let approvalStatus = 'approved';
    if (queueItem.editedContent) {
      const parsed = JSON.parse(queueItem.editedContent);
      approvalStatus = parsed.status || 'approved';
    }

    // Update document status
    await db
      .update(dealDocuments)
      .set({
        status: approvalStatus,
        reviewedAt: new Date(),
        reviewedBy: queueItem.processorId,
        reviewNotes: queueItem.editedContent ? JSON.parse(queueItem.editedContent).notes || '' : '',
      })
      .where(eq(dealDocuments.id, documentId));

    // Update queue item status
    await db
      .update(processorDailyQueue)
      .set({
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(processorDailyQueue.id, queueItem.id));

    return { success: true };
  } catch (error) {
    console.error('Error reviewing document:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Execute task creation action
 */
async function executeTaskCreation(queueItem: ProcessorDailyQueue): Promise<{ success: boolean; error?: string }> {
  try {
    const actionData = queueItem.actionData as any;
    const taskId = actionData.taskId;

    // Update task status to in_progress if not already
    await db
      .update(projectTasks)
      .set({
        status: 'in_progress',
      })
      .where(
        and(
          eq(projectTasks.id, taskId),
          eq(projectTasks.status, 'pending')
        )
      );

    // Update queue item status
    await db
      .update(processorDailyQueue)
      .set({
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(processorDailyQueue.id, queueItem.id));

    return { success: true };
  } catch (error) {
    console.error('Error creating/updating task:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Execute message send action
 */
async function executeMessageSend(queueItem: ProcessorDailyQueue, editedContent?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Similar to digest send but for custom messages
    const messageContent = editedContent || queueItem.editedContent || '';

    // TODO: Send message based on available messaging system
    // This would integrate with the existing messaging/broadcast service

    // Update queue item status
    await db
      .update(processorDailyQueue)
      .set({
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(processorDailyQueue.id, queueItem.id));

    return { success: true };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Execute all approved queue items for a processor on a given date
 */
export async function executeAllApproved(
  processorId: number,
  queueDate: Date
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  try {
    const approvedItems = await db
      .select()
      .from(processorDailyQueue)
      .where(
        and(
          eq(processorDailyQueue.processorId, processorId),
          eq(processorDailyQueue.queueDate, queueDate),
          eq(processorDailyQueue.status, 'approved')
        )
      );

    for (const item of approvedItems) {
      const result = await executeQueueItem(item.id);

      results.push({
        itemId: item.id,
        status: result.success ? 'sent' : 'failed',
        timestamp: new Date(),
        error: result.error,
      });
    }

    return results;
  } catch (error) {
    console.error('Error executing all approved items:', error);
    throw error;
  }
}

/**
 * Get queue items for a processor for a given date
 */
export async function getProcessorQueue(
  processorId: number,
  queueDate: Date
): Promise<QueueItem[]> {
  try {
    const items = await db
      .select()
      .from(processorDailyQueue)
      .where(
        and(
          eq(processorDailyQueue.processorId, processorId),
          eq(processorDailyQueue.queueDate, queueDate)
        )
      )
      .orderBy(sql`CASE WHEN action_type = 'digest_send' THEN 1 WHEN action_type = 'document_review' THEN 2 WHEN action_type = 'task_creation' THEN 3 ELSE 4 END`);

    // Fetch deal info for each item
    const itemsWithInfo: QueueItem[] = [];
    for (const item of items) {
      const [dealInfo] = await db
        .select({
          name: projects.projectName,
          borrowerName: projects.borrowerName,
          propertyAddress: projects.propertyAddress,
        })
        .from(projects)
        .where(eq(projects.id, item.dealId))
        .limit(1);

      itemsWithInfo.push({
        ...item,
        dealInfo: dealInfo || undefined,
      });
    }

    return itemsWithInfo;
  } catch (error) {
    console.error('Error getting processor queue:', error);
    throw error;
  }
}

/**
 * Update queue item with edited content or approval status
 */
export async function updateQueueItem(
  itemId: number,
  updates: {
    editedContent?: string;
    status?: 'pending' | 'approved' | 'sent' | 'failed';
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = {};

    if (updates.editedContent !== undefined) {
      updateData.editedContent = updates.editedContent;
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      if (updates.status === 'approved') {
        updateData.approvedAt = new Date();
      }
    }

    await db
      .update(processorDailyQueue)
      .set(updateData)
      .where(eq(processorDailyQueue.id, itemId));

    return { success: true };
  } catch (error) {
    console.error('Error updating queue item:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get queue statistics for a processor
 */
export async function getQueueStats(processorId: number, queueDate: Date) {
  try {
    const items = await db
      .select()
      .from(processorDailyQueue)
      .where(
        and(
          eq(processorDailyQueue.processorId, processorId),
          eq(processorDailyQueue.queueDate, queueDate)
        )
      );

    const stats = {
      total: items.length,
      pending: items.filter(i => i.status === 'pending').length,
      approved: items.filter(i => i.status === 'approved').length,
      sent: items.filter(i => i.status === 'sent').length,
      failed: items.filter(i => i.status === 'failed').length,
      byType: {
        digest_send: items.filter(i => i.actionType === 'digest_send').length,
        document_review: items.filter(i => i.actionType === 'document_review').length,
        task_creation: items.filter(i => i.actionType === 'task_creation').length,
        message_send: items.filter(i => i.actionType === 'message_send').length,
      },
    };

    return stats;
  } catch (error) {
    console.error('Error getting queue stats:', error);
    throw error;
  }
}

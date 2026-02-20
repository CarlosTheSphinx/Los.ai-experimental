/**
 * Email Document Check Polling Service
 * Periodically scans linked email threads for new attachments,
 * classifies them via AI, and creates notifications for the user.
 *
 * Follows the same start/stop polling pattern as pandadocSync.ts.
 */

import { db } from '../db';
import {
  emailAccounts,
  emailThreads,
  emailMessages,
  emailThreadDealLinks,
  notifications,
  systemSettings,
  projects,
} from '@shared/schema';
import { eq, and, desc, gt, isNotNull } from 'drizzle-orm';
import { classifyEmailAttachment } from './emailDocClassifier';

const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let pollTimer: ReturnType<typeof setInterval> | null = null;

interface EmailDocCheckSettings {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  totalClassifications: number;
}

const DEFAULT_SETTINGS: EmailDocCheckSettings = {
  enabled: true,
  intervalMinutes: 60,
  lastRunAt: null,
  totalClassifications: 0,
};

// ==================== SETTINGS MANAGEMENT ====================

export async function getSettings(): Promise<EmailDocCheckSettings> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, 'email_doc_check_settings'));

    if (row?.settingValue) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.settingValue) };
    }
  } catch (err) {
    console.error('Error reading email doc check settings:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

export async function updateSettings(
  partial: Partial<EmailDocCheckSettings>
): Promise<EmailDocCheckSettings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, 'email_doc_check_settings'));

  if (existing) {
    await db
      .update(systemSettings)
      .set({
        settingValue: JSON.stringify(updated),
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.settingKey, 'email_doc_check_settings'));
  } else {
    await db.insert(systemSettings).values({
      settingKey: 'email_doc_check_settings',
      settingValue: JSON.stringify(updated),
      settingDescription: 'Email Document Check polling configuration',
    });
  }

  return updated;
}

// ==================== PROCESSED ATTACHMENTS TRACKING ====================

async function getProcessedAttachments(): Promise<Set<string>> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, 'email_doc_check_processed'));

    if (row?.settingValue) {
      const arr = JSON.parse(row.settingValue);
      return new Set(Array.isArray(arr) ? arr : []);
    }
  } catch {
    // ignore
  }
  return new Set();
}

async function markAttachmentProcessed(key: string): Promise<void> {
  const processed = await getProcessedAttachments();
  processed.add(key);

  // Keep only last 5000 entries to prevent unbounded growth
  const arr = Array.from(processed).slice(-5000);

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, 'email_doc_check_processed'));

  if (existing) {
    await db
      .update(systemSettings)
      .set({
        settingValue: JSON.stringify(arr),
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.settingKey, 'email_doc_check_processed'));
  } else {
    await db.insert(systemSettings).values({
      settingKey: 'email_doc_check_processed',
      settingValue: JSON.stringify(arr),
      settingDescription: 'Processed email attachment IDs for deduplication',
    });
  }
}

// ==================== CORE CHECK LOGIC ====================

export async function runEmailDocCheck(): Promise<{
  accountsChecked: number;
  attachmentsFound: number;
  classified: number;
  errors: string[];
}> {
  const results = {
    accountsChecked: 0,
    attachmentsFound: 0,
    classified: 0,
    errors: [] as string[],
  };

  try {
    const settings = await getSettings();
    if (!settings.enabled) {
      console.log('📧 Email doc check is disabled, skipping');
      return results;
    }

    console.log('📧 Starting email document check...');

    const processedSet = await getProcessedAttachments();

    // Get all active email accounts
    const accounts = await db
      .select()
      .from(emailAccounts)
      .where(eq(emailAccounts.isActive, true));

    for (const account of accounts) {
      results.accountsChecked++;

      try {
        // Get all linked threads for this account
        const linkedThreads = await db
          .select({
            thread: emailThreads,
            link: emailThreadDealLinks,
          })
          .from(emailThreadDealLinks)
          .innerJoin(
            emailThreads,
            eq(emailThreadDealLinks.emailThreadId, emailThreads.id)
          )
          .where(eq(emailThreads.accountId, account.id));

        for (const { thread, link } of linkedThreads) {
          // Get messages with attachments for this thread
          const messages = await db
            .select()
            .from(emailMessages)
            .where(
              and(
                eq(emailMessages.threadId, thread.id),
                isNotNull(emailMessages.attachments)
              )
            )
            .orderBy(desc(emailMessages.internalDate));

          for (const message of messages) {
            if (!message.attachments) continue;

            const attachments = Array.isArray(message.attachments)
              ? message.attachments
              : [];

            for (const att of attachments as any[]) {
              if (!att.attachmentId || !att.filename) continue;

              const processKey = `${account.id}:${message.gmailMessageId}:${att.attachmentId}`;

              if (processedSet.has(processKey)) continue;

              results.attachmentsFound++;

              // Get deal info for context
              let dealName = 'Unknown Deal';
              let borrowerName = 'Unknown';
              try {
                const [deal] = await db
                  .select()
                  .from(projects)
                  .where(eq(projects.id, link.dealId));
                if (deal) {
                  dealName =
                    deal.borrowerName ||
                    deal.name ||
                    `Deal #${deal.id}`;
                  borrowerName = deal.borrowerName || 'Unknown';
                }
              } catch {
                // use defaults
              }

              try {
                const classification = await classifyEmailAttachment({
                  accountId: account.id,
                  messageId: message.gmailMessageId!,
                  attachmentId: att.attachmentId,
                  filename: att.filename,
                  mimeType: att.mimeType || 'application/octet-stream',
                  emailSubject: thread.subject || '(no subject)',
                  senderEmail: message.fromAddress || thread.fromAddress || '',
                  senderName: message.fromName || thread.fromName || '',
                  dealId: link.dealId,
                  dealName,
                  borrowerName,
                  userId: account.userId,
                });

                if (classification.success) {
                  // Create notification
                  const senderDisplay =
                    message.fromName || message.fromAddress || 'Someone';

                  await db.insert(notifications).values({
                    userId: account.userId,
                    type: 'email_document_detected',
                    title: `Document received: ${classification.documentTypeLabel}`,
                    message: `${senderDisplay} sent a document on ${dealName}. I think it's a ${classification.documentTypeLabel} (${classification.confidence}% confident). Would you like to view and approve?`,
                    dealId: link.dealId,
                    link: `/deals/${link.dealId}?tab=emails&threadId=${thread.id}`,
                    isRead: false,
                  });

                  results.classified++;
                }

                // Mark as processed even on failure to avoid re-trying
                await markAttachmentProcessed(processKey);
              } catch (classifyErr: any) {
                results.errors.push(
                  `Classification failed for ${att.filename}: ${classifyErr.message}`
                );
                // Still mark processed to avoid infinite retries
                await markAttachmentProcessed(processKey);
              }
            }
          }
        }
      } catch (accountErr: any) {
        results.errors.push(
          `Account ${account.emailAddress}: ${accountErr.message}`
        );
      }
    }

    // Update settings with last run timestamp and classification count
    const currentSettings = await getSettings();
    await updateSettings({
      lastRunAt: new Date().toISOString(),
      totalClassifications:
        currentSettings.totalClassifications + results.classified,
    });

    console.log(
      `📧 Email doc check complete: ${results.accountsChecked} accounts, ${results.attachmentsFound} attachments, ${results.classified} classified`
    );
  } catch (error: any) {
    console.error('Email doc check polling error:', error);
    results.errors.push(error.message);
  }

  return results;
}

// ==================== POLLING CONTROL ====================

export async function startEmailDocCheckPolling(): Promise<void> {
  if (pollTimer) {
    console.log('📧 Email doc check polling already running');
    return;
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    console.log('📧 Email doc check polling is disabled');
    return;
  }

  const intervalMs = (settings.intervalMinutes || 60) * 60 * 1000;

  console.log(
    `📧 Starting email doc check polling (every ${settings.intervalMinutes} minutes)`
  );

  pollTimer = setInterval(async () => {
    try {
      await runEmailDocCheck();
    } catch (error) {
      console.error('📧 Email doc check polling error:', error);
    }
  }, intervalMs);
}

export function stopEmailDocCheckPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('📧 Email doc check polling stopped');
  }
}

export async function restartEmailDocCheckPolling(): Promise<void> {
  stopEmailDocCheckPolling();
  await startEmailDocCheckPolling();
}

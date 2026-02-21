/**
 * Document Review Orchestrator
 *
 * Handles the full lifecycle after document upload:
 * 1. Checks lender's aiReviewMode (automatic / timed / manual)
 * 2. If automatic → triggers AI review immediately
 * 3. On review result:
 *    - FAIL → sends instant alerts to borrower/broker per lender config
 *    - PASS → notifies lender/processor for human approval
 * 4. For timed mode → queues document for next batch review cycle
 */

import { db } from "../db";
import {
  lenderReviewConfig,
  dealDocuments,
  dealDocumentFiles,
  projects,
  notifications,
  users,
  loanUpdates,
  agentCommunications,
  documentReviewResults,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewAlertConfig {
  failAlertEnabled: boolean;
  failAlertRecipients: string; // 'borrower' | 'broker' | 'both'
  failAlertChannels: { email?: boolean; sms?: boolean; inApp?: boolean };
  passNotifyEnabled: boolean;
  passNotifyChannels: { email?: boolean; inApp?: boolean };
}

interface DocumentUploadContext {
  documentId: number;
  projectId: number;
  uploaderType: "borrower" | "broker"; // who uploaded
  uploaderId?: number; // user id if authenticated
}

// ---------------------------------------------------------------------------
// Get lender config (with defaults)
// ---------------------------------------------------------------------------

async function getLenderConfig(projectId: number): Promise<{
  reviewMode: string;
  timedIntervalMinutes: number;
  alerts: ReviewAlertConfig;
  digestAutoSend: boolean;
  aiDraftAutoSend: boolean;
  draftReadyNotifyEnabled: boolean;
  lenderId: number | null;
} | null> {
  // Find the lender (project creator) and per-deal override for this deal
  const [project] = await db
    .select({ lenderId: projects.userId, aiReviewMode: projects.aiReviewMode })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project?.lenderId) return null;

  const [config] = await db
    .select()
    .from(lenderReviewConfig)
    .where(eq(lenderReviewConfig.userId, project.lenderId));

  // Per-deal override takes priority over lender config
  const defaults = {
    reviewMode: project.aiReviewMode || config?.aiReviewMode || "manual",
    timedIntervalMinutes: config?.timedReviewIntervalMinutes || 60,
    alerts: {
      failAlertEnabled: config?.failAlertEnabled ?? true,
      failAlertRecipients: config?.failAlertRecipients || "both",
      failAlertChannels: (config?.failAlertChannels as any) || { email: true, sms: false, inApp: true },
      passNotifyEnabled: config?.passNotifyEnabled ?? true,
      passNotifyChannels: (config?.passNotifyChannels as any) || { email: false, inApp: true },
    },
    digestAutoSend: config?.digestAutoSend ?? false,
    aiDraftAutoSend: config?.aiDraftAutoSend ?? false,
    draftReadyNotifyEnabled: config?.draftReadyNotifyEnabled ?? true,
    lenderId: project.lenderId,
  };

  return defaults;
}

// ---------------------------------------------------------------------------
// Main entry point — called after document upload completes
// ---------------------------------------------------------------------------

export async function onDocumentUploaded(ctx: DocumentUploadContext): Promise<void> {
  try {
    const config = await getLenderConfig(ctx.projectId);
    if (!config) {
      console.log(`[DocReviewOrch] No lender config found for project ${ctx.projectId}, skipping auto-review`);
      return;
    }

    if (config.reviewMode === "automatic") {
      // Trigger AI review immediately
      console.log(`[DocReviewOrch] Auto-reviewing document ${ctx.documentId} for project ${ctx.projectId}`);
      await triggerAiReview(ctx, config);
    } else if (config.reviewMode === "timed") {
      // Mark document as pending review — the timed batch job will pick it up
      console.log(`[DocReviewOrch] Queuing document ${ctx.documentId} for timed review`);
      await db
        .update(dealDocuments)
        .set({ aiReviewStatus: "pending" })
        .where(eq(dealDocuments.id, ctx.documentId));
    }
    // mode === "manual" — do nothing, lender triggers manually
  } catch (err: any) {
    console.error(`[DocReviewOrch] Error processing document ${ctx.documentId}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Trigger AI review and handle result
// ---------------------------------------------------------------------------

async function triggerAiReview(
  ctx: DocumentUploadContext,
  config: Awaited<ReturnType<typeof getLenderConfig>>
): Promise<void> {
  if (!config) return;

  try {
    // Mark as reviewing
    await db
      .update(dealDocuments)
      .set({ aiReviewStatus: "reviewing" })
      .where(eq(dealDocuments.id, ctx.documentId));

    // Import and call the existing review service
    const { reviewDocument } = await import("./documentReview");
    const result = await reviewDocument(ctx.documentId, ctx.projectId, config.lenderId!);

    if (!result.success) {
      console.error(`[DocReviewOrch] AI review failed for doc ${ctx.documentId}:`, result.error);
      await db
        .update(dealDocuments)
        .set({ aiReviewStatus: "not_reviewed" })
        .where(eq(dealDocuments.id, ctx.documentId));
      return;
    }

    // Get the review result status
    const reviewStatus = result.result?.overallStatus || "unknown";
    const reviewSummary = result.result?.summary || "";
    const isFail = reviewStatus === "fail" || reviewStatus === "denied";
    const isPass = reviewStatus === "pass" || reviewStatus === "approved";

    if (isFail) {
      await handleReviewFail(ctx, config, reviewSummary);
    } else if (isPass) {
      await handleReviewPass(ctx, config, reviewSummary);
    }
  } catch (err: any) {
    console.error(`[DocReviewOrch] AI review error for doc ${ctx.documentId}:`, err.message);
    await db
      .update(dealDocuments)
      .set({ aiReviewStatus: "not_reviewed" })
      .where(eq(dealDocuments.id, ctx.documentId));
  }
}

// ---------------------------------------------------------------------------
// Handle FAIL — instant alerts to borrower/broker
// ---------------------------------------------------------------------------

async function handleReviewFail(
  ctx: DocumentUploadContext,
  config: NonNullable<Awaited<ReturnType<typeof getLenderConfig>>>,
  reviewSummary: string
): Promise<void> {
  const { alerts, lenderId } = config;
  if (!alerts.failAlertEnabled) return;

  // Get document and project details
  const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, ctx.documentId));
  const [project] = await db.select().from(projects).where(eq(projects.id, ctx.projectId));
  if (!doc || !project) return;

  const docName = doc.documentName || "Document";
  const dealName = project.projectName || `Deal #${project.id}`;

  // Determine who to notify
  const notifyBorrower = alerts.failAlertRecipients === "borrower" || alerts.failAlertRecipients === "both";
  const notifyBroker = alerts.failAlertRecipients === "broker" || alerts.failAlertRecipients === "both";

  // Find borrower user by email match
  if (notifyBorrower && project.borrowerEmail) {
    const [borrowerUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, project.borrowerEmail));

    if (borrowerUser && alerts.failAlertChannels?.inApp) {
      await db.insert(notifications).values({
        userId: borrowerUser.id,
        type: "doc_review_failed",
        title: `Document Issue: ${docName}`,
        message: `Your uploaded document "${docName}" for ${dealName} did not pass review. ${reviewSummary}. Please re-upload a corrected version.`,
        dealId: ctx.projectId,
        link: `/portal/${project.borrowerPortalToken}`,
      });
    }

    if (borrowerUser && alerts.failAlertChannels?.email) {
      // Create an AI communication draft for the fail alert email
      await db.insert(agentCommunications).values({
        projectId: ctx.projectId,
        recipientType: "borrower",
        recipientName: borrowerUser.fullName || borrowerUser.email,
        recipientEmail: borrowerUser.email,
        subject: `Action Required: ${docName} needs attention`,
        body: `Hello,\n\nThe document "${docName}" you uploaded for ${dealName} did not pass our automated review.\n\nReason: ${reviewSummary}\n\nPlease log in to your portal and re-upload a corrected version.\n\nThank you.`,
        priority: "high",
        status: "approved", // auto-approved since lender enabled instant fail alerts
        sourceTrigger: "doc_review_fail",
      });
    }
  }

  // Find broker via dealProcessors or project fields
  if (notifyBroker && lenderId) {
    // Look for a broker associated with this deal via the dealProcessors or project fields
    const brokerEmail = (project as any).brokerEmail;
    if (brokerEmail) {
      const [brokerUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, brokerEmail));

      if (brokerUser && alerts.failAlertChannels?.inApp) {
        await db.insert(notifications).values({
          userId: brokerUser.id,
          type: "doc_review_failed",
          title: `Document Issue: ${docName}`,
          message: `Document "${docName}" for ${dealName} did not pass AI review. ${reviewSummary}`,
          dealId: ctx.projectId,
          link: `/broker-portal/${project.brokerPortalToken}`,
        });
      }

      if (brokerUser && alerts.failAlertChannels?.email) {
        await db.insert(agentCommunications).values({
          projectId: ctx.projectId,
          recipientType: "broker",
          recipientName: brokerUser.fullName || brokerUser.email,
          recipientEmail: brokerUser.email,
          subject: `Document Review Failed: ${docName}`,
          body: `Hello,\n\nThe document "${docName}" uploaded for ${dealName} did not pass automated review.\n\nReason: ${reviewSummary}\n\nPlease coordinate with the borrower to get a corrected document uploaded.\n\nThank you.`,
          priority: "high",
          status: "approved",
          sourceTrigger: "doc_review_fail",
        });
      }
    }
  }

  // Always notify the lender/processor about fails too
  if (lenderId) {
    await db.insert(notifications).values({
      userId: lenderId,
      type: "doc_review_failed",
      title: `AI Review Failed: ${docName}`,
      message: `Document "${docName}" for ${dealName} failed AI review. ${reviewSummary}`,
      dealId: ctx.projectId,
      link: `/deals/${ctx.projectId}`,
    });
  }

  // Log to loan updates for digest inclusion
  await db.insert(loanUpdates).values({
    projectId: ctx.projectId,
    updateType: "doc_review_failed",
    summary: `Document "${docName}" failed AI review: ${reviewSummary}`,
    meta: { documentId: ctx.documentId, status: "fail" },
  });
}

// ---------------------------------------------------------------------------
// Handle PASS — notify lender for human approval
// ---------------------------------------------------------------------------

async function handleReviewPass(
  ctx: DocumentUploadContext,
  config: NonNullable<Awaited<ReturnType<typeof getLenderConfig>>>,
  reviewSummary: string
): Promise<void> {
  const { alerts, lenderId } = config;
  if (!alerts.passNotifyEnabled || !lenderId) return;

  const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, ctx.documentId));
  const [project] = await db.select().from(projects).where(eq(projects.id, ctx.projectId));
  if (!doc || !project) return;

  const docName = doc.documentName || "Document";
  const dealName = project.projectName || `Deal #${project.id}`;

  // In-app notification to lender
  if (alerts.passNotifyChannels?.inApp) {
    await db.insert(notifications).values({
      userId: lenderId,
      type: "doc_review_passed",
      title: `Document Ready for Approval: ${docName}`,
      message: `"${docName}" for ${dealName} passed AI review. Do you want to approve it?`,
      dealId: ctx.projectId,
      link: `/deals/${ctx.projectId}?tab=documents`,
    });
  }

  // Log to loan updates
  await db.insert(loanUpdates).values({
    projectId: ctx.projectId,
    updateType: "doc_review_passed",
    summary: `Document "${docName}" passed AI review and is awaiting human approval.`,
    meta: { documentId: ctx.documentId, status: "pass" },
  });
}

// ---------------------------------------------------------------------------
// Timed batch review — called by a cron/scheduler
// ---------------------------------------------------------------------------

export async function runTimedBatchReview(): Promise<{ reviewed: number; errors: number }> {
  let reviewed = 0;
  let errors = 0;

  try {
    // Find all lenders with timed review mode
    const configs = await db
      .select()
      .from(lenderReviewConfig)
      .where(eq(lenderReviewConfig.aiReviewMode, "timed"));

    for (const config of configs) {
      const intervalMs = (config.timedReviewIntervalMinutes || 60) * 60 * 1000;
      const lastRun = config.lastTimedReviewAt?.getTime() || 0;
      const now = Date.now();

      if (now - lastRun < intervalMs) continue; // not due yet

      // Find all pending documents for this lender's deals
      const lenderProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.userId, config.userId));

      for (const proj of lenderProjects) {
        const pendingDocs = await db
          .select()
          .from(dealDocuments)
          .where(
            and(
              eq(dealDocuments.dealId, proj.id),
              eq(dealDocuments.aiReviewStatus, "pending")
            )
          );

        for (const doc of pendingDocs) {
          try {
            const fullConfig = await getLenderConfig(proj.id);
            if (fullConfig) {
              await triggerAiReview(
                {
                  documentId: doc.id,
                  projectId: proj.id,
                  uploaderType: "borrower",
                },
                fullConfig
              );
              reviewed++;
            }
          } catch (err: any) {
            console.error(`[DocReviewOrch] Timed review error for doc ${doc.id}:`, err.message);
            errors++;
          }
        }
      }

      // Update last run timestamp
      await db
        .update(lenderReviewConfig)
        .set({ lastTimedReviewAt: new Date() })
        .where(eq(lenderReviewConfig.id, config.id));
    }
  } catch (err: any) {
    console.error("[DocReviewOrch] Timed batch review error:", err.message);
  }

  return { reviewed, errors };
}

// ---------------------------------------------------------------------------
// Notify lender when a draft communication is ready for review
// ---------------------------------------------------------------------------

export async function notifyDraftReady(
  communicationId: number,
  projectId: number
): Promise<void> {
  try {
    const config = await getLenderConfig(projectId);
    if (!config || !config.draftReadyNotifyEnabled || !config.lenderId) return;

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    const dealName = project?.projectName || `Deal #${projectId}`;

    await db.insert(notifications).values({
      userId: config.lenderId,
      type: "draft_ready",
      title: `Communication Draft Ready`,
      message: `A new communication draft for ${dealName} is ready for your review.`,
      dealId: projectId,
      link: `/deals/${projectId}?tab=communications`,
    });
  } catch (err: any) {
    console.error(`[DocReviewOrch] Draft ready notify error:`, err.message);
  }
}

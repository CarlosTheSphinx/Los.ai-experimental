import { getResendClient } from '../email';
import { storage } from '../storage';
import { db } from '../db';
import { commercialSubmissions, users } from '@shared/schema';
import { and, inArray, lt, eq } from 'drizzle-orm';

async function isNotificationEnabled(settingKey: string): Promise<boolean> {
  try {
    const setting = await storage.getSettingByKey(settingKey);
    if (!setting) return true;
    return setting.settingValue !== 'false';
  } catch {
    return true;
  }
}

async function getAdminEmails(): Promise<{ email: string; fullName: string | null }[]> {
  try {
    const adminUsers = await db.select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(inArray(users.role, ['admin', 'super_admin']));
    return adminUsers;
  } catch (err) {
    console.error('Failed to load admin users for notification:', err);
    return [];
  }
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function emailWrapper(headerColor: string, headerText: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${headerColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
    .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
    .detail-row { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .detail-label { font-weight: bold; color: #475569; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${headerText}</h1>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>Powered by Sphinx Capital</p>
    </div>
  </div>
</body>
</html>`;
}

function submissionSummaryHtml(submission: any): string {
  return `
    <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0;">
      <div class="detail-row"><span class="detail-label">Property:</span> ${submission.propertyName || 'N/A'}</div>
      <div class="detail-row"><span class="detail-label">Address:</span> ${submission.propertyAddress || 'N/A'}, ${submission.city || ''}, ${submission.state || ''} ${submission.zip || ''}</div>
      <div class="detail-row"><span class="detail-label">Loan Type:</span> ${submission.loanType || 'N/A'}</div>
      <div class="detail-row"><span class="detail-label">Loan Amount:</span> ${formatCurrency(submission.requestedLoanAmount)}</div>
      <div class="detail-row"><span class="detail-label">Property Type:</span> ${submission.propertyType || 'N/A'}</div>
    </div>`;
}

export async function sendCommercialNotification(type: string, submission: any, additionalData?: any): Promise<void> {
  try {
    const propertyLabel = submission.propertyName || submission.propertyAddress || 'Commercial Deal';

    switch (type) {
      case 'submission_received': {
        if (!(await isNotificationEnabled('commercial_notify_broker_submitted'))) return;
        const { client } = await getResendClient();
        await client.emails.send({
          from: 'Sphinx Capital <onboarding@resend.dev>',
          to: submission.email,
          subject: `Your Commercial Deal Submission Has Been Received - ${propertyLabel}`,
          html: emailWrapper('#1e40af', 'Submission Received', `
            <p>Hello ${submission.brokerOrDeveloperName},</p>
            <p>Thank you for submitting your commercial deal. We have received your submission and our team will review it shortly.</p>
            ${submissionSummaryHtml(submission)}
            <p>You will receive updates as your submission progresses through our review process.</p>
          `),
        });
        try {
          await storage.createSubmissionNotification({
            submissionId: submission.id,
            notificationType: 'submission_received',
            recipientEmail: submission.email,
          });
        } catch {}
        break;
      }

      case 'submission_approved': {
        if (!(await isNotificationEnabled('commercial_notify_broker_approved'))) return;
        const { client } = await getResendClient();
        await client.emails.send({
          from: 'Sphinx Capital <onboarding@resend.dev>',
          to: submission.email,
          subject: `Your Commercial Deal Has Been Approved - ${propertyLabel}`,
          html: emailWrapper('#16a34a', 'Deal Approved', `
            <p>Hello ${submission.brokerOrDeveloperName},</p>
            <p>We are pleased to inform you that your commercial deal submission has been <strong>approved</strong>.</p>
            ${submissionSummaryHtml(submission)}
            ${additionalData?.adminNotes ? `<p><strong>Notes:</strong> ${additionalData.adminNotes}</p>` : ''}
            <p>Our team will be in touch with next steps.</p>
          `),
        });
        try {
          await storage.createSubmissionNotification({
            submissionId: submission.id,
            notificationType: 'submission_approved',
            recipientEmail: submission.email,
          });
        } catch {}
        break;
      }

      case 'submission_declined': {
        if (!(await isNotificationEnabled('commercial_notify_broker_declined'))) return;
        const { client } = await getResendClient();
        const reason = additionalData?.reason || additionalData?.adminNotes || 'No specific reason provided.';
        await client.emails.send({
          from: 'Sphinx Capital <onboarding@resend.dev>',
          to: submission.email,
          subject: `Commercial Deal Submission Update - ${propertyLabel}`,
          html: emailWrapper('#dc2626', 'Submission Declined', `
            <p>Hello ${submission.brokerOrDeveloperName},</p>
            <p>After careful review, we are unable to move forward with your commercial deal submission at this time.</p>
            ${submissionSummaryHtml(submission)}
            <p><strong>Reason:</strong> ${reason}</p>
            <p>If you have questions or would like to discuss alternative options, please don't hesitate to reach out to our team.</p>
          `),
        });
        try {
          await storage.createSubmissionNotification({
            submissionId: submission.id,
            notificationType: 'submission_declined',
            recipientEmail: submission.email,
          });
        } catch {}
        break;
      }

      case 'info_needed': {
        if (!(await isNotificationEnabled('commercial_notify_broker_info_needed'))) return;
        const { client } = await getResendClient();
        const message = additionalData?.message || additionalData?.adminNotes || 'Additional information is required to process your submission.';
        await client.emails.send({
          from: 'Sphinx Capital <onboarding@resend.dev>',
          to: submission.email,
          subject: `Additional Information Needed - ${propertyLabel}`,
          html: emailWrapper('#f59e0b', 'Information Needed', `
            <p>Hello ${submission.brokerOrDeveloperName},</p>
            <p>We need additional information regarding your commercial deal submission:</p>
            ${submissionSummaryHtml(submission)}
            <p style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
              <strong>Message from our team:</strong><br/>${message}
            </p>
            <p>Please respond at your earliest convenience so we can continue processing your deal.</p>
          `),
        });
        try {
          await storage.createSubmissionNotification({
            submissionId: submission.id,
            notificationType: 'info_needed',
            recipientEmail: submission.email,
          });
        } catch {}
        break;
      }

      case 'admin_new_submission': {
        if (!(await isNotificationEnabled('commercial_notify_admin_new_submission'))) return;
        const admins = await getAdminEmails();
        if (admins.length === 0) return;
        const { client } = await getResendClient();
        for (const admin of admins) {
          try {
            await client.emails.send({
              from: 'Sphinx Capital <onboarding@resend.dev>',
              to: admin.email,
              subject: `New Commercial Submission - ${propertyLabel}`,
              html: emailWrapper('#1e40af', 'New Commercial Submission', `
                <p>Hello ${admin.fullName || 'Admin'},</p>
                <p>A new commercial deal submission has been received and requires review.</p>
                ${submissionSummaryHtml(submission)}
                <div class="detail-row"><span class="detail-label">Submitted by:</span> ${submission.brokerOrDeveloperName} (${submission.email})</div>
                <div class="detail-row"><span class="detail-label">Company:</span> ${submission.companyName || 'N/A'}</div>
                <p>Please log in to the admin panel to review this submission.</p>
              `),
            });
            try {
              await storage.createSubmissionNotification({
                submissionId: submission.id,
                notificationType: 'admin_new_submission',
                recipientEmail: admin.email,
              });
            } catch {}
          } catch (err) {
            console.error(`Failed to send admin notification to ${admin.email}:`, err);
          }
        }
        break;
      }

      case 'admin_needs_review': {
        if (!(await isNotificationEnabled('commercial_notify_admin_needs_review'))) return;
        const admins = await getAdminEmails();
        if (admins.length === 0) return;
        const { client } = await getResendClient();
        const aiReason = additionalData?.reason || 'AI review flagged this deal for manual review.';
        for (const admin of admins) {
          try {
            await client.emails.send({
              from: 'Sphinx Capital <onboarding@resend.dev>',
              to: admin.email,
              subject: `Manual Review Required - ${propertyLabel}`,
              html: emailWrapper('#f59e0b', 'Manual Review Required', `
                <p>Hello ${admin.fullName || 'Admin'},</p>
                <p>A commercial deal submission has been flagged by our AI review system and requires manual review.</p>
                ${submissionSummaryHtml(submission)}
                <p style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
                  <strong>AI Review Notes:</strong><br/>${aiReason}
                </p>
                <p>Please log in to the admin panel to review this submission.</p>
              `),
            });
            try {
              await storage.createSubmissionNotification({
                submissionId: submission.id,
                notificationType: 'admin_needs_review',
                recipientEmail: admin.email,
              });
            } catch {}
          } catch (err) {
            console.error(`Failed to send review notification to ${admin.email}:`, err);
          }
        }
        break;
      }

      case 'submission_expired': {
        if (!(await isNotificationEnabled('commercial_notify_broker_expired'))) return;
        const { client } = await getResendClient();
        await client.emails.send({
          from: 'Sphinx Capital <onboarding@resend.dev>',
          to: submission.email,
          subject: `Commercial Deal Submission Expired - ${propertyLabel}`,
          html: emailWrapper('#6b7280', 'Submission Expired', `
            <p>Hello ${submission.brokerOrDeveloperName},</p>
            <p>Your commercial deal submission has expired as it was not fully processed within 30 days.</p>
            ${submissionSummaryHtml(submission)}
            <p>If you are still interested in this deal, please submit a new application or contact our team.</p>
          `),
        });
        try {
          await storage.createSubmissionNotification({
            submissionId: submission.id,
            notificationType: 'submission_expired',
            recipientEmail: submission.email,
          });
        } catch {}
        break;
      }

      default:
        console.warn(`Unknown commercial notification type: ${type}`);
    }
  } catch (err) {
    console.error(`Failed to send commercial notification (${type}):`, err);
  }
}

export async function checkExpiredSubmissions(): Promise<void> {
  try {
    const now = new Date();
    const expiredSubmissions = await db.select().from(commercialSubmissions)
      .where(
        and(
          inArray(commercialSubmissions.status, ['NEW', 'UNDER_REVIEW']),
          lt(commercialSubmissions.expiresAt, now)
        )
      );

    for (const submission of expiredSubmissions) {
      try {
        await db.update(commercialSubmissions)
          .set({ status: 'EXPIRED', updatedAt: new Date() })
          .where(eq(commercialSubmissions.id, submission.id));

        await sendCommercialNotification('submission_expired', submission);
        console.log(`Expired submission #${submission.id} - ${submission.propertyName}`);
      } catch (err) {
        console.error(`Error expiring submission #${submission.id}:`, err);
      }
    }

    if (expiredSubmissions.length > 0) {
      console.log(`Expired ${expiredSubmissions.length} commercial submissions`);
    }
  } catch (err) {
    console.error('Error checking expired submissions:', err);
  }
}

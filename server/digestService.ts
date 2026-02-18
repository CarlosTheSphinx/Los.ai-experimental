// Loan Digest Notification Service
// Handles sending daily/periodic digests to borrowers and partners about their loans

import { db } from './db';
import { 
  loanDigestConfigs, 
  loanDigestRecipients, 
  loanUpdates, 
  digestHistory, 
  digestState,
  projects,
  projectDocuments,
  projectTasks,
  dealDocuments,
  savedQuotes,
  users,
  type LoanDigestConfig,
  type LoanDigestRecipient,
  type LoanUpdate,
  type Project
} from '@shared/schema';
import { eq, and, lte, isNull, or, gt, inArray, sql } from 'drizzle-orm';
import { getResendClient } from './email';

// Base URL for generating links
const BASE_URL = process.env.BASE_URL || process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
  : 'http://localhost:5000';

interface OutstandingDocument {
  id: number;
  name: string;
  category: string | null;
  status: string;
  dueDate: Date | null;
  notes: string | null;
}

interface DigestContent {
  project: Project;
  outstandingDocs: OutstandingDocument[];
  recentUpdates: LoanUpdate[];
  hasContent: boolean;
}

// Get outstanding documents for a project (documents not yet received/approved)
// Checks both projectDocuments and dealDocuments (via project's linked deal/quote)
export async function getOutstandingDocuments(projectId: number): Promise<OutstandingDocument[]> {
  const outstandingDocs: OutstandingDocument[] = [];
  
  // First, get the project to find the linked deal (quoteId)
  const [project] = await db
    .select({ quoteId: projects.quoteId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  
  // Get outstanding documents from dealDocuments (if project has a linked deal)
  if (project?.quoteId) {
    const dealDocs = await db
      .select({
        id: dealDocuments.id,
        name: dealDocuments.documentName,
        category: dealDocuments.documentCategory,
        status: dealDocuments.status,
        notes: dealDocuments.reviewNotes,
        isRequired: dealDocuments.isRequired,
      })
      .from(dealDocuments)
      .where(and(
        eq(dealDocuments.dealId, project.quoteId),
        or(
          eq(dealDocuments.status, 'pending'),
          eq(dealDocuments.status, 'uploaded'),
          eq(dealDocuments.status, 'rejected')
        )
      ));
    
    dealDocs.forEach(doc => {
      outstandingDocs.push({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        status: doc.status ?? 'pending',
        dueDate: null,
        notes: doc.notes,
      });
    });
  }
  
  // Also check projectDocuments table (legacy/additional docs)
  const projectDocs = await db
    .select({
      id: projectDocuments.id,
      name: projectDocuments.documentName,
      category: projectDocuments.documentCategory,
      status: projectDocuments.status,
      notes: projectDocuments.reviewNotes,
    })
    .from(projectDocuments)
    .where(and(
      eq(projectDocuments.projectId, projectId),
      or(
        eq(projectDocuments.status, 'pending_review'),
        eq(projectDocuments.status, 'pending'),
        eq(projectDocuments.status, 'rejected'),
        eq(projectDocuments.status, 'needs_revision')
      )
    ));

  projectDocs.forEach(doc => {
    // Avoid duplicates (check by name and category combination)
    const isDuplicate = outstandingDocs.some(d => 
      d.name === doc.name && d.category === doc.category
    );
    if (!isDuplicate) {
      outstandingDocs.push({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        status: doc.status ?? 'pending',
        dueDate: null,
        notes: doc.notes,
      });
    }
  });

  // Also get tasks that require documents but don't have them
  const tasksNeedingDocs = await db
    .select({
      id: projectTasks.id,
      name: projectTasks.taskTitle,
      status: projectTasks.status,
    })
    .from(projectTasks)
    .where(and(
      eq(projectTasks.projectId, projectId),
      eq(projectTasks.requiresDocument, true),
      isNull(projectTasks.documentId),
      eq(projectTasks.status, 'pending')
    ));

  // Add tasks needing documents as "missing" documents
  tasksNeedingDocs.forEach(task => {
    outstandingDocs.push({
      id: task.id,
      name: task.name,
      category: 'Required Document',
      status: 'missing',
      dueDate: null,
      notes: null,
    });
  });

  return outstandingDocs;
}

// Get outstanding documents for a deal directly (without needing a linked project)
export async function getOutstandingDocumentsForDeal(dealId: number): Promise<OutstandingDocument[]> {
  const outstandingDocs: OutstandingDocument[] = [];
  
  // Get outstanding documents from dealDocuments
  const dealDocs = await db
    .select({
      id: dealDocuments.id,
      name: dealDocuments.documentName,
      category: dealDocuments.documentCategory,
      status: dealDocuments.status,
      notes: dealDocuments.reviewNotes,
      isRequired: dealDocuments.isRequired,
    })
    .from(dealDocuments)
    .where(and(
      eq(dealDocuments.dealId, dealId),
      or(
        eq(dealDocuments.status, 'pending'),
        eq(dealDocuments.status, 'uploaded'),
        eq(dealDocuments.status, 'rejected')
      )
    ));
  
  dealDocs.forEach(doc => {
    outstandingDocs.push({
      id: doc.id,
      name: doc.name,
      category: doc.category,
      status: doc.status,
      dueDate: null,
      notes: doc.notes,
    });
  });

  return outstandingDocs;
}

// Get recent updates for a project since last digest
export async function getRecentUpdates(projectId: number, since?: Date): Promise<LoanUpdate[]> {
  const conditions = [eq(loanUpdates.projectId, projectId)];
  
  if (since) {
    conditions.push(gt(loanUpdates.createdAt, since));
  }

  const updates = await db
    .select()
    .from(loanUpdates)
    .where(and(...conditions))
    .orderBy(loanUpdates.createdAt);

  return updates;
}

// Log a loan update for the digest
export async function logLoanUpdate(
  projectId: number,
  updateType: string,
  summary: string,
  performedBy?: number,
  meta?: Record<string, any>
): Promise<void> {
  await db.insert(loanUpdates).values({
    projectId,
    updateType,
    summary,
    performedBy,
    meta,
  });
}

// Calculate next digest due date based on frequency
function calculateNextDueDate(frequency: string, customDays: number | null, lastSentAt: Date, timeOfDay: string): Date {
  const next = new Date(lastSentAt);
  
  let daysToAdd = 1;
  switch (frequency) {
    case 'daily':
      daysToAdd = 1;
      break;
    case 'every_2_days':
      daysToAdd = 2;
      break;
    case 'every_3_days':
      daysToAdd = 3;
      break;
    case 'weekly':
      daysToAdd = 7;
      break;
    case 'custom':
      daysToAdd = Math.max(1, Math.min(30, customDays || 2));
      break;
    default:
      daysToAdd = 1;
  }

  next.setDate(next.getDate() + daysToAdd);
  
  // Set the time of day
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  next.setHours(hours || 9, minutes || 0, 0, 0);
  
  return next;
}

// Generate digest email HTML
function generateDigestEmailHtml(content: DigestContent, portalLink: string): string {
  const { project, outstandingDocs, recentUpdates } = content;
  
  const docsHtml = outstandingDocs.length > 0
    ? `
      <h3 style="color: #1e40af; margin-top: 24px;">Documents Needed</h3>
      <ul style="list-style: none; padding: 0;">
        ${outstandingDocs.map(doc => `
          <li style="background: white; padding: 12px 16px; border-radius: 6px; margin: 8px 0; border-left: 4px solid ${doc.status === 'rejected' ? '#dc2626' : '#f59e0b'};">
            <strong>${escapeHtml(doc.name)}</strong>
            ${doc.category ? `<span style="color: #64748b; font-size: 12px; margin-left: 8px;">(${escapeHtml(doc.category)})</span>` : ''}
            ${doc.status === 'rejected' ? '<span style="color: #dc2626; font-size: 12px; margin-left: 8px;">- Needs Revision</span>' : ''}
            ${doc.notes ? `<p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">${escapeHtml(doc.notes)}</p>` : ''}
          </li>
        `).join('')}
      </ul>
    `
    : '<p style="color: #16a34a;">All documents are up to date!</p>';

  const updatesHtml = recentUpdates.length > 0
    ? `
      <h3 style="color: #1e40af; margin-top: 24px;">Recent Updates</h3>
      <ul style="list-style: none; padding: 0;">
        ${recentUpdates.map(update => `
          <li style="background: white; padding: 12px 16px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #3b82f6;">
            ${escapeHtml(update.summary)}
            <span style="color: #64748b; font-size: 12px; display: block; margin-top: 4px;">
              ${new Date(update.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </li>
        `).join('')}
      </ul>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1e40af; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background-color: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
        .summary-box { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Loan Update</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">${escapeHtml(project.projectName)}</p>
        </div>
        <div class="content">
          <div class="summary-box">
            <p style="margin: 0;"><strong>Property:</strong> ${escapeHtml(project.propertyAddress || 'N/A')}</p>
            <p style="margin: 8px 0 0 0;"><strong>Loan Amount:</strong> ${project.loanAmount ? `$${project.loanAmount.toLocaleString()}` : 'N/A'}</p>
            <p style="margin: 8px 0 0 0;"><strong>Status:</strong> ${escapeHtml(project.currentStage || project.status || 'In Progress')}</p>
          </div>
          
          ${docsHtml}
          ${updatesHtml}
          
          <div style="text-align: center; margin-top: 24px;">
            <a href="${portalLink}" class="button">View Your Loan Portal</a>
          </div>
          
          <p style="color: #64748b; font-size: 14px; text-align: center; margin-top: 20px;">
            Questions? Reply to this email or contact your loan officer.
          </p>
        </div>
        <div class="footer">
          <p>Powered by Lendry.AI</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate plain text version for SMS
function generateDigestSmsText(content: DigestContent, portalLink: string): string {
  const { project, outstandingDocs } = content;
  
  let text = `Lendry.AI - ${project.projectName}\n\n`;
  
  if (outstandingDocs.length > 0) {
    text += `Documents Needed (${outstandingDocs.length}):\n`;
    outstandingDocs.slice(0, 3).forEach(doc => {
      text += `- ${doc.name}\n`;
    });
    if (outstandingDocs.length > 3) {
      text += `...and ${outstandingDocs.length - 3} more\n`;
    }
    text += `\n`;
  }
  
  text += `View details: ${portalLink}`;
  
  return text;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Apply template variables to custom message templates
function applyTemplateVariables(template: string, content: DigestContent, portalLink: string, extraVars?: Record<string, string>): string {
  const recipientName = content.project.borrowerName || 'Valued Customer';
  const propertyAddress = content.project.propertyAddress || 'your property';
  
  const documentsSection = content.outstandingDocs.length > 0
    ? `Documents Needed:\n${content.outstandingDocs.map(d => `- ${d.name}${d.status === 'rejected' ? ' (Needs Revision)' : ''}`).join('\n')}`
    : 'All documents are up to date.';
  
  const updatesSection = content.recentUpdates.length > 0
    ? `Recent Updates:\n${content.recentUpdates.map(u => `- ${u.summary}`).join('\n')}`
    : '';

  const loanAmount = content.project.loanAmount
    ? `$${Number(content.project.loanAmount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    : 'N/A';
  const loanType = content.project.loanType || 'N/A';
  const currentStage = content.project.currentStage
    ? content.project.currentStage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : 'N/A';
  const dealId = `DEAL-${content.project.id}`;
  const targetCloseDate = content.project.targetCloseDate
    ? new Date(content.project.targetCloseDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'TBD';
  
  let result = template
    .replace(/\{\{recipientName\}\}/g, recipientName)
    .replace(/\{\{propertyAddress\}\}/g, propertyAddress)
    .replace(/\{\{documentsSection\}\}/g, documentsSection)
    .replace(/\{\{updatesSection\}\}/g, updatesSection)
    .replace(/\{\{documentsCount\}\}/g, String(content.outstandingDocs.length))
    .replace(/\{\{portalLink\}\}/g, portalLink)
    .replace(/\{\{loanAmount\}\}/g, loanAmount)
    .replace(/\{\{loanType\}\}/g, loanType)
    .replace(/\{\{currentStage\}\}/g, currentStage)
    .replace(/\{\{dealId\}\}/g, dealId)
    .replace(/\{\{targetCloseDate\}\}/g, targetCloseDate);

  if (extraVars) {
    for (const [key, value] of Object.entries(extraVars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  }

  return result;
}

// Generate custom email HTML from template
function generateCustomEmailHtml(template: string, content: DigestContent, portalLink: string): string {
  const bodyText = applyTemplateVariables(template, content, portalLink);
  
  // Convert newlines to <br> for HTML
  const bodyHtml = escapeHtml(bodyText).replace(/\n/g, '<br>');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1e40af; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background-color: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">Lendry.AI</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Loan Status Update</p>
        </div>
        <div class="content">
          <p>${bodyHtml}</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${portalLink}" class="button">View Loan Portal</a>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message from Lendry.AI.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send email digest
async function sendEmailDigest(
  recipient: LoanDigestRecipient,
  content: DigestContent,
  email: string,
  config?: LoanDigestConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const portalLink = content.project.borrowerPortalToken
      ? `${BASE_URL}/portal/${content.project.borrowerPortalToken}`
      : `${BASE_URL}/app/projects/${content.project.id}`;
    
    const subject = config?.emailSubject 
      ? applyTemplateVariables(config.emailSubject, content, portalLink)
      : `Loan Update: ${content.project.projectName} - ${content.outstandingDocs.length} Document(s) Needed`;
    
    const html = config?.emailBody
      ? generateCustomEmailHtml(config.emailBody, content, portalLink)
      : generateDigestEmailHtml(content, portalLink);
    
    const result = await client.emails.send({
      from: fromEmail || 'Lendry.AI <info@lendry.ai>',
      to: email,
      subject,
      html,
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send digest email:', error);
    return { success: false, error: error.message };
  }
}

// Send SMS digest using Twilio
async function sendSmsDigest(
  recipient: LoanDigestRecipient,
  content: DigestContent,
  phone: string,
  config?: LoanDigestConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const { sendDigestSms, sendCustomSms } = await import('./smsService');
    
    const portalLink = content.project.borrowerPortalToken
      ? `${BASE_URL}/portal/${content.project.borrowerPortalToken}`
      : `${BASE_URL}/app/projects/${content.project.id}`;
    
    // Use custom SMS body if provided
    if (config?.smsBody) {
      const customMessage = applyTemplateVariables(config.smsBody, content, portalLink);
      const result = await sendCustomSms(phone, customMessage);
      return result;
    }
    
    // Default SMS
    const result = await sendDigestSms(
      phone,
      content.project.projectName,
      content.outstandingDocs.length,
      content.recentUpdates.length,
      portalLink
    );
    
    return result;
  } catch (error: any) {
    console.error('Failed to send SMS digest:', error);
    return { success: false, error: error.message };
  }
}

// Process a single digest
async function processDigest(
  config: LoanDigestConfig,
  recipient: LoanDigestRecipient,
  project: Project
): Promise<void> {
  // Get last digest state
  const existingState = await db
    .select()
    .from(digestState)
    .where(and(
      eq(digestState.configId, config.id),
      eq(digestState.recipientId, recipient.id)
    ));
  
  const lastSentAt = existingState[0]?.lastDigestSentAt;
  
  // Gather content
  const outstandingDocs = config.includeDocumentsNeeded 
    ? await getOutstandingDocuments(project.id) 
    : [];
  
  const recentUpdates = config.includeGeneralUpdates && lastSentAt
    ? await getRecentUpdates(project.id, new Date(lastSentAt))
    : [];

  const content: DigestContent = {
    project,
    outstandingDocs,
    recentUpdates,
    hasContent: outstandingDocs.length > 0 || recentUpdates.length > 0,
  };

  // Skip if no content to send
  if (!content.hasContent) {
    console.log(`Skipping digest for project ${project.id} - no content`);
    return;
  }

  // Determine recipient contact info
  let email = recipient.recipientEmail;
  let phone = recipient.recipientPhone;
  let recipientName = recipient.recipientName || 'Borrower';
  
  // If linked to user, get their info
  if (recipient.userId) {
    const user = await db.select().from(users).where(eq(users.id, recipient.userId));
    if (user[0]) {
      email = email || user[0].email;
      phone = phone || user[0].phone || null;
      recipientName = user[0].fullName || recipientName;
    }
  }

  const now = new Date();
  const results: { method: string; success: boolean; address: string; error?: string }[] = [];

  // Send based on delivery method
  if ((recipient.deliveryMethod === 'email' || recipient.deliveryMethod === 'both') && email) {
    const result = await sendEmailDigest(recipient, content, email, config);
    results.push({ method: 'email', success: result.success, address: email, error: result.error });
  }

  if ((recipient.deliveryMethod === 'sms' || recipient.deliveryMethod === 'both') && phone) {
    const result = await sendSmsDigest(recipient, content, phone, config);
    results.push({ method: 'sms', success: result.success, address: phone, error: result.error });
  }

  // Log history for each delivery
  for (const result of results) {
    await db.insert(digestHistory).values({
      configId: config.id,
      recipientId: recipient.id,
      projectId: project.id,
      deliveryMethod: result.method,
      recipientAddress: result.address,
      documentsCount: outstandingDocs.length,
      updatesCount: recentUpdates.length,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
    });
  }

  // Update digest state
  const nextDueAt = calculateNextDueDate(
    config.frequency,
    config.customDays,
    now,
    config.timeOfDay
  );

  if (existingState[0]) {
    await db
      .update(digestState)
      .set({
        lastDigestSentAt: now,
        nextDigestDueAt: nextDueAt,
        updatedAt: now,
      })
      .where(eq(digestState.id, existingState[0].id));
  } else {
    await db.insert(digestState).values({
      configId: config.id,
      recipientId: recipient.id,
      lastDigestSentAt: now,
      nextDigestDueAt: nextDueAt,
    });
  }

  // Mark updates as included in digest
  if (recentUpdates.length > 0) {
    const updateIds = recentUpdates.map(u => u.id);
    await db
      .update(loanUpdates)
      .set({ includedInDigestAt: now })
      .where(inArray(loanUpdates.id, updateIds));
  }
}

// Main job runner - called by cron endpoint
export async function runDigestJob(): Promise<{ processed: number; errors: string[] }> {
  const now = new Date();
  const errors: string[] = [];
  let processed = 0;

  console.log(`Running digest job at ${now.toISOString()}`);

  try {
    // PART 1: Process project-based configs
    const projectConfigs = await db
      .select({
        config: loanDigestConfigs,
        project: projects,
      })
      .from(loanDigestConfigs)
      .innerJoin(projects, eq(loanDigestConfigs.projectId, projects.id))
      .where(and(
        eq(loanDigestConfigs.isEnabled, true),
        eq(projects.status, 'active')
      ));

    for (const { config, project } of projectConfigs) {
      // Get recipients for this config
      const recipients = await db
        .select()
        .from(loanDigestRecipients)
        .where(and(
          eq(loanDigestRecipients.configId, config.id),
          eq(loanDigestRecipients.isActive, true)
        ));

      for (const recipient of recipients) {
        try {
          // Check if digest is due
          const state = await db
            .select()
            .from(digestState)
            .where(and(
              eq(digestState.configId, config.id),
              eq(digestState.recipientId, recipient.id)
            ));

          // If no state, this is first digest - send it
          // If nextDigestDueAt is past, send it
          const shouldSend = !state[0] || new Date(state[0].nextDigestDueAt) <= now;

          if (shouldSend) {
            await processDigest(config, recipient, project);
            processed++;
          }
        } catch (error: any) {
          console.error(`Error processing digest for recipient ${recipient.id}:`, error);
          errors.push(`Recipient ${recipient.id}: ${error.message}`);
        }
      }
    }

    // PART 2: Process deal-based configs (configs with dealId but no projectId)
    const dealConfigs = await db
      .select({
        config: loanDigestConfigs,
        deal: savedQuotes,
      })
      .from(loanDigestConfigs)
      .innerJoin(savedQuotes, eq(loanDigestConfigs.dealId, savedQuotes.id))
      .where(and(
        eq(loanDigestConfigs.isEnabled, true),
        isNull(loanDigestConfigs.projectId)
      ));

    for (const { config, deal } of dealConfigs) {
      // Get recipients for this config
      const recipients = await db
        .select()
        .from(loanDigestRecipients)
        .where(and(
          eq(loanDigestRecipients.configId, config.id),
          eq(loanDigestRecipients.isActive, true)
        ));

      for (const recipient of recipients) {
        try {
          // Check if digest is due
          const state = await db
            .select()
            .from(digestState)
            .where(and(
              eq(digestState.configId, config.id),
              eq(digestState.recipientId, recipient.id)
            ));

          const shouldSend = !state[0] || new Date(state[0].nextDigestDueAt) <= now;

          if (shouldSend) {
            // Create pseudo-project for template compatibility
            const pseudoProject = {
              id: deal.id,
              projectName: `${deal.customerFirstName} ${deal.customerLastName} - ${deal.propertyAddress}`.substring(0, 100),
              borrowerName: `${deal.customerFirstName} ${deal.customerLastName}`,
              borrowerEmail: deal.customerEmail,
              propertyAddress: deal.propertyAddress,
              status: deal.stage || 'new',
            } as any;

            await processDigestForDeal(config, recipient, deal, pseudoProject);
            processed++;
          }
        } catch (error: any) {
          console.error(`Error processing deal digest for recipient ${recipient.id}:`, error);
          errors.push(`Recipient ${recipient.id}: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.error('Error running digest job:', error);
    errors.push(error.message);
  }

  console.log(`Digest job complete. Processed: ${processed}, Errors: ${errors.length}`);
  return { processed, errors };
}

// Send an immediate test digest
export async function sendTestDigest(configId: number, recipientId: number): Promise<{ success: boolean; error?: string }> {
  try {
    // First get the config
    const [config] = await db
      .select()
      .from(loanDigestConfigs)
      .where(eq(loanDigestConfigs.id, configId));

    if (!config) {
      return { success: false, error: 'Config not found' };
    }

    const recipient = await db
      .select()
      .from(loanDigestRecipients)
      .where(eq(loanDigestRecipients.id, recipientId));

    if (!recipient[0]) {
      return { success: false, error: 'Recipient not found' };
    }

    // Handle deal-based configs (no linked project)
    if (config.dealId && !config.projectId) {
      // Get deal info
      const [deal] = await db
        .select()
        .from(savedQuotes)
        .where(eq(savedQuotes.id, config.dealId));
      
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }
      
      // Create a pseudo-project object for the digest template
      const pseudoProject = {
        id: deal.id,
        projectName: `${deal.customerFirstName} ${deal.customerLastName} - ${deal.propertyAddress}`.substring(0, 100),
        borrowerName: `${deal.customerFirstName} ${deal.customerLastName}`,
        borrowerEmail: deal.customerEmail,
        propertyAddress: deal.propertyAddress,
        status: deal.stage || 'new',
      } as any;
      
      await processDigestForDeal(config, recipient[0], deal, pseudoProject);
      return { success: true };
    }
    
    // Handle project-based configs (original behavior)
    if (config.projectId) {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, config.projectId));
      
      if (!project) {
        return { success: false, error: 'Project not found' };
      }
      
      await processDigest(config, recipient[0], project);
      return { success: true };
    }

    return { success: false, error: 'Config has no associated deal or project' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Process digest specifically for a deal (without linked project)
async function processDigestForDeal(
  config: LoanDigestConfig,
  recipient: LoanDigestRecipient,
  deal: any,
  pseudoProject: any
): Promise<void> {
  // Get outstanding documents for the deal
  const outstandingDocs = await getOutstandingDocumentsForDeal(deal.id);
  
  // Build the digest content (no recent updates since there's no project)
  const content: DigestContent = {
    project: pseudoProject,
    outstandingDocs,
    recentUpdates: [],
    hasContent: outstandingDocs.length > 0 || config.includeGeneralUpdates,
  };
  
  // Get recipient contact info
  let email = recipient.recipientEmail;
  let phone = recipient.recipientPhone;
  
  if (recipient.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, recipient.userId));
    if (user) {
      email = email || user.email;
      phone = phone || user.phone;
    }
  }
  
  const results: Array<{ method: string; success: boolean; address: string; error?: string }> = [];
  
  // Send the digest via email
  if ((recipient.deliveryMethod === 'email' || recipient.deliveryMethod === 'both') && email) {
    const result = await sendEmailDigest(recipient, content, email, config);
    results.push({ method: 'email', success: result.success, address: email, error: result.error });
  }
  
  // Send the digest via SMS
  if ((recipient.deliveryMethod === 'sms' || recipient.deliveryMethod === 'both') && phone) {
    const result = await sendSmsDigest(recipient, content, phone, config);
    results.push({ method: 'sms', success: result.success, address: phone, error: result.error });
  }
  
  // Log history for each delivery (using dealId instead of projectId)
  for (const result of results) {
    await db.insert(digestHistory).values({
      configId: config.id,
      recipientId: recipient.id,
      projectId: null, // No project for deal-based digest
      deliveryMethod: result.method,
      recipientAddress: result.address,
      documentsCount: outstandingDocs.length,
      updatesCount: 0,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
    });
  }

  // Update digest state for scheduling
  const now = new Date();
  const nextDueAt = calculateNextDueDate(
    config.frequency,
    config.customDays,
    now,
    config.timeOfDay
  );

  const existingState = await db
    .select()
    .from(digestState)
    .where(and(
      eq(digestState.configId, config.id),
      eq(digestState.recipientId, recipient.id)
    ));

  if (existingState[0]) {
    await db
      .update(digestState)
      .set({
        lastDigestSentAt: now,
        nextDigestDueAt: nextDueAt,
      })
      .where(eq(digestState.id, existingState[0].id));
  } else {
    await db.insert(digestState).values({
      configId: config.id,
      recipientId: recipient.id,
      lastDigestSentAt: now,
      nextDigestDueAt: nextDueAt,
    });
  }
}

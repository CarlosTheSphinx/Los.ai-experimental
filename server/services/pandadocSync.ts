import { db } from "../db";
import { esignEnvelopes, esignEvents } from "@shared/schema";
import { eq, inArray, and, isNull, lt } from "drizzle-orm";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function syncEnvelopeStatus(envelopeId: number): Promise<{
  envelopeId: number;
  oldStatus: string;
  newStatus: string;
  changed: boolean;
  projectCreated?: boolean;
  error?: string;
}> {
  const [envelope] = await db.select().from(esignEnvelopes)
    .where(eq(esignEnvelopes.id, envelopeId));

  if (!envelope) {
    return { envelopeId, oldStatus: 'unknown', newStatus: 'unknown', changed: false, error: 'Envelope not found' };
  }

  if (!envelope.externalDocumentId) {
    return { envelopeId, oldStatus: envelope.status || 'unknown', newStatus: envelope.status || 'unknown', changed: false, error: 'No external document ID' };
  }

  const pandadoc = await import('../esign/pandadoc');
  const oldStatus = envelope.status || 'unknown';

  try {
    const doc = await pandadoc.getDocumentStatus(envelope.externalDocumentId);
    const pandaStatus = doc.status;
    const newStatus = pandadoc.mapStatusToPandaDoc(pandaStatus);

    if (newStatus === oldStatus) {
      return { envelopeId, oldStatus, newStatus, changed: false };
    }

    const updates: any = { status: newStatus, updatedAt: new Date() };

    if (newStatus === 'completed' && oldStatus !== 'completed') {
      updates.completedAt = new Date();
    }
    if (newStatus === 'viewed' && !envelope.viewedAt) {
      updates.viewedAt = new Date();
    }

    await db.update(esignEnvelopes)
      .set(updates)
      .where(eq(esignEnvelopes.id, envelope.id));

    await db.insert(esignEvents).values({
      vendor: 'pandadoc',
      envelopeId: envelope.id,
      externalDocumentId: envelope.externalDocumentId,
      eventType: `poll.${pandaStatus}`,
      eventData: JSON.stringify({ source: 'backstop_poll', document: doc }),
      processed: true,
    });

    let projectCreated = false;

    if (newStatus === 'completed' && envelope.quoteId) {
      try {
        const { savedQuotes, projects, dealProperties } = await import('@shared/schema');
        const [quote] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, envelope.quoteId));
        if (quote) {
          const existingProjects = await db.select().from(projects)
            .where(eq(projects.quoteId, quote.id));

          if (existingProjects.length === 0) {
            const storage = (await import('../storage')).storage;
            const projectNumber = await storage.generateProjectNumber();
            const borrowerToken = (await import('uuid')).v4().replace(/-/g, '') + (await import('uuid')).v4().replace(/-/g, '');
            const loanData = (quote.loanData || {}) as Record<string, any>;

            const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;
            const loanAmount = loanData?.loanAmount
              ? Number(loanData.loanAmount)
              : isRTLQuote
                ? (Number(loanData?.asIsValue) || 0) + (Number(loanData?.rehabBudget) || 0)
                : 0;
            const rateStr = quote.interestRate || '';
            const rateNum = parseFloat(rateStr.replace('%', ''));
            const borrowerName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim();
            const borrowerEmail = quote.customerEmail || null;

            const project = await storage.createProject({
              userId: quote.userId || envelope.createdBy!,
              projectName: `${borrowerName} — ${quote.propertyAddress || envelope.documentName || 'New Loan'}`,
              projectNumber,
              loanAmount: loanAmount || null,
              interestRate: !isNaN(rateNum) ? rateNum : null,
              loanType: loanData?.loanType || loanData?.selectedLoanType || (isRTLQuote ? 'fix_and_flip' : 'dscr'),
              programId: quote.programId || null,
              propertyAddress: quote.propertyAddress || null,
              propertyType: loanData?.propertyType || null,
              borrowerName,
              borrowerEmail,
              status: 'active',
              currentStage: 'documentation',
              progressPercentage: 0,
              applicationDate: new Date(),
              targetCloseDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
              borrowerPortalToken: borrowerToken,
              borrowerPortalEnabled: true,
              quoteId: quote.id,
              notes: `Auto-created from PandaDoc status poll (Quote #${quote.id})`,
              metadata: {
                pandadocEnvelopeId: envelope.id,
                pandadocDocumentId: envelope.externalDocumentId,
                source: 'backstop_poll',
              },
            } as any);

            try {
              if (quote.propertyAddress) {
                await db.insert(dealProperties).values({
                  dealId: project.id,
                  address: quote.propertyAddress,
                  propertyType: loanData?.propertyType || null,
                  estimatedValue: loanData?.propertyValue ? Number(loanData.propertyValue) : (loanData?.asIsValue ? Number(loanData.asIsValue) : null),
                  isPrimary: true,
                  sortOrder: 0,
                });
                const additionalProps = (loanData?.additionalProperties || []) as Array<Record<string, any>>;
                for (let i = 0; i < additionalProps.length; i++) {
                  const ap = additionalProps[i];
                  if (ap.address) {
                    await db.insert(dealProperties).values({
                      dealId: project.id,
                      address: ap.address,
                      propertyType: ap.propertyType || null,
                      estimatedValue: ap.estimatedValue ? Number(ap.estimatedValue) : null,
                      isPrimary: false,
                      sortOrder: i + 1,
                    });
                  }
                }
              }
            } catch (propErr: any) {
              console.error(`[PandaDoc Poll] Deal properties error for project ${project.id}:`, propErr.message);
            }

            try {
              const { buildProjectPipelineFromProgram } = await import('./projectPipeline');
              const pipelineResult = await buildProjectPipelineFromProgram(project.id, quote.programId || null, quote.id);
              console.log(`[PandaDoc Poll] Pipeline created: ${pipelineResult.stagesCreated} stages, ${pipelineResult.tasksCreated} tasks, ${pipelineResult.documentsCreated} documents`);
            } catch (pipelineErr: any) {
              console.error(`[PandaDoc Poll] Pipeline creation error for project ${project.id}:`, pipelineErr);
            }

            await db.update(savedQuotes)
              .set({ stage: 'term-sheet-signed' })
              .where(eq(savedQuotes.id, quote.id));

            await storage.createProjectActivity({
              projectId: project.id,
              userId: quote.userId || envelope.createdBy!,
              activityType: 'project_created',
              activityDescription: `Loan project ${projectNumber} auto-created from PandaDoc status poll`,
              visibleToBorrower: true,
            });

            try {
              const { triggerWebhook } = await import('../utils/webhooks');
              await triggerWebhook(project.id, 'project_created', {
                project_number: projectNumber,
                source: 'pandadoc_poll',
                quote_id: quote.id,
              });
            } catch {}

            try {
              const { isDriveIntegrationEnabled, ensureProjectFolder } = await import('./googleDrive');
              const driveEnabled = await isDriveIntegrationEnabled();
              if (driveEnabled) {
                ensureProjectFolder(project.id).catch(() => {});
              }
            } catch {}

            projectCreated = true;
            console.log(`[PandaDoc Poll] Project ${projectNumber} created from envelope ${envelope.id}`);
          }
        }
      } catch (projErr: any) {
        console.error(`[PandaDoc Poll] Error creating project from envelope ${envelope.id}:`, projErr);
      }
    }

    console.log(`[PandaDoc Poll] Envelope ${envelope.id}: ${oldStatus} → ${newStatus}`);
    return { envelopeId, oldStatus, newStatus, changed: true, projectCreated };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    console.error(`[PandaDoc Poll] Error syncing envelope ${envelope.id}:`, errorMsg);

    await db.insert(esignEvents).values({
      vendor: 'pandadoc',
      envelopeId: envelope.id,
      externalDocumentId: envelope.externalDocumentId,
      eventType: 'poll.error',
      eventData: JSON.stringify({ source: 'backstop_poll', error: errorMsg }),
      processed: false,
      error: errorMsg,
    });

    return { envelopeId, oldStatus, newStatus: oldStatus, changed: false, error: errorMsg };
  }
}

export async function pollPendingEnvelopes(): Promise<{
  checked: number;
  updated: number;
  errors: number;
  results: Array<{ envelopeId: number; oldStatus: string; newStatus: string; changed: boolean; error?: string }>;
}> {
  const pendingStatuses = ['sent', 'viewed', 'pending', 'approved', 'pending_payment'];

  const envelopes = await db.select().from(esignEnvelopes)
    .where(
      and(
        inArray(esignEnvelopes.status, pendingStatuses),
        eq(esignEnvelopes.vendor, 'pandadoc')
      )
    );

  const results = [];
  let updated = 0;
  let errors = 0;

  for (const env of envelopes) {
    const result = await syncEnvelopeStatus(env.id);
    results.push(result);
    if (result.changed) updated++;
    if (result.error) errors++;

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[PandaDoc Poll] Checked ${envelopes.length} envelopes, ${updated} updated, ${errors} errors`);
  return { checked: envelopes.length, updated, errors, results };
}

export function startPolling() {
  if (pollTimer) return;
  console.log('[PandaDoc Poll] Starting backstop polling (every 5 minutes)');
  pollTimer = setInterval(async () => {
    try {
      await pollPendingEnvelopes();
    } catch (err) {
      console.error('[PandaDoc Poll] Polling cycle error:', err);
    }
  }, POLL_INTERVAL_MS);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[PandaDoc Poll] Stopped backstop polling');
  }
}

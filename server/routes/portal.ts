import type { Express, Request, Response } from 'express';
import type { RouteDeps } from './types';
import { eq, asc, and, ne, isNotNull, desc, gt, sql, or } from 'drizzle-orm';
import { dealDocuments, dealDocumentFiles, projectStages, loanPrograms, projectActivity, platformSettings, systemSettings, projects, messageThreads, messages, messageReads, users, borrowerProfiles, borrowerDocuments } from '@shared/schema';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { generateRandomToken } from '../auth';

async function getOnboardingConfig(db: any, configKey: string) {
  try {
    const [configSetting] = await db.select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, configKey));
    if (configSetting?.settingValue) {
      return JSON.parse(configSetting.settingValue);
    }
  } catch {
  }
  return null;
}

export function registerPortalRoutes(app: Express, deps: RouteDeps) {
  const { storage, db, objectStorageService } = deps;

  app.get('/api/portal/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const project = await storage.getProjectByToken(token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found or link is invalid' });
      }

      if (!project.borrowerPortalEnabled) {
        return res.status(403).json({ error: 'Borrower portal is disabled for this project' });
      }

      // Update last viewed timestamp
      await storage.updateProject(project.id, project.userId!, {
        borrowerPortalLastViewed: new Date(),
      });

      // Fetch program name
      let programName: string | null = null;
      if (project.programId) {
        const [program] = await db.select({ name: loanPrograms.name }).from(loanPrograms).where(eq(loanPrograms.id, project.programId));
        if (program) programName = program.name;
      }

      // Get stages with visible tasks only
      const stages = await storage.getStagesByProjectId(project.id);
      const tasks = await storage.getTasksByProjectId(project.id);
      const activity = await storage.getActivityByProjectId(project.id, true); // Only borrower-visible

      // Filter to borrower-visible stages and tasks
      const visibleStages = stages.filter(s => s.visibleToBorrower).map(stage => ({
        ...stage,
        tasks: tasks.filter(t => t.stageId === stage.id && t.visibleToBorrower),
      }));

      const portalConfig = await getOnboardingConfig(db, 'onboarding_borrower_config');

      // Return limited project data
      res.json({
        project: {
          id: project.id,
          programName,
          projectName: project.projectName,
          borrowerName: project.borrowerName,
          loanAmount: project.loanAmount,
          interestRate: project.interestRate,
          loanTermMonths: project.loanTermMonths,
          loanType: project.loanType,
          propertyAddress: project.propertyAddress,
          status: project.status,
          currentStage: project.currentStage,
          progressPercentage: project.progressPercentage,
          targetCloseDate: project.targetCloseDate,
          applicationDate: project.applicationDate,
          notes: project.notes,
        },
        stages: visibleStages,
        activity,
        portalConfig,
      });
    } catch (error) {
      console.error('Borrower portal error:', error);
      res.status(500).json({ error: 'Failed to load borrower portal' });
    }
  });

  // ==================== BORROWER DASHBOARD ENDPOINT ====================

  app.get('/api/portal/:token/dashboard', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const project = await storage.getProjectByToken(token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found or link is invalid' });
      }

      if (!project.borrowerPortalEnabled) {
        return res.status(403).json({ error: 'Borrower portal is disabled for this project' });
      }

      // Fetch program name
      let programName: string | null = null;
      if (project.programId) {
        const [program] = await db.select({ name: loanPrograms.name }).from(loanPrograms).where(eq(loanPrograms.id, project.programId));
        if (program) programName = program.name;
      }

      // Get all stages
      const stages = await db.select().from(projectStages)
        .where(eq(projectStages.projectId, project.id))
        .orderBy(asc(projectStages.stageOrder));

      // Get all documents with files
      const allDocs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, project.id))
        .orderBy(asc(dealDocuments.sortOrder));

      const docsWithFiles = await Promise.all(allDocs.map(async (doc) => {
        const files = await db.select().from(dealDocumentFiles)
          .where(eq(dealDocumentFiles.documentId, doc.id))
          .orderBy(asc(dealDocumentFiles.sortOrder));
        return { ...doc, files };
      }));

      // Filter documents visible to borrower
      const borrowerDocs = docsWithFiles.filter(doc =>
        doc.visibility === 'borrower' || doc.visibility === 'all'
      );

      // Get tasks visible to borrower
      const tasks = await storage.getTasksByProjectId(project.id);
      const borrowerTasks = tasks.filter(t => t.visibleToBorrower);

      // Calculate stats
      const totalDocuments = borrowerDocs.filter(d => d.isRequired).length;
      const approvedDocuments = borrowerDocs.filter(d => d.status === 'approved').length;
      const pendingDocuments = borrowerDocs.filter(d => d.status === 'pending').length;
      const rejectedDocuments = borrowerDocs.filter(d => d.status === 'rejected').length;
      const completionPercentage = totalDocuments > 0 ? Math.round((approvedDocuments / totalDocuments) * 100) : 0;

      res.json({
        deal: {
          id: project.id,
          dealName: project.projectName,
          borrowerName: project.borrowerName,
          propertyAddress: project.propertyAddress,
          status: project.status,
          currentStage: project.currentStage,
          progressPercentage: project.progressPercentage,
          loanAmount: project.loanAmount,
          programName,
        },
        stages: stages.map(s => ({
          id: s.id,
          stageName: s.stageName,
          stageKey: s.stageKey,
          stageOrder: s.stageOrder,
          status: s.status,
        })),
        documents: borrowerDocs.map(doc => ({
          id: doc.id,
          documentName: doc.documentName,
          documentCategory: doc.documentCategory,
          documentDescription: doc.documentDescription,
          status: doc.status,
          isRequired: doc.isRequired,
          assignedTo: doc.assignedTo,
          aiReviewStatus: doc.aiReviewStatus,
          aiReviewReason: doc.aiReviewReason,
          uploadedAt: doc.uploadedAt,
          reviewedAt: doc.reviewedAt,
          files: doc.files.map(f => ({
            id: f.id,
            fileName: f.fileName,
            fileSize: f.fileSize,
            uploadedAt: f.uploadedAt,
          })),
        })),
        tasks: borrowerTasks.map(t => ({
          id: t.id,
          taskName: t.taskTitle || t.taskName || '',
          taskDescription: t.taskDescription,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          borrowerActionRequired: t.borrowerActionRequired,
        })),
        stats: {
          totalDocuments,
          approvedDocuments,
          pendingDocuments,
          rejectedDocuments,
          completionPercentage,
        },
      });
    } catch (error) {
      console.error('Borrower dashboard error:', error);
      res.status(500).json({ error: 'Failed to load borrower dashboard' });
    }
  });

  // ==================== BORROWER PORTAL DOCUMENT ENDPOINTS ====================

  app.get('/api/portal/:token/documents', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const docs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, project.id))
        .orderBy(asc(dealDocuments.sortOrder));

      const stages = await db.select().from(projectStages)
        .where(eq(projectStages.projectId, project.id))
        .orderBy(asc(projectStages.stageOrder));

      const docsWithFiles = await Promise.all(docs.map(async (doc) => {
        const files = await db.select().from(dealDocumentFiles)
          .where(eq(dealDocumentFiles.documentId, doc.id))
          .orderBy(asc(dealDocumentFiles.sortOrder));
        return { ...doc, files };
      }));

      const visibleDocs = docsWithFiles.filter(doc =>
        doc.visibility === 'all' || doc.visibility === 'borrower' || !doc.visibility
      );

      res.json({ documents: visibleDocs, stages });
    } catch (error) {
      console.error('Portal documents error:', error);
      res.status(500).json({ error: 'Failed to load documents' });
    }
  });

  app.post('/api/portal/:token/borrower-documents/upload-url', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { name, size, contentType } = req.body;

      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });
      if (!name) return res.status(400).json({ error: 'File name is required' });

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const isLocal = uploadURL.startsWith('__local__:');
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL: isLocal ? `/api/portal/${token}/borrower-documents/upload-direct` : uploadURL,
        objectPath,
        useDirectUpload: isLocal,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error('Portal borrower doc upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  const borrowerDocMulter = multer({ dest: path.join(process.cwd(), 'uploads', 'temp') });
  app.post('/api/portal/:token/borrower-documents/upload-direct', borrowerDocMulter.single('file'), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      if (!req.file) return res.status(400).json({ error: 'No file provided' });

      const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const objectId = randomUUID();
      const destPath = path.join(uploadsDir, objectId);
      fs.renameSync(req.file.path, destPath);
      fs.writeFileSync(destPath + '.meta', JSON.stringify({
        name: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      }));

      res.json({ objectPath: `uploads/${objectId}` });
    } catch (error) {
      console.error('Portal borrower doc direct upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.post('/api/portal/:token/documents/:docId/upload-url', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const docId = parseInt(req.params.docId);
      const { name, size, contentType } = req.body;

      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const [doc] = await db.select().from(dealDocuments)
        .where(and(eq(dealDocuments.id, docId), eq(dealDocuments.dealId, project.id)));
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      if (!name) return res.status(400).json({ error: 'File name is required' });

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const isLocal = uploadURL.startsWith('__local__:');
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL: isLocal ? `/api/portal/${token}/documents/${docId}/upload-direct` : uploadURL,
        objectPath,
        docId,
        useDirectUpload: isLocal,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error('Portal upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  const portalMulterUpload = multer({ dest: path.join(process.cwd(), 'uploads', 'temp') });
  app.post('/api/portal/:token/documents/:docId/upload-direct', portalMulterUpload.single('file'), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      if (!req.file) return res.status(400).json({ error: 'No file provided' });

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

      res.json({
        objectPath: `/objects/uploads/${objectId}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error('Portal direct upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  app.post('/api/portal/:token/documents/:docId/upload-complete', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const docId = parseInt(req.params.docId);
      const { objectPath, fileName, fileSize, mimeType } = req.body;

      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const [doc] = await db.select().from(dealDocuments)
        .where(and(eq(dealDocuments.id, docId), eq(dealDocuments.dealId, project.id)));
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      if (!objectPath) return res.status(400).json({ error: 'Object path is required' });

      const existingFiles = await db.select().from(dealDocumentFiles)
        .where(eq(dealDocumentFiles.documentId, docId));
      const nextSortOrder = existingFiles.length;

      const [newFile] = await db.insert(dealDocumentFiles).values({
        documentId: docId,
        filePath: objectPath,
        fileName: fileName || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        uploadedAt: new Date(),
        sortOrder: nextSortOrder,
      }).returning();

      const [updated] = await db.update(dealDocuments)
        .set({
          filePath: objectPath,
          fileName: fileName || null,
          fileSize: fileSize || null,
          mimeType: mimeType || null,
          status: 'uploaded',
          uploadedAt: new Date(),
        })
        .where(eq(dealDocuments.id, docId))
        .returning();

      await db.insert(projectActivity).values({
        projectId: project.id,
        activityType: 'document_uploaded',
        activityDescription: `Borrower uploaded: ${updated?.documentName || fileName || 'Document'}`,
        visibleToBorrower: true,
      });

      try {
        const { isDriveIntegrationEnabled, syncDealDocumentToDrive } = await import('../services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled && updated && newFile) {
          syncDealDocumentToDrive(updated.id, newFile.id).catch((err: any) => {
            console.error(`Drive sync failed for portal doc ${updated.id}:`, err.message);
          });
        }
      } catch (driveErr: any) {
        console.error('Drive sync check error:', driveErr.message);
      }

      try {
        const [settings] = await db.select().from(platformSettings).limit(1);
        if (settings?.autoRunPipeline) {
          const { startPipeline } = await import('../agents/orchestrator');
          startPipeline(project.id, null, "auto_upload").catch(err => {
            console.error(`Auto-trigger pipeline failed for portal project ${project.id}:`, err.message);
          });
        }
      } catch (triggerErr: any) {
        console.error('Portal auto-trigger check error:', triggerErr.message);
      }

      // Auto-trigger AI document review based on lender config
      try {
        const { onDocumentUploaded } = await import('../services/documentReviewOrchestrator');
        onDocumentUploaded({
          documentId: docId,
          projectId: project.id,
          uploaderType: 'borrower',
        }).catch(err => {
          console.error(`Auto doc review trigger failed for doc ${docId}:`, err.message);
        });
      } catch (reviewErr: any) {
        console.error('Doc review orchestrator error:', reviewErr.message);
      }

      try {
        const borrowerEmail = project.borrowerEmail?.toLowerCase();
        if (borrowerEmail && objectPath) {
          let [profile] = await db.select().from(borrowerProfiles).where(eq(borrowerProfiles.email, borrowerEmail));
          if (!profile) {
            const [inserted] = await db.insert(borrowerProfiles).values({ email: borrowerEmail }).returning();
            profile = inserted;
          }
          const docName = fileName || updated?.documentName || 'Document';
          const dealLabel = project.loanNumber || project.propertyAddress || `Deal #${project.id}`;
          const existingVaultDoc = await db.select().from(borrowerDocuments)
            .where(and(
              eq(borrowerDocuments.borrowerProfileId, profile.id),
              eq(borrowerDocuments.sourceDealId, project.id),
              eq(borrowerDocuments.fileName, docName),
              eq(borrowerDocuments.isActive, true)
            ));
          if (existingVaultDoc.length) {
            await db.update(borrowerDocuments)
              .set({
                storagePath: objectPath,
                fileType: mimeType || null,
                fileSize: fileSize ? Number(fileSize) : null,
                updatedAt: new Date(),
              })
              .where(eq(borrowerDocuments.id, existingVaultDoc[0].id));
          } else {
            await db.insert(borrowerDocuments).values({
              borrowerProfileId: profile.id,
              fileName: docName,
              fileType: mimeType || null,
              fileSize: fileSize ? Number(fileSize) : null,
              storagePath: objectPath,
              category: updated?.documentCategory || 'general',
              documentClassification: 'standalone',
              sourceDealId: project.id,
              sourceDealName: dealLabel,
            });
          }
        }
      } catch (syncErr: any) {
        console.error('Auto-sync to borrower vault error (portal):', syncErr.message);
      }

      res.json({ document: updated, file: newFile });
    } catch (error) {
      console.error('Portal upload complete error:', error);
      res.status(500).json({ error: 'Failed to complete upload' });
    }
  });

  // Download a specific document file via portal token (borrower)
  app.get('/api/portal/:token/document-files/:fileId/download', async (req: Request, res: Response) => {
    try {
      const { token, fileId } = req.params;
      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const fId = parseInt(fileId);
      const [file] = await db.select().from(dealDocumentFiles).where(eq(dealDocumentFiles.id, fId)).limit(1);
      if (!file || !file.filePath) return res.status(404).json({ error: 'File not found' });

      // Verify file belongs to a document for this project
      const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, file.documentId)).limit(1);
      if (!doc || doc.dealId !== project.id) return res.status(403).json({ error: 'Access denied' });

      const objectFile = await objectStorageService.getObjectEntityFile(file.filePath);
      res.set('X-Frame-Options', 'SAMEORIGIN');
      res.removeHeader('Content-Security-Policy');
      const safeFileName = file.fileName ? file.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/\\/g, '_').replace(/"/g, "'") : null;
      if (req.query.download === 'true' && safeFileName) {
        res.set('Content-Disposition', `attachment; filename="${safeFileName}"`);
      } else {
        res.set('Content-Disposition', `inline${safeFileName ? `; filename="${safeFileName}"` : ''}`);
      }
      if (file.mimeType) {
        res.set('Content-Type', file.mimeType);
      }
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error('Portal file download error:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // ==================== BROKER PORTAL ENDPOINT ====================

  app.get('/api/broker-portal/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const project = await storage.getProjectByBrokerToken(token);
      if (!project) {
        return res.status(404).json({ error: 'Deal not found or link is invalid' });
      }

      if (!project.brokerPortalEnabled) {
        return res.status(403).json({ error: 'Broker portal is disabled for this deal' });
      }

      // Fetch program name
      let programName: string | null = null;
      if (project.programId) {
        const [program] = await db.select({ name: loanPrograms.name }).from(loanPrograms).where(eq(loanPrograms.id, project.programId));
        if (program) programName = program.name;
      }

      // Get all stages
      const stages = await db.select().from(projectStages)
        .where(eq(projectStages.projectId, project.id))
        .orderBy(asc(projectStages.stageOrder));

      // Get all documents with files
      const allDocs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, project.id))
        .orderBy(asc(dealDocuments.sortOrder));

      const docsWithFiles = await Promise.all(allDocs.map(async (doc) => {
        const files = await db.select().from(dealDocumentFiles)
          .where(eq(dealDocumentFiles.documentId, doc.id))
          .orderBy(asc(dealDocumentFiles.sortOrder));
        return { ...doc, files };
      }));

      const onboardingConfig = await getOnboardingConfig(db, 'onboarding_broker_config');

      // Filter documents visible to broker
      const brokerDocs = docsWithFiles.filter(doc =>
        doc.visibility === 'broker' || doc.visibility === 'all' || !doc.visibility
      );

      res.json({
        deal: {
          id: project.id,
          programName,
          dealName: project.projectName,
          borrowerName: project.borrowerName,
          borrowerEmail: project.borrowerEmail,
          borrowerPhone: project.borrowerPhone,
          propertyAddress: project.propertyAddress,
          status: project.status,
          currentStage: project.currentStage,
          progressPercentage: project.progressPercentage,
          loanAmount: project.loanAmount,
          interestRate: project.interestRate,
          loanTermMonths: project.loanTermMonths,
          loanType: project.loanType,
          targetCloseDate: project.targetCloseDate,
          applicationDate: project.applicationDate,
        },
        stages: stages.map(s => ({
          id: s.id,
          stageName: s.stageName,
          stageKey: s.stageKey,
          stageOrder: s.stageOrder,
          status: s.status,
        })),
        documents: brokerDocs.map(doc => ({
          id: doc.id,
          documentName: doc.documentName,
          documentCategory: doc.documentCategory,
          documentDescription: doc.documentDescription,
          status: doc.status,
          isRequired: doc.isRequired,
          assignedTo: doc.assignedTo,
          uploadedAt: doc.uploadedAt,
          reviewedAt: doc.reviewedAt,
          files: doc.files.map(f => ({
            id: f.id,
            fileName: f.fileName,
            fileSize: f.fileSize,
            uploadedAt: f.uploadedAt,
          })),
        })),
        onboardingConfig,
      });
    } catch (error) {
      console.error('Broker portal error:', error);
      res.status(500).json({ error: 'Failed to load broker portal' });
    }
  });

  // ==================== BORROWER RELATED DEALS ====================

  app.get('/api/portal/:token/related-deals', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Deal not found' });

      let relatedDeals: any[] = [];
      if (project.borrowerEmail) {
        const allDeals = await db.select({
          id: projects.id,
          projectName: projects.projectName,
          propertyAddress: projects.propertyAddress,
          loanAmount: projects.loanAmount,
          loanType: projects.loanType,
          status: projects.status,
          currentStage: projects.currentStage,
          borrowerPortalToken: projects.borrowerPortalToken,
          borrowerPortalEnabled: projects.borrowerPortalEnabled,
          programId: projects.programId,
        }).from(projects)
          .where(and(
            eq(projects.borrowerEmail, project.borrowerEmail),
            isNotNull(projects.borrowerPortalToken),
            eq(projects.borrowerPortalEnabled, true),
          ))
          .orderBy(asc(projects.id));

        const dealsWithPrograms = await Promise.all(allDeals.map(async (deal) => {
          let programName: string | null = null;
          if (deal.programId) {
            const [program] = await db.select({ name: loanPrograms.name }).from(loanPrograms).where(eq(loanPrograms.id, deal.programId));
            if (program) programName = program.name;
          }
          return {
            id: deal.id,
            dealName: deal.projectName,
            propertyAddress: deal.propertyAddress,
            loanAmount: deal.loanAmount,
            loanType: deal.loanType,
            status: deal.status,
            currentStage: deal.currentStage,
            portalToken: deal.borrowerPortalToken,
            programName,
            isCurrent: deal.borrowerPortalToken === token,
          };
        }));
        relatedDeals = dealsWithPrograms;
      } else {
        relatedDeals = [{
          id: project.id,
          dealName: project.projectName,
          propertyAddress: project.propertyAddress,
          loanAmount: project.loanAmount,
          loanType: project.loanType,
          status: project.status,
          currentStage: project.currentStage,
          portalToken: token,
          programName: null,
          isCurrent: true,
        }];
      }

      res.json({ deals: relatedDeals });
    } catch (error) {
      console.error('Related deals error:', error);
      res.status(500).json({ error: 'Failed to load related deals' });
    }
  });

  // ==================== BROKER RELATED DEALS ====================

  app.get('/api/broker-portal/:token/related-deals', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByBrokerToken(token);
      if (!project) return res.status(404).json({ error: 'Deal not found' });
      if (!project.brokerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const allDeals = await db.select({
        id: projects.id,
        projectName: projects.projectName,
        propertyAddress: projects.propertyAddress,
        loanAmount: projects.loanAmount,
        loanType: projects.loanType,
        status: projects.status,
        currentStage: projects.currentStage,
        brokerPortalToken: projects.brokerPortalToken,
        brokerPortalEnabled: projects.brokerPortalEnabled,
        programId: projects.programId,
        userId: projects.userId,
      }).from(projects)
        .where(and(
          eq(projects.userId, project.userId!),
          isNotNull(projects.brokerPortalToken),
          eq(projects.brokerPortalEnabled, true),
        ))
        .orderBy(asc(projects.id));

      const dealsWithPrograms = await Promise.all(allDeals.map(async (deal) => {
        let programName: string | null = null;
        if (deal.programId) {
          const [program] = await db.select({ name: loanPrograms.name }).from(loanPrograms).where(eq(loanPrograms.id, deal.programId));
          if (program) programName = program.name;
        }
        return {
          id: deal.id,
          dealName: deal.projectName,
          propertyAddress: deal.propertyAddress,
          loanAmount: deal.loanAmount,
          loanType: deal.loanType,
          status: deal.status,
          currentStage: deal.currentStage,
          portalToken: deal.brokerPortalToken,
          programName,
          isCurrent: deal.brokerPortalToken === token,
        };
      }));

      res.json({ deals: dealsWithPrograms });
    } catch (error) {
      console.error('Broker related deals error:', error);
      res.status(500).json({ error: 'Failed to load related deals' });
    }
  });

  // ==================== BROKER PORTAL DOCUMENT UPLOAD ====================

  app.post('/api/broker-portal/:token/documents/:docId/upload-url', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const docId = parseInt(req.params.docId);
      const { name, size, contentType } = req.body;

      const project = await storage.getProjectByBrokerToken(token);
      if (!project) return res.status(404).json({ error: 'Deal not found' });
      if (!project.brokerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const [doc] = await db.select().from(dealDocuments)
        .where(and(eq(dealDocuments.id, docId), eq(dealDocuments.dealId, project.id)));
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (!name) return res.status(400).json({ error: 'File name is required' });

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const isLocal = uploadURL.startsWith('__local__:');
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL: isLocal ? `/api/broker-portal/${token}/documents/${docId}/upload-direct` : uploadURL,
        objectPath,
        docId,
        useDirectUpload: isLocal,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error('Broker portal upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  const brokerMulterUpload = multer({ dest: path.join(process.cwd(), 'uploads', 'temp') });
  app.post('/api/broker-portal/:token/documents/:docId/upload-direct', brokerMulterUpload.single('file'), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByBrokerToken(token);
      if (!project) return res.status(404).json({ error: 'Deal not found' });
      if (!project.brokerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      if (!req.file) return res.status(400).json({ error: 'No file provided' });

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

      res.json({
        objectPath: `/objects/uploads/${objectId}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error('Broker portal direct upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  app.post('/api/broker-portal/:token/documents/:docId/upload-complete', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const docId = parseInt(req.params.docId);
      const { objectPath, fileName, fileSize, mimeType } = req.body;

      const project = await storage.getProjectByBrokerToken(token);
      if (!project) return res.status(404).json({ error: 'Deal not found' });
      if (!project.brokerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const [doc] = await db.select().from(dealDocuments)
        .where(and(eq(dealDocuments.id, docId), eq(dealDocuments.dealId, project.id)));
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      if (!objectPath) return res.status(400).json({ error: 'Object path is required' });

      const existingFiles = await db.select().from(dealDocumentFiles)
        .where(eq(dealDocumentFiles.documentId, docId));
      const nextSortOrder = existingFiles.length;

      const [newFile] = await db.insert(dealDocumentFiles).values({
        documentId: docId,
        filePath: objectPath,
        fileName: fileName || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        uploadedAt: new Date(),
        sortOrder: nextSortOrder,
      }).returning();

      const [updated] = await db.update(dealDocuments)
        .set({
          filePath: objectPath,
          fileName: fileName || null,
          fileSize: fileSize || null,
          mimeType: mimeType || null,
          status: 'uploaded',
          uploadedAt: new Date(),
        })
        .where(eq(dealDocuments.id, docId))
        .returning();

      await db.insert(projectActivity).values({
        projectId: project.id,
        activityType: 'document_uploaded',
        activityDescription: `Broker uploaded: ${updated?.documentName || fileName || 'Document'}`,
        visibleToBorrower: true,
      });

      try {
        const { isDriveIntegrationEnabled, syncDealDocumentToDrive } = await import('../services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled && updated && newFile) {
          syncDealDocumentToDrive(updated.id, newFile.id).catch((err: any) => {
            console.error(`Drive sync failed for broker portal doc ${updated.id}:`, err.message);
          });
        }
      } catch (driveErr: any) {
        console.error('Drive sync check error:', driveErr.message);
      }

      // Auto-trigger AI document review based on lender config
      try {
        const { onDocumentUploaded } = await import('../services/documentReviewOrchestrator');
        onDocumentUploaded({
          documentId: docId,
          projectId: project.id,
          uploaderType: 'broker',
        }).catch(err => {
          console.error(`Auto doc review trigger failed for broker doc ${docId}:`, err.message);
        });
      } catch (reviewErr: any) {
        console.error('Doc review orchestrator error:', reviewErr.message);
      }

      try {
        const borrowerEmail = project.borrowerEmail?.toLowerCase();
        if (borrowerEmail && objectPath) {
          let [profile] = await db.select().from(borrowerProfiles).where(eq(borrowerProfiles.email, borrowerEmail));
          if (!profile) {
            const [inserted] = await db.insert(borrowerProfiles).values({ email: borrowerEmail }).returning();
            profile = inserted;
          }
          const docName = fileName || updated?.documentName || 'Document';
          const dealLabel = project.loanNumber || project.propertyAddress || `Deal #${project.id}`;
          const existingVaultDoc = await db.select().from(borrowerDocuments)
            .where(and(
              eq(borrowerDocuments.borrowerProfileId, profile.id),
              eq(borrowerDocuments.sourceDealId, project.id),
              eq(borrowerDocuments.fileName, docName),
              eq(borrowerDocuments.isActive, true)
            ));
          if (existingVaultDoc.length) {
            await db.update(borrowerDocuments)
              .set({
                storagePath: objectPath,
                fileType: mimeType || null,
                fileSize: fileSize ? Number(fileSize) : null,
                updatedAt: new Date(),
              })
              .where(eq(borrowerDocuments.id, existingVaultDoc[0].id));
          } else {
            await db.insert(borrowerDocuments).values({
              borrowerProfileId: profile.id,
              fileName: docName,
              fileType: mimeType || null,
              fileSize: fileSize ? Number(fileSize) : null,
              storagePath: objectPath,
              category: updated?.documentCategory || 'general',
              documentClassification: 'standalone',
              sourceDealId: project.id,
              sourceDealName: dealLabel,
            });
          }
        }
      } catch (syncErr: any) {
        console.error('Broker portal auto-sync to borrower vault error:', syncErr.message);
      }

      res.json({ document: updated, file: newFile });
    } catch (error) {
      console.error('Broker portal upload complete error:', error);
      res.status(500).json({ error: 'Failed to complete upload' });
    }
  });

  app.get('/api/broker-portal/:token/documents', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByBrokerToken(token);
      if (!project) return res.status(404).json({ error: 'Deal not found' });
      if (!project.brokerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const docs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, project.id))
        .orderBy(asc(dealDocuments.sortOrder));

      const stages = await db.select().from(projectStages)
        .where(eq(projectStages.projectId, project.id))
        .orderBy(asc(projectStages.stageOrder));

      const docsWithFiles = await Promise.all(docs.map(async (doc) => {
        const files = await db.select().from(dealDocumentFiles)
          .where(eq(dealDocumentFiles.documentId, doc.id))
          .orderBy(asc(dealDocumentFiles.sortOrder));
        return { ...doc, files };
      }));

      const brokerDocs = docsWithFiles.filter(doc =>
        doc.visibility === 'broker' || doc.visibility === 'all' || !doc.visibility
      );

      res.json({ documents: brokerDocs, stages });
    } catch (error) {
      console.error('Broker portal documents error:', error);
      res.status(500).json({ error: 'Failed to load documents' });
    }
  });

  // ==================== BORROWER PORTAL MESSAGING ====================

  async function getBorrowerDealIds(token: string): Promise<{ project: any; dealIds: number[] } | null> {
    const project = await storage.getProjectByToken(token);
    if (!project) return null;

    let dealIds: number[] = [project.id];
    if (project.borrowerEmail) {
      const relatedDeals = await db.select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.borrowerEmail, project.borrowerEmail),
          isNotNull(projects.borrowerPortalToken),
          eq(projects.borrowerPortalEnabled, true),
        ));
      dealIds = relatedDeals.map(d => d.id);
    }
    return { project, dealIds };
  }

  async function getPortalReadTimestamp(threadId: number): Promise<Date | null> {
    const key = 'portal_read_' + threadId;
    const rows = await db.select().from(systemSettings)
      .where(eq(systemSettings.settingKey, key)).limit(1);
    if (rows[0]?.settingValue) return new Date(rows[0].settingValue);
    return null;
  }

  async function setPortalReadTimestamp(threadId: number): Promise<void> {
    const key = 'portal_read_' + threadId;
    const now = new Date().toISOString();
    const existing = await db.select().from(systemSettings)
      .where(eq(systemSettings.settingKey, key)).limit(1);
    if (existing[0]) {
      await db.update(systemSettings).set({ settingValue: now })
        .where(eq(systemSettings.settingKey, key));
    } else {
      await db.insert(systemSettings).values({ settingKey: key, settingValue: now });
    }
  }

  app.get('/api/portal/:token/messages/unread-count', async (req: Request, res: Response) => {
    try {
      const result = await getBorrowerDealIds(req.params.token);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const { dealIds } = result;
      if (dealIds.length === 0) return res.json({ unreadCount: 0 });

      let totalUnread = 0;
      for (const dealId of dealIds) {
        const threads = await db.select({ id: messageThreads.id })
          .from(messageThreads)
          .where(eq(messageThreads.dealId, dealId));

        for (const thread of threads) {
          const lastRead = await getPortalReadTimestamp(thread.id);

          if (lastRead) {
            const unread = await db.select({ count: sql<number>`count(*)::int` })
              .from(messages)
              .where(and(
                eq(messages.threadId, thread.id),
                gt(messages.createdAt, lastRead),
                ne(messages.senderRole, 'user')
              ));
            totalUnread += unread[0]?.count || 0;
          } else {
            const all = await db.select({ count: sql<number>`count(*)::int` })
              .from(messages)
              .where(and(eq(messages.threadId, thread.id), ne(messages.senderRole, 'user')));
            totalUnread += all[0]?.count || 0;
          }
        }
      }

      res.json({ unreadCount: totalUnread });
    } catch (error) {
      console.error('Portal unread count error:', error);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  app.get('/api/portal/:token/messages/threads', async (req: Request, res: Response) => {
    try {
      const result = await getBorrowerDealIds(req.params.token);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const { dealIds } = result;
      if (dealIds.length === 0) return res.json({ threads: [] });

      const allThreads = [];
      for (const dealId of dealIds) {
        const threads = await db.select()
          .from(messageThreads)
          .where(eq(messageThreads.dealId, dealId))
          .orderBy(desc(messageThreads.lastMessageAt));
        allThreads.push(...threads);
      }

      allThreads.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());

      const threadsWithContext = await Promise.all(allThreads.map(async (thread) => {
        let dealName = null;
        let dealIdentifier = null;
        if (thread.dealId) {
          const deal = await db.select({
            projectName: projects.projectName,
            loanNumber: projects.loanNumber,
          }).from(projects).where(eq(projects.id, thread.dealId)).limit(1);
          if (deal[0]) {
            dealName = deal[0].projectName;
            dealIdentifier = deal[0].loanNumber || `DEAL-${thread.dealId}`;
          }
        }

        const lastMsg = await db.select({ body: messages.body, createdAt: messages.createdAt, senderRole: messages.senderRole })
          .from(messages)
          .where(eq(messages.threadId, thread.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        let unreadCount = 0;
        const lastRead = await getPortalReadTimestamp(thread.id);

        if (lastRead) {
          const unread = await db.select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(and(eq(messages.threadId, thread.id), gt(messages.createdAt, lastRead), ne(messages.senderRole, 'user')));
          unreadCount = unread[0]?.count || 0;
        } else {
          const all = await db.select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(and(eq(messages.threadId, thread.id), ne(messages.senderRole, 'user')));
          unreadCount = all[0]?.count || 0;
        }

        return {
          id: thread.id,
          dealId: thread.dealId,
          subject: thread.subject,
          isClosed: thread.isClosed,
          lastMessageAt: thread.lastMessageAt instanceof Date ? thread.lastMessageAt.toISOString() : thread.lastMessageAt,
          createdAt: thread.createdAt instanceof Date ? thread.createdAt.toISOString() : thread.createdAt,
          dealName,
          dealIdentifier,
          lastMessagePreview: lastMsg[0]?.body?.substring(0, 100) || null,
          lastMessageSenderRole: lastMsg[0]?.senderRole || null,
          lastMessageCreatedAt: lastMsg[0]?.createdAt instanceof Date ? lastMsg[0].createdAt.toISOString() : lastMsg[0]?.createdAt || null,
          unreadCount,
        };
      }));

      res.json({ threads: threadsWithContext });
    } catch (error) {
      console.error('Portal threads error:', error);
      res.status(500).json({ error: 'Failed to get threads' });
    }
  });

  app.get('/api/portal/:token/messages/threads/:threadId', async (req: Request, res: Response) => {
    try {
      const result = await getBorrowerDealIds(req.params.token);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const threadId = parseInt(req.params.threadId);
      const { dealIds } = result;

      const thread = await db.select()
        .from(messageThreads)
        .where(eq(messageThreads.id, threadId))
        .limit(1);

      if (!thread[0] || !thread[0].dealId || !dealIds.includes(thread[0].dealId)) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const threadMessages = await db.select()
        .from(messages)
        .where(eq(messages.threadId, threadId))
        .orderBy(messages.createdAt)
        .limit(500);

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
        return { ...serialized, senderName: msg.senderRole === 'user' ? 'You' : 'System' };
      }));

      const threadSerialized = {
        ...thread[0],
        createdAt: thread[0].createdAt instanceof Date ? thread[0].createdAt.toISOString() : thread[0].createdAt,
        lastMessageAt: (thread[0] as any).lastMessageAt instanceof Date ? (thread[0] as any).lastMessageAt.toISOString() : (thread[0] as any).lastMessageAt,
      };
      res.json({ thread: threadSerialized, messages: messagesWithSenders });
    } catch (error) {
      console.error('Portal thread detail error:', error);
      res.status(500).json({ error: 'Failed to get thread' });
    }
  });

  app.post('/api/portal/:token/messages/threads/:threadId/messages', async (req: Request, res: Response) => {
    try {
      const result = await getBorrowerDealIds(req.params.token);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const threadId = parseInt(req.params.threadId);
      const { dealIds } = result;
      const { body } = req.body;

      if (!body || typeof body !== 'string') {
        return res.status(400).json({ error: 'body is required' });
      }

      const thread = await db.select()
        .from(messageThreads)
        .where(eq(messageThreads.id, threadId))
        .limit(1);

      if (!thread[0] || !thread[0].dealId || !dealIds.includes(thread[0].dealId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const newMessage = await db.insert(messages).values({
        threadId,
        senderId: thread[0].userId,
        senderRole: 'user',
        type: 'message',
        body,
        meta: null,
      }).returning();

      await db.update(messageThreads)
        .set({ lastMessageAt: new Date() })
        .where(eq(messageThreads.id, threadId));

      res.json({ message: {
        ...newMessage[0],
        createdAt: newMessage[0].createdAt instanceof Date ? newMessage[0].createdAt.toISOString() : newMessage[0].createdAt,
        readAt: newMessage[0].readAt instanceof Date ? newMessage[0].readAt.toISOString() : newMessage[0].readAt,
        senderName: 'You',
      } });
    } catch (error) {
      console.error('Portal send message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.post('/api/portal/:token/messages/threads', async (req: Request, res: Response) => {
    try {
      const result = await getBorrowerDealIds(req.params.token);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const { project, dealIds } = result;
      const { dealId, subject, body } = req.body;

      if (!dealId) return res.status(400).json({ error: 'dealId is required' });
      if (!body || typeof body !== 'string') return res.status(400).json({ error: 'body is required' });
      if (!dealIds.includes(parseInt(dealId))) return res.status(403).json({ error: 'Not authorized for this deal' });

      const parsedDealId = parseInt(dealId);

      const existingThread = await db.select()
        .from(messageThreads)
        .where(and(
          eq(messageThreads.dealId, parsedDealId),
          eq(messageThreads.userId, project.userId || 0),
        )).limit(1);

      let thread;
      if (existingThread[0]) {
        thread = existingThread[0];
      } else {
        const [newThread] = await db.insert(messageThreads).values({
          dealId: parsedDealId,
          userId: project.userId || 0,
          createdBy: project.userId || null,
          subject: subject || null,
        }).returning();
        thread = newThread;
      }

      const [newMessage] = await db.insert(messages).values({
        threadId: thread.id,
        senderId: project.userId || null,
        senderRole: 'user',
        type: 'message',
        body,
        meta: null,
      }).returning();

      await db.update(messageThreads)
        .set({ lastMessageAt: new Date() })
        .where(eq(messageThreads.id, thread.id));

      const threadSerialized = {
        ...thread,
        createdAt: thread.createdAt instanceof Date ? thread.createdAt.toISOString() : thread.createdAt,
        lastMessageAt: (thread as any).lastMessageAt instanceof Date ? (thread as any).lastMessageAt.toISOString() : (thread as any).lastMessageAt,
      };
      res.json({ thread: threadSerialized, message: {
        ...newMessage,
        createdAt: newMessage.createdAt instanceof Date ? newMessage.createdAt.toISOString() : newMessage.createdAt,
        readAt: newMessage.readAt instanceof Date ? newMessage.readAt.toISOString() : newMessage.readAt,
        senderName: 'You',
      } });
    } catch (error) {
      console.error('Portal create thread error:', error);
      res.status(500).json({ error: 'Failed to create thread' });
    }
  });

  app.post('/api/portal/:token/messages/threads/:threadId/read', async (req: Request, res: Response) => {
    try {
      const result = await getBorrowerDealIds(req.params.token);
      if (!result) return res.status(404).json({ error: 'Not found' });

      const threadId = parseInt(req.params.threadId);
      const { dealIds } = result;

      const thread = await db.select()
        .from(messageThreads)
        .where(eq(messageThreads.id, threadId))
        .limit(1);

      if (!thread[0] || !thread[0].dealId || !dealIds.includes(thread[0].dealId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      await setPortalReadTimestamp(threadId);

      res.json({ ok: true });
    } catch (error) {
      console.error('Portal mark read error:', error);
      res.status(500).json({ error: 'Failed to mark read' });
    }
  });

  app.get('/api/resolve-portal/broker/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByBrokerToken(token);
      if (!project) {
        return res.status(404).json({ error: 'Invalid portal link' });
      }

      if (!project.brokerPortalEnabled) {
        return res.status(403).json({ error: 'Portal access is disabled for this deal' });
      }

      const brokerId = project.userId;
      let user = brokerId ? await storage.getUserById(brokerId) : null;

      if (!user) {
        return res.status(404).json({ error: 'No user associated with this deal' });
      }

      if (!user.inviteToken) {
        const inviteToken = generateRandomToken();
        await db.update(users).set({ inviteToken, inviteStatus: user.inviteStatus || 'joined' }).where(eq(users.id, user.id));
        return res.json({ redirectTo: `/join/personal/${inviteToken}` });
      }

      res.json({ redirectTo: `/join/personal/${user.inviteToken}` });
    } catch (error) {
      console.error('Resolve broker portal error:', error);
      res.status(500).json({ error: 'Failed to resolve portal link' });
    }
  });

  app.get('/api/resolve-portal/borrower/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByToken(token);
      if (!project) {
        return res.status(404).json({ error: 'Invalid portal link' });
      }

      if (!project.borrowerPortalEnabled) {
        return res.status(403).json({ error: 'Portal access is disabled for this deal' });
      }

      const borrowerEmail = project.borrowerEmail;
      if (!borrowerEmail) {
        return res.status(404).json({ error: 'No borrower email on this deal' });
      }

      let user = await storage.getUserByEmail(borrowerEmail.toLowerCase().trim());

      if (!user) {
        const inviteToken = generateRandomToken();
        user = await storage.createUser({
          email: borrowerEmail.toLowerCase().trim(),
          fullName: project.borrowerName || null,
          phone: project.borrowerPhone || null,
          role: 'borrower',
          userType: 'borrower',
          isActive: true,
          emailVerified: true,
          inviteToken,
          inviteStatus: 'none',
        } as any);
        return res.json({ redirectTo: `/join/personal/${inviteToken}` });
      }

      if (!user.inviteToken) {
        const inviteToken = generateRandomToken();
        await db.update(users).set({ inviteToken, inviteStatus: user.inviteStatus || 'joined' }).where(eq(users.id, user.id));
        return res.json({ redirectTo: `/join/personal/${inviteToken}` });
      }

      res.json({ redirectTo: `/join/personal/${user.inviteToken}` });
    } catch (error) {
      console.error('Resolve borrower portal error:', error);
      res.status(500).json({ error: 'Failed to resolve portal link' });
    }
  });
}

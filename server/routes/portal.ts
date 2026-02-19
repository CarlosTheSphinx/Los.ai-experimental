import type { Express, Request, Response } from 'express';
import type { RouteDeps } from './types';
import { eq, asc, and } from 'drizzle-orm';
import { dealDocuments, dealDocumentFiles, projectStages, loanPrograms, projectActivity, platformSettings, systemSettings } from '@shared/schema';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

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

      res.json({ documents: docsWithFiles, stages });
    } catch (error) {
      console.error('Portal documents error:', error);
      res.status(500).json({ error: 'Failed to load documents' });
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

      res.json({ document: updated, file: newFile });
    } catch (error) {
      console.error('Portal upload complete error:', error);
      res.status(500).json({ error: 'Failed to complete upload' });
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
}

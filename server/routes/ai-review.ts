import type { Express, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { eq, and } from 'drizzle-orm';
import {
  documentReviewRules,
  guidelineUploads,
  dealDocuments,
  loanPrograms,
  projects
} from '@shared/schema';
import {
  generateDocumentReviewRules,
  saveProposedRules,
  type GenerationResult
} from '../services/aiReviewConfigGenerator';
import { reviewDocumentWithRules } from '../services/documentReview';

export function registerAiReviewRoutes(app: Express, deps: RouteDeps) {
  const { storage, db, authenticateUser, requireAdmin, requirePermission } = deps;

  // ==================== DOCUMENT REVIEW RULES ROUTES ====================

  // POST /api/admin/programs/:programId/guideline-upload
  // Upload and extract text from a guideline PDF
  app.post(
    '/api/admin/programs/:programId/guideline-upload',
    authenticateUser,
    requireAdmin,
    requirePermission('programs.edit'),
    async (req: AuthRequest, res: Response) => {
      try {
        const { programId } = req.params;
        const pid = parseInt(programId);

        // Check if program exists
        const [program] = await db.select().from(loanPrograms)
          .where(eq(loanPrograms.id, pid));

        if (!program) {
          return res.status(404).json({ error: 'Program not found' });
        }

        // For now, we'll store the upload record with placeholder text
        // In a real implementation, you'd extract text from the uploaded PDF
        // This would use the objectStorageService to handle the file upload

        const fileName = req.body?.fileName || 'guidelines.pdf';
        const extractedText = req.body?.extractedText || '';

        const [upload] = await db.insert(guidelineUploads)
          .values({
            programId: pid,
            fileName: fileName,
            filePath: null,
            mimeType: 'application/pdf',
            fileSize: 0,
            extractedText: extractedText,
            status: extractedText ? 'processed' : 'pending',
            uploadedBy: req.user?.id
          })
          .returning();

        res.json({
          success: true,
          id: upload.id,
          message: 'Guideline uploaded successfully'
        });
      } catch (error) {
        console.error('Guideline upload error:', error);
        res.status(500).json({ error: 'Failed to upload guideline' });
      }
    }
  );

  // GET /api/admin/programs/:programId/review-rules
  // Get all document review rules for a program
  app.get(
    '/api/admin/programs/:programId/review-rules',
    authenticateUser,
    requireAdmin,
    requirePermission('programs.edit'),
    async (req: AuthRequest, res: Response) => {
      try {
        const { programId } = req.params;
        const pid = parseInt(programId);

        const rules = await db.select().from(documentReviewRules)
          .where(eq(documentReviewRules.programId, pid))
          .orderBy(documentReviewRules.documentCategory, documentReviewRules.documentName);

        // Enrich with creator info
        const enrichedRules = await Promise.all(rules.map(async (rule) => {
          let createdByUser = null;
          if (rule.createdBy) {
            createdByUser = await storage.getUserById(rule.createdBy);
          }
          return {
            ...rule,
            createdByName: createdByUser?.fullName || createdByUser?.email || 'Unknown'
          };
        }));

        res.json(enrichedRules);
      } catch (error) {
        console.error('Get review rules error:', error);
        res.status(500).json({ error: 'Failed to load review rules' });
      }
    }
  );

  // POST /api/admin/programs/:programId/review-rules/generate
  // Generate review rules from uploaded guidelines
  app.post(
    '/api/admin/programs/:programId/review-rules/generate',
    authenticateUser,
    requireAdmin,
    requirePermission('programs.edit'),
    async (req: AuthRequest, res: Response) => {
      try {
        const { programId } = req.params;
        const { guidelineUploadId } = req.body;

        const pid = parseInt(programId);

        if (!guidelineUploadId) {
          return res.status(400).json({ error: 'guidelineUploadId is required' });
        }

        // Get the guideline upload
        const [guideline] = await db.select().from(guidelineUploads)
          .where(eq(guidelineUploads.id, guidelineUploadId));

        if (!guideline) {
          return res.status(404).json({ error: 'Guideline upload not found' });
        }

        if (guideline.programId !== pid) {
          return res.status(403).json({ error: 'Guideline does not belong to this program' });
        }

        if (!guideline.extractedText) {
          return res.status(400).json({
            error: 'Guideline text has not been extracted yet'
          });
        }

        // Generate rules using AI
        const result: GenerationResult = await generateDocumentReviewRules(
          pid,
          guideline.extractedText,
          guidelineUploadId,
          req.user?.id
        );

        if (!result.success) {
          return res.status(500).json({
            error: result.error || 'Failed to generate rules'
          });
        }

        // Save the proposed rules
        const saveResult = await saveProposedRules(
          pid,
          result.rules || [],
          guidelineUploadId,
          req.user?.id || 0
        );

        if (!saveResult.success) {
          return res.status(500).json({
            error: saveResult.error || 'Failed to save proposed rules'
          });
        }

        // Fetch the created rules
        const createdRules = await db.select().from(documentReviewRules)
          .where(
            and(
              eq(documentReviewRules.programId, pid),
              eq(documentReviewRules.sourceGuidelineId, guidelineUploadId)
            )
          );

        res.json({
          success: true,
          message: `Generated ${createdRules.length} document review rules`,
          rules: createdRules,
          explanation: result.explanation
        });
      } catch (error) {
        console.error('Generate review rules error:', error);
        res.status(500).json({ error: 'Failed to generate review rules' });
      }
    }
  );

  // GET /api/admin/review-rules/:ruleId
  // Get a specific review rule
  app.get(
    '/api/admin/review-rules/:ruleId',
    authenticateUser,
    requireAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { ruleId } = req.params;

        const [rule] = await db.select().from(documentReviewRules)
          .where(eq(documentReviewRules.id, parseInt(ruleId)));

        if (!rule) {
          return res.status(404).json({ error: 'Rule not found' });
        }

        res.json(rule);
      } catch (error) {
        console.error('Get review rule error:', error);
        res.status(500).json({ error: 'Failed to load rule' });
      }
    }
  );

  // PUT /api/admin/review-rules/:ruleId
  // Update a review rule
  app.put(
    '/api/admin/review-rules/:ruleId',
    authenticateUser,
    requireAdmin,
    requirePermission('programs.edit'),
    async (req: AuthRequest, res: Response) => {
      try {
        const { ruleId } = req.params;
        const {
          ruleName,
          ruleDescription,
          ruleConfig,
          severity,
          isActive,
          confidence
        } = req.body;

        const rid = parseInt(ruleId);

        const updatedRule = await db.update(documentReviewRules)
          .set({
            ruleName: ruleName !== undefined ? ruleName : undefined,
            ruleDescription: ruleDescription !== undefined ? ruleDescription : undefined,
            ruleConfig: ruleConfig !== undefined ? ruleConfig : undefined,
            severity: severity !== undefined ? severity : undefined,
            isActive: isActive !== undefined ? isActive : undefined,
            confidence: confidence !== undefined ? confidence : undefined,
          })
          .where(eq(documentReviewRules.id, rid))
          .returning();

        if (updatedRule.length === 0) {
          return res.status(404).json({ error: 'Rule not found' });
        }

        res.json({
          success: true,
          rule: updatedRule[0]
        });
      } catch (error) {
        console.error('Update review rule error:', error);
        res.status(500).json({ error: 'Failed to update rule' });
      }
    }
  );

  // POST /api/admin/review-rules/:ruleId/approve
  // Approve a proposed rule (activate it)
  app.post(
    '/api/admin/review-rules/:ruleId/approve',
    authenticateUser,
    requireAdmin,
    requirePermission('programs.edit'),
    async (req: AuthRequest, res: Response) => {
      try {
        const { ruleId } = req.params;

        const updatedRule = await db.update(documentReviewRules)
          .set({ isActive: true })
          .where(eq(documentReviewRules.id, parseInt(ruleId)))
          .returning();

        if (updatedRule.length === 0) {
          return res.status(404).json({ error: 'Rule not found' });
        }

        res.json({
          success: true,
          message: 'Rule approved and activated',
          rule: updatedRule[0]
        });
      } catch (error) {
        console.error('Approve review rule error:', error);
        res.status(500).json({ error: 'Failed to approve rule' });
      }
    }
  );

  // DELETE /api/admin/review-rules/:ruleId
  // Delete a review rule
  app.delete(
    '/api/admin/review-rules/:ruleId',
    authenticateUser,
    requireAdmin,
    requirePermission('programs.edit'),
    async (req: AuthRequest, res: Response) => {
      try {
        const { ruleId } = req.params;

        await db.delete(documentReviewRules)
          .where(eq(documentReviewRules.id, parseInt(ruleId)));

        res.json({
          success: true,
          message: 'Rule deleted'
        });
      } catch (error) {
        console.error('Delete review rule error:', error);
        res.status(500).json({ error: 'Failed to delete rule' });
      }
    }
  );

  // ==================== DOCUMENT AI REVIEW ROUTES ====================

  // POST /api/deals/:dealId/documents/:documentId/ai-review
  // Trigger AI review for a specific document
  app.post(
    '/api/deals/:dealId/documents/:documentId/ai-review',
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const { dealId, documentId } = req.params;

        // Get the document
        const [doc] = await db.select().from(dealDocuments)
          .where(eq(dealDocuments.id, parseInt(documentId)));

        if (!doc) {
          return res.status(404).json({ error: 'Document not found' });
        }

        if (doc.dealId !== parseInt(dealId)) {
          return res.status(403).json({ error: 'Document does not belong to this deal' });
        }

        if (!doc.filePath) {
          return res.status(400).json({ error: 'No file uploaded for this document' });
        }

        // Get the deal to find the program
        const [deal] = await db.select().from(projects)
          .where(eq(projects.id, parseInt(dealId)));

        if (!deal) {
          return res.status(404).json({ error: 'Deal not found' });
        }

        if (!deal.programId) {
          return res.status(400).json({
            error: 'Deal has no program assigned. Cannot perform AI review.'
          });
        }

        // Update document status to reviewing
        await db.update(dealDocuments)
          .set({
            aiReviewStatus: 'reviewing',
            aiReviewedAt: new Date()
          })
          .where(eq(dealDocuments.id, parseInt(documentId)));

        // Perform the review
        const reviewResult = await reviewDocumentWithRules(
          parseInt(documentId),
          doc.filePath,
          deal.programId,
          req.user?.id || 0
        );

        if (reviewResult.status === 'error') {
          // Update with error
          await db.update(dealDocuments)
            .set({
              aiReviewStatus: 'not_reviewed',
              aiReviewReason: reviewResult.reason,
              aiReviewedAt: new Date(),
              aiReviewConfidence: reviewResult.confidence
            })
            .where(eq(dealDocuments.id, parseInt(documentId)));

          return res.status(500).json({
            error: reviewResult.reason
          });
        }

        // Update document with review results
        const updatedDoc = await db.update(dealDocuments)
          .set({
            aiReviewStatus: reviewResult.status,
            aiReviewReason: reviewResult.reason,
            aiReviewedAt: new Date(),
            aiReviewConfidence: reviewResult.confidence
          })
          .where(eq(dealDocuments.id, parseInt(documentId)))
          .returning();

        res.json({
          success: true,
          message: `Document ${reviewResult.status}`,
          status: reviewResult.status,
          reason: reviewResult.reason,
          confidence: reviewResult.confidence,
          document: updatedDoc[0]
        });
      } catch (error) {
        console.error('AI review document error:', error);
        res.status(500).json({ error: 'Failed to review document' });
      }
    }
  );
}

/**
 * Lender Training Routes
 * CRUD for training steps + user progress tracking
 */

import type { Express, Response } from "express";
import type { AuthRequest } from "../auth";
import type { RouteDeps } from "./types";
import { db } from "../db";
import {
  lenderTrainingSteps,
  lenderTrainingProgress,
  users,
} from "@shared/schema";
import { eq, and, asc, desc } from "drizzle-orm";

export function registerLenderTrainingRoutes(app: Express, deps: RouteDeps) {
  const { authenticateUser, requireAdmin } = deps;

  // Super admin check middleware for training config
  const requireSuperAdmin = async (req: AuthRequest, res: Response, next: Function) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    if (!user || user.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }
    next();
  };

  /**
   * GET /api/training/steps
   * Get all active training steps (ordered by sortOrder)
   */
  app.get(
    "/api/training/steps",
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const steps = await db
          .select()
          .from(lenderTrainingSteps)
          .where(eq(lenderTrainingSteps.isActive, true))
          .orderBy(asc(lenderTrainingSteps.sortOrder));

        res.json(steps);
      } catch (error) {
        console.error("Error fetching training steps:", error);
        res.status(500).json({ error: "Failed to fetch training steps" });
      }
    }
  );

  /**
   * GET /api/training/steps/all
   * Get ALL training steps including inactive (admin only)
   */
  app.get(
    "/api/training/steps/all",
    authenticateUser,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const steps = await db
          .select()
          .from(lenderTrainingSteps)
          .orderBy(asc(lenderTrainingSteps.sortOrder));

        res.json(steps);
      } catch (error) {
        console.error("Error fetching all training steps:", error);
        res.status(500).json({ error: "Failed to fetch training steps" });
      }
    }
  );

  /**
   * GET /api/training/progress
   * Get current user's training progress
   */
  app.get(
    "/api/training/progress",
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;

        // Get all active steps
        const steps = await db
          .select()
          .from(lenderTrainingSteps)
          .where(eq(lenderTrainingSteps.isActive, true))
          .orderBy(asc(lenderTrainingSteps.sortOrder));

        // Get user's progress records
        const progress = await db
          .select()
          .from(lenderTrainingProgress)
          .where(eq(lenderTrainingProgress.userId, userId));

        // Build progress map
        const progressMap = new Map(
          progress.map((p) => [p.stepId, p])
        );

        // Merge steps with progress
        const stepsWithProgress = steps.map((step) => ({
          ...step,
          progress: progressMap.get(step.id) || null,
          isCompleted: progressMap.get(step.id)?.status === "completed",
        }));

        const totalSteps = steps.length;
        const completedSteps = stepsWithProgress.filter((s) => s.isCompleted).length;
        const requiredSteps = steps.filter((s) => s.isRequired).length;
        const completedRequired = stepsWithProgress.filter(
          (s) => s.isRequired && s.isCompleted
        ).length;

        res.json({
          steps: stepsWithProgress,
          summary: {
            totalSteps,
            completedSteps,
            requiredSteps,
            completedRequired,
            allRequiredComplete: completedRequired >= requiredSteps,
            percentComplete:
              totalSteps > 0
                ? Math.round((completedSteps / totalSteps) * 100)
                : 0,
          },
        });
      } catch (error) {
        console.error("Error fetching training progress:", error);
        res.status(500).json({ error: "Failed to fetch training progress" });
      }
    }
  );

  /**
   * POST /api/training/steps/:stepId/complete
   * Mark a training step as completed
   */
  app.post(
    "/api/training/steps/:stepId/complete",
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const stepId = parseInt(req.params.stepId);

        // Check if step exists
        const [step] = await db
          .select()
          .from(lenderTrainingSteps)
          .where(eq(lenderTrainingSteps.id, stepId));

        if (!step) {
          return res.status(404).json({ error: "Training step not found" });
        }

        // Check for existing progress record
        const [existing] = await db
          .select()
          .from(lenderTrainingProgress)
          .where(
            and(
              eq(lenderTrainingProgress.userId, userId),
              eq(lenderTrainingProgress.stepId, stepId)
            )
          );

        if (existing) {
          // Update existing
          await db
            .update(lenderTrainingProgress)
            .set({
              status: "completed",
              completedAt: new Date(),
            })
            .where(eq(lenderTrainingProgress.id, existing.id));
        } else {
          // Create new
          await db.insert(lenderTrainingProgress).values({
            userId,
            stepId,
            status: "completed",
            completedAt: new Date(),
          });
        }

        // Check if all required steps are complete
        const allSteps = await db
          .select()
          .from(lenderTrainingSteps)
          .where(
            and(
              eq(lenderTrainingSteps.isActive, true),
              eq(lenderTrainingSteps.isRequired, true)
            )
          );

        const allProgress = await db
          .select()
          .from(lenderTrainingProgress)
          .where(eq(lenderTrainingProgress.userId, userId));

        const completedStepIds = new Set(
          allProgress
            .filter((p) => p.status === "completed")
            .map((p) => p.stepId)
        );

        const allRequiredComplete = allSteps.every((s) =>
          completedStepIds.has(s.id)
        );

        // Update user's training completed flag
        if (allRequiredComplete) {
          await db
            .update(users)
            .set({ lenderTrainingCompleted: true })
            .where(eq(users.id, userId));
        }

        res.json({
          success: true,
          allRequiredComplete,
        });
      } catch (error) {
        console.error("Error completing training step:", error);
        res.status(500).json({ error: "Failed to complete training step" });
      }
    }
  );

  /**
   * POST /api/training/steps/:stepId/uncomplete
   * Mark a training step as not completed (undo)
   */
  app.post(
    "/api/training/steps/:stepId/uncomplete",
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const stepId = parseInt(req.params.stepId);

        await db
          .update(lenderTrainingProgress)
          .set({ status: "not_started", completedAt: null })
          .where(
            and(
              eq(lenderTrainingProgress.userId, userId),
              eq(lenderTrainingProgress.stepId, stepId)
            )
          );

        // Reset user's training completed flag
        await db
          .update(users)
          .set({ lenderTrainingCompleted: false })
          .where(eq(users.id, userId));

        res.json({ success: true });
      } catch (error) {
        console.error("Error uncompleting training step:", error);
        res.status(500).json({ error: "Failed to uncomplete training step" });
      }
    }
  );

  // ---- ADMIN CRUD for Training Steps ----

  /**
   * POST /api/admin/training/steps
   * Create a new training step (admin only)
   */
  app.post(
    "/api/admin/training/steps",
    authenticateUser,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          title,
          description,
          targetPage,
          contentHtml,
          videoUrl,
          sortOrder,
          isActive,
          isRequired,
        } = req.body;

        if (!title || !targetPage) {
          return res
            .status(400)
            .json({ error: "Title and targetPage are required" });
        }

        const [step] = await db
          .insert(lenderTrainingSteps)
          .values({
            title,
            description: description || null,
            targetPage,
            contentHtml: contentHtml || null,
            videoUrl: videoUrl || null,
            sortOrder: sortOrder ?? 0,
            isActive: isActive ?? true,
            isRequired: isRequired ?? true,
            createdBy: req.user!.id,
          })
          .returning();

        res.json(step);
      } catch (error) {
        console.error("Error creating training step:", error);
        res.status(500).json({ error: "Failed to create training step" });
      }
    }
  );

  /**
   * PUT /api/admin/training/steps/:id
   * Update a training step (admin only)
   */
  app.put(
    "/api/admin/training/steps/:id",
    authenticateUser,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const stepId = parseInt(req.params.id);
        const {
          title,
          description,
          targetPage,
          contentHtml,
          videoUrl,
          sortOrder,
          isActive,
          isRequired,
        } = req.body;

        const [updated] = await db
          .update(lenderTrainingSteps)
          .set({
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(targetPage !== undefined && { targetPage }),
            ...(contentHtml !== undefined && { contentHtml }),
            ...(videoUrl !== undefined && { videoUrl }),
            ...(sortOrder !== undefined && { sortOrder }),
            ...(isActive !== undefined && { isActive }),
            ...(isRequired !== undefined && { isRequired }),
            updatedAt: new Date(),
          })
          .where(eq(lenderTrainingSteps.id, stepId))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: "Training step not found" });
        }

        res.json(updated);
      } catch (error) {
        console.error("Error updating training step:", error);
        res.status(500).json({ error: "Failed to update training step" });
      }
    }
  );

  /**
   * DELETE /api/admin/training/steps/:id
   * Delete a training step (admin only)
   */
  app.delete(
    "/api/admin/training/steps/:id",
    authenticateUser,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const stepId = parseInt(req.params.id);

        await db
          .delete(lenderTrainingSteps)
          .where(eq(lenderTrainingSteps.id, stepId));

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting training step:", error);
        res.status(500).json({ error: "Failed to delete training step" });
      }
    }
  );

  /**
   * POST /api/admin/training/steps/reorder
   * Bulk update sort order (admin only)
   */
  app.post(
    "/api/admin/training/steps/reorder",
    authenticateUser,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { orderedIds } = req.body; // Array of step IDs in new order

        if (!Array.isArray(orderedIds)) {
          return res.status(400).json({ error: "orderedIds must be an array" });
        }

        for (let i = 0; i < orderedIds.length; i++) {
          await db
            .update(lenderTrainingSteps)
            .set({ sortOrder: i, updatedAt: new Date() })
            .where(eq(lenderTrainingSteps.id, orderedIds[i]));
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error reordering training steps:", error);
        res.status(500).json({ error: "Failed to reorder training steps" });
      }
    }
  );

  /**
   * POST /api/admin/training/seed-defaults
   * Seed default training steps if none exist
   */
  app.post(
    "/api/admin/training/seed-defaults",
    authenticateUser,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        // Check if any steps exist
        const existing = await db
          .select()
          .from(lenderTrainingSteps);

        if (existing.length > 0) {
          return res.json({
            message: "Training steps already exist",
            count: existing.length,
          });
        }

        const defaults = [
          {
            title: "Creating a Loan Program",
            description:
              "Learn how to create and configure loan programs with stages, tasks, and document requirements.",
            targetPage: "/admin/programs",
            contentHtml: `<div>
              <h3>Welcome to Loan Programs</h3>
              <p>Loan Programs are the foundation of your lending workflow. Each program defines:</p>
              <ul>
                <li><strong>Stages</strong> — The phases a deal goes through (e.g., Application, Underwriting, Closing)</li>
                <li><strong>Tasks</strong> — Checklist items assigned to each stage</li>
                <li><strong>Documents</strong> — Required documents for each stage</li>
              </ul>
              <p>Try creating a new program by clicking the <strong>"New Program"</strong> button above.</p>
            </div>`,
            sortOrder: 0,
            isRequired: true,
          },
          {
            title: "Assigning Tasks & Documents to Stages",
            description:
              "Learn how to configure stage workflows with tasks, document requirements, and automation rules.",
            targetPage: "/admin/programs",
            contentHtml: `<div>
              <h3>Stage Configuration</h3>
              <p>Each stage in your program can have:</p>
              <ul>
                <li><strong>Tasks</strong> — Actions your team needs to complete</li>
                <li><strong>Documents</strong> — Files borrowers need to upload</li>
                <li><strong>Review Rules</strong> — AI-powered document review criteria</li>
              </ul>
              <p>Click on any program, then expand a stage to add tasks and documents.</p>
            </div>`,
            sortOrder: 1,
            isRequired: true,
          },
          {
            title: "How AI Document Review Works",
            description:
              "Understand the 3 AI agents and how they analyze your deals automatically.",
            targetPage: "/admin/ai-agents",
            contentHtml: `<div>
              <h3>AI Agent Pipeline</h3>
              <p>Lendry.AI uses three chained AI agents to process each deal:</p>
              <ol>
                <li><strong>Document Intelligence</strong> — Extracts data from uploaded documents</li>
                <li><strong>Loan Processor</strong> — Analyzes deal health, compliance, and missing items</li>
                <li><strong>Communication Agent</strong> — Drafts borrower communications based on findings</li>
              </ol>
              <p>You can configure each agent's prompts, model settings, and auto-trigger behavior from this page.</p>
              <p>To see results, go to any deal and click the <strong>"AI Review"</strong> tab.</p>
            </div>`,
            sortOrder: 2,
            isRequired: true,
          },
          {
            title: "Setting Up Daily Digest Messaging",
            description:
              "Configure automated digest emails that keep borrowers and brokers informed on deal progress.",
            targetPage: "/admin/digests",
            contentHtml: `<div>
              <h3>Digest Configuration</h3>
              <p>Daily digests automatically notify stakeholders about deal progress:</p>
              <ul>
                <li><strong>Borrower Digests</strong> — Keep borrowers informed on what's needed</li>
                <li><strong>Broker Digests</strong> — Update brokers on deal status changes</li>
                <li><strong>Internal Digests</strong> — Summary for your team</li>
              </ul>
              <p>Configure recipients, frequency, and content from this page.</p>
            </div>`,
            sortOrder: 3,
            isRequired: true,
          },
        ];

        for (const step of defaults) {
          await db.insert(lenderTrainingSteps).values({
            ...step,
            isActive: true,
            createdBy: req.user!.id,
          });
        }

        res.json({ message: "Default training steps seeded", count: defaults.length });
      } catch (error) {
        console.error("Error seeding training defaults:", error);
        res.status(500).json({ error: "Failed to seed training defaults" });
      }
    }
  );

  /**
   * GET /api/admin/training/user-stats
   * Get completion stats across all users (admin only)
   */
  app.get(
    "/api/admin/training/user-stats",
    authenticateUser,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const allProgress = await db
          .select()
          .from(lenderTrainingProgress)
          .where(eq(lenderTrainingProgress.status, "completed"));

        const totalSteps = await db
          .select()
          .from(lenderTrainingSteps)
          .where(eq(lenderTrainingSteps.isActive, true));

        // Group by user
        const userMap = new Map<number, number>();
        for (const p of allProgress) {
          userMap.set(p.userId, (userMap.get(p.userId) || 0) + 1);
        }

        const userStats = Array.from(userMap.entries()).map(
          ([userId, completed]) => ({
            userId,
            completedSteps: completed,
            totalSteps: totalSteps.length,
            percentComplete:
              totalSteps.length > 0
                ? Math.round((completed / totalSteps.length) * 100)
                : 0,
          })
        );

        res.json({
          totalUsers: userMap.size,
          totalSteps: totalSteps.length,
          userStats,
        });
      } catch (error) {
        console.error("Error fetching training user stats:", error);
        res.status(500).json({ error: "Failed to fetch user stats" });
      }
    }
  );
}

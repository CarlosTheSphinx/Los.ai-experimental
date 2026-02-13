/**
 * AI Assistant Routes
 * Endpoints for conversation management, messaging, voice transcription, and daily briefings
 */

import type { Express, Request, Response } from "express";
import express from "express";
import { db } from "../db";
import { aiAssistantConversations, dealProcessors, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  generateDailyBriefing,
  processAssistantMessage,
  transcribeVoice,
  createConversation,
  getConversation,
  listConversations,
} from "../services/aiAssistant";
import { authenticateUser, type AuthRequest } from "../auth";

// Body parser with larger limit for audio payloads
const audioBodyParser = express.json({ limit: "50mb" });

/**
 * Register AI Assistant routes
 */
export function registerAiAssistantRoutes(app: Express): void {
  /**
   * GET /api/assistant/conversations
   * List all conversations for current user
   */
  app.get("/api/assistant/conversations", authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const conversations = await listConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  /**
   * POST /api/assistant/conversations
   * Create a new conversation (optionally with daily briefing)
   */
  app.post("/api/assistant/conversations", authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { conversationType, dealId, title } = req.body;

      if (!conversationType) {
        return res.status(400).json({ error: "conversationType is required" });
      }

      const conversation = await createConversation(
        userId,
        conversationType,
        dealId,
        title
      );

      // If daily briefing, generate and add as first message
      if (conversationType === "daily_briefing") {
        try {
          const briefing = await generateDailyBriefing(userId);
          res.status(201).json({
            ...conversation,
            briefing,
          });
        } catch (error) {
          console.error("Error generating briefing:", error);
          res.status(201).json(conversation);
        }
      } else {
        res.status(201).json(conversation);
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  /**
   * GET /api/assistant/conversations/:id
   * Get conversation with all messages
   */
  app.get(
    "/api/assistant/conversations/:id",
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        const conversation = await getConversation(conversationId);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        // Verify user owns this conversation
        if (conversation.userId !== userId) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        res.json(conversation);
      } catch (error) {
        console.error("Error fetching conversation:", error);
        res.status(500).json({ error: "Failed to fetch conversation" });
      }
    }
  );

  /**
   * POST /api/assistant/conversations/:id/messages
   * Send a message and get AI response
   */
  app.post(
    "/api/assistant/conversations/:id/messages",
    authenticateUser,
    async (req: AuthRequest, res: Response) => {
      try {
        const conversationId = parseInt(req.params.id);
        const userId = req.user?.id;
        const { content, voiceInput } = req.body;

        if (!userId) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        if (!content) {
          return res.status(400).json({ error: "Message content is required" });
        }

        // Verify conversation ownership
        const conversation = await db
          .select()
          .from(aiAssistantConversations)
          .where(eq(aiAssistantConversations.id, conversationId))
          .then((r) => r[0]);

        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        if (conversation.userId !== userId) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        // Process message with AI
        const { response, actionsTaken } = await processAssistantMessage(
          conversationId,
          content,
          userId
        );

        res.json({
          response,
          actionsTaken,
        });
      } catch (error) {
        console.error("Error processing message:", error);
        res.status(500).json({ error: "Failed to process message" });
      }
    }
  );

  /**
   * POST /api/assistant/transcribe
   * Transcribe voice audio (base64 encoded WebM/MP4/OGG)
   */
  app.post(
    "/api/assistant/transcribe",
    authenticateUser,
    audioBodyParser,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        const { audio } = req.body;
        if (!audio) {
          return res.status(400).json({ error: "Audio data (base64) is required" });
        }

        // Convert base64 to buffer
        const audioBuffer = Buffer.from(audio, "base64");
        const text = await transcribeVoice(audioBuffer);

        res.json({ text });
      } catch (error) {
        console.error("Error transcribing audio:", error);
        res.status(500).json({ error: "Failed to transcribe audio" });
      }
    }
  );

  /**
   * GET /api/assistant/briefing
   * Generate and get fresh daily briefing
   */
  app.get("/api/assistant/briefing", authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const briefing = await generateDailyBriefing(userId);
      res.json(briefing);
    } catch (error) {
      console.error("Error generating briefing:", error);
      res.status(500).json({ error: "Failed to generate briefing" });
    }
  });
}

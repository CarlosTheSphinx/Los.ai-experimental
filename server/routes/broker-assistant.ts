/**
 * Broker AI Assistant routes
 * Provides a stateless chat endpoint for brokers backed by an in-context
 * knowledge pack of active loan programs and underwriting rules.
 */

import type { Express, Response } from "express";
import OpenAI from "openai";
import { authenticateUser, type AuthRequest } from "../auth";
import { getOpenAIApiKey } from "../utils/getOpenAIKey";
import { storage } from "../storage";
import { buildBrokerKnowledgePack } from "../services/brokerKnowledgeBase";

const MODEL = "gpt-4o-mini";
const MAX_USER_MESSAGES = 20;
const MAX_USER_CHARS = 4000;
// Broker-only by design. Other roles (including super_admin and lender) are
// rejected because the assistant's content policy and prompt are tuned for
// broker-safe disclosure only.
const ALLOWED_ROLES = new Set(["broker"]);

interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

function parseMessages(raw: unknown): ChatMessageInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessageInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as { role?: unknown; content?: unknown };
    if (typeof m.content !== "string") continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    out.push({ role: m.role, content: m.content.slice(0, MAX_USER_CHARS) });
  }
  return out.slice(-MAX_USER_MESSAGES);
}

const SYSTEM_INSTRUCTIONS = `You are Lendry, an AI loan-program assistant for brokers working with Sphinx Capital.

Your job is to help brokers understand Sphinx Capital's loan programs, eligibility criteria, underwriting guidelines, and document requirements so they can pre-qualify deals before submitting them.

GROUND RULES:
- Only answer using the knowledge pack provided below. If the answer is not in the knowledge pack, say so plainly and suggest the broker contact their loan officer.
- NEVER reveal information about other brokers, other brokers' deals, internal pricing rates, internal margins, or specific lender/fund names. Talk about programs in generic Sphinx Capital terms.
- NEVER quote a specific interest rate or fee — pricing is generated separately by the pricing engine. If asked about rates, tell the broker to run a quote in the Quotes tab.
- Keep responses concise and broker-friendly. Use bullet points when listing eligibility criteria.
- If a question is unrelated to commercial lending, loan programs, or Sphinx Capital, politely redirect.

When you do not have enough information, respond with:
"I don't have that detail in my knowledge base — please contact your loan officer at Sphinx Capital for the most accurate answer."`;

export function registerBrokerAssistantRoutes(app: Express): void {
  app.get("/api/broker/assistant/config", authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Not authenticated" });
      const setting = await storage.getSettingByKey("broker_chatbot_enabled", tenantId);
      const enabled = setting?.settingValue !== "false";
      res.json({ enabled });
    } catch (error) {
      console.error("broker assistant config error", error);
      res.json({ enabled: true });
    }
  });

  app.post("/api/broker/assistant/chat", authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "Not authenticated" });

      const role = user.role || "";
      if (!ALLOWED_ROLES.has(role)) {
        return res.status(403).json({ error: "Broker assistant is only available to brokers" });
      }

      const tenantId = user.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Not authenticated" });
      const setting = await storage.getSettingByKey("broker_chatbot_enabled", tenantId);
      if (setting?.settingValue === "false") {
        return res.status(403).json({ error: "Broker assistant is disabled for this account" });
      }

      const cleaned = parseMessages(req.body?.messages);
      if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
        return res.status(400).json({ error: "Last message must come from the user" });
      }

      const apiKey = await getOpenAIApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: "AI assistant is temporarily unavailable. Please contact your loan officer.",
        });
      }

      const knowledgePack = await buildBrokerKnowledgePack(tenantId);
      const systemPrompt = `${SYSTEM_INSTRUCTIONS}\n\n=== KNOWLEDGE PACK ===\n${knowledgePack}\n=== END KNOWLEDGE PACK ===`;

      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          ...cleaned,
        ],
      });

      const content =
        completion.choices?.[0]?.message?.content?.trim() ||
        "I don't have that detail in my knowledge base — please contact your loan officer at Sphinx Capital for the most accurate answer.";

      res.json({ content });
    } catch (error: any) {
      console.error("broker assistant chat error", error);
      const status = error?.status === 429 ? 429 : 500;
      res.status(status).json({
        error: status === 429
          ? "AI is temporarily over its limit. Please try again in a moment."
          : "Failed to get a response. Please try again.",
      });
    }
  });
}

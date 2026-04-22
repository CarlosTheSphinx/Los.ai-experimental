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
import { db } from "../db";
import { supportTickets, supportTicketStatusHistory } from "@shared/schema";
import { computeResponseDueAt } from "../utils/businessHours";

const DEFAULT_BROKER_INTRO = `You are Lendry, an AI loan-program assistant for brokers working with Sphinx Capital.

Your job is to help brokers understand Sphinx Capital's loan programs, eligibility criteria, underwriting guidelines, and document requirements so they can pre-qualify deals before submitting them.

When you do not have enough information, respond with: "I don't have that detail in my knowledge base — please contact your loan officer at Sphinx Capital for the most accurate answer."`;

const DEFAULT_BROKER_CAPABILITIES = `Answer questions about active loan programs and their eligibility criteria
Explain underwriting guidelines and document requirements
Help brokers pre-qualify deals before formal submission
Explain which property types and states are eligible for each program
Describe indicative rate ranges (always directing brokers to run a formal quote for actual pricing)`;

const DEFAULT_BROKER_RULES = `Only answer using the knowledge pack provided. If the answer is not in the knowledge pack, say so plainly and suggest the broker contact their loan officer.
NEVER reveal information about other brokers, other brokers' deals, internal pricing rates, internal margins, or specific lender/fund names. Talk about programs in generic Sphinx Capital terms.
NEVER quote a specific interest rate, point, or fee. You may share indicative ranges from the knowledge pack, but always direct the broker to the Quotes tab for actual pricing.
Keep responses concise and broker-friendly. Use bullet points when listing eligibility criteria.
If a question is unrelated to commercial lending, loan programs, or Sphinx Capital, politely redirect.`;

async function buildBrokerSystemPrompt(tenantId: number): Promise<string> {
  let intro = DEFAULT_BROKER_INTRO;
  let capabilities = DEFAULT_BROKER_CAPABILITIES;
  let rules = DEFAULT_BROKER_RULES;
  try {
    const [introSetting, capsSetting, rulesSetting] = await Promise.all([
      storage.getSettingByKey("support_agent_broker_intro", tenantId),
      storage.getSettingByKey("support_agent_broker_capabilities", tenantId),
      storage.getSettingByKey("support_agent_broker_rules", tenantId),
    ]);
    if (introSetting?.settingValue?.trim()) intro = introSetting.settingValue;
    if (capsSetting?.settingValue?.trim()) capabilities = capsSetting.settingValue;
    if (rulesSetting?.settingValue?.trim()) rules = rulesSetting.settingValue;
  } catch (err) {
    console.warn("[broker-assistant] Failed to load agent settings:", err);
  }

  const capLines = capabilities
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l.replace(/^[-•]\s*/, "")}`)
    .join("\n");

  const ruleLines = rules
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l.replace(/^[-•]\s*/, "")}`)
    .join("\n");

  return `${intro}

CAPABILITIES:
${capLines}

GROUND RULES:
${ruleLines}`;
}

const MODEL = "gpt-4o-mini";
const MAX_USER_MESSAGES = 20;
const MAX_USER_CHARS = 4000;
const MAX_TOTAL_CHARS = 30000;
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


export function registerBrokerAssistantRoutes(app: Express): void {
  app.get("/api/broker/assistant/config", authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const role = req.user?.role || "";
      if (!ALLOWED_ROLES.has(role)) {
        return res.status(403).json({ error: "Broker assistant is only available to brokers" });
      }
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Not authenticated" });
      const [legacySetting, agentSetting] = await Promise.all([
        storage.getSettingByKey("broker_chatbot_enabled", tenantId),
        storage.getSettingByKey("support_agent_broker_enabled", tenantId),
      ]);
      const enabled =
        legacySetting?.settingValue !== "false" &&
        agentSetting?.settingValue !== "false";
      res.json({ enabled });
    } catch (error) {
      console.error("broker assistant config error", error);
      res.json({ enabled: true });
    }
  });

  // Phase 4 — Bot escalation handoff: turn the bot transcript into a support ticket
  app.post("/api/broker/assistant/escalate", authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "Not authenticated" });
      const role = user.role || "";
      if (!ALLOWED_ROLES.has(role)) {
        return res.status(403).json({ error: "Escalation is only available to brokers" });
      }
      const tenantId = user.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Not authenticated" });

      const transcript = parseMessages(req.body?.messages);
      if (!transcript.length) return res.status(400).json({ error: "Transcript is empty" });

      const lastUser = [...transcript].reverse().find((m) => m.role === "user");
      if (!lastUser) return res.status(400).json({ error: "No user question to escalate" });

      const subjectRaw = (req.body?.subject as string) || lastUser.content;
      const subject = subjectRaw.replace(/\s+/g, " ").trim().slice(0, 140) || "Escalated from Lendry Assistant";
      const description =
        (req.body?.description as string) ||
        `Escalated from Lendry Assistant.\n\nQuestion:\n${lastUser.content}`;

      const responseDueAt = computeResponseDueAt("help", new Date());

      const [created] = await db.insert(supportTickets).values({
        tenantId,
        type: "help",
        subject,
        description: description.slice(0, 5000),
        category: "assistant_escalation",
        submitterId: user.id,
        botTranscript: transcript as any,
        responseDueAt,
      }).returning();

      await db.insert(supportTicketStatusHistory).values({
        ticketId: created.id,
        fromStatus: null,
        toStatus: "open",
        changedById: user.id,
        note: "Ticket created from bot escalation",
      });

      res.status(201).json({ ticket: created });
    } catch (error) {
      console.error("[broker-assistant] escalate error", error);
      res.status(500).json({ error: "Failed to escalate to support" });
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
      const [legacySetting, agentSetting] = await Promise.all([
        storage.getSettingByKey("broker_chatbot_enabled", tenantId),
        storage.getSettingByKey("support_agent_broker_enabled", tenantId),
      ]);
      if (legacySetting?.settingValue === "false" || agentSetting?.settingValue === "false") {
        return res.status(403).json({ error: "Broker assistant is disabled for this account" });
      }

      const cleaned = parseMessages(req.body?.messages);
      if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
        return res.status(400).json({ error: "Last message must come from the user" });
      }
      const totalChars = cleaned.reduce((n, m) => n + m.content.length, 0);
      if (totalChars > MAX_TOTAL_CHARS) {
        return res.status(413).json({ error: "Conversation is too long. Please start a new chat." });
      }

      const apiKey = await getOpenAIApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: "AI assistant is temporarily unavailable. Please contact your loan officer.",
        });
      }

      const [knowledgePack, systemInstructions] = await Promise.all([
        buildBrokerKnowledgePack(tenantId),
        buildBrokerSystemPrompt(tenantId),
      ]);
      const systemPrompt = `${systemInstructions}\n\n=== KNOWLEDGE PACK ===\n${knowledgePack}\n=== END KNOWLEDGE PACK ===`;

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
    } catch (error: unknown) {
      console.error("broker assistant chat error", error);
      const errStatus =
        typeof error === "object" && error !== null && "status" in error
          ? (error as { status?: unknown }).status
          : undefined;
      const status = errStatus === 429 ? 429 : 500;
      res.status(status).json({
        error:
          status === 429
            ? "AI is temporarily over its limit. Please try again in a moment."
            : "Failed to get a response. Please try again.",
      });
    }
  });
}

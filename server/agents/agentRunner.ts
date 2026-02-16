/**
 * Agent Runner - Core Orchestration Module
 * Manages execution of all AI agents (Document Intelligence, Processor, Communication)
 * Uses the existing OpenAI configuration (AI_INTEGRATIONS_OPENAI_API_KEY)
 * Anthropic support can be enabled by adding ANTHROPIC_API_KEY env var and @anthropic-ai/sdk package
 */

import OpenAI from "openai";
import { db } from "../db";
import {
  agentConfigurations,
  agentRuns,
  type AgentConfiguration,
  type AgentRun,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn(
    "⚠️ AI_INTEGRATIONS_OPENAI_API_KEY not set. Agent execution will be disabled."
  );
}

const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

export type AgentType = "document_intelligence" | "processor" | "communication";

export interface ExecuteAgentParams {
  agentType: AgentType;
  projectId: number;
  triggeredBy?: number;
  triggerType: string;
  contextData: Record<string, any>;
}

export interface ExecuteAgentResult {
  success: boolean;
  response: any;
  agentRunId: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Fill template variables in a string with values from context data
 * Supports nested keys like {{borrower.name}}
 */
export function fillTemplate(
  template: string,
  data: Record<string, any>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const keys = key.split(".");
    let value = data;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return match; // Return original if not found
      }
    }

    return String(value || "");
  });
}

/**
 * Execute an agent with given parameters
 * Handles both Anthropic and OpenAI model providers
 */
export async function executeAgent(
  params: ExecuteAgentParams
): Promise<ExecuteAgentResult> {
  const startTime = Date.now();
  let agentRun: AgentRun | null = null;

  try {
    console.log(
      `🤖 Starting ${params.agentType} agent for project ${params.projectId}`
    );

    // Fetch active configuration for this agent type
    const config = await db
      .select()
      .from(agentConfigurations)
      .where(
        and(
          eq(agentConfigurations.agentType, params.agentType),
          eq(agentConfigurations.isActive, true)
        )
      )
      .orderBy(desc(agentConfigurations.version))
      .then((rows) => rows[0]);

    if (!config) {
      throw new Error(
        `No active configuration found for agent type: ${params.agentType}`
      );
    }

    // Create agent run record
    const runResult = await db
      .insert(agentRuns)
      .values({
        agentType: params.agentType,
        projectId: params.projectId,
        configurationId: config.id,
        status: "running",
        triggerType: params.triggerType,
        triggeredBy: params.triggeredBy,
      })
      .returning();

    agentRun = runResult[0];

    // Fill template variables in system prompt
    const systemPrompt = fillTemplate(config.systemPrompt, params.contextData);

    // Prepare messages with context
    const userMessage = JSON.stringify(params.contextData, null, 2);

    // Call appropriate AI provider
    let response;
    let inputTokens = 0;
    let outputTokens = 0;

    if (config.modelProvider === "anthropic") {
      // Anthropic support requires @anthropic-ai/sdk package and ANTHROPIC_API_KEY env var
      // For now, route Anthropic-configured agents through OpenAI as fallback
      console.log(`📨 Anthropic provider selected but using OpenAI fallback for ${config.modelName}`);
      if (!openai) {
        throw new Error("OpenAI API key not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY to enable agents.");
      }

      const fallbackModel = "gpt-4o"; // Use gpt-4o as Anthropic fallback
      const gptResponse = await openai.chat.completions.create({
        model: fallbackModel,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const content = gptResponse.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI (Anthropic fallback)");
      }

      response = { text: content };
      inputTokens = gptResponse.usage?.prompt_tokens || 0;
      outputTokens = gptResponse.usage?.completion_tokens || 0;
    } else if (config.modelProvider === "openai") {
      if (!openai) {
        throw new Error("OpenAI API key not configured");
      }

      console.log(`📨 Calling OpenAI ${config.modelName}`);

      const gptResponse = await openai.chat.completions.create({
        model: config.modelName,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const content = gptResponse.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      response = { text: content };
      inputTokens = gptResponse.usage?.prompt_tokens || 0;
      outputTokens = gptResponse.usage?.completion_tokens || 0;
    } else {
      throw new Error(`Unknown model provider: ${config.modelProvider}`);
    }

    const durationMs = Date.now() - startTime;

    // Calculate estimated cost (approximate GPT-4o pricing: $2.50/1M input, $10/1M output)
    const estimatedCost =
      (inputTokens * 2.5) / 1000000 + (outputTokens * 10) / 1000000;

    // Update agent run with results
    await db
      .update(agentRuns)
      .set({
        status: "completed",
        inputTokens,
        outputTokens,
        estimatedCost,
        durationMs,
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, agentRun.id));

    console.log(`✅ ${params.agentType} agent completed in ${durationMs}ms`);

    return {
      success: true,
      response: response.text,
      agentRunId: agentRun.id,
      inputTokens,
      outputTokens,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`❌ Agent error: ${errorMessage}`);

    // Update agent run with error
    if (agentRun) {
      await db
        .update(agentRuns)
        .set({
          status: "failed",
          errorMessage,
          durationMs,
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, agentRun.id));
    }

    throw error;
  }
}

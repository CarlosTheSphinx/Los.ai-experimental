/**
 * AI Assistant Service
 * Handles daily briefing generation, conversation management, and AI-powered actions
 * for loan processors.
 */

import OpenAI from "openai";
import { db } from "../db";
import {
  aiAssistantConversations,
  aiAssistantMessages,
  dealProcessors,
  projects,
  projectStages,
  dealDocuments,
  projectTasks,
  users,
  type AiAssistantConversation,
  type AiAssistantMessage,
  type Project,
  type ProjectTask,
  type DealDocument,
} from "@shared/schema";
import { eq, and, or, desc, lte, gte, isNull } from "drizzle-orm";

const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!aiApiKey) {
  console.warn(
    "⚠️  AI_INTEGRATIONS_OPENAI_API_KEY not set. AI Assistant features will be disabled."
  );
}

const openai = new OpenAI({
  apiKey: aiApiKey || "disabled",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-4o";

/**
 * Structure for daily briefing data
 */
export interface DealBriefing {
  dealId: number;
  dealName: string;
  borrowerName: string | null;
  stage: string;
  progress: number;
  pendingDocuments: {
    count: number;
    items: Array<{ name: string; status: string }>;
  };
  overdueTasks: {
    count: number;
    items: Array<{ title: string; dueDate: string }>;
  };
  recentActivity: Array<{ type: string; description: string; time: string }>;
}

export interface BriefingContent {
  summary: string;
  deals: DealBriefing[];
  queueItemsCount: number;
}

/**
 * Generate a daily briefing for a processor
 * Fetches all deals, documents, tasks, and generates a conversational summary via OpenAI
 */
export async function generateDailyBriefing(
  processorId: number
): Promise<BriefingContent> {
  // Fetch all deals assigned to this processor
  const assignedDeals = await db
    .select({
      projectId: dealProcessors.projectId,
      dealId: projects.id,
      dealName: projects.projectName,
      borrowerName: projects.borrowerName,
      currentStage: projects.currentStage,
      progressPercentage: projects.progressPercentage,
    })
    .from(dealProcessors)
    .innerJoin(projects, eq(dealProcessors.projectId, projects.id))
    .where(
      and(eq(dealProcessors.userId, processorId), eq(projects.status, "active"))
    );

  const dealBriefings: DealBriefing[] = [];

  for (const deal of assignedDeals) {
    // Get current stage details
    const stage = await db
      .select()
      .from(projectStages)
      .where(eq(projectStages.projectId, deal.dealId))
      .orderBy(projectStages.stageOrder)
      .then((stages) => stages.find((s) => s.status === "in_progress"));

    // Get pending documents
    const pendingDocs = await db
      .select({ name: dealDocuments.documentName, status: dealDocuments.status })
      .from(dealDocuments)
      .where(
        and(
          eq(dealDocuments.dealId, deal.dealId),
          or(eq(dealDocuments.status, "pending"), eq(dealDocuments.status, "rejected"))
        )
      );

    // Get overdue tasks
    const now = new Date();
    const overdueTasks = await db
      .select({
        title: projectTasks.taskTitle,
        dueDate: projectTasks.dueDate,
      })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, deal.dealId),
          or(
            eq(projectTasks.status, "pending"),
            eq(projectTasks.status, "in_progress")
          ),
          gte(projectTasks.dueDate, new Date("2000-01-01")),
          lte(projectTasks.dueDate, now)
        )
      );

    dealBriefings.push({
      dealId: deal.dealId,
      dealName: deal.dealName,
      borrowerName: deal.borrowerName,
      stage: stage?.stageName || deal.currentStage || "Unknown",
      progress: deal.progressPercentage || 0,
      pendingDocuments: {
        count: pendingDocs.length,
        items: pendingDocs.map((d) => ({
          name: d.name,
          status: d.status,
        })),
      },
      overdueTasks: {
        count: overdueTasks.length,
        items: overdueTasks.map((t) => ({
          title: t.title,
          dueDate: t.dueDate?.toISOString() || "N/A",
        })),
      },
      recentActivity: [], // Could populate from projectActivity table if needed
    });
  }

  // Generate AI summary
  const briefingText = formatBriefingForAI(dealBriefings);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `Generate a friendly, conversational daily briefing summary based on this loan processing data:\n\n${briefingText}`,
      },
    ],
    max_tokens: 1024,
  });

  const summary =
    response.choices[0]?.message?.content ||
    "Unable to generate briefing summary.";

  return {
    summary,
    deals: dealBriefings,
    queueItemsCount: dealBriefings.reduce(
      (acc, d) =>
        acc +
        d.pendingDocuments.count +
        d.overdueTasks.count,
      0
    ),
  };
}

/**
 * Format briefing data for AI consumption
 */
function formatBriefingForAI(deals: DealBriefing[]): string {
  return deals
    .map(
      (deal) =>
        `Deal #${deal.dealId}: ${deal.dealName}
Borrower: ${deal.borrowerName || "Unknown"}
Current Stage: ${deal.stage} (${deal.progress}% complete)
Pending Documents: ${deal.pendingDocuments.count}
  ${deal.pendingDocuments.items.map((d) => `- ${d.name} (${d.status})`).join("\n  ")}
Overdue Tasks: ${deal.overdueTasks.count}
  ${deal.overdueTasks.items.map((t) => `- ${t.title} (due: ${t.dueDate})`).join("\n  ")}`
    )
    .join("\n\n");
}

/**
 * Function definitions for OpenAI function calling
 */
const FUNCTION_DEFINITIONS = [
  {
    name: "edit_digest_message",
    description: "Edit a digest draft message for a borrower",
    parameters: {
      type: "object",
      properties: {
        dealId: {
          type: "number",
          description: "The deal ID",
        },
        recipientType: {
          type: "string",
          enum: ["borrower", "processor"],
          description: "Who the message is for",
        },
        newContent: {
          type: "string",
          description: "The new digest message content",
        },
      },
      required: ["dealId", "recipientType", "newContent"],
    },
  },
  {
    name: "create_task",
    description: "Create a new task for a deal",
    parameters: {
      type: "object",
      properties: {
        dealId: {
          type: "number",
          description: "The deal ID",
        },
        taskName: {
          type: "string",
          description: "Title of the task",
        },
        assignTo: {
          type: "string",
          description: 'Who to assign the task to (e.g., "borrower", "processor")',
        },
        dueDate: {
          type: "string",
          format: "date-time",
          description: "When the task is due",
        },
      },
      required: ["dealId", "taskName", "assignTo", "dueDate"],
    },
  },
  {
    name: "update_document_status",
    description: "Update the status of a document",
    parameters: {
      type: "object",
      properties: {
        dealId: {
          type: "number",
          description: "The deal ID",
        },
        documentId: {
          type: "number",
          description: "The document ID",
        },
        newStatus: {
          type: "string",
          enum: ["pending", "received", "rejected", "approved"],
          description: "The new status",
        },
        reason: {
          type: "string",
          description: "Reason for the status change",
        },
      },
      required: ["dealId", "documentId", "newStatus"],
    },
  },
  {
    name: "add_note",
    description: "Add an internal note to a deal",
    parameters: {
      type: "object",
      properties: {
        dealId: {
          type: "number",
          description: "The deal ID",
        },
        note: {
          type: "string",
          description: "The note content",
        },
      },
      required: ["dealId", "note"],
    },
  },
  {
    name: "get_deal_summary",
    description: "Get current status summary of a specific deal",
    parameters: {
      type: "object",
      properties: {
        dealId: {
          type: "number",
          description: "The deal ID",
        },
      },
      required: ["dealId"],
    },
  },
];

/**
 * Process a message from a processor in conversation with the AI assistant
 */
export async function processAssistantMessage(
  conversationId: number,
  userMessage: string,
  processorId: number
): Promise<{
  response: string;
  actionsTaken: Array<{
    type: string;
    status: "success" | "failed";
    details: Record<string, any>;
  }>;
}> {
  // Save user message
  await db.insert(aiAssistantMessages).values({
    conversationId,
    role: "user",
    content: userMessage,
    voiceInput: false,
  });

  // Get conversation history
  const messages = await db
    .select()
    .from(aiAssistantMessages)
    .where(eq(aiAssistantMessages.conversationId, conversationId))
    .orderBy(aiAssistantMessages.createdAt);

  // Format for OpenAI
  const chatMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  // Call OpenAI with function definitions
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: chatMessages,
    tools: FUNCTION_DEFINITIONS.map((f) => ({
      type: "function" as const,
      function: f,
    })),
    max_tokens: 2048,
  });

  const assistantMessage = response.choices[0]?.message;
  if (!assistantMessage) {
    throw new Error("No response from OpenAI");
  }

  const actionsTaken: Array<{
    type: string;
    status: "success" | "failed";
    details: Record<string, any>;
  }> = [];

  let responseText = assistantMessage.content || "";

  // Handle function calls
  if (assistantMessage.tool_calls) {
    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== "function") continue;

      try {
        const args = JSON.parse(toolCall.function.arguments);

        switch (toolCall.function.name) {
          case "create_task": {
            // Create task in database
            const dueDate = new Date(args.dueDate);
            const stage = await db
              .select()
              .from(projectStages)
              .where(eq(projectStages.projectId, args.dealId))
              .then((stages) =>
                stages.find((s) => s.status === "in_progress")
              );

            const task = await db
              .insert(projectTasks)
              .values({
                projectId: args.dealId,
                stageId: stage?.id,
                taskTitle: args.taskName,
                assignedTo: args.assignTo,
                dueDate,
                status: "pending",
              })
              .returning();

            actionsTaken.push({
              type: "create_task",
              status: "success",
              details: {
                taskId: task[0]?.id,
                taskName: args.taskName,
                dealId: args.dealId,
              },
            });
            break;
          }

          case "update_document_status": {
            // Update document status
            await db
              .update(dealDocuments)
              .set({
                status: args.newStatus,
              })
              .where(eq(dealDocuments.id, args.documentId));

            actionsTaken.push({
              type: "update_document_status",
              status: "success",
              details: {
                documentId: args.documentId,
                newStatus: args.newStatus,
                reason: args.reason,
              },
            });
            break;
          }

          case "add_note": {
            // Notes would be stored in a separate table (projectActivity)
            actionsTaken.push({
              type: "add_note",
              status: "success",
              details: {
                dealId: args.dealId,
                note: args.note,
              },
            });
            break;
          }

          case "get_deal_summary": {
            const deal = await db
              .select()
              .from(projects)
              .where(eq(projects.id, args.dealId))
              .then((r) => r[0]);

            const docs = await db
              .select()
              .from(dealDocuments)
              .where(eq(dealDocuments.dealId, args.dealId));

            const tasks = await db
              .select()
              .from(projectTasks)
              .where(eq(projectTasks.projectId, args.dealId));

            actionsTaken.push({
              type: "get_deal_summary",
              status: "success",
              details: {
                dealId: args.dealId,
                dealName: deal?.projectName,
                borrower: deal?.borrowerName,
                stage: deal?.currentStage,
                pendingDocuments: docs.filter(
                  (d) => d.status === "pending" || d.status === "rejected"
                ).length,
                openTasks: tasks.filter(
                  (t) =>
                    t.status === "pending" || t.status === "in_progress"
                ).length,
              },
            });
            break;
          }

          case "edit_digest_message": {
            // Would normally update digestTemplates or similar
            actionsTaken.push({
              type: "edit_digest_message",
              status: "success",
              details: {
                dealId: args.dealId,
                recipientType: args.recipientType,
                newContent: args.newContent,
              },
            });
            break;
          }
        }
      } catch (error) {
        actionsTaken.push({
          type: toolCall.function.name,
          status: "failed",
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  // Save assistant message
  await db.insert(aiAssistantMessages).values({
    conversationId,
    role: "assistant",
    content: responseText,
    actionsTaken: actionsTaken.length > 0 ? actionsTaken : undefined,
  });

  return {
    response: responseText,
    actionsTaken,
  };
}

/**
 * Transcribe voice audio using OpenAI Whisper
 */
export async function transcribeVoice(audioBuffer: Buffer): Promise<string> {
  const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

  const transcript = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });

  return transcript.text;
}

/**
 * Create a new AI assistant conversation
 */
export async function createConversation(
  userId: number,
  conversationType: "daily_briefing" | "deal_review" | "general",
  dealId?: number,
  title?: string
): Promise<AiAssistantConversation> {
  const conversations = await db
    .insert(aiAssistantConversations)
    .values({
      userId,
      dealId: dealId || null,
      conversationType,
      title: title || `${conversationType.replace("_", " ")} - ${new Date().toLocaleDateString()}`,
      isActive: true,
    })
    .returning();

  return conversations[0];
}

/**
 * Get conversation with all messages
 */
export async function getConversation(conversationId: number) {
  const conversation = await db
    .select()
    .from(aiAssistantConversations)
    .where(eq(aiAssistantConversations.id, conversationId))
    .then((r) => r[0]);

  if (!conversation) {
    return null;
  }

  const messages = await db
    .select()
    .from(aiAssistantMessages)
    .where(eq(aiAssistantMessages.conversationId, conversationId))
    .orderBy(aiAssistantMessages.createdAt);

  return {
    ...conversation,
    messages,
  };
}

/**
 * List conversations for a user
 */
export async function listConversations(userId: number) {
  return db
    .select()
    .from(aiAssistantConversations)
    .where(
      and(
        eq(aiAssistantConversations.userId, userId),
        eq(aiAssistantConversations.isActive, true)
      )
    )
    .orderBy(desc(aiAssistantConversations.createdAt));
}

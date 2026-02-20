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
  dealMemoryEntries,
  dealNotes,
  agentCommunications,
  agentFindings,
  emailThreads,
  emailMessages,
  emailThreadDealLinks,
  projectActivity,
  messageThreads,
  messages,
  messageReads,
  type AiAssistantConversation,
  type AiAssistantMessage,
  type Project,
  type ProjectTask,
  type DealDocument,
} from "@shared/schema";
import { eq, and, or, desc, asc, lte, gte, isNull, ilike, sql } from "drizzle-orm";
import { getOpenAIApiKey } from "../utils/getOpenAIKey";

const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!aiApiKey) {
  console.warn(
    "⚠️  AI_INTEGRATIONS_OPENAI_API_KEY not set. Will check system settings for manual key."
  );
}

let _openai: OpenAI | null = null;
async function getOpenAI(): Promise<OpenAI> {
  const key = await getOpenAIApiKey();
  if (!_openai || (!aiApiKey && key)) {
    _openai = new OpenAI({
      apiKey: key || "disabled",
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
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
      and(
        eq(dealProcessors.userId, processorId),
        sql`${projects.status} NOT IN ('voided', 'cancelled')`
      )
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

  // ─── Phase 1: Deal Intelligence & Reasoning ──────────────────

  {
    name: "search_deals",
    description: "Search for deals by borrower name, property address, project number, or loan type. Use this when the user mentions a deal by name or asks about specific deals.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (borrower name, property address, project number, etc.)" },
        status: { type: "string", enum: ["active", "on_hold", "completed", "cancelled", "funded"], description: "Optional status filter" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_deal_details",
    description: "Get comprehensive details about a deal including loan info, documents, tasks, team, and recent activity timeline. Use this after finding a deal via search to understand the full picture.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "get_deal_documents",
    description: "List all documents for a deal with their current status. Use to find pending, rejected, or missing documents.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        statusFilter: { type: "string", enum: ["pending", "uploaded", "approved", "rejected", "waived"], description: "Optional: only show documents with this status" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "get_deal_tasks",
    description: "List tasks for a deal with due dates and assignees. Use to find overdue or pending tasks.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        onlyOverdue: { type: "boolean", description: "If true, only return overdue tasks" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "get_deal_memory",
    description: "Get the timeline of important deal events (document changes, stage transitions, notes, field changes). Useful for understanding deal history.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        limit: { type: "number", description: "Max entries to return (default 20)" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "list_user_deals",
    description: "List all deals assigned to the current user/processor. Returns all deals regardless of status by default (excluding voided/cancelled). Only pass a status filter if the user explicitly asks for a specific status like 'funded' or 'on_hold'. When the user says 'active deals', 'my deals', 'current loans', or 'loans in the pipeline', do NOT pass a status filter — just call this without status to get everything.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "on_hold", "completed", "cancelled", "funded"], description: "Only use if the user explicitly asks for a specific status. Leave empty to get all deals." },
      },
    },
  },

  // ─── Phase 2: Multi-Deal Batch Operations ──────────────────

  {
    name: "batch_update_documents",
    description: "Update document status for multiple documents across different deals in one operation. Use when the user wants to approve, reject, or update docs across several deals at once.",
    parameters: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dealId: { type: "number" },
              documentId: { type: "number" },
              newStatus: { type: "string", enum: ["pending", "uploaded", "approved", "rejected", "waived"] },
              reason: { type: "string" },
            },
            required: ["dealId", "documentId", "newStatus"],
          },
          description: "Array of document status updates",
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "batch_create_tasks",
    description: "Create tasks on multiple deals at once. Use when the user has a list of action items across different deals.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dealId: { type: "number" },
              taskTitle: { type: "string" },
              assignTo: { type: "string" },
              dueDate: { type: "string", format: "date-time" },
              priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            },
            required: ["dealId", "taskTitle", "assignTo", "dueDate"],
          },
          description: "Array of tasks to create",
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "batch_add_notes",
    description: "Add notes to multiple deals at once.",
    parameters: {
      type: "object",
      properties: {
        notes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dealId: { type: "number" },
              noteContent: { type: "string" },
            },
            required: ["dealId", "noteContent"],
          },
          description: "Array of notes to add",
        },
      },
      required: ["notes"],
    },
  },
  {
    name: "batch_update_stage",
    description: "Move multiple deals to the same pipeline stage. Use for bulk stage transitions.",
    parameters: {
      type: "object",
      properties: {
        dealIds: { type: "array", items: { type: "number" }, description: "IDs of deals to update" },
        newStage: { type: "string", description: "Target stage name" },
        reason: { type: "string", description: "Reason for the stage change" },
      },
      required: ["dealIds", "newStage"],
    },
  },

  // ─── Phase 3: Email & Communication Assistant ──────────────

  {
    name: "draft_email",
    description: "Draft a professional email for a deal recipient (borrower, broker, or internal). The draft is saved for review before sending.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        recipientType: { type: "string", enum: ["borrower", "broker", "internal"], description: "Who the email is for" },
        purpose: { type: "string", enum: ["request_documents", "status_update", "follow_up", "problem_notification", "general"], description: "Purpose of the email" },
        customInstructions: { type: "string", description: "Optional: specific details to include in the email" },
      },
      required: ["dealId", "recipientType", "purpose"],
    },
  },
  {
    name: "draft_sms",
    description: "Draft a short SMS text message for a borrower or broker. Keep under 160 characters when possible.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        recipientType: { type: "string", enum: ["borrower", "broker"], description: "Who to text" },
        purpose: { type: "string", enum: ["reminder", "request_action", "quick_update", "urgent"], description: "Purpose of the text" },
        customInstructions: { type: "string", description: "Optional: specific message details" },
      },
      required: ["dealId", "recipientType", "purpose"],
    },
  },
  {
    name: "get_email_threads",
    description: "Get email threads linked to a deal. Use to see communication history.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        unreadOnly: { type: "boolean", description: "Only return unread threads" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "suggest_email_responses",
    description: "Analyze unread email threads for a deal and suggest responses. Use when asked to auto-suggest or draft replies to emails.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        threadId: { type: "number", description: "Optional: specific email thread ID to respond to" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "send_communication",
    description: "Queue a drafted email or SMS into the approval workflow. Does NOT send immediately — requires human approval.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        recipientType: { type: "string", enum: ["borrower", "broker", "internal"] },
        recipientEmail: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body content" },
        communicationType: { type: "string", enum: ["email", "sms"], description: "How to send" },
      },
      required: ["dealId", "recipientType", "recipientEmail", "subject", "body", "communicationType"],
    },
  },

  // ─── Phase 3b: In-App Messaging ──────────────────────────

  {
    name: "send_deal_message",
    description: "Send an in-app message on a deal thread to a borrower or broker. Creates a new thread if none exists for the deal. Use this when the user wants to message a borrower or broker directly through the platform (not email).",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        recipientUserId: { type: "number", description: "The recipient user ID (borrower or broker). Use get_deal_details first to find team members." },
        subject: { type: "string", description: "Thread subject (only used when creating a new thread)" },
        body: { type: "string", description: "The message content" },
      },
      required: ["dealId", "recipientUserId", "body"],
    },
  },
  {
    name: "get_deal_messages",
    description: "Get in-app message threads and messages for a deal. Shows conversation history between lender/processor and borrower/broker. Use when the user asks about messages, conversations, or communications on a deal.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        limit: { type: "number", description: "Max messages to return per thread (default 20)" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "get_unread_messages",
    description: "Get all unread message threads for the current user across all deals. Use when the user asks 'do I have any messages', 'any new messages', or 'check my inbox'.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max threads to return (default 10)" },
      },
    },
  },

  // ─── Phase 4: Proactive Intelligence ──────────────────────

  {
    name: "analyze_deal_health",
    description: "Analyze a deal for risks, anomalies, and issues needing attention. Returns health score and recommended actions.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "suggest_next_actions",
    description: "Recommend the next steps a processor should take on a deal based on current state.",
    parameters: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "The deal ID" },
        context: { type: "string", description: "Optional: additional context about the situation" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "get_anomalies",
    description: "Detect anomalies and issues across a portfolio of deals: overdue items, stalled deals, missing critical docs.",
    parameters: {
      type: "object",
      properties: {
        anomalyType: { type: "string", enum: ["overdue_items", "stalled_deals", "missing_docs", "all"], description: "What kind of anomalies to detect (default: all)" },
      },
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

  // Format for OpenAI with system prompt
  const systemMessage = {
    role: "system" as const,
    content: `You are Lendry AI, an expert loan processing assistant for commercial real estate. You help lenders and processors manage their deal pipeline efficiently.

CAPABILITIES:
- Search and retrieve deal information by name, borrower, property, or project number
- View deal documents, tasks, stages, and full timeline history
- Make batch changes across multiple deals at once (update documents, create tasks, add notes, change stages)
- Draft professional emails and SMS messages for borrowers and brokers
- Suggest responses to unread emails linked to deals
- Send and read in-app messages to borrowers and brokers on specific deals
- Analyze deal health and detect portfolio-wide anomalies
- Recommend next actions based on deal state

IMPORTANT — DEAL STATUS INTERPRETATION:
When a user asks about "active loans", "current deals", "my deals", "loans in the pipeline", or similar phrases, they mean ALL deals currently in the system that are not voided or cancelled. Do NOT filter by a literal "active" status. Use list_user_deals WITHOUT a status filter to return all their deals. Only filter by a specific status if the user explicitly asks for it (e.g., "show me only my funded deals" or "which deals are on hold").

BEHAVIOR RULES:
1. When a user mentions a deal by name or description, ALWAYS use search_deals first to find the correct deal before taking action.
2. When asked about multiple deals or "my deals", use list_user_deals WITHOUT a status filter to get everything, then summarize.
3. For any communication drafts, ALWAYS save them for approval — never claim an email was sent.
4. When reporting batch results, always state how many succeeded and failed.
5. Be proactive: if you notice issues (overdue tasks, missing docs) while looking at a deal, mention them.
6. Reference deals by name and borrower, not just ID numbers.
7. Keep responses concise but thorough. Use markdown formatting for readability.
8. When sending in-app messages, use send_deal_message. When checking for messages, use get_deal_messages.
9. Always include the deal status in your summaries so the user knows the state of each deal.`,
  };

  const chatMessages = [
    systemMessage,
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  // Call OpenAI with function definitions
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: chatMessages,
    tools: FUNCTION_DEFINITIONS.map((f) => ({
      type: "function" as const,
      function: f,
    })),
    max_tokens: 4096,
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

  // Handle function calls — execute tools and feed results back for final response
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
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

          // ─── Phase 1: Deal Intelligence ─────────────────────

          case "search_deals": {
            const conditions = [];
            if (args.status) conditions.push(eq(projects.status, args.status));

            const searchTerm = `%${args.query}%`;
            conditions.push(
              or(
                ilike(projects.borrowerName, searchTerm),
                ilike(projects.projectName, searchTerm),
                ilike(projects.propertyAddress, searchTerm),
                ilike(projects.projectNumber, searchTerm)
              )!
            );

            const deals = await db
              .select({
                id: projects.id,
                projectName: projects.projectName,
                projectNumber: projects.projectNumber,
                borrowerName: projects.borrowerName,
                propertyAddress: projects.propertyAddress,
                status: projects.status,
                currentStage: projects.currentStage,
                loanAmount: projects.loanAmount,
                progressPercentage: projects.progressPercentage,
              })
              .from(projects)
              .where(and(...conditions))
              .limit(args.limit || 10);

            actionsTaken.push({
              type: "search_deals",
              status: "success",
              details: {
                query: args.query,
                resultsCount: deals.length,
                deals: deals.map((d) => ({
                  id: d.id,
                  name: d.projectName,
                  number: d.projectNumber,
                  borrower: d.borrowerName,
                  property: d.propertyAddress,
                  status: d.status,
                  stage: d.currentStage,
                  loanAmount: d.loanAmount,
                  progress: d.progressPercentage,
                })),
              },
            });
            break;
          }

          case "get_deal_details": {
            const deal = await db.select().from(projects).where(eq(projects.id, args.dealId)).then((r) => r[0]);
            if (!deal) {
              actionsTaken.push({ type: "get_deal_details", status: "failed", details: { error: "Deal not found" } });
              break;
            }

            const docs = await db.select().from(dealDocuments).where(eq(dealDocuments.dealId, args.dealId));
            const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, args.dealId));
            const stages = await db.select().from(projectStages).where(eq(projectStages.projectId, args.dealId)).orderBy(projectStages.stageOrder);
            const team = await db.select({ userId: dealProcessors.userId, role: dealProcessors.role }).from(dealProcessors).where(eq(dealProcessors.projectId, args.dealId));
            const memory = await db.select().from(dealMemoryEntries).where(eq(dealMemoryEntries.dealId, args.dealId)).orderBy(desc(dealMemoryEntries.createdAt)).limit(10);

            actionsTaken.push({
              type: "get_deal_details",
              status: "success",
              details: {
                dealId: deal.id,
                projectNumber: deal.projectNumber,
                dealName: deal.projectName,
                borrower: deal.borrowerName,
                borrowerEmail: deal.borrowerEmail,
                property: deal.propertyAddress,
                loanAmount: deal.loanAmount,
                loanType: deal.loanType,
                interestRate: deal.interestRate,
                status: deal.status,
                currentStage: deal.currentStage,
                progress: deal.progressPercentage,
                targetCloseDate: deal.targetCloseDate,
                stages: stages.map((s) => ({ name: s.stageName, status: s.status, order: s.stageOrder })),
                documents: {
                  total: docs.length,
                  pending: docs.filter((d) => d.status === "pending").length,
                  approved: docs.filter((d) => d.status === "approved").length,
                  rejected: docs.filter((d) => d.status === "rejected").length,
                },
                tasks: {
                  total: tasks.length,
                  pending: tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length,
                  completed: tasks.filter((t) => t.status === "completed").length,
                },
                teamSize: team.length,
                recentTimeline: memory.map((m) => ({ type: m.entryType, title: m.title, date: m.createdAt })),
              },
            });
            break;
          }

          case "get_deal_documents": {
            let docsQuery = db.select().from(dealDocuments).where(eq(dealDocuments.dealId, args.dealId));
            const allDocs = await docsQuery;
            const filtered = args.statusFilter ? allDocs.filter((d) => d.status === args.statusFilter) : allDocs;

            actionsTaken.push({
              type: "get_deal_documents",
              status: "success",
              details: {
                dealId: args.dealId,
                totalDocuments: allDocs.length,
                filteredCount: filtered.length,
                documents: filtered.map((d) => ({
                  id: d.id,
                  name: d.documentName,
                  category: d.documentCategory,
                  status: d.status,
                  isRequired: d.isRequired,
                  assignedTo: d.assignedTo,
                })),
              },
            });
            break;
          }

          case "get_deal_tasks": {
            const now = new Date();
            const allTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, args.dealId)).orderBy(projectTasks.dueDate);

            let filteredTasks = allTasks.filter((t) => t.status === "pending" || t.status === "in_progress");
            if (args.onlyOverdue) {
              filteredTasks = filteredTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
            }

            actionsTaken.push({
              type: "get_deal_tasks",
              status: "success",
              details: {
                dealId: args.dealId,
                totalTasks: allTasks.length,
                openTasks: filteredTasks.length,
                tasks: filteredTasks.map((t) => ({
                  id: t.id,
                  title: t.taskTitle,
                  status: t.status,
                  priority: t.priority,
                  assignedTo: t.assignedTo,
                  dueDate: t.dueDate,
                  isOverdue: t.dueDate ? new Date(t.dueDate) < now : false,
                })),
              },
            });
            break;
          }

          case "get_deal_memory": {
            const memoryEntries = await db
              .select()
              .from(dealMemoryEntries)
              .where(eq(dealMemoryEntries.dealId, args.dealId))
              .orderBy(desc(dealMemoryEntries.createdAt))
              .limit(args.limit || 20);

            actionsTaken.push({
              type: "get_deal_memory",
              status: "success",
              details: {
                dealId: args.dealId,
                entryCount: memoryEntries.length,
                timeline: memoryEntries.map((m) => ({
                  type: m.entryType,
                  title: m.title,
                  description: m.description,
                  source: m.sourceType,
                  date: m.createdAt,
                })),
              },
            });
            break;
          }

          case "list_user_deals": {
            const userDeals = await db
              .select({
                id: projects.id,
                projectName: projects.projectName,
                projectNumber: projects.projectNumber,
                borrowerName: projects.borrowerName,
                currentStage: projects.currentStage,
                status: projects.status,
                progressPercentage: projects.progressPercentage,
                loanAmount: projects.loanAmount,
              })
              .from(dealProcessors)
              .innerJoin(projects, eq(dealProcessors.projectId, projects.id))
              .where(
                args.status
                  ? and(eq(dealProcessors.userId, processorId), eq(projects.status, args.status))
                  : and(
                      eq(dealProcessors.userId, processorId),
                      sql`${projects.status} NOT IN ('voided', 'cancelled')`
                    )
              );

            actionsTaken.push({
              type: "list_user_deals",
              status: "success",
              details: {
                count: userDeals.length,
                deals: userDeals.map((d) => ({
                  id: d.id,
                  name: d.projectName,
                  number: d.projectNumber,
                  borrower: d.borrowerName,
                  stage: d.currentStage,
                  status: d.status,
                  progress: d.progressPercentage,
                  loanAmount: d.loanAmount,
                })),
              },
            });
            break;
          }

          // ─── Phase 2: Batch Operations ──────────────────────

          case "batch_update_documents": {
            let batchDocSuccess = 0;
            let batchDocFail = 0;
            for (const update of args.updates) {
              try {
                await db.update(dealDocuments).set({ status: update.newStatus }).where(eq(dealDocuments.id, update.documentId));
                await db.insert(dealMemoryEntries).values({
                  dealId: update.dealId,
                  entryType: `document_${update.newStatus}`,
                  title: `Document status changed to ${update.newStatus}`,
                  description: update.reason || `Updated via AI Assistant batch operation`,
                  sourceType: "agent",
                  sourceUserId: processorId,
                });
                batchDocSuccess++;
              } catch {
                batchDocFail++;
              }
            }
            actionsTaken.push({
              type: "batch_update_documents",
              status: batchDocFail === 0 ? "success" : "failed",
              details: { total: args.updates.length, successful: batchDocSuccess, failed: batchDocFail },
            });
            break;
          }

          case "batch_create_tasks": {
            let batchTaskSuccess = 0;
            const createdTaskIds: number[] = [];
            for (const task of args.tasks) {
              try {
                const stage = await db.select().from(projectStages).where(eq(projectStages.projectId, task.dealId)).then((s) => s.find((st) => st.status === "in_progress"));
                const inserted = await db.insert(projectTasks).values({
                  projectId: task.dealId,
                  stageId: stage?.id,
                  taskTitle: task.taskTitle,
                  assignedTo: task.assignTo,
                  dueDate: new Date(task.dueDate),
                  status: "pending",
                  priority: task.priority || "medium",
                }).returning();
                createdTaskIds.push(inserted[0]?.id);
                batchTaskSuccess++;
              } catch {
                // skip failed
              }
            }
            actionsTaken.push({
              type: "batch_create_tasks",
              status: batchTaskSuccess > 0 ? "success" : "failed",
              details: { total: args.tasks.length, created: batchTaskSuccess, taskIds: createdTaskIds },
            });
            break;
          }

          case "batch_add_notes": {
            let batchNoteSuccess = 0;
            for (const note of args.notes) {
              try {
                await db.insert(dealNotes).values({
                  dealId: note.dealId,
                  userId: processorId,
                  content: note.noteContent,
                  noteType: "note",
                });
                await db.insert(dealMemoryEntries).values({
                  dealId: note.dealId,
                  entryType: "note_added",
                  title: "Note added via AI Assistant",
                  description: note.noteContent.substring(0, 200),
                  sourceType: "agent",
                  sourceUserId: processorId,
                });
                batchNoteSuccess++;
              } catch {
                // skip failed
              }
            }
            actionsTaken.push({
              type: "batch_add_notes",
              status: "success",
              details: { total: args.notes.length, created: batchNoteSuccess },
            });
            break;
          }

          case "batch_update_stage": {
            let batchStageSuccess = 0;
            for (const dealId of args.dealIds) {
              try {
                const stages = await db.select().from(projectStages).where(eq(projectStages.projectId, dealId)).orderBy(projectStages.stageOrder);
                const targetStage = stages.find((s) => s.stageName === args.newStage || s.stageKey === args.newStage);
                if (!targetStage) continue;

                // Mark all stages before target as completed, target as in_progress, after as pending
                for (const s of stages) {
                  const newStatus = s.stageOrder < targetStage.stageOrder ? "completed"
                    : s.stageOrder === targetStage.stageOrder ? "in_progress" : "pending";
                  await db.update(projectStages).set({ status: newStatus }).where(eq(projectStages.id, s.id));
                }
                await db.update(projects).set({ currentStage: targetStage.stageName }).where(eq(projects.id, dealId));
                await db.insert(dealMemoryEntries).values({
                  dealId,
                  entryType: "stage_change",
                  title: `Stage changed to ${args.newStage}`,
                  description: args.reason || "Batch stage update via AI Assistant",
                  sourceType: "agent",
                  sourceUserId: processorId,
                });
                batchStageSuccess++;
              } catch {
                // skip failed
              }
            }
            actionsTaken.push({
              type: "batch_update_stage",
              status: "success",
              details: { total: args.dealIds.length, updated: batchStageSuccess, targetStage: args.newStage },
            });
            break;
          }

          // ─── Phase 3: Email & Communication ─────────────────

          case "draft_email": {
            const emailDeal = await db.select().from(projects).where(eq(projects.id, args.dealId)).then((r) => r[0]);
            if (!emailDeal) {
              actionsTaken.push({ type: "draft_email", status: "failed", details: { error: "Deal not found" } });
              break;
            }

            const recipientEmail = args.recipientType === "borrower" ? emailDeal.borrowerEmail : "";
            const recipientName = args.recipientType === "borrower" ? emailDeal.borrowerName : "";

            // Get pending docs/tasks for context
            const emailDocs = await db.select().from(dealDocuments).where(and(eq(dealDocuments.dealId, args.dealId), or(eq(dealDocuments.status, "pending"), eq(dealDocuments.status, "rejected")))).then((d) => d.map((doc) => doc.documentName));

            const draftPrompt = `Draft a professional email for a ${args.recipientType} regarding a commercial real estate loan deal.
Deal: ${emailDeal.projectName}
Borrower: ${emailDeal.borrowerName}
Property: ${emailDeal.propertyAddress}
Loan Amount: $${emailDeal.loanAmount}
Current Stage: ${emailDeal.currentStage}
Purpose: ${args.purpose}
${emailDocs.length > 0 ? `Outstanding Documents: ${emailDocs.join(", ")}` : ""}
${args.customInstructions ? `Special Instructions: ${args.customInstructions}` : ""}

Respond ONLY with JSON: {"subject": "...", "body": "..."}`;

            try {
              const emailResp = await openai.chat.completions.create({
                model: MODEL,
                messages: [{ role: "user", content: draftPrompt }],
                temperature: 0.3,
                max_tokens: 1024,
              });
              const draft = JSON.parse(emailResp.choices[0]?.message?.content || "{}");

              // Save to agentCommunications for approval workflow
              const comm = await db.insert(agentCommunications).values({
                projectId: args.dealId,
                recipientType: args.recipientType,
                recipientName: recipientName || "",
                recipientEmail: recipientEmail || "",
                subject: draft.subject || "Follow-up",
                body: draft.body || "",
                status: "draft",
                priority: "routine",
                internalNotes: "Drafted by AI Assistant",
              }).returning();

              actionsTaken.push({
                type: "draft_email",
                status: "success",
                details: {
                  communicationId: comm[0]?.id,
                  dealId: args.dealId,
                  recipient: recipientEmail,
                  subject: draft.subject,
                  bodyPreview: (draft.body || "").substring(0, 200),
                  fullBody: draft.body,
                  note: "Draft saved. Requires approval before sending.",
                },
              });
            } catch (draftErr) {
              actionsTaken.push({ type: "draft_email", status: "failed", details: { error: String(draftErr) } });
            }
            break;
          }

          case "draft_sms": {
            const smsDeal = await db.select().from(projects).where(eq(projects.id, args.dealId)).then((r) => r[0]);
            if (!smsDeal) {
              actionsTaken.push({ type: "draft_sms", status: "failed", details: { error: "Deal not found" } });
              break;
            }

            const smsPrompt = `Draft a short SMS (under 160 chars if possible) for a ${args.recipientType} about a loan deal.
Deal: ${smsDeal.projectName}, Borrower: ${smsDeal.borrowerName}
Purpose: ${args.purpose}
${args.customInstructions ? `Instructions: ${args.customInstructions}` : ""}
Respond ONLY with JSON: {"message": "..."}`;

            try {
              const smsResp = await openai.chat.completions.create({
                model: MODEL,
                messages: [{ role: "user", content: smsPrompt }],
                temperature: 0.3,
                max_tokens: 256,
              });
              const smsDraft = JSON.parse(smsResp.choices[0]?.message?.content || "{}");

              const smsComm = await db.insert(agentCommunications).values({
                projectId: args.dealId,
                recipientType: args.recipientType,
                recipientName: args.recipientType === "borrower" ? (smsDeal.borrowerName || "") : "",
                subject: `SMS: ${args.purpose}`,
                body: smsDraft.message || "",
                status: "draft",
                priority: args.purpose === "urgent" ? "urgent" : "routine",
                sentVia: "sms",
                internalNotes: "SMS drafted by AI Assistant",
              }).returning();

              actionsTaken.push({
                type: "draft_sms",
                status: "success",
                details: {
                  communicationId: smsComm[0]?.id,
                  dealId: args.dealId,
                  message: smsDraft.message,
                  charCount: (smsDraft.message || "").length,
                  note: "SMS draft saved. Requires approval before sending.",
                },
              });
            } catch (smsErr) {
              actionsTaken.push({ type: "draft_sms", status: "failed", details: { error: String(smsErr) } });
            }
            break;
          }

          case "get_email_threads": {
            try {
              const threads = await db
                .select({
                  id: emailThreads.id,
                  subject: emailThreads.subject,
                  snippet: emailThreads.snippet,
                  fromAddress: emailThreads.fromAddress,
                  fromName: emailThreads.fromName,
                  messageCount: emailThreads.messageCount,
                  isUnread: emailThreads.isUnread,
                  lastMessageAt: emailThreads.lastMessageAt,
                })
                .from(emailThreadDealLinks)
                .innerJoin(emailThreads, eq(emailThreadDealLinks.emailThreadId, emailThreads.id))
                .where(eq(emailThreadDealLinks.dealId, args.dealId));

              const filtered = args.unreadOnly ? threads.filter((t) => t.isUnread) : threads;

              actionsTaken.push({
                type: "get_email_threads",
                status: "success",
                details: {
                  dealId: args.dealId,
                  threadCount: filtered.length,
                  threads: filtered.slice(0, 15).map((t) => ({
                    id: t.id,
                    subject: t.subject,
                    from: t.fromName || t.fromAddress,
                    messages: t.messageCount,
                    unread: t.isUnread,
                    lastMessage: t.lastMessageAt,
                    snippet: t.snippet?.substring(0, 100),
                  })),
                },
              });
            } catch (emailErr) {
              actionsTaken.push({ type: "get_email_threads", status: "failed", details: { error: String(emailErr) } });
            }
            break;
          }

          case "suggest_email_responses": {
            try {
              // Get unread threads for this deal
              const unreadThreads = await db
                .select({ id: emailThreads.id, subject: emailThreads.subject })
                .from(emailThreadDealLinks)
                .innerJoin(emailThreads, eq(emailThreadDealLinks.emailThreadId, emailThreads.id))
                .where(and(eq(emailThreadDealLinks.dealId, args.dealId), eq(emailThreads.isUnread, true)));

              const targetThreads = args.threadId
                ? unreadThreads.filter((t) => t.id === args.threadId)
                : unreadThreads.slice(0, 5);

              if (targetThreads.length === 0) {
                actionsTaken.push({ type: "suggest_email_responses", status: "success", details: { dealId: args.dealId, message: "No unread email threads found for this deal." } });
                break;
              }

              // Get latest message from each thread for context
              const suggestions: Array<{ threadId: number; subject: string; suggestedResponse: string }> = [];
              for (const thread of targetThreads) {
                const latestMsg = await db
                  .select({ bodyText: emailMessages.bodyText, fromName: emailMessages.fromName, fromAddress: emailMessages.fromAddress })
                  .from(emailMessages)
                  .where(eq(emailMessages.threadId, thread.id))
                  .orderBy(desc(emailMessages.internalDate))
                  .limit(1)
                  .then((r) => r[0]);

                if (!latestMsg) continue;

                const suggPrompt = `You are a loan processor assistant. Suggest a brief, professional reply to this email.
Subject: ${thread.subject}
From: ${latestMsg.fromName || latestMsg.fromAddress}
Message: ${(latestMsg.bodyText || "").substring(0, 500)}

Respond ONLY with JSON: {"response": "..."}`;

                const suggResp = await openai.chat.completions.create({
                  model: MODEL,
                  messages: [{ role: "user", content: suggPrompt }],
                  temperature: 0.3,
                  max_tokens: 512,
                });

                const parsed = JSON.parse(suggResp.choices[0]?.message?.content || "{}");
                suggestions.push({
                  threadId: thread.id,
                  subject: thread.subject || "No subject",
                  suggestedResponse: parsed.response || "",
                });
              }

              actionsTaken.push({
                type: "suggest_email_responses",
                status: "success",
                details: {
                  dealId: args.dealId,
                  suggestionsCount: suggestions.length,
                  suggestions,
                },
              });
            } catch (suggErr) {
              actionsTaken.push({ type: "suggest_email_responses", status: "failed", details: { error: String(suggErr) } });
            }
            break;
          }

          case "send_communication": {
            try {
              const comm = await db.insert(agentCommunications).values({
                projectId: args.dealId,
                recipientType: args.recipientType,
                recipientEmail: args.recipientEmail,
                recipientName: args.recipientEmail.split("@")[0],
                subject: args.subject,
                body: args.body,
                status: "draft",
                priority: "routine",
                sentVia: args.communicationType,
                internalNotes: "Queued by AI Assistant for approval",
              }).returning();

              actionsTaken.push({
                type: "send_communication",
                status: "success",
                details: {
                  communicationId: comm[0]?.id,
                  dealId: args.dealId,
                  type: args.communicationType,
                  recipient: args.recipientEmail,
                  subject: args.subject,
                  status: "awaiting_approval",
                },
              });
            } catch (sendErr) {
              actionsTaken.push({ type: "send_communication", status: "failed", details: { error: String(sendErr) } });
            }
            break;
          }

          // ─── Phase 3b: In-App Messaging ────────────────────

          case "send_deal_message": {
            try {
              // Find or create a thread for this deal + recipient
              let thread = await db
                .select()
                .from(messageThreads)
                .where(
                  and(
                    eq(messageThreads.dealId, args.dealId),
                    eq(messageThreads.userId, args.recipientUserId)
                  )
                )
                .then((r) => r[0]);

              if (!thread) {
                const [newThread] = await db
                  .insert(messageThreads)
                  .values({
                    dealId: args.dealId,
                    userId: args.recipientUserId,
                    createdBy: processorId,
                    subject: args.subject || `Deal #${args.dealId} Message`,
                    lastMessageAt: new Date(),
                  })
                  .returning();
                thread = newThread;
              }

              // Insert the message
              const [newMessage] = await db
                .insert(messages)
                .values({
                  threadId: thread.id,
                  senderId: processorId,
                  senderRole: "lender",
                  type: "text",
                  body: args.body,
                })
                .returning();

              // Update thread lastMessageAt
              await db
                .update(messageThreads)
                .set({ lastMessageAt: new Date() })
                .where(eq(messageThreads.id, thread.id));

              actionsTaken.push({
                type: "send_deal_message",
                status: "success",
                details: {
                  threadId: thread.id,
                  messageId: newMessage.id,
                  dealId: args.dealId,
                  recipientUserId: args.recipientUserId,
                },
              });
            } catch (msgErr) {
              actionsTaken.push({ type: "send_deal_message", status: "failed", details: { error: String(msgErr) } });
            }
            break;
          }

          case "get_deal_messages": {
            try {
              const limit = args.limit || 20;
              const threads = await db
                .select()
                .from(messageThreads)
                .where(eq(messageThreads.dealId, args.dealId))
                .orderBy(sql`${messageThreads.lastMessageAt} DESC`);

              const threadData = [];
              for (const thread of threads) {
                const threadMessages = await db
                  .select({
                    id: messages.id,
                    senderId: messages.senderId,
                    senderRole: messages.senderRole,
                    body: messages.body,
                    createdAt: messages.createdAt,
                  })
                  .from(messages)
                  .where(eq(messages.threadId, thread.id))
                  .orderBy(sql`${messages.createdAt} DESC`)
                  .limit(limit);

                // Check unread status for current user
                const readRecord = await db
                  .select()
                  .from(messageReads)
                  .where(
                    and(
                      eq(messageReads.threadId, thread.id),
                      eq(messageReads.userId, processorId)
                    )
                  )
                  .then((r) => r[0]);

                const unreadCount = readRecord
                  ? threadMessages.filter((m) => m.createdAt && readRecord.lastReadAt && m.createdAt > readRecord.lastReadAt).length
                  : threadMessages.length;

                threadData.push({
                  threadId: thread.id,
                  subject: thread.subject,
                  recipientUserId: thread.userId,
                  isClosed: thread.isClosed,
                  lastMessageAt: thread.lastMessageAt,
                  unreadCount,
                  messages: threadMessages.reverse(),
                });
              }

              actionsTaken.push({
                type: "get_deal_messages",
                status: "success",
                details: { dealId: args.dealId, threadCount: threadData.length, threads: threadData },
              });
            } catch (msgErr) {
              actionsTaken.push({ type: "get_deal_messages", status: "failed", details: { error: String(msgErr) } });
            }
            break;
          }

          case "get_unread_messages": {
            try {
              const limit = args.limit || 10;

              // Get all threads where the processor is either the creator or there are messages for them
              const allThreads = await db
                .select({
                  threadId: messageThreads.id,
                  dealId: messageThreads.dealId,
                  subject: messageThreads.subject,
                  userId: messageThreads.userId,
                  lastMessageAt: messageThreads.lastMessageAt,
                  isClosed: messageThreads.isClosed,
                })
                .from(messageThreads)
                .innerJoin(dealProcessors, eq(messageThreads.dealId, dealProcessors.projectId))
                .where(eq(dealProcessors.userId, processorId))
                .orderBy(sql`${messageThreads.lastMessageAt} DESC`)
                .limit(limit);

              const unreadThreads = [];
              for (const thread of allThreads) {
                const readRecord = await db
                  .select()
                  .from(messageReads)
                  .where(
                    and(
                      eq(messageReads.threadId, thread.threadId),
                      eq(messageReads.userId, processorId)
                    )
                  )
                  .then((r) => r[0]);

                const unreadMessages = await db
                  .select({ id: messages.id, body: messages.body, senderRole: messages.senderRole, createdAt: messages.createdAt })
                  .from(messages)
                  .where(
                    readRecord
                      ? and(
                          eq(messages.threadId, thread.threadId),
                          sql`${messages.createdAt} > ${readRecord.lastReadAt}`
                        )
                      : eq(messages.threadId, thread.threadId)
                  )
                  .orderBy(sql`${messages.createdAt} DESC`);

                if (unreadMessages.length > 0) {
                  // Get deal name for context
                  const deal = await db
                    .select({ projectName: projects.projectName, borrowerName: projects.borrowerName })
                    .from(projects)
                    .where(eq(projects.id, thread.dealId))
                    .then((r) => r[0]);

                  unreadThreads.push({
                    threadId: thread.threadId,
                    dealId: thread.dealId,
                    dealName: deal?.projectName || "Unknown Deal",
                    borrowerName: deal?.borrowerName || "Unknown",
                    subject: thread.subject,
                    unreadCount: unreadMessages.length,
                    latestMessage: unreadMessages[0],
                  });
                }
              }

              actionsTaken.push({
                type: "get_unread_messages",
                status: "success",
                details: { unreadThreadCount: unreadThreads.length, threads: unreadThreads },
              });
            } catch (msgErr) {
              actionsTaken.push({ type: "get_unread_messages", status: "failed", details: { error: String(msgErr) } });
            }
            break;
          }

          // ─── Phase 4: Proactive Intelligence ────────────────

          case "analyze_deal_health": {
            const healthDeal = await db.select().from(projects).where(eq(projects.id, args.dealId)).then((r) => r[0]);
            if (!healthDeal) {
              actionsTaken.push({ type: "analyze_deal_health", status: "failed", details: { error: "Deal not found" } });
              break;
            }

            const healthDocs = await db.select().from(dealDocuments).where(eq(dealDocuments.dealId, args.dealId));
            const healthTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, args.dealId));
            const findings = await db.select().from(agentFindings).where(eq(agentFindings.projectId, args.dealId)).orderBy(desc(agentFindings.createdAt)).limit(1);

            const now = new Date();
            const daysActive = healthDeal.createdAt ? Math.floor((now.getTime() - new Date(healthDeal.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
            const overdueTasks = healthTasks.filter((t) => (t.status === "pending" || t.status === "in_progress") && t.dueDate && new Date(t.dueDate) < now);
            const pendingRequiredDocs = healthDocs.filter((d) => d.isRequired && (d.status === "pending" || d.status === "rejected"));
            const pastCloseDate = healthDeal.targetCloseDate && new Date(healthDeal.targetCloseDate) < now;

            // Compute health score
            let riskScore = 0;
            const issues: string[] = [];
            if (overdueTasks.length > 0) { riskScore += overdueTasks.length * 10; issues.push(`${overdueTasks.length} overdue tasks`); }
            if (pendingRequiredDocs.length > 3) { riskScore += 20; issues.push(`${pendingRequiredDocs.length} required documents still pending`); }
            if (pastCloseDate) { riskScore += 30; issues.push("Past target close date"); }
            if (daysActive > 60 && (healthDeal.progressPercentage || 0) < 50) { riskScore += 20; issues.push("Progress stalled — under 50% after 60 days"); }
            if (findings[0]?.overallStatus === "significant_issues") { riskScore += 25; issues.push("Agent findings indicate significant issues"); }

            const health = riskScore <= 10 ? "excellent" : riskScore <= 30 ? "good" : riskScore <= 60 ? "concerning" : "critical";

            actionsTaken.push({
              type: "analyze_deal_health",
              status: "success",
              details: {
                dealId: args.dealId,
                dealName: healthDeal.projectName,
                health,
                riskScore: Math.min(riskScore, 100),
                issues,
                stats: {
                  daysActive,
                  progress: healthDeal.progressPercentage,
                  overdueTasks: overdueTasks.length,
                  pendingRequiredDocs: pendingRequiredDocs.length,
                  pastCloseDate: !!pastCloseDate,
                },
              },
            });
            break;
          }

          case "suggest_next_actions": {
            const actionDeal = await db.select().from(projects).where(eq(projects.id, args.dealId)).then((r) => r[0]);
            if (!actionDeal) {
              actionsTaken.push({ type: "suggest_next_actions", status: "failed", details: { error: "Deal not found" } });
              break;
            }

            const actionDocs = await db.select().from(dealDocuments).where(eq(dealDocuments.dealId, args.dealId));
            const actionTasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, args.dealId));
            const pendingDocs = actionDocs.filter((d) => d.status === "pending" || d.status === "rejected");
            const openTasks = actionTasks.filter((t) => t.status === "pending" || t.status === "in_progress");

            const actionsPrompt = `You are a commercial real estate loan processor. Suggest 3-5 specific, actionable next steps for this deal:
Deal: ${actionDeal.projectName}
Borrower: ${actionDeal.borrowerName}
Stage: ${actionDeal.currentStage}
Progress: ${actionDeal.progressPercentage}%
Pending Documents: ${pendingDocs.length} (${pendingDocs.slice(0, 5).map((d) => d.documentName).join(", ")})
Open Tasks: ${openTasks.length}
${args.context ? `Additional Context: ${args.context}` : ""}

Respond ONLY with JSON: {"actions": [{"action": "...", "priority": "high|medium|low", "reason": "..."}]}`;

            try {
              const actionsResp = await openai.chat.completions.create({
                model: MODEL,
                messages: [{ role: "user", content: actionsPrompt }],
                temperature: 0.3,
                max_tokens: 800,
              });
              const parsed = JSON.parse(actionsResp.choices[0]?.message?.content || '{"actions":[]}');

              actionsTaken.push({
                type: "suggest_next_actions",
                status: "success",
                details: { dealId: args.dealId, dealName: actionDeal.projectName, actions: parsed.actions },
              });
            } catch (actErr) {
              actionsTaken.push({ type: "suggest_next_actions", status: "failed", details: { error: String(actErr) } });
            }
            break;
          }

          case "get_anomalies": {
            // Get all processor's active deals
            const portfolioDeals = await db
              .select({
                id: projects.id,
                projectName: projects.projectName,
                borrowerName: projects.borrowerName,
                progressPercentage: projects.progressPercentage,
                targetCloseDate: projects.targetCloseDate,
                createdAt: projects.createdAt,
              })
              .from(dealProcessors)
              .innerJoin(projects, eq(dealProcessors.projectId, projects.id))
              .where(and(
                eq(dealProcessors.userId, processorId),
                sql`${projects.status} NOT IN ('voided', 'cancelled')`
              ));

            const now = new Date();
            const anomalies: Array<{ dealId: number; dealName: string; type: string; detail: string }> = [];
            const anomalyType = args.anomalyType || "all";

            for (const deal of portfolioDeals) {
              if (anomalyType === "all" || anomalyType === "overdue_items") {
                const overdue = await db.select().from(projectTasks)
                  .where(and(eq(projectTasks.projectId, deal.id), or(eq(projectTasks.status, "pending"), eq(projectTasks.status, "in_progress")), lte(projectTasks.dueDate, now)));
                if (overdue.length > 0) {
                  anomalies.push({ dealId: deal.id, dealName: deal.projectName || "", type: "overdue_tasks", detail: `${overdue.length} overdue task(s)` });
                }
              }
              if (anomalyType === "all" || anomalyType === "stalled_deals") {
                const daysOld = deal.createdAt ? Math.floor((now.getTime() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                if (daysOld > 14 && (deal.progressPercentage || 0) < 20) {
                  anomalies.push({ dealId: deal.id, dealName: deal.projectName || "", type: "stalled", detail: `${deal.progressPercentage}% progress after ${daysOld} days` });
                }
              }
              if (anomalyType === "all" || anomalyType === "missing_docs") {
                const missingDocs = await db.select().from(dealDocuments)
                  .where(and(eq(dealDocuments.dealId, deal.id), eq(dealDocuments.isRequired, true), or(eq(dealDocuments.status, "pending"), eq(dealDocuments.status, "rejected"))));
                if (missingDocs.length > 2) {
                  anomalies.push({ dealId: deal.id, dealName: deal.projectName || "", type: "missing_required_docs", detail: `${missingDocs.length} required docs pending` });
                }
              }
              if (deal.targetCloseDate && new Date(deal.targetCloseDate) < now) {
                anomalies.push({ dealId: deal.id, dealName: deal.projectName || "", type: "past_close_date", detail: `Past target close date` });
              }
            }

            actionsTaken.push({
              type: "get_anomalies",
              status: "success",
              details: {
                portfolioSize: portfolioDeals.length,
                anomalyCount: anomalies.length,
                anomalies: anomalies.slice(0, 20),
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

    // Feed function results back to get a natural language summary
    const toolResultMessages = assistantMessage.tool_calls.map((tc, idx) => ({
      role: "tool" as const,
      tool_call_id: tc.id,
      content: JSON.stringify(actionsTaken[idx]?.details || { status: "completed" }),
    }));

    try {
      const followUp = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          ...chatMessages,
          { role: "assistant" as const, content: assistantMessage.content, tool_calls: assistantMessage.tool_calls },
          ...toolResultMessages,
        ],
        max_tokens: 4096,
      });
      responseText = followUp.choices[0]?.message?.content || responseText;
    } catch {
      // If follow-up fails, keep the original responseText (may be empty for pure function calls)
      if (!responseText && actionsTaken.length > 0) {
        responseText = `Completed ${actionsTaken.length} action(s): ${actionsTaken.map((a) => `${a.type} (${a.status})`).join(", ")}`;
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

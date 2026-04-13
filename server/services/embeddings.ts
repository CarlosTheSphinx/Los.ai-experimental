import OpenAI from "openai";
import { db } from "../db";
import { fundKnowledgeEntries, funds } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_INTEGRATIONS_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

function getEmbeddingClients(): OpenAI[] {
  const clients: OpenAI[] = [];
  if (OPENAI_API_KEY) clients.push(new OpenAI({ apiKey: OPENAI_API_KEY }));
  if (AI_INTEGRATIONS_KEY) clients.push(new OpenAI({ apiKey: AI_INTEGRATIONS_KEY }));
  return clients;
}

let _lastEmbedWarning = 0;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const clients = getEmbeddingClients();
  if (clients.length === 0 || !text || text.trim().length === 0) return null;
  const input = text.substring(0, 8000);
  for (const client of clients) {
    try {
      const response = await client.embeddings.create({
        model: "text-embedding-3-small",
        input,
      });
      return response.data[0]?.embedding ?? null;
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      if (status === 429 || status === 401) {
        continue;
      }
      console.error("[Embeddings] Failed to generate embedding:", err.message);
      return null;
    }
  }
  const now = Date.now();
  if (now - _lastEmbedWarning > 60000) {
    console.warn("[Embeddings] All API keys exhausted or quota exceeded — embeddings unavailable");
    _lastEmbedWarning = now;
  }
  return null;
}

export async function embedKnowledgeEntry(entryId: number, content: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);
    if (embedding) {
      await db.update(fundKnowledgeEntries)
        .set({ embedding })
        .where(eq(fundKnowledgeEntries.id, entryId));
    }
  } catch (err) {
    console.error(`[Embeddings] Failed to embed knowledge entry ${entryId}:`, (err as Error).message);
  }
}

export async function embedFundDescription(fundId: number, description: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(description);
    if (embedding) {
      await db.update(funds)
        .set({ descriptionEmbedding: embedding })
        .where(eq(funds.id, fundId));
    }
  } catch (err) {
    console.error(`[Embeddings] Failed to embed fund description ${fundId}:`, (err as Error).message);
  }
}

export async function backfillEmbeddings(): Promise<{ knowledgeCount: number; fundCount: number; errors: number }> {
  let knowledgeCount = 0;
  let fundCount = 0;
  let errors = 0;

  const nullKnowledge = await db.select({
    id: fundKnowledgeEntries.id,
    content: fundKnowledgeEntries.content,
  }).from(fundKnowledgeEntries)
    .where(isNull(fundKnowledgeEntries.embedding));

  for (const entry of nullKnowledge) {
    try {
      const embedding = await generateEmbedding(entry.content);
      if (embedding) {
        await db.update(fundKnowledgeEntries)
          .set({ embedding })
          .where(eq(fundKnowledgeEntries.id, entry.id));
        knowledgeCount++;
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errors++;
      console.error(`[Backfill] Knowledge entry ${entry.id} failed:`, (err as Error).message);
    }
  }

  const nullFunds = await db.select({
    id: funds.id,
    fundDescription: funds.fundDescription,
  }).from(funds)
    .where(isNull(funds.descriptionEmbedding));

  for (const fund of nullFunds) {
    if (!fund.fundDescription) continue;
    try {
      const embedding = await generateEmbedding(fund.fundDescription);
      if (embedding) {
        await db.update(funds)
          .set({ descriptionEmbedding: embedding })
          .where(eq(funds.id, fund.id));
        fundCount++;
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errors++;
      console.error(`[Backfill] Fund ${fund.id} failed:`, (err as Error).message);
    }
  }

  console.log(`[Backfill] Complete: ${knowledgeCount} knowledge entries, ${fundCount} fund descriptions embedded, ${errors} errors`);
  return { knowledgeCount, fundCount, errors };
}

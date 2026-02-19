import { storage } from "../storage";

let cachedManualKey: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function getOpenAIApiKey(): Promise<string | undefined> {
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (integrationKey) return integrationKey;

  const now = Date.now();
  if (cachedManualKey !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedManualKey || undefined;
  }

  try {
    const setting = await storage.getSettingByKey("openai_api_key");
    cachedManualKey = setting?.settingValue || "";
    cacheTimestamp = now;
    return cachedManualKey || undefined;
  } catch {
    return undefined;
  }
}

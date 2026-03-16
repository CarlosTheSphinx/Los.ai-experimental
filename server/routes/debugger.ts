import { type Request, type Response } from 'express';
import { executeAgent, type AgentType } from '../agents/agentRunner';
import { OrchestrationTracer } from '../services/orchestrationTracing';
import { db } from '../db';
import { agentConfigurations } from '@shared/schema';
import { eq } from 'drizzle-orm';

const AGENT_SEQUENCE: AgentType[] = ['document_intelligence', 'processor', 'communication'];

const replayContextCache = new Map<string, { documentText: string; fileName: string; timestamp: number }>();

const MAX_CACHE_ENTRIES = 20;
const CACHE_TTL_MS = 30 * 60 * 1000;

function pruneCache() {
  const now = Date.now();
  for (const [key, val] of replayContextCache) {
    if (now - val.timestamp > CACHE_TTL_MS) {
      replayContextCache.delete(key);
    }
  }
  if (replayContextCache.size > MAX_CACHE_ENTRIES) {
    const oldest = [...replayContextCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (replayContextCache.size > MAX_CACHE_ENTRIES) {
      replayContextCache.delete(oldest.shift()![0]);
    }
  }
}

export function cacheReplayContext(sessionId: string, documentText: string, fileName: string) {
  pruneCache();
  replayContextCache.set(sessionId, { documentText, fileName, timestamp: Date.now() });
}

export function registerDebuggerRoutes(app: any, deps: { authenticateUser: any; requireSuperAdmin: any }) {

  app.post('/api/debug/replay-agent', deps.authenticateUser, deps.requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { agentName, input, customPrompt, replayMode } = req.body;

      if (!agentName || !input) {
        return res.status(400).json({ success: false, error: 'agentName and input are required' });
      }

      const sessionId = OrchestrationTracer.startSession();

      if (replayMode === 'isolated') {
        const result = await OrchestrationTracer.traceAgent(
          agentName,
          AGENT_SEQUENCE.indexOf(agentName as AgentType),
          input,
          () => executeAgent({
            agentType: agentName as AgentType,
            projectId: input.projectId || 0,
            triggerType: 'debug_replay',
            contextData: input,
          }),
          customPrompt,
          sessionId
        );

        OrchestrationTracer.endSession(sessionId);
        return res.json({ success: true, result, sessionId });
      } else if (replayMode === 'cascade') {
        const startIndex = AGENT_SEQUENCE.indexOf(agentName as AgentType);
        if (startIndex === -1) {
          return res.status(400).json({ success: false, error: `Unknown agent: ${agentName}` });
        }

        const results: Record<string, any> = {};
        let currentInput = { ...input };

        for (let i = startIndex; i < AGENT_SEQUENCE.length; i++) {
          const agent = AGENT_SEQUENCE[i];
          const result = await OrchestrationTracer.traceAgent(
            agent,
            i,
            currentInput,
            () => executeAgent({
              agentType: agent,
              projectId: input.projectId || 0,
              triggerType: 'debug_replay',
              contextData: currentInput,
            }),
            i === startIndex ? customPrompt : undefined,
            sessionId
          );

          results[agent] = result;
          if (result && typeof result === 'object') {
            currentInput = { ...currentInput, ...result };
          }
        }

        OrchestrationTracer.endSession(sessionId);
        return res.json({ success: true, results, sessionId });
      }

      return res.status(400).json({ success: false, error: 'Invalid replayMode. Use "isolated" or "cascade".' });
    } catch (error: any) {
      console.error('Debug replay error:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Replay failed' });
    }
  });

  app.post('/api/debug/replay-credit-extraction', deps.authenticateUser, deps.requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { originalSessionId, customPrompt } = req.body;

      if (!originalSessionId || !customPrompt) {
        return res.status(400).json({ success: false, error: 'originalSessionId and customPrompt are required' });
      }

      pruneCache();
      const cached = replayContextCache.get(originalSessionId);
      if (!cached) {
        return res.status(404).json({ success: false, error: 'Session context expired or not found. Please re-upload the document.' });
      }

      const replaySessionId = OrchestrationTracer.startSession();

      OrchestrationTracer.emit({
        eventType: 'agent_start',
        agentName: 'creditPolicyExtractor',
        agentIndex: 0,
        timestamp: new Date().toISOString(),
        sessionId: replaySessionId,
        input: { fileName: cached.fileName, textLength: cached.documentText.length, replay: true, originalSessionId },
      });

      OrchestrationTracer.emit({
        eventType: 'agent_processing',
        agentName: 'creditPolicyExtractor',
        agentIndex: 0,
        timestamp: new Date().toISOString(),
        sessionId: replaySessionId,
        prompt: customPrompt,
        metadata: { model: 'gpt-4o', temperature: 0 },
      });

      const startTime = Date.now();

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const aiPromise = openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: customPrompt },
          {
            role: 'user',
            content: `Extract ALL review rules from the following credit policy document. Be exhaustive — scan every section, extract every constraint, requirement, prohibition, permission, calculation, and conditional statement. Do not skip any section.\n\n${cached.documentText}`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 16384,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI analysis timed out after 120 seconds')), 120000)
      );

      const response = await Promise.race([aiPromise, timeoutPromise]);
      const content = response.choices[0]?.message?.content;

      if (!content) {
        OrchestrationTracer.emit({ eventType: 'agent_error', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, error: 'AI returned empty response', duration: Date.now() - startTime });
        OrchestrationTracer.endSession(replaySessionId);
        return res.status(500).json({ success: false, error: 'AI returned empty response' });
      }

      let parsed: { rules: any[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        OrchestrationTracer.emit({ eventType: 'agent_error', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, error: 'AI returned invalid JSON', rawResponse: content.slice(0, 2000), duration: Date.now() - startTime });
        OrchestrationTracer.endSession(replaySessionId);
        return res.status(500).json({ success: false, error: 'AI returned invalid response format' });
      }

      if (!parsed.rules || !Array.isArray(parsed.rules)) {
        OrchestrationTracer.emit({ eventType: 'agent_error', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, error: 'Missing rules array', duration: Date.now() - startTime });
        OrchestrationTracer.endSession(replaySessionId);
        return res.status(500).json({ success: false, error: 'AI did not return rules in expected format' });
      }

      parsed.rules.forEach((r: any, idx: number) => {
        OrchestrationTracer.emit({
          eventType: 'credit_rule_extracted',
          agentName: 'creditPolicyExtractor',
          agentIndex: 0,
          timestamp: new Date().toISOString(),
          sessionId: replaySessionId,
          rules: [{ id: `rule_${idx}`, rule: r.ruleTitle || 'Untitled', category: r.category || 'General', confidence: r.confidence === 'high' ? 0.95 : r.confidence === 'medium' ? 0.75 : 0.5, reasoning: r.ruleDescription || '' }],
          progress: { current: idx + 1, total: parsed.rules.length, percentage: ((idx + 1) / parsed.rules.length) * 100 },
        });
      });

      OrchestrationTracer.emit({ eventType: 'agent_complete', agentName: 'creditPolicyExtractor', agentIndex: 0, timestamp: new Date().toISOString(), sessionId: replaySessionId, output: { rulesExtracted: parsed.rules.length, replay: true }, duration: Date.now() - startTime });
      OrchestrationTracer.endSession(replaySessionId);

      cacheReplayContext(replaySessionId, cached.documentText, cached.fileName);

      return res.json({ success: true, rules: parsed.rules, sessionId: replaySessionId });
    } catch (error: any) {
      console.error('Credit extraction replay error:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Replay failed' });
    }
  });

  app.get('/api/debug/agent-configs', deps.authenticateUser, deps.requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const configs = await db
        .select({
          agentType: agentConfigurations.agentType,
          systemPrompt: agentConfigurations.systemPrompt,
          modelName: agentConfigurations.modelName,
          modelProvider: agentConfigurations.modelProvider,
          temperature: agentConfigurations.temperature,
          maxTokens: agentConfigurations.maxTokens,
        })
        .from(agentConfigurations)
        .where(eq(agentConfigurations.isActive, true));

      return res.json({ success: true, configs });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message });
    }
  });
}

import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatTime } from '@/lib/utils';
import { useOrchestrationEvents } from '@/hooks/useOrchestrationEvents';
import { AgentTracePanel } from './AgentTracePanel';
import { RealTimeOutput } from './RealTimeOutput';
import { PromptEditor } from './PromptEditor';
import { CreditExtractionPreview } from './CreditExtractionPreview';
import type { OrchestrationEvent, OrchestrationSession } from '@/types/orchestration';
import { X, Bug, Wifi, WifiOff, Clock, Trash2, FileText, ChevronDown, Upload, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

type TabType = 'sessions' | 'credit_policy' | 'intake' | 'log';

export function AIOrchestrationDebugger() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<OrchestrationSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [allEvents, setAllEvents] = useState<OrchestrationEvent[]>([]);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const [cpDefaultPrompt, setCpDefaultPrompt] = useState<string>('');
  const [cpPrompt, setCpPrompt] = useState<string>('');
  const [cpPromptLoading, setCpPromptLoading] = useState(false);
  const [cpCachedSessions, setCpCachedSessions] = useState<Array<{ sessionId: string; fileName: string; textLength: number; cachedAt: string }>>([]);
  const [cpSelectedSession, setCpSelectedSession] = useState<string>('');
  const [cpReplaying, setCpReplaying] = useState(false);
  const [cpReplayResult, setCpReplayResult] = useState<any>(null);
  const [cpPromptLoaded, setCpPromptLoaded] = useState(false);
  const [cpLoadError, setCpLoadError] = useState<string | null>(null);

  const handleEvent = useCallback((event: OrchestrationEvent) => {
    setAllEvents(prev => [...prev.slice(-500), event]);

    if (!isOpenRef.current && (event.eventType === 'session_start' || event.eventType === 'agent_start')) {
      setHasNewActivity(true);
    }

    setSessions(prev => {
      const existing = prev.find(s => s.sessionId === event.sessionId);

      if (!existing) {
        const newSession: OrchestrationSession = {
          sessionId: event.sessionId,
          startTime: new Date(event.timestamp),
          events: [event],
          currentAgent: event.agentName || undefined,
          status: 'running',
        };
        setActiveSessionId(event.sessionId);
        return [newSession, ...prev].slice(0, 20);
      }

      return prev.map(session => {
        if (session.sessionId !== event.sessionId) return session;

        let status = session.status;
        if (event.eventType === 'agent_error') status = 'error';
        else if (event.eventType === 'session_complete') status = 'completed';

        return {
          ...session,
          events: [...session.events, event],
          currentAgent: event.agentName || session.currentAgent,
          status,
        };
      });
    });
  }, []);

  const { connected, replayAgent, replayCreditExtraction } = useOrchestrationEvents(handleEvent);

  const activeSession = sessions.find(s => s.sessionId === activeSessionId);

  const clearSessions = () => {
    setSessions([]);
    setActiveSessionId(null);
    setSelectedAgent(null);
    setAllEvents([]);
  };

  const loadCreditPolicyData = useCallback(async () => {
    if (cpPromptLoaded) return;
    setCpPromptLoading(true);
    setCpLoadError(null);
    try {
      const [promptRes, sessionsRes] = await Promise.all([
        fetch('/api/debug/credit-extraction-prompt'),
        fetch('/api/debug/credit-extraction-sessions'),
      ]);
      if (!promptRes.ok) {
        throw new Error('Failed to load credit policy prompt');
      }
      const promptData = await promptRes.json();
      setCpDefaultPrompt(promptData.prompt);
      setCpPrompt(promptData.prompt);

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setCpCachedSessions(data.sessions || []);
        if (data.sessions?.length > 0) {
          setCpSelectedSession(data.sessions[0].sessionId);
        }
      }
      setCpPromptLoaded(true);
    } catch (err: any) {
      console.error('Failed to load credit policy data:', err);
      setCpLoadError(err.message || 'Failed to load data');
    } finally {
      setCpPromptLoading(false);
    }
  }, [cpPromptLoaded]);

  useEffect(() => {
    if (activeTab === 'credit_policy' && !cpPromptLoaded) {
      loadCreditPolicyData();
    }
  }, [activeTab, cpPromptLoaded, loadCreditPolicyData]);

  const handleCpReplay = async () => {
    if (!cpSelectedSession || !cpPrompt.trim()) return;
    setCpReplaying(true);
    setCpReplayResult(null);
    try {
      const result = await replayCreditExtraction(cpSelectedSession, cpPrompt);
      setCpReplayResult(result);
    } catch (err: any) {
      setCpReplayResult({ error: err.message });
    } finally {
      setCpReplaying(false);
    }
  };

  const creditPolicySessions = sessions.filter(s =>
    s.events.some(e => e.agentName === 'creditPolicyExtractor')
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); setHasNewActivity(false); }}
        className={`fixed bottom-6 left-6 z-[60] h-10 px-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 border text-[12px] font-medium ${
          hasNewActivity
            ? 'bg-cyan-600 text-white border-cyan-400/50 animate-pulse'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border-slate-600/50'
        }`}
        title="AI Orchestration Debugger"
        data-testid="debugger-toggle"
      >
        <Bug className="h-4 w-4" />
        <span>{hasNewActivity ? 'AI Active' : 'AI Debugger'}</span>
        {connected && <span className="h-1.5 w-1.5 rounded-full bg-green-400" />}
        {hasNewActivity && <span className="h-2 w-2 rounded-full bg-yellow-400 animate-ping" />}
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed left-0 top-0 h-screen w-[420px] bg-slate-900 border-r border-slate-700/80 shadow-2xl flex flex-col z-[60]"
        data-testid="debugger-sidebar"
      >
        <div className="bg-slate-800/80 border-b border-slate-700/50 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-cyan-400" />
            <h2 className="text-[14px] font-semibold text-white">AI Debugger</h2>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-red-400" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-400 hover:text-white"
              onClick={clearSessions}
              title="Clear all sessions"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-400 hover:text-white"
              onClick={() => setIsOpen(false)}
              data-testid="debugger-close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex border-b border-slate-700/50 bg-slate-800/50 flex-shrink-0">
          <button
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
              activeTab === 'sessions'
                ? 'text-cyan-400 border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('sessions')}
          >
            Processor
          </button>
          <button
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
              activeTab === 'credit_policy'
                ? 'text-teal-400 border-b-2 border-teal-500'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('credit_policy')}
            data-testid="debugger-tab-credit-policy"
          >
            Credit Policy
          </button>
          <button
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
              activeTab === 'intake'
                ? 'text-amber-400 border-b-2 border-amber-500'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('intake')}
            data-testid="debugger-tab-intake"
          >
            Intake AI
          </button>
          <button
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
              activeTab === 'log'
                ? 'text-cyan-400 border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('log')}
          >
            Log ({allEvents.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {activeTab === 'log' ? (
            <RealTimeOutput events={allEvents} selectedAgent={null} />

          ) : activeTab === 'intake' ? (
            <IntakeAITab
              sessions={sessions.filter(s =>
                s.events.some(e =>
                  e.agentName?.startsWith('intake_') || e.agentName === 'rule_based_fallback'
                )
              )}
              onViewSession={(sessionId) => {
                setActiveSessionId(sessionId);
                setActiveTab('sessions');
              }}
            />

          ) : activeTab === 'credit_policy' ? (
            <CreditPolicyTab
              defaultPrompt={cpDefaultPrompt}
              prompt={cpPrompt}
              onPromptChange={setCpPrompt}
              promptLoading={cpPromptLoading}
              loadError={cpLoadError}
              onRetryLoad={() => { setCpPromptLoaded(false); setCpLoadError(null); }}
              cachedSessions={cpCachedSessions}
              selectedSession={cpSelectedSession}
              onSelectSession={setCpSelectedSession}
              replaying={cpReplaying}
              replayResult={cpReplayResult}
              onReplay={handleCpReplay}
              liveSessions={creditPolicySessions}
              onViewLiveSession={(sessionId) => {
                setActiveSessionId(sessionId);
                setActiveTab('sessions');
                setSelectedAgent('creditPolicyExtractor');
              }}
            />

          ) : activeSession ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                {sessions.length > 1 && (
                  <select
                    value={activeSessionId || ''}
                    onChange={(e) => {
                      setActiveSessionId(e.target.value);
                      setSelectedAgent(null);
                    }}
                    className="flex-1 bg-slate-800 text-[11px] text-slate-300 rounded border border-slate-600/50 px-2 py-1 outline-none"
                  >
                    {sessions.map(s => (
                      <option key={s.sessionId} value={s.sessionId}>
                        {s.sessionId.slice(0, 8)}... — {s.status}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock className="h-3 w-3" />
                  {activeSession.startTime.toLocaleTimeString()}
                </div>
              </div>

              <AgentTracePanel
                session={activeSession}
                selectedAgent={selectedAgent}
                onSelectAgent={(name) =>
                  setSelectedAgent(prev => prev === name ? null : name)
                }
              />

              <RealTimeOutput events={activeSession.events} selectedAgent={selectedAgent} />

              <AnimatePresence>
                {selectedAgent && (
                  <PromptEditor
                    agentName={selectedAgent}
                    currentPrompt={
                      activeSession.events.find(
                        e => e.agentName === selectedAgent && e.prompt
                      )?.prompt
                    }
                    input={
                      activeSession.events.find(
                        e => e.agentName === selectedAgent && e.eventType === 'agent_start'
                      )?.input
                    }
                    isCreditExtraction={selectedAgent === 'creditPolicyExtractor'}
                    onReplay={(customPrompt, mode) =>
                      selectedAgent === 'creditPolicyExtractor'
                        ? replayCreditExtraction(activeSession.sessionId, customPrompt)
                        : replayAgent(
                            selectedAgent,
                            activeSession.events.find(e => e.agentName === selectedAgent)?.input || {},
                            customPrompt,
                            mode
                          )
                    }
                  />
                )}
              </AnimatePresence>

              {activeSession.events.some(
                e => e.eventType === 'credit_rule_extracted' || e.eventType === 'credit_extraction_batch' || e.eventType === 'credit_extraction_progress'
              ) && (
                <CreditExtractionPreview session={activeSession} />
              )}
            </>
          ) : (
            <div className="text-slate-500 text-center py-12">
              <Bug className="h-8 w-8 mx-auto mb-3 text-slate-600" />
              <p className="text-[13px]">No active sessions</p>
              <p className="text-[11px] mt-1 text-slate-600">
                Run AI orchestration to see events stream here in real-time.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

interface CreditPolicyTabProps {
  defaultPrompt: string;
  prompt: string;
  onPromptChange: (p: string) => void;
  promptLoading: boolean;
  loadError: string | null;
  onRetryLoad: () => void;
  cachedSessions: Array<{ sessionId: string; fileName: string; textLength: number; cachedAt: string }>;
  selectedSession: string;
  onSelectSession: (s: string) => void;
  replaying: boolean;
  replayResult: any;
  onReplay: () => void;
  liveSessions: OrchestrationSession[];
  onViewLiveSession: (sessionId: string) => void;
}

function CreditPolicyTab({
  defaultPrompt,
  prompt,
  onPromptChange,
  promptLoading,
  loadError,
  onRetryLoad,
  cachedSessions,
  selectedSession,
  onSelectSession,
  replaying,
  replayResult,
  onReplay,
  liveSessions,
  onViewLiveSession,
}: CreditPolicyTabProps) {
  const [showPrompt, setShowPrompt] = useState(true);

  if (promptLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-teal-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-[12px] text-slate-400">Loading credit policy prompt...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px] text-red-400 mb-2">{loadError}</p>
        <Button size="sm" variant="outline" onClick={onRetryLoad} className="text-[11px]">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-teal-900/30 rounded-lg border border-teal-700/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-teal-400" />
            <h3 className="text-[13px] font-semibold text-teal-300">Credit Policy Extractor</h3>
          </div>
          <span className="text-[10px] text-teal-500 font-mono">gpt-4o · 16K tokens</span>
        </div>
        <p className="text-[11px] text-slate-400">
          Extract lending rules from underwriting guidelines. Edit the prompt below and re-run on any cached document.
        </p>
      </div>

      <div className="bg-slate-800/60 rounded-lg border border-slate-700/50">
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-800/80 transition-colors rounded-t-lg"
        >
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            System Prompt
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showPrompt && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-2">
                <textarea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  className="w-full h-[300px] bg-slate-900/80 text-[11px] text-slate-200 font-mono p-2 rounded border border-slate-600/50 resize-y outline-none focus:border-teal-500/50 transition-colors"
                  placeholder="Enter custom system prompt..."
                  data-testid="credit-policy-prompt-editor"
                />
                {defaultPrompt && prompt !== defaultPrompt && (
                  <button
                    onClick={() => onPromptChange(defaultPrompt)}
                    className="text-[10px] text-slate-500 hover:text-slate-400 flex items-center gap-1"
                  >
                    ↩ Reset to default prompt
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Re-run Extraction
        </p>

        {cachedSessions.length > 0 ? (
          <>
            <p className="text-[10px] text-slate-500">
              Select a previously uploaded document to re-run with the prompt above:
            </p>
            <select
              value={selectedSession}
              onChange={(e) => onSelectSession(e.target.value)}
              className="w-full bg-slate-900/80 text-[11px] text-slate-300 rounded border border-slate-600/50 px-2 py-1.5 outline-none focus:border-teal-500/50"
              data-testid="credit-policy-session-select"
            >
              {cachedSessions.map(s => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.fileName || 'Untitled'} ({Math.round(s.textLength / 1000)}K chars) — {formatTime(s.cachedAt)}
                </option>
              ))}
            </select>

            <Button
              size="sm"
              onClick={onReplay}
              disabled={replaying || !prompt.trim() || !selectedSession}
              className="w-full h-9 text-[12px] bg-teal-700/80 hover:bg-teal-600/80 text-white border-0"
              data-testid="credit-policy-rerun-btn"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {replaying ? 'Running extraction...' : 'Re-run with Current Prompt'}
            </Button>
          </>
        ) : (
          <div className="text-center py-4">
            <Upload className="h-6 w-6 text-slate-600 mx-auto mb-2" />
            <p className="text-[11px] text-slate-500">
              No cached documents yet. Upload a credit policy document from the Program Wizard or Credit Policies page to enable re-runs here.
            </p>
          </div>
        )}
      </div>

      {replayResult && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {replayResult.error ? '⚠ Replay Error' : `✓ Replay Result (${replayResult.rules?.length || 0} rules)`}
          </p>
          {replayResult.error ? (
            <p className="text-[11px] text-red-400">{replayResult.error}</p>
          ) : replayResult.rules ? (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {replayResult.rules.map((r: any, idx: number) => (
                <details key={idx} className="bg-slate-900/50 rounded border border-slate-700/30">
                  <summary className="px-2 py-1.5 text-[11px] text-slate-200 cursor-pointer hover:text-white flex items-center justify-between">
                    <span className="flex-1 truncate">{r.ruleTitle || 'Untitled'}</span>
                    <span className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className={`text-[9px] px-1 rounded ${
                        r.confidence === 'high' ? 'bg-green-500/20 text-green-300' :
                        r.confidence === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {r.confidence}
                      </span>
                      <span className="text-[9px] text-slate-500">{r.category}</span>
                    </span>
                  </summary>
                  <div className="px-2 pb-2 space-y-1">
                    <p className="text-[10px] text-slate-300">{r.ruleDescription}</p>
                    <div className="flex flex-wrap gap-1">
                      {r.documentType && <span className="text-[9px] bg-slate-700/50 text-slate-400 px-1 rounded">{r.documentType}</span>}
                      {r.ruleType && <span className="text-[9px] bg-slate-700/50 text-slate-400 px-1 rounded">{r.ruleType}</span>}
                      {r.sourceSection && <span className="text-[9px] text-slate-500">{r.sourceSection}</span>}
                      {r.clarificationNeeded && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded">⚠ Needs clarification</span>}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <pre className="text-[10px] text-slate-300 bg-slate-900/50 rounded p-2 max-h-[200px] overflow-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(replayResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {liveSessions.length > 0 && (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Live Extraction Sessions
          </p>
          <div className="space-y-1">
            {liveSessions.map(s => {
              const ruleEvents = s.events.filter(e => e.eventType === 'credit_rule_extracted' || e.eventType === 'credit_extraction_progress');
              const ruleCount = ruleEvents.length > 0 ? Math.max(...ruleEvents.map(e => e.rules?.length || 0)) : 0;
              const isRunning = s.status === 'running';
              return (
                <button
                  key={s.sessionId}
                  onClick={() => onViewLiveSession(s.sessionId)}
                  className="w-full text-left bg-slate-900/50 rounded p-2 border border-slate-700/30 hover:border-teal-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-mono">{s.sessionId.slice(0, 12)}...</span>
                    <div className="flex items-center gap-1.5">
                      {isRunning && <span className="animate-pulse text-teal-400 text-[10px]">●</span>}
                      <span className={`text-[10px] ${isRunning ? 'text-teal-400' : s.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                        {s.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">{ruleCount} rules</span>
                    <span className="text-[10px] text-slate-600">·</span>
                    <span className="text-[10px] text-slate-500">{s.startTime.toLocaleTimeString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface IntakeAITabProps {
  sessions: OrchestrationSession[];
  onViewSession: (sessionId: string) => void;
}

function IntakeAITab({ sessions, onViewSession }: IntakeAITabProps) {
  const AGENT_LABELS: Record<string, string> = {
    intake_validator: 'Deal Validator',
    intake_fund_matcher: 'Fund Matcher',
    intake_feedback_generator: 'Feedback Generator',
    rule_based_fallback: 'Rule-Based Fallback',
  };

  return (
    <div className="space-y-3">
      <div className="bg-amber-900/30 rounded-lg border border-amber-700/40 p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4 text-amber-400" />
          <h3 className="text-[13px] font-semibold text-amber-300">Commercial Intake Analysis</h3>
        </div>
        <p className="text-[11px] text-slate-400">
          3-agent AI pipeline: Validator → Fund Matcher → Feedback Generator. Traces appear here when deals are submitted for AI analysis.
        </p>
      </div>

      <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Pipeline Agents
        </p>
        <div className="space-y-1.5">
          {['intake_validator', 'intake_fund_matcher', 'intake_feedback_generator'].map((agentType, idx) => (
            <div key={agentType} className="flex items-center gap-2 bg-slate-900/50 rounded px-2.5 py-1.5 border border-slate-700/30">
              <span className="text-[10px] text-amber-400/70 font-mono w-4 text-center">{idx + 1}</span>
              <span className="text-[11px] text-slate-300 flex-1">{AGENT_LABELS[agentType]}</span>
              <span className="text-[9px] text-slate-500 font-mono">gpt-4o-mini</span>
            </div>
          ))}
        </div>
      </div>

      {sessions.length > 0 ? (
        <div className="bg-slate-800/60 rounded-lg border border-slate-700/50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Recent Sessions ({sessions.length})
          </p>
          <div className="space-y-1">
            {sessions.map(s => {
              const intakeEvents = s.events.filter(e =>
                e.agentName?.startsWith('intake_') || e.agentName === 'rule_based_fallback'
              );
              const completedAgents = intakeEvents.filter(e => e.eventType === 'agent_complete').length;
              const hasError = intakeEvents.some(e => e.eventType === 'agent_error');
              const isRunning = s.status === 'running';

              return (
                <button
                  key={s.sessionId}
                  onClick={() => onViewSession(s.sessionId)}
                  className="w-full text-left bg-slate-900/50 rounded p-2 border border-slate-700/30 hover:border-amber-500/40 transition-colors"
                  data-testid={`intake-session-${s.sessionId.slice(0, 8)}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-mono">{s.sessionId.slice(0, 12)}...</span>
                    <div className="flex items-center gap-1.5">
                      {isRunning && <span className="animate-pulse text-amber-400 text-[10px]">●</span>}
                      <span className={`text-[10px] ${
                        isRunning ? 'text-amber-400' : hasError ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {isRunning ? 'running' : hasError ? 'error' : 'completed'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">{completedAgents}/3 agents</span>
                    <span className="text-[10px] text-slate-600">·</span>
                    <span className="text-[10px] text-slate-500">{s.startTime.toLocaleTimeString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Bug className="h-6 w-6 text-slate-600 mx-auto mb-2" />
          <p className="text-[11px] text-slate-500">
            No intake AI sessions yet. Submit a commercial deal for AI analysis to see traces here.
          </p>
        </div>
      )}
    </div>
  );
}

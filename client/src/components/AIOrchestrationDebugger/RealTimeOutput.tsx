import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTime } from '@/lib/utils';
import type { OrchestrationEvent } from '@/types/orchestration';

interface RealTimeOutputProps {
  events: OrchestrationEvent[];
  selectedAgent: string | null;
}

function formatEventType(type: string): string {
  switch (type) {
    case 'agent_start': return 'STARTED';
    case 'agent_processing': return 'PROCESSING';
    case 'agent_complete': return 'COMPLETE';
    case 'agent_error': return 'ERROR';
    case 'session_start': return 'SESSION';
    case 'session_complete': return 'DONE';
    case 'credit_rule_extracted': return 'RULE';
    case 'credit_extraction_progress': return 'PROGRESS';
    default: return type.toUpperCase();
  }
}

function getEventColor(type: string): string {
  switch (type) {
    case 'agent_start': return 'text-cyan-400';
    case 'agent_complete': return 'text-green-400';
    case 'agent_error': return 'text-red-400';
    case 'credit_rule_extracted': return 'text-amber-400';
    case 'credit_extraction_progress': return 'text-teal-400';
    default: return 'text-slate-400';
  }
}

export function RealTimeOutput({ events, selectedAgent }: RealTimeOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredEvents = selectedAgent
    ? events.filter(e => e.agentName === selectedAgent)
    : events;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents.length]);

  const latestComplete = [...filteredEvents]
    .reverse()
    .find(e => e.eventType === 'agent_complete');

  return (
    <div className="bg-slate-800/60 rounded-lg border border-slate-700/50">
      <div className="px-3 py-2 border-b border-slate-700/50">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {selectedAgent ? `${selectedAgent} Output` : 'Event Log'}
        </p>
      </div>

      <div ref={scrollRef} className="max-h-[200px] overflow-y-auto p-2 space-y-0.5 font-mono text-[11px]">
        <AnimatePresence initial={false}>
          {filteredEvents.map((event, idx) => (
            <motion.div
              key={`${event.sessionId}-${idx}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2 py-0.5"
            >
              <span className="text-slate-500 flex-shrink-0 w-[52px] text-right">
                {formatTime(event.timestamp)}
              </span>
              <span className={`flex-shrink-0 w-[70px] font-semibold ${getEventColor(event.eventType)}`}>
                {formatEventType(event.eventType)}
              </span>
              <span className="text-slate-300 truncate">
                {event.agentName && <span className="text-slate-500">[{event.agentName}] </span>}
                {event.error && <span className="text-red-300">{event.error}</span>}
                {event.duration && <span className="text-slate-500">{event.duration}ms</span>}
                {(event.eventType === 'credit_rule_extracted' || event.eventType === 'credit_extraction_progress') && event.rules && (
                  <span className="text-amber-300">
                    {event.eventType === 'credit_extraction_progress'
                      ? `Chunk ${event.metadata?.chunksCompleted}/${event.metadata?.totalChunks} — ${event.rules.length} rules so far`
                      : `${event.rules.length} rules extracted (final)`}
                  </span>
                )}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {latestComplete?.output && (
        <div className="border-t border-slate-700/50 p-2">
          <details className="group">
            <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-300 transition-colors">
              View full parsed output {latestComplete.output.rulesExtracted != null && `(${latestComplete.output.rulesExtracted} rules)`}
            </summary>
            <pre className="mt-1 text-[10px] text-slate-300 bg-slate-900/50 rounded p-2 max-h-[400px] overflow-auto whitespace-pre-wrap">
              {JSON.stringify(latestComplete.output, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {latestComplete?.prompt && (
        <div className="border-t border-slate-700/50 p-2">
          <details className="group">
            <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-300 transition-colors">
              View system prompt
            </summary>
            <pre className="mt-1 text-[10px] text-slate-300 bg-slate-900/50 rounded p-2 max-h-[150px] overflow-auto whitespace-pre-wrap">
              {latestComplete.prompt}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

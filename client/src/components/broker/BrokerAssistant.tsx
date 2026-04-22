import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, RotateCcw, Loader2, LifeBuoy } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What property types qualify for a DSCR loan?",
  "What's the minimum FICO for a bridge loan?",
  "How do you calculate LTV for purchases?",
];

const STORAGE_PREFIX = "lendry_broker_assistant_";

export function BrokerAssistant() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalatedTicketId, setEscalatedTicketId] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const storageKey = user ? `${STORAGE_PREFIX}${user.id}` : "";

  const { data: config } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/broker/assistant/config"],
  });

  // Load history from sessionStorage
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  // Persist on change
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  const enabled = config?.enabled !== false;
  if (!enabled) return null;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/broker/assistant/chat", { messages: next });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.content || "" }]);
    } catch (err: unknown) {
      const detail =
        err instanceof Error && err.message
          ? err.message
          : "Failed to reach the assistant. Please try again.";
      toast({ title: "Assistant error", description: detail, variant: "destructive" });
      setMessages(next);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setEscalatedTicketId(null);
    if (storageKey) sessionStorage.removeItem(storageKey);
  };

  const escalate = async () => {
    if (escalating || messages.length === 0) return;
    setEscalating(true);
    try {
      const res = await apiRequest("POST", "/api/broker/assistant/escalate", { messages });
      const data = await res.json();
      if (data?.ticket?.id) {
        setEscalatedTicketId(data.ticket.id);
        toast({ title: "Sent to support", description: `Ticket #${data.ticket.id} created. We'll be in touch.` });
      }
    } catch (err: unknown) {
      const detail = err instanceof Error && err.message ? err.message : "Could not escalate. Please try again.";
      toast({ title: "Escalation failed", description: detail, variant: "destructive" });
    } finally {
      setEscalating(false);
    }
  };

  // Suggest escalation when the assistant has admitted it cannot help, OR after 3+ user turns
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const userTurns = messages.filter((m) => m.role === "user").length;
  const showEscalateCta =
    !escalatedTicketId &&
    messages.length >= 2 &&
    (userTurns >= 3 ||
      /don't have that detail|contact your loan officer|i don't know|not sure/i.test(lastAssistant?.content || ""));

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
          style={{ background: "linear-gradient(135deg, #C9A84C, #b48f3a)" }}
          title="Ask Lendry"
          data-testid="fab-broker-assistant"
        >
          <Sparkles className="h-6 w-6 text-white" />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-6 right-6 z-50 flex flex-col rounded-xl shadow-2xl border border-white/10"
            style={{
              width: "min(400px, calc(100vw - 24px))",
              height: "min(620px, calc(100vh - 24px))",
              backgroundColor: "#0F1729",
            }}
            data-testid="broker-assistant-panel"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #b48f3a)" }}
                >
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">Lendry Assistant</div>
                  <div className="text-white/40 text-[11px]">Sphinx Capital programs & guidelines</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={reset}
                    title="Clear conversation"
                    className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white/80"
                    data-testid="button-broker-assistant-reset"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white/80"
                  data-testid="button-broker-assistant-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-lg px-3 py-2 text-sm text-white/80 bg-white/5">
                    Hi! I'm Lendry. Ask me about Sphinx Capital's loan programs, eligibility, or document requirements.
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-white/30 px-1">Try asking</div>
                  <div className="space-y-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="w-full text-left text-sm px-3 py-2 rounded-md border border-white/10 text-white/80 hover:bg-white/5 transition-colors"
                        data-testid={`broker-assistant-suggestion-${s.slice(0, 20)}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                  data-testid={`broker-assistant-message-${m.role}-${i}`}
                >
                  <div
                    className={cn(
                      "max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "text-[#0F1729] rounded-br-none"
                        : "bg-white/5 text-white/90 rounded-bl-none",
                    )}
                    style={m.role === "user" ? { backgroundColor: "#C9A84C" } : undefined}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {showEscalateCta && (
                <div className="rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-3 space-y-2" data-testid="escalate-cta">
                  <div className="text-xs text-white/80">
                    Need a person? Send this conversation to the Sphinx Capital support team and someone will follow up.
                  </div>
                  <Button
                    size="sm"
                    onClick={escalate}
                    disabled={escalating}
                    style={{ backgroundColor: "#C9A84C", color: "#0F1729" }}
                    data-testid="button-escalate-to-support"
                  >
                    {escalating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <LifeBuoy className="h-3.5 w-3.5 mr-1" />}
                    Escalate to support
                  </Button>
                </div>
              )}

              {escalatedTicketId && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-white/80" data-testid="escalated-confirmation">
                  Ticket #{escalatedTicketId} created.{" "}
                  <Link href={`/support-tickets/${escalatedTicketId}`} className="underline text-[#C9A84C]" data-testid="link-view-escalated-ticket">
                    View it here
                  </Link>
                  .
                </div>
              )}

              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white/5 text-white/60 px-3 py-2 rounded-lg rounded-bl-none flex items-center gap-2 text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            <div className="border-t border-white/10 p-3">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !sending) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  disabled={sending}
                  placeholder="Ask about a loan program..."
                  className="text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  data-testid="input-broker-assistant"
                />
                <Button
                  size="sm"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || sending}
                  style={{ backgroundColor: "#C9A84C", color: "#0F1729" }}
                  data-testid="button-broker-assistant-send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-[10px] text-white/30 mt-2 px-1">
                Lendry can make mistakes. Verify with your loan officer for binding decisions.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

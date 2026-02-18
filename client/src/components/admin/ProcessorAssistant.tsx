/**
 * AI Processor Assistant Component
 * Floating chat panel with daily briefing, voice input, and AI-powered actions
 */

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  X,
  Send,
  Mic,
  Square,
  Loader,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useVoiceRecorder } from "@/replit_integrations/audio/useVoiceRecorder";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  actionsTaken?: Array<{
    type: string;
    status: "success" | "failed";
    details: Record<string, any>;
  }>;
  createdAt: string;
}

interface Conversation {
  id: number;
  userId: number;
  dealId: number | null;
  conversationType: "daily_briefing" | "deal_review" | "general";
  title: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

interface DealBriefing {
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

interface BriefingContent {
  summary: string;
  deals: DealBriefing[];
  queueItemsCount: number;
}

interface ProcessorAssistantProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProcessorAssistant({ isOpen: externalOpen, onOpenChange }: ProcessorAssistantProps = {}) {
  const [, setLocation] = useLocation();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = (val: boolean) => {
    if (onOpenChange) onOpenChange(val);
    setInternalOpen(val);
  };
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const { state: recordingState, startRecording, stopRecording } = useVoiceRecorder();
  const { toast } = useToast();

  // Fetch conversations
  const { data: conversations = [] } = useQuery({
    queryKey: ["assistant-conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assistant/conversations");
      return res.json();
    },
    enabled: isOpen,
  });

  // Fetch briefing
  const { data: briefing } = useQuery({
    queryKey: ["assistant-briefing"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assistant/briefing");
      return res.json();
    },
    enabled: isOpen,
  });

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (conversationType: "daily_briefing" | "deal_review" | "general") => {
      const res = await apiRequest("POST", "/api/assistant/conversations", { conversationType });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      setCurrentConversationId(data.id);
      setMessages([]);
      queryClient.invalidateQueries({
        queryKey: ["assistant-conversations"],
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentConversationId) throw new Error("No conversation");
      const res = await apiRequest(
        "POST",
        `/api/assistant/conversations/${currentConversationId}/messages`,
        { content, voiceInput: false }
      );
      return res.json();
    },
    onSuccess: (data: { response: string; actionsTaken: any[] }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: data.response,
          actionsTaken: data.actionsTaken,
          createdAt: new Date().toISOString(),
        },
      ]);
      setInputValue("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Transcribe audio mutation
  const transcribeMutation = useMutation({
    mutationFn: async (audioBlob: Blob) => {
      return new Promise<{ text: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Audio = (reader.result as string).split(",")[1]; // Remove data:audio/webm;base64, prefix

            const response = await fetch("/api/assistant/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: base64Audio }),
            });

            if (!response.ok) throw new Error("Transcription failed");
            resolve(response.json());
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read audio"));
        reader.readAsDataURL(audioBlob);
      });
    },
    onSuccess: (data: { text: string }) => {
      setInputValue(data.text);
      toast({
        title: "Transcribed",
        description: "Audio has been transcribed. Review and send.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to transcribe audio",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle send message
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: inputValue,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    sendMessageMutation.mutate(inputValue);
  };

  // Handle voice recording
  const handleStartRecording = async () => {
    try {
      await startRecording();
      setRecordingTime(0);
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start recording",
        variant: "destructive",
      });
    }
  };

  const handleStopRecording = async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    const audioBlob = await stopRecording();
    setRecordingTime(0);

    if (audioBlob.size > 0) {
      transcribeMutation.mutate(audioBlob);
    }
  };

  // Format recording time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (isOpen && !currentConversationId && !createConversationMutation.isPending && !hasInitialized.current) {
      hasInitialized.current = true;
      if (conversations.length > 0) {
        const latest = conversations[conversations.length - 1] as Conversation;
        setCurrentConversationId(latest.id);
        setMessages(latest.messages || []);
      } else {
        createConversationMutation.mutate("general");
      }
    }
    if (!isOpen) {
      hasInitialized.current = false;
    }
  }, [isOpen, conversations]);

  const handleSuggestionClick = (text: string) => {
    setInputValue(text);
    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    sendMessageMutation.mutate(text);
  };

  const currentConversation = conversations.find(
    (c: Conversation) => c.id === currentConversationId
  );

  const hasPendingItems =
    briefing && briefing.queueItemsCount > 0;

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        className={cn(
          "fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors z-40",
          hasPendingItems
            ? "bg-blue-600 hover:bg-blue-700"
            : "bg-slate-800 hover:bg-slate-900"
        )}
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <Sparkles className="w-6 h-6 text-white" />
        {hasPendingItems && (
          <motion.div
            className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-24 right-6 w-96 bg-white rounded-lg shadow-2xl flex flex-col z-50"
            style={{ height: "600px" }}
            initial={{ opacity: 0, y: 20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 20, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold">Your Assistant</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Main Content Area - Always Chat */}
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="space-y-4 py-4">
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg rounded-bl-none max-w-xs text-sm text-slate-900 dark:text-slate-100">
                      <p>Hi there! I'm your AI assistant. What would you like me to help you with?</p>
                    </div>
                    <div className="space-y-2 pl-1">
                      <button
                        data-testid="suggestion-briefing"
                        onClick={() => handleSuggestionClick("Give me a daily briefing on all my active deals")}
                        className="w-full text-left text-sm px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover-elevate transition-colors"
                      >
                        Give me a daily briefing on my deals
                      </button>
                      <button
                        data-testid="suggestion-draft"
                        onClick={() => handleSuggestionClick("Draft a borrower update email for my most recent deal")}
                        className="w-full text-left text-sm px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover-elevate transition-colors"
                      >
                        Draft a borrower update email
                      </button>
                      <button
                        data-testid="suggestion-review"
                        onClick={() => handleSuggestionClick("Review pending documents and tasks across all deals")}
                        className="w-full text-left text-sm px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover-elevate transition-colors"
                      >
                        Review pending documents and tasks
                      </button>
                    </div>
                  </div>
                )}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-xs px-3 py-2 rounded-lg text-sm",
                          message.role === "user"
                            ? "bg-blue-600 text-white rounded-br-none"
                            : "bg-slate-200 text-slate-900 rounded-bl-none"
                        )}
                      >
                        <p className="whitespace-pre-wrap">
                          {message.content}
                        </p>

                        {/* Action Results */}
                        {message.actionsTaken &&
                          message.actionsTaken.length > 0 && (
                            <div className="mt-2 space-y-1 border-t border-current opacity-80 pt-2">
                              {message.actionsTaken.map(
                                (action, idx) => (
                                  <div key={idx}>
                                    <div
                                      className={cn(
                                        "text-xs",
                                        action.status === "success"
                                          ? "text-green-300"
                                          : "text-red-300"
                                      )}
                                    >
                                      {action.status === "success" ? "✓" : "✗"}{" "}
                                      {action.type.replace(/_/g, " ")}
                                      {action.details?.subject && (
                                        <span className="opacity-70 ml-1">— {action.details.subject}</span>
                                      )}
                                    </div>
                                    {/* Approve/Edit buttons for draft communications */}
                                    {(action.type === "draft_email" || action.type === "draft_sms" || action.type === "send_communication") &&
                                      action.status === "success" &&
                                      action.details?.communicationId && (
                                        <div className="flex gap-2 mt-1 ml-3">
                                          <button
                                            onClick={() => setLocation(`/admin/deals/${action.details.dealId}?tab=communications`)}
                                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded"
                                          >
                                            Review & Approve
                                          </button>
                                        </div>
                                      )}
                                    {/* Batch operation summary */}
                                    {action.type.startsWith("batch_") &&
                                      action.status === "success" &&
                                      action.details?.total != null && (
                                        <div className="text-xs opacity-70 ml-3">
                                          {action.details.successful || action.details.created || action.details.updated || 0}/{action.details.total} completed
                                        </div>
                                      )}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  ))}

                  {sendMessageMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-slate-200 px-3 py-2 rounded-lg rounded-bl-none">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100" />
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t p-3 space-y-2">
                  {recordingState === "recording" && (
                    <div className="flex items-center justify-between bg-red-50 rounded p-2">
                      <div className="flex items-center gap-2">
                        <motion.div
                          className="w-3 h-3 bg-red-500 rounded-full"
                          animate={{ scale: [1, 1.5, 1] }}
                          transition={{ duration: 0.6, repeat: Infinity }}
                        />
                        <span className="text-xs font-mono text-red-600">
                          {formatTime(recordingTime)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleStopRecording}
                      >
                        <Square className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  )}

                  {transcribeMutation.isPending && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Loader className="w-3 h-3 animate-spin" />
                      Transcribing...
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      placeholder="Message or press Shift+M to record..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !sendMessageMutation.isPending
                        ) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      disabled={
                        sendMessageMutation.isPending ||
                        recordingState === "recording"
                      }
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      variant={
                        recordingState === "recording" ? "destructive" : "default"
                      }
                      onClick={
                        recordingState === "recording"
                          ? handleStopRecording
                          : handleStartRecording
                      }
                      disabled={sendMessageMutation.isPending}
                    >
                      <Mic className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSendMessage}
                      disabled={
                        !inputValue.trim() || sendMessageMutation.isPending
                      }
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

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
  ChevronUp,
  Loader,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
    queryFn: () =>
      apiRequest("/api/assistant/conversations", {
        method: "GET",
      }),
    enabled: isOpen,
  });

  // Fetch briefing
  const { data: briefing } = useQuery({
    queryKey: ["assistant-briefing"],
    queryFn: () =>
      apiRequest("/api/assistant/briefing", {
        method: "GET",
      }),
    enabled: isOpen,
  });

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: (conversationType: "daily_briefing" | "deal_review" | "general") =>
      apiRequest("/api/assistant/conversations", {
        method: "POST",
        body: JSON.stringify({ conversationType }),
      }),
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
    mutationFn: (content: string) => {
      if (!currentConversationId) throw new Error("No conversation");
      return apiRequest(
        `/api/assistant/conversations/${currentConversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content, voiceInput: false }),
        }
      );
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

  // Start new briefing conversation if none exists
  const handleStartBriefing = () => {
    if (conversations.length === 0) {
      createConversationMutation.mutate("daily_briefing");
    } else {
      const briefingConv = conversations.find(
        (c: Conversation) => c.conversationType === "daily_briefing"
      );
      if (briefingConv) {
        setCurrentConversationId(briefingConv.id);
        setMessages(briefingConv.messages || []);
      } else {
        createConversationMutation.mutate("daily_briefing");
      }
    }
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

            {/* Main Content Area */}
            {!currentConversationId ? (
              // Initial state: show briefing
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {briefing ? (
                  <>
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm">Daily Briefing</h4>
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="text-sm text-slate-700 line-clamp-4">
                          {briefing.summary}
                        </p>
                      </div>

                      {briefing.deals.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-xs font-semibold text-slate-600 uppercase">
                            Active Deals ({briefing.deals.length})
                          </h5>
                          {briefing.deals.map((deal) => (
                            <div
                              key={deal.dealId}
                              className="border rounded p-2 text-xs"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-semibold">
                                    #{deal.dealId}: {deal.dealName}
                                  </p>
                                  <p className="text-slate-600">
                                    {deal.borrowerName} • {deal.stage}
                                  </p>
                                </div>
                                <Badge variant="outline">
                                  {deal.progress}%
                                </Badge>
                              </div>
                              <div className="flex gap-2 mt-2 text-slate-600">
                                {deal.pendingDocuments.count > 0 && (
                                  <span>
                                    📄 {deal.pendingDocuments.count} docs
                                  </span>
                                )}
                                {deal.overdueTasks.count > 0 && (
                                  <span>
                                    ⚠️ {deal.overdueTasks.count} overdue
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <Button
                        onClick={handleStartBriefing}
                        className="w-full"
                        size="sm"
                      >
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Start Chat
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="w-6 h-6 text-slate-400 animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              // Chat state: show messages
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && briefing && (
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-600">
                        {currentConversation?.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        How can I help?
                      </p>
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
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

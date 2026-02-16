import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Upload,
  Loader2,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Pencil,
  ShieldCheck,
  MessageSquare,
  Send,
  BotMessageSquare,
  User,
  Mic,
  MicOff,
  Info,
} from "lucide-react";

type Rule = {
  documentType: string;
  ruleTitle: string;
  ruleDescription: string;
  category?: string;
  isActive?: boolean;
};

type CreditPolicy = {
  id: number;
  name: string;
  description: string | null;
  sourceFileName: string | null;
  isActive: boolean;
  ruleCount: number;
  createdAt: string;
  updatedAt: string;
};

type CreditPolicyWithRules = CreditPolicy & { rules: Rule[] };

export default function CreditPoliciesTab() {
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CreditPolicyWithRules | null>(null);
  const [deletePolicy, setDeletePolicy] = useState<CreditPolicy | null>(null);

  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [sourceFileName, setSourceFileName] = useState("");

  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt" | "unsupported" | "checking">("checking");
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: policies, isLoading } = useQuery<CreditPolicy[]>({
    queryKey: ["/api/admin/credit-policies"],
  });

  const createPolicy = useMutation({
    mutationFn: async () => {
      const validRules = rules.filter((r) => r.ruleTitle?.trim());
      return apiRequest("POST", "/api/admin/credit-policies", {
        name: policyName,
        description: policyDescription || null,
        sourceFileName: sourceFileName || null,
        rules: validRules,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-policies"] });
      resetForm();
      setShowAddDialog(false);
      toast({ title: "Credit policy created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create credit policy", variant: "destructive" });
    },
  });

  const updatePolicy = useMutation({
    mutationFn: async () => {
      if (!editingPolicy) return;
      const validRules = rules.filter((r) => r.ruleTitle?.trim());
      return apiRequest("PUT", `/api/admin/credit-policies/${editingPolicy.id}`, {
        name: policyName,
        description: policyDescription || null,
        rules: validRules,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-policies"] });
      resetForm();
      setEditingPolicy(null);
      toast({ title: "Credit policy updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update credit policy", variant: "destructive" });
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/credit-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credit-policies"] });
      setDeletePolicy(null);
      toast({ title: "Credit policy deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete credit policy", variant: "destructive" });
    },
  });

  function resetForm() {
    setPolicyName("");
    setPolicyDescription("");
    setRules([]);
    setSourceFileName("");
    setCollapsedSections({});
    setIsDragOver(false);
    setShowChat(false);
    setChatMessages([]);
    setChatInput("");
    setIsChatLoading(false);
    setMicPermission("checking");
    stopRecording();
  }

  function startRecording() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Voice input not supported",
        description: "Your browser doesn't support speech recognition. Please try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interim = transcript;
        }
      }
      setChatInput(finalTranscript + interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        setMicPermission("denied");
      } else if (event.error !== "aborted") {
        toast({
          title: "Voice recording error",
          description: "Something went wrong with voice recording. Please try again.",
          variant: "destructive",
        });
      }
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setMicPermission("granted");
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!showChat) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicPermission("unsupported");
      return;
    }

    async function checkMicPermission() {
      try {
        const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
        setMicPermission(result.state as "granted" | "denied" | "prompt");
        result.onchange = () => {
          setMicPermission(result.state as "granted" | "denied" | "prompt");
        };
      } catch {
        setMicPermission("prompt");
      }
    }
    checkMicPermission();
  }, [showChat]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  async function handleChatSend() {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading) return;

    const userMsg = { role: "user" as const, content: trimmed };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const response = await apiRequest("POST", "/api/admin/credit-policies/chat", {
        messages: updatedMessages,
        existingRules: rules,
      });
      const data = await response.json();

      const assistantMsg = { role: "assistant" as const, content: data.reply };
      setChatMessages((prev) => [...prev, assistantMsg]);

      if (data.newRules && data.newRules.length > 0) {
        setRules((prev) => [...prev, ...data.newRules]);
        toast({
          title: `Extracted ${data.newRules.length} new rule${data.newRules.length > 1 ? "s" : ""} from conversation`,
        });
      }
    } catch (error: any) {
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
    } finally {
      setIsChatLoading(false);
    }
  }

  async function handleFileUpload(file: File) {
    setIsExtracting(true);
    setSourceFileName(file.name);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiRequest("POST", "/api/admin/credit-policies/extract-rules", {
        fileContent: base64,
        fileName: file.name,
      });

      const data = await response.json();
      if (data.rules && Array.isArray(data.rules)) {
        setRules(data.rules);
        toast({ title: `Extracted ${data.rules.length} rules from ${file.name}` });
      }
    } catch (error: any) {
      toast({ title: "Failed to extract rules", description: error.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  }

  function handleDropZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function toggleSection(docType: string) {
    setCollapsedSections((prev) => ({ ...prev, [docType]: !prev[docType] }));
  }

  function updateRule(index: number, field: string, value: string) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function deleteRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function addRuleToGroup(docType: string) {
    setRules((prev) => [
      ...prev,
      { documentType: docType, ruleTitle: "", ruleDescription: "", category: "" },
    ]);
  }

  const groupedRules = rules.reduce(
    (acc, rule, index) => {
      const dt = rule.documentType || "General";
      if (!acc[dt]) acc[dt] = { rules: [], indices: [] };
      acc[dt].rules.push(rule);
      acc[dt].indices.push(index);
      return acc;
    },
    {} as Record<string, { rules: Rule[]; indices: number[] }>
  );

  async function openEditDialog(policy: CreditPolicy) {
    try {
      const res = await fetch(`/api/admin/credit-policies/${policy.id}`, { credentials: "include" });
      const data = await res.json();
      setPolicyName(data.name);
      setPolicyDescription(data.description || "");
      setSourceFileName(data.sourceFileName || "");
      setRules(data.rules || []);
      setCollapsedSections({});
      setEditingPolicy(data);
    } catch {
      toast({ title: "Failed to load policy details", variant: "destructive" });
    }
  }

  function renderPolicyForm() {
    return (
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>Policy Name</Label>
          <Input
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value)}
            placeholder="e.g. DSCR Credit Policy v2"
            data-testid="input-policy-name"
          />
        </div>
        <div className="space-y-2">
          <Label>Description (optional)</Label>
          <Textarea
            value={policyDescription}
            onChange={(e) => setPolicyDescription(e.target.value)}
            placeholder="Brief description of this credit policy..."
            className="min-h-[60px]"
            data-testid="input-policy-description"
          />
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Describe Your Policy
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChat(!showChat)}
              data-testid="button-toggle-chat"
            >
              {showChat ? "Hide Chat" : "Chat with AI"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Describe your lending guidelines in plain language. AI will ask follow-up questions and extract rules automatically.
          </p>

          {showChat && (
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="max-h-[240px] overflow-y-auto space-y-2 min-h-[80px]" data-testid="chat-messages-container">
                  {chatMessages.length === 0 && (
                    <div className="flex items-start gap-2 py-2">
                      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <BotMessageSquare className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Tell me about your credit policy - what are your key lending criteria? For example: minimum credit scores, LTV limits, property types, DSCR requirements, reserve requirements, etc.
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 py-1.5 flex-wrap ${msg.role === "user" ? "justify-end" : ""}`}
                      data-testid={`chat-message-${idx}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <BotMessageSquare className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      <div
                        className={`text-sm rounded-md px-3 py-2 max-w-[85%] ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.content}
                      </div>
                      {msg.role === "user" && (
                        <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex items-start gap-2 py-1.5">
                      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <BotMessageSquare className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="bg-muted rounded-md px-3 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                {micPermission === "prompt" && (
                  <div className="flex items-start gap-2 rounded-md bg-muted p-2.5" data-testid="mic-permission-prompt">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Enable voice input</p>
                      <p>Click the microphone button below, then allow access when your browser asks. You only need to do this once.</p>
                    </div>
                  </div>
                )}
                {micPermission === "denied" && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5" data-testid="mic-permission-denied">
                    <MicOff className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-destructive">Microphone access blocked</p>
                      <p>To enable voice input, click the lock/site-settings icon in your browser's address bar, set Microphone to "Allow", then refresh the page.</p>
                    </div>
                  </div>
                )}
                {micPermission === "unsupported" && (
                  <div className="flex items-start gap-2 rounded-md bg-muted p-2.5" data-testid="mic-permission-unsupported">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Voice input unavailable</p>
                      <p>Your browser doesn't support speech recognition. For voice input, please use Chrome or Edge.</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSend();
                      }
                    }}
                    placeholder={isRecording ? "Listening... speak now" : "e.g. Minimum 680 FICO, max 80% LTV..."}
                    disabled={isChatLoading}
                    data-testid="input-chat-message"
                  />
                  <Button
                    size="icon"
                    variant={isRecording ? "destructive" : "outline"}
                    onClick={toggleRecording}
                    disabled={isChatLoading || micPermission === "unsupported" || micPermission === "denied"}
                    data-testid="button-toggle-mic"
                  >
                    {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    onClick={() => {
                      stopRecording();
                      handleChatSend();
                    }}
                    disabled={isChatLoading || !chatInput.trim()}
                    data-testid="button-send-chat"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {isRecording && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 flex-wrap">
                    <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    Recording... Click the mic to stop, or press Send when ready.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-warning" />
            Upload Credit Policy Document
          </Label>
          <p className="text-xs text-muted-foreground">
            Upload a PDF or Excel file. AI will extract rules automatically, or manage rules manually below.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls"
            className="hidden"
            data-testid="input-policy-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = "";
            }}
          />

          {isExtracting ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-extracting-rules">
                  AI is extracting rules from your document...
                </p>
              </CardContent>
            </Card>
          ) : (
            <div
              className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? "border-success bg-success/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              data-testid="dropzone-policy-upload"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDropZoneDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragOver(false);
              }}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Drop file here or click to upload</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, Excel (.xlsx, .xls)</p>
              {sourceFileName && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last uploaded: {sourceFileName}
                </p>
              )}
            </div>
          )}

          {rules.length > 0 && (
            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium">{rules.length} rules</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRules((prev) => [
                      ...prev,
                      { documentType: "General", ruleTitle: "", ruleDescription: "", category: "" },
                    ])
                  }
                  data-testid="button-add-rule-general"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Rule
                </Button>
              </div>
              {Object.entries(groupedRules).map(([docType, { rules: docRules, indices }]) => {
                const isCollapsed = collapsedSections[docType];
                return (
                  <Card key={docType}>
                    <div
                      className="flex items-center justify-between gap-2 p-3 cursor-pointer"
                      data-testid={`section-header-${docType}`}
                      onClick={() => toggleSection(docType)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{docType}</span>
                        <Badge variant="secondary" className="text-xs">
                          {docRules.length}
                        </Badge>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {!isCollapsed && (
                      <CardContent className="pt-0 space-y-3">
                        {docRules.map((rule, rIdx) => {
                          const globalIdx = indices[rIdx];
                          return (
                            <div key={globalIdx} className="border rounded-md p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={rule.ruleTitle}
                                  onChange={(e) => updateRule(globalIdx, "ruleTitle", e.target.value)}
                                  placeholder="Rule title"
                                  className="text-sm flex-1"
                                  data-testid={`input-rule-title-${globalIdx}`}
                                />
                                {rule.category && (
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    {rule.category}
                                  </Badge>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteRule(globalIdx)}
                                  data-testid={`button-delete-rule-${globalIdx}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                              <Textarea
                                value={rule.ruleDescription}
                                onChange={(e) =>
                                  updateRule(globalIdx, "ruleDescription", e.target.value)
                                }
                                placeholder="Rule description"
                                className="text-sm min-h-[60px]"
                                data-testid={`input-rule-description-${globalIdx}`}
                              />
                            </div>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addRuleToGroup(docType)}
                          data-testid={`button-add-rule-${docType}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Rule
                        </Button>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Manage credit policy documents and their extracted review rules. Assign policies to loan programs.
        </p>
        <Dialog
          open={showAddDialog}
          onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-policy">
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Credit Policy</DialogTitle>
              <DialogDescription>
                Upload a credit policy document and AI will extract review rules.
              </DialogDescription>
            </DialogHeader>
            {renderPolicyForm()}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createPolicy.mutate()}
                disabled={createPolicy.isPending || !policyName.trim()}
                data-testid="button-save-policy"
              >
                {createPolicy.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Policy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={!!editingPolicy}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPolicy(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Credit Policy</DialogTitle>
            <DialogDescription>
              Update the policy details and rules.
            </DialogDescription>
          </DialogHeader>
          {renderPolicyForm()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingPolicy(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => updatePolicy.mutate()}
              disabled={updatePolicy.isPending || !policyName.trim()}
              data-testid="button-update-policy"
            >
              {updatePolicy.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletePolicy} onOpenChange={(open) => !open && setDeletePolicy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credit Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletePolicy?.name}"? This will remove all its
              rules and unlink it from any programs using it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePolicy && deletePolicyMutation.mutate(deletePolicy.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deletePolicyMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !policies || policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <ShieldCheck className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="text-lg font-medium" data-testid="text-empty-state">No credit policies yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first credit policy by uploading a policy document.
              </p>
            </div>
            <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-first-policy">
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => (
            <Card key={policy.id} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate" data-testid={`text-policy-name-${policy.id}`}>
                        {policy.name}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {policy.ruleCount} rules
                        </Badge>
                        {policy.sourceFileName && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {policy.sourceFileName}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(policy.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(policy)}
                      data-testid={`button-edit-policy-${policy.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletePolicy(policy)}
                      data-testid={`button-delete-policy-${policy.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {policy.description && (
                  <p className="text-sm text-muted-foreground mt-2 ml-13">{policy.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
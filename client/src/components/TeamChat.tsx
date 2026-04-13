import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { safeFormat } from "@/lib/utils";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Send,
  Plus,
  Users,
  Search,
  Loader2,
  UserPlus,
} from "lucide-react";

interface TeamMember {
  id: number;
  fullName: string | null;
  email: string;
  role?: string;
}

interface TeamChatType {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdBy: number | null;
  lastMessageAt: string;
  participants: { id: number; fullName: string | null; email: string }[];
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  unreadCount: number;
}

interface TeamChatMessageType {
  id: number;
  chatId: number;
  senderId: number | null;
  body: string;
  createdAt: string;
  senderName: string | null;
  senderEmail?: string | null;
}

export default function TeamChat({
  activeChatId,
  onSelectChat,
}: {
  activeChatId: number | null;
  onSelectChat: (id: number | null) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [newChatMessage, setNewChatMessage] = useState("");

  const { data: chatsData, refetch: refetchChats } = useQuery<{ chats: TeamChatType[] }>({
    queryKey: ["/api/team-chats"],
    refetchInterval: 10000,
  });

  const { data: teamMembersData } = useQuery<{ teamMembers: TeamMember[] }>({
    queryKey: ["/api/admin/team-members"],
  });

  const chats = chatsData?.chats || [];
  const teamMembers = teamMembersData?.teamMembers || [];

  const filteredChats = searchQuery.trim()
    ? chats.filter((c) => {
        const q = searchQuery.toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.participants.some((p) => p.fullName?.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) ||
          c.lastMessagePreview?.toLowerCase().includes(q)
        );
      })
    : chats;

  const createChatMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/team-chats", {
        name: selectedMembers.length > 1 ? (newChatName.trim() || null) : null,
        participantIds: selectedMembers,
        initialMessage: newChatMessage.trim() || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.chat?.id) {
        onSelectChat(data.chat.id);
      }
      refetchChats();
      setIsNewChatOpen(false);
      setNewChatName("");
      setSelectedMembers([]);
      setNewChatMessage("");
    },
    onError: () => {
      toast({ title: "Failed to create chat", variant: "destructive" });
    },
  });

  const getChatDisplayName = (chat: TeamChatType) => {
    if (chat.name) return chat.name;
    if (!chat.isGroup) {
      const other = chat.participants.find((p) => p.id !== user?.id);
      return other?.fullName || other?.email || "Direct Message";
    }
    return chat.participants.map((p) => p.fullName?.split(" ")[0] || p.email.split("@")[0]).join(", ");
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <>
      <div className="flex h-full">
        <div className="w-full flex flex-col">
          <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search team chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
                data-testid="input-team-chat-search"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setIsNewChatOpen(true)}
              data-testid="button-new-team-chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {filteredChats.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground flex-1 flex flex-col items-center justify-center">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{searchQuery ? "No matching chats" : "No team chats yet"}</p>
              <p className="text-xs mt-1">Start a conversation with your team</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setIsNewChatOpen(true)}
                data-testid="button-new-team-chat-empty"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> New Chat
              </Button>
            </div>
          ) : (
            <div className="p-2 overflow-y-auto flex-1">
              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                    chat.id === activeChatId ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                  }`}
                  onClick={() => onSelectChat(chat.id)}
                  data-testid={`team-chat-item-${chat.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold shrink-0">
                        {chat.isGroup ? <Users className="h-3.5 w-3.5" /> : getInitials(getChatDisplayName(chat))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${chat.unreadCount > 0 ? "font-bold" : "font-medium"}`}>
                          {getChatDisplayName(chat)}
                        </div>
                        {chat.isGroup && (
                          <div className="text-[10px] text-muted-foreground">
                            {chat.participants.length} members
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {chat.unreadCount > 0 && (
                        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                          {chat.unreadCount}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {safeFormat(chat.lastMessageAt, "MMM d")}
                      </span>
                    </div>
                  </div>
                  {chat.lastMessagePreview && (
                    <div className="text-xs text-muted-foreground line-clamp-1 ml-10">
                      {chat.lastMessageSender && (
                        <span className="font-medium">{chat.lastMessageSender.split(" ")[0]}: </span>
                      )}
                      {chat.lastMessagePreview}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Team Chat</DialogTitle>
            <DialogDescription>Select team members to start a conversation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Members</Label>
              <ScrollArea className="h-48 border rounded-md p-2">
                {teamMembers.filter((m) => m.id !== user?.id).map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                    data-testid={`checkbox-member-${member.id}`}
                  >
                    <Checkbox
                      checked={selectedMembers.includes(member.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedMembers([...selectedMembers, member.id]);
                        } else {
                          setSelectedMembers(selectedMembers.filter((id) => id !== member.id));
                        }
                      }}
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                        {getInitials(member.fullName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{member.fullName || member.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                      </div>
                    </div>
                  </label>
                ))}
                {teamMembers.filter((m) => m.id !== user?.id).length === 0 && (
                  <div className="text-center py-4 text-sm text-muted-foreground">No other team members found</div>
                )}
              </ScrollArea>
              {selectedMembers.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedMembers.map((id) => {
                    const m = teamMembers.find((tm) => tm.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="text-xs gap-1">
                        {m?.fullName?.split(" ")[0] || m?.email?.split("@")[0]}
                        <button onClick={() => setSelectedMembers(selectedMembers.filter((sid) => sid !== id))} className="ml-0.5 hover:text-destructive">
                          ×
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedMembers.length > 1 && (
              <div className="space-y-1">
                <Label className="text-sm">Group Name (optional)</Label>
                <Input
                  placeholder="e.g., Underwriting Team"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  data-testid="input-team-chat-name"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-sm">First Message (optional)</Label>
              <Input
                placeholder="Say something..."
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                data-testid="input-team-chat-first-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewChatOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createChatMutation.mutate()}
              disabled={selectedMembers.length === 0 || createChatMutation.isPending}
              data-testid="button-create-team-chat"
            >
              {createChatMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

export function TeamChatDetail({ activeChatId }: { activeChatId: number | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [chatDraft, setChatDraft] = useState("");
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState<number[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const { data: chatDetail, isLoading: chatLoading, refetch: refetchChatDetail } = useQuery<{
    chat: any;
    messages: TeamChatMessageType[];
    participants: { userId: number; fullName: string | null; email: string }[];
  }>({
    queryKey: ["/api/team-chats", activeChatId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/team-chats/${activeChatId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!activeChatId,
    refetchInterval: activeChatId ? 5000 : false,
  });

  const { data: chatsData } = useQuery<{ chats: TeamChatType[] }>({
    queryKey: ["/api/team-chats"],
  });

  const { data: teamMembersData } = useQuery<{ teamMembers: TeamMember[] }>({
    queryKey: ["/api/admin/team-members"],
  });

  const chatMessages = chatDetail?.messages || [];
  const chatParticipants = chatDetail?.participants || [];
  const activeChat = chatsData?.chats?.find((c) => c.id === activeChatId);
  const teamMembers = teamMembersData?.teamMembers || [];
  const existingParticipantIds = new Set(chatParticipants.map((p) => p.userId));

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (activeChatId) {
      apiRequest("POST", `/api/team-chats/${activeChatId}/read`, {}).catch(() => {});
    }
  }, [activeChatId, chatMessages.length]);

  const addParticipantsMutation = useMutation({
    mutationFn: async () => {
      if (!activeChatId || addMemberIds.length === 0) return;
      const res = await apiRequest("POST", `/api/team-chats/${activeChatId}/participants`, { userIds: addMemberIds });
      return res.json();
    },
    onSuccess: () => {
      refetchChatDetail();
      queryClient.invalidateQueries({ queryKey: ["/api/team-chats"] });
      setIsAddMembersOpen(false);
      setAddMemberIds([]);
      toast({ title: "Members added" });
    },
    onError: () => {
      toast({ title: "Failed to add members", variant: "destructive" });
    },
  });

  const sendChatMutation = useMutation({
    mutationFn: async () => {
      if (!activeChatId || !chatDraft.trim()) return;
      const res = await apiRequest("POST", `/api/team-chats/${activeChatId}/messages`, { body: chatDraft.trim() });
      return res.json();
    },
    onSuccess: () => {
      setChatDraft("");
      refetchChatDetail();
      queryClient.invalidateQueries({ queryKey: ["/api/team-chats"] });
    },
  });

  const handleChatSend = () => {
    if (chatDraft.trim() && activeChatId) {
      sendChatMutation.mutate();
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  const getChatDisplayName = (chat: TeamChatType) => {
    if (chat.name) return chat.name;
    if (!chat.isGroup) {
      const other = chat.participants.find((p) => p.id !== user?.id);
      return other?.fullName || other?.email || "Direct Message";
    }
    return chat.participants.map((p) => p.fullName?.split(" ")[0] || p.email.split("@")[0]).join(", ");
  };

  if (!activeChatId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Team Chat</p>
          <p className="text-sm">Select a chat or start a new conversation with your team</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shrink-0">
              {activeChat?.isGroup ? <Users className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">
                {activeChat ? getChatDisplayName(activeChat) : "Chat"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {chatParticipants.map((p) => p.fullName?.split(" ")[0] || p.email.split("@")[0]).join(", ")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setAddMemberIds([]); setIsAddMembersOpen(true); }}
            data-testid="button-add-chat-members"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <ScrollArea className="flex-1 p-4">
        {chatLoading ? (
          <div className="text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No messages yet</p>
            <p className="text-xs mt-1">Send the first message below</p>
          </div>
        ) : (
          <div className="space-y-3">
            {chatMessages.map((msg) => {
              const isOwn = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`} data-testid={`team-msg-${msg.id}`}>
                  <div className={`max-w-[70%] rounded-lg p-3 ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs opacity-70">
                        {msg.senderName || "Unknown"} · {safeFormat(msg.createdAt, "MMM d, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        )}
      </ScrollArea>
      <Separator />
      <div className="p-4">
        <div className="flex gap-2">
          <Input
            ref={chatInputRef}
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Type a message..."
            className="flex-1"
            data-testid="input-team-chat-message"
          />
          <Button
            onClick={handleChatSend}
            disabled={!chatDraft.trim() || sendChatMutation.isPending}
            data-testid="button-send-team-chat"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={isAddMembersOpen} onOpenChange={setIsAddMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>Add team members to this chat.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-48 border rounded-md p-2">
            {teamMembers
              .filter((m) => !existingParticipantIds.has(m.id))
              .map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={addMemberIds.includes(member.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setAddMemberIds([...addMemberIds, member.id]);
                      } else {
                        setAddMemberIds(addMemberIds.filter((id) => id !== member.id));
                      }
                    }}
                  />
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                      {member.fullName?.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{member.fullName || member.email}</div>
                      <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                    </div>
                  </div>
                </label>
              ))}
            {teamMembers.filter((m) => !existingParticipantIds.has(m.id)).length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">All team members are already in this chat</div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddMembersOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addParticipantsMutation.mutate()}
              disabled={addMemberIds.length === 0 || addParticipantsMutation.isPending}
              data-testid="button-confirm-add-members"
            >
              {addParticipantsMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Add Members
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

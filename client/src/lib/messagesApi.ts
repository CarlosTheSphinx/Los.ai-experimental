import { apiRequest } from "./queryClient";

export interface MessageThread {
  id: number;
  dealId: number | null;
  userId: number;
  createdBy: number | null;
  subject: string | null;
  isClosed: boolean;
  lastMessageAt: string;
  createdAt: string;
  userName?: string;
}

export interface Message {
  id: number;
  threadId: number;
  senderId: number | null;
  senderRole: 'admin' | 'user' | 'system';
  type: 'message' | 'notification';
  body: string;
  meta: Record<string, any> | null;
  createdAt: string;
  senderName?: string;
}

export async function getUnreadCount(): Promise<{ unreadCount: number }> {
  const res = await fetch("/api/messages/unread-count", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to get unread count");
  return res.json();
}

export async function listThreads(): Promise<{ threads: MessageThread[] }> {
  const res = await fetch("/api/messages/threads", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to get threads");
  return res.json();
}

export async function getThread(id: number): Promise<{ thread: MessageThread; messages: Message[] }> {
  const res = await fetch(`/api/messages/threads/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to get thread");
  return res.json();
}

export async function createThread(userId: number, dealId?: number, subject?: string): Promise<{ thread: MessageThread }> {
  const res = await apiRequest("POST", "/api/messages/threads", { 
    userId, 
    dealId: dealId || null, 
    subject: subject || null 
  });
  return res.json();
}

export async function sendMessage(
  threadId: number, 
  body: string, 
  type: "message" | "notification" = "message",
  meta?: Record<string, any>
): Promise<{ message: Message }> {
  const res = await apiRequest("POST", `/api/messages/threads/${threadId}/messages`, { 
    body, 
    type,
    meta: meta || null
  });
  return res.json();
}

export async function markRead(threadId: number): Promise<{ ok: boolean }> {
  const res = await apiRequest("POST", `/api/messages/threads/${threadId}/read`, {});
  return res.json();
}

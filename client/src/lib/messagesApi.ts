import { apiRequest } from "./queryClient";

export interface MessageFileMeta {
  fileName: string;
  fileType?: string;
  fileSize?: string;
  objectPath?: string;
  uploadedAt?: string;
  status?: string;
}

export function getMessageFileMeta(meta: Record<string, unknown> | null): MessageFileMeta | null {
  if (!meta || typeof meta !== 'object' || !('fileName' in meta) || typeof meta.fileName !== 'string') {
    return null;
  }
  return {
    fileName: meta.fileName as string,
    fileType: typeof meta.fileType === 'string' ? meta.fileType : undefined,
    fileSize: typeof meta.fileSize === 'string' ? meta.fileSize : undefined,
    objectPath: typeof meta.objectPath === 'string' ? meta.objectPath : undefined,
    uploadedAt: typeof meta.uploadedAt === 'string' ? meta.uploadedAt : undefined,
    status: typeof meta.status === 'string' ? meta.status : undefined,
  };
}

export function getAttachmentDownloadUrl(objectPath: string): string {
  if (objectPath.startsWith('/objects/uploads/')) {
    return objectPath;
  }
  const id = objectPath.replace(/^\/?(objects\/)?uploads\//, '');
  return `/objects/uploads/${id}`;
}

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

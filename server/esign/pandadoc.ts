import { db } from "../db";
import { esignEnvelopes, esignEvents, savedQuotes, documentTemplates, templateFields } from "@shared/schema";
import { eq } from "drizzle-orm";

const PANDADOC_API_BASE = "https://api.pandadoc.com/public/v1";

interface PandaDocRecipient {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface PandaDocToken {
  name: string;
  value: string;
}

interface CreateDocumentOptions {
  templateId: string;
  name: string;
  recipients: PandaDocRecipient[];
  tokens: PandaDocToken[];
  metadata?: Record<string, any>;
}

interface PandaDocDocument {
  id: string;
  name: string;
  status: string;
  date_created: string;
  date_modified: string;
  expiration_date?: string;
  recipients?: any[];
}

function getApiKey(): string {
  const apiKey = process.env.PANDADOC_API_KEY;
  if (!apiKey) {
    throw new Error("PANDADOC_API_KEY environment variable is not set");
  }
  return apiKey;
}

async function pandaDocRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = getApiKey();
  
  const response = await fetch(`${PANDADOC_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `API-Key ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  
  return response;
}

export async function createDocumentFromTemplate(
  options: CreateDocumentOptions
): Promise<PandaDocDocument> {
  const response = await pandaDocRequest("/documents", {
    method: "POST",
    body: JSON.stringify({
      name: options.name,
      template_uuid: options.templateId,
      recipients: options.recipients,
      tokens: options.tokens,
      metadata: options.metadata,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc create document error:", errorText);
    throw new Error(`Failed to create PandaDoc document: ${response.status} ${errorText}`);
  }
  
  return response.json();
}

export async function sendDocument(
  documentId: string,
  options: { subject?: string; message?: string; silent?: boolean } = {}
): Promise<{ id: string; status: string }> {
  const response = await pandaDocRequest(`/documents/${documentId}/send`, {
    method: "POST",
    body: JSON.stringify({
      subject: options.subject || "Please sign this document",
      message: options.message || "Please review and sign the attached document.",
      silent: options.silent || false,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc send document error:", errorText);
    throw new Error(`Failed to send PandaDoc document: ${response.status} ${errorText}`);
  }
  
  return response.json();
}

export async function createEmbeddedSession(
  documentId: string,
  recipientEmail: string,
  options: { sessionId?: string; lifetime?: number } = {}
): Promise<{ id: string; expires_at: string }> {
  const response = await pandaDocRequest(`/documents/${documentId}/session`, {
    method: "POST",
    body: JSON.stringify({
      recipient: recipientEmail,
      lifetime: options.lifetime || 3600,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc create session error:", errorText);
    throw new Error(`Failed to create PandaDoc session: ${response.status} ${errorText}`);
  }
  
  return response.json();
}

export async function getDocumentStatus(documentId: string): Promise<PandaDocDocument> {
  const response = await pandaDocRequest(`/documents/${documentId}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc get document error:", errorText);
    throw new Error(`Failed to get PandaDoc document: ${response.status} ${errorText}`);
  }
  
  return response.json();
}

export async function downloadSignedPdf(documentId: string): Promise<ArrayBuffer> {
  const apiKey = getApiKey();
  
  const response = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/download`, {
    headers: {
      "Authorization": `API-Key ${apiKey}`,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc download error:", errorText);
    throw new Error(`Failed to download PandaDoc document: ${response.status} ${errorText}`);
  }
  
  return response.arrayBuffer();
}

export async function listTemplates(): Promise<any[]> {
  const response = await pandaDocRequest("/templates?tag=loan");
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc list templates error:", errorText);
    throw new Error(`Failed to list PandaDoc templates: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  return data.results || [];
}

export async function getTemplateDetails(templateId: string): Promise<any> {
  const response = await pandaDocRequest(`/templates/${templateId}/details`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc get template details error:", errorText);
    throw new Error(`Failed to get PandaDoc template details: ${response.status} ${errorText}`);
  }
  
  return response.json();
}

export function mapStatusToPandaDoc(pandaStatus: string): string {
  const statusMap: Record<string, string> = {
    "document.draft": "draft",
    "document.sent": "sent",
    "document.viewed": "viewed",
    "document.waiting_approval": "pending",
    "document.approved": "approved",
    "document.waiting_pay": "pending_payment",
    "document.paid": "paid",
    "document.completed": "completed",
    "document.voided": "voided",
    "document.declined": "declined",
    "document.expired": "expired",
  };
  
  return statusMap[pandaStatus] || pandaStatus;
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const webhookSecret = process.env.PANDADOC_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn("PANDADOC_WEBHOOK_SECRET not set, skipping signature verification");
    return true;
  }
  
  const crypto = await import("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload)
    .digest("hex");
  
  return signature === expectedSignature;
}

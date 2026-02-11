import { db } from "../db";
import { esignEnvelopes, esignEvents, savedQuotes, documentTemplates, templateFields } from "@shared/schema";
import { eq } from "drizzle-orm";

function getApiBase(): string {
  return process.env.PANDADOC_API_BASE_URL || "https://api.pandadoc.com/public/v1";
}

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
  // Handle both formats: raw key or "API-Key {key}"
  if (apiKey.startsWith("API-Key ")) {
    return apiKey.replace("API-Key ", "");
  }
  return apiKey;
}

async function pandaDocRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = getApiKey();
  const apiBase = getApiBase();
  const fullUrl = `${apiBase}${endpoint}`;
  
  console.log(`[PandaDoc] ${options.method || 'GET'} ${fullUrl}`);
  
  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      "Authorization": `API-Key ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    console.error(`[PandaDoc] Request failed:`);
    console.error(`  URL: ${fullUrl}`);
    console.error(`  Method: ${options.method || 'GET'}`);
    console.error(`  Status: ${response.status} ${response.statusText}`);
    console.error(`  Headers:`, Object.fromEntries(response.headers.entries()));
  }
  
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

export async function waitForDocumentReady(
  documentId: string,
  maxAttempts: number = 15,
  intervalMs: number = 2000
): Promise<PandaDocDocument> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const doc = await getDocumentStatus(documentId);
    console.log(`[PandaDoc] Poll attempt ${attempt}/${maxAttempts} - Document ${documentId} status: ${doc.status}`);
    
    if (doc.status === "document.draft") {
      return doc;
    }
    
    if (doc.status === "document.error") {
      throw new Error(`PandaDoc document ${documentId} entered error state during processing`);
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  throw new Error(`PandaDoc document ${documentId} did not reach draft status after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s). Current status may still be processing — try sending manually.`);
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

export async function createEditingSession(
  documentId: string,
  email: string,
  options: { lifetime?: number } = {}
): Promise<{ id: string; token: string; expires_at: string; email: string; document_id: string }> {
  const response = await pandaDocRequest(`/documents/${documentId}/editing-sessions`, {
    method: "POST",
    body: JSON.stringify({
      email,
      lifetime: options.lifetime || 3600,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc create editing session error:", errorText);
    throw new Error(`Failed to create PandaDoc editing session: ${response.status} ${errorText}`);
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
  const apiBase = getApiBase();
  const fullUrl = `${apiBase}/documents/${documentId}/download`;
  
  console.log(`[PandaDoc] GET ${fullUrl} (download)`);
  
  const response = await fetch(fullUrl, {
    headers: {
      "Authorization": `API-Key ${apiKey}`,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[PandaDoc] Download error:");
    console.error(`  URL: ${fullUrl}`);
    console.error(`  Status: ${response.status} ${response.statusText}`);
    console.error(`  Body: ${errorText}`);
    throw new Error(`Failed to download PandaDoc document: ${response.status} ${errorText}`);
  }
  
  return response.arrayBuffer();
}

export async function listTemplates(tag?: string): Promise<any[]> {
  const endpoint = tag ? `/templates?tag=${encodeURIComponent(tag)}` : "/templates";
  const response = await pandaDocRequest(endpoint);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[PandaDoc] List templates error:");
    console.error(`  Status: ${response.status} ${response.statusText}`);
    console.error(`  Body: ${errorText}`);
    throw new Error(`Failed to list PandaDoc templates: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  return data.results || [];
}

export async function listAllTemplates(): Promise<{ results: any[]; apiBase: string; error?: string }> {
  const apiBase = getApiBase();
  try {
    const response = await pandaDocRequest("/templates");
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PandaDoc] List all templates error:");
      console.error(`  Status: ${response.status} ${response.statusText}`);
      console.error(`  Body: ${errorText}`);
      return { 
        results: [], 
        apiBase, 
        error: `${response.status} ${response.statusText}: ${errorText}` 
      };
    }
    
    const data = await response.json();
    console.log(`[PandaDoc] Found ${data.results?.length || 0} templates`);
    return { results: data.results || [], apiBase };
  } catch (err: any) {
    console.error("[PandaDoc] List all templates exception:", err);
    return { results: [], apiBase, error: err.message };
  }
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

export async function downloadDocument(documentId: string): Promise<Buffer> {
  const response = await pandaDocRequest(`/documents/${documentId}/download`, {
    method: "GET",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc download document error:", errorText);
    throw new Error(`Failed to download PandaDoc document: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

interface PandaDocFieldPlacement {
  name: string;
  role: string;
  type: string;
  required?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  value?: string;
}

export async function createDocumentFromPdf(
  pdfBuffer: Buffer,
  options: {
    name: string;
    recipients: PandaDocRecipient[];
    tokens?: PandaDocToken[];
    metadata?: Record<string, any>;
  }
): Promise<PandaDocDocument> {
  const apiBase = getApiBase();
  const apiKey = getApiKey();

  const formData = new FormData();
  const blob = new Blob([pdfBuffer], { type: "application/pdf" });
  formData.append("file", blob, `${options.name}.pdf`);

  const data: any = {
    name: options.name,
    recipients: options.recipients,
    parse_form_fields: false,
  };

  if (options.tokens && options.tokens.length > 0) {
    data.tokens = options.tokens;
  }
  if (options.metadata) {
    data.metadata = options.metadata;
  }

  formData.append("data", JSON.stringify(data));

  console.log(`[PandaDoc] POST ${apiBase}/documents (PDF upload)`);

  const response = await fetch(`${apiBase}/documents`, {
    method: "POST",
    headers: {
      Authorization: `API-Key ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc create document from PDF error:", errorText);
    throw new Error(`Failed to create PandaDoc document from PDF: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function createTemplateFromFile(
  name: string,
  pdfBuffer: Buffer,
  options: { roles?: Array<{ name: string }>; tags?: string[] } = {}
): Promise<{ id: string; name: string }> {
  const apiBase = getApiBase();
  const apiKey = process.env.PANDADOC_API_KEY;
  if (!apiKey) throw new Error("PANDADOC_API_KEY not configured");

  const formData = new FormData();
  formData.append("name", name);
  const blob = new Blob([pdfBuffer], { type: "application/pdf" });
  formData.append("file", blob, `${name}.pdf`);

  if (options.roles && options.roles.length > 0) {
    formData.append("roles", JSON.stringify(options.roles));
  }
  if (options.tags && options.tags.length > 0) {
    formData.append("tags", JSON.stringify(options.tags));
  }

  console.log(`[PandaDoc] POST ${apiBase}/templates (file upload)`);
  const response = await fetch(`${apiBase}/templates`, {
    method: "POST",
    headers: {
      Authorization: `API-Key ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc create template error:", errorText);
    throw new Error(`Failed to create PandaDoc template: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getDocumentDetails(documentId: string): Promise<any> {
  const response = await pandaDocRequest(`/documents/${documentId}/details`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("PandaDoc get document details error:", errorText);
    throw new Error(`Failed to get PandaDoc document details: ${response.status} ${errorText}`);
  }
  
  return response.json();
}

interface PandaDocFieldInjection {
  name: string;
  type: string;
  assignedToRecipientUuid: string;
  page: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  required?: boolean;
  value?: string;
}

export async function injectDocumentFields(
  documentId: string,
  fields: PandaDocFieldInjection[]
): Promise<{ fields: any[] }> {
  if (fields.length === 0) {
    console.log(`[PandaDoc] No fields to inject for document ${documentId}`);
    return { fields: [] };
  }

  const payload = {
    fields: fields.map(f => ({
      name: f.name,
      type: f.type,
      assigned_to: f.assignedToRecipientUuid,
      settings: {
        required: f.required !== false,
        ...(f.value ? { placeholder: f.value } : {}),
      },
      layout: {
        page: f.page,
        position: {
          offset_x: String(f.offsetX),
          offset_y: String(f.offsetY),
          anchor_point: 'topleft',
        },
        style: {
          width: f.width,
          height: f.height,
        },
      },
    })),
  };

  console.log(`[PandaDoc] POST /documents/${documentId}/fields (injecting ${fields.length} fields)`);

  const response = await pandaDocRequest(`/documents/${documentId}/fields`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[PandaDoc] Field injection error:", errorText);
    throw new Error(`Failed to inject fields into PandaDoc document: ${response.status} ${errorText}`);
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

export async function getCurrentMember(): Promise<any> {
  const response = await pandaDocRequest("/members/current");
  if (!response.ok) {
    const errorText = await response.text();
    return { error: `${response.status} ${response.statusText}: ${errorText}` };
  }
  return response.json();
}

export async function getDebugInfo(): Promise<{
  apiBase: string;
  authType: string;
  apiKeyPrefix: string;
  currentMember: any;
  workspaceId: string | null;
  isSandbox: boolean;
}> {
  const apiBase = getApiBase();
  const apiKey = getApiKey();
  const apiKeyPrefix = apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4);
  const isSandbox = apiBase.includes("sandbox") || apiKey.toLowerCase().includes("sandbox");

  let currentMember: any = null;
  let workspaceId: string | null = null;
  try {
    currentMember = await getCurrentMember();
    workspaceId = currentMember?.workspace || currentMember?.workspace_id || null;
  } catch (err: any) {
    currentMember = { error: err.message };
  }

  return {
    apiBase,
    authType: "API-Key",
    apiKeyPrefix,
    currentMember,
    workspaceId,
    isSandbox,
  };
}

export async function runCapabilityTest(testEmail: string): Promise<{
  success: boolean;
  step: string;
  error?: string;
  pandadocError?: any;
  documentId?: string;
}> {
  try {
    const minimalPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
      "utf-8"
    );

    const formData = new FormData();
    const blob = new Blob([minimalPdf], { type: "application/pdf" });
    formData.append("file", blob, "capability_test.pdf");
    formData.append("data", JSON.stringify({
      name: "[API Test] Capability Test - Delete Me",
      recipients: [{
        email: testEmail,
        first_name: "Test",
        last_name: "Recipient",
        role: "Signer 1",
      }],
      parse_form_fields: false,
    }));

    const apiBase = getApiBase();
    const apiKey = getApiKey();

    const createRes = await fetch(`${apiBase}/documents`, {
      method: "POST",
      headers: { Authorization: `API-Key ${apiKey}` },
      body: formData,
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      let parsedError;
      try { parsedError = JSON.parse(errorText); } catch { parsedError = errorText; }
      return { success: false, step: "create_document", error: errorText, pandadocError: parsedError };
    }

    const doc = await createRes.json();
    console.log(`[PandaDoc Debug] Test doc created: ${doc.id}`);

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await pandaDocRequest(`/documents/${doc.id}`);
      if (statusRes.ok) {
        const statusDoc = await statusRes.json();
        if (statusDoc.status === "document.draft") break;
        if (statusDoc.status === "document.error") {
          return { success: false, step: "wait_draft", error: "Document entered error state", documentId: doc.id };
        }
      }
    }

    const sendRes = await pandaDocRequest(`/documents/${doc.id}/send`, {
      method: "POST",
      body: JSON.stringify({
        subject: "[Test] Capability Test - Please Ignore",
        message: "This is an automated API capability test. Please ignore.",
        silent: true,
      }),
    });

    if (!sendRes.ok) {
      const errorText = await sendRes.text();
      let parsedError;
      try { parsedError = JSON.parse(errorText); } catch { parsedError = errorText; }
      return { success: false, step: "send_document", error: errorText, pandadocError: parsedError, documentId: doc.id };
    }

    try {
      await pandaDocRequest(`/documents/${doc.id}`, { method: "DELETE" });
    } catch {}

    return { success: true, step: "completed", documentId: doc.id };
  } catch (err: any) {
    return { success: false, step: "exception", error: err.message };
  }
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

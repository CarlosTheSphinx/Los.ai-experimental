import { Router, Request, Response } from "express";
import multer from "multer";
import { db } from "../db";
import {
  funds, intakeDeals, intakeDealDocuments, intakeDocumentRules,
  intakeAiAnalysis, intakeDealStatusHistory, intakeDealFundSubmissions,
  insertFundSchema, insertIntakeDealSchema, insertIntakeDocumentRuleSchema,
  commercialFormConfig,
  projects, users,
  type Fund, type IntakeDeal, type IntakeDocumentRule, type IntakeAiAnalysis,
  type IntakeDealStatusHistory, type IntakeDealFundSubmission, type IntakeDealDocument,
} from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { runIntakeAiPipeline } from "../agents/intakeAgents";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import { getTenantId as resolveUserTenant } from "../utils/tenant";

import OpenAI from "openai";

const OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

const objectStorageService = new ObjectStorageService();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/x-m4a', 'video/webm'];
    cb(null, allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|mp3|mp4|m4a|wav|ogg)$/i) !== null);
  },
  limits: { fileSize: 25 * 1024 * 1024 }
});

const templateUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    cb(null, allowedMimeTypes.includes(file.mimetype) || allowedExts.includes(ext));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

const router = Router();

async function getTenantId(req: Request): Promise<number | null> {
  const user = (req as any).user;
  if (!user) return null;
  return resolveUserTenant({ id: user.id, role: user.role, invitedBy: user.invitedBy ?? null });
}

function getUserId(req: Request): number | null {
  return (req as any).user?.id || null;
}

function getUserRole(req: Request): string {
  return (req as any).user?.role || "";
}

function isAdmin(req: Request): boolean {
  const role = getUserRole(req);
  return ["super_admin", "lender", "processor"].includes(role);
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

function safeParseId(param: string): number | null {
  const id = parseInt(param);
  return isNaN(id) ? null : id;
}

// ===== FUNDS CRUD =====

router.get("/api/commercial/funds", async (req: Request, res: Response) => {
  try {
    const tenantId = await getTenantId(req);
    const conditions = [];
    if (tenantId) conditions.push(eq(funds.tenantId, tenantId));
    const result = await db.select().from(funds)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(funds.createdAt));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/commercial/funds/:id", async (req: Request, res: Response) => {
  try {
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid fund ID" });
    const tenantId = await getTenantId(req);
    const [fund] = await db.select().from(funds).where(and(eq(funds.id, id), tenantId ? eq(funds.tenantId, tenantId) : undefined));
    if (!fund) return res.status(404).json({ error: "Fund not found" });
    res.json(fund);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/funds", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const tenantId = await getTenantId(req);
    const data = { ...req.body, tenantId };
    const [created] = await db.insert(funds).values(data).returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/api/commercial/funds/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid fund ID" });
    const tenantId = await getTenantId(req);
    const [updated] = await db.update(funds)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(funds.id, id), tenantId ? eq(funds.tenantId, tenantId) : undefined))
      .returning();
    if (!updated) return res.status(404).json({ error: "Fund not found" });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/commercial/funds/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid fund ID" });
    const tenantId = await getTenantId(req);
    const result = await db.delete(funds).where(and(eq(funds.id, id), tenantId ? eq(funds.tenantId, tenantId) : undefined)).returning();
    if (!result.length) return res.status(404).json({ error: "Fund not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DOCUMENT RULES CRUD =====

router.get("/api/commercial/document-rules", async (req: Request, res: Response) => {
  try {
    const tenantId = await getTenantId(req);
    const conditions = [];
    if (tenantId) conditions.push(eq(intakeDocumentRules.tenantId, tenantId));
    const result = await db.select().from(intakeDocumentRules)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(intakeDocumentRules.createdAt));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/document-rules", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const tenantId = await getTenantId(req);
    const data = { ...req.body, tenantId };
    const [created] = await db.insert(intakeDocumentRules).values(data).returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/api/commercial/document-rules/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid rule ID" });
    const tenantId = await getTenantId(req);
    const [updated] = await db.update(intakeDocumentRules)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(intakeDocumentRules.id, id), tenantId ? eq(intakeDocumentRules.tenantId, tenantId) : undefined))
      .returning();
    if (!updated) return res.status(404).json({ error: "Rule not found" });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/commercial/document-rules/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid rule ID" });
    const tenantId = await getTenantId(req);
    const result = await db.delete(intakeDocumentRules).where(and(eq(intakeDocumentRules.id, id), tenantId ? eq(intakeDocumentRules.tenantId, tenantId) : undefined)).returning();
    if (!result.length) return res.status(404).json({ error: "Rule not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DOCUMENT RULE TEMPLATE UPLOAD =====

router.post("/api/commercial/document-rules/:id/template", templateUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid rule ID" });
    const { docType } = req.body;
    if (!docType) return res.status(400).json({ error: "docType is required" });
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const tenantId = await getTenantId(req);
    const [rule] = await db.select().from(intakeDocumentRules)
      .where(and(eq(intakeDocumentRules.id, id), tenantId ? eq(intakeDocumentRules.tenantId, tenantId) : undefined));
    if (!rule) return res.status(404).json({ error: "Rule not found" });

    const result = await objectStorageService.uploadFile(
      req.file.buffer,
      `commercial/templates/${id}/${Date.now()}-${req.file.originalname}`,
      req.file.mimetype || "application/octet-stream"
    );

    const templates = (rule.documentTemplates || {}) as Record<string, { url: string; fileName: string }>;
    templates[docType] = { url: result.objectPath, fileName: req.file.originalname };

    const [updated] = await db.update(intakeDocumentRules)
      .set({ documentTemplates: templates, updatedAt: new Date() })
      .where(eq(intakeDocumentRules.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error("Template upload error:", error);
    res.status(500).json({ error: "Failed to upload template" });
  }
});

router.delete("/api/commercial/document-rules/:id/template/:docType", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid rule ID" });
    const docType = decodeURIComponent(req.params.docType);

    const tenantId = await getTenantId(req);
    const [rule] = await db.select().from(intakeDocumentRules)
      .where(and(eq(intakeDocumentRules.id, id), tenantId ? eq(intakeDocumentRules.tenantId, tenantId) : undefined));
    if (!rule) return res.status(404).json({ error: "Rule not found" });

    const templates = { ...((rule.documentTemplates || {}) as Record<string, { url: string; fileName: string }>) };
    delete templates[docType];

    const [updated] = await db.update(intakeDocumentRules)
      .set({ documentTemplates: templates, updatedAt: new Date() })
      .where(eq(intakeDocumentRules.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete template" });
  }
});

router.get("/api/commercial/document-rules/:id/template/:docType/download", async (req: Request, res: Response) => {
  try {
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid rule ID" });
    const docType = decodeURIComponent(req.params.docType);

    const [rule] = await db.select().from(intakeDocumentRules)
      .where(eq(intakeDocumentRules.id, id));
    if (!rule) return res.status(404).json({ error: "Rule not found" });

    const templates = (rule.documentTemplates || {}) as Record<string, { url: string; fileName: string }>;
    const template = templates[docType];
    if (!template?.url) return res.status(404).json({ error: "No template for this document type" });

    const objectFile = await objectStorageService.getObjectEntityFile(template.url);
    if (!objectFile) return res.status(404).json({ error: "Template file not found" });

    res.setHeader("Content-Disposition", `attachment; filename="${template.fileName}"`);
    await objectStorageService.downloadObject(objectFile, res);
  } catch (error: any) {
    console.error("Template download error:", error);
    res.status(500).json({ error: "Failed to download template" });
  }
});

// ===== EVALUATE DOCUMENT RULES =====

router.post("/api/commercial/evaluate-document-rules", async (req: Request, res: Response) => {
  try {
    const tenantId = await getTenantId(req);
    const { assetType, loanAmount, propertyState } = req.body;
    const rules = await db.select().from(intakeDocumentRules).where(
      and(
        eq(intakeDocumentRules.isActive, true),
        tenantId
          ? sql`(${intakeDocumentRules.tenantId} = ${tenantId} OR ${intakeDocumentRules.tenantId} IS NULL)`
          : undefined,
      )
    );

    const baseDocuments = [
      "Loan Application (1003)",
      "Bank Statement",
      "Tax Returns (2 years)",
      "Purchase Contract",
    ];

    const additionalDocs = new Set<string>();
    const templates: Record<string, { ruleId: number; fileName: string }> = {};
    for (const rule of rules) {
      const conds = rule.conditions as Record<string, any>;
      let match = true;

      if (conds.asset_type) {
        const types = Array.isArray(conds.asset_type) ? conds.asset_type : [conds.asset_type];
        if (!types.includes(assetType)) match = false;
      }
      if (conds.loan_amount_gt && (!loanAmount || loanAmount <= conds.loan_amount_gt)) match = false;
      if (conds.loan_amount_lt && (!loanAmount || loanAmount >= conds.loan_amount_lt)) match = false;
      if (conds.property_state) {
        const states = Array.isArray(conds.property_state) ? conds.property_state : [conds.property_state];
        if (!states.includes(propertyState)) match = false;
      }

      if (match) {
        const docs = rule.requiredDocuments as string[];
        docs.forEach(d => additionalDocs.add(d));
        const ruleTemplates = (rule.documentTemplates || {}) as Record<string, { url: string; fileName: string }>;
        for (const [docType, tmpl] of Object.entries(ruleTemplates)) {
          if (tmpl?.url) templates[docType] = { ruleId: rule.id, fileName: tmpl.fileName };
        }
      }
    }

    res.json({ requiredDocuments: [...baseDocuments, ...additionalDocs], templates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== INTAKE DEALS CRUD =====

router.get("/api/commercial/deals", async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const userId = getUserId(req);
    const tenantId = await getTenantId(req);
    const { status } = req.query;

    const conditions = [];

    if (role === "broker") {
      if (userId) conditions.push(eq(intakeDeals.brokerId, userId));
    }

    if (status && typeof status === "string") {
      if (status === "new") {
        conditions.push(inArray(intakeDeals.status, ["submitted", "analyzed", "no_match"]));
      } else if (status === "review") {
        conditions.push(eq(intakeDeals.status, "under_review"));
      } else if (status === "completed") {
        conditions.push(inArray(intakeDeals.status, ["approved", "conditional", "rejected", "transferred"]));
      } else {
        conditions.push(eq(intakeDeals.status, status));
      }
    }

    const result = await db.select({
      deal: intakeDeals,
      brokerName: users.fullName,
      brokerEmail: users.email,
    })
      .from(intakeDeals)
      .leftJoin(users, eq(intakeDeals.brokerId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(intakeDeals.createdAt));

    const deals = result.map(r => ({
      ...r.deal,
      brokerName: r.brokerName,
      brokerEmail: r.brokerEmail,
    }));

    res.json(deals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/commercial/deals/:id", async (req: Request, res: Response) => {
  try {
    const dealId = safeParseId(req.params.id);
    if (!dealId) return res.status(400).json({ error: "Invalid deal ID" });
    const tenantId = await getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);

    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (role === "broker" && userId) whereConditions.push(eq(intakeDeals.brokerId, userId));

    const [dealResult] = await db.select({
      deal: intakeDeals,
      brokerName: users.fullName,
      brokerEmail: users.email,
    })
      .from(intakeDeals)
      .leftJoin(users, eq(intakeDeals.brokerId, users.id))
      .where(and(...whereConditions));

    if (!dealResult) return res.status(404).json({ error: "Deal not found" });

    const documents = await db.select().from(intakeDealDocuments)
      .where(eq(intakeDealDocuments.dealId, dealId))
      .orderBy(desc(intakeDealDocuments.uploadedAt));

    const [analysis] = await db.select().from(intakeAiAnalysis)
      .where(eq(intakeAiAnalysis.dealId, dealId))
      .orderBy(desc(intakeAiAnalysis.createdAt))
      .limit(1);

    const statusHistory = await db.select().from(intakeDealStatusHistory)
      .where(eq(intakeDealStatusHistory.dealId, dealId))
      .orderBy(desc(intakeDealStatusHistory.createdAt));

    const fundSubmissions = await db.select({
      submission: intakeDealFundSubmissions,
      fundName: funds.fundName,
    })
      .from(intakeDealFundSubmissions)
      .leftJoin(funds, eq(intakeDealFundSubmissions.fundId, funds.id))
      .where(eq(intakeDealFundSubmissions.dealId, dealId));

    res.json({
      ...dealResult.deal,
      brokerName: dealResult.brokerName,
      brokerEmail: dealResult.brokerEmail,
      documents,
      analysis,
      statusHistory,
      fundSubmissions: fundSubmissions.map(fs => ({ ...fs.submission, fundName: fs.fundName })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/deals", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const tenantId = await getTenantId(req);
    const role = getUserRole(req);

    let dealTenantId = tenantId;
    if (role === "broker") {
      const adminUser = await db.select({ id: users.id }).from(users)
        .where(inArray(users.role, ["super_admin", "lender"]))
        .limit(1);
      dealTenantId = adminUser.length > 0 ? adminUser[0].id : tenantId;
    }

    const data: any = {
      ...req.body,
      brokerId: role === "broker" ? userId : req.body.brokerId,
      tenantId: dealTenantId,
      status: "draft",
    };

    if (data.loanAmount && data.propertyValue && data.propertyValue > 0) {
      data.ltvPct = parseFloat(((data.loanAmount / data.propertyValue) * 100).toFixed(2));
    }
    if (data.noiAnnual && data.loanAmount) {
      const annualDebtService = data.loanAmount * 0.07;
      data.dscr = annualDebtService > 0 ? parseFloat((data.noiAnnual / annualDebtService).toFixed(2)) : null;
    }

    const [created] = await db.insert(intakeDeals).values(data).returning();

    await db.insert(intakeDealStatusHistory).values({
      dealId: created.id,
      toStatus: "draft",
      updatedBy: userId,
      notes: "Deal created as draft",
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/api/commercial/deals/:id", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const data = { ...req.body, updatedAt: new Date() };

    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (role === "broker" && userId) whereConditions.push(eq(intakeDeals.brokerId, userId));

    const [existing] = await db.select().from(intakeDeals).where(and(...whereConditions));
    if (!existing) return res.status(404).json({ error: "Deal not found" });

    if (data.loanAmount && data.propertyValue && data.propertyValue > 0) {
      data.ltvPct = parseFloat(((data.loanAmount / data.propertyValue) * 100).toFixed(2));
    }
    if (data.noiAnnual && data.loanAmount) {
      const annualDebtService = data.loanAmount * 0.07;
      data.dscr = annualDebtService > 0 ? parseFloat((data.noiAnnual / annualDebtService).toFixed(2)) : null;
    }

    const [updated] = await db.update(intakeDeals)
      .set(data)
      .where(eq(intakeDeals.id, dealId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Deal not found" });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== BROKER NOTES =====

router.post("/api/commercial/deals/:id/notes", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: "Note content is required" });

    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (role === "broker" && userId) whereConditions.push(eq(intakeDeals.brokerId, userId));

    const [deal] = await db.select().from(intakeDeals).where(and(...whereConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const user = userId ? await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]) : null;
    const authorName = user?.fullName || user?.email || "Unknown";

    const existingNotes = (deal.brokerNotes || []) as Array<{ content: string; createdAt: string; authorName: string }>;
    const newNote = { content: content.trim(), createdAt: new Date().toISOString(), authorName };
    const updatedNotes = [newNote, ...existingNotes];

    const [updated] = await db.update(intakeDeals)
      .set({ brokerNotes: updatedNotes, updatedAt: new Date() })
      .where(eq(intakeDeals.id, dealId))
      .returning();

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== BROKER DOCUMENT UPLOAD =====

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.post("/api/commercial/deals/:id/upload-document", docUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const documentType = req.body.documentType || "General";

    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (role === "broker" && userId) whereConditions.push(eq(intakeDeals.brokerId, userId));

    const [deal] = await db.select().from(intakeDeals).where(and(...whereConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const result = await objectStorageService.uploadFile(
      req.file.buffer,
      `commercial/deals/${dealId}/docs/${Date.now()}-${req.file.originalname}`,
      req.file.mimetype || "application/octet-stream"
    );

    await db.update(intakeDealDocuments)
      .set({ isCurrent: false })
      .where(and(
        eq(intakeDealDocuments.dealId, dealId),
        eq(intakeDealDocuments.documentType, documentType),
        eq(intakeDealDocuments.isCurrent, true),
      ));

    const existingVersions = await db.select().from(intakeDealDocuments)
      .where(and(
        eq(intakeDealDocuments.dealId, dealId),
        eq(intakeDealDocuments.documentType, documentType),
      ));

    const [created] = await db.insert(intakeDealDocuments).values({
      dealId,
      documentType,
      version: existingVersions.length + 1,
      fileName: req.file.originalname,
      filePath: result.objectPath,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: userId,
      isCurrent: true,
    }).returning();

    res.status(201).json(created);
  } catch (error: any) {
    console.error("Document upload error:", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

// ===== SUBMIT DEAL (changes status + triggers AI) =====

router.post("/api/commercial/deals/:id/submit", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    const userId = getUserId(req);

    const [deal] = await db.select().from(intakeDeals).where(eq(intakeDeals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    if (deal.status !== "draft") return res.status(400).json({ error: "Only draft deals can be submitted" });

    if (!deal.dealName || !deal.loanAmount || !deal.assetType) {
      return res.status(400).json({ error: "Missing required fields: deal name, loan amount, asset type" });
    }

    const [updated] = await db.update(intakeDeals)
      .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(intakeDeals.id, dealId))
      .returning();

    await db.insert(intakeDealStatusHistory).values({
      dealId,
      fromStatus: "draft",
      toStatus: "submitted",
      updatedBy: userId,
      notes: "Deal submitted for review",
    });

    runIntakeAiPipeline(dealId).catch(err => {
      console.error(`[Intake AI] Pipeline failed for deal ${dealId}:`, err);
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DEAL DOCUMENTS =====

router.post("/api/commercial/deals/:id/documents", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    const userId = getUserId(req);
    const { documentType, fileName, filePath, fileSize, mimeType, comments } = req.body;

    await db.update(intakeDealDocuments)
      .set({ isCurrent: false })
      .where(and(
        eq(intakeDealDocuments.dealId, dealId),
        eq(intakeDealDocuments.documentType, documentType),
        eq(intakeDealDocuments.isCurrent, true),
      ));

    const existingVersions = await db.select().from(intakeDealDocuments)
      .where(and(
        eq(intakeDealDocuments.dealId, dealId),
        eq(intakeDealDocuments.documentType, documentType),
      ));

    const [created] = await db.insert(intakeDealDocuments).values({
      dealId,
      documentType,
      version: existingVersions.length + 1,
      fileName,
      filePath: filePath || `/uploads/intake/${dealId}/${fileName}`,
      fileSize,
      mimeType,
      uploadedBy: userId,
      isCurrent: true,
      comments,
    }).returning();

    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/commercial/deals/:id/documents", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    const docs = await db.select().from(intakeDealDocuments)
      .where(eq(intakeDealDocuments.dealId, dealId))
      .orderBy(desc(intakeDealDocuments.uploadedAt));
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== LENDER ACTIONS =====

router.post("/api/commercial/deals/:id/update-status", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealId = safeParseId(req.params.id);
    if (!dealId) return res.status(400).json({ error: "Invalid deal ID" });
    const userId = getUserId(req);
    const tenantId = await getTenantId(req);
    const { status, notes } = req.body;

    const whereConditions = [eq(intakeDeals.id, dealId)];
    const [deal] = await db.select().from(intakeDeals).where(and(...whereConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const [updated] = await db.update(intakeDeals)
      .set({ status, updatedAt: new Date() })
      .where(eq(intakeDeals.id, dealId))
      .returning();

    await db.insert(intakeDealStatusHistory).values({
      dealId,
      fromStatus: deal.status,
      toStatus: status,
      updatedBy: userId,
      notes,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/deals/:id/send-to-fund", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealId = safeParseId(req.params.id);
    if (!dealId) return res.status(400).json({ error: "Invalid deal ID" });
    const userId = getUserId(req);
    const tenantId = await getTenantId(req);
    const { fundId, notes } = req.body;

    const parsedFundId = safeParseId(fundId);
    if (!parsedFundId) return res.status(400).json({ error: "Invalid fund ID" });

    const dealConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) dealConditions.push(eq(intakeDeals.tenantId, tenantId));
    const [deal] = await db.select().from(intakeDeals).where(and(...dealConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const fundConditions = [eq(funds.id, parsedFundId)];
    if (tenantId) fundConditions.push(eq(funds.tenantId, tenantId));
    const [fund] = await db.select().from(funds).where(and(...fundConditions));
    if (!fund) return res.status(404).json({ error: "Fund not found" });

    const [existing] = await db.select().from(intakeDealFundSubmissions)
      .where(and(
        eq(intakeDealFundSubmissions.dealId, dealId),
        eq(intakeDealFundSubmissions.fundId, parsedFundId),
      ));
    if (existing) return res.status(400).json({ error: "Deal already submitted to this fund" });

    const [submission] = await db.insert(intakeDealFundSubmissions).values({
      dealId,
      fundId: parsedFundId,
      submittedBy: userId,
      notes,
      fundResponseStatus: "pending",
    }).returning();

    await db.update(intakeDeals)
      .set({ status: "under_review", updatedAt: new Date() })
      .where(eq(intakeDeals.id, dealId));

    await db.insert(intakeDealStatusHistory).values({
      dealId,
      fromStatus: "analyzed",
      toStatus: "under_review",
      updatedBy: userId,
      notes: `Sent to fund #${fundId}`,
    });

    res.json(submission);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== TRANSFER TO ORIGINATION =====

router.post("/api/commercial/deals/:id/transfer", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealId = safeParseId(req.params.id);
    if (!dealId) return res.status(400).json({ error: "Invalid deal ID" });
    const userId = getUserId(req);
    const tenantId = await getTenantId(req);

    const whereConditions = [eq(intakeDeals.id, dealId)];
    const [deal] = await db.select().from(intakeDeals).where(and(...whereConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    if (!["approved", "conditional", "under_review"].includes(deal.status)) {
      return res.status(400).json({ error: "Only approved/conditional/under_review deals can be transferred" });
    }

    let brokerEmail = "";
    if (deal.brokerId) {
      const [broker] = await db.select({ email: users.email }).from(users).where(eq(users.id, deal.brokerId));
      if (broker) brokerEmail = broker.email;
    }

    const [project] = await db.insert(projects).values({
      projectName: deal.dealName || `Intake Deal #${dealId}`,
      loanAmount: deal.loanAmount ? String(deal.loanAmount) : undefined,
      propertyType: deal.assetType,
      propertyAddress: deal.propertyAddress,
      status: "active",
      currentStage: "Application",
      borrowerName: deal.borrowerName,
      borrowerEmail: deal.borrowerEmail || "",
      tenantId: deal.tenantId,
      brokerEmail: brokerEmail || undefined,
    } as any).returning();

    await db.update(intakeDeals)
      .set({ status: "transferred", linkedProjectId: project.id, updatedAt: new Date() })
      .where(eq(intakeDeals.id, dealId));

    await db.insert(intakeDealStatusHistory).values({
      dealId,
      fromStatus: deal.status,
      toStatus: "transferred",
      updatedBy: userId,
      notes: `Transferred to origination as project #${project.id}`,
    });

    res.json({ deal: { ...deal, status: "transferred", linkedProjectId: project.id }, project });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== RE-RUN AI ANALYSIS =====

router.post("/api/commercial/deals/:id/reanalyze", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealId = safeParseId(req.params.id);
    if (!dealId) return res.status(400).json({ error: "Invalid deal ID" });
    const tenantId = await getTenantId(req);
    const [deal] = await db.select().from(intakeDeals).where(eq(intakeDeals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    runIntakeAiPipeline(dealId).catch(err => {
      console.error(`[Intake AI] Re-analysis failed for deal ${dealId}:`, err);
    });

    res.json({ message: "AI analysis started" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PORTFOLIO SUMMARY =====

router.get("/api/commercial/portfolio-summary", async (req: Request, res: Response) => {
  try {
    const allDeals = await db.select().from(intakeDeals);

    const intake = {
      draft: allDeals.filter(d => d.status === "draft").length,
      submitted: allDeals.filter(d => d.status === "submitted").length,
      analyzed: allDeals.filter(d => d.status === "analyzed").length,
      under_review: allDeals.filter(d => d.status === "under_review").length,
      approved: allDeals.filter(d => d.status === "approved").length,
      conditional: allDeals.filter(d => d.status === "conditional").length,
      rejected: allDeals.filter(d => d.status === "rejected").length,
      transferred: allDeals.filter(d => d.status === "transferred").length,
      no_match: allDeals.filter(d => d.status === "no_match").length,
      total: allDeals.length,
    };

    res.json({ intake });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== FORM CONFIGURATION =====

const DEFAULT_FORM_FIELDS = [
  { fieldKey: "dealName", fieldLabel: "Deal Name", section: "Deal Basics", fieldType: "text", isRequired: true, sortOrder: 1 },
  { fieldKey: "loanAmount", fieldLabel: "Loan Amount ($)", section: "Deal Basics", fieldType: "number", isRequired: true, sortOrder: 2 },
  { fieldKey: "assetType", fieldLabel: "Asset Type", section: "Deal Basics", fieldType: "select", isRequired: true, sortOrder: 3, options: { choices: ["Multifamily","Office","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing"] } },
  { fieldKey: "propertyAddress", fieldLabel: "Property Address", section: "Deal Basics", fieldType: "text", isRequired: false, sortOrder: 4 },
  { fieldKey: "propertyCity", fieldLabel: "City", section: "Deal Basics", fieldType: "text", isRequired: false, sortOrder: 5 },
  { fieldKey: "propertyState", fieldLabel: "State", section: "Deal Basics", fieldType: "select", isRequired: false, sortOrder: 6, options: { choices: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"] } },
  { fieldKey: "propertyZip", fieldLabel: "ZIP Code", section: "Deal Basics", fieldType: "text", isRequired: false, sortOrder: 7 },
  { fieldKey: "borrowerName", fieldLabel: "Borrower / Entity Name", section: "Borrower Information", fieldType: "text", isRequired: false, sortOrder: 10 },
  { fieldKey: "borrowerEntityType", fieldLabel: "Entity Type", section: "Borrower Information", fieldType: "select", isRequired: false, sortOrder: 11, options: { choices: ["Individual","LLC","Corporation","Partnership","Trust"] } },
  { fieldKey: "borrowerCreditScore", fieldLabel: "Credit Score", section: "Borrower Information", fieldType: "number", isRequired: false, sortOrder: 12 },
  { fieldKey: "hasGuarantor", fieldLabel: "Has Guarantor?", section: "Borrower Information", fieldType: "radio", isRequired: false, sortOrder: 13, options: { choices: ["Yes","No"] } },
  { fieldKey: "propertyValue", fieldLabel: "Property Appraisal Value ($)", section: "Property Metrics", fieldType: "number", isRequired: true, sortOrder: 20 },
  { fieldKey: "noiAnnual", fieldLabel: "Annual NOI ($)", section: "Property Metrics", fieldType: "number", isRequired: false, sortOrder: 21 },
  { fieldKey: "occupancyPct", fieldLabel: "Occupancy %", section: "Property Metrics", fieldType: "number", isRequired: false, sortOrder: 22 },
];

router.get("/api/commercial/form-config", async (req: Request, res: Response) => {
  try {
    const tenantId = await getTenantId(req);
    const conditions = [];
    if (tenantId) conditions.push(eq(commercialFormConfig.tenantId, tenantId));

    let fields = await db.select().from(commercialFormConfig)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(commercialFormConfig.sortOrder);

    if (fields.length === 0) {
      const inserted = [];
      for (const field of DEFAULT_FORM_FIELDS) {
        const [row] = await db.insert(commercialFormConfig).values({
          ...field,
          tenantId,
          isVisible: true,
          isRequired: field.isRequired,
          options: field.options || null,
        } as any).returning();
        inserted.push(row);
      }
      fields = inserted;
    }

    res.json(fields);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/api/commercial/form-config", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const tenantId = await getTenantId(req);
    const { fields } = req.body;
    if (!Array.isArray(fields)) return res.status(400).json({ error: "fields must be an array" });

    const updated = [];
    for (const field of fields) {
      const conditions = [eq(commercialFormConfig.id, field.id)];
      if (tenantId) conditions.push(eq(commercialFormConfig.tenantId, tenantId));

      const [row] = await db.update(commercialFormConfig)
        .set({
          fieldLabel: field.fieldLabel,
          fieldType: field.fieldType,
          displayFormat: field.displayFormat || "plain",
          isVisible: field.isVisible,
          isRequired: field.isRequired,
          sortOrder: field.sortOrder,
          options: field.options ?? null,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning();
      if (row) updated.push(row);
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/form-config", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const tenantId = await getTenantId(req);
    const { fieldKey, fieldLabel, section, fieldType, displayFormat, isRequired, sortOrder, options } = req.body;

    if (!fieldKey || !fieldLabel || !section || !fieldType) {
      return res.status(400).json({ error: "fieldKey, fieldLabel, section, and fieldType are required" });
    }

    const existing = await db.select().from(commercialFormConfig)
      .where(and(
        eq(commercialFormConfig.fieldKey, fieldKey),
        tenantId ? eq(commercialFormConfig.tenantId, tenantId) : undefined
      ));
    if (existing.length > 0) {
      return res.status(409).json({ error: `A field with key "${fieldKey}" already exists` });
    }

    const [row] = await db.insert(commercialFormConfig).values({
      tenantId,
      fieldKey,
      fieldLabel,
      section,
      fieldType,
      displayFormat: displayFormat || "plain",
      isVisible: true,
      isRequired: isRequired ?? false,
      isCustom: true,
      sortOrder: sortOrder ?? 99,
      options: options ?? null,
    } as any).returning();

    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/deals/:id/transcribe-story", audioUpload.single("audio"), async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });

    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const [deal] = await db.select().from(intakeDeals).where(eq(intakeDeals.id, dealId));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const isAdmin = ["super_admin", "lender", "processor"].includes(user.role);
    const isBrokerOwner = user.role === "broker" && deal.brokerEmail === user.email;
    if (!isAdmin && !isBrokerOwner) {
      return res.status(403).json({ error: "Not authorized to modify this deal" });
    }

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No audio file provided" });

    if (!openai) return res.status(500).json({ error: "OpenAI not configured" });

    const audioFile = new File([file.buffer], file.originalname || "recording.webm", {
      type: file.mimetype,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
    });

    const transcript = transcription.text;

    const result = await db.update(intakeDeals)
      .set({ dealStoryTranscript: transcript, updatedAt: new Date() })
      .where(eq(intakeDeals.id, dealId));

    res.json({ transcript });
  } catch (error: any) {
    console.error("[Story Transcription Error]", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/commercial/form-config/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const tenantId = await getTenantId(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid field id" });

    const conditions = [eq(commercialFormConfig.id, id), eq(commercialFormConfig.isCustom, true)];
    if (tenantId) conditions.push(eq(commercialFormConfig.tenantId, tenantId));

    const [deleted] = await db.delete(commercialFormConfig)
      .where(and(...conditions))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Field not found or cannot be deleted (system fields cannot be removed)" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

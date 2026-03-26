import { Router, Request, Response } from "express";
import multer from "multer";
import { db } from "../db";
import {
  funds, intakeDeals, intakeDealDocuments, intakeDocumentRules,
  intakeAiAnalysis, intakeDealStatusHistory, intakeDealFundSubmissions,
  insertFundSchema, insertIntakeDealSchema, insertIntakeDocumentRuleSchema,
  commercialFormConfig,
  fundDocuments, fundKnowledgeEntries,
  intakeDealTasks,
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
import { embedKnowledgeEntry, embedFundDescription, backfillEmbeddings } from "../services/embeddings";

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
    let tenantId = await getTenantId(req);
    if (!tenantId && req.body.tenantId) tenantId = req.body.tenantId;
    const data = { ...req.body, tenantId };
    const [created] = await db.insert(funds).values(data).returning();
    if (created.fundDescription) {
      embedFundDescription(created.id, created.fundDescription).catch(() => {});
    }
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
    if (req.body.fundDescription !== undefined) {
      if (updated.fundDescription) {
        embedFundDescription(updated.id, updated.fundDescription).catch(() => {});
      } else {
        db.update(funds).set({ descriptionEmbedding: null }).where(eq(funds.id, updated.id)).catch(() => {});
      }
    }
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/funds/assign-tenant", async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (role !== "super_admin") return res.status(403).json({ error: "Super admin only" });

    const { targetTenantId } = req.body;
    if (!targetTenantId) return res.status(400).json({ error: "targetTenantId required" });

    const result = await db.update(funds)
      .set({ tenantId: targetTenantId, updatedAt: new Date() })
      .where(sql`${funds.tenantId} IS NULL`)
      .returning({ id: funds.id });

    res.json({ updated: result.length, message: `Assigned ${result.length} orphaned funds to tenant ${targetTenantId}` });
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

    const tasks = await db.select().from(intakeDealTasks)
      .where(eq(intakeDealTasks.dealId, dealId))
      .orderBy(desc(intakeDealTasks.createdAt));

    res.json({
      ...dealResult.deal,
      brokerName: dealResult.brokerName,
      brokerEmail: dealResult.brokerEmail,
      documents,
      analysis,
      statusHistory,
      fundSubmissions: fundSubmissions.map(fs => ({ ...fs.submission, fundName: fs.fundName })),
      tasks,
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

// ===== DEAL TASKS CRUD =====

router.get("/api/commercial/deals/:id/tasks", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    if (!requireAdmin(req, res)) return;
    const tenantId = await getTenantId(req);

    const dealConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) dealConditions.push(eq(intakeDeals.tenantId, tenantId));
    const [deal] = await db.select().from(intakeDeals).where(and(...dealConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const tasks = await db.select().from(intakeDealTasks)
      .where(eq(intakeDealTasks.dealId, dealId))
      .orderBy(desc(intakeDealTasks.createdAt));
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/deals/:id/tasks", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.id);
    if (!requireAdmin(req, res)) return;
    const userId = getUserId(req);
    const tenantId = await getTenantId(req);

    const { taskTitle, taskDescription, priority, assignedTo, dueDate } = req.body;
    if (!taskTitle?.trim()) return res.status(400).json({ error: "Task title is required" });

    const dealConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) dealConditions.push(eq(intakeDeals.tenantId, tenantId));
    const [deal] = await db.select().from(intakeDeals).where(and(...dealConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const [task] = await db.insert(intakeDealTasks).values({
      dealId,
      taskTitle: taskTitle.trim(),
      taskDescription: taskDescription?.trim() || null,
      priority: priority || "medium",
      assignedTo: assignedTo?.trim() || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdBy: userId,
    }).returning();

    res.status(201).json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/api/commercial/deals/:dealId/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.dealId);
    const taskId = parseInt(req.params.taskId);
    if (!requireAdmin(req, res)) return;
    const userId = getUserId(req);
    const tenantId = await getTenantId(req);

    const dealConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) dealConditions.push(eq(intakeDeals.tenantId, tenantId));
    const [deal] = await db.select().from(intakeDeals).where(and(...dealConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const [existingTask] = await db.select().from(intakeDealTasks)
      .where(and(eq(intakeDealTasks.id, taskId), eq(intakeDealTasks.dealId, dealId)));
    if (!existingTask) return res.status(404).json({ error: "Task not found for this deal" });

    const updates: any = {};
    if (req.body.taskTitle !== undefined) updates.taskTitle = req.body.taskTitle;
    if (req.body.taskDescription !== undefined) updates.taskDescription = req.body.taskDescription;
    if (req.body.priority !== undefined) updates.priority = req.body.priority;
    if (req.body.assignedTo !== undefined) updates.assignedTo = req.body.assignedTo;
    if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

    if (req.body.status === "completed" && !updates.completedAt) {
      updates.status = "completed";
      updates.completedAt = new Date();
      const user = userId ? await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]) : null;
      updates.completedBy = user?.fullName || user?.email || "Unknown";
    } else if (req.body.status !== undefined) {
      updates.status = req.body.status;
      if (req.body.status !== "completed") {
        updates.completedAt = null;
        updates.completedBy = null;
      }
    }

    const [updated] = await db.update(intakeDealTasks)
      .set(updates)
      .where(and(eq(intakeDealTasks.id, taskId), eq(intakeDealTasks.dealId, dealId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/commercial/deals/:dealId/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(req.params.dealId);
    const taskId = parseInt(req.params.taskId);
    if (!requireAdmin(req, res)) return;
    const tenantId = await getTenantId(req);

    const dealConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) dealConditions.push(eq(intakeDeals.tenantId, tenantId));
    const [deal] = await db.select().from(intakeDeals).where(and(...dealConditions));
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const [deleted] = await db.delete(intakeDealTasks)
      .where(and(eq(intakeDealTasks.id, taskId), eq(intakeDealTasks.dealId, dealId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Task not found for this deal" });
    res.json({ success: true });
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

    const submittableStatuses = ["draft", "submitted", "analyzed", "no_match", "under_review", "conditional", "rejected"];
    if (!submittableStatuses.includes(deal.status)) {
      return res.status(400).json({ error: `Deal in "${deal.status}" status cannot be resubmitted` });
    }

    if (!deal.dealName || !deal.loanAmount || !deal.assetType) {
      return res.status(400).json({ error: "Missing required fields: deal name, loan amount, asset type" });
    }

    const previousStatus = deal.status;
    const [updated] = await db.update(intakeDeals)
      .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(intakeDeals.id, dealId))
      .returning();

    await db.insert(intakeDealStatusHistory).values({
      dealId,
      fromStatus: previousStatus,
      toStatus: "submitted",
      updatedBy: userId,
      notes: previousStatus === "draft" ? "Deal submitted for review" : `Deal resubmitted (was ${previousStatus})`,
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

// ===== EMAIL FUND CONTACT =====

router.post("/api/commercial/deals/:id/email-fund", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealId = safeParseId(req.params.id);
    if (!dealId) return res.status(400).json({ error: "Invalid deal ID" });
    const tenantId = await getTenantId(req);

    const { fundId, subject, body } = req.body;
    if (!fundId) return res.status(400).json({ error: "Fund ID required" });
    if (!subject?.trim()) return res.status(400).json({ error: "Subject required" });
    if (!body?.trim()) return res.status(400).json({ error: "Email body required" });

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
    if (!fund.contactEmail) return res.status(400).json({ error: "Fund has no contact email" });

    const { getResendClient } = await import("../email");
    const { client, fromEmail } = await getResendClient();

    await client.emails.send({
      from: fromEmail || "Lendry.AI <info@lendry.ai>",
      to: fund.contactEmail,
      subject: subject.trim(),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0F1629;">${subject.trim()}</h2>
          <div style="white-space: pre-wrap; color: #333; line-height: 1.6;">${body.trim()}</div>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
          <p style="color: #888; font-size: 12px;">Sent via Lendry.AI</p>
        </div>
      `,
    });

    res.json({ success: true, message: `Email sent to ${fund.contactEmail}` });
  } catch (error: any) {
    console.error("Email fund error:", error);
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
  { fieldKey: "assetType", fieldLabel: "Asset Type", section: "Deal Basics", fieldType: "select", isRequired: true, sortOrder: 3, options: { choices: ["Multifamily","Residential","Office","Commercial","Retail","Industrial","Hotel","Land","Development","Mixed Use","Self Storage","Mobile Home Park","Healthcare","Student Housing","Bridge"] } },
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

router.post("/api/commercial/transcribe-audio", audioUpload.single("audio"), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

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

    res.json({ transcript: transcription.text });
  } catch (error: any) {
    console.error("[Audio Transcription Error]", error);
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

const fundFileUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.xlsx', '.xls', '.csv'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    cb(null, allowedExts.includes(ext));
  },
  limits: { fileSize: 25 * 1024 * 1024 }
});

const ALL_US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const PROPERTY_TYPE_MAP: Record<string, string> = {
  "resi": "Residential", "residential": "Residential", "sfr": "Residential",
  "mfr": "Multifamily", "multifamily": "Multifamily", "multi family": "Multifamily",
  "multi-family": "Multifamily", "apartment": "Multifamily", "apartments": "Multifamily",
  "office": "Office", "retail": "Retail", "industrial": "Industrial",
  "warehouse": "Industrial", "flex": "Industrial",
  "hotel": "Hotel", "hospitality": "Hotel", "land": "Land",
  "land development": "Development", "development": "Development",
  "construction": "Development", "ground up": "Development",
  "mixed use": "Mixed Use", "mixed-use": "Mixed Use",
  "self storage": "Self Storage", "storage": "Self Storage",
  "mobile home park": "Mobile Home Park", "mhp": "Mobile Home Park",
  "manufactured housing": "Mobile Home Park",
  "healthcare": "Healthcare", "medical": "Healthcare",
  "student housing": "Student Housing",
  "commercial": "Commercial", "small commercial": "Commercial",
  "bridge": "Bridge", "a&d": "Development", "acquisition": "Bridge",
};

const COLUMN_ALIASES: Record<string, string[]> = {
  fundName: ["fund name", "fund_name", "fundname", "name", "lender", "lender name", "lender_name"],
  providerName: ["provider", "provider name", "provider_name", "company"],
  website: ["website", "web", "url", "site", "web site"],
  contactName: ["contact", "contact name", "contact_name", "contact person", "rep", "representative"],
  contactEmail: ["email", "contact email", "contact_email", "e-mail"],
  contactPhone: ["phone", "contact phone", "contact_phone", "telephone"],
  guidelineUrl: ["link to guidelines", "guidelines", "guideline url", "guideline_url", "guidelines link", "guideline link", "guidelines url"],
  ltvMin: ["ltv min", "ltv_min", "min ltv", "min_ltv", "ltv minimum"],
  ltvMax: ["ltv max", "ltv_max", "max ltv", "max_ltv", "ltv maximum"],
  ltcMin: ["ltc min", "ltc_min", "min ltc", "min_ltc"],
  ltcMax: ["ltc max", "ltc_max", "max ltc", "max_ltc"],
  _loanAmountRange: ["loan amounts", "loan amount", "loan range", "loan size"],
  loanAmountMin: ["loan min", "loan_min", "min loan", "min_loan", "loan amount min", "loan_amount_min", "min loan amount"],
  loanAmountMax: ["loan max", "loan_max", "max loan", "max_loan", "loan amount max", "loan_amount_max", "max loan amount"],
  interestRateMin: ["rate min", "rate_min", "min rate", "interest rate min", "interest_rate_min"],
  interestRateMax: ["rate max", "rate_max", "max rate", "interest rate max", "interest_rate_max"],
  termMin: ["term min", "term_min", "min term"],
  termMax: ["term max", "term_max", "max term"],
  recourseType: ["recourse", "recourse type", "recourse_type"],
  minDscr: ["dscr", "min dscr", "min_dscr", "dscr min", "minimum dscr"],
  minCreditScore: ["credit score", "fico", "min credit", "min_credit_score", "min credit score"],
  prepaymentTerms: ["prepayment", "prepayment terms", "prepayment_terms", "prepay"],
  closingTimeline: ["closing", "closing timeline", "closing_timeline", "close timeline"],
  originationFeeMin: ["origination fee min", "origination_fee_min", "fee min"],
  originationFeeMax: ["origination fee max", "origination_fee_max", "fee max"],
  allowedStates: ["states", "allowed states", "allowed_states", "state", "region"],
  allowedAssetTypes: ["asset types", "allowed asset types", "allowed_asset_types", "asset type", "property type", "property types"],
  fundDescription: ["description", "notes", "fund description", "fund_description", "terms"],
  _specialty: ["bread & butter", "bread and butter", "specialty", "specialties", "bread butter", "focus"],
  isActive: ["active", "is active", "is_active", "status"],
};

function mapColumnName(header: string): string | null {
  const normalized = header.toLowerCase().trim().replace(/[\s_-]+/g, " ");
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized) || field.toLowerCase() === normalized) {
      return field;
    }
  }
  return null;
}

function parseMoneyValue(str: string): number | null {
  const cleaned = str.toLowerCase().replace(/[\s$]/g, "").replace(/,/g, "");
  const match = cleaned.match(/^([0-9.]+)\s*(mm|m|k|b|million|billion|thousand)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2] || "";
  if (suffix === "b" || suffix === "billion") return Math.round(num * 1_000_000_000);
  if (suffix === "mm" || suffix === "m" || suffix === "million") return Math.round(num * 1_000_000);
  if (suffix === "k" || suffix === "thousand") return Math.round(num * 1_000);
  return Math.round(num);
}

function parseLoanAmountRange(value: string): { loanAmountMin: number | null; loanAmountMax: number | null } {
  const str = String(value).trim();
  const rangeMatch = str.match(/^([<>]?)[\s]*\$?([0-9.,]+\s*(?:MM|M|K|B|million|billion|thousand)?)\s*[-–—to]+\s*\$?([0-9.,]+\s*(?:MM|M|K|B|million|billion|thousand)?)\s*$/i);
  if (rangeMatch) {
    let minStr = rangeMatch[2].trim();
    const maxStr = rangeMatch[3].trim();
    const minHasSuffix = /[a-zA-Z]/.test(minStr);
    if (!minHasSuffix) {
      const maxSuffix = maxStr.match(/[a-zA-Z]+$/);
      if (maxSuffix) minStr = minStr + maxSuffix[0];
    }
    return { loanAmountMin: parseMoneyValue(minStr), loanAmountMax: parseMoneyValue(maxStr) };
  }
  const ltMatch = str.match(/^[<≤]\s*\$?([0-9.,]+\s*(?:MM|M|K|B|million|billion|thousand)?)$/i);
  if (ltMatch) {
    return { loanAmountMin: null, loanAmountMax: parseMoneyValue(ltMatch[1]) };
  }
  const gtMatch = str.match(/^[>≥]\s*\$?([0-9.,]+\s*(?:MM|M|K|B|million|billion|thousand)?)$/i);
  if (gtMatch) {
    return { loanAmountMin: parseMoneyValue(gtMatch[1]), loanAmountMax: null };
  }
  const singleMatch = str.match(/^\$?([0-9.,]+\s*(?:MM|M|K|B|million|billion|thousand)?)\s*\+?\s*$/i);
  if (singleMatch) {
    const val = parseMoneyValue(singleMatch[1]);
    if (str.includes("+")) {
      return { loanAmountMin: val, loanAmountMax: null };
    }
    return { loanAmountMin: val, loanAmountMax: val };
  }
  return { loanAmountMin: null, loanAmountMax: null };
}

function normalizePropertyTypes(value: string): string[] {
  const parts = String(value).split(/[,;|&+]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const result = new Set<string>();
  for (const part of parts) {
    const mapped = PROPERTY_TYPE_MAP[part];
    if (mapped) result.add(mapped);
    else {
      for (const [key, val] of Object.entries(PROPERTY_TYPE_MAP)) {
        if (part.includes(key)) { result.add(val); break; }
      }
    }
  }
  return result.size > 0 ? Array.from(result) : parts.map(p => p.charAt(0).toUpperCase() + p.slice(1));
}

function normalizeRegion(value: string): string[] {
  const lower = String(value).toLowerCase().trim();
  if (lower === "nationwide" || lower === "all states" || lower === "national" || lower === "all") {
    return [...ALL_US_STATES];
  }
  return String(value).split(/[,;|]+/).map(s => s.trim().toUpperCase()).filter(s => s.length === 2 && ALL_US_STATES.includes(s));
}

function parseRowValue(field: string, value: any): any {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (!str) return null;

  const floatFields = ["ltvMin", "ltvMax", "ltcMin", "ltcMax", "interestRateMin", "interestRateMax", "minDscr", "originationFeeMin", "originationFeeMax"];
  const intFields = ["loanAmountMin", "loanAmountMax", "termMin", "termMax", "minCreditScore"];
  const arrayFields = ["allowedStates", "allowedAssetTypes"];

  if (floatFields.includes(field)) return parseFloat(str) || null;
  if (intFields.includes(field)) return parseInt(str) || null;
  if (field === "allowedAssetTypes") {
    if (Array.isArray(value)) return value;
    return normalizePropertyTypes(str);
  }
  if (field === "allowedStates") {
    if (Array.isArray(value)) return value;
    return normalizeRegion(str);
  }
  if (field === "isActive") {
    const lower = str.toLowerCase();
    return lower === "false" || lower === "no" || lower === "0" || lower === "inactive" ? false : true;
  }
  return str;
}

function processVirtualColumns(parsed: Record<string, any>): { knowledgeEntries: { content: string; category: string }[] } {
  const knowledgeEntries: { content: string; category: string }[] = [];

  if (parsed._loanAmountRange) {
    const range = parseLoanAmountRange(parsed._loanAmountRange);
    if (range.loanAmountMin && !parsed.loanAmountMin) parsed.loanAmountMin = range.loanAmountMin;
    if (range.loanAmountMax && !parsed.loanAmountMax) parsed.loanAmountMax = range.loanAmountMax;
    parsed._parsedRange = { raw: parsed._loanAmountRange, min: range.loanAmountMin, max: range.loanAmountMax };
    delete parsed._loanAmountRange;
  }

  if (parsed._specialty) {
    knowledgeEntries.push({ content: `Specialty / Focus: ${parsed._specialty}`, category: "specialty" });
    delete parsed._specialty;
  }

  if (parsed.fundDescription) {
    knowledgeEntries.push({ content: parsed.fundDescription, category: "general" });
  }

  return { knowledgeEntries };
}

router.post("/api/commercial/funds/bulk-preview", fundFileUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const XLSX = await import("xlsx");
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames;

    const selectedSheet = req.body?.sheetName || req.query?.sheet as string || sheetNames[0];
    const sheet = workbook.Sheets[selectedSheet];
    if (!sheet) return res.status(400).json({ error: `Sheet "${selectedSheet}" not found` });
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length < 2) return res.status(400).json({ error: "File must have a header row and at least one data row" });

    const headers = (rawData[0] as string[]).map(h => String(h || "").trim());

    let customMappingObj: Record<number, string> | null = null;
    if (req.body?.customMapping) {
      try { customMappingObj = JSON.parse(req.body.customMapping); } catch {}
    }

    const columnMapping: Record<number, string> = {};
    const unmappedColumns: string[] = [];

    if (customMappingObj) {
      for (const [idx, field] of Object.entries(customMappingObj)) {
        if (field && field !== "_skip") columnMapping[parseInt(idx)] = field;
      }
      headers.forEach((h, i) => {
        if (!columnMapping[i] && h && !(customMappingObj && String(i) in customMappingObj)) unmappedColumns.push(h);
      });
    } else {
      headers.forEach((h, i) => {
        const mapped = mapColumnName(h);
        if (mapped) columnMapping[i] = mapped;
        else if (h) unmappedColumns.push(h);
      });
    }

    const rows: any[] = [];
    const errors: { row: number; message: string }[] = [];
    let totalKnowledgeEntries = 0;

    for (let r = 1; r < rawData.length; r++) {
      const rowData = rawData[r] as any[];
      if (!rowData || rowData.every(c => c === null || c === undefined || c === "")) continue;

      const parsed: Record<string, any> = {};
      for (const [colIdx, field] of Object.entries(columnMapping)) {
        parsed[field] = parseRowValue(field, rowData[parseInt(colIdx)]);
      }

      const { knowledgeEntries } = processVirtualColumns(parsed);
      totalKnowledgeEntries += knowledgeEntries.length;

      if (!parsed.fundName) {
        errors.push({ row: r + 1, message: "Missing fund name" });
        continue;
      }

      rows.push({ rowNumber: r + 1, data: parsed, knowledgeCount: knowledgeEntries.length });
    }

    const tenantId = await getTenantId(req);
    const conditions = [];
    if (tenantId) conditions.push(eq(funds.tenantId, tenantId));
    const existingFunds = await db.select({ fundName: funds.fundName, id: funds.id })
      .from(funds)
      .where(conditions.length ? and(...conditions) : undefined);
    const existingNames = new Set(existingFunds.map(f => f.fundName.toLowerCase()));

    const duplicates = rows.filter(r => existingNames.has(r.data.fundName.toLowerCase()));

    const displayMapping = Object.entries(columnMapping).map(([colIdx, field]) => {
      let displayField = field;
      if (field === "_loanAmountRange") displayField = "loanAmountMin + loanAmountMax (parsed from range)";
      if (field === "_specialty") displayField = "Knowledge Entry (specialty)";
      return { column: headers[parseInt(colIdx)], mappedTo: displayField, columnIndex: parseInt(colIdx) };
    });

    const allHeaders = headers.map((h, i) => ({ index: i, name: h, autoMapped: mapColumnName(h) || null })).filter(h => h.name);

    res.json({
      totalRows: rows.length,
      validRows: rows.length - errors.length,
      errors,
      duplicates: duplicates.map(d => ({ rowNumber: d.rowNumber, fundName: d.data.fundName })),
      columnMapping: displayMapping,
      unmappedColumns,
      headers: allHeaders,
      preview: rows.slice(0, 10),
      sheetNames,
      selectedSheet,
      totalKnowledgeEntries,
    });
  } catch (error: any) {
    console.error("Bulk preview error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/funds/bulk-import", fundFileUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    const duplicateAction = req.body?.duplicateAction || "skip";

    const XLSX = await import("xlsx");
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const selectedSheet = req.body?.sheetName || req.query?.sheet as string || workbook.SheetNames[0];
    const sheet = workbook.Sheets[selectedSheet];
    if (!sheet) return res.status(400).json({ error: `Sheet "${selectedSheet}" not found` });
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length < 2) return res.status(400).json({ error: "File must have data rows" });

    const headers = (rawData[0] as string[]).map(h => String(h || "").trim());

    let customMappingObj: Record<number, string> | null = null;
    if (req.body?.customMapping) {
      try { customMappingObj = JSON.parse(req.body.customMapping); } catch {}
    }

    const columnMapping: Record<number, string> = {};
    if (customMappingObj) {
      for (const [idx, field] of Object.entries(customMappingObj)) {
        if (field && field !== "_skip") columnMapping[parseInt(idx)] = field;
      }
    } else {
      headers.forEach((h, i) => {
        const mapped = mapColumnName(h);
        if (mapped) columnMapping[i] = mapped;
      });
    }

    const tenantId = await getTenantId(req);
    const conditions = [];
    if (tenantId) conditions.push(eq(funds.tenantId, tenantId));
    const existingFunds = await db.select({ fundName: funds.fundName, id: funds.id })
      .from(funds)
      .where(conditions.length ? and(...conditions) : undefined);
    const existingMap = new Map(existingFunds.map(f => [f.fundName.toLowerCase(), f.id]));

    let created = 0, updated = 0, skipped = 0, failed = 0;
    let knowledgeCreated = 0;

    for (let r = 1; r < rawData.length; r++) {
      const rowData = rawData[r] as any[];
      if (!rowData || rowData.every(c => c === null || c === undefined || c === "")) continue;

      const parsed: Record<string, any> = {};
      for (const [colIdx, field] of Object.entries(columnMapping)) {
        parsed[field] = parseRowValue(field, rowData[parseInt(colIdx)]);
      }

      const { knowledgeEntries } = processVirtualColumns(parsed);

      const cleanParsed = { ...parsed };
      delete cleanParsed._parsedRange;

      if (!cleanParsed.fundName) { failed++; continue; }

      try {
        let fundId: number;
        const existingId = existingMap.get(cleanParsed.fundName.toLowerCase());
        if (existingId) {
          if (duplicateAction === "update") {
            await db.update(funds).set({ ...cleanParsed, tenantId, updatedAt: new Date() }).where(eq(funds.id, existingId));
            updated++;
            fundId = existingId;
          } else {
            skipped++;
            continue;
          }
        } else {
          const [inserted] = await db.insert(funds).values({ ...cleanParsed, tenantId }).returning({ id: funds.id });
          created++;
          fundId = inserted.id;
          existingMap.set(cleanParsed.fundName.toLowerCase(), fundId);
        }

        for (const entry of knowledgeEntries) {
          try {
            const [ke] = await db.insert(fundKnowledgeEntries).values({
              fundId, content: entry.content, category: entry.category, sourceType: "bulk_import",
            }).returning({ id: fundKnowledgeEntries.id });
            knowledgeCreated++;
            embedKnowledgeEntry(ke.id, entry.content).catch(() => {});
          } catch (keErr: any) {
            console.error(`Knowledge entry creation failed for fund ${fundId}:`, keErr.message);
          }
        }

        if (cleanParsed.fundDescription) {
          embedFundDescription(fundId, cleanParsed.fundDescription).catch(() => {});
        }
      } catch (e: any) {
        console.error(`Row ${r + 1} import error:`, e.message);
        failed++;
      }
    }

    res.json({ created, updated, skipped, failed, knowledgeCreated, total: created + updated + skipped + failed });
  } catch (error: any) {
    console.error("Bulk import error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function verifyFundTenant(req: Request, fundId: number): Promise<boolean> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return true;
  const [fund] = await db.select({ tenantId: funds.tenantId }).from(funds).where(eq(funds.id, fundId)).limit(1);
  return fund ? (fund.tenantId === tenantId || fund.tenantId === null) : false;
}

router.get("/api/commercial/funds/:fundId/knowledge", async (req: Request, res: Response) => {
  try {
    const fundId = safeParseId(req.params.fundId);
    if (!fundId) return res.status(400).json({ error: "Invalid fund ID" });
    if (!(await verifyFundTenant(req, fundId))) return res.status(403).json({ error: "Access denied" });
    const entries = await db.select().from(fundKnowledgeEntries)
      .where(eq(fundKnowledgeEntries.fundId, fundId))
      .orderBy(desc(fundKnowledgeEntries.createdAt));
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/funds/:fundId/knowledge", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const fundId = safeParseId(req.params.fundId);
    if (!fundId) return res.status(400).json({ error: "Invalid fund ID" });
    if (!(await verifyFundTenant(req, fundId))) return res.status(403).json({ error: "Access denied" });
    const { content, category } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    const [entry] = await db.insert(fundKnowledgeEntries).values({
      fundId,
      sourceType: "manual",
      content,
      category: category || "general",
    }).returning();
    embedKnowledgeEntry(entry.id, entry.content).catch(() => {});
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/api/commercial/funds/knowledge/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID" });
    const [updated] = await db.update(fundKnowledgeEntries)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(fundKnowledgeEntries.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Entry not found" });
    if (req.body.content !== undefined) {
      embedKnowledgeEntry(updated.id, updated.content).catch(() => {});
    }
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/commercial/funds/knowledge/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID" });
    const result = await db.delete(fundKnowledgeEntries).where(eq(fundKnowledgeEntries.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: "Entry not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/commercial/funds/:fundId/documents", async (req: Request, res: Response) => {
  try {
    const fundId = safeParseId(req.params.fundId);
    if (!fundId) return res.status(400).json({ error: "Invalid fund ID" });
    if (!(await verifyFundTenant(req, fundId))) return res.status(403).json({ error: "Access denied" });
    const docs = await db.select().from(fundDocuments)
      .where(eq(fundDocuments.fundId, fundId))
      .orderBy(desc(fundDocuments.uploadedAt));
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const fundDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post("/api/commercial/funds/:fundId/documents", fundDocUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const fundId = safeParseId(req.params.fundId);
    if (!fundId) return res.status(400).json({ error: "Invalid fund ID" });
    if (!(await verifyFundTenant(req, fundId))) return res.status(403).json({ error: "Access denied" });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = `fund-documents/${fundId}/${Date.now()}-${file.originalname}`;
    await objectStorageService.uploadFile(file.buffer, filePath, file.mimetype);

    const [doc] = await db.insert(fundDocuments).values({
      fundId,
      fileName: file.originalname,
      filePath,
      fileSize: file.size,
      mimeType: file.mimetype,
      extractionStatus: "pending",
    }).returning();

    (async () => {
      try {
        await db.update(fundDocuments).set({ extractionStatus: "processing" }).where(eq(fundDocuments.id, doc.id));

        const isPdf = (file.mimetype || "").includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
        let textContent = "";

        if (isPdf) {
          const { extractTextFromPdf } = await import("../agents/documentExtractor");
          const result = await extractTextFromPdf(file.buffer);
          textContent = result.text;
        } else {
          textContent = file.buffer.toString("utf-8").substring(0, 50000);
        }

        if (textContent.length > 100 && openai) {
          const chunks = [];
          const chunkSize = 6000;
          for (let i = 0; i < textContent.length; i += chunkSize) {
            chunks.push(textContent.substring(i, i + chunkSize));
          }

          for (const chunk of chunks) {
            try {
              const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0.2,
                messages: [
                  {
                    role: "system",
                    content: `You are an expert at extracting knowledge from commercial real estate fund documents. Extract key facts and criteria from the text as a JSON array of objects, each with "content" (a clear factual statement) and "category" (one of: general, rates, terms, eligibility, guidelines). Extract 3-8 entries per chunk. Return only valid JSON array.`
                  },
                  { role: "user", content: chunk }
                ],
              });

              const raw = response.choices[0]?.message?.content || "[]";
              const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
              let extracted: any[] = [];
              try { extracted = JSON.parse(cleaned); } catch {}

              if (Array.isArray(extracted)) {
                for (const entry of extracted) {
                  if (entry.content && typeof entry.content === "string") {
                    const entryContent = entry.content.substring(0, 5000);
                    const [inserted] = await db.insert(fundKnowledgeEntries).values({
                      fundId,
                      sourceType: "document_extraction",
                      sourceDocumentName: file.originalname,
                      content: entryContent,
                      category: ["general", "rates", "terms", "eligibility", "guidelines"].includes(entry.category) ? entry.category : "general",
                    }).returning();
                    embedKnowledgeEntry(inserted.id, inserted.content).catch(() => {});
                  }
                }
              }
            } catch (e) {
              console.error("Knowledge extraction chunk error:", e);
            }
          }
        }

        await db.update(fundDocuments).set({ extractionStatus: "completed" }).where(eq(fundDocuments.id, doc.id));
        console.log(`✅ Fund doc extraction complete for ${file.originalname}`);
      } catch (e) {
        console.error("Fund doc extraction failed:", e);
        await db.update(fundDocuments).set({ extractionStatus: "failed" }).where(eq(fundDocuments.id, doc.id));
      }
    })();

    res.status(201).json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/commercial/funds/documents/:id", async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = safeParseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID" });
    const [doc] = await db.select().from(fundDocuments).where(eq(fundDocuments.id, id));
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await db.delete(fundKnowledgeEntries).where(
      and(
        eq(fundKnowledgeEntries.fundId, doc.fundId),
        eq(fundKnowledgeEntries.sourceType, "document_extraction"),
        eq(fundKnowledgeEntries.sourceDocumentName, doc.fileName),
      )
    );
    await db.delete(fundDocuments).where(eq(fundDocuments.id, id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/commercial/embeddings/backfill", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }
    const result = await backfillEmbeddings();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

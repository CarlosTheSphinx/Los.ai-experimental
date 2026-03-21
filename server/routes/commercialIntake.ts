import { Router, Request, Response } from "express";
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

const router = Router();

function getTenantId(req: Request): number | null {
  return (req as any).user?.tenantId || (req as any).user?.id || null;
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
    const result = await db.delete(intakeDocumentRules).where(and(eq(intakeDocumentRules.id, id), tenantId ? eq(intakeDocumentRules.tenantId, tenantId) : undefined)).returning();
    if (!result.length) return res.status(404).json({ error: "Rule not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== EVALUATE DOCUMENT RULES =====

router.post("/api/commercial/evaluate-document-rules", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { assetType, loanAmount, propertyState } = req.body;
    const conditions = [eq(intakeDocumentRules.isActive, true)];
    if (tenantId) conditions.push(eq(intakeDocumentRules.tenantId, tenantId));
    const rules = await db.select().from(intakeDocumentRules).where(and(...conditions));

    const baseDocuments = [
      "Loan Application (1003)",
      "Bank Statement",
      "Tax Returns (2 years)",
      "Purchase Contract",
    ];

    const additionalDocs = new Set<string>();
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
      }
    }

    res.json({ requiredDocuments: [...baseDocuments, ...additionalDocs] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== INTAKE DEALS CRUD =====

router.get("/api/commercial/deals", async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const userId = getUserId(req);
    const tenantId = getTenantId(req);
    const { status } = req.query;

    const conditions = [];

    if (role === "broker") {
      if (userId) conditions.push(eq(intakeDeals.brokerId, userId));
    } else {
      if (tenantId) conditions.push(eq(intakeDeals.tenantId, tenantId));
    }

    if (status && typeof status === "string") {
      if (status === "new") {
        conditions.push(inArray(intakeDeals.status, ["submitted", "analyzed"]));
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
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);

    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) whereConditions.push(eq(intakeDeals.tenantId, tenantId));
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
    const tenantId = getTenantId(req);
    const role = getUserRole(req);

    const data: any = {
      ...req.body,
      brokerId: role === "broker" ? userId : req.body.brokerId,
      tenantId: role === "broker" ? (req as any).user?.tenantId || tenantId : tenantId,
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
    const data = { ...req.body, updatedAt: new Date() };

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
    const tenantId = getTenantId(req);
    const { status, notes } = req.body;

    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) whereConditions.push(eq(intakeDeals.tenantId, tenantId));
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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);

    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) whereConditions.push(eq(intakeDeals.tenantId, tenantId));
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
    const tenantId = getTenantId(req);
    const whereConditions = [eq(intakeDeals.id, dealId)];
    if (tenantId) whereConditions.push(eq(intakeDeals.tenantId, tenantId));
    const [deal] = await db.select().from(intakeDeals).where(and(...whereConditions));
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
    const tenantId = getTenantId(req);
    const conditions = [];
    if (tenantId) conditions.push(eq(intakeDeals.tenantId, tenantId));

    const allDeals = await db.select().from(intakeDeals)
      .where(conditions.length ? and(...conditions) : undefined);

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
    const tenantId = getTenantId(req);
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
    const tenantId = getTenantId(req);
    const { fields } = req.body;
    if (!Array.isArray(fields)) return res.status(400).json({ error: "fields must be an array" });

    const updated = [];
    for (const field of fields) {
      const conditions = [eq(commercialFormConfig.id, field.id)];
      if (tenantId) conditions.push(eq(commercialFormConfig.tenantId, tenantId));

      const [row] = await db.update(commercialFormConfig)
        .set({
          fieldLabel: field.fieldLabel,
          isVisible: field.isVisible,
          isRequired: field.isRequired,
          sortOrder: field.sortOrder,
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

export default router;

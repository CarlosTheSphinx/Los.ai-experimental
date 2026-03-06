import type { Express, Response } from "express";
import { db } from "../db";
import { inquiryFormTemplates, programTaskTemplates, taskFormSubmissions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { authenticateUser, type AuthRequest } from "../auth";

const SYSTEM_TEMPLATES = [
  {
    name: "Title Contact Info",
    description: "Collect title company contact details from the borrower",
    targetType: "third_party",
    targetRole: "Title Contact",
    isSystem: true,
    fields: [
      { fieldKey: "name", label: "Contact Name", fieldType: "text" as const, required: true, placeholder: "Full name" },
      { fieldKey: "company", label: "Title Company", fieldType: "text" as const, required: true, placeholder: "Company name" },
      { fieldKey: "email", label: "Email Address", fieldType: "email" as const, required: true, placeholder: "email@example.com" },
      { fieldKey: "phone", label: "Phone Number", fieldType: "phone" as const, required: false, placeholder: "(555) 555-5555" },
    ],
  },
  {
    name: "Insurance Agent Info",
    description: "Collect insurance agent contact details from the borrower",
    targetType: "third_party",
    targetRole: "Insurance Agent",
    isSystem: true,
    fields: [
      { fieldKey: "name", label: "Agent Name", fieldType: "text" as const, required: true, placeholder: "Full name" },
      { fieldKey: "company", label: "Insurance Company", fieldType: "text" as const, required: true, placeholder: "Company name" },
      { fieldKey: "email", label: "Email Address", fieldType: "email" as const, required: true, placeholder: "email@example.com" },
      { fieldKey: "phone", label: "Phone Number", fieldType: "phone" as const, required: false, placeholder: "(555) 555-5555" },
      { fieldKey: "policyNumber", label: "Policy Number", fieldType: "text" as const, required: false, placeholder: "Policy #" },
    ],
  },
  {
    name: "Attorney Info",
    description: "Collect attorney contact details from the borrower",
    targetType: "third_party",
    targetRole: "Attorney",
    isSystem: true,
    fields: [
      { fieldKey: "name", label: "Attorney Name", fieldType: "text" as const, required: true, placeholder: "Full name" },
      { fieldKey: "company", label: "Law Firm", fieldType: "text" as const, required: false, placeholder: "Firm name" },
      { fieldKey: "email", label: "Email Address", fieldType: "email" as const, required: true, placeholder: "email@example.com" },
      { fieldKey: "phone", label: "Phone Number", fieldType: "phone" as const, required: false, placeholder: "(555) 555-5555" },
      { fieldKey: "barNumber", label: "Bar Number", fieldType: "text" as const, required: false, placeholder: "Bar #" },
    ],
  },
];

export async function seedInquiryFormTemplates() {
  for (const template of SYSTEM_TEMPLATES) {
    const existing = await db.select({ id: inquiryFormTemplates.id })
      .from(inquiryFormTemplates)
      .where(eq(inquiryFormTemplates.name, template.name))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(inquiryFormTemplates).values(template);
    }
  }
  const count = await db.select({ count: sql<number>`count(*)` }).from(inquiryFormTemplates);
  console.log(`📋 Inquiry form templates: ${count[0].count} available`);
}

function requireAdmin(req: AuthRequest, res: Response, next: Function) {
  if (!req.user || !["admin", "super_admin", "staff"].includes(req.user.role || "")) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function registerInquiryFormRoutes(app: Express) {
  app.get("/api/admin/inquiry-form-templates", authenticateUser, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const templates = await db.select().from(inquiryFormTemplates).orderBy(inquiryFormTemplates.name);
      res.json({ templates });
    } catch (error: any) {
      console.error("Failed to fetch inquiry form templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/admin/inquiry-form-templates/:id", authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const [template] = await db.select().from(inquiryFormTemplates).where(eq(inquiryFormTemplates.id, id));
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error: any) {
      console.error("Failed to fetch inquiry form template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/admin/inquiry-form-templates", authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, fields, targetType, targetRole } = req.body;
      if (!name || !fields || !Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({ error: "Name and at least one field are required" });
      }
      const [template] = await db.insert(inquiryFormTemplates).values({
        name,
        description: description || null,
        fields,
        targetType: targetType || "third_party",
        targetRole: targetRole || null,
        isSystem: false,
        createdBy: req.user!.id,
      }).returning();
      res.json(template);
    } catch (error: any) {
      console.error("Failed to create inquiry form template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.put("/api/admin/inquiry-form-templates/:id", authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, fields, targetType, targetRole } = req.body;
      const [existing] = await db.select().from(inquiryFormTemplates).where(eq(inquiryFormTemplates.id, id));
      if (!existing) return res.status(404).json({ error: "Template not found" });
      const [updated] = await db.update(inquiryFormTemplates)
        .set({
          name: name || existing.name,
          description: description !== undefined ? description : existing.description,
          fields: fields || existing.fields,
          targetType: targetType || existing.targetType,
          targetRole: targetRole !== undefined ? targetRole : existing.targetRole,
          updatedAt: new Date(),
        })
        .where(eq(inquiryFormTemplates.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error("Failed to update inquiry form template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/admin/inquiry-form-templates/:id", authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select().from(inquiryFormTemplates).where(eq(inquiryFormTemplates.id, id));
      if (!existing) return res.status(404).json({ error: "Template not found" });
      if (existing.isSystem) return res.status(403).json({ error: "Cannot delete system templates" });
      const inUse = await db.select({ id: programTaskTemplates.id })
        .from(programTaskTemplates)
        .where(eq(programTaskTemplates.formTemplateId, id))
        .limit(1);
      if (inUse.length > 0) {
        return res.status(409).json({ error: "Template is in use by program tasks and cannot be deleted" });
      }
      await db.delete(inquiryFormTemplates).where(eq(inquiryFormTemplates.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete inquiry form template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  app.get("/api/inquiry-form-templates", authenticateUser, async (_req: AuthRequest, res: Response) => {
    try {
      const templates = await db.select().from(inquiryFormTemplates).orderBy(inquiryFormTemplates.name);
      res.json({ templates });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });
}

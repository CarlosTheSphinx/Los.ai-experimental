
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for multi-tenancy
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: varchar("role", { length: 50 }).default("user").notNull(), // user, admin, staff, super_admin
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  emailVerified: boolean("email_verified").default(false),
  isActive: boolean("is_active").default(true),
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetExpires: timestamp("password_reset_expires"),
});

export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true, 
  lastLoginAt: true 
});
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// We'll store request logs
export const pricingRequests = pgTable("pricing_requests", {
  id: serial("id").primaryKey(),
  requestData: jsonb("request_data").notNull(),
  responseData: jsonb("response_data"),
  status: text("status").notNull(), // 'pending', 'success', 'error'
  createdAt: timestamp("created_at").defaultNow(),
});

// Saved quotes table
export const savedQuotes = pgTable("saved_quotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  customerFirstName: text("customer_first_name").notNull(),
  customerLastName: text("customer_last_name").notNull(),
  propertyAddress: text("property_address").notNull(),
  loanData: jsonb("loan_data").notNull(),
  interestRate: text("interest_rate").notNull(),
  pointsCharged: real("points_charged").notNull().default(0),
  pointsAmount: real("points_amount").notNull().default(0),
  tpoPremiumAmount: real("tpo_premium_amount").notNull().default(0),
  totalRevenue: real("total_revenue").notNull().default(0),
  commission: real("commission").notNull().default(0),
  stage: varchar("stage", { length: 50 }).default("initial-review").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedQuoteSchema = createInsertSchema(savedQuotes).omit({ id: true, createdAt: true });
export type SavedQuote = typeof savedQuotes.$inferSelect;
export type InsertSavedQuote = z.infer<typeof insertSavedQuoteSchema>;

export const insertPricingRequestSchema = createInsertSchema(pricingRequests);
export type PricingRequest = typeof pricingRequests.$inferSelect;
export type InsertPricingRequest = z.infer<typeof insertPricingRequestSchema>;

// Form Data Schema matches the input fields from the user's code
export const loanPricingFormSchema = z.object({
  loanAmount: z.coerce.number().min(1, "Loan amount is required"),
  propertyValue: z.coerce.number().min(1, "Property value is required"),
  ltv: z.string().min(1, "LTV is required"),
  loanType: z.string().min(1, "Loan Type is required"),
  interestOnly: z.string().default("No"),
  loanPurpose: z.string().min(1, "Loan Purpose is required"),
  propertyType: z.string().min(1, "Property Type is required"),
  grossMonthlyRent: z.coerce.number().min(0, "Gross monthly rent is required"),
  annualTaxes: z.coerce.number().min(0, "Annual taxes are required"),
  annualInsurance: z.coerce.number().min(0, "Annual insurance is required"),
  calculatedDscr: z.string().optional(),
  dscr: z.string().min(1, "DSCR is required"),
  ficoScore: z.string().min(1, "FICO Score is required"),
  prepaymentPenalty: z.string().min(1, "Prepayment penalty is required"),
  tpoPremium: z.string().optional(),
});

export type LoanPricingFormData = z.infer<typeof loanPricingFormSchema>;

export const pricingResponseSchema = z.object({
  success: z.boolean(),
  interestRate: z.number().nullable().optional(),
  loanData: z.record(z.any()).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  debug: z.record(z.any()).optional()
});

export type PricingResponse = z.infer<typeof pricingResponseSchema>;

// Document signing tables
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  quoteId: integer("quote_id").references(() => savedQuotes.id),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(), // Base64 encoded PDF
  pageCount: integer("page_count").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft, sent, in_progress, completed, voided, voided_edited
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  voidedAt: timestamp("voided_at"),
  voidedReason: text("voided_reason"),
});

export const signers = pgTable("signers", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  color: text("color").notNull().default("#3B82F6"), // Blue default
  signingOrder: integer("signing_order").notNull().default(1),
  status: text("status").notNull().default("pending"), // pending, sent, viewed, signed
  token: text("token"), // Unique signing token
  tokenExpiresAt: timestamp("token_expires_at"),
  signedAt: timestamp("signed_at"),
  lastReminderSent: timestamp("last_reminder_sent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const documentFields = pgTable("document_fields", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id).notNull(),
  signerId: integer("signer_id").references(() => signers.id),
  pageNumber: integer("page_number").notNull().default(1),
  fieldType: text("field_type").notNull(), // signature, initial, text, date
  x: real("x").notNull(),
  y: real("y").notNull(),
  width: real("width").notNull(),
  height: real("height").notNull(),
  required: boolean("required").notNull().default(true),
  value: text("value"), // Filled value (base64 for signatures, text for others)
  label: text("label"), // Optional label for the field
  createdAt: timestamp("created_at").defaultNow(),
});

export const documentAuditLog = pgTable("document_audit_log", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id).notNull(),
  signerId: integer("signer_id").references(() => signers.id),
  action: text("action").notNull(), // created, sent, viewed, signed, completed
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, completedAt: true });
export const insertSignerSchema = createInsertSchema(signers).omit({ id: true, createdAt: true, signedAt: true });
export const insertDocumentFieldSchema = createInsertSchema(documentFields).omit({ id: true, createdAt: true });
export const insertDocumentAuditLogSchema = createInsertSchema(documentAuditLog).omit({ id: true, createdAt: true });

// Types
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Signer = typeof signers.$inferSelect;
export type InsertSigner = z.infer<typeof insertSignerSchema>;
export type DocumentField = typeof documentFields.$inferSelect;
export type InsertDocumentField = z.infer<typeof insertDocumentFieldSchema>;
export type DocumentAuditLog = typeof documentAuditLog.$inferSelect;
export type InsertDocumentAuditLog = z.infer<typeof insertDocumentAuditLogSchema>;

// Projects table for loan closing progress tracking
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  agreementId: integer("agreement_id").references(() => documents.id, { onDelete: 'set null' }),
  quoteId: integer("quote_id").references(() => savedQuotes.id, { onDelete: 'set null' }),
  
  projectName: varchar("project_name", { length: 255 }).notNull(),
  projectNumber: varchar("project_number", { length: 50 }).unique(),
  
  loanAmount: real("loan_amount"),
  interestRate: real("interest_rate"),
  loanTermMonths: integer("loan_term_months"),
  loanType: varchar("loan_type", { length: 100 }),
  propertyAddress: text("property_address"),
  propertyType: varchar("property_type", { length: 100 }),
  borrowerName: varchar("borrower_name", { length: 255 }),
  borrowerEmail: varchar("borrower_email", { length: 255 }),
  borrowerPhone: varchar("borrower_phone", { length: 50 }),
  
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, on_hold, completed, cancelled, funded
  currentStage: varchar("current_stage", { length: 100 }).default("documentation"),
  progressPercentage: integer("progress_percentage").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  applicationDate: timestamp("application_date"),
  targetCloseDate: timestamp("target_close_date"),
  actualCloseDate: timestamp("actual_close_date"),
  fundingDate: timestamp("funding_date"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  
  externalLosId: varchar("external_los_id", { length: 255 }),
  externalSyncStatus: varchar("external_sync_status", { length: 50 }),
  externalSyncAt: timestamp("external_sync_at"),
  
  borrowerPortalToken: varchar("borrower_portal_token", { length: 255 }).unique(),
  borrowerPortalEnabled: boolean("borrower_portal_enabled").default(true),
  borrowerPortalLastViewed: timestamp("borrower_portal_last_viewed"),
  
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  isArchived: boolean("is_archived").default(false),
  metadata: jsonb("metadata"),
});

// Project stages/milestones
export const projectStages = pgTable("project_stages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  
  stageName: varchar("stage_name", { length: 100 }).notNull(),
  stageKey: varchar("stage_key", { length: 50 }).notNull(),
  stageOrder: integer("stage_order").notNull(),
  stageDescription: text("stage_description"),
  
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed, skipped
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedDurationDays: integer("estimated_duration_days"),
  
  visibleToBorrower: boolean("visible_to_borrower").default(true),
});

// Project tasks/checklist
export const projectTasks = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  stageId: integer("stage_id").references(() => projectStages.id, { onDelete: 'cascade' }),
  
  taskTitle: varchar("task_title", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  taskType: varchar("task_type", { length: 100 }), // document_upload, review, approval, collection, scheduling, verification
  
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed, blocked, not_applicable
  priority: varchar("priority", { length: 50 }).default("medium"), // low, medium, high, critical
  
  assignedTo: varchar("assigned_to", { length: 255 }),
  dueDate: timestamp("due_date"),
  
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by", { length: 255 }),
  
  requiresDocument: boolean("requires_document").default(false),
  documentId: integer("document_id").references(() => documents.id, { onDelete: 'set null' }),
  documentUrl: text("document_url"),
  
  visibleToBorrower: boolean("visible_to_borrower").default(true),
  borrowerActionRequired: boolean("borrower_action_required").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Project activity log
export const projectActivity = pgTable("project_activity", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  activityType: varchar("activity_type", { length: 100 }).notNull(),
  activityDescription: text("activity_description").notNull(),
  
  oldValue: text("old_value"),
  newValue: text("new_value"),
  
  metadata: jsonb("metadata"),
  
  visibleToBorrower: boolean("visible_to_borrower").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Project documents
export const projectDocuments = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  taskId: integer("task_id").references(() => projectTasks.id, { onDelete: 'set null' }),
  
  documentName: varchar("document_name", { length: 255 }).notNull(),
  documentType: varchar("document_type", { length: 100 }),
  documentCategory: varchar("document_category", { length: 100 }), // borrower_submitted, internal, third_party
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  
  status: varchar("status", { length: 50 }).default("pending_review"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  visibleToBorrower: boolean("visible_to_borrower").default(true),
});

// Webhook/Integration log
export const projectWebhooks = pgTable("project_webhooks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  
  webhookType: varchar("webhook_type", { length: 100 }), // n8n, external_los, custom
  webhookUrl: text("webhook_url"),
  
  triggerEvent: varchar("trigger_event", { length: 100 }), // stage_completed, project_created, task_completed, etc.
  
  payload: jsonb("payload"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  
  status: varchar("status", { length: 50 }), // pending, success, failed, retry
  attempts: integer("attempts").default(0),
  
  triggeredAt: timestamp("triggered_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Insert schemas for projects
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, lastUpdated: true });
export const insertProjectStageSchema = createInsertSchema(projectStages).omit({ id: true });
export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({ id: true, createdAt: true });
export const insertProjectActivitySchema = createInsertSchema(projectActivity).omit({ id: true, createdAt: true });
export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({ id: true, uploadedAt: true });
export const insertProjectWebhookSchema = createInsertSchema(projectWebhooks).omit({ id: true, triggeredAt: true });

// Project types
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectStage = typeof projectStages.$inferSelect;
export type InsertProjectStage = z.infer<typeof insertProjectStageSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectActivity = typeof projectActivity.$inferSelect;
export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;
export type ProjectWebhook = typeof projectWebhooks.$inferSelect;
export type InsertProjectWebhook = z.infer<typeof insertProjectWebhookSchema>;

// System settings table for admin configuration
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).unique().notNull(),
  settingValue: text("setting_value").notNull(),
  settingDescription: text("setting_description"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin tasks table - internal workflow steps
export const adminTasks = pgTable("admin_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }),
  
  taskTitle: varchar("task_title", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  taskCategory: varchar("task_category", { length: 100 }), // document_processing, underwriting_review, approval_required, closing_coordination
  
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed, blocked
  priority: varchar("priority", { length: 50 }).default("medium"), // low, medium, high, critical
  
  assignedTo: integer("assigned_to").references(() => users.id),
  dueDate: timestamp("due_date"),
  
  userMilestoneStageId: integer("user_milestone_stage_id").references(() => projectStages.id),
  userMilestoneTaskId: integer("user_milestone_task_id").references(() => projectTasks.id),
  
  autoUpdateUserTask: boolean("auto_update_user_task").default(true),
  
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by").references(() => users.id),
  
  requiresDocument: boolean("requires_document").default(false),
  documentId: integer("document_id").references(() => projectDocuments.id),
  
  internalNotes: text("internal_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin activity log - separate from user-facing activity
export const adminActivity = pgTable("admin_activity", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }),
  userId: integer("user_id").references(() => users.id),
  
  actionType: varchar("action_type", { length: 100 }).notNull(), // task_completed, document_added, stage_updated, note_added
  actionDescription: text("action_description").notNull(),
  
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for admin tables
export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export const insertAdminTaskSchema = createInsertSchema(adminTasks).omit({ id: true, createdAt: true, completedAt: true });
export const insertAdminActivitySchema = createInsertSchema(adminActivity).omit({ id: true, createdAt: true });

// Admin types
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type AdminTask = typeof adminTasks.$inferSelect;
export type InsertAdminTask = z.infer<typeof insertAdminTaskSchema>;
export type AdminActivity = typeof adminActivity.$inferSelect;
export type InsertAdminActivity = z.infer<typeof insertAdminActivitySchema>;

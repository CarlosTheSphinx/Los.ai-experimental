
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
  userType: varchar("user_type", { length: 50 }).default("broker").notNull(), // broker, borrower
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  emailVerified: boolean("email_verified").default(false),
  isActive: boolean("is_active").default(true),
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetExpires: timestamp("password_reset_expires"),
  // Onboarding tracking fields
  onboardingCompleted: boolean("onboarding_completed").default(false),
  partnershipAgreementSignedAt: timestamp("partnership_agreement_signed_at"),
  trainingCompletedAt: timestamp("training_completed_at"),
  // Test data identification
  isTestUser: boolean("is_test_user").default(false),
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

// Partners table - for tracking referral partners who bring deals
export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  entityType: varchar("entity_type", { length: 50 }), // LLC, Corporation, Partnership, Individual
  experienceLevel: varchar("experience_level", { length: 50 }).default("beginner"), // beginner, intermediate, experienced
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partners).omit({ id: true, createdAt: true });
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;

// Saved quotes table
export const savedQuotes = pgTable("saved_quotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  partnerId: integer("partner_id").references(() => partners.id, { onDelete: 'set null' }),
  partnerName: varchar("partner_name", { length: 255 }), // For manually typed partner names
  customerFirstName: text("customer_first_name").notNull(),
  customerLastName: text("customer_last_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
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

// RTL (Fix and Flip / Ground Up Construction) Pricing Schema
export const rtlLoanTypeEnum = z.enum(["light_rehab", "heavy_rehab", "bridge_no_rehab", "guc"]);
export const rtlPurposeEnum = z.enum(["purchase", "refi", "cash_out"]);
export const rtlPropertyTypeEnum = z.enum(["sfr_1_4", "condo", "multifamily", "pud", "modular", "other"]);
export const rtlExperienceTierEnum = z.enum(["no_experience", "experienced", "institutional"]);
export const rtlExitStrategyEnum = z.enum(["sell", "rent"]);
export const rtlEntityTypeEnum = z.enum([
  "llc", "llp", "lp", "corporation", "sole_prop", "revocable_trust",
  "natural_person", "irrevocable_trust", "cooperative", "community_land_trust"
]);

export const rtlPricingFormSchema = z.object({
  // Loan basics (required)
  loanType: rtlLoanTypeEnum,
  purpose: rtlPurposeEnum,
  loanAmount: z.coerce.number().optional(),
  propertyUnits: z.coerce.number().min(1, "Property units is required"),
  propertyType: rtlPropertyTypeEnum,
  propertyAddress: z.string().min(5, "Property address is required"),
  asIsValue: z.coerce.number().min(1, "As-Is Value is required"),
  arv: z.coerce.number().min(1, "ARV is required"),
  rehabBudget: z.coerce.number().min(0, "Rehab budget is required"),
  isMidstream: z.boolean().default(false),

  // Borrower basics (required)
  experienceTier: rtlExperienceTierEnum,
  completedProjects: z.coerce.number().min(0).default(0),
  fico: z.coerce.number().min(300).max(850),
  hasFullGuaranty: z.boolean().default(true),

  // Cash-out fields (conditional)
  cashOutAmount: z.coerce.number().optional(),

  // Leverage fields (recommended for real quote)
  ltv: z.coerce.number().min(0).max(100).optional(),
  ltc: z.coerce.number().min(0).max(100).optional(),
  ltarv: z.coerce.number().min(0).max(100).optional(),
  ltaiv: z.coerce.number().min(0).max(100).optional(),
  isDecliningMarket: z.boolean().default(false),
  isListedLast12Months: z.boolean().default(false),
  daysOnMarket: z.coerce.number().optional(),

  // Bridge rent test (conditional)
  exitStrategy: rtlExitStrategyEnum.optional(),
  monthlyGPR: z.coerce.number().optional(),
  monthlyPITIA: z.coerce.number().optional(),

  // GUC draw rules (conditional)
  initialDrawToLandPct: z.coerce.number().min(0).max(100).optional(),
  hasBuildingPermitsIssued: z.boolean().optional(),
  monthsSinceWorkPerformed: z.coerce.number().optional(),

  // Guarantor exposure
  guarantorExposure: z.coerce.number().optional(),
  includeNonGuarantorOwnerInExposure: z.boolean().default(false),

  // Credit seasoning
  mortgageLate30Last24: z.coerce.number().min(0).default(0),
  mortgageLate60Last24: z.coerce.number().min(0).default(0),
  monthsSinceBK: z.coerce.number().nullable().optional(),
  monthsSinceForeclosure: z.coerce.number().nullable().optional(),
  monthsSinceShortSaleOrDIL: z.coerce.number().nullable().optional(),

  // Entity rules
  borrowingEntityType: rtlEntityTypeEnum,
  isForeignNational: z.boolean().default(false),
});

export type RTLPricingFormData = z.infer<typeof rtlPricingFormSchema>;

// RTL Pricing Response
export const rtlPricingResponseSchema = z.object({
  eligible: z.boolean(),
  baseRate: z.number().optional(),
  finalRate: z.number().optional(),
  points: z.number().optional(),
  caps: z.object({
    maxLTC: z.number().optional(),
    maxLTAIV: z.number().optional(),
    maxLTARV: z.number().optional(),
  }).optional(),
  appliedAdjusters: z.array(z.object({
    id: z.string(),
    label: z.string(),
    rateAdd: z.number(),
  })).optional(),
  disqualifiers: z.array(z.object({
    id: z.string(),
    message: z.string(),
  })).optional(),
  flags: z.array(z.object({
    id: z.string(),
    message: z.string(),
  })).optional(),
});

export type RTLPricingResponse = z.infer<typeof rtlPricingResponseSchema>;

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

// Deal documents - required documents checklist per deal based on loan type
export const dealDocuments = pgTable("deal_documents", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => savedQuotes.id, { onDelete: 'cascade' }).notNull(),
  
  documentName: varchar("document_name", { length: 255 }).notNull(),
  documentCategory: varchar("document_category", { length: 100 }), // borrower_docs, entity_docs, property_docs, financial_docs, closing_docs
  documentDescription: text("document_description"),
  
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, uploaded, approved, rejected, not_applicable
  isRequired: boolean("is_required").default(true),
  
  filePath: text("file_path"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  
  uploadedAt: timestamp("uploaded_at"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),
  
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealDocumentSchema = createInsertSchema(dealDocuments).omit({ id: true, createdAt: true, uploadedAt: true, reviewedAt: true });
export type DealDocument = typeof dealDocuments.$inferSelect;
export type InsertDealDocument = z.infer<typeof insertDealDocumentSchema>;

// Deal tasks - tasks assigned to team members for a deal
export const dealTasks = pgTable("deal_tasks", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => savedQuotes.id, { onDelete: 'cascade' }).notNull(),
  
  taskName: varchar("task_name", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed
  priority: varchar("priority", { length: 20 }).default("medium"), // low, medium, high, critical
  
  assignedTo: integer("assigned_to").references(() => users.id),
  dueDate: timestamp("due_date"),
  
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by").references(() => users.id),
  
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealTaskSchema = createInsertSchema(dealTasks).omit({ id: true, createdAt: true, completedAt: true });
export type DealTask = typeof dealTasks.$inferSelect;
export type InsertDealTask = z.infer<typeof insertDealTaskSchema>;

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

// Deal Stages - configurable deal workflow stages
export const dealStages = pgTable("deal_stages", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).unique().notNull(), // e.g., "new", "initial-review"
  label: varchar("label", { length: 100 }).notNull(), // e.g., "New", "Initial Review"
  color: varchar("color", { length: 50 }).notNull(), // e.g., "gray", "yellow", "green"
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealStageSchema = createInsertSchema(dealStages).omit({ id: true, createdAt: true, updatedAt: true });
export type DealStage = typeof dealStages.$inferSelect;
export type InsertDealStage = z.infer<typeof insertDealStageSchema>;

// Loan Programs - configurable loan program settings
export const loanPrograms = pgTable("loan_programs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  loanType: varchar("loan_type", { length: 50 }).notNull(), // rtl, dscr
  
  minLoanAmount: real("min_loan_amount").default(100000),
  maxLoanAmount: real("max_loan_amount").default(5000000),
  
  minLtv: real("min_ltv").default(50),
  maxLtv: real("max_ltv").default(80),
  
  minInterestRate: real("min_interest_rate").default(8),
  maxInterestRate: real("max_interest_rate").default(15),
  
  termOptions: text("term_options"), // comma-separated: "6, 12, 18, 24"
  eligiblePropertyTypes: text("eligible_property_types").array(), // ['single-family', 'multi-family', 'commercial']
  
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLoanProgramSchema = createInsertSchema(loanPrograms).omit({ id: true, createdAt: true, updatedAt: true });
export type LoanProgram = typeof loanPrograms.$inferSelect;
export type InsertLoanProgram = z.infer<typeof insertLoanProgramSchema>;

// Program Document Templates - documents required for each program
export const programDocumentTemplates = pgTable("program_document_templates", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'cascade' }).notNull(),
  
  documentName: varchar("document_name", { length: 255 }).notNull(),
  documentCategory: varchar("document_category", { length: 100 }).notNull(), // borrower_docs, entity_docs, property_docs, financial_docs, closing_docs
  documentDescription: text("document_description"),
  
  isRequired: boolean("is_required").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProgramDocumentTemplateSchema = createInsertSchema(programDocumentTemplates).omit({ id: true, createdAt: true });
export type ProgramDocumentTemplate = typeof programDocumentTemplates.$inferSelect;
export type InsertProgramDocumentTemplate = z.infer<typeof insertProgramDocumentTemplateSchema>;

// Program Task Templates - tasks required for each program
export const programTaskTemplates = pgTable("program_task_templates", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'cascade' }).notNull(),
  
  taskName: varchar("task_name", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  taskCategory: varchar("task_category", { length: 100 }), // application_review, credit_check, appraisal, title_search, underwriting, closing
  
  priority: varchar("priority", { length: 20 }).default("medium"), // low, medium, high, critical
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProgramTaskTemplateSchema = createInsertSchema(programTaskTemplates).omit({ id: true, createdAt: true });
export type ProgramTaskTemplate = typeof programTaskTemplates.$inferSelect;
export type InsertProgramTaskTemplate = z.infer<typeof insertProgramTaskTemplateSchema>;

// Pricing Rulesets - versioned pricing rules per loan program
export const pricingRulesets = pgTable("pricing_rulesets", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'cascade' }).notNull(),
  
  version: integer("version").notNull(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  
  // The rules JSON structure contains:
  // - baseRates: { loanType: rate } - starting rates by loan sub-type
  // - points: { default: number } - default points
  // - adjusters: [{ id, label, when: conditions, rateAdd, pointsAdd }] - rate adjustments
  // - leverageCaps: [{ tier, loanTypes, max: { ltc, ltaiv, ltarv } }] - max leverage by tier
  // - overlays: [{ id, label, when: conditions, effects: { ltcAdd, etc } }] - cap adjustments
  // - eligibilityRules: [{ id, label, when: conditions, result: 'ineligible' }] - disqualifiers
  rulesJson: jsonb("rules_json").notNull(),
  
  status: varchar("status", { length: 50 }).default("draft").notNull(), // draft, active, archived
  
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  activatedAt: timestamp("activated_at"),
  archivedAt: timestamp("archived_at"),
});

export const insertPricingRulesetSchema = createInsertSchema(pricingRulesets).omit({ id: true, createdAt: true, activatedAt: true, archivedAt: true });
export type PricingRuleset = typeof pricingRulesets.$inferSelect;
export type InsertPricingRuleset = z.infer<typeof insertPricingRulesetSchema>;

// Rule Proposals - AI-generated rule suggestions pending review
export const ruleProposals = pgTable("rule_proposals", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'cascade' }).notNull(),
  
  ruleType: varchar("rule_type", { length: 50 }).notNull(), // adjuster, leverage_cap, overlay, eligibility_rule
  proposalJson: jsonb("proposal_json").notNull(), // The proposed rule object
  
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, accepted, rejected, modified
  confidence: real("confidence"), // AI confidence score 0-1
  reasoning: text("reasoning"), // AI explanation for the proposal
  
  sourceText: text("source_text"), // Original guideline text that generated this
  
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRuleProposalSchema = createInsertSchema(ruleProposals).omit({ id: true, createdAt: true, reviewedAt: true });
export type RuleProposal = typeof ruleProposals.$inferSelect;
export type InsertRuleProposal = z.infer<typeof insertRuleProposalSchema>;

// Guideline Uploads - PDF/text files uploaded for rule extraction
export const guidelineUploads = pgTable("guideline_uploads", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'cascade' }).notNull(),
  
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: text("file_path"),
  mimeType: varchar("mime_type", { length: 100 }),
  fileSize: integer("file_size"),
  
  extractedText: text("extracted_text"), // Text extracted from PDF
  
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processed, failed
  processedAt: timestamp("processed_at"),
  
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGuidelineUploadSchema = createInsertSchema(guidelineUploads).omit({ id: true, createdAt: true, processedAt: true });
export type GuidelineUpload = typeof guidelineUploads.$inferSelect;
export type InsertGuidelineUpload = z.infer<typeof insertGuidelineUploadSchema>;

// Pricing Quote Logs - audit trail for deterministic pricing calculations
export const pricingQuoteLogs = pgTable("pricing_quote_logs", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'set null' }),
  rulesetId: integer("ruleset_id").references(() => pricingRulesets.id, { onDelete: 'set null' }),
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  inputsJson: jsonb("inputs_json").notNull(), // The loan scenario inputs
  outputsJson: jsonb("outputs_json").notNull(), // The calculated pricing result
  
  eligible: boolean("eligible").notNull(),
  finalRate: real("final_rate"),
  points: real("points"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPricingQuoteLogSchema = createInsertSchema(pricingQuoteLogs).omit({ id: true, createdAt: true });
export type PricingQuoteLog = typeof pricingQuoteLogs.$inferSelect;
export type InsertPricingQuoteLog = z.infer<typeof insertPricingQuoteLogSchema>;

// Zod schemas for ruleset structure validation
export const ruleConditionSchema = z.object({
  loanType: z.string().optional(),
  purpose: z.string().optional(),
  tier: z.string().optional(),
  propertyType: z.string().optional(),
  state: z.string().optional(),
  ficoLt: z.number().optional(),
  ficoLte: z.number().optional(),
  ficoGt: z.number().optional(),
  ficoGte: z.number().optional(),
  ltvLt: z.number().optional(),
  ltvLte: z.number().optional(),
  ltvGt: z.number().optional(),
  ltvGte: z.number().optional(),
  dscrLt: z.number().optional(),
  dscrLte: z.number().optional(),
  dscrGt: z.number().optional(),
  dscrGte: z.number().optional(),
  loanAmountLt: z.number().optional(),
  loanAmountLte: z.number().optional(),
  loanAmountGt: z.number().optional(),
  loanAmountGte: z.number().optional(),
  isMidstream: z.boolean().optional(),
  isRural: z.boolean().optional(),
  msaIn: z.array(z.string()).optional(),
  stateIn: z.array(z.string()).optional(),
}).passthrough();

export const ruleAdjusterSchema = z.object({
  id: z.string(),
  label: z.string(),
  when: ruleConditionSchema.optional(),
  rateAdd: z.number().optional(),
  pointsAdd: z.number().optional(),
});

export const leverageCapSchema = z.object({
  tier: z.string(),
  loanTypes: z.array(z.string()),
  max: z.object({
    ltc: z.number().optional(),
    ltaiv: z.number().optional(),
    ltarv: z.number().optional(),
  }),
});

export const overlaySchema = z.object({
  id: z.string(),
  label: z.string(),
  when: ruleConditionSchema.optional(),
  effects: z.object({
    ltcAdd: z.number().optional(),
    ltaivAdd: z.number().optional(),
    ltarvAdd: z.number().optional(),
  }),
});

export const eligibilityRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  when: ruleConditionSchema,
  result: z.literal("ineligible"),
});

export const pricingRulesSchema = z.object({
  product: z.string(),
  baseRates: z.record(z.string(), z.number()),
  points: z.object({ default: z.number() }).optional(),
  adjusters: z.array(ruleAdjusterSchema).optional(),
  leverageCaps: z.array(leverageCapSchema).optional(),
  overlays: z.array(overlaySchema).optional(),
  eligibilityRules: z.array(eligibilityRuleSchema).optional(),
});

export type RuleCondition = z.infer<typeof ruleConditionSchema>;
export type RuleAdjuster = z.infer<typeof ruleAdjusterSchema>;
export type LeverageCap = z.infer<typeof leverageCapSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type EligibilityRule = z.infer<typeof eligibilityRuleSchema>;
export type PricingRules = z.infer<typeof pricingRulesSchema>;

// ==================== MESSAGING SYSTEM ====================

// Message threads - a conversation room tied to a specific deal
export const messageThreads = pgTable("message_threads", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => savedQuotes.id, { onDelete: 'cascade' }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  subject: varchar("subject", { length: 255 }),
  isClosed: boolean("is_closed").default(false).notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageThreadSchema = createInsertSchema(messageThreads).omit({ id: true, createdAt: true, lastMessageAt: true });
export type MessageThread = typeof messageThreads.$inferSelect;
export type InsertMessageThread = z.infer<typeof insertMessageThreadSchema>;

// Messages - individual messages within a thread
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => messageThreads.id, { onDelete: 'cascade' }).notNull(),
  senderId: integer("sender_id").references(() => users.id, { onDelete: 'set null' }),
  senderRole: varchar("sender_role", { length: 20 }).notNull(), // 'admin', 'user', 'system'
  type: varchar("type", { length: 20 }).notNull(), // 'message', 'notification'
  body: text("body").notNull(),
  meta: jsonb("meta"), // Additional data like deal stage changes
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Message read receipts - tracks when users last read a thread
export const messageReads = pgTable("message_reads", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => messageThreads.id, { onDelete: 'cascade' }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
});

export const insertMessageReadSchema = createInsertSchema(messageReads).omit({ id: true });
export type MessageRead = typeof messageReads.$inferSelect;
export type InsertMessageRead = z.infer<typeof insertMessageReadSchema>;

// ==================== ONBOARDING SYSTEM ====================

// Onboarding documents - admin-uploadable partnership agreements and training materials
export const onboardingDocuments = pgTable("onboarding_documents", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // 'partnership_agreement', 'training_doc', 'training_video', 'training_link'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  fileUrl: text("file_url"), // For uploaded PDFs, videos
  externalUrl: text("external_url"), // For external links
  thumbnailUrl: text("thumbnail_url"), // Optional thumbnail for videos
  sortOrder: integer("sort_order").default(0).notNull(),
  isRequired: boolean("is_required").default(true).notNull(), // Must complete for onboarding
  isActive: boolean("is_active").default(true).notNull(),
  targetUserType: varchar("target_user_type", { length: 50 }).default("broker").notNull(), // 'broker', 'borrower', 'all'
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOnboardingDocumentSchema = createInsertSchema(onboardingDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export type OnboardingDocument = typeof onboardingDocuments.$inferSelect;
export type InsertOnboardingDocument = z.infer<typeof insertOnboardingDocumentSchema>;

// User onboarding progress - tracks which documents each user has viewed/signed
export const userOnboardingProgress = pgTable("user_onboarding_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  documentId: integer("document_id").references(() => onboardingDocuments.id, { onDelete: 'cascade' }).notNull(),
  status: varchar("status", { length: 50 }).notNull(), // 'viewed', 'completed', 'signed', 'skipped'
  signatureData: text("signature_data"), // For signed documents (base64 or URL)
  signedAt: timestamp("signed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserOnboardingProgressSchema = createInsertSchema(userOnboardingProgress).omit({ id: true, createdAt: true });
export type UserOnboardingProgress = typeof userOnboardingProgress.$inferSelect;
export type InsertUserOnboardingProgress = z.infer<typeof insertUserOnboardingProgressSchema>;

// ==================== LOAN DIGEST NOTIFICATION SYSTEM ====================

// Frequency options for digest delivery
export const digestFrequencyEnum = z.enum(["daily", "every_3_days", "weekly", "custom"]);
export type DigestFrequency = z.infer<typeof digestFrequencyEnum>;

// Delivery method options
export const deliveryMethodEnum = z.enum(["email", "sms", "both"]);
export type DeliveryMethod = z.infer<typeof deliveryMethodEnum>;

// Content type options for digest
export const digestContentTypeEnum = z.enum(["documents_needed", "notes", "messages", "general_updates"]);
export type DigestContentType = z.infer<typeof digestContentTypeEnum>;

// Loan digest configuration - per-project/deal digest settings
export const loanDigestConfigs = pgTable("loan_digest_configs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }),
  dealId: integer("deal_id").references(() => savedQuotes.id, { onDelete: 'cascade' }),
  
  // WHEN - frequency and timing
  frequency: varchar("frequency", { length: 50 }).default("daily").notNull(), // daily, every_3_days, weekly, custom
  customDays: integer("custom_days"), // For custom frequency, number of days between digests
  timeOfDay: varchar("time_of_day", { length: 10 }).default("09:00").notNull(), // 24-hour format HH:MM
  timezone: varchar("timezone", { length: 100 }).default("America/New_York").notNull(),
  
  // WHAT - content included in digest
  includeDocumentsNeeded: boolean("include_documents_needed").default(true).notNull(), // THE MOST IMPORTANT
  includeNotes: boolean("include_notes").default(false).notNull(),
  includeMessages: boolean("include_messages").default(false).notNull(),
  includeGeneralUpdates: boolean("include_general_updates").default(true).notNull(),
  
  isEnabled: boolean("is_enabled").default(true).notNull(),
  
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLoanDigestConfigSchema = createInsertSchema(loanDigestConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type LoanDigestConfig = typeof loanDigestConfigs.$inferSelect;
export type InsertLoanDigestConfig = z.infer<typeof insertLoanDigestConfigSchema>;

// Loan digest recipients - WHO receives the digest for each config
export const loanDigestRecipients = pgTable("loan_digest_recipients", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => loanDigestConfigs.id, { onDelete: 'cascade' }).notNull(),
  
  // Can be linked to a user or manual contact info
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  
  // Manual recipient info (if not linked to a user)
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  recipientPhone: varchar("recipient_phone", { length: 50 }),
  
  // HOW - delivery method for this recipient
  deliveryMethod: varchar("delivery_method", { length: 20 }).default("email").notNull(), // email, sms, both
  
  isActive: boolean("is_active").default(true).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLoanDigestRecipientSchema = createInsertSchema(loanDigestRecipients).omit({ id: true, createdAt: true });
export type LoanDigestRecipient = typeof loanDigestRecipients.$inferSelect;
export type InsertLoanDigestRecipient = z.infer<typeof insertLoanDigestRecipientSchema>;

// Loan updates - event ledger for building digest content
// Whenever admin actions happen, a row is added here so the digest can pick it up
export const loanUpdates = pgTable("loan_updates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  
  // Type of update
  updateType: varchar("update_type", { length: 50 }).notNull(), // doc_request, stage_change, note_added, task_assigned, task_completed, message, status_change
  
  // Human-readable summary for the digest
  summary: text("summary").notNull(),
  
  // Additional metadata
  meta: jsonb("meta"),
  
  // Who performed this action (null for system actions)
  performedBy: integer("performed_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Whether this update was included in a digest
  includedInDigestAt: timestamp("included_in_digest_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLoanUpdateSchema = createInsertSchema(loanUpdates).omit({ id: true, createdAt: true, includedInDigestAt: true });
export type LoanUpdate = typeof loanUpdates.$inferSelect;
export type InsertLoanUpdate = z.infer<typeof insertLoanUpdateSchema>;

// Digest history - tracks when digests were sent (for audit and preventing duplicates)
export const digestHistory = pgTable("digest_history", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => loanDigestConfigs.id, { onDelete: 'cascade' }).notNull(),
  recipientId: integer("recipient_id").references(() => loanDigestRecipients.id, { onDelete: 'cascade' }).notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  
  // Delivery details
  deliveryMethod: varchar("delivery_method", { length: 20 }).notNull(), // email, sms
  recipientAddress: varchar("recipient_address", { length: 255 }).notNull(), // Email or phone
  
  // Content summary
  documentsCount: integer("documents_count").default(0).notNull(),
  updatesCount: integer("updates_count").default(0).notNull(),
  
  // Status
  status: varchar("status", { length: 50 }).default("sent").notNull(), // sent, failed, bounced
  errorMessage: text("error_message"),
  
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const insertDigestHistorySchema = createInsertSchema(digestHistory).omit({ id: true, sentAt: true });
export type DigestHistory = typeof digestHistory.$inferSelect;
export type InsertDigestHistory = z.infer<typeof insertDigestHistorySchema>;

// Digest state - tracks the last digest sent per project/recipient to avoid duplicates
export const digestState = pgTable("digest_state", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => loanDigestConfigs.id, { onDelete: 'cascade' }).notNull(),
  recipientId: integer("recipient_id").references(() => loanDigestRecipients.id, { onDelete: 'cascade' }).notNull(),
  
  lastDigestSentAt: timestamp("last_digest_sent_at").notNull(),
  nextDigestDueAt: timestamp("next_digest_due_at").notNull(),
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDigestStateSchema = createInsertSchema(digestState).omit({ id: true, updatedAt: true });
export type DigestState = typeof digestState.$inferSelect;
export type InsertDigestState = z.infer<typeof insertDigestStateSchema>;

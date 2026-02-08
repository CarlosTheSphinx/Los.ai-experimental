
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for multi-tenancy
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  fullName: varchar("full_name", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  title: varchar("title", { length: 255 }),
  role: varchar("role", { length: 50 }).default("user").notNull(), // user, processor, staff, admin, super_admin
  roles: text("roles").array(),
  userType: varchar("user_type", { length: 50 }).default("broker"), // broker, borrower, null for Google OAuth users pending selection
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  emailVerified: boolean("email_verified").default(false),
  isActive: boolean("is_active").default(true),
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetExpires: timestamp("password_reset_expires"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  partnershipAgreementSignedAt: timestamp("partnership_agreement_signed_at"),
  trainingCompletedAt: timestamp("training_completed_at"),
  isTestUser: boolean("is_test_user").default(false),
  googleId: varchar("google_id", { length: 255 }).unique(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
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
  customerCompanyName: text("customer_company_name"),
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
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'set null' }),
  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }),
  googleDriveFolderUrl: text("google_drive_folder_url"),
  driveSyncStatus: varchar("drive_sync_status", { length: 50 }).default("NOT_ENABLED"),
  driveSyncError: text("drive_sync_error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedQuoteSchema = createInsertSchema(savedQuotes).omit({ id: true, createdAt: true, googleDriveFolderId: true, googleDriveFolderUrl: true, driveSyncStatus: true, driveSyncError: true });
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
    maxLTARV: z.number().nullable().optional(),
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
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'set null' }),
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

  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }),
  googleDriveFolderUrl: text("google_drive_folder_url"),
  driveSyncStatus: varchar("drive_sync_status", { length: 50 }).default("NOT_ENABLED"),
  driveSyncError: text("drive_sync_error"),
});

// Project stages/milestones
export const projectStages = pgTable("project_stages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  programStepId: integer("program_step_id"),
  
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
  programTaskTemplateId: integer("program_task_template_id"),
  
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

  googleDriveFileId: varchar("google_drive_file_id", { length: 255 }),
  googleDriveFileUrl: text("google_drive_file_url"),
  googleDriveMimeType: varchar("google_drive_mime_type", { length: 255 }),
  driveUploadStatus: varchar("drive_upload_status", { length: 50 }).default("NOT_ENABLED"),
  driveUploadError: text("drive_upload_error"),
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
  stageId: integer("stage_id").references(() => projectStages.id, { onDelete: 'set null' }),
  programDocumentTemplateId: integer("program_document_template_id"),
  
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
  
  googleDriveFileId: varchar("google_drive_file_id", { length: 255 }),
  googleDriveFileUrl: text("google_drive_file_url"),
  driveUploadStatus: varchar("drive_upload_status", { length: 50 }).default("NOT_SYNCED"),
  driveUploadError: text("drive_upload_error"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealDocumentSchema = createInsertSchema(dealDocuments).omit({ id: true, createdAt: true, uploadedAt: true, reviewedAt: true, googleDriveFileId: true, googleDriveFileUrl: true, driveUploadStatus: true, driveUploadError: true });
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
  stepId: integer("step_id"),
  
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
  stepId: integer("step_id"),
  
  taskName: varchar("task_name", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  taskCategory: varchar("task_category", { length: 100 }), // application_review, credit_check, appraisal, title_search, underwriting, closing
  
  assignToRole: varchar("assign_to_role", { length: 50 }).default("admin"), // user, admin, processor
  
  priority: varchar("priority", { length: 20 }).default("medium"), // low, medium, high, critical
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProgramTaskTemplateSchema = createInsertSchema(programTaskTemplates).omit({ id: true, createdAt: true });
export type ProgramTaskTemplate = typeof programTaskTemplates.$inferSelect;
export type InsertProgramTaskTemplate = z.infer<typeof insertProgramTaskTemplateSchema>;

// Workflow Step Definitions - master list of reusable step types
export const workflowStepDefinitions = pgTable("workflow_step_definitions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  key: varchar("key", { length: 100 }).unique().notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }).default("#6366f1"),
  icon: varchar("icon", { length: 50 }),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkflowStepDefinitionSchema = createInsertSchema(workflowStepDefinitions).omit({ id: true, createdAt: true });
export type WorkflowStepDefinition = typeof workflowStepDefinitions.$inferSelect;
export type InsertWorkflowStepDefinition = z.infer<typeof insertWorkflowStepDefinitionSchema>;

// Program Workflow Steps - links step definitions to specific programs with ordering
export const programWorkflowSteps = pgTable("program_workflow_steps", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, { onDelete: 'cascade' }).notNull(),
  stepDefinitionId: integer("step_definition_id").references(() => workflowStepDefinitions.id, { onDelete: 'cascade' }).notNull(),
  stepOrder: integer("step_order").notNull(),
  isRequired: boolean("is_required").default(true),
  estimatedDays: integer("estimated_days"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProgramWorkflowStepSchema = createInsertSchema(programWorkflowSteps).omit({ id: true, createdAt: true });
export type ProgramWorkflowStep = typeof programWorkflowSteps.$inferSelect;
export type InsertProgramWorkflowStep = z.infer<typeof insertProgramWorkflowStepSchema>;

// Deal Processors - assigns processors to deals/projects
export const dealProcessors = pgTable("deal_processors", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar("role", { length: 100 }).default("processor"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: integer("assigned_by").references(() => users.id, { onDelete: 'set null' }),
});

export const insertDealProcessorSchema = createInsertSchema(dealProcessors).omit({ id: true, assignedAt: true });
export type DealProcessor = typeof dealProcessors.$inferSelect;
export type InsertDealProcessor = z.infer<typeof insertDealProcessorSchema>;

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
  
  // MESSAGE - customizable email/sms content
  emailSubject: varchar("email_subject", { length: 255 }).default("Loan Update: Action Required"),
  emailBody: text("email_body").default("Hello {{recipientName}},\n\nHere's an update on your loan for {{propertyAddress}}.\n\n{{documentsSection}}\n\n{{updatesSection}}\n\nPlease log in to your portal to take any necessary actions.\n\nBest regards,\nSphinx Capital"),
  smsBody: text("sms_body").default("Sphinx Capital: {{documentsCount}} docs needed for your loan. Log in to your portal for details."),
  
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

// Digest message templates - reusable templates with merge tags
export const digestTemplates = pgTable("digest_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 255 }),
  
  // Template content with merge tags
  emailSubject: varchar("email_subject", { length: 255 }).notNull(),
  emailBody: text("email_body").notNull(),
  smsBody: text("sms_body"),
  
  // Template type: default, custom
  templateType: varchar("template_type", { length: 50 }).default("custom").notNull(),
  
  // Is this the default template?
  isDefault: boolean("is_default").default(false).notNull(),
  
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDigestTemplateSchema = createInsertSchema(digestTemplates).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type DigestTemplate = typeof digestTemplates.$inferSelect;
export type InsertDigestTemplate = z.infer<typeof insertDigestTemplateSchema>;

// Scheduled digest drafts - pre-generated digests that need approval before sending
export const scheduledDigestDrafts = pgTable("scheduled_digest_drafts", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => loanDigestConfigs.id, { onDelete: 'cascade' }).notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }), // Nullable for deal-only digests
  
  // Scheduled date for this digest
  scheduledDate: timestamp("scheduled_date").notNull(),
  timeOfDay: varchar("time_of_day", { length: 10 }).notNull(),
  
  // Pre-rendered content (editable before approval)
  emailSubject: varchar("email_subject", { length: 255 }),
  emailBody: text("email_body"),
  smsBody: text("sms_body"),
  
  // Content summary
  documentsCount: integer("documents_count").default(0).notNull(),
  updatesCount: integer("updates_count").default(0).notNull(),
  
  // Recipient snapshot (JSON array of recipient info at time of draft creation)
  recipients: jsonb("recipients").default('[]'),
  
  // Status: draft, approved, sent, skipped
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  
  // Approval tracking
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  
  // Sent tracking
  sentAt: timestamp("sent_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScheduledDigestDraftSchema = createInsertSchema(scheduledDigestDrafts).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  approvedAt: true,
  sentAt: true
});
export type ScheduledDigestDraft = typeof scheduledDigestDrafts.$inferSelect;
export type InsertScheduledDigestDraft = z.infer<typeof insertScheduledDigestDraftSchema>;

// ==================== PARTNER BROADCASTS ====================

// Partner broadcasts - stores mass communications sent to all partners
export const partnerBroadcasts = pgTable("partner_broadcasts", {
  id: serial("id").primaryKey(),
  sentBy: integer("sent_by").references(() => users.id, { onDelete: 'set null' }),
  subject: varchar("subject", { length: 255 }).notNull(),
  emailBody: text("email_body").notNull(),
  smsBody: text("sms_body"),
  sendEmail: boolean("send_email").default(true).notNull(),
  sendSms: boolean("send_sms").default(false).notNull(),
  recipientCount: integer("recipient_count").default(0).notNull(),
  emailsSent: integer("emails_sent").default(0).notNull(),
  smsSent: integer("sms_sent").default(0).notNull(),
  emailsFailed: integer("emails_failed").default(0).notNull(),
  smsFailed: integer("sms_failed").default(0).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, sending, completed, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertPartnerBroadcastSchema = createInsertSchema(partnerBroadcasts).omit({ 
  id: true, 
  createdAt: true, 
  completedAt: true,
  emailsSent: true,
  smsSent: true,
  emailsFailed: true,
  smsFailed: true,
  recipientCount: true,
  status: true
});
export type PartnerBroadcast = typeof partnerBroadcasts.$inferSelect;
export type InsertPartnerBroadcast = z.infer<typeof insertPartnerBroadcastSchema>;

// Partner broadcast recipients - individual delivery tracking
export const partnerBroadcastRecipients = pgTable("partner_broadcast_recipients", {
  id: serial("id").primaryKey(),
  broadcastId: integer("broadcast_id").references(() => partnerBroadcasts.id, { onDelete: 'cascade' }).notNull(),
  partnerId: integer("partner_id").references(() => partners.id, { onDelete: 'set null' }),
  partnerName: varchar("partner_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  emailStatus: varchar("email_status", { length: 50 }).default("pending"), // pending, sent, failed
  smsStatus: varchar("sms_status", { length: 50 }).default("pending"), // pending, sent, failed
  emailError: text("email_error"),
  smsError: text("sms_error"),
  personalizedEmailBody: text("personalized_email_body"),
  personalizedSmsBody: text("personalized_sms_body"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPartnerBroadcastRecipientSchema = createInsertSchema(partnerBroadcastRecipients).omit({ 
  id: true, 
  createdAt: true 
});
export type PartnerBroadcastRecipient = typeof partnerBroadcastRecipients.$inferSelect;
export type InsertPartnerBroadcastRecipient = z.infer<typeof insertPartnerBroadcastRecipientSchema>;

// Inbound SMS messages - stores replies from partners
export const inboundSmsMessages = pgTable("inbound_sms_messages", {
  id: serial("id").primaryKey(),
  fromPhone: varchar("from_phone", { length: 50 }).notNull(),
  toPhone: varchar("to_phone", { length: 50 }).notNull(),
  body: text("body").notNull(),
  twilioMessageSid: varchar("twilio_message_sid", { length: 255 }),
  partnerId: integer("partner_id").references(() => partners.id, { onDelete: 'set null' }),
  broadcastId: integer("broadcast_id").references(() => partnerBroadcasts.id, { onDelete: 'set null' }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInboundSmsMessageSchema = createInsertSchema(inboundSmsMessages).omit({ 
  id: true, 
  createdAt: true 
});
export type InboundSmsMessage = typeof inboundSmsMessages.$inferSelect;
export type InsertInboundSmsMessage = z.infer<typeof insertInboundSmsMessageSchema>;

// ==================== DOCUMENT TEMPLATES ====================

// Field types for PDF templates
export const templateFieldTypeEnum = z.enum(["text", "number", "date", "checkbox", "signature"]);
export type TemplateFieldType = z.infer<typeof templateFieldTypeEnum>;

// Document templates - stores PDF templates with field positions
export const documentTemplates = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // PDF storage (URL in object storage)
  pdfUrl: text("pdf_url").notNull(),
  pdfFileName: varchar("pdf_filename", { length: 255 }).notNull(),
  
  // PDF dimensions per page (JSON: [{page: 1, width: 612, height: 792}, ...])
  pageDimensions: jsonb("page_dimensions").default('[]'),
  pageCount: integer("page_count").default(1).notNull(),
  
  // Template categorization
  category: varchar("category", { length: 100 }), // e.g., "agreement", "disclosure", "contract"
  loanType: varchar("loan_type", { length: 50 }), // optional: ties to specific loan type
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  
  // Optional: Link to external e-sign provider template
  pandadocTemplateId: varchar("pandadoc_template_id", { length: 255 }), // PandaDoc template UUID for direct sending
  
  // Audit
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;

// Template fields - stores field positions and data bindings for each template
export const templateFields = pgTable("template_fields", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => documentTemplates.id, { onDelete: 'cascade' }).notNull(),
  
  // Field identification
  fieldName: varchar("field_name", { length: 100 }).notNull(), // Display name in UI
  fieldKey: varchar("field_key", { length: 100 }).notNull(), // Data binding key (e.g., "borrower.name", "loan.amount")
  fieldType: varchar("field_type", { length: 50 }).notNull(), // text, number, date, checkbox, signature
  
  // Position on PDF (in PDF points, origin is bottom-left)
  pageNumber: integer("page_number").notNull(),
  x: real("x").notNull(), // X position in PDF points
  y: real("y").notNull(), // Y position in PDF points
  width: real("width").notNull(), // Width in PDF points
  height: real("height").notNull(), // Height in PDF points
  
  // Display options
  fontSize: integer("font_size").default(12),
  fontColor: varchar("font_color", { length: 20 }).default("#000000"),
  textAlign: varchar("text_align", { length: 20 }).default("left"), // left, center, right
  
  // For signature fields - which signer
  signerRole: varchar("signer_role", { length: 50 }), // e.g., "borrower", "co-borrower", "guarantor"
  
  // Validation
  isRequired: boolean("is_required").default(false).notNull(),
  defaultValue: text("default_value"),
  
  // Order for tab navigation
  tabOrder: integer("tab_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTemplateFieldSchema = createInsertSchema(templateFields).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type TemplateField = typeof templateFields.$inferSelect;
export type InsertTemplateField = z.infer<typeof insertTemplateFieldSchema>;

// E-Sign Envelopes - tracks documents sent via external e-sign providers (PandaDoc, DocuSign, etc.)
export const esignEnvelopes = pgTable("esign_envelopes", {
  id: serial("id").primaryKey(),
  vendor: varchar("vendor", { length: 50 }).notNull(), // "pandadoc", "docusign", etc.
  quoteId: integer("quote_id").references(() => savedQuotes.id, { onDelete: 'set null' }),
  templateId: integer("template_id").references(() => documentTemplates.id, { onDelete: 'set null' }),
  
  // External document reference
  externalDocumentId: varchar("external_document_id", { length: 255 }).notNull(),
  externalTemplateId: varchar("external_template_id", { length: 255 }), // PandaDoc template ID used
  
  // Document details
  documentName: varchar("document_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default('draft'), // draft, sent, viewed, completed, declined, voided
  
  // Signing URLs
  signingUrl: text("signing_url"), // For embedded signing
  signedPdfUrl: text("signed_pdf_url"), // URL to download signed PDF
  
  // Recipients (stored as JSON array)
  recipients: jsonb("recipients").default('[]'), // [{name, email, role, status, signedAt}]
  
  // Metadata
  sendMethod: varchar("send_method", { length: 20 }).default('email'), // email, embedded
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  completedAt: timestamp("completed_at"),
  
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEsignEnvelopeSchema = createInsertSchema(esignEnvelopes).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type EsignEnvelope = typeof esignEnvelopes.$inferSelect;
export type InsertEsignEnvelope = z.infer<typeof insertEsignEnvelopeSchema>;

// E-Sign Events - webhook events and status changes for tracking
export const esignEvents = pgTable("esign_events", {
  id: serial("id").primaryKey(),
  vendor: varchar("vendor", { length: 50 }).notNull(),
  envelopeId: integer("envelope_id").references(() => esignEnvelopes.id, { onDelete: 'cascade' }),
  externalDocumentId: varchar("external_document_id", { length: 255 }).notNull(),
  
  eventType: varchar("event_type", { length: 100 }).notNull(), // document.created, document.sent, document.viewed, document.completed, etc.
  eventData: jsonb("event_data").default('{}'), // Full webhook payload
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEsignEventSchema = createInsertSchema(esignEvents).omit({ 
  id: true, 
  createdAt: true 
});
export type EsignEvent = typeof esignEvents.$inferSelect;
export type InsertEsignEvent = z.infer<typeof insertEsignEventSchema>;

// Field data binding options - commonly used keys for autocomplete
export const fieldBindingKeys = [
  // Borrower info
  "borrower.firstName",
  "borrower.lastName", 
  "borrower.fullName",
  "borrower.email",
  "borrower.phone",
  "borrower.address",
  "borrower.ssn",
  "borrower.dob",
  "borrower.signature",
  
  // Co-borrower info
  "coBorrower.firstName",
  "coBorrower.lastName",
  "coBorrower.fullName",
  "coBorrower.email",
  "coBorrower.phone",
  "coBorrower.signature",
  
  // Property info
  "property.address",
  "property.city",
  "property.state",
  "property.zip",
  "property.type",
  "property.asIsValue",
  "property.arv",
  
  // Loan info
  "loan.amount",
  "loan.interestRate",
  "loan.term",
  "loan.type",
  "loan.purpose",
  "loan.closingDate",
  "loan.monthlyPayment",
  "loan.points",
  "loan.totalClosingCosts",
  
  // Company info
  "company.name",
  "company.address",
  "company.phone",
  "company.email",
  
  // Date fields
  "today.date",
  "today.dateFormatted",
] as const;

export type FieldBindingKey = typeof fieldBindingKeys[number];

// Team Permissions - role-based permission configuration
export const teamPermissions = pgTable("team_permissions", {
  id: serial("id").primaryKey(),
  role: varchar("role", { length: 50 }).notNull(), // staff, admin
  permissionKey: varchar("permission_key", { length: 100 }).notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const insertTeamPermissionSchema = createInsertSchema(teamPermissions).omit({
  id: true,
  updatedAt: true,
});
export type TeamPermission = typeof teamPermissions.$inferSelect;
export type InsertTeamPermission = z.infer<typeof insertTeamPermissionSchema>;

// All available permission keys for the team permission system
export const TEAM_ROLES = ["processor", "staff", "admin", "super_admin"] as const;
export type TeamRole = typeof TEAM_ROLES[number];

export const ROLE_HIERARCHY: Record<string, number> = {
  user: 0,
  processor: 1,
  staff: 2,
  admin: 3,
  super_admin: 4,
};

export function getPrimaryRole(roles: string[]): string {
  let highest = "user";
  for (const r of roles) {
    if ((ROLE_HIERARCHY[r] ?? 0) > (ROLE_HIERARCHY[highest] ?? 0)) {
      highest = r;
    }
  }
  return highest;
}

export const PERMISSION_KEYS = [
  "quotes.view",
  "quotes.create",
  "agreements.view",
  "agreements.create",
  "agreements.send_for_signing",
  "projects.view",
  "projects.create",
  "projects.edit",
  "pipeline.view",
  "pipeline.manage",
  "messages.view",
  "messages.send",
  "partners.view",
  "partners.manage",
  "partners.broadcast",
  "users.view",
  "users.manage",
  "programs.view",
  "programs.manage",
  "settings.view",
  "settings.manage",
  "digests.view",
  "digests.manage",
  "onboarding.view",
  "onboarding.manage",
  "commercial.view",
  "commercial.manage",
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

// Permission display metadata
export const PERMISSION_CATEGORIES: Record<string, { label: string; permissions: { key: PermissionKey; label: string }[] }> = {
  quotes: {
    label: "Quotes",
    permissions: [
      { key: "quotes.view", label: "View quotes" },
      { key: "quotes.create", label: "Create & edit quotes" },
    ],
  },
  agreements: {
    label: "Agreements",
    permissions: [
      { key: "agreements.view", label: "View agreements" },
      { key: "agreements.create", label: "Create agreements" },
      { key: "agreements.send_for_signing", label: "Send for signing" },
    ],
  },
  projects: {
    label: "Projects",
    permissions: [
      { key: "projects.view", label: "View projects" },
      { key: "projects.create", label: "Create projects" },
      { key: "projects.edit", label: "Edit projects" },
    ],
  },
  pipeline: {
    label: "Pipeline",
    permissions: [
      { key: "pipeline.view", label: "View pipeline" },
      { key: "pipeline.manage", label: "Manage deals in pipeline" },
    ],
  },
  messages: {
    label: "Messages",
    permissions: [
      { key: "messages.view", label: "View messages" },
      { key: "messages.send", label: "Send messages" },
    ],
  },
  partners: {
    label: "Partners",
    permissions: [
      { key: "partners.view", label: "View partners" },
      { key: "partners.manage", label: "Manage partners" },
      { key: "partners.broadcast", label: "Send broadcasts" },
    ],
  },
  users: {
    label: "Users",
    permissions: [
      { key: "users.view", label: "View users" },
      { key: "users.manage", label: "Manage users" },
    ],
  },
  programs: {
    label: "Programs",
    permissions: [
      { key: "programs.view", label: "View programs" },
      { key: "programs.manage", label: "Manage programs" },
    ],
  },
  settings: {
    label: "Settings",
    permissions: [
      { key: "settings.view", label: "View settings" },
      { key: "settings.manage", label: "Manage settings" },
    ],
  },
  digests: {
    label: "Loan Digests",
    permissions: [
      { key: "digests.view", label: "View digests" },
      { key: "digests.manage", label: "Manage digests" },
    ],
  },
  onboarding: {
    label: "Onboarding",
    permissions: [
      { key: "onboarding.view", label: "View onboarding" },
      { key: "onboarding.manage", label: "Manage onboarding" },
    ],
  },
  commercial: {
    label: "Commercial Submissions",
    permissions: [
      { key: "commercial.view", label: "View commercial submissions" },
      { key: "commercial.manage", label: "Manage commercial submissions" },
    ],
  },
};

// ===================== Commercial Deal Submission =====================

export const commercialSubmissions = pgTable("commercial_submissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 50 }).default("NEW").notNull(),
  submitterType: varchar("submitter_type", { length: 50 }).notNull(),
  brokerOrDeveloperName: varchar("broker_or_developer_name", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  roleOnDeal: varchar("role_on_deal", { length: 100 }).notNull(),
  loanType: varchar("loan_type", { length: 50 }).notNull(),
  requestedLoanAmount: real("requested_loan_amount").notNull(),
  requestedLTV: real("requested_ltv"),
  requestedLTC: real("requested_ltc"),
  interestOnly: boolean("interest_only").notNull(),
  desiredCloseDate: timestamp("desired_close_date").notNull(),
  exitStrategyType: varchar("exit_strategy_type", { length: 50 }),
  exitStrategyDetails: text("exit_strategy_details"),
  propertyName: varchar("property_name", { length: 255 }).notNull(),
  propertyAddress: text("property_address").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  zip: varchar("zip", { length: 10 }).notNull(),
  propertyType: varchar("property_type", { length: 50 }).notNull(),
  occupancyType: varchar("occupancy_type", { length: 50 }).notNull(),
  unitsOrSqft: real("units_or_sqft").notNull(),
  yearBuilt: integer("year_built"),
  purchasePrice: real("purchase_price"),
  asIsValue: real("as_is_value").notNull(),
  arvOrStabilizedValue: real("arv_or_stabilized_value"),
  currentNOI: real("current_noi"),
  inPlaceRent: real("in_place_rent"),
  proFormaNOI: real("pro_forma_noi"),
  capexBudgetTotal: real("capex_budget_total").notNull(),
  businessPlanSummary: text("business_plan_summary").notNull(),
  primarySponsorName: varchar("primary_sponsor_name", { length: 255 }).notNull(),
  primarySponsorExperienceYears: integer("primary_sponsor_experience_years").notNull(),
  numberOfSimilarProjects: integer("number_of_similar_projects").notNull(),
  netWorth: real("net_worth").notNull(),
  liquidity: real("liquidity").notNull(),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCommercialSubmissionSchema = createInsertSchema(commercialSubmissions).omit({ id: true, createdAt: true, updatedAt: true });
export type CommercialSubmission = typeof commercialSubmissions.$inferSelect;
export type InsertCommercialSubmission = z.infer<typeof insertCommercialSubmissionSchema>;

export const commercialSubmissionDocuments = pgTable("commercial_submission_documents", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").references(() => commercialSubmissions.id, { onDelete: 'cascade' }).notNull(),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  storageKey: text("storage_key").notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertCommercialSubmissionDocumentSchema = createInsertSchema(commercialSubmissionDocuments).omit({ id: true, uploadedAt: true });
export type CommercialSubmissionDocument = typeof commercialSubmissionDocuments.$inferSelect;
export type InsertCommercialSubmissionDocument = z.infer<typeof insertCommercialSubmissionDocumentSchema>;

import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  varchar,
  index,
  uniqueIndex,
  uuid,
  smallint,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  fullName: varchar("full_name", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  title: varchar("title", { length: 255 }),
  role: varchar("role", { length: 50 }).default("broker").notNull(), // super_admin, lender, processor, broker, borrower
  roles: text("roles").array(),
  userType: varchar("user_type", { length: 50 }).default("broker"), // DEPRECATED - use role instead
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  emailVerified: boolean("email_verified").default(false),
  isActive: boolean("is_active").default(true),
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetExpires: timestamp("password_reset_expires"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  partnershipAgreementSignedAt: timestamp("partnership_agreement_signed_at"),
  trainingCompletedAt: timestamp("training_completed_at"),
  lenderTrainingCompleted: boolean("lender_training_completed").default(false),
  isTestUser: boolean("is_test_user").default(false),
  googleId: varchar("google_id", { length: 255 }).unique(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at"),
  microsoftId: varchar("microsoft_id", { length: 255 }),
  microsoftRefreshToken: text("microsoft_refresh_token"),
  microsoftAccessToken: text("microsoft_access_token"),
  microsoftTokenExpiresAt: timestamp("microsoft_token_expires_at"),
  inviteToken: varchar("invite_token", { length: 255 }),
  inviteTokenExpires: timestamp("invite_token_expires"),
  invitedBy: integer("invited_by"),
  inviteStatus: varchar("invite_status", { length: 50 }).default("none"),
  inviteTokenSentAt: timestamp("invite_token_sent_at"),
  brokerSettings: jsonb("broker_settings"),
  brokerCompanyName: varchar("broker_company_name", { length: 255 }),
  brokerLicenseNumber: varchar("broker_license_number", { length: 100 }),
  brokerOperatingStates: text("broker_operating_states").array(),
  brokerYearsExperience: integer("broker_years_experience"),
  brokerPreferredLoanTypes: text("broker_preferred_loan_types").array(),
  emailConsent: boolean("email_consent").default(false),
  smsConsent: boolean("sms_consent").default(false),
  // Magic Links — lender-scoped shareable URLs for borrower/broker self-registration
  borrowerMagicLink: varchar("borrower_magic_link", { length: 255 }).unique(),
  borrowerMagicLinkEnabled: boolean("borrower_magic_link_enabled").default(
    false,
  ),
  brokerMagicLink: varchar("broker_magic_link", { length: 255 }).unique(),
  brokerMagicLinkEnabled: boolean("broker_magic_link_enabled").default(false),
  magicLinkToken: varchar("magic_link_token", { length: 255 }),
  magicLinkExpires: timestamp("magic_link_expires"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  accountLockedUntil: timestamp("account_locked_until"),
  passwordExpiresAt: timestamp("password_expires_at"),
  tokenVersion: integer("token_version").default(0).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
});
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// We'll store request logs
export const pricingRequests = pgTable("pricing_requests", {
  id: serial("id").primaryKey(),
  requestData: jsonb("request_data").notNull(),
  responseData: jsonb("response_data"),
  status: text("status").notNull(), // 'pending', 'success', 'error'
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
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
  experienceLevel: varchar("experience_level", { length: 50 }).default(
    "beginner",
  ), // beginner, intermediate, experienced
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partners).omit({
  id: true,
  createdAt: true,
});
export type Partner = typeof partners.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;

// Saved quotes table
export const savedQuotes = pgTable("saved_quotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  partnerId: integer("partner_id").references(() => partners.id, {
    onDelete: "set null",
  }),
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
  // YSP & split points tracking
  yspAmount: real("ysp_amount").default(0), // YSP % selected
  yspRateImpact: real("ysp_rate_impact").default(0), // Rate increase from YSP
  yspDollarAmount: real("ysp_dollar_amount").default(0), // Dollar value of YSP
  basePointsCharged: real("base_points_charged").default(0), // Lender's base points
  brokerPointsCharged: real("broker_points_charged").default(0), // Broker's additional points
  stage: varchar("stage", { length: 50 }).default("initial-review").notNull(),
  programId: integer("program_id").references(() => loanPrograms.id, {
    onDelete: "set null",
  }),
  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }),
  googleDriveFolderUrl: text("google_drive_folder_url"),
  driveSyncStatus: varchar("drive_sync_status", { length: 50 }).default(
    "NOT_ENABLED",
  ),
  driveSyncError: text("drive_sync_error"),
  loanNumber: text("loan_number").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedQuoteSchema = createInsertSchema(savedQuotes).omit({
  id: true,
  createdAt: true,
  googleDriveFolderId: true,
  googleDriveFolderUrl: true,
  driveSyncStatus: true,
  driveSyncError: true,
  loanNumber: true,
});
export type SavedQuote = typeof savedQuotes.$inferSelect;
export type InsertSavedQuote = z.infer<typeof insertSavedQuoteSchema>;

export const insertPricingRequestSchema = createInsertSchema(pricingRequests);
export type PricingRequest = typeof pricingRequests.$inferSelect;
export type InsertPricingRequest = z.infer<typeof insertPricingRequestSchema>;

// Form Data Schema matches the input fields from the user's code
export const loanPricingFormSchema = z.object({
  loanAmount: z.coerce.number().min(1, "Loan amount is required"),
  propertyValue: z.coerce.number().min(1, "Property value is required"),
  ltv: z.string().optional().default(""),
  loanType: z.string().min(1, "Loan Type is required"),
  interestOnly: z.string().default("No"),
  loanPurpose: z.string().min(1, "Loan Purpose is required"),
  propertyType: z.string().min(1, "Property Type is required"),
  grossMonthlyRent: z.coerce.number().optional().default(0),
  annualTaxes: z.coerce.number().optional().default(0),
  annualInsurance: z.coerce.number().optional().default(0),
  calculatedDscr: z.string().optional(),
  dscr: z.string().optional().default(""),
  ficoScore: z.string().min(1, "FICO Score is required"),
  prepaymentPenalty: z.string().optional().default("None"),
  tpoPremium: z.string().optional(),
  programId: z.coerce.number().optional(),
});

export const externalPricingFormSchema = z.object({
  programId: z.coerce.number(),
}).passthrough();

export type LoanPricingFormData = z.infer<typeof loanPricingFormSchema>;
export type ExternalPricingFormData = z.infer<typeof externalPricingFormSchema>;

export const pricingResponseSchema = z.object({
  success: z.boolean(),
  interestRate: z.number().nullable().optional(),
  loanData: z.record(z.any()).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  debug: z.record(z.any()).optional(),
  scraperPayload: z.object({
    url: z.string(),
    textInputs: z.array(z.object({ label: z.string(), value: z.string() })),
    dropdowns: z.array(z.object({ label: z.string(), value: z.string() })),
  }).optional(),
});

export type PricingResponse = z.infer<typeof pricingResponseSchema>;

// RTL (Fix and Flip / Ground Up Construction) Pricing Schema
export const rtlLoanTypeEnum = z.enum([
  "light_rehab",
  "heavy_rehab",
  "bridge_no_rehab",
  "guc",
]);
export const rtlPurposeEnum = z.enum(["purchase", "refi", "cash_out"]);
export const rtlPropertyTypeEnum = z.enum([
  "single-family-residence",
  "2-4-unit",
  "multifamily-5-plus",
  "rental-portfolio",
  "mixed-use",
  "infill-lot",
  "land",
  "office",
  "retail",
  "hospitality",
  "industrial",
  "medical",
  "agricultural",
  "special-purpose",
]);
export const rtlExperienceTierEnum = z.enum([
  "no_experience",
  "experienced",
  "institutional",
]);
export const rtlExitStrategyEnum = z.enum(["sell", "rent"]);
export const rtlEntityTypeEnum = z.enum([
  "llc",
  "llp",
  "lp",
  "corporation",
  "sole_prop",
  "revocable_trust",
  "natural_person",
  "irrevocable_trust",
  "cooperative",
  "community_land_trust",
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
  yspRateImpact: z.number().optional(),
  effectiveRate: z.number().optional(),
  caps: z
    .object({
      maxLTC: z.number().optional(),
      maxLTAIV: z.number().optional(),
      maxLTARV: z.number().nullable().optional(),
    })
    .optional(),
  appliedAdjusters: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        rateAdd: z.number(),
      }),
    )
    .optional(),
  disqualifiers: z
    .array(
      z.object({
        id: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  flags: z
    .array(
      z.object({
        id: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export type RTLPricingResponse = z.infer<typeof rtlPricingResponseSchema>;

// Document signing tables
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  quoteId: integer("quote_id").references(() => savedQuotes.id),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(), // Base64 encoded PDF
  pageCount: integer("page_count").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft, sent, in_progress, completed, voided, voided_edited
  vendor: text("vendor").default("local"), // local, pandadoc
  pandadocDocumentId: text("pandadoc_document_id"),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  voidedAt: timestamp("voided_at"),
  voidedReason: text("voided_reason"),
});

export const signers = pgTable("signers", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .references(() => documents.id)
    .notNull(),
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
  documentId: integer("document_id")
    .references(() => documents.id)
    .notNull(),
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
  documentId: integer("document_id")
    .references(() => documents.id)
    .notNull(),
  signerId: integer("signer_id").references(() => signers.id),
  action: text("action").notNull(), // created, sent, viewed, signed, completed
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export const insertSignerSchema = createInsertSchema(signers).omit({
  id: true,
  createdAt: true,
  signedAt: true,
});
export const insertDocumentFieldSchema = createInsertSchema(
  documentFields,
).omit({ id: true, createdAt: true });
export const insertDocumentAuditLogSchema = createInsertSchema(
  documentAuditLog,
).omit({ id: true, createdAt: true });

export const documentDownloadTokens = pgTable("document_download_tokens", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .references(() => documents.id, { onDelete: "cascade" })
    .notNull(),
  token: varchar("token", { length: 255 }).unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentDownloadTokenSchema = createInsertSchema(documentDownloadTokens).omit({
  id: true,
  createdAt: true,
});

// Types
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Signer = typeof signers.$inferSelect;
export type InsertSigner = z.infer<typeof insertSignerSchema>;
export type DocumentField = typeof documentFields.$inferSelect;
export type InsertDocumentField = z.infer<typeof insertDocumentFieldSchema>;
export type DocumentAuditLog = typeof documentAuditLog.$inferSelect;
export type InsertDocumentAuditLog = z.infer<
  typeof insertDocumentAuditLogSchema
>;
export type DocumentDownloadToken = typeof documentDownloadTokens.$inferSelect;
export type InsertDocumentDownloadToken = z.infer<typeof insertDocumentDownloadTokenSchema>;

// Projects table for loan closing progress tracking
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  agreementId: integer("agreement_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  quoteId: integer("quote_id").references(() => savedQuotes.id, {
    onDelete: "set null",
  }),

  projectName: varchar("project_name", { length: 255 }).notNull(),
  projectNumber: varchar("project_number", { length: 50 }).unique(),
  loanNumber: varchar("loan_number", { length: 10 }).unique(),

  loanAmount: real("loan_amount"),
  interestRate: real("interest_rate"),
  loanTermMonths: integer("loan_term_months"),
  loanType: varchar("loan_type", { length: 100 }),
  programId: integer("program_id").references(() => loanPrograms.id, {
    onDelete: "set null",
  }),
  propertyAddress: text("property_address"),
  propertyType: varchar("property_type", { length: 100 }),
  borrowerName: varchar("borrower_name", { length: 255 }),
  borrowerEmail: varchar("borrower_email", { length: 255 }),
  borrowerPhone: varchar("borrower_phone", { length: 50 }),

  status: varchar("status", { length: 50 }).default("active").notNull(), // active, on_hold, completed, cancelled, funded
  currentStage: varchar("current_stage", { length: 100 }).default(
    "documentation",
  ),
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

  borrowerPortalToken: varchar("borrower_portal_token", {
    length: 255,
  }).unique(),
  borrowerPortalEnabled: boolean("borrower_portal_enabled").default(true),
  borrowerPortalLastViewed: timestamp("borrower_portal_last_viewed"),

  brokerPortalToken: varchar("broker_portal_token", { length: 255 }).unique(),
  brokerPortalEnabled: boolean("broker_portal_enabled").default(true),

  ltv: real("ltv"),
  asIsValue: real("as_is_value"),
  propertyState: varchar("property_state", { length: 50 }),
  appraisalStatus: varchar("appraisal_status", { length: 50 }),
  ysp: real("ysp"),
  lenderOriginationPoints: real("lender_origination_points"),
  brokerOriginationPoints: real("broker_origination_points"),
  brokerName: varchar("broker_name", { length: 255 }),
  brokerEmail: varchar("broker_email", { length: 255 }),
  brokerPhone: varchar("broker_phone", { length: 50 }),
  brokerCompany: varchar("broker_company", { length: 255 }),
  prepaymentPenalty: varchar("prepayment_penalty", { length: 100 }),
  holdbackAmount: real("holdback_amount"),

  notes: text("notes"),
  internalNotes: text("internal_notes"),
  isArchived: boolean("is_archived").default(false),
  metadata: jsonb("metadata"),

  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }),
  googleDriveFolderUrl: text("google_drive_folder_url"),
  driveSyncStatus: varchar("drive_sync_status", { length: 50 }).default(
    "NOT_ENABLED",
  ),
  driveSyncError: text("drive_sync_error"),

  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),

  aiReviewMode: varchar("ai_review_mode", { length: 20 }).default("manual"),
  aiReviewIntervalMinutes: integer("ai_review_interval_minutes"),
  aiReviewScheduledTime: varchar("ai_review_scheduled_time", { length: 10 }),
  aiReviewScheduledDays: jsonb("ai_review_scheduled_days"),
  aiReviewTimezone: varchar("ai_review_timezone", { length: 50 }),
  aiCommunicationFrequencyMinutes: integer("ai_communication_frequency_minutes"),
  aiCommAutoSend: boolean("ai_comm_auto_send").default(false),
  aiCommSendDeadline: varchar("ai_comm_send_deadline", { length: 10 }),
});

// Project stages/milestones
export const projectStages = pgTable("project_stages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
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
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  stageId: integer("stage_id").references(() => projectStages.id, {
    onDelete: "cascade",
  }),
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
  documentId: integer("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  documentUrl: text("document_url"),

  visibleToBorrower: boolean("visible_to_borrower").default(true),
  borrowerActionRequired: boolean("borrower_action_required").default(false),

  formTemplateId: integer("form_template_id"),

  createdAt: timestamp("created_at").defaultNow(),
});

// Project activity log
export const projectActivity = pgTable("project_activity", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  activityType: varchar("activity_type", { length: 100 }).notNull(),
  activityDescription: text("activity_description").notNull(),

  oldValue: text("old_value"),
  newValue: text("new_value"),

  metadata: jsonb("metadata"),

  visibleToBorrower: boolean("visible_to_borrower").default(false),
  isInternal: boolean("is_internal").default(false), // Used to mark admin-only activity (replaces adminActivity)

  createdAt: timestamp("created_at").defaultNow(),
});

// Project documents
/** @deprecated Use dealDocuments instead */
export const projectDocuments = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  taskId: integer("task_id").references(() => projectTasks.id, {
    onDelete: "set null",
  }),

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
  driveUploadStatus: varchar("drive_upload_status", { length: 50 }).default(
    "NOT_ENABLED",
  ),
  driveUploadError: text("drive_upload_error"),
});

// Webhook/Integration log

// Insert schemas for projects
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});
export const insertProjectStageSchema = createInsertSchema(projectStages).omit({
  id: true,
});
export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
});
export const insertProjectActivitySchema = createInsertSchema(
  projectActivity,
).omit({ id: true, createdAt: true });
export const insertProjectDocumentSchema = createInsertSchema(
  projectDocuments,
).omit({ id: true, uploadedAt: true });

// Project types
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectStage = typeof projectStages.$inferSelect;
export type InsertProjectStage = z.infer<typeof insertProjectStageSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectActivity = typeof projectActivity.$inferSelect;
export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;
/** @deprecated Use DealDocument instead */
export type ProjectDocument = typeof projectDocuments.$inferSelect;
/** @deprecated Use InsertDealDocument instead */
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;

// Deal aliases (consistent nomenclature - table is still called 'projects' for backward compatibility)
export const deals = projects;
export const insertDealSchema = insertProjectSchema;
export type Deal = Project;
export type InsertDeal = InsertProject;

// Deal documents - required documents checklist per deal based on loan type
export const dealDocuments = pgTable("deal_documents", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  stageId: integer("stage_id").references(() => projectStages.id, {
    onDelete: "set null",
  }),
  programDocumentTemplateId: integer("program_document_template_id"),
  dealPropertyId: integer("deal_property_id").references(
    () => dealProperties.id,
    { onDelete: "set null" },
  ),

  documentName: varchar("document_name", { length: 255 }).notNull(),
  documentCategory: varchar("document_category", { length: 100 }), // borrower_docs, entity_docs, property_docs, financial_docs, closing_docs
  documentDescription: text("document_description"),

  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, uploaded, approved, rejected, not_applicable, waived
  isRequired: boolean("is_required").default(true),

  assignedTo: varchar("assigned_to", { length: 50 }).default("borrower"), // borrower, broker, admin
  visibility: varchar("visibility", { length: 50 }).default("all"), // borrower, broker, admin, all

  filePath: text("file_path"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),

  uploadedAt: timestamp("uploaded_at"),
  uploadedBy: integer("uploaded_by").references(() => users.id),

  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),

  // AI Review fields
  aiReviewStatus: varchar("ai_review_status", { length: 50 }).default(
    "not_reviewed",
  ), // pending, reviewing, approved, denied, not_reviewed
  aiReviewReason: text("ai_review_reason"),
  aiReviewedAt: timestamp("ai_reviewed_at"),
  aiReviewConfidence: real("ai_review_confidence"), // 0-1 confidence score

  sortOrder: integer("sort_order").default(0),

  googleDriveFileId: varchar("google_drive_file_id", { length: 255 }),
  googleDriveFileUrl: text("google_drive_file_url"),
  driveUploadStatus: varchar("drive_upload_status", { length: 50 }).default(
    "NOT_SYNCED",
  ),
  driveUploadError: text("drive_upload_error"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealDocumentSchema = createInsertSchema(dealDocuments).omit({
  id: true,
  createdAt: true,
  uploadedAt: true,
  reviewedAt: true,
  googleDriveFileId: true,
  googleDriveFileUrl: true,
  driveUploadStatus: true,
  driveUploadError: true,
});
export type DealDocument = typeof dealDocuments.$inferSelect;
export type InsertDealDocument = z.infer<typeof insertDealDocumentSchema>;

export const dealDocumentFiles = pgTable("deal_document_files", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .references(() => dealDocuments.id, { onDelete: "cascade" })
    .notNull(),
  filePath: text("file_path").notNull(),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  sortOrder: integer("sort_order").default(0),
  googleDriveFileId: varchar("google_drive_file_id", { length: 255 }),
  googleDriveFileUrl: text("google_drive_file_url"),
  driveUploadStatus: varchar("drive_upload_status", { length: 50 }).default(
    "NOT_SYNCED",
  ),
  driveUploadError: text("drive_upload_error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DealDocumentFile = typeof dealDocumentFiles.$inferSelect;

export const dealProperties = pgTable("deal_properties", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),
  propertyType: varchar("property_type", { length: 100 }),
  estimatedValue: real("estimated_value"),
  units: integer("units"),
  monthlyRent: real("monthly_rent"),
  annualTaxes: real("annual_taxes"),
  annualInsurance: real("annual_insurance"),
  isPrimary: boolean("is_primary").default(false),
  sortOrder: integer("sort_order").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealPropertySchema = createInsertSchema(dealProperties).omit(
  { id: true, createdAt: true },
);
export type DealProperty = typeof dealProperties.$inferSelect;
export type InsertDealProperty = z.infer<typeof insertDealPropertySchema>;

// Deal tasks - tasks assigned to team members for a deal
export const dealTasks = pgTable("deal_tasks", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),

  taskName: varchar("task_name", { length: 255 }).notNull(),
  taskDescription: text("task_description"),

  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed
  priority: varchar("priority", { length: 20 }).default("medium"), // low, medium, high, critical

  assignedTo: integer("assigned_to").references(() => users.id),
  dueDate: timestamp("due_date"),
  stageId: integer("stage_id"),

  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by").references(() => users.id),

  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealTaskSchema = createInsertSchema(dealTasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type DealTask = typeof dealTasks.$inferSelect;
export type InsertDealTask = z.infer<typeof insertDealTaskSchema>;

// System settings table for admin configuration
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull(),
  settingValue: text("setting_value").notNull(),
  settingDescription: text("setting_description"),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin tasks table - internal workflow steps
export const adminTasks = pgTable("admin_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),

  taskTitle: varchar("task_title", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  taskCategory: varchar("task_category", { length: 100 }), // document_processing, underwriting_review, approval_required, closing_coordination

  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed, blocked
  priority: varchar("priority", { length: 50 }).default("medium"), // low, medium, high, critical

  assignedTo: integer("assigned_to").references(() => users.id),
  dueDate: timestamp("due_date"),

  userMilestoneStageId: integer("user_milestone_stage_id").references(
    () => projectStages.id,
  ),
  userMilestoneTaskId: integer("user_milestone_task_id").references(
    () => projectTasks.id,
  ),

  autoUpdateUserTask: boolean("auto_update_user_task").default(true),

  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by").references(() => users.id),

  requiresDocument: boolean("requires_document").default(false),
  documentId: integer("document_id").references(() => projectDocuments.id),

  internalNotes: text("internal_notes"),

  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at").defaultNow(),
});

// Admin activity log - separate from user-facing activity
/** @deprecated Use projectActivity with isInternal=true instead */
export const adminActivity = pgTable("admin_activity", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  userId: integer("user_id").references(() => users.id),

  actionType: varchar("action_type", { length: 100 }).notNull(), // task_completed, document_added, stage_updated, note_added
  actionDescription: text("action_description").notNull(),

  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for admin tables
export const insertSystemSettingSchema = createInsertSchema(
  systemSettings,
).omit({ id: true, updatedAt: true });
export const insertAdminTaskSchema = createInsertSchema(adminTasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export const insertAdminActivitySchema = createInsertSchema(adminActivity).omit(
  { id: true, createdAt: true },
);

// Admin types
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type AdminTask = typeof adminTasks.$inferSelect;
export type InsertAdminTask = z.infer<typeof insertAdminTaskSchema>;
/** @deprecated Use ProjectActivity instead */
export type AdminActivity = typeof adminActivity.$inferSelect;
/** @deprecated Use InsertProjectActivity instead */
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

export const insertDealStageSchema = createInsertSchema(dealStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
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

  minDscr: real("min_dscr"),
  minFico: integer("min_fico"),

  minUnits: integer("min_units"),
  maxUnits: integer("max_units"),

  termOptions: text("term_options"), // comma-separated: "6, 12, 18, 24"
  eligiblePropertyTypes: text("eligible_property_types").array(), // ['single-family-residence', '2-4-unit', 'multifamily-5-plus', etc.]

  quoteFormFields: jsonb("quote_form_fields"), // JSON array of field configs for quote form

  pricingMode: varchar("pricing_mode", { length: 50 }).default("none"), // none, rule_based, external, manual
  externalPricingConfig: jsonb("external_pricing_config"), // { scraperUrl, textInputs, dropdowns }

  // YSP (Yield Spread Premium) Configuration
  yspEnabled: boolean("ysp_enabled").default(false),
  yspBrokerCanToggle: boolean("ysp_broker_can_toggle").default(false),
  yspFixedAmount: real("ysp_fixed_amount").default(0), // Fixed YSP % if broker can't toggle
  yspMin: real("ysp_min").default(0),
  yspMax: real("ysp_max").default(3),
  yspStep: real("ysp_step").default(0.125),

  // Points Configuration
  basePoints: real("base_points").default(1),
  basePointsMin: real("base_points_min").default(0.5),
  basePointsMax: real("base_points_max").default(3),
  brokerPointsEnabled: boolean("broker_points_enabled").default(true),
  brokerPointsMax: real("broker_points_max").default(2),
  brokerPointsStep: real("broker_points_step").default(0.125),

  isActive: boolean("is_active").default(true),
  isTemplate: boolean("is_template").default(false),
  sortOrder: integer("sort_order").default(0),

  reviewGuidelines: text("review_guidelines"),
  creditPolicyId: integer("credit_policy_id"),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLoanProgramSchema = createInsertSchema(loanPrograms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type LoanProgram = typeof loanPrograms.$inferSelect;
export type InsertLoanProgram = z.infer<typeof insertLoanProgramSchema>;

// Pricing Field Mapping Templates — save & reuse external pricing field configs
export const pricingFieldTemplates = pgTable("pricing_field_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  textInputs: jsonb("text_inputs"),
  dropdowns: jsonb("dropdowns"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PricingFieldTemplate = typeof pricingFieldTemplates.$inferSelect;

// Program Document Templates - documents required for each program
export const programDocumentTemplates = pgTable("program_document_templates", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .references(() => loanPrograms.id, { onDelete: "cascade" })
    .notNull(),
  stepId: integer("step_id"),

  documentName: varchar("document_name", { length: 255 }).notNull(),
  documentCategory: varchar("document_category", { length: 100 }).notNull(), // borrower_docs, entity_docs, property_docs, financial_docs, closing_docs
  documentDescription: text("document_description"),

  isRequired: boolean("is_required").default(true),
  assignedTo: varchar("assigned_to", { length: 50 }).default("borrower"), // borrower, broker, admin
  visibility: varchar("visibility", { length: 50 }).default("all"), // borrower, broker, admin, all
  sortOrder: integer("sort_order").default(0),

  templateUrl: varchar("template_url", { length: 500 }), // stores the URL/path to the uploaded template file
  templateFileName: varchar("template_file_name", { length: 255 }), // stores the original filename

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProgramDocumentTemplateSchema = createInsertSchema(
  programDocumentTemplates,
).omit({ id: true, createdAt: true });
export type ProgramDocumentTemplate =
  typeof programDocumentTemplates.$inferSelect;
export type InsertProgramDocumentTemplate = z.infer<
  typeof insertProgramDocumentTemplateSchema
>;

// Program Task Templates - tasks required for each program
export const programTaskTemplates = pgTable("program_task_templates", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .references(() => loanPrograms.id, { onDelete: "cascade" })
    .notNull(),
  stepId: integer("step_id"),

  taskName: varchar("task_name", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  taskCategory: varchar("task_category", { length: 100 }), // application_review, credit_check, appraisal, title_search, underwriting, closing

  assignToRole: varchar("assign_to_role", { length: 50 }).default("admin"), // user, admin, processor
  visibility: varchar("visibility", { length: 50 }).default("all"), // borrower, broker, admin, all

  priority: varchar("priority", { length: 20 }).default("medium"), // low, medium, high, critical
  sortOrder: integer("sort_order").default(0),

  formTemplateId: integer("form_template_id"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProgramTaskTemplateSchema = createInsertSchema(
  programTaskTemplates,
).omit({ id: true, createdAt: true });
export type ProgramTaskTemplate = typeof programTaskTemplates.$inferSelect;
export type InsertProgramTaskTemplate = z.infer<
  typeof insertProgramTaskTemplateSchema
>;

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

export const insertWorkflowStepDefinitionSchema = createInsertSchema(
  workflowStepDefinitions,
).omit({ id: true, createdAt: true });
export type WorkflowStepDefinition =
  typeof workflowStepDefinitions.$inferSelect;
export type InsertWorkflowStepDefinition = z.infer<
  typeof insertWorkflowStepDefinitionSchema
>;

// Program Workflow Steps - links step definitions to specific programs with ordering
export const programWorkflowSteps = pgTable("program_workflow_steps", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .references(() => loanPrograms.id, { onDelete: "cascade" })
    .notNull(),
  stepDefinitionId: integer("step_definition_id")
    .references(() => workflowStepDefinitions.id, { onDelete: "cascade" })
    .notNull(),
  stepOrder: integer("step_order").notNull(),
  isRequired: boolean("is_required").default(true),
  estimatedDays: integer("estimated_days"),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProgramWorkflowStepSchema = createInsertSchema(
  programWorkflowSteps,
).omit({ id: true, createdAt: true });
export type ProgramWorkflowStep = typeof programWorkflowSteps.$inferSelect;
export type InsertProgramWorkflowStep = z.infer<
  typeof insertProgramWorkflowStepSchema
>;

// Deal Statuses - configurable deal status options
export const dealStatuses = pgTable("deal_statuses", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).unique().notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  color: varchar("color", { length: 50 }).default("#6b7280"),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealStatusSchema = createInsertSchema(dealStatuses).omit({
  id: true,
  createdAt: true,
});
export type DealStatus = typeof dealStatuses.$inferSelect;
export type InsertDealStatus = z.infer<typeof insertDealStatusSchema>;

// Deal Processors - assigns processors to deals/projects
export const dealProcessors = pgTable("deal_processors", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: varchar("role", { length: 100 }).default("processor"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: integer("assigned_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const insertDealProcessorSchema = createInsertSchema(
  dealProcessors,
).omit({ id: true, assignedAt: true });
export type DealProcessor = typeof dealProcessors.$inferSelect;
export type InsertDealProcessor = z.infer<typeof insertDealProcessorSchema>;

// Pricing Rulesets - versioned pricing rules per loan program
export const pricingRulesets = pgTable("pricing_rulesets", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .references(() => loanPrograms.id, { onDelete: "cascade" })
    .notNull(),

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

export const insertPricingRulesetSchema = createInsertSchema(
  pricingRulesets,
).omit({ id: true, createdAt: true, activatedAt: true, archivedAt: true });
export type PricingRuleset = typeof pricingRulesets.$inferSelect;
export type InsertPricingRuleset = z.infer<typeof insertPricingRulesetSchema>;

// Rule Proposals - AI-generated rule suggestions pending review
export const ruleProposals = pgTable("rule_proposals", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .references(() => loanPrograms.id, { onDelete: "cascade" })
    .notNull(),

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

export const insertRuleProposalSchema = createInsertSchema(ruleProposals).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});
export type RuleProposal = typeof ruleProposals.$inferSelect;
export type InsertRuleProposal = z.infer<typeof insertRuleProposalSchema>;

// Guideline Uploads - PDF/text files uploaded for rule extraction
export const guidelineUploads = pgTable("guideline_uploads", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .references(() => loanPrograms.id, { onDelete: "cascade" })
    .notNull(),

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

export const insertGuidelineUploadSchema = createInsertSchema(
  guidelineUploads,
).omit({ id: true, createdAt: true, processedAt: true });
export type GuidelineUpload = typeof guidelineUploads.$inferSelect;
export type InsertGuidelineUpload = z.infer<typeof insertGuidelineUploadSchema>;

// Pricing Quote Logs - audit trail for deterministic pricing calculations
export const pricingQuoteLogs = pgTable("pricing_quote_logs", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, {
    onDelete: "set null",
  }),
  rulesetId: integer("ruleset_id").references(() => pricingRulesets.id, {
    onDelete: "set null",
  }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  inputsJson: jsonb("inputs_json").notNull(), // The loan scenario inputs
  outputsJson: jsonb("outputs_json").notNull(), // The calculated pricing result

  eligible: boolean("eligible").notNull(),
  finalRate: real("final_rate"),
  points: real("points"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPricingQuoteLogSchema = createInsertSchema(
  pricingQuoteLogs,
).omit({ id: true, createdAt: true });
export type PricingQuoteLog = typeof pricingQuoteLogs.$inferSelect;
export type InsertPricingQuoteLog = z.infer<typeof insertPricingQuoteLogSchema>;

// Zod schemas for ruleset structure validation
export const ruleConditionSchema = z
  .object({
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
  })
  .passthrough();

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
  dealId: integer("deal_id").notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  subject: varchar("subject", { length: 255 }),
  isClosed: boolean("is_closed").default(false).notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageThreadSchema = createInsertSchema(
  messageThreads,
).omit({ id: true, createdAt: true, lastMessageAt: true });
export type MessageThread = typeof messageThreads.$inferSelect;
export type InsertMessageThread = z.infer<typeof insertMessageThreadSchema>;

// Messages - individual messages within a thread
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .references(() => messageThreads.id, { onDelete: "cascade" })
    .notNull(),
  senderId: integer("sender_id").references(() => users.id, {
    onDelete: "set null",
  }),
  senderRole: varchar("sender_role", { length: 20 }).notNull(), // 'admin', 'user', 'system'
  type: varchar("type", { length: 20 }).notNull(), // 'message', 'notification'
  body: text("body").notNull(),
  meta: jsonb("meta"), // Additional data like deal stage changes
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Message read receipts - tracks when users last read a thread
export const messageReads = pgTable("message_reads", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .references(() => messageThreads.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
});

export const insertMessageReadSchema = createInsertSchema(messageReads).omit({
  id: true,
});
export type MessageRead = typeof messageReads.$inferSelect;
export type InsertMessageRead = z.infer<typeof insertMessageReadSchema>;

export const messageThreadParticipants = pgTable("message_thread_participants", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .references(() => messageThreads.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("mtp_thread_user_unique").on(table.threadId, table.userId),
]);

export const insertMessageThreadParticipantSchema = createInsertSchema(messageThreadParticipants).omit({
  id: true,
  joinedAt: true,
});
export type MessageThreadParticipant = typeof messageThreadParticipants.$inferSelect;
export type InsertMessageThreadParticipant = z.infer<typeof insertMessageThreadParticipantSchema>;

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
  targetUserType: varchar("target_user_type", { length: 50 })
    .default("broker")
    .notNull(), // 'broker', 'borrower', 'all'
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOnboardingDocumentSchema = createInsertSchema(
  onboardingDocuments,
).omit({ id: true, createdAt: true, updatedAt: true });
export type OnboardingDocument = typeof onboardingDocuments.$inferSelect;
export type InsertOnboardingDocument = z.infer<
  typeof insertOnboardingDocumentSchema
>;

// User onboarding progress - tracks which documents each user has viewed/signed
export const userOnboardingProgress = pgTable("user_onboarding_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  documentId: integer("document_id")
    .references(() => onboardingDocuments.id, { onDelete: "cascade" })
    .notNull(),
  status: varchar("status", { length: 50 }).notNull(), // 'viewed', 'completed', 'signed', 'skipped'
  signatureData: text("signature_data"), // For signed documents (base64 or URL)
  signedAt: timestamp("signed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserOnboardingProgressSchema = createInsertSchema(
  userOnboardingProgress,
).omit({ id: true, createdAt: true });
export type UserOnboardingProgress = typeof userOnboardingProgress.$inferSelect;
export type InsertUserOnboardingProgress = z.infer<
  typeof insertUserOnboardingProgressSchema
>;

// ==================== LOAN DIGEST NOTIFICATION SYSTEM ====================

// Frequency options for digest delivery
export const digestFrequencyEnum = z.enum([
  "daily",
  "every_3_days",
  "weekly",
  "custom",
]);
export type DigestFrequency = z.infer<typeof digestFrequencyEnum>;

// Delivery method options
export const deliveryMethodEnum = z.enum(["email", "sms", "both"]);
export type DeliveryMethod = z.infer<typeof deliveryMethodEnum>;

// Content type options for digest
export const digestContentTypeEnum = z.enum([
  "documents_needed",
  "notes",
  "messages",
  "general_updates",
]);
export type DigestContentType = z.infer<typeof digestContentTypeEnum>;

// Loan digest configuration - per-project/deal digest settings
export const loanDigestConfigs = pgTable("loan_digest_configs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  dealId: integer("deal_id"),

  // WHEN - frequency and timing
  frequency: varchar("frequency", { length: 50 }).default("daily").notNull(), // daily, every_3_days, weekly, custom
  customDays: integer("custom_days"), // For custom frequency, number of days between digests
  timeOfDay: varchar("time_of_day", { length: 10 }).default("09:00").notNull(), // 24-hour format HH:MM
  timezone: varchar("timezone", { length: 100 })
    .default("America/New_York")
    .notNull(),

  // WHAT - content included in digest
  includeDocumentsNeeded: boolean("include_documents_needed")
    .default(true)
    .notNull(), // THE MOST IMPORTANT
  includeNotes: boolean("include_notes").default(false).notNull(),
  includeMessages: boolean("include_messages").default(false).notNull(),
  includeGeneralUpdates: boolean("include_general_updates")
    .default(true)
    .notNull(),

  // MESSAGE - customizable email/sms content
  emailSubject: varchar("email_subject", { length: 255 }).default(
    "Loan Update: Action Required",
  ),
  emailBody: text("email_body").default(
    "Hello {{recipientName}},\n\nHere's an update on your loan for {{propertyAddress}}.\n\n{{documentsSection}}\n\n{{updatesSection}}\n\nPlease log in to your portal to take any necessary actions.\n\nBest regards,\nLendry.AI",
  ),
  smsBody: text("sms_body").default(
    "Lendry.AI: {{documentsCount}} docs needed for your loan. Log in to your portal for details.",
  ),

  // COMMUNICATION CHANNELS - which channels are enabled for communications on this deal
  communicationChannels: jsonb("communication_channels")
    .default({ email: true, sms: false, inApp: true })
    .notNull(),

  isEnabled: boolean("is_enabled").default(true).notNull(),

  // Whether digest drafts require human approval before sending (overrides lender-level config)
  requireApproval: boolean("require_approval").default(true).notNull(),

  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLoanDigestConfigSchema = createInsertSchema(
  loanDigestConfigs,
).omit({ id: true, createdAt: true, updatedAt: true });
export type LoanDigestConfig = typeof loanDigestConfigs.$inferSelect;
export type InsertLoanDigestConfig = z.infer<
  typeof insertLoanDigestConfigSchema
>;

// Loan digest recipients - WHO receives the digest for each config
export const loanDigestRecipients = pgTable("loan_digest_recipients", {
  id: serial("id").primaryKey(),
  configId: integer("config_id")
    .references(() => loanDigestConfigs.id, { onDelete: "cascade" })
    .notNull(),

  // Can be linked to a user or manual contact info
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),

  // Manual recipient info (if not linked to a user)
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  recipientPhone: varchar("recipient_phone", { length: 50 }),

  // HOW - delivery method for this recipient
  deliveryMethod: varchar("delivery_method", { length: 20 })
    .default("email")
    .notNull(), // email, sms, both

  isActive: boolean("is_active").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLoanDigestRecipientSchema = createInsertSchema(
  loanDigestRecipients,
).omit({ id: true, createdAt: true });
export type LoanDigestRecipient = typeof loanDigestRecipients.$inferSelect;
export type InsertLoanDigestRecipient = z.infer<
  typeof insertLoanDigestRecipientSchema
>;

// Loan updates - event ledger for building digest content
// Whenever admin actions happen, a row is added here so the digest can pick it up
export const loanUpdates = pgTable("loan_updates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),

  // Type of update
  updateType: varchar("update_type", { length: 50 }).notNull(), // doc_request, stage_change, note_added, task_assigned, task_completed, message, status_change

  // Human-readable summary for the digest
  summary: text("summary").notNull(),

  // Additional metadata
  meta: jsonb("meta"),

  // Who performed this action (null for system actions)
  performedBy: integer("performed_by").references(() => users.id, {
    onDelete: "set null",
  }),

  // Whether this update was included in a digest
  includedInDigestAt: timestamp("included_in_digest_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLoanUpdateSchema = createInsertSchema(loanUpdates).omit({
  id: true,
  createdAt: true,
  includedInDigestAt: true,
});
export type LoanUpdate = typeof loanUpdates.$inferSelect;
export type InsertLoanUpdate = z.infer<typeof insertLoanUpdateSchema>;

// Digest history - tracks when digests were sent (for audit and preventing duplicates)
export const digestHistory = pgTable("digest_history", {
  id: serial("id").primaryKey(),
  configId: integer("config_id")
    .references(() => loanDigestConfigs.id, { onDelete: "cascade" })
    .notNull(),
  recipientId: integer("recipient_id")
    .references(() => loanDigestRecipients.id, { onDelete: "cascade" })
    .notNull(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),

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

export const insertDigestHistorySchema = createInsertSchema(digestHistory).omit(
  { id: true, sentAt: true },
);
export type DigestHistory = typeof digestHistory.$inferSelect;
export type InsertDigestHistory = z.infer<typeof insertDigestHistorySchema>;

// Digest state - tracks the last digest sent per project/recipient to avoid duplicates
export const digestState = pgTable("digest_state", {
  id: serial("id").primaryKey(),
  configId: integer("config_id")
    .references(() => loanDigestConfigs.id, { onDelete: "cascade" })
    .notNull(),
  recipientId: integer("recipient_id")
    .references(() => loanDigestRecipients.id, { onDelete: "cascade" })
    .notNull(),

  lastDigestSentAt: timestamp("last_digest_sent_at").notNull(),
  nextDigestDueAt: timestamp("next_digest_due_at").notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDigestStateSchema = createInsertSchema(digestState).omit({
  id: true,
  updatedAt: true,
});
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
  templateType: varchar("template_type", { length: 50 })
    .default("custom")
    .notNull(),

  // Is this the default template?
  isDefault: boolean("is_default").default(false).notNull(),

  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDigestTemplateSchema = createInsertSchema(
  digestTemplates,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DigestTemplate = typeof digestTemplates.$inferSelect;
export type InsertDigestTemplate = z.infer<typeof insertDigestTemplateSchema>;

// Scheduled digest drafts - pre-generated digests that need approval before sending
export const scheduledDigestDrafts = pgTable("scheduled_digest_drafts", {
  id: serial("id").primaryKey(),
  configId: integer("config_id")
    .references(() => loanDigestConfigs.id, { onDelete: "cascade" })
    .notNull(),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }), // Nullable for deal-only digests

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
  recipients: jsonb("recipients").default("[]"),

  // Status: draft, approved, sent, skipped, superseded
  status: varchar("status", { length: 50 }).default("draft").notNull(),

  // Source: 'digest' for regular scheduled digests, 'ai_communication' for AI-generated
  source: varchar("source", { length: 50 }).default("digest").notNull(),
  sourceCommId: integer("source_comm_id"),

  // Approval tracking
  approvedBy: integer("approved_by").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at"),

  // Sent tracking
  sentAt: timestamp("sent_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScheduledDigestDraftSchema = createInsertSchema(
  scheduledDigestDrafts,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  sentAt: true,
});
export type ScheduledDigestDraft = typeof scheduledDigestDrafts.$inferSelect;
export type InsertScheduledDigestDraft = z.infer<
  typeof insertScheduledDigestDraftSchema
>;

// ==================== PARTNER BROADCASTS ====================

// Partner broadcasts - stores mass communications sent to all partners
export const partnerBroadcasts = pgTable("partner_broadcasts", {
  id: serial("id").primaryKey(),
  sentBy: integer("sent_by").references(() => users.id, {
    onDelete: "set null",
  }),
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

export const insertPartnerBroadcastSchema = createInsertSchema(
  partnerBroadcasts,
).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  emailsSent: true,
  smsSent: true,
  emailsFailed: true,
  smsFailed: true,
  recipientCount: true,
  status: true,
});
export type PartnerBroadcast = typeof partnerBroadcasts.$inferSelect;
export type InsertPartnerBroadcast = z.infer<
  typeof insertPartnerBroadcastSchema
>;

// Partner broadcast recipients - individual delivery tracking
export const partnerBroadcastRecipients = pgTable(
  "partner_broadcast_recipients",
  {
    id: serial("id").primaryKey(),
    broadcastId: integer("broadcast_id")
      .references(() => partnerBroadcasts.id, { onDelete: "cascade" })
      .notNull(),
    partnerId: integer("partner_id").references(() => partners.id, {
      onDelete: "set null",
    }),
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
  },
);

export const insertPartnerBroadcastRecipientSchema = createInsertSchema(
  partnerBroadcastRecipients,
).omit({
  id: true,
  createdAt: true,
});
export type PartnerBroadcastRecipient =
  typeof partnerBroadcastRecipients.$inferSelect;
export type InsertPartnerBroadcastRecipient = z.infer<
  typeof insertPartnerBroadcastRecipientSchema
>;

// Inbound SMS messages - stores replies from partners
export const inboundSmsMessages = pgTable("inbound_sms_messages", {
  id: serial("id").primaryKey(),
  fromPhone: varchar("from_phone", { length: 50 }).notNull(),
  toPhone: varchar("to_phone", { length: 50 }).notNull(),
  body: text("body").notNull(),
  twilioMessageSid: varchar("twilio_message_sid", { length: 255 }),
  partnerId: integer("partner_id").references(() => partners.id, {
    onDelete: "set null",
  }),
  broadcastId: integer("broadcast_id").references(() => partnerBroadcasts.id, {
    onDelete: "set null",
  }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInboundSmsMessageSchema = createInsertSchema(
  inboundSmsMessages,
).omit({
  id: true,
  createdAt: true,
});
export type InboundSmsMessage = typeof inboundSmsMessages.$inferSelect;
export type InsertInboundSmsMessage = z.infer<
  typeof insertInboundSmsMessageSchema
>;

// ==================== DOCUMENT TEMPLATES ====================

// Field types for PDF templates
export const templateFieldTypeEnum = z.enum([
  "text",
  "number",
  "date",
  "checkbox",
  "signature",
]);
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
  pageDimensions: jsonb("page_dimensions").default("[]"),
  pageCount: integer("page_count").default(1).notNull(),

  // Template categorization
  category: varchar("category", { length: 100 }), // e.g., "agreement", "disclosure", "contract"
  loanType: varchar("loan_type", { length: 50 }), // optional: ties to specific loan type

  // Status
  isActive: boolean("is_active").default(true).notNull(),

  // Optional: Link to external e-sign provider template
  pandadocTemplateId: varchar("pandadoc_template_id", { length: 255 }), // PandaDoc template UUID for direct sending

  // Audit
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDocumentTemplateSchema = createInsertSchema(
  documentTemplates,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<
  typeof insertDocumentTemplateSchema
>;

// Template fields - stores field positions and data bindings for each template
export const templateFields = pgTable("template_fields", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .references(() => documentTemplates.id, { onDelete: "cascade" })
    .notNull(),

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

export const insertTemplateFieldSchema = createInsertSchema(
  templateFields,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TemplateField = typeof templateFields.$inferSelect;
export type InsertTemplateField = z.infer<typeof insertTemplateFieldSchema>;

// E-Sign Envelopes - tracks documents sent via external e-sign providers (PandaDoc, DocuSign, etc.)
export const esignEnvelopes = pgTable("esign_envelopes", {
  id: serial("id").primaryKey(),
  vendor: varchar("vendor", { length: 50 }).notNull(), // "pandadoc", "docusign", etc.
  quoteId: integer("quote_id").references(() => savedQuotes.id, {
    onDelete: "set null",
  }),
  templateId: integer("template_id").references(() => documentTemplates.id, {
    onDelete: "set null",
  }),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),

  // External document reference
  externalDocumentId: varchar("external_document_id", {
    length: 255,
  }).notNull(),
  externalTemplateId: varchar("external_template_id", { length: 255 }), // PandaDoc template ID used

  // Document details
  documentName: varchar("document_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("draft"), // draft, sent, viewed, completed, declined, voided

  // Signing URLs
  signingUrl: text("signing_url"), // For embedded signing
  signedPdfUrl: text("signed_pdf_url"), // URL to download signed PDF

  // Recipients (stored as JSON array)
  recipients: jsonb("recipients").default("[]"), // [{name, email, role, status, signedAt}]

  // Metadata
  sendMethod: varchar("send_method", { length: 20 }).default("email"), // email, embedded
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  completedAt: timestamp("completed_at"),

  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEsignEnvelopeSchema = createInsertSchema(
  esignEnvelopes,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EsignEnvelope = typeof esignEnvelopes.$inferSelect;
export type InsertEsignEnvelope = z.infer<typeof insertEsignEnvelopeSchema>;

// E-Sign Events - webhook events and status changes for tracking
export const esignEvents = pgTable("esign_events", {
  id: serial("id").primaryKey(),
  vendor: varchar("vendor", { length: 50 }).notNull(),
  envelopeId: integer("envelope_id").references(() => esignEnvelopes.id, {
    onDelete: "cascade",
  }),
  externalDocumentId: varchar("external_document_id", {
    length: 255,
  }).notNull(),

  eventType: varchar("event_type", { length: 100 }).notNull(),
  eventData: jsonb("event_data").default("{}"),
  processed: boolean("processed").default(false),
  error: text("error"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEsignEventSchema = createInsertSchema(esignEvents).omit({
  id: true,
  createdAt: true,
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

export type FieldBindingKey = (typeof fieldBindingKeys)[number];

// Team Permissions - role-based permission configuration
export const teamPermissions = pgTable("team_permissions", {
  id: serial("id").primaryKey(),
  role: varchar("role", { length: 50 }).notNull(), // processor, admin
  permissionKey: varchar("permission_key", { length: 100 }).notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  scope: varchar("scope", { length: 50 }).default("all"), // all, assigned_only
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const insertTeamPermissionSchema = createInsertSchema(
  teamPermissions,
).omit({
  id: true,
  updatedAt: true,
});
export type TeamPermission = typeof teamPermissions.$inferSelect;
export type InsertTeamPermission = z.infer<typeof insertTeamPermissionSchema>;

// All available permission keys for the team permission system
export const TEAM_ROLES = [
  "processor",
  "lender",
  "staff",
  "admin",
  "super_admin",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const ROLE_HIERARCHY: Record<string, number> = {
  borrower: 0,
  broker: 1,
  processor: 2,
  lender: 3,
  super_admin: 4,
  user: 0,
  staff: 2,
  admin: 3,
};

export function getPrimaryRole(roles: string[]): string {
  let highest = "borrower";
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
  "agents.view",
  "agents.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const SCOPABLE_PERMISSIONS: PermissionKey[] = [
  "quotes.view",
  "agreements.view",
  "projects.view",
  "pipeline.view",
];

// Permission display metadata
export const PERMISSION_CATEGORIES: Record<
  string,
  { label: string; permissions: { key: PermissionKey; label: string }[] }
> = {
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
    label: "Processes",
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
  agents: {
    label: "AI Agents",
    permissions: [
      { key: "agents.view", label: "View agent results" },
      { key: "agents.manage", label: "Manage agent configurations" },
    ],
  },
};

// ===================== Commercial Deal Submission =====================

export const commercialSubmissions = pgTable("commercial_submissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  status: varchar("status", { length: 50 }).default("NEW").notNull(),
  submitterType: varchar("submitter_type", { length: 50 }).notNull(),
  brokerOrDeveloperName: varchar("broker_or_developer_name", {
    length: 255,
  }).notNull(),
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
  primarySponsorName: varchar("primary_sponsor_name", {
    length: 255,
  }).notNull(),
  primarySponsorExperienceYears: integer(
    "primary_sponsor_experience_years",
  ).notNull(),
  numberOfSimilarProjects: integer("number_of_similar_projects").notNull(),
  netWorth: real("net_worth").notNull(),
  liquidity: real("liquidity").notNull(),
  adminNotes: text("admin_notes"),

  county: varchar("county", { length: 100 }),
  squareFootage: real("square_footage"),
  currentOccupancy: real("current_occupancy"),
  loanPurpose: varchar("loan_purpose", { length: 100 }),
  requestedLoanTerm: integer("requested_loan_term"),
  closingTimeline: varchar("closing_timeline", { length: 50 }),

  currentAnnualDebtService: real("current_annual_debt_service"),
  marketRentPsf: real("market_rent_psf"),
  propertyTaxesAnnual: real("property_taxes_annual"),
  insuranceAnnual: real("insurance_annual"),
  ltvCalculated: real("ltv_calculated"),
  dscrCalculated: real("dscr_calculated"),

  totalProjectCost: real("total_project_cost"),
  landAcquisitionCost: real("land_acquisition_cost"),
  hardCosts: real("hard_costs"),
  softCosts: real("soft_costs"),
  contingency: real("contingency"),
  contingencyPercent: real("contingency_percent"),
  projectTimeline: integer("project_timeline"),
  constructionStartDate: timestamp("construction_start_date"),
  stabilizationDate: timestamp("stabilization_date"),
  generalContractor: varchar("general_contractor", { length: 255 }),
  gcLicensedBonded: boolean("gc_licensed_bonded"),

  entityName: varchar("entity_name", { length: 255 }),
  entityType: varchar("entity_type", { length: 50 }),
  entityDateEstablished: timestamp("entity_date_established"),
  ownershipStructure: varchar("ownership_structure", { length: 100 }),
  sponsorCreditScore: varchar("sponsor_credit_score", { length: 20 }),
  personalLiquidity: real("personal_liquidity"),
  personalNetWorth: real("personal_net_worth"),

  totalUnitsSfOwned: varchar("total_units_sf_owned", { length: 255 }),
  currentPortfolioValue: real("current_portfolio_value"),
  similarDealsLast3Years: integer("similar_deals_last_3_years"),
  everDefaulted: boolean("ever_defaulted").default(false),
  defaultExplanation: text("default_explanation"),
  currentLitigation: boolean("current_litigation").default(false),
  litigationExplanation: text("litigation_explanation"),
  bankruptcyLast7Years: boolean("bankruptcy_last_7_years").default(false),
  bankruptcyExplanation: text("bankruptcy_explanation"),

  propertyCondition: varchar("property_condition", { length: 50 }),
  deferredMaintenanceEstimate: real("deferred_maintenance_estimate"),
  deferredMaintenancePercent: real("deferred_maintenance_percent"),
  environmentalIssues: boolean("environmental_issues").default(false),
  environmentalDescription: text("environmental_description"),
  zoning: varchar("zoning", { length: 100 }),
  zoningCompliant: boolean("zoning_compliant"),

  numberOfUnits: integer("number_of_units"),
  unitMixStudios: integer("unit_mix_studios"),
  unitMix1br: integer("unit_mix_1br"),
  unitMix2br: integer("unit_mix_2br"),
  unitMix3br: integer("unit_mix_3br"),
  averageRent: real("average_rent"),
  marketRent: real("market_rent"),

  numberOfTenants: integer("number_of_tenants"),
  largestTenant: varchar("largest_tenant", { length: 255 }),
  largestTenantPercent: real("largest_tenant_percent"),
  averageLeaseTermRemaining: real("average_lease_term_remaining"),
  tenantCreditQuality: varchar("tenant_credit_quality", { length: 50 }),

  currentLender: varchar("current_lender", { length: 255 }),
  currentLoanBalance: real("current_loan_balance"),
  currentInterestRate: real("current_interest_rate"),
  loanMaturityDate: timestamp("loan_maturity_date"),
  prepaymentPenalty: real("prepayment_penalty"),

  additionalNotes: text("additional_notes"),

  aiDecision: varchar("ai_decision", { length: 50 }),
  aiDecisionReason: text("ai_decision_reason"),
  reviewedAt: timestamp("reviewed_at"),
  submittedAt: timestamp("submitted_at"),
  assignedTo: integer("assigned_to").references(() => users.id),

  expiresAt: timestamp("expires_at"),

  driveFolderId: varchar("drive_folder_id", { length: 255 }),
  driveFolderUrl: text("drive_folder_url"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCommercialSubmissionSchema = createInsertSchema(
  commercialSubmissions,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  reviewedAt: true,
});
export type CommercialSubmission = typeof commercialSubmissions.$inferSelect;
export type InsertCommercialSubmission = z.infer<
  typeof insertCommercialSubmissionSchema
>;

export const commercialSubmissionDocuments = pgTable(
  "commercial_submission_documents",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id")
      .references(() => commercialSubmissions.id, { onDelete: "cascade" })
      .notNull(),
    docType: varchar("doc_type", { length: 50 }).notNull(),
    storageKey: text("storage_key").notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    uploadedAt: timestamp("uploaded_at").defaultNow(),
  },
);

export const insertCommercialSubmissionDocumentSchema = createInsertSchema(
  commercialSubmissionDocuments,
).omit({ id: true, uploadedAt: true });
export type CommercialSubmissionDocument =
  typeof commercialSubmissionDocuments.$inferSelect;
export type InsertCommercialSubmissionDocument = z.infer<
  typeof insertCommercialSubmissionDocumentSchema
>;

export const submissionCriteria = pgTable("submission_criteria", {
  id: serial("id").primaryKey(),
  criteriaType: varchar("criteria_type", { length: 100 }).notNull(),
  criteriaValue: text("criteria_value").notNull(),
  criteriaLabel: varchar("criteria_label", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSubmissionCriteriaSchema = createInsertSchema(
  submissionCriteria,
).omit({ id: true, createdAt: true });
export type SubmissionCriteria = typeof submissionCriteria.$inferSelect;
export type InsertSubmissionCriteria = z.infer<
  typeof insertSubmissionCriteriaSchema
>;

export const submissionSponsors = pgTable("submission_sponsors", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .references(() => commercialSubmissions.id, { onDelete: "cascade" })
    .notNull(),
  sponsorName: varchar("sponsor_name", { length: 255 }).notNull(),
  ownershipPercent: real("ownership_percent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionSponsorSchema = createInsertSchema(
  submissionSponsors,
).omit({ id: true, createdAt: true });
export type SubmissionSponsor = typeof submissionSponsors.$inferSelect;
export type InsertSubmissionSponsor = z.infer<
  typeof insertSubmissionSponsorSchema
>;

export const submissionFields = pgTable("submission_fields", {
  id: serial("id").primaryKey(),
  fieldLabel: varchar("field_label", { length: 255 }).notNull(),
  fieldType: varchar("field_type", { length: 50 }).notNull(),
  fieldOptions: text("field_options"),
  isRequired: boolean("is_required").default(false).notNull(),
  appliesToDealTypes: text("applies_to_deal_types").default("all").notNull(),
  fieldOrder: integer("field_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionFieldSchema = createInsertSchema(
  submissionFields,
).omit({ id: true, createdAt: true });
export type SubmissionField = typeof submissionFields.$inferSelect;
export type InsertSubmissionField = z.infer<typeof insertSubmissionFieldSchema>;

export const submissionFieldResponses = pgTable("submission_field_responses", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .references(() => commercialSubmissions.id, { onDelete: "cascade" })
    .notNull(),
  fieldId: integer("field_id")
    .references(() => submissionFields.id, { onDelete: "cascade" })
    .notNull(),
  responseValue: text("response_value"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionFieldResponseSchema = createInsertSchema(
  submissionFieldResponses,
).omit({ id: true, createdAt: true });
export type SubmissionFieldResponse =
  typeof submissionFieldResponses.$inferSelect;
export type InsertSubmissionFieldResponse = z.infer<
  typeof insertSubmissionFieldResponseSchema
>;

export const submissionDocumentRequirements = pgTable(
  "submission_document_requirements",
  {
    id: serial("id").primaryKey(),
    documentName: varchar("document_name", { length: 255 }).notNull(),
    documentCategory: varchar("document_category", { length: 100 }),
    dealType: varchar("deal_type", { length: 50 }).default("all").notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
);

export const insertSubmissionDocumentRequirementSchema = createInsertSchema(
  submissionDocumentRequirements,
).omit({ id: true, createdAt: true });
export type SubmissionDocumentRequirement =
  typeof submissionDocumentRequirements.$inferSelect;
export type InsertSubmissionDocumentRequirement = z.infer<
  typeof insertSubmissionDocumentRequirementSchema
>;

export const submissionReviewRules = pgTable("submission_review_rules", {
  id: serial("id").primaryKey(),
  ruleCategory: varchar("rule_category", { length: 50 }).notNull(),
  ruleDescription: text("rule_description").notNull(),
  rulePriority: integer("rule_priority").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionReviewRuleSchema = createInsertSchema(
  submissionReviewRules,
).omit({ id: true, createdAt: true });
export type SubmissionReviewRule = typeof submissionReviewRules.$inferSelect;
export type InsertSubmissionReviewRule = z.infer<
  typeof insertSubmissionReviewRuleSchema
>;

export const submissionAiReviews = pgTable("submission_ai_reviews", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .references(() => commercialSubmissions.id, { onDelete: "cascade" })
    .notNull(),
  decision: varchar("decision", { length: 50 }).notNull(),
  decisionReason: text("decision_reason"),
  strengths: text("strengths"),
  concerns: text("concerns"),
  requestedDocuments: text("requested_documents"),
  declineReasons: text("decline_reasons"),
  manualReviewFlags: text("manual_review_flags"),
  nextSteps: text("next_steps"),
  rulesChecked: integer("rules_checked").default(0),
  rulesPassed: integer("rules_passed").default(0),
  rulesFailed: integer("rules_failed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionAiReviewSchema = createInsertSchema(
  submissionAiReviews,
).omit({ id: true, createdAt: true });
export type SubmissionAiReview = typeof submissionAiReviews.$inferSelect;
export type InsertSubmissionAiReview = z.infer<
  typeof insertSubmissionAiReviewSchema
>;

export const submissionNotes = pgTable("submission_notes", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .references(() => commercialSubmissions.id, { onDelete: "cascade" })
    .notNull(),
  adminUserId: integer("admin_user_id")
    .references(() => users.id)
    .notNull(),
  noteText: text("note_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubmissionNoteSchema = createInsertSchema(
  submissionNotes,
).omit({ id: true, createdAt: true });
export type SubmissionNote = typeof submissionNotes.$inferSelect;
export type InsertSubmissionNote = z.infer<typeof insertSubmissionNoteSchema>;

export const submissionNotifications = pgTable("submission_notifications", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .references(() => commercialSubmissions.id, { onDelete: "cascade" })
    .notNull(),
  notificationType: varchar("notification_type", { length: 100 }).notNull(),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 50 }).default("sent").notNull(),
});

export const insertSubmissionNotificationSchema = createInsertSchema(
  submissionNotifications,
).omit({ id: true, sentAt: true });
export type SubmissionNotification =
  typeof submissionNotifications.$inferSelect;
export type InsertSubmissionNotification = z.infer<
  typeof insertSubmissionNotificationSchema
>;

export const documentReviewResults = pgTable("document_review_results", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .references(() => dealDocuments.id, { onDelete: "cascade" })
    .notNull(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  programId: integer("program_id").references(() => loanPrograms.id, {
    onDelete: "set null",
  }),
  documentTemplateId: integer("document_template_id").references(
    () => programDocumentTemplates.id,
    { onDelete: "set null" },
  ),

  overallStatus: varchar("overall_status", { length: 50 }).notNull(),
  summary: text("summary"),
  findings: text("findings"),
  rulesUsed: integer("rules_used").default(0),
  rulesPassed: integer("rules_passed").default(0),
  rulesFailed: integer("rules_failed").default(0),
  rulesWarning: integer("rules_warning").default(0),

  model: varchar("model", { length: 100 }),
  reviewedAt: timestamp("reviewed_at").defaultNow(),
  reviewedBy: integer("reviewed_by").references(() => users.id),
});

export const insertDocumentReviewResultSchema = createInsertSchema(
  documentReviewResults,
).omit({ id: true, reviewedAt: true });
export type DocumentReviewResult = typeof documentReviewResults.$inferSelect;
export type InsertDocumentReviewResult = z.infer<
  typeof insertDocumentReviewResultSchema
>;

export const creditPolicies = pgTable("credit_policies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sourceFileName: varchar("source_file_name", { length: 500 }),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCreditPolicySchema = createInsertSchema(creditPolicies).omit(
  { id: true, createdAt: true, updatedAt: true },
);
export type CreditPolicy = typeof creditPolicies.$inferSelect;
export type InsertCreditPolicy = z.infer<typeof insertCreditPolicySchema>;

export const programReviewRules = pgTable("program_review_rules", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loanPrograms.id, {
    onDelete: "cascade",
  }),
  creditPolicyId: integer("credit_policy_id").references(
    () => creditPolicies.id,
    { onDelete: "cascade" },
  ),
  documentTemplateId: integer("document_template_id").references(
    () => programDocumentTemplates.id,
    { onDelete: "cascade" },
  ),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  ruleTitle: varchar("rule_title", { length: 500 }).notNull(),
  ruleDescription: text("rule_description"),
  ruleType: varchar("rule_type", { length: 50 }).default("general"),
  severity: varchar("severity", { length: 20 }).default("fail"),
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProgramReviewRuleSchema = createInsertSchema(
  programReviewRules,
).omit({ id: true, createdAt: true, updatedAt: true });
export type ProgramReviewRule = typeof programReviewRules.$inferSelect;
export type InsertProgramReviewRule = z.infer<
  typeof insertProgramReviewRuleSchema
>;

// ==================== PHASE 1: NEW TABLES ====================

// Processor Daily Queue - for managing batch processing of digests, document reviews, etc.
export const processorDailyQueue = pgTable("processor_daily_queue", {
  id: serial("id").primaryKey(),
  processorId: integer("processor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  dealId: integer("deal_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  queueDate: timestamp("queue_date").notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(), // digest_send, document_review, task_creation, message_send
  actionData: jsonb("action_data").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, sent, failed
  editedContent: text("edited_content"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProcessorDailyQueueSchema = createInsertSchema(
  processorDailyQueue,
).omit({ id: true, createdAt: true });
export type ProcessorDailyQueue = typeof processorDailyQueue.$inferSelect;
export type InsertProcessorDailyQueue = z.infer<
  typeof insertProcessorDailyQueueSchema
>;

// Broker Contacts - contact management for brokers
export const brokerContacts = pgTable("broker_contacts", {
  id: serial("id").primaryKey(),
  brokerId: integer("broker_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  contactType: varchar("contact_type", { length: 50 }).notNull(), // prospect, client, referral, other
  lastContactedAt: timestamp("last_contacted_at"),
  notes: text("notes"),
  tags: jsonb("tags"), // array of strings
  source: varchar("source", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBrokerContactSchema = createInsertSchema(
  brokerContacts,
).omit({ id: true, createdAt: true, updatedAt: true });
export type BrokerContact = typeof brokerContacts.$inferSelect;
export type InsertBrokerContact = z.infer<typeof insertBrokerContactSchema>;

// Broker Outreach Messages - tracking outreach campaigns and messages
export const brokerOutreachMessages = pgTable("broker_outreach_messages", {
  id: serial("id").primaryKey(),
  brokerId: integer("broker_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  contactId: integer("contact_id").references(() => brokerContacts.id, {
    onDelete: "set null",
  }),
  campaignId: integer("campaign_id"),
  channel: varchar("channel", { length: 50 }).notNull(), // email, sms, both
  subject: varchar("subject", { length: 255 }),
  body: text("body").notNull(),
  personalizedBody: text("personalized_body"),
  status: varchar("status", { length: 50 }).default("draft").notNull(), // draft, approved, sent, failed, bounced
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  aiGenerated: boolean("ai_generated").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBrokerOutreachMessageSchema = createInsertSchema(
  brokerOutreachMessages,
).omit({ id: true, createdAt: true });
export type BrokerOutreachMessage = typeof brokerOutreachMessages.$inferSelect;
export type InsertBrokerOutreachMessage = z.infer<
  typeof insertBrokerOutreachMessageSchema
>;

// AI Assistant Conversations - conversation history with AI assistant
export const aiAssistantConversations = pgTable("ai_assistant_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  dealId: integer("deal_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  conversationType: varchar("conversation_type", { length: 50 }).notNull(), // daily_briefing, deal_review, general
  title: varchar("title", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAiAssistantConversationSchema = createInsertSchema(
  aiAssistantConversations,
).omit({ id: true, createdAt: true, updatedAt: true });
export type AiAssistantConversation =
  typeof aiAssistantConversations.$inferSelect;
export type InsertAiAssistantConversation = z.infer<
  typeof insertAiAssistantConversationSchema
>;

// AI Assistant Messages - individual messages in conversations
export const aiAssistantMessages = pgTable("ai_assistant_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .references(() => aiAssistantConversations.id, { onDelete: "cascade" })
    .notNull(),
  role: varchar("role", { length: 50 }).notNull(), // user, assistant, system
  content: text("content").notNull(),
  actionsTaken: jsonb("actions_taken"), // array of actions performed based on this message
  voiceInput: boolean("voice_input").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiAssistantMessageSchema = createInsertSchema(
  aiAssistantMessages,
).omit({ id: true, createdAt: true });
export type AiAssistantMessage = typeof aiAssistantMessages.$inferSelect;
export type InsertAiAssistantMessage = z.infer<
  typeof insertAiAssistantMessageSchema
>;

// Document Review Rules - rules for AI document review
export const documentReviewRules = pgTable("document_review_rules", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .references(() => loanPrograms.id, { onDelete: "cascade" })
    .notNull(),
  documentCategory: varchar("document_category", { length: 100 }).notNull(),
  documentName: varchar("document_name", { length: 255 }).notNull(),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  ruleDescription: text("rule_description"),
  ruleConfig: jsonb("rule_config").notNull(), // contains the check criteria
  severity: varchar("severity", { length: 50 }).notNull(), // required, recommended, info
  isActive: boolean("is_active").default(true).notNull(),
  sourceGuidelineId: integer("source_guideline_id"), // reference to uploaded guidelines
  confidence: real("confidence"), // expected confidence score 0-1
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentReviewRuleSchema = createInsertSchema(
  documentReviewRules,
).omit({ id: true, createdAt: true });
export type DocumentReviewRule = typeof documentReviewRules.$inferSelect;
export type InsertDocumentReviewRule = z.infer<
  typeof insertDocumentReviewRuleSchema
>;

// ==================== AI AGENT SYSTEM ====================

// Agent Configurations - stores per-agent system prompts, tools, model settings
export const agentConfigurations = pgTable("agent_configurations", {
  id: serial("id").primaryKey(),
  agentType: varchar("agent_type", { length: 50 }).notNull(), // 'document_intelligence' | 'processor' | 'communication'
  name: varchar("name", { length: 255 }).notNull(),
  systemPrompt: text("system_prompt").notNull(),
  toolDefinitions: jsonb("tool_definitions"), // array of tool schemas
  modelProvider: varchar("model_provider", { length: 50 })
    .default("openai")
    .notNull(),
  modelName: varchar("model_name", { length: 100 }).default("gpt-4o").notNull(),
  temperature: real("temperature").default(0.2).notNull(),
  maxTokens: integer("max_tokens").default(4096).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  version: integer("version").default(1).notNull(),
  tenantOverrides: jsonb("tenant_overrides"), // per-tenant customizations
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgentConfigurationSchema = createInsertSchema(
  agentConfigurations,
).omit({ id: true, createdAt: true, updatedAt: true });
export type AgentConfiguration = typeof agentConfigurations.$inferSelect;
export type InsertAgentConfiguration = z.infer<
  typeof insertAgentConfigurationSchema
>;

// Lender Agent Customizations - per-lender supplemental prompts layered on top of baseline agent configs
export const lenderAgentCustomizations = pgTable(
  "lender_agent_customizations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(), // the lender/admin user
    agentType: varchar("agent_type", { length: 50 }).notNull(), // matches agentConfigurations.agentType
    additionalPrompt: text("additional_prompt").notNull(), // appended to baseline system prompt
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
);

export const insertLenderAgentCustomizationSchema = createInsertSchema(
  lenderAgentCustomizations,
).omit({ id: true, createdAt: true, updatedAt: true });
export type LenderAgentCustomization =
  typeof lenderAgentCustomizations.$inferSelect;
export type InsertLenderAgentCustomization = z.infer<
  typeof insertLenderAgentCustomizationSchema
>;

// Document Extractions - stores Agent 1's structured output per document
export const documentExtractions = pgTable("document_extractions", {
  id: serial("id").primaryKey(),
  dealDocumentId: integer("deal_document_id").references(
    () => dealDocuments.id,
    { onDelete: "cascade" },
  ),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  extractedFields: jsonb("extracted_fields").default({}),
  qualityAssessment: jsonb("quality_assessment"),
  anomalies: jsonb("anomalies"),
  confidenceScore: real("confidence_score"),
  classificationMatch: boolean("classification_match"),
  confirmedDocType: varchar("confirmed_doc_type", { length: 100 }),
  agentRunId: integer("agent_run_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentExtractionSchema = createInsertSchema(
  documentExtractions,
).omit({ id: true, createdAt: true });
export type DocumentExtraction = typeof documentExtractions.$inferSelect;
export type InsertDocumentExtraction = z.infer<
  typeof insertDocumentExtractionSchema
>;

// Agent Findings - stores Agent 2's analysis results per deal
export const agentFindings = pgTable("agent_findings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  programId: integer("program_id").references(() => loanPrograms.id, {
    onDelete: "set null",
  }),
  agentRunId: integer("agent_run_id"),
  overallStatus: varchar("overall_status", { length: 50 }), // 'clear' | 'conditions_exist' | 'significant_issues' | 'incomplete_data'
  policyFindings: jsonb("policy_findings"),
  documentRequirementFindings: jsonb("document_requirement_findings"),
  crossDocumentConsistency: jsonb("cross_document_consistency"),
  missingDocuments: jsonb("missing_documents"),
  dealHealthSummary: jsonb("deal_health_summary"),
  recommendedNextActions: jsonb("recommended_next_actions"),
  rawOutput: jsonb("raw_output"),
  lenderDecision: varchar("lender_decision", { length: 50 }),
  lenderDecisionBy: integer("lender_decision_by").references(() => users.id),
  lenderDecisionAt: timestamp("lender_decision_at"),
  lenderDecisionNotes: text("lender_decision_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentFindingSchema = createInsertSchema(agentFindings).omit({
  id: true,
  createdAt: true,
});
export type AgentFinding = typeof agentFindings.$inferSelect;
export type InsertAgentFinding = z.infer<typeof insertAgentFindingSchema>;

// Agent Communications - stores Agent 3's drafted messages
export const agentCommunications = pgTable("agent_communications", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  agentRunId: integer("agent_run_id"),
  recipientType: varchar("recipient_type", { length: 50 }).notNull(), // 'borrower' | 'broker' | 'internal'
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  htmlBody: text("html_body"),
  priority: varchar("priority", { length: 50 }).default("routine").notNull(),
  status: varchar("status", { length: 50 }).default("draft").notNull(), // draft | approved | sent | rejected | edited
  findingIds: jsonb("finding_ids"), // array of finding references
  suggestedFollowUpDate: timestamp("suggested_follow_up_date"),
  internalNotes: text("internal_notes"),
  editedBody: text("edited_body"), // stores human edits
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  sentVia: varchar("sent_via", { length: 50 }), // 'email' | 'sms'

  // Scheduling — allows queuing for a specific date (shows on communications calendar)
  scheduledSendDate: timestamp("scheduled_send_date"),
  // Source trigger — what caused this communication to be created
  sourceTrigger: varchar("source_trigger", { length: 50 }), // 'doc_review_fail' | 'digest' | 'manual' | 'ai_agent'

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentCommunicationSchema = createInsertSchema(
  agentCommunications,
).omit({ id: true, createdAt: true });
export type AgentCommunication = typeof agentCommunications.$inferSelect;
export type InsertAgentCommunication = z.infer<
  typeof insertAgentCommunicationSchema
>;

// Agent Corrections - stores human feedback for per-tenant learning
export const agentCorrections = pgTable("agent_corrections", {
  id: serial("id").primaryKey(),
  agentType: varchar("agent_type", { length: 50 }).notNull(),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  originalOutput: text("original_output").notNull(),
  correctedOutput: text("corrected_output").notNull(),
  correctionType: varchar("correction_type", { length: 50 }), // 'finding_override' | 'communication_edit' | 'severity_change' | 'false_positive'
  context: jsonb("context"), // metadata about what was corrected
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentCorrectionSchema = createInsertSchema(
  agentCorrections,
).omit({ id: true, createdAt: true });
export type AgentCorrection = typeof agentCorrections.$inferSelect;
export type InsertAgentCorrection = z.infer<typeof insertAgentCorrectionSchema>;

// Agent Runs - audit log of every agent execution
export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  agentType: varchar("agent_type", { length: 50 }).notNull(),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  configurationId: integer("configuration_id").references(
    () => agentConfigurations.id,
    { onDelete: "set null" },
  ),
  status: varchar("status", { length: 50 }).default("running").notNull(), // running | completed | failed | cancelled
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  estimatedCost: real("estimated_cost"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  triggerType: varchar("trigger_type", { length: 50 }), // 'manual' | 'document_upload' | 'schedule' | 'stage_change'
  triggeredBy: integer("triggered_by").references(() => users.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertAgentRunSchema = createInsertSchema(agentRuns).omit({
  id: true,
  startedAt: true,
});
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;

// Deal Stories - living narrative per deal (the "story" file)
export const dealStories = pgTable("deal_stories", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  currentNarrative: text("current_narrative").notNull(), // the current compiled story
  lastUpdatedSection: varchar("last_updated_section", { length: 100 }),
  storyVersion: integer("story_version").default(1).notNull(),
  metadata: jsonb("metadata"), // stats like total_findings, docs_received, etc
  lastAgentUpdate: timestamp("last_agent_update"),
  lastHumanUpdate: timestamp("last_human_update"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealStorySchema = createInsertSchema(dealStories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DealStory = typeof dealStories.$inferSelect;

// Platform Settings - global configuration for the platform
export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  aiAgentsEnabled: boolean("ai_agents_enabled").default(true).notNull(),
  commercialLendingEnabled: boolean("commercial_lending_enabled")
    .default(true)
    .notNull(),
  documentTemplatesEnabled: boolean("document_templates_enabled")
    .default(true)
    .notNull(),
  smartProspectingEnabled: boolean("smart_prospecting_enabled")
    .default(false)
    .notNull(),
  autoRunPipeline: boolean("auto_run_pipeline").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const insertPlatformSettingsSchema = createInsertSchema(
  platformSettings,
).omit({ id: true, updatedAt: true });
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type InsertPlatformSettings = z.infer<
  typeof insertPlatformSettingsSchema
>;
export type InsertDealStory = z.infer<typeof insertDealStorySchema>;

// Agent Pipeline Runs - tracks full pipeline executions (Agent 1 → 2 → 3) for a deal
export const agentPipelineRuns = pgTable("agent_pipeline_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  status: varchar("status", { length: 50 }).default("queued").notNull(), // queued, running, completed, failed, cancelled
  agentSequence: jsonb("agent_sequence").notNull(), // ['document_intelligence', 'processor', 'communication']
  currentAgentIndex: integer("current_agent_index").default(0).notNull(),
  triggerType: varchar("trigger_type", { length: 50 })
    .default("manual")
    .notNull(), // manual, auto_upload, auto_stage_change
  triggeredBy: integer("triggered_by").references(() => users.id, {
    onDelete: "set null",
  }),
  errorMessage: text("error_message"),
  totalDurationMs: integer("total_duration_ms"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertAgentPipelineRunSchema = createInsertSchema(
  agentPipelineRuns,
).omit({ id: true, startedAt: true });
export type AgentPipelineRun = typeof agentPipelineRuns.$inferSelect;
export type InsertAgentPipelineRun = z.infer<
  typeof insertAgentPipelineRunSchema
>;

// Pipeline Step Logs - tracks each agent's execution within a pipeline run
export const pipelineStepLogs = pgTable("pipeline_step_logs", {
  id: serial("id").primaryKey(),
  pipelineRunId: integer("pipeline_run_id")
    .references(() => agentPipelineRuns.id, { onDelete: "cascade" })
    .notNull(),
  agentType: varchar("agent_type", { length: 100 }).notNull(),
  agentRunId: integer("agent_run_id").references(() => agentRuns.id, {
    onDelete: "set null",
  }),
  sequenceIndex: integer("sequence_index").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, running, completed, failed, skipped
  outputSummary: jsonb("output_summary"), // high-level results from this agent step
  inputContext: jsonb("input_context"), // what was passed from the previous agent
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at"),
  completedAt: timestamp("completed_at"),
});

export const insertPipelineStepLogSchema = createInsertSchema(
  pipelineStepLogs,
).omit({ id: true });
export type PipelineStepLog = typeof pipelineStepLogs.$inferSelect;
export type InsertPipelineStepLog = z.infer<typeof insertPipelineStepLogSchema>;

// Pipeline Agent Steps - configurable pipeline chain with ordering, triggers, and data mappings
export const pipelineAgentSteps = pgTable("pipeline_agent_steps", {
  id: serial("id").primaryKey(),
  agentType: varchar("agent_type", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  stepOrder: integer("step_order").default(0).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  triggerCondition: jsonb("trigger_condition")
    .default({
      type: "previous_step_complete",
      config: {},
    })
    .notNull(),
  inputMapping: jsonb("input_mapping").default({}).notNull(),
  outputMapping: jsonb("output_mapping").default({}).notNull(),
  retryOnFailure: boolean("retry_on_failure").default(false).notNull(),
  maxRetries: integer("max_retries").default(1).notNull(),
  timeoutSeconds: integer("timeout_seconds").default(300).notNull(),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPipelineAgentStepSchema = createInsertSchema(
  pipelineAgentSteps,
).omit({ id: true, createdAt: true, updatedAt: true });
export type PipelineAgentStep = typeof pipelineAgentSteps.$inferSelect;
export type InsertPipelineAgentStep = z.infer<
  typeof insertPipelineAgentStepSchema
>;

// Lender Training Steps - configurable training content for lender onboarding
export const lenderTrainingSteps = pgTable("lender_training_steps", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetPage: varchar("target_page", { length: 255 }).notNull(), // e.g., '/admin/programs'
  contentHtml: text("content_html"), // rich HTML content for overlay
  videoUrl: text("video_url"), // optional training video link
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isRequired: boolean("is_required").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLenderTrainingStepSchema = createInsertSchema(
  lenderTrainingSteps,
).omit({ id: true, createdAt: true, updatedAt: true });
export type LenderTrainingStep = typeof lenderTrainingSteps.$inferSelect;
export type InsertLenderTrainingStep = z.infer<
  typeof insertLenderTrainingStepSchema
>;

// Lender Training Progress - tracks each user's training completion
export const lenderTrainingProgress = pgTable("lender_training_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  stepId: integer("step_id")
    .references(() => lenderTrainingSteps.id, { onDelete: "cascade" })
    .notNull(),
  status: varchar("status", { length: 50 }).default("not_started").notNull(), // not_started, in_progress, completed
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLenderTrainingProgressSchema = createInsertSchema(
  lenderTrainingProgress,
).omit({ id: true, createdAt: true });
export type LenderTrainingProgress = typeof lenderTrainingProgress.$inferSelect;
export type InsertLenderTrainingProgress = z.infer<
  typeof insertLenderTrainingProgressSchema
>;

// Deal Memory Entries - auto-generated timeline of deal events for AI context
export const dealMemoryEntries = pgTable("deal_memory_entries", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  entryType: varchar("entry_type", { length: 50 }).notNull(), // document_received, document_rejected, document_approved, stage_change, digest_sent, digest_skipped, note_added, field_change
  title: text("title").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"), // flexible data per entry type
  sourceType: varchar("source_type", { length: 30 }), // system, agent, admin
  sourceUserId: integer("source_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDealMemoryEntrySchema = createInsertSchema(
  dealMemoryEntries,
).omit({ id: true, createdAt: true });
export type DealMemoryEntry = typeof dealMemoryEntries.$inferSelect;
export type InsertDealMemoryEntry = z.infer<typeof insertDealMemoryEntrySchema>;

// Deal Notes - admin notes, @mentions, AI instructions
export const dealNotes = pgTable("deal_notes", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .notNull(),
  content: text("content").notNull(),
  noteType: varchar("note_type", { length: 30 }).default("note").notNull(), // note, ai_instruction, system
  mentions: jsonb("mentions"), // array of { userId, username, position }
  isPinned: boolean("is_pinned").default(false),
  parentNoteId: integer("parent_note_id"), // for threaded replies
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealNoteSchema = createInsertSchema(dealNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DealNote = typeof dealNotes.$inferSelect;
export type InsertDealNote = z.infer<typeof insertDealNoteSchema>;

// ==================== NOTIFICATIONS SYSTEM ====================
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  dealId: integer("deal_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// ==================== EMAIL INTEGRATION ====================
export const emailAccounts = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  emailAddress: varchar("email_address", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull().default("gmail"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: varchar("sync_status", { length: 50 }).default("idle"),
  historyId: varchar("history_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailAccountSchema = createInsertSchema(emailAccounts).omit({
  id: true,
  createdAt: true,
});
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;

export const emailThreads = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id")
    .references(() => emailAccounts.id, { onDelete: "cascade" })
    .notNull(),
  gmailThreadId: varchar("gmail_thread_id", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  snippet: text("snippet"),
  fromAddress: varchar("from_address", { length: 255 }),
  fromName: varchar("from_name", { length: 255 }),
  participants: text("participants").array(),
  messageCount: integer("message_count").default(0),
  hasAttachments: boolean("has_attachments").default(false),
  isUnread: boolean("is_unread").default(true),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailThreadSchema = createInsertSchema(emailThreads).omit({
  id: true,
  createdAt: true,
});
export type EmailThread = typeof emailThreads.$inferSelect;
export type InsertEmailThread = z.infer<typeof insertEmailThreadSchema>;

export const emailMessages = pgTable("email_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .references(() => emailThreads.id, { onDelete: "cascade" })
    .notNull(),
  gmailMessageId: varchar("gmail_message_id", { length: 255 }).notNull(),
  fromAddress: varchar("from_address", { length: 255 }),
  fromName: varchar("from_name", { length: 255 }),
  toAddresses: text("to_addresses").array(),
  ccAddresses: text("cc_addresses").array(),
  subject: varchar("subject", { length: 500 }),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  snippet: text("snippet"),
  attachments: jsonb("attachments"),
  internalDate: timestamp("internal_date"),
  isUnread: boolean("is_unread").default(true),
  labelIds: text("label_ids").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailMessageSchema = createInsertSchema(emailMessages).omit({
  id: true,
  createdAt: true,
});
export type EmailMessage = typeof emailMessages.$inferSelect;
export type InsertEmailMessage = z.infer<typeof insertEmailMessageSchema>;

export const emailThreadDealLinks = pgTable("email_thread_deal_links", {
  id: serial("id").primaryKey(),
  emailThreadId: integer("email_thread_id")
    .references(() => emailThreads.id, { onDelete: "cascade" })
    .notNull(),
  dealId: integer("deal_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  linkedBy: integer("linked_by").references(() => users.id, {
    onDelete: "set null",
  }),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
});

export const insertEmailThreadDealLinkSchema = createInsertSchema(
  emailThreadDealLinks,
).omit({ id: true, linkedAt: true });
export type EmailThreadDealLink = typeof emailThreadDealLinks.$inferSelect;
export type InsertEmailThreadDealLink = z.infer<
  typeof insertEmailThreadDealLinkSchema
>;

export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  category: text("category").default("general"),
  createdBy: integer("created_by")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMessageTemplateSchema = createInsertSchema(
  messageTemplates,
).omit({ id: true, createdAt: true, updatedAt: true });
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;

export const MERGE_TAGS = [
  {
    tag: "{{borrower_first_name}}",
    label: "Borrower First Name",
    description: "The borrower's first name",
  },
  {
    tag: "{{borrower_last_name}}",
    label: "Borrower Last Name",
    description: "The borrower's last name",
  },
  {
    tag: "{{borrower_email}}",
    label: "Borrower Email",
    description: "The borrower's email address",
  },
  {
    tag: "{{loan_amount}}",
    label: "Loan Amount",
    description: "The loan amount",
  },
  {
    tag: "{{property_address}}",
    label: "Property Address",
    description: "The property address",
  },
  {
    tag: "{{loan_program}}",
    label: "Loan Program",
    description: "The loan program name",
  },
  { tag: "{{deal_id}}", label: "Deal ID", description: "The deal identifier" },
  {
    tag: "{{current_stage}}",
    label: "Current Stage",
    description: "The current deal stage",
  },
  {
    tag: "{{company_name}}",
    label: "Company Name",
    description: "Your company name",
  },
  { tag: "{{sender_name}}", label: "Sender Name", description: "Your name" },
] as const;

export const dealThirdParties = pgTable("deal_third_parties", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: varchar("role", { length: 100 }).notNull(),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealThirdPartySchema = createInsertSchema(
  dealThirdParties,
).omit({ id: true, createdAt: true, updatedAt: true });
export type DealThirdParty = typeof dealThirdParties.$inferSelect;
export type InsertDealThirdParty = z.infer<typeof insertDealThirdPartySchema>;

// ==================== DOCUMENT REVIEW & COMMUNICATIONS CONFIG ====================

// Lender-level document review and communication preferences
export const lenderReviewConfig = pgTable("lender_review_config", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(), // the lender/admin

  // AI Review Mode: automatic (on upload), timed (batch on schedule), manual (click to review)
  aiReviewMode: varchar("ai_review_mode", { length: 20 }).default("manual").notNull(),

  // For timed mode — how often to batch-run reviews (in minutes)
  timedReviewIntervalMinutes: integer("timed_review_interval_minutes").default(60),
  lastTimedReviewAt: timestamp("last_timed_review_at"),

  // ---- Fail Alert Preferences ----
  // When a document FAILS AI review, who gets notified and how
  failAlertEnabled: boolean("fail_alert_enabled").default(true).notNull(),
  failAlertRecipients: varchar("fail_alert_recipients", { length: 20 }).default("both").notNull(), // borrower, broker, both
  failAlertChannels: jsonb("fail_alert_channels").default({ email: true, sms: false, inApp: true }).notNull(),

  // ---- Pass Notification Preferences ----
  // When a document PASSES AI review, notify lender/processor for human approval
  passNotifyEnabled: boolean("pass_notify_enabled").default(true).notNull(),
  passNotifyChannels: jsonb("pass_notify_channels").default({ email: false, inApp: true }).notNull(),

  // ---- Digest / Scheduled Communications ----
  // Whether digest drafts auto-send or require human approval
  digestAutoSend: boolean("digest_auto_send").default(false).notNull(),

  // When AI agent drafts are generated, require approval or auto-send
  aiDraftAutoSend: boolean("ai_draft_auto_send").default(false).notNull(),

  // Notify lender/processor when a draft is ready for review
  draftReadyNotifyEnabled: boolean("draft_ready_notify_enabled").default(true).notNull(),
  draftReadyNotifyChannels: jsonb("draft_ready_notify_channels").default({ email: true, inApp: true }).notNull(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLenderReviewConfigSchema = createInsertSchema(lenderReviewConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type LenderReviewConfig = typeof lenderReviewConfig.$inferSelect;
export type InsertLenderReviewConfig = z.infer<typeof insertLenderReviewConfigSchema>;

// ==================== TEAM CHAT ====================

export const teamChats = pgTable("team_chats", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  isGroup: boolean("is_group").default(false).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamChatSchema = createInsertSchema(teamChats).omit({ id: true, createdAt: true, lastMessageAt: true });
export type TeamChat = typeof teamChats.$inferSelect;
export type InsertTeamChat = z.infer<typeof insertTeamChatSchema>;

export const teamChatParticipants = pgTable("team_chat_participants", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").references(() => teamChats.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  lastReadAt: timestamp("last_read_at").default(new Date("1970-01-01")).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertTeamChatParticipantSchema = createInsertSchema(teamChatParticipants).omit({ id: true, joinedAt: true });
export type TeamChatParticipant = typeof teamChatParticipants.$inferSelect;
export type InsertTeamChatParticipant = z.infer<typeof insertTeamChatParticipantSchema>;

export const teamChatMessages = pgTable("team_chat_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").references(() => teamChats.id, { onDelete: "cascade" }).notNull(),
  senderId: integer("sender_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamChatMessageSchema = createInsertSchema(teamChatMessages).omit({ id: true, createdAt: true });
export type TeamChatMessage = typeof teamChatMessages.$inferSelect;
export type InsertTeamChatMessage = z.infer<typeof insertTeamChatMessageSchema>;

// ============ Borrower Profiles ============
export const borrowerProfiles = pgTable("borrower_profiles", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),

  // Address
  streetAddress: text("street_address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zipCode: varchar("zip_code", { length: 20 }),

  // Identification
  ssnLast4: varchar("ssn_last4", { length: 4 }),
  idType: varchar("id_type", { length: 50 }), // drivers_license, passport, state_id
  idNumber: varchar("id_number", { length: 100 }),
  idExpirationDate: varchar("id_expiration_date", { length: 20 }),

  // Employment & Income
  employerName: varchar("employer_name", { length: 255 }),
  employmentTitle: varchar("employment_title", { length: 255 }),
  annualIncome: real("annual_income"),
  employmentType: varchar("employment_type", { length: 50 }), // employed, self_employed, retired, other

  // Entity Info (for investors/LLCs)
  entityName: varchar("entity_name", { length: 255 }),
  entityType: varchar("entity_type", { length: 50 }), // llc, corp, trust, individual
  einNumber: varchar("ein_number", { length: 20 }),

  // JSONB for any extra application fields that don't fit the columns above
  profileData: jsonb("profile_data"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBorrowerProfileSchema = createInsertSchema(borrowerProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type BorrowerProfile = typeof borrowerProfiles.$inferSelect;
export type InsertBorrowerProfile = z.infer<typeof insertBorrowerProfileSchema>;

// ============ Borrower Documents (persistent across loans) ============
export const borrowerDocuments = pgTable("borrower_documents", {
  id: serial("id").primaryKey(),
  borrowerProfileId: integer("borrower_profile_id").references(() => borrowerProfiles.id, { onDelete: "cascade" }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size"),
  storagePath: text("storage_path"),
  category: varchar("category", { length: 100 }),
  documentClassification: varchar("document_classification", { length: 20 }).default("standalone"),
  description: text("description"),
  expirationDate: varchar("expiration_date", { length: 20 }),
  isActive: boolean("is_active").default(true),
  sourceDealId: integer("source_deal_id"),
  sourceDealName: varchar("source_deal_name", { length: 500 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBorrowerDocumentSchema = createInsertSchema(borrowerDocuments).omit({ id: true, uploadedAt: true, updatedAt: true });
export type BorrowerDocument = typeof borrowerDocuments.$inferSelect;
export type InsertBorrowerDocument = z.infer<typeof insertBorrowerDocumentSchema>;

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail: varchar("user_email", { length: 255 }),
  userRole: varchar("user_role", { length: 50 }),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 100 }),
  resourceId: varchar("resource_id", { length: 255 }),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  statusCode: integer("status_code"),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
}, (table) => ({
  userIdIdx: index("audit_logs_user_id_idx").on(table.userId),
  timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
  actionIdx: index("audit_logs_action_idx").on(table.action),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  success: boolean("success").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  userAgent: text("user_agent"),
}, (table) => ({
  emailIpIdx: index("login_attempts_email_ip_idx").on(table.email, table.ipAddress),
  timestampIdx: index("login_attempts_timestamp_idx").on(table.timestamp),
}));

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = typeof loginAttempts.$inferInsert;

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
  keyHash: text("key_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  scopes: jsonb("scopes").notNull().default('[]'),
  expiresAt: timestamp("expires_at"),
  isRevoked: boolean("is_revoked").default(false),
  lastUsedAt: timestamp("last_used_at"),
  usageCount: integer("usage_count").default(0),
}, (table) => ({
  createdByUserIdx: index("api_keys_created_by_user_id_idx").on(table.createdByUserId),
  keyPrefixIdx: index("api_keys_key_prefix_idx").on(table.keyPrefix),
}));

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

export const apiKeyUsage = pgTable("api_key_usage", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  endpoint: varchar("endpoint", { length: 255 }),
  method: varchar("method", { length: 10 }),
  statusCode: integer("status_code"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  scopeRequired: jsonb("scope_required"),
  scopeGranted: jsonb("scope_granted"),
  authorized: boolean("authorized").default(true),
  errorMessage: text("error_message"),
  requestId: text("request_id"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  responseTimeMs: integer("response_time_ms"),
}, (table) => ({
  apiKeyIdIdx: index("api_key_usage_key_id_idx").on(table.apiKeyId),
  timestampIdx: index("api_key_usage_timestamp_idx").on(table.timestamp),
}));

export type ApiKeyUsage = typeof apiKeyUsage.$inferSelect;
export type InsertApiKeyUsage = typeof apiKeyUsage.$inferInsert;

export const webhookEventDefs = pgTable("webhook_events", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  samplePayload: jsonb("sample_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const webhookEndpoints = pgTable("webhooks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  events: text("events").array().notNull().default(sql`'{}'`),
  active: boolean("active").notNull().default(true),
  secret: varchar("secret", { length: 255 }).notNull(),
  rateLimitPerSecond: integer("rate_limit_per_second").notNull().default(10),
  retryPolicy: jsonb("retry_policy").notNull().default({ maxRetries: 5, backoffStrategy: "exponential" }),
  headers: jsonb("headers"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastTriggeredAt: timestamp("last_triggered_at"),
  failureCount: integer("failure_count").notNull().default(0),
}, (table) => ({
  userIdIdx: index("webhooks_user_id_idx").on(table.userId),
  activeIdx: index("webhooks_active_idx").on(table.active),
}));

export const webhookDeliveryLogs = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookId: uuid("webhook_id").references(() => webhookEndpoints.id, { onDelete: "cascade" }).notNull(),
  eventId: varchar("event_id", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  statusCode: smallint("status_code"),
  responseTimeMs: integer("response_time_ms"),
  errorMessage: text("error_message"),
  retriedAt: timestamp("retried_at", { mode: "date" }).array(),
  succeeded: boolean("succeeded").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  webhookIdIdx: index("deliveries_webhook_id_idx").on(table.webhookId),
  eventIdIdx: index("deliveries_event_id_idx").on(table.eventId),
  timestampIdx: index("deliveries_timestamp_idx").on(table.timestamp),
  succeededIdx: index("deliveries_succeeded_idx").on(table.succeeded),
}));

export const insertWebhookEventDefSchema = createInsertSchema(webhookEventDefs).omit({ createdAt: true });
export const insertWebhookEndpointSchema = createInsertSchema(webhookEndpoints).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWebhookDeliveryLogSchema = createInsertSchema(webhookDeliveryLogs).omit({ id: true, timestamp: true });

export type WebhookEventDef = typeof webhookEventDefs.$inferSelect;
export type InsertWebhookEventDef = z.infer<typeof insertWebhookEventDefSchema>;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = z.infer<typeof insertWebhookEndpointSchema>;
export type WebhookDeliveryLog = typeof webhookDeliveryLogs.$inferSelect;
export type InsertWebhookDeliveryLog = z.infer<typeof insertWebhookDeliveryLogSchema>;

export const betaSignups = pgTable("beta_signups", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }),
  company: varchar("company", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBetaSignupSchema = createInsertSchema(betaSignups).omit({ id: true, createdAt: true });
export type BetaSignup = typeof betaSignups.$inferSelect;
export type InsertBetaSignup = z.infer<typeof insertBetaSignupSchema>;

export const inquiryFormTemplates = pgTable("inquiry_form_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull().$type<Array<{
    fieldKey: string;
    label: string;
    fieldType: "text" | "email" | "phone" | "select" | "textarea";
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>>(),
  targetType: varchar("target_type", { length: 50 }).notNull().default("third_party"),
  targetRole: varchar("target_role", { length: 100 }),
  isSystem: boolean("is_system").default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInquiryFormTemplateSchema = createInsertSchema(inquiryFormTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InquiryFormTemplate = typeof inquiryFormTemplates.$inferSelect;
export type InsertInquiryFormTemplate = z.infer<typeof insertInquiryFormTemplateSchema>;

export const taskFormSubmissions = pgTable("task_form_submissions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => projectTasks.id, { onDelete: "cascade" }).notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  formTemplateId: integer("form_template_id").references(() => inquiryFormTemplates.id).notNull(),
  submittedBy: integer("submitted_by").references(() => users.id),
  submittedByEmail: varchar("submitted_by_email", { length: 255 }),
  formData: jsonb("form_data").notNull().$type<Record<string, string>>(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  submittedAt: timestamp("submitted_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskFormSubmissionSchema = createInsertSchema(taskFormSubmissions).omit({ id: true, createdAt: true });
export type TaskFormSubmission = typeof taskFormSubmissions.$inferSelect;
export type InsertTaskFormSubmission = z.infer<typeof insertTaskFormSubmissionSchema>;

// ==================== QUOTE PDF TEMPLATES ====================

export interface QuotePdfSection {
  key: string;
  label: string;
  enabled: boolean;
  fields: Array<{ key: string; label: string; aliases?: string[] }>;
}

export interface LoiDefaults {
  loanProgram?: string;
  loanTerm?: string;
  loanType?: string;
  escrowAccount?: string;
  amortizationTerm?: string;
  rateBuydown?: string;
  underwritingFee?: string;
  legalDocFee?: string;
  introText?: string;
  disclaimerText?: string;
  disclaimerText2?: string;
  closingText?: string;
  vendorText?: string;
  rateLockNote?: string;
  appraisalNote?: string;
  feesFootnote?: string;
}

export interface QuotePdfTemplateConfig {
  templateType?: 'summary' | 'loi';
  companyName: string;
  tagline: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  headerText: string;
  footerDisclaimer: string;
  sections: QuotePdfSection[];
  showYsp: boolean;
  showPoints: boolean;
  showCommission: boolean;
  loiDefaults?: LoiDefaults;
}

export const quotePdfTemplates = pgTable("quote_pdf_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  config: jsonb("config").notNull().$type<QuotePdfTemplateConfig>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQuotePdfTemplateSchema = createInsertSchema(quotePdfTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type QuotePdfTemplate = typeof quotePdfTemplates.$inferSelect;
export type InsertQuotePdfTemplate = z.infer<typeof insertQuotePdfTemplateSchema>;

// =============================================
// COMMERCIAL DEAL INTAKE & FUND MATCHMAKING
// =============================================

export const funds = pgTable("funds", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  fundName: varchar("fund_name", { length: 255 }).notNull(),
  providerName: varchar("provider_name", { length: 255 }),
  website: varchar("website", { length: 500 }),
  contactName: varchar("contact_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  guidelineUrl: varchar("guideline_url", { length: 1000 }),
  ltvMin: real("ltv_min"),
  ltvMax: real("ltv_max"),
  ltcMin: real("ltc_min"),
  ltcMax: real("ltc_max"),
  loanAmountMin: integer("loan_amount_min"),
  loanAmountMax: integer("loan_amount_max"),
  interestRateMin: real("interest_rate_min"),
  interestRateMax: real("interest_rate_max"),
  termMin: integer("term_min"),
  termMax: integer("term_max"),
  recourseType: varchar("recourse_type", { length: 50 }),
  minDscr: real("min_dscr"),
  minCreditScore: integer("min_credit_score"),
  prepaymentTerms: varchar("prepayment_terms", { length: 255 }),
  closingTimeline: varchar("closing_timeline", { length: 100 }),
  originationFeeMin: real("origination_fee_min"),
  originationFeeMax: real("origination_fee_max"),
  allowedStates: jsonb("allowed_states").$type<string[]>(),
  allowedAssetTypes: jsonb("allowed_asset_types").$type<string[]>(),
  loanStrategy: varchar("loan_strategy", { length: 50 }),
  loanTypes: jsonb("loan_types").$type<string[]>(),
  fundDescription: text("fund_description"),
  descriptionEmbedding: vector("description_embedding"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFundSchema = createInsertSchema(funds).omit({ id: true, createdAt: true, updatedAt: true, descriptionEmbedding: true });
export type Fund = typeof funds.$inferSelect;
export type InsertFund = z.infer<typeof insertFundSchema>;

export const fundDocuments = pgTable("fund_documents", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id, { onDelete: "cascade" }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  extractionStatus: varchar("extraction_status", { length: 20 }).default("pending").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertFundDocumentSchema = createInsertSchema(fundDocuments).omit({ id: true, uploadedAt: true });
export type FundDocument = typeof fundDocuments.$inferSelect;
export type InsertFundDocument = z.infer<typeof insertFundDocumentSchema>;

export const fundKnowledgeEntries = pgTable("fund_knowledge_entries", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id, { onDelete: "cascade" }).notNull(),
  sourceType: varchar("source_type", { length: 30 }).notNull().default("manual"),
  sourceDocumentName: varchar("source_document_name", { length: 500 }),
  content: text("content").notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFundKnowledgeEntrySchema = createInsertSchema(fundKnowledgeEntries).omit({ id: true, createdAt: true, updatedAt: true, embedding: true });
export type FundKnowledgeEntry = typeof fundKnowledgeEntries.$inferSelect;
export type InsertFundKnowledgeEntry = z.infer<typeof insertFundKnowledgeEntrySchema>;

export const intakeDeals = pgTable("intake_deals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  brokerId: integer("broker_id").references(() => users.id, { onDelete: "set null" }),
  dealName: varchar("deal_name", { length: 255 }),
  loanAmount: integer("loan_amount"),
  assetType: varchar("asset_type", { length: 100 }),
  loanType: varchar("loan_type", { length: 100 }),
  numberOfUnits: integer("number_of_units"),
  propertyAddress: varchar("property_address", { length: 500 }),
  propertyCity: varchar("property_city", { length: 100 }),
  propertyState: varchar("property_state", { length: 100 }),
  propertyZip: varchar("property_zip", { length: 10 }),
  propertyValue: integer("property_value"),
  ltvPct: real("ltv_pct"),
  ltcPct: real("ltc_pct"),
  noiAnnual: integer("noi_annual"),
  dscr: real("dscr"),
  occupancyPct: integer("occupancy_pct"),
  borrowerName: varchar("borrower_name", { length: 255 }),
  borrowerEntityType: varchar("borrower_entity_type", { length: 50 }),
  borrowerCreditScore: integer("borrower_credit_score"),
  hasGuarantor: boolean("has_guarantor").default(false),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  dealStoryAudioUrl: text("deal_story_audio_url"),
  dealStoryTranscript: text("deal_story_transcript"),
  dealFormJson: jsonb("deal_form_json"),
  brokerNotes: jsonb("broker_notes").$type<Array<{ content: string; createdAt: string; authorName: string }>>().default([]),
  linkedProjectId: integer("linked_project_id").references(() => projects.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIntakeDealSchema = createInsertSchema(intakeDeals).omit({ id: true, createdAt: true, updatedAt: true });
export type IntakeDeal = typeof intakeDeals.$inferSelect;
export type InsertIntakeDeal = z.infer<typeof insertIntakeDealSchema>;

export const intakeDealTasks = pgTable("intake_deal_tasks", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => intakeDeals.id, { onDelete: "cascade" }).notNull(),
  taskTitle: varchar("task_title", { length: 255 }).notNull(),
  taskDescription: text("task_description"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  priority: varchar("priority", { length: 50 }).default("medium"),
  assignedTo: varchar("assigned_to", { length: 255 }),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by", { length: 255 }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIntakeDealTaskSchema = createInsertSchema(intakeDealTasks).omit({ id: true, createdAt: true, completedAt: true });
export type IntakeDealTask = typeof intakeDealTasks.$inferSelect;
export type InsertIntakeDealTask = z.infer<typeof insertIntakeDealTaskSchema>;

export const intakeDealDocuments = pgTable("intake_deal_documents", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => intakeDeals.id, { onDelete: "cascade" }).notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  version: integer("version").default(1).notNull(),
  fileName: varchar("file_name", { length: 500 }),
  filePath: varchar("file_path", { length: 1000 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  isCurrent: boolean("is_current").default(true).notNull(),
  comments: text("comments"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertIntakeDealDocumentSchema = createInsertSchema(intakeDealDocuments).omit({ id: true, uploadedAt: true });
export type IntakeDealDocument = typeof intakeDealDocuments.$inferSelect;
export type InsertIntakeDealDocument = z.infer<typeof insertIntakeDealDocumentSchema>;

export const intakeDocumentRules = pgTable("intake_document_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  conditions: jsonb("conditions").$type<Record<string, any>>().notNull(),
  requiredDocuments: jsonb("required_documents").$type<string[]>().notNull(),
  documentTemplates: jsonb("document_templates").$type<Record<string, { url: string; fileName: string }>>().default({}),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIntakeDocumentRuleSchema = createInsertSchema(intakeDocumentRules).omit({ id: true, createdAt: true, updatedAt: true });
export type IntakeDocumentRule = typeof intakeDocumentRules.$inferSelect;
export type InsertIntakeDocumentRule = z.infer<typeof insertIntakeDocumentRuleSchema>;

export const intakeAiAnalysis = pgTable("intake_ai_analysis", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => intakeDeals.id, { onDelete: "cascade" }).notNull(),
  agent1Validation: jsonb("agent1_validation"),
  agent2Matching: jsonb("agent2_matching"),
  agent3Feedback: jsonb("agent3_feedback"),
  overallVerdict: varchar("overall_verdict", { length: 50 }),
  confidenceScore: integer("confidence_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIntakeAiAnalysisSchema = createInsertSchema(intakeAiAnalysis).omit({ id: true, createdAt: true });
export type IntakeAiAnalysis = typeof intakeAiAnalysis.$inferSelect;
export type InsertIntakeAiAnalysis = z.infer<typeof insertIntakeAiAnalysisSchema>;

export const intakeDealStatusHistory = pgTable("intake_deal_status_history", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => intakeDeals.id, { onDelete: "cascade" }).notNull(),
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertIntakeDealStatusHistorySchema = createInsertSchema(intakeDealStatusHistory).omit({ id: true, createdAt: true });
export type IntakeDealStatusHistory = typeof intakeDealStatusHistory.$inferSelect;
export type InsertIntakeDealStatusHistory = z.infer<typeof insertIntakeDealStatusHistorySchema>;

export const intakeDealFundSubmissions = pgTable("intake_deal_fund_submissions", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => intakeDeals.id, { onDelete: "cascade" }).notNull(),
  fundId: integer("fund_id").references(() => funds.id, { onDelete: "cascade" }).notNull(),
  submittedBy: integer("submitted_by").references(() => users.id, { onDelete: "set null" }),
  fundResponseStatus: varchar("fund_response_status", { length: 50 }).default("pending"),
  fundResponseAt: timestamp("fund_response_at"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
})

export const insertIntakeDealFundSubmissionSchema = createInsertSchema(intakeDealFundSubmissions).omit({ id: true, submittedAt: true });
export type IntakeDealFundSubmission = typeof intakeDealFundSubmissions.$inferSelect;

export const commercialFormConfig = pgTable("commercial_form_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  fieldKey: varchar("field_key", { length: 100 }).notNull(),
  fieldLabel: varchar("field_label", { length: 255 }).notNull(),
  section: varchar("section", { length: 100 }).notNull(),
  fieldType: varchar("field_type", { length: 50 }).notNull(),
  displayFormat: varchar("display_format", { length: 50 }).default("plain"),
  isVisible: boolean("is_visible").default(true).notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  isCustom: boolean("is_custom").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  options: jsonb("options"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCommercialFormConfigSchema = createInsertSchema(commercialFormConfig).omit({ id: true, updatedAt: true });
export type CommercialFormConfig = typeof commercialFormConfig.$inferSelect;
export type InsertCommercialFormConfig = z.infer<typeof insertCommercialFormConfigSchema>;
export type InsertIntakeDealFundSubmission = z.infer<typeof insertIntakeDealFundSubmissionSchema>;

// ==================== COMMUNICATIONS AUTOMATIONS ====================

export const commsChannels = pgTable("comms_channels", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  type: varchar("type", { length: 20 }).notNull(), // 'email' | 'sms' | 'in_app'
  config: jsonb("config"), // { accountSid, apiKey, apiKeySecret, fromNumber } for SMS
  smsEnabled: boolean("sms_enabled").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCommsChannelSchema = createInsertSchema(commsChannels).omit({ id: true, createdAt: true });
export type CommsChannel = typeof commsChannels.$inferSelect;
export type InsertCommsChannel = z.infer<typeof insertCommsChannelSchema>;

export const commsTemplates = pgTable("comms_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // 'email' | 'sms' | 'in_app'
  subject: text("subject"),
  body: text("body").notNull(),
  version: integer("version").default(1).notNull(),
  supersedesId: integer("supersedes_id").references((): AnyPgColumn => commsTemplates.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCommsTemplateSchema = createInsertSchema(commsTemplates).omit({ id: true, createdAt: true });
export type CommsTemplate = typeof commsTemplates.$inferSelect;
export type InsertCommsTemplate = z.infer<typeof insertCommsTemplateSchema>;

export const commsMergeTags = pgTable("comms_merge_tags", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).unique().notNull(),
  description: text("description").notNull(),
  resolverFnName: varchar("resolver_fn_name", { length: 100 }).notNull(),
  channelFormatting: jsonb("channel_formatting"), // { email: 'html_list', sms: 'comma_list', in_app: 'plain_list' }
});
export const insertCommsMergeTagSchema = createInsertSchema(commsMergeTags).omit({ id: true });
export type CommsMergeTag = typeof commsMergeTags.$inferSelect;
export type InsertCommsMergeTag = z.infer<typeof insertCommsMergeTagSchema>;

export const commsAutomations = pgTable("comms_automations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // 'draft' | 'active' | 'paused' | 'archived'
  triggerConfig: jsonb("trigger_config"),
  exitConditions: jsonb("exit_conditions"),
  notifyBrokerOnSend: boolean("notify_broker_on_send").default(false).notNull(),
  maxDurationDays: integer("max_duration_days"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertCommsAutomationSchema = createInsertSchema(commsAutomations).omit({ id: true, createdAt: true, updatedAt: true });
export type CommsAutomation = typeof commsAutomations.$inferSelect;
export type InsertCommsAutomation = z.infer<typeof insertCommsAutomationSchema>;

export const commsAutomationNodes = pgTable("comms_automation_nodes", {
  id: serial("id").primaryKey(),
  automationId: integer("automation_id").references(() => commsAutomations.id, { onDelete: "cascade" }).notNull(),
  orderIndex: integer("order_index").notNull(),
  type: varchar("type", { length: 30 }).notNull(), // 'send' | 'wait' | 'branch_engagement' | 'branch_loan_state'
  config: jsonb("config"),
});
export const insertCommsAutomationNodeSchema = createInsertSchema(commsAutomationNodes).omit({ id: true });
export type CommsAutomationNode = typeof commsAutomationNodes.$inferSelect;
export type InsertCommsAutomationNode = z.infer<typeof insertCommsAutomationNodeSchema>;

export const commsSegments = pgTable("comms_segments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  filterConfig: jsonb("filter_config"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCommsSegmentSchema = createInsertSchema(commsSegments).omit({ id: true, createdAt: true });
export type CommsSegment = typeof commsSegments.$inferSelect;
export type InsertCommsSegment = z.infer<typeof insertCommsSegmentSchema>;

export const commsAutomationRuns = pgTable("comms_automation_runs", {
  id: serial("id").primaryKey(),
  automationId: integer("automation_id").references(() => commsAutomations.id, { onDelete: "cascade" }).notNull(),
  subjectType: varchar("subject_type", { length: 20 }).notNull(), // 'loan' | 'broker' | 'borrower'
  subjectId: integer("subject_id").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  currentNodeId: integer("current_node_id").references(() => commsAutomationNodes.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).default("running").notNull(), // 'running' | 'completed' | 'exited' | 'failed'
  exitReason: text("exit_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCommsAutomationRunSchema = createInsertSchema(commsAutomationRuns).omit({ id: true, createdAt: true });
export type CommsAutomationRun = typeof commsAutomationRuns.$inferSelect;
export type InsertCommsAutomationRun = z.infer<typeof insertCommsAutomationRunSchema>;

export const commsScheduledExecutions = pgTable("comms_scheduled_executions", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => commsAutomationRuns.id, { onDelete: "cascade" }).notNull(),
  nodeId: integer("node_id").references(() => commsAutomationNodes.id, { onDelete: "cascade" }).notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending' | 'executing' | 'done' | 'failed'
  attempts: integer("attempts").default(0).notNull(),
  lockedAt: timestamp("locked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCommsScheduledExecutionSchema = createInsertSchema(commsScheduledExecutions).omit({ id: true, createdAt: true });
export type CommsScheduledExecution = typeof commsScheduledExecutions.$inferSelect;
export type InsertCommsScheduledExecution = z.infer<typeof insertCommsScheduledExecutionSchema>;

export const commsSendLog = pgTable("comms_send_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  runId: integer("run_id").references(() => commsAutomationRuns.id, { onDelete: "set null" }),
  nodeId: integer("node_id").references(() => commsAutomationNodes.id, { onDelete: "set null" }),
  channel: varchar("channel", { length: 20 }).notNull(), // 'email' | 'sms' | 'in_app'
  templateId: integer("template_id").references(() => commsTemplates.id, { onDelete: "set null" }),
  templateVersion: integer("template_version").notNull(),
  recipientType: varchar("recipient_type", { length: 20 }).notNull(), // 'broker' | 'borrower' | 'lender_user'
  recipientId: integer("recipient_id").notNull(),
  recipientContactValue: text("recipient_contact_value").notNull(),
  resolvedBody: text("resolved_body").notNull(),
  resolvedSubject: text("resolved_subject"),
  resolvedMergeTags: jsonb("resolved_merge_tags"),
  status: varchar("status", { length: 20 }).notNull(), // 'sent' | 'skipped' | 'failed' | 'suppressed'
  failureReason: text("failure_reason"),
  deliveryEvents: jsonb("delivery_events").default([]),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});
export const insertCommsSendLogSchema = createInsertSchema(commsSendLog).omit({ id: true });
export type CommsSendLog = typeof commsSendLog.$inferSelect;
export type InsertCommsSendLog = z.infer<typeof insertCommsSendLogSchema>;

export const commsOptOuts = pgTable("comms_opt_outs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  contactValue: text("contact_value").notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // 'email' | 'sms' | 'in_app'
  optedOutAt: timestamp("opted_out_at").defaultNow().notNull(),
  source: varchar("source", { length: 30 }).notNull(), // 'stop_keyword' | 'unsubscribe_link' | 'in_app' | 'manual' | 'admin'
  recipientId: integer("recipient_id").references(() => users.id, { onDelete: "set null" }),
});
export const insertCommsOptOutSchema = createInsertSchema(commsOptOuts).omit({ id: true });
export type CommsOptOut = typeof commsOptOuts.$inferSelect;
export type InsertCommsOptOut = z.infer<typeof insertCommsOptOutSchema>;

export const commsConsentRecords = pgTable("comms_consent_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  recipientId: integer("recipient_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // 'email' | 'sms' | 'in_app'
  consentedAt: timestamp("consented_at").defaultNow().notNull(),
  source: varchar("source", { length: 30 }).notNull(), // 'onboarding_form' | 'manual' | 'import'
  consentText: text("consent_text"),
});
export const insertCommsConsentRecordSchema = createInsertSchema(commsConsentRecords).omit({ id: true });
export type CommsConsentRecord = typeof commsConsentRecords.$inferSelect;
export type InsertCommsConsentRecord = z.infer<typeof insertCommsConsentRecordSchema>;

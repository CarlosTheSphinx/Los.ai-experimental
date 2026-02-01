
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

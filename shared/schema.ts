
import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// We'll store request logs
export const pricingRequests = pgTable("pricing_requests", {
  id: serial("id").primaryKey(),
  requestData: jsonb("request_data").notNull(),
  responseData: jsonb("response_data"),
  status: text("status").notNull(), // 'pending', 'success', 'error'
  createdAt: timestamp("created_at").defaultNow(),
});

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

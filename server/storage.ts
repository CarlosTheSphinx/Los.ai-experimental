
import { db } from "./db";
import { 
  pricingRequests, savedQuotes, documents, signers, documentFields, documentAuditLog,
  type InsertPricingRequest, type PricingRequest, type InsertSavedQuote, type SavedQuote,
  type Document, type InsertDocument, type Signer, type InsertSigner,
  type DocumentField, type InsertDocumentField, type DocumentAuditLog, type InsertDocumentAuditLog
} from "@shared/schema";
import { desc, eq, and } from "drizzle-orm";

export interface IStorage {
  logPricingRequest(request: InsertPricingRequest): Promise<PricingRequest>;
  saveQuote(quote: InsertSavedQuote): Promise<SavedQuote>;
  getQuotes(): Promise<SavedQuote[]>;
  getQuoteById(id: number): Promise<SavedQuote | undefined>;
  deleteQuote(id: number): Promise<void>;
  
  // Document methods
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocuments(): Promise<Document[]>;
  getDocumentById(id: number): Promise<Document | undefined>;
  getDocumentsByQuoteId(quoteId: number): Promise<Document[]>;
  updateDocumentStatus(id: number, status: string, completedAt?: Date): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;
  
  // Signer methods
  createSigner(signer: InsertSigner): Promise<Signer>;
  getSignersByDocumentId(documentId: number): Promise<Signer[]>;
  getSignerById(id: number): Promise<Signer | undefined>;
  getSignerByToken(token: string): Promise<Signer | undefined>;
  updateSigner(id: number, updates: Partial<Signer>): Promise<Signer | undefined>;
  deleteSigner(id: number): Promise<void>;
  
  // Field methods
  createField(field: InsertDocumentField): Promise<DocumentField>;
  getFieldsByDocumentId(documentId: number): Promise<DocumentField[]>;
  getFieldsBySignerId(signerId: number): Promise<DocumentField[]>;
  updateField(id: number, updates: Partial<DocumentField>): Promise<DocumentField | undefined>;
  deleteField(id: number): Promise<void>;
  deleteFieldsByDocumentId(documentId: number): Promise<void>;
  
  // Audit log methods
  createAuditLog(log: InsertDocumentAuditLog): Promise<DocumentAuditLog>;
  getAuditLogsByDocumentId(documentId: number): Promise<DocumentAuditLog[]>;
}

export class DatabaseStorage implements IStorage {
  async logPricingRequest(request: InsertPricingRequest): Promise<PricingRequest> {
    const [log] = await db.insert(pricingRequests).values(request).returning();
    return log;
  }

  async saveQuote(quote: InsertSavedQuote): Promise<SavedQuote> {
    const [saved] = await db.insert(savedQuotes).values(quote).returning();
    return saved;
  }

  async getQuotes(): Promise<SavedQuote[]> {
    return await db.select().from(savedQuotes).orderBy(desc(savedQuotes.createdAt));
  }

  async getQuoteById(id: number): Promise<SavedQuote | undefined> {
    const [quote] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, id));
    return quote;
  }

  async deleteQuote(id: number): Promise<void> {
    await db.delete(savedQuotes).where(eq(savedQuotes.id, id));
  }

  // Document methods
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  async getDocuments(): Promise<Document[]> {
    return await db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async getDocumentById(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async getDocumentsByQuoteId(quoteId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.quoteId, quoteId)).orderBy(desc(documents.createdAt));
  }

  async updateDocumentStatus(id: number, status: string, completedAt?: Date): Promise<Document | undefined> {
    const updates: Partial<Document> = { status };
    if (completedAt) updates.completedAt = completedAt;
    const [updated] = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();
    return updated;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documentAuditLog).where(eq(documentAuditLog.documentId, id));
    await db.delete(documentFields).where(eq(documentFields.documentId, id));
    await db.delete(signers).where(eq(signers.documentId, id));
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Signer methods
  async createSigner(signer: InsertSigner): Promise<Signer> {
    const [created] = await db.insert(signers).values(signer).returning();
    return created;
  }

  async getSignersByDocumentId(documentId: number): Promise<Signer[]> {
    return await db.select().from(signers).where(eq(signers.documentId, documentId)).orderBy(signers.signingOrder);
  }

  async getSignerById(id: number): Promise<Signer | undefined> {
    const [signer] = await db.select().from(signers).where(eq(signers.id, id));
    return signer;
  }

  async getSignerByToken(token: string): Promise<Signer | undefined> {
    const [signer] = await db.select().from(signers).where(eq(signers.token, token));
    return signer;
  }

  async updateSigner(id: number, updates: Partial<Signer>): Promise<Signer | undefined> {
    const [updated] = await db.update(signers).set(updates).where(eq(signers.id, id)).returning();
    return updated;
  }

  async deleteSigner(id: number): Promise<void> {
    await db.delete(documentFields).where(eq(documentFields.signerId, id));
    await db.delete(signers).where(eq(signers.id, id));
  }

  // Field methods
  async createField(field: InsertDocumentField): Promise<DocumentField> {
    const [created] = await db.insert(documentFields).values(field).returning();
    return created;
  }

  async getFieldsByDocumentId(documentId: number): Promise<DocumentField[]> {
    return await db.select().from(documentFields).where(eq(documentFields.documentId, documentId));
  }

  async getFieldsBySignerId(signerId: number): Promise<DocumentField[]> {
    return await db.select().from(documentFields).where(eq(documentFields.signerId, signerId));
  }

  async updateField(id: number, updates: Partial<DocumentField>): Promise<DocumentField | undefined> {
    const [updated] = await db.update(documentFields).set(updates).where(eq(documentFields.id, id)).returning();
    return updated;
  }

  async deleteField(id: number): Promise<void> {
    await db.delete(documentFields).where(eq(documentFields.id, id));
  }

  async deleteFieldsByDocumentId(documentId: number): Promise<void> {
    await db.delete(documentFields).where(eq(documentFields.documentId, documentId));
  }

  // Audit log methods
  async createAuditLog(log: InsertDocumentAuditLog): Promise<DocumentAuditLog> {
    const [created] = await db.insert(documentAuditLog).values(log).returning();
    return created;
  }

  async getAuditLogsByDocumentId(documentId: number): Promise<DocumentAuditLog[]> {
    return await db.select().from(documentAuditLog).where(eq(documentAuditLog.documentId, documentId)).orderBy(desc(documentAuditLog.createdAt));
  }
}

export const storage = new DatabaseStorage();

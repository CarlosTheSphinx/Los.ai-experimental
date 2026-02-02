
import { db } from "./db";
import { 
  pricingRequests, savedQuotes, documents, signers, documentFields, documentAuditLog, users,
  projects, projectStages, projectTasks, projectActivity, projectDocuments, projectWebhooks,
  systemSettings, adminTasks, adminActivity,
  type InsertPricingRequest, type PricingRequest, type InsertSavedQuote, type SavedQuote,
  type Document, type InsertDocument, type Signer, type InsertSigner,
  type DocumentField, type InsertDocumentField, type DocumentAuditLog, type InsertDocumentAuditLog,
  type User, type InsertUser,
  type Project, type InsertProject, type ProjectStage, type InsertProjectStage,
  type ProjectTask, type InsertProjectTask, type ProjectActivity, type InsertProjectActivity,
  type ProjectDocument, type InsertProjectDocument, type ProjectWebhook, type InsertProjectWebhook,
  type SystemSetting, type InsertSystemSetting, type AdminTask, type InsertAdminTask,
  type AdminActivity, type InsertAdminActivity
} from "@shared/schema";
import { desc, eq, and, gt, like, sql, asc, or, isNull, count } from "drizzle-orm";

export interface IStorage {
  // User methods
  createUser(user: Omit<InsertUser, 'id' | 'createdAt'>): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  
  logPricingRequest(request: InsertPricingRequest): Promise<PricingRequest>;
  saveQuote(quote: InsertSavedQuote, userId: number): Promise<SavedQuote>;
  getQuotes(userId: number): Promise<SavedQuote[]>;
  getQuoteById(id: number, userId: number): Promise<SavedQuote | undefined>;
  deleteQuote(id: number, userId: number): Promise<void>;
  
  // Document methods
  createDocument(doc: InsertDocument, userId: number): Promise<Document>;
  getDocuments(userId: number): Promise<Document[]>;
  getDocumentById(id: number, userId?: number): Promise<Document | undefined>;
  getDocumentsByQuoteId(quoteId: number, userId: number): Promise<Document[]>;
  updateDocumentStatus(id: number, status: string, completedAt?: Date): Promise<Document | undefined>;
  updateDocument(id: number, updates: Partial<Document>, userId?: number): Promise<Document | undefined>;
  deleteDocument(id: number, userId: number): Promise<void>;
  
  // Signer methods
  createSigner(signer: InsertSigner): Promise<Signer>;
  getSignersByDocumentId(documentId: number): Promise<Signer[]>;
  getSignerById(id: number): Promise<Signer | undefined>;
  getSignerByToken(token: string): Promise<Signer | undefined>;
  updateSigner(id: number, updates: Partial<Signer>): Promise<Signer | undefined>;
  deleteSigner(id: number): Promise<void>;
  deleteSignersByDocumentId(documentId: number): Promise<void>;
  
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
  // User methods
  async createUser(user: Omit<InsertUser, 'id' | 'createdAt'>): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(
        eq(users.passwordResetToken, token),
        gt(users.passwordResetExpires, new Date())
      )
    );
    return user;
  }

  async logPricingRequest(request: InsertPricingRequest): Promise<PricingRequest> {
    const [log] = await db.insert(pricingRequests).values(request).returning();
    return log;
  }

  async saveQuote(quote: InsertSavedQuote, userId: number): Promise<SavedQuote> {
    const [saved] = await db.insert(savedQuotes).values({ ...quote, userId }).returning();
    return saved;
  }

  async getQuotes(userId: number): Promise<SavedQuote[]> {
    return await db.select().from(savedQuotes).where(eq(savedQuotes.userId, userId)).orderBy(desc(savedQuotes.createdAt));
  }

  async getQuoteById(id: number, userId: number): Promise<SavedQuote | undefined> {
    const [quote] = await db.select().from(savedQuotes).where(
      and(eq(savedQuotes.id, id), eq(savedQuotes.userId, userId))
    );
    return quote;
  }

  async deleteQuote(id: number, userId: number): Promise<void> {
    await db.delete(savedQuotes).where(
      and(eq(savedQuotes.id, id), eq(savedQuotes.userId, userId))
    );
  }

  // Document methods
  async createDocument(doc: InsertDocument, userId: number): Promise<Document> {
    const [created] = await db.insert(documents).values({ ...doc, userId }).returning();
    return created;
  }

  async getDocuments(userId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.createdAt));
  }

  async getDocumentById(id: number, userId?: number): Promise<Document | undefined> {
    if (userId !== undefined) {
      const [doc] = await db.select().from(documents).where(
        and(eq(documents.id, id), eq(documents.userId, userId))
      );
      return doc;
    }
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async getDocumentsByQuoteId(quoteId: number, userId: number): Promise<Document[]> {
    return await db.select().from(documents).where(
      and(eq(documents.quoteId, quoteId), eq(documents.userId, userId))
    ).orderBy(desc(documents.createdAt));
  }

  async updateDocumentStatus(id: number, status: string, completedAt?: Date): Promise<Document | undefined> {
    const updates: Partial<Document> = { status };
    if (completedAt) updates.completedAt = completedAt;
    const [updated] = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();
    return updated;
  }

  async updateDocument(id: number, updates: Partial<Document>, userId?: number): Promise<Document | undefined> {
    if (userId !== undefined) {
      const [updated] = await db.update(documents).set(updates).where(
        and(eq(documents.id, id), eq(documents.userId, userId))
      ).returning();
      return updated;
    }
    const [updated] = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();
    return updated;
  }

  async deleteDocument(id: number, userId: number): Promise<void> {
    const doc = await this.getDocumentById(id, userId);
    if (!doc) return;
    
    await db.delete(documentAuditLog).where(eq(documentAuditLog.documentId, id));
    await db.delete(documentFields).where(eq(documentFields.documentId, id));
    await db.delete(signers).where(eq(signers.documentId, id));
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
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

  async deleteSignersByDocumentId(documentId: number): Promise<void> {
    await db.delete(signers).where(eq(signers.documentId, documentId));
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

  async getFieldById(id: number): Promise<DocumentField | undefined> {
    const [field] = await db.select().from(documentFields).where(eq(documentFields.id, id));
    return field;
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

  // Project methods
  async generateProjectNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PRJ-${year}-`;
    
    const result = await db.select({ projectNumber: projects.projectNumber })
      .from(projects)
      .where(like(projects.projectNumber, `${prefix}%`))
      .orderBy(desc(projects.projectNumber))
      .limit(1);
    
    let nextNumber = 1;
    if (result.length > 0 && result[0].projectNumber) {
      const lastNumber = result[0].projectNumber;
      const numberPart = parseInt(lastNumber.split('-').pop() || '0');
      nextNumber = numberPart + 1;
    }
    
    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async getProjects(userId: number, status?: string, archived?: boolean): Promise<Project[]> {
    let conditions = [eq(projects.userId, userId)];
    if (status) {
      conditions.push(eq(projects.status, status));
    }
    if (archived !== undefined) {
      conditions.push(eq(projects.isArchived, archived));
    }
    return await db.select().from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.lastUpdated));
  }

  async getProjectById(id: number, userId: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    return project;
  }

  async getProjectByIdInternal(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectByToken(token: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(eq(projects.borrowerPortalToken, token));
    return project;
  }

  async updateProject(id: number, userId: number, updates: Partial<Project>): Promise<Project | undefined> {
    const [updated] = await db.update(projects)
      .set({ ...updates, lastUpdated: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return updated;
  }

  async deleteProject(id: number, userId: number): Promise<void> {
    await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  }

  // Project stages methods
  async createProjectStage(stage: InsertProjectStage): Promise<ProjectStage> {
    const [created] = await db.insert(projectStages).values(stage).returning();
    return created;
  }

  async getStagesByProjectId(projectId: number): Promise<ProjectStage[]> {
    return await db.select().from(projectStages)
      .where(eq(projectStages.projectId, projectId))
      .orderBy(asc(projectStages.stageOrder));
  }

  async updateStage(id: number, updates: Partial<ProjectStage>): Promise<ProjectStage | undefined> {
    const [updated] = await db.update(projectStages).set(updates).where(eq(projectStages.id, id)).returning();
    return updated;
  }

  // Project tasks methods
  async createProjectTask(task: InsertProjectTask): Promise<ProjectTask> {
    const [created] = await db.insert(projectTasks).values(task).returning();
    return created;
  }

  async getTasksByProjectId(projectId: number): Promise<ProjectTask[]> {
    return await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  }

  async getTasksByStageId(stageId: number): Promise<ProjectTask[]> {
    return await db.select().from(projectTasks).where(eq(projectTasks.stageId, stageId));
  }

  async getTaskById(id: number): Promise<ProjectTask | undefined> {
    const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, id));
    return task;
  }

  async updateTask(id: number, updates: Partial<ProjectTask>): Promise<ProjectTask | undefined> {
    const [updated] = await db.update(projectTasks).set(updates).where(eq(projectTasks.id, id)).returning();
    return updated;
  }

  async getProjectTaskStats(projectId: number): Promise<{ completed: number; total: number }> {
    const result = await db.select({
      completed: sql<number>`COUNT(*) FILTER (WHERE ${projectTasks.status} = 'completed')`,
      total: sql<number>`COUNT(*)`
    }).from(projectTasks).where(eq(projectTasks.projectId, projectId));
    return { completed: Number(result[0]?.completed || 0), total: Number(result[0]?.total || 0) };
  }

  // Project activity methods
  async createProjectActivity(activity: InsertProjectActivity): Promise<ProjectActivity> {
    const [created] = await db.insert(projectActivity).values(activity).returning();
    return created;
  }

  async getActivityByProjectId(projectId: number, visibleToBorrower?: boolean): Promise<ProjectActivity[]> {
    let conditions = [eq(projectActivity.projectId, projectId)];
    if (visibleToBorrower !== undefined) {
      conditions.push(eq(projectActivity.visibleToBorrower, visibleToBorrower));
    }
    return await db.select().from(projectActivity)
      .where(and(...conditions))
      .orderBy(desc(projectActivity.createdAt))
      .limit(100);
  }

  // Project documents methods
  async createProjectDocument(doc: InsertProjectDocument): Promise<ProjectDocument> {
    const [created] = await db.insert(projectDocuments).values(doc).returning();
    return created;
  }

  async getDocumentsByProjectId(projectId: number): Promise<ProjectDocument[]> {
    return await db.select().from(projectDocuments)
      .where(eq(projectDocuments.projectId, projectId))
      .orderBy(desc(projectDocuments.uploadedAt));
  }

  // Project webhooks methods
  async createProjectWebhook(webhook: InsertProjectWebhook): Promise<ProjectWebhook> {
    const [created] = await db.insert(projectWebhooks).values(webhook).returning();
    return created;
  }

  async updateProjectWebhook(id: number, updates: Partial<ProjectWebhook>): Promise<ProjectWebhook | undefined> {
    const [updated] = await db.update(projectWebhooks).set(updates).where(eq(projectWebhooks.id, id)).returning();
    return updated;
  }

  async getWebhooksByProjectId(projectId: number): Promise<ProjectWebhook[]> {
    return await db.select().from(projectWebhooks)
      .where(eq(projectWebhooks.projectId, projectId))
      .orderBy(desc(projectWebhooks.triggeredAt));
  }

  // Admin methods - System Settings
  async getAllSettings(): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings).orderBy(asc(systemSettings.settingKey));
  }

  async getSettingByKey(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, key));
    return setting;
  }

  async upsertSetting(key: string, value: string, description: string | null, updatedBy: number): Promise<SystemSetting> {
    const existing = await this.getSettingByKey(key);
    if (existing) {
      const [updated] = await db.update(systemSettings)
        .set({ settingValue: value, settingDescription: description, updatedBy, updatedAt: new Date() })
        .where(eq(systemSettings.settingKey, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(systemSettings)
        .values({ settingKey: key, settingValue: value, settingDescription: description, updatedBy })
        .returning();
      return created;
    }
  }

  // Admin methods - Get all users (admin view)
  async getAllUsers(filters?: { role?: string; search?: string }): Promise<User[]> {
    let query = db.select().from(users);
    const conditions = [];
    
    if (filters?.role) {
      conditions.push(eq(users.role, filters.role));
    }
    if (filters?.search) {
      conditions.push(or(
        like(users.email, `%${filters.search}%`),
        like(users.fullName, `%${filters.search}%`)
      ));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(users).where(and(...conditions)).orderBy(desc(users.createdAt));
    }
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Admin methods - Get all projects (across all users)
  async getAllProjects(filters?: { status?: string; stage?: string; userId?: number }): Promise<Project[]> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(projects.status, filters.status));
    }
    if (filters?.stage) {
      conditions.push(eq(projects.currentStage, filters.stage));
    }
    if (filters?.userId) {
      conditions.push(eq(projects.userId, filters.userId));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.lastUpdated));
    }
    return await db.select().from(projects).orderBy(desc(projects.lastUpdated));
  }

  // Admin methods - Get all documents (across all users)
  async getAllDocuments(filters?: { status?: string; userId?: number }): Promise<Document[]> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(documents.status, filters.status));
    }
    if (filters?.userId) {
      conditions.push(eq(documents.userId, filters.userId));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
    }
    return await db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  // Admin Task methods
  async createAdminTask(task: InsertAdminTask): Promise<AdminTask> {
    const [created] = await db.insert(adminTasks).values(task).returning();
    return created;
  }

  async getAdminTasksByProjectId(projectId: number): Promise<AdminTask[]> {
    return await db.select().from(adminTasks)
      .where(eq(adminTasks.projectId, projectId))
      .orderBy(asc(adminTasks.createdAt));
  }

  async updateAdminTask(id: number, updates: Partial<AdminTask>): Promise<AdminTask | undefined> {
    const [updated] = await db.update(adminTasks)
      .set(updates)
      .where(eq(adminTasks.id, id))
      .returning();
    return updated;
  }

  async getPendingAdminTasksCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(adminTasks).where(eq(adminTasks.status, 'pending'));
    return result[0]?.count ?? 0;
  }

  // Admin Activity methods
  async createAdminActivity(activity: InsertAdminActivity): Promise<AdminActivity> {
    const [created] = await db.insert(adminActivity).values(activity).returning();
    return created;
  }

  async getAdminActivityByProjectId(projectId: number): Promise<AdminActivity[]> {
    return await db.select().from(adminActivity)
      .where(eq(adminActivity.projectId, projectId))
      .orderBy(desc(adminActivity.createdAt))
      .limit(100);
  }

  async getRecentAdminActivity(limit: number = 20): Promise<AdminActivity[]> {
    return await db.select().from(adminActivity)
      .orderBy(desc(adminActivity.createdAt))
      .limit(limit);
  }

  // Dashboard stats
  async getAdminDashboardStats(): Promise<{
    totalActiveUsers: number;
    regularUsers: number;
    activeProjects: number;
    completedProjects: number;
    completedAgreements: number;
    pendingAdminTasks: number;
    activePipelineValue: number;
    fundedVolume: number;
  }> {
    const [userStats] = await db.select({ 
      totalActive: count() 
    }).from(users).where(eq(users.isActive, true));
    
    const [regularUserStats] = await db.select({ 
      count: count() 
    }).from(users).where(eq(users.role, 'user'));
    
    const [activeProjectStats] = await db.select({ 
      count: count() 
    }).from(projects).where(eq(projects.status, 'active'));
    
    const [completedProjectStats] = await db.select({ 
      count: count() 
    }).from(projects).where(eq(projects.status, 'completed'));
    
    const [completedAgreementStats] = await db.select({ 
      count: count() 
    }).from(documents).where(eq(documents.status, 'completed'));
    
    const [pendingTaskStats] = await db.select({ 
      count: count() 
    }).from(adminTasks).where(eq(adminTasks.status, 'pending'));
    
    const activePipelineResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${projects.loanAmount}), 0)` 
    }).from(projects).where(eq(projects.status, 'active'));
    
    const fundedResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${projects.loanAmount}), 0)` 
    }).from(projects).where(eq(projects.status, 'funded'));
    
    return {
      totalActiveUsers: userStats?.totalActive ?? 0,
      regularUsers: regularUserStats?.count ?? 0,
      activeProjects: activeProjectStats?.count ?? 0,
      completedProjects: completedProjectStats?.count ?? 0,
      completedAgreements: completedAgreementStats?.count ?? 0,
      pendingAdminTasks: pendingTaskStats?.count ?? 0,
      activePipelineValue: activePipelineResult[0]?.total ?? 0,
      fundedVolume: fundedResult[0]?.total ?? 0
    };
  }
}

export const storage = new DatabaseStorage();


import { db } from "./db";
import {
  pricingRequests, savedQuotes, documents, signers, documentFields, documentAuditLog, users,
  projects, projectStages, projectTasks, projectActivity, projectDocuments, projectWebhooks,
  dealDocuments, dealDocumentFiles,
  systemSettings, adminTasks, adminActivity, dealStages, teamPermissions,
  commercialSubmissions, commercialSubmissionDocuments,
  documentReviewResults,
  programReviewRules,
  creditPolicies,
  type InsertPricingRequest, type PricingRequest, type InsertSavedQuote, type SavedQuote,
  type Document, type InsertDocument, type Signer, type InsertSigner,
  type DocumentField, type InsertDocumentField, type DocumentAuditLog, type InsertDocumentAuditLog,
  type User, type InsertUser,
  type Project, type InsertProject, type ProjectStage, type InsertProjectStage,
  type ProjectTask, type InsertProjectTask, type ProjectActivity, type InsertProjectActivity,
  type ProjectDocument, type InsertProjectDocument, type ProjectWebhook, type InsertProjectWebhook,
  type DealDocument, type InsertDealDocument, type DealDocumentFile,
  type SystemSetting, type InsertSystemSetting, type AdminTask, type InsertAdminTask,
  type AdminActivity, type InsertAdminActivity,
  type DealStage, type InsertDealStage,
  type TeamPermission, PERMISSION_KEYS,
  type CommercialSubmission, type InsertCommercialSubmission,
  type CommercialSubmissionDocument, type InsertCommercialSubmissionDocument,
  type DocumentReviewResult, type InsertDocumentReviewResult,
  type ProgramReviewRule, type InsertProgramReviewRule,
  type CreditPolicy, type InsertCreditPolicy,
  submissionCriteria, submissionSponsors, submissionFields, submissionFieldResponses,
  submissionDocumentRequirements, submissionReviewRules, submissionAiReviews, submissionNotes, submissionNotifications,
  type SubmissionCriteria, type InsertSubmissionCriteria,
  type SubmissionSponsor, type InsertSubmissionSponsor,
  type SubmissionField, type InsertSubmissionField,
  type SubmissionFieldResponse, type InsertSubmissionFieldResponse,
  type SubmissionDocumentRequirement, type InsertSubmissionDocumentRequirement,
  type SubmissionReviewRule, type InsertSubmissionReviewRule,
  type SubmissionAiReview, type InsertSubmissionAiReview,
  type SubmissionNote, type InsertSubmissionNote,
  type SubmissionNotification, type InsertSubmissionNotification,
} from "@shared/schema";
import { desc, eq, and, gt, like, sql, asc, or, isNull, count, inArray } from "drizzle-orm";

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

  // Commercial submission methods
  createCommercialSubmission(data: InsertCommercialSubmission): Promise<CommercialSubmission>;
  getCommercialSubmissionById(id: number): Promise<CommercialSubmission | undefined>;
  getCommercialSubmissionsByUser(userId: number): Promise<CommercialSubmission[]>;
  getAllCommercialSubmissions(status?: string): Promise<CommercialSubmission[]>;
  updateCommercialSubmissionStatus(id: number, status: string, adminNotes?: string): Promise<CommercialSubmission | undefined>;
  addCommercialSubmissionDocument(doc: InsertCommercialSubmissionDocument): Promise<CommercialSubmissionDocument>;
  getCommercialSubmissionDocuments(submissionId: number): Promise<CommercialSubmissionDocument[]>;
  getCommercialSubmissionDocumentById(id: number): Promise<CommercialSubmissionDocument | undefined>;
  deleteCommercialSubmissionDocument(id: number): Promise<void>;

  createDocumentReview(review: InsertDocumentReviewResult): Promise<DocumentReviewResult>;
  getDocumentReviewsByDocumentId(documentId: number): Promise<DocumentReviewResult[]>;
  getDocumentReviewsByProjectId(projectId: number): Promise<DocumentReviewResult[]>;
  getLatestDocumentReview(documentId: number): Promise<DocumentReviewResult | undefined>;

  getReviewRulesByProgramId(programId: number): Promise<ProgramReviewRule[]>;
  getReviewRulesByDocumentTemplateId(documentTemplateId: number): Promise<ProgramReviewRule[]>;
  createReviewRules(rules: InsertProgramReviewRule[]): Promise<ProgramReviewRule[]>;
  updateReviewRule(id: number, data: Partial<InsertProgramReviewRule>): Promise<ProgramReviewRule>;
  deleteReviewRule(id: number): Promise<void>;
  deleteReviewRulesByProgramId(programId: number): Promise<void>;
  deleteReviewRulesByDocumentTemplateId(documentTemplateId: number): Promise<void>;

  // Submission Criteria CRUD
  getSubmissionCriteria(): Promise<SubmissionCriteria[]>;
  getSubmissionCriteriaByType(type: string): Promise<SubmissionCriteria | undefined>;
  createSubmissionCriteria(data: InsertSubmissionCriteria): Promise<SubmissionCriteria>;
  updateSubmissionCriteria(id: number, data: Partial<InsertSubmissionCriteria>): Promise<SubmissionCriteria>;
  deleteSubmissionCriteria(id: number): Promise<void>;

  // Submission Sponsors CRUD
  getSubmissionSponsorsBySubmissionId(submissionId: number): Promise<SubmissionSponsor[]>;
  createSubmissionSponsor(data: InsertSubmissionSponsor): Promise<SubmissionSponsor>;
  deleteSubmissionSponsor(id: number): Promise<void>;
  deleteSubmissionSponsorsBySubmissionId(submissionId: number): Promise<void>;

  // Submission Fields (Admin custom questions) CRUD
  getSubmissionFields(dealType?: string): Promise<SubmissionField[]>;
  getSubmissionFieldById(id: number): Promise<SubmissionField | undefined>;
  createSubmissionField(data: InsertSubmissionField): Promise<SubmissionField>;
  updateSubmissionField(id: number, data: Partial<InsertSubmissionField>): Promise<SubmissionField>;
  deleteSubmissionField(id: number): Promise<void>;

  // Submission Field Responses CRUD
  getSubmissionFieldResponses(submissionId: number): Promise<SubmissionFieldResponse[]>;
  createSubmissionFieldResponse(data: InsertSubmissionFieldResponse): Promise<SubmissionFieldResponse>;
  deleteSubmissionFieldResponsesBySubmissionId(submissionId: number): Promise<void>;

  // Submission Document Requirements CRUD
  getSubmissionDocumentRequirements(dealType?: string): Promise<SubmissionDocumentRequirement[]>;
  getSubmissionDocumentRequirementById(id: number): Promise<SubmissionDocumentRequirement | undefined>;
  createSubmissionDocumentRequirement(data: InsertSubmissionDocumentRequirement): Promise<SubmissionDocumentRequirement>;
  updateSubmissionDocumentRequirement(id: number, data: Partial<InsertSubmissionDocumentRequirement>): Promise<SubmissionDocumentRequirement>;
  deleteSubmissionDocumentRequirement(id: number): Promise<void>;

  // Submission Review Rules CRUD
  getSubmissionReviewRules(category?: string): Promise<SubmissionReviewRule[]>;
  getSubmissionReviewRuleById(id: number): Promise<SubmissionReviewRule | undefined>;
  createSubmissionReviewRule(data: InsertSubmissionReviewRule): Promise<SubmissionReviewRule>;
  updateSubmissionReviewRule(id: number, data: Partial<InsertSubmissionReviewRule>): Promise<SubmissionReviewRule>;
  deleteSubmissionReviewRule(id: number): Promise<void>;

  // Submission AI Reviews CRUD
  getSubmissionAiReviews(submissionId: number): Promise<SubmissionAiReview[]>;
  createSubmissionAiReview(data: InsertSubmissionAiReview): Promise<SubmissionAiReview>;

  // Submission Notes CRUD
  getSubmissionNotes(submissionId: number): Promise<SubmissionNote[]>;
  createSubmissionNote(data: InsertSubmissionNote): Promise<SubmissionNote>;

  // Submission Notifications CRUD
  getSubmissionNotifications(submissionId: number): Promise<SubmissionNotification[]>;
  createSubmissionNotification(data: InsertSubmissionNotification): Promise<SubmissionNotification>;

  // Enhanced commercial submission methods
  updateCommercialSubmission(id: number, data: Partial<CommercialSubmission>): Promise<CommercialSubmission | undefined>;
  getCommercialSubmissionsByStatus(statuses: string[]): Promise<CommercialSubmission[]>;
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

  async getStageById(id: number): Promise<ProjectStage | undefined> {
    const [stage] = await db.select().from(projectStages).where(eq(projectStages.id, id));
    return stage;
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

  async getTaskBoardTasks(filters: { date?: string; status?: string; userId?: number }): Promise<any[]> {
    const conditions = [];
    
    if (filters.status === 'completed') {
      conditions.push(eq(projectTasks.status, 'completed'));
    } else {
      conditions.push(
        and(
          sql`${projectTasks.status} != 'completed'`,
          sql`${projectTasks.status} != 'not_applicable'`
        )!
      );
    }

    if (filters.date) {
      const dateStart = new Date(filters.date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(filters.date);
      dateEnd.setHours(23, 59, 59, 999);
      conditions.push(
        and(
          sql`${projectTasks.dueDate} >= ${dateStart}`,
          sql`${projectTasks.dueDate} <= ${dateEnd}`
        )!
      );
    }

    if (filters.userId !== undefined) {
      conditions.push(eq(projectTasks.assignedTo, String(filters.userId)));
    }

    const tasks = await db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        stageId: projectTasks.stageId,
        taskTitle: projectTasks.taskTitle,
        taskDescription: projectTasks.taskDescription,
        taskType: projectTasks.taskType,
        status: projectTasks.status,
        priority: projectTasks.priority,
        assignedTo: projectTasks.assignedTo,
        dueDate: projectTasks.dueDate,
        completedAt: projectTasks.completedAt,
        completedBy: projectTasks.completedBy,
        requiresDocument: projectTasks.requiresDocument,
        createdAt: projectTasks.createdAt,
        projectName: projects.projectName,
        borrowerName: projects.borrowerName,
        propertyAddress: projects.propertyAddress,
        projectNumber: projects.projectNumber,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projectTasks.projectId, projects.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(projectTasks.dueDate), asc(projectTasks.priority));
    
    return tasks;
  }

  async getPendingProjectTasksCount(userId?: number): Promise<number> {
    const conditions = [
      sql`${projectTasks.status} != 'completed'`,
      sql`${projectTasks.status} != 'not_applicable'`
    ];
    if (userId !== undefined) {
      conditions.push(sql`${projectTasks.assignedTo} = ${String(userId)}`);
    }
    const [result] = await db.select({
      count: count()
    }).from(projectTasks).where(and(...conditions));
    return result?.count ?? 0;
  }

  async getTaskBoardDateCounts(startDate: string, endDate: string, userId?: number): Promise<Record<string, number>> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const conditions = [
      sql`${projectTasks.dueDate} >= ${start}`,
      sql`${projectTasks.dueDate} <= ${end}`,
      sql`${projectTasks.status} != 'completed'`,
      sql`${projectTasks.status} != 'not_applicable'`
    ];
    if (userId !== undefined) {
      conditions.push(sql`${projectTasks.assignedTo} = ${String(userId)}`);
    }

    const results = await db
      .select({
        date: sql<string>`DATE(${projectTasks.dueDate})`,
        count: count(),
      })
      .from(projectTasks)
      .where(and(...conditions))
      .groupBy(sql`DATE(${projectTasks.dueDate})`);
    
    const dateCounts: Record<string, number> = {};
    for (const r of results) {
      if (r.date) dateCounts[r.date] = r.count;
    }
    return dateCounts;
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
  /** @deprecated Use dealDocuments methods instead */
  async createProjectDocument(doc: InsertProjectDocument): Promise<ProjectDocument> {
    const [created] = await db.insert(projectDocuments).values(doc).returning();
    return created;
  }

  /** @deprecated Use dealDocuments methods instead */
  async getDocumentsByProjectId(projectId: number): Promise<ProjectDocument[]> {
    return await db.select().from(projectDocuments)
      .where(eq(projectDocuments.projectId, projectId))
      .orderBy(desc(projectDocuments.uploadedAt));
  }

  // Deal documents methods
  async createDealDocument(doc: InsertDealDocument): Promise<DealDocument> {
    const [created] = await db.insert(dealDocuments).values(doc).returning();
    return created;
  }

  async getDealDocumentsByDealId(dealId: number): Promise<DealDocument[]> {
    return await db.select().from(dealDocuments)
      .where(eq(dealDocuments.dealId, dealId))
      .orderBy(desc(dealDocuments.createdAt));
  }

  async getDealDocumentById(documentId: number): Promise<DealDocument | undefined> {
    const [doc] = await db.select().from(dealDocuments)
      .where(eq(dealDocuments.id, documentId));
    return doc;
  }

  async updateDealDocument(id: number, updates: Partial<DealDocument>): Promise<DealDocument | undefined> {
    const [updated] = await db.update(dealDocuments).set(updates).where(eq(dealDocuments.id, id)).returning();
    return updated;
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
  /** @deprecated Use createProjectActivity with isInternal=true instead */
  async createAdminActivity(activity: InsertAdminActivity): Promise<AdminActivity> {
    // Convert to projectActivity with isInternal=true
    const projectActivityData: InsertProjectActivity = {
      projectId: activity.projectId,
      userId: activity.userId,
      activityType: activity.actionType,
      activityDescription: activity.actionDescription,
      metadata: activity.metadata,
      visibleToBorrower: false,
      isInternal: true,
    };
    const [created] = await db.insert(projectActivity).values(projectActivityData).returning();
    return created as AdminActivity;
  }

  /** @deprecated Use queryProjectActivity with isInternal=true instead */
  async getAdminActivityByProjectId(projectId: number): Promise<AdminActivity[]> {
    return await db.select().from(projectActivity)
      .where(and(
        eq(projectActivity.projectId, projectId),
        eq(projectActivity.isInternal, true)
      ))
      .orderBy(desc(projectActivity.createdAt))
      .limit(100) as Promise<AdminActivity[]>;
  }

  /** @deprecated Use queryProjectActivity with isInternal=true instead */
  async getRecentAdminActivity(limit: number = 20): Promise<AdminActivity[]> {
    return await db.select().from(projectActivity)
      .where(eq(projectActivity.isInternal, true))
      .orderBy(desc(projectActivity.createdAt))
      .limit(limit) as Promise<AdminActivity[]>;
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
    }).from(projectTasks).where(
      and(
        sql`${projectTasks.status} != 'completed'`,
        sql`${projectTasks.status} != 'not_applicable'`
      )
    );
    
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

  // Deal Stages methods
  async getAllDealStages(): Promise<DealStage[]> {
    return db.select().from(dealStages).orderBy(asc(dealStages.sortOrder));
  }

  async getDealStageByKey(key: string): Promise<DealStage | undefined> {
    const [stage] = await db.select().from(dealStages).where(eq(dealStages.key, key));
    return stage;
  }

  async createDealStage(stage: InsertDealStage): Promise<DealStage> {
    const [created] = await db.insert(dealStages).values(stage).returning();
    return created;
  }

  async updateDealStage(id: number, updates: Partial<DealStage>): Promise<DealStage | undefined> {
    const [updated] = await db.update(dealStages)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(dealStages.id, id))
      .returning();
    return updated;
  }

  async deleteDealStage(id: number): Promise<void> {
    await db.delete(dealStages).where(eq(dealStages.id, id));
  }

  async updateDealStagesOrder(stageOrders: { id: number; sortOrder: number }[]): Promise<void> {
    for (const { id, sortOrder } of stageOrders) {
      await db.update(dealStages)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(dealStages.id, id));
    }
  }

  async seedDefaultDealStages(): Promise<void> {
    const existing = await db.select().from(dealStages);
    if (existing.length > 0) return;

    const defaultStages: InsertDealStage[] = [
      { key: "new", label: "New", color: "gray", sortOrder: 0 },
      { key: "initial-review", label: "Initial Review", color: "yellow", sortOrder: 1 },
      { key: "under-review", label: "Under Review", color: "orange", sortOrder: 2 },
      { key: "term-sheet", label: "Term Sheet", color: "blue", sortOrder: 3 },
      { key: "approved", label: "Approved", color: "emerald", sortOrder: 4 },
      { key: "processing", label: "Processing", color: "cyan", sortOrder: 5 },
      { key: "underwriting", label: "Underwriting", color: "indigo", sortOrder: 6 },
      { key: "closing", label: "Closing", color: "teal", sortOrder: 7 },
      { key: "funded", label: "Funded", color: "green", sortOrder: 8 },
      { key: "closed", label: "Closed", color: "green", sortOrder: 9 },
      { key: "declined", label: "Declined", color: "red", sortOrder: 10 },
      { key: "withdrawn", label: "Withdrawn", color: "slate", sortOrder: 11 },
    ];

    for (const stage of defaultStages) {
      await db.insert(dealStages).values(stage);
    }
  }

  // Team Permissions methods
  async getPermissionsByRole(role: string): Promise<TeamPermission[]> {
    return await db.select().from(teamPermissions).where(eq(teamPermissions.role, role));
  }

  async getAllPermissions(): Promise<TeamPermission[]> {
    return await db.select().from(teamPermissions);
  }

  async upsertPermission(role: string, permissionKey: string, enabled: boolean, updatedBy: number): Promise<TeamPermission> {
    const existing = await db.select().from(teamPermissions)
      .where(and(eq(teamPermissions.role, role), eq(teamPermissions.permissionKey, permissionKey)));
    
    if (existing.length > 0) {
      const [updated] = await db.update(teamPermissions)
        .set({ enabled, updatedBy, updatedAt: new Date() })
        .where(and(eq(teamPermissions.role, role), eq(teamPermissions.permissionKey, permissionKey)))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(teamPermissions)
        .values({ role, permissionKey, enabled, updatedBy })
        .returning();
      return created;
    }
  }

  async bulkUpsertPermissions(role: string, permissions: { key: string; enabled: boolean }[], updatedBy: number): Promise<void> {
    for (const perm of permissions) {
      await this.upsertPermission(role, perm.key, perm.enabled, updatedBy);
    }
  }

  async initializeDefaultPermissions(): Promise<void> {
    const existing = await db.select().from(teamPermissions).limit(1);
    if (existing.length > 0) {
      const processorExists = await db.select().from(teamPermissions)
        .where(eq(teamPermissions.role, "processor")).limit(1);
      if (processorExists.length === 0) {
        const processorDefaults = PERMISSION_KEYS.map(key => ({
          role: "processor",
          permissionKey: key,
          enabled: key.endsWith(".view") || key === "quotes.create",
        }));
        for (const perm of processorDefaults) {
          await db.insert(teamPermissions).values(perm);
        }
      }
      return;
    }

    const adminDefaults = PERMISSION_KEYS.map(key => ({
      role: "admin",
      permissionKey: key,
      enabled: true,
    }));

    const staffDefaults = PERMISSION_KEYS.map(key => ({
      role: "staff",
      permissionKey: key,
      enabled: key.endsWith(".view") || key === "messages.send" || key === "quotes.create",
    }));

    const processorDefaults = PERMISSION_KEYS.map(key => ({
      role: "processor",
      permissionKey: key,
      enabled: key.endsWith(".view") || key === "quotes.create",
    }));

    for (const perm of [...adminDefaults, ...staffDefaults, ...processorDefaults]) {
      await db.insert(teamPermissions).values(perm);
    }
  }

  async hasPermission(role: string, permissionKey: string): Promise<boolean> {
    if (role === "super_admin") return true;
    if (role === "user") return false;

    const [perm] = await db.select().from(teamPermissions)
      .where(and(eq(teamPermissions.role, role), eq(teamPermissions.permissionKey, permissionKey)));
    
    return perm?.enabled ?? false;
  }

  async hasPermissionMultiRole(roles: string[], permissionKey: string): Promise<boolean> {
    if (roles.includes("super_admin")) return true;
    
    const teamRoles = roles.filter(r => r !== "user" && r !== "super_admin");
    if (teamRoles.length === 0) return false;

    for (const role of teamRoles) {
      const [perm] = await db.select().from(teamPermissions)
        .where(and(eq(teamPermissions.role, role), eq(teamPermissions.permissionKey, permissionKey)));
      if (perm?.enabled) return true;
    }
    return false;
  }

  // Commercial submission methods
  async createCommercialSubmission(data: InsertCommercialSubmission): Promise<CommercialSubmission> {
    const [created] = await db.insert(commercialSubmissions).values(data).returning();
    return created;
  }

  async getCommercialSubmissionById(id: number): Promise<CommercialSubmission | undefined> {
    const [submission] = await db.select().from(commercialSubmissions).where(eq(commercialSubmissions.id, id));
    return submission;
  }

  async getCommercialSubmissionsByUser(userId: number): Promise<CommercialSubmission[]> {
    return db.select().from(commercialSubmissions)
      .where(eq(commercialSubmissions.userId, userId))
      .orderBy(desc(commercialSubmissions.createdAt));
  }

  async getAllCommercialSubmissions(status?: string): Promise<CommercialSubmission[]> {
    if (status) {
      return db.select().from(commercialSubmissions)
        .where(eq(commercialSubmissions.status, status))
        .orderBy(desc(commercialSubmissions.createdAt));
    }
    return db.select().from(commercialSubmissions)
      .orderBy(desc(commercialSubmissions.createdAt));
  }

  async updateCommercialSubmissionStatus(id: number, status: string, adminNotes?: string): Promise<CommercialSubmission | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    const [updated] = await db.update(commercialSubmissions).set(updates)
      .where(eq(commercialSubmissions.id, id)).returning();
    return updated;
  }

  async addCommercialSubmissionDocument(doc: InsertCommercialSubmissionDocument): Promise<CommercialSubmissionDocument> {
    const [created] = await db.insert(commercialSubmissionDocuments).values(doc).returning();
    return created;
  }

  async getCommercialSubmissionDocuments(submissionId: number): Promise<CommercialSubmissionDocument[]> {
    return db.select().from(commercialSubmissionDocuments)
      .where(eq(commercialSubmissionDocuments.submissionId, submissionId));
  }

  async getCommercialSubmissionDocumentById(id: number): Promise<CommercialSubmissionDocument | undefined> {
    const [doc] = await db.select().from(commercialSubmissionDocuments)
      .where(eq(commercialSubmissionDocuments.id, id));
    return doc;
  }

  async deleteCommercialSubmissionDocument(id: number): Promise<void> {
    await db.delete(commercialSubmissionDocuments).where(eq(commercialSubmissionDocuments.id, id));
  }

  async createDocumentReview(review: InsertDocumentReviewResult): Promise<DocumentReviewResult> {
    const [created] = await db.insert(documentReviewResults).values(review).returning();
    return created;
  }

  async getDocumentReviewsByDocumentId(documentId: number): Promise<DocumentReviewResult[]> {
    return db.select().from(documentReviewResults)
      .where(eq(documentReviewResults.documentId, documentId))
      .orderBy(desc(documentReviewResults.reviewedAt));
  }

  async getDocumentReviewsByProjectId(projectId: number): Promise<DocumentReviewResult[]> {
    return db.select().from(documentReviewResults)
      .where(eq(documentReviewResults.projectId, projectId))
      .orderBy(desc(documentReviewResults.reviewedAt));
  }

  async getLatestDocumentReview(documentId: number): Promise<DocumentReviewResult | undefined> {
    const [review] = await db.select().from(documentReviewResults)
      .where(eq(documentReviewResults.documentId, documentId))
      .orderBy(desc(documentReviewResults.reviewedAt))
      .limit(1);
    return review;
  }

  async getReviewRulesByProgramId(programId: number): Promise<ProgramReviewRule[]> {
    return db.select().from(programReviewRules)
      .where(eq(programReviewRules.programId, programId))
      .orderBy(asc(programReviewRules.documentType), asc(programReviewRules.sortOrder));
  }

  async createReviewRules(rules: InsertProgramReviewRule[]): Promise<ProgramReviewRule[]> {
    if (rules.length === 0) return [];
    return db.insert(programReviewRules).values(rules).returning();
  }

  async updateReviewRule(id: number, data: Partial<InsertProgramReviewRule>): Promise<ProgramReviewRule> {
    const [updated] = await db.update(programReviewRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(programReviewRules.id, id))
      .returning();
    return updated;
  }

  async deleteReviewRule(id: number): Promise<void> {
    await db.delete(programReviewRules).where(eq(programReviewRules.id, id));
  }

  async deleteReviewRulesByProgramId(programId: number): Promise<void> {
    await db.delete(programReviewRules).where(eq(programReviewRules.programId, programId));
  }

  async getReviewRulesByDocumentTemplateId(documentTemplateId: number): Promise<ProgramReviewRule[]> {
    return db.select().from(programReviewRules)
      .where(and(eq(programReviewRules.documentTemplateId, documentTemplateId), eq(programReviewRules.isActive, true)))
      .orderBy(asc(programReviewRules.sortOrder));
  }

  async deleteReviewRulesByDocumentTemplateId(documentTemplateId: number): Promise<void> {
    await db.delete(programReviewRules).where(eq(programReviewRules.documentTemplateId, documentTemplateId));
  }

  async getCreditPolicies(): Promise<CreditPolicy[]> {
    return db.select().from(creditPolicies).orderBy(desc(creditPolicies.createdAt));
  }

  async getCreditPolicyById(id: number): Promise<CreditPolicy | undefined> {
    const [policy] = await db.select().from(creditPolicies).where(eq(creditPolicies.id, id));
    return policy;
  }

  async createCreditPolicy(data: InsertCreditPolicy): Promise<CreditPolicy> {
    const [policy] = await db.insert(creditPolicies).values(data).returning();
    return policy;
  }

  async updateCreditPolicy(id: number, data: Partial<InsertCreditPolicy>): Promise<CreditPolicy> {
    const [updated] = await db.update(creditPolicies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(creditPolicies.id, id))
      .returning();
    return updated;
  }

  async deleteCreditPolicy(id: number): Promise<void> {
    await db.delete(creditPolicies).where(eq(creditPolicies.id, id));
  }

  async getReviewRulesByCreditPolicyId(creditPolicyId: number): Promise<ProgramReviewRule[]> {
    return db.select().from(programReviewRules)
      .where(eq(programReviewRules.creditPolicyId, creditPolicyId))
      .orderBy(asc(programReviewRules.documentType), asc(programReviewRules.sortOrder));
  }

  async deleteReviewRulesByCreditPolicyId(creditPolicyId: number): Promise<void> {
    await db.delete(programReviewRules).where(eq(programReviewRules.creditPolicyId, creditPolicyId));
  }

  // Submission Criteria CRUD
  async getSubmissionCriteria(): Promise<SubmissionCriteria[]> {
    return await db.select().from(submissionCriteria).orderBy(asc(submissionCriteria.criteriaType));
  }

  async getSubmissionCriteriaByType(type: string): Promise<SubmissionCriteria | undefined> {
    const [result] = await db.select().from(submissionCriteria).where(eq(submissionCriteria.criteriaType, type));
    return result;
  }

  async createSubmissionCriteria(data: InsertSubmissionCriteria): Promise<SubmissionCriteria> {
    const [created] = await db.insert(submissionCriteria).values(data).returning();
    return created;
  }

  async updateSubmissionCriteria(id: number, data: Partial<InsertSubmissionCriteria>): Promise<SubmissionCriteria> {
    const [updated] = await db.update(submissionCriteria)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(submissionCriteria.id, id))
      .returning();
    return updated;
  }

  async deleteSubmissionCriteria(id: number): Promise<void> {
    await db.delete(submissionCriteria).where(eq(submissionCriteria.id, id));
  }

  // Submission Sponsors CRUD
  async getSubmissionSponsorsBySubmissionId(submissionId: number): Promise<SubmissionSponsor[]> {
    return await db.select().from(submissionSponsors).where(eq(submissionSponsors.submissionId, submissionId));
  }

  async createSubmissionSponsor(data: InsertSubmissionSponsor): Promise<SubmissionSponsor> {
    const [created] = await db.insert(submissionSponsors).values(data).returning();
    return created;
  }

  async deleteSubmissionSponsor(id: number): Promise<void> {
    await db.delete(submissionSponsors).where(eq(submissionSponsors.id, id));
  }

  async deleteSubmissionSponsorsBySubmissionId(submissionId: number): Promise<void> {
    await db.delete(submissionSponsors).where(eq(submissionSponsors.submissionId, submissionId));
  }

  // Submission Fields CRUD
  async getSubmissionFields(dealType?: string): Promise<SubmissionField[]> {
    if (dealType) {
      return await db.select().from(submissionFields)
        .where(or(
          eq(submissionFields.appliesToDealTypes, 'all'),
          sql`${submissionFields.appliesToDealTypes} LIKE ${'%' + dealType + '%'}`
        ))
        .orderBy(asc(submissionFields.fieldOrder));
    }
    return await db.select().from(submissionFields).orderBy(asc(submissionFields.fieldOrder));
  }

  async getSubmissionFieldById(id: number): Promise<SubmissionField | undefined> {
    const [field] = await db.select().from(submissionFields).where(eq(submissionFields.id, id));
    return field;
  }

  async createSubmissionField(data: InsertSubmissionField): Promise<SubmissionField> {
    const [created] = await db.insert(submissionFields).values(data).returning();
    return created;
  }

  async updateSubmissionField(id: number, data: Partial<InsertSubmissionField>): Promise<SubmissionField> {
    const [updated] = await db.update(submissionFields)
      .set(data)
      .where(eq(submissionFields.id, id))
      .returning();
    return updated;
  }

  async deleteSubmissionField(id: number): Promise<void> {
    await db.delete(submissionFields).where(eq(submissionFields.id, id));
  }

  // Submission Field Responses CRUD
  async getSubmissionFieldResponses(submissionId: number): Promise<SubmissionFieldResponse[]> {
    return await db.select().from(submissionFieldResponses).where(eq(submissionFieldResponses.submissionId, submissionId));
  }

  async createSubmissionFieldResponse(data: InsertSubmissionFieldResponse): Promise<SubmissionFieldResponse> {
    const [created] = await db.insert(submissionFieldResponses).values(data).returning();
    return created;
  }

  async deleteSubmissionFieldResponsesBySubmissionId(submissionId: number): Promise<void> {
    await db.delete(submissionFieldResponses).where(eq(submissionFieldResponses.submissionId, submissionId));
  }

  // Submission Document Requirements CRUD
  async getSubmissionDocumentRequirements(dealType?: string): Promise<SubmissionDocumentRequirement[]> {
    if (dealType) {
      return await db.select().from(submissionDocumentRequirements)
        .where(or(
          eq(submissionDocumentRequirements.dealType, 'all'),
          eq(submissionDocumentRequirements.dealType, dealType)
        ))
        .orderBy(asc(submissionDocumentRequirements.displayOrder));
    }
    return await db.select().from(submissionDocumentRequirements).orderBy(asc(submissionDocumentRequirements.displayOrder));
  }

  async getSubmissionDocumentRequirementById(id: number): Promise<SubmissionDocumentRequirement | undefined> {
    const [req] = await db.select().from(submissionDocumentRequirements).where(eq(submissionDocumentRequirements.id, id));
    return req;
  }

  async createSubmissionDocumentRequirement(data: InsertSubmissionDocumentRequirement): Promise<SubmissionDocumentRequirement> {
    const [created] = await db.insert(submissionDocumentRequirements).values(data).returning();
    return created;
  }

  async updateSubmissionDocumentRequirement(id: number, data: Partial<InsertSubmissionDocumentRequirement>): Promise<SubmissionDocumentRequirement> {
    const [updated] = await db.update(submissionDocumentRequirements)
      .set(data)
      .where(eq(submissionDocumentRequirements.id, id))
      .returning();
    return updated;
  }

  async deleteSubmissionDocumentRequirement(id: number): Promise<void> {
    await db.delete(submissionDocumentRequirements).where(eq(submissionDocumentRequirements.id, id));
  }

  // Submission Review Rules CRUD
  async getSubmissionReviewRules(category?: string): Promise<SubmissionReviewRule[]> {
    if (category) {
      return await db.select().from(submissionReviewRules)
        .where(eq(submissionReviewRules.ruleCategory, category))
        .orderBy(asc(submissionReviewRules.rulePriority));
    }
    return await db.select().from(submissionReviewRules).orderBy(asc(submissionReviewRules.rulePriority));
  }

  async getSubmissionReviewRuleById(id: number): Promise<SubmissionReviewRule | undefined> {
    const [rule] = await db.select().from(submissionReviewRules).where(eq(submissionReviewRules.id, id));
    return rule;
  }

  async createSubmissionReviewRule(data: InsertSubmissionReviewRule): Promise<SubmissionReviewRule> {
    const [created] = await db.insert(submissionReviewRules).values(data).returning();
    return created;
  }

  async updateSubmissionReviewRule(id: number, data: Partial<InsertSubmissionReviewRule>): Promise<SubmissionReviewRule> {
    const [updated] = await db.update(submissionReviewRules)
      .set(data)
      .where(eq(submissionReviewRules.id, id))
      .returning();
    return updated;
  }

  async deleteSubmissionReviewRule(id: number): Promise<void> {
    await db.delete(submissionReviewRules).where(eq(submissionReviewRules.id, id));
  }

  // Submission AI Reviews CRUD
  async getSubmissionAiReviews(submissionId: number): Promise<SubmissionAiReview[]> {
    return await db.select().from(submissionAiReviews)
      .where(eq(submissionAiReviews.submissionId, submissionId))
      .orderBy(desc(submissionAiReviews.createdAt));
  }

  async createSubmissionAiReview(data: InsertSubmissionAiReview): Promise<SubmissionAiReview> {
    const [created] = await db.insert(submissionAiReviews).values(data).returning();
    return created;
  }

  // Submission Notes CRUD
  async getSubmissionNotes(submissionId: number): Promise<SubmissionNote[]> {
    return await db.select().from(submissionNotes)
      .where(eq(submissionNotes.submissionId, submissionId))
      .orderBy(desc(submissionNotes.createdAt));
  }

  async createSubmissionNote(data: InsertSubmissionNote): Promise<SubmissionNote> {
    const [created] = await db.insert(submissionNotes).values(data).returning();
    return created;
  }

  // Submission Notifications CRUD
  async getSubmissionNotifications(submissionId: number): Promise<SubmissionNotification[]> {
    return await db.select().from(submissionNotifications)
      .where(eq(submissionNotifications.submissionId, submissionId))
      .orderBy(desc(submissionNotifications.sentAt));
  }

  async createSubmissionNotification(data: InsertSubmissionNotification): Promise<SubmissionNotification> {
    const [created] = await db.insert(submissionNotifications).values(data).returning();
    return created;
  }

  // Enhanced commercial submission methods
  async updateCommercialSubmission(id: number, data: Partial<CommercialSubmission>): Promise<CommercialSubmission | undefined> {
    const [updated] = await db.update(commercialSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(commercialSubmissions.id, id))
      .returning();
    return updated;
  }

  async getCommercialSubmissionsByStatus(statuses: string[]): Promise<CommercialSubmission[]> {
    return await db.select().from(commercialSubmissions)
      .where(inArray(commercialSubmissions.status, statuses))
      .orderBy(desc(commercialSubmissions.createdAt));
  }
}

export const storage = new DatabaseStorage();

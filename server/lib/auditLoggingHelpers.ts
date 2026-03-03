/**
 * Week 3: Audit Logging Helper Functions
 * These helpers are injected throughout routes.ts to log all critical operations
 */

import { createAuditLog, logUserAction, AuditActions, ResourceTypes } from '../utils/audit';

/**
 * Log user creation
 * Call after: POST /api/admin/users
 */
export async function logUserCreated(
  db: any,
  req: any,
  userId: number,
  newUserData: any
) {
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.USER_CREATED,
    resourceType: ResourceTypes.USER,
    resourceId: String(userId),
    newValues: {
      email: newUserData.email,
      role: newUserData.role,
      status: 'active',
    },
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });
}

/**
 * Log user update
 * Call after: PATCH /api/admin/users/:id
 */
export async function logUserUpdated(
  db: any,
  req: any,
  userId: number,
  oldData: any,
  newData: any
) {
  const changes: Record<string, any> = {};
  const oldValues: Record<string, any> = {};

  // Track only changed fields
  for (const key of ['email', 'role', 'status', 'firstName', 'lastName']) {
    if (oldData[key] !== newData[key]) {
      changes[key] = newData[key];
      oldValues[key] = oldData[key];
    }
  }

  if (Object.keys(changes).length > 0) {
    await createAuditLog(db, {
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: AuditActions.USER_UPDATED,
      resourceType: ResourceTypes.USER,
      resourceId: String(userId),
      oldValues,
      newValues: changes,
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      success: true,
    });
  }
}

/**
 * Log user deletion
 * Call before: DELETE /api/admin/users/:id
 */
export async function logUserDeleted(
  db: any,
  req: any,
  userId: number,
  userData: any
) {
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.USER_DELETED,
    resourceType: ResourceTypes.USER,
    resourceId: String(userId),
    oldValues: {
      email: userData.email,
      role: userData.role,
    },
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });
}

/**
 * Log deal creation
 * Call after: POST /api/admin/deals
 */
export async function logDealCreated(
  db: any,
  req: any,
  dealId: number,
  dealData: any
) {
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.DEAL_CREATED,
    resourceType: ResourceTypes.DEAL,
    resourceId: String(dealId),
    newValues: {
      loanNumber: dealData.loanNumber,
      borrower: dealData.borrowerName,
      amount: dealData.loanAmount,
      status: dealData.status,
    },
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });
}

/**
 * Log deal update
 * Call after: PATCH /api/admin/deals/:id
 */
export async function logDealUpdated(
  db: any,
  req: any,
  dealId: number,
  oldData: any,
  newData: any
) {
  const changes: Record<string, any> = {};
  const oldValues: Record<string, any> = {};

  // Track important fields
  for (const key of ['status', 'stage', 'loanAmount', 'borrowerName', 'propertyAddress']) {
    if (oldData[key] !== newData[key]) {
      changes[key] = newData[key];
      oldValues[key] = oldData[key];
    }
  }

  if (Object.keys(changes).length > 0) {
    await createAuditLog(db, {
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: AuditActions.DEAL_UPDATED,
      resourceType: ResourceTypes.DEAL,
      resourceId: String(dealId),
      oldValues,
      newValues: changes,
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      success: true,
    });
  }
}

/**
 * Log document upload
 * Call after: POST /api/admin/deals/:dealId/documents/:docId/upload-complete
 */
export async function logDocumentUploaded(
  db: any,
  req: any,
  documentId: number,
  docName: string
) {
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.DOCUMENT_UPLOADED,
    resourceType: ResourceTypes.DOCUMENT,
    resourceId: String(documentId),
    newValues: {
      name: docName,
      status: 'uploaded',
    },
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });
}

/**
 * Log document download
 * Call when: Document is downloaded
 */
export async function logDocumentDownloaded(
  db: any,
  req: any,
  documentId: number,
  docName: string
) {
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.DOCUMENT_DOWNLOADED,
    resourceType: ResourceTypes.DOCUMENT,
    resourceId: String(documentId),
    newValues: {
      name: docName,
      downloadedAt: new Date().toISOString(),
    },
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });
}

/**
 * Log document signed
 * Call after: Document is signed by signer
 */
export async function logDocumentSigned(
  db: any,
  req: any,
  documentId: number,
  signerId: number
) {
  await createAuditLog(db, {
    userId: signerId,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.DOCUMENT_SIGNED,
    resourceType: ResourceTypes.DOCUMENT,
    resourceId: String(documentId),
    newValues: {
      status: 'signed',
      signedAt: new Date().toISOString(),
    },
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });
}

/**
 * Log system configuration change
 * Call after: Config endpoints (stages, programs, workflows, etc.)
 */
export async function logConfigChanged(
  db: any,
  req: any,
  action: string,
  resourceType: string,
  resourceId: string,
  oldData: any,
  newData: any
) {
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action,
    resourceType,
    resourceId,
    oldValues: oldData,
    newValues: newData,
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });
}

/**
 * Log operation failure
 * Call on error: For tracking failed operations
 */
export async function logOperationFailed(
  db: any,
  req: any,
  action: string,
  resourceType: string,
  resourceId: string,
  errorMessage: string
) {
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action,
    resourceType,
    resourceId,
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: false,
    errorMessage,
  });
}

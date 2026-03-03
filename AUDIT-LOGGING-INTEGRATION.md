# Audit Logging Integration Guide

## Overview

Week 3 implements comprehensive audit logging for SOC 2 compliance. This guide explains where and how to add audit logging calls throughout the application.

## Infrastructure Available

### 1. Core Audit Utilities
**File:** `server/utils/audit.ts`

```typescript
// Main function for all audit logging
await createAuditLog(db, {
  userId: number | null,
  userEmail: string | null,
  userRole: string | null,
  action: string,                    // Use AuditActions constants
  resourceType: string,               // Use ResourceTypes constants
  resourceId: string,
  oldValues: Record<string, any>,    // For updates - previous state
  newValues: Record<string, any>,    // For creates/updates - new state
  ipAddress: string,                 // Use getClientIp(req)
  userAgent: string,                 // req.headers['user-agent']
  success: boolean,
  errorMessage?: string,
});
```

### 2. Helper Functions
**File:** `server/lib/auditLoggingHelpers.ts`

Pre-built helpers for common operations:
- `logUserCreated()` - User creation
- `logUserUpdated()` - User modification
- `logUserDeleted()` - User deletion
- `logDealCreated()` - Deal creation
- `logDealUpdated()` - Deal modification
- `logDocumentUploaded()` - Document upload
- `logDocumentDownloaded()` - Document download
- `logDocumentSigned()` - Document signing
- `logConfigChanged()` - Configuration changes
- `logOperationFailed()` - Failure tracking

### 3. Constants
**File:** `server/utils/audit.ts`

```typescript
AuditActions.USER_CREATED         // 'user.created'
AuditActions.USER_UPDATED         // 'user.updated'
AuditActions.USER_DELETED         // 'user.deleted'
AuditActions.DEAL_CREATED         // 'deal.created'
AuditActions.DEAL_UPDATED         // 'deal.updated'
AuditActions.DOCUMENT_UPLOADED    // 'document.uploaded'
AuditActions.DOCUMENT_DOWNLOADED  // 'document.downloaded'
AuditActions.DOCUMENT_SIGNED      // 'document.signed'
// ... and more

ResourceTypes.USER                 // 'user'
ResourceTypes.DEAL                 // 'deal'
ResourceTypes.DOCUMENT             // 'document'
// ... and more
```

### 4. Audit Routes
**File:** `server/routes/audit.ts`

Available endpoints (super-admin only):
- `GET /api/admin/audit-logs` - Query with filters
- `GET /api/admin/audit-logs/:id` - Single entry
- `GET /api/admin/audit-logs/export` - CSV export
- `GET /api/admin/audit-logs/user/:userId` - User history

---

## Implementation Guide

### Pattern 1: Simple Operation Logging

For CRUD operations, log immediately after success:

```typescript
// In your route handler
try {
  // ... create/update/delete operation ...

  // Log the operation
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.USER_CREATED,
    resourceType: ResourceTypes.USER,
    resourceId: String(newUserId),
    newValues: {
      email: userData.email,
      role: userData.role,
    },
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    success: true,
  });

  res.json({ success: true, id: newUserId });
} catch (error) {
  // Log the failure
  await createAuditLog(db, {
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: AuditActions.USER_CREATED,
    resourceType: ResourceTypes.USER,
    resourceId: String(userId),
    success: false,
    errorMessage: error.message,
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
  });

  res.status(500).json({ error: error.message });
}
```

### Pattern 2: Using Helper Functions

For common operations, use pre-built helpers:

```typescript
import { logUserCreated, logDealUpdated } from '../lib/auditLoggingHelpers';

// After creating user:
await logUserCreated(db, req, newUserId, newUserData);

// After updating deal:
await logDealUpdated(db, req, dealId, oldDealData, newDealData);
```

### Pattern 3: Change Tracking (Before/After)

For updates, capture what changed:

```typescript
// Fetch old data first
const oldUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);

// Make changes
await db.update(users).set({ role: newRole });

// Log with before/after
await createAuditLog(db, {
  ...authContext,
  action: AuditActions.USER_UPDATED,
  resourceType: ResourceTypes.USER,
  resourceId: String(userId),
  oldValues: {
    role: oldUser[0].role,
    email: oldUser[0].email,
  },
  newValues: {
    role: newRole,
    email: newUser.email,
  },
  success: true,
});
```

### Pattern 4: Data Access Logging

For sensitive operations like downloads or views:

```typescript
// Log document download
await createAuditLog(db, {
  userId: req.user?.id,
  userEmail: req.user?.email,
  userRole: req.user?.role,
  action: AuditActions.DOCUMENT_DOWNLOADED,
  resourceType: ResourceTypes.DOCUMENT,
  resourceId: String(documentId),
  newValues: {
    documentName: doc.name,
    downloadedAt: new Date().toISOString(),
  },
  ipAddress: req.clientIp,
  userAgent: req.headers['user-agent'],
  success: true,
});
```

---

## Critical Operations to Log

### User Management (HIGH PRIORITY)
**File:** `server/routes.ts`

1. **POST /api/admin/users** (line ~4500)
   - Add: `await logUserCreated(db, req, userId, userData);`

2. **PATCH /api/admin/users/:id** (line ~4769)
   - Add: `await logUserUpdated(db, req, userId, oldData, newData);`

3. **DELETE /api/admin/users/:id** (line ~4830)
   - Add: `await logUserDeleted(db, req, userId, userData);`

### Deal Management (HIGH PRIORITY)
**File:** `server/routes.ts`

1. **POST /api/admin/deals** (line ~6469)
   - Add: `await logDealCreated(db, req, dealId, dealData);`

2. **PATCH /api/admin/deals/:id** (line ~7999)
   - Add: `await logDealUpdated(db, req, dealId, oldData, newData);`

3. **Deal property operations** (lines ~6860-6919)
   - Add: Log property create/update/delete

4. **Deal task operations** (lines ~8409-8523)
   - Add: Log task create/update/delete

### Document Management (MEDIUM PRIORITY)
**File:** `server/routes.ts`

1. **Document upload completion** (line ~7600)
   - Add: `await logDocumentUploaded(db, req, docId, docName);`

2. **Document downloads** (line ~2206)
   - Add: `await logDocumentDownloaded(db, req, docId, docName);`

3. **Document signing**
   - Add: `await logDocumentSigned(db, req, docId, signerId);`

4. **Document deletion** (line ~7765)
   - Add: Log document deletion

### System Configuration (MEDIUM PRIORITY)
**File:** `server/routes.ts`

1. **Deal stage creation/modification** (lines ~5897-5989)
   - Add: `await logConfigChanged(db, req, AuditActions.CONFIG_STAGE_CREATED, ...);`

2. **Loan program updates**
   - Add: Log program modifications

3. **Document template changes**
   - Add: Log template updates

4. **Workflow configuration**
   - Add: Log workflow changes

---

## Request Context

All handlers have access to:
- `req.user?.id` - Current user ID
- `req.user?.email` - Current user email
- `req.user?.role` - Current user role
- `req.clientIp` - Client IP (from `getClientIp(req)`)
- `req.headers['user-agent']` - Browser/app info

---

## Error Handling

Audit log failures should NOT break the main operation:

```typescript
try {
  await createAuditLog(db, { /* ... */ });
} catch (auditError) {
  console.error('Audit log write failed:', auditError);
  // Don't throw - let main operation succeed
}
```

This is handled automatically in `createAuditLog()`.

---

## Testing Audit Logs

### Create a user and check logs
```bash
curl -X POST http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"processor"}'

# Query audit logs
curl "http://localhost:5000/api/admin/audit-logs?action=user.created" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Export audit logs to CSV
```bash
curl "http://localhost:5000/api/admin/audit-logs/export" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  > audit-report.csv
```

### Check user activity
```bash
curl "http://localhost:5000/api/admin/audit-logs/user/123" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## Next Steps

1. **Add logging to user operations** - Start here (highest SOC 2 impact)
2. **Add logging to deal operations** - Critical for compliance
3. **Add logging to document operations** - Important for document tracking
4. **Add logging to configuration changes** - System integrity
5. **Test each operation** - Verify logs are being created
6. **Export audit logs** - Verify CSV export works for auditors

---

## Architecture Notes

**Immutable Audit Trail:**
- Audit logs are insert-only (never updated or deleted)
- Prevents tampering or deletion of compliance records
- Safe for regulatory audits

**Performance:**
- Audit logging is non-blocking (async)
- Failures don't affect main operations
- Queries are indexed on userId, timestamp, action

**Compliance:**
- Tracks WHO made changes (userId, email, IP)
- Tracks WHAT was changed (oldValues, newValues)
- Tracks WHEN changes occurred (timestamp)
- Tracks WHERE from (IP address, user agent)
- Tracks WHETHER it succeeded (success flag)

---

## Related Files

- `server/utils/audit.ts` - Core utility functions
- `server/lib/auditLoggingHelpers.ts` - Helper functions for common operations
- `server/routes/audit.ts` - Audit log query/export endpoints
- `shared/schema.ts` (lines 3758-3781) - auditLogs table definition

# Audit Logging Policy

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Audit Log Scope & Objectives
2. Audit Log Contents
3. Immutability Guarantee
4. Retention & Archival
5. Access Control
6. Export & Reporting
7. Monitoring & Alerts
8. Compliance Mapping

---

## 1. Audit Log Scope & Objectives

### 1.1 Purpose of Audit Logging

Audit logs provide a complete, immutable record of all significant system activities, enabling:

- **Security Monitoring:** Detect unauthorized access and suspicious activity
- **Compliance Verification:** Demonstrate controls to regulators and auditors
- **Incident Investigation:** Reconstruct events during security incidents
- **User Accountability:** Track who did what, when, and from where
- **Data Integrity:** Verify data hasn't been tampered with or altered
- **Operational Audit:** Monitor system health and performance

### 1.2 Scope of Logged Activities

**Always Logged:**

User Management Operations:
- User creation (email, role, department)
- User modification (any field changed)
- User deletion (email, role at time of deletion)
- User role changes (old role → new role)
- User status changes (active → inactive, locked, etc.)
- Password resets (by admin or user)
- Account unlocks (by admin)

Deal/Project Operations:
- Deal creation (loan number, amount, borrower)
- Deal modification (any field changed)
- Deal deletion (deal number, status)
- Deal status changes (qualification → processing → closing)
- Deal stage changes (within current status)
- Deal property operations (add, update, delete)
- Deal task operations (create, complete, assign)
- Deal assignments (assign user, unassign user)

Document Operations:
- Document upload (filename, size, type)
- Document download (who, when, which document)
- Document viewing/access (timestamp, duration)
- Document signing (who signed, when, digitally signed by)
- Document approval/rejection (who, reason if provided)
- Document deletion (filename, associated deal)
- Signer operations (add signer, remove signer, signer status)

Access Control Operations:
- Login attempts (success and failure)
- Logout events (normal and forced)
- Permission changes (role updated, permission granted/revoked)
- API key creation and revocation
- OAuth token connection/disconnection
- Failed authorization attempts (access denied)
- Account lockouts (triggered by 5 failed attempts)

Configuration Changes:
- Deal stage creation/modification/deletion
- Loan program updates
- Document template changes
- Workflow configuration changes
- System settings modifications
- Security policy modifications

Data Access Operations:
- Data exports (what data, to whom, when)
- Report generation (type, date range, who)
- Sensitive data downloads/access

**NOT Logged (by Design):**
- Password values (only reset event)
- API key values (only creation/revocation)
- Encryption key access (infrastructure level)
- System internal operations (garbage collection, caching, etc.)
- Read-only views (document viewing optional, see above)
- Automated background jobs (unless they modify data)

---

## 2. Audit Log Contents

### 2.1 Standard Audit Log Fields

Every audit log entry contains:

| Field | Type | Example | Purpose |
|-------|------|---------|---------|
| id | Integer | 12345 | Unique identifier |
| timestamp | ISO 8601 | 2026-03-03T14:30:00.123Z | When action occurred (UTC) |
| userId | Integer | 42 | Who made the action |
| userEmail | String | admin@lendry.com | Who made the action (email) |
| userRole | String | super_admin | What permissions they had |
| action | String | user.created | What action was taken |
| resourceType | String | user | What type of object |
| resourceId | String | 789 | Which specific object |
| oldValues | JSON | {"role": "processor"} | Previous state (updates only) |
| newValues | JSON | {"role": "admin"} | New state (creates/updates) |
| ipAddress | String | 192.168.1.100 | From where (client IP) |
| userAgent | String | Mozilla/5.0... | What device/browser |
| statusCode | Integer | 200 | HTTP response status |
| success | Boolean | true | Did it succeed |
| errorMessage | String | null | Why it failed (if applicable) |

### 2.2 Action Constants

Standardized action names prevent typos and ensure consistency:

**User Management Actions:**
- `user.created` - New user account created
- `user.updated` - User details modified
- `user.deleted` - User account deleted
- `user.role_changed` - User role changed
- `user.status_changed` - User status changed (active/inactive)
- `user.password_reset` - Password reset by admin or user

**Deal Management Actions:**
- `deal.created` - New deal created
- `deal.updated` - Deal details modified
- `deal.deleted` - Deal deleted
- `deal.stage_changed` - Deal moved to different stage
- `deal.status_changed` - Deal status changed
- `deal.property_added` - Property added to deal
- `deal.property_updated` - Property details modified
- `deal.property_deleted` - Property removed from deal
- `deal.task_created` - Task created for deal
- `deal.task_updated` - Task details modified
- `deal.task_deleted` - Task removed from deal

**Document Actions:**
- `document.uploaded` - Document file uploaded
- `document.viewed` - Document viewed by user
- `document.downloaded` - Document downloaded
- `document.signed` - Document signed
- `document.deleted` - Document deleted
- `document.approved` - Document approved
- `document.rejected` - Document rejected

**System Configuration:**
- `config.stage_created` - Deal stage created
- `config.stage_updated` - Deal stage modified
- `config.stage_deleted` - Deal stage deleted
- `config.program_updated` - Loan program updated
- `config.workflow_changed` - Workflow configuration changed
- `config.template_updated` - Document template updated

**Authentication:**
- `auth.login_success` - User successfully logged in
- `auth.login_failed` - Failed login attempt
- `auth.logout` - User logged out
- `auth.password_changed` - User changed password
- `auth.account_locked` - Account locked (5 failed attempts)

### 2.3 Change Tracking (oldValues & newValues)

For update operations, both old and new values are captured:

**Example: User Role Change**
```json
{
  "action": "user.role_changed",
  "oldValues": {
    "role": "processor"
  },
  "newValues": {
    "role": "admin"
  }
}
```

**Example: Deal Status Update**
```json
{
  "action": "deal.status_changed",
  "oldValues": {
    "status": "qualification",
    "assignedTo": 42
  },
  "newValues": {
    "status": "processing",
    "assignedTo": 43
  }
}
```

**Benefits:**
- Shows exactly what changed
- Enables before/after comparison
- Critical for compliance audits
- Helps with incident investigation

---

## 3. Immutability Guarantee

### 3.1 Immutable Append-Only Pattern

**Design Principle:** Audit logs can NEVER be modified or deleted after creation

**Implementation:**
- Audit logs stored in immutable database table
- No UPDATE statements allowed on audit logs
- No DELETE statements allowed on audit logs
- Only INSERT (append) operations permitted
- Database constraints prevent modifications

**SQL Definition:**
```sql
CREATE TABLE auditLogs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  userId INTEGER,
  userEmail VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  resourceType VARCHAR(100),
  resourceId VARCHAR(255),
  oldValues JSONB,
  newValues JSONB,
  ipAddress INET,
  userAgent TEXT,
  statusCode INTEGER,
  success BOOLEAN NOT NULL,
  errorMessage TEXT,

  -- Indexes for fast querying
  INDEX idx_userId (userId),
  INDEX idx_timestamp (timestamp),
  INDEX idx_action (action),

  -- Prevent modifications
  CONSTRAINT no_updates CHECK (ctid IS NOT NULL)
);
```

### 3.2 Tamper Detection

**What We Prevent:**
- Unauthorized modification of past logs
- Deletion of logs covering unauthorized access
- Alteration of timestamps or user information
- Injection of fake audit entries

**How We Prevent It:**
- Database constraints enforce immutability
- Application layer also validates (defense in depth)
- Any attempted modification fails with database error
- Unauthorized modification attempts are themselves logged

**Verification:**
- Regular integrity checks on audit logs
- Hash verification of audit entries (optional enhancement)
- Comparison with backup copies
- External auditor review of logs

### 3.3 Rationale for Immutability

**Regulatory Requirement:**
- SOC 2 Type II requires immutable audit trail
- GDPR requires audit trail of data access/modification
- HIPAA requires tamper-proof access logs
- PCI-DSS requires immutable access logs

**Security Rationale:**
- Prevents attacker from covering their tracks
- Ensures compliance evidence cannot be altered
- Provides trustworthy evidence for incident investigation
- Enables non-repudiation (user cannot deny action)

---

## 4. Retention & Archival

### 4.1 Retention Timeline

**Standard Retention:** 7 years
**Justification:** Regulatory requirement for financial services

**Retention Schedule:**
- **0-2 years:** Hot storage (online database)
- **2-7 years:** Cold storage (archived, less frequently accessed)
- **After 7 years:** Automated deletion (unless legal hold)

### 4.2 Archival Strategy

**Transition to Archive (After 2 Years):**
1. Extract audit logs older than 2 years
2. Compress logs (zip/gzip format)
3. Encrypt archive with backup encryption key
4. Copy to cold storage (S3 Glacier, tape, etc.)
5. Verify integrity before deletion from hot storage
6. Delete from hot database

**Archive Characteristics:**
- Encrypted for security
- Compressed to reduce storage cost
- Indexed for retrieval
- Verified for integrity
- Accessible within 4-24 hours if needed

**Cost Considerations:**
- Hot storage: ~$0.023 per GB/month (all 7 years online)
- Cold storage: ~$0.004 per GB/month (archive only)
- Estimated: $50-100/month for 7 years of logs

### 4.3 Deletion Policy

**Automatic Deletion:**
- Audit logs automatically deleted after 7 years
- Deletion occurs on configured schedule (e.g., quarterly)
- Deletion logged in system events (who, when, which logs)
- Backup copies also deleted after 7 years

**Manual Deletion (Exceptional):**
- ONLY under legal order or regulatory requirement
- Requires written authorization from Legal
- Requires CEO approval
- Entire deletion recorded and retained
- Third-party audit of deletion process

**Legal Hold (Preservation):**
- Legal team can place hold on specific logs
- Prevents automatic deletion during hold period
- Hold documented in system
- Hold lifted when litigation/investigation concludes
- Deleted after legal hold lifted (still subject to 7-year max)

---

## 5. Access Control for Audit Logs

### 5.1 Who Can View Audit Logs

**Super-Admin Only:**
- Full access to all audit logs
- Can query by any field
- Can export all logs
- Can view other users' activities

**Regular Users:**
- Can view own activity only (GET /api/admin/audit-logs/user/self)
- Cannot view other users' activities
- Cannot export logs

**Non-Authenticated Users:**
- Cannot access audit logs at all
- All attempts logged with 403 Forbidden

### 5.2 Query Endpoints

**GET /api/admin/audit-logs** (Super-admin only)
- Query filters: userId, action, resourceType, resourceId, dateRange, success
- Pagination: limit (50-500), offset
- Returns: Array of matching audit logs with metadata
- Use: Admin dashboard, audit log viewer
- Rate limit: 100 requests/minute (prevents abuse)

**GET /api/admin/audit-logs/:id** (Super-admin only)
- Returns: Single audit log entry with full details
- Includes: Parsed JSON oldValues and newValues
- Use: Investigating specific event, compliance review
- Rate limit: 1000 requests/minute

**GET /api/admin/audit-logs/export** (Super-admin only)
- Returns: CSV file download
- Filters: Same as search endpoint
- Format: CSV with 13 columns
- Max records: 10,000 per export (larger exports via multiple calls)
- Use: Monthly reports, external auditor access

**GET /api/admin/audit-logs/user/:userId** (User or Super-admin)
- User: Can only view own logs (/audit-logs/user/self)
- Super-admin: Can view any user (/audit-logs/user/123)
- Returns: Activity history with pagination
- Use: User activity review, access monitoring

### 5.3 Authorization Checks

Every request to audit endpoints must:
1. Verify user is authenticated
2. Verify user has super_admin role (except user history)
3. For user history: Verify requesting user is owner or super-admin
4. Log all access attempts (success and failure)
5. Rate limit to prevent abuse

**Code Location:** `server/routes/audit.ts` - All endpoints

---

## 6. Export & Reporting

### 6.1 CSV Export Format

**Columns (13 total):**
1. `timestamp` - ISO 8601 format, UTC
2. `userId` - User who made action
3. `userEmail` - User email
4. `userRole` - User role at time of action
5. `action` - Action taken
6. `resourceType` - Type of object
7. `resourceId` - ID of object
8. `ipAddress` - Client IP address
9. `userAgent` - Browser/device info
10. `statusCode` - HTTP response status
11. `success` - true/false
12. `errorMessage` - Error if failed
13. `values` - JSON of oldValues + newValues

### 6.2 CSV Escaping & Safety

**Escaping Rules:**
- Fields with commas enclosed in quotes
- Fields with quotes escaped with double quotes
- Special characters preserved
- Safe for import into Excel/Sheets

**Example Row:**
```
2026-03-03T14:30:00.123Z,42,admin@lendry.com,super_admin,user.created,user,789,192.168.1.100,Mozilla/5.0,200,true,,"{""email"":""new@example.com"",""role"":""processor""}"
```

### 6.3 Export Use Cases

**Monthly Compliance Report:**
- Super-admin exports all logs for current month
- Email to external auditor
- Auditor verifies control implementation
- Logs attached to SOC 2 Type II report

**Incident Investigation:**
- Security team exports logs for specific date range
- Filters by suspicious user/IP
- Analyzes before/after values
- Reconstructs event timeline

**User Access Review:**
- Manager exports logs for their team
- Reviews what users accessed
- Identifies unusual patterns
- Documents access review results

---

## 7. Monitoring & Alerts

### 7.1 Automated Monitoring

**What We Monitor:**
- Failed authentication attempts (multiple failures)
- Bulk operations (delete many users, export large datasets)
- Unusual access times (off-hours access)
- Sensitive data access (document downloads, exports)
- Permission changes (role escalation, permission grants)
- System configuration changes (security-related)

**Alert Triggers (P0):**
- Audit log deletion attempt (DELETE on auditLogs table)
- Audit log tampering (UPDATE on auditLogs table)
- 10+ failed authentication from same IP in 1 hour
- Super-admin account created unexpectedly
- Password reset for super-admin account

**Alert Triggers (P1):**
- 5+ failed authentication in 15 minutes (less than P0)
- Bulk user deletion (>10 users in 1 hour)
- Bulk data export (>1GB in 1 hour)
- Permission escalation (processor → admin)
- Unusual API rate limiting violations

### 7.2 Alert Routing

**P0 Alerts:**
- Email to Security Team + CEO
- Slack notification in #security-incidents
- PagerDuty escalation (if integrated)

**P1 Alerts:**
- Email to Security Team
- Slack notification in #security-alerts
- Daily summary to manager

---

## 8. Compliance Mapping

### 8.1 SOC 2 Trust Service Criteria

**CC-7.1: System Monitoring (Logging)**
- ✓ All user actions logged with timestamp
- ✓ Audit logs contain who/what/when/where
- ✓ Immutable append-only design prevents tampering
- ✓ 7-year retention meets audit requirements

**CC-7.2: System Monitoring & Data Alteration**
- ✓ All data modifications logged (oldValues/newValues)
- ✓ User identity captured for every action
- ✓ IP address and user agent recorded
- ✓ Success/failure of operations tracked

**C-1.1 & C-1.2: Logical Access Controls**
- ✓ Access attempts logged (login success/failure)
- ✓ Unauthorized access tracked (failed authorizations)
- ✓ Permission changes logged
- ✓ User accountability demonstrated

### 8.2 Regulatory Compliance

**GDPR (EU General Data Protection Regulation):**
- ✓ Audit trails of data access and modifications
- ✓ Right to audit our access to user data
- ✓ Data breach investigation capability

**HIPAA (Health Insurance Portability & Accountability):**
- ✓ Immutable access logs (164.312(b))
- ✓ Accountability and audit (164.308)
- ✓ 6-year retention (exceeds HIPAA's required)

**PCI-DSS (Payment Card Industry Data Security Standard):**
- ✓ Requirement 10: User access logging and monitoring
- ✓ Requirement 10.7: Logs retained for at least 1 year

---

## Related Documents

- SECURITY-POLICY.md - Overall security framework
- INCIDENT-RESPONSE-PLAN.md - Using logs for incident investigation
- COMPLIANCE-CHECKLIST.md - SOC 2 compliance verification
- AUDIT-LOGGING-INTEGRATION.md - Developer integration guide

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Approval:** Security Team

# SOC 2 Type II Audit Procedures Guide

**Document Version**: 1.0
**Last Updated**: 2026-03-04
**Classification**: Internal Use Only

---

## Table of Contents

1. [Introduction](#introduction)
2. [Audit Access & Credentials](#audit-access--credentials)
3. [Audit Endpoints](#audit-endpoints)
4. [Evidence Collection Procedures](#evidence-collection-procedures)
5. [Control Assessment Procedures](#control-assessment-procedures)
6. [Report Generation](#report-generation)
7. [Compliance Dashboard](#compliance-dashboard)
8. [Risk Assessment Procedures](#risk-assessment-procedures)
9. [Documentation Standards](#documentation-standards)
10. [Appendix - Control Walkthroughs](#appendix---control-walkthroughs)

---

## Introduction

This guide provides step-by-step procedures for external auditors (or internal auditing teams) to assess Lendry's compliance with SOC 2 Trust Service Criteria. The procedures enable independent verification of control implementation and operational effectiveness.

### Audit Scope

**Trust Service Criteria Covered**:
- CC-6: Logical and Physical Access Controls
- CC-7: System Monitoring
- CC-8: Change Management
- CC-9: Availability and Continuity
- C-1: Confidentiality
- A-1: Availability

**Total Controls**: 22 discrete control points

### Audit Type

- **Engagement**: SOC 2 Type II
- **Scope**: Lendry lending application platform
- **Reporting Period**: 12-month operational assessment
- **Assertion**: Management's assertion regarding control design and operation

---

## Audit Access & Credentials

### Access Requirements

1. **Audit Admin Account**
   - Role: super_admin
   - Email: auditor@solandus.com (provided by Lendry)
   - Temporary password reset available

2. **API Access**
   - Base URL: https://api.lendry.app
   - Authentication: JWT token (obtain via login endpoint)
   - Rate limits: None for audit accounts

3. **Infrastructure Access**
   - Database read-only access (via query interface)
   - Log aggregation system access
   - Backup storage verification access

### Login Procedure

```bash
# Request temporary credentials from Lendry compliance team
# Credentials expire after 30 days

# Step 1: Authenticate and get JWT token
curl -X POST https://api.lendry.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "auditor@solandus.com",
    "password": "temporary-password-provided"
  }'

# Response: { "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }

# Step 2: Use token for all subsequent requests
curl -H "Authorization: Bearer {token}" \
  https://api.lendry.app/api/admin/audit/controls
```

---

## Audit Endpoints

All audit endpoints require admin (super_admin) authentication.

### 1. Start Compliance Audit

**Endpoint**: `POST /api/admin/audit/run`

Executes full automated compliance audit across all 22 controls.

```bash
curl -X POST https://api.lendry.app/api/admin/audit/run \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "auditRunId": "uuid",
  "startedAt": "2026-03-04T10:00:00Z",
  "completedAt": "2026-03-04T10:02:15Z",
  "overallResult": "partially_compliant",
  "compliancePercentage": 86.4,
  "compliantControls": 19,
  "totalControls": 22,
  "findings": 3,
  "recommendations": 5
}
```

**Interpretation**:
- Audit runs automatically collect evidence from system logs and configurations
- Duration typically 2-5 minutes depending on data volume
- Result: compliant (95%+), partially_compliant (80-94%), non_compliant (<80%)

### 2. Get Audit Results

**Endpoint**: `GET /api/admin/audit/results/{auditRunId}`

Retrieves detailed results from completed audit run.

```bash
curl -H "Authorization: Bearer {token}" \
  https://api.lendry.app/api/admin/audit/results/{auditRunId}
```

**Response**:
```json
{
  "id": "audit-uuid",
  "startedAt": "2026-03-04T10:00:00Z",
  "completedAt": "2026-03-04T10:02:15Z",
  "overallResult": "partially_compliant",
  "controlResults": {
    "CC-6.1": "compliant",
    "CC-6.2": "compliant",
    "CC-6.3": "compliant",
    "CC-6.4": "partially_compliant",
    "CC-6.5": "compliant",
    "CC-6.6": "compliant",
    "CC-7.1": "compliant",
    "CC-7.2": "compliant",
    "CC-7.3": "compliant",
    "CC-7.4": "compliant",
    "CC-7.5": "partially_compliant",
    "CC-8.1": "compliant",
    "CC-8.2": "compliant",
    "CC-8.3": "compliant",
    "CC-9.1": "partially_compliant",
    "CC-9.2": "compliant",
    "A-1.1": "compliant",
    "A-1.2": "compliant",
    "C-1.1": "compliant",
    "C-1.2": "compliant",
    "C-1.3": "compliant",
    "C-1.4": "compliant"
  },
  "findings": [
    "CC-6.4: MFA not enforced on all administrative functions",
    "CC-7.5: Incident response procedures documented but not drilled",
    "CC-9.1: Backup testing frequency below quarterly target"
  ],
  "recommendations": [
    "Enable MFA enforcement for all super_admin operations",
    "Schedule quarterly incident response drills",
    "Increase backup restore testing to monthly frequency"
  ]
}
```

### 3. List All Controls with Status

**Endpoint**: `GET /api/admin/audit/controls`

Returns all 22 controls with current compliance status.

```bash
curl -H "Authorization: Bearer {token}" \
  https://api.lendry.app/api/admin/audit/controls
```

### 4. Get Evidence for Specific Control

**Endpoint**: `GET /api/admin/audit/evidence/{controlId}`

Retrieves all collected evidence supporting specific control assessment.

```bash
curl -H "Authorization: Bearer {token}" \
  https://api.lendry.app/api/admin/audit/evidence/CC-6.1
```

**Response**:
```json
{
  "controlId": "CC-6.1",
  "controlName": "Authentication",
  "requirement": "Restrict system access to authorized users. Authentication ensures only valid credentials grant access.",
  "evidenceCount": 47,
  "lastEvidenceDate": "2026-03-04T09:55:00Z",
  "evidence": [
    {
      "id": "evidence-uuid",
      "type": "test_result",
      "timestamp": "2026-03-04T09:55:00Z",
      "notes": "JWT authentication verified - 1,242 successful logins in last 7 days",
      "collectedBy": "system"
    },
    {
      "id": "evidence-uuid",
      "type": "log_entry",
      "timestamp": "2026-03-03T14:30:00Z",
      "notes": "Unauthorized login attempts blocked - 23 failed attempts in last 24 hours",
      "collectedBy": "system"
    }
  ]
}
```

### 5. Generate Audit Report

**Endpoint**: `POST /api/admin/audit/report/generate`

Generates formal audit report (markdown/HTML/PDF).

```bash
curl -X POST https://api.lendry.app/api/admin/audit/report/generate \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"auditRunId": "uuid"}'
```

---

## Evidence Collection Procedures

### Understanding Evidence Types

**1. Automated Test Results**
- Generated by automated compliance checks
- Test: Does control operate as designed?
- Examples: Encryption verification, access control enforcement, log immutability tests

**2. Log Entry Evidence**
- System activity logs demonstrating control operation
- Source: auditLogs table with immutable append-only design
- Examples: Login attempts, access denials, API key rotations

**3. Configuration Evidence**
- System configuration demonstrating control implementation
- Source: Database schemas, environment variables, policy files
- Examples: Password policy settings, encryption algorithms, backup schedules

**4. Procedure Documentation**
- Written policies and procedures supporting control
- Source: Documentation in git repository
- Examples: SECURITY-POLICY.md, INCIDENT-RESPONSE-PLAN.md, CHANGE-MANAGEMENT.md

**5. Manual Observations**
- Auditor walkthrough and observation of control
- Source: Audit interview and system inspection
- Examples: Physical access controls, change management approval process

### Evidence Collection Steps

**Step 1: Run Automated Evidence Collection**
```bash
curl -X POST https://api.lendry.app/api/admin/audit/run \
  -H "Authorization: Bearer {token}"
```

This automatically:
- Queries authentication logs for login patterns
- Verifies PII encryption in database
- Checks audit log immutability
- Validates API key management
- Tests backup and recovery procedures

**Step 2: Review Log Entry Evidence**
```bash
curl -H "Authorization: Bearer {token}" \
  https://api.lendry.app/api/admin/audit/evidence/CC-7.1
```

For authentication logs specifically:
- Look for consistent timestamp, user, action, result fields
- Verify no logs have been modified (all updated_at = created_at)
- Assess log retention (oldest log should be 7+ years old)

**Step 3: Verify Encryption Configuration**
```sql
-- Verify PII fields are encrypted
SELECT COUNT(*) FROM users WHERE ssn LIKE 'enc:%';
-- Should return record count matching total users with SSN data

-- Verify encryption format
SELECT DISTINCT SUBSTR(ssn, 1, 10) FROM users WHERE ssn IS NOT NULL;
-- Should start with 'enc:1:' (format: enc:version:iv:authtag:ciphertext)
```

**Step 4: Review Policy Documents**
- Access repository: https://github.com/solandus/lendry
- Review folder: `/docs/`
- Key documents:
  - SECURITY-POLICY.md (CC-6.1, CC-7.1, C-1.1)
  - PASSWORD-POLICY.md (CC-6.3)
  - INCIDENT-RESPONSE-PLAN.md (CC-7.5)
  - CHANGE-MANAGEMENT.md (CC-8.1, CC-8.2)
  - AUDIT-LOGGING-POLICY.md (CC-7.1, CC-7.2)
  - DATA-RETENTION-POLICY.md (CC-7.3)
  - BACKUP-RECOVERY-PLAN.md (CC-9.1)

---

## Control Assessment Procedures

### CC-6 Controls: Logical Access

#### CC-6.1: Authentication

**Requirement**: Access restricted to valid credentials only

**Test Procedure**:
1. Run audit: `POST /api/admin/audit/run`
2. Review evidence: `GET /api/admin/audit/evidence/CC-6.1`
3. Verify JWT tokens are enforced (not allowing session cookies)
4. Test unauthorized access rejection:
   ```bash
   curl -H "Authorization: Bearer invalid-token" \
     https://api.lendry.app/api/user/profile
   # Should return 401 Unauthorized
   ```
5. Verify account lockout after 5 failed attempts
6. Check for multi-factor authentication usage in logs

**Success Criteria**:
- ✓ All API endpoints return 401 for missing/invalid authentication
- ✓ No plaintext password storage in logs
- ✓ JWT tokens expire after 24 hours
- ✓ Account lockout triggered after 5 failed login attempts

#### CC-6.2: Role-Based Access Control (RBAC)

**Requirement**: Access based on predefined roles; least privilege principle

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-6.2`
2. Verify user roles exist (admin, super_admin, user, viewer)
3. Test permission denial:
   ```bash
   # Attempt privileged operation as regular user
   curl -X DELETE https://api.lendry.app/api/admin/users/{id} \
     -H "Authorization: Bearer {userToken}"
   # Should return 403 Forbidden
   ```
4. Verify admin-only endpoints:
   - `DELETE /api/admin/users/*` (admin-only)
   - `POST /api/admin/audit/run` (super_admin-only)
   - `GET /api/admin/audit/controls` (super_admin-only)
5. Check permission grant/revoke audit logs

**Success Criteria**:
- ✓ Unauthorized role operations return 403
- ✓ Permission denied logged in audit trail
- ✓ No privilege escalation possible
- ✓ Role changes logged with timestamp and approver

#### CC-6.3: Password Policy

**Requirement**: Passwords meet complexity and regular change requirements

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-6.3`
2. Verify password policy enforcement:
   - Minimum 12 characters
   - Uppercase, lowercase, digits, symbols required
   - Change required every 90 days
   - No password reuse (last 5 passwords)
3. Test weak password rejection:
   ```bash
   curl -X POST https://api.lendry.app/auth/register \
     -d '{"password": "weak"}' \
     -H "Content-Type: application/json"
   # Should return error: "Password does not meet requirements"
   ```
4. Verify password reset email functionality
5. Check password change audit trail

**Success Criteria**:
- ✓ Weak passwords rejected
- ✓ All users have passwordChangedAt within 90 days
- ✓ Password changes logged
- ✓ No password history in logs

#### CC-6.4: Multi-Factor Authentication

**Requirement**: MFA enforced for sensitive operations

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-6.4`
2. Test MFA requirement for admin operations:
   ```bash
   # Attempt admin operation without MFA
   curl -X POST https://api.lendry.app/api/admin/users \
     -H "Authorization: Bearer {adminToken}" \
     -d '{"email": "new@user.com"}'
   # Should require MFA verification
   ```
3. Verify MFA methods available (TOTP, SMS, backup codes)
4. Check MFA verification in audit logs
5. Verify MFA recovery procedures

**Success Criteria**:
- ✓ Admin operations require MFA
- ✓ MFA verified before sensitive actions
- ✓ MFA attempts logged
- ✓ Successful and failed MFA attempts tracked

#### CC-6.5: API Key Management

**Requirement**: API keys generated, rotated, and revoked through secure processes

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-6.5`
2. Verify API key format: `sk_prod_[32 random characters]`
3. Test API key authentication:
   ```bash
   curl -H "Authorization: Bearer {apiKey}" \
     https://api.lendry.app/api/deals
   ```
4. Verify scope enforcement:
   ```bash
   # Key with deals:read scope should be denied write
   curl -X POST https://api.lendry.app/api/deals \
     -H "Authorization: Bearer {readOnlyKey}" \
     -d '{"title":"Deal"}'
   # Should return 403
   ```
5. Test key rotation:
   - Get current active keys
   - Verify rotation dates within 90 days
   - Test old key becomes inactive after rotation
6. Verify rate limiting per key
7. Check key revocation in audit logs

**Success Criteria**:
- ✓ API keys stored as bcrypt hash (not plaintext)
- ✓ Scope-based access enforced
- ✓ Keys rotated within 90 days
- ✓ Revoked keys immediately rejected
- ✓ Key operations logged

#### CC-6.6: Session Management

**Requirement**: Sessions timeout and are properly managed

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-6.6`
2. Verify session timeout (24 hours inactivity):
   ```bash
   # Login and wait 24+ hours without activity
   # Next request should require re-authentication
   curl -H "Authorization: Bearer {oldToken}" \
     https://api.lendry.app/api/user/profile
   # Should return 401
   ```
3. Verify logout invalidates session:
   ```bash
   curl -X POST https://api.lendry.app/auth/logout \
     -H "Authorization: Bearer {token}"
   # Token should be blacklisted
   ```
4. Check concurrent session limits (if applicable)
5. Verify session invalidation on password change

**Success Criteria**:
- ✓ Sessions timeout after 24 hours inactivity
- ✓ Logout immediately invalidates token
- ✓ Password change invalidates all sessions
- ✓ Session activity logged

### CC-7 Controls: System Monitoring

#### CC-7.1: Audit Logging

**Requirement**: System activity logged with timestamps, users, actions, results

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-7.1`
2. Query recent audit logs:
   ```sql
   SELECT COUNT(*) FROM auditLogs WHERE created_at > NOW() - INTERVAL '7 days';
   -- Should return 1000+ entries
   ```
3. Verify log completeness (all fields present):
   ```sql
   SELECT * FROM auditLogs LIMIT 1;
   -- Should include: id, userId, action, resourceType, resourceId, changes, ip, timestamp
   ```
4. Test log coverage:
   - User login: should be logged
   - Permission denied: should be logged
   - Data modification: should be logged
   - Administrative action: should be logged
5. Verify sensitive field access logging:
   ```sql
   SELECT COUNT(*) FROM auditLogs
   WHERE action LIKE '%ssn%' OR action LIKE '%payment%';
   ```

**Success Criteria**:
- ✓ All actions logged consistently
- ✓ Logs include user, timestamp, action, resource
- ✓ Sensitive operations logged with full details
- ✓ Failed access attempts logged
- ✓ Log retention 7+ years

#### CC-7.2: Log Immutability

**Requirement**: Audit logs cannot be modified or deleted

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-7.2`
2. Verify table permissions (read-only from audit perspective):
   ```sql
   -- Verify user role has SELECT but not UPDATE/DELETE
   SELECT * FROM information_schema.table_privileges
   WHERE table_name='auditLogs' AND privilege_type IN ('UPDATE','DELETE');
   -- Should return no rows (no UPDATE/DELETE permissions)
   ```
3. Attempt to modify log (should fail):
   ```sql
   UPDATE auditLogs SET action='modified' WHERE id='...';
   -- Should return error: permission denied
   ```
4. Verify created_at and updated_at fields:
   ```sql
   SELECT created_at, updated_at FROM auditLogs LIMIT 100;
   -- created_at and updated_at should always be equal
   ```
5. Check database constraints preventing modification
6. Verify backup integrity (logs included)

**Success Criteria**:
- ✓ Log table is append-only
- ✓ No UPDATE/DELETE permissions exist for logs
- ✓ No log records have been modified (created_at = updated_at)
- ✓ Attempts to modify logs are logged and rejected

#### CC-7.3: Log Retention

**Requirement**: Logs retained for 7+ years

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-7.3`
2. Check oldest log in system:
   ```sql
   SELECT MIN(created_at) as oldest_log FROM auditLogs;
   -- Should be 7+ years ago from current date
   ```
3. Verify retention policy documentation in:
   - DATA-RETENTION-POLICY.md
   - Database table properties
4. Check backup system includes logs
5. Verify archive storage for aged logs (if applicable)
6. Test log recovery from archive

**Success Criteria**:
- ✓ Oldest log in system is 7+ years old
- ✓ Retention policy documented
- ✓ Logs retained even when user accounts deleted
- ✓ Archive procedures documented and tested

#### CC-7.4: Monitoring and Alerting

**Requirement**: System monitors for anomalies and alerts on issues

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-7.4`
2. Review monitoring system:
   - Check CPU, memory, disk usage monitoring
   - Verify API response time monitoring
   - Confirm error rate monitoring (4xx, 5xx)
3. Verify alerting rules:
   ```bash
   # Check alert configuration
   GET /api/admin/monitoring/alerts
   # Should include: high error rate, slow response time, resource exhaustion
   ```
4. Test alert delivery (check recent alerts)
5. Verify anomaly detection:
   - Failed login spike detection
   - Unusual API usage patterns
   - Access control violations
6. Check alert response procedures

**Success Criteria**:
- ✓ Real-time monitoring dashboard available
- ✓ Alerts sent for critical events
- ✓ Alert history maintained
- ✓ Escalation procedures documented

#### CC-7.5: Incident Response

**Requirement**: Incidents detected, investigated, documented, and resolved

**Test Procedure**:
1. Get evidence: `GET /api/admin/audit/evidence/CC-7.5`
2. Review incident response plan:
   - Access INCIDENT-RESPONSE-PLAN.md
   - Verify procedures documented
   - Check contact information
   - Verify escalation paths
3. Check incident history logs:
   ```sql
   SELECT * FROM auditLogs WHERE action LIKE '%incident%';
   ```
4. Verify incident classification (P0, P1, P2, P3)
5. Check mean time to respond (MTTR) for recent incidents
6. Verify post-incident reviews (blameless culture)
7. Test incident response drill (document results)

**Success Criteria**:
- ✓ Incident response plan documented
- ✓ Clear escalation procedures
- ✓ MTTR < 4 hours for critical incidents
- ✓ All incidents documented and resolved
- ✓ Post-incident reviews conducted quarterly

### CC-8 Controls: Change Management

#### CC-8.1: Change Authorization

**Test Procedure**:
1. Review change log in git repository: https://github.com/solandus/lendry
2. Verify all changes have:
   - Commit message explaining change
   - Code review approval (marked in PR)
   - JIRA ticket reference
3. Check that emergency changes have post-approval documentation
4. Verify change authority approvals

**Success Criteria**:
- ✓ All production changes authorized before deployment
- ✓ Changes traceable to JIRA tickets
- ✓ Code review completed for every change
- ✓ Change log maintained

#### CC-8.2: Change Testing

**Test Procedure**:
1. Review test coverage in git repository
2. Verify unit tests exist and pass
3. Check integration tests cover new functionality
4. Verify changes tested in non-production environment
5. Review CI/CD pipeline (GitHub Actions workflow)

**Success Criteria**:
- ✓ Unit tests run on every commit (>80% coverage)
- ✓ Integration tests pass
- ✓ Staged deployment process verified
- ✓ Rollback procedures documented

#### CC-8.3: Change Documentation

**Test Procedure**:
1. Review recent changes in git:
   ```bash
   git log --oneline -10
   # Should show clear commit messages
   ```
2. Verify CHANGELOG.md updated for each release
3. Check deployment runbooks exist
4. Review rollback procedures

**Success Criteria**:
- ✓ Commit messages clear and detailed
- ✓ CHANGELOG maintained
- ✓ Deployment procedures documented
- ✓ Rollback tested

---

## Report Generation

### Generating the Audit Report

```bash
# After audit run, generate report
curl -X POST https://api.lendry.app/api/admin/audit/report/generate \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"auditRunId": "uuid"}'
```

### Report Sections

1. **Executive Summary**: Overall compliance status, key findings, recommendations
2. **Controls Matrix**: All 22 controls with status
3. **Evidence Report**: Supporting evidence for each control
4. **Findings Report**: Issues identified during audit
5. **Risk Assessment**: Risk register with mitigation status
6. **Recommendations**: Actions to improve compliance
7. **Appendix**: Methodology, definitions, policies

### Report Distribution

- Send to: compliance@solandus.com
- Retain: Auditor copy for 7 years
- Review: Management sign-off within 15 days

---

## Compliance Dashboard

Access real-time compliance status:

```bash
GET https://api.lendry.app/api/compliance/overview
GET https://api.lendry.app/api/compliance/by-criteria
GET https://api.lendry.app/api/compliance/controls
GET https://api.lendry.app/api/compliance/risks
GET https://api.lendry.app/api/compliance/trends
```

---

## Risk Assessment Procedures

### Risk Identification

1. During audit, identify gaps or weaknesses
2. Assess likelihood (low, medium, high, critical)
3. Assess impact (low, medium, high, critical)
4. Document in risk register

### Risk Mitigation

1. For each identified risk:
   - Define mitigation strategy
   - Set target remediation date
   - Assign owner
   - Document evidence of mitigation
2. Update risk status:
   - identified → mitigating → mitigated → closed

---

## Documentation Standards

All documentation should be clear, specific, and include:

- **Date**: When evidence was collected
- **Evidence ID**: Unique identifier for traceability
- **Control**: Which control(s) supported
- **Result**: Compliant, partially compliant, or non-compliant
- **Details**: Specific findings or observations
- **Auditor**: Name/email of person who verified

---

## Appendix - Additional Resources

### Related Documents

- AUDIT-EVIDENCE-GUIDE.md (interpreting evidence)
- PII-ENCRYPTION-INTEGRATION.md (encryption testing)
- API-KEYS-GUIDE.md (API key security)
- WEBHOOKS-GUIDE.md (webhook security)
- INCIDENT-RESPONSE-PLAN.md (incident procedures)
- CHANGE-MANAGEMENT.md (change process)

### Audit Timeline

- **Week 1**: Initial audit setup, system access, documentation review
- **Week 2**: Evidence collection, testing procedures, preliminary findings
- **Week 3**: Risk assessment, remediation discussions, report generation
- **Week 4**: Final review, management sign-off, recommendations

### Contact Information

- **Compliance Officer**: compliance@solandus.com
- **Technical POC**: engineering@solandus.com
- **Executive Sponsor**: ceo@solandus.com

---

*End of SOC 2 Type II Audit Procedures Guide*

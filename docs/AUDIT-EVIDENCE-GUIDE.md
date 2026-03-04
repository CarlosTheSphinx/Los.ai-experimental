# Audit Evidence Guide

**Document Version**: 1.0
**Last Updated**: 2026-03-04
**Classification**: Internal Use Only

---

## Overview

This guide explains how to interpret and use audit evidence collected during SOC 2 compliance assessments. Evidence supports findings about control design and operational effectiveness.

---

## Evidence Categories

### 1. Test Results

**What it is**: Automated or manual test verifying control operates as designed

**Where it comes from**:
- Automated compliance test suite
- Manual security tests by auditors
- Penetration testing results

**How to interpret**:
- **PASS**: Control operates correctly, requirement met
- **FAIL**: Control did not operate as expected, requirement not met
- **INCONCLUSIVE**: Need additional evidence to determine status

**Examples**:

**CC-6.1: Authentication Test**
```
Test: Unauthenticated request to protected endpoint
Result: PASS
Evidence: Request without JWT returned 401 Unauthorized
Successful logins (7 days): 1,242 with valid JWT
Failed logins (7 days): 23 with invalid/missing token
```

Interpretation: Authentication control is operating. Users cannot access protected endpoints without valid JWT token.

**C-1.1: Encryption Test**
```
Test: Verify PII fields are encrypted
Result: PASS
Evidence:
  - SSN field in 1,500+ user records: encrypted with AES-256-GCM
  - Format validation: All encrypted values start with 'enc:1:'
  - Spot check: Decryption produces valid SSN format
  - Encryption key: Stored in secure environment variable
```

Interpretation: PII encryption is properly implemented using approved algorithm with secure key storage.

---

### 2. Log Entry Evidence

**What it is**: System activity logs from audit trail showing control operation

**Where it comes from**: auditLogs table (append-only, immutable)

**How to interpret**:

**Log Entry Structure**:
```json
{
  "id": "uuid",
  "userId": "user-id",
  "action": "auth.login_failed",
  "resourceType": "user",
  "resourceId": "user-123",
  "changes": { "reason": "invalid_password", "attemptNumber": 3 },
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "createdAt": "2026-03-04T14:30:00Z",
  "updatedAt": "2026-03-04T14:30:00Z"
}
```

**Key Fields**:
- **action**: What happened (e.g., auth.login_failed, permission.denied, data.encrypted)
- **userId**: Who initiated action
- **timestamp**: Exact time (immutable)
- **changes**: What changed (for debugging)
- **ip**: Source of request (security tracing)

**Interpretation Examples**:

**CC-6.1: Authentication Logs**
```
Log entries show:
- 8:05 AM: user-123 auth.login_successful
- 8:06 AM: user-123 user.profile_accessed
- 8:07 AM: user-456 auth.login_failed (invalid_password)
- 8:08 AM: user-456 auth.account_locked (5 failed attempts)

Interpretation:
✓ Successful logins logged
✓ Unsuccessful attempts logged
✓ Account lockout triggered after 5 attempts
✓ Consistent logging pattern shows control working
```

**CC-7.1: Audit Logging Coverage**
```
Log entries by category (7-day sample):
- Authentication: 500 entries (logins, failures, MFA)
- Authorization: 250 entries (permission checks, denials)
- Data modification: 800 entries (create, update, delete)
- Administrative: 150 entries (user management, config changes)
- Security events: 50 entries (access denied, suspicious activity)

Total: 1,750 log entries in 7 days
Average: 250 per day

Interpretation:
✓ Comprehensive logging coverage
✓ All major operations logged
✓ Frequency consistent with user activity
```

**C-1.1: PII Encryption Logs**
```
Log entries showing encryption:
- 10:00 AM: user.created (ssn: 'enc:1:...')
- 10:01 AM: user.ssn_updated (old_ssn: 'enc:1:...', new_ssn: 'enc:1:...')
- 10:02 AM: pii.decryption_requested (controlId: CC-6.1, reason: profile_view)
- 10:03 AM: pii.accessed (field: ssn, user: auditor-123)

Interpretation:
✓ PII encrypted when stored
✓ Updates encrypted consistently
✓ Decryption logged for audit trail
✓ Access to sensitive fields tracked
```

---

### 3. Configuration Evidence

**What it is**: System settings, database configurations, environment variables

**Where it comes from**: Database schemas, config files, infrastructure code

**How to interpret**:

**Database Configuration**:
```sql
-- Check encryption algorithm
SELECT setting FROM pg_settings WHERE name = 'ssl';
-- Result: 'on'

-- Check password settings
SELECT * FROM pg_authid WHERE rolname = 'application_user';
-- Result: password_encrypted = true

-- Check table constraints
SELECT constraint_name, constraint_type FROM information_schema.table_constraints
WHERE table_name = 'auditLogs' AND constraint_type = 'PRIMARY KEY';
-- Result: Confirm auditLogs has immutable constraints
```

**Environment Configuration**:
```bash
# Encryption key storage
echo $ENCRYPTION_KEY_PROD  # Should not be echoed (secure storage)

# TLS Configuration
openssl s_client -connect api.lendry.app:443 -showcerts
# Should show TLS 1.2+ with strong ciphers
```

**Interpretation Examples**:

**CC-6.1: Authentication Configuration**
```
Config settings:
- JWT_SECRET: Present in environment (not in code)
- JWT_EXPIRY: 24 hours (appropriate)
- BCRYPT_ROUNDS: 12 (industry standard)
- MFA_ENABLED: true
- ACCOUNT_LOCKOUT_THRESHOLD: 5 attempts
- SESSION_TIMEOUT: 24 hours inactivity

Interpretation:
✓ Authentication configured securely
✓ Credentials not hardcoded
✓ Appropriate timeout values
✓ MFA enabled for sensitive operations
```

**C-1.2: Encryption in Transit Configuration**
```
TLS Configuration:
- Min TLS Version: 1.2
- Supported Ciphers: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, ...
- Certificate: Issued to api.lendry.app, expires 2026-12-31
- HSTS: Enabled (max-age: 31536000)
- HTTP Redirect: All HTTP → HTTPS (301 redirect)

Interpretation:
✓ Modern TLS version enforced
✓ Strong cipher suites configured
✓ HTTPS enforced for all connections
✓ Certificate valid and properly configured
```

---

### 4. Procedure Documentation

**What it is**: Policies and written procedures for control operation

**Where it comes from**: Documentation in git repository

**How to interpret**:

**Security Policy Check**:
```markdown
# From SECURITY-POLICY.md

## Authentication Requirements
- All applications require multi-factor authentication for access
- Session timeout: 24 hours inactivity
- Password complexity: 12+ characters, mixed case, numbers, symbols
- Account lockout: 5 failed attempts → 30-minute lockout

Evidence of compliance:
✓ Policy document exists and dated
✓ Implementation matches policy (verified through testing)
✓ Policy review: Annually (last review: 2026-01-15)
✓ Policy acknowledgment: Required for all users
```

**Incident Response Procedure Check**:
```markdown
# From INCIDENT-RESPONSE-PLAN.md

## Detection
- Automated monitoring: Real-time alerts on anomalies
- Manual review: Daily log analysis
- External reporting: Customer reports security concerns

## Response Timeline
- Detection to initial response: < 1 hour
- Initial response to escalation: < 4 hours
- Root cause analysis: Within 24 hours
- Customer notification: Within 72 hours (if impact)

Evidence of compliance:
✓ Procedures documented clearly
✓ Response times tracked in incident logs
✓ Recent incident case study available for review
```

---

### 5. Manual Observations

**What it is**: Auditor observations during interviews and system inspection

**How to interpret**:

**Example: Change Management Interview**
```
Interview Notes:
Q: Walk me through a code change from proposal to production
A:
1. Developer creates feature branch with JIRA ticket reference
2. Code review required - minimum 2 approvals (senior engineer)
3. Automated tests must pass (>80% coverage)
4. Peer review checklist: security, scalability, documentation
5. Merge to main requires approval
6. Deploy to staging, run integration tests
7. After sign-off, deploy to production
8. Deployment logged with timestamp, who, what, why

Observation: Process matches documented CHANGE-MANAGEMENT.md procedures

Evidence:
✓ Developer walk-through demonstrated understanding
✓ GitHub PR showed code review process
✓ CI/CD pipeline verified automatic testing
✓ Deployment logs matched described process
```

---

## Sensitive Data Handling

### PII Field Reference

**Protected Personal Information** includes:
- Social Security Numbers (SSN)
- Driver's License Numbers
- Passport Numbers
- Date of Birth
- Bank Account Numbers
- Credit/Debit Card Numbers
- Loan Account Numbers
- Income Information

### Encryption Verification

**When reviewing encryption evidence**:

1. **Format Check**: Encrypted data should start with `enc:`
   ```
   Plaintext: 123-45-6789
   Encrypted: enc:1:base64_iv:base64_authtag:base64_ciphertext
   ```

2. **Algorithm Verification**:
   - Encryption: AES-256-GCM (approved)
   - Key size: 256 bits (cryptographically strong)
   - Random IV: Generated per encryption (prevents patterns)
   - Authentication tag: Detects tampering

3. **Key Management**:
   ```bash
   # Verify encryption key is not in code
   grep -r "ENCRYPTION_KEY" . --include="*.js" --include="*.ts"
   # Should return: Only references to process.env variable, not actual key

   # Verify key storage
   ls -la ~/.bashrc /etc/environment | grep ENCRYPTION_KEY
   # Should show key in environment, not accessible to regular users
   ```

### Sensitive Field Access Logging

Whenever sensitive fields are accessed, logged entries should show:

```
Log: pii.decryption_requested
  - Field: SSN
  - User: auditor-id
  - Reason: Compliance audit
  - Timestamp: 2026-03-04T15:00:00Z
  - Action: APPROVED (authorized user, valid reason)

Log: pii.accessed
  - Field: date_of_birth
  - User: api-key-id
  - Scope: users:read
  - Timestamp: 2026-03-04T15:01:00Z
  - Value displayed: DECRYPTED (auditor confirmed received)
```

---

## API Key Security Evidence

### Key Lifecycle

**Generation Evidence**:
```
Log: apikey.created
  - Key format: sk_prod_[32 random chars]
  - Scopes: deals:read, documents:read
  - User: john-doe
  - Timestamp: 2026-01-15T10:00:00Z
```

**Rotation Evidence**:
```
Log: apikey.rotated
  - Old key ID: key-12345
  - New key ID: key-12346
  - Rotation reason: Scheduled rotation (90 days)
  - User: john-doe
  - Timestamp: 2026-03-15T09:00:00Z
```

**Revocation Evidence**:
```
Log: apikey.revoked
  - Key ID: key-12345
  - Reason: Account deactivation
  - Timestamp: 2026-03-20T14:00:00Z
```

**Rate Limiting Evidence**:
```
Log: ratelimit.exceeded
  - Key ID: key-12346
  - Limit: 100 requests/minute
  - Actual: 105 requests/minute
  - Action: Request blocked (429 Too Many Requests)
  - Timestamp: 2026-03-04T12:05:00Z
```

---

## Webhook Security Evidence

### Signature Verification

**HMAC-SHA256 Signature** used for webhook authenticity:

```
HTTP Request to customer:
POST https://customer.example.com/webhook HTTP/1.1
X-Signature: sha256=abcd1234...
X-Timestamp: 1646400000
Content-Type: application/json

{
  "event": "deals.signed",
  "data": { "dealId": "123", "status": "signed" },
  "timestamp": 1646400000
}

Customer verification:
payload = "deals.signed.123.signed.1646400000"
expected = HMAC-SHA256(payload, webhook_secret)
actual = X-Signature header value
✓ Match = Authentic webhook
✗ Mismatch = Rejected (tampered)
```

**Evidence in logs**:
```
Log: webhook.signature_verified
  - Webhook ID: webhook-789
  - Event: deals.signed
  - Signature: VALID
  - Timestamp: 2026-03-04T14:30:00Z

Log: webhook.signature_failed
  - Webhook ID: webhook-999
  - Event: deals.updated
  - Signature: INVALID (tampering detected)
  - Action: REJECTED
  - Timestamp: 2026-03-04T14:31:00Z
```

---

## Backup and Recovery Evidence

### Backup Verification

**Automated Backup Tests**:
```
Log: backup.created
  - Size: 15.2 GB
  - Type: Full backup
  - Location: AWS S3
  - Timestamp: 2026-03-03T02:00:00Z
  - Duration: 8 minutes

Log: backup.restored_test
  - Backup ID: backup-2026-03-03
  - Environment: Test (non-production)
  - Duration: 12 minutes
  - Status: SUCCESS
  - Data verification: PASSED
  - Timestamp: 2026-03-04T10:00:00Z
  - RTO (Recovery Time Objective): 15 minutes ✓
  - RPO (Recovery Point Objective): <1 hour ✓
```

**Disaster Recovery Drill Evidence**:
```
Quarterly Drill (2026 Q1):
- Date: 2026-03-01
- Scenario: Database corruption
- Detection: 5 minutes (automated alert)
- Response: 8 minutes (team assembled)
- Recovery: 12 minutes (restore from backup)
- Validation: 15 minutes (data integrity checks)
- Total RTO: 20 minutes
- Documentation: Post-drill review captured lessons learned
- Status: PASSED (met RTO targets)
```

---

## Compliance Scoring

### How Evidence Translates to Compliance Status

**COMPLIANT (95-100%)**
- All required evidence collected
- Evidence demonstrates effective operation
- No significant gaps identified
- Documentation current and accurate
- Controls tested and working

**PARTIALLY COMPLIANT (80-94%)**
- Most evidence collected (>75%)
- Some gaps in documentation
- Minor control deficiencies
- Evidence shows mostly effective operation
- Remediation timeline < 90 days

**NON-COMPLIANT (<80%)**
- Significant evidence gaps
- Control not operating effectively
- Design or operation flaws identified
- Remediation required
- Risk mitigation in place

---

## Evidence Documentation Template

When documenting evidence, use:

```markdown
## Control: CC-6.1 Authentication

### Requirement
Users must authenticate with valid credentials (JWT token)

### Evidence Collected
1. **Test Result**
   - Type: Automated security test
   - Date: 2026-03-04
   - Result: PASS
   - Details: 23 failed auth attempts blocked; 1,242 successful logins logged

2. **Log Entry Evidence**
   - Date range: 2026-02-25 to 2026-03-04
   - Sample logs: [See auditLogs table entries]
   - Pattern: Consistent auth logging, no bypasses detected

3. **Configuration Evidence**
   - JWT algorithm: HS256 (HMAC-SHA256)
   - Key storage: Environment variable (secure)
   - Expiration: 24 hours

4. **Procedure Documentation**
   - Reference: SECURITY-POLICY.md, section 2.1
   - Status: Up to date
   - Last reviewed: 2026-01-15

### Assessment
**Status**: COMPLIANT

**Reasoning**:
- All authentication attempts logged
- Failed attempts consistently rejected
- JWT tokens properly configured
- Procedures documented and followed

### Recommendations
- Consider shorter JWT expiration for high-risk operations (4 hours)
- Annual authentication security review (next: 2027-03)
```

---

## Troubleshooting Evidence Issues

### "Evidence not found for control CC-7.1"

**Likely causes**:
1. Audit hasn't run recently (logs cleared after 7 years)
2. Control never tested (no compliance audit run)
3. Evidence stored in different location

**Resolution**:
1. Run full audit: `POST /api/admin/audit/run`
2. Wait 2-5 minutes for data collection
3. Query: `GET /api/admin/audit/evidence/CC-7.1`

### "Log entries show inconsistent timestamps"

**Likely causes**:
1. System clock skew between servers
2. Time zone not configured consistently
3. Database time different from application time

**Resolution**:
1. Verify all servers synchronized to NTP
2. Check database `SELECT NOW();`
3. Compare with application time `new Date().toISOString()`

### "Encrypted data doesn't match expected format"

**Likely causes**:
1. Encryption algorithm changed (version mismatch)
2. Data from migration (old format)
3. Decryption errors in verification

**Resolution**:
1. Check format: `SELECT SUBSTR(ssn, 1, 20) FROM users LIMIT 5;`
2. Verify algorithm in env: `echo $ENCRYPTION_ALGORITHM`
3. Review migration logs for format changes

---

## Conclusion

Evidence collection and interpretation is systematic and verifiable. Each piece of evidence supports a specific control assessment. By reviewing evidence carefully, auditors can confidently report on compliance posture.

For questions about evidence, contact: compliance@solandus.com

---

*End of Audit Evidence Guide*

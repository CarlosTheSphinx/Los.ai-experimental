# Data Retention Policy

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Data Retention Overview
2. Retention Schedule by Data Type
3. Deletion Procedures
4. Legal Hold Procedures
5. Right to Deletion (GDPR/CCPA)
6. Backup Retention
7. Data Archive

---

## 1. Data Retention Overview

### 1.1 Purpose

This policy establishes how long Lendry retains customer data after:
- Account closure or termination
- Deal completion or closure
- User deactivation
- Service discontinuation

**Objectives:**
- Meet regulatory and legal requirements
- Balance operational needs against data minimization
- Enable disaster recovery and business continuity
- Support incident investigation and compliance audits
- Provide data to users on request (GDPR/CCPA)

### 1.2 Retention Principles

**Default Approach:** Retain as long as needed, delete when no longer needed
**Legal Compliance:** Meet all regulatory retention requirements
**Customer Request:** Honor customer data deletion requests (with exceptions)
**Business Need:** Retain data necessary for operations and legal holds
**Privacy:** Minimize data retention to reduce privacy risks

### 1.3 Data Classification for Retention

Different data types have different retention requirements:

- **L4 Restricted:** Encryption keys, passwords → Destroy immediately after use
- **L3 Confidential:** Customer deals, documents → 7 years
- **L2 Internal:** User accounts, system data → 3 years after closure
- **L1 Public:** Marketing, documentation → No retention requirement

---

## 2. Retention Schedule by Data Type

### 2.1 Audit Logs (Most Critical)

**Retention Period:** 7 years
**Rationale:** SOC 2 Type II requirement, regulatory compliance

**Lifecycle:**
- Years 0-2: Hot storage (online database)
- Years 2-7: Cold storage (archived, less frequently accessed)
- After 7 years: Automatic deletion

**Special Rules:**
- Legal holds override automatic deletion
- Cannot be manually deleted without legal order
- Immutable design prevents tampering
- Backed up separately from production

### 2.2 User Accounts

**Retention Period:** 3 years after account deletion/deactivation
**Rationale:** Support historical access review, potential disputes

**What's Retained:**
- Email address
- Account creation/deletion dates
- Role and permission history
- Associated audit log entries (retained separately)

**What's Deleted:**
- Password hash
- OAuth tokens
- Personal information (name, phone, address)
- Encrypted session tokens

**Soft Delete Approach:**
- User marked as "deleted" but data retained
- Prevents new access while preserving audit trail
- Can be restored if needed within 3 years
- After 3 years, permanently deleted

### 2.3 Deal/Transaction Data

**Retention Period:** 7 years
**Rationale:** Financial record-keeping, regulatory compliance, audit trail

**What's Retained:**
- Deal details (amount, dates, parties)
- Deal history and status changes
- Associated documents
- Related communications

**What's Retained with Special Treatment:**
- Customer PII (SSN, address) → Encrypted at rest
- Financial data → Access restricted to authorized staff
- Sensitive documents → Archive after deal closure

**Exceptions:**
- Active deals: Retained indefinitely
- Legal disputes: Extended beyond 7 years
- Regulatory investigations: Held until conclusion

### 2.4 Documents

**Retention Period:** 7 years (matching deal retention)
**Rationale:** Contract requirements, financial/legal compliance

**Document Types:**
- Promissory notes: 7 years
- Financial documents: 7 years
- Legal documents: 7 years
- Internal notes: May be deleted sooner

**Archive Strategy:**
- After deal closure: Archive to cold storage
- After 7 years: Permanent deletion
- Legal holds: Extend retention indefinitely

### 2.5 User Activity Logs (Application Logs)

**Retention Period:** 90 days
**Rationale:** Performance monitoring, debugging, incident response

**What's Logged:**
- User logins/logouts
- API calls
- Errors and exceptions
- Performance metrics

**What's NOT Logged (Privacy):**
- Passwords
- API keys
- OAuth tokens
- Personal information (sanitized)

**Deletion Process:**
- Automatic deletion after 90 days
- Older logs archived to S3/cold storage (optional)
- No manual deletion in normal circumstances

### 2.6 Backup Data

**Retention Period:** 30-day rolling window
**Rationale:** Disaster recovery, quick restoration, incremental backups

**Backup Schedule:**
- Daily full backup
- Hourly incremental backups
- Weekly long-term backup (30 days)

**Deletion Policy:**
- Backups older than 30 days automatically deleted
- Exceptions: Legal holds, active investigations
- Encrypted with same key as production

**Recovery Capability:**
- Can restore to any point in last 30 days
- 4-hour recovery time (RTO)
- 1-hour data loss acceptable (RPO)

---

## 3. Deletion Procedures

### 3.1 Soft Delete (Non-Destructive)

**Approach:** Mark data as deleted, but don't physically remove
**When Used:** User accounts, potentially sensitive data

**Process:**
1. User/admin initiates deletion
2. `deletedAt` timestamp set in database
3. System marks record as deleted
4. Data hidden from normal user view
5. Audit trail maintained (not deleted)
6. Data retained for retention period
7. Permanent deletion after retention period expires

**Example (User Deletion):**
```sql
UPDATE users SET deletedAt = NOW() WHERE id = 123;
```

**Benefits:**
- Preserves audit trail
- Reversible within retention period
- Easy to query deleted records
- Complies with regulatory requirements

### 3.2 Hard Delete (Destructive)

**Approach:** Physically remove data from database and backups
**When Used:** After soft delete retention period, explicit user request

**Process:**
1. Verify all retention requirements met
2. Verify no active legal holds
3. Create backup (for forensics)
4. Remove from production database
5. Remove from all backups
6. Verify deletion with SQL query
7. Log deletion event (who, when, what)

**Example (Permanent Deletion):**
```sql
DELETE FROM users WHERE id = 123 AND deletedAt < NOW() - INTERVAL '3 years';
```

**Verification:**
- Query returns no results
- Backup scan confirms deletion
- Audit log shows deletion event
- Spot check other tables for orphaned data

### 3.3 Cryptographic Erasure

**Approach:** Encrypt with new key, destroy old key
**When Used:** Highly sensitive data, security-critical deletions

**Process:**
1. Select data to delete
2. Re-encrypt with new key (or delete if encrypted)
3. Destroy original encryption key
4. Data becomes unreadable without key
5. Key destruction logged
6. Data technically remains but unrecoverable

**Use Case:** Password hashes, API keys, OAuth tokens

---

## 4. Legal Hold Procedures

### 4.1 Placing a Legal Hold

**Who Can Request:**
- CEO
- General Counsel
- External counsel representing company

**Process:**
1. Legal team determines need for hold
2. Creates Legal Hold request (email/document)
3. Specifies data to preserve (scope)
4. Specifies retention duration or end trigger
5. Notifies data teams of hold
6. Data operations team implements hold

**Scope Examples:**
- All data for user ID 123 (specific user)
- All deals from Jan-Feb 2025 (date range)
- All audit logs related to incident (keyword/topic)
- All documents for customer XYZ (customer-specific)

### 4.2 Implementation of Legal Hold

**Technical Implementation:**
- Flag records with `legalHoldUntil` timestamp
- Exclude from automatic deletion jobs
- Add notes explaining hold reason
- Notify team members (cannot delete these records)

**Monitoring:**
- Weekly report of held records
- Ensure hold not accidentally deleted
- Track hold status and expiration date

### 4.3 Lifting a Legal Hold

**When to Lift:**
- Litigation/investigation concluded
- Settlement agreement reached
- Regulatory investigation closed
- Hold duration expires

**Process:**
1. Legal team notifies data operations
2. Specifies which records/hold to release
3. Data operations removes legal hold flag
4. Records resume normal deletion schedule
5. Event logged: who lifted hold, when, reason

**Verification:**
- Confirm hold flag removed
- Verify deletion jobs can process records
- Document in compliance records

---

## 5. Right to Deletion (GDPR/CCPA)

### 5.1 User Deletion Request

**GDPR Right to Erasure:**
- Users can request deletion of personal data
- Some exceptions apply (legal obligations, legitimate interests)
- Company must respond within 30 days

**CCPA Right to Delete:**
- California residents can request deletion
- Some exceptions apply (legal obligations, business operations)
- Company must respond within 45 days

**User Request Process:**
1. User submits deletion request to privacy@lendry.com
2. Privacy team confirms user identity
3. Privacy team identifies all personal data
4. Evaluates exceptions (can we refuse?)
5. If approved: Initiate deletion process
6. Confirm deletion with user

### 5.2 Exceptions to Deletion

**We Can Refuse Deletion If:**
1. Data needed to provide service (active deal)
2. Legal obligation to retain (audit logs, 7 years)
3. Contract obligation to retain
4. Security/fraud prevention purposes
5. Statistical analysis (anonymized data)
6. User previously consented to long-term retention

**Example Scenarios:**
- Active deal: Cannot delete until deal closed + retention period
- Closed deal: Can delete after 7 years (audit logs retained separately)
- Marketing list: Can delete if no legitimate interest
- Loan history: Can delete but must explain retention exception

### 5.3 Deletion Request Handling

**Upon Approval:**
1. Mark user account as deleted (soft delete)
2. Delete personal data fields (PII)
3. Retain only:
   - Audit logs (separate retention)
   - Deal data (if needed per exceptions)
   - Payment records (legal requirement)
4. Send confirmation email to user
5. Document deletion in compliance file

**Timeline:**
- GDPR: Complete within 30 days
- CCPA: Complete within 45 days

---

## 6. Backup Retention

### 6.1 Backup Schedule

**Daily Full Backups:**
- Time: 2:00 AM UTC (off-peak)
- Frequency: Daily
- Retention: 30 days
- Storage: Encrypted in S3 or backup service

**Hourly Incremental Backups:**
- Time: Every hour on the hour
- Retention: 7 days
- Enables recovery to any hour
- Used for quick restores

**Weekly Archive Backup:**
- Time: Every Sunday 3:00 AM UTC
- Retention: 12 months
- Off-site storage (geographically distributed)
- Used for long-term disaster recovery

### 6.2 Backup Encryption

**Encryption Standard:** AES-256-GCM (same as application)
**Key Management:** Separate backup encryption key
**Key Rotation:** Annually or per security policy
**Key Storage:** Secure key management service

**Process:**
1. Application data encrypted before backup
2. Backup encrypted with backup key
3. Double encryption protects data
4. Keys stored separately from backups

### 6.3 Backup Verification

**Testing Schedule:** Quarterly
**Test Process:**
1. Select random backup from archive
2. Attempt full restore to test environment
3. Verify data integrity
4. Confirm all databases restored
5. Confirm all files present
6. Document test results

**Success Criteria:**
- Database restores without errors
- Data integrity verified (checksums match)
- All records accessible
- No data corruption detected

**Failure Response:**
- Notify security team immediately
- Investigate why backup failed
- Replace failed backup with new backup
- Update backup strategy if needed

---

## 7. Data Archive

### 7.1 Archive Strategy

**Purpose:** Retain data beyond production database retention while reducing cost

**When Data is Archived:**
- After 2 years (transition from hot to cold storage)
- After active access period ends
- When data no longer needed for operations

**Archive Timeline:**
- Years 0-2: Hot storage (quick access, full performance)
- Years 2-7: Cold storage (slower access, lower cost)
- After 7 years: Deleted

**Cost Savings:**
- Hot storage: $0.023/GB/month
- Cold storage: $0.004/GB/month
- Estimated annual savings: 80% for archived data

### 7.2 Archive Retention

**Archived Data Retention:**
- Audit logs: 7 years total (hot + cold)
- Deal documents: 7 years total
- User data: 3 years total
- Backups: 30 days (cold archive)

**Retrieval Process:**
1. Request archived data (email to archives@lendry.com)
2. Verify user authorization
3. Locate in archive
4. Decompress and decrypt
5. Provide access (4-24 hour turnaround)
6. Log access attempt

### 7.3 Archive Deletion

**Automatic Deletion Schedule:**
- Quarterly deletion job (every 3 months)
- Checks for archived data past retention date
- Verifies no legal holds
- Deletes files from archive
- Logs deletion event

**Manual Deletion (Exceptional):**
- Legal team requests deletion before expiry
- Compliance team verifies request
- Archives team deletes files
- Event logged with approval chain

---

## 8. Compliance Verification

**Retention Policy Verification Checklist:**
- [ ] Audit logs retained 7 years
- [ ] Deal data retained 7 years
- [ ] User accounts retained 3 years after deletion
- [ ] Documents retained 7 years
- [ ] Backups retained 30 days (rotating)
- [ ] Legal holds honored and tracked
- [ ] Deletion requests processed within timeline
- [ ] Archive transition documented
- [ ] Automatic deletion jobs functioning
- [ ] Restore/recovery tested quarterly

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Approval:** Security Team & Legal Team

# Backup & Disaster Recovery Plan

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Recovery Objectives
2. Backup Strategy
3. Backup Schedule & Retention
4. Backup Verification
5. Recovery Procedures
6. Failover Strategy
7. Testing & Drills

---

## 1. Recovery Objectives

### 1.1 Recovery Time Objective (RTO)

**Definition:** Maximum acceptable downtime for Lendry service

**RTO by Service Level:**

| Severity | Service | RTO | Justification |
|----------|---------|-----|---------------|
| Critical | Core API | 4 hours | Customers cannot process deals |
| Critical | Authentication | 4 hours | Users cannot login |
| High | Audit Logs | 4 hours | Compliance records inaccessible |
| Medium | Reporting | 24 hours | Non-critical dashboards |
| Low | Documentation | 48 hours | Helpful but not blocking |

**Operational Goal:** Target <1 hour recovery for most outages through automation

### 1.2 Recovery Point Objective (RPO)

**Definition:** Maximum acceptable data loss (how recent must backup be)

**RPO by Data Type:**

| Data Type | RPO | Frequency |
|-----------|-----|-----------|
| Core data (users, deals, docs) | 1 hour | Hourly backups |
| Audit logs | 5 minutes | Real-time replication |
| Configuration | 1 day | Daily backups |
| Backups of backups | 7 days | Weekly archives |

**Acceptable Data Loss:** Up to 1 hour of changes

### 1.3 Business Continuity Plan

**Continuity Scenarios:**
- Single server failure (web/app)
- Database server failure
- Entire data center down
- Ransomware/data corruption
- Accidental data deletion

**Goal:** For any scenario, restore service within RTO

---

## 2. Backup Strategy

### 2.1 Backup Architecture

**Primary Backup Methods:**

**Database Backups (PostgreSQL):**
- Full backup: Daily at 2:00 AM UTC
- Incremental backup: Hourly
- Retention: 30 days (rolling window)
- Encryption: AES-256 at rest

**Application Data:**
- Document files: Backed up with database
- Configuration files: Version controlled (git)
- Environment variables: Not backed up (recreated on restore)

**File Storage:**
- Location: Cloud object storage (S3 or similar)
- Encryption: Client-side encryption before upload
- Redundancy: Multi-region replication

### 2.2 Backup Media

**Primary:** Cloud object storage (S3, Azure Blob, Google Cloud Storage)
- Advantage: Scalable, cheap, highly available
- Disadvantage: Slightly higher latency on restore

**Secondary (Archive):** Offline backups (optional)
- Tape backups for 7-year archival
- Geographically dispersed
- Air-gapped (not connected to network)

### 2.3 Backup Encryption

**Encryption Method:** AES-256-GCM (application-level)
**Key Management:** Separate backup encryption key
**Key Storage:** Secure key management service
**Key Rotation:** Annually or per security policy

**Process:**
1. Data encrypted before sending to backup service
2. Backup service stores encrypted data
3. Only authorized personnel have decryption key
4. Key backup stored separately (secure location)

---

## 3. Backup Schedule & Retention

### 3.1 Daily Full Backups

**Schedule:** Every day at 2:00 AM UTC (off-peak)
**Duration:** 15-30 minutes (depends on database size)
**Retention:** 30 days

**Backup Contents:**
- Complete PostgreSQL database
- All application data
- User accounts, roles, permissions
- Audit logs
- Documents and files

**Verification:**
- Backup completion verified
- Backup size within expected range
- Backup encrypted successfully
- Checksum calculated and stored

### 3.2 Hourly Incremental Backups

**Schedule:** Every hour on the hour
**Duration:** 5-10 minutes per increment
**Retention:** 7 days (168 incremental backups)

**Purpose:** Enable recovery to any hour without large RPO loss

**Recovery Scenario:**
- If restoration needed: Restore latest daily + required incremental
- Enables recovery to specific point in time
- Balances speed vs data loss risk

### 3.3 Weekly Archive Backup

**Schedule:** Every Sunday at 3:00 AM UTC
**Duration:** 30-60 minutes
**Retention:** 1 year (52 backups)

**Purpose:** Long-term archival, disaster recovery

**Process:**
1. Take backup from current week
2. Copy to cold storage (S3 Glacier, tape)
3. Encrypt with long-term encryption key
4. Verify integrity
5. Document backup details
6. Test restore annually

### 3.4 Backup Retention Policy

**Rolling Window Approach:**

```
Hourly: Last 7 days (168 backups)
Daily: Last 30 days (30 backups)
Weekly: Last 52 weeks (52 backups)
Monthly: Last 24 months (24 backups) [optional]
```

**Automatic Cleanup:**
- Backups older than retention period automatically deleted
- Deletion occurs weekly (Sunday after archive backup)
- Deletion logged (what, when, why)
- Backups marked for deletion never deleted if legal hold

---

## 4. Backup Verification

### 4.1 Automated Verification

**After Each Backup:**
1. Verify backup file size is >10 MB (not empty)
2. Verify encryption successful (encrypted bits present)
3. Verify checksum calculated and stored
4. Verify metadata (timestamp, compression ratio)
5. Alert on any failures

**Daily Verification:**
- Verify latest daily backup integrity
- Verify backup files accessible
- Verify backup replication (multi-region)

### 4.2 Quarterly Restore Testing

**Schedule:** Every 3 months

**Procedure:**
1. Select random backup from archive
2. Restore to isolated test environment
3. Verify database integrity
4. Verify all tables accessible
5. Verify data consistency
6. Run application against restored database
7. Verify audit logs intact
8. Document results

**Success Criteria:**
- Restore completes without errors
- All data accessible and consistent
- No corruption detected
- Application functions normally
- Audit logs queryable

**Failure Response:**
- Investigate why backup failed
- Replace failed backup if possible
- Update backup strategy if needed
- Repeat test with different backup

### 4.3 Backup Integrity Checks

**Checksums:**
- MD5/SHA256 hash calculated for each backup
- Hash verified before restoration
- Protects against corruption in transit/storage

**Database Integrity:**
- PostgreSQL REINDEX (periodic)
- Constraint checks
- Foreign key validation
- Sequence validation

---

## 5. Recovery Procedures

### 5.1 Disaster Declaration

**Who Can Declare:**
- CEO
- CTO/Engineering Lead
- Incident Commander
- Operations Manager

**Declaration Process:**
1. Confirm issue is real (not false alarm)
2. Assess scope (what's down?)
3. Declare disaster/outage
4. Activate recovery procedures
5. Notify team + stakeholders

**Communication:**
- Slack: #incidents
- Status page: Update status
- Customers: Email notification
- Execute incident response plan

### 5.2 Recovery Steps

**Phase 1: Preparation (15-30 min)**
1. Declare disaster
2. Determine which backup to use
3. Verify backup integrity
4. Assemble recovery team
5. Allocate infrastructure for restore

**Phase 2: Restoration (30-60 min)**
1. Provision new database server (or use existing)
2. Decrypt backup encryption key
3. Download backup from storage
4. Restore database from backup
5. Restore application files
6. Restore configuration
7. Verify restoration complete

**Phase 3: Verification (15-30 min)**
1. Query database (basic SELECT)
2. Verify recent audit logs present
3. Check user accounts intact
4. Test authentication
5. Test API endpoints
6. Verify document access
7. Spot-check data integrity

**Phase 4: Resumption (5-15 min)**
1. Update DNS/routing (if server changed)
2. Resume application service
3. Monitor for errors
4. Inform users service restored
5. Begin transition from disaster state

**Phase 5: Post-Recovery (hours-days)**
1. Verify application stability
2. Monitor error rates
3. Monitor performance
4. Address any issues found
5. Bring systems back to normal
6. Post-incident review

### 5.3 Recovery Time Estimate

**Best Case (single component failure):**
- Detection: 5 minutes
- Restoration: 20 minutes
- Verification: 10 minutes
- **Total: 35 minutes (within RTO)**

**Typical Case (multiple components):**
- Detection: 15 minutes
- Restoration: 45 minutes
- Verification: 20 minutes
- **Total: 80 minutes (within RTO)**

**Worst Case (major data center failure):**
- Detection: 30 minutes
- Infrastructure provisioning: 60 minutes
- Restoration: 90 minutes
- Verification: 30 minutes
- **Total: 210 minutes = 3.5 hours (within RTO)**

---

## 6. Failover Strategy

### 6.1 Automatic Failover (if applicable)

**Database Replication:**
- Primary: Main production database
- Standby: Hot standby replica
- Monitoring: Continuous health check
- Failover trigger: Primary unresponsive for >30 seconds

**Failover Process:**
1. Health check fails for primary
2. Automatic failover to standby
3. Standby promoted to primary
4. Connections redirected
5. Monitoring updated
6. Team notified

**RTO with Automatic Failover:** <5 minutes

**RPO with Automatic Failover:** <30 seconds (near real-time replication)

### 6.2 Application-Level Failover

**Load Balancer:**
- Distributes traffic across multiple app servers
- Health checks each server
- Removes unhealthy servers automatically
- Distributes load across healthy servers

**Failover Process:**
1. Health check fails for app server
2. Load balancer stops sending traffic
3. Existing connections drain
4. Server taken offline
5. Deployment team notified
6. Server replaced/recovered

**RTO with Load Balancing:** <1 minute (automatic)

### 6.3 DNS Switchover

**Purpose:** Redirect traffic if entire data center down

**Primary DNS:** Points to primary data center
**Secondary DNS:** Points to secondary data center
**TTL:** 60 seconds (fast failover)

**Manual Switchover:**
1. Declare data center failure
2. Verify secondary data center ready
3. Update DNS to point to secondary
4. Verify traffic flowing correctly
5. Monitor for issues

**RTO with DNS Failover:** 2-5 minutes (includes TTL + propagation)

---

## 7. Testing & Drills

### 7.1 Quarterly Restore Test

**When:** Every 3 months (Q1, Q2, Q3, Q4)
**Duration:** 2-4 hours
**Team:** Database admin, ops team, engineering lead

**Test Procedure:**
1. Select random backup
2. Allocate isolated test infrastructure
3. Restore from backup
4. Verify integrity
5. Document results
6. Report to team

**Pass Criteria:**
- Restore completes successfully
- No corruption detected
- Application functions normally
- Results documented

### 7.2 Annual Disaster Recovery Drill

**When:** Once per year (designated quarter)
**Duration:** 4-8 hours (full day exercise)
**Scope:** Full system recovery simulation

**Drill Scenario:**
- "Assume primary data center has caught fire"
- "All systems must be recovered to secondary"
- Follow actual recovery procedures
- Measure RTO/RPO
- Document lessons learned

**Participants:**
- Engineering team
- Operations team
- Management
- External auditor (optional, for SOC 2)

**Evaluation:**
- Did we meet RTO?
- Did we meet RPO?
- Were there unexpected issues?
- What improvements needed?
- Update procedures based on findings

### 7.3 Regular Monitoring

**Daily:**
- [ ] Latest backup present and valid
- [ ] Backup encryption successful
- [ ] Backup storage accessible

**Weekly:**
- [ ] Backup size within expected range
- [ ] Replication to secondary location successful
- [ ] No errors in backup logs

**Monthly:**
- [ ] Backup retention policy enforced
- [ ] Old backups deleted as scheduled
- [ ] Storage cost within budget

---

## Appendix: Disaster Recovery Runbook

Use this during actual disaster recovery:

**Step 1: Declare Disaster**
- [ ] Confirm system is truly down
- [ ] Determine affected components
- [ ] Notify incident commander
- [ ] Activate incident response team

**Step 2: Assess**
- [ ] Root cause (hardware failure, data corruption, attack?)
- [ ] Scope (all users affected, all data, specific feature?)
- [ ] Backup status (which backup to restore?)
- [ ] Recovery time estimate

**Step 3: Recover**
- [ ] Get latest valid backup
- [ ] Verify backup integrity
- [ ] Prepare recovery infrastructure
- [ ] Start restoration
- [ ] Monitor restoration progress

**Step 4: Verify**
- [ ] Database accessible
- [ ] Data integrity verified
- [ ] Application responds
- [ ] Basic functions work
- [ ] Audit logs accessible

**Step 5: Resume**
- [ ] Update status page
- [ ] Notify users
- [ ] Monitor for issues
- [ ] Stand down disaster team
- [ ] Schedule post-incident review

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Last DR Drill:** March 3, 2026
**Next Restore Test:** June 3, 2026
**Approval:** Operations Team

# Incident Response Plan

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Incident Definition & Classification
2. Detection Mechanisms
3. Incident Response Team
4. Response Procedures
5. Investigation Process
6. Remediation & Recovery
7. Notification Requirements
8. Post-Incident Review
9. Contact Information

---

## 1. Incident Definition & Classification

A security incident is an unauthorized, unexpected, or undesirable event that impacts the confidentiality, integrity, or availability of the Lendry system or data.

### 1.1 Types of Incidents

**Data Breach**
- Unauthorized access to Restricted or Confidential data
- Disclosure of customer information, financial data, or credentials
- Loss or theft of physical devices containing sensitive data
- Examples: Hacked account accessing user data, stolen laptop with database backup

**Unauthorized Access**
- Successful authentication with compromised credentials
- Account takeover by external attacker
- Access from unusual location or time (impossible travel)
- Examples: Attacker using stolen password, account compromised via phishing

**System Compromise**
- Malware, ransomware, or rootkit detected
- Injection attacks (SQL, command, code)
- Unauthorized code modification or deployment
- Examples: Website defacement, ransomware infection, unauthorized database access

**Service Disruption**
- System unavailability exceeding acceptable threshold (>1 hour)
- Denial of service (DoS) or DDoS attack
- Complete data loss or corruption
- Examples: API down, database corrupted, all users unable to login

**Audit Log Tampering**
- Attempted deletion or modification of audit logs
- Audit log data integrity violations
- Unauthorized audit log access attempts
- Examples: Deletion of logs covering unauthorized access, log injection attack

**Third-Party Breach**
- Security incident at vendor (Google, Microsoft, AWS, etc.)
- Compromise affecting data processed by third party
- Unauthorized access to our data by third party
- Examples: AWS S3 bucket misconfiguration, vendor data breach

### 1.2 Incident Severity Classification

**Critical (P0) - Immediate Response Required**
- Data breach in progress or discovered
- Active system compromise or malware detected
- Complete service outage
- Audit log tampering detected
- **Response Time:** Immediate (within 1 hour)
- **Escalation:** CEO, Board notification required

**High (P1) - Urgent Response Required**
- Unauthorized access to account with sensitive data
- Credential compromise detected
- DoS/DDoS attack in progress
- Configuration change affecting security controls
- **Response Time:** Within 1 hour
- **Escalation:** Executive team notification

**Medium (P2) - Standard Response**
- Suspicious activity detected (unusual login pattern, API usage spike)
- Failed intrusion attempt
- Policy violation without data impact
- Single user account password weakness
- **Response Time:** Within 4 hours
- **Escalation:** Security team notification

**Low (P3) - Normal Response**
- Informational security events
- Documented security policy violations
- Test/simulation activities
- Security awareness findings
- **Response Time:** Within 24 hours
- **Escalation:** Security team internal tracking

---

## 2. Detection Mechanisms

### 2.1 Automated Detection

**Audit Log Analysis**
- Real-time monitoring of audit log entries
- Alert on suspicious action patterns (e.g., bulk user deletions)
- Alert on unusual access times or locations
- Alert on repeated failed authentication attempts

**Failed Login Tracking**
- Monitor account lockout events (5 failed attempts)
- Alert on multiple lockouts from same IP (possible attack)
- Alert on lockout from unusual locations
- Alert on lockout patterns indicating brute force

**API Rate Limit Violations**
- Monitor API rate limit exceeding
- Alert on sustained rate limit violations (possible DDoS)
- Alert on unusual API endpoint access patterns
- Alert on bot-like behavior (automated requests)

**System Health Monitoring**
- Database connection pool saturation
- CPU/memory utilization spikes
- Response time degradation
- Error rate spikes in application logs

**Automated Alerts:**
- Email to security team on P0/P1 incidents
- Slack integration (if available) for real-time notifications
- PagerDuty escalation for critical incidents (if integrated)

### 2.2 Manual Detection

**User Reports**
- Users reporting suspicious account activity
- Users noticing unauthorized changes
- Users forwarding phishing emails
- **Process:** Support team triages and escalates to security team

**Security Team Monitoring**
- Regular review of audit logs (daily)
- Periodic penetration testing and security assessments
- Code review for security issues
- Dependency scanning for vulnerable packages

**Vendor Notifications**
- Third-party breach notifications from vendors
- Automated vulnerability scanning results
- Certificate expiration warnings
- Upgrade recommendations

---

## 3. Incident Response Team

### 3.1 Team Structure

**Incident Commander (IC)**
- **Role:** Orchestrates incident response, makes critical decisions
- **Responsibilities:** Timeline coordination, status updates, escalation decisions
- **Selection:** On-call rotation (designated security officer, senior engineer)
- **Authority:** Authorized to authorize remediation actions, temporary access grants

**Security Lead (SL)**
- **Role:** Investigates technical aspects, analyzes logs
- **Responsibilities:** Evidence preservation, forensic analysis, root cause analysis
- **Selection:** Security officer or senior security engineer
- **Authority:** Authorized to access restricted data for investigation

**Communications Lead (CL)**
- **Role:** Manages internal and external communications
- **Responsibilities:** Stakeholder notifications, customer communication, media relations
- **Selection:** Legal, PR, or operations team member
- **Authority:** Authorized to approve customer notification messaging

**Legal/Compliance Lead (LL)**
- **Role:** Ensures regulatory compliance during incident response
- **Responsibilities:** Regulatory notification, legal implications, contract requirements
- **Selection:** Legal team or compliance officer
- **Authority:** Authorized to interpret legal obligations, approve notifications

### 3.2 Activation & Escalation

**Activation Process:**
1. Incident detected or reported
2. Initial severity assessment
3. P0/P1: Incident Commander immediately notified via phone
4. Incident Commander assembles response team
5. Team meets in dedicated incident room (physical or virtual)

**Escalation Path:**
- **P0:** Executive team → CEO → Board (if required)
- **P1:** Executive team → CEO (if severity increases)
- **P2:** Security team internal (no external escalation initially)
- **P3:** Security team internal, added to monthly report

**Communication Hub:**
- Dedicated Slack channel or conference bridge for team communication
- Real-time status updates every 15-30 minutes (depending on severity)
- External communication via email to stakeholders

---

## 4. Response Procedures

### 4.1 Phase 1: Preparation & Detection (Immediate - 0-1 hour)

**Initial Incident Report:**
1. Document incident details: What happened, when, who discovered it, how
2. Determine initial severity (P0/P1/P2/P3)
3. Assign Incident Commander
4. Assemble response team

**Situation Assessment:**
- Confirm incident is real (rule out false alarms)
- Determine scope: Which systems, which data affected
- Estimate impact: How many users/records affected
- Preserve evidence: DO NOT DELETE anything yet

**Initial Actions:**
- P0: Disable compromised accounts immediately
- P0: Isolate affected systems if safe to do so
- P1: Enable enhanced logging on suspicious systems
- P2/P3: Gather initial information without disruption

### 4.2 Phase 2: Investigation (1-4 hours for P0/P1)

**Preserve Evidence:**
- Capture system state: Screenshots, disk images, memory dumps
- Preserve audit logs: Copy logs to secure location
- Preserve communications: Email, Slack messages related to incident
- Document timeline: When each discovery was made

**Determine Scope:**
- Which systems were accessed
- Which data was accessed or modified
- Duration of access (first and last action)
- User accounts involved
- IP addresses involved

**Root Cause Analysis:**
- How did attacker gain initial access (if applicable)
- What vulnerabilities were exploited
- How long have they had access
- Were there missed warning signs

**Timeline Reconstruction:**
- Use audit logs to build detailed timeline
- Identify first unauthorized action
- Trace all subsequent actions
- Identify last unauthorized action
- Confirm detection time and delay

**Impact Assessment:**
- How many users affected
- Which specific records accessed/modified
- Was data exfiltrated or modified
- Can we confirm data integrity
- Is patient/customer PII involved

### 4.3 Phase 3: Containment (Parallel with Investigation)

**Short-term Containment (Immediate):**
- Disable compromised user accounts
- Revoke compromised API keys
- Invalidate compromised session tokens
- Block suspicious IP addresses
- Force password resets for potentially affected users
- Disable OAuth tokens if compromise likely

**System Isolation (if Critical Compromise):**
- Isolate affected database servers (disconnect from network)
- Isolate affected application servers
- Take snapshots of databases before making changes (for forensics)
- Do NOT delete any data without forensic backup

**User Communication:**
- Inform affected users immediately (P0) or within 24 hours
- Recommend password resets
- Watch for fraudulent activity
- Provide customer support contact for questions

---

## 5. Investigation Process

### 5.1 Log Analysis

**Where to Look:**
- `server/routes/audit.ts` - Main audit log for user actions
- Application logs - Errors, warnings, access patterns
- Database query logs - Unusual queries, modifications
- API gateway logs - Rate limiting, authentication failures
- VPN/SSH logs - System access attempts
- Web server logs - HTTP requests, origins

**What to Look For:**
- Unusual patterns in audit logs (bulk operations, after hours access)
- Failed authentication attempts before successful compromise
- Privilege escalation actions (role changes, permission grants)
- Data extraction attempts (bulk downloads, exports)
- Deletion or modification of audit logs (indicates post-compromise)
- Configuration changes (security settings modified)

**Audit Log Queries:**
```
GET /api/admin/audit-logs?action=user.role_changed&startDate=2026-03-01
GET /api/admin/audit-logs?resourceType=user&resourceId=123&action=user.deleted
GET /api/admin/audit-logs?ipAddress=192.168.1.100&limit=500
GET /api/admin/audit-logs/export?startDate=2026-03-01&endDate=2026-03-03
```

### 5.2 Evidence Collection

**Database Evidence:**
- User account changes (email, password reset, role changes)
- API key creation/revocation history
- Session token creation
- Encryption key access logs
- Backup information (when, by whom)

**Application Evidence:**
- Error logs (security-related errors)
- Warning logs (unusual activities)
- Info logs (operation confirmations)
- Sanitized logs (PII redacted)

**Infrastructure Evidence:**
- Network traffic captures (if available)
- System logs (OS-level events)
- Firewall logs (connection attempts)
- CDN/WAF logs (attack patterns)

---

## 6. Remediation & Recovery

### 6.1 Containment & Eradication

**Remove Attacker Access:**
1. Force password reset for compromised accounts
2. Revoke all active sessions for user
3. Revoke OAuth tokens and refresh tokens
4. Revoke API keys issued by user
5. Remove any created accounts that weren't real users
6. Restore system to known good backup (if data corrupted)

**Prevent Re-compromise:**
1. Patch exploited vulnerabilities
2. Update authentication requirements
3. Enable additional logging on affected systems
4. Add additional access controls
5. Deploy WAF rules to block attack patterns

**Verify Remediation:**
1. Re-run vulnerability assessment
2. Attempt attack pattern again (if safe)
3. Confirm logs show no further suspicious activity
4. Confirm system performance normal
5. Verify backups still valid and usable

### 6.2 Recovery

**Restore Services (if Outage):**
1. Verify backup integrity
2. Restore critical systems from backup (database, application)
3. Apply any necessary migrations/updates
4. Verify data integrity post-restore
5. Monitor for any anomalies
6. Gradually transition traffic from backup to restored system

**Verify Data Integrity:**
1. Compare checksums of critical data
2. Run consistency checks on database
3. Verify audit logs still present and unchanged
4. Verify no data corruption or loss
5. Spot-check random records for integrity

**Communication & Confirmation:**
1. Notify users that service restored
2. Confirm users can login and access data
3. Direct users to change passwords if compromised
4. Provide guidance on protecting accounts

---

## 7. Notification Requirements

### 7.1 Internal Notification

**P0 Incidents:**
- Immediate call to Incident Commander
- All response team members within 30 minutes
- Executive team within 1 hour
- Board notification within 2 hours (if data breach likely)

**P1 Incidents:**
- Email/Slack to Incident Commander
- Response team within 1 hour
- Executive team within 2 hours

**P2/P3 Incidents:**
- Email to security team
- Included in daily/weekly report
- Executive summary in monthly report

### 7.2 Customer Notification

**Data Breach Notification (California Consumer Privacy Act compliance):**
- **Timeline:** Without unreasonable delay, no later than 72 hours after discovery
- **Method:** Email to customers affected
- **Content:**
  - What data was accessed (specific fields)
  - When the incident occurred (date range)
  - What we discovered and when
  - What we're doing to prevent recurrence
  - What customers should do (password reset, monitoring)
  - Customer support contact information
  - Reference to full notification in FAQ

**Financial Services Notification (if required):**
- **Timeline:** Immediate (per contract requirements)
- **Method:** Email + phone call to primary contact
- **Content:** Business impact, timeline, remediation steps

**Regulatory Notification:**
- **FTC (if 500+ US residents affected):** Notification within 60 days of discovery
- **State Attorneys General:** As required by each state law
- **Media Notification:** If 500+ residents in state affected (per CCPA)

### 7.3 Regulatory Notification

**SOC 2 Auditors:**
- Incident Type C Notification (material security event)
- Provided within scope of audit
- Document incident and response

**Vendors/Partners:**
- Notify if their data was compromised
- Notify if our services affected them
- Provide details on remediation

---

## 8. Post-Incident Review

### 8.1 Incident Review Meeting

**Timing:** Within 5 business days of incident resolution
**Duration:** 1-2 hours
**Attendees:** Incident response team, engineering team, management
**Scope:** Review what happened, how we responded, what to improve

### 8.2 Review Contents

**What Happened (Timeline):**
- First warning signs (what we should have noticed)
- First confirmed detection
- Escalation chain
- How long until contained
- How long until recovered

**What Worked Well:**
- Fast detection
- Effective communication
- Quick team assembly
- Effective remediation steps
- Good documentation

**What Needs Improvement:**
- Delayed detection (why didn't we detect faster)
- Communication gaps
- Process issues
- Knowledge gaps
- System improvements needed

**Lessons Learned:**
- Specific action items to prevent recurrence
- Process improvements
- Documentation updates
- Training needs

### 8.3 Follow-up Actions

**Implement Improvements:**
1. Create bug fix or feature request for identified gaps
2. Update documentation and runbooks
3. Provide team training on lessons learned
4. Implement monitoring improvements
5. Schedule vulnerability assessment if needed

**Metrics to Track:**
- Time to Detection (TTD)
- Time to Response (TTR)
- Time to Remediation (TTCR)
- Data Impact (records, types)
- Notification Time (to customers)
- Resolution Status

---

## 9. Contact Information

### 9.1 Incident Response Contacts

**Primary Incident Commander:**
- **Name:** [Security Officer Name]
- **Email:** [email]
- **Phone:** [phone]
- **Backup:** [Secondary Contact]

**Security Team:**
- **Email:** security@lendry.com
- **Slack Channel:** #security-incidents
- **On-call Rotation:** [Link to on-call schedule]

**Executive Escalation:**
- **CEO:** [Name/Contact]
- **COO:** [Name/Contact]
- **Board Contact:** [Name/Contact]

### 9.2 External Contacts

**Legal Team:**
- **Outside Counsel:** [Law Firm Name/Contact]
- **Retained for Incident Response:** [Yes/No]
- **Retainer Agreement:** [On file/Reference]

**Insurance Broker:**
- **Cyber Insurance Carrier:** [Insurance Company]
- **Policy Number:** [Number]
- **Claims Contact:** [Phone/Email]

**Forensic Services (Pre-arranged):**
- **Incident Response Firm:** [Firm Name]
- **Services:** Forensics, root cause analysis
- **Contact:** [Phone/Email]
- **Engagement Agreement:** [On file/Reference]

### 9.3 Customer Communication

**Support Team Contact:**
- **Email:** support@lendry.com
- **Phone:** [Support Phone]
- **Escalation:** security@lendry.com

**Social Media Monitoring:**
- **Twitter:** @LendryApp
- **LinkedIn:** Lendry Company
- **Blog:** blog.lendry.com

---

## Appendix: Incident Response Checklist

**Detection Phase:**
- [ ] Incident reported and confirmed
- [ ] Initial severity assessment completed
- [ ] Incident Commander assigned
- [ ] Response team assembled

**Investigation Phase:**
- [ ] Evidence preserved
- [ ] Scope determined
- [ ] Root cause identified
- [ ] Timeline reconstructed
- [ ] Impact assessed

**Containment Phase:**
- [ ] Compromised accounts disabled
- [ ] Suspicious access blocked
- [ ] System isolated (if critical)
- [ ] Users notified of account compromise

**Remediation Phase:**
- [ ] Vulnerabilities patched
- [ ] Access controls strengthened
- [ ] Systems restored to normal
- [ ] Data integrity verified

**Notification Phase:**
- [ ] Internal team notified
- [ ] Customers notified (if applicable)
- [ ] Regulators notified (if applicable)
- [ ] Vendors notified (if applicable)

**Review Phase:**
- [ ] Post-incident meeting held
- [ ] Lessons learned documented
- [ ] Improvements prioritized
- [ ] Follow-up actions assigned

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Last Tested:** March 3, 2026
**Approval:** Security Team & Executive Management

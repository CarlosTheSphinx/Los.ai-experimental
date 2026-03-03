# Security Policy

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Data Classification Framework
2. Access Control Policy
3. Authentication & Authorization
4. Session Management
5. Security Roles & Responsibilities
6. Compliance References

---

## 1. Data Classification Framework

All data within the Lendry system is classified into four levels based on sensitivity and access requirements:

### Level 1: Public Data
- Non-sensitive information intended for public distribution
- Marketing materials, documentation, public-facing product information
- Requires basic confidentiality controls
- Examples: Public blog posts, marketing copy, general documentation

### Level 2: Internal Data
- Information for internal use only, not sensitive
- Employee information (name, email, department), internal processes, non-sensitive business data
- Requires basic access controls
- Examples: User profiles (non-financial), organizational structure, general operational data

### Level 3: Confidential Data
- Sensitive business information requiring restricted access
- Customer deal information, financial data, loan quotes, business intelligence
- Requires strong access controls and audit logging
- Examples: Deal amounts, borrower information, property details, interest rates, loan terms

### Level 4: Restricted Data
- Highly sensitive data requiring maximum protection
- Passwords, API keys, encryption keys, Social Security numbers, OAuth tokens, payment credentials
- Requires encryption at rest and in transit, restricted access, non-logging
- Examples: Password hashes, JWT secrets, encryption keys, PII like SSN

### Data Classification by Schema Table

| Table | Classification | Rationale |
|-------|----------------|-----------|
| users | L2-L3 | User profile data is internal; sensitive data encrypted |
| deals | L3 | Loan details and financial information |
| documents | L3 | Legal and financial documents |
| auditLogs | L3 | Logs contain sensitive information about user actions |
| passwords | L4 | Stored as bcrypt hashes, never plaintext |
| encryption keys | L4 | Stored as environment variables, never in code |
| oauth tokens | L4 | Encrypted with AES-256-GCM |

---

## 2. Access Control Policy

### 2.1 Role Definitions

The system implements five core roles with hierarchical permissions:

#### super_admin
- **Purpose:** Complete system administration and oversight
- **Access:** All features, all data, unrestricted
- **Responsibilities:** User management, system configuration, compliance oversight
- **Restrictions:** None (documented security trade-off for operational efficiency)

#### admin
- **Purpose:** Team management and day-to-day operations
- **Access:** User and team management, assigned deals/documents, configuration
- **Restrictions:** Cannot modify super_admin accounts, cannot view all users' sensitive data
- **Use Case:** Office managers, compliance officers, team leads

#### processor
- **Purpose:** Loan processing and deal management
- **Access:** Deal management, document handling, assigned tasks
- **Restrictions:** Limited to assigned deals, cannot modify user roles, cannot delete data
- **Use Case:** Loan officers, processors, underwriters

#### staff
- **Purpose:** Support and administrative tasks
- **Access:** Data entry, basic document upload, limited deal viewing
- **Restrictions:** Read-only or limited write to non-sensitive operations
- **Use Case:** Administrative assistants, data entry staff

#### user / borrower / lender
- **Purpose:** External stakeholders and customers
- **Access:** Limited to their own resources, document signing, basic viewing
- **Restrictions:** Cannot view other users' data, no admin access
- **Use Case:** Borrowers, lenders, external partners

### 2.2 Permission Matrix

The system defines **31 granular permissions** mapped to roles:

**User Management Permissions:**
- users.create, users.read, users.update, users.delete
- users.manage_roles, users.manage_permissions
- users.view_audit_logs, users.export_audit_logs

**Deal Management Permissions:**
- deals.create, deals.read, deals.update, deals.delete
- deals.manage_stages, deals.manage_tasks
- deals.assign_users

**Document Permissions:**
- documents.upload, documents.download, documents.view
- documents.sign, documents.delete, documents.approve

**System Configuration Permissions:**
- config.manage_stages, config.manage_programs
- config.manage_workflows, config.manage_templates
- settings.view, settings.update

**Audit & Compliance Permissions:**
- audit.view_logs, audit.export_logs, audit.manage_retention

### 2.3 Scope Types

Permissions can be scoped to control data access:

- **"all":** User can access all instances (super_admin, admin typically)
- **"assigned_only":** User can only access resources assigned to them (processor, staff typically)

Example: A processor might have `deals.read` with scope "assigned_only", allowing them to view only deals they're assigned to.

### 2.4 Principle of Least Privilege

**Default Deny:** All permissions default to denied unless explicitly granted
**Minimal Access:** Users receive only the minimum permissions needed for their role
**Regular Review:** Permissions are reviewed quarterly and adjusted as needed
**Separation of Duties:** Critical functions (approval, deletion) require multiple roles

---

## 3. Authentication & Authorization

### 3.1 Authentication Methods

The system supports multiple authentication methods:

#### Password + JWT
- **Description:** Traditional username/password with JWT token authentication
- **Implementation:** Credentials verified against bcrypt hash, JWT issued on success
- **Token Lifetime:** 24 hours for access token, 7 days for refresh token
- **Use Case:** Primary authentication method for web and mobile clients
- **Location:** `server/auth.ts` - AuthController.login()

#### OAuth 2.0 (Google, Microsoft)
- **Description:** Third-party authentication via Google and Microsoft identity providers
- **Supported Providers:** Google (Gmail), Microsoft (Office 365)
- **Token Handling:** Tokens encrypted with AES-256-GCM, stored securely
- **Scopes Requested:** Minimal required for mail and calendar integration
- **Use Case:** Enterprise single sign-on, reduced credential management burden
- **Location:** `server/auth.ts` - AuthController.googleCallback(), microsoftCallback()

#### Magic Links (Email-based)
- **Description:** Temporary login link sent via email
- **Token Lifetime:** 24 hours
- **Implementation:** Hashed token stored in database, compared on click
- **Security:** Links are single-use, expiring after verification
- **Use Case:** Password reset, passwordless login for partners
- **Location:** `server/routes.ts` - Email token generation

### 3.2 Password Requirements

**Minimum Length:** 12 characters
**Complexity:** Must include uppercase, lowercase, numbers, special characters
**Dictionary Words:** Avoid common passwords (checked against common passwords list)
**Expiration:** 90 days from last change (enforced at login)
**History:** Cannot reuse last 5 passwords (if implemented)
**Reset:** Available via email link (24-hour token) or admin force-reset

### 3.3 Password Hashing

- **Algorithm:** Bcrypt with 12 salt rounds
- **Storage:** `passwordHash` field in users table, never plaintext
- **Verification:** bcrypt.compare() function in `server/auth.ts`
- **Strength:** 12 rounds provides ~200ms computation time, resistant to GPU attacks
- **Location:** `server/auth.ts` - AuthController.register(), login()

### 3.4 Account Lockout Policy

**Trigger:** 5 failed login attempts
**Lockout Duration:** 30 minutes
**Tracking Fields:**
- `failedLoginAttempts` - Count of failed attempts
- `accountLockedUntil` - Timestamp when lockout expires

**Reset Mechanisms:**
- Automatic unlock after 30 minutes
- Manual unlock by super_admin
- Password reset via email link
- OAuth login (bypasses password and lockout)

**Audit Logging:** All lockout events logged with timestamp, IP address, user agent

### 3.5 Permission Caching

**Purpose:** Optimize permission checks while maintaining security
**TTL:** 5 minutes
**Invalidation:** Automatic expiry or manual on role/permission change
**Implementation:** In-memory cache with timestamp validation
**Location:** `server/utils/permissions.ts`

### 3.6 Super-Admin Security Considerations

**Full Access:** Super-admin role has access to all features, all data, all operations
**Rationale:** Necessary for system administration, incident response, audit access
**Audit Trail:** All super-admin actions logged to audit trail
**Monitoring:** Super-admin activities monitored for misuse patterns
**Recommendation:** Limit number of super-admin accounts, use strong passwords, enable MFA if available

---

## 4. Session Management

### 4.1 JWT Token Lifetime

- **Access Token:** 24 hours (short-lived for security)
- **Refresh Token:** 7 days (allows extended access without re-login)
- **Token Format:** JWT signed with HS256 algorithm using JWT_SECRET
- **Payload:** User ID, email, role, permissions, issued at, expiration

### 4.2 Token Refresh

- **Endpoint:** POST /api/auth/refresh
- **Authentication:** Refresh token required
- **Validation:** Token must be unexpired and match user's record
- **Response:** New access token issued, refresh token unchanged
- **Security:** Prevents indefinite sessions; requires periodic re-authentication

### 4.3 Logout Procedures

**Client-Side:**
- Clear access token from memory
- Clear refresh token from secure storage
- Clear user session data

**Server-Side:**
- No explicit logout endpoint (stateless JWT)
- Optional: Blacklist refresh tokens (if implemented)
- Audit log: Log logout event with timestamp
- Session expiry: Tokens expire naturally after TTL

### 4.4 Session Timeout

- **Idle Timeout:** Optional (not currently implemented)
- **Recommendation:** Implement 30-minute idle timeout for sensitive operations
- **Forced Re-authentication:** After timeout, user must re-login
- **Audit:** Timeout events logged

---

## 5. Security Roles & Responsibilities

### 5.1 Security Officer
- **Responsibility:** Oversee security policies, conduct risk assessments
- **Access:** Audit logs, security configuration, compliance documentation
- **Reporting:** Reports to executive team on security posture

### 5.2 System Administrator
- **Responsibility:** System maintenance, user account management, operational security
- **Access:** Super-admin credentials, system logs, infrastructure access
- **Monitoring:** Monitors for unauthorized access, performance issues

### 5.3 Application Team
- **Responsibility:** Implement security controls, maintain code quality, follow secure development practices
- **Accountability:** Code review for security issues, testing before deployment
- **Training:** Annual security training, incident response drills

---

## 6. Compliance References

This Security Policy maps to the following SOC 2 Trust Service Criteria:

- **CC-6:** Logical and Physical Access Controls
- **C-1:** Logical Access Controls - Monitoring

For detailed compliance mapping, see COMPLIANCE-CHECKLIST.md.

For related policies, see:
- ENCRYPTION-STANDARDS.md - Encryption requirements
- PASSWORD-POLICY.md - Password management procedures
- AUDIT-LOGGING-POLICY.md - Access control monitoring
- INCIDENT-RESPONSE-PLAN.md - Security incident handling

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Approval:** Security Team

# Encryption Standards

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Encryption Architecture Overview
2. Encryption Algorithms
3. Key Management
4. OAuth Token Encryption
5. Password Security
6. Data Classification by Encryption
7. Encryption Compliance

---

## 1. Encryption Architecture Overview

The Lendry system implements a defense-in-depth encryption strategy protecting data at multiple layers:

- **Data in Transit:** TLS 1.2+ encryption for all network communications
- **Data at Rest:** Application-level encryption for sensitive fields
- **Password Storage:** Bcrypt hashing (one-way, irreversible)
- **OAuth Tokens:** AES-256-GCM encryption for stored credentials

---

## 2. Encryption Algorithms

### 2.1 Data in Transit (TLS)

**Standard:** TLS 1.2 or higher
**Implementation:** HTTPS mandatory for all endpoints
**Certificate:** X.509 certificates issued by Certificate Authority
**Cipher Suites:** Modern cipher suites with forward secrecy (ECDHE)
**Enforcement:** HTTP redirects to HTTPS, HSTS header enabled
**Location:** Enforced at reverse proxy / CDN layer

**Configuration:**
```
HSTS Header: max-age=31536000; includeSubDomains; preload
Min TLS Version: 1.2
Strong Cipher Suites Only: No RC4, no MD5, no 3DES
```

### 2.2 Data at Rest (Application Level)

**Algorithm:** AES-256-GCM (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode)
**Key Size:** 256 bits
**IV (Initialization Vector):** 96 bits, randomly generated per encryption
**Authentication Tag:** 128 bits (ensures data integrity and authenticity)
**Performance:** ~1-2ms per encryption/decryption operation
**Library:** Node.js crypto module (built-in, no external dependencies)

**When Used:**
- OAuth tokens (Google, Microsoft access/refresh tokens)
- Sensitive API credentials
- User authentication tokens (optional)

**Not Encrypted (by design):**
- Password hashes (one-way hashing instead)
- Audit logs (immutable append-only pattern provides integrity)
- Most application data (relies on database-level access control)

**Future Enhancement:** PostgreSQL encryption at rest (pgcrypto or full-disk encryption)

### 2.3 Password Hashing

**Algorithm:** Bcrypt
**Salt Rounds:** 12
**Key Stretching:** 2^12 (4,096) iterations minimum
**Output Size:** 60 characters (includes salt + hash)
**Speed:** ~200ms per hash (intentionally slow to resist brute force)
**Storage:** `passwordHash` field in users table, never plaintext

**Properties:**
- One-way function: Hashes cannot be reversed to reveal passwords
- Salted: Each password has unique salt, preventing rainbow table attacks
- Adaptive: Cost factor (12) can be increased as hardware improves
- Non-deterministic: Same password produces different hash each time

**Verification Process:**
```
1. User submits password
2. Hash submitted password with stored salt
3. Compare computed hash with stored hash
4. Match = correct password; No match = incorrect password
```

### 2.4 OAuth Token Encryption

**Purpose:** Securely store third-party OAuth tokens (Google, Microsoft)
**Why Encrypt:** OAuth tokens are credentials that grant access to external services
**Implementation:** AES-256-GCM with randomly generated IV per token
**Stored Format:** Base64-encoded ciphertext + IV + auth tag
**Location:** `server/utils/encryption.ts` - encryptOAuthToken(), decryptOAuthToken()

**Token Types Encrypted:**
- `googleAccessToken` - Google API access credential
- `googleRefreshToken` - Google API refresh credential
- `microsoftAccessToken` - Microsoft Graph API access credential
- `microsoftRefreshToken` - Microsoft Graph API refresh credential

**Backward Compatibility:**
- System supports both encrypted and non-encrypted tokens
- Tokens encrypted transparently during use
- Old non-encrypted tokens migrated on next refresh
- Ensures smooth deployment without downtime

---

## 3. Key Management

### 3.1 Encryption Keys

**JWT Secret (`JWT_SECRET`)**
- **Purpose:** Sign and verify JWT authentication tokens
- **Length:** Minimum 32 characters (256 bits)
- **Storage:** Environment variable (never in code)
- **Format:** Random string generated during deployment
- **Rotation:** Change on deployment or compromised secret disclosure

**Token Encryption Key (`TOKEN_ENCRYPTION_KEY`)**
- **Purpose:** Encrypt/decrypt OAuth tokens and sensitive credentials
- **Length:** 32 bytes (256 bits for AES-256)
- **Storage:** Environment variable (never in code)
- **Format:** Base64-encoded random bytes
- **Rotation:** Change on schedule or if compromised

**Database Password (`DATABASE_URL`)**
- **Purpose:** PostgreSQL database connection credentials
- **Storage:** Environment variable (never in code)
- **Format:** PostgreSQL connection string with embedded password
- **Rotation:** Change periodically or if compromised

### 3.2 Key Storage

**Deployment Environment:**
- **Development:** .env file (NOT in git, listed in .gitignore)
- **Staging:** Environment variables in CI/CD platform
- **Production:** Environment variables in deployment platform (e.g., Heroku Config Vars, AWS Secrets Manager)

**Security Properties:**
- Never committed to version control
- Never logged in application output
- Never exposed in error messages
- Never sent to third parties
- Encrypted at rest in key management service (if available)

### 3.3 Key Rotation

**Recommended Schedule:**
- JWT_SECRET: Rotate on major deployment or annually
- TOKEN_ENCRYPTION_KEY: Rotate annually or if compromised
- DATABASE_PASSWORD: Rotate every 6-12 months or if compromised

**Rotation Process:**
1. Generate new key with secure random generator
2. Deploy new key to environment (keep old key temporarily for read access)
3. Re-encrypt all sensitive data with new key
4. Remove old key from environment
5. Document rotation date in security log

**Compromise Response:**
- Immediate key rotation (do not wait for scheduled rotation)
- Audit all activities using potentially compromised key
- Refresh all OAuth tokens (user logout and re-login)
- Reset all API keys

### 3.4 Backup Key Procedures

**Backup Strategy:**
- Encryption keys backed up with same security level as production
- Backups encrypted with separate backup encryption key
- Separate key management service (HSM) recommended for production
- Test restore procedures quarterly

**Disaster Recovery:**
- Maintain offline backup of keys (encrypted USB, safe)
- Restrict access to key backups to Security Officer only
- Document procedure for emergency key restoration

---

## 4. OAuth Token Encryption

### 4.1 Token Encryption Flow

**When User Authenticates with Google/Microsoft:**
1. User redirects to Google/Microsoft OAuth flow
2. User grants permissions to Lendry
3. Google/Microsoft returns access token + refresh token
4. Lendry receives tokens in callback
5. Tokens are immediately encrypted with AES-256-GCM
6. Encrypted tokens stored in `users.googleAccessToken`, `googleRefreshToken`, etc.
7. Original plaintext tokens are discarded from memory

**When Tokens Need to be Used:**
1. Encrypted token retrieved from database
2. Decrypted with TOKEN_ENCRYPTION_KEY
3. Decrypted token used in API call to Google/Microsoft
4. Response processed
5. Plaintext token discarded from memory

### 4.2 Token Refresh

**Automatic Refresh:**
- Lendry monitors token expiration in JWT payload
- Before expiry, automatically calls Google/Microsoft refresh endpoint
- Uses refresh token (also encrypted) to obtain new access token
- New tokens encrypted and stored, old tokens discarded
- User unaware of refresh (seamless)

**Manual Refresh:**
- User can explicitly disconnect integration (removes tokens)
- User must re-authenticate to restore integration
- Useful for access revocation and security

### 4.3 Token Scope Management

**Google OAuth Scopes:**
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/calendar.readonly` - Read calendar
- No write access by design (read-only, minimal exposure)

**Microsoft OAuth Scopes:**
- `mail.read` - Read emails
- `calendar.read` - Read calendar
- `offline_access` - Allow refresh token (required for long-lived access)
- No write access by design (read-only, minimal exposure)

---

## 5. Password Security

### 5.1 Password Hashing Process

**Registration (Creating New User):**
1. User submits password (minimum 12 characters, complexity required)
2. Password validated for complexity requirements
3. Bcrypt hashes password with 12 salt rounds (~200ms)
4. Hash stored in `passwordHash` field
5. Original password never stored, never logged

**Login (Verifying Password):**
1. User submits email and password
2. User retrieved from database by email
3. Submitted password hashed with stored salt
4. Computed hash compared with stored hash
5. Match = success, no match = failed attempt

**Password Reset (User-Initiated):**
1. User requests password reset
2. Email sent with temporary reset token (24-hour expiry)
3. User clicks link, enters new password
4. New password hashed with bcrypt
5. Hash stored in `passwordHash`, reset token invalidated

**Force Reset (Admin-Initiated):**
1. Admin initiates password reset for user
2. Temporary password generated
3. Email sent with temporary password + reset link
4. User must change password on next login
5. Audit logged with admin who initiated reset

### 5.2 Password History

**Purpose:** Prevent users from cycling through old passwords
**Implementation:** (Optional - not currently enforced)
**Recommendation:** Implement password history to prevent reuse of last 5 passwords
**Storage:** Store hashes of previous passwords in audit log
**Validation:** Check new password against previous password hashes

---

## 6. Data Classification by Encryption

| Data Type | Classification | Encryption | Protection Mechanism |
|-----------|-----------------|-----------|----------------------|
| Passwords | Level 4 | Bcrypt Hash | One-way hashing (irreversible) |
| OAuth Tokens | Level 4 | AES-256-GCM | Encrypted at rest + in transit |
| API Keys | Level 4 | AES-256-GCM | Encrypted at rest + in transit |
| JWT Tokens | Level 3 | TLS Only | In-transit encryption only |
| User PII (SSN) | Level 4 | AES-256-GCM | Application-level encryption |
| Deal Data | Level 3 | TLS Only | In-transit encryption + access control |
| Documents | Level 3 | TLS Only | In-transit encryption + access control |
| Audit Logs | Level 3 | TLS Only | In-transit + immutability guarantee |
| Configuration | Level 2 | TLS Only | In-transit encryption |

---

## 7. Encryption Compliance

### 7.1 SOC 2 Compliance Mapping

**CC-6.1: Access Control via Encryption**
- OAuth tokens encrypted to protect unauthorized access risk
- Passwords hashed to prevent unauthorized authentication

**CC-6.2: Encryption of Sensitive Data**
- Confidential and Restricted data encrypted in transit (TLS)
- OAuth tokens encrypted at rest (AES-256-GCM)
- Passwords encrypted via bcrypt hashing

**CC-7.2: System Monitoring & Logging**
- Audit logs encrypted in transit
- Application logs sanitized (no passwords, keys, tokens logged)

### 7.2 Algorithm Standards

- **TLS 1.2+:** Meets industry standards (NIST approved)
- **AES-256-GCM:** NIST approved, FIPS 140-2 compatible
- **Bcrypt-12:** Meets or exceeds industry best practices
- **All algorithms:** Supported by Node.js crypto module

### 7.3 Implementation Verification

**Location of Encryption Code:**
- `server/utils/encryption.ts` - encryptOAuthToken(), decryptOAuthToken()
- `server/auth.ts` - Password hashing in register(), login()
- `server/index.ts` - TLS configuration via Express/Node

**Testing:**
- Unit tests for encryption/decryption functions
- Integration tests for OAuth token flow
- Manual verification of TLS configuration with SSL Labs

---

## Appendix: Encryption Libraries & Versions

- **TLS:** Node.js built-in (tls module)
- **AES-256-GCM:** Node.js crypto module (built-in)
- **Bcrypt:** bcryptjs v2.4.3 (installed dependency)
- **JWT:** jsonwebtoken v9.0+ (installed dependency)

**No external crypto libraries:** Reduces attack surface, uses Node.js native implementations (audited, maintained by Node.js core team)

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Approval:** Security Team

# Third-Party Security Policy

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Third-Party Vendor Overview
2. Approved Integrations
3. API Key Management
4. OAuth Token Handling
5. Data Sharing Guidelines
6. Vendor Security Assessment
7. Incident Response for Third-Party Breaches

---

## 1. Third-Party Vendor Overview

### 1.1 Philosophy

Lendry uses selected third-party vendors to enhance functionality while maintaining security:

**Principles:**
- Minimal necessary integration
- Data minimization (share only required data)
- Strong contractual protections
- Regular security assessments
- Incident response planning

### 1.2 Types of Integrations

**Authentication/Identity:**
- Google OAuth 2.0
- Microsoft Azure AD / OAuth 2.0

**Communication:**
- Resend (Email delivery)
- Twilio (SMS delivery)

**Document Management:**
- PandaDoc (E-signature & document generation)

**Artificial Intelligence:**
- OpenAI (GPT API for content generation)

**Geolocation:**
- Geoapify (Address validation, geocoding)

**Data Processing:**
- Apify (Web scraping, data extraction)

---

## 2. Approved Integrations

### 2.1 Google Cloud Services

**Services Used:**
- Google OAuth 2.0 (Gmail authentication)
- Google Drive API (optional document access)
- Google Workspace integration (email forwarding)

**Data Shared:**
- User email address
- OAuth access token (encrypted, stored securely)
- Google ID (unique identifier)

**Data NOT Shared:**
- Password (OAuth token used instead)
- Financial information
- SSN or sensitive PII
- Audit logs
- Internal system data

**Security Measures:**
- OAuth 2.0 token encrypted with AES-256-GCM
- Token refresh handled automatically
- Scopes limited to minimal required (gmail.readonly, calendar.readonly)
- Token revocation available to users
- Periodic access review

**SLA & Compliance:**
- Google offers SOC 2 Type II certification
- SLA: 99.95% uptime
- Data Processing Agreement in place
- GDPR-compliant (Google EU Data Centers)

**Contact:** Google Cloud Security Team

### 2.2 Microsoft Azure / Office 365

**Services Used:**
- Microsoft Azure AD (SSO)
- Microsoft OAuth 2.0 (Outlook authentication)
- Microsoft Graph API (email, calendar access)

**Data Shared:**
- User email address
- OAuth access token (encrypted, stored securely)
- Microsoft ID (unique identifier)
- Optional: Calendar data (if user grants permission)

**Security Measures:**
- OAuth 2.0 token encrypted with AES-256-GCM
- Token refresh handled automatically
- Scopes limited (mail.read, calendar.read)
- Token revocation available to users
- Multi-factor authentication recommended

**SLA & Compliance:**
- Microsoft SOC 2 Type II certified
- SLA: 99.9% uptime guarantee
- Data Processing Agreement in place
- GDPR-compliant, HIPAA-eligible

**Contact:** Microsoft Enterprise Security

### 2.3 Resend Email Service

**Service:** Transactional email delivery
**Email Types:**
- Password reset emails
- Account notifications
- Transaction confirmations
- Support responses

**Data Shared:**
- Recipient email address
- Email content (non-sensitive)
- Email metadata (sender, subject, timestamp)

**Data NOT Shared:**
- Passwords
- API keys
- Customer financial information
- Personal identification numbers

**Security Measures:**
- TLS 1.2+ encryption in transit
- Email logging retained 30 days
- API key stored as environment variable
- Webhook verification (HMAC-SHA256)
- Rate limiting (100 emails/minute per account)

**SLA & Compliance:**
- SOC 2 Type II certified
- SLA: 99.5% uptime
- Data Processing Agreement available
- GDPR-compliant

**Contact:** Resend Support

### 2.4 Twilio SMS Service

**Service:** SMS text message delivery
**SMS Types:**
- 2FA codes (if implemented)
- Account notifications
- Transaction alerts

**Data Shared:**
- Phone number
- SMS content
- Sender ID
- Timestamp

**Security Measures:**
- TLS encryption in transit
- API key stored as environment variable
- SMS logging retained per retention policy
- Number validation before sending
- Opt-out/unsubscribe support

**SLA & Compliance:**
- SOC 2 Type II certified
- SLA: 99.5% uptime
- Carrier partnerships ensure delivery
- SMS content subject to GDPR/CCPA

**Contact:** Twilio Security

### 2.5 PandaDoc E-Signature

**Service:** Digital document signing, document generation
**Use Cases:**
- Loan agreement signature
- Document signing workflow
- Document template management

**Data Shared:**
- Document content (loan agreements, etc.)
- Signer name and email
- Signature and timestamp
- Document metadata

**Data NOT Shared:**
- Password/credentials
- API keys
- Unrelated documents
- Internal communications

**Security Measures:**
- TLS encryption in transit
- AES encryption at rest (PandaDoc)
- Audit trail for signatures (immutable)
- API key stored as environment variable
- Webhook signing (HMAC-SHA256 verification)
- Document retention policies (matches Lendry's)

**SLA & Compliance:**
- SOC 2 Type II certified
- SLA: 99.5% uptime
- eIDAS-compliant (digital signatures legal in EU)
- GDPR Data Processing Agreement

**Contact:** PandaDoc Enterprise Support

### 2.6 OpenAI API

**Service:** Large Language Model (GPT) for content generation
**Use Cases:**
- AI-assisted document drafting
- Content suggestions
- Automated email responses (optional)

**Data Shared:**
- Query text (prompt to AI)
- Generated response only (not stored externally)
- Usage metrics (word count, tokens, cost)

**Data NOT Shared:**
- Customer personal information
- Financial details (unless in prompt intentionally)
- Audit logs
- System internal data

**Security Measures:**
- API key stored as environment variable
- Prompts NOT sent with customer PII
- Responses post-processed (no direct storage)
- User can opt-out of AI features
- GDPR-compliant (OpenAI US-based, BCRs in place)

**SLA & Compliance:**
- SOC 2 Type II certified (OpenAI)
- SLA: Best effort uptime
- Data Processing Agreement available
- Prompts subject to OpenAI privacy policy

**Note:** Users aware that data sent to OpenAI per terms of service

**Contact:** OpenAI Support

### 2.7 Geoapify Geolocation

**Service:** Address validation, geocoding, reverse geocoding
**Use Cases:**
- Address validation (property address in deals)
- Autocomplete (address suggestions)
- Geocoding (lat/long from address)

**Data Shared:**
- Address string
- Geocoding queries
- Usage statistics

**Data NOT Shared:**
- Customer names
- Financial information
- Personal identification

**Security Measures:**
- TLS encryption in transit
- HTTPS only (no plain HTTP)
- API key stored as environment variable
- Rate limiting (100 requests/second)
- Queries logged for debugging

**SLA & Compliance:**
- Good uptime (95%+)
- No formal SLA
- GDPR-compliant (EU data centers available)
- Privacy policy reviewed

**Contact:** Geoapify Support

### 2.8 Apify Web Platform

**Service:** Web scraping, data extraction, automation
**Use Cases:**
- Market data extraction
- Competitor intelligence
- Public data aggregation

**Data Shared:**
- URL to scrape
- Extraction parameters
- Retrieved data (processed)

**Data NOT Shared:**
- Internal customer data
- Confidential information
- Authentication credentials

**Security Measures:**
- HTTPS/TLS encryption
- API key stored as environment variable
- Data retention: Apify holds data for 30 days
- Contractual data minimization clause
- No third-party sharing of data

**SLA & Compliance:**
- SOC 2 Type II certified
- SLA: 99.5% uptime
- GDPR Data Processing Agreement
- Privacy policy reviewed

**Contact:** Apify Support

---

## 3. API Key Management

### 3.1 Key Storage

**Storage Location:** Environment variables (NEVER in code)
**Files:** Stored in `.env` file (excluded from git via `.gitignore`)
**Production:** Environment variables in deployment platform
**Development:** `.env` file locally (must not be committed)

**Environment Variables:**
```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx
RESEND_API_KEY=xxx
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
PANDADOC_API_KEY=xxx
OPENAI_API_KEY=xxx
GEOAPIFY_API_KEY=xxx
APIFY_API_KEY=xxx
```

### 3.2 Key Generation & Access

**Who Can Access Keys:**
- Application (via environment variables)
- Super-admin (in case of emergency)
- DevOps team (for deployment)

**Who CANNOT Access Keys:**
- Regular engineers (should not have dev keys)
- External contractors
- Support staff
- Customers

**Access Control:**
- Development keys: Limited permissions
- Staging keys: Separate from production
- Production keys: Restricted access via IAM
- Key rotation: Every 90 days or on change

### 3.3 Key Rotation

**Schedule:** Every 90 days (proactive)
**Trigger:** On employee departure, key compromise, periodic rotation

**Rotation Process:**
1. Generate new API key from vendor
2. Update environment variable with new key
3. Test new key to ensure working
4. Deploy to staging environment
5. Test integration in staging
6. Deploy to production
7. Verify services still working
8. Monitor for errors
9. After 7 days, deactivate old key
10. Document rotation in security log

### 3.4 Key Revocation & Compromise

**Compromised Key Response:**
- Immediate revocation (do not wait for rotation)
- Generate new key immediately
- Update environment variables
- Deploy emergency fix
- Audit logs to determine access
- Notify vendor of compromise
- Incident investigation

**Revocation Methods:**
- From vendor's dashboard (deactivate key)
- Request vendor revocation
- Confirm old key no longer functional
- Verify new key working

---

## 4. OAuth Token Handling

### 4.1 Google & Microsoft OAuth Tokens

**Token Types:**
- `accessToken` - Short-lived (1 hour), used for API calls
- `refreshToken` - Long-lived (months/years), used to get new access token

**Storage:** Both tokens encrypted with AES-256-GCM

**Database Fields:**
```sql
users.googleAccessToken (encrypted)
users.googleRefreshToken (encrypted)
users.googleTokenExpiresAt (timestamp)
users.microsoftAccessToken (encrypted)
users.microsoftRefreshToken (encrypted)
users.microsoftTokenExpiresAt (timestamp)
```

### 4.2 Token Encryption Process

**When Token Received (from OAuth callback):**
1. Token received from Google/Microsoft
2. Token encrypted with AES-256-GCM
3. Encrypted token stored in database
4. Original token discarded from memory

**When Token Used (for API calls):**
1. Retrieve encrypted token from database
2. Decrypt with encryption key
3. Use decrypted token in API call
4. Discard plaintext token from memory
5. Store response

### 4.3 Token Refresh

**Automatic Refresh:**
- Before access token expires
- Use refresh token to request new access token
- New access token encrypted and stored
- Old access token deleted

**Manual Refresh (User-Initiated):**
- User clicks "Reconnect Google/Microsoft"
- System initiates fresh OAuth flow
- New tokens encrypted and stored
- Audit logged: User reconnected integration

**Token Expiration:**
- Access token: 1 hour (refreshed automatically)
- Refresh token: 6 months+ (re-authentication if expired)

### 4.4 Token Scope Management

**Google OAuth Scopes Requested:**
- `https://www.googleapis.com/auth/gmail.readonly` - Read emails
- `https://www.googleapis.com/auth/calendar.readonly` - Read calendar
- NO write access (read-only, minimal exposure)

**Microsoft OAuth Scopes:**
- `mail.read` - Read emails
- `calendar.read` - Read calendar
- `offline_access` - Long-lived refresh token
- NO write access (read-only, minimal exposure)

**Principle:** Request ONLY necessary scopes

### 4.5 Token Disconnection

**User Disconnect Process:**
1. User clicks "Disconnect Google" in settings
2. OAuth tokens removed from database
3. User session remains active (but Gmail/Calendar unavailable)
4. Audit logged: User disconnected integration
5. Confirmation sent to user

**Vendor Side:**
- Lendry does not explicitly revoke at vendor
- Token expires naturally (refresh token expires eventually)
- Vendor shows no further access if refresh fails

---

## 5. Data Sharing Guidelines

### 5.1 Data Minimization Principle

**Rule:** Share ONLY data necessary for vendor to provide service

**Examples:**

**What's SHARED:**
- User email (necessary for authentication)
- Deal amount (necessary for document generation in PandaDoc)
- Property address (necessary for geocoding)

**What's NOT SHARED:**
- Customer SSN (unless absolutely required)
- Customer bank account information
- Internal audit logs
- Other customers' data
- Unrelated personal information

### 5.2 Data Classification & Sharing

| Data Type | Classification | Google | Microsoft | Resend | PandaDoc | OpenAI | Geoapify | Apify |
|-----------|-----------------|--------|-----------|--------|----------|--------|----------|-------|
| Email | L2 | ✓ | ✓ | ✓ | - | - | - | - |
| Name | L2 | - | - | ✓ | ✓ | - | - | - |
| Deal Amount | L3 | - | - | - | ✓ | - | - | - |
| Property Address | L3 | - | - | - | ✓ | - | ✓ | - |
| SSN/ID Number | L4 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Password | L4 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

✓ = shared, ✗ = never shared, - = not relevant

### 5.3 Data Processing Agreements

**Vendors with DPA (Data Processing Agreement) in place:**
- Google (Standard contract)
- Microsoft (Standard contract)
- Resend (Available upon request)
- PandaDoc (Available upon request)
- OpenAI (Privacy policy reviewed)
- Geoapify (Privacy policy reviewed)
- Apify (Available upon request)

**DPA Verification Process:**
1. Request DPA from vendor
2. Legal team reviews
3. Execute DPA if compliant
4. Store copy in legal records
5. Document vendor compliance status

---

## 6. Vendor Security Assessment

### 6.1 Pre-Integration Assessment

**Checklist Before Adding New Vendor:**

- [ ] Vendor has SOC 2 Type II or equivalent certification (preferred)
- [ ] Vendor offers Data Processing Agreement
- [ ] Vendor has privacy policy (GDPR-compliant)
- [ ] Vendor allows encryption of data at rest
- [ ] Vendor allows TLS for data in transit
- [ ] Vendor supports API key rotation
- [ ] Vendor has incident response procedures
- [ ] Vendor has acceptable uptime SLA
- [ ] Vendor allows audit/compliance reviews
- [ ] Contract includes data deletion on request
- [ ] Legal team has reviewed terms

### 6.2 Ongoing Assessment

**Quarterly Review:**
- Check vendor's security status page
- Verify no published breaches
- Review any security updates/patches
- Confirm SLA compliance
- Assess usage and integration health

**Annual Assessment:**
- Request latest SOC 2 report
- Review any incidents (vendor-side)
- Assess if integration still necessary
- Consider alternative vendors
- Update DPA if terms changed

### 6.3 Vendor Incident Notification

**Process When Vendor Reports Breach:**
1. Vendor notifies us of breach affecting our data
2. Security team contacts incident commander
3. Assess impact: What data was affected?
4. Assess timeline: How long were we affected?
5. Assess exposure: Could our customer data be exposed?
6. Incident response plan triggered (see INCIDENT-RESPONSE-PLAN.md)
7. Customer notification if applicable

---

## 7. Incident Response for Third-Party Breaches

### 7.1 Notification Process

**When We're Notified of Third-Party Breach:**

1. **Assess Immediately (within 1 hour):**
   - What vendor was affected?
   - What systems do we have integrated?
   - Could our data be affected?
   - Is customer data at risk?

2. **Escalate (P1 incident):**
   - Notify Incident Commander
   - Assemble incident response team
   - Notify executive team

3. **Investigate (first 24 hours):**
   - Request details from vendor
   - Request compromise timeline
   - Determine if our data was accessed
   - Determine if customer data exposed
   - Review audit logs for vendor API activity

4. **Respond:**
   - If our data compromised: Revoke API keys immediately
   - If customer data exposed: Initiate customer notification
   - Review our systems for unauthorized access
   - Update security controls
   - Consider switching vendors

### 7.2 Vendor Investigation Support

**Information Requested from Vendor:**
- Timeline of breach (first access to discovery)
- What data was accessed
- Who had access
- How they gained access
- Was our account specifically targeted?
- What remediation steps taken
- Will it happen again (root cause fix)?
- Recommended customer actions

### 7.3 Customer Communication

**If Customer Data at Risk:**
- Notify customers within 72 hours (or per contract)
- Explain what data was at risk
- What steps we're taking
- What they should do
- Provide support contact
- One-way encryption if sensitive data

**If Only Our Data at Risk:**
- No customer notification necessary
- Audit log entry for transparency
- Update risk assessment
- Review vendor relationship

---

## Appendix: Vendor Contacts

| Vendor | Contact | Emergency |
|--------|---------|-----------|
| Google | support@google.com | +1-650-253-0000 |
| Microsoft | support.microsoft.com | +1-800-936-5800 |
| Resend | support@resend.com | Critical: escalation available |
| Twilio | support@twilio.com | +1-844-839-5456 |
| PandaDoc | support@pandadoc.com | Emergency: in-app support |
| OpenAI | support.openai.com | support@openai.com |
| Geoapify | support@geoapify.com | GitHub issues |
| Apify | support@apify.com | Status page |

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Approval:** Security Team & Legal Team

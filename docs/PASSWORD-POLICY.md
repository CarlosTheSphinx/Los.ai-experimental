# Password Policy

**Version:** 1.0
**Effective Date:** March 3, 2026
**Last Updated:** March 3, 2026

---

## Table of Contents

1. Password Requirements
2. Password Hashing & Storage
3. Password Expiration
4. Account Lockout Policy
5. Password Reset Procedures
6. Multi-Factor Authentication
7. Password Best Practices for Users

---

## 1. Password Requirements

### 1.1 Minimum Complexity Standards

All user passwords must meet the following requirements:

**Minimum Length:**
- Minimum: 12 characters
- Recommended: 16+ characters
- No maximum limit

**Complexity Requirements:**
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (!@#$%^&*?~)

**Character Sets Accepted:**
- All printable ASCII characters (32-126)
- Special characters: ! @ # $ % ^ & * ? ~ - = + _ [ ] { } | ; : ' " , . < > /
- Unicode characters (if supported by system)

### 1.2 Requirements NOT Enforced

To balance security with usability, the following are NOT required:

**Dictionary Word Checking:**
- System does NOT check against common passwords list
- Users are educated to avoid common passwords but not blocked
- Recommendation: Use NIST's common passwords list for future enhancement

**Pattern Restrictions:**
- Sequential characters (abc, 123) are allowed
- Repeated characters (aaa) are allowed
- Keyboard patterns (qwerty) are not actively blocked

**Complexity Exceptions:**
- No exemptions for complexity requirements
- All users must meet same standards
- Super-admin accounts require same complexity

### 1.3 Password Validation Timing

**On Registration:**
- New password checked before account creation
- User receives error if requirements not met
- User must revise and resubmit

**On Password Change:**
- Old password must be provided
- New password must meet requirements
- New password cannot match old password

**On Password Reset:**
- Temporary password auto-generated (meets requirements)
- User must set permanent password on first login
- Permanent password must meet requirements

---

## 2. Password Hashing & Storage

### 2.1 Hashing Algorithm

**Algorithm:** Bcrypt
**Salt Rounds:** 12
**Key Stretching:** 2^12 = 4,096 iterations minimum
**Output Format:** 60-character bcrypt hash string
**Computation Time:** Approximately 200-250 milliseconds per hash

### 2.2 Hash Storage

**Database Field:** `users.passwordHash`
**Format:** 60-character bcrypt string (includes salt + hash)
**Example:** `$2b$12$R9h7cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ee.L8K7W2gXJBdYy`

**Components of Hash:**
- `$2b$` - Bcrypt algorithm identifier
- `$12$` - Cost factor (salt rounds)
- `R9h7cIPz0gi.URNNX3kh2O` - Salt (22 characters)
- `PST9/PgBkqquzi.Ee.L8K7W2gXJBdYy` - Hash (31 characters)

### 2.3 Password Verification Process

**At Login:**
```
1. User submits password
2. Retrieve stored passwordHash from database
3. Run bcrypt.compare(submittedPassword, storedHash)
4. Bcrypt compares the submitted password against the stored hash
5. Result: true = correct password, false = incorrect password
```

**Code Location:** `server/auth.ts` - AuthController.login()

**Security Properties:**
- Passwords never compared directly (plaintext never stored)
- Hash uses stored salt, same salt used for comparison
- Intentionally slow (200ms) prevents brute force attacks
- GPU-resistant due to memory-intensive algorithm

### 2.4 Storage Security

**Never:**
- Store passwords in plaintext
- Log passwords (even in error messages)
- Email passwords to users
- Display passwords in UI

**Always:**
- Hash passwords immediately on receipt
- Discard plaintext password from memory
- Use stored hash for all comparisons
- Include password hashes in encrypted backups

---

## 3. Password Expiration

### 3.1 Expiration Policy

**Standard Expiration:** 90 days
**Rationale:** Balances security against compromise with usability

**Expiration Trigger:**
- Calculated from `passwordChangedAt` timestamp in users table
- Checked at every login
- Warning shown 14 days before expiration

**Grace Period:** None - users cannot login with expired password
- Alternative: Change password on login
- Alternative: Admin reset for locked users

### 3.2 Password Expiration Enforcement

**At Login:**
```
1. User submits credentials
2. Credentials verified
3. Check: Is passwordChangedAt > 90 days ago?
4. If yes: Deny login, redirect to password reset
5. If no: Allow login, set session
```

**Code Location:** `server/auth.ts` - isPasswordExpired() function

**User Experience:**
- "Your password has expired. Please reset it."
- User sent to password reset page
- User must change password before accessing system

### 3.3 Expiration Exceptions

**Admin-Initiated Reset:**
- Super-admin can force password reset
- User is logged out of all sessions
- User must change password on next login
- Original expiration timer resets after change

**First-Time Users:**
- Temporary password provided
- User must change on first login
- Expiration timer starts after first change

**System Emergencies:**
- Super-admin can temporarily disable expiration (not recommended)
- Must document reason and duration
- Must re-enable after emergency resolves

---

## 4. Account Lockout Policy

### 4.1 Lockout Trigger

**Trigger Event:** 5 failed login attempts
**Time Window:** 15 minutes
**Lockout Duration:** 30 minutes (automatic unlock)

**Failed Attempt Tracking:**
- Field: `users.failedLoginAttempts` (count)
- Field: `users.accountLockedUntil` (timestamp)
- Reset on successful login

### 4.2 Lockout Mechanics

**Attempt 1-4:**
- Incorrect password message: "Invalid email or password"
- Count incremented
- No account action

**Attempt 5:**
- Account locked immediately
- User cannot login
- `accountLockedUntil` set to current time + 30 minutes
- Email sent: "Your account has been locked due to too many failed login attempts"

**During Lockout:**
- User cannot login even with correct password
- User receives: "Your account is locked. Try again in X minutes."
- Countdown to unlock shown

**After 30 Minutes:**
- Account automatically unlocked
- `failedLoginAttempts` reset to 0
- User can login again

### 4.3 Unlock Methods

**Automatic Unlock:**
- After 30 minutes, account automatically unlocked
- User can attempt login again
- No admin intervention required

**Manual Unlock (Super-Admin):**
- Super-admin can manually unlock account
- Accessed via admin panel: Users → [User] → Unlock Account
- Immediate unlock (does not wait 30 minutes)
- Audit logged: User unlock by admin, reason

**Password Reset Unlock:**
- User can reset password via email link
- Password reset automatically unlocks account
- User can login immediately after reset

### 4.4 Audit Logging

**Events Logged:**
- Each failed login attempt (IP address, timestamp)
- Account lockout event (when triggered)
- Account unlock event (automatic or manual)
- Password reset during lockout

**Example Audit Log Entry:**
```json
{
  "timestamp": "2026-03-03T14:30:00Z",
  "action": "auth.login_failed",
  "userEmail": "user@example.com",
  "ipAddress": "192.168.1.100",
  "attemptNumber": 5,
  "result": "Account locked - too many failed attempts"
}
```

---

## 5. Password Reset Procedures

### 5.1 User-Initiated Password Reset

**Flow:**
1. User clicks "Forgot Password" on login page
2. User enters email address
3. Email sent with reset link (24-hour validity)
4. User clicks link in email
5. User enters new password (must meet complexity requirements)
6. Password reset, user redirected to login
7. User logs in with new password

**Security Measures:**
- Reset token is cryptographically random
- Token stored as hash (not plaintext) in `passwordResetToken` field
- Token valid for 24 hours only
- Token is single-use (invalidated after use)
- Audit logged with user email and IP address

**Code Location:** `server/routes.ts` - POST /api/auth/forgot-password, POST /api/auth/reset-password

### 5.2 Admin-Initiated Password Reset

**Flow:**
1. Super-admin goes to Users admin panel
2. Clicks "Reset Password" on user
3. Super-admin enters reason for reset
4. System generates temporary password
5. Email sent to user with temporary password
6. User must change password on next login
7. Audit logged with admin name and reason

**Temporary Password:**
- Auto-generated by system
- Complex and random (15+ characters)
- Meets complexity requirements
- Expires after 24 hours if not used
- User cannot use old password after reset

**Code Location:** `server/routes.ts` - POST /api/admin/users/:id/reset-password

### 5.3 First-Time Password Setup

**New Users:**
- User invited via email with temporary setup link
- Link leads to account setup page
- User sets email (if not pre-populated)
- User creates password (must meet complexity requirements)
- User confirms password creation
- User sent to login page

**Temporary Password from Admin:**
- If admin creates user, temporary password generated
- User receives email with temporary password
- User logs in with temporary password
- System requires immediate password change
- User sets permanent password

---

## 6. Multi-Factor Authentication

### 6.1 Current Status

**Authentication Methods Supported:**
- Username + Password (primary)
- OAuth 2.0 (Google, Microsoft) - includes MFA if enabled on third-party account
- Magic Links (email-based) - one-time use

**MFA Status:**
- Application-level MFA: Not currently implemented
- Third-party MFA: Available via Google/Microsoft OAuth (recommended for sensitive accounts)

### 6.2 OAuth Multi-Factor Authentication

**Why This Works:**
- When user selects "Sign in with Google" or "Sign in with Microsoft"
- Google/Microsoft handle authentication and MFA
- If MFA enabled on Google/Microsoft account, user prompted
- Once approved, user redirected back with verified session
- Lendry receives authenticated user without seeing MFA prompt

**Benefits:**
- No additional credential management for users
- Leverages established MFA infrastructure
- Cannot be disabled by Lendry (user controls)
- Recommended for super-admin and admin accounts

**Recommendation:**
- Super-admin users MUST use OAuth (forces corporate SSO/MFA)
- Admin users strongly encouraged to use OAuth
- Processor/staff users encouraged to use OAuth

### 6.3 Future MFA Enhancement

**TOTP (Time-based One-Time Password):**
- Implement optional TOTP for password-based accounts
- Uses apps like Google Authenticator, Authy
- 6-digit code changes every 30 seconds
- Recommended: Make TOTP mandatory for super-admin

**SMS-based MFA:**
- Send one-time code via SMS
- Not recommended (SMS interception possible)
- Consider only as backup method

**Hardware Security Keys:**
- Support for FIDO2 hardware keys
- Most secure but highest friction
- Recommended for executive team

---

## 7. Password Best Practices for Users

### 7.1 Creating Strong Passwords

**Do:**
- Use 16+ characters if possible (more than minimum 12)
- Mix uppercase, lowercase, numbers, special characters
- Use passphrases (e.g., "BlueSky@2026!Lending")
- Make passwords unique (don't reuse across systems)
- Use password manager to store securely

**Don't:**
- Use birthdate, name, or other personal information
- Use common words or keyboard patterns
- Share password with anyone
- Write password on sticky notes
- Use same password on multiple sites
- Use simple patterns (abc123, password, etc.)

### 7.2 Protecting Your Password

**At Lendry:**
- Never share password with support staff
- Log out on shared computers
- Use browser password manager (encrypted locally)
- Clear browser cache periodically

**Elsewhere:**
- Use unique password for Lendry (don't reuse)
- Never enter Lendry password on suspicious sites
- Watch for phishing emails
- Verify URLs are correct (lendry.com not lendry.co)

### 7.3 What to Do If Compromised

**Suspected Breach:**
1. Change password immediately
2. Contact support@lendry.com
3. Review recent activity in audit logs
4. Change password on other sites if reused
5. Monitor account for unauthorized activity

**Confirmed Breach (by Lendry):**
- Lendry will notify you via email
- Check your inbox (not spam folder)
- Follow instructions in notification
- Reset password immediately
- Monitor your account and credit

---

## Appendix: Password Policy Verification

**User Password Requirements:**
- [ ] Minimum 12 characters
- [ ] At least 1 uppercase letter
- [ ] At least 1 lowercase letter
- [ ] At least 1 number
- [ ] At least 1 special character

**Password Storage:**
- [ ] Passwords hashed with Bcrypt-12
- [ ] Hash stored in database (never plaintext)
- [ ] Hash properly salted and verified

**Expiration Enforcement:**
- [ ] 90-day expiration enforced
- [ ] isPasswordExpired() checked at login
- [ ] Expiration warning at 14 days

**Account Lockout:**
- [ ] 5 failed attempts triggers lockout
- [ ] 30-minute lockout duration
- [ ] accountLockedUntil timestamp checked
- [ ] Automatic unlock after timeout
- [ ] Admin unlock available

**Reset Procedures:**
- [ ] User-initiated reset via email
- [ ] Admin-initiated reset available
- [ ] Reset tokens 24-hour expiry
- [ ] Reset tokens single-use
- [ ] All resets audit logged

---

**Document Version:** 1.0
**Next Review Date:** March 3, 2027
**Approval:** Security Team

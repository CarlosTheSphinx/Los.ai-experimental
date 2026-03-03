# API Keys & Scope Management Guide

## Overview

The Lendry API supports API key authentication for third-party integrations, webhooks, and programmatic access. API keys provide a secure, granular alternative to user credentials for accessing the API.

**Key Features:**
- Secure key generation with bcrypt hashing
- Scope-based access control (granular permissions per key)
- Rate limiting per key
- Key rotation and revocation
- Comprehensive audit logging
- Expiration dates and lifecycle management

---

## Getting Started

### 1. Generate Your First API Key

**Via Dashboard:**
1. Go to Settings → API Keys
2. Click "Create New Key"
3. Enter a name (e.g., "Production Webhook")
4. Select required scopes
5. (Optional) Set expiration date
6. Click "Create"

**Note:** The key plaintext is shown **only once**. Save it immediately to a secure location.

**Via API (Self-Service):**

```bash
curl -X POST https://api.lendry.io/api/user/api-keys \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Webhook",
    "scopes": ["deals:read", "webhooks:write"],
    "rateLimitPerMinute": 100
  }'
```

**Response:**
```json
{
  "id": "key_abc123...",
  "name": "Production Webhook",
  "keyPlaintext": "sk_prod_4fd3bca2e7c91f2a8d4...",
  "keyPreview": "...c91f2a",
  "scopes": ["deals:read", "webhooks:write"],
  "rateLimitPerMinute": 100,
  "expiresAt": null,
  "message": "Save the key plaintext now. You will not see it again."
}
```

### 2. Add to Your Application

**Authorization Header Format:**

```bash
Authorization: Bearer sk_prod_4fd3bca2e7c91f2a8d4...
```

**Example Request:**

```bash
curl -X GET https://api.lendry.io/api/deals \
  -H "Authorization: Bearer sk_prod_4fd3bca2e7c91f2a8d4..." \
  -H "Content-Type: application/json"
```

**Python:**

```python
import requests

API_KEY = "sk_prod_4fd3bca2e7c91f2a8d4..."
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

response = requests.get(
    "https://api.lendry.io/api/deals",
    headers=headers
)

print(response.json())
```

**Node.js:**

```javascript
const axios = require('axios');

const API_KEY = 'sk_prod_4fd3bca2e7c91f2a8d4...';

const client = axios.create({
  baseURL: 'https://api.lendry.io/api',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

client.get('/deals')
  .then(res => console.log(res.data))
  .catch(err => console.error(err.response.data));
```

---

## Scope Reference

Scopes control what an API key can access. Use the minimum scopes needed for your integration.

### Scope Hierarchy

Scopes follow the format: `resource:action`

**Examples:**
- `deals:read` - Read deal information
- `deals:write` - Create and modify deals
- `deals:delete` - Delete deals
- `deals:*` - All deal operations
- `*` - Full access (admin only)

### All Available Scopes

| Scope | Description | Critical | Admin Only |
|-------|-------------|----------|-----------|
| `deals:read` | Read deal information and lists | No | No |
| `deals:write` | Create and modify deals | No | No |
| `deals:delete` | Delete deals | **Yes** | No |
| `documents:read` | Download and view documents | No | No |
| `documents:write` | Upload and manage documents | No | No |
| `documents:sign` | Execute e-signatures | **Yes** | No |
| `borrowers:read` | Access borrower profile information | No | No |
| `borrowers:write` | Create and modify borrower profiles | No | No |
| `borrowers:pii` | Access sensitive PII (SSN, ID numbers, DOB) | **Yes** | No |
| `financials:read` | View financial statements | No | No |
| `financials:write` | Upload and modify financial data | No | No |
| `reports:read` | Generate and view reports | No | No |
| `reports:export` | Export data to CSV/Excel/PDF | No | No |
| `reports:data_dump` | Full data export for analytics | **Yes** | **Yes** |
| `webhooks:read` | View webhook configuration | No | No |
| `webhooks:write` | Create and modify webhooks | No | No |
| `webhooks:manage` | Full webhook management | No | No |
| `admin:users` | Manage user accounts | **Yes** | **Yes** |
| `admin:roles` | Manage roles and permissions | **Yes** | **Yes** |
| `admin:audit` | Access audit logs | **Yes** | **Yes** |
| `admin:keys` | Manage API keys for other users | **Yes** | **Yes** |
| `admin:system` | System-level operations | **Yes** | **Yes** |
| `*` | Full access (all scopes) | **Yes** | **Yes** |

### Scope Dependencies

Some scopes imply others:
- `deals:write` implies `deals:read`
- `deals:delete` implies `deals:read`
- `documents:sign` implies `documents:read`
- `borrowers:write` implies `borrowers:read`
- `borrowers:pii` implies `borrowers:read`

When you request a scope, you automatically get all implied scopes.

### Best Practices

1. **Use Minimal Scopes**
   ```javascript
   // Good: Only what's needed
   scopes: ["deals:read"]

   // Bad: Unnecessary permissions
   scopes: ["*"]
   ```

2. **Separate Keys by Purpose**
   ```javascript
   // Webhook integration key
   {
     "name": "Webhook Receiver",
     "scopes": ["deals:read", "webhooks:read"]
   }

   // Reporting automation key
   {
     "name": "Daily Report Generator",
     "scopes": ["reports:read", "reports:export"]
   }
   ```

3. **Never Grant Critical Scopes**
   Critical scopes like `borrowers:pii` and `deals:delete` require extra audit logging. Use sparingly.

---

## API Key Management

### List Your Keys

```bash
curl -X GET https://api.lendry.io/api/user/api-keys \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

**Response:**
```json
{
  "keys": [
    {
      "id": "key_abc123...",
      "name": "Production Webhook",
      "keyPreview": "...c91f2a",
      "scopes": ["deals:read", "webhooks:write"],
      "rateLimitPerMinute": 100,
      "expiresAt": null,
      "lastUsedAt": "2026-03-03T14:22:00Z",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### Update a Key

```bash
curl -X PATCH https://api.lendry.io/api/user/api-keys/key_abc123... \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Webhook (Updated)",
    "rateLimitPerMinute": 50
  }'
```

### Rotate a Key

Rotate your key to generate a new one and revoke the old one:

```bash
curl -X POST https://api.lendry.io/api/user/api-keys/key_abc123.../rotate \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

**Response:**
```json
{
  "newKeyPlaintext": "sk_prod_5fe4cdb3f8d92g3b9e5...",
  "keyPreview": "...92g3b",
  "message": "API key rotated. Save the new key plaintext now."
}
```

**⚠️ Important:** After rotation, update all services using the old key to use the new one.

### Revoke a Key

Immediately revoke a key if compromised:

```bash
curl -X DELETE https://api.lendry.io/api/user/api-keys/key_abc123... \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

---

## Rate Limiting

Each API key has a rate limit controlling requests per minute. Default is 100 requests/minute, but varies by scope:

| Scope Category | Rate Limit |
|---|---|
| Standard (read/write) | 100 requests/min |
| Expensive (export, reports) | 10 requests/min |
| Critical (admin, delete) | 30 requests/min |
| Sensitive (PII access) | 30 requests/min |

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1646332920
Retry-After: 45
```

### Handling Rate Limits

When you hit the rate limit, you get a 429 response:

```json
{
  "error": "rate_limit_exceeded",
  "message": "API rate limit exceeded. Limit: 100 requests/minute.",
  "limit": 100,
  "remaining": 0,
  "resetAt": "2026-03-03T14:23:00Z",
  "retryAfter": 45
}
```

**Best Practices:**
1. Check `X-RateLimit-Remaining` header before critical operations
2. Implement exponential backoff for retries
3. Use `Retry-After` header for timing
4. Batch operations when possible

**Exponential Backoff Example (Python):**

```python
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def requests_retry_session(
    retries=3,
    backoff_factor=0.3,
    status_forcelist=(429, 500, 502, 504),
):
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

# Use it
response = requests_retry_session().get('https://api.lendry.io/api/deals')
```

---

## Security Best Practices

### 1. Never Commit Keys

Never store API keys in version control:

```bash
# ❌ Bad: Committed key
echo "sk_prod_4fd3bca2e7c91f2a8d4..." > config.js

# ✅ Good: Use environment variables
export API_KEY="sk_prod_4fd3bca2e7c91f2a8d4..."
# Or in .env (add .env to .gitignore)
API_KEY=sk_prod_4fd3bca2e7c91f2a8d4...
```

### 2. Use Environment Variables

```python
import os
API_KEY = os.environ.get('LENDRY_API_KEY')
```

```javascript
const API_KEY = process.env.LENDRY_API_KEY;
```

### 3. Rotate Keys Regularly

Rotate keys quarterly or when team members leave:

```bash
# Generate new key
NEW_KEY=$(curl -s -X POST ... | jq -r '.keyPlaintext')

# Update application
export LENDRY_API_KEY=$NEW_KEY

# Revoke old key after confirming new one works
curl -X DELETE https://api.lendry.io/api/user/api-keys/old_key_id...
```

### 4. Use Separate Keys for Different Environments

```bash
# Development
export LENDRY_API_KEY=sk_prod_dev_...

# Staging
export LENDRY_API_KEY=sk_prod_staging_...

# Production
export LENDRY_API_KEY=sk_prod_prod_...
```

### 5. Monitor Key Usage

Regularly check your key usage and revoke old/unused keys:

```bash
# List keys with last used time
curl -X GET https://api.lendry.io/api/user/api-keys \
  -H "Authorization: Bearer YOUR_USER_TOKEN" | jq '.keys[] | {name, lastUsedAt}'

# Get detailed usage stats for a key
curl -X GET https://api.lendry.io/api/user/api-keys/key_abc123.../usage?timeframe=2880 \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

### 6. Set Expiration Dates

Optionally set expiration dates for short-lived integrations:

```bash
curl -X POST https://api.lendry.io/api/user/api-keys \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Temporary Integration",
    "scopes": ["deals:read"],
    "expiresAt": "2026-06-01T00:00:00Z"
  }'
```

### 7. Revoke Compromised Keys Immediately

If you suspect a key has been compromised:

```bash
curl -X DELETE https://api.lendry.io/api/user/api-keys/compromised_key_id \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

Then generate a new key and update all services.

---

## Error Handling

### Invalid API Key

```json
{
  "error": "invalid_api_key",
  "message": "The provided API key is invalid or does not exist.",
  "status": 401
}
```

**Causes:** Wrong key, typo, key doesn't exist

### Insufficient Scopes

```json
{
  "error": "insufficient_scope",
  "message": "This operation requires the following scopes: deals:write",
  "missing_scopes": ["deals:write"],
  "granted_scopes": ["deals:read"],
  "status": 403
}
```

**Fix:** Use API key with required scopes or create new key

### Key Revoked or Expired

```json
{
  "error": "api_key_invalid",
  "message": "The API key has been revoked.",
  "status": 401
}
```

**Fix:** Generate new key or rotate existing one

### Rate Limit Exceeded

```json
{
  "error": "rate_limit_exceeded",
  "message": "API rate limit exceeded. Limit: 100 requests/minute.",
  "retryAfter": 45,
  "status": 429
}
```

**Fix:** Wait before retrying, use exponential backoff

---

## Troubleshooting

### "401: Invalid API Key"

- ✓ Verify key is correct (no typos, no extra spaces)
- ✓ Check key hasn't been revoked
- ✓ Check key hasn't expired
- ✓ Verify header format: `Authorization: Bearer sk_prod_...`

### "403: Insufficient Scope"

- ✓ Check required scopes for endpoint
- ✓ Verify API key has needed scopes
- ✓ Rotate key to add new scopes, then revoke old one

### "429: Rate Limit Exceeded"

- ✓ Wait for reset time (see `X-RateLimit-Reset` header)
- ✓ Implement retry logic with exponential backoff
- ✓ Consider batching requests if possible
- ✓ Contact support if limit is too restrictive

### Key Not Showing in List

- ✓ Verify you're logged in as the correct user
- ✓ Check if key was revoked
- ✓ Use admin endpoints to see all keys (super_admin only)

### Performance Issues

- ✓ Check rate limit remaining with `X-RateLimit-Remaining` header
- ✓ Batch operations when possible
- ✓ Consider pagination for large datasets
- ✓ Add caching on your end

---

## Admin Operations (Super Admin Only)

### Create API Key for Another User

```bash
curl -X POST https://api.lendry.io/api/admin/api-keys \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_xyz789...",
    "name": "Integration Key",
    "scopes": ["deals:read", "documents:read"],
    "rateLimitPerMinute": 100
  }'
```

### View All API Keys

```bash
curl -X GET "https://api.lendry.io/api/admin/api-keys?page=1&limit=20" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Get Usage Statistics

```bash
curl -X GET "https://api.lendry.io/api/admin/api-keys/key_abc123.../usage?timeframe=1440" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## Examples

### Example 1: Fetch Deal List

```python
import os
import requests

API_KEY = os.environ.get('LENDRY_API_KEY')

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

response = requests.get(
    'https://api.lendry.io/api/deals',
    headers=headers,
    params={'page': 1, 'limit': 20}
)

if response.status_code == 200:
    deals = response.json()['deals']
    print(f"Found {len(deals)} deals")
elif response.status_code == 429:
    print(f"Rate limited. Retry after {response.headers['Retry-After']} seconds")
else:
    print(f"Error: {response.json()}")
```

### Example 2: Create a Deal

```javascript
const API_KEY = process.env.LENDRY_API_KEY;

async function createDeal(dealData) {
  const response = await fetch('https://api.lendry.io/api/deals', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dealData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`${error.error}: ${error.message}`);
  }

  return response.json();
}

// Usage
try {
  const deal = await createDeal({
    name: 'Commercial Property',
    loanAmount: 500000,
    borrower: 'ABC Corp'
  });
  console.log('Deal created:', deal.id);
} catch (error) {
  console.error(error.message);
}
```

### Example 3: Webhook Receiver

```python
from flask import Flask, request, jsonify
import hmac
import hashlib
import os

app = Flask(__name__)
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET')

@app.route('/webhook', methods=['POST'])
def receive_webhook():
    # Verify signature (optional but recommended)
    signature = request.headers.get('X-Webhook-Signature')
    body = request.get_data()

    expected_sig = hmac.new(
        WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    if signature != expected_sig:
        return {'error': 'Invalid signature'}, 401

    # Process webhook
    data = request.json
    print(f"Received webhook: {data['event']} for {data['resource']}")

    # Your business logic here
    process_deal_update(data)

    return {'success': True}, 200

def process_deal_update(data):
    # Update your system with deal information
    pass

if __name__ == '__main__':
    app.run(port=5000)
```

---

## Support

For issues or questions:
- **Documentation:** https://docs.lendry.io
- **Email:** support@lendry.io
- **Status Page:** https://status.lendry.io
- **Slack:** [Join our community](https://slack.lendry.io)

---

## Changelog

### v1.0.0 (March 2026)
- Initial API key management release
- Scope-based access control
- Rate limiting per key
- Audit logging
- Key rotation and expiration

---

*Last Updated: March 2026*
*API Version: v1*

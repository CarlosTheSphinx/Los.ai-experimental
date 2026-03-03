import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { apiKeys, apiKeyUsage } from '../db/schema';
import { eq, and, isNull, or, lt, inArray } from 'drizzle-orm';

/**
 * API Key Management Utilities
 *
 * Handles:
 * - API key generation and validation
 * - Scope matching and validation
 * - Key lifecycle management (creation, rotation, revocation)
 * - Rate limiting enforcement
 * - Usage tracking and audit logging
 */

export interface APIKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPreview: string;
  scopes: string[];
  rateLimitPerMinute: number;
  expiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface APIKeyUsageRecord {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ipAddress?: string;
  userAgent?: string;
  scopeRequired: string[];
  scopeGranted: string[];
  authorized: boolean;
  errorMessage?: string;
  requestId?: string;
  timestamp: Date;
  responseTimeMs?: number;
}

/**
 * Generate a new API key
 *
 * Returns both the plaintext (to show user once) and hash (for storage)
 * Format: sk_prod_[32 random characters]
 */
export function generateAPIKey(): { plaintext: string; hash: string } {
  const randomPart = crypto.randomBytes(24).toString('hex');
  const plaintext = `sk_prod_${randomPart}`;

  // Hash with bcrypt-12 for storage
  const hash = bcrypt.hashSync(plaintext, 12);

  return {
    plaintext,
    hash,
  };
}

/**
 * Validate plaintext API key against stored hash
 */
export function validateAPIKey(plaintext: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * Mask API key for display
 * Shows only last 4 characters
 *
 * Example: sk_prod_abc123xyz... → ...xyz
 */
export function maskAPIKey(plaintext: string): string {
  if (plaintext.length < 4) return '...';
  return `...${plaintext.slice(-4)}`;
}

/**
 * Extract API key from Authorization header
 *
 * Accepts: "Bearer sk_prod_xxx" or "sk_prod_xxx"
 */
export function extractAPIKeyFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }

  // Also accept raw key
  if (parts.length === 1 && parts[0].startsWith('sk_prod_')) {
    return parts[0];
  }

  return null;
}

/**
 * Lookup API key from database by hash
 */
export async function lookupAPIKey(plaintext: string): Promise<APIKey | null> {
  // Get all keys, filter by hash comparison (since bcrypt is one-way)
  const allKeys = await db.select().from(apiKeys).execute();

  for (const key of allKeys) {
    if (validateAPIKey(plaintext, key.key_hash)) {
      return {
        id: key.id,
        userId: key.user_id,
        name: key.name,
        keyHash: key.key_hash,
        keyPreview: key.key_preview,
        scopes: key.scopes || [],
        rateLimitPerMinute: key.rate_limit_per_minute,
        expiresAt: key.expires_at || undefined,
        revokedAt: key.revoked_at || undefined,
        lastUsedAt: key.last_used_at || undefined,
        createdAt: key.created_at,
        updatedAt: key.updated_at,
      };
    }
  }

  return null;
}

/**
 * Check if API key is valid and active
 *
 * Validates:
 * - Key exists
 * - Not revoked
 * - Not expired
 */
export function isAPIKeyValid(key: APIKey): boolean {
  // Check revoked
  if (key.revokedAt) {
    return false;
  }

  // Check expired
  if (key.expiresAt && new Date() > key.expiresAt) {
    return false;
  }

  return true;
}

/**
 * Validate that granted scopes satisfy required scopes
 *
 * Supports wildcard matching:
 * - 'deals:*' matches 'deals:read' and 'deals:write'
 * - '*' matches any scope
 *
 * Returns: { valid: boolean; missingScopes: string[] }
 */
export function validateScopes(
  requiredScopes: string[],
  grantedScopes: string[]
): { valid: boolean; missingScopes: string[] } {
  if (grantedScopes.includes('*')) {
    // Full access
    return { valid: true, missingScopes: [] };
  }

  const missing: string[] = [];

  for (const required of requiredScopes) {
    const hasScopeExact = grantedScopes.includes(required);
    const hasScopeWildcard = grantedScopes.some((granted) => {
      if (granted.endsWith(':*')) {
        const prefix = granted.slice(0, -2); // Remove :*
        return required.startsWith(prefix + ':');
      }
      return false;
    });

    if (!hasScopeExact && !hasScopeWildcard) {
      missing.push(required);
    }
  }

  return {
    valid: missing.length === 0,
    missingScopes: missing,
  };
}

/**
 * Check if a single scope matches granted scopes
 */
export function scopeMatches(requiredScope: string, grantedScopes: string[]): boolean {
  const result = validateScopes([requiredScope], grantedScopes);
  return result.valid;
}

/**
 * Check rate limit for API key
 *
 * Returns:
 * - { allowed: true, remaining: number }
 * - { allowed: false, retryAfter: number }
 */
export async function checkRateLimit(
  apiKeyId: string,
  limit: number
): Promise<{ allowed: boolean; remaining?: number; retryAfter?: number }> {
  // Get count of requests in last minute
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

  const recentRequests = await db
    .select()
    .from(apiKeyUsage)
    .where(and(eq(apiKeyUsage.api_key_id, apiKeyId), lt(apiKeyUsage.timestamp, oneMinuteAgo)))
    .execute();

  const requestCount = recentRequests.length;

  if (requestCount < limit) {
    return {
      allowed: true,
      remaining: limit - requestCount,
    };
  }

  // Find oldest request to calculate retry time
  const oldestRequest = recentRequests.reduce((oldest, current) =>
    current.timestamp < oldest.timestamp ? current : oldest
  );

  const retryAfter = Math.ceil((oldestRequest.timestamp.getTime() + 60 * 1000 - Date.now()) / 1000);

  return {
    allowed: false,
    retryAfter: Math.max(1, retryAfter),
  };
}

/**
 * Increment request count and update last_used_at
 */
export async function updateKeyLastUsed(apiKeyId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({
      last_used_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(apiKeys.id, apiKeyId))
    .execute();
}

/**
 * Log API key usage (for audit trail)
 */
export async function logAPIKeyUsage(usage: Omit<APIKeyUsageRecord, 'id' | 'timestamp'>): Promise<void> {
  await db
    .insert(apiKeyUsage)
    .values({
      id: usage.id || crypto.randomUUID(),
      api_key_id: usage.apiKeyId,
      endpoint: usage.endpoint,
      method: usage.method,
      status_code: usage.statusCode,
      ip_address: usage.ipAddress,
      user_agent: usage.userAgent,
      scope_required: usage.scopeRequired,
      scope_granted: usage.scopeGranted,
      authorized: usage.authorized,
      error_message: usage.errorMessage,
      request_id: usage.requestId,
      response_time_ms: usage.responseTimeMs,
      timestamp: new Date(),
    })
    .execute();
}

/**
 * Revoke an API key
 */
export async function revokeAPIKey(apiKeyId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({
      revoked_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(apiKeys.id, apiKeyId))
    .execute();
}

/**
 * Rotate an API key (revoke old, create new)
 *
 * Returns plaintext of new key
 */
export async function rotateAPIKey(apiKeyId: string): Promise<string> {
  // Get original key info
  const originalKey = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, apiKeyId))
    .limit(1)
    .execute();

  if (originalKey.length === 0) {
    throw new Error('API key not found');
  }

  const original = originalKey[0];

  // Generate new key
  const { plaintext, hash } = generateAPIKey();

  // Create new key with same scopes
  await db
    .insert(apiKeys)
    .values({
      id: crypto.randomUUID(),
      user_id: original.user_id,
      name: `${original.name} (rotated)`,
      key_hash: hash,
      key_preview: maskAPIKey(plaintext).slice(-4),
      scopes: original.scopes,
      rate_limit_per_minute: original.rate_limit_per_minute,
      expires_at: original.expires_at,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: original.created_by,
    })
    .execute();

  // Revoke old key
  await revokeAPIKey(apiKeyId);

  return plaintext;
}

/**
 * List API keys for a user
 */
export async function listAPIKeysByUser(
  userId: string,
  options?: {
    includeRevoked?: boolean;
  }
): Promise<APIKey[]> {
  let query = db.select().from(apiKeys).where(eq(apiKeys.user_id, userId));

  if (!options?.includeRevoked) {
    query = query.where(isNull(apiKeys.revoked_at));
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyHash: row.key_hash,
    keyPreview: row.key_preview,
    scopes: row.scopes || [],
    rateLimitPerMinute: row.rate_limit_per_minute,
    expiresAt: row.expires_at || undefined,
    revokedAt: row.revoked_at || undefined,
    lastUsedAt: row.last_used_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get API key usage statistics
 */
export async function getAPIKeyUsageStats(
  apiKeyId: string,
  timeframeMinutes: number = 1440 // Default 24 hours
): Promise<{
  totalRequests: number;
  authorizedRequests: number;
  deniedRequests: number;
  averageResponseTimeMs: number;
  statusCodeDistribution: Record<number, number>;
}> {
  const startTime = new Date(Date.now() - timeframeMinutes * 60 * 1000);

  const usageRecords = await db
    .select()
    .from(apiKeyUsage)
    .where(and(eq(apiKeyUsage.api_key_id, apiKeyId), lt(apiKeyUsage.timestamp, startTime)))
    .execute();

  const statusCodeMap: Record<number, number> = {};
  let totalResponseTime = 0;
  let authorizedCount = 0;
  let deniedCount = 0;

  for (const record of usageRecords) {
    // Count status codes
    statusCodeMap[record.status_code] = (statusCodeMap[record.status_code] || 0) + 1;

    // Sum response times
    if (record.response_time_ms) {
      totalResponseTime += record.response_time_ms;
    }

    // Count authorized/denied
    if (record.authorized) {
      authorizedCount++;
    } else {
      deniedCount++;
    }
  }

  return {
    totalRequests: usageRecords.length,
    authorizedRequests: authorizedCount,
    deniedRequests: deniedCount,
    averageResponseTimeMs: usageRecords.length > 0 ? totalResponseTime / usageRecords.length : 0,
    statusCodeDistribution: statusCodeMap,
  };
}

/**
 * Delete an API key (permanent removal)
 */
export async function deleteAPIKey(apiKeyId: string): Promise<void> {
  await db.delete(apiKeys).where(eq(apiKeys.id, apiKeyId)).execute();
}

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { apiKeyUsage } from '../db/schema';
import { eq, and, gte } from 'drizzle-orm';

/**
 * Per-API-Key Rate Limiting Middleware
 *
 * Enforces rate limits on a per-API-key basis to prevent abuse.
 * Works in conjunction with the authentication middleware.
 *
 * Rate limits can be configured per scope for granular control:
 * - Standard scopes: 100 requests/minute
 * - Expensive scopes (exports, reports): 10 requests/minute
 * - Critical scopes (admin, audit): 30 requests/minute
 */

export const API_KEY_RATE_LIMITS: Record<string, number> = {
  // Deal management (standard)
  'deals:read': 100,
  'deals:write': 100,
  'deals:delete': 50,

  // Document management
  'documents:read': 100,
  'documents:write': 100,
  'documents:sign': 50,

  // Borrower data
  'borrowers:read': 100,
  'borrowers:write': 50,
  'borrowers:pii': 30, // Critical, lower limit

  // Financial
  'financials:read': 100,
  'financials:write': 50,

  // Reports (expensive operations)
  'reports:read': 100,
  'reports:export': 10, // Expensive computation
  'reports:data_dump': 5, // Very expensive

  // Webhooks
  'webhooks:read': 100,
  'webhooks:write': 50,
  'webhooks:manage': 50,

  // Admin (strict limits)
  'admin:users': 30,
  'admin:roles': 30,
  'admin:audit': 30,
  'admin:keys': 30,
  'admin:system': 10,

  // Wildcard
  '*': 100,
};

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds to wait before retrying
}

/**
 * Check if API key is within rate limit
 *
 * Returns detailed information about rate limit status
 */
export async function checkAPIKeyRateLimit(
  apiKeyId: string,
  requiredScopes: string[]
): Promise<RateLimitCheckResult> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

  // Get the most restrictive limit from required scopes
  let limit = API_KEY_RATE_LIMITS['*'] || 100; // Default fallback

  for (const scope of requiredScopes) {
    const scopeLimit = API_KEY_RATE_LIMITS[scope];
    if (scopeLimit && scopeLimit < limit) {
      limit = scopeLimit;
    }
  }

  // Count requests in the last minute
  const recentRequests = await db
    .select()
    .from(apiKeyUsage)
    .where(and(eq(apiKeyUsage.api_key_id, apiKeyId), gte(apiKeyUsage.timestamp, oneMinuteAgo)))
    .execute();

  const requestCount = recentRequests.length;
  const resetAt = new Date(now.getTime() + 60 * 1000);

  if (requestCount < limit) {
    return {
      allowed: true,
      limit,
      remaining: limit - requestCount,
      resetAt,
    };
  }

  // Calculate how long to wait
  if (recentRequests.length > 0) {
    const oldestRequest = recentRequests.reduce((oldest, current) =>
      current.timestamp < oldest.timestamp ? current : oldest
    );

    const resetTime = new Date(oldestRequest.timestamp.getTime() + 60 * 1000);
    const retryAfter = Math.ceil((resetTime.getTime() - now.getTime()) / 1000);

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: resetTime,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  return {
    allowed: false,
    limit,
    remaining: 0,
    resetAt,
    retryAfter: 60,
  };
}

/**
 * Middleware to enforce API key rate limiting
 *
 * Should be applied after authenticateAPIKey middleware
 *
 * Usage:
 *   app.use(authenticateAPIKey)
 *   app.use(enforceAPIKeyRateLimit)
 */
export async function enforceAPIKeyRateLimit(req: Request, res: Response, next: NextFunction) {
  // Only apply to API key auth (skip user auth)
  if (!req.apiKey) {
    return next();
  }

  try {
    const result = await checkAPIKeyRateLimit(req.apiKey.apiKeyId, req.apiKey.scopes);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', String(result.limit));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfter));

      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `API rate limit exceeded. Limit: ${result.limit} requests/minute.`,
        limit: result.limit,
        remaining: 0,
        resetAt: result.resetAt,
        retryAfter: result.retryAfter,
      });
    }

    next();
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow request to proceed (fail open)
    next();
  }
}

/**
 * Middleware to set rate limit headers without enforcement
 *
 * Useful for monitoring rate limits without blocking requests
 */
export async function setRateLimitHeaders(req: Request, res: Response, next: NextFunction) {
  if (!req.apiKey) {
    return next();
  }

  try {
    const result = await checkAPIKeyRateLimit(req.apiKey.apiKeyId, req.apiKey.scopes);

    res.set('X-RateLimit-Limit', String(result.limit));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfter));
    }
  } catch (error) {
    console.error('Rate limit header error:', error);
  }

  next();
}

/**
 * Get rate limit stats for an API key
 *
 * Useful for dashboards and monitoring
 */
export async function getAPIKeyRateLimitStats(
  apiKeyId: string,
  scopes: string[]
): Promise<{
  limit: number;
  currentUsage: number;
  percentageUsed: number;
  resetAt: Date;
  allowedUntilReset: number;
}> {
  const result = await checkAPIKeyRateLimit(apiKeyId, scopes);

  const allowedUntilReset = result.remaining;
  const percentageUsed = ((result.limit - result.remaining) / result.limit) * 100;

  return {
    limit: result.limit,
    currentUsage: result.limit - result.remaining,
    percentageUsed,
    resetAt: result.resetAt,
    allowedUntilReset,
  };
}

/**
 * Override rate limit for a specific API key
 *
 * Useful for whitelisting certain keys
 */
export class RateLimitOverrides {
  private static overrides: Map<string, number> = new Map();

  static set(apiKeyId: string, requestsPerMinute: number): void {
    this.overrides.set(apiKeyId, requestsPerMinute);
  }

  static get(apiKeyId: string): number | undefined {
    return this.overrides.get(apiKeyId);
  }

  static has(apiKeyId: string): boolean {
    return this.overrides.has(apiKeyId);
  }

  static delete(apiKeyId: string): void {
    this.overrides.delete(apiKeyId);
  }

  static clear(): void {
    this.overrides.clear();
  }
}

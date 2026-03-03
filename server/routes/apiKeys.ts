import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  generateAPIKey,
  maskAPIKey,
  listAPIKeysByUser,
  revokeAPIKey,
  rotateAPIKey,
  deleteAPIKey,
  getAPIKeyUsageStats,
} from '../utils/apiKeys';
import { areValidScopes, getGrantableScopes, summarizeScopes } from '../utils/apiScopes';
import { requireAuth, requireAPIKeyScope } from '../middleware/apiKeyAuth';
import { logAuditAction } from '../utils/audit';
import { db } from '../db';
import { apiKeys } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * API Key Management Routes
 *
 * Provides endpoints for:
 * - Creating API keys
 * - Listing keys
 * - Updating scopes and settings
 * - Rotating keys
 * - Revoking keys
 * - Viewing usage statistics
 */

const router = Router();

// ============= Admin Endpoints (super_admin only) =============

/**
 * POST /api/admin/api-keys
 *
 * Create API key for a user (admin only)
 *
 * Body:
 * {
 *   userId: string (required)
 *   name: string (required)
 *   scopes: string[] (required)
 *   rateLimitPerMinute: number (optional, default: 100)
 *   expiresAt: ISO string (optional)
 * }
 *
 * Response:
 * {
 *   id: string
 *   userId: string
 *   name: string
 *   keyPlaintext: string (ONLY SHOWN ONCE)
 *   keyPreview: string
 *   scopes: string[]
 *   ...
 * }
 */
router.post('/api/admin/api-keys', requireAuth, async (req: Request, res: Response) => {
  try {
    // Check authorization
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only super_admin can create API keys for other users.',
      });
    }

    const { userId, name, scopes, rateLimitPerMinute, expiresAt } = req.body;

    // Validate required fields
    if (!userId || !name || !scopes || !Array.isArray(scopes)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'userId, name, and scopes (array) are required.',
      });
    }

    // Validate scopes
    const { valid, invalidScopes } = areValidScopes(scopes);
    if (!valid) {
      return res.status(400).json({
        error: 'invalid_scopes',
        message: `The following scopes are invalid: ${invalidScopes.join(', ')}`,
      });
    }

    // Generate API key
    const { plaintext, hash } = generateAPIKey();

    // Create key in database
    const keyId = uuidv4();
    await db
      .insert(apiKeys)
      .values({
        id: keyId,
        user_id: userId,
        name,
        key_hash: hash,
        key_preview: maskAPIKey(plaintext).slice(-4),
        scopes,
        rate_limit_per_minute: rateLimitPerMinute || 100,
        expires_at: expiresAt ? new Date(expiresAt) : null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: req.user.id,
      })
      .execute();

    // Log audit
    await logAuditAction({
      userId: req.user.id,
      action: 'apikey.created',
      resourceType: 'api_key',
      resourceId: keyId,
      changes: {
        name,
        scopes,
        rateLimitPerMinute: rateLimitPerMinute || 100,
      },
      metadata: {
        createdFor: userId,
      },
    });

    res.json({
      id: keyId,
      userId,
      name,
      keyPlaintext: plaintext, // Only shown once!
      keyPreview: maskAPIKey(plaintext),
      scopes,
      rateLimitPerMinute: rateLimitPerMinute || 100,
      expiresAt: expiresAt || null,
      revokedAt: null,
      createdAt: new Date(),
      message: 'Save the key plaintext now. You will not see it again.',
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to create API key.' });
  }
});

/**
 * GET /api/admin/api-keys
 *
 * List all API keys (with pagination)
 */
router.get('/api/admin/api-keys', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only super_admin can list all API keys.',
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const allKeys = await db.select().from(apiKeys).limit(limit).offset(offset).execute();

    const total = (await db.select().from(apiKeys).execute()).length;

    res.json({
      keys: allKeys.map((key) => ({
        id: key.id,
        userId: key.user_id,
        name: key.name,
        keyPreview: key.key_preview,
        scopes: key.scopes,
        rateLimitPerMinute: key.rate_limit_per_minute,
        expiresAt: key.expires_at,
        revokedAt: key.revoked_at,
        lastUsedAt: key.last_used_at,
        createdAt: key.created_at,
        createdBy: key.created_by,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list API keys.' });
  }
});

/**
 * GET /api/admin/api-keys/:id
 *
 * Get details of a specific API key
 */
router.get('/api/admin/api-keys/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only super_admin can view API key details.',
      });
    }

    const key = await db.select().from(apiKeys).where(eq(apiKeys.id, req.params.id)).limit(1).execute();

    if (key.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'API key not found.',
      });
    }

    const k = key[0];

    res.json({
      id: k.id,
      userId: k.user_id,
      name: k.name,
      keyPreview: k.key_preview,
      scopes: k.scopes,
      rateLimitPerMinute: k.rate_limit_per_minute,
      expiresAt: k.expires_at,
      revokedAt: k.revoked_at,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
      updatedAt: k.updated_at,
      createdBy: k.created_by,
    });
  } catch (error) {
    console.error('Error getting API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to get API key.' });
  }
});

/**
 * PATCH /api/admin/api-keys/:id
 *
 * Update API key settings (admin only)
 *
 * Body can include:
 * {
 *   name?: string
 *   scopes?: string[]
 *   rateLimitPerMinute?: number
 *   expiresAt?: ISO string
 * }
 */
router.patch('/api/admin/api-keys/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only super_admin can update API keys.',
      });
    }

    const { name, scopes, rateLimitPerMinute, expiresAt } = req.body;

    // Get existing key
    const existingKey = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1)
      .execute();

    if (existingKey.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'API key not found.',
      });
    }

    // Validate scopes if provided
    if (scopes && Array.isArray(scopes)) {
      const { valid, invalidScopes } = areValidScopes(scopes);
      if (!valid) {
        return res.status(400).json({
          error: 'invalid_scopes',
          message: `Invalid scopes: ${invalidScopes.join(', ')}`,
        });
      }
    }

    // Update
    const updates: any = { updated_at: new Date() };
    if (name) updates.name = name;
    if (scopes) updates.scopes = scopes;
    if (rateLimitPerMinute) updates.rate_limit_per_minute = rateLimitPerMinute;
    if (expiresAt) updates.expires_at = new Date(expiresAt);

    await db.update(apiKeys).set(updates).where(eq(apiKeys.id, req.params.id)).execute();

    // Log audit
    await logAuditAction({
      userId: req.user.id,
      action: 'apikey.scope_updated',
      resourceType: 'api_key',
      resourceId: req.params.id,
      changes: updates,
    });

    const updated = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1)
      .execute();

    const k = updated[0];

    res.json({
      id: k.id,
      userId: k.user_id,
      name: k.name,
      keyPreview: k.key_preview,
      scopes: k.scopes,
      rateLimitPerMinute: k.rate_limit_per_minute,
      expiresAt: k.expires_at,
      updatedAt: k.updated_at,
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to update API key.' });
  }
});

/**
 * POST /api/admin/api-keys/:id/rotate
 *
 * Rotate API key (revoke old, create new)
 */
router.post('/api/admin/api-keys/:id/rotate', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only super_admin can rotate API keys.',
      });
    }

    const newKeyPlaintext = await rotateAPIKey(req.params.id);

    await logAuditAction({
      userId: req.user.id,
      action: 'apikey.rotated',
      resourceType: 'api_key',
      resourceId: req.params.id,
    });

    res.json({
      newKeyPlaintext,
      keyPreview: maskAPIKey(newKeyPlaintext),
      message: 'API key rotated. Save the new key plaintext now. The old key has been revoked.',
    });
  } catch (error) {
    console.error('Error rotating API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to rotate API key.' });
  }
});

/**
 * DELETE /api/admin/api-keys/:id
 *
 * Revoke API key
 */
router.delete('/api/admin/api-keys/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only super_admin can revoke API keys.',
      });
    }

    const key = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1)
      .execute();

    if (key.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'API key not found.',
      });
    }

    await revokeAPIKey(req.params.id);

    await logAuditAction({
      userId: req.user.id,
      action: 'apikey.revoked',
      resourceType: 'api_key',
      resourceId: req.params.id,
    });

    res.json({
      message: 'API key revoked successfully.',
      id: req.params.id,
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to revoke API key.' });
  }
});

/**
 * GET /api/admin/api-keys/:id/usage
 *
 * Get API key usage statistics
 */
router.get('/api/admin/api-keys/:id/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Only super_admin can view API key usage.',
      });
    }

    const timeframe = parseInt(req.query.timeframe as string) || 1440; // Default 24 hours
    const stats = await getAPIKeyUsageStats(req.params.id, timeframe);

    await logAuditAction({
      userId: req.user.id,
      action: 'apikey.usage_viewed',
      resourceType: 'api_key',
      resourceId: req.params.id,
    });

    res.json({
      ...stats,
      timeframeMinutes: timeframe,
    });
  } catch (error) {
    console.error('Error getting API key usage:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to get usage statistics.' });
  }
});

// ============= User Self-Service Endpoints =============

/**
 * POST /api/user/api-keys
 *
 * Create own API key
 */
router.post('/api/user/api-keys', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, scopes, rateLimitPerMinute, expiresAt } = req.body;

    if (!name || !scopes || !Array.isArray(scopes)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'name and scopes (array) are required.',
      });
    }

    // Validate scopes
    const { valid, invalidScopes } = areValidScopes(scopes);
    if (!valid) {
      return res.status(400).json({
        error: 'invalid_scopes',
        message: `Invalid scopes: ${invalidScopes.join(', ')}`,
      });
    }

    // Generate key
    const { plaintext, hash } = generateAPIKey();

    const keyId = uuidv4();
    await db
      .insert(apiKeys)
      .values({
        id: keyId,
        user_id: req.user!.id,
        name,
        key_hash: hash,
        key_preview: maskAPIKey(plaintext).slice(-4),
        scopes,
        rate_limit_per_minute: rateLimitPerMinute || 100,
        expires_at: expiresAt ? new Date(expiresAt) : null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: req.user!.id,
      })
      .execute();

    // Log audit
    await logAuditAction({
      userId: req.user!.id,
      action: 'apikey.created',
      resourceType: 'api_key',
      resourceId: keyId,
      changes: {
        name,
        scopes,
      },
    });

    res.json({
      id: keyId,
      name,
      keyPlaintext: plaintext,
      keyPreview: maskAPIKey(plaintext),
      scopes,
      rateLimitPerMinute: rateLimitPerMinute || 100,
      message: 'Save the key plaintext now. You will not see it again.',
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to create API key.' });
  }
});

/**
 * GET /api/user/api-keys
 *
 * List own API keys
 */
router.get('/api/user/api-keys', requireAuth, async (req: Request, res: Response) => {
  try {
    const keys = await listAPIKeysByUser(req.user!.id);

    res.json({
      keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPreview: key.keyPreview,
        scopes: key.scopes,
        rateLimitPerMinute: key.rateLimitPerMinute,
        expiresAt: key.expiresAt,
        revokedAt: key.revokedAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list API keys.' });
  }
});

/**
 * PATCH /api/user/api-keys/:id
 *
 * Update own API key
 */
router.patch('/api/user/api-keys/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, rateLimitPerMinute } = req.body;

    // Verify ownership
    const key = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1)
      .execute();

    if (key.length === 0 || key[0].user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'not_found',
        message: 'API key not found.',
      });
    }

    const updates: any = { updated_at: new Date() };
    if (name) updates.name = name;
    if (rateLimitPerMinute) updates.rate_limit_per_minute = rateLimitPerMinute;

    await db.update(apiKeys).set(updates).where(eq(apiKeys.id, req.params.id)).execute();

    const updated = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1)
      .execute();

    res.json({
      id: updated[0].id,
      name: updated[0].name,
      keyPreview: updated[0].key_preview,
      scopes: updated[0].scopes,
      rateLimitPerMinute: updated[0].rate_limit_per_minute,
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to update API key.' });
  }
});

/**
 * POST /api/user/api-keys/:id/rotate
 *
 * Rotate own API key
 */
router.post('/api/user/api-keys/:id/rotate', requireAuth, async (req: Request, res: Response) => {
  try {
    const key = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1)
      .execute();

    if (key.length === 0 || key[0].user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'not_found',
        message: 'API key not found.',
      });
    }

    const newKeyPlaintext = await rotateAPIKey(req.params.id);

    await logAuditAction({
      userId: req.user!.id,
      action: 'apikey.rotated',
      resourceType: 'api_key',
      resourceId: req.params.id,
    });

    res.json({
      newKeyPlaintext,
      keyPreview: maskAPIKey(newKeyPlaintext),
      message: 'API key rotated. Save the new key plaintext now.',
    });
  } catch (error) {
    console.error('Error rotating API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to rotate API key.' });
  }
});

/**
 * DELETE /api/user/api-keys/:id
 *
 * Revoke own API key
 */
router.delete('/api/user/api-keys/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const key = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1)
      .execute();

    if (key.length === 0 || key[0].user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'not_found',
        message: 'API key not found.',
      });
    }

    await revokeAPIKey(req.params.id);

    await logAuditAction({
      userId: req.user!.id,
      action: 'apikey.revoked',
      resourceType: 'api_key',
      resourceId: req.params.id,
    });

    res.json({
      message: 'API key revoked successfully.',
      id: req.params.id,
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to revoke API key.' });
  }
});

export default router;

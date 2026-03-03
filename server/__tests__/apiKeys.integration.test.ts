import request from 'supertest';
import { Express } from 'express';
import { db } from '../db';
import { apiKeys, apiKeyUsage, users } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * API Key Integration Tests
 *
 * Tests the full HTTP endpoint flow:
 * - Key creation and retrieval
 * - Key authentication
 * - Scope enforcement
 * - Rate limiting
 * - Audit logging
 * - Key lifecycle (rotation, revocation)
 *
 * These tests assume the Express app is properly configured with:
 * - Route registration
 * - Middleware stack
 * - Database connection
 */

describe('API Key Integration Tests', () => {
  let app: Express;
  let superAdminToken: string;
  let regularUserToken: string;
  let superAdminId: string;
  let regularUserId: string;

  beforeAll(async () => {
    // TODO: Initialize Express app with routes and middleware
    // app = createApp();

    // TODO: Create test users in database
    // superAdminId = 'admin-user-id';
    // regularUserId = 'regular-user-id';

    // TODO: Get JWT tokens for testing
    // superAdminToken = await getJWT(superAdminId, 'super_admin');
    // regularUserToken = await getJWT(regularUserId, 'user');
  });

  afterEach(async () => {
    // Clean up test data
    // TODO: Delete test API keys
  });

  describe('Admin Endpoints', () => {
    describe('POST /api/admin/api-keys', () => {
      test('super_admin can create API key for user', async () => {
        const response = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Test Key',
            scopes: ['deals:read'],
            rateLimitPerMinute: 100,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('keyPlaintext');
        expect(response.body.name).toBe('Test Key');
        expect(response.body.scopes).toEqual(['deals:read']);
        expect(response.body.rateLimitPerMinute).toBe(100);

        // Key plaintext should only be shown once
        expect(response.body.keyPlaintext).toMatch(/^sk_prod_/);
      });

      test('regular user cannot create API keys for others', async () => {
        const response = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            userId: superAdminId,
            name: 'Malicious Key',
            scopes: ['admin:users'],
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('forbidden');
      });

      test('rejects invalid scopes', async () => {
        const response = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Invalid Scope Key',
            scopes: ['invalid:scope', 'deals:read'],
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_scopes');
        expect(response.body.message).toContain('invalid:scope');
      });

      test('requires all required fields', async () => {
        const response = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Incomplete Key',
            // Missing scopes
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_request');
      });
    });

    describe('GET /api/admin/api-keys', () => {
      test('lists all API keys with pagination', async () => {
        const response = await request(app)
          .get('/api/admin/api-keys?page=1&limit=20')
          .set('Authorization', `Bearer ${superAdminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('keys');
        expect(response.body).toHaveProperty('pagination');
        expect(Array.isArray(response.body.keys)).toBe(true);
      });

      test('regular user cannot list all keys', async () => {
        const response = await request(app)
          .get('/api/admin/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`);

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/admin/api-keys/:id', () => {
      test('super_admin can view key details', async () => {
        // Create a key first
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'View Test Key',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;

        // View the key
        const response = await request(app)
          .get(`/api/admin/api-keys/${keyId}`)
          .set('Authorization', `Bearer ${superAdminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(keyId);
        expect(response.body.name).toBe('View Test Key');

        // Plaintext should NOT be in response
        expect(response.body).not.toHaveProperty('keyPlaintext');
      });

      test('returns 404 for non-existent key', async () => {
        const response = await request(app)
          .get('/api/admin/api-keys/non-existent-id')
          .set('Authorization', `Bearer ${superAdminToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('not_found');
      });
    });

    describe('PATCH /api/admin/api-keys/:id', () => {
      test('super_admin can update key settings', async () => {
        // Create key
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Original Name',
            scopes: ['deals:read'],
            rateLimitPerMinute: 100,
          });

        const keyId = createResponse.body.id;

        // Update key
        const updateResponse = await request(app)
          .patch(`/api/admin/api-keys/${keyId}`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            name: 'Updated Name',
            rateLimitPerMinute: 50,
            scopes: ['deals:read', 'documents:read'],
          });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.name).toBe('Updated Name');
        expect(updateResponse.body.rateLimitPerMinute).toBe(50);
        expect(updateResponse.body.scopes).toContain('documents:read');
      });
    });

    describe('POST /api/admin/api-keys/:id/rotate', () => {
      test('rotates API key and revokes old one', async () => {
        // Create key
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Rotate Test',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;
        const oldKeyPlaintext = createResponse.body.keyPlaintext;

        // Rotate key
        const rotateResponse = await request(app)
          .post(`/api/admin/api-keys/${keyId}/rotate`)
          .set('Authorization', `Bearer ${superAdminToken}`);

        expect(rotateResponse.status).toBe(200);
        expect(rotateResponse.body).toHaveProperty('newKeyPlaintext');

        const newKeyPlaintext = rotateResponse.body.newKeyPlaintext;

        // New key should be different
        expect(newKeyPlaintext).not.toBe(oldKeyPlaintext);

        // Old key should no longer work (TODO: test authentication)
      });
    });

    describe('DELETE /api/admin/api-keys/:id', () => {
      test('revokes API key', async () => {
        // Create key
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Revoke Test',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;

        // Revoke key
        const deleteResponse = await request(app)
          .delete(`/api/admin/api-keys/${keyId}`)
          .set('Authorization', `Bearer ${superAdminToken}`);

        expect(deleteResponse.status).toBe(200);
        expect(deleteResponse.body.message).toContain('revoked');

        // Key should be marked as revoked
        const key = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1).execute();

        expect(key[0].revoked_at).toBeTruthy();
      });
    });

    describe('GET /api/admin/api-keys/:id/usage', () => {
      test('returns usage statistics for key', async () => {
        // Create key
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Usage Test',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;

        // Get usage stats
        const response = await request(app)
          .get(`/api/admin/api-keys/${keyId}/usage?timeframe=1440`)
          .set('Authorization', `Bearer ${superAdminToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('totalRequests');
        expect(response.body).toHaveProperty('authorizedRequests');
        expect(response.body).toHaveProperty('deniedRequests');
        expect(response.body).toHaveProperty('statusCodeDistribution');
      });
    });
  });

  describe('User Self-Service Endpoints', () => {
    describe('POST /api/user/api-keys', () => {
      test('user can create own API key', async () => {
        const response = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'My API Key',
            scopes: ['deals:read'],
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('keyPlaintext');
        expect(response.body.name).toBe('My API Key');
      });

      test('user cannot create keys with restricted scopes', async () => {
        // TODO: Implement scope restriction logic
        // Users might not be able to grant themselves admin scopes
      });
    });

    describe('GET /api/user/api-keys', () => {
      test('user can list own API keys', async () => {
        // Create some keys
        await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Key 1',
            scopes: ['deals:read'],
          });

        await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Key 2',
            scopes: ['documents:read'],
          });

        // List keys
        const response = await request(app)
          .get('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.keys)).toBe(true);
        expect(response.body.keys.length).toBe(2);

        // Should not include plaintext keys
        response.body.keys.forEach((key: any) => {
          expect(key).not.toHaveProperty('keyPlaintext');
          expect(key).toHaveProperty('keyPreview');
        });
      });

      test('user only sees their own keys', async () => {
        // Admin creates key for one user
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: superAdminId,
            name: "Admin's Secret Key",
            scopes: ['admin:users'],
          });

        // Regular user tries to see all keys
        const response = await request(app)
          .get('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`);

        expect(response.status).toBe(200);

        // Should not include admin's key
        const adminKeyName = "Admin's Secret Key";
        const keyNames = response.body.keys.map((k: any) => k.name);

        expect(keyNames).not.toContain(adminKeyName);
      });
    });

    describe('PATCH /api/user/api-keys/:id', () => {
      test('user can update their own key', async () => {
        // Create key
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Original Name',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;

        // Update key
        const updateResponse = await request(app)
          .patch(`/api/user/api-keys/${keyId}`)
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Updated Name',
          });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.name).toBe('Updated Name');
      });

      test('user cannot update another user\'s key', async () => {
        // Admin creates key
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: superAdminId,
            name: "Admin's Key",
            scopes: ['admin:users'],
          });

        const keyId = createResponse.body.id;

        // Regular user tries to update admin's key
        const updateResponse = await request(app)
          .patch(`/api/user/api-keys/${keyId}`)
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Hacked Name',
          });

        expect(updateResponse.status).toBe(404);
      });
    });

    describe('DELETE /api/user/api-keys/:id', () => {
      test('user can revoke their own key', async () => {
        // Create key
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Revoke Me',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;

        // Revoke key
        const revokeResponse = await request(app)
          .delete(`/api/user/api-keys/${keyId}`)
          .set('Authorization', `Bearer ${regularUserToken}`);

        expect(revokeResponse.status).toBe(200);

        // Key should be revoked
        const key = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1).execute();

        expect(key[0].revoked_at).toBeTruthy();
      });
    });
  });

  describe('API Key Authentication', () => {
    describe('Using API key in requests', () => {
      test('request with valid API key is authenticated', async () => {
        // Create an API key
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Test Auth Key',
            scopes: ['deals:read'],
          });

        const keyPlaintext = createResponse.body.keyPlaintext;

        // Use API key in request to protected endpoint
        const response = await request(app)
          .get('/api/deals')
          .set('Authorization', `Bearer ${keyPlaintext}`);

        // Should be authenticated (may return 200 or other status, but not 401 for auth)
        expect(response.status).not.toBe(401);
      });

      test('request with invalid API key is rejected', async () => {
        const response = await request(app).get('/api/deals').set('Authorization', 'Bearer sk_prod_invalid');

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('invalid_api_key');
      });

      test('revoked API key is rejected', async () => {
        // Create and revoke key
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Revoked Key',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;
        const keyPlaintext = createResponse.body.keyPlaintext;

        // Revoke the key
        await request(app)
          .delete(`/api/user/api-keys/${keyId}`)
          .set('Authorization', `Bearer ${regularUserToken}`);

        // Try to use revoked key
        const response = await request(app).get('/api/deals').set('Authorization', `Bearer ${keyPlaintext}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('api_key_invalid');
      });

      test('expired API key is rejected', async () => {
        // Create key with past expiration
        const pastDate = new Date(Date.now() - 1000);

        // TODO: Create expired key and test
      });
    });

    describe('Scope enforcement', () => {
      test('API key with correct scope can access endpoint', async () => {
        // Create key with deals:read scope
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Read Key',
            scopes: ['deals:read'],
          });

        const keyPlaintext = createResponse.body.keyPlaintext;

        // Access endpoint that requires deals:read
        const response = await request(app).get('/api/deals').set('Authorization', `Bearer ${keyPlaintext}`);

        expect(response.status).not.toBe(403);
      });

      test('API key without required scope is denied', async () => {
        // Create key with only deals:read scope
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Limited Key',
            scopes: ['deals:read'],
          });

        const keyPlaintext = createResponse.body.keyPlaintext;

        // Try to access endpoint that requires deals:write
        const response = await request(app)
          .post('/api/deals')
          .set('Authorization', `Bearer ${keyPlaintext}`)
          .send({
            name: 'New Deal',
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('insufficient_scope');
      });
    });

    describe('Rate limiting', () => {
      test('requests exceeding rate limit are rejected', async () => {
        // Create key with low rate limit
        const createResponse = await request(app)
          .post('/api/admin/api-keys')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({
            userId: regularUserId,
            name: 'Rate Limited Key',
            scopes: ['deals:read'],
            rateLimitPerMinute: 2, // Very low limit for testing
          });

        const keyPlaintext = createResponse.body.keyPlaintext;

        // Make requests up to limit
        await request(app).get('/api/deals').set('Authorization', `Bearer ${keyPlaintext}`);

        await request(app).get('/api/deals').set('Authorization', `Bearer ${keyPlaintext}`);

        // Third request should be rate limited
        const response = await request(app).get('/api/deals').set('Authorization', `Bearer ${keyPlaintext}`);

        expect(response.status).toBe(429);
        expect(response.body.error).toBe('rate_limit_exceeded');
        expect(response.headers['retry-after']).toBeTruthy();
      });
    });

    describe('Audit logging', () => {
      test('successful API key requests are logged', async () => {
        // Create key
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Audit Test Key',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;
        const keyPlaintext = createResponse.body.keyPlaintext;

        // Make request with API key
        await request(app).get('/api/deals').set('Authorization', `Bearer ${keyPlaintext}`);

        // Check audit log
        const usageRecords = await db
          .select()
          .from(apiKeyUsage)
          .where(eq(apiKeyUsage.api_key_id, keyId))
          .execute();

        expect(usageRecords.length).toBeGreaterThan(0);
        expect(usageRecords[0].authorized).toBe(true);
      });

      test('failed authorization attempts are logged', async () => {
        // Create key with limited scope
        const createResponse = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            name: 'Limited Audit Key',
            scopes: ['deals:read'],
          });

        const keyId = createResponse.body.id;
        const keyPlaintext = createResponse.body.keyPlaintext;

        // Try to use key without proper scope
        await request(app)
          .post('/api/deals')
          .set('Authorization', `Bearer ${keyPlaintext}`)
          .send({
            name: 'New Deal',
          });

        // Check audit log
        const usageRecords = await db
          .select()
          .from(apiKeyUsage)
          .where(eq(apiKeyUsage.api_key_id, keyId))
          .execute();

        const failedRecord = usageRecords.find((r) => r.authorized === false);

        expect(failedRecord).toBeTruthy();
        expect(failedRecord?.error_message).toContain('scope');
      });
    });
  });
});

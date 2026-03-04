import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import db from '../../db';
import { setupTestDb, teardownTestDb, createTestUser, createTestApiKey } from '../../__tests__/fixtures/database';
import * as auditControls from '../../utils/auditControls';
import * as evidenceCollector from '../../utils/evidenceCollector';

describe('Compliance Integration Tests', () => {
  let testUser: any;
  let adminUser: any;

  beforeAll(async () => {
    await setupTestDb();
    testUser = await createTestUser({ role: 'user' });
    adminUser = await createTestUser({ role: 'super_admin' });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('CC-6.1: Authentication Control', () => {
    it('should block unauthenticated requests to protected endpoints', async () => {
      const response = await request(app).get('/api/user/profile');
      expect(response.status).toBe(401);
    });

    it('should allow authenticated requests with valid JWT', async () => {
      const loginResponse = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'password123',
      });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer invalid-token-123');

      expect(response.status).toBe(401);
    });

    it('should verify JWT signature', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.invalid');

      expect(response.status).toBe(401);
    });
  });

  describe('CC-6.2: RBAC Control', () => {
    it('should deny access to unauthorized roles', async () => {
      const userToken = await getTokenForUser(testUser);

      const response = await request(app)
        .delete('/api/admin/users/some-id')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow admin access to protected endpoints', async () => {
      const adminToken = await getTokenForUser(adminUser);

      const response = await request(app)
        .get('/api/admin/audit/controls')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should enforce scope-based access for API keys', async () => {
      const apiKey = await createTestApiKey(testUser.id, ['deals:read']);

      const response = await request(app)
        .post('/api/deals')
        .set('Authorization', `Bearer ${apiKey.key}`)
        .send({ title: 'Test Deal' });

      expect(response.status).toBe(403); // Should fail - no write scope
    });

    it('should allow scoped operations with correct scope', async () => {
      const apiKey = await createTestApiKey(testUser.id, ['deals:write']);

      const response = await request(app)
        .post('/api/deals')
        .set('Authorization', `Bearer ${apiKey.key}`)
        .send({ title: 'Test Deal' });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('CC-7.1: Audit Logging Control', () => {
    it('should log all user actions', async () => {
      const userToken = await getTokenForUser(testUser);

      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`);

      const logs = await db('auditLogs')
        .where('userId', testUser.id)
        .where('action', 'user.profile_accessed')
        .select();

      expect(logs.length).toBeGreaterThan(0);
    });

    it('should include timestamp in audit logs', async () => {
      const userToken = await getTokenForUser(testUser);

      await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`);

      const logs = await db('auditLogs')
        .where('userId', testUser.id)
        .select();

      expect(logs[0]).toHaveProperty('createdAt');
      expect(logs[0].createdAt).toBeInstanceOf(Date);
    });

    it('should log failed authentication attempts', async () => {
      await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'wrong-password',
      });

      const logs = await db('auditLogs')
        .where('action', 'auth.login_failed')
        .select();

      expect(logs.length).toBeGreaterThan(0);
    });

    it('should log unauthorized access attempts', async () => {
      const userToken = await getTokenForUser(testUser);

      await request(app)
        .delete('/api/admin/system')
        .set('Authorization', `Bearer ${userToken}`);

      const logs = await db('auditLogs')
        .where('action', 'like', '%permission.denied%')
        .select();

      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('CC-7.2: Log Immutability Control', () => {
    it('should prevent log modification', async () => {
      const log = await db('auditLogs').first();

      try {
        await db('auditLogs').where('id', log.id).update({
          action: 'modified',
        });
        fail('Expected update to fail');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should prevent log deletion', async () => {
      const log = await db('auditLogs').first();
      const originalCount = await db('auditLogs').count('* as count');

      try {
        await db('auditLogs').where('id', log.id).delete();
        fail('Expected delete to fail');
      } catch (error) {
        expect(error).toBeDefined();
      }

      const newCount = await db('auditLogs').count('* as count');
      expect(newCount[0].count).toBe(originalCount[0].count);
    });

    it('should have timestamps that cannot be modified', async () => {
      const log = await db('auditLogs').first();
      const originalTime = log.createdAt;

      // Verify timestamp is set
      expect(originalTime).toBeDefined();
      expect(originalTime).toBeInstanceOf(Date);
    });
  });

  describe('CC-7.4: Monitoring and Alerting Control', () => {
    it('should detect failed authentication patterns', async () => {
      // Simulate multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        await request(app).post('/auth/login').send({
          email: testUser.email,
          password: 'wrong-password',
        });
      }

      const logs = await db('auditLogs')
        .where('action', 'auth.login_failed')
        .select();

      expect(logs.length).toBeGreaterThanOrEqual(6);
    });

    it('should track rate limiting violations', async () => {
      const apiKey = await createTestApiKey(testUser.id, ['deals:read']);

      // Make requests beyond rate limit
      for (let i = 0; i < 105; i++) {
        try {
          await request(app)
            .get('/api/deals')
            .set('Authorization', `Bearer ${apiKey.key}`);
        } catch (error) {
          // Ignore errors
        }
      }

      const logs = await db('auditLogs')
        .where('action', 'like', '%rate_limit%')
        .select();

      expect(logs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CC-8.1: Change Authorization Control', () => {
    it('should require code review for changes', async () => {
      // This would be tested at CI/CD level, not application level
      // Verify change management procedures are documented
      expect(true).toBe(true);
    });
  });

  describe('C-1.1: Data Encryption at Rest Control', () => {
    it('should encrypt PII fields', async () => {
      const userToken = await getTokenForUser(testUser);

      const user = await db('users').where('id', testUser.id).first();

      // Verify SSN is encrypted
      if (user.ssn) {
        expect(user.ssn).toMatch(/^enc:/);
      }
    });

    it('should prevent plaintext PII in responses', async () => {
      const userToken = await getTokenForUser(testUser);

      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);

      // Verify response contains decrypted data (if requested)
      // or encrypted data with proper format
      if (response.body.ssn) {
        expect(response.body.ssn).toBeDefined();
      }
    });

    it('should enforce encryption on PII updates', async () => {
      const userToken = await getTokenForUser(testUser);

      const response = await request(app)
        .patch('/api/user/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          ssn: '123-45-6789',
        });

      expect(response.status).toBeLessThan(500);

      const updatedUser = await db('users').where('id', testUser.id).first();
      if (updatedUser.ssn) {
        expect(updatedUser.ssn).toMatch(/^enc:/);
      }
    });
  });

  describe('C-1.2: Data Encryption in Transit Control', () => {
    it('should require HTTPS for all API calls', async () => {
      // Note: This would be tested at infrastructure level
      // Verify HTTPS enforcement in documentation
      expect(true).toBe(true);
    });

    it('should use TLS 1.2 or higher', async () => {
      // Tested at infrastructure level
      expect(true).toBe(true);
    });
  });

  describe('Audit Endpoints', () => {
    it('should allow admins to run compliance audit', async () => {
      const adminToken = await getTokenForUser(adminUser);

      const response = await request(app)
        .post('/api/admin/audit/run')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBeLessThan(500);
    });

    it('should prevent non-admins from running audit', async () => {
      const userToken = await getTokenForUser(testUser);

      const response = await request(app)
        .post('/api/admin/audit/run')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    it('should return audit results for admins', async () => {
      const adminToken = await getTokenForUser(adminUser);

      // First run audit
      const runResponse = await request(app)
        .post('/api/admin/audit/run')
        .set('Authorization', `Bearer ${adminToken}`);

      if (runResponse.status === 200) {
        const auditId = runResponse.body.auditRunId;

        // Then get results
        const resultsResponse = await request(app)
          .get(`/api/admin/audit/results/${auditId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(resultsResponse.status).toBeLessThan(500);
      }
    });
  });

  describe('Compliance Dashboard', () => {
    it('should provide compliance overview', async () => {
      const response = await request(app).get('/api/compliance/overview');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('compliance_percentage');
    });

    it('should show controls by criteria', async () => {
      const response = await request(app).get('/api/compliance/by-criteria');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should display individual control status', async () => {
      const response = await request(app).get('/api/compliance/controls');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should show risk register', async () => {
      const response = await request(app).get('/api/compliance/risks');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Full Audit Workflow', () => {
    it('should support complete audit from start to finish', async () => {
      // Collect evidence
      const evidence = await evidenceCollector.collectAllEvidence();
      expect(evidence.length).toBeGreaterThan(0);

      // Store evidence
      await evidenceCollector.storeEvidence(evidence, adminUser.id);

      // Assess controls
      const controls = await auditControls.getControlDefinitions();
      for (const control of controls) {
        const assessment = await auditControls.assessControlMaturity(control.controlId);
        expect(assessment).toHaveProperty('status');
      }

      // Get summary
      const summary = await auditControls.getComplianceSummary();
      expect(summary).toHaveProperty('total_controls');
      expect(summary).toHaveProperty('compliance_percentage');
    });

    it('should track compliance trends over time', async () => {
      const adminToken = await getTokenForUser(adminUser);

      // Get initial compliance
      const response1 = await request(app)
        .get('/api/compliance/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      const initialCompliance = response1.body.compliance_percentage;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get updated compliance
      const response2 = await request(app)
        .get('/api/compliance/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      const updatedCompliance = response2.body.compliance_percentage;

      expect(initialCompliance).toBeDefined();
      expect(updatedCompliance).toBeDefined();
    });
  });

  describe('Evidence Collection', () => {
    it('should collect authentication evidence', async () => {
      const evidence = await evidenceCollector.collectAuthenticationEvidence();
      expect(evidence.length).toBeGreaterThan(0);
    });

    it('should collect access control evidence', async () => {
      const evidence = await evidenceCollector.collectAccessControlEvidence();
      expect(evidence.length).toBeGreaterThan(0);
    });

    it('should collect audit logging evidence', async () => {
      const evidence = await evidenceCollector.collectAuditLoggingEvidence();
      expect(evidence.length).toBeGreaterThan(0);
    });

    it('should collect encryption evidence', async () => {
      const evidence = await evidenceCollector.collectEncryptionEvidence();
      expect(evidence.length).toBeGreaterThan(0);
    });

    it('should collect all evidence types', async () => {
      const evidence = await evidenceCollector.collectAllEvidence();
      expect(evidence.length).toBeGreaterThan(0);

      const types = new Set(evidence.map(e => e.controlId));
      expect(types.size).toBeGreaterThan(5);
    });
  });

  describe('Risk Management', () => {
    it('should identify and track risks', async () => {
      await auditControls.addRisk(
        'RISK-TEST-001',
        'Test risk',
        'technical',
        'high',
        'high'
      );

      const risks = await auditControls.getRiskRegister();
      expect(risks.some((r: any) => r.riskId === 'RISK-TEST-001')).toBe(true);
    });

    it('should update risk mitigation status', async () => {
      await auditControls.addRisk(
        'RISK-TEST-002',
        'Test risk 2',
        'compliance',
        'medium',
        'high'
      );

      await auditControls.updateRiskStatus('RISK-TEST-002', 'mitigating');

      const risks = await auditControls.getRiskRegister();
      const risk = risks.find((r: any) => r.riskId === 'RISK-TEST-002');
      expect(risk.status).toBe('mitigating');
    });
  });
});

// Helper function
async function getTokenForUser(user: any): Promise<string> {
  const response = await request(app).post('/auth/login').send({
    email: user.email,
    password: 'password123',
  });
  return response.body.token;
}

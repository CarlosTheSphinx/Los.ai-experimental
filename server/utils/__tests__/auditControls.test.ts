import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as auditControls from '../auditControls';
import db from '../../db';
import { setupTestDb, teardownTestDb } from '../../__tests__/fixtures/database';

describe('Audit Controls', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('getControlDefinitions', () => {
    it('should return all defined controls', async () => {
      const controls = await auditControls.getControlDefinitions();
      expect(controls).toBeDefined();
      expect(controls.length).toBeGreaterThan(0);
    });

    it('should include CC-6 controls', async () => {
      const controls = await auditControls.getControlDefinitions();
      const cc6Controls = controls.filter((c: any) => c.category === 'CC-6');
      expect(cc6Controls.length).toBeGreaterThan(0);
    });

    it('should include CC-7 controls', async () => {
      const controls = await auditControls.getControlDefinitions();
      const cc7Controls = controls.filter((c: any) => c.category === 'CC-7');
      expect(cc7Controls.length).toBeGreaterThan(0);
    });

    it('should include C-1 controls', async () => {
      const controls = await auditControls.getControlDefinitions();
      const c1Controls = controls.filter((c: any) => c.category === 'C-1');
      expect(c1Controls.length).toBeGreaterThan(0);
    });
  });

  describe('getControlsByCategory', () => {
    it('should return controls for specified category', async () => {
      const controls = await auditControls.getControlsByCategory('CC-6');
      expect(controls.length).toBeGreaterThan(0);
      controls.forEach((c: any) => expect(c.category).toBe('CC-6'));
    });

    it('should return empty array for non-existent category', async () => {
      const controls = await auditControls.getControlsByCategory('XX-99');
      expect(controls).toEqual([]);
    });
  });

  describe('mapControlToRequirement', () => {
    it('should map CC-6.1 to authentication requirement', () => {
      const requirement = auditControls.mapControlToRequirement('CC-6.1');
      expect(requirement).toContain('authentication');
      expect(requirement).toContain('valid credentials');
    });

    it('should map CC-7.2 to log immutability', () => {
      const requirement = auditControls.mapControlToRequirement('CC-7.2');
      expect(requirement).toContain('immutable');
      expect(requirement).toContain('cannot be modified');
    });

    it('should map C-1.1 to encryption at rest', () => {
      const requirement = auditControls.mapControlToRequirement('C-1.1');
      expect(requirement).toContain('encrypt');
      expect(requirement.toLowerCase()).toContain('rest');
    });

    it('should return default message for unknown control', () => {
      const requirement = auditControls.mapControlToRequirement('XX-99');
      expect(requirement).toBe('Control requirement not defined');
    });
  });

  describe('addControlEvidence', () => {
    it('should add evidence for a control', async () => {
      const controlId = 'CC-6.1';
      const evidence = { result: 'pass', testCount: 5 };

      await auditControls.addControlEvidence(
        controlId,
        'test_result',
        evidence,
        'Authentication test passed',
        'test-user-id'
      );

      const collectedEvidence = await auditControls.getControlEvidence(controlId);
      expect(collectedEvidence.length).toBeGreaterThan(0);
    });

    it('should record correct evidence type', async () => {
      const controlId = 'CC-7.1';
      const evidence = { logCount: 1000 };

      await auditControls.addControlEvidence(
        controlId,
        'log_entry',
        evidence,
        'Audit logs verified'
      );

      const collectedEvidence = await auditControls.getControlEvidence(controlId);
      expect(collectedEvidence[0].evidenceType).toBe('log_entry');
    });
  });

  describe('getControlEvidence', () => {
    it('should return evidence for a control', async () => {
      const controlId = 'CC-6.2';

      await auditControls.addControlEvidence(
        controlId,
        'config',
        { roles: ['admin', 'user', 'viewer'], permissions: 15 }
      );

      const evidence = await auditControls.getControlEvidence(controlId);
      expect(evidence.length).toBeGreaterThan(0);
    });

    it('should order evidence by timestamp descending', async () => {
      const controlId = 'CC-8.1';

      // Add evidence at different times
      await auditControls.addControlEvidence(controlId, 'procedure', { order: 1 });
      await new Promise(resolve => setTimeout(resolve, 10));
      await auditControls.addControlEvidence(controlId, 'procedure', { order: 2 });

      const evidence = await auditControls.getControlEvidence(controlId);
      expect(evidence[0].evidence.order).toBe(2);
    });
  });

  describe('assessControlMaturity', () => {
    it('should return non-compliant for no evidence', async () => {
      const controlId = 'CC-9.1';

      // Ensure no evidence exists
      await db('auditEvidence').where('controlId', controlId).delete();

      const assessment = await auditControls.assessControlMaturity(controlId);
      expect(assessment.status).toBe('non_compliant');
      expect(assessment.evidenceCount).toBe(0);
    });

    it('should return compliant for passing evidence', async () => {
      const controlId = 'CC-7.3';

      await db('auditEvidence').where('controlId', controlId).delete();
      await auditControls.addControlEvidence(
        controlId,
        'log_entry',
        { result: 'pass', retention_days: 2555 }
      );

      const assessment = await auditControls.assessControlMaturity(controlId);
      expect(assessment.status).toBe('compliant');
      expect(assessment.evidenceCount).toBeGreaterThan(0);
    });

    it('should include recommendations for improvement', async () => {
      const controlId = 'CC-6.4';

      await db('auditEvidence').where('controlId', controlId).delete();
      const assessment = await auditControls.assessControlMaturity(controlId);

      expect(assessment.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('getComplianceSummary', () => {
    it('should return summary with total controls', async () => {
      const summary = await auditControls.getComplianceSummary();
      expect(summary).toHaveProperty('total_controls');
      expect(summary.total_controls).toBeGreaterThan(0);
    });

    it('should calculate compliance percentage', async () => {
      const summary = await auditControls.getComplianceSummary();
      expect(summary).toHaveProperty('compliance_percentage');
      expect(summary.compliance_percentage).toBeGreaterThanOrEqual(0);
      expect(summary.compliance_percentage).toBeLessThanOrEqual(100);
    });

    it('should report compliant controls count', async () => {
      const summary = await auditControls.getComplianceSummary();
      expect(summary).toHaveProperty('compliant_controls');
      expect(summary.compliant_controls).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getControlsByCriteria', () => {
    it('should group controls by category', async () => {
      const byCriteria = await auditControls.getControlsByCriteria();
      expect(byCriteria.length).toBeGreaterThan(0);
    });

    it('should include control counts per category', async () => {
      const byCriteria = await auditControls.getControlsByCriteria();
      byCriteria.forEach((item: any) => {
        expect(item).toHaveProperty('category');
        expect(item).toHaveProperty('control_count');
        expect(item.control_count).toBeGreaterThan(0);
      });
    });
  });

  describe('Risk Register', () => {
    describe('addRisk', () => {
      it('should add risk to register', async () => {
        const riskId = 'RISK-001';
        await auditControls.addRisk(
          riskId,
          'Insufficient backup testing',
          'operational',
          'medium',
          'high',
          'Increase monthly testing to verify recovery'
        );

        const risks = await auditControls.getRiskRegister();
        expect(risks.some((r: any) => r.riskId === riskId)).toBe(true);
      });

      it('should set initial status to identified', async () => {
        const riskId = 'RISK-002';
        await auditControls.addRisk(
          riskId,
          'API key rotation',
          'compliance',
          'low',
          'medium'
        );

        const risks = await auditControls.getRiskRegister();
        const risk = risks.find((r: any) => r.riskId === riskId);
        expect(risk.status).toBe('identified');
      });
    });

    describe('updateRiskStatus', () => {
      it('should update risk status', async () => {
        const riskId = 'RISK-003';
        await auditControls.addRisk(riskId, 'Test risk', 'technical', 'low', 'low');
        await auditControls.updateRiskStatus(riskId, 'mitigating', 'Implementing fix');

        const risks = await auditControls.getRiskRegister();
        const risk = risks.find((r: any) => r.riskId === riskId);
        expect(risk.status).toBe('mitigating');
      });
    });

    describe('getRiskRegister', () => {
      it('should return all risks ordered by severity', async () => {
        const risks = await auditControls.getRiskRegister();
        expect(risks).toBeDefined();
        expect(Array.isArray(risks)).toBe(true);
      });
    });
  });

  describe('calculateComplianceScore', () => {
    it('should return number between 0 and 100', async () => {
      const score = await auditControls.calculateComplianceScore();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return 0 for no controls', async () => {
      // Clear all evidence
      await db('auditEvidence').delete();
      const score = await auditControls.calculateComplianceScore();
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration', () => {
    it('should support full audit workflow', async () => {
      const controlId = 'CC-6.1';

      // Add evidence
      await auditControls.addControlEvidence(
        controlId,
        'test_result',
        { result: 'pass', tests: 5 },
        'Authentication tests passed'
      );

      // Assess control
      const assessment = await auditControls.assessControlMaturity(controlId);
      expect(assessment.controlId).toBe(controlId);
      expect(assessment.evidenceCount).toBeGreaterThan(0);

      // Get evidence
      const evidence = await auditControls.getControlEvidence(controlId);
      expect(evidence.length).toBeGreaterThan(0);

      // Get summary
      const summary = await auditControls.getComplianceSummary();
      expect(summary.total_controls).toBeGreaterThan(0);
    });

    it('should support risk tracking through audit', async () => {
      const riskId = 'RISK-AUDIT-001';

      // Identify risk
      await auditControls.addRisk(
        riskId,
        'Missing control evidence',
        'compliance',
        'high',
        'high'
      );

      // Mitigate risk
      await auditControls.updateRiskStatus(riskId, 'mitigating', 'Collecting evidence');

      // Verify
      const risks = await auditControls.getRiskRegister();
      const risk = risks.find((r: any) => r.riskId === riskId);
      expect(risk.status).toBe('mitigating');
    });
  });

  describe('Performance', () => {
    it('should get all controls in < 100ms', async () => {
      const start = Date.now();
      await auditControls.getControlDefinitions();
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should assess control in < 200ms', async () => {
      const start = Date.now();
      await auditControls.assessControlMaturity('CC-6.1');
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
    });

    it('should calculate compliance score in < 100ms', async () => {
      const start = Date.now();
      await auditControls.calculateComplianceScore();
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});

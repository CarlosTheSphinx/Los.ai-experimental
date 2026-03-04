import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as auditReportGenerator from '../auditReportGenerator';
import db from '../../db';
import { setupTestDb, teardownTestDb } from '../../__tests__/fixtures/database';
import { v4 as uuidv4 } from 'uuid';

describe('Audit Report Generator', () => {
  let testAuditRun: any;

  beforeAll(async () => {
    await setupTestDb();

    // Create a test audit run
    testAuditRun = {
      id: uuidv4(),
      startedAt: new Date(Date.now() - 86400000), // 1 day ago
      completedAt: new Date(),
      overallResult: 'compliant',
      controlResults: JSON.stringify({
        'CC-6.1': 'compliant',
        'CC-6.2': 'compliant',
        'CC-7.1': 'compliant',
        'CC-7.2': 'compliant',
        'C-1.1': 'compliant',
        'C-1.2': 'partially_compliant',
      }),
      findings: 'CC-7.3: Log retention needs review; C-1.2: TLS configuration needs verification',
      recommendations: 'Increase log retention to 7 years; Update TLS to 1.2+',
    };

    await db('auditRuns').insert(testAuditRun);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('generateExecutiveSummary', () => {
    it('should generate summary with audit date', async () => {
      const summary = await auditReportGenerator.generateExecutiveSummary(testAuditRun);
      expect(summary).toContain('Executive Summary');
      expect(summary).toContain('Audit Date');
    });

    it('should include compliance percentage', async () => {
      const summary = await auditReportGenerator.generateExecutiveSummary(testAuditRun);
      expect(summary).toContain('Compliance Score');
    });

    it('should show overall result', async () => {
      const summary = await auditReportGenerator.generateExecutiveSummary(testAuditRun);
      expect(summary).toContain(testAuditRun.overallResult.toUpperCase());
    });

    it('should include key findings', async () => {
      const summary = await auditReportGenerator.generateExecutiveSummary(testAuditRun);
      expect(summary).toContain('Key Findings');
    });

    it('should include recommendations summary', async () => {
      const summary = await auditReportGenerator.generateExecutiveSummary(testAuditRun);
      expect(summary).toContain('Recommendations');
    });
  });

  describe('generateControlsMatrix', () => {
    it('should generate matrix with control data', async () => {
      const matrix = await auditReportGenerator.generateControlsMatrix(testAuditRun);
      expect(matrix).toContain('Controls Assessment Matrix');
      expect(matrix).toContain('Control ID');
      expect(matrix).toContain('Status');
    });

    it('should include control ID in matrix', async () => {
      const matrix = await auditReportGenerator.generateControlsMatrix(testAuditRun);
      expect(matrix).toContain('CC-6');
    });

    it('should show compliance status', async () => {
      const matrix = await auditReportGenerator.generateControlsMatrix(testAuditRun);
      expect(matrix).toContain('compliant');
    });

    it('should include categories', async () => {
      const matrix = await auditReportGenerator.generateControlsMatrix(testAuditRun);
      expect(matrix).toContain('CC-');
    });

    it('should format as markdown table', async () => {
      const matrix = await auditReportGenerator.generateControlsMatrix(testAuditRun);
      expect(matrix).toContain('|');
      expect(matrix).toContain('---');
    });
  });

  describe('generateEvidenceReport', () => {
    it('should generate evidence report', async () => {
      const report = await auditReportGenerator.generateEvidenceReport(testAuditRun);
      expect(report).toContain('Evidence Collection Report');
    });

    it('should include control sections', async () => {
      const report = await auditReportGenerator.generateEvidenceReport(testAuditRun);
      expect(report).toContain('#');
    });

    it('should show evidence count', async () => {
      const report = await auditReportGenerator.generateEvidenceReport(testAuditRun);
      expect(report).toContain('Evidence Collected');
    });
  });

  describe('generateFindingsReport', () => {
    it('should generate findings report', async () => {
      const report = await auditReportGenerator.generateFindingsReport(testAuditRun);
      expect(report).toContain('Findings Report');
    });

    it('should include finding count', async () => {
      const report = await auditReportGenerator.generateFindingsReport(testAuditRun);
      expect(report).toContain('Findings');
    });

    it('should list individual findings', async () => {
      const report = await auditReportGenerator.generateFindingsReport(testAuditRun);
      if (testAuditRun.findings) {
        expect(report).toContain('Detailed Findings');
      }
    });

    it('should handle no findings', async () => {
      const auditWithoutFindings = { ...testAuditRun, findings: null };
      const report = await auditReportGenerator.generateFindingsReport(auditWithoutFindings);
      expect(report).toContain('Findings Report');
    });
  });

  describe('generateRiskAssessment', () => {
    it('should generate risk assessment', async () => {
      const report = await auditReportGenerator.generateRiskAssessment(testAuditRun);
      expect(report).toContain('Risk Assessment');
    });

    it('should include risk summary', async () => {
      const report = await auditReportGenerator.generateRiskAssessment(testAuditRun);
      expect(report).toContain('Risk Summary');
    });

    it('should show risk counts', async () => {
      const report = await auditReportGenerator.generateRiskAssessment(testAuditRun);
      expect(report).toContain('Total Identified Risks');
    });

    it('should include risk register table', async () => {
      const report = await auditReportGenerator.generateRiskAssessment(testAuditRun);
      expect(report).toContain('Risk ID');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations section', async () => {
      const report = await auditReportGenerator.generateRecommendations(testAuditRun);
      expect(report).toContain('Recommendations');
    });

    it('should include priority recommendations', async () => {
      const report = await auditReportGenerator.generateRecommendations(testAuditRun);
      expect(report).toContain('High Priority');
    });

    it('should show next steps', async () => {
      const report = await auditReportGenerator.generateRecommendations(testAuditRun);
      expect(report).toContain('Next Steps');
    });

    it('should list best practices', async () => {
      const report = await auditReportGenerator.generateRecommendations(testAuditRun);
      expect(report).toContain('Best Practices');
    });
  });

  describe('generateAppendix', () => {
    it('should generate appendix', async () => {
      const appendix = await auditReportGenerator.generateAppendix();
      expect(appendix).toContain('Appendix');
    });

    it('should include audit methodology', async () => {
      const appendix = await auditReportGenerator.generateAppendix();
      expect(appendix).toContain('Audit Methodology');
    });

    it('should reference policies', async () => {
      const appendix = await auditReportGenerator.generateAppendix();
      expect(appendix).toContain('SECURITY-POLICY');
    });

    it('should include definitions', async () => {
      const appendix = await auditReportGenerator.generateAppendix();
      expect(appendix).toContain('Definitions');
    });

    it('should define control states', async () => {
      const appendix = await auditReportGenerator.generateAppendix();
      expect(appendix).toContain('Compliant');
      expect(appendix).toContain('Non-Compliant');
    });
  });

  describe('generateFullAuditReport', () => {
    it('should return all report sections', async () => {
      const report = await auditReportGenerator.generateFullAuditReport(testAuditRun);
      expect(report).toHaveProperty('executiveSummary');
      expect(report).toHaveProperty('controlsMatrix');
      expect(report).toHaveProperty('evidenceReport');
      expect(report).toHaveProperty('findingsReport');
      expect(report).toHaveProperty('riskAssessment');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('appendix');
    });

    it('should have non-empty sections', async () => {
      const report = await auditReportGenerator.generateFullAuditReport(testAuditRun);
      expect(report.executiveSummary.length).toBeGreaterThan(0);
      expect(report.controlsMatrix.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should cross-reference controls in sections', async () => {
      const report = await auditReportGenerator.generateFullAuditReport(testAuditRun);
      expect(report.controlsMatrix).toContain('CC-');
      expect(report.findingsReport).toBeDefined();
    });
  });

  describe('generateReportAsMarkdown', () => {
    it('should generate markdown report', async () => {
      const markdown = await auditReportGenerator.generateReportAsMarkdown(testAuditRun);
      expect(markdown).toContain('# SOC 2 Type II Compliance Audit Report');
    });

    it('should include all sections', async () => {
      const markdown = await auditReportGenerator.generateReportAsMarkdown(testAuditRun);
      expect(markdown).toContain('Executive Summary');
      expect(markdown).toContain('Controls Assessment Matrix');
      expect(markdown).toContain('Findings Report');
    });

    it('should have markdown formatting', async () => {
      const markdown = await auditReportGenerator.generateReportAsMarkdown(testAuditRun);
      expect(markdown).toContain('#');
      expect(markdown).toContain('**');
    });

    it('should include audit metadata', async () => {
      const markdown = await auditReportGenerator.generateReportAsMarkdown(testAuditRun);
      expect(markdown).toContain('Generated');
      expect(markdown).toContain('Audit ID');
    });

    it('should be readable as plain text', async () => {
      const markdown = await auditReportGenerator.generateReportAsMarkdown(testAuditRun);
      expect(markdown.length).toBeGreaterThan(1000);
    });
  });

  describe('generateReportAsHtml', () => {
    it('should generate HTML report', async () => {
      const html = await auditReportGenerator.generateReportAsHtml(testAuditRun);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
    });

    it('should include HTML structure', async () => {
      const html = await auditReportGenerator.generateReportAsHtml(testAuditRun);
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
    });

    it('should have styling', async () => {
      const html = await auditReportGenerator.generateReportAsHtml(testAuditRun);
      expect(html).toContain('<style>');
    });

    it('should include report title', async () => {
      const html = await auditReportGenerator.generateReportAsHtml(testAuditRun);
      expect(html).toContain('SOC 2 Audit Report');
    });

    it('should convert markdown to HTML tags', async () => {
      const html = await auditReportGenerator.generateReportAsHtml(testAuditRun);
      expect(html).toContain('<h1>');
      expect(html).toContain('<strong>');
    });
  });

  describe('Report Quality', () => {
    it('should generate comprehensive report (>5000 chars)', async () => {
      const report = await auditReportGenerator.generateReportAsMarkdown(testAuditRun);
      expect(report.length).toBeGreaterThan(5000);
    });

    it('should generate in reasonable time (<5 seconds)', async () => {
      const start = Date.now();
      await auditReportGenerator.generateFullAuditReport(testAuditRun);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
    });

    it('should include consistent formatting', async () => {
      const report = await auditReportGenerator.generateReportAsMarkdown(testAuditRun);
      const headingCount = (report.match(/^#/gm) || []).length;
      expect(headingCount).toBeGreaterThan(3);
    });
  });
});

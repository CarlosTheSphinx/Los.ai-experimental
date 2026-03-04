import { Router, Request, Response } from 'express';
import db from '../db';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { AuditLog } from '../utils/auditLogging';
import * as auditControls from '../utils/auditControls';
import * as evidenceCollector from '../utils/evidenceCollector';
import * as auditReportGenerator from '../utils/auditReportGenerator';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /api/admin/audit/run
 * Execute full compliance audit
 */
router.post('/run', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const auditId = uuidv4();
    const startTime = new Date();

    // Create audit run record
    await db('auditRuns').insert({
      id: auditId,
      startedAt: startTime,
      auditedBy: req.user!.id,
    });

    // Collect evidence
    const evidence = await evidenceCollector.collectAllEvidence();

    // Store evidence
    await evidenceCollector.storeEvidence(evidence, req.user!.id);

    // Assess each control
    const controls = await auditControls.getControlDefinitions();
    const controlResults: Record<string, string> = {};
    let compliantCount = 0;

    for (const control of controls) {
      const assessment = await auditControls.assessControlMaturity(control.controlId);
      controlResults[control.controlId] = assessment.status;

      if (assessment.status === 'compliant') {
        compliantCount++;
      }
    }

    // Determine overall result
    const totalControls = controls.length;
    const compliancePercentage = (compliantCount / totalControls) * 100;
    let overallResult: 'compliant' | 'partially_compliant' | 'non_compliant' = 'compliant';

    if (compliancePercentage < 100 && compliancePercentage >= 80) {
      overallResult = 'partially_compliant';
    } else if (compliancePercentage < 80) {
      overallResult = 'non_compliant';
    }

    // Get findings and recommendations
    const findings: string[] = [];
    const recommendations: string[] = [];

    for (const control of controls) {
      const assessment = await auditControls.assessControlMaturity(control.controlId);
      if (assessment.status !== 'compliant') {
        findings.push(`${control.controlId}: ${assessment.findings.join(', ')}`);
        recommendations.push(...assessment.recommendations);
      }
    }

    // Update audit run with results
    const completionTime = new Date();
    await db('auditRuns').where('id', auditId).update({
      completedAt: completionTime,
      overallResult,
      controlResults: JSON.stringify(controlResults),
      findings: findings.join('; '),
      recommendations: recommendations.join('; '),
    });

    // Log audit
    await AuditLog.log({
      action: 'audit.completed',
      userId: req.user!.id,
      resourceType: 'audit',
      resourceId: auditId,
      changes: {
        controlCount: totalControls,
        compliantControls: compliantCount,
        overallResult,
        compliancePercentage,
      },
    });

    res.json({
      auditRunId: auditId,
      startedAt: startTime,
      completedAt: completionTime,
      overallResult,
      compliancePercentage: Math.round(compliancePercentage * 100) / 100,
      compliantControls: compliantCount,
      totalControls,
      findings: findings.length,
      recommendations: recommendations.length,
    });
  } catch (error) {
    console.error('Error running audit:', error);
    res.status(500).json({ error: 'Failed to run audit' });
  }
});

/**
 * GET /api/admin/audit/results/:auditRunId
 * Get audit results
 */
router.get('/results/:auditRunId', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { auditRunId } = req.params;

    const auditRun = await db('auditRuns').where('id', auditRunId).first();

    if (!auditRun) {
      return res.status(404).json({ error: 'Audit run not found' });
    }

    const controlResults = typeof auditRun.controlResults === 'string'
      ? JSON.parse(auditRun.controlResults)
      : auditRun.controlResults;

    res.json({
      id: auditRun.id,
      startedAt: auditRun.startedAt,
      completedAt: auditRun.completedAt,
      overallResult: auditRun.overallResult,
      controlResults,
      findings: auditRun.findings ? auditRun.findings.split(';').map((f: string) => f.trim()) : [],
      recommendations: auditRun.recommendations ? auditRun.recommendations.split(';').map((r: string) => r.trim()) : [],
    });
  } catch (error) {
    console.error('Error getting audit results:', error);
    res.status(500).json({ error: 'Failed to get audit results' });
  }
});

/**
 * GET /api/admin/audit/controls
 * List all controls with compliance status
 */
router.get('/controls', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const controls = await auditControls.getControlDefinitions();
    const controlsWithStatus = [];

    for (const control of controls) {
      const assessment = await auditControls.assessControlMaturity(control.controlId);
      const evidence = await auditControls.getControlEvidence(control.controlId);

      controlsWithStatus.push({
        controlId: control.controlId,
        name: control.name,
        category: control.category,
        description: control.description,
        requirement: auditControls.mapControlToRequirement(control.controlId),
        status: assessment.status,
        evidenceCount: evidence.length,
        lastEvidenceDate: assessment.lastEvidenceDate,
        findings: assessment.findings,
        recommendations: assessment.recommendations,
      });
    }

    res.json(controlsWithStatus);
  } catch (error) {
    console.error('Error listing controls:', error);
    res.status(500).json({ error: 'Failed to list controls' });
  }
});

/**
 * GET /api/admin/audit/evidence/:controlId
 * Get evidence for specific control
 */
router.get('/evidence/:controlId', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { controlId } = req.params;

    const evidence = await auditControls.getControlEvidence(controlId);
    const control = await db('auditControls').where('controlId', controlId).first();

    if (!control) {
      return res.status(404).json({ error: 'Control not found' });
    }

    const evidenceWithParsing = evidence.map((e: any) => ({
      id: e.id,
      controlId: e.controlId,
      type: e.evidenceType,
      evidence: typeof e.evidence === 'string' ? JSON.parse(e.evidence) : e.evidence,
      timestamp: e.timestamp,
      notes: e.notes,
      collectedBy: e.collectedBy,
    }));

    res.json({
      controlId,
      controlName: control.name,
      requirement: auditControls.mapControlToRequirement(controlId),
      evidenceCount: evidence.length,
      evidence: evidenceWithParsing,
    });
  } catch (error) {
    console.error('Error getting control evidence:', error);
    res.status(500).json({ error: 'Failed to get control evidence' });
  }
});

/**
 * POST /api/admin/audit/report/generate
 * Generate audit report
 */
router.post('/report/generate', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { auditRunId } = req.body;

    if (!auditRunId) {
      return res.status(400).json({ error: 'auditRunId required' });
    }

    const auditRun = await db('auditRuns').where('id', auditRunId).first();

    if (!auditRun) {
      return res.status(404).json({ error: 'Audit run not found' });
    }

    // Generate report
    const report = await auditReportGenerator.generateFullAuditReport(auditRun);

    // Log report generation
    await AuditLog.log({
      action: 'audit.report_generated',
      userId: req.user!.id,
      resourceType: 'audit',
      resourceId: auditRunId,
    });

    res.json({
      reportId: uuidv4(),
      auditRunId,
      generatedAt: new Date(),
      format: 'markdown',
      reportSections: Object.keys(report),
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /api/admin/audit/dashboard
 * Get compliance dashboard data
 */
router.get('/dashboard', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const summary = await auditControls.getComplianceSummary();
    const byCriteria = await auditControls.getControlsByCriteria();
    const risks = await auditControls.getRiskRegister();

    // Get recent audit
    const recentAudit = await db('auditRuns')
      .orderBy('completedAt', 'desc')
      .first();

    res.json({
      summary: {
        totalControls: summary.total_controls,
        compliantControls: summary.compliant_controls,
        compliancePercentage: summary.compliance_percentage,
      },
      byCriteria,
      riskSummary: {
        totalRisks: risks.length,
        criticalRisks: risks.filter((r: any) => r.likelihood === 'critical' && r.impact === 'critical').length,
        mitigatedRisks: risks.filter((r: any) => r.status === 'mitigated').length,
      },
      recentAudit: recentAudit ? {
        id: recentAudit.id,
        completedAt: recentAudit.completedAt,
        overallResult: recentAudit.overallResult,
      } : null,
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

/**
 * GET /api/admin/audit/trends
 * Get historical compliance trends
 */
router.get('/trends', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const audits = await db('auditRuns')
      .orderBy('completedAt', 'asc')
      .select();

    const trends = audits.map((audit: any) => {
      const controlResults = typeof audit.controlResults === 'string'
        ? JSON.parse(audit.controlResults)
        : audit.controlResults || {};

      const compliantCount = Object.values(controlResults).filter((v: any) => v === 'compliant').length;
      const totalControls = Object.keys(controlResults).length || 1;

      return {
        date: audit.completedAt,
        compliancePercentage: totalControls > 0 ? (compliantCount / totalControls) * 100 : 0,
        result: audit.overallResult,
      };
    });

    res.json(trends);
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

/**
 * GET /api/admin/audit/history
 * Get audit history
 */
router.get('/history', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    const audits = await db('auditRuns')
      .orderBy('completedAt', 'desc')
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string))
      .select();

    const total = await db('auditRuns').count('* as count').first();

    res.json({
      total: total?.count || 0,
      audits: audits.map((a: any) => ({
        id: a.id,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        result: a.overallResult,
        auditedBy: a.auditedBy,
      })),
    });
  } catch (error) {
    console.error('Error getting audit history:', error);
    res.status(500).json({ error: 'Failed to get audit history' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import db from '../db';
import * as auditControls from '../utils/auditControls';

const router = Router();

/**
 * GET /api/compliance/overview
 * Get overall compliance percentage and summary
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const summary = await auditControls.getComplianceSummary();

    res.json({
      compliance_percentage: summary.compliance_percentage || 0,
      total_controls: summary.total_controls || 0,
      compliant_controls: summary.compliant_controls || 0,
      non_compliant_controls: (summary.total_controls || 0) - (summary.compliant_controls || 0),
      status: (summary.compliance_percentage || 0) >= 95
        ? 'excellent'
        : (summary.compliance_percentage || 0) >= 80
          ? 'good'
          : (summary.compliance_percentage || 0) >= 60
            ? 'fair'
            : 'poor',
      lastAudit: new Date(),
    });
  } catch (error) {
    console.error('Error getting compliance overview:', error);
    res.status(500).json({ error: 'Failed to get compliance overview' });
  }
});

/**
 * GET /api/compliance/by-criteria
 * Get compliance breakdown by SOC 2 criteria
 */
router.get('/by-criteria', async (req: Request, res: Response) => {
  try {
    const criteria = await auditControls.getControlsByCriteria();

    // Get status for each criteria
    const criteriaWithStatus = [];

    for (const item of criteria) {
      const controls = await auditControls.getControlsByCategory(item.category);
      let compliantCount = 0;

      for (const control of controls) {
        const assessment = await auditControls.assessControlMaturity(control.controlId);
        if (assessment.status === 'compliant') {
          compliantCount++;
        }
      }

      criteriaWithStatus.push({
        category: item.category,
        criteria: getCriteriaName(item.category),
        description: getCriteriaDescription(item.category),
        totalControls: controls.length,
        compliantControls: compliantCount,
        percentage: controls.length > 0 ? Math.round((compliantCount / controls.length) * 100) : 0,
      });
    }

    res.json(criteriaWithStatus.sort((a, b) => b.percentage - a.percentage));
  } catch (error) {
    console.error('Error getting compliance by criteria:', error);
    res.status(500).json({ error: 'Failed to get compliance by criteria' });
  }
});

/**
 * GET /api/compliance/controls
 * Get status of all controls
 */
router.get('/controls', async (req: Request, res: Response) => {
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
        status: assessment.status,
        statusIcon: assessment.status === 'compliant' ? '✓' : assessment.status === 'partially_compliant' ? '◐' : '✗',
        evidenceCount: evidence.length,
        lastEvidenceDate: assessment.lastEvidenceDate,
      });
    }

    res.json(controlsWithStatus);
  } catch (error) {
    console.error('Error getting controls:', error);
    res.status(500).json({ error: 'Failed to get controls' });
  }
});

/**
 * GET /api/compliance/risks
 * Get current risk register
 */
router.get('/risks', async (req: Request, res: Response) => {
  try {
    const risks = await auditControls.getRiskRegister();

    const riskSummary = {
      total: risks.length,
      bySeverity: {
        critical: risks.filter((r: any) => (r.likelihood === 'critical' || r.impact === 'critical')).length,
        high: risks.filter((r: any) => (r.likelihood === 'high' || r.impact === 'high') && r.likelihood !== 'critical' && r.impact !== 'critical').length,
        medium: risks.filter((r: any) => r.likelihood === 'medium' || r.impact === 'medium').length,
        low: risks.filter((r: any) => r.likelihood === 'low' && r.impact === 'low').length,
      },
      byStatus: {
        identified: risks.filter((r: any) => r.status === 'identified').length,
        mitigating: risks.filter((r: any) => r.status === 'mitigating').length,
        mitigated: risks.filter((r: any) => r.status === 'mitigated').length,
        accepted: risks.filter((r: any) => r.status === 'accepted').length,
      },
      risks: risks
        .sort((a: any, b: any) => {
          const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
          return (severityOrder[b.likelihood] || 0) - (severityOrder[a.likelihood] || 0);
        })
        .map((r: any) => ({
          riskId: r.riskId,
          description: r.description,
          category: r.category,
          likelihood: r.likelihood,
          impact: r.impact,
          severity: getSeverity(r.likelihood, r.impact),
          status: r.status,
          mitigation: r.mitigation,
          targetDate: r.targetDate,
        })),
    };

    res.json(riskSummary);
  } catch (error) {
    console.error('Error getting risks:', error);
    res.status(500).json({ error: 'Failed to get risks' });
  }
});

/**
 * GET /api/compliance/evidence/:controlId
 * Get evidence for specific control
 */
router.get('/evidence/:controlId', async (req: Request, res: Response) => {
  try {
    const { controlId } = req.params;

    const control = await db('auditControls').where('controlId', controlId).first();

    if (!control) {
      return res.status(404).json({ error: 'Control not found' });
    }

    const evidence = await auditControls.getControlEvidence(controlId);
    const assessment = await auditControls.assessControlMaturity(controlId);

    const evidenceData = evidence.map((e: any) => ({
      id: e.id,
      type: e.evidenceType,
      timestamp: e.timestamp,
      notes: e.notes,
      collectedBy: e.collectedBy,
    }));

    res.json({
      controlId,
      controlName: control.name,
      category: control.category,
      status: assessment.status,
      requirement: auditControls.mapControlToRequirement(controlId),
      evidenceCount: evidence.length,
      lastEvidenceDate: assessment.lastEvidenceDate,
      evidence: evidenceData,
      recommendations: assessment.recommendations,
    });
  } catch (error) {
    console.error('Error getting evidence:', error);
    res.status(500).json({ error: 'Failed to get evidence' });
  }
});

/**
 * GET /api/compliance/trends
 * Get compliance trends over time
 */
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string);

    const audits = await db('auditRuns')
      .where('completedAt', '>', db.raw(`NOW() - INTERVAL '${daysNum} days'`))
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
        compliancePercentage: totalControls > 0 ? Math.round((compliantCount / totalControls) * 100) : 0,
        compliantControls: compliantCount,
        totalControls,
        result: audit.overallResult,
      };
    });

    res.json({
      period: `${daysNum} days`,
      trends,
      summary: {
        earliest: trends.length > 0 ? trends[0].compliancePercentage : null,
        latest: trends.length > 0 ? trends[trends.length - 1].compliancePercentage : null,
        highest: trends.length > 0 ? Math.max(...trends.map((t: any) => t.compliancePercentage)) : null,
        lowest: trends.length > 0 ? Math.min(...trends.map((t: any) => t.compliancePercentage)) : null,
      },
    });
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

/**
 * GET /api/compliance/status
 * Get current compliance status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const summary = await auditControls.getComplianceSummary();
    const risks = await auditControls.getRiskRegister();
    const criticalRisks = risks.filter((r: any) => (r.likelihood === 'critical' || r.impact === 'critical') && r.status !== 'mitigated');

    const status = {
      isCompliant: (summary.compliance_percentage || 0) >= 95 && criticalRisks.length === 0,
      compliancePercentage: summary.compliance_percentage || 0,
      compliantControls: summary.compliant_controls || 0,
      totalControls: summary.total_controls || 0,
      criticalIssues: criticalRisks.length,
      lastUpdated: new Date(),
    };

    res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * GET /api/compliance/summary
 * Get comprehensive compliance summary
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const overview = await auditControls.getComplianceSummary();
    const criteria = await auditControls.getControlsByCriteria();
    const risks = await auditControls.getRiskRegister();

    res.json({
      overview: {
        compliance_percentage: overview.compliance_percentage || 0,
        total_controls: overview.total_controls || 0,
        compliant_controls: overview.compliant_controls || 0,
      },
      criteria: criteria,
      riskSummary: {
        total: risks.length,
        critical: risks.filter((r: any) => r.likelihood === 'critical' || r.impact === 'critical').length,
        mitigated: risks.filter((r: any) => r.status === 'mitigated').length,
      },
      metadata: {
        lastUpdated: new Date(),
        auditType: 'SOC 2 Type II',
      },
    });
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

// Helper functions
function getCriteriaName(category: string): string {
  const names: Record<string, string> = {
    'CC-6': 'Logical and Physical Access Controls',
    'CC-7': 'System Monitoring',
    'CC-8': 'Change Management',
    'CC-9': 'Risk Mitigation',
    'C-1': 'Confidentiality',
    'A-1': 'Availability',
  };
  return names[category] || category;
}

function getCriteriaDescription(category: string): string {
  const descriptions: Record<string, string> = {
    'CC-6': 'Authorization and authentication of users and systems',
    'CC-7': 'Logging, monitoring, and incident response',
    'CC-8': 'Change authorization and testing',
    'CC-9': 'Backup, recovery, and disaster preparedness',
    'C-1': 'Encryption and protection of sensitive data',
    'A-1': 'System availability and infrastructure resilience',
  };
  return descriptions[category] || '';
}

function getSeverity(likelihood: string, impact: string): string {
  const severityMap: Record<string, Record<string, string>> = {
    critical: { critical: 'CRITICAL', high: 'CRITICAL', medium: 'HIGH', low: 'MEDIUM' },
    high: { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'MEDIUM' },
    medium: { critical: 'HIGH', high: 'MEDIUM', medium: 'MEDIUM', low: 'LOW' },
    low: { critical: 'MEDIUM', high: 'LOW', medium: 'LOW', low: 'LOW' },
  };
  return (severityMap[likelihood] || {})[impact] || 'UNKNOWN';
}

export default router;

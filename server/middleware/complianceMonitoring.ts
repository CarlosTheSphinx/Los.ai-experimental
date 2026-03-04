import { Request, Response, NextFunction } from 'express';
import db from '../db';
import { AuditLog } from './auditLogging';

interface ComplianceMetrics {
  controlId: string;
  passed: number;
  failed: number;
  totalChecks: number;
  passRate: number;
  lastChecked: Date;
}

/**
 * Middleware to capture evidence during request processing
 */
export function captureControlEvidence(req: Request, res: Response, next: NextFunction) {
  // Capture request details for evidence
  const originalSend = res.send;

  res.send = function (data: any) {
    const statusCode = res.statusCode;

    // Log based on operation type
    if (req.method === 'POST' && statusCode < 300) {
      captureCreationEvidence(req, statusCode);
    } else if (req.method === 'DELETE' && statusCode < 300) {
      captureDeletionEvidence(req, statusCode);
    } else if (statusCode === 401 || statusCode === 403) {
      captureSecurityEvent(req, statusCode);
    }

    res.send = originalSend;
    return res.send(data);
  };

  next();
}

/**
 * Track compliance metrics for controls
 */
export async function trackComplianceMetrics(controlId: string): Promise<ComplianceMetrics> {
  try {
    const results = await db('complianceCheckResults')
      .where('controlId', controlId)
      .select();

    const passed = results.filter(r => r.result === 'pass').length;
    const failed = results.filter(r => r.result === 'fail').length;
    const totalChecks = results.length;
    const passRate = totalChecks > 0 ? (passed / totalChecks) * 100 : 0;

    const lastChecked = results.length > 0
      ? new Date(Math.max(...results.map((r: any) => r.timestamp.getTime())))
      : new Date();

    return {
      controlId,
      passed,
      failed,
      totalChecks,
      passRate,
      lastChecked,
    };
  } catch (error) {
    console.error('Error tracking compliance metrics:', error);
    throw new Error('Failed to track compliance metrics');
  }
}

/**
 * Detect compliance violations
 */
export async function detectComplianceViolations(): Promise<any[]> {
  try {
    const violations: any[] = [];

    // Check for unencrypted PII
    const unencryptedPii = await db.raw(`
      SELECT COUNT(*) as count FROM users
      WHERE ssn IS NOT NULL AND ssn NOT LIKE 'enc:%'
    `);

    if (unencryptedPii.rows[0].count > 0) {
      violations.push({
        controlId: 'C-1.1',
        type: 'unencrypted_pii',
        severity: 'critical',
        message: `Found ${unencryptedPii.rows[0].count} unencrypted PII fields`,
        timestamp: new Date(),
      });
    }

    // Check for missing audit logs
    const recentActions = await db('users').where('updated_at', '>', db.raw("NOW() - INTERVAL '1 hour'")).count('* as count');
    const recentLogs = await db('auditLogs').where('created_at', '>', db.raw("NOW() - INTERVAL '1 hour'")).count('* as count');

    if (recentLogs[0].count === 0 && recentActions[0].count > 0) {
      violations.push({
        controlId: 'CC-7.1',
        type: 'missing_audit_logs',
        severity: 'high',
        message: 'Actions detected but no corresponding audit logs found',
        timestamp: new Date(),
      });
    }

    // Check for disabled authentication
    const disabledAccounts = await db('users').where('disabled', true).count('* as count');
    if (disabledAccounts[0].count > 0) {
      // This is fine - disabled accounts are expected
    }

    // Check for expired API keys still in use
    const expiredKeys = await db('apiKeys')
      .where('expiresAt', '<', new Date())
      .where('revokedAt', null)
      .count('* as count');

    if (expiredKeys[0].count > 0) {
      violations.push({
        controlId: 'CC-6.5',
        type: 'expired_api_keys',
        severity: 'high',
        message: `Found ${expiredKeys[0].count} expired but active API keys`,
        timestamp: new Date(),
      });
    }

    // Check for failed backup tests
    const recentFailedBackups = await db('auditLogs')
      .where('action', 'backup.restore_failed')
      .where('created_at', '>', db.raw("NOW() - INTERVAL '30 days'"))
      .count('* as count');

    if (recentFailedBackups[0].count > 0) {
      violations.push({
        controlId: 'CC-9.1',
        type: 'backup_failure',
        severity: 'high',
        message: `${recentFailedBackups[0].count} backup restore failures in last 30 days`,
        timestamp: new Date(),
      });
    }

    return violations;
  } catch (error) {
    console.error('Error detecting compliance violations:', error);
    throw new Error('Failed to detect compliance violations');
  }
}

/**
 * Alert on compliance issues
 */
export async function alertOnComplianceIssues(): Promise<void> {
  try {
    const violations = await detectComplianceViolations();

    for (const violation of violations) {
      // Log violation
      await AuditLog.log({
        action: 'compliance.violation_detected',
        resourceType: 'control',
        resourceId: violation.controlId,
        changes: {
          violationType: violation.type,
          severity: violation.severity,
          message: violation.message,
        },
      });

      // In production, send alert to compliance team
      if (violation.severity === 'critical') {
        console.error(`CRITICAL COMPLIANCE VIOLATION: ${violation.message}`);
        // sendAlert(violation);
      }
    }
  } catch (error) {
    console.error('Error alerting on compliance issues:', error);
  }
}

/**
 * Capture evidence for resource creation
 */
async function captureCreationEvidence(req: Request, statusCode: number): Promise<void> {
  try {
    const resourceType = req.path.split('/')[3];
    const action = `${resourceType}.created`;

    await AuditLog.log({
      action,
      userId: req.user?.id,
      resourceType,
      changes: req.body,
    });
  } catch (error) {
    console.error('Error capturing creation evidence:', error);
  }
}

/**
 * Capture evidence for resource deletion
 */
async function captureDeletionEvidence(req: Request, statusCode: number): Promise<void> {
  try {
    const resourceType = req.path.split('/')[3];
    const resourceId = req.path.split('/')[4];
    const action = `${resourceType}.deleted`;

    await AuditLog.log({
      action,
      userId: req.user?.id,
      resourceType,
      resourceId,
      changes: { deletedAt: new Date() },
    });
  } catch (error) {
    console.error('Error capturing deletion evidence:', error);
  }
}

/**
 * Capture security events (authentication failures, unauthorized access)
 */
async function captureSecurityEvent(req: Request, statusCode: number): Promise<void> {
  try {
    const action = statusCode === 401 ? 'auth.access_denied' : 'permission.denied';

    await AuditLog.log({
      action,
      userId: req.user?.id,
      resourceType: 'security_event',
      changes: {
        path: req.path,
        method: req.method,
        statusCode,
        ip: req.ip,
      },
    });
  } catch (error) {
    console.error('Error capturing security event:', error);
  }
}

/**
 * Middleware to enable compliance monitoring
 */
export function enableComplianceMonitoring() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run periodic violation checks
    if (Math.random() < 0.01) { // 1% of requests trigger check
      alertOnComplianceIssues().catch(console.error);
    }

    next();
  };
}

/**
 * Get compliance metrics for all major controls
 */
export async function getComplianceMetricsReport(): Promise<ComplianceMetrics[]> {
  try {
    const controls = await db('auditControls').select('controlId');
    const metrics: ComplianceMetrics[] = [];

    for (const control of controls) {
      const metric = await trackComplianceMetrics(control.controlId);
      metrics.push(metric);
    }

    return metrics;
  } catch (error) {
    console.error('Error getting compliance metrics report:', error);
    throw new Error('Failed to get compliance metrics report');
  }
}

/**
 * Check if system is in compliance
 */
export async function isSystemCompliant(): Promise<boolean> {
  try {
    const violations = await detectComplianceViolations();
    const criticalViolations = violations.filter(v => v.severity === 'critical');

    return criticalViolations.length === 0;
  } catch (error) {
    console.error('Error checking system compliance:', error);
    return false;
  }
}

/**
 * Get compliance status summary
 */
export async function getComplianceStatus(): Promise<{
  isCompliant: boolean;
  violationCount: number;
  criticalViolations: number;
  violations: any[];
}> {
  try {
    const violations = await detectComplianceViolations();
    const criticalViolations = violations.filter(v => v.severity === 'critical').length;

    return {
      isCompliant: criticalViolations === 0,
      violationCount: violations.length,
      criticalViolations,
      violations,
    };
  } catch (error) {
    console.error('Error getting compliance status:', error);
    throw new Error('Failed to get compliance status');
  }
}

/**
 * Export compliance metrics to JSON
 */
export async function exportComplianceMetrics(): Promise<any> {
  try {
    const metrics = await getComplianceMetricsReport();
    const violations = await detectComplianceViolations();
    const status = await getComplianceStatus();

    return {
      timestamp: new Date(),
      status,
      metrics,
      violations,
      summary: {
        totalControls: metrics.length,
        compliantControls: metrics.filter(m => m.passRate === 100).length,
        compliancePercentage: metrics.length > 0
          ? (metrics.filter(m => m.passRate === 100).length / metrics.length) * 100
          : 0,
      },
    };
  } catch (error) {
    console.error('Error exporting compliance metrics:', error);
    throw new Error('Failed to export compliance metrics');
  }
}

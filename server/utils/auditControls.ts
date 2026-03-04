import db from '../db';
import { AuditLog } from './auditLogging';

interface Control {
  controlId: string;
  name: string;
  category: string;
  description: string;
  requirement?: string;
  testProcedure?: string;
  frequency?: string;
}

interface ControlAssessment {
  controlId: string;
  status: 'compliant' | 'partially_compliant' | 'non_compliant';
  evidenceCount: number;
  lastEvidenceDate?: Date;
  findings: string[];
  recommendations: string[];
}

interface RiskRegisterEntry {
  riskId: string;
  description: string;
  category: 'technical' | 'operational' | 'compliance' | 'organizational';
  likelihood: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high' | 'critical';
  status: 'identified' | 'mitigating' | 'mitigated' | 'accepted';
  mitigation?: string;
  targetDate?: Date;
}

/**
 * Get all defined controls mapped to SOC 2 Trust Service Criteria
 */
export async function getControlDefinitions(): Promise<Control[]> {
  try {
    const controls = await db('auditControls').select();
    return controls;
  } catch (error) {
    console.error('Error fetching control definitions:', error);
    throw new Error('Failed to fetch control definitions');
  }
}

/**
 * Get controls by SOC 2 category
 */
export async function getControlsByCategory(category: string): Promise<Control[]> {
  try {
    const controls = await db('auditControls').where('category', category).select();
    return controls;
  } catch (error) {
    console.error('Error fetching controls by category:', error);
    throw new Error('Failed to fetch controls by category');
  }
}

/**
 * Map control to specific SOC 2 requirement
 */
export function mapControlToRequirement(controlId: string): string {
  const mappings: Record<string, string> = {
    'CC-6.1': 'Restrict system access to authorized users, processes, and devices. Authentication ensures only valid credentials grant access.',
    'CC-6.2': 'Grant access based on predefined roles and responsibilities. RBAC ensures least privilege access.',
    'CC-6.3': 'Passwords meet complexity requirements and expire periodically. Regular password changes reduce risk of compromise.',
    'CC-6.4': 'Multi-factor authentication required for sensitive operations. MFA prevents unauthorized access even with compromised credentials.',
    'CC-6.5': 'API keys generated securely, rotated regularly, and revoked when no longer needed.',
    'CC-6.6': 'User sessions timeout after inactivity and are properly invalidated on logout.',
    'CC-7.1': 'System activity logged with timestamps, user identification, action performed, and result. Audit trails enable investigation of incidents.',
    'CC-7.2': 'Audit logs cannot be modified or deleted. Log immutability ensures evidence integrity for forensic analysis.',
    'CC-7.3': 'Logs retained for 7+ years to support compliance investigations and incident forensics.',
    'CC-7.4': 'System monitoring detects anomalies, performance issues, and suspicious patterns. Alerts notify administrators of issues.',
    'CC-7.5': 'Security incidents are detected, investigated, documented, and resolved according to established procedures.',
    'CC-8.1': 'Changes to systems are authorized before implementation. Change control prevents unauthorized modifications.',
    'CC-8.2': 'Changes are tested in non-production environments before deployment. Testing reduces risk of introducing defects.',
    'CC-8.3': 'Changes documented with justification, approval, implementation date, and rollback procedures.',
    'CC-9.1': 'Regular backups created and recovery tested. Backups ensure business continuity.',
    'CC-9.2': 'Disaster recovery plan exists with documented RTO/RPO and regular testing.',
    'A-1.1': 'Systems operate with availability meeting customer expectations. Availability monitored continuously.',
    'A-1.2': 'Infrastructure redundant and fault-tolerant. Failures do not cause service outages.',
    'C-1.1': 'Sensitive data encrypted at rest using approved cryptographic algorithms. Encryption keys managed securely.',
    'C-1.2': 'Data in transit encrypted using TLS 1.2 or higher. Encryption prevents eavesdropping.',
    'C-1.3': 'Data classified by sensitivity. Handling procedures match classification.',
    'C-1.4': 'Personal information identified and protected according to data privacy regulations.',
  };
  return mappings[controlId] || 'Control requirement not defined';
}

/**
 * Get evidence collected for a control
 */
export async function getControlEvidence(controlId: string): Promise<any[]> {
  try {
    const evidence = await db('auditEvidence')
      .where('controlId', controlId)
      .orderBy('timestamp', 'desc')
      .select();
    return evidence;
  } catch (error) {
    console.error('Error fetching control evidence:', error);
    throw new Error('Failed to fetch control evidence');
  }
}

/**
 * Assess control compliance status
 */
export async function assessControlMaturity(controlId: string): Promise<ControlAssessment> {
  try {
    const evidence = await getControlEvidence(controlId);

    let status: 'compliant' | 'partially_compliant' | 'non_compliant' = 'non_compliant';
    const findings: string[] = [];
    const recommendations: string[] = [];

    // Determine compliance status based on evidence
    if (evidence.length === 0) {
      status = 'non_compliant';
      findings.push('No evidence of control implementation');
      recommendations.push('Collect evidence or implement control');
    } else {
      const passCount = evidence.filter(e => e.evidence?.result === 'pass').length;
      const failCount = evidence.filter(e => e.evidence?.result === 'fail').length;

      if (failCount === 0 && passCount > 0) {
        status = 'compliant';
      } else if (failCount > 0 && passCount > 0) {
        status = 'partially_compliant';
        findings.push(`${failCount} evidence items failed compliance check`);
        recommendations.push('Address failed evidence items and re-test');
      } else if (failCount > 0) {
        status = 'non_compliant';
        findings.push(`${failCount} evidence items failed compliance check`);
        recommendations.push('Implement remediation and re-test');
      }

      // Check evidence timeliness
      const lastEvidence = evidence[0];
      const daysSinceEvidence = Math.floor((Date.now() - lastEvidence.timestamp.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceEvidence > 90) {
        recommendations.push('Refresh evidence - last evidence is > 90 days old');
      }
    }

    return {
      controlId,
      status,
      evidenceCount: evidence.length,
      lastEvidenceDate: evidence.length > 0 ? evidence[0].timestamp : undefined,
      findings,
      recommendations,
    };
  } catch (error) {
    console.error('Error assessing control maturity:', error);
    throw new Error('Failed to assess control maturity');
  }
}

/**
 * Add evidence for a control
 */
export async function addControlEvidence(
  controlId: string,
  evidenceType: 'test_result' | 'log_entry' | 'config' | 'procedure' | 'manual_observation',
  evidence: any,
  notes?: string,
  userId?: string
): Promise<any> {
  try {
    const result = await db('auditEvidence').insert({
      controlId,
      evidenceType,
      evidence: JSON.stringify(evidence),
      timestamp: new Date(),
      collectedBy: userId,
      notes,
    });

    await AuditLog.log({
      action: 'compliance.evidence_collected',
      userId,
      resourceType: 'control',
      resourceId: controlId,
      changes: { evidenceType, evidenceDate: new Date() },
    });

    return result;
  } catch (error) {
    console.error('Error adding control evidence:', error);
    throw new Error('Failed to add control evidence');
  }
}

/**
 * Get compliance summary
 */
export async function getComplianceSummary(): Promise<any> {
  try {
    const result = await db.raw(`
      SELECT
        COUNT(DISTINCT controlId) as total_controls,
        COUNT(DISTINCT CASE WHEN status = 'compliant' THEN controlId END) as compliant_controls,
        ROUND(100 * COUNT(DISTINCT CASE WHEN status = 'compliant' THEN controlId END)::numeric /
              COUNT(DISTINCT controlId), 2) as compliance_percentage
      FROM (
        SELECT DISTINCT ON (ac.controlId) ac.controlId, acr.result as status
        FROM auditControls ac
        LEFT JOIN complianceCheckResults acr ON ac.controlId = acr.controlId
        ORDER BY ac.controlId, acr.timestamp DESC
      ) subq
    `);

    return result.rows[0] || { total_controls: 0, compliant_controls: 0, compliance_percentage: 0 };
  } catch (error) {
    console.error('Error getting compliance summary:', error);
    throw new Error('Failed to get compliance summary');
  }
}

/**
 * Get controls by criteria
 */
export async function getControlsByCriteria(): Promise<any> {
  try {
    const result = await db('auditControls')
      .select('category')
      .count('* as control_count')
      .groupBy('category')
      .orderBy('category');

    return result;
  } catch (error) {
    console.error('Error getting controls by criteria:', error);
    throw new Error('Failed to get controls by criteria');
  }
}

/**
 * Get risk register
 */
export async function getRiskRegister(): Promise<RiskRegisterEntry[]> {
  try {
    const risks = await db('riskRegister')
      .select()
      .orderBy('likelihood', 'desc')
      .orderBy('impact', 'desc');
    return risks;
  } catch (error) {
    console.error('Error fetching risk register:', error);
    throw new Error('Failed to fetch risk register');
  }
}

/**
 * Add risk to register
 */
export async function addRisk(
  riskId: string,
  description: string,
  category: 'technical' | 'operational' | 'compliance' | 'organizational',
  likelihood: 'low' | 'medium' | 'high' | 'critical',
  impact: 'low' | 'medium' | 'high' | 'critical',
  mitigation?: string,
  ownerId?: string
): Promise<any> {
  try {
    const result = await db('riskRegister').insert({
      riskId,
      description,
      category,
      likelihood,
      impact,
      status: 'identified',
      mitigation,
      owner: ownerId,
    });

    await AuditLog.log({
      action: 'compliance.risk_identified',
      userId: ownerId,
      resourceType: 'risk',
      resourceId: riskId,
      changes: { riskCategory: category, likelihood, impact },
    });

    return result;
  } catch (error) {
    console.error('Error adding risk:', error);
    throw new Error('Failed to add risk');
  }
}

/**
 * Update risk status
 */
export async function updateRiskStatus(
  riskId: string,
  status: 'identified' | 'mitigating' | 'mitigated' | 'accepted',
  mitigation?: string
): Promise<any> {
  try {
    const updateData: any = { status };
    if (mitigation) updateData.mitigation = mitigation;

    const result = await db('riskRegister').where('riskId', riskId).update(updateData);

    await AuditLog.log({
      action: 'compliance.risk_updated',
      resourceType: 'risk',
      resourceId: riskId,
      changes: { newStatus: status, mitigation },
    });

    return result;
  } catch (error) {
    console.error('Error updating risk status:', error);
    throw new Error('Failed to update risk status');
  }
}

/**
 * Calculate compliance score
 */
export async function calculateComplianceScore(): Promise<number> {
  try {
    const summary = await getComplianceSummary();
    return summary.compliance_percentage || 0;
  } catch (error) {
    console.error('Error calculating compliance score:', error);
    throw new Error('Failed to calculate compliance score');
  }
}

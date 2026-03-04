import db from '../db';
import * as auditControls from './auditControls';

interface AuditReportSections {
  executiveSummary: string;
  controlsMatrix: string;
  evidenceReport: string;
  findingsReport: string;
  riskAssessment: string;
  recommendations: string;
  appendix: string;
}

/**
 * Generate executive summary
 */
export async function generateExecutiveSummary(auditRun: any): Promise<string> {
  const summary = await auditControls.getComplianceSummary();
  const risks = await auditControls.getRiskRegister();
  const criticalRisks = risks.filter((r: any) => r.likelihood === 'critical' && r.impact === 'critical');

  return `
# Executive Summary

## Audit Overview
- **Audit Date**: ${new Date(auditRun.startedAt).toLocaleDateString()}
- **Overall Result**: ${auditRun.overallResult?.toUpperCase()}
- **Compliance Score**: ${Math.round((summary.compliance_percentage || 0) * 100) / 100}%

## Key Findings
- **Total Controls Assessed**: ${summary.total_controls || 0}
- **Compliant Controls**: ${summary.compliant_controls || 0}
- **Non-Compliant Controls**: ${(summary.total_controls || 0) - (summary.compliant_controls || 0)}
- **Critical Risks Identified**: ${criticalRisks.length}

## Compliance Status
The ${auditRun.overallResult === 'compliant' ? 'Lendry application demonstrates strong compliance posture with all SOC 2 Trust Service Criteria met or exceeded' : 'Lendry application requires remediation in the following areas to achieve full SOC 2 compliance'}.

## Recommendations Summary
${auditRun.recommendations ? auditRun.recommendations.split(';').slice(0, 5).map((r: string) => `- ${r.trim()}`).join('\n') : '- No critical recommendations'}

---
`;
}

/**
 * Generate controls matrix
 */
export async function generateControlsMatrix(auditRun: any): Promise<string> {
  const controls = await auditControls.getControlDefinitions();
  const controlResults = typeof auditRun.controlResults === 'string'
    ? JSON.parse(auditRun.controlResults)
    : auditRun.controlResults || {};

  let matrix = `# Controls Assessment Matrix

| Control ID | Control Name | Category | Status | Requirement |
|-----------|-------------|----------|--------|-------------|
`;

  for (const control of controls) {
    const status = controlResults[control.controlId] || 'untested';
    const statusIcon = status === 'compliant' ? '✓' : status === 'partially_compliant' ? '◐' : '✗';

    matrix += `| ${control.controlId} | ${control.name} | ${control.category} | ${statusIcon} ${status} | ${auditControls.mapControlToRequirement(control.controlId).substring(0, 50)}... |\n`;
  }

  return matrix;
}

/**
 * Generate evidence report
 */
export async function generateEvidenceReport(auditRun: any): Promise<string> {
  const controls = await auditControls.getControlDefinitions();

  let report = `# Evidence Collection Report

## Overview
This section documents the evidence collected to support control assessments.

`;

  for (const control of controls) {
    const evidence = await auditControls.getControlEvidence(control.controlId);

    if (evidence.length > 0) {
      report += `\n## ${control.controlId}: ${control.name}\n\n`;
      report += `**Evidence Collected**: ${evidence.length} items\n\n`;

      // Show first few evidence items
      for (const item of evidence.slice(0, 2)) {
        const evidenceData = typeof item.evidence === 'string' ? JSON.parse(item.evidence) : item.evidence;
        report += `- **Type**: ${item.evidenceType}\n`;
        report += `- **Date**: ${new Date(item.timestamp).toLocaleDateString()}\n`;
        report += `- **Details**: ${JSON.stringify(evidenceData).substring(0, 100)}...\n\n`;
      }

      if (evidence.length > 2) {
        report += `- ... and ${evidence.length - 2} more evidence items\n\n`;
      }
    }
  }

  return report;
}

/**
 * Generate findings report
 */
export async function generateFindingsReport(auditRun: any): Promise<string> {
  const findings = auditRun.findings ? auditRun.findings.split(';').filter((f: string) => f.trim()) : [];

  let report = `# Findings Report

## Summary
${findings.length > 0 ? `**Total Findings**: ${findings.length}` : 'No findings identified.'}

`;

  if (findings.length > 0) {
    report += `## Detailed Findings\n\n`;

    findings.forEach((finding: string, index: number) => {
      const trimmed = finding.trim();
      if (trimmed) {
        report += `### Finding ${index + 1}\n${trimmed}\n\n`;
      }
    });
  } else {
    report += `All assessed controls meet SOC 2 Trust Service Criteria.\n\n`;
  }

  return report;
}

/**
 * Generate risk assessment
 */
export async function generateRiskAssessment(auditRun: any): Promise<string> {
  const risks = await auditControls.getRiskRegister();

  let report = `# Risk Assessment

## Risk Summary
- **Total Identified Risks**: ${risks.length}
- **Critical Risks**: ${risks.filter((r: any) => r.likelihood === 'critical' || r.impact === 'critical').length}
- **High Risks**: ${risks.filter((r: any) => (r.likelihood === 'high' || r.impact === 'high') && r.likelihood !== 'critical' && r.impact !== 'critical').length}
- **Medium Risks**: ${risks.filter((r: any) => r.likelihood === 'medium' || r.impact === 'medium').length}

## Risk Register

| Risk ID | Description | Category | Likelihood | Impact | Status |
|---------|-------------|----------|-----------|--------|--------|
`;

  for (const risk of risks.slice(0, 20)) {
    report += `| ${risk.riskId} | ${risk.description.substring(0, 40)} | ${risk.category} | ${risk.likelihood} | ${risk.impact} | ${risk.status} |\n`;
  }

  if (risks.length > 20) {
    report += `\n... and ${risks.length - 20} more risks\n`;
  }

  report += `\n## Risk Mitigation Plans\n\n`;

  const mitigatingRisks = risks.filter((r: any) => r.mitigation);
  for (const risk of mitigatingRisks.slice(0, 10)) {
    report += `### ${risk.riskId}: ${risk.description}\n`;
    report += `**Mitigation**: ${risk.mitigation}\n`;
    report += `**Target Date**: ${risk.targetDate ? new Date(risk.targetDate).toLocaleDateString() : 'TBD'}\n\n`;
  }

  return report;
}

/**
 * Generate recommendations
 */
export async function generateRecommendations(auditRun: any): Promise<string> {
  const recommendations = auditRun.recommendations
    ? auditRun.recommendations.split(';').filter((r: string) => r.trim())
    : [];

  let report = `# Recommendations

## High Priority Recommendations

${recommendations.length > 0
    ? recommendations.map((rec: string, index: number) => `${index + 1}. ${rec.trim()}`).join('\n')
    : 'No immediate recommendations. Continue current compliance practices.'
  }

## Compliance Best Practices

1. **Continue Regular Auditing**: Maintain quarterly compliance audits to identify emerging risks
2. **Update Policies**: Review and update security policies annually
3. **Staff Training**: Conduct annual security awareness training for all employees
4. **Incident Response**: Test incident response procedures twice per year
5. **Backup Testing**: Verify backup and recovery procedures monthly

## Next Steps

1. Address critical findings within 30 days
2. Provide remediation plan for non-compliant controls
3. Schedule follow-up audit in 90 days
4. Brief executive team on audit results

---
`;

  return report;
}

/**
 * Generate appendix
 */
export async function generateAppendix(): Promise<string> {
  return `# Appendix

## A. Audit Methodology

This SOC 2 Type II audit assessed 22 Trust Service Criteria organized into 5 categories:

- **CC (Common Criteria)**: Security, availability, processing integrity
- **C (Confidentiality)**: Protection of sensitive information
- **A (Availability)**: System availability and performance

### Testing Procedures

1. **Control Testing**: Automated and manual verification of control implementation
2. **Evidence Review**: Assessment of documented control evidence
3. **Interview**: Discussion with system owners and administrators
4. **Log Analysis**: Review of system and audit logs
5. **Configuration Review**: Assessment of system settings and policies

## B. Referenced Policies and Procedures

- SECURITY-POLICY.md
- INCIDENT-RESPONSE-PLAN.md
- PASSWORD-POLICY.md
- CHANGE-MANAGEMENT.md
- AUDIT-LOGGING-POLICY.md
- DATA-RETENTION-POLICY.md
- BACKUP-RECOVERY-PLAN.md

## C. Audit Team

- Audit Manager: Compliance Team
- Auditors: Internal Audit Team
- Audit Date: ${new Date().toLocaleDateString()}

## D. Definitions

- **Control**: A safeguard designed to prevent, detect, or mitigate security risks
- **Compliant**: Control fully implemented and operating effectively
- **Partially Compliant**: Control implemented but with deficiencies
- **Non-Compliant**: Control not implemented or ineffective
- **Evidence**: Documentation supporting control implementation

---

*This audit report is confidential and intended for internal use only.*
`;
}

/**
 * Generate full audit report
 */
export async function generateFullAuditReport(auditRun: any): Promise<AuditReportSections> {
  const executiveSummary = await generateExecutiveSummary(auditRun);
  const controlsMatrix = await generateControlsMatrix(auditRun);
  const evidenceReport = await generateEvidenceReport(auditRun);
  const findingsReport = await generateFindingsReport(auditRun);
  const riskAssessment = await generateRiskAssessment(auditRun);
  const recommendations = await generateRecommendations(auditRun);
  const appendix = await generateAppendix();

  return {
    executiveSummary,
    controlsMatrix,
    evidenceReport,
    findingsReport,
    riskAssessment,
    recommendations,
    appendix,
  };
}

/**
 * Generate report as markdown string
 */
export async function generateReportAsMarkdown(auditRun: any): Promise<string> {
  const sections = await generateFullAuditReport(auditRun);

  return `# SOC 2 Type II Compliance Audit Report

**Generated**: ${new Date().toLocaleString()}
**Audit ID**: ${auditRun.id}
**Report Status**: ${auditRun.overallResult?.toUpperCase()}

---

${sections.executiveSummary}

${sections.controlsMatrix}

${sections.evidenceReport}

${sections.findingsReport}

${sections.riskAssessment}

${sections.recommendations}

${sections.appendix}
`;
}

/**
 * Generate report as HTML
 */
export async function generateReportAsHtml(auditRun: any): Promise<string> {
  const markdown = await generateReportAsMarkdown(auditRun);

  // Simple markdown to HTML conversion
  let html = markdown
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SOC 2 Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #1a73e8; border-bottom: 3px solid #1a73e8; padding-bottom: 10px; }
    h2 { color: #1a73e8; margin-top: 30px; }
    h3 { color: #34a853; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #f0f0f0; }
    strong { color: #d33427; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

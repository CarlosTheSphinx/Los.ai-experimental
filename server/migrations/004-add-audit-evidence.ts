import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create auditControls table
  await knex.schema.createTable('auditControls', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('controlId', 20).notNullable().unique();
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('category', 50); // CC-6, CC-7, CC-8, C-1, A-1
    table.text('requirement');
    table.text('testProcedure');
    table.enum('frequency', ['continuous', 'monthly', 'quarterly', 'annually']).defaultTo('continuous');
    table.timestamps(true, true);
    table.index('category');
  });

  // Create auditEvidence table
  await knex.schema.createTable('auditEvidence', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('controlId', 20).notNullable().references('controlId').inTable('auditControls');
    table.enum('evidenceType', ['test_result', 'log_entry', 'config', 'procedure', 'manual_observation']).notNullable();
    table.jsonb('evidence').notNullable();
    table.timestamp('timestamp').notNullable();
    table.uuid('collectedBy').references('id').inTable('users');
    table.text('notes');
    table.timestamps(true, true);
    table.index(['controlId', 'timestamp']);
  });

  // Create auditRuns table
  await knex.schema.createTable('auditRuns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.timestamp('startedAt').notNullable();
    table.timestamp('completedAt');
    table.enum('overallResult', ['compliant', 'partially_compliant', 'non_compliant']);
    table.jsonb('controlResults'); // { "CC-6.1": "compliant", "CC-6.2": "partial", ... }
    table.text('findings');
    table.text('recommendations');
    table.uuid('auditedBy').references('id').inTable('users');
    table.timestamps(true, true);
    table.index('startedAt');
  });

  // Create complianceCheckResults table
  await knex.schema.createTable('complianceCheckResults', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('controlId', 20).notNullable().references('controlId').inTable('auditControls');
    table.enum('checkType', ['automated', 'manual', 'evidence']).notNullable();
    table.enum('result', ['pass', 'fail', 'inconclusive']).notNullable();
    table.text('message');
    table.jsonb('details');
    table.timestamp('timestamp').notNullable();
    table.timestamps(true, true);
    table.index(['controlId', 'timestamp']);
  });

  // Create risk register table
  await knex.schema.createTable('riskRegister', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('riskId', 50).notNullable().unique();
    table.string('description', 500).notNullable();
    table.enum('category', ['technical', 'operational', 'compliance', 'organizational']).notNullable();
    table.enum('likelihood', ['low', 'medium', 'high', 'critical']).notNullable();
    table.enum('impact', ['low', 'medium', 'high', 'critical']).notNullable();
    table.enum('status', ['identified', 'mitigating', 'mitigated', 'accepted']).defaultTo('identified');
    table.text('mitigation');
    table.date('targetDate');
    table.uuid('owner').references('id').inTable('users');
    table.timestamps(true, true);
    table.index('status');
  });

  // Create compliance metrics view
  await knex.raw(`
    CREATE VIEW compliance_summary AS
    SELECT
      COUNT(DISTINCT controlId) as total_controls,
      COUNT(DISTINCT CASE WHEN overallResult = 'compliant' THEN controlId END) as compliant_controls,
      ROUND(100 * COUNT(DISTINCT CASE WHEN overallResult = 'compliant' THEN controlId END)::numeric /
            COUNT(DISTINCT controlId), 2) as compliance_percentage,
      MAX(completedAt) as last_audit_date
    FROM auditRuns;
  `);

  // Create controls by criteria view
  await knex.raw(`
    CREATE VIEW controls_by_criteria AS
    SELECT
      category,
      COUNT(*) as control_count,
      COUNT(CASE WHEN EXISTS(
        SELECT 1 FROM auditEvidence WHERE controlId = auditControls.controlId LIMIT 1
      ) THEN 1 END) as evidence_count
    FROM auditControls
    GROUP BY category;
  `);

  // Pre-populate control definitions
  const controls = [
    // CC-6: Logical and Physical Access Controls
    { controlId: 'CC-6.1', name: 'Authentication', category: 'CC-6', description: 'Entities restrict access through authentication with valid credentials' },
    { controlId: 'CC-6.2', name: 'Role-Based Access Control', category: 'CC-6', description: 'Access rights are granted based on predefined roles' },
    { controlId: 'CC-6.3', name: 'Password Policy', category: 'CC-6', description: 'Passwords meet complexity and expiration requirements' },
    { controlId: 'CC-6.4', name: 'MFA', category: 'CC-6', description: 'Multi-factor authentication required for sensitive operations' },
    { controlId: 'CC-6.5', name: 'API Key Management', category: 'CC-6', description: 'API keys generated, rotated, and revoked through secure processes' },
    { controlId: 'CC-6.6', name: 'Session Management', category: 'CC-6', description: 'Sessions timeout and are properly managed' },
    // CC-7: System Monitoring
    { controlId: 'CC-7.1', name: 'Audit Logging', category: 'CC-7', description: 'System activity is logged with timestamps, users, and actions' },
    { controlId: 'CC-7.2', name: 'Log Immutability', category: 'CC-7', description: 'Audit logs cannot be modified or deleted' },
    { controlId: 'CC-7.3', name: 'Log Retention', category: 'CC-7', description: 'Logs are retained for 7+ years' },
    { controlId: 'CC-7.4', name: 'Monitoring and Alerting', category: 'CC-7', description: 'System monitors for anomalies and alerts on issues' },
    { controlId: 'CC-7.5', name: 'Incident Response', category: 'CC-7', description: 'Incidents are detected, investigated, and documented' },
    // CC-8: Change Management
    { controlId: 'CC-8.1', name: 'Change Authorization', category: 'CC-8', description: 'Changes are authorized before implementation' },
    { controlId: 'CC-8.2', name: 'Change Testing', category: 'CC-8', description: 'Changes are tested before production deployment' },
    { controlId: 'CC-8.3', name: 'Change Documentation', category: 'CC-8', description: 'Changes are documented with rationale and approval' },
    // CC-9: Risk Mitigation
    { controlId: 'CC-9.1', name: 'Backup and Recovery', category: 'CC-9', description: 'Regular backups are created and recovery is tested' },
    { controlId: 'CC-9.2', name: 'Disaster Recovery', category: 'CC-9', description: 'Plans exist for business continuity' },
    // A-1: Availability
    { controlId: 'A-1.1', name: 'System Availability', category: 'A-1', description: 'Systems are available as expected' },
    { controlId: 'A-1.2', name: 'Infrastructure', category: 'A-1', description: 'Infrastructure is redundant and fault-tolerant' },
    // C-1: Confidentiality
    { controlId: 'C-1.1', name: 'Data Encryption at Rest', category: 'C-1', description: 'Sensitive data is encrypted using approved algorithms' },
    { controlId: 'C-1.2', name: 'Data Encryption in Transit', category: 'C-1', description: 'Data in transit is encrypted using TLS 1.2+' },
    { controlId: 'C-1.3', name: 'Data Classification', category: 'C-1', description: 'Data is classified and handled according to classification' },
    { controlId: 'C-1.4', name: 'PII Protection', category: 'C-1', description: 'Personal information is identified and protected' },
  ];

  for (const control of controls) {
    await knex('auditControls').insert({
      controlId: control.controlId,
      name: control.name,
      category: control.category,
      description: control.description,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS controls_by_criteria CASCADE');
  await knex.raw('DROP VIEW IF EXISTS compliance_summary CASCADE');
  await knex.schema.dropTableIfExists('riskRegister');
  await knex.schema.dropTableIfExists('complianceCheckResults');
  await knex.schema.dropTableIfExists('auditRuns');
  await knex.schema.dropTableIfExists('auditEvidence');
  await knex.schema.dropTableIfExists('auditControls');
}

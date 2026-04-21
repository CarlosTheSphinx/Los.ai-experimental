-- Migration: Add comms infrastructure indexes, unique constraints, and seed data
-- These were created via executeSql in the initial comms phase deployment.
-- This file ensures clean environments get the same state.

-- Comms Channels indexes
CREATE INDEX IF NOT EXISTS idx_comms_channels_tenant_type ON comms_channels (tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_comms_channels_owner ON comms_channels (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Comms Templates indexes
CREATE INDEX IF NOT EXISTS idx_comms_templates_tenant_channel ON comms_templates (tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_comms_templates_supersedes ON comms_templates (supersedes_id) WHERE supersedes_id IS NOT NULL;

-- Comms Send Log indexes
CREATE INDEX IF NOT EXISTS idx_comms_send_log_tenant ON comms_send_log (tenant_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_comms_send_log_recipient ON comms_send_log (recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_comms_send_log_run ON comms_send_log (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comms_send_log_status ON comms_send_log (status);

-- Comms Opt Outs: unique constraint to enforce per-channel per-tenant suppression
ALTER TABLE comms_opt_outs DROP CONSTRAINT IF EXISTS comms_opt_outs_contact_channel_tenant_uniq;
ALTER TABLE comms_opt_outs ADD CONSTRAINT comms_opt_outs_contact_channel_tenant_uniq
  UNIQUE (contact_value, channel, tenant_id);
CREATE INDEX IF NOT EXISTS idx_comms_opt_outs_lookup ON comms_opt_outs (contact_value, channel);

-- Comms Automations indexes
CREATE INDEX IF NOT EXISTS idx_comms_automations_tenant_status ON comms_automations (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_comms_automation_nodes_automation ON comms_automation_nodes (automation_id, order_index);
CREATE INDEX IF NOT EXISTS idx_comms_automation_runs_automation ON comms_automation_runs (automation_id, status);
CREATE INDEX IF NOT EXISTS idx_comms_automation_runs_subject ON comms_automation_runs (subject_type, subject_id);

-- Comms Scheduled Executions indexes (critical: pending queue poll index)
CREATE INDEX IF NOT EXISTS idx_comms_scheduled_pending ON comms_scheduled_executions (status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_comms_scheduled_run ON comms_scheduled_executions (run_id);
-- Partial index for lock-cleanup queries (find stuck/timed-out locks)
CREATE INDEX IF NOT EXISTS idx_comms_scheduled_locked ON comms_scheduled_executions (locked_at)
  WHERE locked_at IS NOT NULL;

-- Seed initial merge tags (idempotent: skips existing keys)
INSERT INTO comms_merge_tags (key, description, resolver_fn_name) VALUES
  ('recipient.first_name', 'Recipient''s first name', 'resolveRecipientFirstName'),
  ('recipient.full_name', 'Recipient''s full name', 'resolveRecipientFullName'),
  ('recipient.email', 'Recipient''s email address', 'resolveRecipientEmail'),
  ('recipient.phone', 'Recipient''s phone number', 'resolveRecipientPhone'),
  ('loan.address', 'Property address for the loan', 'resolveLoanAddress'),
  ('loan.amount', 'Loan amount (formatted as currency)', 'resolveLoanAmount'),
  ('loan.number', 'Loan reference number', 'resolveLoanNumber'),
  ('loan.status', 'Current loan stage/status', 'resolveLoanStatus'),
  ('loan.missing_documents', 'List of missing documents (if any)', 'resolveLoanMissingDocuments'),
  ('loan.target_close_date', 'Target closing date for the loan', 'resolveLoanTargetCloseDate'),
  ('loan.portal_link', 'Link to the borrower portal', 'resolveLoanPortalLink'),
  ('lender.name', 'Lender company name', 'resolveLenderName'),
  ('broker.full_name', 'Broker''s full name', 'resolveBrokerFullName'),
  ('broker.company', 'Broker''s company name', 'resolveBrokerCompany'),
  ('current_date', 'Today''s date (formatted)', 'resolveCurrentDate')
ON CONFLICT (key) DO NOTHING;

-- DB-level check constraints for comms enum columns (idempotent via DO block)
DO $$ BEGIN
  ALTER TABLE comms_channels ADD CONSTRAINT comms_channels_type_check CHECK (type IN ('email', 'sms', 'in_app'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE comms_templates ADD CONSTRAINT comms_templates_channel_check CHECK (channel IN ('email', 'sms', 'in_app'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note: 'unknown' is an intentional audit-only sentinel used when a send is
-- attempted with a templateId that does not exist (no template → no channel).
-- This ensures every send attempt is logged even for invalid template references.
DO $$ BEGIN
  ALTER TABLE comms_send_log ADD CONSTRAINT comms_send_log_channel_check CHECK (channel IN ('email', 'sms', 'in_app', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE comms_send_log ADD CONSTRAINT comms_send_log_status_check CHECK (status IN ('sent', 'skipped', 'failed', 'suppressed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE comms_automations ADD CONSTRAINT comms_automations_status_check CHECK (status IN ('draft', 'active', 'paused', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK constraints for comms tables (idempotent via DO block)
DO $$ BEGIN
  ALTER TABLE comms_templates ADD CONSTRAINT comms_templates_supersedes_id_fkey
    FOREIGN KEY (supersedes_id) REFERENCES comms_templates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE comms_automation_runs ADD CONSTRAINT comms_automation_runs_current_node_id_fkey
    FOREIGN KEY (current_node_id) REFERENCES comms_automation_nodes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed channel_formatting for merge tags that resolve multi-value fields
-- Single-value tags leave channel_formatting NULL (no formatting hint needed)
UPDATE comms_merge_tags SET channel_formatting = '{"email":"html_list","sms":"comma_list","in_app":"plain_list"}'::jsonb
  WHERE key = 'loan.missing_documents';

-- Phase 2 of comms automations: segments, batch sends, and the
-- shared scheduled-executions table that backs both the future
-- automation engine (Phase 3) and the batch-send drainer.
--
-- All statements are guarded with IF NOT EXISTS so this migration
-- can be run safely on an environment where the tables were applied
-- via `db:push --force` previously.

CREATE TABLE IF NOT EXISTS comms_channels (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  config JSONB,
  sms_enabled BOOLEAN DEFAULT false NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS comms_templates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  supersedes_id INTEGER,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Self-FK for the version chain (matches shared/schema.ts)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comms_templates_supersedes_id_fkey'
  ) THEN
    ALTER TABLE comms_templates
      ADD CONSTRAINT comms_templates_supersedes_id_fkey
      FOREIGN KEY (supersedes_id) REFERENCES comms_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS comms_merge_tags (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  resolver_fn_name VARCHAR(100) NOT NULL,
  channel_formatting JSONB
);

CREATE TABLE IF NOT EXISTS comms_automations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' NOT NULL,
  trigger_config JSONB,
  exit_conditions JSONB,
  notify_broker_on_send BOOLEAN DEFAULT false NOT NULL,
  max_duration_days INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS comms_automation_nodes (
  id SERIAL PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES comms_automations(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  type VARCHAR(30) NOT NULL,
  config JSONB
);

CREATE TABLE IF NOT EXISTS comms_segments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  filter_config JSONB,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS comms_automation_runs (
  id SERIAL PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES comms_automations(id) ON DELETE CASCADE,
  subject_type VARCHAR(20) NOT NULL,
  subject_id INTEGER NOT NULL,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  current_node_id INTEGER REFERENCES comms_automation_nodes(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'running' NOT NULL,
  exit_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS comms_scheduled_executions (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES comms_automation_runs(id) ON DELETE CASCADE,
  node_id INTEGER REFERENCES comms_automation_nodes(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES comms_templates(id) ON DELETE SET NULL,
  recipient_id INTEGER,
  recipient_type VARCHAR(20),
  loan_id INTEGER,
  sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  batch_id VARCHAR(64),
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  last_error TEXT,
  locked_at TIMESTAMP,
  executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Forward-compatibility for envs that already had a partial table:
-- add the new columns/nullability if they're missing.
ALTER TABLE comms_scheduled_executions ALTER COLUMN run_id  DROP NOT NULL;
ALTER TABLE comms_scheduled_executions ALTER COLUMN node_id DROP NOT NULL;
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS tenant_id        INTEGER;
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS template_id      INTEGER REFERENCES comms_templates(id) ON DELETE SET NULL;
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS recipient_id     INTEGER;
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS recipient_type   VARCHAR(20);
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS loan_id          INTEGER;
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS sender_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS batch_id         VARCHAR(64);
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS last_error       TEXT;
ALTER TABLE comms_scheduled_executions ADD COLUMN IF NOT EXISTS executed_at      TIMESTAMP;

-- Backfill tenant_id for any pre-existing automation rows:
-- derive from the run -> automation relationship.
UPDATE comms_scheduled_executions sched
   SET tenant_id = a.tenant_id
  FROM comms_automation_runs r
  JOIN comms_automations a ON a.id = r.automation_id
 WHERE sched.run_id = r.id
   AND sched.tenant_id IS NULL;

-- Now that tenant_id is populated, enforce NOT NULL and the FK.
ALTER TABLE comms_scheduled_executions ALTER COLUMN tenant_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comms_scheduled_executions_tenant_id_fkey'
  ) THEN
    ALTER TABLE comms_scheduled_executions
      ADD CONSTRAINT comms_scheduled_executions_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comms_sched_due ON comms_scheduled_executions (status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_comms_sched_batch ON comms_scheduled_executions (batch_id);

CREATE TABLE IF NOT EXISTS comms_send_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES comms_automation_runs(id) ON DELETE SET NULL,
  node_id INTEGER REFERENCES comms_automation_nodes(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL,
  template_id INTEGER REFERENCES comms_templates(id) ON DELETE SET NULL,
  template_version INTEGER NOT NULL,
  recipient_type VARCHAR(20) NOT NULL,
  recipient_id INTEGER NOT NULL,
  recipient_contact_value TEXT NOT NULL,
  resolved_body TEXT NOT NULL,
  resolved_subject TEXT,
  resolved_merge_tags JSONB,
  status VARCHAR(20) NOT NULL,
  failure_reason TEXT,
  delivery_events JSONB DEFAULT '[]',
  sent_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS comms_opt_outs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_value TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL,
  opted_out_at TIMESTAMP DEFAULT NOW() NOT NULL,
  source VARCHAR(30) NOT NULL,
  recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS comms_consent_records (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  consented_at TIMESTAMP DEFAULT NOW() NOT NULL,
  source VARCHAR(30) NOT NULL,
  consent_text TEXT
);

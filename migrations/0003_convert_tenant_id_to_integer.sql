-- Pre-migration: Convert varchar tenant_id columns to integer before Drizzle auto-migration
-- This handles the USING clause that Drizzle's auto-generated migration doesn't include

-- Create tenants table if not exists
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

INSERT INTO tenants (id, name, slug, is_active)
VALUES (1, 'Sphinx Capital', 'sphinx-capital', true)
ON CONFLICT (id) DO NOTHING;

-- Convert quote_pdf_templates.tenant_id from varchar to integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_pdf_templates' AND column_name = 'tenant_id'
    AND data_type = 'character varying'
  ) THEN
    UPDATE quote_pdf_templates SET tenant_id = '1' WHERE tenant_id IS NULL OR tenant_id = '';
    ALTER TABLE quote_pdf_templates ALTER COLUMN tenant_id TYPE integer USING tenant_id::integer;
  END IF;
END $$;

-- Convert loan_programs.tenant_id from varchar to integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_programs' AND column_name = 'tenant_id'
    AND data_type = 'character varying'
  ) THEN
    UPDATE loan_programs SET tenant_id = '1' WHERE tenant_id IS NULL OR tenant_id = '';
    ALTER TABLE loan_programs ALTER COLUMN tenant_id TYPE integer USING tenant_id::integer;
  END IF;
END $$;

-- Add tenant_id to users if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE users ADD COLUMN tenant_id INTEGER;
    UPDATE users SET tenant_id = 1;
  END IF;
END $$;

-- Backfill NULL tenant_ids
UPDATE funds SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE intake_deals SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE loan_programs SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE partners SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE pricing_requests SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE admin_tasks SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE commercial_form_config SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE intake_document_rules SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE system_settings SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE quote_pdf_templates SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE team_chats SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Add new columns to intake_deals if not exist
ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS loan_type VARCHAR(100);
ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS number_of_units INTEGER;

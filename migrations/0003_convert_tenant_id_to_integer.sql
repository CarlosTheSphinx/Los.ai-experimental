-- Pre-migration: Normalize tenant_id values and convert varchar columns to integer
-- Production tenant_id columns currently store user IDs (8, 29, 9, etc.)
-- These must ALL be normalized to 1 (Sphinx Capital) before FK constraints are added

-- Step 1: Create tenants table if not exists
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

-- Step 2: Normalize ALL integer tenant_id columns to 1 (they currently hold user IDs)
UPDATE funds SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE intake_deals SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE partners SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE pricing_requests SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE admin_tasks SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE commercial_form_config SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE intake_document_rules SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE system_settings SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE team_chats SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;

-- Step 3: Convert quote_pdf_templates.tenant_id from varchar to integer with USING
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_pdf_templates' AND column_name = 'tenant_id'
    AND data_type = 'character varying'
  ) THEN
    UPDATE quote_pdf_templates SET tenant_id = '1';
    ALTER TABLE quote_pdf_templates ALTER COLUMN tenant_id TYPE integer USING tenant_id::integer;
  ELSE
    UPDATE quote_pdf_templates SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
  END IF;
END $$;

-- Step 4: Convert loan_programs.tenant_id from varchar to integer with USING
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_programs' AND column_name = 'tenant_id'
    AND data_type = 'character varying'
  ) THEN
    UPDATE loan_programs SET tenant_id = '1';
    ALTER TABLE loan_programs ALTER COLUMN tenant_id TYPE integer USING tenant_id::integer;
  ELSE
    UPDATE loan_programs SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
  END IF;
END $$;

-- Step 5: Add tenant_id to users if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE users ADD COLUMN tenant_id INTEGER;
  END IF;
END $$;

UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;

-- Step 6: Add new columns to intake_deals if not exist
ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS loan_type VARCHAR(100);
ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS number_of_units INTEGER;

-- Fix tenant_id type conversion from varchar to integer for production
-- This must run BEFORE Drizzle's auto-generated migration

-- Create tenants table if it doesn't exist yet in production
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
VALUES (1, 'Sphinx Capital', 'sphinx-capital', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('tenants_id_seq', GREATEST((SELECT MAX(id) FROM tenants), 1));

-- Add tenant_id to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Convert quote_pdf_templates.tenant_id from varchar to integer with USING clause
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_pdf_templates' AND column_name = 'tenant_id'
    AND data_type IN ('character varying', 'text')
  ) THEN
    UPDATE quote_pdf_templates SET tenant_id = '1' WHERE tenant_id IS NULL OR tenant_id = '';
    ALTER TABLE quote_pdf_templates ALTER COLUMN tenant_id TYPE integer USING tenant_id::integer;
  END IF;
END $$;

-- Convert loan_programs.tenant_id from varchar to integer with USING clause
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan_programs' AND column_name = 'tenant_id'
    AND data_type IN ('character varying', 'text')
  ) THEN
    UPDATE loan_programs SET tenant_id = '1' WHERE tenant_id IS NULL OR tenant_id = '';
    ALTER TABLE loan_programs ALTER COLUMN tenant_id TYPE integer USING tenant_id::integer;
  END IF;
END $$;

-- Ensure all tenant_id columns are set to 1 for existing data
UPDATE funds SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE intake_deals SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE loan_programs SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE partners SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE pricing_requests SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE admin_tasks SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE system_settings SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE quote_pdf_templates SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Add loan_type and number_of_units to intake_deals if not exists
ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS loan_type VARCHAR(100);
ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS number_of_units INTEGER;

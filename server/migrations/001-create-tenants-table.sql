-- Migration: Create tenants table and migrate tenant_id FKs from users to tenants
-- This migration is idempotent and safe to re-run.

-- Step 1: Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Step 2: Seed Sphinx Capital as tenant 1
INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
VALUES (1, 'Sphinx Capital', 'sphinx-capital', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
SELECT setval('tenants_id_seq', GREATEST((SELECT MAX(id) FROM tenants), 1));

-- Step 3: Add tenant_id to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Step 4: Ensure tenant_id columns are integer type (fix legacy varchar columns)
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='loan_programs' AND column_name='tenant_id') = 'character varying' THEN
    ALTER TABLE loan_programs ALTER COLUMN tenant_id TYPE INTEGER USING tenant_id::integer;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='quote_pdf_templates' AND column_name='tenant_id') = 'character varying' THEN
    ALTER TABLE quote_pdf_templates ALTER COLUMN tenant_id TYPE INTEGER USING tenant_id::integer;
  END IF;
END $$;

-- Step 5: Drop old FK constraints referencing users(id) for tenant_id
ALTER TABLE pricing_requests DROP CONSTRAINT IF EXISTS pricing_requests_tenant_id_users_id_fk;
ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_tenant_id_users_id_fk;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_tenant_id_users_id_fk;
ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_tenant_id_users_id_fk;
ALTER TABLE admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_tenant_id_users_id_fk;
ALTER TABLE loan_programs DROP CONSTRAINT IF EXISTS loan_programs_tenant_id_users_id_fk;
ALTER TABLE funds DROP CONSTRAINT IF EXISTS funds_tenant_id_fkey;
ALTER TABLE intake_deals DROP CONSTRAINT IF EXISTS intake_deals_tenant_id_fkey;
ALTER TABLE intake_document_rules DROP CONSTRAINT IF EXISTS intake_document_rules_tenant_id_fkey;
ALTER TABLE commercial_form_config DROP CONSTRAINT IF EXISTS commercial_form_config_tenant_id_fkey;

-- Step 6: Normalize all tenant_id values to 1
UPDATE funds SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE intake_deals SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE loan_programs SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE partners SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE pricing_requests SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE admin_tasks SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE commercial_form_config SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE intake_document_rules SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE quote_pdf_templates SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE system_settings SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;
UPDATE team_chats SET tenant_id = 1 WHERE tenant_id IS NULL OR tenant_id != 1;

-- Step 7: Add new FK constraints referencing tenants(id) (idempotent with IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='pricing_requests_tenant_id_tenants_id_fk') THEN
    ALTER TABLE pricing_requests ADD CONSTRAINT pricing_requests_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='partners_tenant_id_tenants_id_fk') THEN
    ALTER TABLE partners ADD CONSTRAINT partners_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='projects_tenant_id_tenants_id_fk') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='system_settings_tenant_id_tenants_id_fk') THEN
    ALTER TABLE system_settings ADD CONSTRAINT system_settings_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='admin_tasks_tenant_id_tenants_id_fk') THEN
    ALTER TABLE admin_tasks ADD CONSTRAINT admin_tasks_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='loan_programs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE loan_programs ADD CONSTRAINT loan_programs_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='funds_tenant_id_tenants_id_fk') THEN
    ALTER TABLE funds ADD CONSTRAINT funds_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='intake_deals_tenant_id_tenants_id_fk') THEN
    ALTER TABLE intake_deals ADD CONSTRAINT intake_deals_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='intake_document_rules_tenant_id_tenants_id_fk') THEN
    ALTER TABLE intake_document_rules ADD CONSTRAINT intake_document_rules_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='commercial_form_config_tenant_id_tenants_id_fk') THEN
    ALTER TABLE commercial_form_config ADD CONSTRAINT commercial_form_config_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='team_chats_tenant_id_tenants_id_fk') THEN
    ALTER TABLE team_chats ADD CONSTRAINT team_chats_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='quote_pdf_templates_tenant_id_tenants_id_fk') THEN
    ALTER TABLE quote_pdf_templates ADD CONSTRAINT quote_pdf_templates_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;
END $$;

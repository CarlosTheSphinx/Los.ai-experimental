-- Migration: Add loan_type and number_of_units columns to intake_deals
-- This migration is idempotent and safe to re-run.

ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS loan_type VARCHAR(100);
ALTER TABLE intake_deals ADD COLUMN IF NOT EXISTS number_of_units INTEGER;

-- Backfill loanType and numberOfUnits into existing form config for tenant 1
INSERT INTO commercial_form_config (tenant_id, field_key, field_label, section, field_type, is_required, is_visible, sort_order, options)
VALUES
  (1, 'loanType', 'Loan Type', 'Deal Basics', 'select', false, true, 4, '{"choices":["Bridge","Construction","DSCR","A&D","Fix & Flip","Long-Term Financing","Land Development"]}'),
  (1, 'numberOfUnits', 'Number of Units', 'Deal Basics', 'number', false, true, 5, '{}')
ON CONFLICT DO NOTHING;

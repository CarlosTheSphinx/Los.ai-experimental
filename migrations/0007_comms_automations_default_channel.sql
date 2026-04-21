-- Phase 3: single-channel automations.
-- Adds comms_automations.default_channel. Backfills any existing rows to
-- 'email' (the previous implicit default) before tightening to NOT NULL.

ALTER TABLE comms_automations
  ADD COLUMN IF NOT EXISTS default_channel varchar(20);

UPDATE comms_automations
  SET default_channel = 'email'
  WHERE default_channel IS NULL;

ALTER TABLE comms_automations
  ALTER COLUMN default_channel SET DEFAULT 'email';

ALTER TABLE comms_automations
  ALTER COLUMN default_channel SET NOT NULL;

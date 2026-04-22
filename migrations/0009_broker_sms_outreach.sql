-- Migration 0009: Broker SMS outreach columns and replies table
-- Adds per-contact opt-out tracking, Twilio message metadata on outreach messages,
-- and inbound reply capture for the broker-owned Twilio SMS feature.

-- 1. Opt-out flag on broker contacts (TCPA compliance)
ALTER TABLE broker_contacts ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN NOT NULL DEFAULT false;

-- 2. Twilio delivery metadata on outreach messages
ALTER TABLE broker_outreach_messages ADD COLUMN IF NOT EXISTS twilio_message_sid VARCHAR(64);
ALTER TABLE broker_outreach_messages ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(32);

-- 3. Inbound SMS reply storage (webhook → broker inbox)
CREATE TABLE IF NOT EXISTS broker_sms_replies (
  id SERIAL PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES broker_contacts(id) ON DELETE SET NULL,
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  body TEXT NOT NULL,
  is_opt_out BOOLEAN NOT NULL DEFAULT false,
  twilio_message_sid VARCHAR(64),
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for fast per-broker thread lookups
CREATE INDEX IF NOT EXISTS idx_broker_sms_replies_broker_id ON broker_sms_replies(broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_sms_replies_contact_id ON broker_sms_replies(contact_id);

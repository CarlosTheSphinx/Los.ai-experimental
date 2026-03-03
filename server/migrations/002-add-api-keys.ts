import { drizzle } from 'drizzle-orm/postgres-js';
import { pgTable, text, varchar, integer, timestamp, boolean, json, uuid, index } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

/**
 * Week 6 Migration: Add API Keys & Scope Management
 *
 * Creates two new tables:
 * 1. apiKeys - Stores API keys for third-party integrations
 * 2. apiKeyUsage - Audit trail of all API key usage
 *
 * Features:
 * - Secure key storage with bcrypt hashing
 * - Scope-based access control
 * - Rate limiting per key
 * - Key rotation and revocation
 * - Comprehensive audit logging
 */

export async function up() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(connectionString);
  const db = drizzle(sql);

  // Create apiKeys table
  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(255) NOT NULL UNIQUE,
      key_preview VARCHAR(10) NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT '{}',
      rate_limit_per_minute INTEGER NOT NULL DEFAULT 100,
      expires_at TIMESTAMP,
      revoked_at TIMESTAMP,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,

      CONSTRAINT rate_limit_positive CHECK (rate_limit_per_minute > 0),
      CONSTRAINT expires_at_future CHECK (expires_at IS NULL OR expires_at > NOW())
    );
  `;

  // Create indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys(revoked_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at)`;

  // Create apiKeyUsage table (audit trail)
  await sql`
    CREATE TABLE IF NOT EXISTS api_key_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      endpoint VARCHAR(255) NOT NULL,
      method VARCHAR(10) NOT NULL,
      status_code SMALLINT NOT NULL,
      ip_address INET,
      user_agent TEXT,
      scope_required TEXT[] NOT NULL DEFAULT '{}',
      scope_granted TEXT[] NOT NULL DEFAULT '{}',
      authorized BOOLEAN NOT NULL,
      error_message TEXT,
      request_id UUID,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      response_time_ms INTEGER,

      CONSTRAINT valid_method CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
      CONSTRAINT valid_status_code CHECK (status_code >= 100 AND status_code < 600)
    );
  `;

  // Create indexes for audit queries
  await sql`CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id ON api_key_usage(api_key_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_key_usage_timestamp ON api_key_usage(timestamp)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_key_usage_request_id ON api_key_usage(request_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_key_usage_authorized ON api_key_usage(authorized)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_key_usage_status ON api_key_usage(status_code)`;

  // Create view for rate limit tracking
  await sql`
    CREATE OR REPLACE VIEW api_key_rate_limit_usage AS
    SELECT
      api_key_id,
      COUNT(*) as request_count,
      MAX(timestamp) as last_request_at,
      DATE_TRUNC('minute', NOW()) as current_minute_start
    FROM api_key_usage
    WHERE timestamp > NOW() - INTERVAL '1 minute'
    GROUP BY api_key_id;
  `;

  // Create view for key statistics
  await sql`
    CREATE OR REPLACE VIEW api_key_statistics AS
    SELECT
      ak.id,
      ak.user_id,
      ak.name,
      COUNT(aku.id) as total_requests,
      SUM(CASE WHEN aku.authorized = true THEN 1 ELSE 0 END) as authorized_requests,
      SUM(CASE WHEN aku.authorized = false THEN 1 ELSE 0 END) as denied_requests,
      AVG(aku.response_time_ms) as avg_response_time_ms,
      MAX(aku.timestamp) as last_used_at,
      ak.created_at,
      ak.expires_at,
      ak.revoked_at
    FROM api_keys ak
    LEFT JOIN api_key_usage aku ON ak.id = aku.api_key_id
    GROUP BY ak.id, ak.user_id, ak.name, ak.created_at, ak.expires_at, ak.revoked_at;
  `;

  // Add new audit log action types
  await sql`
    ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'apikey.created';
    ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'apikey.rotated';
    ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'apikey.revoked';
    ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'apikey.expired';
    ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'apikey.scope_updated';
    ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'apikey.usage_viewed';
  `;

  console.log('✓ Migration 002: API Keys & Scope Management completed');
  await sql.end();
}

export async function down() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(connectionString);

  // Drop views
  await sql`DROP VIEW IF EXISTS api_key_statistics`;
  await sql`DROP VIEW IF EXISTS api_key_rate_limit_usage`;

  // Drop tables (cascade handles foreign keys)
  await sql`DROP TABLE IF EXISTS api_key_usage CASCADE`;
  await sql`DROP TABLE IF EXISTS api_keys CASCADE`;

  console.log('✓ Migration 002 rolled back');
  await sql.end();
}

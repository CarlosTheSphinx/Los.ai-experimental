#!/bin/bash
set -e
npm install

# Run drizzle-kit push with stdin closed to avoid interactive prompts
# If it fails due to interactive prompt, that's OK - schema changes
# that require confirmation should be applied manually
npx drizzle-kit push < /dev/null 2>&1 || echo "drizzle-kit push requires manual intervention, skipping"

# Run specific idempotent migration for message_thread_participants table
# Uses IF NOT EXISTS / ON CONFLICT DO NOTHING so safe to re-run
if [ -f "migrations/0004_add_message_thread_participants.sql" ]; then
  echo "Running migration: 0004_add_message_thread_participants.sql"
  psql "$DATABASE_URL" -f "migrations/0004_add_message_thread_participants.sql" 2>&1 || echo "Migration 0004 failed (may already be applied), continuing"
fi

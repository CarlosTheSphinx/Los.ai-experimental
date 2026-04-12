CREATE TABLE IF NOT EXISTS "message_thread_participants" (
  "id" serial PRIMARY KEY NOT NULL,
  "thread_id" integer NOT NULL REFERENCES "message_threads"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("thread_id", "user_id")
);

INSERT INTO "message_thread_participants" ("thread_id", "user_id", "joined_at")
SELECT "id", "user_id", "created_at"
FROM "message_threads"
WHERE "user_id" IS NOT NULL
ON CONFLICT DO NOTHING;

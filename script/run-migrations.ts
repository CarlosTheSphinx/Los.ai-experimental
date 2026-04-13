import { readFileSync, readdirSync } from "fs";
import pg from "pg";

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[Migrations] No DATABASE_URL found, skipping custom migrations");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _custom_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const migrationFiles = readdirSync("migrations")
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const { rows } = await client.query(
        "SELECT 1 FROM _custom_migrations WHERE name = $1",
        [file]
      );

      if (rows.length > 0) {
        console.log(`[Migrations] Already applied: ${file}`);
        continue;
      }

      console.log(`[Migrations] Applying: ${file}`);
      const sql = readFileSync(`migrations/${file}`, "utf-8");
      await client.query(sql);
      await client.query(
        "INSERT INTO _custom_migrations (name) VALUES ($1)",
        [file]
      );
      console.log(`[Migrations] Applied: ${file}`);
    }

    console.log("[Migrations] All custom migrations complete");
  } catch (err) {
    console.error("[Migrations] Error:", err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Idempotent pre-build step that ensures tables added to existing migration
 * files after those migrations were already applied to production.
 *
 * Uses CREATE TABLE IF NOT EXISTS — safe to run multiple times.
 * Failures abort the build so a broken schema is never silently deployed.
 */
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.log("[ensure-runtime-tables] No DATABASE_URL — skipping (build-time only env).");
  process.exit(0);
}

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 10_000,
});

const tables = [
  {
    name: "api_rate_limits",
    sql: `
      CREATE TABLE IF NOT EXISTS api_rate_limits (
        key         TEXT        NOT NULL PRIMARY KEY,
        window_start TIMESTAMPTZ NOT NULL,
        count       INTEGER     NOT NULL DEFAULT 1,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
  },
];

try {
  for (const { name, sql } of tables) {
    await pool.query(sql);
    console.log(`[ensure-runtime-tables] ${name}: ok`);
  }
} finally {
  await pool.end();
}

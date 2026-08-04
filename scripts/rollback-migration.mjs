import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const apply = process.argv.includes("--apply");
const nameArgument = process.argv.find((value) => value.startsWith("--migration="));
const migration = nameArgument?.slice("--migration=".length);
if (!migration || !/^\d{4}_[a-z0-9_]+$/.test(migration)) throw new Error("Use --migration=0003_tenant_integrity");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const upName = `${migration}.sql`;
const downPath = resolve(process.cwd(), "drizzle", `${migration}.down.sql`);
const downSql = await readFile(downPath, "utf8");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined });
try {
  const result = await pool.query("SELECT name FROM nxtgen_convert_schema_migrations ORDER BY name DESC");
  const applied = result.rows.map((row) => row.name);
  if (!applied.includes(upName)) throw new Error(`${upName} is not recorded as applied`);
  const newer = applied.filter((name) => name > upName);
  if (newer.length) throw new Error(`Rollback blocked. Newer migrations remain applied: ${newer.join(", ")}`);
  if (!apply) {
    console.log(`ready to roll back ${upName}. Re-run with --apply after backup and owner approval.`);
  } else {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(downSql);
      await client.query("DELETE FROM nxtgen_convert_schema_migrations WHERE name=$1", [upName]);
      await client.query("COMMIT");
      console.log(`rolled back ${upName}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const apply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const directory = resolve(process.cwd(), "drizzle");
const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name) && !name.endsWith(".down.sql")).sort();
const pool = new pg.Pool({ connectionString, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS nxtgen_convert_schema_migrations (
    name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const existing = await pool.query("SELECT name, sha256 FROM nxtgen_convert_schema_migrations ORDER BY name");
  const applied = new Map(existing.rows.map((row) => [row.name, row.sha256]));
  let pending = 0;
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const recorded = applied.get(file);
    if (recorded && recorded !== sha256) throw new Error(`Migration drift detected for ${file}`);
    if (recorded) {
      console.log(`verified ${file}`);
      continue;
    }
    pending += 1;
    if (!apply) {
      console.log(`pending  ${file}  ${sha256}`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO nxtgen_convert_schema_migrations (name, sha256) VALUES ($1,$2)", [file, sha256]);
      await client.query("COMMIT");
      console.log(`applied  ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  if (!apply) console.log(`${pending} migration(s) pending. Re-run with --apply after backup and review.`);
} finally {
  await pool.end();
}

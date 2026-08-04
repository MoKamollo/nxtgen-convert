import { createHmac } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.IDENTITY_HASHING_SECRET ?? process.env.TRACKING_SIGNING_SECRET;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!secret || secret.length < 32) throw new Error("IDENTITY_HASHING_SECRET must be at least 32 characters");

function normalize(type, rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  if (type === "email") {
    const normalized = value.toLowerCase();
    return /^\S+@\S+\.\S+$/.test(normalized) ? normalized : null;
  }
  const normalized = value.replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "");
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return normalized.startsWith("+") ? `+${digits}` : digits;
}
function hash(type, normalized) {
  return createHmac("sha256", secret).update(`${type}\n${normalized}`).digest("base64url");
}
function hint(type, normalized) {
  if (type === "email") {
    const [local, domain] = normalized.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `***${normalized.replace(/\D/g, "").slice(-4)}`;
}
function pair(a, b) { return a.localeCompare(b) <= 0 ? [a, b] : [b, a]; }

const client = new Client({ connectionString: databaseUrl, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined });
await client.connect();
let linked = 0;
let conflicts = 0;
let invalid = 0;
try {
  const organizations = await client.query("SELECT id FROM organizations ORDER BY id");
  for (const organization of organizations.rows) {
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [organization.id]);
      const contacts = await client.query("SELECT id,email,phone FROM contacts WHERE organization_id=$1 AND archived_at IS NULL ORDER BY created_at,id", [organization.id]);
      for (const contact of contacts.rows) {
        for (const type of ["email", "phone"]) {
          const normalized = normalize(type, contact[type]);
          if (!normalized) { if (contact[type]) invalid += 1; continue; }
          const valueHash = hash(type, normalized);
          const existing = await client.query(
            "SELECT id,contact_id FROM contact_identity_keys WHERE organization_id=$1 AND identity_type=$2 AND value_hash=$3 LIMIT 1",
            [organization.id, type, valueHash],
          );
          if (existing.rowCount && existing.rows[0].contact_id !== contact.id) {
            const [left, right] = pair(existing.rows[0].contact_id, contact.id);
            await client.query(
              `INSERT INTO identity_resolution_candidates
                (organization_id,left_contact_id,right_contact_id,identity_type,identity_hash,reason,confidence,status,evidence)
               VALUES ($1,$2,$3,$4,$5,$6,100.00,'pending',$7::jsonb)
               ON CONFLICT DO NOTHING`,
              [organization.id, left, right, type, valueHash, `Exact normalized ${type} match`, JSON.stringify({ match: "exact", displayHint: hint(type, normalized), source: "backfill" })],
            );
            conflicts += 1;
            continue;
          }
          await client.query(
            `INSERT INTO contact_identity_keys
              (organization_id,contact_id,identity_type,value_hash,display_hint,source,verified,active)
             VALUES ($1,$2,$3,$4,$5,'backfill',false,true)
             ON CONFLICT (organization_id,identity_type,value_hash) DO UPDATE SET
               last_seen_at=now(), active=true`,
            [organization.id, contact.id, type, valueHash, hint(type, normalized)],
          );
          linked += 1;
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log(JSON.stringify({ linked, conflicts, invalid }, null, 2));
} finally {
  await client.end();
}

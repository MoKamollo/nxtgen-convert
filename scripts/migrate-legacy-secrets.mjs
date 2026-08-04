#!/usr/bin/env node
import { createCipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
const encryptionKeyEncoded = process.env.INTEGRATION_ENCRYPTION_KEY;
const apiHashSecret = process.env.API_KEY_HASH_SECRET ?? process.env.SPACE_SSO_SECRET;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!encryptionKeyEncoded) throw new Error("INTEGRATION_ENCRYPTION_KEY is required");
const encryptionKey = Buffer.from(encryptionKeyEncoded, "base64");
if (encryptionKey.length !== 32) throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes");
if (!apiHashSecret || apiHashSecret.length < 32) throw new Error("API_KEY_HASH_SECRET or SPACE_SSO_SECRET must contain at least 32 characters");

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

function hashApiKey(rawKey) {
  return createHmac("sha256", apiHashSecret).update(rawKey).digest("hex");
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: process.env.PGSSL === "disable" ? false : undefined });
await client.connect();
try {
  const result = await client.query("SELECT id, settings FROM organizations WHERE settings ?| ARRAY['apiKeys','webhooks','stripe'] ORDER BY id");
  const totals = { organizations: result.rowCount ?? 0, revokedApiKeys: 0, inactiveWebhooks: 0, stripeRequiresConfiguration: 0 };
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${totals.organizations} organization(s) contain legacy credential material.`);
  if (!apply) {
    for (const row of result.rows) {
      const settings = row.settings ?? {};
      console.log(JSON.stringify({ organizationId: row.id, apiKeys: settings.apiKeys?.length ?? 0, webhooks: settings.webhooks?.length ?? 0, stripe: Boolean(settings.stripe) }));
    }
    console.log("No data changed. Run again with --apply after backup and migration 0002 are complete.");
    process.exit(0);
  }

  await client.query("BEGIN");
  for (const row of result.rows) {
    const organizationId = row.id;
    const settings = { ...(row.settings ?? {}) };

    for (const legacyKey of Array.isArray(settings.apiKeys) ? settings.apiKeys : []) {
      const rawKey = String(legacyKey?.key ?? "");
      if (!rawKey) continue;
      await client.query(`
        INSERT INTO api_keys (id, organization_id, name, prefix, key_hash, scopes, last_used_at, revoked_at, created_at)
        VALUES ($1,$2,$3,$4,$5,ARRAY[]::text[],$6,now(),$7)
        ON CONFLICT (key_hash) DO NOTHING
      `, [legacyKey.id || randomUUID(), organizationId, String(legacyKey.name ?? "Legacy key").slice(0, 80), rawKey.slice(0, 18), hashApiKey(rawKey), legacyKey.lastUsed ? new Date(legacyKey.lastUsed) : null, legacyKey.createdAt ? new Date(legacyKey.createdAt) : new Date()]);
      totals.revokedApiKeys += 1;
    }

    for (const legacyHook of Array.isArray(settings.webhooks) ? settings.webhooks : []) {
      const signingSecret = `whsec_${randomBytes(32).toString("base64url")}`;
      const encrypted = encrypt(JSON.stringify({ signingSecret }));
      const secretId = randomUUID();
      await client.query(`
        INSERT INTO integration_secrets (id, organization_id, provider, ciphertext, iv, auth_tag, key_version)
        VALUES ($1,$2,'webhook',$3,$4,$5,1)
      `, [secretId, organizationId, encrypted.ciphertext, encrypted.iv, encrypted.authTag]);
      await client.query(`
        INSERT INTO webhook_endpoints (id, organization_id, url, events, secret_id, active, health_status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,false,'requires_rotation',$6,now())
        ON CONFLICT (id) DO NOTHING
      `, [legacyHook.id || randomUUID(), organizationId, String(legacyHook.url ?? ""), Array.isArray(legacyHook.events) ? legacyHook.events.map(String) : [], secretId, legacyHook.createdAt ? new Date(legacyHook.createdAt) : new Date()]);
      totals.inactiveWebhooks += 1;
    }

    if (settings.stripe && typeof settings.stripe === "object") {
      const encrypted = encrypt(JSON.stringify(settings.stripe));
      const secretId = randomUUID();
      await client.query(`
        INSERT INTO integration_secrets (id, organization_id, provider, ciphertext, iv, auth_tag, key_version)
        VALUES ($1,$2,'stripe_legacy',$3,$4,$5,1)
      `, [secretId, organizationId, encrypted.ciphertext, encrypted.iv, encrypted.authTag]);
      await client.query(`
        INSERT INTO connector_accounts (organization_id, provider, display_name, status, health_status, secret_id, last_error, metadata)
        VALUES ($1,'stripe','Stripe','requires_configuration','unverified',$2,'Legacy configuration did not include a verifiable Stripe secret key.', '{"migratedFromLegacy":true}'::jsonb)
        ON CONFLICT (organization_id, provider) DO UPDATE SET
          status='requires_configuration', health_status='unverified', secret_id=EXCLUDED.secret_id,
          last_error=EXCLUDED.last_error, metadata=EXCLUDED.metadata, updated_at=now()
      `, [organizationId, secretId]);
      totals.stripeRequiresConfiguration += 1;
    }

    const integrations = settings.integrations && typeof settings.integrations === "object" ? { ...settings.integrations } : undefined;
    if (integrations) delete integrations.stripe;
    delete settings.apiKeys;
    delete settings.webhooks;
    delete settings.stripe;
    if (integrations && Object.keys(integrations).length > 0) settings.integrations = integrations;
    else delete settings.integrations;
    await client.query("UPDATE organizations SET settings=$2::jsonb, updated_at=now() WHERE id=$1", [organizationId, JSON.stringify(settings)]);
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ status: "complete", ...totals }, null, 2));
  console.log("Legacy API keys were revoked and must be rotated. Legacy webhooks were disabled and must be re-created to obtain a signing secret. Stripe must be reconnected with a verifiable secret key.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

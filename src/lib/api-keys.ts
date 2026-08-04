import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";

function hashKey(rawKey: string): string {
  const secret = process.env.API_KEY_HASH_SECRET ?? process.env.SPACE_SSO_SECRET;
  if (!secret || (process.env.NODE_ENV === "production" && secret.length < 32)) {
    throw new Error("API_KEY_HASH_SECRET must be configured with at least 32 characters");
  }
  return createHmac("sha256", secret).update(rawKey).digest("hex");
}

export function generateApiKey(): { rawKey: string; prefix: string; keyHash: string } {
  const prefix = randomBytes(6).toString("hex");
  const rawKey = `nxg_live_${prefix}_${randomBytes(32).toString("base64url")}`;
  return { rawKey, prefix: `nxg_live_${prefix}`, keyHash: hashKey(rawKey) };
}

export async function authenticateApiKey(rawKey: string, requiredScope?: string) {
  const now = new Date();
  const [record] = await db.select().from(apiKeys).where(and(
    eq(apiKeys.keyHash, hashKey(rawKey)),
    isNull(apiKeys.revokedAt),
    or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
  )).limit(1);
  if (!record) return null;
  const scopes = record.scopes ?? [];
  if (requiredScope && !scopes.includes("*") && !scopes.includes(requiredScope)) return null;
  await db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, record.id));
  return record;
}

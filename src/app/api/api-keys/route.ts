import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { generateApiKey } from "@/lib/api-keys";
import { normalizeApiKeyScopes } from "@/lib/api-key-scopes";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const data = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    prefix: apiKeys.prefix,
    maskedKey: apiKeys.prefix,
    scopes: apiKeys.scopes,
    lastUsedAt: apiKeys.lastUsedAt,
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
  }).from(apiKeys).where(and(eq(apiKeys.organizationId, orgId), isNull(apiKeys.revokedAt)));
  return NextResponse.json({ data });
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "Default").trim().slice(0, 80) || "Default";
  const scopes = normalizeApiKeyScopes(body.scopes);
  if (scopes.length === 0) return NextResponse.json({ error: "At least one valid scope is required" }, { status: 400 });
  const rawExpiresAt = body.expiresAt;
  const expiresAt = rawExpiresAt === undefined || rawExpiresAt === null || rawExpiresAt === ""
    ? null
    : new Date(String(rawExpiresAt));
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
    return NextResponse.json({ error: "Expiration must be a future date" }, { status: 400 });
  }
  const generated = generateApiKey();
  const [record] = await db.insert(apiKeys).values({
    organizationId: orgId,
    createdByUserId: userId,
    name,
    prefix: generated.prefix,
    keyHash: generated.keyHash,
    scopes,
    expiresAt,
  }).returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, expiresAt: apiKeys.expiresAt, createdAt: apiKeys.createdAt });
  if (!record) throw new Error("API key could not be stored");
  return NextResponse.json({ data: { ...record, key: generated.rawKey, warning: "Copy this key now. It cannot be displayed again." } }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

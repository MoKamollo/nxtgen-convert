import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

type ApiKeyRecord = { id: string; key: string; name: string; createdAt: string; lastUsed: string | null };
type OrgSettings = { apiKeys?: ApiKeyRecord[]; [key: string]: unknown };

async function getSettings(orgId: string): Promise<OrgSettings | null> {
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return org ? ((org.settings ?? {}) as OrgSettings) : null;
}

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const settings = await getSettings(orgId);
    if (!settings) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const data = (settings.apiKeys ?? []).map(({ key, ...record }) => ({ ...record, maskedKey: `nxg_••••••••${key.slice(-8)}` }));
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const name = String(body.name ?? "Default").trim().slice(0, 80) || "Default";
    const settings = await getSettings(orgId);
    if (!settings) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const record: ApiKeyRecord = {
      id: randomUUID(),
      key: `nxg_${randomBytes(32).toString("hex")}`,
      name,
      createdAt: new Date().toISOString(),
      lastUsed: null,
    };
    await db.update(organizations).set({ settings: { ...settings, apiKeys: [...(settings.apiKeys ?? []), record] }, updatedAt: new Date() }).where(eq(organizations.id, orgId));
    return NextResponse.json({ data: { ...record, key: record.key } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to generate API key" }, { status: 500 });
  }
}

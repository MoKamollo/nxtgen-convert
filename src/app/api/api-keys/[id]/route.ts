import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const settings = (org.settings ?? {}) as Record<string, unknown> & { apiKeys?: Array<{ id: string }> };
    const apiKeys = (settings.apiKeys ?? []).filter(key => key.id !== id);
    await db.update(organizations).set({ settings: { ...settings, apiKeys }, updatedAt: new Date() }).where(eq(organizations.id, orgId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }
}

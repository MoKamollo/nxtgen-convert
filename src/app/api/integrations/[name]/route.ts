import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

const ALLOWED = new Set(["gmail", "outlook", "slack", "google-calendar", "zapier", "postgresql", "webhooks"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { name } = await params;
    if (!ALLOWED.has(name)) return NextResponse.json({ error: "Unsupported integration" }, { status: 400 });
    const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const settings = (org.settings ?? {}) as Record<string, unknown> & { integrations?: Record<string, boolean> };
    await db.update(organizations).set({ settings: { ...settings, integrations: { ...(settings.integrations ?? {}), [name]: true } }, updatedAt: new Date() }).where(eq(organizations.id, orgId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update integration" }, { status: 500 });
  }
}

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

type Webhook = { id: string; url: string; events: string[]; active: boolean; createdAt: string };
type Settings = Record<string, unknown> & { webhooks?: Webhook[] };

async function settingsFor(orgId: string) {
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return org ? ((org.settings ?? {}) as Settings) : null;
}

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const settings = await settingsFor(orgId);
    if (!settings) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    return NextResponse.json({ data: settings.webhooks ?? [] });
  } catch {
    return NextResponse.json({ error: "Failed to fetch webhooks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const url = String(body.url ?? "").trim();
    let parsed: URL;
    try { parsed = new URL(url); } catch { return NextResponse.json({ error: "Enter a valid HTTPS URL" }, { status: 400 }); }
    if (parsed.protocol !== "https:") return NextResponse.json({ error: "Webhook URLs must use HTTPS" }, { status: 400 });
    const events = Array.isArray(body.events) ? body.events.map(String).filter(Boolean) : [];
    if (events.length === 0) return NextResponse.json({ error: "Select at least one event" }, { status: 400 });
    const settings = await settingsFor(orgId);
    if (!settings) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const webhook: Webhook = { id: randomUUID(), url, events, active: true, createdAt: new Date().toISOString() };
    await db.update(organizations).set({ settings: { ...settings, webhooks: [...(settings.webhooks ?? []), webhook] }, updatedAt: new Date() }).where(eq(organizations.id, orgId));
    return NextResponse.json({ data: webhook }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save webhook" }, { status: 500 });
  }
}

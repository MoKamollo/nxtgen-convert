import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const stripePublishableKey = String(body.stripePublishableKey ?? "").trim();
    const stripeWebhookSecret = String(body.stripeWebhookSecret ?? "").trim();
    if (!stripePublishableKey.startsWith("pk_") || !stripeWebhookSecret.startsWith("whsec_")) {
      return NextResponse.json({ error: "Enter a valid Stripe publishable key and webhook secret" }, { status: 400 });
    }
    const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const settings = (org.settings ?? {}) as Record<string, unknown> & { integrations?: Record<string, boolean> };
    await db.update(organizations).set({
      settings: {
        ...settings,
        stripe: { stripePublishableKey, stripeWebhookSecret },
        integrations: { ...(settings.integrations ?? {}), stripe: true },
      },
      updatedAt: new Date(),
    }).where(eq(organizations.id, orgId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to connect Stripe" }, { status: 500 });
  }
}

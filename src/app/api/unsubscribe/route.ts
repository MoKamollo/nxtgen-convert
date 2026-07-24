import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, campaigns } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

export function makeUnsubToken(campaignId: string, email: string): string {
  const secret = process.env.SPACE_SSO_SECRET ?? "dev-secret-change-in-prod";
  return crypto
    .createHmac("sha256", secret)
    .update(`${campaignId}:${email}`)
    .digest("hex")
    .slice(0, 32);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const campaignId = searchParams.get("c");
  const email      = searchParams.get("e");
  const token      = searchParams.get("t");

  if (!campaignId || !email || !token) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const expected = makeUnsubToken(campaignId, email);
  if (expected !== token) {
    return new NextResponse("Invalid or expired unsubscribe link.", { status: 403, headers: { "Content-Type": "text/plain" } });
  }

  try {
    // Find the campaign to get orgId (no auth header needed — this is a public link)
    const [campaign] = await db
      .select({ organizationId: campaigns.organizationId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (campaign) {
      // Add "unsubscribed" tag to contact if not already present
      await db
        .update(contacts)
        .set({
          tags: sql`array_append(COALESCE(${contacts.tags}, ARRAY[]::text[]), 'unsubscribed')`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contacts.email, email.toLowerCase()),
            eq(contacts.organizationId, campaign.organizationId),
            sql`NOT ('unsubscribed' = ANY(COALESCE(${contacts.tags}, ARRAY[]::text[])))`
          )
        );

      // Increment campaign unsubscribed counter
      const [camp] = await db
        .select({ stats: campaigns.stats })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (camp) {
        const stats = (camp.stats ?? {}) as Record<string, number>;
        await db
          .update(campaigns)
          .set({ stats: { ...stats, unsubscribed: (stats.unsubscribed ?? 0) + 1 } })
          .where(eq(campaigns.id, campaignId));
      }
    }
  } catch (err) {
    console.error("[unsubscribe] DB error:", err);
  }

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="margin:0;font-family:Inter,sans-serif;background:#0a0f1e;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="text-align:center;max-width:400px;padding:40px">
    <div style="font-size:40px;margin-bottom:16px">✓</div>
    <h1 style="font-size:20px;font-weight:700;margin-bottom:8px">You've been unsubscribed</h1>
    <p style="color:#94a3b8;font-size:14px">You won't receive any more emails from this sender.</p>
  </div>
</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

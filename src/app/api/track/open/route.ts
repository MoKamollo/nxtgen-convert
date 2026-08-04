import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, emailTrackingEvents } from "@/db/schema";
import { verifyTracking } from "@/lib/email-tracking";
import { clientIp, hashSensitive } from "@/lib/request-security";
import { checkRateLimit } from "@/lib/rate-limit";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(clientIp(request), "email.open", 240, 3600);
  if (!rate.allowed) return new NextResponse(PIXEL, { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
  const campaignId = request.nextUrl.searchParams.get("c") ?? "";
  const recipientId = request.nextUrl.searchParams.get("r") ?? "";
  const signature = request.nextUrl.searchParams.get("sig") ?? "";
  if (campaignId && recipientId && verifyTracking(campaignId, recipientId, "open", signature)) {
    try {
      const [campaign] = await db.select({ organizationId: campaigns.organizationId }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
      if (campaign) {
        const inserted = await db.insert(emailTrackingEvents).values({ organizationId: campaign.organizationId, campaignId, recipientHash: recipientId, eventType: "open", targetHash: "", userAgentHash: hashSensitive(request.headers.get("user-agent") ?? "unknown"), ipHash: hashSensitive(clientIp(request)) }).onConflictDoNothing().returning({ id: emailTrackingEvents.id });
        if (inserted.length > 0) await db.execute(sql`UPDATE campaigns SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{opened}', to_jsonb(COALESCE((stats->>'opened')::int, 0) + 1), true) WHERE id = ${campaignId}`);
      }
    } catch (error) { console.error("[track.open]", error); }
  }
  return new NextResponse(PIXEL, { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0" } });
}

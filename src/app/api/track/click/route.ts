import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, emailTrackingEvents } from "@/db/schema";
import { verifyTracking } from "@/lib/email-tracking";
import { clientIp, hashSensitive } from "@/lib/request-security";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(clientIp(request), "email.click", 120, 3600);
  if (!rate.allowed) return NextResponse.redirect(new URL("/", request.url), 302);
  const campaignId = request.nextUrl.searchParams.get("c") ?? "";
  const recipientId = request.nextUrl.searchParams.get("r") ?? "";
  const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
  const signature = request.nextUrl.searchParams.get("sig") ?? "";
  let destination: URL;
  try { destination = new URL(rawUrl); } catch { return NextResponse.redirect(new URL("/", request.url), 302); }
  if (!["http:", "https:"].includes(destination.protocol) || !verifyTracking(campaignId, recipientId, rawUrl, signature)) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  try {
    const [campaign] = await db.select({ organizationId: campaigns.organizationId }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (campaign) {
      const targetHash = createHash("sha256").update(rawUrl).digest("hex");
      const inserted = await db.insert(emailTrackingEvents).values({
        organizationId: campaign.organizationId,
        campaignId,
        recipientHash: recipientId,
        eventType: "click",
        targetHash,
        userAgentHash: hashSensitive(request.headers.get("user-agent") ?? "unknown"),
        ipHash: hashSensitive(clientIp(request)),
      }).onConflictDoNothing().returning({ id: emailTrackingEvents.id });
      if (inserted.length > 0) {
        await db.execute(sql`UPDATE campaigns SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{clicked}', to_jsonb(COALESCE((stats->>'clicked')::int, 0) + 1), true) WHERE id = ${campaignId}`);
      }
    }
  } catch (error) { console.error("[track.click]", error); }
  return NextResponse.redirect(destination, 302);
}

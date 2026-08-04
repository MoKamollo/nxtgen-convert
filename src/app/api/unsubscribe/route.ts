import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, withTenantDatabase } from "@/db";
import { campaigns, contactConsents, contacts, emailDeliveries, emailSuppressions, emailTrackingEvents } from "@/db/schema";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, hashSensitive } from "@/lib/request-security";

function response(message: string, status = 200) {
  return new NextResponse(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Email preferences</title></head>
<body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#0a0f1e;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="text-align:center;max-width:440px;padding:40px"><h1 style="font-size:20px;font-weight:700;margin-bottom:8px">${message}</h1></div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(clientIp(request), "email.unsubscribe", 60, 60 * 60);
  if (!rate.allowed) return response("Too many requests. Try again later.", 429);

  const campaignId = request.nextUrl.searchParams.get("c") ?? "";
  const deliveryId = request.nextUrl.searchParams.get("d") ?? "";
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!campaignId || !deliveryId || !token || !verifyUnsubscribe(campaignId, deliveryId, token)) {
    return response("This unsubscribe link is invalid or expired.", 403);
  }

  const [delivery] = await db.select({
    organizationId: emailDeliveries.organizationId,
    campaignId: emailDeliveries.campaignId,
    contactId: emailDeliveries.contactId,
    recipientHash: emailDeliveries.recipientHash,
  }).from(emailDeliveries).innerJoin(campaigns, and(
    eq(campaigns.id, emailDeliveries.campaignId),
    eq(campaigns.organizationId, emailDeliveries.organizationId),
  )).where(and(
    eq(emailDeliveries.id, deliveryId),
    eq(emailDeliveries.campaignId, campaignId),
  )).limit(1);
  if (!delivery) return response("This unsubscribe link is invalid or expired.", 404);

  await withTenantDatabase(delivery.organizationId, () => db.transaction(async (tx) => {
    await tx.insert(emailSuppressions).values({
      organizationId: delivery.organizationId,
      recipientHash: delivery.recipientHash,
      channel: "email",
      reason: "unsubscribe",
      source: "recipient",
    }).onConflictDoNothing();

    if (delivery.contactId) {
      await tx.insert(contactConsents).values({
        organizationId: delivery.organizationId,
        contactId: delivery.contactId,
        channel: "email",
        purpose: "marketing",
        status: "revoked",
        source: "unsubscribe_link",
        evidence: { campaignId, deliveryId },
      });
      await tx.update(contacts).set({
        tags: sql`CASE WHEN 'unsubscribed' = ANY(COALESCE(${contacts.tags}, ARRAY[]::text[])) THEN COALESCE(${contacts.tags}, ARRAY[]::text[]) ELSE array_append(COALESCE(${contacts.tags}, ARRAY[]::text[]), 'unsubscribed') END`,
        updatedAt: new Date(),
      }).where(and(eq(contacts.id, delivery.contactId), eq(contacts.organizationId, delivery.organizationId)));
    }

    const inserted = await tx.insert(emailTrackingEvents).values({
      organizationId: delivery.organizationId,
      campaignId,
      recipientHash: delivery.recipientHash,
      eventType: "unsubscribe",
      targetHash: "",
      userAgentHash: hashSensitive(request.headers.get("user-agent") ?? "unknown"),
      ipHash: hashSensitive(clientIp(request)),
    }).onConflictDoNothing().returning({ id: emailTrackingEvents.id });
    if (inserted.length > 0) {
      await tx.execute(sql`UPDATE campaigns SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{unsubscribed}', to_jsonb(COALESCE((stats->>'unsubscribed')::int, 0) + 1), true) WHERE id = ${campaignId} AND organization_id = ${delivery.organizationId}`);
    }
  }));

  return response("You have been unsubscribed.");
}

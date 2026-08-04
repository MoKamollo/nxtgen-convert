import { and, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db, withTenantDatabase } from "@/db";
import {
  campaigns,
  emailDeliveries,
  emailSuppressions,
  integrationEventReceipts,
} from "@/db/schema";
import { recordOperationalEvent } from "@/lib/operations";
import { deliveryStatusTotals } from "@/lib/campaign-analytics";
import {
  isUuid,
  resendDeliveryId,
  resendEventStatus,
  resendEventTime,
  resendProviderError,
  shouldApplyResendStatus,
  SUPPORTED_RESEND_EMAIL_EVENTS,
  type ResendWebhookEvent,
  verifyResendWebhook,
} from "@/lib/resend-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function webhookHeaders(request: NextRequest) {
  return {
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  };
}

async function refreshCampaignStats(organizationId: string, campaignId: string) {
  const rows = await db.select({ status: emailDeliveries.status, total: count() })
    .from(emailDeliveries)
    .where(and(
      eq(emailDeliveries.organizationId, organizationId),
      eq(emailDeliveries.campaignId, campaignId),
    ))
    .groupBy(emailDeliveries.status);

  const totals = new Map<string, number>(rows.map((row) => [String(row.status), Number(row.total)]));
  const [campaign] = await db.select({ stats: campaigns.stats })
    .from(campaigns)
    .where(and(
      eq(campaigns.organizationId, organizationId),
      eq(campaigns.id, campaignId),
    ))
    .limit(1);
  if (!campaign) return;

  const stats = deliveryStatusTotals(totals, campaign.stats);

  await db.update(campaigns).set({
    stats,
    updatedAt: new Date(),
  }).where(and(
    eq(campaigns.organizationId, organizationId),
    eq(campaigns.id, campaignId),
  ));
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!secret || !apiKey) {
    return NextResponse.json({ error: "Resend webhook is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const headers = webhookHeaders(request);
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return NextResponse.json({ error: "Webhook signature headers are required" }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    const resend = new Resend(apiKey);
    event = verifyResendWebhook(resend, rawBody, headers, secret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const type = String(event.type ?? "");
  if (!SUPPORTED_RESEND_EMAIL_EVENTS.has(type)) {
    return new NextResponse(null, { status: 204 });
  }

  const deliveryId = resendDeliveryId(event);
  if (!deliveryId) {
    // The account may also send invitations, tests, or operational email. Those
    // messages are intentionally outside the campaign delivery ledger.
    return new NextResponse(null, { status: 204 });
  }
  if (!isUuid(deliveryId)) {
    return NextResponse.json({ error: "Invalid delivery reference" }, { status: 400 });
  }

  const [resolved] = await db.select({
    id: emailDeliveries.id,
    organizationId: emailDeliveries.organizationId,
    campaignId: emailDeliveries.campaignId,
  }).from(emailDeliveries)
    .where(eq(emailDeliveries.id, deliveryId))
    .limit(1);
  if (!resolved) {
    // A provider event can race the database update after send acceptance. A
    // non-2xx response asks Resend to retry instead of discarding the event.
    return NextResponse.json({ error: "Delivery record is not ready" }, { status: 409 });
  }

  return withTenantDatabase(resolved.organizationId, async () => {
    const inserted = await db.insert(integrationEventReceipts).values({
      organizationId: resolved.organizationId,
      provider: "resend",
      externalEventId: headers.id,
      eventType: type,
      status: "received",
    }).onConflictDoNothing().returning({ id: integrationEventReceipts.id });
    if (inserted.length === 0) return new NextResponse(null, { status: 204 });

    try {
      const [delivery] = await db.select().from(emailDeliveries).where(and(
        eq(emailDeliveries.organizationId, resolved.organizationId),
        eq(emailDeliveries.id, resolved.id),
      )).limit(1);
      if (!delivery) throw new Error("Campaign delivery no longer exists");

      const nextStatus = resendEventStatus(type);
      if (!nextStatus) return new NextResponse(null, { status: 204 });

      if (shouldApplyResendStatus(delivery.status, nextStatus)) {
        const eventTime = resendEventTime(event);
        await db.update(emailDeliveries).set({
          providerMessageId: delivery.providerMessageId ?? event.data?.email_id ?? null,
          status: nextStatus,
          deliveredAt: nextStatus === "delivered" ? eventTime : delivery.deliveredAt,
          failedAt: ["bounced", "complained", "failed", "suppressed"].includes(nextStatus)
            ? eventTime
            : delivery.failedAt,
          lastError: resendProviderError(event),
          updatedAt: new Date(),
        }).where(and(
          eq(emailDeliveries.organizationId, resolved.organizationId),
          eq(emailDeliveries.id, resolved.id),
        ));
      }

      if (["bounced", "complained", "suppressed"].includes(nextStatus)) {
        await db.insert(emailSuppressions).values({
          organizationId: resolved.organizationId,
          recipientHash: delivery.recipientHash,
          channel: "email",
          reason: nextStatus,
          source: "resend_webhook",
        }).onConflictDoNothing();
      }

      await refreshCampaignStats(resolved.organizationId, resolved.campaignId);
      await db.update(integrationEventReceipts).set({
        status: "processed",
        processedAt: new Date(),
      }).where(and(
        eq(integrationEventReceipts.organizationId, resolved.organizationId),
        eq(integrationEventReceipts.id, inserted[0].id),
      ));
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await db.update(integrationEventReceipts).set({
        status: "failed",
        error: message.slice(0, 2000),
        processedAt: new Date(),
      }).where(and(
        eq(integrationEventReceipts.organizationId, resolved.organizationId),
        eq(integrationEventReceipts.id, inserted[0].id),
      ));
      await recordOperationalEvent({
        organizationId: resolved.organizationId,
        severity: "error",
        component: "resend_webhook",
        event: "processing_failed",
        errorCode: error instanceof Error ? error.name : "unknown_error",
        message,
        metadata: {
          providerEventId: headers.id,
          eventType: type,
          deliveryId: resolved.id,
        },
      });
      return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
    }
  });
}

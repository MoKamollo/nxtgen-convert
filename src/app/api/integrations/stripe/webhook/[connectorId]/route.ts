import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, lt, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, withTenantDatabase } from "@/db";
import { analyticsEvents, connectorAccounts, integrationEventReceipts, integrationSecrets } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { decryptSecret } from "@/lib/secret-vault";
import { enqueueWebhookEvent } from "@/lib/webhooks";

function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const values = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(values.find(([key]) => key === "t")?.[1] ?? 0);
  const signatures = values.filter(([key]) => key === "v1").map(([, value]) => value).filter(Boolean);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || signatures.length === 0) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some((signature) => {
    const provided = Buffer.from(signature, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

function domainEvent(type: string): string | null {
  if (["checkout.session.completed", "invoice.paid", "charge.succeeded", "payment_intent.succeeded"].includes(type)) return "payment.received";
  if (type.startsWith("customer.subscription.")) return type.endsWith("deleted") ? "subscription.cancelled" : "subscription.updated";
  if (type === "invoice.payment_failed") return "payment.failed";
  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await params;
  const [connector] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.id, connectorId), eq(connectorAccounts.provider, "stripe"))).limit(1);
  if (!connector?.secretId || connector.status !== "connected") return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  const [secretRecord] = await db.select().from(integrationSecrets).where(and(eq(integrationSecrets.id, connector.secretId), eq(integrationSecrets.organizationId, connector.organizationId))).limit(1);
  if (!secretRecord) return NextResponse.json({ error: "Connector secret missing" }, { status: 500 });
  const credentials = JSON.parse(decryptSecret(secretRecord)) as { webhookSecret?: string };
  if (!credentials.webhookSecret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 409 });

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!verifyStripeSignature(rawBody, signature, credentials.webhookSecret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  let event: { id: string; type: string; created?: number; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!event.id || !event.type) return NextResponse.json({ error: "Invalid Stripe event" }, { status: 400 });

  return withTenantDatabase(connector.organizationId, async () => {
  const [created] = await db.insert(integrationEventReceipts).values({
    organizationId: connector.organizationId,
    provider: "stripe",
    externalEventId: event.id,
    eventType: event.type,
    status: "received",
  }).onConflictDoNothing().returning();

  let receipt = created;
  if (!receipt) {
    const [existing] = await db.select().from(integrationEventReceipts).where(and(
      eq(integrationEventReceipts.organizationId, connector.organizationId),
      eq(integrationEventReceipts.provider, "stripe"),
      eq(integrationEventReceipts.externalEventId, event.id),
    )).limit(1);
    if (existing?.status === "processed") return NextResponse.json({ received: true, duplicate: true });
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    const [claimed] = existing ? await db.update(integrationEventReceipts).set({ status: "received", error: null, receivedAt: new Date() }).where(and(
      eq(integrationEventReceipts.id, existing.id),
      or(eq(integrationEventReceipts.status, "failed"), and(eq(integrationEventReceipts.status, "received"), lt(integrationEventReceipts.receivedAt, staleBefore))),
    )).returning() : [];
    if (!claimed) return NextResponse.json({ received: true, processing: true }, { status: 202 });
    receipt = claimed;
  }

  try {
    const object = event.data?.object ?? {};
    const objectId = typeof object.id === "string" ? object.id : null;
    const objectType = typeof object.object === "string" ? object.object : null;
    await db.insert(analyticsEvents).values({
      organizationId: connector.organizationId,
      event: `stripe.${event.type}`,
      properties: { stripeEventId: event.id, objectId, objectType, providerCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null },
      source: "stripe",
    });
    const emitted = domainEvent(event.type);
    if (emitted) await enqueueWebhookEvent(connector.organizationId, emitted, { stripeEventId: event.id, objectId, objectType, occurredAt: new Date().toISOString() });
    await db.update(integrationEventReceipts).set({ status: "processed", processedAt: new Date(), error: null }).where(eq(integrationEventReceipts.id, receipt.id));
    await db.update(connectorAccounts).set({ healthStatus: "healthy", lastVerifiedAt: new Date(), lastSyncAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(connectorAccounts.id, connector.id));
    await recordAudit({ organizationId: connector.organizationId, actorType: "integration", action: `integration.stripe.${event.type}`, targetType: "stripe_event", targetId: event.id, metadata: { connectorId, objectId, objectType } });
    return NextResponse.json({ received: true });
  } catch (error) {
    await db.update(integrationEventReceipts).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 2_000) : "Processing failed" }).where(eq(integrationEventReceipts.id, receipt.id));
    await db.update(connectorAccounts).set({ healthStatus: "degraded", lastError: "A verified Stripe event failed during processing", updatedAt: new Date() }).where(eq(connectorAccounts.id, connector.id));
    console.error("[stripe.webhook]", error);
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 });
  }
  });
}

import { and, asc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, customerRenewals, subscriptions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";
import { enqueueWebhookEvent } from "@/lib/webhooks";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select({
    id: customerRenewals.id,
    contactId: customerRenewals.contactId,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    email: contacts.email,
    subscriptionId: customerRenewals.subscriptionId,
    renewalDate: customerRenewals.renewalDate,
    amount: customerRenewals.amount,
    currency: customerRenewals.currency,
    status: customerRenewals.status,
    riskLevel: customerRenewals.riskLevel,
    ownerUserId: customerRenewals.ownerUserId,
    notes: customerRenewals.notes,
    renewedAt: customerRenewals.renewedAt,
    createdAt: customerRenewals.createdAt,
    updatedAt: customerRenewals.updatedAt,
  }).from(customerRenewals)
    .innerJoin(contacts, and(eq(contacts.organizationId, organizationId), eq(contacts.id, customerRenewals.contactId)))
    .where(eq(customerRenewals.organizationId, organizationId))
    .orderBy(asc(customerRenewals.renewalDate));
  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const contactId = String(body.contactId ?? "");
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  const renewalDate = new Date(String(body.renewalDate ?? ""));
  if (Number.isNaN(renewalDate.getTime())) return NextResponse.json({ error: "renewalDate is required and must be valid" }, { status: 400 });
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId), isNull(contacts.archivedAt))).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  let subscriptionId: string | null = null;
  if (body.subscriptionId) {
    const [subscription] = await db.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.id, String(body.subscriptionId)), eq(subscriptions.contactId, contactId))).limit(1);
    if (!subscription) return NextResponse.json({ error: "Subscription not found for this contact" }, { status: 404 });
    subscriptionId = subscription.id;
  }
  let amount: string | null = null;
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
    const value = Number(body.amount);
    if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "amount must be zero or greater" }, { status: 400 });
    amount = value.toFixed(2);
  }
  const currency = String(body.currency ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "currency must be a 3 letter ISO code" }, { status: 400 });
  const [renewal] = await db.insert(customerRenewals).values({
    organizationId, contactId, subscriptionId, renewalDate, amount, currency,
    status: "upcoming", riskLevel: "unknown", ownerUserId: body.ownerUserId ? String(body.ownerUserId) : actorUserId,
    notes: body.notes ? String(body.notes).trim().slice(0, 4_000) : null,
  }).returning();
  await recordCustomerTimelineEvent({
    organizationId, contactId, sourceType: "customer_renewal", sourceId: renewal.id,
    eventType: "customer_success.renewal_created", summary: `Renewal scheduled for ${renewalDate.toISOString().slice(0, 10)}`,
    actorUserId, idempotencyKey: `customer_success.renewal_created:${renewal.id}`, metadata: { subscriptionId, amount, currency },
  });
  await enqueueWebhookEvent(organizationId, "customer_success.renewal_created", { renewalId: renewal.id, contactId, renewalDate: renewalDate.toISOString() });
  return NextResponse.json({ data: renewal }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

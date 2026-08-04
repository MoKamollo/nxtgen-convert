import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contactLifecycleHistory, contacts, contactStatusEnum } from "@/db/schema";
import { withApiKeyGuard } from "@/lib/api-guard";
import { triggerAutomation } from "@/lib/automation";
import { enqueueWebhookEvent } from "@/lib/webhooks";
import { findIdentityOwner, normalizeIdentity, syncContactIdentity } from "@/lib/identity-resolution";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const VALID_STATUSES = contactStatusEnum.enumValues;

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id");
  if (!organizationId) return NextResponse.json({ error: "API tenant context missing" }, { status: 401 });
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const conditions = [eq(contacts.organizationId, organizationId), isNull(contacts.archivedAt)];
  if (search) conditions.push(or(ilike(contacts.firstName, `%${search}%`), ilike(contacts.lastName, `%${search}%`), ilike(contacts.email, `%${search}%`))!);
  const where = and(...conditions);
  const [data, count] = await Promise.all([
    db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, status: contacts.status, source: contacts.source, tags: contacts.tags, customFields: contacts.customFields, createdAt: contacts.createdAt, updatedAt: contacts.updatedAt })
      .from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`count(*)` }).from(contacts).where(where),
  ]);
  return NextResponse.json({ data, pagination: { page, limit, total: Number(count[0]?.total ?? 0) } });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id");
  if (!organizationId) return NextResponse.json({ error: "API tenant context missing" }, { status: 401 });
  const body = await request.json();
  const firstName = String(body.firstName ?? "").trim();
  const status = String(body.status ?? "lead");
  if (!firstName || firstName.length > 100) return NextResponse.json({ error: "firstName is required and must be 100 characters or fewer" }, { status: 400 });
  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  let email: string | null = null;
  let phone: string | null = null;
  try {
    email = body.email ? normalizeIdentity("email", String(body.email)) : null;
    phone = body.phone ? normalizeIdentity("phone", String(body.phone)) : null;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid identity" }, { status: 400 });
  }
  if (email) {
    const owner = await findIdentityOwner(organizationId, "email", email);
    const [direct] = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.organizationId, organizationId), isNull(contacts.archivedAt), sql`lower(trim(${contacts.email})) = ${email}`,
    )).limit(1);
    const contactId = owner.contactId ?? direct?.id;
    if (contactId) return NextResponse.json({ error: "A contact with this email already exists", contactId }, { status: 409 });
  }
  const [created] = await db.insert(contacts).values({
    organizationId,
    firstName,
    lastName: body.lastName ? String(body.lastName).trim().slice(0, 100) : null,
    email,
    phone,
    status: status as typeof VALID_STATUSES[number],
    source: body.source ? String(body.source).trim().slice(0, 100) : "api",
    tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 50) : [],
    customFields: body.customFields && typeof body.customFields === "object" ? body.customFields : {},
  }).returning();
  await syncContactIdentity({ organizationId, contactId: created.id, type: "email", rawValue: created.email, source: "public_api" });
  await syncContactIdentity({ organizationId, contactId: created.id, type: "phone", rawValue: created.phone, source: "public_api" });
  await db.insert(contactLifecycleHistory).values({ organizationId, contactId: created.id, fromStage: null, toStage: created.status ?? "lead", source: "public_api" });
  await recordCustomerTimelineEvent({
    organizationId, contactId: created.id, sourceType: "contact", sourceId: created.id, eventType: "contact.created",
    summary: "Contact created through public API", idempotencyKey: `contact.created:${created.id}`, metadata: { source: created.source },
  });
  await triggerAutomation(organizationId, "contact.created", { contactId: created.id, idempotencyKey: `contact.created:${created.id}` });
  await enqueueWebhookEvent(organizationId, "contact.created", { contactId: created.id, source: "public_api", occurredAt: new Date().toISOString() });
  return NextResponse.json({ data: created }, { status: 201 });
}

export const GET = withApiKeyGuard("contacts:read", GETHandler);
export const POST = withApiKeyGuard("contacts:write", POSTHandler);

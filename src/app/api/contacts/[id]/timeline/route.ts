import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, customerTimelineEvents } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const data = await db.select().from(customerTimelineEvents).where(and(
    eq(customerTimelineEvents.organizationId, organizationId),
    eq(customerTimelineEvents.contactId, id),
  )).orderBy(desc(customerTimelineEvents.occurredAt)).limit(200);
  return NextResponse.json({ data });
}

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id");
  const { id } = await params;
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, id))).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const body = await request.json();
  const eventType = String(body.eventType ?? "").trim();
  const summary = String(body.summary ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? crypto.randomUUID()).trim();
  if (!/^[a-zA-Z0-9_.:-]{2,120}$/.test(eventType) || !summary || summary.length > 500 || idempotencyKey.length > 500) {
    return NextResponse.json({ error: "Valid eventType, summary, and idempotencyKey are required" }, { status: 400 });
  }
  await recordCustomerTimelineEvent({
    organizationId, contactId: id,
    sourceType: body.sourceType ? String(body.sourceType).slice(0, 100) : "manual",
    sourceId: body.sourceId ? String(body.sourceId).slice(0, 200) : null,
    eventType, summary,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    actorUserId,
    idempotencyKey,
    occurredAt: body.occurredAt && !Number.isNaN(Date.parse(body.occurredAt)) ? new Date(body.occurredAt) : new Date(),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

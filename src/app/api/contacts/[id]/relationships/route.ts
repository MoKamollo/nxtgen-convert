import { and, desc, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contactRelationships, contacts } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const data = await db.select().from(contactRelationships).where(and(
    eq(contactRelationships.organizationId, organizationId),
    or(eq(contactRelationships.fromContactId, id), eq(contactRelationships.toContactId, id)),
  )).orderBy(desc(contactRelationships.createdAt));
  return NextResponse.json({ data });
}

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id");
  const { id } = await params;
  const body = await request.json();
  const relatedContactId = String(body.relatedContactId ?? "");
  const relationshipType = String(body.relationshipType ?? "").trim().toLowerCase();
  if (!relatedContactId || relatedContactId === id || !/^[a-z0-9_]{2,60}$/.test(relationshipType)) {
    return NextResponse.json({ error: "Valid related contact and relationship type are required" }, { status: 400 });
  }
  const existingContacts = await db.select({ id: contacts.id }).from(contacts).where(and(
    eq(contacts.organizationId, organizationId),
    or(eq(contacts.id, id), eq(contacts.id, relatedContactId)),
  ));
  if (new Set(existingContacts.map((row) => row.id)).size !== 2) return NextResponse.json({ error: "Related contact not found" }, { status: 404 });

  const [record] = await db.insert(contactRelationships).values({
    organizationId,
    fromContactId: id,
    toContactId: relatedContactId,
    relationshipType,
    status: "active",
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    validFrom: body.validFrom && !Number.isNaN(Date.parse(body.validFrom)) ? new Date(body.validFrom) : new Date(),
    validUntil: body.validUntil && !Number.isNaN(Date.parse(body.validUntil)) ? new Date(body.validUntil) : null,
    createdByUserId: actorUserId,
  }).onConflictDoUpdate({
    target: [contactRelationships.organizationId, contactRelationships.fromContactId, contactRelationships.toContactId, contactRelationships.relationshipType],
    set: { status: "active", metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {}, updatedAt: new Date() },
  }).returning();
  await recordCustomerTimelineEvent({
    organizationId, contactId: id, sourceType: "relationship", sourceId: record.id,
    eventType: "relationship.created", summary: `Relationship added: ${relationshipType}`,
    actorUserId, idempotencyKey: `relationship.created:${record.id}:${record.updatedAt.getTime()}`,
    metadata: { relatedContactId, relationshipType },
  });
  return NextResponse.json({ data: record }, { status: 201 });
}

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id");
  const { id } = await params;
  const relationshipId = request.nextUrl.searchParams.get("relationshipId");
  if (!relationshipId) return NextResponse.json({ error: "relationshipId is required" }, { status: 400 });
  const [record] = await db.update(contactRelationships).set({ status: "inactive", updatedAt: new Date() }).where(and(
    eq(contactRelationships.organizationId, organizationId),
    eq(contactRelationships.id, relationshipId),
    or(eq(contactRelationships.fromContactId, id), eq(contactRelationships.toContactId, id)),
  )).returning();
  if (!record) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
  await recordCustomerTimelineEvent({
    organizationId, contactId: id, sourceType: "relationship", sourceId: record.id,
    eventType: "relationship.deactivated", summary: `Relationship deactivated: ${record.relationshipType}`,
    actorUserId, idempotencyKey: `relationship.deactivated:${record.id}:${record.updatedAt.getTime()}`,
  });
  return NextResponse.json({ data: record });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
export const DELETE = withApiGuard(DELETEHandler);

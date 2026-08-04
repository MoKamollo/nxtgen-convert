import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contactIdentityKeys, contacts } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { IdentityType, syncContactIdentity } from "@/lib/identity-resolution";

const TYPES = new Set<IdentityType>(["email", "phone", "external_id"]);

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, id))).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const data = await db.select({
    id: contactIdentityKeys.id,
    type: contactIdentityKeys.identityType,
    displayHint: contactIdentityKeys.displayHint,
    source: contactIdentityKeys.source,
    verified: contactIdentityKeys.verified,
    active: contactIdentityKeys.active,
    firstSeenAt: contactIdentityKeys.firstSeenAt,
    lastSeenAt: contactIdentityKeys.lastSeenAt,
  }).from(contactIdentityKeys).where(and(
    eq(contactIdentityKeys.organizationId, organizationId),
    eq(contactIdentityKeys.contactId, id),
  )).orderBy(desc(contactIdentityKeys.lastSeenAt));
  return NextResponse.json({ data });
}

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, id))).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const body = await request.json();
  const type = String(body.type ?? "") as IdentityType;
  if (!TYPES.has(type) || typeof body.value !== "string") return NextResponse.json({ error: "Valid identity type and value are required" }, { status: 400 });
  const result = await syncContactIdentity({
    organizationId,
    contactId: id,
    type,
    rawValue: body.value,
    source: body.source ? String(body.source).slice(0, 100) : "manual",
    verified: body.verified === true,
  });
  if (result.status === "conflict") {
    return NextResponse.json({
      error: "Identity already belongs to another contact. A review candidate was created.",
      conflictingContactId: result.conflictingContactId,
    }, { status: 409 });
  }
  return NextResponse.json({ status: result.status }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

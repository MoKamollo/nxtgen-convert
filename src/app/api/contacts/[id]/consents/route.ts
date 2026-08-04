import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contactConsents, contacts } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

const CHANNELS = new Set(["email", "sms", "phone", "messaging", "advertising"]);
const STATUSES = new Set(["granted", "denied", "withdrawn", "expired"]);

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id");
  const { id } = await params;
  const data = await db.select().from(contactConsents).where(and(eq(contactConsents.organizationId, organizationId!), eq(contactConsents.contactId, id))).orderBy(desc(contactConsents.effectiveAt));
  return NextResponse.json({ data });
}

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id");
  const actorUserId = request.headers.get("x-user-id");
  const { id } = await params;
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, id), eq(contacts.organizationId, organizationId!))).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const body = await request.json();
  const channel = String(body.channel ?? "").toLowerCase();
  const purpose = String(body.purpose ?? "marketing").trim().toLowerCase();
  const status = String(body.status ?? "").toLowerCase();
  if (!CHANNELS.has(channel) || !STATUSES.has(status) || !purpose || purpose.length > 100) return NextResponse.json({ error: "Invalid consent record" }, { status: 400 });
  const [record] = await db.insert(contactConsents).values({
    organizationId: organizationId!, contactId: id, channel, purpose, status,
    lawfulBasis: body.lawfulBasis ? String(body.lawfulBasis).slice(0, 100) : null,
    source: body.source ? String(body.source).slice(0, 100) : "manual",
    evidence: body.evidence && typeof body.evidence === "object" ? body.evidence : {},
    effectiveAt: body.effectiveAt && !Number.isNaN(Date.parse(body.effectiveAt)) ? new Date(body.effectiveAt) : new Date(),
    expiresAt: body.expiresAt && !Number.isNaN(Date.parse(body.expiresAt)) ? new Date(body.expiresAt) : null,
    recordedByUserId: actorUserId,
  }).returning();
  return NextResponse.json({ data: record }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contactLifecycleHistory, contacts } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { findIdentityOwner, normalizeIdentity, syncContactIdentity } from "@/lib/identity-resolution";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const SCORE_FIELDS = ["email","phone","jobTitle","source","status"] as const;
const VALID_STATUSES = new Set(["lead", "prospect", "customer", "churned", "vip"]);

function calcScore(data: { email?: string; phone?: string; jobTitle?: string; source?: string; status?: string }): number {
  const statusBase: Record<string, number> = { vip: 90, customer: 70, prospect: 45, lead: 25, churned: 10 };
  const sourceBonus: Record<string, number> = { referral: 15, organic: 10, event: 8, paid_ads: 5, cold_outreach: 2, other: 3 };
  let score = statusBase[data.status ?? "lead"] ?? 25;
  if (data.email) score += 10;
  if (data.phone) score += 5;
  if (data.jobTitle) score += 5;
  score += sourceBonus[data.source ?? ""] ?? 0;
  return Math.min(score, 100);
}

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id");
  const { id } = await params;
  const body = await request.json();

  const [current] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.organizationId, orgId), isNull(contacts.archivedAt))).limit(1);
  if (!current) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (body.status !== undefined && !VALID_STATUSES.has(String(body.status))) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  let normalizedEmail = current.email;
  if (body.email !== undefined) {
    normalizedEmail = body.email ? normalizeIdentity("email", String(body.email)) : null;
    if (normalizedEmail && normalizedEmail !== current.email?.trim().toLowerCase()) {
      const owner = await findIdentityOwner(orgId, "email", normalizedEmail);
      const [directMatch] = await db.select({ id: contacts.id }).from(contacts).where(and(
        eq(contacts.organizationId, orgId),
        isNull(contacts.archivedAt),
        sql`lower(trim(${contacts.email})) = ${normalizedEmail}`,
      )).limit(1);
      const conflictingId = owner.contactId ?? directMatch?.id;
      if (conflictingId && conflictingId !== id) return NextResponse.json({ error: "This email belongs to another contact", contactId: conflictingId }, { status: 409 });
    }
  }
  const normalizedPhone = body.phone !== undefined
    ? (body.phone ? normalizeIdentity("phone", String(body.phone)) : null)
    : current.phone;

  const allowed = ["firstName","lastName","email","phone","status","jobTitle","source","score","tags","companyId","ownerId","lastContactedAt","department","website","linkedIn","twitter","address","customFields"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key];
  if (body.email !== undefined) updates.email = normalizedEmail;
  if (body.phone !== undefined) updates.phone = normalizedPhone;
  if (body.firstName !== undefined) updates.firstName = String(body.firstName).trim().slice(0, 100);
  if (body.lastName !== undefined) updates.lastName = body.lastName ? String(body.lastName).trim().slice(0, 100) : null;

  const touchesScore = SCORE_FIELDS.some((field) => body[field] !== undefined);
  if (touchesScore && body.score === undefined) {
    updates.score = calcScore({
      email: normalizedEmail ?? undefined,
      phone: normalizedPhone ?? undefined,
      jobTitle: body.jobTitle ?? current.jobTitle ?? undefined,
      source: body.source ?? current.source ?? undefined,
      status: body.status ?? current.status ?? undefined,
    });
  }
  updates.updatedAt = new Date();

  const [updated] = await db.update(contacts).set(updates).where(and(eq(contacts.id, id), eq(contacts.organizationId, orgId))).returning();
  await syncContactIdentity({ organizationId: orgId, contactId: id, type: "email", rawValue: updated.email, source: "contact_update" });
  await syncContactIdentity({ organizationId: orgId, contactId: id, type: "phone", rawValue: updated.phone, source: "contact_update" });

  if (updated.status !== current.status) {
    await db.insert(contactLifecycleHistory).values({
      organizationId: orgId,
      contactId: id,
      fromStage: current.status,
      toStage: updated.status ?? "lead",
      reason: body.lifecycleReason ? String(body.lifecycleReason).slice(0, 500) : null,
      source: "contact_update",
      actorUserId,
    });
  }
  await recordCustomerTimelineEvent({
    organizationId: orgId,
    contactId: id,
    sourceType: "contact",
    sourceId: id,
    eventType: "contact.updated",
    summary: updated.status !== current.status ? `Lifecycle stage changed to ${updated.status}` : "Contact profile updated",
    actorUserId,
    idempotencyKey: `contact.updated:${id}:${updated.updatedAt.getTime()}`,
    metadata: { changedFields: Object.keys(updates).filter((key) => key !== "updatedAt"), fromStatus: current.status, toStatus: updated.status },
  });
  return NextResponse.json({ data: updated });
}

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id");
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { body = {}; }
  const [archived] = await db.update(contacts).set({
    archivedAt: new Date(),
    archivedByUserId: actorUserId,
    deletionReason: body.reason ? String(body.reason).slice(0, 500) : "user_requested",
    updatedAt: new Date(),
  }).where(and(eq(contacts.id, id), eq(contacts.organizationId, orgId), isNull(contacts.archivedAt))).returning({ id: contacts.id, archivedAt: contacts.archivedAt });
  if (!archived) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  await syncContactIdentity({ organizationId: orgId, contactId: id, type: "email", rawValue: null, source: "contact_archive" });
  await syncContactIdentity({ organizationId: orgId, contactId: id, type: "phone", rawValue: null, source: "contact_archive" });
  await recordCustomerTimelineEvent({
    organizationId: orgId, contactId: id, sourceType: "contact", sourceId: id, eventType: "contact.archived",
    summary: "Contact archived", actorUserId, idempotencyKey: `contact.archived:${id}:${archived.archivedAt?.getTime() ?? Date.now()}`,
    metadata: { reason: body.reason ?? "user_requested" },
  });
  return NextResponse.json({ ok: true, archivedAt: archived.archivedAt });
}

export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

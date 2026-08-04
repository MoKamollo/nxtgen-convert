import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, customerReferrals, loyaltyPrograms } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { createReferralCode, hashReferralCode, referralCodeHint } from "@/lib/loyalty-code";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select().from(customerReferrals).where(eq(customerReferrals.organizationId, organizationId)).orderBy(desc(customerReferrals.createdAt)).limit(500);
  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const programId = String(body.programId ?? "");
  const referrerContactId = String(body.referrerContactId ?? "");
  const referredContactId = body.referredContactId ? String(body.referredContactId) : null;
  if (!programId || !referrerContactId) return NextResponse.json({ error: "programId and referrerContactId are required" }, { status: 400 });
  if (referredContactId === referrerContactId) return NextResponse.json({ error: "A customer cannot refer themselves" }, { status: 409 });
  const [[program], [referrer], referred] = await Promise.all([
    db.select({ id: loyaltyPrograms.id, name: loyaltyPrograms.name }).from(loyaltyPrograms).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.status, "active"))).limit(1),
    db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, referrerContactId), isNull(contacts.archivedAt))).limit(1),
    referredContactId ? db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, referredContactId), isNull(contacts.archivedAt))).limit(1) : Promise.resolve([]),
  ]);
  if (!program) return NextResponse.json({ error: "Active loyalty program not found" }, { status: 404 });
  if (!referrer) return NextResponse.json({ error: "Referrer contact not found" }, { status: 404 });
  if (referredContactId && !referred[0]) return NextResponse.json({ error: "Referred contact not found" }, { status: 404 });
  if (referredContactId) {
    const [duplicate] = await db.select({ id: customerReferrals.id }).from(customerReferrals).where(and(eq(customerReferrals.organizationId, organizationId), eq(customerReferrals.programId, programId), eq(customerReferrals.referredContactId, referredContactId), inArray(customerReferrals.status, ["pending", "qualified"]))).limit(1);
    if (duplicate) return NextResponse.json({ error: "This referred customer already has an unresolved referral" }, { status: 409 });
  }
  const code = createReferralCode();
  const [referral] = await db.insert(customerReferrals).values({
    organizationId, programId, referrerContactId, referredContactId,
    referralCodeHash: hashReferralCode(code), referralCodeHint: referralCodeHint(code), status: "pending",
    qualificationEvent: body.qualificationEvent ? String(body.qualificationEvent).trim().slice(0, 120) : null,
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {}, createdByUserId: actorUserId,
  }).returning();
  await recordCustomerTimelineEvent({ organizationId, contactId: referrerContactId, sourceType: "customer_referral", sourceId: referral.id, eventType: "loyalty.referral_created", summary: `Referral created for ${program.name}`, actorUserId, idempotencyKey: `loyalty.referral_created:${referral.id}`, metadata: { programId, referredContactId } });
  return NextResponse.json({ data: { ...referral, referralCode: code }, warning: "The referral code is shown once. Store it securely." }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

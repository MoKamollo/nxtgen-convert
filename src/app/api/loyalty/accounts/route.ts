import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, loyaltyAccounts, loyaltyPrograms, loyaltyTiers } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select({
    id: loyaltyAccounts.id, programId: loyaltyAccounts.programId, programName: loyaltyPrograms.name,
    contactId: loyaltyAccounts.contactId, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email,
    currentBalance: loyaltyAccounts.currentBalance, lifetimeEarned: loyaltyAccounts.lifetimeEarned, lifetimeRedeemed: loyaltyAccounts.lifetimeRedeemed,
    tierName: loyaltyTiers.name, status: loyaltyAccounts.status, createdAt: loyaltyAccounts.createdAt, updatedAt: loyaltyAccounts.updatedAt,
  }).from(loyaltyAccounts)
    .innerJoin(loyaltyPrograms, and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, loyaltyAccounts.programId)))
    .innerJoin(contacts, and(eq(contacts.organizationId, organizationId), eq(contacts.id, loyaltyAccounts.contactId)))
    .leftJoin(loyaltyTiers, and(eq(loyaltyTiers.organizationId, organizationId), eq(loyaltyTiers.id, loyaltyAccounts.currentTierId)))
    .where(eq(loyaltyAccounts.organizationId, organizationId)).orderBy(desc(loyaltyAccounts.updatedAt));
  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const programId = String(body.programId ?? "");
  const contactId = String(body.contactId ?? "");
  if (!programId || !contactId) return NextResponse.json({ error: "programId and contactId are required" }, { status: 400 });
  const [[program], [contact]] = await Promise.all([
    db.select().from(loyaltyPrograms).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.status, "active"))).limit(1),
    db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId), isNull(contacts.archivedAt))).limit(1),
  ]);
  if (!program?.activeVersionId) return NextResponse.json({ error: "Active published loyalty program not found" }, { status: 404 });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const [existing] = await db.select().from(loyaltyAccounts).where(and(eq(loyaltyAccounts.organizationId, organizationId), eq(loyaltyAccounts.programId, programId), eq(loyaltyAccounts.contactId, contactId))).limit(1);
  if (existing) return NextResponse.json({ data: existing, existing: true });
  const [tier] = await db.select().from(loyaltyTiers).where(and(eq(loyaltyTiers.organizationId, organizationId), eq(loyaltyTiers.programVersionId, program.activeVersionId), eq(loyaltyTiers.minimumLifetimePoints, 0))).limit(1);
  const [account] = await db.insert(loyaltyAccounts).values({ organizationId, programId, contactId, currentTierId: tier?.id ?? null }).returning();
  await recordCustomerTimelineEvent({ organizationId, contactId, sourceType: "loyalty_account", sourceId: account.id, eventType: "loyalty.account_created", summary: `Joined loyalty program: ${program.name}`, actorUserId, idempotencyKey: `loyalty.account_created:${account.id}`, metadata: { programId } });
  return NextResponse.json({ data: account }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

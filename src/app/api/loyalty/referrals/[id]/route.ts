import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerReferrals, loyaltyAccounts, loyaltyPrograms, loyaltyProgramVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { postLoyaltyTransaction } from "@/lib/loyalty-ledger";
import { validateLoyaltyProgramDefinition } from "@/lib/loyalty-programs";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const STATUSES = new Set(["pending", "qualified", "rewarded", "rejected", "cancelled"]);
async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const status = String(body.status ?? "");
  if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid referral status" }, { status: 400 });
  const [referral] = await db.select().from(customerReferrals).where(and(eq(customerReferrals.organizationId, organizationId), eq(customerReferrals.id, id))).limit(1);
  if (!referral) return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  if (["rewarded", "rejected", "cancelled"].includes(referral.status)) return NextResponse.json({ error: "Finalized referrals cannot be changed" }, { status: 409 });
  if (status === "rewarded" && referral.status !== "qualified") return NextResponse.json({ error: "Referral must be qualified before reward" }, { status: 409 });

  let rewardTransactionId: string | null = referral.rewardTransactionId;
  if (status === "rewarded") {
    const [program] = await db.select().from(loyaltyPrograms).where(and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, referral.programId), eq(loyaltyPrograms.status, "active"))).limit(1);
    if (!program?.activeVersionId) return NextResponse.json({ error: "Active program version not found" }, { status: 409 });
    const [version] = await db.select().from(loyaltyProgramVersions).where(and(eq(loyaltyProgramVersions.organizationId, organizationId), eq(loyaltyProgramVersions.id, program.activeVersionId))).limit(1);
    if (!version) return NextResponse.json({ error: "Active program version not found" }, { status: 409 });
    const definition = validateLoyaltyProgramDefinition(version.definition);
    if (definition.referralReward <= 0) return NextResponse.json({ error: "Published program does not define a referral reward" }, { status: 409 });
    const [account] = await db.select().from(loyaltyAccounts).where(and(eq(loyaltyAccounts.organizationId, organizationId), eq(loyaltyAccounts.programId, referral.programId), eq(loyaltyAccounts.contactId, referral.referrerContactId), eq(loyaltyAccounts.status, "active"))).limit(1);
    if (!account) return NextResponse.json({ error: "Referrer needs an active loyalty account" }, { status: 409 });
    const reward = await postLoyaltyTransaction({ organizationId, accountId: account.id, transactionType: "earn", points: definition.referralReward, sourceType: "referral", sourceId: referral.id, description: "Qualified referral reward", idempotencyKey: `referral_reward:${referral.id}`, actorUserId, forceReview: Boolean(body.forceReview) });
    if (reward.held) return NextResponse.json({ error: "Referral reward is held for fraud review", transactionId: reward.transaction.id }, { status: 409 });
    rewardTransactionId = reward.transaction.id;
  }
  const now = new Date();
  const [updated] = await db.update(customerReferrals).set({
    status,
    referredContactId: body.referredContactId !== undefined ? (body.referredContactId ? String(body.referredContactId) : null) : referral.referredContactId,
    qualifiedAt: status === "qualified" ? now : referral.qualifiedAt,
    rewardedAt: status === "rewarded" ? now : referral.rewardedAt,
    rewardTransactionId,
    updatedAt: now,
  }).where(and(eq(customerReferrals.organizationId, organizationId), eq(customerReferrals.id, id))).returning();
  await recordCustomerTimelineEvent({ organizationId, contactId: referral.referrerContactId, sourceType: "customer_referral", sourceId: id, eventType: "loyalty.referral_status_changed", summary: `Referral changed from ${referral.status} to ${status}`, actorUserId, idempotencyKey: `loyalty.referral_status:${id}:${status}:${now.toISOString()}`, metadata: { rewardTransactionId } });
  return NextResponse.json({ data: updated });
}
export const PATCH = withApiGuard(PATCHHandler);

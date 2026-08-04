import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerReferrals, loyaltyFraudReviews, loyaltyPointTransactions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { postLoyaltyTransaction } from "@/lib/loyalty-ledger";

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const decision = String(body.decision ?? "");
  if (!["approved", "rejected"].includes(decision)) return NextResponse.json({ error: "decision must be approved or rejected" }, { status: 400 });
  const [review] = await db.select().from(loyaltyFraudReviews).where(and(eq(loyaltyFraudReviews.organizationId, organizationId), eq(loyaltyFraudReviews.id, id), eq(loyaltyFraudReviews.status, "open"))).limit(1);
  if (!review) return NextResponse.json({ error: "Open fraud review not found" }, { status: 404 });
  let releaseTransactionId: string | null = null;
  if (decision === "approved" && review.transactionId) {
    const [held] = await db.select().from(loyaltyPointTransactions).where(and(eq(loyaltyPointTransactions.organizationId, organizationId), eq(loyaltyPointTransactions.id, review.transactionId), eq(loyaltyPointTransactions.status, "held"))).limit(1);
    if (!held) return NextResponse.json({ error: "Held transaction not found" }, { status: 409 });
    const release = await postLoyaltyTransaction({ organizationId, accountId: held.accountId, transactionType: "hold_release", points: held.points, sourceType: "fraud_review", sourceId: review.id, description: `Approved held transaction ${held.id}`, idempotencyKey: `fraud_release:${review.id}`, relatedTransactionId: held.id, actorUserId });
    if (release.held) return NextResponse.json({ error: "Release unexpectedly triggered another review" }, { status: 409 });
    releaseTransactionId = release.transaction.id;
    if (held.sourceType === "referral" && held.sourceId) {
      await db.update(customerReferrals).set({ status: "rewarded", rewardTransactionId: release.transaction.id, rewardedAt: new Date(), updatedAt: new Date() }).where(and(
        eq(customerReferrals.organizationId, organizationId), eq(customerReferrals.id, held.sourceId), eq(customerReferrals.status, "qualified"),
      ));
    }
  }
  const [updated] = await db.update(loyaltyFraudReviews).set({ status: decision, assignedUserId: actorUserId, resolutionNotes: body.resolutionNotes ? String(body.resolutionNotes).trim().slice(0, 4_000) : null, resolvedAt: new Date(), updatedAt: new Date(), evidence: { ...(review.evidence as Record<string, unknown>), releaseTransactionId } }).where(and(eq(loyaltyFraudReviews.organizationId, organizationId), eq(loyaltyFraudReviews.id, id))).returning();
  return NextResponse.json({ data: updated });
}
export const PATCH = withApiGuard(PATCHHandler);

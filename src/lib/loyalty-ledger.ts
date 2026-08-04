import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { loyaltyAccounts, loyaltyFraudReviews, loyaltyPointTransactions, loyaltyPrograms, loyaltyProgramVersions, loyaltyTiers } from "@/db/schema";
import { validateLoyaltyProgramDefinition } from "@/lib/loyalty-programs";

export type LoyaltyTransactionInput = {
  organizationId: string;
  accountId: string;
  transactionType: "earn" | "redeem" | "adjustment" | "expiration" | "reversal" | "hold_release";
  points?: number;
  eventType?: string;
  sourceType: string;
  sourceId?: string | null;
  description?: string | null;
  idempotencyKey: string;
  relatedTransactionId?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  forceReview?: boolean;
};

export async function postLoyaltyTransaction(input: LoyaltyTransactionInput) {
  if (!input.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
  return db.transaction(async (tx) => {
    const duplicate = await tx.select().from(loyaltyPointTransactions).where(and(eq(loyaltyPointTransactions.organizationId, input.organizationId), eq(loyaltyPointTransactions.idempotencyKey, input.idempotencyKey))).limit(1);
    if (duplicate[0]) return { transaction: duplicate[0], duplicate: true, held: duplicate[0].status === "held" };

    await tx.execute(sql`SELECT id FROM loyalty_accounts WHERE organization_id = ${input.organizationId}::uuid AND id = ${input.accountId}::uuid FOR UPDATE`);
    const [account] = await tx.select().from(loyaltyAccounts).where(and(eq(loyaltyAccounts.organizationId, input.organizationId), eq(loyaltyAccounts.id, input.accountId))).limit(1);
    if (!account || account.status !== "active") throw new Error("Active loyalty account not found");
    const [program] = await tx.select().from(loyaltyPrograms).where(and(eq(loyaltyPrograms.organizationId, input.organizationId), eq(loyaltyPrograms.id, account.programId), eq(loyaltyPrograms.status, "active"))).limit(1);
    if (!program?.activeVersionId) throw new Error("Loyalty program has no active published version");
    const [version] = await tx.select().from(loyaltyProgramVersions).where(and(eq(loyaltyProgramVersions.organizationId, input.organizationId), eq(loyaltyProgramVersions.id, program.activeVersionId), eq(loyaltyProgramVersions.status, "published"))).limit(1);
    if (!version) throw new Error("Active loyalty program version not found");
    const definition = validateLoyaltyProgramDefinition(version.definition);

    let rawPoints = input.points;
    if (input.transactionType === "reversal") {
      if (!input.relatedTransactionId) throw new Error("relatedTransactionId is required for a reversal");
      const [related] = await tx.select().from(loyaltyPointTransactions).where(and(
        eq(loyaltyPointTransactions.organizationId, input.organizationId),
        eq(loyaltyPointTransactions.accountId, input.accountId),
        eq(loyaltyPointTransactions.id, input.relatedTransactionId),
        eq(loyaltyPointTransactions.status, "posted"),
      )).limit(1);
      if (!related) throw new Error("Posted transaction to reverse was not found");
      const [priorReversal] = await tx.select({ id: loyaltyPointTransactions.id }).from(loyaltyPointTransactions).where(and(
        eq(loyaltyPointTransactions.organizationId, input.organizationId),
        eq(loyaltyPointTransactions.accountId, input.accountId),
        eq(loyaltyPointTransactions.relatedTransactionId, related.id),
        eq(loyaltyPointTransactions.transactionType, "reversal"),
        eq(loyaltyPointTransactions.status, "posted"),
      )).limit(1);
      if (priorReversal) throw new Error("This transaction has already been reversed");
      rawPoints = -related.points;
    }
    if (input.eventType) {
      const rule = definition.earnRules.find((candidate) => candidate.eventType === input.eventType);
      if (!rule) throw new Error("No published earn rule matches this eventType");
      rawPoints = rule.points;
    }
    if (!Number.isInteger(rawPoints) || rawPoints === 0) throw new Error("points must be a nonzero whole number");
    let points = Number(rawPoints);
    if (input.transactionType === "earn") points = Math.abs(points);
    if (["redeem", "expiration"].includes(input.transactionType)) points = -Math.abs(points);
    if (Math.abs(points) > definition.maxPointsPerTransaction) throw new Error("Points exceed the published per transaction limit");

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const [todayEarned] = points > 0 ? await tx.select({ total: sql<number>`COALESCE(SUM(${loyaltyPointTransactions.points}), 0)` }).from(loyaltyPointTransactions).where(and(
      eq(loyaltyPointTransactions.organizationId, input.organizationId), eq(loyaltyPointTransactions.accountId, input.accountId), eq(loyaltyPointTransactions.status, "posted"), gte(loyaltyPointTransactions.occurredAt, today), sql`${loyaltyPointTransactions.points} > 0`,
    )) : [{ total: 0 }];
    const reasonCodes: string[] = [];
    const reviewExempt = input.transactionType === "hold_release" || input.transactionType === "reversal";
    if (!reviewExempt && Math.abs(points) >= definition.fraudReviewThreshold) reasonCodes.push("transaction_threshold");
    if (!reviewExempt && points > 0 && Number(todayEarned?.total ?? 0) + points > definition.dailyEarnLimit) reasonCodes.push("daily_earn_limit");
    if (!reviewExempt && input.forceReview) reasonCodes.push("manual_review_required");
    const held = reasonCodes.length > 0;
    if (!held && account.currentBalance + points < 0) throw new Error("Insufficient loyalty point balance");

    const [transaction] = await tx.insert(loyaltyPointTransactions).values({
      organizationId: input.organizationId, accountId: account.id, programVersionId: version.id,
      transactionType: input.transactionType, points, status: held ? "held" : "posted", sourceType: input.sourceType.slice(0, 120),
      sourceId: input.sourceId?.slice(0, 200) ?? null, description: input.description?.slice(0, 500) ?? null,
      idempotencyKey: input.idempotencyKey.slice(0, 300), relatedTransactionId: input.relatedTransactionId ?? null,
      metadata: { ...(input.metadata ?? {}), eventType: input.eventType ?? null, reasonCodes }, createdByUserId: input.actorUserId ?? null,
    }).returning();
    if (held) {
      await tx.insert(loyaltyFraudReviews).values({
        organizationId: input.organizationId, transactionId: transaction.id,
        riskLevel: reasonCodes.includes("daily_earn_limit") ? "high" : "medium", status: "open", reasonCodes,
        evidence: { points, currentBalance: account.currentBalance, todayEarned: Number(todayEarned?.total ?? 0), publishedLimits: { fraudReviewThreshold: definition.fraudReviewThreshold, dailyEarnLimit: definition.dailyEarnLimit } },
      });
      return { transaction, duplicate: false, held: true };
    }

    const lifetimeEarned = account.lifetimeEarned + Math.max(points, 0);
    const lifetimeRedeemed = account.lifetimeRedeemed + Math.max(-points, 0);
    const tiers = await tx.select().from(loyaltyTiers).where(and(eq(loyaltyTiers.organizationId, input.organizationId), eq(loyaltyTiers.programVersionId, version.id))).orderBy(desc(loyaltyTiers.minimumLifetimePoints));
    const tier = tiers.find((candidate) => candidate.minimumLifetimePoints <= lifetimeEarned) ?? null;
    await tx.update(loyaltyAccounts).set({ currentBalance: account.currentBalance + points, lifetimeEarned, lifetimeRedeemed, currentTierId: tier?.id ?? null, updatedAt: new Date() }).where(and(eq(loyaltyAccounts.organizationId, input.organizationId), eq(loyaltyAccounts.id, account.id)));
    return { transaction, duplicate: false, held: false, balance: account.currentBalance + points, tierId: tier?.id ?? null };
  });
}

import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, customerReferrals, loyaltyAccounts, loyaltyFraudReviews, loyaltyPointTransactions, loyaltyPrograms, loyaltyTiers } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const [programs, accountSummary, transactionSummary, referrals, reviews, accounts, transactions] = await Promise.all([
    db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.organizationId, organizationId)).orderBy(desc(loyaltyPrograms.updatedAt)),
    db.select({ accounts: sql<number>`count(*)`, pointsOutstanding: sql<number>`COALESCE(SUM(${loyaltyAccounts.currentBalance}), 0)`, lifetimeEarned: sql<number>`COALESCE(SUM(${loyaltyAccounts.lifetimeEarned}), 0)`, lifetimeRedeemed: sql<number>`COALESCE(SUM(${loyaltyAccounts.lifetimeRedeemed}), 0)` }).from(loyaltyAccounts).where(eq(loyaltyAccounts.organizationId, organizationId)),
    db.select({ held: sql<number>`count(*) FILTER (WHERE ${loyaltyPointTransactions.status} = 'held')`, posted: sql<number>`count(*) FILTER (WHERE ${loyaltyPointTransactions.status} = 'posted')` }).from(loyaltyPointTransactions).where(eq(loyaltyPointTransactions.organizationId, organizationId)),
    db.select().from(customerReferrals).where(eq(customerReferrals.organizationId, organizationId)).orderBy(desc(customerReferrals.createdAt)).limit(100),
    db.select().from(loyaltyFraudReviews).where(and(eq(loyaltyFraudReviews.organizationId, organizationId), eq(loyaltyFraudReviews.status, "open"))).orderBy(desc(loyaltyFraudReviews.createdAt)).limit(100),
    db.select({ id: loyaltyAccounts.id, programId: loyaltyAccounts.programId, programName: loyaltyPrograms.name, contactId: loyaltyAccounts.contactId, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, currentBalance: loyaltyAccounts.currentBalance, lifetimeEarned: loyaltyAccounts.lifetimeEarned, lifetimeRedeemed: loyaltyAccounts.lifetimeRedeemed, tierName: loyaltyTiers.name, status: loyaltyAccounts.status, updatedAt: loyaltyAccounts.updatedAt }).from(loyaltyAccounts)
      .innerJoin(loyaltyPrograms, and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, loyaltyAccounts.programId)))
      .innerJoin(contacts, and(eq(contacts.organizationId, organizationId), eq(contacts.id, loyaltyAccounts.contactId)))
      .leftJoin(loyaltyTiers, and(eq(loyaltyTiers.organizationId, organizationId), eq(loyaltyTiers.id, loyaltyAccounts.currentTierId)))
      .where(eq(loyaltyAccounts.organizationId, organizationId)).orderBy(desc(loyaltyAccounts.updatedAt)).limit(200),
    db.select({ id: loyaltyPointTransactions.id, accountId: loyaltyPointTransactions.accountId, points: loyaltyPointTransactions.points, status: loyaltyPointTransactions.status, transactionType: loyaltyPointTransactions.transactionType, sourceType: loyaltyPointTransactions.sourceType, description: loyaltyPointTransactions.description, occurredAt: loyaltyPointTransactions.occurredAt }).from(loyaltyPointTransactions).where(eq(loyaltyPointTransactions.organizationId, organizationId)).orderBy(desc(loyaltyPointTransactions.occurredAt)).limit(100),
  ]);
  return NextResponse.json({ data: {
    summary: { programs: programs.length, activePrograms: programs.filter((item) => item.status === "active").length, accounts: Number(accountSummary[0]?.accounts ?? 0), pointsOutstanding: Number(accountSummary[0]?.pointsOutstanding ?? 0), lifetimeEarned: Number(accountSummary[0]?.lifetimeEarned ?? 0), lifetimeRedeemed: Number(accountSummary[0]?.lifetimeRedeemed ?? 0), heldTransactions: Number(transactionSummary[0]?.held ?? 0), openFraudReviews: reviews.length, referrals: referrals.length, rewardedReferrals: referrals.filter((item) => item.status === "rewarded").length },
    programs, accounts, transactions, referrals, reviews,
    methodology: "Balances are the sum of posted append-only ledger entries. Held transactions do not affect balances. Referral rewards are not counted until a posted reward transaction exists.",
  } });
}
export const GET = withApiGuard(GETHandler);

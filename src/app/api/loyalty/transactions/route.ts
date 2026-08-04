import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, loyaltyAccounts, loyaltyPointTransactions, loyaltyPrograms } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { postLoyaltyTransaction } from "@/lib/loyalty-ledger";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";
import { enqueueWebhookEvent } from "@/lib/webhooks";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select({
    id: loyaltyPointTransactions.id, accountId: loyaltyPointTransactions.accountId, contactId: loyaltyAccounts.contactId,
    firstName: contacts.firstName, lastName: contacts.lastName, programName: loyaltyPrograms.name,
    transactionType: loyaltyPointTransactions.transactionType, points: loyaltyPointTransactions.points, status: loyaltyPointTransactions.status,
    sourceType: loyaltyPointTransactions.sourceType, description: loyaltyPointTransactions.description, occurredAt: loyaltyPointTransactions.occurredAt,
  }).from(loyaltyPointTransactions)
    .innerJoin(loyaltyAccounts, and(eq(loyaltyAccounts.organizationId, organizationId), eq(loyaltyAccounts.id, loyaltyPointTransactions.accountId)))
    .innerJoin(contacts, and(eq(contacts.organizationId, organizationId), eq(contacts.id, loyaltyAccounts.contactId)))
    .innerJoin(loyaltyPrograms, and(eq(loyaltyPrograms.organizationId, organizationId), eq(loyaltyPrograms.id, loyaltyAccounts.programId)))
    .where(eq(loyaltyPointTransactions.organizationId, organizationId)).orderBy(desc(loyaltyPointTransactions.occurredAt)).limit(500);
  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const accountId = String(body.accountId ?? "");
  const transactionType = String(body.transactionType ?? "");
  const sourceType = String(body.sourceType ?? "manual").trim().slice(0, 120);
  const idempotencyKey = String(body.idempotencyKey ?? "").trim().slice(0, 300);
  if (!accountId || !["earn", "redeem", "adjustment", "expiration", "reversal"].includes(transactionType)) return NextResponse.json({ error: "Valid accountId and transactionType are required" }, { status: 400 });
  if (!idempotencyKey) return NextResponse.json({ error: "idempotencyKey is required" }, { status: 400 });
  try {
    const result = await postLoyaltyTransaction({
      organizationId, accountId, transactionType: transactionType as "earn" | "redeem" | "adjustment" | "expiration" | "reversal",
      points: body.points === undefined ? undefined : Number(body.points), eventType: body.eventType ? String(body.eventType) : undefined,
      sourceType, sourceId: body.sourceId ? String(body.sourceId) : null, description: body.description ? String(body.description) : null,
      idempotencyKey, relatedTransactionId: body.relatedTransactionId ? String(body.relatedTransactionId) : null,
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {}, actorUserId,
    });
    const [account] = await db.select({ contactId: loyaltyAccounts.contactId }).from(loyaltyAccounts).where(and(eq(loyaltyAccounts.organizationId, organizationId), eq(loyaltyAccounts.id, accountId))).limit(1);
    if (account && !result.duplicate) await recordCustomerTimelineEvent({
      organizationId, contactId: account.contactId, sourceType: "loyalty_transaction", sourceId: result.transaction.id,
      eventType: result.held ? "loyalty.transaction_held" : "loyalty.transaction_posted",
      summary: result.held ? `Loyalty transaction held for review: ${result.transaction.points} points` : `Loyalty points ${result.transaction.points > 0 ? "earned" : "used"}: ${Math.abs(result.transaction.points)}`,
      actorUserId, idempotencyKey: `loyalty.timeline:${result.transaction.id}`, metadata: { transactionType, status: result.transaction.status, sourceType },
    });
    if (!result.duplicate) await enqueueWebhookEvent(organizationId, result.held ? "loyalty.transaction_held" : "loyalty.transaction_posted", { transactionId: result.transaction.id, accountId, points: result.transaction.points, occurredAt: new Date().toISOString() });
    return NextResponse.json({ data: result }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Loyalty transaction failed";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 409 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { calculateRevenueAnalytics } from "@/lib/revenue-analytics";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const records = await db.select({ contactId: subscriptions.contactId, amount: subscriptions.amount, interval: subscriptions.interval, status: subscriptions.status, currentPeriodStart: subscriptions.currentPeriodStart, currentPeriodEnd: subscriptions.currentPeriodEnd, cancelledAt: subscriptions.cancelledAt, createdAt: subscriptions.createdAt }).from(subscriptions).where(eq(subscriptions.organizationId, orgId));
  return NextResponse.json({ data: calculateRevenueAnalytics(records), generatedAt: new Date().toISOString() });
}

async function POSTHandler() {
  return NextResponse.json({ error: "Manual revenue metrics are disabled. Metrics are calculated from subscription records." }, { status: 405, headers: { Allow: "GET" } });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

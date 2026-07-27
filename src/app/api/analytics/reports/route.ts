import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, contacts, deals } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [[contactCount], [dealCount], [campaignCount], [revenue]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(eq(contacts.organizationId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(deals).where(eq(deals.organizationId, orgId)),
      db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(eq(campaigns.organizationId, orgId)),
      db.select({ value: sql<string>`coalesce(sum(${deals.value}) filter (where ${deals.stage} = 'closed_won'), 0)` }).from(deals).where(eq(deals.organizationId, orgId)),
    ]);
    return NextResponse.json({ data: [
      { type: "contacts", name: "Contacts Export", description: "All CRM contact records", rowCount: contactCount.count },
      { type: "deals", name: "Deals Export", description: "Pipeline and deal history", rowCount: dealCount.count },
      { type: "campaigns", name: "Campaign Performance", description: "Campaign status and performance", rowCount: campaignCount.count },
      { type: "revenue", name: "Revenue Report", description: "Closed revenue by deal", rowCount: dealCount.count, summary: Number(revenue.value ?? 0) },
    ] });
  } catch {
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [contactRows, dealRows] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.organizationId, orgId)),
      db.select().from(deals).where(eq(deals.organizationId, orgId)),
    ]);
    const customers = contactRows.filter(c => c.status === "customer" || c.status === "vip");
    const revenueByContact = new Map<string, number>();
    for (const deal of dealRows.filter(d => d.stage === "closed_won" && d.contactId)) revenueByContact.set(deal.contactId!, (revenueByContact.get(deal.contactId!) ?? 0) + Number(deal.value ?? 0));
    const now = new Date();
    const cohorts = Array.from({ length: 12 }, (_, offset) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + offset, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      return { month: key, label: date.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }), count: customers.filter(c => c.createdAt.toISOString().slice(0, 7) === key).length };
    });
    const sourceMap = new Map<string, number>();
    for (const customer of customers) sourceMap.set(customer.source ?? "Unknown", (sourceMap.get(customer.source ?? "Unknown") ?? 0) + 1);
    const newThisMonth = cohorts.at(-1)?.count ?? 0;
    const churned = contactRows.filter(c => c.status === "churned").length;
    const avgLtv = customers.length ? [...revenueByContact.values()].reduce((a, b) => a + b, 0) / customers.length : 0;
    const topCustomers = customers.map(c => ({ ...c, revenue: revenueByContact.get(c.id) ?? 0 })).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    return NextResponse.json({ data: { totals: { totalCustomers: customers.length, newThisMonth, avgLtv, churnRate: contactRows.length ? churned / contactRows.length * 100 : 0, vipCount: customers.filter(c => c.status === "vip").length }, cohorts, sourceBreakdown: [...sourceMap.entries()].map(([source, count]) => ({ source, count })), topCustomers, statusFlow: { leads: contactRows.filter(c => c.status === "lead").length, prospects: contactRows.filter(c => c.status === "prospect").length, customers: customers.length } } });
  } catch {
    return NextResponse.json({ error: "Failed to fetch customer analytics" }, { status: 500 });
  }
}

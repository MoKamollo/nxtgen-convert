import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const [contactRows, dealRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.organizationId, orgId)),
    db.select().from(deals).where(eq(deals.organizationId, orgId)),
  ]);
  const customers = contactRows.filter((contact) => contact.status === "customer" || contact.status === "vip");
  const recognizedRevenueByContact = new Map<string, number>();
  for (const deal of dealRows.filter((deal) => deal.stage === "closed_won" && deal.contactId)) {
    recognizedRevenueByContact.set(deal.contactId!, (recognizedRevenueByContact.get(deal.contactId!) ?? 0) + Number(deal.value ?? 0));
  }
  const now = new Date();
  const newCustomersByMonth = Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month: key, label: date.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }), count: customers.filter((contact) => contact.createdAt.toISOString().slice(0, 7) === key).length };
  });
  const sourceMap = new Map<string, number>();
  for (const customer of customers) sourceMap.set(customer.source ?? "Unknown", (sourceMap.get(customer.source ?? "Unknown") ?? 0) + 1);
  const recognizedRevenue = [...recognizedRevenueByContact.values()].reduce((sum, value) => sum + value, 0);
  const topCustomers = customers.map((contact) => ({ ...contact, recognizedRevenue: recognizedRevenueByContact.get(contact.id) ?? 0 })).sort((a, b) => b.recognizedRevenue - a.recognizedRevenue).slice(0, 20);
  return NextResponse.json({
    data: {
      totals: {
        totalCustomers: customers.length,
        newThisMonth: newCustomersByMonth.at(-1)?.count ?? 0,
        recognizedRevenuePerCurrentCustomer: customers.length ? recognizedRevenue / customers.length : 0,
        churnRate: null,
        churnAvailable: false,
        churnReason: "Contact status is not a period churn calculation. Use subscription lifecycle data for customer churn.",
        vipCount: customers.filter((contact) => contact.status === "vip").length,
      },
      newCustomersByMonth,
      sourceBreakdown: [...sourceMap.entries()].map(([source, count]) => ({ source, count })),
      topCustomers,
      statusDistribution: {
        leads: contactRows.filter((contact) => contact.status === "lead").length,
        prospects: contactRows.filter((contact) => contact.status === "prospect").length,
        customers: customers.length,
        churnedStatus: contactRows.filter((contact) => contact.status === "churned").length,
      },
      methodology: "Recognized revenue is the sum of closed won deal values linked to each current customer. It is not lifetime value.",
    },
  });
}

export const GET = withApiGuard(GETHandler);

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies, contacts, deals, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const OPEN = ["prospecting", "qualification", "proposal", "negotiation"];

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const rows = await db.select({
      id: deals.id, name: deals.name, value: deals.value, currency: deals.currency, stage: deals.stage, probability: deals.probability,
      expectedCloseDate: deals.expectedCloseDate, lostReason: deals.lostReason, createdAt: deals.createdAt, updatedAt: deals.updatedAt,
      ownerName: users.name, contactFirstName: contacts.firstName, contactLastName: contacts.lastName, companyName: companies.name,
    }).from(deals)
      .leftJoin(users, and(eq(deals.ownerId, users.id), eq(users.organizationId, orgId)))
      .leftJoin(contacts, and(eq(deals.contactId, contacts.id), eq(contacts.organizationId, orgId)))
      .leftJoin(companies, and(eq(deals.companyId, companies.id), eq(companies.organizationId, orgId)))
      .where(eq(deals.organizationId, orgId)).orderBy(desc(deals.updatedAt));
    const stageMap = new Map<string, { stage: string; count: number; value: number; totalAgeDays: number }>();
    for (const deal of rows) {
      const stage = deal.stage ?? "prospecting";
      const current = stageMap.get(stage) ?? { stage, count: 0, value: 0, totalAgeDays: 0 };
      current.count++; current.value += Number(deal.value ?? 0); current.totalAgeDays += Math.max(0, (Date.now() - new Date(deal.updatedAt).getTime()) / 86400000); stageMap.set(stage, current);
    }
    const byStage = [...stageMap.values()].map(s => ({ stage: s.stage, count: s.count, value: s.value, avgDealSize: s.count ? s.value / s.count : 0, avgDaysInStage: s.count ? s.totalAgeDays / s.count : 0 }));
    const openDeals = rows.filter(d => OPEN.includes(d.stage ?? ""));
    const now = new Date();
    const expectedThisMonth = openDeals.filter(d => d.expectedCloseDate && new Date(d.expectedCloseDate).getUTCMonth() === now.getUTCMonth() && new Date(d.expectedCloseDate).getUTCFullYear() === now.getUTCFullYear());
    const reasonMap = new Map<string, number>();
    for (const deal of rows.filter(d => d.stage === "closed_lost")) reasonMap.set(deal.lostReason || "Unspecified", (reasonMap.get(deal.lostReason || "Unspecified") ?? 0) + 1);
    return NextResponse.json({ data: { totals: { pipelineValue: openDeals.reduce((s, d) => s + Number(d.value ?? 0), 0), openDeals: openDeals.length, avgDealSize: openDeals.length ? openDeals.reduce((s, d) => s + Number(d.value ?? 0), 0) / openDeals.length : 0, expectedCloseThisMonth: expectedThisMonth.reduce((s, d) => s + Number(d.value ?? 0), 0) }, byStage, openDeals, winLossReasons: [...reasonMap.entries()].map(([reason, count]) => ({ reason, count })), topDeals: [...openDeals].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0)).slice(0, 10) } });
  } catch {
    return NextResponse.json({ error: "Failed to fetch pipeline analytics" }, { status: 500 });
  }
}

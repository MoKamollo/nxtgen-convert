import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

function normalized(value: unknown) {
  const s = (value ?? {}) as Record<string, unknown>;
  return { sent: Number(s.sent ?? 0), delivered: Number(s.delivered ?? 0), opened: Number(s.opened ?? 0), clicked: Number(s.clicked ?? 0), bounced: Number(s.bounced ?? 0), unsubscribed: Number(s.unsubscribed ?? 0), revenue: Number(s.revenue ?? 0) };
}

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const rows = await db.select().from(campaigns).where(eq(campaigns.organizationId, orgId)).orderBy(desc(campaigns.sentAt));
    const data = rows.map(campaign => ({ ...campaign, normalizedStats: normalized(campaign.stats) }));
    const totals = data.reduce((acc, campaign) => {
      for (const key of Object.keys(acc) as Array<keyof typeof acc>) acc[key] += campaign.normalizedStats[key];
      return acc;
    }, { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0 });
    const rate = (value: number, base: number) => base > 0 ? Math.round(value / base * 1000) / 10 : 0;
    return NextResponse.json({ data: { campaigns: data, totals, avgOpenRate: rate(totals.opened, totals.delivered || totals.sent), avgClickRate: rate(totals.clicked, totals.delivered || totals.sent), avgBounceRate: rate(totals.bounced, totals.sent) } });
  } catch {
    return NextResponse.json({ error: "Failed to fetch campaign analytics" }, { status: 500 });
  }
}

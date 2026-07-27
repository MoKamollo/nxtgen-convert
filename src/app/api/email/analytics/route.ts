import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { analyticsEvents, campaigns } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

function statsOf(value: unknown) {
  const stats = (value ?? {}) as Record<string, unknown>;
  return {
    sent: Number(stats.sent ?? 0), delivered: Number(stats.delivered ?? 0), opened: Number(stats.opened ?? 0),
    clicked: Number(stats.clicked ?? 0), bounced: Number(stats.bounced ?? 0), unsubscribed: Number(stats.unsubscribed ?? 0),
  };
}

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const campaignRows = await db.select().from(campaigns).where(and(eq(campaigns.organizationId, orgId), eq(campaigns.type, "email"))).orderBy(desc(campaigns.sentAt));
    const statKeys = ["sent", "delivered", "opened", "clicked", "bounced", "unsubscribed"] as const;
    const totals = campaignRows.reduce((acc, campaign) => {
      const current = statsOf(campaign.stats);
      for (const key of statKeys) acc[key] += current[key];
      return acc;
    }, { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 });

    const start = new Date(); start.setUTCDate(start.getUTCDate() - 29); start.setUTCHours(0, 0, 0, 0);
    const events = await db.select({ event: analyticsEvents.event, properties: analyticsEvents.properties, createdAt: analyticsEvents.createdAt })
      .from(analyticsEvents).where(and(eq(analyticsEvents.organizationId, orgId), gte(analyticsEvents.createdAt, start)));
    const dailyMap = new Map<string, { date: string; sent: number; opened: number; clicked: number }>();
    for (let i = 0; i < 30; i++) {
      const date = new Date(start); date.setUTCDate(start.getUTCDate() + i);
      const key = date.toISOString().slice(0, 10); dailyMap.set(key, { date: key, sent: 0, opened: 0, clicked: 0 });
    }
    const linkMap = new Map<string, number>();
    for (const event of events) {
      const key = new Date(event.createdAt).toISOString().slice(0, 10);
      const row = dailyMap.get(key); if (!row) continue;
      if (event.event === "email_sent") row.sent++;
      if (event.event === "email_open") row.opened++;
      if (event.event === "email_click") {
        row.clicked++;
        const url = String((event.properties as Record<string, unknown> | null)?.url ?? "");
        if (url) linkMap.set(url, (linkMap.get(url) ?? 0) + 1);
      }
    }
    const rate = (value: number, base: number) => base > 0 ? Math.round(value / base * 1000) / 10 : 0;
    const data = {
      ...totals,
      avgOpenRate: rate(totals.opened, totals.delivered || totals.sent),
      avgClickRate: rate(totals.clicked, totals.delivered || totals.sent),
      avgBounceRate: rate(totals.bounced, totals.sent),
      dailySends: [...dailyMap.values()],
      topLinks: [...linkMap.entries()].map(([url, clicks]) => ({ url, clicks })).sort((a, b) => b.clicks - a.clicks).slice(0, 20),
      campaigns: campaignRows.map(campaign => ({ ...campaign, computedStats: statsOf(campaign.stats) })),
    };
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Failed to fetch email analytics" }, { status: 500 });
  }
}

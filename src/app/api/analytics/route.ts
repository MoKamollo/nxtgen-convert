import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, revenueMetrics, campaigns, workflows, tickets } from "@/db/schema";
import { eq, count, sum, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = request.headers.get("x-tenant-id");
    const type = searchParams.get("type") || "overview";

    if (!orgId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (type === "overview") {
      const [
        contactRows,
        dealRows,
        metrics,
        campaignRows,
        workflowRows,
        ticketRows,
      ] = await Promise.all([
        db.select().from(contacts).where(eq(contacts.organizationId, orgId)),
        db.select().from(deals).where(eq(deals.organizationId, orgId)),
        db.select().from(revenueMetrics).where(eq(revenueMetrics.organizationId, orgId)).orderBy(desc(revenueMetrics.date)).limit(12),
        db.select().from(campaigns).where(eq(campaigns.organizationId, orgId)),
        db.select().from(workflows).where(eq(workflows.organizationId, orgId)),
        db.select().from(tickets).where(eq(tickets.organizationId, orgId)),
      ]);

      const latestMetric = metrics[0];
      const prevMetric = metrics[1];

      const pct = (curr: string | null, prev: string | null) => {
        const c = parseFloat(curr ?? "0");
        const p = parseFloat(prev ?? "0");
        return p > 0 ? Math.round(((c - p) / p) * 100 * 10) / 10 : 0;
      };

      const activeDeals = dealRows.filter(d => !["closed_won", "closed_lost"].includes(d.stage ?? ""));
      const pipelineValue = activeDeals.reduce((s, d) => s + parseFloat(d.value ?? "0"), 0);
      const wonDeals = dealRows.filter(d => d.stage === "closed_won");
      const winRate = dealRows.length > 0 ? Math.round((wonDeals.length / dealRows.length) * 1000) / 10 : 0;
      const avgDealSize = wonDeals.length > 0 ? wonDeals.reduce((s, d) => s + parseFloat(d.value ?? "0"), 0) / wonDeals.length : 0;
      const openTickets = ticketRows.filter(t => !["resolved", "closed"].includes(t.status ?? "")).length;
      const activeWorkflows = workflowRows.filter(w => w.status === "active");
      const enrolledCount = activeWorkflows.reduce((s, w) => s + (w.enrolledCount ?? 0), 0);

      const mrr = parseFloat(latestMetric?.mrr ?? "0");
      const arr = parseFloat(latestMetric?.arr ?? "0");
      const prevMrr = parseFloat(prevMetric?.mrr ?? "0");
      const prevArr = parseFloat(prevMetric?.arr ?? "0");

      const kpis = {
        mrr: { value: mrr, change: pct(latestMetric?.mrr, prevMetric?.mrr), trend: mrr >= prevMrr ? "up" : "down" },
        arr: { value: arr, change: pct(latestMetric?.arr, prevMetric?.arr), trend: arr >= prevArr ? "up" : "down" },
        totalContacts: { value: contactRows.length, change: 12.4, trend: "up" },
        activeDeals: { value: activeDeals.length, change: -3.2, trend: "down" },
        pipelineValue: { value: pipelineValue, change: 18.7, trend: "up" },
        avgDealSize: { value: Math.round(avgDealSize), change: 22.9, trend: "up" },
        winRate: { value: winRate, change: 4.2, trend: "up" },
        churnRate: { value: 2.1, change: -0.4, trend: "up" },
        cac: { value: 1840, change: -8.3, trend: "up" },
        ltv: { value: 28400, change: 14.2, trend: "up" },
        nps: { value: 67, change: 5, trend: "up" },
        openTickets: { value: openTickets, change: -12.1, trend: "up" },
        activeWorkflows: { value: activeWorkflows.length, enrolled: enrolledCount },
      };

      const revenueData = [...metrics].reverse().map((m) => {
        const d = new Date(m.date);
        return {
          month: d.toLocaleString("en-US", { month: "short" }),
          mrr: parseFloat(m.mrr ?? "0"),
          arr: parseFloat(m.arr ?? "0"),
          new: parseFloat(m.newRevenue ?? "0"),
          churned: parseFloat(m.churnedRevenue ?? "0"),
          net: parseFloat(m.netRevenue ?? "0"),
        };
      });

      const stageCounts: Record<string, { count: number; value: number }> = {};
      const stageColors: Record<string, string> = {
        prospecting: "#6366f1", qualification: "#8b5cf6",
        proposal: "#06b6d4", negotiation: "#10b981", closed_won: "#f59e0b",
      };
      for (const d of dealRows) {
        const s = d.stage ?? "prospecting";
        if (!stageCounts[s]) stageCounts[s] = { count: 0, value: 0 };
        stageCounts[s].count++;
        stageCounts[s].value += parseFloat(d.value ?? "0");
      }
      const pipelineData = Object.entries(stageCounts).map(([stage, { count, value }]) => ({
        stage: stage.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        count, value, color: stageColors[stage] ?? "#6366f1",
      }));

      return NextResponse.json({
        data: { kpis, revenue: revenueData, pipeline: pipelineData },
        generatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ data: {}, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}

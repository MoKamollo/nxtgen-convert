import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, revenueMetrics, workflows, tickets, marketingSpend, npsResponses } from "@/db/schema";
import { eq, desc, sql, and, gte, isNotNull, count } from "drizzle-orm";

const STAGE_COLORS: Record<string, string> = {
  prospecting:   "#94a3b8",
  qualification: "#60a5fa",
  proposal:      "#818cf8",
  negotiation:   "#fb923c",
  closed_won:    "#34d399",
  closed_lost:   "#f87171",
};

const SOURCE_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#94a3b8"];

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Period window for deal/contact aggregations
    const periodParam = request.nextUrl.searchParams.get("period") ?? "30d";
    const periodDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
    const windowDays = periodDays[periodParam] ?? 30;
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // NPS always capped at 90 days for freshness (W4)
    const npsWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [contactRows, dealRows, metrics, workflowRows, ticketRows, spendRows, npsRows, totalContactsResult] = await Promise.all([
      db.select({
        id: contacts.id, status: contacts.status, source: contacts.source,
        createdAt: contacts.createdAt, updatedAt: contacts.updatedAt,
      }).from(contacts).where(eq(contacts.organizationId, orgId))
        .orderBy(desc(contacts.createdAt)).limit(2000),
      db.select({
        id: deals.id, stage: deals.stage, value: deals.value,
        contactId: deals.contactId, wonAt: deals.wonAt, lostAt: deals.lostAt,
        updatedAt: deals.updatedAt,
      }).from(deals).where(eq(deals.organizationId, orgId))
        .orderBy(desc(deals.updatedAt)).limit(2000),
      db.select().from(revenueMetrics).where(eq(revenueMetrics.organizationId, orgId)).orderBy(desc(revenueMetrics.date)).limit(13),
      db.select({ id: workflows.id, status: workflows.status, enrolledCount: workflows.enrolledCount })
        .from(workflows).where(eq(workflows.organizationId, orgId)).limit(200),
      db.select({ id: tickets.id, status: tickets.status })
        .from(tickets).where(eq(tickets.organizationId, orgId)).limit(500),
      db.select().from(marketingSpend).where(eq(marketingSpend.organizationId, orgId)),
      db.select({ score: npsResponses.score }).from(npsResponses)
        .where(and(
          eq(npsResponses.organizationId, orgId),
          isNotNull(npsResponses.submittedAt),
          isNotNull(npsResponses.score),
          gte(npsResponses.submittedAt, npsWindowStart),
        )),
      db.select({ total: count() }).from(contacts).where(eq(contacts.organizationId, orgId)),
    ]);

    const totalContactsCount = totalContactsResult[0]?.total ?? contactRows.length;

    // ── KPI derivations ────────────────────────────────────────────────────────

    // Pipeline value = all currently open deals (always current state, not date-filtered)
    const activeDeals = dealRows.filter(d => !["closed_won","closed_lost"].includes(d.stage ?? ""));
    const pipelineValue = activeDeals.reduce((s, d) => s + parseFloat(d.value ?? "0"), 0);

    // Win rate + avg deal size = deals closed within the selected period
    const wonDeals = dealRows.filter(d => {
      if (d.stage !== "closed_won") return false;
      if (periodParam === "all") return true;
      const closedAt = d.wonAt ?? d.updatedAt;
      return closedAt && new Date(closedAt) >= windowStart;
    });
    const lostDeals = dealRows.filter(d => {
      if (d.stage !== "closed_lost") return false;
      if (periodParam === "all") return true;
      const closedAt = d.lostAt ?? d.updatedAt;
      return closedAt && new Date(closedAt) >= windowStart;
    });
    const closedDeals = wonDeals.length + lostDeals.length;
    const winRate = closedDeals > 0 ? Math.round((wonDeals.length / closedDeals) * 1000) / 10 : 0;
    const avgDealSize = wonDeals.length > 0 ? wonDeals.reduce((s, d) => s + parseFloat(d.value ?? "0"), 0) / wonDeals.length : 0;
    const openTickets = ticketRows.filter(t => !["resolved","closed"].includes(t.status ?? "")).length;
    const activeWorkflowRows = workflowRows.filter(w => w.status === "active");
    const enrolledCount = activeWorkflowRows.reduce((s, w) => s + (w.enrolledCount ?? 0), 0);

    const churnedContacts = contactRows.filter(c => c.status === "churned").length;
    const churnRate = totalContactsCount > 0 ? Math.round((churnedContacts / totalContactsCount) * 1000) / 10 : 0;

    // ── CAC ──────────────────────────────────────────────────────────────────────
    const thisMonthSpend = spendRows
      .filter(s => s.month === currentMonth)
      .reduce((sum, s) => sum + parseFloat(s.amount ?? "0"), 0);
    const newCustomersThisMonth = contactRows.filter(c =>
      (c.status === "customer" || c.status === "vip") && new Date(c.createdAt) >= monthStart
    ).length;
    const cac = thisMonthSpend > 0 && newCustomersThisMonth > 0
      ? Math.round(thisMonthSpend / newCustomersThisMonth)
      : 0;

    // ── NPS ──────────────────────────────────────────────────────────────────────
    const scores = npsRows.map(r => r.score ?? 0);
    const promoters  = scores.filter(s => s >= 9).length;
    const detractors = scores.filter(s => s <= 6).length;
    const npsScore   = scores.length > 0
      ? Math.round(((promoters - detractors) / scores.length) * 100)
      : 0;

    // MRR/ARR: from revenueMetrics if available, otherwise sum from deals closed this month
    const latestMetric = metrics[0];
    const prevMetric   = metrics[1];
    let mrr = parseFloat(latestMetric?.mrr ?? "0");
    let arr = parseFloat(latestMetric?.arr ?? "0");

    if (mrr === 0 && wonDeals.length > 0) {
      const thisMonthWon = wonDeals.filter(d => {
        const wonAt = d.wonAt ?? d.updatedAt;
        return wonAt && new Date(wonAt).getMonth() === now.getMonth() && new Date(wonAt).getFullYear() === now.getFullYear();
      });
      mrr = thisMonthWon.reduce((s, d) => s + parseFloat(d.value ?? "0"), 0);
      arr = mrr * 12;
    }

    const prevMrr = parseFloat(prevMetric?.mrr ?? "0");
    const pct = (curr: number, prev: number) =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 100 * 10) / 10 : 0;

    const kpis = {
      mrr:             { value: mrr,                         change: pct(mrr, prevMrr),         trend: mrr >= prevMrr ? "up" : "down" },
      arr:             { value: arr,                         change: 0,                          trend: "up" },
      totalContacts:   { value: totalContactsCount,           change: 0,                          trend: "up" },
      activeDeals:     { value: activeDeals.length,          change: 0,                          trend: "up" },
      pipelineValue:   { value: pipelineValue,               change: 0,                          trend: "up" },
      avgDealSize:     { value: Math.round(avgDealSize),     change: 0,                          trend: "up" },
      winRate:         { value: winRate,                     change: 0,                          trend: "up" },
      churnRate:       { value: churnRate,                   change: 0,                          trend: "down" },
      cac:             { value: cac,                         change: 0,                          trend: "up" },
      ltv:             { value: mrr > 0 && churnRate > 0 ? Math.round(mrr / (churnRate / 100)) : avgDealSize > 0 ? Math.round(avgDealSize * 3) : 0, change: 0, trend: "up" },
      nps:             { value: npsScore,                    change: 0,                          trend: "up" },
      openTickets:     { value: openTickets,                 change: 0,                          trend: "up" },
      activeWorkflows: { value: activeWorkflowRows.length,   enrolled: enrolledCount },
    };

    // ── Revenue chart ──────────────────────────────────────────────────────────

    let revenueChart: { month: string; mrr: number; arr: number; new: number; churned: number; net: number }[] = [];

    if (metrics.length > 0) {
      revenueChart = [...metrics].reverse().map(m => {
        const d = new Date(m.date);
        return {
          month: d.toLocaleString("en-US", { month: "short" }),
          mrr:     parseFloat(m.mrr ?? "0"),
          arr:     parseFloat(m.arr ?? "0"),
          new:     parseFloat(m.newRevenue ?? "0"),
          churned: parseFloat(m.churnedRevenue ?? "0"),
          net:     parseFloat(m.netRevenue ?? "0"),
        };
      });
    } else if (wonDeals.length > 0) {
      // Derive from deals: group closed_won by month
      const byMonth: Record<string, number> = {};
      for (const d of wonDeals) {
        const wonAt = d.wonAt ?? d.updatedAt;
        if (!wonAt) continue;
        const key = new Date(wonAt).toLocaleString("en-US", { month: "short", year: "2-digit" });
        byMonth[key] = (byMonth[key] ?? 0) + parseFloat(d.value ?? "0");
      }
      const sorted = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
      let running = 0;
      revenueChart = sorted.map(([month, val]) => {
        running += val;
        return { month: month.split(" ")[0], mrr: running, arr: running * 12, new: val, churned: 0, net: val };
      });
    }

    // ── Pipeline chart ─────────────────────────────────────────────────────────

    const stageCounts: Record<string, { count: number; value: number }> = {};
    for (const d of dealRows) {
      const s = d.stage ?? "prospecting";
      if (!stageCounts[s]) stageCounts[s] = { count: 0, value: 0 };
      stageCounts[s].count++;
      stageCounts[s].value += parseFloat(d.value ?? "0");
    }
    const pipelineChart = Object.entries(stageCounts).map(([stage, { count, value }]) => ({
      stage: stage.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      count, value, color: STAGE_COLORS[stage] ?? "#6366f1",
    }));

    // ── Contact sources (for traffic sources chart) ────────────────────────────

    const sourceCounts: Record<string, number> = {};
    for (const c of contactRows) {
      const src = c.source ?? "Unknown";
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
    }
    const total = totalContactsCount || 1;
    const contactSources = Object.entries(sourceCounts)
      .sort(([,a],[,b]) => b - a)
      .map(([name, count], i) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        value: Math.round((count / total) * 100),
        count,
        color: SOURCE_COLORS[i % SOURCE_COLORS.length],
      }));

    // ── Conversion funnel (contact status pipeline) ────────────────────────────

    const statusCount = (s: string) => contactRows.filter(c => c.status === s).length;
    const conversionFunnel = [
      { stage: "Total Contacts",  count: totalContactsCount },
      { stage: "Leads",           count: contactRows.filter(c => c.status === "lead").length },
      { stage: "Prospects",       count: statusCount("prospect") },
      { stage: "Customers",       count: statusCount("customer") + statusCount("vip") },
    ];

    return NextResponse.json({
      data: { kpis, revenue: revenueChart, pipeline: pipelineChart, contactSources, conversionFunnel },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}

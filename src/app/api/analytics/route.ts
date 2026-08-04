import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, marketingSpend, npsResponses, subscriptions, tickets, workflows } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { calculateRevenueAnalytics } from "@/lib/revenue-analytics";

const STAGE_COLORS: Record<string, string> = { prospecting: "#94a3b8", qualification: "#60a5fa", proposal: "#818cf8", negotiation: "#fb923c", closed_won: "#34d399", closed_lost: "#f87171" };
const SOURCE_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#94a3b8"];

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const now = new Date();
  const periodParam = request.nextUrl.searchParams.get("period") ?? "30d";
  const days: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "1y": 365 };
  const windowStart = periodParam === "ytd" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : new Date(now.getTime() - (days[periodParam] ?? 30) * 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentMonth = monthStart.toISOString().slice(0, 7);
  const npsWindowStart = new Date(now.getTime() - 90 * 86_400_000);

  const [contactRows, dealRows, workflowRows, ticketRows, spendRows, npsRows, totalResult, subscriptionRows] = await Promise.all([
    db.select({ id: contacts.id, status: contacts.status, source: contacts.source, createdAt: contacts.createdAt }).from(contacts).where(eq(contacts.organizationId, orgId)).orderBy(desc(contacts.createdAt)).limit(5_000),
    db.select({ id: deals.id, stage: deals.stage, value: deals.value, contactId: deals.contactId, wonAt: deals.wonAt, lostAt: deals.lostAt, updatedAt: deals.updatedAt }).from(deals).where(eq(deals.organizationId, orgId)).orderBy(desc(deals.updatedAt)).limit(5_000),
    db.select({ status: workflows.status, enrolledCount: workflows.enrolledCount }).from(workflows).where(eq(workflows.organizationId, orgId)).limit(1_000),
    db.select({ status: tickets.status }).from(tickets).where(eq(tickets.organizationId, orgId)).limit(5_000),
    db.select().from(marketingSpend).where(eq(marketingSpend.organizationId, orgId)),
    db.select({ score: npsResponses.score }).from(npsResponses).where(and(eq(npsResponses.organizationId, orgId), isNotNull(npsResponses.submittedAt), isNotNull(npsResponses.score), gte(npsResponses.submittedAt, npsWindowStart))),
    db.select({ total: count() }).from(contacts).where(eq(contacts.organizationId, orgId)),
    db.select({ contactId: subscriptions.contactId, amount: subscriptions.amount, interval: subscriptions.interval, status: subscriptions.status, currentPeriodStart: subscriptions.currentPeriodStart, currentPeriodEnd: subscriptions.currentPeriodEnd, cancelledAt: subscriptions.cancelledAt, createdAt: subscriptions.createdAt }).from(subscriptions).where(eq(subscriptions.organizationId, orgId)),
  ]);

  const revenue = calculateRevenueAnalytics(subscriptionRows, now);
  const totalContacts = Number(totalResult[0]?.total ?? contactRows.length);
  const activeDeals = dealRows.filter((deal) => !["closed_won", "closed_lost"].includes(deal.stage ?? ""));
  const wonDeals = dealRows.filter((deal) => deal.stage === "closed_won" && (periodParam === "all" || new Date(deal.wonAt ?? deal.updatedAt) >= windowStart));
  const lostDeals = dealRows.filter((deal) => deal.stage === "closed_lost" && (periodParam === "all" || new Date(deal.lostAt ?? deal.updatedAt) >= windowStart));
  const closed = wonDeals.length + lostDeals.length;
  const winRate = closed > 0 ? wonDeals.length / closed * 100 : 0;
  const averageDeal = wonDeals.length > 0 ? wonDeals.reduce((sum, deal) => sum + Number(deal.value ?? 0), 0) / wonDeals.length : 0;
  const pipelineValue = activeDeals.reduce((sum, deal) => sum + Number(deal.value ?? 0), 0);
  const activeWorkflows = workflowRows.filter((workflow) => workflow.status === "active");
  const thisMonthSpend = spendRows.filter((spend) => spend.month === currentMonth).reduce((sum, spend) => sum + Number(spend.amount ?? 0), 0);
  const newCustomers = contactRows.filter((contact) => ["customer", "vip"].includes(contact.status ?? "") && contact.createdAt >= monthStart).length;
  const cac = thisMonthSpend > 0 && newCustomers > 0 ? thisMonthSpend / newCustomers : 0;
  const scores = npsRows.map((row) => row.score ?? 0);
  const nps = scores.length > 0 ? (scores.filter((score) => score >= 9).length - scores.filter((score) => score <= 6).length) / scores.length * 100 : 0;
  const previousMrr = revenue.history.at(-2)?.mrr ?? 0;
  const mrrChange = previousMrr > 0 ? (revenue.mrr - previousMrr) / previousMrr * 100 : 0;

  const kpis = {
    mrr: { value: revenue.mrr, change: round(mrrChange), trend: previousMrr <= 0 ? "neutral" : revenue.mrr >= previousMrr ? "up" : "down", methodology: revenue.methodology },
    arr: { value: revenue.arr, change: round(mrrChange), trend: previousMrr <= 0 ? "neutral" : revenue.arr >= previousMrr * 12 ? "up" : "down" },
    totalContacts: { value: totalContacts, change: 0, trend: "neutral" },
    activeDeals: { value: activeDeals.length, change: 0, trend: "neutral" },
    pipelineValue: { value: round(pipelineValue), change: 0, trend: "neutral" },
    avgDealSize: { value: round(averageDeal), change: 0, trend: "neutral" },
    winRate: { value: round(winRate), change: 0, trend: "neutral" },
    churnRate: { value: revenue.logoChurnRate ?? 0, available: revenue.logoChurnRate !== null, change: 0, trend: "neutral", methodology: revenue.methodology },
    cac: { value: round(cac), available: cac > 0, change: 0, trend: "neutral", methodology: "Current calendar month marketing spend divided by contacts first recorded as customers during the month." },
    ltv: { value: 0, available: false, change: 0, trend: "neutral", reason: revenue.ltvReason },
    nps: { value: round(nps), available: scores.length > 0, sampleSize: scores.length, change: 0, trend: "neutral" },
    openTickets: { value: ticketRows.filter((ticket) => !["resolved", "closed"].includes(ticket.status ?? "")).length, change: 0, trend: "neutral" },
    activeWorkflows: { value: activeWorkflows.length, enrolled: activeWorkflows.reduce((sum, workflow) => sum + (workflow.enrolledCount ?? 0), 0) },
  };

  const stageCounts: Record<string, { count: number; value: number }> = {};
  for (const deal of dealRows) {
    const stage = deal.stage ?? "prospecting";
    stageCounts[stage] ??= { count: 0, value: 0 };
    stageCounts[stage].count += 1;
    stageCounts[stage].value += Number(deal.value ?? 0);
  }
  const pipeline = Object.entries(stageCounts).map(([stage, values]) => ({ stage: stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), ...values, color: STAGE_COLORS[stage] ?? "#6366f1" }));
  const sourceCounts: Record<string, number> = {};
  for (const contact of contactRows) sourceCounts[contact.source ?? "Unknown"] = (sourceCounts[contact.source ?? "Unknown"] ?? 0) + 1;
  const contactSources = Object.entries(sourceCounts).sort(([, a], [, b]) => b - a).map(([name, value], index) => ({ name, value: totalContacts > 0 ? round(value / totalContacts * 100) : 0, count: value, color: SOURCE_COLORS[index % SOURCE_COLORS.length] }));
  const countStatus = (status: string) => contactRows.filter((contact) => contact.status === status).length;
  const conversionFunnel = [{ stage: "Total Contacts", count: totalContacts }, { stage: "Leads", count: countStatus("lead") }, { stage: "Prospects", count: countStatus("prospect") }, { stage: "Customers", count: countStatus("customer") + countStatus("vip") }];

  return NextResponse.json({ data: { kpis, revenue: revenue.history, pipeline, contactSources, conversionFunnel, methodology: { revenue: revenue.methodology, ltv: revenue.ltvReason } }, generatedAt: now.toISOString() });
}

function round(value: number) { return Math.round(value * 100) / 100; }

export const GET = withApiGuard(GETHandler);

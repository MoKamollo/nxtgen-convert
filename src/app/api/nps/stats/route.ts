import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { npsResponses } from "@/db/schema";
import { eq } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const rows = await db.select().from(npsResponses).where(eq(npsResponses.organizationId, orgId));
    const submitted = rows.filter(row => row.score !== null && row.submittedAt);
    const promoters = submitted.filter(row => (row.score ?? 0) >= 9).length;
    const passives = submitted.filter(row => (row.score ?? 0) >= 7 && (row.score ?? 0) <= 8).length;
    const detractors = submitted.filter(row => (row.score ?? 0) <= 6).length;
    const npsScore = submitted.length ? Math.round((promoters - detractors) / submitted.length * 100) : 0;
    const avgScore = submitted.length ? submitted.reduce((sum, row) => sum + (row.score ?? 0), 0) / submitted.length : 0;
    const trendMap = new Map<string, number[]>();
    for (const row of submitted) {
      const key = new Date(row.submittedAt!).toISOString().slice(0, 7);
      const list = trendMap.get(key) ?? []; list.push(row.score ?? 0); trendMap.set(key, list);
    }
    const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, scores]) => {
      const p = scores.filter(s => s >= 9).length; const d = scores.filter(s => s <= 6).length;
      return { month, score: Math.round((p - d) / scores.length * 100) };
    });
    return NextResponse.json({ data: { avgScore, promoters, passives, detractors, npsScore, responseRate: rows.length ? submitted.length / rows.length * 100 : 0, totalResponses: submitted.length, trend } });
  } catch {
    return NextResponse.json({ error: "Failed to fetch NPS stats" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);

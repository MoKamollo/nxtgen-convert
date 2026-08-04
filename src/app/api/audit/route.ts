import { and, desc, eq, gte, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id");
  if (!organizationId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = Math.min(200, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100));
  const conditions = [eq(auditEvents.organizationId, organizationId)];
  const action = request.nextUrl.searchParams.get("action")?.trim();
  const result = request.nextUrl.searchParams.get("result")?.trim();
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (action) conditions.push(eq(auditEvents.action, action));
  if (result) conditions.push(eq(auditEvents.result, result));
  if (from && !Number.isNaN(Date.parse(from))) conditions.push(gte(auditEvents.occurredAt, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) conditions.push(lte(auditEvents.occurredAt, new Date(to)));
  const data = await db.select().from(auditEvents).where(and(...conditions)).orderBy(desc(auditEvents.occurredAt)).limit(limit);
  return NextResponse.json({ data, limit });
}

export const GET = withApiGuard(GETHandler);

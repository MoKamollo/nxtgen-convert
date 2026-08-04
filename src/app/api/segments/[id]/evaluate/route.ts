import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, customerSegments } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { compileSegmentWhere } from "@/lib/segments";
async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!; const { id } = await params;
  const [segment] = await db.select().from(customerSegments).where(and(eq(customerSegments.organizationId, organizationId), eq(customerSegments.id, id))).limit(1);
  if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1)); const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 25)));
  const where = compileSegmentWhere(organizationId, segment.definition);
  const [data, total] = await Promise.all([
    db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, status: contacts.status, score: contacts.score, source: contacts.source, tags: contacts.tags }).from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: sql<number>`count(*)` }).from(contacts).where(where),
  ]);
  return NextResponse.json({ data, pagination: { page, limit, total: Number(total[0]?.total ?? 0) }, definitionStatus: segment.status });
}
export const GET = withApiGuard(GETHandler);

import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketingSpend } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rows = await db.select().from(marketingSpend)
    .where(eq(marketingSpend.organizationId, orgId))
    .orderBy(marketingSpend.month);

  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  if (!body.month || !body.amount) {
    return NextResponse.json({ error: "month and amount are required" }, { status: 400 });
  }

  const [row] = await db.insert(marketingSpend).values({
    organizationId: orgId,
    month: body.month,
    channel: body.channel ?? "other",
    amount: body.amount.toString(),
    notes: body.notes ?? null,
  }).returning();

  return NextResponse.json({ data: row }, { status: 201 });
}

async function DELETEHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.delete(marketingSpend).where(
    and(eq(marketingSpend.id, id), eq(marketingSpend.organizationId, orgId))
  );

  return NextResponse.json({ ok: true });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);
export const DELETE = withApiGuard(DELETEHandler);

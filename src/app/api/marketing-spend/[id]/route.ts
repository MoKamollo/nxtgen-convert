import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketingSpend } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  await db.delete(marketingSpend).where(
    and(eq(marketingSpend.id, id), eq(marketingSpend.organizationId, orgId))
  );

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.month   !== undefined) updates.month   = body.month;
  if (body.amount  !== undefined) updates.amount  = body.amount.toString();
  if (body.channel !== undefined) updates.channel = body.channel;
  if (body.notes   !== undefined) updates.notes   = body.notes;

  const [row] = await db.update(marketingSpend)
    .set(updates)
    .where(and(eq(marketingSpend.id, id), eq(marketingSpend.organizationId, orgId)))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: row });
}

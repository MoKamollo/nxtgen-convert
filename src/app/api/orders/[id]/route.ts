import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["status", "paymentStatus", "paymentMethod", "notes"] as const) if (body[key] !== undefined) updates[key] = body[key];
    const [updated] = await db.update(orders).set(updates).where(and(eq(orders.id, id), eq(orders.organizationId, orgId))).returning();
    if (!updated) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const deleted = await db.delete(orders).where(and(eq(orders.id, id), eq(orders.organizationId, orgId))).returning({ id: orders.id });
    if (deleted.length === 0) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}

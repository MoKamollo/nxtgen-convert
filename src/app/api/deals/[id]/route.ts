import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const allowed = ["name","value","stage","probability","contactId","companyId","ownerId","tags","notes","expectedCloseDate","wonAt","lostAt","lostReason"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.value !== undefined) updates.value = body.value.toString();
  if (body.stage === "closed_won" && !body.wonAt) updates.wonAt = new Date();
  if (body.stage === "closed_lost" && !body.lostAt) updates.lostAt = new Date();
  updates.updatedAt = new Date();

  await db.update(deals).set(updates).where(and(eq(deals.id, id), eq(deals.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  await db.delete(deals).where(and(eq(deals.id, id), eq(deals.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}

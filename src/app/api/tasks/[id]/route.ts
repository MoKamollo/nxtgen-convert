import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const allowed = ["title","description","status","priority","assigneeId","contactId","dealId","dueDate","tags","completedAt"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.status === "completed" && !body.completedAt) updates.completedAt = new Date();
  updates.updatedAt = new Date();

  await db.update(tasks).set(updates).where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}

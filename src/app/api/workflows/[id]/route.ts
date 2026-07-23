import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();

    // Atomic completedCount increment — triggered when a contact finishes all steps
    if (body.incrementCompleted === true) {
      const [updated] = await db.update(workflows)
        .set({
          completedCount: sql`${workflows.completedCount} + 1`,
          conversionRate: sql`
            CASE WHEN ${workflows.enrolledCount} > 0
              THEN ROUND(((${workflows.completedCount} + 1)::decimal / ${workflows.enrolledCount}) * 100, 2)
              ELSE 0
            END`,
          updatedAt: new Date(),
        })
        .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
        .returning();
      if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ data: updated });
    }

    const updates: Record<string, unknown> = {};
    const allowed = ["name", "description", "status", "enrolledCount"] as const;
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    updates.updatedAt = new Date();

    const [updated] = await db.update(workflows).set(updates)
      .where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    await db.delete(workflows).where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 });
  }
}

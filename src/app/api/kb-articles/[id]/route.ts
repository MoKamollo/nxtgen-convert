import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kbArticles } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id"); if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params; const body = await request.json(); const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["title", "slug", "excerpt", "content", "category", "tags", "status"] as const) if (body[key] !== undefined) updates[key] = body[key];
    if (body.helpful === true) updates.helpfulYes = sql`${kbArticles.helpfulYes} + 1`;
    if (body.helpful === false) updates.helpfulNo = sql`${kbArticles.helpfulNo} + 1`;
    const [updated] = await db.update(kbArticles).set(updates).where(and(eq(kbArticles.id, id), eq(kbArticles.organizationId, orgId))).returning();
    if (!updated) return NextResponse.json({ error: "Article not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch { return NextResponse.json({ error: "Failed to update article" }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id"); if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try { const { id } = await params; const deleted = await db.delete(kbArticles).where(and(eq(kbArticles.id, id), eq(kbArticles.organizationId, orgId))).returning({ id: kbArticles.id }); if (!deleted.length) return NextResponse.json({ error: "Article not found" }, { status: 404 }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Failed to delete article" }, { status: 500 }); }
}

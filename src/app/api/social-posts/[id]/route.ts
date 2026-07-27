import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialPosts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["content", "platforms", "status", "mediaUrls", "engagement"] as const) if (body[key] !== undefined) updates[key] = body[key];
    if (body.scheduledAt !== undefined) updates.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (body.status === "published") updates.publishedAt = new Date();
    const [updated] = await db.update(socialPosts).set(updates).where(and(eq(socialPosts.id, id), eq(socialPosts.organizationId, orgId))).returning();
    if (!updated) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update social post" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const deleted = await db.delete(socialPosts).where(and(eq(socialPosts.id, id), eq(socialPosts.organizationId, orgId))).returning({ id: socialPosts.id });
    if (!deleted.length) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete social post" }, { status: 500 });
  }
}

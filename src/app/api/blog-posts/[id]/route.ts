import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blogPosts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
async function PATCHHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "title",
      "slug",
      "excerpt",
      "content",
      "category",
      "featuredImage",
      "status",
      "metaTitle",
      "metaDescription",
    ] as const)
      if (body[key] !== undefined) updates[key] = body[key];
    if (body.status === "published") updates.publishedAt = new Date();
    const [updated] = await db
      .update(blogPosts)
      .set(updates)
      .where(and(eq(blogPosts.id, id), eq(blogPosts.organizationId, orgId)))
      .returning();
    if (!updated)
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update blog post" },
      { status: 500 },
    );
  }
}
async function DELETEHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const deleted = await db
      .delete(blogPosts)
      .where(and(eq(blogPosts.id, id), eq(blogPosts.organizationId, orgId)))
      .returning({ id: blogPosts.id });
    if (!deleted.length)
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete blog post" },
      { status: 500 },
    );
  }
}

export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { websitePages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export async function PATCH(
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
      "content",
      "status",
      "metaTitle",
      "metaDescription",
    ] as const)
      if (body[key] !== undefined) updates[key] = body[key];
    const [updated] = await db
      .update(websitePages)
      .set(updates)
      .where(
        and(eq(websitePages.id, id), eq(websitePages.organizationId, orgId)),
      )
      .returning();
    if (!updated)
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update page" },
      { status: 500 },
    );
  }
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const deleted = await db
      .delete(websitePages)
      .where(
        and(eq(websitePages.id, id), eq(websitePages.organizationId, orgId)),
      )
      .returning({ id: websitePages.id });
    if (!deleted.length)
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete page" },
      { status: 500 },
    );
  }
}

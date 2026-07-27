import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { websitePages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const data = await db
      .select()
      .from(websitePages)
      .where(eq(websitePages.organizationId, orgId))
      .orderBy(desc(websitePages.updatedAt));
    return NextResponse.json({ data, total: data.length });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch pages" },
      { status: 500 },
    );
  }
}
export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title)
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const [created] = await db
      .insert(websitePages)
      .values({
        organizationId: orgId,
        title,
        slug: slugify(String(body.slug || title)),
        content: String(body.content ?? ""),
        status: String(body.status ?? "draft"),
        metaTitle: body.metaTitle ? String(body.metaTitle) : null,
        metaDescription: body.metaDescription
          ? String(body.metaDescription)
          : null,
      })
      .returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create page" },
      { status: 500 },
    );
  }
}

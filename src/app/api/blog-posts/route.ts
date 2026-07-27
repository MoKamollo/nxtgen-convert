import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blogPosts } from "@/db/schema";
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
      .from(blogPosts)
      .where(eq(blogPosts.organizationId, orgId))
      .orderBy(desc(blogPosts.updatedAt));
    return NextResponse.json({ data, total: data.length });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch blog posts" },
      { status: 500 },
    );
  }
}
export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title)
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const status = String(body.status ?? "draft");
    const [created] = await db
      .insert(blogPosts)
      .values({
        organizationId: orgId,
        title,
        slug: slugify(String(body.slug || title)),
        excerpt: body.excerpt ? String(body.excerpt) : null,
        content: String(body.content ?? ""),
        category: String(body.category ?? "General"),
        authorId: userId || null,
        featuredImage: body.featuredImage ? String(body.featuredImage) : null,
        status,
        metaTitle: body.metaTitle ? String(body.metaTitle) : null,
        metaDescription: body.metaDescription
          ? String(body.metaDescription)
          : null,
        publishedAt: status === "published" ? new Date() : null,
      })
      .returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create blog post" },
      { status: 500 },
    );
  }
}

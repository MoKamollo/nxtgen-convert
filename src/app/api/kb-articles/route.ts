import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kbArticles } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const data = await db.select().from(kbArticles).where(eq(kbArticles.organizationId, orgId)).orderBy(desc(kbArticles.updatedAt));
    return NextResponse.json({ data, total: data.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch knowledge base" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json(); const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const [created] = await db.insert(kbArticles).values({ organizationId: orgId, title, slug: slugify(String(body.slug || title)), excerpt: body.excerpt ? String(body.excerpt) : null, content: String(body.content ?? ""), category: String(body.category ?? "General"), tags: Array.isArray(body.tags) ? body.tags.map(String) : [], status: String(body.status ?? "draft") }).returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create article" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

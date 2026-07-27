import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialPosts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const data = await db.select().from(socialPosts).where(eq(socialPosts.organizationId, orgId)).orderBy(desc(socialPosts.scheduledAt), desc(socialPosts.createdAt));
    return NextResponse.json({ data, total: data.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch social posts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const content = String(body.content ?? "").trim();
    const platforms = Array.isArray(body.platforms) ? body.platforms.map(String) : [];
    if (!content || platforms.length === 0) return NextResponse.json({ error: "Content and at least one platform are required" }, { status: 400 });
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const status = body.status ?? (scheduledAt ? "scheduled" : "draft");
    const [created] = await db.insert(socialPosts).values({ organizationId: orgId, content, platforms, status: String(status), scheduledAt, publishedAt: status === "published" ? new Date() : null, mediaUrls: Array.isArray(body.mediaUrls) ? body.mediaUrls.map(String) : [] }).returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create social post" }, { status: 500 });
  }
}

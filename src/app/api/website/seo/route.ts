import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blogPosts, websitePages } from "@/db/schema";
import { eq } from "drizzle-orm";

type SeoItem = { id: string; kind: "page" | "post"; title: string; slug: string; content: string | null; metaTitle: string | null; metaDescription: string | null };
function audit(item: SeoItem, duplicateTitles: Set<string>) {
  const issues: string[] = []; let score = 0;
  if (item.metaTitle) score += 20; else issues.push("Missing meta title");
  const titleLength = item.metaTitle?.length ?? 0; if (titleLength >= 50 && titleLength <= 60) score += 10; else issues.push("Meta title should be 50 to 60 characters");
  if (item.metaDescription) score += 20; else issues.push("Missing meta description");
  const descLength = item.metaDescription?.length ?? 0; if (descLength >= 150 && descLength <= 160) score += 10; else issues.push("Meta description should be 150 to 160 characters");
  if (!duplicateTitles.has((item.metaTitle || item.title).toLowerCase())) score += 15; else issues.push("Duplicate title");
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) score += 15; else issues.push("Slug contains invalid characters");
  const wordCount = (item.content ?? "").trim().split(/\s+/).filter(Boolean).length; if (wordCount > 300) score += 10; else issues.push("Content has fewer than 300 words");
  return { ...item, url: `/${item.kind === "post" ? "blog/" : ""}${item.slug}`, titleLength, descLength, wordCount, score, issues };
}
export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id"); if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [pages, posts] = await Promise.all([db.select().from(websitePages).where(eq(websitePages.organizationId, orgId)), db.select().from(blogPosts).where(eq(blogPosts.organizationId, orgId))]);
    const items: SeoItem[] = [...pages.map(p => ({ id: p.id, kind: "page" as const, title: p.title, slug: p.slug, content: p.content, metaTitle: p.metaTitle, metaDescription: p.metaDescription })), ...posts.map(p => ({ id: p.id, kind: "post" as const, title: p.title, slug: p.slug, content: p.content, metaTitle: p.metaTitle, metaDescription: p.metaDescription }))];
    const counts = new Map<string, number>(); for (const item of items) { const key = (item.metaTitle || item.title).toLowerCase(); counts.set(key, (counts.get(key) ?? 0) + 1); }
    const duplicates = new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key)); const data = items.map(item => audit(item, duplicates));
    return NextResponse.json({ data: { pages: data, overallScore: data.length ? Math.round(data.reduce((s, item) => s + item.score, 0) / data.length) : 0, issuesFound: data.reduce((s, item) => s + item.issues.length, 0), criticalIssues: data.reduce((s, item) => s + item.issues.filter(issue => issue.startsWith("Missing")).length, 0) } });
  } catch { return NextResponse.json({ error: "Failed to run SEO audit" }, { status: 500 }); }
}

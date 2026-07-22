import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
        industry: companies.industry,
        size: companies.size,
        website: companies.website,
        phone: companies.phone,
        tags: companies.tags,
        revenue: companies.revenue,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(eq(companies.organizationId, orgId))
      .limit(200);

    const contactCounts = await db
      .select({ companyId: contacts.companyId, count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(eq(contacts.organizationId, orgId))
      .groupBy(contacts.companyId);

    const countMap = Object.fromEntries(contactCounts.map((r) => [r.companyId, r.count]));

    const shaped = rows.map((r) => ({
      ...r,
      revenue: parseFloat(r.revenue ?? "0"),
      contactCount: countMap[r.id] ?? 0,
    }));

    return NextResponse.json({ data: shaped, total: shaped.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const [company] = await db.insert(companies).values({
      organizationId: orgId,
      name: body.name,
      domain: body.domain,
      industry: body.industry,
      size: body.size,
      website: body.website,
      phone: body.phone,
      tags: body.tags ?? [],
    }).returning();
    return NextResponse.json({ data: company }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
}

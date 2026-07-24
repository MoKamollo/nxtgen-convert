import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, contacts, companies, users } from "@/db/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { dealStageEnum } from "@/db/schema";

const VALID_STAGES = dealStageEnum.enumValues;

export async function GET(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const query = db
      .select({
        id: deals.id,
        name: deals.name,
        value: deals.value,
        stage: deals.stage,
        probability: deals.probability,
        currency: deals.currency,
        expectedCloseDate: deals.expectedCloseDate,
        tags: deals.tags,
        wonAt: deals.wonAt,
        lostAt: deals.lostAt,
        createdAt: deals.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        companyName: companies.name,
        ownerName: users.name,
      })
      .from(deals)
      .leftJoin(contacts, and(eq(deals.contactId, contacts.id), eq(contacts.organizationId, orgId)))
      .leftJoin(companies, and(eq(deals.companyId, companies.id), eq(companies.organizationId, orgId)))
      .leftJoin(users, and(eq(deals.ownerId, users.id), eq(users.organizationId, orgId)));

    const searchParam = request.nextUrl.searchParams.get("search");
    const stageParam  = request.nextUrl.searchParams.get("stage");

    const conditions = [eq(deals.organizationId, orgId)];
    if (stageParam && VALID_STAGES.includes(stageParam as typeof VALID_STAGES[number])) {
      conditions.push(eq(deals.stage, stageParam as typeof VALID_STAGES[number]));
    }
    if (searchParam) {
      conditions.push(or(ilike(deals.name, `%${searchParam}%`))!);
    }

    const results = await query.where(and(...conditions)).limit(100);

    const shaped = results.map((r) => ({
      id: r.id,
      name: r.name,
      value: parseFloat(r.value ?? "0"),
      stage: r.stage ?? "prospecting",
      probability: r.probability ?? 0,
      currency: r.currency ?? "USD",
      expectedCloseDate: r.expectedCloseDate,
      tags: r.tags ?? [],
      wonAt: r.wonAt,
      lostAt: r.lostAt,
      createdAt: r.createdAt,
      contact: r.contactFirstName ? `${r.contactFirstName} ${r.contactLastName ?? ""}`.trim() : "",
      company: r.companyName ?? "",
      owner: r.ownerName ?? "",
    }));

    return NextResponse.json({ data: shaped, total: shaped.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await request.json();
    const [deal] = await db.insert(deals).values({
      organizationId: orgId,
      name: body.name,
      value: body.value?.toString(),
      stage: body.stage || "prospecting",
      probability: body.probability || 0,
      contactId: body.contactId,
      companyId: body.companyId,
      ownerId: body.ownerId,
      tags: body.tags || [],
      customFields: body.customFields || {},
    }).returning();
    return NextResponse.json({ data: deal }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}

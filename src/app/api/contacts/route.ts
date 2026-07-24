import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, companies, users, deals, contactStatusEnum } from "@/db/schema";
import { eq, sql, and, ilike, or } from "drizzle-orm";
import { triggerAutomation } from "@/lib/automation";

const VALID_STATUSES = contactStatusEnum.enumValues;

export async function GET(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const query = db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        status: contacts.status,
        jobTitle: contacts.jobTitle,
        score: contacts.score,
        tags: contacts.tags,
        source: contacts.source,
        lastContactedAt: contacts.lastContactedAt,
        createdAt: contacts.createdAt,
        companyName: companies.name,
        ownerName: users.name,
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .leftJoin(users, eq(contacts.ownerId, users.id));

    const searchParam = request.nextUrl.searchParams.get("search");
    const statusParam = request.nextUrl.searchParams.get("status");
    const page        = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10));
    const pageSize    = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10)));
    const offset      = (page - 1) * pageSize;

    const conditions = [eq(contacts.organizationId, orgId)];
    if (statusParam && statusParam !== "all") {
      if (VALID_STATUSES.includes(statusParam as typeof VALID_STATUSES[number])) {
        conditions.push(eq(contacts.status, statusParam as typeof VALID_STATUSES[number]));
      }
    }
    if (searchParam) {
      conditions.push(
        or(
          ilike(contacts.firstName, `%${searchParam}%`),
          ilike(contacts.lastName, `%${searchParam}%`),
          ilike(contacts.email, `%${searchParam}%`),
          ilike(contacts.phone, `%${searchParam}%`),
        )!
      );
    }

    const results = await query.where(and(...conditions)).limit(pageSize).offset(offset);

    // Aggregate closed_won deal value per contact for accurate revenue
    const revenueRows = await db
      .select({
        contactId: deals.contactId,
        total: sql<string>`COALESCE(SUM(${deals.value}::numeric), 0)`,
      })
      .from(deals)
      .where(and(eq(deals.organizationId, orgId), eq(deals.stage, "closed_won")))
      .groupBy(deals.contactId);

    const revenueMap = new Map(revenueRows.map((r) => [r.contactId, parseFloat(r.total)]));

    const shaped = results.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      status: r.status,
      jobTitle: r.jobTitle,
      score: r.score ?? 0,
      tags: r.tags ?? [],
      source: r.source,
      lastContactedAt: r.lastContactedAt,
      createdAt: r.createdAt,
      company: r.companyName ?? "",
      owner: r.ownerName ?? "",
      revenue: revenueMap.get(r.id) ?? 0,
    }));

    return NextResponse.json({ data: shaped, total: shaped.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

function calcScore(data: { email?: string; phone?: string; jobTitle?: string; source?: string; status?: string }): number {
  const statusBase: Record<string, number> = { vip: 90, customer: 70, prospect: 45, lead: 25, churned: 10 };
  const sourceBonus: Record<string, number> = { referral: 15, organic: 10, event: 8, paid_ads: 5, cold_outreach: 2, other: 3 };
  let score = statusBase[data.status ?? "lead"] ?? 25;
  if (data.email) score += 10;
  if (data.phone) score += 5;
  if (data.jobTitle) score += 5;
  score += sourceBonus[data.source ?? ""] ?? 0;
  return Math.min(score, 100);
}

export async function POST(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await request.json();

    if (!body.firstName?.trim()) return NextResponse.json({ error: "firstName is required" }, { status: 400 });
    if (body.firstName.length > 100) return NextResponse.json({ error: "firstName too long (max 100 chars)" }, { status: 400 });
    if (body.lastName && body.lastName.length > 100) return NextResponse.json({ error: "lastName too long (max 100 chars)" }, { status: 400 });
    if (body.status && !VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(", ")}` }, { status: 400 });

    const score = calcScore({ email: body.email, phone: body.phone, jobTitle: body.jobTitle, source: body.source, status: body.status });
    const [contact] = await db.insert(contacts).values({
      organizationId: orgId,
      firstName: body.firstName.trim().slice(0, 100),
      lastName: body.lastName?.trim().slice(0, 100),
      email: body.email,
      phone: body.phone,
      status: body.status || "lead",
      source: body.source,
      tags: body.tags || [],
      customFields: body.customFields || {},
      score,
    }).returning();
    await triggerAutomation(orgId, "contact.created", { contactId: contact.id });
    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (error) {
    console.error("[contacts POST]", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}

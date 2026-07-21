import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, companies, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");

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

    const results = orgId
      ? await query.where(eq(contacts.organizationId, orgId)).limit(200)
      : await query.limit(200);

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
      revenue: 0,
    }));

    return NextResponse.json({ data: shaped, total: shaped.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [contact] = await db.insert(contacts).values({
      organizationId: body.organizationId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      status: body.status || "lead",
      source: body.source,
      tags: body.tags || [],
      customFields: body.customFields || {},
    }).returning();
    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}

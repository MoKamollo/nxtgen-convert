import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { analyticsEvents, contacts, deals, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [contactRows, dealRows, eventRows, orgRows] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.organizationId, orgId)),
      db.select().from(deals).where(eq(deals.organizationId, orgId)),
      db
        .select({ id: analyticsEvents.id })
        .from(analyticsEvents)
        .where(eq(analyticsEvents.organizationId, orgId)),
      db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1),
    ]);
    const activeDealContacts = new Set(
      dealRows
        .filter((d) => !["closed_won", "closed_lost"].includes(d.stage ?? ""))
        .map((d) => d.contactId)
        .filter(Boolean),
    );
    const settings = (orgRows[0]?.settings ?? {}) as Record<string, unknown> & {
      customFunnelStages?: Array<{ id: string; name: string; count: number }>;
    };
    const stages = [
      { name: "Visitors", count: eventRows.length },
      {
        name: "Leads",
        count: contactRows.filter((c) => c.status === "lead").length,
      },
      {
        name: "Prospects",
        count: contactRows.filter((c) => c.status === "prospect").length,
      },
      { name: "Opportunities", count: activeDealContacts.size },
      {
        name: "Customers",
        count: contactRows.filter((c) =>
          ["customer", "vip"].includes(c.status ?? ""),
        ).length,
      },
      ...(settings.customFunnelStages ?? []),
    ];
    const data = stages.map((stage, index) => ({
      ...stage,
      conversionRate:
        index === 0
          ? 100
          : stages[index - 1].count
            ? (stage.count / stages[index - 1].count) * 100
            : 0,
      dropOffRate:
        index === 0
          ? 0
          : stages[index - 1].count
            ? ((stages[index - 1].count - stage.count) /
                stages[index - 1].count) *
              100
            : 0,
    }));
    const sourceMap = new Map<string, number>();
    for (const contact of contactRows)
      sourceMap.set(
        contact.source ?? "Unknown",
        (sourceMap.get(contact.source ?? "Unknown") ?? 0) + 1,
      );
    return NextResponse.json({
      data: {
        stages: data,
        sourceBreakdown: [...sourceMap.entries()].map(([source, count]) => ({
          source,
          count,
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch funnel" },
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
    const name = String(body.name ?? "").trim();
    const count = Math.max(0, Number(body.count ?? 0));
    if (!name)
      return NextResponse.json(
        { error: "Stage name is required" },
        { status: 400 },
      );
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org)
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    const settings = (org.settings ?? {}) as Record<string, unknown> & {
      customFunnelStages?: Array<{ id: string; name: string; count: number }>;
    };
    const stage = { id: crypto.randomUUID(), name, count };
    await db
      .update(organizations)
      .set({
        settings: {
          ...settings,
          customFunnelStages: [...(settings.customFunnelStages ?? []), stage],
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));
    return NextResponse.json({ data: stage }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to add funnel stage" },
      { status: 500 },
    );
  }
}

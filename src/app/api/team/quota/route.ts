import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, organizationMemberships, users } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const [members, wonDeals] = await Promise.all([
    db.select({ id: users.id, name: users.name, avatar: users.avatar, preferences: users.preferences }).from(organizationMemberships).innerJoin(users, eq(users.id, organizationMemberships.userId)).where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.status, "active"))),
    db.select({ ownerId: deals.ownerId, value: deals.value }).from(deals).where(and(eq(deals.organizationId, orgId), eq(deals.stage, "closed_won"))),
  ]);
  const data = members.map((member) => {
    const owned = wonDeals.filter((deal) => deal.ownerId === member.id);
    const preferences = (member.preferences ?? {}) as Record<string, unknown>;
    return { userId: member.id, name: member.name, avatar: member.avatar, wonDeals: owned.length, wonValue: owned.reduce((sum, deal) => sum + Number(deal.value ?? 0), 0), quota: Number(preferences.quota ?? 0) };
  });
  return NextResponse.json({ data });
}

export const GET = withApiGuard(GETHandler);

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [members, wonDeals] = await Promise.all([
      db.select({ id: users.id, name: users.name, avatar: users.avatar, preferences: users.preferences }).from(users).where(eq(users.organizationId, orgId)),
      db.select({ ownerId: deals.ownerId, value: deals.value }).from(deals).where(and(eq(deals.organizationId, orgId), eq(deals.stage, "closed_won"))),
    ]);
    const data = members.map(member => {
      const owned = wonDeals.filter(deal => deal.ownerId === member.id);
      const preferences = (member.preferences ?? {}) as Record<string, unknown>;
      return { userId: member.id, name: member.name, avatar: member.avatar, wonDeals: owned.length, wonValue: owned.reduce((sum, deal) => sum + Number(deal.value ?? 0), 0), quota: Number(preferences.quota ?? 0) };
    });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Failed to fetch team quota" }, { status: 500 });
  }
}

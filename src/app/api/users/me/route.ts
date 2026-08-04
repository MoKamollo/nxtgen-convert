import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizationMemberships, organizations, users } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest) {
  const tenantId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;
  const [row] = await db.select({
    tenantId: organizations.id,
    organizationName: organizations.name,
    plan: organizations.plan,
    role: organizationMemberships.role,
    membershipStatus: organizationMemberships.status,
    userId: users.id,
    name: users.name,
    email: users.email,
    jobTitle: users.jobTitle,
    phone: users.phone,
    timezone: users.timezone,
    avatar: users.avatar,
    preferences: users.preferences,
  }).from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.organizationId, tenantId), eq(organizationMemberships.userId, userId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "User membership not found" }, { status: 404 });
  return NextResponse.json({ tenantId, role: row.role, org: { id: row.tenantId, name: row.organizationName, plan: row.plan }, user: { id: row.userId, name: row.name, email: row.email, jobTitle: row.jobTitle, phone: row.phone, timezone: row.timezone, avatar: row.avatar, preferences: row.preferences } });
}

async function PATCHHandler(request: NextRequest) {
  const userId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const [current] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  if (!current) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "jobTitle", "phone", "timezone"] as const) {
    if (body[key] !== undefined) updates[key] = String(body[key]).trim().slice(0, 120);
  }
  if (body.notifications !== undefined || body.appearance !== undefined) {
    updates.preferences = { ...((current.preferences ?? {}) as Record<string, unknown>), ...(body.notifications !== undefined ? { notifications: body.notifications } : {}), ...(body.appearance !== undefined ? { appearance: body.appearance } : {}) };
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);

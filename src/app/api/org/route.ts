import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizationMemberships, organizations, users } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const members = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: organizationMemberships.role,
    status: organizationMemberships.status,
    jobTitle: users.jobTitle,
    avatar: users.avatar,
    lastActiveAt: users.lastActiveAt,
    joinedAt: organizationMemberships.joinedAt,
  }).from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, orgId));
  return NextResponse.json({ data: { ...org, settings: undefined, members } });
}

async function PATCHHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "website", "industry", "size"] as const) {
    if (body[key] !== undefined) updates[key] = String(body[key]).trim().slice(0, key === "name" ? 120 : 500);
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  await db.update(organizations).set({ ...updates, updatedAt: new Date() }).where(eq(organizations.id, orgId));
  return NextResponse.json({ ok: true });
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);

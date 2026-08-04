import { and, eq, isNull, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions, organizationMemberships, users } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

const ASSIGNABLE = new Set(["admin", "manager", "member", "viewer"]);

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const requestorRole = request.headers.get("x-user-role")!;
  const { id: targetUserId } = await params;
  const body = await request.json();
  const nextRole = String(body.role ?? "");
  if (!ASSIGNABLE.has(nextRole)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  const [target] = await db.select().from(organizationMemberships).where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.userId, targetUserId))).limit(1);
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "The owner role cannot be changed here" }, { status: 400 });
  if (requestorRole !== "owner" && nextRole === "admin") return NextResponse.json({ error: "Only the owner can grant administrator access" }, { status: 403 });

  const [updated] = await db.update(organizationMemberships).set({ role: nextRole as "admin" | "manager" | "member" | "viewer", version: target.version + 1, updatedAt: new Date() }).where(eq(organizationMemberships.id, target.id)).returning();
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.membershipId, target.id), isNull(authSessions.revokedAt)));
  await db.update(users).set({ role: updated.role, updatedAt: new Date() }).where(and(eq(users.id, targetUserId), eq(users.organizationId, orgId)));
  return NextResponse.json({ data: updated });
}

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const requestorId = request.headers.get("x-user-id")!;
  const { id: targetUserId } = await params;
  if (targetUserId === requestorId) return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
  const [target] = await db.select().from(organizationMemberships).where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.userId, targetUserId))).limit(1);
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "The organization owner cannot be removed" }, { status: 400 });
  await db.update(organizationMemberships).set({ status: "removed", version: target.version + 1, updatedAt: new Date() }).where(eq(organizationMemberships.id, target.id));
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.membershipId, target.id), isNull(authSessions.revokedAt)));
  await db.update(users).set({ organizationId: null }).where(and(eq(users.id, targetUserId), eq(users.organizationId, orgId), ne(users.role, "owner")));
  return NextResponse.json({ success: true });
}

export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

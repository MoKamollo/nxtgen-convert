import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions, organizationInvitations, organizationMemberships, organizations, users } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { hashSensitive } from "@/lib/request-security";
import { cookieHeader, SESSION_TTL_SECONDS, signSession } from "@/lib/session";

async function POSTHandler(request: NextRequest) {
  const userId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const token = String(body.token ?? "");
  if (!token) return NextResponse.json({ error: "Invitation token required" }, { status: 400 });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const [invitation] = await db.select().from(organizationInvitations).where(and(
    eq(organizationInvitations.tokenHash, hashSensitive(token)),
    eq(organizationInvitations.status, "pending"),
    gt(organizationInvitations.expiresAt, new Date()),
  )).limit(1);
  if (!invitation) return NextResponse.json({ error: "Invitation is invalid, expired, revoked, or already used" }, { status: 410 });
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) return NextResponse.json({ error: "This invitation belongs to a different email address" }, { status: 403 });

  const payload = await db.transaction(async (tx) => {
    let [membership] = await tx.select().from(organizationMemberships).where(and(eq(organizationMemberships.organizationId, invitation.organizationId), eq(organizationMemberships.userId, user.id))).limit(1);
    if (membership && membership.status === "active") throw new Error("already_member");
    if (membership) {
      [membership] = await tx.update(organizationMemberships).set({ role: invitation.role, status: "active", version: membership.version + 1, joinedAt: new Date(), updatedAt: new Date() }).where(eq(organizationMemberships.id, membership.id)).returning();
    } else {
      [membership] = await tx.insert(organizationMemberships).values({ organizationId: invitation.organizationId, userId: user.id, role: invitation.role, status: "active" }).returning();
    }
    await tx.update(organizationInvitations).set({ status: "accepted", acceptedAt: new Date(), updatedAt: new Date() }).where(eq(organizationInvitations.id, invitation.id));
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, invitation.organizationId)).limit(1);
    if (!org) throw new Error("organization_missing");
    await tx.update(users).set({ organizationId: org.id, role: membership.role, updatedAt: new Date() }).where(eq(users.id, user.id));
    const [session] = await tx.insert(authSessions).values({
      organizationId: org.id,
      userId: user.id,
      membershipId: membership.id,
      membershipVersion: membership.version,
      userAuthVersion: user.authVersion,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    }).returning();
    return { sessionId: session.id, userId: user.id, membershipId: membership.id, membershipVersion: membership.version, userAuthVersion: user.authVersion, tenantId: org.id, email: user.email, name: user.name, role: membership.role, plan: org.plan ?? "starter" };
  }).catch((error) => {
    if (error instanceof Error && error.message === "already_member") return null;
    throw error;
  });
  if (!payload) return NextResponse.json({ error: "You are already a member of this organization" }, { status: 409 });
  const sessionToken = await signSession(payload);
  const response = NextResponse.json({ ok: true, redirect: "/dashboard" });
  response.headers.set("Set-Cookie", cookieHeader(sessionToken));
  return response;
}

export const POST = withApiGuard(POSTHandler);

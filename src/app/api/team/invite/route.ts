import { randomBytes } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizationInvitations, organizationMemberships, organizations, users } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { hashSensitive } from "@/lib/request-security";

const VALID_ROLES = new Set(["admin", "manager", "member", "viewer"]);

async function sendInvitationEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("RESEND_API_KEY and EMAIL_FROM are required for invitations");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const inviterId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "member");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Name and a valid email are required" }, { status: 400 });
  if (!VALID_ROLES.has(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return NextResponse.json({ error: "Invitation email delivery is not configured", required: ["RESEND_API_KEY", "EMAIL_FROM"] }, { status: 503 });
  }

  const [existingMember] = await db.select({ id: organizationMemberships.id }).from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(eq(organizationMemberships.organizationId, orgId), eq(users.email, email), eq(organizationMemberships.status, "active"))).limit(1);
  if (existingMember) return NextResponse.json({ error: "This user is already a member" }, { status: 409 });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashSensitive(rawToken);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  await db.update(organizationInvitations).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(and(
    eq(organizationInvitations.organizationId, orgId),
    eq(organizationInvitations.email, email),
    eq(organizationInvitations.status, "pending"),
    gt(organizationInvitations.expiresAt, new Date()),
  ));
  const [invitation] = await db.insert(organizationInvitations).values({
    organizationId: orgId,
    email,
    name,
    role: role as "admin" | "manager" | "member" | "viewer",
    tokenHash,
    invitedByUserId: inviterId,
    expiresAt,
  }).returning({ id: organizationInvitations.id });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const acceptUrl = `${appUrl}/invite/accept?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendInvitationEmail(email, `Invitation to ${org.name}`, `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#080f1e;color:#f8fafc;border-radius:12px">
        <h1 style="font-size:22px;margin:0 0 12px">Join ${org.name}</h1>
        <p style="color:#94a3b8;line-height:1.6">You have been invited to NxtGen Convergence as <strong>${role}</strong>. Sign in or create your NxtGen account, then accept the invitation.</p>
        <a href="${acceptUrl}" style="display:inline-block;margin-top:18px;padding:11px 18px;border-radius:8px;background:#7B6EF6;color:white;text-decoration:none;font-weight:600">Accept invitation</a>
        <p style="color:#64748b;font-size:12px;margin-top:24px">This secure link expires in 72 hours and can be used once.</p>
      </div>`);
  } catch (error) {
    await db.update(organizationInvitations).set({ status: "delivery_failed", updatedAt: new Date() }).where(eq(organizationInvitations.id, invitation.id));
    return NextResponse.json({ error: "Invitation was not activated because email delivery failed", detail: error instanceof Error ? error.message : undefined }, { status: 502 });
  }

  return NextResponse.json({ ok: true, data: { id: invitation.id, email, role, expiresAt, delivery: "sent" } }, { status: 201 });
}

export const POST = withApiGuard(POSTHandler);

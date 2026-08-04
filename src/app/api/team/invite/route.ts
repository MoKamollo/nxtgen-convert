import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const SPACE_REGISTER_URL = "https://space.nxtgen-stack.com/api/auth/register.php";

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const requestorRole = request.headers.get("x-user-role");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!["owner", "admin"].includes(requestorRole ?? "")) {
    return NextResponse.json({ error: "Only owners and admins can invite members" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, email, role = "member" } = body;
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const validRoles = ["admin", "manager", "member", "viewer"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check email not already in this org
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), eq(users.organizationId, orgId)))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists in your team" }, { status: 409 });
    }

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    // Register with Space first — invited users must have a Space account to log in
    const tempPassword = crypto.randomBytes(12).toString("base64").slice(0, 16); // 16 chars, 12+ required by Space
    let isNewSpaceAccount = false;

    const spaceRes = await fetch(SPACE_REGISTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: normalizedEmail, password: tempPassword }),
    });

    if (!spaceRes.ok) {
      const spaceBody = await spaceRes.json().catch(() => ({}));
      const message: string = spaceBody?.message ?? spaceBody?.error ?? "";
      // "already" in message means they have an existing Space account — safe to proceed
      if (!message.toLowerCase().includes("already")) {
        console.error("Space registration failed:", spaceBody);
        return NextResponse.json({ error: "Failed to register user with Space" }, { status: 502 });
      }
      // User already in Space — they'll log in with their existing credentials
      isNewSpaceAccount = false;
    } else {
      isNewSpaceAccount = true;
    }

    // Add user to this org's Convert workspace
    const [newUser] = await db
      .insert(users)
      .values({
        organizationId: orgId,
        name: name.trim(),
        email: normalizedEmail,
        role,
      })
      .returning();

    // Send invite email
    const resendKey = process.env.RESEND_API_KEY;
    let emailSent = false;
    if (resendKey) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://convert.nxtgen-stack.com"}/login`;
        const credentialsBlock = isNewSpaceAccount
          ? `<p style="color:#94a3b8;font-size:13px;margin-top:16px">
               Your temporary password: <strong style="color:#e2e8f0;font-family:monospace">${tempPassword}</strong><br/>
               Please change it after your first login.
             </p>`
          : `<p style="color:#94a3b8;font-size:13px;margin-top:16px">
               Use your existing NxtGen Space credentials to sign in.
             </p>`;

        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "NxtGen Convergence <noreply@nxtgen-stack.com>",
          to: normalizedEmail,
          subject: `You've been invited to ${org?.name ?? "NxtGen Convergence"}`,
          html: `
            <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f1e;color:#e2e8f0;border-radius:12px">
              <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">You're invited!</h2>
              <p style="color:#94a3b8;font-size:14px;margin-bottom:24px">
                You've been added to <strong style="color:#e2e8f0">${org?.name ?? "NxtGen Convergence"}</strong> as a
                <strong style="color:#e2e8f0">${role}</strong>.
              </p>
              <a href="${loginUrl}"
                style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b9eff);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
                Accept Invitation &amp; Sign In
              </a>
              ${credentialsBlock}
              <p style="color:#475569;font-size:12px;margin-top:24px">Sign in with: ${normalizedEmail}</p>
            </div>
          `,
        });
        emailSent = true;
      } catch { /* email failure does not block user creation */ }
    }

    return NextResponse.json({ data: newUser, emailSent, isNewSpaceAccount }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to invite member" }, { status: 500 });
  }
}

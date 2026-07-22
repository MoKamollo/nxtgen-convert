import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, cookieHeader } from "@/lib/session";

const SPACE_REGISTER_URL = "https://space.nxtgen-stack.com/api/auth/register.php";

function spaceIdToUUID(id: string): string {
  // Strip any prefix (usr_, tnt_, etc.) then pad/trim to 32 hex chars
  const hex = id.replace(/^[a-z]+_/i, "").replace(/[^a-f0-9]/gi, "").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
    }

    const regRes = await fetch(SPACE_REGISTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, redirect_after_verify: "https://convert.nxtgen-stack.com/login?verified=1" }),
    });

    const regData = await regRes.json();

    if (!regRes.ok) {
      return NextResponse.json({ error: regData.error ?? "Registration failed." }, { status: 400 });
    }

    // Space requires email verification before login
    if (regData.status === "verify_email") {
      return NextResponse.json({ ok: true, verify: true }, { status: 200 });
    }

    if (!regData.user) {
      return NextResponse.json({ error: "Registration failed." }, { status: 400 });
    }

    const { id: userId, tenant_id: rawTenantId, role, plan } = regData.user;
    const tenantId = rawTenantId.includes("-") ? rawTenantId : spaceIdToUUID(rawTenantId);

    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(organizations).values({
        id: tenantId,
        name: name + "'s Workspace",
        slug: rawTenantId,
        plan: "starter",
      });
    }

    const token = await signSession({ userId, tenantId, email, name, role, plan });
    const response = NextResponse.json({ ok: true, redirect: "/dashboard" });
    response.headers.set("Set-Cookie", cookieHeader(token));
    return response;

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}

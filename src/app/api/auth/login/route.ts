import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, cookieHeader } from "@/lib/session";

const SPACE_LOGIN_URL = "https://space.nxtgen-stack.com/api/auth/login.php";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Proxy login to Space
    const spaceRes = await fetch(SPACE_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const spaceData = await spaceRes.json();

    if (!spaceRes.ok || !spaceData.user) {
      return NextResponse.json(
        { error: spaceData.error ?? "Invalid credentials" },
        { status: 401 }
      );
    }

    const { id: userId, tenant_id: rawTenantId, name, role, plan } = spaceData.user;

    // Space IDs are 32-char hex — format as UUID for Postgres
    const toUUID = (hex: string) =>
      `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
    const tenantId = rawTenantId.includes("-") ? rawTenantId : toUUID(rawTenantId);

    // Auto-create org in Convert DB if first login for this tenant
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

    const token = signSession({ userId, tenantId, email, name, role, plan });

    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const response = NextResponse.json({ ok: true, redirect: next });
    response.headers.set("Set-Cookie", cookieHeader(token));
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

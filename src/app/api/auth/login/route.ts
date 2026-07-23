import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
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

    // Convert Space IDs (various formats) to UUID for Postgres
    const spaceIdToUUID = (id: string) => {
      const hex = id.replace(/^[a-z]+_/i, "").replace(/[^a-f0-9]/gi, "").padEnd(32, "0").slice(0, 32);
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
    };
    const tenantId = rawTenantId.includes("-") ? rawTenantId : spaceIdToUUID(rawTenantId);

    // Auto-create org in Convert DB if first login for this tenant.
    // If tenantId not found, check whether this user already has an org (by email in users table)
    // to avoid creating duplicate orgs when Space returns a different tenant_id format.
    let resolvedTenantId = tenantId;
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (existing.length === 0) {
      // Look for an existing org via the user record (email match)
      const existingUser = await db
        .select({ organizationId: users.organizationId })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (existingUser.length > 0 && existingUser[0].organizationId) {
        // Reuse the existing org rather than creating a duplicate
        resolvedTenantId = existingUser[0].organizationId;
      } else {
        await db.insert(organizations).values({
          id: tenantId,
          name: name + "'s Workspace",
          slug: rawTenantId,
          plan: "starter",
        });
      }
    }

    const token = await signSession({ userId, tenantId: resolvedTenantId, email, name, role, plan });

    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const response = NextResponse.json({ ok: true, redirect: next });
    response.headers.set("Set-Cookie", cookieHeader(token));
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

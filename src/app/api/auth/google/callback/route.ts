import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, COOKIE_NAME } from "@/lib/session";

const REDIRECT_URI    = "https://convert.nxtgen-stack.com/api/auth/google/callback";
const SPACE_OAUTH_URL = "https://space.nxtgen-stack.com/api/auth/google-oauth.php";

function spaceIdToUUID(id: string): string {
  const hex = id.replace(/[^a-f0-9]/gi, "").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/login?error=google_cancelled", request.url));
  }

  const cookieState = request.cookies.get("oauth_state")?.value;
  if (!state || state !== cookieState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", request.url));
  }

  const clearState = (res: NextResponse) => {
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  };

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });

    if (!tokenRes.ok) throw new Error("token_exchange_failed");
    const tokens = await tokenRes.json();

    // Get Google user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) throw new Error("userinfo_failed");
    const gUser = await userRes.json();

    if (!gUser.email_verified) {
      return clearState(NextResponse.redirect(new URL("/login?error=email_not_verified", request.url)));
    }

    // Find or create user in Space (single source of truth)
    const spaceRes = await fetch(SPACE_OAUTH_URL, {
      method:  "POST",
      headers: {
        "Content-Type":        "application/json",
        "X-Space-API-Secret":  process.env.SPACE_API_SECRET!,
      },
      body: JSON.stringify({
        google_id: gUser.sub,
        email:     gUser.email,
        name:      gUser.name ?? gUser.email,
      }),
    });

    if (!spaceRes.ok) throw new Error("space_auth_failed");
    const spaceData = await spaceRes.json();
    const { id: userId, tenant_id: rawTenantId, name, email, role, plan } = spaceData.user;

    const tenantId = rawTenantId.includes("-") ? rawTenantId : spaceIdToUUID(rawTenantId);

    // Auto-provision Convert org row if first login
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(organizations).values({
        id:   tenantId,
        name: name + "'s Workspace",
        slug: rawTenantId,
        plan: "starter",
      });
    }

    const token    = await signSession({ userId, tenantId, email, name, role, plan });
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path:     "/",
      maxAge:   60 * 60 * 24 * 7,
      secure:   true,
    });
    return clearState(response);

  } catch (err) {
    console.error("Google OAuth error:", err);
    return clearState(NextResponse.redirect(new URL("/login?error=google_failed", request.url)));
  }
}

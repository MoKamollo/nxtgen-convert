import { NextRequest, NextResponse } from "next/server";
import { provisionAuthenticatedSession } from "@/lib/auth-provisioning";
import { COOKIE_NAME, signSession } from "@/lib/session";
import { clientIp } from "@/lib/request-security";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://convert.nxtgen-stack.com";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? `${APP_URL}/api/auth/google/callback`;
const SPACE_OAUTH_URL = process.env.SPACE_GOOGLE_OAUTH_URL ?? "https://space.nxtgen-stack.com/api/auth/google-oauth.php";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const cookieState = request.cookies.get("oauth_state")?.value;
  const clearState = (response: NextResponse) => {
    response.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return response;
  };

  if (error || !code) return clearState(NextResponse.redirect(new URL("/login?error=google_cancelled", request.url)));
  if (!state || !cookieState || state !== cookieState) return clearState(NextResponse.redirect(new URL("/login?error=invalid_state", request.url)));
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SPACE_API_SECRET) {
    return clearState(NextResponse.redirect(new URL("/login?error=google_not_configured", request.url)));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) throw new Error("token_exchange_failed");
    const tokens = await tokenRes.json();
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!userRes.ok) throw new Error("userinfo_failed");
    const googleUser = await userRes.json();
    if (!googleUser.email_verified) return clearState(NextResponse.redirect(new URL("/login?error=email_not_verified", request.url)));

    const spaceRes = await fetch(SPACE_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Space-API-Secret": process.env.SPACE_API_SECRET },
      body: JSON.stringify({ google_id: googleUser.sub, email: googleUser.email, name: googleUser.name ?? googleUser.email }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!spaceRes.ok) throw new Error("space_auth_failed");
    const spaceData = await spaceRes.json();
    if (!spaceData.user) throw new Error("space_identity_missing");

    const payload = await provisionAuthenticatedSession({
      externalUserId: String(spaceData.user.id ?? ""),
      externalTenantId: String(spaceData.user.tenant_id ?? ""),
      email: String(spaceData.user.email ?? googleUser.email),
      name: String(spaceData.user.name ?? googleUser.name ?? googleUser.email),
      role: spaceData.user.role,
      plan: spaceData.user.plan,
    }, { ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "unknown" });
    const token = await signSession(payload);
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12, secure: process.env.NODE_ENV === "production" });
    return clearState(response);
  } catch (error) {
    console.error("[google.oauth]", error);
    return clearState(NextResponse.redirect(new URL("/login?error=google_failed", request.url)));
  }
}

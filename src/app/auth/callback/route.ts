import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { provisionAuthenticatedSession } from "@/lib/auth-provisioning";
import { clientIp } from "@/lib/request-security";
import { cookieHeader, signSession } from "@/lib/session";

function verifySpaceToken(token: string): Record<string, unknown> | null {
  try {
    const secret = process.env.SPACE_SSO_SECRET;
    if (!secret || secret.length < 32) return null;
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString());
    if (parsedHeader.alg !== "HS256") return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== "nxtgen_convert" || Number(payload.exp ?? 0) <= now || Number(payload.iat ?? now) > now + 60) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  const identity = verifySpaceToken(token);
  if (!identity) return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));

  try {
    const payload = await provisionAuthenticatedSession({
      externalUserId: String(identity.sub ?? ""),
      externalTenantId: String(identity.tenant_id ?? ""),
      email: String(identity.email ?? ""),
      name: String(identity.name ?? identity.email ?? ""),
      role: identity.role,
      plan: identity.plan,
    }, { ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "unknown" });
    const sessionToken = await signSession(payload);
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.headers.set("Set-Cookie", cookieHeader(sessionToken));
    return response;
  } catch (error) {
    console.error("[space.sso]", error);
    return NextResponse.redirect(new URL("/login?error=provisioning_failed", request.url));
  }
}

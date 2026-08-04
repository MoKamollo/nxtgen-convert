import { NextRequest, NextResponse } from "next/server";
import { provisionAuthenticatedSession } from "@/lib/auth-provisioning";
import { recordAudit } from "@/lib/audit";
import { clientIp, hashSensitive, requestId } from "@/lib/request-security";
import { cookieHeader, signSession } from "@/lib/session";

const SPACE_VERIFY_TOKEN_URL = process.env.SPACE_VERIFY_TOKEN_URL ?? "https://space.nxtgen-stack.com/api/auth/verify-auto-token.php";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const autoToken = request.nextUrl.searchParams.get("auto_token") ?? "";
  const fallback = new URL("/login?error=verification_failed", request.url);

  if (!autoToken || autoToken.length > 4096) return NextResponse.redirect(fallback);

  try {
    const spaceRes = await fetch(SPACE_VERIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": id },
      body: JSON.stringify({ auto_token: autoToken }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const spaceData = await spaceRes.json().catch(() => ({}));
    const user = spaceData?.user;
    if (!spaceRes.ok || !user?.id || !user?.email || !user?.tenant_id) {
      await recordAudit({ action: "auth.auto_token", result: "denied", requestId: id, ipHash: hashSensitive(ip), userAgentHash: hashSensitive(userAgent), metadata: { upstreamStatus: spaceRes.status } });
      return NextResponse.redirect(fallback);
    }

    const payload = await provisionAuthenticatedSession({
      externalUserId: String(user.id),
      externalTenantId: String(user.tenant_id),
      email: String(user.email),
      name: String(user.name ?? user.email),
      role: user.role,
      plan: user.plan,
    }, { ip, userAgent });

    const token = await signSession(payload);
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.headers.set("Set-Cookie", cookieHeader(token));
    await recordAudit({ organizationId: payload.tenantId, actorUserId: payload.userId, action: "auth.auto_token", result: "success", requestId: id, ipHash: hashSensitive(ip), userAgentHash: hashSensitive(userAgent), metadata: { sessionId: payload.sessionId } });
    return response;
  } catch (error) {
    console.error("[auth.verified]", error);
    await recordAudit({ action: "auth.auto_token", result: "failure", requestId: id, ipHash: hashSensitive(ip), userAgentHash: hashSensitive(userAgent) });
    return NextResponse.redirect(fallback);
  }
}

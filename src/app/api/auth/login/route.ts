import { NextRequest, NextResponse } from "next/server";
import { provisionAuthenticatedSession } from "@/lib/auth-provisioning";
import { recordAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, hashSensitive, requestId, isSameOriginMutation, isValidCsrfToken } from "@/lib/request-security";
import { cookieHeader, signSession } from "@/lib/session";

const SPACE_LOGIN_URL = process.env.SPACE_LOGIN_URL ?? "https://space.nxtgen-stack.com/api/auth/login.php";

function safeInternalRedirect(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request) || !isValidCsrfToken(request)) {
    return NextResponse.json({ error: "Request verification failed" }, { status: 403 });
  }
  const id = requestId(request);
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  let rateLimited = false;
  try {
    const rate = await checkRateLimit(ip, "auth.login", 10, 15 * 60);
    rateLimited = !rate.allowed;
  } catch (err) {
    console.error("[auth.login] Rate limit check failed:", err instanceof Error ? err.message : err);
  }
  if (rateLimited) return NextResponse.json({ error: "Too many login attempts. Try again later.", requestId: id }, { status: 429 });

  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password || password.length > 256) {
      return NextResponse.json({ error: "Email and password required", requestId: id }, { status: 400 });
    }

    const spaceRes = await fetch(SPACE_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": id },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    const spaceData = await spaceRes.json().catch(() => ({}));
    if (!spaceRes.ok || !spaceData.user) {
      await recordAudit({ action: "auth.login", result: "denied", requestId: id, ipHash: hashSensitive(ip), userAgentHash: hashSensitive(userAgent), metadata: { emailHash: hashSensitive(email), upstreamStatus: spaceRes.status } });
      return NextResponse.json({ error: "Invalid credentials", requestId: id }, { status: 401 });
    }

    const payload = await provisionAuthenticatedSession({
      externalUserId: String(spaceData.user.id ?? ""),
      externalTenantId: String(spaceData.user.tenant_id ?? ""),
      email: String(spaceData.user.email ?? email),
      name: String(spaceData.user.name ?? email),
      role: spaceData.user.role,
      plan: spaceData.user.plan,
    }, { ip, userAgent });

    const token = await signSession(payload);
    const response = NextResponse.json({ ok: true, redirect: safeInternalRedirect(request.nextUrl.searchParams.get("next")) });
    response.headers.set("Set-Cookie", cookieHeader(token));
    await recordAudit({ organizationId: payload.tenantId, actorUserId: payload.userId, action: "auth.login", result: "success", requestId: id, ipHash: hashSensitive(ip), userAgentHash: hashSensitive(userAgent), metadata: { sessionId: payload.sessionId } });
    return response;
  } catch (error) {
    console.error("[auth.login]", error);
    return NextResponse.json({ error: "Authentication service unavailable", requestId: id }, { status: 503 });
  }
}

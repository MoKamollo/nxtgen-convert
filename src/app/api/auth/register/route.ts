import { NextRequest, NextResponse } from "next/server";
import { provisionAuthenticatedSession } from "@/lib/auth-provisioning";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, requestId, isSameOriginMutation, isValidCsrfToken } from "@/lib/request-security";
import { cookieHeader, signSession } from "@/lib/session";

const SPACE_REGISTER_URL = process.env.SPACE_REGISTER_URL ?? "https://space.nxtgen-stack.com/api/auth/register.php";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request) || !isValidCsrfToken(request)) {
    return NextResponse.json({ error: "Request verification failed" }, { status: 403 });
  }
  const id = requestId(request);
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const rate = await checkRateLimit(ip, "auth.register", 5, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: "Too many registration attempts. Try again later." }, { status: 429 });

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, 120);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!name || !email || password.length < 12 || password.length > 256) {
      return NextResponse.json({ error: "Name, valid email, and a password of at least 12 characters are required." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const regRes = await fetch(SPACE_REGISTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": id },
      body: JSON.stringify({ name, email, password, redirect_after_verify: `${appUrl}/api/auth/verified` }),
      signal: AbortSignal.timeout(15_000),
    });
    const regData = await regRes.json().catch(() => ({}));
    if (!regRes.ok) return NextResponse.json({ error: regData.error ?? "Registration failed." }, { status: 400 });
    if (regData.status === "verify_email") return NextResponse.json({ ok: true, verify: true });
    if (!regData.user) return NextResponse.json({ error: "Registration response was incomplete." }, { status: 502 });

    const payload = await provisionAuthenticatedSession({
      externalUserId: String(regData.user.id ?? ""),
      externalTenantId: String(regData.user.tenant_id ?? ""),
      email: String(regData.user.email ?? email),
      name: String(regData.user.name ?? name),
      role: regData.user.role,
      plan: regData.user.plan,
    }, { ip, userAgent });
    const token = await signSession(payload);
    const response = NextResponse.json({ ok: true, redirect: "/dashboard" });
    response.headers.set("Set-Cookie", cookieHeader(token));
    return response;
  } catch (error) {
    console.error("[auth.register]", error);
    return NextResponse.json({ error: "Registration service unavailable." }, { status: 503 });
  }
}

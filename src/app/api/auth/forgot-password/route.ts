import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOriginMutation, isValidCsrfToken } from "@/lib/request-security";

const SPACE_FORGOT_PASSWORD_URL = "https://space.nxtgen-stack.com/api/auth/forgot-password.php";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request) || !isValidCsrfToken(request)) {
    return NextResponse.json({ error: "Request verification failed" }, { status: 403 });
  }
  const rate = await checkRateLimit(clientIp(request), "auth.forgot_password", 5, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: "Too many reset requests. Try again later." }, { status: 429 });
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    const response = await fetch(SPACE_FORGOT_PASSWORD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: payload.error ?? payload.message ?? "Could not send reset link" }, { status: response.status });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to reach NxtGen Space" }, { status: 502 });
  }
}

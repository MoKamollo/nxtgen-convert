import { NextRequest, NextResponse } from "next/server";

const SPACE_PASSWORD_URL = "https://space.nxtgen-stack.com/api/auth/change-password.php";

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId || !userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!currentPassword || newPassword.length < 8) {
      return NextResponse.json({ error: "Current password and a new password of at least 8 characters are required" }, { status: 400 });
    }

    const response = await fetch(SPACE_PASSWORD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: payload.error ?? payload.message ?? "Password update failed" }, { status: response.status });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to reach NxtGen Space" }, { status: 502 });
  }
}

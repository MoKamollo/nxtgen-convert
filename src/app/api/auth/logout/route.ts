import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { clearCookieHeader, COOKIE_NAME, verifySession } from "@/lib/session";
import { isSameOriginMutation, isValidCsrfToken } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request) || !isValidCsrfToken(request)) {
    return NextResponse.json({ error: "Request verification failed" }, { status: 403 });
  }
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (session) {
    await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, session.sessionId));
    await recordAudit({ organizationId: session.tenantId, actorUserId: session.userId, action: "auth.logout", metadata: { sessionId: session.sessionId } });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearCookieHeader());
  return response;
}

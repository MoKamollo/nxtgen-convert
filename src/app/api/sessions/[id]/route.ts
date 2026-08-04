import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { clearCookieHeader } from "@/lib/session";

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;
  const currentSessionId = request.headers.get("x-session-id")!;
  const { id } = await params;
  const revoked = await db.update(authSessions).set({ revokedAt: new Date() }).where(and(
    eq(authSessions.id, id),
    eq(authSessions.organizationId, organizationId),
    eq(authSessions.userId, userId),
    isNull(authSessions.revokedAt),
  )).returning({ id: authSessions.id });
  if (revoked.length === 0) return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  const response = NextResponse.json({ ok: true, currentSessionRevoked: id === currentSessionId });
  if (id === currentSessionId) response.headers.set("Set-Cookie", clearCookieHeader());
  return response;
}

export const DELETE = withApiGuard(DELETEHandler);

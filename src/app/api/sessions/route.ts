import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;
  const currentSessionId = request.headers.get("x-session-id")!;
  const sessions = await db.select({
    id: authSessions.id,
    ipHash: authSessions.ipHash,
    userAgentHash: authSessions.userAgentHash,
    lastSeenAt: authSessions.lastSeenAt,
    createdAt: authSessions.createdAt,
    expiresAt: authSessions.expiresAt,
  }).from(authSessions).where(and(
    eq(authSessions.organizationId, organizationId),
    eq(authSessions.userId, userId),
    isNull(authSessions.revokedAt),
    gt(authSessions.expiresAt, new Date()),
  )).orderBy(desc(authSessions.lastSeenAt));
  return NextResponse.json({ data: sessions.map((session) => ({ ...session, current: session.id === currentSessionId })) });
}

export const GET = withApiGuard(GETHandler);

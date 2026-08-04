import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [revoked] = await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(
    eq(apiKeys.id, id), eq(apiKeys.organizationId, orgId), isNull(apiKeys.revokedAt),
  )).returning({ id: apiKeys.id });
  if (!revoked) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const DELETE = withApiGuard(DELETEHandler);

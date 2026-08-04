import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { webhookEndpoints } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [endpoint] = await db.update(webhookEndpoints).set({ active: false, healthStatus: "disabled", updatedAt: new Date() }).where(and(
    eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, orgId),
  )).returning({ id: webhookEndpoints.id });
  if (!endpoint) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const DELETE = withApiGuard(DELETEHandler);

import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [endpoint] = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, orgId))).limit(1);
  if (!endpoint) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  const data = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.endpointId, id), eq(webhookDeliveries.organizationId, orgId))).orderBy(desc(webhookDeliveries.createdAt)).limit(100);
  return NextResponse.json({ data });
}

export const GET = withApiGuard(GETHandler);

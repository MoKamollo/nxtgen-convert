import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerRiskAlerts } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const STATUSES = new Set(["open", "acknowledged", "resolved", "dismissed"]);

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const status = String(body.status ?? "");
  if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid alert status" }, { status: 400 });
  const [existing] = await db.select().from(customerRiskAlerts).where(and(eq(customerRiskAlerts.organizationId, organizationId), eq(customerRiskAlerts.id, id))).limit(1);
  if (!existing) return NextResponse.json({ error: "Risk alert not found" }, { status: 404 });
  const [updated] = await db.update(customerRiskAlerts).set({
    status,
    ownerUserId: body.ownerUserId !== undefined ? (body.ownerUserId ? String(body.ownerUserId) : null) : existing.ownerUserId,
    acknowledgedAt: status === "acknowledged" ? new Date() : existing.acknowledgedAt,
    resolvedAt: ["resolved", "dismissed"].includes(status) ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(eq(customerRiskAlerts.organizationId, organizationId), eq(customerRiskAlerts.id, id))).returning();
  await recordCustomerTimelineEvent({
    organizationId, contactId: existing.contactId, sourceType: "customer_risk_alert", sourceId: id,
    eventType: "customer_success.risk_alert_updated", summary: `Risk alert changed from ${existing.status} to ${status}`,
    actorUserId, idempotencyKey: `customer_success.risk_alert:${id}:${status}:${updated.updatedAt.toISOString()}`,
    metadata: { alertType: existing.alertType, severity: existing.severity, from: existing.status, to: status },
  });
  return NextResponse.json({ data: updated });
}

export const PATCH = withApiGuard(PATCHHandler);

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerRenewals } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const STATUSES = new Set(["upcoming", "in_review", "renewed", "churned", "cancelled"]);
const RISKS = new Set(["unknown", "low", "medium", "high", "critical"]);

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const [existing] = await db.select().from(customerRenewals).where(and(eq(customerRenewals.organizationId, organizationId), eq(customerRenewals.id, id))).limit(1);
  if (!existing) return NextResponse.json({ error: "Renewal not found" }, { status: 404 });
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid renewal status" }, { status: 400 });
    updates.status = status;
    updates.renewedAt = status === "renewed" ? new Date() : null;
  }
  if (body.riskLevel !== undefined) {
    const risk = String(body.riskLevel);
    if (!RISKS.has(risk)) return NextResponse.json({ error: "Invalid risk level" }, { status: 400 });
    updates.riskLevel = risk;
  }
  if (body.renewalDate !== undefined) {
    const date = new Date(String(body.renewalDate));
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "renewalDate is invalid" }, { status: 400 });
    updates.renewalDate = date;
  }
  if (body.amount !== undefined) {
    if (body.amount === null || body.amount === "") updates.amount = null;
    else {
      const value = Number(body.amount);
      if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "amount must be zero or greater" }, { status: 400 });
      updates.amount = value.toFixed(2);
    }
  }
  if (body.currency !== undefined) {
    const currency = String(body.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "currency must be a 3 letter ISO code" }, { status: 400 });
    updates.currency = currency;
  }
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim().slice(0, 4_000) : null;
  if (body.ownerUserId !== undefined) updates.ownerUserId = body.ownerUserId ? String(body.ownerUserId) : null;
  const [updated] = await db.update(customerRenewals).set(updates).where(and(eq(customerRenewals.organizationId, organizationId), eq(customerRenewals.id, id))).returning();
  if ((body.status !== undefined && body.status !== existing.status) || (body.riskLevel !== undefined && body.riskLevel !== existing.riskLevel)) {
    await recordCustomerTimelineEvent({
      organizationId, contactId: existing.contactId, sourceType: "customer_renewal", sourceId: id,
      eventType: "customer_success.renewal_updated", summary: `Renewal updated: ${updated.status}, risk ${updated.riskLevel}`,
      actorUserId, idempotencyKey: `customer_success.renewal_updated:${id}:${updated.status}:${updated.riskLevel}:${updated.updatedAt.toISOString()}`,
      metadata: { previousStatus: existing.status, previousRisk: existing.riskLevel, status: updated.status, riskLevel: updated.riskLevel },
    });
  }
  return NextResponse.json({ data: updated });
}

export const PATCH = withApiGuard(PATCHHandler);

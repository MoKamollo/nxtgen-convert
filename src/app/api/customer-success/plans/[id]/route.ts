import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSuccessMilestones, customerSuccessPlans } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const STATUSES = new Set(["draft", "active", "on_hold", "completed", "cancelled"]);

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [plan] = await db.select().from(customerSuccessPlans).where(and(eq(customerSuccessPlans.organizationId, organizationId), eq(customerSuccessPlans.id, id))).limit(1);
  if (!plan) return NextResponse.json({ error: "Success plan not found" }, { status: 404 });
  const milestones = await db.select().from(customerSuccessMilestones).where(and(eq(customerSuccessMilestones.organizationId, organizationId), eq(customerSuccessMilestones.planId, id))).orderBy(customerSuccessMilestones.sequence);
  return NextResponse.json({ data: { ...plan, milestones } });
}

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const [existing] = await db.select().from(customerSuccessPlans).where(and(eq(customerSuccessPlans.organizationId, organizationId), eq(customerSuccessPlans.id, id))).limit(1);
  if (!existing) return NextResponse.json({ error: "Success plan not found" }, { status: 404 });
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 200);
    if (!name) return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
    updates.name = name;
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid plan status" }, { status: 400 });
    updates.status = status;
    updates.completedAt = status === "completed" ? new Date() : null;
  }
  if (body.ownerUserId !== undefined) updates.ownerUserId = body.ownerUserId ? String(body.ownerUserId) : null;
  if (body.objectives !== undefined) {
    if (!Array.isArray(body.objectives)) return NextResponse.json({ error: "objectives must be an array" }, { status: 400 });
    updates.objectives = body.objectives.map(String).map((value: string) => value.trim().slice(0, 500)).filter(Boolean).slice(0, 50);
  }
  if (body.successCriteria !== undefined) {
    if (!Array.isArray(body.successCriteria)) return NextResponse.json({ error: "successCriteria must be an array" }, { status: 400 });
    updates.successCriteria = body.successCriteria.map(String).map((value: string) => value.trim().slice(0, 500)).filter(Boolean).slice(0, 50);
  }
  for (const [field, column] of [["startDate", "startDate"], ["targetDate", "targetDate"]] as const) {
    if (body[field] !== undefined) {
      if (!body[field]) updates[column] = null;
      else {
        const date = new Date(String(body[field]));
        if (Number.isNaN(date.getTime())) return NextResponse.json({ error: `${field} is invalid` }, { status: 400 });
        updates[column] = date;
      }
    }
  }
  const [updated] = await db.update(customerSuccessPlans).set(updates).where(and(eq(customerSuccessPlans.organizationId, organizationId), eq(customerSuccessPlans.id, id))).returning();
  if (body.status !== undefined && body.status !== existing.status) {
    await recordCustomerTimelineEvent({
      organizationId, contactId: existing.contactId, sourceType: "customer_success_plan", sourceId: id,
      eventType: "customer_success.plan_status_changed", summary: `Success plan status changed from ${existing.status} to ${body.status}`,
      actorUserId, idempotencyKey: `customer_success.plan_status:${id}:${body.status}:${updated.updatedAt.toISOString()}`,
      metadata: { from: existing.status, to: body.status },
    });
  }
  return NextResponse.json({ data: updated });
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);

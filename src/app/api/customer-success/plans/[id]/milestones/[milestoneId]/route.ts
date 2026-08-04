import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSuccessMilestones, customerSuccessPlans } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

const STATUSES = new Set(["pending", "in_progress", "completed", "blocked", "cancelled"]);

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id: planId, milestoneId } = await params;
  const body = await request.json();
  const [existing] = await db.select({ milestone: customerSuccessMilestones, contactId: customerSuccessPlans.contactId })
    .from(customerSuccessMilestones).innerJoin(customerSuccessPlans, and(eq(customerSuccessPlans.organizationId, organizationId), eq(customerSuccessPlans.id, customerSuccessMilestones.planId)))
    .where(and(eq(customerSuccessMilestones.organizationId, organizationId), eq(customerSuccessMilestones.planId, planId), eq(customerSuccessMilestones.id, milestoneId))).limit(1);
  if (!existing) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: "Milestone title is required" }, { status: 400 });
    updates.title = title;
  }
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim().slice(0, 2_000) : null;
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid milestone status" }, { status: 400 });
    updates.status = status;
    updates.completedAt = status === "completed" ? new Date() : null;
  }
  if (body.dueAt !== undefined) {
    if (!body.dueAt) updates.dueAt = null;
    else {
      const date = new Date(String(body.dueAt));
      if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "dueAt is invalid" }, { status: 400 });
      updates.dueAt = date;
    }
  }
  if (body.ownerUserId !== undefined) updates.ownerUserId = body.ownerUserId ? String(body.ownerUserId) : null;
  if (body.evidence !== undefined) {
    if (!body.evidence || typeof body.evidence !== "object" || Array.isArray(body.evidence)) return NextResponse.json({ error: "evidence must be an object" }, { status: 400 });
    updates.evidence = body.evidence;
  }
  const [updated] = await db.update(customerSuccessMilestones).set(updates).where(and(eq(customerSuccessMilestones.organizationId, organizationId), eq(customerSuccessMilestones.id, milestoneId), eq(customerSuccessMilestones.planId, planId))).returning();
  if (body.status !== undefined && body.status !== existing.milestone.status) {
    await recordCustomerTimelineEvent({
      organizationId, contactId: existing.contactId, sourceType: "customer_success_milestone", sourceId: milestoneId,
      eventType: "customer_success.milestone_status_changed", summary: `Milestone ${existing.milestone.title} changed from ${existing.milestone.status} to ${body.status}`,
      actorUserId, idempotencyKey: `customer_success.milestone_status:${milestoneId}:${body.status}:${updated.updatedAt.toISOString()}`,
      metadata: { planId, from: existing.milestone.status, to: body.status, evidence: updated.evidence },
    });
  }
  return NextResponse.json({ data: updated });
}

export const PATCH = withApiGuard(PATCHHandler);

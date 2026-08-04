import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customerSuccessMilestones, customerSuccessPlans } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id: planId } = await params;
  const body = await request.json();
  const title = String(body.title ?? "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: "Milestone title is required" }, { status: 400 });
  const [plan] = await db.select().from(customerSuccessPlans).where(and(eq(customerSuccessPlans.organizationId, organizationId), eq(customerSuccessPlans.id, planId))).limit(1);
  if (!plan) return NextResponse.json({ error: "Success plan not found" }, { status: 404 });
  let dueAt: Date | null = null;
  if (body.dueAt) {
    dueAt = new Date(String(body.dueAt));
    if (Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "dueAt is invalid" }, { status: 400 });
  }
  const [maximum] = await db.select({ value: sql<number>`COALESCE(MAX(${customerSuccessMilestones.sequence}), 0)` }).from(customerSuccessMilestones).where(and(eq(customerSuccessMilestones.organizationId, organizationId), eq(customerSuccessMilestones.planId, planId)));
  const [milestone] = await db.insert(customerSuccessMilestones).values({
    organizationId, planId, title, description: body.description ? String(body.description).trim().slice(0, 2_000) : null,
    sequence: Number(maximum?.value ?? 0) + 1, dueAt, ownerUserId: body.ownerUserId ? String(body.ownerUserId) : actorUserId,
    evidence: body.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence) ? body.evidence : {},
  }).returning();
  await recordCustomerTimelineEvent({
    organizationId, contactId: plan.contactId, sourceType: "customer_success_milestone", sourceId: milestone.id,
    eventType: "customer_success.milestone_created", summary: `Milestone created: ${title}`, actorUserId,
    idempotencyKey: `customer_success.milestone_created:${milestone.id}`, metadata: { planId },
  });
  return NextResponse.json({ data: milestone }, { status: 201 });
}

export const POST = withApiGuard(POSTHandler);

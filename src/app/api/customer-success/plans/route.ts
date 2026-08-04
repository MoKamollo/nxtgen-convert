import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, customerSuccessMilestones, customerSuccessPlans, customerSuccessPlaybookVersions } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { validateSuccessPlaybookDefinition, type SuccessPlaybookDefinition } from "@/lib/customer-success-playbooks";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";
import { enqueueWebhookEvent } from "@/lib/webhooks";

function optionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return date;
}

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const rows = await db.select({
    id: customerSuccessPlans.id,
    contactId: customerSuccessPlans.contactId,
    contactFirstName: contacts.firstName,
    contactLastName: contacts.lastName,
    contactEmail: contacts.email,
    name: customerSuccessPlans.name,
    status: customerSuccessPlans.status,
    ownerUserId: customerSuccessPlans.ownerUserId,
    objectives: customerSuccessPlans.objectives,
    successCriteria: customerSuccessPlans.successCriteria,
    startDate: customerSuccessPlans.startDate,
    targetDate: customerSuccessPlans.targetDate,
    completedAt: customerSuccessPlans.completedAt,
    playbookVersionId: customerSuccessPlans.playbookVersionId,
    createdAt: customerSuccessPlans.createdAt,
    updatedAt: customerSuccessPlans.updatedAt,
  }).from(customerSuccessPlans)
    .innerJoin(contacts, and(eq(contacts.organizationId, organizationId), eq(contacts.id, customerSuccessPlans.contactId)))
    .where(eq(customerSuccessPlans.organizationId, organizationId))
    .orderBy(desc(customerSuccessPlans.updatedAt));
  return NextResponse.json({ data: rows });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const contactId = String(body.contactId ?? "");
  const name = String(body.name ?? "").trim().slice(0, 200);
  if (!contactId || !name) return NextResponse.json({ error: "contactId and name are required" }, { status: 400 });
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId), isNull(contacts.archivedAt))).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  let startDate: Date | null;
  let targetDate: Date | null;
  try { startDate = optionalDate(body.startDate) ?? new Date(); targetDate = optionalDate(body.targetDate); }
  catch { return NextResponse.json({ error: "Invalid plan date" }, { status: 400 }); }
  if (targetDate && targetDate < startDate) return NextResponse.json({ error: "targetDate cannot be before startDate" }, { status: 400 });

  let playbookVersion: typeof customerSuccessPlaybookVersions.$inferSelect | null = null;
  if (body.playbookVersionId) {
    [playbookVersion] = await db.select().from(customerSuccessPlaybookVersions).where(and(
      eq(customerSuccessPlaybookVersions.organizationId, organizationId),
      eq(customerSuccessPlaybookVersions.id, String(body.playbookVersionId)),
      eq(customerSuccessPlaybookVersions.status, "published"),
    )).limit(1);
    if (!playbookVersion) return NextResponse.json({ error: "Published playbook version not found" }, { status: 404 });
  }

  let definition: SuccessPlaybookDefinition | null = null;
  if (playbookVersion) {
    try { definition = validateSuccessPlaybookDefinition(playbookVersion.definition); }
    catch { return NextResponse.json({ error: "Published playbook definition is invalid" }, { status: 409 }); }
  }
  const objectives = definition?.objectives ?? (Array.isArray(body.objectives) ? body.objectives.map(String).map((value: string) => value.trim().slice(0, 500)).filter(Boolean).slice(0, 50) : []);
  const successCriteria = definition?.successCriteria ?? (Array.isArray(body.successCriteria) ? body.successCriteria.map(String).map((value: string) => value.trim().slice(0, 500)).filter(Boolean).slice(0, 50) : []);

  const result = await db.transaction(async (tx) => {
    const [plan] = await tx.insert(customerSuccessPlans).values({
      organizationId, contactId, name, status: "active", playbookVersionId: playbookVersion?.id ?? null,
      ownerUserId: body.ownerUserId ? String(body.ownerUserId) : actorUserId,
      objectives, successCriteria, startDate, targetDate, createdByUserId: actorUserId,
    }).returning();
    const milestones = definition?.milestones.length
      ? await tx.insert(customerSuccessMilestones).values(definition.milestones.map((milestone, index) => ({
          organizationId, planId: plan.id, title: milestone.title, description: milestone.description,
          sequence: index + 1, dueAt: milestone.dueDays === null || milestone.dueDays === undefined ? null : new Date(startDate.getTime() + milestone.dueDays * 86_400_000),
          ownerUserId: body.ownerUserId ? String(body.ownerUserId) : actorUserId,
          evidence: { source: "playbook", playbookVersionId: playbookVersion!.id },
        }))).returning()
      : [];
    return { plan, milestones };
  });
  await recordCustomerTimelineEvent({
    organizationId, contactId, sourceType: "customer_success_plan", sourceId: result.plan.id,
    eventType: "customer_success.plan_created", summary: `Success plan created: ${name}`, actorUserId,
    idempotencyKey: `customer_success.plan_created:${result.plan.id}`, metadata: { playbookVersionId: playbookVersion?.id ?? null },
  });
  await enqueueWebhookEvent(organizationId, "customer_success.plan_created", { planId: result.plan.id, contactId, occurredAt: new Date().toISOString() });
  return NextResponse.json({ data: result }, { status: 201 });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

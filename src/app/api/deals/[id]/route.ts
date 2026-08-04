import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, contacts } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { triggerAutomation } from "@/lib/automation";
import { enqueueWebhookEvent } from "@/lib/webhooks";

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Fetch existing deal to get contactId for automation trigger
  const [existing] = await db
    .select({ contactId: deals.contactId })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.organizationId, orgId)))
    .limit(1);

  const allowed = ["name","value","stage","probability","contactId","companyId","ownerId","tags","notes","expectedCloseDate","wonAt","lostAt","lostReason"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.value !== undefined) updates.value = body.value.toString();
  if (body.stage === "closed_won" && !body.wonAt) updates.wonAt = new Date();
  if (body.stage === "closed_lost" && !body.lostAt) updates.lostAt = new Date();
  updates.updatedAt = new Date();

  await db.update(deals).set(updates).where(and(eq(deals.id, id), eq(deals.organizationId, orgId)));

  const contactId = (body.contactId ?? existing?.contactId) ?? undefined;

  // Promote contact to customer when deal closes as won (if they were lead/prospect)
  if (body.stage === "closed_won" && contactId) {
    await db
      .update(contacts)
      .set({ status: "customer", updatedAt: new Date() })
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.organizationId, orgId),
          inArray(contacts.status, ["lead", "prospect"]),
        ),
      );
  }

  if (body.stage) {
    await triggerAutomation(orgId, "deal.stage_changed", { dealId: id, contactId, idempotencyKey: request.headers.get("x-request-id") ?? `deal.stage:${id}:${body.stage}:${Date.now()}`, context: { stage: body.stage } });
    const eventType = body.stage === "closed_won" ? "deal.won" : body.stage === "closed_lost" ? "deal.lost" : "deal.stage_changed";
    await enqueueWebhookEvent(orgId, eventType, { dealId: id, contactId, stage: body.stage, occurredAt: new Date().toISOString() });
  }

  return NextResponse.json({ ok: true });
}

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  await db.delete(deals).where(and(eq(deals.id, id), eq(deals.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

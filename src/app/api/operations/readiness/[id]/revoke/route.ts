import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { releaseValidationEvents } from "@/db/schema";
import { withApiGuard, type RouteContext } from "@/lib/api-guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST = withApiGuard(async (request: NextRequest, context: RouteContext) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;
  const id = (await context.params)?.id ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid evidence event" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const summary = String(body.summary ?? "").trim().slice(0, 2000);
  const environment = String(body.environment ?? "").trim().slice(0, 80);
  const idempotencyKey = String(body.idempotencyKey ?? "").trim().slice(0, 200);
  if (summary.length < 10 || !environment || !idempotencyKey) {
    return NextResponse.json({ error: "Environment, concrete revocation summary, and idempotency key are required" }, { status: 400 });
  }

  const [target] = await db.select().from(releaseValidationEvents).where(and(
    eq(releaseValidationEvents.organizationId, organizationId),
    eq(releaseValidationEvents.id, id),
    eq(releaseValidationEvents.action, "recorded"),
  )).limit(1);
  if (!target) return NextResponse.json({ error: "Evidence event not found" }, { status: 404 });

  const [latest] = await db.select({ id: releaseValidationEvents.id, action: releaseValidationEvents.action })
    .from(releaseValidationEvents)
    .where(and(
      eq(releaseValidationEvents.organizationId, organizationId),
      eq(releaseValidationEvents.controlKey, target.controlKey),
    ))
    .orderBy(desc(releaseValidationEvents.occurredAt))
    .limit(1);
  if (!latest || latest.id !== target.id || latest.action !== "recorded") {
    return NextResponse.json({ error: "Only the current validation evidence can be revoked" }, { status: 409 });
  }

  const [created] = await db.insert(releaseValidationEvents).values({
    organizationId,
    controlKey: target.controlKey,
    action: "revoked",
    result: null,
    environment,
    summary,
    evidenceReference: null,
    evidence: {},
    targetEventId: target.id,
    idempotencyKey,
    createdByUserId: userId,
  }).onConflictDoNothing({
    target: [releaseValidationEvents.organizationId, releaseValidationEvents.idempotencyKey],
  }).returning();

  if (!created) return NextResponse.json({ error: "Revocation request already processed" }, { status: 409 });
  return NextResponse.json({ data: created }, { status: 201 });
});

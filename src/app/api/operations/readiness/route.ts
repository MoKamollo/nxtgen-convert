import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { releaseValidationEvents } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import {
  deriveReleaseReadiness,
  normalizeReleaseValidationInput,
  type ReleaseValidationEvent,
} from "@/lib/release-readiness";

function toValidationEvent(row: typeof releaseValidationEvents.$inferSelect): ReleaseValidationEvent {
  return {
    id: row.id,
    controlKey: row.controlKey,
    action: row.action === "revoked" ? "revoked" : "recorded",
    result: row.result === "passed" || row.result === "failed" || row.result === "blocked" ? row.result : null,
    environment: row.environment,
    summary: row.summary,
    evidenceReference: row.evidenceReference,
    evidence: row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
      ? row.evidence as Record<string, unknown>
      : {},
    targetEventId: row.targetEventId,
    expiresAt: row.expiresAt,
    occurredAt: row.occurredAt,
    createdByUserId: row.createdByUserId,
  };
}

async function currentReadiness(organizationId: string) {
  const rows = await db.select().from(releaseValidationEvents)
    .where(eq(releaseValidationEvents.organizationId, organizationId))
    .orderBy(desc(releaseValidationEvents.occurredAt));
  return deriveReleaseReadiness(rows.map(toValidationEvent));
}

export const GET = withApiGuard(async (request: NextRequest) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const readiness = await currentReadiness(organizationId);
  return NextResponse.json({
    data: readiness,
    generatedAt: new Date().toISOString(),
    statement: "Status is derived only from recorded validation evidence. It is not a live-system assertion.",
  });
});

export const POST = withApiGuard(async (request: NextRequest) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;

  let input;
  try {
    input = normalizeReleaseValidationInput(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid validation evidence" }, { status: 400 });
  }

  const [created] = await db.insert(releaseValidationEvents).values({
    organizationId,
    controlKey: input.controlKey,
    action: "recorded",
    result: input.result,
    environment: input.environment,
    summary: input.summary,
    evidenceReference: input.evidenceReference,
    evidence: input.evidence,
    idempotencyKey: input.idempotencyKey,
    expiresAt: input.expiresAt,
    createdByUserId: userId,
  }).onConflictDoNothing({
    target: [releaseValidationEvents.organizationId, releaseValidationEvents.idempotencyKey],
  }).returning();

  if (!created) {
    const [existing] = await db.select().from(releaseValidationEvents)
      .where(and(
        eq(releaseValidationEvents.organizationId, organizationId),
        eq(releaseValidationEvents.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1);
    if (!existing || existing.organizationId !== organizationId) {
      return NextResponse.json({ error: "Evidence request conflict" }, { status: 409 });
    }
    return NextResponse.json({ data: toValidationEvent(existing), readiness: await currentReadiness(organizationId), duplicate: true });
  }

  return NextResponse.json({ data: toValidationEvent(created), readiness: await currentReadiness(organizationId) }, { status: 201 });
});

import { db } from "@/db";
import { customerTimelineEvents } from "@/db/schema";

export async function recordCustomerTimelineEvent(input: {
  organizationId: string;
  contactId: string;
  sourceType: string;
  sourceId?: string | null;
  eventType: string;
  summary: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  idempotencyKey: string;
  occurredAt?: Date;
}) {
  await db.insert(customerTimelineEvents).values({
    organizationId: input.organizationId,
    contactId: input.contactId,
    sourceType: input.sourceType.slice(0, 100),
    sourceId: input.sourceId?.slice(0, 200) ?? null,
    eventType: input.eventType.slice(0, 120),
    summary: input.summary.slice(0, 500),
    metadata: input.metadata ?? {},
    actorUserId: input.actorUserId ?? null,
    idempotencyKey: input.idempotencyKey.slice(0, 500),
    occurredAt: input.occurredAt ?? new Date(),
  }).onConflictDoNothing();
}

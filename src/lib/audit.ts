import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export interface AuditInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType?: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result?: "success" | "failure" | "denied";
  requestId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType ?? "user",
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      result: input.result ?? "success",
      requestId: input.requestId ?? null,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[audit] failed to persist audit event", error);
  }
}

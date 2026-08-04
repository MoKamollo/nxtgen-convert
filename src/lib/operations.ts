import { db, withTenantDatabase } from "@/db";
import { operationalEvents } from "@/db/schema";

type Severity = "info" | "warning" | "error" | "critical";

type OperationalEventInput = {
  organizationId: string;
  severity: Severity;
  component: string;
  event: string;
  requestId?: string | null;
  errorCode?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api.?key|credential|signature)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redact(entry, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 2000);
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(entry, depth + 1);
  }
  return result;
}

export async function recordOperationalEvent(input: OperationalEventInput): Promise<void> {
  try {
    await withTenantDatabase(input.organizationId, async () => {
      await db.insert(operationalEvents).values({
        organizationId: input.organizationId,
        severity: input.severity,
        component: input.component.slice(0, 120),
        event: input.event.slice(0, 160),
        requestId: input.requestId?.slice(0, 200) ?? null,
        errorCode: input.errorCode?.slice(0, 120) ?? null,
        message: input.message.slice(0, 2000),
        metadata: redact(input.metadata ?? {}) as Record<string, unknown>,
      });
    });
  } catch (error) {
    console.error("[operational-event-write-failed]", {
      component: input.component,
      event: input.event,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

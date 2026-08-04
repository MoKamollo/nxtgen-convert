export const RELEASE_VALIDATION_RESULTS = ["passed", "failed", "blocked"] as const;
export type ReleaseValidationResult = typeof RELEASE_VALIDATION_RESULTS[number];
export type ReleaseValidationAction = "recorded" | "revoked";

export type ReleaseValidationControl = {
  key: string;
  category: "database" | "identity" | "providers" | "security" | "performance" | "operations" | "dependencies";
  title: string;
  description: string;
  required: boolean;
  evidenceGuidance: string;
};

export const RELEASE_VALIDATION_CONTROLS: readonly ReleaseValidationControl[] = [
  {
    key: "database.migrations",
    category: "database",
    title: "Production migration rehearsal",
    description: "Apply and roll back every pending migration against a disposable copy of representative production data.",
    required: true,
    evidenceGuidance: "Migration command output, schema diff, rollback output, and reviewer identity.",
  },
  {
    key: "database.rls",
    category: "database",
    title: "RLS and tenant isolation",
    description: "Validate forced row-level security through the real application role, pool, jobs, and cross-tenant attack cases.",
    required: true,
    evidenceGuidance: "Tenant test matrix, role used, failed cross-tenant queries, and database policy inspection.",
  },
  {
    key: "database.backup_restore",
    category: "database",
    title: "Backup and restore",
    description: "Restore a verified backup and prove recovery procedures before any production migration.",
    required: true,
    evidenceGuidance: "Backup identifier, restore target, timestamps, integrity checks, and recovery result.",
  },
  {
    key: "identity.space_contracts",
    category: "identity",
    title: "NxtGen Space contracts",
    description: "Validate identity, tenant, role, entitlement, billing, audit, and usage contracts against the deployed Space system.",
    required: true,
    evidenceGuidance: "Contract version, tested scenarios, request/response evidence, and owner approval.",
  },
  {
    key: "providers.resend",
    category: "providers",
    title: "Resend delivery and webhooks",
    description: "Validate credentials, real sending, signed webhooks, duplicates, replay, retries, bounce, complaint, and suppression behavior.",
    required: true,
    evidenceGuidance: "Provider event IDs, signature verification evidence, delivery reconciliation, and retry results.",
  },
  {
    key: "providers.stripe",
    category: "providers",
    title: "Stripe connector and webhooks",
    description: "Validate account verification, signed events, replay protection, duplicates, and commercial data reconciliation.",
    required: true,
    evidenceGuidance: "Test mode account, event IDs, signature evidence, reconciliation output, and failure cases.",
  },
  {
    key: "credentials.rotation",
    category: "security",
    title: "Production credentials and rotation",
    description: "Install independent production secrets, verify least privilege, and complete a rotation and revocation exercise.",
    required: true,
    evidenceGuidance: "Secret inventory reference, rotation timestamps, revoked credential proof, and access review.",
  },
  {
    key: "security.assessment",
    category: "security",
    title: "Security assessment",
    description: "Complete current dependency audit, secret scanning, SAST, DAST, and independent cross-tenant penetration testing.",
    required: true,
    evidenceGuidance: "Tool versions, reports, remediations, accepted risks, and independent reviewer sign-off.",
  },
  {
    key: "performance.load",
    category: "performance",
    title: "Load and concurrency",
    description: "Test API, database, queue, webhook, workflow, and email paths under expected and stress traffic.",
    required: true,
    evidenceGuidance: "Scenario, concurrency, latency percentiles, error rates, resource use, and bottleneck decisions.",
  },
  {
    key: "operations.monitoring",
    category: "operations",
    title: "Monitoring and incident response",
    description: "Validate alerts, dashboards, runbooks, escalation, queue recovery, and incident response ownership.",
    required: true,
    evidenceGuidance: "Alert test IDs, runbook execution, notification evidence, recovery result, and owner acknowledgement.",
  },
  {
    key: "dependencies.online_audit",
    category: "dependencies",
    title: "Current online dependency audit",
    description: "Run the lockfile against the current registry advisory database and resolve or explicitly accept every remaining finding.",
    required: true,
    evidenceGuidance: "npm audit JSON, package versions, remediation decision, and approved exceptions.",
  },
] as const;

export type ReleaseValidationEvent = {
  id: string;
  controlKey: string;
  action: ReleaseValidationAction;
  result: ReleaseValidationResult | null;
  environment: string;
  summary: string;
  evidenceReference: string | null;
  evidence: Record<string, unknown>;
  targetEventId: string | null;
  expiresAt: Date | null;
  occurredAt: Date;
  createdByUserId: string | null;
};

export type ReleaseValidationState = ReleaseValidationControl & {
  status: ReleaseValidationResult | "not_validated" | "expired" | "revoked";
  latestEvent: ReleaseValidationEvent | null;
};

function isExpired(event: ReleaseValidationEvent, now: Date): boolean {
  return Boolean(event.expiresAt && event.expiresAt.getTime() <= now.getTime());
}

export function deriveReleaseReadiness(
  events: readonly ReleaseValidationEvent[],
  now = new Date(),
): {
  status: "ready" | "not_ready";
  scope: "recorded_validation_evidence";
  controls: ReleaseValidationState[];
  requiredPassed: number;
  requiredTotal: number;
  blockers: ReleaseValidationState[];
} {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const controls = RELEASE_VALIDATION_CONTROLS.map((control): ReleaseValidationState => {
    const latest = [...ordered].reverse().find((event) => event.controlKey === control.key) ?? null;
    if (!latest) return { ...control, status: "not_validated", latestEvent: null };
    if (latest.action === "revoked") return { ...control, status: "revoked", latestEvent: latest };
    if (latest.result === "passed" && isExpired(latest, now)) {
      return { ...control, status: "expired", latestEvent: latest };
    }
    return { ...control, status: latest.result ?? "not_validated", latestEvent: latest };
  });

  const required = controls.filter((control) => control.required);
  const requiredPassed = required.filter((control) => control.status === "passed").length;
  const blockers = required.filter((control) => control.status !== "passed");

  return {
    status: blockers.length === 0 ? "ready" : "not_ready",
    scope: "recorded_validation_evidence",
    controls,
    requiredPassed,
    requiredTotal: required.length,
    blockers,
  };
}

export function normalizeReleaseValidationInput(input: unknown): {
  controlKey: string;
  result: ReleaseValidationResult;
  environment: string;
  summary: string;
  evidenceReference: string;
  evidence: Record<string, unknown>;
  expiresAt: Date | null;
  idempotencyKey: string;
} {
  if (!input || typeof input !== "object") throw new Error("Validation evidence is required");
  const value = input as Record<string, unknown>;
  const controlKey = String(value.controlKey ?? "").trim();
  if (!RELEASE_VALIDATION_CONTROLS.some((control) => control.key === controlKey)) throw new Error("Unknown validation control");

  const result = String(value.result ?? "") as ReleaseValidationResult;
  if (!RELEASE_VALIDATION_RESULTS.includes(result)) throw new Error("Invalid validation result");

  const environment = String(value.environment ?? "").trim().slice(0, 80);
  const summary = String(value.summary ?? "").trim().slice(0, 2000);
  const evidenceReference = String(value.evidenceReference ?? "").trim().slice(0, 1000);
  const idempotencyKey = String(value.idempotencyKey ?? "").trim().slice(0, 200);
  if (!environment) throw new Error("Environment is required");
  if (summary.length < 10) throw new Error("A concrete evidence summary is required");
  if (!evidenceReference) throw new Error("An evidence reference is required");
  let evidenceUrl: URL;
  try {
    evidenceUrl = new URL(evidenceReference);
  } catch {
    throw new Error("Evidence reference must be a valid URL");
  }
  if (evidenceUrl.protocol !== "https:") throw new Error("Evidence reference must use HTTPS");
  if (!idempotencyKey) throw new Error("An idempotency key is required");

  let expiresAt: Date | null = null;
  if (value.expiresAt) {
    const parsed = new Date(String(value.expiresAt));
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid evidence expiry");
    expiresAt = parsed;
  }

  const evidence = value.evidence && typeof value.evidence === "object" && !Array.isArray(value.evidence)
    ? value.evidence as Record<string, unknown>
    : {};

  return { controlKey, result, environment, summary, evidenceReference, evidence, expiresAt, idempotencyKey };
}

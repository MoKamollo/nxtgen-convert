import { randomUUID } from "crypto";
import { and, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db, withTenantDatabase } from "@/db";
import { publishQStashMessage } from "@/lib/qstash";
import { validateWorkflowDefinition, type WorkflowCondition, type WorkflowExperimentVariant, type ValidatedWorkflowStep } from "@/lib/workflow-validation";
import { chooseExperimentVariant, evaluateWorkflowCondition, type JourneyContext } from "@/lib/journey-runtime";
import {
  activities,
  automationLogs,
  contactConsents,
  contacts,
  deals,
  workflowActiveVersions,
  workflowEnrollments,
  workflowExperimentAssignments,
  workflowGoalEvents,
  workflowStepExecutions,
  workflowVersions,
  workflows,
  organizations,
} from "@/db/schema";

export type AutoStep = ValidatedWorkflowStep;
type ActivityType = "email" | "call" | "meeting" | "note" | "task" | "sms" | "whatsapp";
type TriggerOptions = { contactId?: string; dealId?: string; idempotencyKey?: string; context?: Record<string, unknown> };

const SUPPORTED_EVENTS = new Set(["contact.created", "deal.stage_changed", "manual"]);
const LOCK_STALE_MS = 5 * 60_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]!));
}

async function recordStep(orgId: string, workflowId: string, contactId: string | undefined, event: string, status: string, metadata: Record<string, unknown>) {
  await db.insert(automationLogs).values({ organizationId: orgId, workflowId, contactId: contactId ?? null, event, status, metadata });
}

async function validateTargets(orgId: string, options: TriggerOptions): Promise<void> {
  if (options.contactId) {
    const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, options.contactId), eq(contacts.organizationId, orgId))).limit(1);
    if (!contact) throw new Error("Contact does not belong to this tenant");
  }
  if (options.dealId) {
    const [deal] = await db.select({ id: deals.id, contactId: deals.contactId }).from(deals).where(and(eq(deals.id, options.dealId), eq(deals.organizationId, orgId))).limit(1);
    if (!deal) throw new Error("Deal does not belong to this tenant");
    if (options.contactId && deal.contactId && deal.contactId !== options.contactId) throw new Error("Deal and contact do not belong to the same relationship");
  }
}

async function canEmail(orgId: string, contactId: string, purpose: string): Promise<boolean> {
  if (purpose === "transactional") return true;
  const [consent] = await db.select({ status: contactConsents.status, expiresAt: contactConsents.expiresAt }).from(contactConsents).where(and(
    eq(contactConsents.organizationId, orgId),
    eq(contactConsents.contactId, contactId),
    eq(contactConsents.channel, "email"),
    eq(contactConsents.purpose, purpose),
    lte(contactConsents.effectiveAt, new Date()),
  )).orderBy(desc(contactConsents.effectiveAt)).limit(1);
  return consent?.status === "granted" && (!consent.expiresAt || consent.expiresAt > new Date());
}

async function scheduleEnrollmentResume(enrollmentId: string, organizationId: string, resumeAt: Date): Promise<boolean> {
  if (!process.env.QSTASH_TOKEN || !process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return false;
  await publishQStashMessage({
    destination: `${appUrl.replace(/\/$/, "")}/api/automation/resume/${enrollmentId}`,
    body: { organizationId },
    notBefore: resumeAt,
  });
  return true;
}

async function executeStep(
  step: AutoStep,
  orgId: string,
  contactId: string | undefined,
  dealId: string | undefined,
  workflowId: string,
  workflowName: string,
  idempotencyKey: string,
): Promise<{ providerMessageId?: string; result?: Record<string, unknown> }> {
  if (step.type === "create_activity") {
    if (!contactId) throw new Error("create_activity requires a contact");
    const [activity] = await db.insert(activities).values({
      organizationId: orgId,
      type: ((step.config.type as string) ?? "note") as ActivityType,
      subject: String(step.config.subject ?? `Automated: ${workflowName}`).slice(0, 300),
      body: step.config.body ? String(step.config.body).slice(0, 20_000) : null,
      contactId,
      dealId: dealId ?? null,
      metadata: { automated: true, workflowId, idempotencyKey },
    }).returning({ id: activities.id });
    return { result: { activityId: activity.id } };
  }

  if (step.type === "send_email") {
    if (!contactId) throw new Error("send_email requires a contact");
    const [contact] = await db.select({ firstName: contacts.firstName, email: contacts.email }).from(contacts).where(and(
      eq(contacts.id, contactId), eq(contacts.organizationId, orgId),
    )).limit(1);
    if (!contact?.email) throw new Error("Contact email was not found in this tenant");
    const purpose = String(step.config.purpose ?? "marketing");
    if (!(await canEmail(orgId, contactId, purpose))) throw new Error(`Email consent is not granted for purpose: ${purpose}`);
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Email provider is not configured");
    const subject = String(step.config.subject ?? workflowName).slice(0, 998);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [contact.email],
        subject,
        html: `<!doctype html><html><body><h2>${escapeHtml(subject)}</h2><p>Hi ${escapeHtml(contact.firstName)},</p><div>${escapeHtml(step.config.body).replace(/\n/g, "<br>")}</div></body></html>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(responseBody.message ?? `Email provider returned ${response.status}`);
    return { providerMessageId: responseBody.id, result: { purpose } };
  }

  if (step.type === "update_contact") {
    if (!contactId) throw new Error("update_contact requires a contact");
    const updates: Record<string, unknown> = {};
    if (typeof step.config.status === "string" && ["lead", "prospect", "customer", "churned", "vip"].includes(step.config.status)) updates.status = step.config.status;
    if (step.config.score !== undefined) {
      const score = Number(step.config.score);
      if (!Number.isFinite(score)) throw new Error("update_contact score must be numeric");
      updates.score = Math.max(0, Math.min(100, score));
    }
    if (Object.keys(updates).length === 0) throw new Error("update_contact has no valid updates");
    const [updated] = await db.update(contacts).set({ ...updates, updatedAt: new Date() }).where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId))).returning({ id: contacts.id });
    if (!updated) throw new Error("Contact was not found in this tenant");
    return { result: { fields: Object.keys(updates) } };
  }

  throw new Error(`Unsupported executable step: ${step.type}`);
}

export function waitDurationMs(config: Record<string, unknown>): number {
  const rawAmount = Number(config.amount ?? 1);
  const amount = Number.isFinite(rawAmount) ? Math.max(1, Math.min(rawAmount, 365)) : 1;
  const unit = String(config.unit ?? "hours");
  const map: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
  if (!(unit in map)) throw new Error("Unsupported wait unit");
  return amount * map[unit];
}


type ControlStepOutcome = {
  nextStepIndex: number;
  result: Record<string, unknown>;
  exit?: { type: "success" | "neutral" | "disqualified"; reason: string };
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function loadJourneyContext(enrollment: typeof workflowEnrollments.$inferSelect): Promise<JourneyContext> {
  const [contact, deal] = await Promise.all([
    enrollment.contactId
      ? db.select().from(contacts).where(and(eq(contacts.id, enrollment.contactId), eq(contacts.organizationId, enrollment.organizationId))).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    enrollment.dealId
      ? db.select().from(deals).where(and(eq(deals.id, enrollment.dealId), eq(deals.organizationId, enrollment.organizationId))).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);
  return {
    contact: contact as unknown as Record<string, unknown> | null,
    deal: deal as unknown as Record<string, unknown> | null,
    context: objectValue(enrollment.context),
    enrollment: {
      event: enrollment.event,
      attemptCount: enrollment.attemptCount,
      createdAt: enrollment.createdAt,
    },
  };
}

async function executeControlStep(input: {
  step: AutoStep;
  stepIndex: number;
  enrollment: typeof workflowEnrollments.$inferSelect;
  workflow: typeof workflows.$inferSelect;
  values: JourneyContext;
}): Promise<ControlStepOutcome> {
  const { step, stepIndex, enrollment, workflow, values } = input;
  if (step.type === "condition") {
    const condition = step.config.condition as WorkflowCondition;
    const matched = evaluateWorkflowCondition(condition, values);
    const nextStepIndex = Number(matched ? step.config.onTrueIndex : step.config.onFalseIndex);
    return { nextStepIndex, result: { matched, nextStepIndex, condition } };
  }

  if (step.type === "experiment") {
    const variants = step.config.variants as WorkflowExperimentVariant[];
    const experimentKey = String(step.config.experimentKey);
    let [assignment] = await db.select().from(workflowExperimentAssignments).where(and(
      eq(workflowExperimentAssignments.organizationId, enrollment.organizationId),
      eq(workflowExperimentAssignments.enrollmentId, enrollment.id),
      eq(workflowExperimentAssignments.stepIndex, stepIndex),
    )).limit(1);
    if (!assignment) {
      const selected = chooseExperimentVariant(
        `${enrollment.organizationId}:${enrollment.workflowVersionId ?? workflow.id}:${enrollment.id}:${experimentKey}:${stepIndex}`,
        variants,
      );
      await db.insert(workflowExperimentAssignments).values({
        organizationId: enrollment.organizationId,
        workflowId: workflow.id,
        workflowVersionId: enrollment.workflowVersionId,
        enrollmentId: enrollment.id,
        stepIndex,
        experimentKey,
        variantId: selected.id,
        variantName: selected.name,
        targetIndex: selected.targetIndex,
        metadata: { weights: variants.map((variant) => ({ id: variant.id, weight: variant.weight })) },
      }).onConflictDoNothing();
      [assignment] = await db.select().from(workflowExperimentAssignments).where(and(
        eq(workflowExperimentAssignments.organizationId, enrollment.organizationId),
        eq(workflowExperimentAssignments.enrollmentId, enrollment.id),
        eq(workflowExperimentAssignments.stepIndex, stepIndex),
      )).limit(1);
    }
    if (!assignment) throw new Error("Experiment assignment could not be persisted");
    return {
      nextStepIndex: assignment.targetIndex,
      result: { experimentKey, variantId: assignment.variantId, variantName: assignment.variantName, nextStepIndex: assignment.targetIndex },
    };
  }

  if (step.type === "goal") {
    const condition = step.config.condition as WorkflowCondition | undefined;
    const matched = condition ? evaluateWorkflowCondition(condition, values) : true;
    if (matched) {
      await db.insert(workflowGoalEvents).values({
        organizationId: enrollment.organizationId,
        workflowId: workflow.id,
        workflowVersionId: enrollment.workflowVersionId,
        enrollmentId: enrollment.id,
        contactId: enrollment.contactId,
        dealId: enrollment.dealId,
        goalKey: String(step.config.key),
        goalName: String(step.config.name),
        metadata: { stepIndex, condition: condition ?? null },
      }).onConflictDoNothing();
      await db.update(workflowEnrollments).set({
        goalReachedAt: sql`COALESCE(${workflowEnrollments.goalReachedAt}, now())`,
        updatedAt: new Date(),
      }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.organizationId, enrollment.organizationId)));
    }
    const nextStepIndex = stepIndex + 1;
    return {
      nextStepIndex,
      result: { matched, goalKey: step.config.key, goalName: step.config.name, nextStepIndex },
      ...(matched && Boolean(step.config.exitOnMatch) ? { exit: { type: "success" as const, reason: `Goal reached: ${String(step.config.name)}` } } : {}),
    };
  }

  if (step.type === "exit") {
    return {
      nextStepIndex: stepIndex + 1,
      result: { nextStepIndex: stepIndex + 1, exitType: step.config.exitType, reason: step.config.reason },
      exit: { type: String(step.config.exitType) as "success" | "neutral" | "disqualified", reason: String(step.config.reason) },
    };
  }

  throw new Error(`Unsupported control step: ${step.type}`);
}

async function claimEnrollment(enrollmentId: string) {
  const lockToken = randomUUID();
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  const [enrollment] = await db.update(workflowEnrollments).set({
    status: "processing", lockToken, lockedAt: new Date(), updatedAt: new Date(),
  }).where(and(
    eq(workflowEnrollments.id, enrollmentId),
    lte(workflowEnrollments.resumeAt, new Date()),
    or(
      inArray(workflowEnrollments.status, ["pending", "retrying"]),
      and(eq(workflowEnrollments.status, "processing"), lt(workflowEnrollments.lockedAt, staleBefore)),
    ),
  )).returning();
  return enrollment ? { enrollment, lockToken } : null;
}

async function markWaitStepCompleted(enrollment: typeof workflowEnrollments.$inferSelect, workflow: typeof workflows.$inferSelect, step: AutoStep, stepIndex: number) {
  const idempotencyKey = `workflow:${enrollment.id}:step:${stepIndex}`;
  await db.insert(workflowStepExecutions).values({
    organizationId: enrollment.organizationId,
    enrollmentId: enrollment.id,
    workflowId: workflow.id,
    stepIndex,
    stepType: step.type,
    status: "completed",
    idempotencyKey,
    result: { durationMs: waitDurationMs(step.config) },
    completedAt: new Date(),
  }).onConflictDoNothing();
}

async function runClaimedEnrollment(enrollmentId: string, lockToken: string): Promise<"completed" | "exited" | "waiting" | "retrying" | "dead_letter"> {
  const [enrollment] = await db.select().from(workflowEnrollments).where(and(
    eq(workflowEnrollments.id, enrollmentId),
    eq(workflowEnrollments.lockToken, lockToken),
    eq(workflowEnrollments.status, "processing"),
  )).limit(1);
  if (!enrollment) throw new Error("Workflow enrollment lock was lost");

  const [workflow] = await db.select().from(workflows).where(and(eq(workflows.id, enrollment.workflowId), eq(workflows.organizationId, enrollment.organizationId))).limit(1);
  if (!workflow || workflow.status === "archived") {
    await db.update(workflowEnrollments).set({ status: "skipped", lockToken: null, lockedAt: null, lastError: "Workflow is archived or unavailable", updatedAt: new Date() }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
    return "dead_letter";
  }
  if (workflow.status !== "active") {
    const resumeAt = new Date(Date.now() + 15 * 60_000);
    await db.update(workflowEnrollments).set({ status: "pending", resumeAt, lockToken: null, lockedAt: null, lastError: "Workflow is paused", updatedAt: new Date() }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
    try { await scheduleEnrollmentResume(enrollment.id, enrollment.organizationId, resumeAt); } catch { /* cron fallback remains active */ }
    return "waiting";
  }

  let definition = validateWorkflowDefinition({ trigger: workflow.trigger, steps: workflow.steps });
  if (enrollment.workflowVersionId) {
    const [version] = await db.select({ definition: workflowVersions.definition }).from(workflowVersions).where(and(
      eq(workflowVersions.id, enrollment.workflowVersionId),
      eq(workflowVersions.workflowId, workflow.id),
      eq(workflowVersions.organizationId, enrollment.organizationId),
    )).limit(1);
    if (!version) throw new Error("Pinned workflow version is missing");
    definition = validateWorkflowDefinition(version.definition);
  }
  const steps = definition.steps as AutoStep[];
  const values = await loadJourneyContext(enrollment);
  try {
    let stepIndex = enrollment.nextStepIndex;
    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      const idempotencyKey = `workflow:${enrollment.id}:step:${stepIndex}`;
      const [existingExecution] = await db.select().from(workflowStepExecutions).where(and(
        eq(workflowStepExecutions.enrollmentId, enrollment.id),
        eq(workflowStepExecutions.stepIndex, stepIndex),
      )).limit(1);

      if (existingExecution?.status === "completed") {
        const result = objectValue(existingExecution.result);
        const recordedNext = Number(result.nextStepIndex);
        const nextStepIndex = Number.isInteger(recordedNext) && recordedNext > stepIndex ? recordedNext : stepIndex + 1;
        if (result.terminalStatus === "exited") {
          await db.update(workflowEnrollments).set({
            status: "exited",
            nextStepIndex,
            exitType: String(result.exitType ?? "neutral"),
            exitReason: String(result.exitReason ?? "Journey exited"),
            exitedAt: new Date(),
            lockToken: null,
            lockedAt: null,
            updatedAt: new Date(),
          }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
          return "exited";
        }
        await db.update(workflowEnrollments).set({ nextStepIndex, updatedAt: new Date() }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
        stepIndex = nextStepIndex;
        continue;
      }
      if (existingExecution?.status === "processing") throw new Error(`Step ${stepIndex + 1} has an ambiguous prior execution and requires owner review`);

      if (step.type === "wait") {
        await markWaitStepCompleted(enrollment, workflow, step, stepIndex);
        const resumeAt = new Date(Date.now() + waitDurationMs(step.config));
        await db.update(workflowEnrollments).set({
          nextStepIndex: stepIndex + 1,
          resumeAt,
          status: "pending",
          lockToken: null,
          lockedAt: null,
          lastError: null,
          updatedAt: new Date(),
        }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
        try { await scheduleEnrollmentResume(enrollment.id, enrollment.organizationId, resumeAt); }
        catch (error) { await recordStep(enrollment.organizationId, workflow.id, enrollment.contactId ?? undefined, "workflow.schedule", "fallback_cron", { enrollmentId: enrollment.id, error: error instanceof Error ? error.message : "Scheduling failed" }); }
        return "waiting";
      }

      let execution = existingExecution;
      if (execution?.status === "failed") {
        [execution] = await db.update(workflowStepExecutions).set({
          status: "processing", attemptCount: (execution.attemptCount ?? 0) + 1, lastError: null, startedAt: new Date(), updatedAt: new Date(),
        }).where(and(eq(workflowStepExecutions.id, execution.id), eq(workflowStepExecutions.status, "failed"))).returning();
      } else {
        [execution] = await db.insert(workflowStepExecutions).values({
          organizationId: enrollment.organizationId,
          enrollmentId: enrollment.id,
          workflowId: workflow.id,
          stepIndex,
          stepType: step.type,
          status: "processing",
          idempotencyKey,
        }).returning();
      }
      if (!execution) throw new Error(`Step ${stepIndex + 1} could not acquire its execution record`);

      try {
        if (["condition", "experiment", "goal", "exit"].includes(step.type)) {
          const outcome = await executeControlStep({ step, stepIndex, enrollment, workflow, values });
          const executionResult = outcome.exit
            ? { ...outcome.result, terminalStatus: "exited", exitType: outcome.exit.type, exitReason: outcome.exit.reason }
            : outcome.result;
          await db.update(workflowStepExecutions).set({
            status: "completed", result: executionResult, completedAt: new Date(), updatedAt: new Date(),
          }).where(and(eq(workflowStepExecutions.id, execution.id), eq(workflowStepExecutions.status, "processing")));
          if (outcome.exit) {
            await db.update(workflowEnrollments).set({
              status: "exited",
              nextStepIndex: outcome.nextStepIndex,
              exitType: outcome.exit.type,
              exitReason: outcome.exit.reason,
              exitedAt: new Date(),
              lockToken: null,
              lockedAt: null,
              lastError: null,
              updatedAt: new Date(),
            }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
            await recordStep(enrollment.organizationId, workflow.id, enrollment.contactId ?? undefined, `step.${step.type}`, "exited", { enrollmentId: enrollment.id, stepIndex, exitType: outcome.exit.type });
            return "exited";
          }
          await db.update(workflowEnrollments).set({ nextStepIndex: outcome.nextStepIndex, updatedAt: new Date() }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
          await recordStep(enrollment.organizationId, workflow.id, enrollment.contactId ?? undefined, `step.${step.type}`, "completed", { enrollmentId: enrollment.id, stepIndex, nextStepIndex: outcome.nextStepIndex });
          stepIndex = outcome.nextStepIndex;
          continue;
        }

        const outcome = await executeStep(step, enrollment.organizationId, enrollment.contactId ?? undefined, enrollment.dealId ?? undefined, workflow.id, workflow.name, idempotencyKey);
        const nextStepIndex = stepIndex + 1;
        await db.update(workflowStepExecutions).set({
          status: "completed", providerMessageId: outcome.providerMessageId ?? null, result: { ...(outcome.result ?? {}), nextStepIndex }, completedAt: new Date(), updatedAt: new Date(),
        }).where(and(eq(workflowStepExecutions.id, execution.id), eq(workflowStepExecutions.status, "processing")));
        await db.update(workflowEnrollments).set({ nextStepIndex, updatedAt: new Date() }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
        await recordStep(enrollment.organizationId, workflow.id, enrollment.contactId ?? undefined, `step.${step.type}`, "completed", { enrollmentId: enrollment.id, stepIndex });
        stepIndex = nextStepIndex;
      } catch (error) {
        await db.update(workflowStepExecutions).set({ status: "failed", lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Step failed", updatedAt: new Date() }).where(eq(workflowStepExecutions.id, execution.id));
        throw error;
      }
    }

    await db.update(workflowEnrollments).set({
      status: "completed", completedAt: new Date(), lockToken: null, lockedAt: null, lastError: null, updatedAt: new Date(),
    }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
    await db.update(workflows).set({ completedCount: sql`${workflows.completedCount} + 1`, updatedAt: new Date() }).where(and(eq(workflows.id, workflow.id), eq(workflows.organizationId, enrollment.organizationId)));
    return "completed";
  } catch (error) {
    const attempts = (enrollment.attemptCount ?? 0) + 1;
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "Workflow execution failed";
    const ambiguous = message.includes("ambiguous prior execution");
    const dead = ambiguous || attempts >= (enrollment.maxAttempts ?? 5);
    const retryAt = dead ? enrollment.resumeAt : new Date(Date.now() + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]);
    await db.update(workflowEnrollments).set({
      status: dead ? "dead_letter" : "retrying",
      attemptCount: attempts,
      resumeAt: retryAt,
      lastError: message,
      lockToken: null,
      lockedAt: null,
      updatedAt: new Date(),
    }).where(and(eq(workflowEnrollments.id, enrollment.id), eq(workflowEnrollments.lockToken, lockToken)));
    await recordStep(enrollment.organizationId, workflow.id, enrollment.contactId ?? undefined, "workflow.execution", dead ? "dead_letter" : "retrying", { enrollmentId: enrollment.id, attempt: attempts, error: message });
    if (!dead) {
      try { await scheduleEnrollmentResume(enrollment.id, enrollment.organizationId, retryAt); }
      catch (scheduleError) { await recordStep(enrollment.organizationId, workflow.id, enrollment.contactId ?? undefined, "workflow.schedule", "fallback_cron", { enrollmentId: enrollment.id, error: scheduleError instanceof Error ? scheduleError.message : "Scheduling failed" }); }
    }
    return dead ? "dead_letter" : "retrying";
  }
}

export async function triggerAutomation(orgId: string, event: string, options: TriggerOptions = {}) {
  if (!SUPPORTED_EVENTS.has(event)) throw new Error(`Unsupported automation event: ${event}`);
  await validateTargets(orgId, options);
  const active = await db.select({ workflow: workflows, version: workflowVersions }).from(workflows)
    .innerJoin(workflowActiveVersions, and(
      eq(workflowActiveVersions.workflowId, workflows.id),
      eq(workflowActiveVersions.organizationId, workflows.organizationId),
    ))
    .innerJoin(workflowVersions, and(
      eq(workflowVersions.id, workflowActiveVersions.versionId),
      eq(workflowVersions.organizationId, workflows.organizationId),
    ))
    .where(and(eq(workflows.organizationId, orgId), eq(workflows.status, "active"), eq(workflowVersions.status, "published")));
  const matching = active.filter(({ version }) => {
    const definition = validateWorkflowDefinition(version.definition);
    return definition.trigger.event === event;
  });
  const results: Array<{ workflowId: string; status: string; enrollmentId?: string }> = [];

  for (const { workflow, version } of matching) {
    const eventKey = options.idempotencyKey ?? `${event}:${options.contactId ?? "none"}:${options.dealId ?? "none"}:${randomUUID()}`;
    const [enrollment] = await db.insert(workflowEnrollments).values({
      organizationId: orgId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      contactId: options.contactId ?? null,
      dealId: options.dealId ?? null,
      event,
      context: options.context ?? {},
      idempotencyKey: eventKey,
      nextStepIndex: 0,
      resumeAt: new Date(),
      status: "pending",
    }).onConflictDoNothing().returning();
    if (!enrollment) {
      results.push({ workflowId: workflow.id, status: "duplicate" });
      continue;
    }
    await db.update(workflows).set({ enrolledCount: sql`${workflows.enrolledCount} + 1`, updatedAt: new Date() }).where(and(eq(workflows.id, workflow.id), eq(workflows.organizationId, orgId)));
    const claimed = await claimEnrollment(enrollment.id);
    const status = claimed ? await runClaimedEnrollment(enrollment.id, claimed.lockToken) : "retrying";
    results.push({ workflowId: workflow.id, status, enrollmentId: enrollment.id });
  }
  return results;
}

export async function processEnrollmentById(enrollmentId: string, organizationId: string) {
  const [owned] = await db.select({ id: workflowEnrollments.id }).from(workflowEnrollments).where(and(
    eq(workflowEnrollments.id, enrollmentId),
    eq(workflowEnrollments.organizationId, organizationId),
  )).limit(1);
  if (!owned) throw new Error("Workflow enrollment was not found in this tenant");
  const claimed = await claimEnrollment(enrollmentId);
  if (!claimed) return { status: "not_due_or_already_claimed" } as const;
  return { status: await runClaimedEnrollment(enrollmentId, claimed.lockToken) } as const;
}

async function processTenantPendingEnrollments(organizationId: string, limit: number) {
  return withTenantDatabase(organizationId, async () => {
    const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
    const pending = await db.select({ id: workflowEnrollments.id }).from(workflowEnrollments).where(and(
      eq(workflowEnrollments.organizationId, organizationId),
      lte(workflowEnrollments.resumeAt, new Date()),
      or(
        inArray(workflowEnrollments.status, ["pending", "retrying"]),
        and(eq(workflowEnrollments.status, "processing"), lt(workflowEnrollments.lockedAt, staleBefore)),
      ),
    )).limit(limit);
    let completed = 0;
    let exited = 0;
    let waiting = 0;
    let retrying = 0;
    let deadLetter = 0;
    for (const item of pending) {
      const claimed = await claimEnrollment(item.id);
      if (!claimed) continue;
      const status = await runClaimedEnrollment(item.id, claimed.lockToken);
      if (status === "completed") completed += 1;
      else if (status === "exited") exited += 1;
      else if (status === "waiting") waiting += 1;
      else if (status === "retrying") retrying += 1;
      else deadLetter += 1;
    }
    return { selected: pending.length, completed, exited, waiting, retrying, deadLetter };
  });
}

export async function processPendingEnrollments(limit = 100) {
  const tenants = await db.select({ id: organizations.id }).from(organizations);
  const total = { selected: 0, completed: 0, exited: 0, waiting: 0, retrying: 0, deadLetter: 0 };
  let remaining = limit;
  for (const tenant of tenants) {
    if (remaining <= 0) break;
    const result = await processTenantPendingEnrollments(tenant.id, remaining);
    for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key];
    remaining -= result.selected;
  }
  return total;
}

import { createHash } from "crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { workflowActiveVersions, workflowVersions, workflows } from "@/db/schema";
import { validateWorkflowDefinition } from "@/lib/workflow-validation";

export type WorkflowDefinition = ReturnType<typeof validateWorkflowDefinition>;

export function workflowDefinitionChecksum(definition: WorkflowDefinition): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}

export async function createDraftWorkflowVersion(input: {
  organizationId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  createdById?: string | null;
}) {
  const checksum = workflowDefinitionChecksum(input.definition);
  const [existing] = await db.select().from(workflowVersions).where(and(
    eq(workflowVersions.organizationId, input.organizationId),
    eq(workflowVersions.workflowId, input.workflowId),
    eq(workflowVersions.checksum, checksum),
  )).limit(1);
  if (existing) return existing;
  const [latest] = await db.select({ version: workflowVersions.version }).from(workflowVersions).where(and(
    eq(workflowVersions.organizationId, input.organizationId),
    eq(workflowVersions.workflowId, input.workflowId),
  )).orderBy(desc(workflowVersions.version)).limit(1);
  const [created] = await db.insert(workflowVersions).values({
    organizationId: input.organizationId,
    workflowId: input.workflowId,
    version: (latest?.version ?? 0) + 1,
    definition: input.definition,
    checksum,
    status: "draft",
    createdById: input.createdById ?? null,
  }).returning();
  return created;
}

export async function publishWorkflowVersion(input: {
  organizationId: string;
  workflowId: string;
  actorUserId: string;
}) {
  return db.transaction(async (tx) => {
    const [workflow] = await tx.select().from(workflows).where(and(
      eq(workflows.id, input.workflowId),
      eq(workflows.organizationId, input.organizationId),
    )).limit(1);
    if (!workflow) throw new Error("Workflow not found");
    const definition = validateWorkflowDefinition({ trigger: workflow.trigger, steps: workflow.steps });
    const checksum = workflowDefinitionChecksum(definition);
    let [version] = await tx.select().from(workflowVersions).where(and(
      eq(workflowVersions.organizationId, input.organizationId),
      eq(workflowVersions.workflowId, input.workflowId),
      eq(workflowVersions.checksum, checksum),
    )).limit(1);
    if (!version) {
      const [latest] = await tx.select({ version: workflowVersions.version }).from(workflowVersions).where(and(
        eq(workflowVersions.organizationId, input.organizationId),
        eq(workflowVersions.workflowId, input.workflowId),
      )).orderBy(desc(workflowVersions.version)).limit(1);
      [version] = await tx.insert(workflowVersions).values({
        organizationId: input.organizationId,
        workflowId: input.workflowId,
        version: (latest?.version ?? 0) + 1,
        definition,
        checksum,
        status: "draft",
        createdById: input.actorUserId,
      }).returning();
    }
    if (version.status !== "published") {
      [version] = await tx.update(workflowVersions).set({ status: "published", publishedAt: new Date() }).where(and(
        eq(workflowVersions.id, version.id),
        eq(workflowVersions.organizationId, input.organizationId),
      )).returning();
    }
    await tx.insert(workflowActiveVersions).values({
      organizationId: input.organizationId,
      workflowId: input.workflowId,
      versionId: version.id,
      activatedById: input.actorUserId,
      activatedAt: new Date(),
    }).onConflictDoUpdate({
      target: workflowActiveVersions.workflowId,
      set: { versionId: version.id, activatedById: input.actorUserId, activatedAt: new Date() },
    });
    await tx.update(workflows).set({ status: "active", version: version.version, trigger: definition.trigger, steps: definition.steps, updatedAt: new Date() }).where(and(
      eq(workflows.id, input.workflowId), eq(workflows.organizationId, input.organizationId),
    ));
    return version;
  });
}

export async function rollbackWorkflowVersion(input: {
  organizationId: string;
  workflowId: string;
  actorUserId: string;
  targetVersion?: number;
}) {
  return db.transaction(async (tx) => {
    const [active] = await tx.select({ version: workflowVersions.version }).from(workflowActiveVersions)
      .innerJoin(workflowVersions, eq(workflowVersions.id, workflowActiveVersions.versionId))
      .where(and(eq(workflowActiveVersions.organizationId, input.organizationId), eq(workflowActiveVersions.workflowId, input.workflowId)))
      .limit(1);
    if (!active) throw new Error("Workflow has no published version");
    const conditions = [
      eq(workflowVersions.organizationId, input.organizationId),
      eq(workflowVersions.workflowId, input.workflowId),
      eq(workflowVersions.status, "published"),
    ];
    if (input.targetVersion !== undefined) conditions.push(eq(workflowVersions.version, input.targetVersion));
    else conditions.push(lt(workflowVersions.version, active.version));
    const [target] = await tx.select().from(workflowVersions).where(and(...conditions)).orderBy(desc(workflowVersions.version)).limit(1);
    if (!target) throw new Error("No eligible published rollback version was found");
    const definition = validateWorkflowDefinition(target.definition);
    await tx.update(workflowActiveVersions).set({ versionId: target.id, activatedById: input.actorUserId, activatedAt: new Date() }).where(and(
      eq(workflowActiveVersions.organizationId, input.organizationId), eq(workflowActiveVersions.workflowId, input.workflowId),
    ));
    await tx.update(workflows).set({ status: "active", version: target.version, trigger: definition.trigger, steps: definition.steps, updatedAt: new Date() }).where(and(
      eq(workflows.id, input.workflowId), eq(workflows.organizationId, input.organizationId),
    ));
    return target;
  });
}

import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflowActiveVersions, workflowEnrollments, workflowVersions, workflows } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { validateWorkflowDefinition } from "@/lib/workflow-validation";
import { createDraftWorkflowVersion } from "@/lib/workflow-versions";


async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [workflow] = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.organizationId, organizationId))).limit(1);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  const [active, latestDraft] = await Promise.all([
    db.select({ versionId: workflowActiveVersions.versionId, version: workflowVersions.version, checksum: workflowVersions.checksum })
      .from(workflowActiveVersions)
      .innerJoin(workflowVersions, eq(workflowVersions.id, workflowActiveVersions.versionId))
      .where(and(eq(workflowActiveVersions.organizationId, organizationId), eq(workflowActiveVersions.workflowId, id))).limit(1),
    db.select({ id: workflowVersions.id, version: workflowVersions.version, checksum: workflowVersions.checksum, createdAt: workflowVersions.createdAt })
      .from(workflowVersions)
      .where(and(eq(workflowVersions.organizationId, organizationId), eq(workflowVersions.workflowId, id), eq(workflowVersions.status, "draft")))
      .orderBy(desc(workflowVersions.version)).limit(1),
  ]);
  return NextResponse.json({ data: workflow, activeVersion: active[0] ?? null, latestDraft: latestDraft[0] ?? null });
}

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;
  const { id } = await params;
  const body = await request.json();
  const [current] = await db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId))).limit(1);
  if (!current) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Workflow name is required" }, { status: 400 });
    updates.name = name;
  }
  if (body.description !== undefined) updates.description = body.description ? String(body.description).slice(0, 2_000) : null;
  if (body.status !== undefined) {
    const requestedStatus = String(body.status);
    if (requestedStatus === "active") return NextResponse.json({ error: "Publish the workflow to activate a version" }, { status: 409 });
    if (!["draft", "paused", "archived"].includes(requestedStatus)) return NextResponse.json({ error: "Invalid workflow status" }, { status: 400 });
    if (requestedStatus === "draft" && current.status !== "draft") return NextResponse.json({ error: "Published workflows cannot be reverted to an ungoverned draft state" }, { status: 409 });
    updates.status = requestedStatus;
  }

  let draftVersion: number | undefined;
  if (body.trigger !== undefined || body.steps !== undefined) {
    let definition;
    try {
      definition = validateWorkflowDefinition({ trigger: body.trigger ?? current.trigger, steps: body.steps ?? current.steps });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid workflow" }, { status: 400 });
    }
    const version = await createDraftWorkflowVersion({ organizationId: orgId, workflowId: id, definition, createdById: userId });
    draftVersion = version.version;
    updates.trigger = definition.trigger;
    updates.steps = definition.steps;
  }

  const [updated] = await db.update(workflows).set(updates).where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId))).returning();
  return NextResponse.json({ data: updated, ...(draftVersion ? { draftVersion } : {}) });
}

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [workflow] = await db.select({ id: workflows.id }).from(workflows).where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId))).limit(1);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  const [activeEnrollment] = await db.select({ id: workflowEnrollments.id }).from(workflowEnrollments).where(and(
    eq(workflowEnrollments.organizationId, orgId),
    eq(workflowEnrollments.workflowId, id),
    inArray(workflowEnrollments.status, ["pending", "processing", "retrying"]),
  )).limit(1);
  if (activeEnrollment) return NextResponse.json({ error: "Pause this workflow and resolve active enrollments before archiving it" }, { status: 409 });
  const [archived] = await db.update(workflows).set({ status: "archived", updatedAt: new Date() }).where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId))).returning();
  return NextResponse.json({ ok: true, data: archived });
}

export const GET = withApiGuard(GETHandler);
export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

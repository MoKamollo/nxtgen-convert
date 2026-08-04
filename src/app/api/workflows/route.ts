import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { validateWorkflowDefinition } from "@/lib/workflow-validation";
import { createDraftWorkflowVersion } from "@/lib/workflow-versions";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const data = await db.select().from(workflows).where(eq(workflows.organizationId, orgId));
  return NextResponse.json({ data, total: data.length });
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const userId = request.headers.get("x-user-id")!;
  const body = await request.json();
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "Workflow name is required" }, { status: 400 });
  let definition;
  try {
    definition = validateWorkflowDefinition({ trigger: body.trigger ?? { event: "manual" }, steps: body.steps ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid workflow" }, { status: 400 });
  }
  const [workflow] = await db.insert(workflows).values({
    organizationId: orgId,
    name,
    description: body.description ? String(body.description).slice(0, 2_000) : null,
    status: "draft",
    trigger: definition.trigger,
    steps: definition.steps,
    createdById: userId,
  }).returning();
  try {
    const version = await createDraftWorkflowVersion({ organizationId: orgId, workflowId: workflow.id, definition, createdById: userId });
    return NextResponse.json({ data: workflow, draftVersion: version.version }, { status: 201 });
  } catch (error) {
    await db.delete(workflows).where(eq(workflows.id, workflow.id));
    throw error;
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

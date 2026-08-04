import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";
import { rollbackWorkflowVersion } from "@/lib/workflow-versions";

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id: workflowId } = await params;
  const body = await request.json().catch(() => ({}));
  const targetVersion = body.targetVersion === undefined ? undefined : Number(body.targetVersion);
  if (targetVersion !== undefined && (!Number.isInteger(targetVersion) || targetVersion < 1)) return NextResponse.json({ error: "targetVersion must be a positive integer" }, { status: 400 });
  try {
    const version = await rollbackWorkflowVersion({ organizationId, workflowId, actorUserId, targetVersion });
    return NextResponse.json({ data: version, message: `Workflow rolled back to version ${version.version}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workflow rollback failed" }, { status: 409 });
  }
}

export const POST = withApiGuard(POSTHandler);

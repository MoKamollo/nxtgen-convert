import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";
import { publishWorkflowVersion } from "@/lib/workflow-versions";

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id")!;
  const { id: workflowId } = await params;
  try {
    const version = await publishWorkflowVersion({ organizationId, workflowId, actorUserId });
    return NextResponse.json({ data: version, message: `Workflow version ${version.version} is active` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow could not be published";
    return NextResponse.json({ error: message }, { status: message === "Workflow not found" ? 404 : 409 });
  }
}

export const POST = withApiGuard(POSTHandler);

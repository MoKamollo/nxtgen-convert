import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflowActiveVersions, workflowVersions, workflows } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [workflow] = await db.select({ id: workflows.id }).from(workflows).where(and(eq(workflows.id, id), eq(workflows.organizationId, orgId))).limit(1);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  const [versions, active] = await Promise.all([
    db.select().from(workflowVersions).where(and(eq(workflowVersions.organizationId, orgId), eq(workflowVersions.workflowId, id))).orderBy(desc(workflowVersions.version)),
    db.select({ versionId: workflowActiveVersions.versionId }).from(workflowActiveVersions).where(and(eq(workflowActiveVersions.organizationId, orgId), eq(workflowActiveVersions.workflowId, id))).limit(1),
  ]);
  return NextResponse.json({ data: versions.map((version) => ({ ...version, active: version.id === active[0]?.versionId })) });
}

export const GET = withApiGuard(GETHandler);

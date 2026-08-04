import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";
import { rollbackPersonalization } from "@/lib/personalization";
async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  try { const version = await rollbackPersonalization({ organizationId: request.headers.get("x-tenant-id")!, experienceId: (await params).id, actorUserId: request.headers.get("x-user-id")!, targetVersion: body.targetVersion === undefined ? undefined : Number(body.targetVersion) }); return NextResponse.json({ data: version }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Experience rollback failed" }, { status: 409 }); }
}
export const POST = withApiGuard(POSTHandler);

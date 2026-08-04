import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";
import { rollbackSegment } from "@/lib/segments";
async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  try { const version = await rollbackSegment({ organizationId: request.headers.get("x-tenant-id")!, segmentId: (await params).id, actorUserId: request.headers.get("x-user-id")!, targetVersion: body.targetVersion === undefined ? undefined : Number(body.targetVersion) }); return NextResponse.json({ data: version }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Segment rollback failed" }, { status: 409 }); }
}
export const POST = withApiGuard(POSTHandler);

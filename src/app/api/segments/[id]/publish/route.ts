import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";
import { publishSegment } from "@/lib/segments";
async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const version = await publishSegment({ organizationId: request.headers.get("x-tenant-id")!, segmentId: (await params).id, actorUserId: request.headers.get("x-user-id")! }); return NextResponse.json({ data: version }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Segment could not be published" }, { status: 409 }); }
}
export const POST = withApiGuard(POSTHandler);

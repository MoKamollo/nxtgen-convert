import { NextRequest, NextResponse } from "next/server";
import { withApiGuard } from "@/lib/api-guard";
import { publishPersonalization } from "@/lib/personalization";
async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const version = await publishPersonalization({ organizationId: request.headers.get("x-tenant-id")!, experienceId: (await params).id, actorUserId: request.headers.get("x-user-id")! }); return NextResponse.json({ data: version }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Experience could not be published" }, { status: 409 }); }
}
export const POST = withApiGuard(POSTHandler);

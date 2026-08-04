import { NextRequest, NextResponse } from "next/server";
import { withApiKeyGuard } from "@/lib/api-guard";
import { decidePersonalization } from "@/lib/personalization";
async function POSTHandler(request: NextRequest) {
  const body = await request.json();
  const experienceKey = String(body.experienceKey ?? "").trim(); const subjectKey = String(body.subjectKey ?? body.contactId ?? "").trim();
  if (!experienceKey || !subjectKey) return NextResponse.json({ error: "experienceKey and subjectKey are required" }, { status: 400 });
  const decision = await decidePersonalization({ organizationId: request.headers.get("x-tenant-id")!, experienceKey, contactId: body.contactId ? String(body.contactId) : null, subjectKey });
  return NextResponse.json({ data: decision });
}
export const POST = withApiKeyGuard("personalization:decide", POSTHandler);

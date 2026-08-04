import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { triggerAutomation } from "@/lib/automation";

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const { contactId, dealId } = body;
    if (!contactId && !dealId) return NextResponse.json({ error: "A tenant-owned contactId or dealId is required" }, { status: 400 });
    await triggerAutomation(orgId, "manual", {
      contactId: contactId ? String(contactId) : undefined,
      dealId: dealId ? String(dealId) : undefined,
      idempotencyKey: request.headers.get("x-request-id") ?? undefined,
      context: { initiatedByUserId: request.headers.get("x-user-id") },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Trigger failed" }, { status: 500 });
  }
}

export const POST = withApiGuard(POSTHandler);

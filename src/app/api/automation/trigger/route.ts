import { NextRequest, NextResponse } from "next/server";
import { triggerAutomation } from "@/lib/automation";

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const { event, contactId, dealId } = body;
    if (!event) return NextResponse.json({ error: "event is required" }, { status: 400 });

    await triggerAutomation(orgId, event, { contactId, dealId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Trigger failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { processDueWebhookDeliveries } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processDueWebhookDeliveries(100));
}

import { NextResponse } from "next/server";
import { processPendingEnrollments } from "@/lib/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const processed = await processPendingEnrollments();
  return NextResponse.json({ ok: true, processed });
}

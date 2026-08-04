import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Resend } from "resend";

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId || !userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured" }, { status: 503 });
    const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(and(eq(users.id, userId), eq(users.organizationId, orgId))).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const body = await request.json();
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "NxtGen Convergence <noreply@nxtgen-stack.com>",
      to: user.email,
      subject: `[Test] ${String(body.subject ?? "Broadcast")}`,
      html: String(body.content ?? "<p>Test broadcast</p>").replace(/\{\{first_name\}\}/gi, user.name.split(" ")[0]),
    });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
  }
}

export const POST = withApiGuard(POSTHandler);

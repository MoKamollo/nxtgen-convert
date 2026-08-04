import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const results = await db.select().from(campaigns).where(eq(campaigns.organizationId, orgId));
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const type = String(body.type ?? "email");
    if (type !== "email") {
      return NextResponse.json({ error: "Only the verified email delivery channel is currently operational" }, { status: 409 });
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        organizationId: orgId,
        name: body.name,
        type: "email",
        status: "draft",
        subject: body.subject,
        fromName: body.fromName,
        fromEmail: body.fromEmail,
        content: body.content || {},
        settings: body.settings || {},
        stats: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          failed: 0,
          unsubscribed: 0,
          revenue: 0,
        },
      })
      .returning();

    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

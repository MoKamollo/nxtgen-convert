import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    const results = orgId
      ? await db.select().from(campaigns).where(eq(campaigns.organizationId, orgId))
      : await db.select().from(campaigns).limit(50);

    return NextResponse.json({ data: results, total: results.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const [campaign] = await db
      .insert(campaigns)
      .values({
        organizationId: body.organizationId,
        name: body.name,
        type: body.type || "email",
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

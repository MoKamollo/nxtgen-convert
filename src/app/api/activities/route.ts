import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    const results = orgId
      ? await db.select().from(activities).where(eq(activities.organizationId, orgId)).orderBy(desc(activities.createdAt)).limit(50)
      : await db.select().from(activities).orderBy(desc(activities.createdAt)).limit(50);
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orgId = request.headers.get("x-tenant-id");
    if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const [activity] = await db.insert(activities).values({
      organizationId: orgId,
      type: body.type,
      subject: body.subject,
      body: body.body,
      contactId: body.contactId,
      dealId: body.dealId,
      userId: body.userId,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      duration: body.duration,
      outcome: body.outcome,
    }).returning();
    return NextResponse.json({ data: activity }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create activity" }, { status: 500 });
  }
}

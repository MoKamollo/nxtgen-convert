import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const orgId = request.headers.get("x-tenant-id");
    const results = orgId
      ? await db.select().from(workflows).where(eq(workflows.organizationId, orgId))
      : await db.select().from(workflows).limit(50);
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [workflow] = await db.insert(workflows).values({
      organizationId: body.organizationId,
      name: body.name,
      description: body.description,
      status: "draft",
      trigger: body.trigger || { event: "manual" },
      steps: body.steps || [],
      createdById: body.createdById,
    }).returning();
    return NextResponse.json({ data: workflow }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 });
  }
}

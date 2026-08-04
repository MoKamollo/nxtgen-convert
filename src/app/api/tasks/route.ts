import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const results = await db.select().from(tasks).where(eq(tasks.organizationId, orgId)).orderBy(desc(tasks.createdAt)).limit(100);
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const orgId = request.headers.get("x-tenant-id");
    if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const [task] = await db.insert(tasks).values({
      organizationId: orgId,
      title: body.title,
      description: body.description,
      status: body.status || "todo",
      priority: body.priority || "medium",
      assigneeId: body.assigneeId,
      contactId: body.contactId,
      dealId: body.dealId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      tags: body.tags || [],
    }).returning();
    return NextResponse.json({ data: task }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

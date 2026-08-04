import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  await db.delete(activities).where(and(eq(activities.id, id), eq(activities.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}

export const DELETE = withApiGuard(DELETEHandler);

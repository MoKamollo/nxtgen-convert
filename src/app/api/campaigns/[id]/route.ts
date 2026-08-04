import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const allowed: Record<string, unknown> = {};
    if (body.name !== undefined) allowed.name = body.name;
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!new Set(["draft", "paused", "cancelled"]).has(status)) {
        return NextResponse.json({ error: "Campaign delivery states are controlled by the delivery engine" }, { status: 400 });
      }
      allowed.status = status;
    }
    if (body.subject !== undefined) allowed.subject = body.subject;
    if (body.fromName !== undefined) allowed.fromName = body.fromName;
    if (body.fromEmail !== undefined) allowed.fromEmail = body.fromEmail;

    const [updated] = await db
      .update(campaigns)
      .set({ ...allowed, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, orgId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  try {
    await db
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, orgId)));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}

export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

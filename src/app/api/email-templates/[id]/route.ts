import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function PATCHHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    if (id.startsWith("system:")) return NextResponse.json({ error: "System templates cannot be edited" }, { status: 400 });
    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["name", "subject", "preheader", "htmlContent", "category", "tags"] as const) if (body[key] !== undefined) updates[key] = body[key];
    const [updated] = await db.update(emailTemplates).set(updates).where(and(eq(emailTemplates.id, id), eq(emailTemplates.organizationId, orgId))).returning();
    if (!updated) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ data: { ...updated, isSystem: false } });
  } catch {
    return NextResponse.json({ error: "Failed to update email template" }, { status: 500 });
  }
}

async function DELETEHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    if (id.startsWith("system:")) return NextResponse.json({ error: "System templates cannot be deleted" }, { status: 400 });
    const deleted = await db.delete(emailTemplates).where(and(eq(emailTemplates.id, id), eq(emailTemplates.organizationId, orgId))).returning({ id: emailTemplates.id });
    if (deleted.length === 0) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete email template" }, { status: 500 });
  }
}

export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

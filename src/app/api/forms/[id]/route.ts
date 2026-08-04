import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketingForms } from "@/db/schema";
import { normalizeFormFields } from "@/lib/form-fields";
import { and, eq } from "drizzle-orm";

const STATUSES = new Set(["active", "inactive"]);

async function PATCHHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: {
      name?: string;
      description?: string | null;
      fields?: ReturnType<typeof normalizeFormFields>;
      status?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 150);
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      updates.name = name;
    }
    if (body.description !== undefined) {
      updates.description = String(body.description).trim().slice(0, 2_000) || null;
    }
    if (body.fields !== undefined) {
      const fields = normalizeFormFields(body.fields);
      if (fields.length === 0) {
        return NextResponse.json({ error: "At least one valid field is required" }, { status: 400 });
      }
      updates.fields = fields;
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!STATUSES.has(status)) {
        return NextResponse.json({ error: "Invalid form status" }, { status: 400 });
      }
      updates.status = status;
    }
    const [updated] = await db
      .update(marketingForms)
      .set(updates)
      .where(and(eq(marketingForms.id, id), eq(marketingForms.organizationId, orgId)))
      .returning();
    if (!updated) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[forms:patch]", error);
    return NextResponse.json({ error: "Failed to update form" }, { status: 500 });
  }
}

async function DELETEHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const deleted = await db
      .delete(marketingForms)
      .where(and(eq(marketingForms.id, id), eq(marketingForms.organizationId, orgId)))
      .returning({ id: marketingForms.id });
    if (!deleted.length) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[forms:delete]", error);
    return NextResponse.json({ error: "Failed to delete form" }, { status: 500 });
  }
}

export const PATCH = withApiGuard(PATCHHandler);
export const DELETE = withApiGuard(DELETEHandler);

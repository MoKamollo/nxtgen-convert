import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketingForms } from "@/db/schema";
import { normalizeFormFields } from "@/lib/form-fields";
import { and, desc, eq } from "drizzle-orm";

const STATUSES = new Set(["active", "inactive"]);

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const data = await db
      .select()
      .from(marketingForms)
      .where(eq(marketingForms.organizationId, orgId))
      .orderBy(desc(marketingForms.updatedAt));
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("[forms:get]", error);
    return NextResponse.json({ error: "Failed to fetch forms" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, 150);
    const description = String(body.description ?? "").trim().slice(0, 2_000);
    const fields = normalizeFormFields(body.fields);
    const status = String(body.status ?? "active");
    if (!name || fields.length === 0) {
      return NextResponse.json(
        { error: "Name and at least one valid field are required" },
        { status: 400 },
      );
    }
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid form status" }, { status: 400 });
    }

    const [created] = await db
      .insert(marketingForms)
      .values({ organizationId: orgId, name, description: description || null, fields, status })
      .returning();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://convert.nxtgen-stack.com";
    const embedCode = `<script src="${appUrl}/forms/${created.id}.js" async></script>`;
    const [updated] = await db
      .update(marketingForms)
      .set({ embedCode })
      .where(
        and(eq(marketingForms.id, created.id), eq(marketingForms.organizationId, orgId)),
      )
      .returning();
    return NextResponse.json({ data: updated }, { status: 201 });
  } catch (error) {
    console.error("[forms:post]", error);
    return NextResponse.json({ error: "Failed to create form" }, { status: 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

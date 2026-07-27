import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, marketingForms } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const [form] = await db
      .select({ id: marketingForms.id })
      .from(marketingForms)
      .where(and(eq(marketingForms.id, id), eq(marketingForms.organizationId, orgId)))
      .limit(1);
    if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

    const data = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        customFields: contacts.customFields,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, orgId),
          sql`${contacts.customFields}->>'formId' = ${id}`,
        ),
      )
      .orderBy(desc(contacts.createdAt))
      .limit(500);
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("[forms:submissions]", error);
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}

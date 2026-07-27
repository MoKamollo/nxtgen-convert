import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { automationLogs, contacts, marketingForms } from "@/db/schema";
import { normalizeFormFields } from "@/lib/form-fields";
import { and, eq, sql } from "drizzle-orm";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 100_000) return json({ error: "Submission is too large" }, 413);

    const { id } = await params;
    const [form] = await db
      .select()
      .from(marketingForms)
      .where(eq(marketingForms.id, id))
      .limit(1);
    if (!form || form.status !== "active") {
      return json({ error: "Form is not available" }, 404);
    }

    const rawValues = await request.json();
    if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) {
      return json({ error: "Invalid submission" }, 400);
    }
    const values = rawValues as Record<string, unknown>;
    if (String(values._nxg_website ?? "").trim()) {
      return json({ ok: true }, 201);
    }

    const fields = normalizeFormFields(form.fields);
    const submission: Record<string, string | boolean> = {};
    for (const field of fields) {
      const rawValue = values[field.id];
      if (field.type === "checkbox") {
        const checked = rawValue === true || rawValue === "true" || rawValue === "on";
        if (field.required && !checked) return json({ error: `${field.label} is required` }, 400);
        submission[field.id] = checked;
        continue;
      }

      const value = String(rawValue ?? "").trim();
      if (field.required && !value) return json({ error: `${field.label} is required` }, 400);
      if (value.length > 5_000) return json({ error: `${field.label} is too long` }, 400);
      if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return json({ error: `${field.label} must be a valid email` }, 400);
      }
      if (field.type === "phone" && value && value.length > 50) {
        return json({ error: `${field.label} is invalid` }, 400);
      }
      if (field.type === "select" && value && !(field.options ?? []).includes(value)) {
        return json({ error: `${field.label} contains an invalid option` }, 400);
      }
      submission[field.id] = value;
    }

    const byType = (type: string) => fields.find((field) => field.type === type);
    const byLabel = (...terms: string[]) =>
      fields.find((field) => terms.some((term) => field.label.toLowerCase().includes(term)));
    const get = (field: (typeof fields)[number] | undefined) =>
      field ? String(submission[field.id] ?? "").trim() : "";

    const email = get(byType("email")) || null;
    const phone = get(byType("phone")) || null;
    const firstNameValue = get(byLabel("first name", "firstname"));
    const lastNameValue = get(byLabel("last name", "lastname"));
    const fullName = get(byLabel("full name", "name"));
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = firstNameValue || nameParts[0] || "Website";
    const lastName = lastNameValue || nameParts.slice(1).join(" ") || null;

    const [contact] = await db
      .insert(contacts)
      .values({
        organizationId: form.organizationId,
        firstName: firstName.slice(0, 100),
        lastName: lastName?.slice(0, 100) ?? null,
        email,
        phone,
        source: `Form: ${form.name}`.slice(0, 200),
        status: "lead",
        customFields: { formId: form.id, formName: form.name, submission },
      })
      .returning();

    await Promise.all([
      db
        .update(marketingForms)
        .set({ submissions: sql`${marketingForms.submissions} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(marketingForms.id, form.id),
            eq(marketingForms.organizationId, form.organizationId),
          ),
        ),
      db.insert(automationLogs).values({
        organizationId: form.organizationId,
        event: "form.submitted",
        contactId: contact.id,
        status: "received",
        metadata: { formId: form.id },
      }),
    ]);
    return json({ ok: true, contactId: contact.id }, 201);
  } catch (error) {
    console.error("[forms:submit]", error);
    return json({ error: "Failed to submit form" }, 500);
  }
}

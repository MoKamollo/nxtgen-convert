import { NextRequest, NextResponse } from "next/server";
import { db, withTenantDatabase } from "@/db";
import { automationLogs, contactConsents, contactLifecycleHistory, contacts, marketingForms } from "@/db/schema";
import { normalizeFormFields } from "@/lib/form-fields";
import { and, eq, isNull, sql } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, hashSensitive } from "@/lib/request-security";
import { triggerAutomation } from "@/lib/automation";
import { enqueueWebhookEvent } from "@/lib/webhooks";
import { findIdentityOwner, normalizeIdentity, syncContactIdentity } from "@/lib/identity-resolution";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";

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
    const rate = await checkRateLimit(`${clientIp(request)}:${id}`, "public.form.submit", 20, 60);
    if (!rate.allowed) return json({ error: "Too many submissions. Try again later." }, 429);
    const [form] = await db
      .select()
      .from(marketingForms)
      .where(eq(marketingForms.id, id))
      .limit(1);
    if (!form || form.status !== "active") {
      return json({ error: "Form is not available" }, 404);
    }

    return withTenantDatabase(form.organizationId, async () => {
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

    let email: string | null = null;
    let phone: string | null = null;
    try {
      email = get(byType("email")) ? normalizeIdentity("email", get(byType("email"))) : null;
      phone = get(byType("phone")) ? normalizeIdentity("phone", get(byType("phone"))) : null;
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid contact identity" }, 400);
    }
    const firstNameValue = get(byLabel("first name", "firstname"));
    const lastNameValue = get(byLabel("last name", "lastname"));
    const fullName = get(byLabel("full name", "name"));
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = firstNameValue || nameParts[0] || "Website";
    const lastName = lastNameValue || nameParts.slice(1).join(" ") || null;

    let contact: typeof contacts.$inferSelect;
    let createdContact = false;
    let existingContactId: string | null = null;
    if (email) {
      const owner = await findIdentityOwner(form.organizationId, "email", email);
      const [direct] = await db.select({ id: contacts.id }).from(contacts).where(and(
        eq(contacts.organizationId, form.organizationId), isNull(contacts.archivedAt), sql`lower(trim(${contacts.email})) = ${email}`,
      )).limit(1);
      existingContactId = owner.contactId ?? direct?.id ?? null;
    }
    if (existingContactId) {
      const [existing] = await db.select().from(contacts).where(and(eq(contacts.organizationId, form.organizationId), eq(contacts.id, existingContactId))).limit(1);
      if (!existing) return json({ error: "Unable to resolve contact" }, 409);
      contact = existing;
    } else {
      [contact] = await db.insert(contacts).values({
        organizationId: form.organizationId,
        firstName: firstName.slice(0, 100),
        lastName: lastName?.slice(0, 100) ?? null,
        email,
        phone,
        source: `Form: ${form.name}`.slice(0, 200),
        status: "lead",
        customFields: { formId: form.id, formName: form.name, submission },
      }).returning();
      createdContact = true;
      await syncContactIdentity({ organizationId: form.organizationId, contactId: contact.id, type: "email", rawValue: email, source: `form:${form.id}` });
      await syncContactIdentity({ organizationId: form.organizationId, contactId: contact.id, type: "phone", rawValue: phone, source: `form:${form.id}` });
      await db.insert(contactLifecycleHistory).values({ organizationId: form.organizationId, contactId: contact.id, fromStage: null, toStage: "lead", source: `form:${form.id}` });
    }

    const consentField = fields.find((field) => field.type === "checkbox" && /consent|subscribe|marketing|email updates/i.test(field.label));
    const consentGranted = consentField ? submission[consentField.id] === true : false;
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
      ...(email && consentField ? [db.insert(contactConsents).values({
        organizationId: form.organizationId,
        contactId: contact.id,
        channel: "email",
        purpose: "marketing",
        status: consentGranted ? "granted" : "denied",
        lawfulBasis: consentGranted ? "consent" : null,
        source: `form:${form.id}`,
        evidence: { formId: form.id, fieldId: consentField.id, ipHash: hashSensitive(clientIp(request)) },
      })] : []),
    ]);
    const eventId = crypto.randomUUID();
    await recordCustomerTimelineEvent({
      organizationId: form.organizationId, contactId: contact.id, sourceType: "form", sourceId: form.id,
      eventType: "form.submitted", summary: `Submitted form: ${form.name}`, idempotencyKey: `form.submitted:${form.id}:${eventId}`,
      metadata: { formId: form.id, createdContact },
    });
    await enqueueWebhookEvent(form.organizationId, "form.submitted", { contactId: contact.id, formId: form.id, createdContact, occurredAt: new Date().toISOString() });
    if (createdContact) {
      await triggerAutomation(form.organizationId, "contact.created", { contactId: contact.id, idempotencyKey: `contact.created:${contact.id}`, context: { formId: form.id } });
      await enqueueWebhookEvent(form.organizationId, "contact.created", { contactId: contact.id, formId: form.id, occurredAt: new Date().toISOString() });
    }
    return json({ ok: true, contactId: contact.id, createdContact }, createdContact ? 201 : 200);
    });
  } catch (error) {
    console.error("[forms:submit]", error);
    return json({ error: "Failed to submit form" }, 500);
  }
}

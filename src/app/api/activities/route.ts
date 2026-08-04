import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, companies, contacts, deals } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const ACTIVITY_TYPES = new Set(["call", "email", "meeting", "note", "task", "sms", "whatsapp"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asOptionalUuid(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error("Invalid linked record ID");
  return value;
}

function asOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Invalid scheduled date");
  return date;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function assertTenantLinks(orgId: string, contactId: string | null, companyId: string | null, dealId: string | null) {
  if (contactId) {
    const [record] = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId))).limit(1);
    if (!record) throw new Error("Contact not found in this organization");
  }
  if (companyId) {
    const [record] = await db.select({ id: companies.id }).from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.organizationId, orgId))).limit(1);
    if (!record) throw new Error("Company not found in this organization");
  }
  if (dealId) {
    const [record] = await db.select({ id: deals.id }).from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.organizationId, orgId))).limit(1);
    if (!record) throw new Error("Deal not found in this organization");
  }
}

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const type = request.nextUrl.searchParams.get("type");
    const contactId = request.nextUrl.searchParams.get("contactId");
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200) : 100;

    if (type && !ACTIVITY_TYPES.has(type)) {
      return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
    }
    if (contactId && !UUID_RE.test(contactId)) {
      return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
    }

    const conditions = [eq(activities.organizationId, orgId)];
    if (type) conditions.push(eq(activities.type, type as "call" | "email" | "meeting" | "note" | "task" | "sms" | "whatsapp"));
    if (contactId) conditions.push(eq(activities.contactId, contactId));

    const results = await db
      .select({
        id: activities.id,
        type: activities.type,
        subject: activities.subject,
        body: activities.body,
        contactId: activities.contactId,
        companyId: activities.companyId,
        dealId: activities.dealId,
        userId: activities.userId,
        scheduledAt: activities.scheduledAt,
        duration: activities.duration,
        outcome: activities.outcome,
        completedAt: activities.completedAt,
        metadata: activities.metadata,
        createdAt: activities.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
      })
      .from(activities)
      .leftJoin(contacts, and(eq(activities.contactId, contacts.id), eq(contacts.organizationId, orgId)))
      .where(and(...conditions))
      .orderBy(desc(activities.createdAt))
      .limit(limit);

    const shaped = results.map(({ contactFirstName, contactLastName, ...record }) => ({
      ...record,
      contactName: contactFirstName
        ? `${contactFirstName} ${contactLastName ?? ""}`.trim()
        : null,
    }));

    return NextResponse.json({ data: shaped, total: shaped.length });
  } catch (error) {
    console.error("GET /api/activities failed", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId || !userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const type = typeof body.type === "string" ? body.type : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const content = typeof body.body === "string" ? body.body.trim() : "";
    const sendEmail = body.sendEmail === true;

    if (!ACTIVITY_TYPES.has(type)) return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
    if (!subject || subject.length > 300) return NextResponse.json({ error: "Subject is required and must be 300 characters or fewer" }, { status: 400 });
    if (content.length > 100_000) return NextResponse.json({ error: "Body is too long" }, { status: 400 });
    if (sendEmail && type !== "email") return NextResponse.json({ error: "Only email activities can be delivered" }, { status: 400 });

    const contactId = asOptionalUuid(body.contactId);
    const companyId = asOptionalUuid(body.companyId);
    const dealId = asOptionalUuid(body.dealId);
    const scheduledAt = asOptionalDate(body.scheduledAt);
    const duration = body.duration === null || body.duration === undefined || body.duration === ""
      ? null
      : Number(body.duration);
    if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 86_400)) {
      return NextResponse.json({ error: "Duration must be a valid number of seconds" }, { status: 400 });
    }

    await assertTenantLinks(orgId, contactId, companyId, dealId);

    let deliveryMetadata: Record<string, unknown> = {
      direction: "outbound",
      readBy: [userId],
      delivery: sendEmail ? "sent" : "logged",
    };

    if (sendEmail) {
      if (!contactId) return NextResponse.json({ error: "A contact is required to send email" }, { status: 400 });
      if (!process.env.RESEND_API_KEY) {
        return NextResponse.json({ error: "Email delivery is not configured" }, { status: 503 });
      }

      const [contact] = await db
        .select({ firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId)))
        .limit(1);

      if (!contact?.email) return NextResponse.json({ error: "The selected contact has no email address" }, { status: 400 });

      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const recipientName = `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`;
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "NxtGen Convert <noreply@nxtgen-stack.com>",
        to: contact.email,
        subject,
        html: `<!DOCTYPE html><html><body style="margin:0;background:#0a0f1e"><div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#e2e8f0"><p style="color:#94a3b8;margin-bottom:16px">Hi ${escapeHtml(recipientName)},</p><div style="color:#cbd5e1;line-height:1.7;white-space:pre-wrap">${escapeHtml(content)}</div></div></body></html>`,
      });
      if (result.error) throw new Error(result.error.message || "Email provider rejected the message");
      deliveryMetadata = { ...deliveryMetadata, provider: "resend", providerMessageId: result.data?.id ?? null };
    }

    const suppliedMetadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {};

    const [activity] = await db.insert(activities).values({
      organizationId: orgId,
      type: type as "call" | "email" | "meeting" | "note" | "task" | "sms" | "whatsapp",
      subject,
      body: content || null,
      contactId,
      companyId,
      dealId,
      userId,
      scheduledAt,
      duration,
      outcome: typeof body.outcome === "string" ? body.outcome.trim().slice(0, 500) || null : null,
      metadata: { ...suppliedMetadata, ...deliveryMetadata },
    }).returning();

    if (contactId) {
      await db.update(contacts)
        .set({ lastContactedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId)));
    }

    return NextResponse.json({ data: activity }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create activity";
    const isClientError = /invalid|not found|required|must be|too long/i.test(message);
    console.error("POST /api/activities failed", error);
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { CampaignSendError, sendCampaign } from "@/lib/campaign-send";
import { publishQStashMessage } from "@/lib/qstash";
import { and, desc, eq, inArray } from "drizzle-orm";

const ALLOWED_STATUSES = ["draft", "scheduled", "sent"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UploadedRecipient = {
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

function normalizeUploadedRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const recipients: Array<{ email: string; firstName: string; lastName: string }> = [];
  for (const row of value as UploadedRecipient[]) {
    const email = String(row.email ?? "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      email,
      firstName: String(row.firstName ?? "Subscriber").trim() || "Subscriber",
      lastName: String(row.lastName ?? "").trim(),
    });
  }
  return recipients.slice(0, 10_000);
}

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const requestedStatus = request.nextUrl.searchParams.get("status");
    const filters = [
      eq(campaigns.organizationId, orgId),
      eq(campaigns.type, "email"),
      inArray(campaigns.status, [...ALLOWED_STATUSES]),
    ];
    if (
      requestedStatus &&
      requestedStatus !== "all" &&
      ALLOWED_STATUSES.includes(requestedStatus as (typeof ALLOWED_STATUSES)[number])
    ) {
      filters.push(eq(campaigns.status, requestedStatus as (typeof ALLOWED_STATUSES)[number]));
    }
    const data = await db
      .select()
      .from(campaigns)
      .where(and(...filters))
      .orderBy(desc(campaigns.createdAt));
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("[broadcasts:get]", error);
    return NextResponse.json({ error: "Failed to fetch broadcasts" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const subject = String(body.subject ?? "").trim();
    const fromEmail = String(body.fromEmail ?? "").trim().toLowerCase();
    const fromName = String(body.fromName ?? "").trim();
    const content = String(body.content ?? "").trim();
    const delivery = String(body.scheduleMode ?? "draft");

    if (!subject || !fromName || !fromEmail || !content) {
      return NextResponse.json(
        { error: "From name, from email, subject, and content are required" },
        { status: 400 },
      );
    }
    if (!EMAIL_PATTERN.test(fromEmail)) {
      return NextResponse.json({ error: "Enter a valid from email" }, { status: 400 });
    }
    if (!new Set(["draft", "send_now", "schedule"]).has(delivery)) {
      return NextResponse.json({ error: "Invalid delivery option" }, { status: 400 });
    }

    const uploadedRecipients = normalizeUploadedRecipients(body.uploadedRecipients);
    const audienceFilters =
      body.audienceFilters && typeof body.audienceFilters === "object"
        ? { ...(body.audienceFilters as Record<string, unknown>) }
        : {};
    if (body.audience === "upload") {
      if (uploadedRecipients.length === 0) {
        return NextResponse.json(
          { error: "Upload a CSV containing at least one valid email address" },
          { status: 400 },
        );
      }
      audienceFilters.uploadedOnly = true;
    }

    let scheduledAt: Date | null = null;
    if (delivery === "schedule") {
      scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        return NextResponse.json({ error: "Choose a valid schedule date" }, { status: 400 });
      }
      if (scheduledAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Schedule date must be in the future" }, { status: 400 });
      }
    }

    const [created] = await db
      .insert(campaigns)
      .values({
        organizationId: orgId,
        name: String(body.name ?? subject).trim() || subject,
        type: "email",
        status: delivery === "schedule" ? "scheduled" : "draft",
        subject,
        preheader: body.preheader ? String(body.preheader).trim() : null,
        fromName,
        fromEmail,
        content,
        audienceFilters,
        scheduledAt,
        settings: uploadedRecipients.length > 0 ? { uploadedRecipients } : {},
        createdById: userId || null,
      })
      .returning();

    if (delivery === "send_now") {
      const deliveryResult = await sendCampaign(orgId, created.id);
      const [sentCampaign] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, created.id), eq(campaigns.organizationId, orgId)))
        .limit(1);
      return NextResponse.json(
        { data: sentCampaign ?? created, delivery: deliveryResult },
        { status: 201 },
      );
    }

    if (delivery === "schedule" && scheduledAt) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        await db
          .update(campaigns)
          .set({ status: "draft", scheduledAt: null, updatedAt: new Date() })
          .where(and(eq(campaigns.id, created.id), eq(campaigns.organizationId, orgId)));
        return NextResponse.json(
          { error: "NEXT_PUBLIC_APP_URL is required for scheduled delivery" },
          { status: 503 },
        );
      }

      try {
        const destination = new URL(`/api/broadcasts/${created.id}/dispatch`, appUrl).toString();
        const scheduled = await publishQStashMessage({
          destination,
          body: { organizationId: orgId },
          notBefore: scheduledAt,
        });
        const settings = {
          ...(created.settings && typeof created.settings === "object" ? created.settings : {}),
          ...(uploadedRecipients.length > 0 ? { uploadedRecipients } : {}),
          qstashMessageId: scheduled.messageId ?? null,
        };
        const [updated] = await db
          .update(campaigns)
          .set({ settings, updatedAt: new Date() })
          .where(and(eq(campaigns.id, created.id), eq(campaigns.organizationId, orgId)))
          .returning();
        return NextResponse.json({ data: updated ?? created }, { status: 201 });
      } catch (error) {
        console.error("[broadcasts:schedule]", error);
        await db
          .update(campaigns)
          .set({ status: "draft", scheduledAt: null, updatedAt: new Date() })
          .where(and(eq(campaigns.id, created.id), eq(campaigns.organizationId, orgId)));
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed to schedule broadcast" },
          { status: 503 },
        );
      }
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[broadcasts:post]", error);
    const status = error instanceof CampaignSendError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create broadcast" },
      { status },
    );
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

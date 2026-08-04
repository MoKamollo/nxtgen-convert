import { enqueueWebhookEvent } from "@/lib/webhooks";
import { db } from "@/db";
import { campaigns, contactConsents, contacts, emailDeliveries, emailSuppressions } from "@/db/schema";
import { signUnsubscribe } from "@/lib/unsubscribe";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Resend } from "resend";
import { recipientTrackingId, signTracking } from "@/lib/email-tracking";
import { deliveryStatusTotals } from "@/lib/campaign-analytics";

type AudienceFilters = {
  status?: string | string[];
  source?: string | string[];
  tags?: string[];
  minScore?: number;
  uploadedOnly?: boolean;
};

type Recipient = {
  id: string | null;
  email: string;
  firstName: string;
  lastName: string | null;
  status: string | null;
  source: string | null;
  tags: string[];
  score: number | null;
};

type UploadedRecipient = {
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

export class CampaignSendError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://convert.nxtgen-stack.com";
const SENDABLE = new Set(["draft", "scheduled"]);

function matchesFilters(contact: Recipient, filters: AudienceFilters) {
  if (filters.status) {
    const allowed = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (!allowed.includes(contact.status ?? "")) return false;
  }
  if (filters.source) {
    const allowed = Array.isArray(filters.source) ? filters.source : [filters.source];
    if (!allowed.includes(contact.source ?? "")) return false;
  }
  if (filters.tags?.length && !filters.tags.some((tag) => contact.tags.includes(tag))) {
    return false;
  }
  if (filters.minScore !== undefined && (contact.score ?? 0) < filters.minScore) {
    return false;
  }
  return true;
}

function injectTracking(html: string, campaignId: string, email: string) {
  const recipientId = recipientTrackingId(email);
  const withClicks = html.replace(
    /href="(https?:\/\/[^\"]+)"/gi,
    (_, url: string) =>
      `href="${APP_URL}/api/track/click?c=${campaignId}&r=${recipientId}&url=${encodeURIComponent(url)}&sig=${encodeURIComponent(signTracking(campaignId, recipientId, url))}"`,
  );
  const pixelDestination = "open";
  const pixel = `<img src="${APP_URL}/api/track/open?c=${campaignId}&r=${recipientId}&sig=${encodeURIComponent(signTracking(campaignId, recipientId, pixelDestination))}" width="1" height="1" style="display:none" alt="" />`;
  return withClicks.includes("</body>")
    ? withClicks.replace("</body>", `${pixel}</body>`)
    : withClicks + pixel;
}

function buildEmailHtml(
  campaign: { id: string; name: string; subject: string | null; content: unknown },
  recipient: Recipient,
  deliveryId: string,
) {
  const fullName = `${recipient.firstName}${recipient.lastName ? ` ${recipient.lastName}` : ""}`;
  const unsubUrl = `${APP_URL}/api/unsubscribe?c=${campaign.id}&d=${deliveryId}&t=${encodeURIComponent(signUnsubscribe(campaign.id, deliveryId))}`;
  const rawContent = typeof campaign.content === "string" ? campaign.content : null;
  let html = rawContent?.trim()
    ? rawContent
        .replace(/\{\{name\}\}/gi, fullName)
        .replace(/\{\{first_name\}\}/gi, recipient.firstName)
        .replace(/\{\{last_name\}\}/gi, recipient.lastName ?? "")
        .replace(/\{\{unsubscribe_url\}\}/gi, unsubUrl)
    : `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0f1e"><div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;background:#0a0f1e;color:#e2e8f0"><h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:16px">${campaign.subject ?? campaign.name}</h2><p style="font-size:15px;color:#94a3b8;margin-bottom:20px">Hi ${fullName},</p><p style="font-size:14px;color:#cbd5e1;line-height:1.7">This message was sent to you as part of the <strong style="color:#f8fafc">${campaign.name}</strong> campaign.</p><hr style="border:none;border-top:1px solid #1e293b;margin:32px 0"/><p style="font-size:12px;color:#475569">You are receiving this email because you are in our system. <a href="${unsubUrl}" style="color:#6366f1;text-decoration:none">Unsubscribe</a></p></div></body></html>`;
  if (!/\{\{unsubscribe_url\}\}/i.test(rawContent ?? "") && !html.includes(unsubUrl)) {
    html += `<p style="font-size:12px;color:#64748b;margin-top:32px"><a href="${unsubUrl}">Unsubscribe</a></p>`;
  }
  return injectTracking(html, campaign.id, recipient.email);
}

function normalizeUploadedRecipients(value: unknown): Recipient[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const raw of value as UploadedRecipient[]) {
    const email = String(raw.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      id: null,
      email,
      firstName: String(raw.firstName ?? "Subscriber").trim() || "Subscriber",
      lastName: String(raw.lastName ?? "").trim() || null,
      status: null,
      source: "csv",
      tags: [],
      score: null,
    });
  }
  return recipients;
}

export async function sendCampaign(orgId: string, campaignId: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new CampaignSendError("RESEND_API_KEY is not configured", 503);

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, orgId)))
    .limit(1);
  if (!campaign) throw new CampaignSendError("Campaign not found", 404);
  if (campaign.type !== "email") throw new CampaignSendError("This campaign channel has no verified delivery connector", 409);
  if (campaign.status === "sent") {
    const stats = (campaign.stats ?? {}) as Record<string, number>;
    return {
      success: true,
      alreadySent: true,
      sent: Number(stats.sent ?? 0),
      failed: Number(stats.failed ?? 0),
      bounced: Number(stats.bounced ?? 0),
      total: Number(stats.sent ?? 0) + Number(stats.failed ?? 0),
    };
  }
  if (!SENDABLE.has(campaign.status ?? "")) {
    throw new CampaignSendError("Campaign is not in a sendable state", 400);
  }

  const contactRows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      status: contacts.status,
      source: contacts.source,
      tags: contacts.tags,
      score: contacts.score,
    })
    .from(contacts)
    .where(and(eq(contacts.organizationId, orgId), isNotNull(contacts.email)));

  const existing = contactRows
    .filter((contact): contact is typeof contact & { email: string } => Boolean(contact.email))
    .map<Recipient>((contact) => ({
      id: contact.id,
      email: contact.email.toLowerCase(),
      firstName: contact.firstName,
      lastName: contact.lastName,
      status: contact.status,
      source: contact.source,
      tags: Array.isArray(contact.tags) ? contact.tags : [],
      score: contact.score,
    }));
  const suppressionRows = await db.select({ recipientHash: emailSuppressions.recipientHash })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.organizationId, orgId), eq(emailSuppressions.channel, "email")));
  const suppressedRecipientHashes = new Set(suppressionRows.map((row) => row.recipientHash));
  const unsubscribed = new Set(
    existing.filter((contact) => contact.tags.includes("unsubscribed")).map((contact) => contact.email),
  );
  const filters = (campaign.audienceFilters ?? {}) as AudienceFilters;
  const settings = (campaign.settings ?? {}) as Record<string, unknown>;
  const purpose = String(settings.purpose ?? "marketing");
  const consentRows = purpose === "transactional" ? [] : await db.select({
    contactId: contactConsents.contactId,
    status: contactConsents.status,
    expiresAt: contactConsents.expiresAt,
    effectiveAt: contactConsents.effectiveAt,
  }).from(contactConsents).where(and(
    eq(contactConsents.organizationId, orgId),
    eq(contactConsents.channel, "email"),
    eq(contactConsents.purpose, purpose),
  )).orderBy(desc(contactConsents.effectiveAt));
  const latestConsent = new Map<string, { status: string; expiresAt: Date | null }>();
  for (const row of consentRows) if (!latestConsent.has(row.contactId)) latestConsent.set(row.contactId, { status: row.status, expiresAt: row.expiresAt });
  const eligible = existing.filter((contact) => {
    if (unsubscribed.has(contact.email) || suppressedRecipientHashes.has(recipientTrackingId(contact.email))) return false;
    if (purpose === "transactional") return true;
    if (!contact.id) return false;
    const consent = latestConsent.get(contact.id);
    return consent?.status === "granted" && (!consent.expiresAt || consent.expiresAt > new Date());
  });
  // CSV recipients are only sendable when each row carries explicit consent evidence.
  const uploadedRaw = Array.isArray(settings.uploadedRecipients) ? settings.uploadedRecipients as Array<Record<string, unknown>> : [];
  const uploaded = normalizeUploadedRecipients(uploadedRaw.filter((recipient) => purpose === "transactional" || recipient.consentStatus === "granted"))
    .filter((recipient) => !unsubscribed.has(recipient.email) && !suppressedRecipientHashes.has(recipientTrackingId(recipient.email)));

  const selected = filters.uploadedOnly
    ? uploaded
    : eligible.filter((contact) => matchesFilters(contact, filters));
  const recipientMap = new Map<string, Recipient>();
  for (const recipient of selected) recipientMap.set(recipient.email, recipient);
  const recipients = [...recipientMap.values()];
  if (recipients.length === 0) {
    throw new CampaignSendError("No contacts matched the campaign audience", 400);
  }

  const originalStatus = campaign.status ?? "draft";
  await db
    .update(campaigns)
    .set({ status: "sending", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, orgId)));

  try {
    const resend = new Resend(resendKey);
    const from = campaign.fromEmail && campaign.fromName
      ? `${campaign.fromName} <${campaign.fromEmail}>`
      : process.env.EMAIL_FROM ?? "NxtGen Convert <noreply@nxtgen-stack.com>";
    const batchSize = 10;

    for (let index = 0; index < recipients.length; index += batchSize) {
      const batch = recipients.slice(index, index + batchSize);
      await Promise.allSettled(
        batch.map(async (recipient) => {
          const recipientHash = recipientTrackingId(recipient.email);
          const idempotencyKey = `campaign:${campaignId}:recipient:${recipientHash}`;
          const inserted = await db.insert(emailDeliveries).values({
            organizationId: orgId,
            campaignId,
            contactId: recipient.id,
            recipientHash,
            provider: "resend",
            status: "pending",
            idempotencyKey,
            attemptCount: 0,
          }).onConflictDoNothing().returning({ id: emailDeliveries.id, status: emailDeliveries.status });
          const delivery = inserted[0] ?? (await db.select({ id: emailDeliveries.id, status: emailDeliveries.status })
            .from(emailDeliveries)
            .where(eq(emailDeliveries.idempotencyKey, idempotencyKey))
            .limit(1))[0];
          if (!delivery) throw new Error("Unable to create recipient delivery record");
          if (["accepted", "delivered"].includes(delivery.status)) return;

          await db.update(emailDeliveries).set({
            status: "sending",
            attemptCount: sql`${emailDeliveries.attemptCount} + 1`,
            lastError: null,
            updatedAt: new Date(),
          }).where(and(eq(emailDeliveries.id, delivery.id), eq(emailDeliveries.organizationId, orgId)));

          try {
            const result = await resend.emails.send({
              from,
              to: recipient.email,
              subject: campaign.subject ?? campaign.name,
              html: buildEmailHtml({ ...campaign, id: campaignId }, recipient, delivery.id),
              headers: { "X-NxtGen-Delivery-Id": delivery.id },
              tags: [{ name: "nxtgen_delivery_id", value: delivery.id }],
            });
            if (result.error) throw new Error(result.error.message);
            await db.update(emailDeliveries).set({
              status: "accepted",
              providerMessageId: result.data?.id ?? null,
              acceptedAt: new Date(),
              updatedAt: new Date(),
            }).where(and(eq(emailDeliveries.id, delivery.id), eq(emailDeliveries.organizationId, orgId)));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Email provider request failed";
            await db.update(emailDeliveries).set({
              status: "failed",
              lastError: message.slice(0, 2000),
              failedAt: new Date(),
              updatedAt: new Date(),
            }).where(and(eq(emailDeliveries.id, delivery.id), eq(emailDeliveries.organizationId, orgId)));
            throw error;
          }
        }),
      );
      if (index + batchSize < recipients.length) await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const deliveryCounts = await db.select({ status: emailDeliveries.status, total: count() })
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.organizationId, orgId), eq(emailDeliveries.campaignId, campaignId)))
      .groupBy(emailDeliveries.status);
    const totals = new Map<string, number>(deliveryCounts.map((row) => [String(row.status), Number(row.total)]));
    const stats = deliveryStatusTotals(totals, campaign.stats);
    const sent = stats.sent;
    const failed = stats.failed;
    await db
      .update(campaigns)
      .set({ status: "sent", stats, updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, orgId)));
    await enqueueWebhookEvent(orgId, "campaign.sent", { campaignId, stats, occurredAt: new Date().toISOString() });
    return { success: failed === 0, sent, failed, total: recipients.length };
  } catch (error) {
    await db
      .update(campaigns)
      .set({ status: originalStatus as "draft" | "scheduled", sentAt: null, updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, orgId)));
    throw error;
  }
}

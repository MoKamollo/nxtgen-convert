import { db } from "@/db";
import { campaigns, contacts } from "@/db/schema";
import { makeUnsubToken } from "@/app/api/unsubscribe/route";
import { and, eq, isNotNull } from "drizzle-orm";
import { Resend } from "resend";

type AudienceFilters = {
  status?: string | string[];
  source?: string | string[];
  tags?: string[];
  minScore?: number;
  uploadedOnly?: boolean;
};

type Recipient = {
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

function injectTracking(html: string, campaignId: string) {
  const withClicks = html.replace(
    /href="(https?:\/\/[^\"]+)"/gi,
    (_, url: string) =>
      `href="${APP_URL}/api/track/click?c=${campaignId}&url=${encodeURIComponent(url)}"`,
  );
  const pixel = `<img src="${APP_URL}/api/track/open?c=${campaignId}" width="1" height="1" style="display:none" alt="" />`;
  return withClicks.includes("</body>")
    ? withClicks.replace("</body>", `${pixel}</body>`)
    : withClicks + pixel;
}

function buildEmailHtml(
  campaign: { id: string; name: string; subject: string | null; content: unknown },
  recipient: Recipient,
) {
  const fullName = `${recipient.firstName}${recipient.lastName ? ` ${recipient.lastName}` : ""}`;
  const unsubToken = makeUnsubToken(campaign.id, recipient.email.toLowerCase());
  const unsubUrl = `${APP_URL}/api/unsubscribe?c=${campaign.id}&e=${encodeURIComponent(recipient.email)}&t=${unsubToken}`;
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
  return injectTracking(html, campaign.id);
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
  if (campaign.status === "sent") {
    const stats = (campaign.stats ?? {}) as Record<string, number>;
    return {
      success: true,
      alreadySent: true,
      sent: Number(stats.sent ?? 0),
      bounced: Number(stats.bounced ?? 0),
      total: Number(stats.sent ?? 0) + Number(stats.bounced ?? 0),
    };
  }
  if (!SENDABLE.has(campaign.status ?? "")) {
    throw new CampaignSendError("Campaign is not in a sendable state", 400);
  }

  const contactRows = await db
    .select({
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
      email: contact.email.toLowerCase(),
      firstName: contact.firstName,
      lastName: contact.lastName,
      status: contact.status,
      source: contact.source,
      tags: Array.isArray(contact.tags) ? contact.tags : [],
      score: contact.score,
    }));
  const unsubscribed = new Set(
    existing.filter((contact) => contact.tags.includes("unsubscribed")).map((contact) => contact.email),
  );
  const eligible = existing.filter((contact) => !unsubscribed.has(contact.email));
  const filters = (campaign.audienceFilters ?? {}) as AudienceFilters;
  const settings = (campaign.settings ?? {}) as Record<string, unknown>;
  const uploaded = normalizeUploadedRecipients(settings.uploadedRecipients).filter(
    (recipient) => !unsubscribed.has(recipient.email),
  );

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
    let sent = 0;
    let bounced = 0;
    const batchSize = 10;

    for (let index = 0; index < recipients.length; index += batchSize) {
      const batch = recipients.slice(index, index + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          const result = await resend.emails.send({
            from,
            to: recipient.email,
            subject: campaign.subject ?? campaign.name,
            html: buildEmailHtml({ ...campaign, id: campaignId }, recipient),
          });
          if (result.error) throw new Error(result.error.message);
          return result.data;
        }),
      );
      results.forEach((result, resultIndex) => {
        if (result.status === "fulfilled") sent += 1;
        else {
          bounced += 1;
          console.error(
            `[campaign-send] failed for ${batch[resultIndex]?.email}:`,
            result.reason,
          );
        }
      });
      if (index + batchSize < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const previous = (campaign.stats ?? {}) as Record<string, number>;
    const stats = {
      sent,
      delivered: sent,
      opened: Number(previous.opened ?? 0),
      clicked: Number(previous.clicked ?? 0),
      bounced,
      unsubscribed: Number(previous.unsubscribed ?? 0),
      revenue: Number(previous.revenue ?? 0),
    };
    await db
      .update(campaigns)
      .set({ status: "sent", stats, updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, orgId)));
    return { success: true, sent, bounced, total: recipients.length };
  } catch (error) {
    await db
      .update(campaigns)
      .set({ status: originalStatus as "draft" | "scheduled", sentAt: null, updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, orgId)));
    throw error;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, contacts } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

type AudienceFilters = {
  status?: string | string[];
  source?: string | string[];
  tags?: string[];
  minScore?: number;
};

function matchesFilters(contact: { status: string | null; source: string | null; tags: unknown; score: number | null }, filters: AudienceFilters): boolean {
  if (filters.status) {
    const allowed = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (!allowed.includes(contact.status ?? "")) return false;
  }
  if (filters.source) {
    const allowed = Array.isArray(filters.source) ? filters.source : [filters.source];
    if (!allowed.includes(contact.source ?? "")) return false;
  }
  if (filters.tags && filters.tags.length > 0) {
    const contactTags = Array.isArray(contact.tags) ? contact.tags as string[] : [];
    if (!filters.tags.some((t) => contactTags.includes(t))) return false;
  }
  if (filters.minScore !== undefined && (contact.score ?? 0) < filters.minScore) return false;
  return true;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://convert.nxtgen-stack.com";

function injectTracking(html: string, campaignId: string): string {
  // Wrap all href links with click tracking redirect
  const withClicks = html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_, url) => `href="${APP_URL}/api/track/click?c=${campaignId}&url=${encodeURIComponent(url)}"`
  );
  // Inject open-tracking pixel just before </body>
  const pixel = `<img src="${APP_URL}/api/track/open?c=${campaignId}" width="1" height="1" style="display:none" alt="" />`;
  return withClicks.includes("</body>")
    ? withClicks.replace("</body>", `${pixel}</body>`)
    : withClicks + pixel;
}

function buildEmailHtml(campaign: { id: string; name: string; subject: string | null; content: unknown }, firstName: string, lastName: string | null): string {
  const fullName = `${firstName}${lastName ? " " + lastName : ""}`;
  // Use campaign content if it's a stored HTML string (H10b)
  const rawContent = typeof campaign.content === "string" ? campaign.content : null;
  let html: string;
  if (rawContent?.trim()) {
    html = rawContent
      .replace(/\{\{name\}\}/gi, fullName)
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{last_name\}\}/gi, lastName ?? "");
  } else {
    html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0f1e">
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;background:#0a0f1e;color:#e2e8f0">
  <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:16px">${campaign.subject ?? campaign.name}</h2>
  <p style="font-size:15px;color:#94a3b8;margin-bottom:20px">Hi ${fullName},</p>
  <p style="font-size:14px;color:#cbd5e1;line-height:1.7">This message was sent to you as part of the <strong style="color:#f8fafc">${campaign.name}</strong> campaign.</p>
  <hr style="border:none;border-top:1px solid #1e293b;margin:32px 0"/>
  <p style="font-size:12px;color:#475569">You're receiving this email because you're in our system.
    <a href="#" style="color:#6366f1;text-decoration:none">Unsubscribe</a>
  </p>
</div></body></html>`;
  }
  return injectTracking(html, campaign.id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, orgId)))
      .limit(1);

    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (!["draft", "scheduled"].includes(campaign.status ?? "")) {
      return NextResponse.json({ error: "Campaign is not in a sendable state" }, { status: 400 });
    }

    // Fetch all contacts with email for this org
    const allContacts = await db
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

    // Apply audienceFilters (H10a)
    const filters = (campaign.audienceFilters ?? {}) as AudienceFilters;
    const hasFilters = Object.keys(filters).length > 0;
    const recipients = hasFilters
      ? allContacts.filter((c) => matchesFilters(c, filters))
      : allContacts;

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No contacts matched the campaign audience filters" }, { status: 400 });
    }

    await db.update(campaigns).set({
      status: "sending", sentAt: new Date(), updatedAt: new Date(),
    }).where(eq(campaigns.id, id));

    let sent = 0;
    let bounced = 0;

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);
      const from = campaign.fromEmail && campaign.fromName
        ? `${campaign.fromName} <${campaign.fromEmail}>`
        : process.env.EMAIL_FROM ?? "NxtGen Convert <noreply@nxtgen-stack.com>";

      for (const r of recipients) {
        if (!r.email) continue;
        try {
          await resend.emails.send({
            from,
            to: r.email,
            subject: campaign.subject ?? campaign.name,
            html: buildEmailHtml({ ...campaign, id }, r.firstName, r.lastName),
          });
          sent++;
        } catch { bounced++; }
      }
    } else {
      sent = recipients.length;
    }

    // Preserve opened/clicked — they accumulate as recipients open/click after delivery
    const prevStats = (campaign.stats ?? {}) as Record<string, number>;
    const stats = { sent, delivered: sent, opened: prevStats.opened ?? 0, clicked: prevStats.clicked ?? 0, bounced, unsubscribed: 0, revenue: 0 };
    await db.update(campaigns).set({
      status: "sent", stats, updatedAt: new Date(),
    }).where(eq(campaigns.id, id));

    return NextResponse.json({ success: true, sent, bounced, total: recipients.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send campaign" }, { status: 500 });
  }
}

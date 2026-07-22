import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, contacts } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

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

    const recipients = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.organizationId, orgId), isNotNull(contacts.email)));

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No contacts with email addresses found" }, { status: 400 });
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
            html: buildHtml(campaign.name, campaign.subject, r.firstName, r.lastName),
          });
          sent++;
        } catch { bounced++; }
      }
    } else {
      sent = recipients.length;
    }

    const stats = { sent, delivered: sent, opened: 0, clicked: 0, bounced, unsubscribed: 0, revenue: 0 };
    await db.update(campaigns).set({
      status: "sent", stats, updatedAt: new Date(),
    }).where(eq(campaigns.id, id));

    return NextResponse.json({ success: true, sent, bounced, total: recipients.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send campaign" }, { status: 500 });
  }
}

function buildHtml(name: string, subject: string | null, firstName: string, lastName: string | null) {
  const fullName = `${firstName}${lastName ? " " + lastName : ""}`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0f1e">
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;background:#0a0f1e;color:#e2e8f0">
  <h2 style="font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:16px">${subject ?? name}</h2>
  <p style="font-size:15px;color:#94a3b8;margin-bottom:20px">Hi ${fullName},</p>
  <p style="font-size:14px;color:#cbd5e1;line-height:1.7">This message was sent to you as part of the <strong style="color:#f8fafc">${name}</strong> campaign.</p>
  <hr style="border:none;border-top:1px solid #1e293b;margin:32px 0"/>
  <p style="font-size:12px;color:#475569">You're receiving this email because you're in our system.
    <a href="#" style="color:#6366f1;text-decoration:none">Unsubscribe</a>
  </p>
</div></body></html>`;
}

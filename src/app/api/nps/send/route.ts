import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { npsResponses, contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  if (!body.contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const [contact] = await db
    .select({ firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.id, body.contactId), eq(contacts.organizationId, orgId)))
    .limit(1);

  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "Contact has no email" }, { status: 400 });

  const token = randomUUID();
  await db.insert(npsResponses).values({
    organizationId: orgId,
    contactId: body.contactId,
    token,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://convert.nxtgen-stack.com";
  const surveyUrl = `${appUrl}/survey/nps/${token}`;

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "NxtGen Convert <noreply@nxtgen-stack.com>",
        to: contact.email,
        subject: "Quick question — how likely are you to recommend us?",
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quick question from NxtGen Convert</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:40px 16px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:32px 40px;text-align:center">
          <img src="${process.env.NEXT_PUBLIC_APP_URL ?? "https://convert.nxtgen-stack.com"}/nxtgen-logo.png" width="140" alt="NxtGen" style="display:block;margin:0 auto;height:auto">
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 32px">
          <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.3">Hi ${contact.firstName},</h1>
          <p style="color:#475569;font-size:15px;line-height:1.8;margin:0 0 8px">We'd love to hear how we're doing.</p>
          <p style="color:#475569;font-size:15px;line-height:1.8;margin:0 0 32px">On a scale of <strong>0 to 10</strong>, how likely are you to recommend <strong style="color:#0f172a">NxtGen Convert</strong> to a friend or colleague?</p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="padding-bottom:32px">
                <a href="${surveyUrl}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;border-radius:10px;letter-spacing:0.2px">Share My Feedback &rarr;</a>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0;padding-top:24px">
            <tr>
              <td style="text-align:center">
                <p style="color:#94a3b8;font-size:12px;margin:0">Takes less than 30 seconds &nbsp;&middot;&nbsp; No login required</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="color:#94a3b8;font-size:11px;margin:0">&copy; ${new Date().getFullYear()} NxtGen Stack &mdash; All rights reserved</p>
          <p style="color:#cbd5e1;font-size:11px;margin:6px 0 0">You received this because your feedback matters to us.</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`,
      });
    } catch (err) { console.error("[nps/send] email failed:", err); }
  }

  return NextResponse.json({ ok: true, token, surveyUrl });
}

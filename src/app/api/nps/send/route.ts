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
        html: `<!DOCTYPE html><html><body style="margin:0;background:#0a0f1e">
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#e2e8f0">
  <h2 style="color:#fff;margin-bottom:8px">Hi ${contact.firstName},</h2>
  <p style="color:#94a3b8;line-height:1.7">We'd love to know how we're doing. On a scale of 0–10, how likely are you to recommend us to a friend or colleague?</p>
  <a href="${surveyUrl}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Share My Feedback →</a>
  <p style="color:#475569;font-size:12px;margin-top:32px">This takes less than 30 seconds.</p>
</div></body></html>`,
      });
    } catch { /* email failure doesn't block token creation */ }
  }

  return NextResponse.json({ ok: true, token, surveyUrl });
}

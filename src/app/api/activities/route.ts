import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const results = await db.select().from(activities)
      .where(eq(activities.organizationId, orgId))
      .orderBy(desc(activities.createdAt))
      .limit(50);
    return NextResponse.json({ data: results, total: results.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orgId = request.headers.get("x-tenant-id");
    if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const [activity] = await db.insert(activities).values({
      organizationId: orgId,
      type: body.type,
      subject: body.subject,
      body: body.body,
      contactId: body.contactId,
      dealId: body.dealId,
      userId: body.userId,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      duration: body.duration,
      outcome: body.outcome,
    }).returning();

    // Optionally send a real email via Resend (only when sendEmail flag is set)
    if (body.sendEmail && body.type === "email" && body.contactId && process.env.RESEND_API_KEY) {
      const [contact] = await db
        .select({ firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
        .from(contacts)
        .where(eq(contacts.id, body.contactId))
        .limit(1);

      if (contact?.email) {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: process.env.EMAIL_FROM ?? "NxtGen Convert <noreply@nxtgen-stack.com>",
            to: contact.email,
            subject: body.subject,
            html: `<!DOCTYPE html><html><body style="margin:0;background:#0a0f1e">
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#e2e8f0">
  <p style="color:#94a3b8;margin-bottom:16px">Hi ${contact.firstName}${contact.lastName ? " " + contact.lastName : ""},</p>
  <div style="color:#cbd5e1;line-height:1.7;white-space:pre-wrap">${body.body ?? ""}</div>
</div></body></html>`,
          });
        } catch { /* email failure doesn't block activity creation */ }
      }
    }

    return NextResponse.json({ data: activity }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create activity" }, { status: 500 });
  }
}

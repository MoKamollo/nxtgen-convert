import { db } from "@/db";
import { workflows, contacts, activities } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type AutoStep = { type: string; config: Record<string, unknown> };
type ActivityType = "email" | "call" | "meeting" | "note" | "task" | "sms" | "whatsapp";

export async function triggerAutomation(
  orgId: string,
  event: string,
  opts: { contactId?: string; dealId?: string } = {}
) {
  try {
    const allActive = await db.select().from(workflows)
      .where(and(eq(workflows.organizationId, orgId), eq(workflows.status, "active")));

    const matching = allActive.filter(wf => {
      const t = wf.trigger as Record<string, string>;
      return t?.event === event;
    });

    for (const wf of matching) {
      const steps = (wf.steps ?? []) as AutoStep[];

      for (const step of steps) {
        if (step.type === "wait") break; // no scheduled execution in serverless

        if (step.type === "create_activity" && opts.contactId) {
          await db.insert(activities).values({
            organizationId: orgId,
            type: ((step.config.type as string) ?? "note") as ActivityType,
            subject: (step.config.subject as string) ?? `Automated: ${wf.name}`,
            body: (step.config.body as string) ?? null,
            contactId: opts.contactId,
            dealId: opts.dealId ?? null,
            metadata: { automated: true, workflowId: wf.id },
          });
        }

        if (step.type === "send_email" && opts.contactId) {
          const [contact] = await db
            .select({ firstName: contacts.firstName, email: contacts.email })
            .from(contacts)
            .where(eq(contacts.id, opts.contactId))
            .limit(1);

          if (contact?.email && process.env.RESEND_API_KEY) {
            try {
              const { Resend } = await import("resend");
              const resend = new Resend(process.env.RESEND_API_KEY);
              await resend.emails.send({
                from: process.env.EMAIL_FROM ?? "NxtGen Convert <noreply@nxtgen-stack.com>",
                to: contact.email,
                subject: (step.config.subject as string) ?? wf.name,
                html: `<!DOCTYPE html><html><body style="margin:0;background:#0a0f1e">
                  <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#e2e8f0">
                    <h2 style="color:#f8fafc;font-size:20px">${step.config.subject ?? wf.name}</h2>
                    <p style="color:#94a3b8;margin-top:12px">Hi ${contact.firstName},</p>
                    <div style="color:#cbd5e1;margin-top:12px;line-height:1.7">${step.config.body ?? ""}</div>
                  </div></body></html>`,
              });
            } catch { /* email failure never blocks automation */ }
          }
        }

        if (step.type === "update_contact" && opts.contactId) {
          const updates: Record<string, unknown> = {};
          if ("status" in step.config) updates.status = step.config.status;
          if ("score" in step.config) updates.score = step.config.score;
          if (Object.keys(updates).length > 0) {
            await db.update(contacts)
              .set({ ...updates, updatedAt: new Date() })
              .where(and(eq(contacts.id, opts.contactId), eq(contacts.organizationId, orgId)));
          }
        }
      }

      await db.update(workflows)
        .set({ enrolledCount: (wf.enrolledCount ?? 0) + 1, updatedAt: new Date() })
        .where(eq(workflows.id, wf.id));
    }
  } catch (err) {
    console.error("[automation]", err);
  }
}

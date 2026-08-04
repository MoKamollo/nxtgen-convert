import { db } from "@/db";
import { workflows, contacts, activities, workflowEnrollments } from "@/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";

type AutoStep = { type: string; config: Record<string, unknown> };
type ActivityType = "email" | "call" | "meeting" | "note" | "task" | "sms" | "whatsapp";

async function executeStep(
  step: AutoStep,
  orgId: string,
  contactId: string | undefined,
  dealId: string | undefined,
  wfId: string,
  wfName: string
) {
  if (step.type === "create_activity" && contactId) {
    await db.insert(activities).values({
      organizationId: orgId,
      type: ((step.config.type as string) ?? "note") as ActivityType,
      subject: (step.config.subject as string) ?? `Automated: ${wfName}`,
      body: (step.config.body as string) ?? null,
      contactId,
      dealId: dealId ?? null,
      metadata: { automated: true, workflowId: wfId },
    });
  }

  if (step.type === "send_email" && contactId) {
    const [contact] = await db
      .select({ firstName: contacts.firstName, email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    if (contact?.email && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "NxtGen Convergence <noreply@nxtgen-stack.com>",
          to: contact.email,
          subject: (step.config.subject as string) ?? wfName,
          html: `<!DOCTYPE html><html><body style="margin:0;background:#0a0f1e">
            <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;color:#e2e8f0">
              <h2 style="color:#f8fafc;font-size:20px">${step.config.subject ?? wfName}</h2>
              <p style="color:#94a3b8;margin-top:12px">Hi ${contact.firstName},</p>
              <div style="color:#cbd5e1;margin-top:12px;line-height:1.7">${step.config.body ?? ""}</div>
            </div></body></html>`,
        });
      } catch { /* email failure never blocks automation */ }
    }
  }

  if (step.type === "update_contact" && contactId) {
    const updates: Record<string, unknown> = {};
    if ("status" in step.config) updates.status = step.config.status;
    if ("score" in step.config) updates.score = step.config.score;
    if (Object.keys(updates).length > 0) {
      await db.update(contacts)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId)));
    }
  }
}

function waitDurationMs(config: Record<string, unknown>): number {
  const amount = Number(config.amount ?? 1);
  const unit = (config.unit as string) ?? "hours";
  const map: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
  return amount * (map[unit] ?? 3_600_000);
}

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
      let hitWait = false;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.type === "wait") {
          const resumeAt = new Date(Date.now() + waitDurationMs(step.config));
          await db.insert(workflowEnrollments).values({
            organizationId: orgId,
            workflowId: wf.id,
            contactId: opts.contactId ?? null,
            dealId: opts.dealId ?? null,
            nextStepIndex: i + 1,
            resumeAt,
            status: "pending",
          });
          hitWait = true;
          break;
        }
        await executeStep(step, orgId, opts.contactId, opts.dealId, wf.id, wf.name);
      }

      const newEnrolled = (wf.enrolledCount ?? 0) + 1;
      const newCompleted = hitWait ? (wf.completedCount ?? 0) : (wf.completedCount ?? 0) + 1;
      const conversionRate = (newEnrolled > 0 ? Math.round((newCompleted / newEnrolled) * 100 * 10) / 10 : 0).toFixed(2);

      await db.update(workflows)
        .set({ enrolledCount: newEnrolled, completedCount: newCompleted, conversionRate, updatedAt: new Date() })
        .where(eq(workflows.id, wf.id));
    }
  } catch (err) {
    console.error("[automation]", err);
  }
}

export async function processPendingEnrollments() {
  const pending = await db.select().from(workflowEnrollments)
    .where(and(eq(workflowEnrollments.status, "pending"), lte(workflowEnrollments.resumeAt, sql`now()`)));

  for (const enrollment of pending) {
    try {
      const [wf] = await db.select().from(workflows).where(eq(workflows.id, enrollment.workflowId)).limit(1);
      if (!wf || wf.status !== "active") {
        await db.update(workflowEnrollments).set({ status: "skipped" }).where(eq(workflowEnrollments.id, enrollment.id));
        continue;
      }

      const steps = (wf.steps ?? []) as AutoStep[];
      let hitNextWait = false;

      for (let i = enrollment.nextStepIndex; i < steps.length; i++) {
        const step = steps[i];
        if (step.type === "wait") {
          const resumeAt = new Date(Date.now() + waitDurationMs(step.config));
          await db.update(workflowEnrollments)
            .set({ nextStepIndex: i + 1, resumeAt, status: "pending" })
            .where(eq(workflowEnrollments.id, enrollment.id));
          hitNextWait = true;
          break;
        }
        await executeStep(step, enrollment.organizationId, enrollment.contactId ?? undefined, enrollment.dealId ?? undefined, wf.id, wf.name);
      }

      if (!hitNextWait) {
        await db.update(workflowEnrollments).set({ status: "completed" }).where(eq(workflowEnrollments.id, enrollment.id));
        await db.update(workflows)
          .set({ completedCount: sql`${workflows.completedCount} + 1`, updatedAt: new Date() })
          .where(eq(workflows.id, wf.id));
      }
    } catch (err) {
      console.error("[automation cron]", enrollment.id, err);
      await db.update(workflowEnrollments).set({ status: "failed" }).where(eq(workflowEnrollments.id, enrollment.id));
    }
  }

  return pending.length;
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { automationLogs, workflows } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const CATALOG = [
  ["contact.created", "New contact added to CRM"], ["contact.status_changed", "Contact status changed"], ["deal.created", "New deal created"],
  ["deal.stage_changed", "Deal moved to a new stage"], ["deal.won", "Deal marked as closed won"], ["deal.lost", "Deal marked as closed lost"],
  ["tag.added", "Tag added to a contact"], ["form.submitted", "Marketing form submitted"], ["payment.received", "Payment recorded"],
  ["ticket.created", "Support ticket opened"], ["ticket.resolved", "Support ticket resolved"], ["nps.submitted", "NPS response received"], ["manual", "Manually triggered"],
];

export async function GET(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const [workflowRows, activity] = await Promise.all([
      db.select({ status: workflows.status, trigger: workflows.trigger }).from(workflows).where(eq(workflows.organizationId, orgId)),
      db.select().from(automationLogs).where(eq(automationLogs.organizationId, orgId)).orderBy(desc(automationLogs.triggeredAt)).limit(20),
    ]);
    const data = CATALOG.map(([event, description]) => ({ event, description, activeWorkflowCount: workflowRows.filter(w => w.status === "active" && String((w.trigger as Record<string, unknown> | null)?.event ?? "") === event).length }));
    return NextResponse.json({ data, activity });
  } catch {
    return NextResponse.json({ error: "Failed to fetch automation triggers" }, { status: 500 });
  }
}

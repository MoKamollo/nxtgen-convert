import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { automationLogs, workflows } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { SUPPORTED_TRIGGER_EVENTS } from "@/lib/workflow-validation";

const DESCRIPTIONS: Record<string, string> = {
  "contact.created": "Emitted after a contact is created successfully.",
  "deal.stage_changed": "Emitted after a deal stage changes successfully.",
  manual: "Emitted only through an authorized manual trigger request.",
};

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const [workflowRows, activity] = await Promise.all([
    db.select({ status: workflows.status, trigger: workflows.trigger }).from(workflows).where(eq(workflows.organizationId, orgId)),
    db.select().from(automationLogs).where(eq(automationLogs.organizationId, orgId)).orderBy(desc(automationLogs.triggeredAt)).limit(50),
  ]);
  const data = SUPPORTED_TRIGGER_EVENTS.map((event) => ({ event, description: DESCRIPTIONS[event], runtimeStatus: "implemented", activeWorkflowCount: workflowRows.filter((workflow) => workflow.status === "active" && String((workflow.trigger as Record<string, unknown>)?.event ?? "") === event).length }));
  return NextResponse.json({ data, activity });
}

export const GET = withApiGuard(GETHandler);

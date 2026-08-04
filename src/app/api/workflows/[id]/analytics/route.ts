import { and, asc, count, countDistinct, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  workflowEnrollments,
  workflowExperimentAssignments,
  workflowGoalEvents,
  workflowStepExecutions,
  workflows,
} from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

async function GETHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id: workflowId } = await params;
  const [workflow] = await db.select({ id: workflows.id, name: workflows.name }).from(workflows).where(and(
    eq(workflows.id, workflowId),
    eq(workflows.organizationId, organizationId),
  )).limit(1);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  const [statusRows, goalRows, experimentRows, stepRows] = await Promise.all([
    db.select({ status: workflowEnrollments.status, total: count() }).from(workflowEnrollments).where(and(
      eq(workflowEnrollments.organizationId, organizationId),
      eq(workflowEnrollments.workflowId, workflowId),
    )).groupBy(workflowEnrollments.status),
    db.select({
      key: workflowGoalEvents.goalKey,
      name: workflowGoalEvents.goalName,
      enrollments: countDistinct(workflowGoalEvents.enrollmentId),
    }).from(workflowGoalEvents).where(and(
      eq(workflowGoalEvents.organizationId, organizationId),
      eq(workflowGoalEvents.workflowId, workflowId),
    )).groupBy(workflowGoalEvents.goalKey, workflowGoalEvents.goalName).orderBy(asc(workflowGoalEvents.goalKey)),
    db.select({
      experimentKey: workflowExperimentAssignments.experimentKey,
      variantId: workflowExperimentAssignments.variantId,
      variantName: workflowExperimentAssignments.variantName,
      assignments: countDistinct(workflowExperimentAssignments.enrollmentId),
    }).from(workflowExperimentAssignments).where(and(
      eq(workflowExperimentAssignments.organizationId, organizationId),
      eq(workflowExperimentAssignments.workflowId, workflowId),
    )).groupBy(
      workflowExperimentAssignments.experimentKey,
      workflowExperimentAssignments.variantId,
      workflowExperimentAssignments.variantName,
    ).orderBy(asc(workflowExperimentAssignments.experimentKey), asc(workflowExperimentAssignments.variantId)),
    db.select({
      stepIndex: workflowStepExecutions.stepIndex,
      stepType: workflowStepExecutions.stepType,
      status: workflowStepExecutions.status,
      executions: count(),
    }).from(workflowStepExecutions).where(and(
      eq(workflowStepExecutions.organizationId, organizationId),
      eq(workflowStepExecutions.workflowId, workflowId),
    )).groupBy(workflowStepExecutions.stepIndex, workflowStepExecutions.stepType, workflowStepExecutions.status)
      .orderBy(asc(workflowStepExecutions.stepIndex), asc(workflowStepExecutions.status)),
  ]);

  const statuses = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.total)]));
  const enrolled = Object.values(statuses).reduce((sum, value) => sum + value, 0);
  const completed = statuses.completed ?? 0;
  const exited = statuses.exited ?? 0;
  const failed = (statuses.dead_letter ?? 0) + (statuses.skipped ?? 0);
  const active = (statuses.pending ?? 0) + (statuses.processing ?? 0) + (statuses.retrying ?? 0);
  const goals = goalRows.map((goal) => ({
    key: goal.key,
    name: goal.name,
    enrollments: Number(goal.enrollments),
    attainmentRate: enrolled > 0 ? Number(goal.enrollments) / enrolled * 100 : 0,
  }));

  return NextResponse.json({
    data: {
      workflow,
      totals: {
        enrolled,
        completed,
        exited,
        active,
        failed,
        completionRate: enrolled > 0 ? completed / enrolled * 100 : 0,
      },
      statuses,
      goals,
      experiments: experimentRows.map((row) => ({ ...row, assignments: Number(row.assignments) })),
      steps: stepRows.map((row) => ({ ...row, executions: Number(row.executions) })),
      methodology: "All metrics are calculated from persisted enrollment, step execution, goal, and experiment records. No synthetic time series or predicted conversions are included.",
    },
  });
}

export const GET = withApiGuard(GETHandler);

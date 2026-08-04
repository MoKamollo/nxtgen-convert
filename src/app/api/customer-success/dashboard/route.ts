import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  contacts,
  customerHealthAssessments,
  customerRenewals,
  customerRiskAlerts,
  customerSuccessMilestones,
  customerSuccessPlans,
  users,
} from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

export const GET = withApiGuard(async (request: NextRequest) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const now = new Date();
  const next90Days = new Date(now.getTime() + 90 * 86_400_000);

  const [assessmentRows, alerts, renewals, plans, milestones] = await Promise.all([
    db.select({
      id: customerHealthAssessments.id,
      contactId: customerHealthAssessments.contactId,
      score: customerHealthAssessments.score,
      status: customerHealthAssessments.status,
      createdAt: customerHealthAssessments.createdAt,
    }).from(customerHealthAssessments).where(eq(customerHealthAssessments.organizationId, organizationId)).orderBy(desc(customerHealthAssessments.createdAt)).limit(1000),
    db.select({
      id: customerRiskAlerts.id,
      contactId: customerRiskAlerts.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      severity: customerRiskAlerts.severity,
      status: customerRiskAlerts.status,
      title: customerRiskAlerts.title,
      description: customerRiskAlerts.description,
      createdAt: customerRiskAlerts.createdAt,
    }).from(customerRiskAlerts).innerJoin(contacts, and(eq(contacts.id, customerRiskAlerts.contactId), eq(contacts.organizationId, organizationId)))
      .where(and(eq(customerRiskAlerts.organizationId, organizationId), inArray(customerRiskAlerts.status, ["open", "acknowledged"])))
      .orderBy(desc(customerRiskAlerts.createdAt)).limit(100),
    db.select({
      id: customerRenewals.id,
      contactId: customerRenewals.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      renewalDate: customerRenewals.renewalDate,
      amount: customerRenewals.amount,
      currency: customerRenewals.currency,
      status: customerRenewals.status,
      riskLevel: customerRenewals.riskLevel,
      ownerName: users.name,
    }).from(customerRenewals)
      .innerJoin(contacts, and(eq(contacts.id, customerRenewals.contactId), eq(contacts.organizationId, organizationId)))
      .leftJoin(users, eq(users.id, customerRenewals.ownerUserId))
      .where(and(eq(customerRenewals.organizationId, organizationId), inArray(customerRenewals.status, ["upcoming", "in_review"]), gte(customerRenewals.renewalDate, now), lte(customerRenewals.renewalDate, next90Days)))
      .orderBy(asc(customerRenewals.renewalDate)).limit(100),
    db.select({
      id: customerSuccessPlans.id,
      contactId: customerSuccessPlans.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      name: customerSuccessPlans.name,
      status: customerSuccessPlans.status,
      targetDate: customerSuccessPlans.targetDate,
      ownerName: users.name,
      updatedAt: customerSuccessPlans.updatedAt,
    }).from(customerSuccessPlans)
      .innerJoin(contacts, and(eq(contacts.id, customerSuccessPlans.contactId), eq(contacts.organizationId, organizationId)))
      .leftJoin(users, eq(users.id, customerSuccessPlans.ownerUserId))
      .where(and(eq(customerSuccessPlans.organizationId, organizationId), inArray(customerSuccessPlans.status, ["active", "on_hold"])))
      .orderBy(desc(customerSuccessPlans.updatedAt)).limit(100),
    db.select({
      id: customerSuccessMilestones.id,
      planId: customerSuccessMilestones.planId,
      title: customerSuccessMilestones.title,
      status: customerSuccessMilestones.status,
      dueAt: customerSuccessMilestones.dueAt,
    }).from(customerSuccessMilestones)
      .where(and(eq(customerSuccessMilestones.organizationId, organizationId), inArray(customerSuccessMilestones.status, ["pending", "in_progress", "blocked"]), lte(customerSuccessMilestones.dueAt, next90Days)))
      .orderBy(asc(customerSuccessMilestones.dueAt)).limit(200),
  ]);

  const latestHealth = new Map<string, typeof assessmentRows[number]>();
  for (const row of assessmentRows) if (!latestHealth.has(row.contactId)) latestHealth.set(row.contactId, row);
  const health = [...latestHealth.values()];
  return NextResponse.json({
    data: {
      summary: {
        assessedCustomers: health.length,
        healthy: health.filter((row) => row.status === "healthy").length,
        watch: health.filter((row) => row.status === "watch").length,
        atRisk: health.filter((row) => row.status === "at_risk").length,
        insufficientData: health.filter((row) => row.status === "insufficient_data").length,
        openAlerts: alerts.length,
        renewalsDue90Days: renewals.length,
        activePlans: plans.filter((row) => row.status === "active").length,
        overdueMilestones: milestones.filter((row) => row.dueAt && row.dueAt < now).length,
      },
      alerts,
      renewals,
      plans,
      milestones,
      health,
      methodology: "Health is the latest deterministic rules assessment per customer. Missing evidence is not scored. Renewal and milestone counts are based on stored due dates.",
    },
  });
});

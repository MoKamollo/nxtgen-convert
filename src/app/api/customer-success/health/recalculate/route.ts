import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  activities,
  analyticsEvents,
  contacts,
  customerHealthAssessments,
  customerRiskAlerts,
  emailDeliveries,
  npsResponses,
  subscriptions,
  tickets,
} from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { calculateCustomerHealth } from "@/lib/customer-health";
import { recordCustomerTimelineEvent } from "@/lib/customer-timeline";
import { enqueueWebhookEvent } from "@/lib/webhooks";

export const POST = withApiGuard(async (request: NextRequest) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const actorUserId = request.headers.get("x-user-id");
  const body = await request.json();
  const contactId = String(body.contactId ?? "");
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  const [contact] = await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId), isNull(contacts.archivedAt))).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const evidenceFrom = new Date(Date.now() - 90 * 86_400_000);
  const [subscriptionRows, activityRows, behaviorRows, ticketRows, npsRows, emailRows] = await Promise.all([
    db.select({ status: subscriptions.status }).from(subscriptions).where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.contactId, contactId))),
    db.select({ createdAt: activities.createdAt }).from(activities).where(and(eq(activities.organizationId, organizationId), eq(activities.contactId, contactId), gte(activities.createdAt, evidenceFrom))).orderBy(desc(activities.createdAt)).limit(1),
    db.select({ createdAt: analyticsEvents.createdAt }).from(analyticsEvents).where(and(eq(analyticsEvents.organizationId, organizationId), eq(analyticsEvents.contactId, contactId), gte(analyticsEvents.createdAt, evidenceFrom))).orderBy(desc(analyticsEvents.createdAt)).limit(1),
    db.select({ status: tickets.status, priority: tickets.priority }).from(tickets).where(and(eq(tickets.organizationId, organizationId), eq(tickets.contactId, contactId), gte(tickets.createdAt, evidenceFrom))),
    db.select({ score: npsResponses.score, submittedAt: npsResponses.submittedAt }).from(npsResponses).where(and(eq(npsResponses.organizationId, organizationId), eq(npsResponses.contactId, contactId), isNotNull(npsResponses.score))).orderBy(desc(npsResponses.submittedAt)).limit(1),
    db.select({ status: emailDeliveries.status, updatedAt: emailDeliveries.updatedAt }).from(emailDeliveries).where(and(eq(emailDeliveries.organizationId, organizationId), eq(emailDeliveries.contactId, contactId), gte(emailDeliveries.updatedAt, evidenceFrom))),
  ]);

  const inactiveSubscriptionStatuses = new Set(["cancelled", "canceled", "expired", "failed", "unpaid"]);
  const activeSubscriptions = subscriptionRows.filter((row) => !inactiveSubscriptionStatuses.has((row.status ?? "active").toLowerCase())).length;
  const lastEngagement = [activityRows[0]?.createdAt, behaviorRows[0]?.createdAt]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const openTickets = ticketRows.filter((row) => !["resolved", "closed"].includes(row.status ?? ""));
  const result = calculateCustomerHealth({
    subscription: subscriptionRows.length ? { total: subscriptionRows.length, active: activeSubscriptions } : null,
    lastEngagementAt: lastEngagement,
    support: ticketRows.length ? {
      total: ticketRows.length,
      open: openTickets.length,
      high: openTickets.filter((row) => row.priority === "high").length,
      critical: openTickets.filter((row) => row.priority === "critical").length,
    } : null,
    npsScore: npsRows[0]?.score ?? null,
    email: emailRows.length ? {
      total: emailRows.length,
      delivered: emailRows.filter((row) => row.status === "delivered").length,
      bounced: emailRows.filter((row) => row.status === "bounced").length,
      complained: emailRows.filter((row) => row.status === "complained").length,
    } : null,
  });

  const [assessment] = await db.insert(customerHealthAssessments).values({
    organizationId,
    contactId,
    score: result.score === null ? null : String(result.score),
    status: result.status,
    components: { ...result.components, explanation: result.explanation },
    methodologyVersion: result.methodologyVersion,
    evidenceFrom,
    evidenceTo: new Date(),
    calculatedBy: actorUserId ? `user:${actorUserId}` : "rules_engine",
  }).returning();

  if (["watch", "at_risk"].includes(result.status)) {
    const severity = result.status === "at_risk" ? "high" : "medium";
    const [openAlert] = await db.select({ id: customerRiskAlerts.id }).from(customerRiskAlerts).where(and(
      eq(customerRiskAlerts.organizationId, organizationId),
      eq(customerRiskAlerts.contactId, contactId),
      eq(customerRiskAlerts.alertType, "health_score"),
      inArray(customerRiskAlerts.status, ["open", "acknowledged"]),
    )).orderBy(desc(customerRiskAlerts.createdAt)).limit(1);
    if (openAlert) {
      await db.update(customerRiskAlerts).set({
        healthAssessmentId: assessment.id,
        severity,
        status: "open",
        title: result.status === "at_risk" ? "Customer health requires action" : "Customer health needs review",
        description: `Deterministic health score: ${result.score}`,
        evidence: { score: result.score, methodologyVersion: result.methodologyVersion },
        updatedAt: new Date(),
      }).where(and(eq(customerRiskAlerts.organizationId, organizationId), eq(customerRiskAlerts.id, openAlert.id)));
    } else {
      await db.insert(customerRiskAlerts).values({
        organizationId,
        contactId,
        healthAssessmentId: assessment.id,
        alertType: "health_score",
        severity,
        status: "open",
        title: result.status === "at_risk" ? "Customer health requires action" : "Customer health needs review",
        description: `Deterministic health score: ${result.score}`,
        evidence: { score: result.score, methodologyVersion: result.methodologyVersion },
      });
    }
  } else if (result.status === "healthy") {
    await db.update(customerRiskAlerts).set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(customerRiskAlerts.organizationId, organizationId),
      eq(customerRiskAlerts.contactId, contactId),
      eq(customerRiskAlerts.alertType, "health_score"),
      inArray(customerRiskAlerts.status, ["open", "acknowledged"]),
    ));
  }

  await recordCustomerTimelineEvent({
    organizationId,
    contactId,
    sourceType: "customer_success",
    sourceId: assessment.id,
    eventType: "health.assessed",
    summary: result.score === null ? "Customer health assessment has insufficient data" : `Customer health assessed at ${result.score}`,
    actorUserId,
    idempotencyKey: `health.assessed:${assessment.id}`,
    metadata: { status: result.status, score: result.score, methodologyVersion: result.methodologyVersion },
  });
  await enqueueWebhookEvent(organizationId, "customer.health_assessed", {
    contactId,
    assessmentId: assessment.id,
    score: result.score,
    status: result.status,
    occurredAt: new Date().toISOString(),
  });
  return NextResponse.json({ data: assessment, result });
});

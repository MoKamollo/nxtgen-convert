import { and, desc, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  activities,
  analyticsEvents,
  automationLogs,
  companies,
  contactConsents,
  contactIdentityKeys,
  contactLifecycleHistory,
  contactRelationships,
  contacts,
  customerTimelineEvents,
  deals,
  emailDeliveries,
  orders,
  subscriptions,
  tasks,
  tickets,
  users,
  workflowEnrollments,
} from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { normalizedMrr } from "@/lib/revenue-analytics";

export const GET = withApiGuard(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const limit = Math.min(200, Math.max(25, Number(request.nextUrl.searchParams.get("limit") ?? 100)));

  const [contact] = await db.select({
    id: contacts.id,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    email: contacts.email,
    phone: contacts.phone,
    mobile: contacts.mobile,
    status: contacts.status,
    source: contacts.source,
    companyId: contacts.companyId,
    companyName: companies.name,
    jobTitle: contacts.jobTitle,
    department: contacts.department,
    website: contacts.website,
    linkedIn: contacts.linkedIn,
    twitter: contacts.twitter,
    address: contacts.address,
    tags: contacts.tags,
    score: contacts.score,
    customFields: contacts.customFields,
    ownerId: contacts.ownerId,
    ownerName: users.name,
    lastContactedAt: contacts.lastContactedAt,
    archivedAt: contacts.archivedAt,
    deletionReason: contacts.deletionReason,
    createdAt: contacts.createdAt,
    updatedAt: contacts.updatedAt,
  }).from(contacts)
    .leftJoin(companies, and(eq(companies.id, contacts.companyId), eq(companies.organizationId, organizationId)))
    .leftJoin(users, eq(users.id, contacts.ownerId))
    .where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, id)))
    .limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const [
    identities,
    relationships,
    consents,
    lifecycle,
    activityRows,
    taskRows,
    dealRows,
    orderRows,
    subscriptionRows,
    ticketRows,
    automationRows,
    enrollmentRows,
    deliveryRows,
    behaviorRows,
    customRows,
  ] = await Promise.all([
    db.select({
      id: contactIdentityKeys.id,
      type: contactIdentityKeys.identityType,
      displayHint: contactIdentityKeys.displayHint,
      source: contactIdentityKeys.source,
      verified: contactIdentityKeys.verified,
      active: contactIdentityKeys.active,
      firstSeenAt: contactIdentityKeys.firstSeenAt,
      lastSeenAt: contactIdentityKeys.lastSeenAt,
    }).from(contactIdentityKeys).where(and(eq(contactIdentityKeys.organizationId, organizationId), eq(contactIdentityKeys.contactId, id))).orderBy(desc(contactIdentityKeys.lastSeenAt)),
    db.select({
      id: contactRelationships.id,
      fromContactId: contactRelationships.fromContactId,
      toContactId: contactRelationships.toContactId,
      relationshipType: contactRelationships.relationshipType,
      status: contactRelationships.status,
      metadata: contactRelationships.metadata,
      validFrom: contactRelationships.validFrom,
      validUntil: contactRelationships.validUntil,
      createdAt: contactRelationships.createdAt,
    }).from(contactRelationships).where(and(
      eq(contactRelationships.organizationId, organizationId),
      or(eq(contactRelationships.fromContactId, id), eq(contactRelationships.toContactId, id)),
    )),
    db.select().from(contactConsents).where(and(eq(contactConsents.organizationId, organizationId), eq(contactConsents.contactId, id))).orderBy(desc(contactConsents.effectiveAt)),
    db.select().from(contactLifecycleHistory).where(and(eq(contactLifecycleHistory.organizationId, organizationId), eq(contactLifecycleHistory.contactId, id))).orderBy(desc(contactLifecycleHistory.occurredAt)).limit(limit),
    db.select().from(activities).where(and(eq(activities.organizationId, organizationId), eq(activities.contactId, id))).orderBy(desc(activities.createdAt)).limit(limit),
    db.select().from(tasks).where(and(eq(tasks.organizationId, organizationId), eq(tasks.contactId, id))).orderBy(desc(tasks.createdAt)).limit(limit),
    db.select().from(deals).where(and(eq(deals.organizationId, organizationId), eq(deals.contactId, id))).orderBy(desc(deals.createdAt)).limit(limit),
    db.select().from(orders).where(and(eq(orders.organizationId, organizationId), eq(orders.contactId, id))).orderBy(desc(orders.createdAt)).limit(limit),
    db.select().from(subscriptions).where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.contactId, id))).orderBy(desc(subscriptions.createdAt)).limit(limit),
    db.select().from(tickets).where(and(eq(tickets.organizationId, organizationId), eq(tickets.contactId, id))).orderBy(desc(tickets.createdAt)).limit(limit),
    db.select().from(automationLogs).where(and(eq(automationLogs.organizationId, organizationId), eq(automationLogs.contactId, id))).orderBy(desc(automationLogs.triggeredAt)).limit(limit),
    db.select().from(workflowEnrollments).where(and(eq(workflowEnrollments.organizationId, organizationId), eq(workflowEnrollments.contactId, id))).orderBy(desc(workflowEnrollments.createdAt)).limit(limit),
    db.select().from(emailDeliveries).where(and(eq(emailDeliveries.organizationId, organizationId), eq(emailDeliveries.contactId, id))).orderBy(desc(emailDeliveries.createdAt)).limit(limit),
    db.select().from(analyticsEvents).where(and(eq(analyticsEvents.organizationId, organizationId), eq(analyticsEvents.contactId, id))).orderBy(desc(analyticsEvents.createdAt)).limit(limit),
    db.select().from(customerTimelineEvents).where(and(eq(customerTimelineEvents.organizationId, organizationId), eq(customerTimelineEvents.contactId, id))).orderBy(desc(customerTimelineEvents.occurredAt)).limit(limit),
  ]);

  const timeline = [
    ...customRows.map((row) => ({ id: `timeline:${row.id}`, source: row.sourceType, type: row.eventType, summary: row.summary, occurredAt: row.occurredAt, metadata: row.metadata })),
    ...activityRows.map((row) => ({ id: `activity:${row.id}`, source: "activity", type: row.type, summary: row.subject, occurredAt: row.createdAt, metadata: { outcome: row.outcome, completedAt: row.completedAt } })),
    ...taskRows.map((row) => ({ id: `task:${row.id}`, source: "task", type: row.status ?? "task", summary: row.title, occurredAt: row.createdAt, metadata: { priority: row.priority, dueDate: row.dueDate, completedAt: row.completedAt } })),
    ...dealRows.map((row) => ({ id: `deal:${row.id}`, source: "deal", type: row.stage ?? "deal", summary: row.name, occurredAt: row.updatedAt, metadata: { value: row.value, currency: row.currency, probability: row.probability } })),
    ...orderRows.map((row) => ({ id: `order:${row.id}`, source: "order", type: row.status ?? "order", summary: `Order ${row.orderNumber}`, occurredAt: row.createdAt, metadata: { total: row.total, currency: row.currency, paymentStatus: row.paymentStatus } })),
    ...subscriptionRows.map((row) => ({ id: `subscription:${row.id}`, source: "subscription", type: row.status ?? "subscription", summary: `Subscription ${row.interval ?? "monthly"}`, occurredAt: row.createdAt, metadata: { amount: row.amount, currency: row.currency, currentPeriodEnd: row.currentPeriodEnd, cancelledAt: row.cancelledAt } })),
    ...ticketRows.map((row) => ({ id: `ticket:${row.id}`, source: "support", type: row.status ?? "ticket", summary: row.subject, occurredAt: row.createdAt, metadata: { priority: row.priority, ticketNumber: row.ticketNumber, resolvedAt: row.resolvedAt } })),
    ...automationRows.map((row) => ({ id: `automation:${row.id}`, source: "automation", type: row.status ?? row.event, summary: row.event, occurredAt: row.triggeredAt, metadata: row.metadata })),
    ...enrollmentRows.map((row) => ({ id: `journey:${row.id}`, source: "journey", type: row.status, summary: `Workflow enrollment: ${row.event}`, occurredAt: row.createdAt, metadata: { workflowId: row.workflowId, completedAt: row.completedAt, nextStepIndex: row.nextStepIndex } })),
    ...deliveryRows.map((row) => ({ id: `email:${row.id}`, source: "email", type: row.status, summary: `Campaign email ${row.status}`, occurredAt: row.updatedAt, metadata: { campaignId: row.campaignId, deliveredAt: row.deliveredAt, failedAt: row.failedAt } })),
    ...behaviorRows.map((row) => ({ id: `behavior:${row.id}`, source: "behavior", type: row.event, summary: row.event, occurredAt: row.createdAt, metadata: { source: row.source, medium: row.medium, campaign: row.campaign, properties: row.properties } })),
    ...lifecycle.map((row) => ({ id: `lifecycle:${row.id}`, source: "lifecycle", type: "stage_changed", summary: `${row.fromStage ?? "unclassified"} to ${row.toStage}`, occurredAt: row.occurredAt, metadata: { reason: row.reason, source: row.source } })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, limit);

  const paidOrderRevenue = orderRows
    .filter((row) => ["paid", "succeeded", "complete", "completed"].includes((row.paymentStatus ?? "").toLowerCase()))
    .reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const activeSubscriptions = subscriptionRows.filter((row) => !["cancelled", "canceled", "expired", "failed", "unpaid"].includes((row.status ?? "active").toLowerCase()));
  const recurringMrr = activeSubscriptions.reduce((sum, row) => sum + normalizedMrr(row.amount, row.interval), 0);
  const openDeals = dealRows.filter((row) => !["closed_won", "closed_lost"].includes(row.stage ?? ""));
  const latestConsentByKey = new Map<string, typeof consents[number]>();
  for (const row of consents) {
    const key = `${row.channel}:${row.purpose}`;
    if (!latestConsentByKey.has(key)) latestConsentByKey.set(key, row);
  }

  return NextResponse.json({
    data: {
      contact,
      identities,
      relationships,
      consent: [...latestConsentByKey.values()],
      lifecycle,
      timeline,
      summary: {
        paidOrderRevenue: Math.round(paidOrderRevenue * 100) / 100,
        recurringMrr: Math.round(recurringMrr * 100) / 100,
        activeSubscriptions: activeSubscriptions.length,
        openDealCount: openDeals.length,
        openDealValue: Math.round(openDeals.reduce((sum, row) => sum + Number(row.value ?? 0), 0) * 100) / 100,
        openTicketCount: ticketRows.filter((row) => !["resolved", "closed"].includes(row.status ?? "")).length,
        pendingTaskCount: taskRows.filter((row) => !["completed", "cancelled"].includes(row.status ?? "")).length,
      },
      methodology: {
        revenue: "Paid order totals and normalized active subscription MRR are reported separately to avoid double counting.",
        timeline: "Timeline is assembled from tenant owned source records and immutable custom timeline events. No synthetic events are generated.",
        identity: "Identity keys are HMAC hashed and conflicts require review. No automatic contact merge occurs.",
      },
    },
  });
});

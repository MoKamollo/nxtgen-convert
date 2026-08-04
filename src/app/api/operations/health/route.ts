import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  connectorAccounts,
  emailDeliveries,
  integrationEventReceipts,
  operationalEvents,
  webhookDeliveries,
  workflowEnrollments,
} from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";

export const GET = withApiGuard(async (request: NextRequest) => {
  const organizationId = request.headers.get("x-tenant-id")!;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [webhooks, workflows, emails, integrationFailures, connectors, recentEvents] = await Promise.all([
    db.select({ status: webhookDeliveries.status, total: count() })
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.organizationId, organizationId), inArray(webhookDeliveries.status, ["pending", "retrying", "dead_letter"])))
      .groupBy(webhookDeliveries.status),
    db.select({ status: workflowEnrollments.status, total: count() })
      .from(workflowEnrollments)
      .where(and(eq(workflowEnrollments.organizationId, organizationId), inArray(workflowEnrollments.status, ["retrying", "dead_letter"])))
      .groupBy(workflowEnrollments.status),
    db.select({ status: emailDeliveries.status, total: count() })
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.organizationId, organizationId), gte(emailDeliveries.updatedAt, since), inArray(emailDeliveries.status, ["failed", "bounced", "complained", "suppressed"])))
      .groupBy(emailDeliveries.status),
    db.select({ total: count() }).from(integrationEventReceipts).where(and(
      eq(integrationEventReceipts.organizationId, organizationId),
      eq(integrationEventReceipts.status, "failed"),
      gte(integrationEventReceipts.receivedAt, since),
    )),
    db.select({
      provider: connectorAccounts.provider,
      status: connectorAccounts.status,
      healthStatus: connectorAccounts.healthStatus,
      lastVerifiedAt: connectorAccounts.lastVerifiedAt,
      lastSyncAt: connectorAccounts.lastSyncAt,
      lastError: connectorAccounts.lastError,
    }).from(connectorAccounts).where(eq(connectorAccounts.organizationId, organizationId)),
    db.select({
      severity: operationalEvents.severity,
      component: operationalEvents.component,
      event: operationalEvents.event,
      message: operationalEvents.message,
      requestId: operationalEvents.requestId,
      occurredAt: operationalEvents.occurredAt,
    }).from(operationalEvents).where(and(
      eq(operationalEvents.organizationId, organizationId),
      gte(operationalEvents.occurredAt, since),
      inArray(operationalEvents.severity, ["error", "critical"]),
    )).orderBy(desc(operationalEvents.occurredAt)).limit(25),
  ]);

  const webhookCounts = Object.fromEntries(webhooks.map((row) => [row.status, Number(row.total)]));
  const workflowCounts = Object.fromEntries(workflows.map((row) => [row.status, Number(row.total)]));
  const emailCounts = Object.fromEntries(emails.map((row) => [row.status, Number(row.total)]));
  const failedIntegrationEvents = Number(integrationFailures[0]?.total ?? 0);
  const connectorAttention = connectors.filter((connector) => connector.healthStatus === "error" || connector.status === "error").length;
  const attentionCount = Number(webhookCounts.dead_letter ?? 0)
    + Number(workflowCounts.dead_letter ?? 0)
    + failedIntegrationEvents
    + connectorAttention
    + recentEvents.filter((event) => event.severity === "critical").length;

  const stripeConnector = connectors.find((connector) => connector.provider === "stripe");

  return NextResponse.json({
    status: attentionCount > 0 ? "attention_required" : "no_recorded_critical_failures",
    scope: "tenant_recorded_runtime_signals",
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    queues: { webhooks: webhookCounts, workflows: workflowCounts },
    email: emailCounts,
    integrationFailures: failedIntegrationEvents,
    connectors,
    recentErrors: recentEvents,
    capabilities: {
      resendSendingConfigured: Boolean(process.env.RESEND_API_KEY),
      resendWebhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      stripeConnector: {
        configured: Boolean(stripeConnector),
        connected: stripeConnector?.status === "connected",
        status: stripeConnector?.status ?? "not_configured",
        healthStatus: stripeConnector?.healthStatus ?? "not_configured",
        lastVerifiedAt: stripeConnector?.lastVerifiedAt ?? null,
      },
      qstashConfigured: Boolean(
        process.env.QSTASH_TOKEN
          && process.env.QSTASH_CURRENT_SIGNING_KEY
          && process.env.QSTASH_NEXT_SIGNING_KEY,
      ),
      encryptionConfigured: Boolean(process.env.INTEGRATION_ENCRYPTION_KEY),
      trackingSigningConfigured: Boolean(process.env.TRACKING_SIGNING_SECRET || process.env.SPACE_SSO_SECRET),
    },
  });
});

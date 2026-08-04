import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { integrationSecrets, webhookEndpoints } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { generateWebhookSigningSecret, validateWebhookUrl } from "@/lib/webhooks";
import { normalizeWebhookEvents } from "@/lib/webhook-security";

async function GETHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const data = await db.select({
    id: webhookEndpoints.id,
    url: webhookEndpoints.url,
    events: webhookEndpoints.events,
    active: webhookEndpoints.active,
    healthStatus: webhookEndpoints.healthStatus,
    consecutiveFailures: webhookEndpoints.consecutiveFailures,
    lastDeliveryAt: webhookEndpoints.lastDeliveryAt,
    lastSuccessAt: webhookEndpoints.lastSuccessAt,
    lastFailureAt: webhookEndpoints.lastFailureAt,
    createdAt: webhookEndpoints.createdAt,
  }).from(webhookEndpoints).where(eq(webhookEndpoints.organizationId, organizationId));
  return NextResponse.json({ data });
}

async function POSTHandler(request: NextRequest) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const body = await request.json() as Record<string, unknown>;
  const url = String(body.url ?? "").trim();
  try {
    await validateWebhookUrl(url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid webhook URL" }, { status: 400 });
  }

  const events = normalizeWebhookEvents(body.events);
  if (events.length === 0) return NextResponse.json({ error: "Select at least one event" }, { status: 400 });

  try {
    const material = generateWebhookSigningSecret();
    const endpoint = await db.transaction(async (transaction) => {
      const [secretRecord] = await transaction.insert(integrationSecrets).values({
        organizationId,
        provider: "webhook-signing",
        ciphertext: material.ciphertext,
        iv: material.iv,
        authTag: material.authTag,
        keyVersion: material.keyVersion,
      }).returning({ id: integrationSecrets.id });
      if (!secretRecord) throw new Error("Webhook signing secret could not be stored");

      const [createdEndpoint] = await transaction.insert(webhookEndpoints).values({
        organizationId,
        url,
        events,
        secretId: secretRecord.id,
      }).returning({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        active: webhookEndpoints.active,
        healthStatus: webhookEndpoints.healthStatus,
        createdAt: webhookEndpoints.createdAt,
      });
      if (!createdEndpoint) throw new Error("Webhook endpoint could not be created");
      return createdEndpoint;
    });

    return NextResponse.json({
      data: {
        ...endpoint,
        signingSecret: material.secret,
        warning: "Copy the signing secret now. It cannot be displayed again.",
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: "Webhook secret storage is not configured",
      detail: error instanceof Error ? error.message : undefined,
    }, { status: 503 });
  }
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { integrationSecrets, webhookEndpoints } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { generateWebhookSigningSecret } from "@/lib/webhooks";

async function POSTHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const organizationId = request.headers.get("x-tenant-id")!;
  const { id } = await params;
  const [endpoint] = await db.select({ id: webhookEndpoints.id, secretId: webhookEndpoints.secretId })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)))
    .limit(1);
  if (!endpoint) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

  try {
    const material = generateWebhookSigningSecret();
    await db.transaction(async (transaction) => {
      const [secretRecord] = await transaction.insert(integrationSecrets).values({
        organizationId,
        provider: "webhook-signing",
        ciphertext: material.ciphertext,
        iv: material.iv,
        authTag: material.authTag,
        keyVersion: material.keyVersion,
      }).returning({ id: integrationSecrets.id });
      if (!secretRecord) throw new Error("Webhook signing secret could not be stored");

      await transaction.update(webhookEndpoints).set({
        secretId: secretRecord.id,
        healthStatus: "pending",
        consecutiveFailures: 0,
        updatedAt: new Date(),
      }).where(and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.organizationId, organizationId),
      ));
      await transaction.update(integrationSecrets).set({ rotatedAt: new Date() }).where(and(
        eq(integrationSecrets.id, endpoint.secretId),
        eq(integrationSecrets.organizationId, organizationId),
        eq(integrationSecrets.provider, "webhook-signing"),
      ));
    });

    return NextResponse.json({
      data: {
        id,
        signingSecret: material.secret,
        warning: "Copy the replacement signing secret now. The previous secret is no longer used for new deliveries.",
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: "Webhook secret storage is not configured",
      detail: error instanceof Error ? error.message : undefined,
    }, { status: 503 });
  }
}

export const POST = withApiGuard(POSTHandler);

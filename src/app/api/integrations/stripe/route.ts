import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { connectorAccounts, integrationSecrets } from "@/db/schema";
import { withApiGuard } from "@/lib/api-guard";
import { encryptSecret } from "@/lib/secret-vault";

async function GETHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const [account] = await db.select({
    id: connectorAccounts.id,
    externalAccountId: connectorAccounts.externalAccountId,
    displayName: connectorAccounts.displayName,
    status: connectorAccounts.status,
    healthStatus: connectorAccounts.healthStatus,
    lastVerifiedAt: connectorAccounts.lastVerifiedAt,
    lastSyncAt: connectorAccounts.lastSyncAt,
    lastError: connectorAccounts.lastError,
    metadata: connectorAccounts.metadata,
  }).from(connectorAccounts).where(and(eq(connectorAccounts.organizationId, orgId), eq(connectorAccounts.provider, "stripe"))).limit(1);
  return NextResponse.json({ data: account ?? { status: "disconnected", healthStatus: "not_configured" } });
}

async function POSTHandler(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id")!;
  const body = await request.json();
  const secretKey = String(body.secretKey ?? "").trim();
  const publishableKey = String(body.publishableKey ?? "").trim();
  const webhookSecret = String(body.webhookSecret ?? "").trim();
  if (!/^sk_(test|live)_/.test(secretKey)) return NextResponse.json({ error: "A valid Stripe secret key is required" }, { status: 400 });
  if (publishableKey && !/^pk_(test|live)_/.test(publishableKey)) return NextResponse.json({ error: "Invalid Stripe publishable key" }, { status: 400 });
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) return NextResponse.json({ error: "Invalid Stripe webhook signing secret" }, { status: 400 });

  const stripeResponse = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const stripeAccount = await stripeResponse.json().catch(() => ({}));
  if (!stripeResponse.ok || !stripeAccount.id) {
    return NextResponse.json({ error: "Stripe rejected the credentials", providerStatus: stripeResponse.status }, { status: 400 });
  }

  let encrypted;
  try { encrypted = encryptSecret(JSON.stringify({ secretKey, publishableKey, webhookSecret })); } catch (error) {
    return NextResponse.json({ error: "Integration secret storage is not configured", detail: error instanceof Error ? error.message : undefined }, { status: 503 });
  }

  const [existing] = await db.select().from(connectorAccounts).where(and(eq(connectorAccounts.organizationId, orgId), eq(connectorAccounts.provider, "stripe"))).limit(1);
  let secretId = existing?.secretId ?? null;
  if (secretId) {
    await db.update(integrationSecrets).set({ ...encrypted, rotatedAt: new Date() }).where(eq(integrationSecrets.id, secretId));
  } else {
    const [secret] = await db.insert(integrationSecrets).values({ organizationId: orgId, provider: "stripe", ...encrypted }).returning({ id: integrationSecrets.id });
    secretId = secret.id;
  }

  const values = {
    externalAccountId: String(stripeAccount.id),
    displayName: String(stripeAccount.business_profile?.name ?? stripeAccount.settings?.dashboard?.display_name ?? stripeAccount.id),
    status: "connected",
    healthStatus: webhookSecret ? "pending_webhook_verification" : "degraded",
    secretId,
    lastVerifiedAt: new Date(),
    lastError: webhookSecret ? null : "Webhook signing secret has not been configured",
    metadata: { livemode: Boolean(stripeAccount.livemode), country: stripeAccount.country ?? null, chargesEnabled: Boolean(stripeAccount.charges_enabled), payoutsEnabled: Boolean(stripeAccount.payouts_enabled) },
    updatedAt: new Date(),
  };
  let connectorId: string;
  if (existing) {
    const [updated] = await db.update(connectorAccounts).set(values).where(eq(connectorAccounts.id, existing.id)).returning({ id: connectorAccounts.id });
    connectorId = updated.id;
  } else {
    const [created] = await db.insert(connectorAccounts).values({ organizationId: orgId, provider: "stripe", ...values }).returning({ id: connectorAccounts.id });
    connectorId = created.id;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    data: { connectorId, accountId: stripeAccount.id, healthStatus: values.healthStatus, webhookUrl: `${appUrl}/api/integrations/stripe/webhook/${connectorId}` },
    nextAction: webhookSecret ? "Send a Stripe test event to verify the webhook." : "Create a Stripe webhook endpoint and submit its signing secret.",
  });
}

export const GET = withApiGuard(GETHandler);
export const POST = withApiGuard(POSTHandler);

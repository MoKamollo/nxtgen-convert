import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { and, eq, inArray, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { integrationSecrets, webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { decryptSecret, encryptSecret, type EncryptedValue } from "@/lib/secret-vault";
import { isPrivateOrReservedAddress } from "@/lib/webhook-security";

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000] as const;
const PROCESSING_STALE_MS = 5 * 60_000;

type ResolvedAddress = { address: string; family: 4 | 6 };
type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;

type WebhookSigningSecretMaterial = EncryptedValue & {
  secret: string;
};

async function resolveWebhookDestination(url: URL): Promise<ResolvedAddress[]> {
  const literalFamily = isIP(url.hostname);
  const resolved = literalFamily === 4 || literalFamily === 6
    ? [{ address: url.hostname, family: literalFamily }]
    : await lookup(url.hostname, { all: true, verbatim: true });

  const normalized = resolved.map((entry): ResolvedAddress => {
    if (entry.family !== 4 && entry.family !== 6) throw new Error("Webhook destination returned an unsupported address family");
    return { address: entry.address, family: entry.family };
  });

  if (normalized.length === 0 || normalized.some((entry) => isPrivateOrReservedAddress(entry.address))) {
    throw new Error("Private or reserved webhook destinations are not allowed");
  }
  return normalized;
}

export async function validateWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid webhook URL");
  }
  if (url.protocol !== "https:") throw new Error("Webhook URLs must use HTTPS");
  if (url.username || url.password) throw new Error("Webhook URLs cannot include credentials");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Local webhook hosts are not allowed");
  if (url.port && url.port !== "443") throw new Error("Webhook destinations must use the standard HTTPS port");
  await resolveWebhookDestination(url);
  return url;
}

async function postPinnedHttps(url: URL, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const [destination] = await resolveWebhookDestination(url);
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    callback(null, destination.address, destination.family);
  };

  return new Promise((resolve, reject) => {
    const outgoingRequest = httpsRequest(url, {
      method: "POST",
      headers: { ...headers, "content-length": String(Buffer.byteLength(body)) },
      servername: url.hostname,
      lookup: pinnedLookup,
    }, (response: IncomingMessage) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        if (responseBody.length < 2_000) responseBody += chunk.slice(0, 2_000 - responseBody.length);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: responseBody }));
    });
    outgoingRequest.setTimeout(10_000, () => outgoingRequest.destroy(new Error("Webhook request timed out")));
    outgoingRequest.on("error", reject);
    outgoingRequest.end(body);
  });
}

export function generateWebhookSigningSecret(): WebhookSigningSecretMaterial {
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  return { secret, ...encryptSecret(secret) };
}

export async function createWebhookSigningSecret(organizationId: string): Promise<{ secretId: string; secret: string }> {
  const material = generateWebhookSigningSecret();
  const [record] = await db.insert(integrationSecrets).values({
    organizationId,
    provider: "webhook-signing",
    ciphertext: material.ciphertext,
    iv: material.iv,
    authTag: material.authTag,
    keyVersion: material.keyVersion,
  }).returning({ id: integrationSecrets.id });
  if (!record) throw new Error("Webhook signing secret could not be stored");
  return { secretId: record.id, secret: material.secret };
}

export async function enqueueWebhookEvent(organizationId: string, eventType: string, payload: Record<string, unknown>): Promise<number> {
  const endpoints = await db.select().from(webhookEndpoints).where(and(
    eq(webhookEndpoints.organizationId, organizationId),
    eq(webhookEndpoints.active, true),
  ));
  const matching = endpoints.filter((endpoint: WebhookEndpoint) => endpoint.events.includes("*") || endpoint.events.includes(eventType));
  if (matching.length === 0) return 0;

  const eventId = randomUUID();
  await db.insert(webhookDeliveries).values(matching.map((endpoint: WebhookEndpoint) => ({
    organizationId,
    endpointId: endpoint.id,
    eventId,
    eventType,
    payload,
    idempotencyKey: `${endpoint.id}:${eventId}`,
  })));
  return matching.length;
}

async function signingSecret(secretId: string, organizationId: string): Promise<string> {
  const [record] = await db.select().from(integrationSecrets).where(and(
    eq(integrationSecrets.id, secretId),
    eq(integrationSecrets.organizationId, organizationId),
    eq(integrationSecrets.provider, "webhook-signing"),
  )).limit(1);
  if (!record) throw new Error("Webhook signing secret not found");
  return decryptSecret(record);
}

export async function deliverWebhook(deliveryId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS);
  const [delivery] = await db.update(webhookDeliveries).set({ status: "processing", updatedAt: new Date() }).where(and(
    eq(webhookDeliveries.id, deliveryId),
    or(
      inArray(webhookDeliveries.status, ["pending", "retrying"]),
      and(eq(webhookDeliveries.status, "processing"), lt(webhookDeliveries.updatedAt, staleBefore)),
    ),
  )).returning();
  if (!delivery) return false;

  const [endpoint] = await db.select().from(webhookEndpoints).where(and(
    eq(webhookEndpoints.id, delivery.endpointId),
    eq(webhookEndpoints.organizationId, delivery.organizationId),
  )).limit(1);
  if (!endpoint || !endpoint.active) {
    await db.update(webhookDeliveries).set({
      status: "dead_letter",
      lastError: "Webhook endpoint is missing or disabled",
      updatedAt: new Date(),
    }).where(and(
      eq(webhookDeliveries.id, delivery.id),
      eq(webhookDeliveries.organizationId, delivery.organizationId),
    ));
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({
    id: delivery.eventId,
    type: delivery.eventType,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });

  try {
    const url = await validateWebhookUrl(endpoint.url);
    const secret = await signingSecret(endpoint.secretId, delivery.organizationId);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const response = await postPinnedHttps(url, body, {
      "content-type": "application/json",
      "user-agent": "NxtGen-Convert-Webhooks/1.0",
      "x-nxtgen-event-id": delivery.eventId,
      "x-nxtgen-event-type": delivery.eventType,
      "x-nxtgen-signature": `t=${timestamp},v1=${signature}`,
      "idempotency-key": delivery.idempotencyKey,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}: ${response.body}`);

    await db.update(webhookDeliveries).set({
      status: "delivered",
      attemptCount: delivery.attemptCount + 1,
      responseStatus: response.status,
      responseBody: response.body,
      deliveredAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    }).where(and(
      eq(webhookDeliveries.id, delivery.id),
      eq(webhookDeliveries.organizationId, delivery.organizationId),
      eq(webhookDeliveries.status, "processing"),
    ));
    await db.update(webhookEndpoints).set({
      healthStatus: "healthy",
      consecutiveFailures: 0,
      lastDeliveryAt: new Date(),
      lastSuccessAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(webhookEndpoints.id, endpoint.id),
      eq(webhookEndpoints.organizationId, delivery.organizationId),
    ));
    return true;
  } catch (error) {
    const attempts = delivery.attemptCount + 1;
    const dead = attempts > RETRY_DELAYS_MS.length;
    const failures = endpoint.consecutiveFailures + 1;
    await db.update(webhookDeliveries).set({
      status: dead ? "dead_letter" : "retrying",
      attemptCount: attempts,
      nextAttemptAt: dead
        ? delivery.nextAttemptAt
        : new Date(Date.now() + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]),
      lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown delivery error",
      updatedAt: new Date(),
    }).where(and(
      eq(webhookDeliveries.id, delivery.id),
      eq(webhookDeliveries.organizationId, delivery.organizationId),
      eq(webhookDeliveries.status, "processing"),
    ));
    await db.update(webhookEndpoints).set({
      healthStatus: failures >= 3 ? "degraded" : "failing",
      consecutiveFailures: failures,
      active: failures < 10,
      lastDeliveryAt: new Date(),
      lastFailureAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(webhookEndpoints.id, endpoint.id),
      eq(webhookEndpoints.organizationId, delivery.organizationId),
    ));
    return false;
  }
}

export async function processDueWebhookDeliveries(limit = 50): Promise<{ processed: number; delivered: number }> {
  const now = new Date();
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS);
  const due = await db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).where(and(
    lte(webhookDeliveries.nextAttemptAt, now),
    or(
      inArray(webhookDeliveries.status, ["pending", "retrying"]),
      and(eq(webhookDeliveries.status, "processing"), lt(webhookDeliveries.updatedAt, staleBefore)),
    ),
  )).limit(limit);

  let delivered = 0;
  for (const item of due) {
    if (await deliverWebhook(item.id)) delivered += 1;
  }
  return { processed: due.length, delivered };
}

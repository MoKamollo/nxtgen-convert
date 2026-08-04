import assert from "node:assert/strict";
import { test } from "node:test";
import { ADMINISTRATIVE_PREFIXES, isAuthorized, minimumRoleForRequest, roleAtLeast } from "../src/lib/authz.ts";
import { calculateRevenueAnalytics, normalizedMrr } from "../src/lib/revenue-analytics.ts";
import { recipientTrackingId, signTracking, verifyTracking } from "../src/lib/email-tracking.ts";
import { decryptSecret, encryptSecret } from "../src/lib/secret-vault.ts";
import { validateWorkflowDefinition } from "../src/lib/workflow-validation.ts";
import { chooseExperimentVariant, evaluateWorkflowCondition } from "../src/lib/journey-runtime.ts";
import { segmentDefinitionChecksum, validateSegmentDefinition } from "../src/lib/segment-definition.ts";
import { personalizationDefinitionChecksum, validatePersonalizationDefinition } from "../src/lib/personalization-definition.ts";
import { hashIdentity, identityHint, normalizeIdentity } from "../src/lib/identity-values.ts";
import { addCampaignStats, deliveryStatusTotals, emptyCampaignStats, normalizeCampaignStats, percentage } from "../src/lib/campaign-analytics.ts";
import { API_KEY_SCOPES, normalizeApiKeyScopes } from "../src/lib/api-key-scopes.ts";
import { isPrivateOrReservedAddress, normalizeWebhookEvents } from "../src/lib/webhook-security.ts";
import {
  deriveReleaseReadiness,
  normalizeReleaseValidationInput,
  RELEASE_VALIDATION_CONTROLS,
  type ReleaseValidationEvent,
} from "../src/lib/release-readiness.ts";
import {
  resendDeliveryId,
  resendEventStatus,
  resendEventTime,
  resendProviderError,
  shouldApplyResendStatus,
  verifyResendWebhook,
} from "../src/lib/resend-webhook.ts";

process.env.NODE_ENV = "test";
process.env.SPACE_SSO_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";
process.env.TRACKING_SIGNING_SECRET = "tracking-secret-longer-than-thirty-two-characters";
process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.IDENTITY_HASHING_SECRET = "identity-secret-longer-than-thirty-two-characters";


test("API key scopes are allowlisted, deduplicated, and include personalization decisions", () => {
  assert.equal(API_KEY_SCOPES.includes("personalization:decide"), true);
  assert.deepEqual(
    normalizeApiKeyScopes(["contacts:read", "personalization:decide", "contacts:read", "invalid:scope"]),
    ["contacts:read", "personalization:decide"],
  );
  assert.deepEqual(normalizeApiKeyScopes(undefined), ["contacts:read"]);
  assert.deepEqual(normalizeApiKeyScopes(["invalid:scope"]), []);
});

test("webhook SSRF protection blocks private, reserved, and documentation addresses", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.51.100.2", "203.0.113.3",
    "224.0.0.1", "255.255.255.255", "::", "::1", "::ffff:127.0.0.1", "fc00::1",
    "fd00::1", "fe80::1", "ff02::1", "2001:db8::1",
  ]) {
    assert.equal(isPrivateOrReservedAddress(address), true, address);
  }
  assert.equal(isPrivateOrReservedAddress("8.8.8.8"), false);
  assert.equal(isPrivateOrReservedAddress("2606:4700:4700::1111"), false);
});

test("webhook event subscriptions are trimmed, deduplicated, and bounded", () => {
  assert.deepEqual(normalizeWebhookEvents([" contact.created ", "contact.created", "", "deal.won"]), ["contact.created", "deal.won"]);
  assert.deepEqual(normalizeWebhookEvents("contact.created"), []);
  assert.equal(normalizeWebhookEvents(Array.from({ length: 150 }, (_, index) => `event.${index}`)).length, 100);
});

test("RBAC defaults unknown mutations to administrator", () => {
  assert.equal(minimumRoleForRequest("/api/unknown", "POST"), "admin");
  assert.equal(isAuthorized("member", "/api/unknown", "POST"), false);
  assert.equal(isAuthorized("admin", "/api/unknown", "POST"), true);
  assert.equal(roleAtLeast("owner", "admin"), true);
  assert.equal(isAuthorized("viewer", "/api/contacts", "GET"), true);
  assert.equal(isAuthorized("viewer", "/api/contacts", "POST"), false);
  assert.equal(isAuthorized("viewer", "/api/users/me", "PATCH"), true);
  assert.equal(isAuthorized("viewer", "/api/sessions/session-1", "DELETE"), true);
});

test("administrative GET endpoints require an administrator", () => {
  for (const prefix of ADMINISTRATIVE_PREFIXES) {
    assert.equal(minimumRoleForRequest(prefix, "GET"), "admin", prefix);
    assert.equal(isAuthorized("viewer", prefix, "GET"), false, prefix);
    assert.equal(isAuthorized("member", prefix, "GET"), false, prefix);
    assert.equal(isAuthorized("manager", prefix, "GET"), false, prefix);
    assert.equal(isAuthorized("admin", prefix, "GET"), true, prefix);
    assert.equal(isAuthorized("owner", prefix, "GET"), true, prefix);
  }
  assert.equal(isAuthorized("viewer", "/api/contacts", "GET"), true);
  assert.equal(isAuthorized("viewer", "/api/users/me", "GET"), true);
});

test("campaign analytics normalizes malformed values without unsupported revenue", () => {
  const first = normalizeCampaignStats({ sent: "10", delivered: 8, opened: 4, revenue: 999 });
  const second = normalizeCampaignStats({ sent: -4, delivered: Number.NaN, clicked: 2.9, failed: 1 });
  assert.deepEqual(first, { sent: 10, delivered: 8, opened: 4, clicked: 0, bounced: 0, failed: 0, unsubscribed: 0 });
  assert.deepEqual(second, { sent: 0, delivered: 0, opened: 0, clicked: 2, bounced: 0, failed: 1, unsubscribed: 0 });
  assert.deepEqual(addCampaignStats(emptyCampaignStats(), first), first);
  assert.equal(percentage(4, 8), 50);
  assert.equal(percentage(1, 0), 0);
  assert.deepEqual(
    deliveryStatusTotals(new Map([["accepted", 2], ["delivered", 5], ["complained", 1], ["bounced", 2], ["pending", 3]])),
    { sent: 10, delivered: 6, opened: 0, clicked: 0, bounced: 2, failed: 0, unsubscribed: 0 },
  );
});

test("Resend webhook compatibility handles current and legacy tag shapes", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(resendDeliveryId({ data: { tags: { nxtgen_delivery_id: id } } }), id);
  assert.equal(resendDeliveryId({ data: { tags: [{ name: "nxtgen_delivery_id", value: id }] } }), id);
  assert.equal(resendEventStatus("email.delivered"), "delivered");
  assert.equal(resendProviderError({ data: { failed: { reason: "reached_daily_quota" } } }), "reached_daily_quota");
  assert.equal(shouldApplyResendStatus("delivered", "accepted"), false);
  assert.equal(shouldApplyResendStatus("delivered", "complained"), true);
  assert.equal(resendEventTime({ created_at: "2026-08-04T00:00:00.000Z" }).toISOString(), "2026-08-04T00:00:00.000Z");

  let verificationInput: unknown;
  const event = verifyResendWebhook(
    { webhooks: { verify(input) { verificationInput = input; return { type: "email.sent" }; } } },
    "{\"type\":\"email.sent\"}",
    { id: "evt_1", timestamp: "123", signature: "v1,test" },
    "whsec_test",
  );
  assert.equal(event.type, "email.sent");
  assert.deepEqual(verificationInput, {
    payload: "{\"type\":\"email.sent\"}",
    headers: { id: "evt_1", timestamp: "123", signature: "v1,test" },
    webhookSecret: "whsec_test",
  });
});

test("subscription revenue normalizes billing intervals and does not invent LTV", () => {
  assert.equal(normalizedMrr("1200", "year"), 100);
  assert.equal(normalizedMrr("300", "quarter"), 100);
  const now = new Date("2026-08-03T12:00:00Z");
  const result = calculateRevenueAnalytics([
    { contactId: "a", amount: "120", interval: "month", status: "active", currentPeriodStart: new Date("2026-08-01"), currentPeriodEnd: new Date("2026-09-01"), cancelledAt: null, createdAt: new Date("2026-01-01") },
    { contactId: "b", amount: "1200", interval: "year", status: "active", currentPeriodStart: new Date("2026-01-01"), currentPeriodEnd: new Date("2027-01-01"), cancelledAt: null, createdAt: new Date("2026-01-01") },
  ], now);
  assert.equal(result.mrr, 220);
  assert.equal(result.arr, 2640);
  assert.equal(result.activeCustomers, 2);
  assert.equal(result.ltv, null);
  assert.equal(result.ltvStatus, "insufficient_data");
});

test("tracking signatures bind campaign, recipient, and destination", () => {
  const recipient = recipientTrackingId("User@Example.com");
  assert.equal(recipient, recipientTrackingId("user@example.com"));
  const signature = signTracking("campaign-1", recipient, "https://example.com/path");
  assert.equal(verifyTracking("campaign-1", recipient, "https://example.com/path", signature), true);
  assert.equal(verifyTracking("campaign-1", recipient, "https://evil.example", signature), false);
});

test("secret vault encrypts with authenticated encryption", () => {
  const encrypted = encryptSecret("sensitive-value");
  assert.notEqual(encrypted.ciphertext, "sensitive-value");
  assert.equal(decryptSecret(encrypted), "sensitive-value");
  assert.throws(() => decryptSecret({ ...encrypted, authTag: Buffer.alloc(16).toString("base64") }));
});

test("workflow validator rejects unsupported capabilities", () => {
  assert.deepEqual(validateWorkflowDefinition({ trigger: { event: "manual" }, steps: [{ type: "wait", config: { amount: 2, unit: "hours" } }] }).trigger, { event: "manual" });
  assert.throws(() => validateWorkflowDefinition({ trigger: { event: "page_view" }, steps: [] }), /Unsupported trigger/);
  assert.throws(() => validateWorkflowDefinition({ trigger: { event: "manual" }, steps: [{ type: "send_sms", config: {} }] }), /Unsupported step/);
});


test("identity resolution normalizes and HMAC hashes canonical values", () => {
  const email = normalizeIdentity("email", " User@Example.COM ");
  assert.equal(email, "user@example.com");
  assert.equal(hashIdentity("email", email), hashIdentity("email", "user@example.com"));
  assert.notEqual(hashIdentity("email", email), email);
  assert.equal(identityHint("email", email), "us***@example.com");
  assert.equal(normalizeIdentity("phone", "+1 (212) 555-0100"), "+12125550100");
});

import { calculateCustomerHealth } from "../src/lib/customer-health.ts";
import { successPlaybookChecksum, validateSuccessPlaybookDefinition } from "../src/lib/customer-success-playbooks.ts";

test("customer health uses only available evidence and never claims prediction", () => {
  const now = new Date("2026-08-03T12:00:00Z");
  const insufficient = calculateCustomerHealth({ subscription: { total: 1, active: 1 } }, now);
  assert.equal(insufficient.status, "insufficient_data");
  assert.equal(insufficient.score, null);
  assert.match(insufficient.explanation, /Missing evidence is not treated as positive or negative/);

  const healthy = calculateCustomerHealth({
    subscription: { total: 1, active: 1 },
    lastEngagementAt: new Date("2026-08-01T12:00:00Z"),
    support: { total: 2, open: 0, high: 0, critical: 0 },
    npsScore: 9,
  }, now);
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.score, 100);
  assert.match(healthy.explanation, /not a churn prediction/);
});

test("customer success playbooks are validated and checksummed deterministically", () => {
  const definition = validateSuccessPlaybookDefinition({
    successCriteria: ["Customer reaches first value"],
    objectives: ["Complete onboarding"],
    milestones: [{ title: "Connect data", dueDays: 3, ownerRole: "manager" }],
  });
  assert.equal(definition.milestones[0].dueDays, 3);
  assert.equal(successPlaybookChecksum(definition), successPlaybookChecksum({ ...definition }));
  assert.throws(() => validateSuccessPlaybookDefinition({ milestones: [] }), /At least one milestone/);
  assert.throws(() => validateSuccessPlaybookDefinition({ milestones: [{ title: "Bad", dueDays: -1 }] }), /dueDays/);
});

import { loyaltyProgramChecksum, validateLoyaltyProgramDefinition } from "../src/lib/loyalty-programs.ts";

test("loyalty definitions enforce governed limits and deterministic versions", () => {
  const definition = validateLoyaltyProgramDefinition({
    currencyName: "NxtPoints",
    maxPointsPerTransaction: 1000,
    dailyEarnLimit: 2000,
    fraudReviewThreshold: 500,
    referralReward: 250,
    earnRules: [{ eventType: "order.completed", points: 100 }],
    tiers: [{ name: "Member", minimumLifetimePoints: 0 }, { name: "Gold", minimumLifetimePoints: 1000, benefits: ["Priority support"] }],
  });
  assert.equal(definition.tiers[0].minimumLifetimePoints, 0);
  assert.equal(definition.earnRules[0].eventType, "order.completed");
  assert.equal(loyaltyProgramChecksum(definition), loyaltyProgramChecksum({ ...definition }));
  assert.throws(() => validateLoyaltyProgramDefinition({ maxPointsPerTransaction: 100, fraudReviewThreshold: 101, tiers: [{ name: "Member", minimumLifetimePoints: 0 }] }), /fraudReviewThreshold/);
  assert.throws(() => validateLoyaltyProgramDefinition({ maxPointsPerTransaction: 1000, fraudReviewThreshold: 500, tiers: [{ name: "Gold", minimumLifetimePoints: 100 }] }), /first tier/);
});


test("journey branching validates forward-only targets and evaluates real values", () => {
  const definition = validateWorkflowDefinition({
    trigger: { event: "manual" },
    steps: [
      { type: "condition", config: { condition: { source: "contact", field: "score", operator: "greater_or_equal", value: 70 }, onTrueIndex: 2, onFalseIndex: 1 } },
      { type: "exit", config: { exitType: "disqualified", reason: "Score below threshold" } },
      { type: "goal", config: { key: "qualified", name: "Qualified customer", exitOnMatch: true } },
    ],
  });
  assert.equal(definition.steps.length, 3);
  assert.equal(evaluateWorkflowCondition({ source: "contact", field: "score", operator: "greater_or_equal", value: 70 }, { contact: { score: 75 } }), true);
  assert.equal(evaluateWorkflowCondition({ source: "contact", field: "tags", operator: "contains", value: "vip" }, { contact: { tags: ["vip"] } }), true);
  assert.throws(() => validateWorkflowDefinition({ trigger: { event: "manual" }, steps: [{ type: "condition", config: { condition: { source: "contact", field: "score", operator: "equals", value: 1 }, onTrueIndex: 0, onFalseIndex: 1 } }] }), /later step/);
});

test("experiment assignment is deterministic and weighted variants are governed", () => {
  const definition = validateWorkflowDefinition({
    trigger: { event: "manual" },
    steps: [
      { type: "experiment", config: { experimentKey: "subject-test", variants: [{ id: "a", name: "A", weight: 50, targetIndex: 1 }, { id: "b", name: "B", weight: 50, targetIndex: 2 }] } },
      { type: "exit", config: { exitType: "neutral", reason: "A" } },
      { type: "exit", config: { exitType: "neutral", reason: "B" } },
    ],
  });
  const variants = definition.steps[0].config.variants as Array<{ id: string; name: string; weight: number; targetIndex: number }>;
  assert.equal(chooseExperimentVariant("enrollment-1", variants).id, chooseExperimentVariant("enrollment-1", variants).id);
  assert.throws(() => validateWorkflowDefinition({ trigger: { event: "manual" }, steps: [{ type: "experiment", config: { variants: [{ id: "a", name: "A", weight: 20, targetIndex: 1 }, { id: "b", name: "B", weight: 20, targetIndex: 1 }] } }, { type: "exit", config: { reason: "done" } }] }), /total 100/);
});


test("segment definitions are allowlisted and checksummed", () => {
  const definition = validateSegmentDefinition({ combinator: "and", conditions: [{ field: "status", operator: "equals", value: "customer" }, { field: "score", operator: "greater_or_equal", value: 70 }] });
  assert.equal(definition.conditions.length, 2);
  assert.equal(segmentDefinitionChecksum(definition), segmentDefinitionChecksum({ ...definition }));
  assert.throws(() => validateSegmentDefinition({ combinator: "and", conditions: [{ field: "raw_sql", operator: "equals", value: "1=1" }] }), /Unsupported segment field/);
  assert.throws(() => validateSegmentDefinition({ combinator: "and", conditions: [{ field: "status", operator: "greater_than", value: "lead" }] }), /not supported/);
});

test("personalization variants are governed and deterministic", () => {
  const definition = validatePersonalizationDefinition({ fallback: { headline: "Default" }, variants: [{ id: "control", name: "Control", weight: 50, payload: { headline: "A" } }, { id: "offer", name: "Offer", weight: 50, payload: { headline: "B" } }] });
  assert.equal(definition.variants.length, 2);
  assert.equal(personalizationDefinitionChecksum(definition), personalizationDefinitionChecksum({ ...definition }));
  assert.throws(() => validatePersonalizationDefinition({ variants: [{ id: "a", name: "A", weight: 40, payload: {} }, { id: "b", name: "B", weight: 40, payload: {} }] }), /total 100/);
});


test("release readiness is evidence based, expirable, and revocable", () => {
  const now = new Date("2026-08-04T00:00:00.000Z");
  const base = RELEASE_VALIDATION_CONTROLS.map((control, index): ReleaseValidationEvent => ({
    id: `event-${index}`,
    controlKey: control.key,
    action: "recorded",
    result: "passed",
    environment: "staging",
    summary: `Validated ${control.key} with retained evidence`,
    evidenceReference: `https://evidence.example/${index}`,
    evidence: {},
    targetEventId: null,
    expiresAt: null,
    occurredAt: new Date(now.getTime() - 60_000 + index),
    createdByUserId: "user-1",
  }));

  const ready = deriveReleaseReadiness(base, now);
  assert.equal(ready.status, "ready");
  assert.equal(ready.requiredPassed, ready.requiredTotal);
  assert.equal(ready.scope, "recorded_validation_evidence");

  const expired = deriveReleaseReadiness([
    ...base.filter((event) => event.controlKey !== "security.assessment"),
    { ...base.find((event) => event.controlKey === "security.assessment")!, expiresAt: new Date(now.getTime() - 1) },
  ], now);
  assert.equal(expired.status, "not_ready");
  assert.equal(expired.controls.find((control) => control.key === "security.assessment")?.status, "expired");

  const revoked = deriveReleaseReadiness([
    ...base,
    {
      id: "revocation-1",
      controlKey: "database.rls",
      action: "revoked",
      result: null,
      environment: "staging",
      summary: "Evidence invalidated after database role changed",
      evidenceReference: null,
      evidence: {},
      targetEventId: base.find((event) => event.controlKey === "database.rls")!.id,
      expiresAt: null,
      occurredAt: new Date(now.getTime() + 1),
      createdByUserId: "user-1",
    },
  ], now);
  assert.equal(revoked.status, "not_ready");
  assert.equal(revoked.controls.find((control) => control.key === "database.rls")?.status, "revoked");
});

test("release validation input rejects unsupported and evidence-free claims", () => {
  assert.throws(() => normalizeReleaseValidationInput({}), /Unknown validation control/);
  assert.throws(() => normalizeReleaseValidationInput({
    controlKey: "database.rls",
    result: "passed",
    environment: "staging",
    summary: "too short",
    evidenceReference: "",
    idempotencyKey: "request-1",
  }), /evidence summary|evidence reference/i);

  const normalized = normalizeReleaseValidationInput({
    controlKey: "database.rls",
    result: "passed",
    environment: "production-copy",
    summary: "Cross-tenant queries were denied through the real application role.",
    evidenceReference: "https://evidence.example/rls",
    idempotencyKey: "request-2",
    evidence: { reviewer: "security" },
  });
  assert.equal(normalized.controlKey, "database.rls");
  assert.equal(normalized.result, "passed");
  assert.deepEqual(normalized.evidence, { reviewer: "security" });
});

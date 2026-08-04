export const SUPPORTED_RESEND_EMAIL_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);

export type ResendWebhookTag = { name?: string; value?: string };

export type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    tags?: Record<string, string> | ResendWebhookTag[];
    bounce?: { message?: string; type?: string; subType?: string };
    failed?: { reason?: string };
    error?: { message?: string } | string;
  };
};


export type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export type ResendWebhookVerifier = {
  webhooks: {
    verify(input: {
      payload: string;
      headers: ResendWebhookHeaders;
      webhookSecret: string;
    }): unknown;
  };
};

export function verifyResendWebhook(
  client: ResendWebhookVerifier,
  payload: string,
  headers: ResendWebhookHeaders,
  webhookSecret: string,
): ResendWebhookEvent {
  return client.webhooks.verify({ payload, headers, webhookSecret }) as ResendWebhookEvent;
}

const TERMINAL_STATUSES = new Set([
  "delivered",
  "bounced",
  "complained",
  "failed",
  "suppressed",
]);

export function resendEventStatus(type: string): string | null {
  switch (type) {
    case "email.sent": return "accepted";
    case "email.delivered": return "delivered";
    case "email.delivery_delayed": return "delayed";
    case "email.bounced": return "bounced";
    case "email.complained": return "complained";
    case "email.failed": return "failed";
    case "email.suppressed": return "suppressed";
    default: return null;
  }
}

export function resendProviderError(event: ResendWebhookEvent): string | null {
  const error = event.data?.error;
  if (typeof error === "string") return trimProviderMessage(error);
  if (error?.message) return trimProviderMessage(error.message);
  if (event.data?.failed?.reason) return trimProviderMessage(event.data.failed.reason);
  if (event.data?.bounce?.message) return trimProviderMessage(event.data.bounce.message);
  return null;
}

export function resendDeliveryId(event: ResendWebhookEvent): string | null {
  const tags = event.data?.tags;
  if (!tags) return null;
  if (Array.isArray(tags)) {
    const match = tags.find((tag) => tag?.name === "nxtgen_delivery_id");
    return typeof match?.value === "string" ? match.value : null;
  }
  const value = tags.nxtgen_delivery_id;
  return typeof value === "string" ? value : null;
}

export function shouldApplyResendStatus(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === nextStatus) return true;
  if (!TERMINAL_STATUSES.has(currentStatus)) return true;

  // Provider failure outcomes are allowed to supersede an earlier accepted or
  // delivered state. Less authoritative progress events must never downgrade a
  // terminal result when Resend retries or delivers events out of order.
  return ["complained", "bounced", "suppressed"].includes(nextStatus);
}

export function resendEventTime(event: ResendWebhookEvent, fallback = new Date()): Date {
  const raw = event.created_at;
  if (!raw) return fallback;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? fallback : new Date(timestamp);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function trimProviderMessage(value: string): string {
  return value.slice(0, 2000);
}

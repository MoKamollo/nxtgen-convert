import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const value = process.env.TRACKING_SIGNING_SECRET ?? process.env.SPACE_SSO_SECRET;
  if (!value || (process.env.NODE_ENV === "production" && value.length < 32)) throw new Error("TRACKING_SIGNING_SECRET must be configured");
  return value;
}

export function recipientTrackingId(email: string): string {
  return createHmac("sha256", secret()).update(email.trim().toLowerCase()).digest("base64url").slice(0, 32);
}

export function signTracking(campaignId: string, recipientId: string, destination: string): string {
  return createHmac("sha256", secret()).update(`${campaignId}\n${recipientId}\n${destination}`).digest("base64url");
}

export function verifyTracking(campaignId: string, recipientId: string, destination: string, signature: string): boolean {
  const expected = Buffer.from(signTracking(campaignId, recipientId, destination));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

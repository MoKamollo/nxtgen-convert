import { createHmac } from "crypto";

export type IdentityType = "email" | "phone" | "external_id";

function secret(): string {
  const value = process.env.IDENTITY_HASHING_SECRET ?? process.env.TRACKING_SIGNING_SECRET;
  if (!value || (process.env.NODE_ENV === "production" && value.length < 32)) {
    throw new Error("IDENTITY_HASHING_SECRET must be configured");
  }
  return value;
}

export function normalizeIdentity(type: IdentityType, rawValue: string): string {
  const value = rawValue.trim();
  if (type === "email") {
    const normalized = value.toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized) || normalized.length > 320) throw new Error("Invalid email identity");
    return normalized;
  }
  if (type === "phone") {
    const normalized = value.replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "");
    const digits = normalized.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) throw new Error("Invalid phone identity");
    return normalized.startsWith("+") ? `+${digits}` : digits;
  }
  if (!value || value.length > 500) throw new Error("Invalid external identity");
  return value;
}

export function hashIdentity(type: IdentityType, normalizedValue: string): string {
  return createHmac("sha256", secret()).update(`${type}\n${normalizedValue}`).digest("base64url");
}

export function identityHint(type: IdentityType, normalizedValue: string): string {
  if (type === "email") {
    const [local, domain] = normalizedValue.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (type === "phone") return `***${normalizedValue.replace(/\D/g, "").slice(-4)}`;
  return `${normalizedValue.slice(0, 4)}***`;
}

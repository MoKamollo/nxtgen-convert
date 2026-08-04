import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

export function requestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function clientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
}

export function hashSensitive(value: string): string {
  const pepper = process.env.SECURITY_HASH_PEPPER ?? process.env.SPACE_SSO_SECRET;
  if (!pepper || (process.env.NODE_ENV === "production" && pepper.length < 32)) {
    if (process.env.NODE_ENV === "production") throw new Error("SECURITY_HASH_PEPPER must be configured with at least 32 characters");
    return createHash("sha256").update(`development-only:${value}`).digest("hex");
  }
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export function isSameOriginMutation(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export function isValidCsrfToken(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const cookie = request.cookies.get("convert_csrf")?.value ?? "";
  const header = request.headers.get("x-csrf-token") ?? "";
  if (cookie.length < 32 || header.length !== cookie.length) return false;
  try { return timingSafeEqual(Buffer.from(cookie), Buffer.from(header)); } catch { return false; }
}

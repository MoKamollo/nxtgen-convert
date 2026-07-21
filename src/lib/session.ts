import { createHmac } from "crypto";

const SECRET = process.env.SPACE_SSO_SECRET ?? "dev-secret-change-in-prod";
const COOKIE_NAME = "convert_sess";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  plan: string;
}

function b64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function sign(header: string, body: string): string {
  return createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
}

export function signSession(payload: SessionPayload): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  return `${header}.${body}.${sign(header, body)}`;
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    if (sign(header, body) !== sig) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

export function cookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}; Secure`;
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export { COOKIE_NAME };

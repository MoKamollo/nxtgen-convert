const COOKIE_NAME = "convert_sess";
const COOKIE_MAX_AGE = 60 * 60 * 12;
const SESSION_TTL_SECONDS = COOKIE_MAX_AGE;
const SESSION_ISSUER = "nxtgen-convert";
const SESSION_AUDIENCE = "nxtgen-convert-app";

function getSecret(): string {
  const secret = process.env.SPACE_SSO_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SPACE_SSO_SECRET must be at least 32 characters in production");
  }
  return "development-only-secret-change-before-production";
}

export interface SessionPayload {
  sessionId: string;
  userId: string;
  membershipId: string;
  membershipVersion: number;
  userAuthVersion: number;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  jti?: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

function b64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(header: string, body: string): Promise<string> {
  const key = await getKey();
  const data = new TextEncoder().encode(`${header}.${body}`);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Buffer.from(signature).toString("base64url");
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({
    ...payload,
    jti: payload.sessionId,
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }));
  const signature = await sign(header, body);
  return `${header}.${body}.${signature}`;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString()) as Record<string, unknown>;
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;

    const key = await getKey();
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!isValid) return null;

    const decoded = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.iss !== SESSION_ISSUER || decoded.aud !== SESSION_AUDIENCE) return null;
    if (!decoded.exp || decoded.exp <= now) return null;
    if (!decoded.iat || decoded.iat > now + 60) return null;
    if (!decoded.sessionId || decoded.jti !== decoded.sessionId) return null;
    if (!decoded.userId || !decoded.membershipId || !decoded.tenantId) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function cookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export { COOKIE_NAME, SESSION_TTL_SECONDS };

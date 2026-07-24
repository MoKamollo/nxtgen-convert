const COOKIE_NAME = "convert_sess";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SESSION_TTL_SECONDS = COOKIE_MAX_AGE;

function getSecret(): string {
  if (process.env.SPACE_SSO_SECRET) return process.env.SPACE_SSO_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("SPACE_SSO_SECRET environment variable is required in production");
  return "dev-secret-change-in-prod";
}

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
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return Buffer.from(sig).toString("base64url");
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + SESSION_TTL_SECONDS }));
  const sig = await sign(header, body);
  return `${header}.${body}.${sig}`;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = await sign(header, body);
    if (expected !== sig) return null;
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString());
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded as SessionPayload;
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

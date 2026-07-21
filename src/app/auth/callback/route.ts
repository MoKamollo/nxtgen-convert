import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signSession, cookieHeader } from "@/lib/session";

const SECRET = process.env.SPACE_SSO_SECRET ?? "dev-secret-change-in-prod";

function b64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString();
}

function verifySpaceToken(token: string): Record<string, string> | null {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = createHmac("sha256", SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (expected !== sig) return null;
    const payload = JSON.parse(b64urlDecode(body));
    if (payload.aud !== "nxtgen_convert") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const payload = verifySpaceToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
  }

  const { sub: userId, tenant_id: tenantId, email, name, role, plan } = payload;

  // Auto-create org on first SSO login
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, tenantId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(organizations).values({
      id: tenantId,
      name: name + "'s Workspace",
      slug: tenantId,
      plan: "starter",
    });
  }

  const sessionToken = signSession({ userId, tenantId, email, name, role, plan });
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.headers.set("Set-Cookie", cookieHeader(sessionToken));
  return response;
}

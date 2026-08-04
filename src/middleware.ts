import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/authz";
import { verifySession, COOKIE_NAME } from "@/lib/session";

const CSRF_COOKIE_NAME = "convert_csrf";

function finalize(response: NextResponse, request: NextRequest): NextResponse {
  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    response.cookies.set(CSRF_COOKIE_NAME, crypto.randomUUID().replace(/-/g, ""), {
      httpOnly: false, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
    });
  }
  return response;
}

const PUBLIC = [
  "/login",
  "/sign-up",
  "/forgot-password",
  "/auth/callback",
  "/invite/accept",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/verified",
  "/api/auth/forgot-password",
  "/api/public",
  "/api/integrations/stripe/webhook",
  "/api/integrations/resend/webhook",
  "/api/cron",
  "/survey",
  "/api/nps/submit",
  "/api/track",
  "/api/unsubscribe",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC.some((path) => pathname.startsWith(path))
    || /^\/api\/forms\/[^/]+\/(submit|embed)$/.test(pathname)
    || /^\/api\/broadcasts\/[^/]+\/dispatch$/.test(pathname)
    || /^\/api\/automation\/resume\/[^/]+$/.test(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySession(token) : null;
    if (session) return finalize(NextResponse.redirect(new URL("/dashboard", request.url)), request);
    return finalize(NextResponse.next(), request);
  }

  if (isPublicPath(pathname)) {
    const headers = new Headers(request.headers);
    headers.set("x-request-id", requestId);
    return finalize(NextResponse.next({ request: { headers } }), request);
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return finalize(NextResponse.json({ error: "Not authenticated", requestId }, { status: 401 }), request);
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return finalize(NextResponse.redirect(loginUrl), request);
  }

  if (pathname.startsWith("/api/") && !isAuthorized(session.role, pathname, request.method)) {
    return finalize(NextResponse.json({ error: "Insufficient permissions", requestId }, { status: 403 }), request);
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-tenant-id", session.tenantId);
  headers.set("x-user-id", session.userId);
  headers.set("x-user-role", session.role);
  headers.set("x-session-id", session.sessionId);
  headers.set("x-membership-id", session.membershipId);
  headers.set("x-membership-version", String(session.membershipVersion));
  headers.set("x-user-auth-version", String(session.userAuthVersion));

  return finalize(NextResponse.next({ request: { headers } }), request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};

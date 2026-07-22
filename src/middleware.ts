import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/session";

const PUBLIC = ["/login", "/sign-up", "/auth/callback", "/api/auth/login", "/api/auth/logout", "/api/auth/register", "/survey", "/api/nps/submit"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Landing page: unauthenticated users see it, authenticated users go to dashboard
  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySession(token) : null;
    if (session) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const headers = new Headers(request.headers);
  headers.set("x-tenant-id", session.tenantId);
  headers.set("x-user-id", session.userId);
  headers.set("x-user-role", session.role);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};

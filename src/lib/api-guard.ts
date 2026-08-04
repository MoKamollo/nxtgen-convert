import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, withTenantDatabase } from "@/db";
import { authSessions, organizationMemberships, users } from "@/db/schema";
import { isAuthorized } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, hashSensitive, isSameOriginMutation, isValidCsrfToken, requestId } from "@/lib/request-security";
import { enqueueWebhookEvent, processDueWebhookDeliveries } from "@/lib/webhooks";
import { authenticateApiKey } from "@/lib/api-keys";
import { recordOperationalEvent } from "@/lib/operations";

export type RouteContext = { params?: Promise<Record<string, string>> };
export type RouteHandler<TContext = RouteContext> = (request: NextRequest, context: TContext) => Promise<Response> | Response;

function responseWithRateHeaders(response: Response, remaining: number, resetAt: Date): Response {
  response.headers.set("x-ratelimit-remaining", String(remaining));
  response.headers.set("x-ratelimit-reset", resetAt.toISOString());
  return response;
}

export function withApiGuard<TContext = RouteContext>(handler: RouteHandler<TContext>): RouteHandler<TContext> {
  return async (request, context) => {
    const id = requestId(request);
    const ipHash = hashSensitive(clientIp(request));
    const userAgentHash = hashSensitive(request.headers.get("user-agent") ?? "unknown");
    const tenantId = request.headers.get("x-tenant-id");
    const userId = request.headers.get("x-user-id");
    const sessionId = request.headers.get("x-session-id");
    const membershipId = request.headers.get("x-membership-id");

    if (!tenantId || !userId || !sessionId || !membershipId) {
      await recordAudit({ action: "api.authentication", result: "denied", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname } });
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [state] = await db.select({
      sessionId: authSessions.id,
      sessionMembershipVersion: authSessions.membershipVersion,
      sessionUserAuthVersion: authSessions.userAuthVersion,
      role: organizationMemberships.role,
      membershipVersion: organizationMemberships.version,
      membershipStatus: organizationMemberships.status,
      userAuthVersion: users.authVersion,
    }).from(authSessions)
      .innerJoin(organizationMemberships, eq(organizationMemberships.id, authSessions.membershipId))
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(and(
        eq(authSessions.id, sessionId),
        eq(authSessions.organizationId, tenantId),
        eq(authSessions.userId, userId),
        eq(authSessions.membershipId, membershipId),
        eq(organizationMemberships.organizationId, tenantId),
        eq(organizationMemberships.userId, userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      )).limit(1);

    const sessionValid = state && state.membershipStatus === "active"
      && state.sessionMembershipVersion === state.membershipVersion
      && state.sessionUserAuthVersion === state.userAuthVersion;
    if (!sessionValid) {
      await recordAudit({ organizationId: tenantId, actorUserId: userId, action: "api.session_validation", result: "denied", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname } });
      return NextResponse.json({ error: "Session expired or access changed. Sign in again." }, { status: 401 });
    }

    if (!isAuthorized(state.role, request.nextUrl.pathname, request.method)) {
      await recordAudit({ organizationId: tenantId, actorUserId: userId, action: "api.authorization", result: "denied", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname, method: request.method, role: state.role } });
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    if (!isSameOriginMutation(request) || !isValidCsrfToken(request)) {
      await recordAudit({ organizationId: tenantId, actorUserId: userId, action: "api.csrf_validation", result: "denied", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname } });
      return NextResponse.json({ error: "Request verification failed" }, { status: 403 });
    }

    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
    const rate = await checkRateLimit(`${tenantId}:${userId}:${clientIp(request)}`, request.nextUrl.pathname, mutation ? 120 : 300, 60);
    if (!rate.allowed) {
      await recordAudit({ organizationId: tenantId, actorUserId: userId, action: "api.rate_limit", result: "denied", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname } });
      return responseWithRateHeaders(NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }), rate.remaining, rate.resetAt);
    }

    const started = Date.now();
    try {
      const response = await withTenantDatabase(tenantId, () => Promise.resolve(handler(request, context)));
      const result = response.status >= 200 && response.status < 400 ? "success" : "failure";
      if (response.status >= 500) {
        await recordOperationalEvent({
          organizationId: tenantId,
          severity: "error",
          component: "api",
          event: "request_failed",
          requestId: id,
          errorCode: `http_${response.status}`,
          message: `API request returned ${response.status}`,
          metadata: { path: request.nextUrl.pathname, method: request.method, durationMs: Date.now() - started },
        });
      }
      if (mutation) {
        const action = `api.${request.nextUrl.pathname.replace(/^\/api\//, "").replace(/\//g, ".")}.${request.method.toLowerCase()}`;
        await recordAudit({
          organizationId: tenantId,
          actorUserId: userId,
          action,
          targetType: request.nextUrl.pathname.split("/")[2] ?? "api",
          result,
          requestId: id,
          ipHash,
          userAgentHash,
          metadata: { method: request.method, path: request.nextUrl.pathname, status: response.status, durationMs: Date.now() - started },
        });
        if (result === "success") {
          await enqueueWebhookEvent(tenantId, action, { requestId: id, actorUserId: userId, path: request.nextUrl.pathname, method: request.method, occurredAt: new Date().toISOString() });
          await processDueWebhookDeliveries(10);
        }
      }
      return responseWithRateHeaders(response, rate.remaining, rate.resetAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await recordAudit({ organizationId: tenantId, actorUserId: userId, action: "api.unhandled_error", result: "failure", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname, error: message } });
      await recordOperationalEvent({
        organizationId: tenantId,
        severity: "error",
        component: "api",
        event: "unhandled_exception",
        requestId: id,
        errorCode: error instanceof Error ? error.name : "unknown_error",
        message,
        metadata: { path: request.nextUrl.pathname, method: request.method, durationMs: Date.now() - started },
      });
      console.error("[api-guard]", error);
      return NextResponse.json({ error: "Server error", requestId: id }, { status: 500 });
    }
  };
}

export function withApiKeyGuard<TContext = RouteContext>(requiredScope: string, handler: RouteHandler<TContext>): RouteHandler<TContext> {
  return async (request, context) => {
    const id = requestId(request);
    const ipHash = hashSensitive(clientIp(request));
    const userAgentHash = hashSensitive(request.headers.get("user-agent") ?? "unknown");
    const authorization = request.headers.get("authorization");
    const rawKey = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!rawKey.startsWith("nxg_live_")) {
      await recordAudit({ actorType: "api_key", action: "api_key.authentication", result: "denied", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname } });
      return NextResponse.json({ error: "Valid API key required", requestId: id }, { status: 401 });
    }
    const key = await authenticateApiKey(rawKey, requiredScope);
    if (!key) {
      await recordAudit({ actorType: "api_key", action: "api_key.authentication", result: "denied", requestId: id, ipHash, userAgentHash, metadata: { path: request.nextUrl.pathname, requiredScope } });
      return NextResponse.json({ error: "Invalid, expired, revoked, or insufficiently scoped API key", requestId: id }, { status: 401 });
    }
    const rate = await checkRateLimit(`${key.organizationId}:${key.id}`, request.nextUrl.pathname, 300, 60);
    if (!rate.allowed) return responseWithRateHeaders(NextResponse.json({ error: "Rate limit exceeded", requestId: id }, { status: 429 }), rate.remaining, rate.resetAt);
    const headers = new Headers(request.headers);
    headers.set("x-tenant-id", key.organizationId);
    headers.set("x-api-key-id", key.id);
    headers.set("x-request-id", id);
    const guarded = new NextRequest(request, { headers });
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
    const action = `public_api.${request.nextUrl.pathname.replace(/^\/api\/public\/v1\//, "").replace(/\//g, ".")}.${request.method.toLowerCase()}`;
    try {
      const response = await withTenantDatabase(key.organizationId, () => Promise.resolve(handler(guarded, context)));
      const result = response.status >= 200 && response.status < 400 ? "success" : "failure";
      await recordAudit({ organizationId: key.organizationId, actorType: "api_key", action, result, requestId: id, ipHash, userAgentHash, metadata: { apiKeyId: key.id, requiredScope, status: response.status } });
      if (mutation && result === "success") {
        await enqueueWebhookEvent(key.organizationId, action, { requestId: id, apiKeyId: key.id, occurredAt: new Date().toISOString() });
      }
      return responseWithRateHeaders(response, rate.remaining, rate.resetAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await recordAudit({ organizationId: key.organizationId, actorType: "api_key", action, result: "failure", requestId: id, ipHash, userAgentHash, metadata: { apiKeyId: key.id, error: message } });
      await recordOperationalEvent({
        organizationId: key.organizationId,
        severity: "error",
        component: "public_api",
        event: "unhandled_exception",
        requestId: id,
        errorCode: error instanceof Error ? error.name : "unknown_error",
        message,
        metadata: { path: request.nextUrl.pathname, requiredScope, apiKeyId: key.id },
      });
      return NextResponse.json({ error: "Server error", requestId: id }, { status: 500 });
    }
  };
}

import { randomUUID } from "crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, organizationMemberships, organizations, users } from "@/db/schema";
import { hashSensitive } from "@/lib/request-security";
import { SESSION_TTL_SECONDS, type SessionPayload } from "@/lib/session";
import type { UserRole } from "@/lib/authz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRole(role: unknown): UserRole {
  switch (String(role ?? "").toLowerCase()) {
    case "owner": return "owner";
    case "admin": return "admin";
    case "manager":
    case "editor": return "manager";
    case "viewer": return "viewer";
    default: return "member";
  }
}

function mapPlan(plan: unknown): "starter" | "professional" | "enterprise" | "unlimited" {
  switch (String(plan ?? "").toLowerCase()) {
    case "professional":
    case "pro": return "professional";
    case "enterprise": return "enterprise";
    case "unlimited": return "unlimited";
    default: return "starter";
  }
}

function slugFor(externalTenantId: string): string {
  const base = externalTenantId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export interface SpaceIdentity {
  externalUserId: string;
  externalTenantId: string;
  email: string;
  name: string;
  role: unknown;
  plan: unknown;
}

export async function provisionAuthenticatedSession(
  identity: SpaceIdentity,
  requestMeta: { ip: string; userAgent: string },
): Promise<SessionPayload> {
  if (!identity.externalUserId || !identity.externalTenantId || !identity.email || !identity.name) {
    throw new Error("Space identity response is missing required fields");
  }
  const normalizedEmail = identity.email.trim().toLowerCase();
  const externalRole = mapRole(identity.role);
  const plan = mapPlan(identity.plan);

  return db.transaction(async (tx) => {
    let [organization] = await tx.select().from(organizations)
      .where(eq(organizations.spaceTenantId, identity.externalTenantId)).limit(1);
    if (!organization && UUID_RE.test(identity.externalTenantId)) {
      const [legacyOrganization] = await tx.select().from(organizations)
        .where(eq(organizations.id, identity.externalTenantId)).limit(1);
      if (legacyOrganization?.spaceTenantId && legacyOrganization.spaceTenantId !== identity.externalTenantId) {
        throw new Error("Tenant identity collision detected");
      }
      organization = legacyOrganization;
    }
    let organizationCreated = false;
    if (!organization) {
      [organization] = await tx.insert(organizations).values({
        ...(UUID_RE.test(identity.externalTenantId) ? { id: identity.externalTenantId } : {}),
        name: `${identity.name}'s Workspace`,
        slug: slugFor(identity.externalTenantId),
        spaceTenantId: identity.externalTenantId,
        plan,
      }).returning();
      organizationCreated = true;
    } else {
      await tx.update(organizations).set({ spaceTenantId: identity.externalTenantId, plan, updatedAt: new Date() }).where(eq(organizations.id, organization.id));
    }

    let [user] = await tx.select().from(users).where(eq(users.spaceUserId, identity.externalUserId)).limit(1);
    if (!user) {
      const emailMatches = await tx.select().from(users).where(and(
        sql`lower(${users.email}) = ${normalizedEmail}`,
        or(isNull(users.spaceUserId), eq(users.spaceUserId, identity.externalUserId)),
      )).limit(2);
      if (emailMatches.length > 1) throw new Error("Ambiguous legacy identity requires owner resolution");
      user = emailMatches[0];
    }
    if (!user) {
      [user] = await tx.insert(users).values({
        spaceUserId: identity.externalUserId,
        email: normalizedEmail,
        name: identity.name,
        organizationId: organization.id,
        role: externalRole,
      }).returning();
    } else {
      [user] = await tx.update(users).set({
        spaceUserId: identity.externalUserId,
        email: normalizedEmail,
        name: identity.name,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, user.id)).returning();
    }

    let [membership] = await tx.select().from(organizationMemberships).where(and(
      eq(organizationMemberships.organizationId, organization.id),
      eq(organizationMemberships.userId, user.id),
    )).limit(1);
    if (!membership) {
      [membership] = await tx.insert(organizationMemberships).values({
        organizationId: organization.id,
        userId: user.id,
        role: organizationCreated ? "owner" : externalRole,
        status: "active",
      }).returning();
    }
    if (membership.status !== "active") throw new Error("Convert membership is not active");

    // Keep legacy columns synchronized while older modules are migrated to memberships.
    await tx.update(users).set({ organizationId: organization.id, role: membership.role, lastActiveAt: new Date() }).where(eq(users.id, user.id));

    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    const [session] = await tx.insert(authSessions).values({
      organizationId: organization.id,
      userId: user.id,
      membershipId: membership.id,
      membershipVersion: membership.version,
      userAuthVersion: user.authVersion,
      ipHash: hashSensitive(requestMeta.ip),
      userAgentHash: hashSensitive(requestMeta.userAgent),
      expiresAt,
    }).returning();

    return {
      sessionId: session.id,
      userId: user.id,
      membershipId: membership.id,
      membershipVersion: membership.version,
      userAuthVersion: user.authVersion,
      tenantId: organization.id,
      email: normalizedEmail,
      name: user.name,
      role: membership.role,
      plan: organization.plan ?? plan,
    };
  });
}

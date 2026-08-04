export type UserRole = "owner" | "admin" | "manager" | "member" | "viewer";

const ROLE_LEVEL: Record<UserRole, number> = {
  viewer: 0,
  member: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

const SELF_SERVICE_PREFIXES = [
  "/api/users/me",
  "/api/users/password",
  "/api/sessions",
  "/api/invitations/accept",
];

/**
 * Administrative resources contain tenant configuration, credentials, access
 * policy, audit evidence, or operational diagnostics. Read access is therefore
 * restricted as strongly as mutation access; a safe HTTP verb does not make
 * sensitive data safe for a viewer.
 */
export const ADMINISTRATIVE_PREFIXES = [
  "/api/org",
  "/api/team",
  "/api/integrations",
  "/api/api-keys",
  "/api/webhooks",
  "/api/ai/scoring/model",
  "/api/audit",
  "/api/operations",
] as const;

const MANAGER_PREFIXES = [
  "/api/campaigns",
  "/api/broadcasts",
  "/api/email-templates",
  "/api/workflows",
  "/api/automation",
  "/api/products",
  "/api/orders",
  "/api/subscriptions",
  "/api/affiliates",
  "/api/marketing-spend",
  "/api/marketing",
  "/api/social-posts",
  "/api/forms",
  "/api/website",
  "/api/blog-posts",
  "/api/kb-articles",
  "/api/customer-success",
  "/api/loyalty",
  "/api/segments",
  "/api/personalization",
];

const MEMBER_MUTATION_PREFIXES = [
  "/api/contacts",
  "/api/companies",
  "/api/deals",
  "/api/activities",
  "/api/tasks",
  "/api/tickets",
  "/api/inbox",
  "/api/nps",
];

export function normalizeRole(value: string | null | undefined): UserRole | null {
  return value && value in ROLE_LEVEL ? value as UserRole : null;
}

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

export function minimumRoleForRequest(pathname: string, method: string): UserRole {
  const verb = method.toUpperCase();

  if (SELF_SERVICE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "viewer";

  // Administrative reads must be evaluated before the generic safe-method
  // allowance. This prevents viewers from reading credentials metadata,
  // integration configuration, audit evidence, team administration, and
  // operational diagnostics.
  if (ADMINISTRATIVE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "admin";

  if (["GET", "HEAD", "OPTIONS"].includes(verb)) return "viewer";
  if (MANAGER_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "manager";
  if (MEMBER_MUTATION_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "member";
  return "admin";
}

export function isAuthorized(role: string | null | undefined, pathname: string, method: string): boolean {
  const normalized = normalizeRole(role);
  return normalized ? roleAtLeast(normalized, minimumRoleForRequest(pathname, method)) : false;
}

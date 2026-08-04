export const API_KEY_SCOPES = [
  "contacts:read",
  "contacts:write",
  "events:write",
  "analytics:read",
  "personalization:decide",
  "*",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const ALLOWED_SCOPE_SET: ReadonlySet<string> = new Set(API_KEY_SCOPES);

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return ALLOWED_SCOPE_SET.has(value);
}

export function normalizeApiKeyScopes(input: unknown): ApiKeyScope[] {
  const requested = Array.isArray(input) ? input.map(String) : ["contacts:read"];
  return Array.from(new Set(requested.filter(isApiKeyScope)));
}

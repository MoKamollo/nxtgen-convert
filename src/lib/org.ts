const CSRF_COOKIE_NAME = "convert_csrf";

function cookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return null;
}

export function apiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  if (params) Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.pathname + url.search;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = cookieValue(CSRF_COOKIE_NAME);
    if (token) headers.set("x-csrf-token", token);
  }
  const response = await globalThis.fetch(input, { ...init, headers });
  if (response.status === 401 && typeof window !== "undefined") {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url.includes("/api/auth/")) {
      window.location.href = "/login";
    }
  }
  return response;
}

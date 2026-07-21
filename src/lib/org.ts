export function apiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.pathname + url.search;
}

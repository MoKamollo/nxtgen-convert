"use client";
import { useEffect, useState } from "react";

export interface SessionUser {
  tenantId: string;
  role: string;
  org: { id: string; name: string; plan: string } | null;
  user: { id: string; name: string; email: string; jobTitle: string | null; avatar: string | null } | null;
}

let cached: SessionUser | null = null;
let promise: Promise<SessionUser | null> | null = null;

async function fetchSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch("/api/users/me");
    if (!res.ok) return null;
    const data = await res.json();
    cached = data;
    return data;
  } catch {
    return null;
  }
}

export function useSession() {
  const [session, setSession] = useState<SessionUser | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) { setSession(cached); setLoading(false); return; }
    if (!promise) promise = fetchSession();
    promise.then((s) => { setSession(s); setLoading(false); });
  }, []);

  return { session, loading };
}

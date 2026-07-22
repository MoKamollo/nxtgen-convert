"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const urlError = params.get("error");
  const errorMessages: Record<string, string> = {
    missing_token: "SSO token missing. Please try again.",
    invalid_token: "SSO token invalid or expired. Please log in.",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const next = params.get("next") ?? "/dashboard";
      const res = await fetch(`/api/auth/login?next=${encodeURIComponent(next)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }

      router.push(data.redirect ?? "/dashboard");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#162440] bg-[#080F1E] p-8">
      <h1 className="text-xl font-bold text-white mb-1">Welcome back</h1>
      <p className="text-sm text-[#64748b] mb-6">Sign in with your NxtGen Space account</p>

      {(urlError || error) && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 mb-5">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error || errorMessages[urlError ?? ""] || "Something went wrong"}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Email</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-3 text-sm text-white placeholder:text-[#334155] focus:outline-none focus:border-[#7B6EF6] transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Password</label>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-10 rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-3 text-sm text-white placeholder:text-[#334155] focus:outline-none focus:border-[#7B6EF6] transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-gradient-to-r from-[#7B6EF6] to-[#3B9EFF] text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Signing in…" : (
            <>Sign in <ArrowRight size={14} /></>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-[#475569] mt-6">
        No account?{" "}
        <a href="https://space.nxtgen-stack.com/sign-up" className="text-[#7B6EF6] hover:underline">
          Sign up at NxtGen Space
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#04080F] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image src="/nxtgen-logo.png" alt="NxtGen" width={160} height={60} priority />
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

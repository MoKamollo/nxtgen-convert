"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";

function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }

      if (data.verify) {
        setVerified(true);
        return;
      }

      const next = params.get("next") ?? data.redirect ?? "/dashboard";
      router.push(next);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (verified) return (
    <div className="rounded-2xl border border-[#162440] bg-[#080F1E] p-8 text-center">
      <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
      <h1 className="text-xl font-bold text-white mb-2">Check your email</h1>
      <p className="text-sm text-[#64748b] mb-6">We sent a verification link to <span className="text-white">{email}</span>. Click it to activate your account then sign in.</p>
      <a href="/login" className="inline-flex items-center gap-2 h-10 px-6 rounded-lg bg-gradient-to-r from-[#7B6EF6] to-[#3B9EFF] text-sm font-semibold text-white hover:opacity-90 transition-opacity">
        Go to sign in <ArrowRight size={14} />
      </a>
    </div>
  );

  return (
    <div className="rounded-2xl border border-[#162440] bg-[#080F1E] p-8">
      <h1 className="text-xl font-bold text-white mb-1">Create your account</h1>
      <p className="text-sm text-[#64748b] mb-6">Start your free NxtGen Convert trial</p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 mb-5">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Full name</label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mohamed Kamal"
              className="w-full h-10 rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-3 text-sm text-white placeholder:text-[#334155] focus:outline-none focus:border-[#7B6EF6] transition-colors"
            />
          </div>
        </div>

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
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Password <span className="text-[#475569]">(min. 12 characters)</span></label>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            <input
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full h-10 rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-3 text-sm text-white placeholder:text-[#334155] focus:outline-none focus:border-[#7B6EF6] transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-gradient-to-r from-[#7B6EF6] to-[#3B9EFF] text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Creating account…" : (
            <>Create account <ArrowRight size={14} /></>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-[#475569] mt-6">
        Already have an account?{" "}
        <a href="/login" className="text-[#7B6EF6] hover:underline">Sign in</a>
      </p>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#04080F] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div style={{ width: 158, height: 32, overflow: "hidden" }}>
            <img src="/nxg-logo-dark.svg" alt="NxtGen" style={{ height: 32, width: "auto" }} />
          </div>
          <span className="text-sm font-semibold tracking-widest text-violet-400 uppercase">Convert</span>
        </div>
        <Suspense>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  );
}

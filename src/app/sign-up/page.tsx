"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";

function SignUpForm() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed."); return; }
      if (data.verify) { setVerified(true); return; }
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
      <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={22} className="text-emerald-400" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Check your inbox</h1>
      <p className="text-sm text-[#64748b] mb-1">We sent a verification link to</p>
      <p className="text-sm font-medium text-white mb-6">{email}</p>
      <p className="text-xs text-[#475569] mb-6">Click the link to activate your account, then sign in here.</p>
      <a href="/login" className="w-full h-10 rounded-lg bg-gradient-to-r from-[#7B6EF6] to-[#3B9EFF] text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
        Go to sign in <ArrowRight size={14} />
      </a>
    </div>
  );

  return (
    <div className="rounded-2xl border border-[#162440] bg-[#080F1E] p-8">
      <h1 className="text-xl font-bold text-white mb-1">Create your account</h1>
      <p className="text-sm text-[#64748b] mb-6">
        Already have an account?{" "}
        <a href="/login" className="text-[#7B6EF6] hover:underline font-medium">Sign in</a>
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 mb-5">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Google OAuth */}
      <a
        href="/api/auth/google"
        className="w-full h-10 flex items-center justify-center gap-2.5 rounded-lg border border-[#1e293b] bg-[#0d1526] text-sm font-medium text-[#94a3b8] hover:border-[#7B6EF6] hover:text-white transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </a>

      <div className="relative flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-[#1e293b]" />
        <span className="text-xs text-[#334155] font-medium">or</span>
        <div className="flex-1 h-px bg-[#1e293b]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Full name</label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Mohamed Kamal"
              className="w-full h-10 rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-3 text-sm text-white placeholder:text-[#334155] focus:outline-none focus:border-[#7B6EF6] transition-colors" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Email</label>
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-3 text-sm text-white placeholder:text-[#334155] focus:outline-none focus:border-[#7B6EF6] transition-colors" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
            Password <span className="text-[#475569] font-normal">(min. 12 characters)</span>
          </label>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            <input type={showPw ? "text" : "password"} required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full h-10 rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-10 text-sm text-white placeholder:text-[#334155] focus:outline-none focus:border-[#7B6EF6] transition-colors" />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94a3b8] transition-colors">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="mt-2 space-y-1">
            <div className={`flex items-center gap-1.5 text-xs ${password.length >= 12 ? "text-emerald-400" : "text-[#475569]"}`}>
              <CheckCircle size={11} />At least 12 characters
            </div>
            <div className={`flex items-center gap-1.5 text-xs ${/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password) ? "text-emerald-400" : "text-[#475569]"}`}>
              <CheckCircle size={11} />Mix of letters and numbers
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full h-10 rounded-lg bg-gradient-to-r from-[#7B6EF6] to-[#3B9EFF] text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 mt-2">
          {loading ? "Creating account…" : <><span>Create account</span><ArrowRight size={14} /></>}
        </button>
      </form>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#04080F] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <a href="/" style={{ width: 158, height: 32, overflow: "hidden", display: "block" }}>
            <img src="/nxg-logo-dark.svg" alt="NxtGen" style={{ height: 32, width: "auto" }} />
          </a>
          <span className="text-sm font-semibold tracking-widest text-violet-400 uppercase">Convert</span>
        </div>
        <Suspense>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  );
}

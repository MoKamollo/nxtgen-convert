"use client";
import { AlertCircle, ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { useState } from "react";
export default function ForgotPassword() {
  const [email, setEmail] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reset link");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundColor: "#04080F",
        backgroundImage: 'url("/convert-bg.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <a href="/">
            <img src="/nxg-logo-dark.svg" alt="NxtGen" className="h-8" />
          </a>
          <span className="text-sm font-semibold tracking-widest text-violet-400 uppercase">
            Convergence
          </span>
        </div>
        <div className="rounded-2xl border border-[#162440] bg-[#080F1E]/90 p-8 backdrop-blur-sm">
          <h1 className="text-xl font-bold text-white">Reset your password</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            We will send a secure reset link through NxtGen Space.
          </p>
          {sent ? (
            <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <CheckCircle2 size={16} />
                Check your email
              </div>
              <p className="mt-2 text-xs leading-5 text-[#94a3b8]">
                A reset link has been requested for {email}. It may take a few
                minutes to arrive.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#94a3b8]">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#1e293b] bg-[#0d1526] pl-9 pr-3 text-sm text-white focus:border-[#7B6EF6] focus:outline-none"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <button
                disabled={loading}
                className="h-10 w-full rounded-lg bg-gradient-to-r from-[#7B6EF6] to-[#3B9EFF] text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
          <a
            href="/login"
            className="mt-5 flex items-center justify-center gap-1 text-xs text-[#64748b] hover:text-white"
          >
            <ArrowLeft size={12} />
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}

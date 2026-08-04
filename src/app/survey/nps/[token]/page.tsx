"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function NpsSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus]     = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [score, setScore]       = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    fetch(`/api/nps/submit?token=${token}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) { setStatus("invalid"); return; }
        if (j.alreadySubmitted) { setStatus("done"); return; }
        setStatus("ready");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function handleSubmit() {
    if (score === null) return;
    setSubmitting(true); setError("");
    const res = await fetch("/api/nps/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, score, feedback }),
    });
    if (res.ok) {
      setStatus("done");
    } else {
      const j = await res.json();
      setError(j.error ?? "Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  const scoreColor = (n: number, selected: boolean) => {
    if (!selected) return { background: "#1e293b", color: "#64748b", border: "1px solid #334155" };
    if (n <= 6)  return { background: "#ef4444", color: "#fff", border: "1px solid #ef4444" };
    if (n <= 8)  return { background: "#f59e0b", color: "#fff", border: "1px solid #f59e0b" };
    return { background: "#10b981", color: "#fff", border: "1px solid #10b981" };
  };

  const feedbackLabel = score === null
    ? "Any additional comments? (optional)"
    : score >= 9
      ? "What do you love most about NxtGen Convergence?"
      : score <= 6
        ? "What could we do better?"
        : "What would make us a 10 for you?";

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 580, background: "#111827", border: "1px solid #1f2937", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

        {/* Header bar */}
        <div style={{ background: "linear-gradient(135deg,#1e1b4b,#312e81)", padding: "24px 36px", display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/nxtgen-logo.png" alt="NxtGen" style={{ height: 32, width: "auto", display: "block" }} />
        </div>

        {/* Content */}
        <div style={{ padding: "36px 36px 40px" }}>

          {status === "loading" && (
            <p style={{ color: "#64748b", textAlign: "center", fontSize: 15, margin: 0 }}>Loading…</p>
          )}

          {status === "invalid" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
              <p style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Invalid or expired link</p>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>This survey link is no longer valid.</p>
            </div>
          )}

          {status === "done" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>Thank you for your feedback!</p>
              <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, margin: 0 }}>Your response has been recorded.<br/>We appreciate you taking the time to help us improve.</p>
            </div>
          )}

          {status === "ready" && (
            <>
              <h1 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.4 }}>
                How likely are you to recommend us?
              </h1>
              <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 32px", lineHeight: 1.6 }}>
                On a scale of 0 to 10 — 0 being not at all likely, 10 being extremely likely.
              </p>

              {/* Score row — all 11 in one line */}
              <div style={{ overflowX: "auto", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 5, minWidth: "max-content" }}>
                  {Array.from({ length: 11 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setScore(i)}
                      style={{
                        width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                        fontWeight: score === i ? 700 : 500,
                        fontSize: 14, cursor: "pointer", transition: "all 0.15s",
                        ...scoreColor(i, score === i),
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 28 }}>
                <span style={{ color: "#475569", fontSize: 11 }}>Not likely</span>
                <span style={{ color: "#475569", fontSize: 11 }}>Extremely likely</span>
              </div>

              {score !== null && (
                <div style={{ marginBottom: 24, padding: "10px 16px", borderRadius: 8, background: score <= 6 ? "rgba(239,68,68,0.08)" : score <= 8 ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${score <= 6 ? "rgba(239,68,68,0.2)" : score <= 8 ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)"}` }}>
                  <p style={{ color: score <= 6 ? "#f87171" : score <= 8 ? "#fbbf24" : "#34d399", fontSize: 13, fontWeight: 600, margin: 0 }}>
                    {score <= 6 ? "Detractor" : score <= 8 ? "Passive" : "Promoter"} &nbsp;·&nbsp; Score: {score}/10
                  </p>
                </div>
              )}

              {/* Feedback */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 8, fontWeight: 500 }}>
                  {feedbackLabel}
                </label>
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="Your thoughts…"
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>

              {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={score === null || submitting}
                style={{
                  width: "100%", padding: "14px", borderRadius: 10, border: "none",
                  background: score === null ? "#1e293b" : "linear-gradient(135deg,#4f46e5,#7c3aed)",
                  color: score === null ? "#475569" : "#fff",
                  fontWeight: 700, fontSize: 15,
                  cursor: score === null ? "not-allowed" : "pointer",
                  transition: "opacity 0.15s", opacity: submitting ? 0.7 : 1,
                  fontFamily: "inherit",
                }}
              >
                {submitting ? "Submitting…" : "Submit Feedback"}
              </button>

              <p style={{ color: "#334155", fontSize: 11, textAlign: "center", margin: "16px 0 0" }}>
                Your response is anonymous and helps us improve.
              </p>
            </>
          )}
        </div>
      </div>

      <p style={{ color: "#1e293b", fontSize: 11, marginTop: 24 }}>Powered by NxtGen Stack</p>
    </div>
  );
}

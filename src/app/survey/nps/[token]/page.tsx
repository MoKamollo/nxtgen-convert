"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const LABELS: Record<number, string> = {
  0: "Extremely unlikely", 1: "Very unlikely", 2: "Unlikely", 3: "Somewhat unlikely",
  4: "Neutral–", 5: "Neutral", 6: "Somewhat likely",
  7: "Likely", 8: "Very likely", 9: "Extremely likely", 10: "Definitely!",
};

const scoreColor = (n: number) =>
  n <= 6 ? "bg-red-500 border-red-400" : n <= 8 ? "bg-amber-500 border-amber-400" : "bg-emerald-500 border-emerald-400";

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

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: 560, background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "40px 36px" }}>

        {/* Logo / Brand */}
        <div style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>N</span>
          </div>
          <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 15 }}>NxtGen Convert</span>
        </div>

        {status === "loading" && (
          <p style={{ color: "#64748b", textAlign: "center" }}>Loading…</p>
        )}

        {status === "invalid" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#f87171", fontSize: 18, fontWeight: 600 }}>Invalid or expired link</p>
            <p style={{ color: "#64748b", marginTop: 8 }}>This survey link is not valid or has already expired.</p>
          </div>
        )}

        {status === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <p style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 700 }}>Thank you for your feedback!</p>
            <p style={{ color: "#64748b", marginTop: 8 }}>Your response helps us improve for everyone.</p>
          </div>
        )}

        {status === "ready" && (
          <>
            <h1 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              How likely are you to recommend us?
            </h1>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
              On a scale of 0 to 10 — 0 being not at all likely, 10 being extremely likely.
            </p>

            {/* Score buttons */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setScore(i)}
                  style={{
                    width: 44, height: 44, borderRadius: 8, border: score === i ? "2px solid transparent" : "1px solid #374151",
                    background: score === i ? (i <= 6 ? "#ef4444" : i <= 8 ? "#f59e0b" : "#10b981") : "#1f2937",
                    color: score === i ? "#fff" : "#9ca3af",
                    fontWeight: score === i ? 700 : 400,
                    fontSize: 15, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {i}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 28 }}>
              <span style={{ color: "#64748b", fontSize: 11 }}>Not at all likely</span>
              <span style={{ color: "#64748b", fontSize: 11 }}>Extremely likely</span>
            </div>

            {score !== null && (
              <p style={{ color: score <= 6 ? "#f87171" : score <= 8 ? "#fbbf24" : "#34d399", fontSize: 13, marginBottom: 20, fontWeight: 500 }}>
                {LABELS[score]}
              </p>
            )}

            {/* Feedback */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 8 }}>
                {score !== null && score >= 9 ? "What do you love most?" : score !== null && score <= 6 ? "What could we improve?" : "Any additional comments? (optional)"}
              </label>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={3}
                placeholder="Your thoughts…"
                style={{ width: "100%", background: "#0f172a", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={score === null || submitting}
              style={{
                width: "100%", padding: "14px", borderRadius: 10, border: "none",
                background: score === null ? "#374151" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "#fff", fontWeight: 600, fontSize: 15,
                cursor: score === null ? "not-allowed" : "pointer", transition: "opacity 0.15s",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Submitting…" : "Submit Feedback"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

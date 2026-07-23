"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiUrl } from "@/lib/org";
import { cn } from "@/lib/utils";
import { Bot, Send, User, Sparkles, Loader2, RotateCcw, Zap } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "What should I focus on today?",
  "Which leads are most likely to convert?",
  "Why is my churn rate high?",
  "How do I improve my win rate?",
  "What's blocking my pipeline?",
  "Draft a win-back campaign for churned customers",
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-500 mt-0.5">
          <Bot size={15} className="text-white" />
        </div>
      )}
      <div className={cn(
        "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "bg-brand-500 text-white rounded-tr-sm"
          : "bg-surface-800 border border-surface-700 text-surface-100 rounded-tl-sm"
      )}>
        {msg.content.split("\n").map((line, i) => {
          if (line.startsWith("- ") || line.startsWith("• ")) {
            return <div key={i} className="flex gap-2 mt-1"><span className="text-brand-400 shrink-0">•</span><span>{line.slice(2)}</span></div>;
          }
          if (line.startsWith("**") && line.endsWith("**")) {
            return <p key={i} className="font-semibold text-surface-50 mt-2">{line.slice(2, -2)}</p>;
          }
          if (line === "") return <div key={i} className="h-1" />;
          return <p key={i}>{line}</p>;
        })}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-700 mt-0.5">
          <User size={15} className="text-surface-300" />
        </div>
      )}
    </div>
  );
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setError(null);

    const updated: Message[] = [...messages, { role: "user", content: msg }];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch(apiUrl("/api/ai-chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: updated.slice(0, -1).slice(-10), // last 10 turns for context
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Something went wrong"); setLoading(false); return; }
      setMessages(prev => [...prev, { role: "assistant", content: j.reply }]);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-64px)]">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-500">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-surface-50">AI Revenue Assistant</h1>
              <p className="text-xs text-surface-500">Powered by Claude · reads your live CRM data</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Live data</span>
            </div>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setError(null); }}
                className="flex items-center gap-1.5 h-8 rounded-lg border border-surface-700 bg-surface-900 px-3 text-xs text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-all">
                <RotateCcw size={12} /> New chat
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-brand-500/20 border border-violet-500/20">
                <Sparkles size={28} className="text-violet-400" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-surface-100">What can I help you with?</h2>
                <p className="text-sm text-surface-500 mt-1">I have access to your live CRM, pipeline, tickets, and campaigns.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {STARTERS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="flex items-center gap-2 rounded-xl border border-surface-700 bg-surface-900 px-4 py-3 text-xs text-surface-300 hover:border-brand-500/40 hover:bg-brand-500/5 hover:text-surface-100 transition-all text-left">
                    <Zap size={11} className="text-brand-400 shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {loading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-500">
                    <Bot size={15} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-surface-800 border border-surface-700 px-4 py-3">
                    <Loader2 size={14} className="animate-spin text-brand-400" />
                    <span className="text-xs text-surface-500">Analyzing your data…</span>
                  </div>
                </div>
              )}
              {error && (
                <div className="text-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl py-3 px-4">
                  {error}
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-6 pb-6">
          <div className="flex items-end gap-3 rounded-2xl border border-surface-700 bg-surface-900 px-4 py-3 focus-within:border-brand-500/60 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your revenue, contacts, pipeline…"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none max-h-32"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="text-[11px] text-surface-600 mt-2 text-center">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </AppLayout>
  );
}

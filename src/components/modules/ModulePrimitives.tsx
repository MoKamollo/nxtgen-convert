"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { AlertCircle, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

export function ModuleHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex items-start justify-between gap-4">
    <div><h1 className="text-2xl font-bold tracking-tight text-surface-50">{title}</h1><p className="mt-1 text-sm text-surface-500">{description}</p></div>
    {action}
  </div>;
}

export function StatGrid({ stats, columns = 4 }: { stats: Array<{ label: string; value: ReactNode; icon: LucideIcon; hint?: string; tone?: "brand" | "green" | "violet" | "amber" | "red" }>; columns?: 3 | 4 | 5 | 6 }) {
  const grid = { 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" }[columns];
  const tone = {
    brand: "bg-brand-500/10 text-brand-400", green: "bg-emerald-500/10 text-emerald-400", violet: "bg-violet-500/10 text-violet-400", amber: "bg-amber-500/10 text-amber-400", red: "bg-red-500/10 text-red-400",
  };
  return <div className={cn("grid gap-4", grid)}>{stats.map((stat, index) => { const Icon = stat.icon; const classes = tone[stat.tone ?? (["brand", "green", "violet", "amber", "red"] as const)[index % 5]]; return <div key={stat.label} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
    <div className="mb-2 flex items-center gap-2"><span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", classes)}><Icon size={14} /></span><span className="text-xs text-surface-500">{stat.label}</span></div>
    <div className="text-xl font-bold text-surface-100">{stat.value}</div>{stat.hint && <p className="mt-1 text-[10px] text-surface-600">{stat.hint}</p>}
  </div>; })}</div>;
}

export function SearchField({ value, onChange, placeholder = "Search..." }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="relative w-72"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-9 w-full rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none" /></div>;
}

export function FilterTabs({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; count?: number }> }) {
  return <div className="flex items-center gap-1 rounded-lg border border-surface-800 bg-surface-900/60 p-1">{options.map(option => <button key={option.value} onClick={() => onChange(option.value)} className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", value === option.value ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300")}>{option.label}{option.count !== undefined && <span className="ml-1 text-[10px] opacity-70">{option.count}</span>}</button>)}</div>;
}

export function LoadingState() { return <div className="flex items-center justify-center py-20"><Loader2 size={22} className="animate-spin text-surface-500" /></div>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"><span className="flex items-center gap-2"><AlertCircle size={16} />{message}</span>{retry && <Button size="sm" variant="outline" onClick={retry}>Retry</Button>}</div>; }
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) { return <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-800 bg-surface-900/50 px-6 py-14 text-center"><Icon size={30} className="text-surface-600" /><div><p className="text-sm font-semibold text-surface-300">{title}</p><p className="mt-1 text-xs text-surface-500">{description}</p></div>{action}</div>; }

export function Modal({ open, onClose, title, children, width = "max-w-lg" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className={cn("max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl", width)}><div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-800 bg-surface-900 px-5 py-4"><h2 className="text-sm font-bold text-surface-100">{title}</h2><button onClick={onClose} className="text-surface-500 hover:text-surface-200"><X size={16} /></button></div>{children}</div></div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-surface-400">{label}</span>{children}{hint && <span className="mt-1 block text-[10px] text-surface-600">{hint}</span>}</label>; }
export const inputClass = "h-9 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";
export const textareaClass = "w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = (value ?? "unknown").toLowerCase();
  const style = normalized.includes("active") || normalized.includes("completed") || normalized.includes("sent") || normalized.includes("published") || normalized.includes("won")
    ? "bg-emerald-500/10 text-emerald-400"
    : normalized.includes("pending") || normalized.includes("scheduled") || normalized.includes("paused") || normalized.includes("proposal") || normalized.includes("passive")
      ? "bg-amber-500/10 text-amber-400"
      : normalized.includes("cancel") || normalized.includes("failed") || normalized.includes("lost") || normalized.includes("detractor") || normalized.includes("churn")
        ? "bg-red-500/10 text-red-400"
        : "bg-brand-500/10 text-brand-400";
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-[10px] font-semibold capitalize", style)}>{normalized.replace(/_/g, " ")}</span>;
}

export function ConfirmAction({ onConfirm, label = "Delete", disabled = false }: { onConfirm: () => void | Promise<void>; label?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return <button disabled={disabled} onClick={async () => { if (!armed) { setArmed(true); window.setTimeout(() => setArmed(false), 3000); return; } await onConfirm(); setArmed(false); }} className={cn("rounded-md px-2 py-1 text-[11px] transition-colors disabled:opacity-50", armed ? "bg-red-500/15 font-semibold text-red-400" : "text-surface-500 hover:bg-red-500/10 hover:text-red-400")}>{armed ? "Confirm?" : label}</button>;
}

export function Toast({ message, type = "success" }: { message: string; type?: "success" | "error" }) { return <div className={cn("fixed bottom-5 right-5 z-[70] rounded-lg border px-4 py-3 text-xs font-medium shadow-xl", type === "success" ? "border-emerald-500/30 bg-surface-900 text-emerald-400" : "border-red-500/30 bg-surface-900 text-red-400")}>{message}</div>; }

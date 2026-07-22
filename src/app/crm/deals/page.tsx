"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { formatCurrency, cn } from "@/lib/utils";
import { apiUrl } from "@/lib/org";
import {
  Plus, Search, Filter, TrendingUp, Calendar,
  Layers, BarChart3, X, Loader2, ChevronRight,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type Deal = {
  id: string; name: string; value: number; stage: string; probability: number;
  contact: string; company: string; owner: string; expectedCloseDate: string | null;
  tags: string[];
};

const KANBAN_STAGES = [
  { id: "prospecting",   label: "Prospecting",   color: "#94a3b8", prob: 10 },
  { id: "qualification", label: "Qualification", color: "#60a5fa", prob: 25 },
  { id: "proposal",      label: "Proposal",      color: "#818cf8", prob: 50 },
  { id: "negotiation",   label: "Negotiation",   color: "#fb923c", prob: 75 },
  { id: "closed_won",    label: "Closed Won",    color: "#34d399", prob: 100 },
  { id: "closed_lost",   label: "Closed Lost",   color: "#f87171", prob: 0 },
];

const STAGE_IDS = KANBAN_STAGES.map(s => s.id);

export default function DealsPage() {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", value: "", stage: "prospecting",
    expectedCloseDate: "", probability: "10",
  });

  const load = useCallback(() => {
    setLoading(true);
    fetch(apiUrl("/api/deals")).then(r => r.json())
      .then(j => { setAllDeals(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        value: parseFloat(form.value) || 0,
        stage: form.stage,
        probability: parseInt(form.probability) || 10,
        expectedCloseDate: form.expectedCloseDate || null,
      }),
    });
    setSaving(false);
    setShowModal(false);
    setForm({ name: "", value: "", stage: "prospecting", expectedCloseDate: "", probability: "10" });
    load();
  };

  const moveStage = async (id: string, newStage: string) => {
    const stageConf = KANBAN_STAGES.find(s => s.id === newStage);
    setAllDeals(prev => prev.map(d => d.id === id ? { ...d, stage: newStage, probability: stageConf?.prob ?? d.probability } : d));
    await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage, probability: stageConf?.prob }),
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this deal?")) return;
    setAllDeals(prev => prev.filter(d => d.id !== id));
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
  };

  const filtered = allDeals.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.contact.toLowerCase().includes(search.toLowerCase())
  );

  const getDealsForStage = (stage: string) => filtered.filter(d => d.stage === stage);
  const totalPipelineValue = allDeals.reduce((s, d) => s + d.value, 0);

  const pipelineData = KANBAN_STAGES.map(s => {
    const stageDeals = getDealsForStage(s.id);
    return { ...s, count: stageDeals.length, total: stageDeals.reduce((a, d) => a + d.value, 0) };
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Deals</h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {allDeals.length} deals · {formatCurrency(totalPipelineValue)} pipeline value
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={BarChart3}>Forecast</Button>
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>New Deal</Button>
          </div>
        </div>

        {/* Pipeline summary */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {pipelineData.map(stage => (
            <div key={stage.id} className="rounded-xl border border-surface-800 bg-surface-900/50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-[10px] text-surface-500 font-medium truncate">{stage.label}</span>
              </div>
              <p className="text-sm font-bold text-surface-100">{formatCurrency(stage.total)}</p>
              <p className="text-[11px] text-surface-500 mt-0.5">{stage.count} deals</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
            <input type="text" placeholder="Search deals..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-8 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
          </div>
          <button className="flex items-center gap-1.5 h-8 rounded-lg border border-surface-700 bg-surface-900 px-3 text-xs text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-all">
            <Filter size={13} /> Filters
          </button>
          <div className="flex-1" />
          <div className="flex items-center rounded-lg border border-surface-700 bg-surface-900 p-0.5">
            <button onClick={() => setView("kanban")} className={cn("flex items-center gap-1.5 h-7 px-3 rounded-md text-xs transition-all", view === "kanban" ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300")}>
              <Layers size={12} /> Kanban
            </button>
            <button onClick={() => setView("table")} className={cn("flex items-center gap-1.5 h-7 px-3 rounded-md text-xs transition-all", view === "table" ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300")}>
              <BarChart3 size={12} /> Table
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-surface-500" /></div>
        ) : (
          <>
            {/* Kanban */}
            {view === "kanban" && (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {KANBAN_STAGES.map(stage => {
                  const deals = getDealsForStage(stage.id);
                  const stageValue = deals.reduce((s, d) => s + d.value, 0);
                  return (
                    <div key={stage.id} className="w-64 shrink-0">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                          <span className="text-xs font-semibold text-surface-300">{stage.label}</span>
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-800 text-[10px] text-surface-400">{deals.length}</span>
                        </div>
                        <span className="text-[11px] text-surface-500">{stageValue > 0 ? formatCurrency(stageValue) : "—"}</span>
                      </div>

                      <div className="space-y-2">
                        {deals.map(deal => {
                          const nextStageIdx = STAGE_IDS.indexOf(deal.stage) + 1;
                          const nextStage = nextStageIdx < STAGE_IDS.length ? KANBAN_STAGES[nextStageIdx] : null;
                          return (
                            <div key={deal.id} className="rounded-xl border border-surface-800 bg-surface-900/70 p-3 hover:border-surface-700 transition-all group">
                              <div className="flex items-start justify-between mb-2">
                                <p className="text-xs font-semibold text-surface-100 leading-tight flex-1 pr-2">{deal.name}</p>
                                <button onClick={() => handleDelete(deal.id)} className="opacity-0 group-hover:opacity-100 text-surface-600 hover:text-red-400 transition-all">
                                  <X size={13} />
                                </button>
                              </div>
                              <p className="text-lg font-bold text-surface-50 mb-2">{formatCurrency(deal.value)}</p>
                              {deal.contact && (
                                <div className="flex items-center gap-2 mb-3">
                                  <Avatar name={deal.contact} size="xs" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] text-surface-400 truncate">{deal.contact}</p>
                                    {deal.company && <p className="text-[10px] text-surface-600 truncate">{deal.company}</p>}
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.probability >= 70 ? "#10b981" : deal.probability >= 40 ? "#f59e0b" : "#94a3b8" }} />
                                  <span className="text-[11px] text-surface-500">{deal.probability}%</span>
                                </div>
                                {deal.expectedCloseDate && (
                                  <div className="flex items-center gap-1 text-[10px] text-surface-600">
                                    <Calendar size={10} />
                                    {new Date(deal.expectedCloseDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </div>
                                )}
                              </div>
                              <div className="h-1 rounded-full bg-surface-800 mb-2">
                                <div className="h-full rounded-full transition-all" style={{ width: `${deal.probability}%`, backgroundColor: stage.color }} />
                              </div>
                              {nextStage && stage.id !== "closed_won" && stage.id !== "closed_lost" && (
                                <button onClick={() => moveStage(deal.id, nextStage.id)}
                                  className="opacity-0 group-hover:opacity-100 w-full flex items-center justify-center gap-1 h-6 rounded-lg bg-surface-800 hover:bg-surface-700 text-[11px] text-surface-400 transition-all">
                                  Move to {nextStage.label} <ChevronRight size={11} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={() => { setForm(p => ({...p, stage: stage.id})); setShowModal(true); }}
                          className="w-full flex items-center justify-center gap-1.5 h-8 rounded-xl border border-dashed border-surface-800 text-xs text-surface-600 hover:text-surface-400 hover:border-surface-700 transition-all">
                          <Plus size={13} /> Add deal
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Table */}
            {view === "table" && (
              <Card padding="none">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-800">
                      {["Deal", "Value", "Stage", "Contact", "Probability", "Close Date", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-surface-500">No deals yet</td></tr>
                    ) : filtered.map(deal => (
                      <tr key={deal.id} className="hover:bg-surface-800/30 cursor-pointer transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/10">
                              <TrendingUp size={12} className="text-brand-400" />
                            </div>
                            <span className="text-xs font-semibold text-surface-100">{deal.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="text-xs font-bold text-emerald-400">{formatCurrency(deal.value)}</span></td>
                        <td className="px-4 py-3"><StatusBadge status={deal.stage} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {deal.contact && <Avatar name={deal.contact} size="xs" />}
                            <div>
                              <p className="text-xs text-surface-200">{deal.contact || "—"}</p>
                              {deal.company && <p className="text-[11px] text-surface-500">{deal.company}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-surface-800">
                              <div className={cn("h-full rounded-full", deal.probability >= 70 ? "bg-emerald-500" : deal.probability >= 40 ? "bg-amber-500" : "bg-surface-500")} style={{ width: `${deal.probability}%` }} />
                            </div>
                            <span className="text-xs text-surface-300">{deal.probability}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-surface-400">
                            {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDelete(deal.id)} className="opacity-0 group-hover:opacity-100 text-surface-600 hover:text-red-400 transition-all">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
              <h2 className="text-sm font-bold text-surface-100">New Deal</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Deal name *</label>
                <input required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="e.g. Acme Corp — Enterprise"
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Value ($)</label>
                  <input type="number" min="0" value={form.value} onChange={e => setForm(p => ({...p, value: e.target.value}))} placeholder="0"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Probability (%)</label>
                  <input type="number" min="0" max="100" value={form.probability} onChange={e => setForm(p => ({...p, probability: e.target.value}))} placeholder="10"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Stage</label>
                <select value={form.stage} onChange={e => {
                  const stageConf = KANBAN_STAGES.find(s => s.id === e.target.value);
                  setForm(p => ({...p, stage: e.target.value, probability: String(stageConf?.prob ?? p.probability)}));
                }}
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                  {KANBAN_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Expected close date</label>
                <input type="date" value={form.expectedCloseDate} onChange={e => setForm(p => ({...p, expectedCloseDate: e.target.value}))}
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-9 px-4 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="h-9 px-4 rounded-lg bg-gradient-to-r from-brand-500 to-blue-500 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {saving ? "Saving…" : "Create Deal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

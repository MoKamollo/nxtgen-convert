"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConfirmAction } from "@/components/modules/ModulePrimitives";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { timeAgo, cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  Plus, Search, HeadphonesIcon, Clock,
  AlertTriangle, CheckCircle, MessageSquare,
  Star, Loader2, X,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type Ticket = {
  id: string; ticketNumber: string; subject: string; description: string | null;
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  contactId: string | null; contactName: string | null;
  assigneeId: string | null; firstResponseAt: string | null;
  satisfactionScore: number | null; createdAt: string;
};

const priorityConfig = {
  low:      { label: "Low",      color: "text-surface-500", dot: "bg-surface-500" },
  medium:   { label: "Medium",   color: "text-blue-400",    dot: "bg-blue-400" },
  high:     { label: "High",     color: "text-amber-400",   dot: "bg-amber-400" },
  critical: { label: "Critical", color: "text-red-400",     dot: "bg-red-400 animate-pulse" },
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "medium" });

  const load = useCallback(() => {
    apiFetch(apiUrl("/api/tickets"))
      .then(r => r.json())
      .then(j => { setTickets(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const stats = {
    open:       tickets.filter(t => t.status === "open").length,
    inProgress: tickets.filter(t => t.status === "in_progress").length,
    waiting:    tickets.filter(t => t.status === "waiting").length,
    resolved:   tickets.filter(t => t.status === "resolved" || t.status === "closed").length,
  };

  const filtered = tickets.filter(t => {
    const matchSearch = !search ||
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.ticketNumber.toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === "all" ||
      (activeTab === "open"     && (t.status === "open" || t.status === "in_progress")) ||
      (activeTab === "waiting"  && t.status === "waiting") ||
      (activeTab === "resolved" && (t.status === "resolved" || t.status === "closed"));
    return matchSearch && matchTab;
  });

  const STATUS_CYCLE: Record<string, string> = {
    open: "in_progress",
    in_progress: "resolved",
    waiting: "resolved",
    resolved: "closed",
    closed: "open",
  };

  const STATUS_LABELS: Record<string, string> = {
    open: "Start",
    in_progress: "Resolve",
    waiting: "Resolve",
    resolved: "Close",
    closed: "Reopen",
  };

  async function cycleStatus(ticket: Ticket) {
    const nextStatus = STATUS_CYCLE[ticket.status] ?? "open";
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: nextStatus as Ticket["status"] } : t));
    await apiFetch(apiUrl(`/api/tickets/${ticket.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  async function handleDelete(id: string) {
    setTickets(prev => prev.filter(t => t.id !== id));
    await apiFetch(apiUrl(`/api/tickets/${id}`), { method: "DELETE" });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) return;
    setSaving(true);
    const res = await apiFetch(apiUrl("/api/tickets"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: form.subject.trim(), description: form.description, priority: form.priority }),
    });
    if (res.ok) {
      const j = await res.json();
      setTickets(prev => [{ ...j.data, contactName: null }, ...prev]);
    }
    setForm({ subject: "", description: "", priority: "medium" });
    setShowModal(false);
    setSaving(false);
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Support Tickets</h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {stats.open + stats.inProgress} open ticket{stats.open + stats.inProgress !== 1 ? "s" : ""}
            </p>
          </div>
          <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>New Ticket</Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Open",        value: stats.open,       icon: AlertTriangle, color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
            { label: "In Progress", value: stats.inProgress, icon: Clock,         color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
            { label: "Waiting",     value: stats.waiting,    icon: MessageSquare, color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20" },
            { label: "Resolved",    value: stats.resolved,   icon: CheckCircle,   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className={`rounded-xl border ${stat.border} ${stat.bg} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-surface-400">{stat.label}</span>
                  <Icon size={14} className={stat.color} />
                </div>
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
            <input type="text" placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-8 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex items-center rounded-lg border border-surface-700 bg-surface-900 p-0.5">
            {["all", "open", "waiting", "resolved"].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn("px-3 py-1 rounded-md text-xs capitalize transition-all", activeTab === tab ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300")}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Ticket List */}
        <Card padding="none">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <HeadphonesIcon size={40} className="text-surface-700 mb-3" />
              <p className="text-sm font-semibold text-surface-300">
                {tickets.length === 0 ? "No tickets yet" : "No tickets match your filter"}
              </p>
              <p className="text-xs text-surface-500 mt-1">
                {tickets.length === 0 ? "Create your first support ticket" : "Try adjusting your search or filters"}
              </p>
              {tickets.length === 0 && (
                <div className="mt-3">
                  <Button variant="outline" size="sm" icon={Plus} onClick={() => setShowModal(true)}>New Ticket</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-surface-800/60">
              {filtered.map(ticket => {
                const priority = priorityConfig[ticket.priority] ?? priorityConfig.medium;
                return (
                  <div key={ticket.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-800/30 cursor-pointer group transition-colors">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${priority.dot}`} />
                    <span className="text-xs font-mono text-surface-500 shrink-0 w-20">{ticket.ticketNumber}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-100 truncate">{ticket.subject}</p>
                      {ticket.contactName && (
                        <span className="text-xs text-surface-500">{ticket.contactName}</span>
                      )}
                    </div>
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                      <StatusBadge status={ticket.status} />
                      <Badge variant={ticket.priority === "critical" ? "danger" : ticket.priority === "high" ? "warning" : ticket.priority === "medium" ? "info" : "ghost"} size="sm">
                        {priority.label}
                      </Badge>
                    </div>
                    <div className="hidden xl:block shrink-0 w-28">
                      {ticket.firstResponseAt ? (
                        <div className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle size={11} />
                          <span>{timeAgo(ticket.firstResponseAt)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-red-400 animate-pulse">
                          <Clock size={11} />
                          <span>No response</span>
                        </div>
                      )}
                    </div>
                    <div className="hidden xl:flex items-center gap-0.5 shrink-0 w-16">
                      {ticket.satisfactionScore ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={11} className={i < ticket.satisfactionScore! ? "text-amber-400 fill-amber-400" : "text-surface-700"} />
                        ))
                      ) : (
                        <span className="text-xs text-surface-600 italic">—</span>
                      )}
                    </div>
                    <span className="text-xs text-surface-600 shrink-0 w-16 text-right">{timeAgo(ticket.createdAt)}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); cycleStatus(ticket); }}
                        className="flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-all"
                      >
                        {STATUS_LABELS[ticket.status] ?? "Update"}
                      </button>
                      <div onClick={(event) => event.stopPropagation()}>
                        <ConfirmAction onConfirm={() => handleDelete(ticket.id)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* New Ticket Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-surface-800">
              <h2 className="text-sm font-semibold text-surface-100">New Support Ticket</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-surface-400">Subject *</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required
                  placeholder="Brief description of the issue"
                  className="mt-1 w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-400">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detailed description..." rows={3}
                  className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-400">Priority</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" variant="gradient" size="sm" loading={saving}>Create Ticket</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

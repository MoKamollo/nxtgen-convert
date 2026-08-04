"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { formatPercent, cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  Plus, Search, Zap, Play, Pause, BarChart3,
  Users, CheckCircle2, Target, Bot, Sparkles, ChevronRight,
  GitBranch, Loader2, X,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ConfirmAction, Modal, Toast } from "@/components/modules/ModulePrimitives";

type Workflow = {
  id: string; name: string; description: string | null;
  status: "draft" | "active" | "paused" | "archived";
  trigger: Record<string, unknown>; steps: unknown[];
  enrolledCount: number; completedCount: number;
  conversionRate: string; createdAt: string;
};

async function fetchWorkflows(): Promise<Workflow[]> {
  const response = await apiFetch(apiUrl("/api/workflows"));
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Failed to load workflows");
  }
  return Array.isArray(json.data) ? json.data : [];
}

const TEMPLATES = [
  {
    name: "New Contact Follow-up",
    desc: "Send a consent-gated welcome email, wait one day, then create a follow-up activity.",
    category: "Lead Follow-up",
    color: "from-brand-500 to-violet-500",
    icon: Users,
    trigger: { event: "contact.created" },
    steps: [
      { type: "send_email", config: { subject: "Welcome", body: "Thank you for getting in touch.", purpose: "marketing" } },
      { type: "wait", config: { amount: 1, unit: "days" } },
      { type: "create_activity", config: { type: "task", subject: "Follow up with new contact" } },
    ],
  },
  {
    name: "Qualified Deal Follow-up",
    desc: "Create a follow-up activity when a deal-stage event is received.",
    category: "Revenue Operations",
    color: "from-emerald-500 to-cyan-500",
    icon: Target,
    trigger: { event: "deal.stage_changed" },
    steps: [{ type: "create_activity", config: { type: "task", subject: "Review changed deal stage" } }],
  },
];

const TRIGGER_EVENTS = [
  { value: "contact.created", label: "New contact created" },
  { value: "deal.stage_changed", label: "Deal stage changed" },
  { value: "manual", label: "Manual trigger" },
];

function workflowCompletionRate(workflow: Workflow): number {
  const enrolled = workflow.enrolledCount ?? 0;
  return enrolled > 0 ? (workflow.completedCount ?? 0) / enrolled * 100 : 0;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", triggerEvent: "contact.created" });
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [statsWorkflow, setStatsWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setWorkflows(await fetchWorkflows());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchWorkflows()
      .then((loadedWorkflows) => {
        if (!active) return;
        setWorkflows(loadedWorkflows);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Failed to load workflows");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = workflows.filter(w => {
    const matchSearch = !search || w.name.toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === "all" || w.status === activeTab;
    return matchSearch && matchTab;
  });

  const totalEnrolled = workflows.reduce((s, w) => s + (w.enrolledCount ?? 0), 0);
  const totalCompleted = workflows.reduce((s, w) => s + (w.completedCount ?? 0), 0);
  const activeCount = workflows.filter(w => w.status === "active").length;
  const avgCompletion = workflows.length > 0
    ? workflows.reduce((sum, workflow) => sum + workflowCompletionRate(workflow), 0) / workflows.length
    : 0;

  async function toggleStatus(wf: Workflow) {
    setError("");
    const response = wf.status === "active"
      ? await apiFetch(apiUrl(`/api/workflows/${wf.id}`), {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paused" }),
        })
      : await apiFetch(apiUrl(`/api/workflows/${wf.id}/publish`), { method: "POST" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error ?? "Workflow status could not be changed");
      return;
    }
    setToast(wf.status === "active" ? "Workflow paused" : `Workflow version ${json.data?.version ?? "new"} published`);
    await load();
  }

  async function handleDelete(id: string) {
    setError("");
    const response = await apiFetch(apiUrl(`/api/workflows/${id}`), { method: "DELETE" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error ?? "Workflow could not be archived");
      return;
    }
    setToast("Workflow archived");
    await load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(apiUrl("/api/workflows"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), description: form.description, trigger: { event: form.triggerEvent } }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Failed to create workflow"); setSaving(false); return; }
      setForm({ name: "", description: "", triggerEvent: "contact.created" });
      setShowModal(false);
      load(); // re-fetch from DB to confirm save
    } catch {
      setError("Network error. Please try again.");
    }
    setSaving(false);
  }

  async function generateWithAi() {
    if (!aiDescription.trim()) return; setSaving(true); setError("");
    try { const response = await apiFetch(apiUrl("/api/workflows/ai-generate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: aiDescription }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setShowAiModal(false); setAiDescription(""); setToast("AI workflow draft created"); load(); } catch (e) { setError(e instanceof Error ? e.message : "AI generation failed"); } finally { setSaving(false); }
  }

  async function createFromTemplate(template: (typeof TEMPLATES)[number]) {
    setSaving(true); setError("");
    try {
      const response = await apiFetch(apiUrl("/api/workflows"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: template.name, description: template.desc, trigger: template.trigger, steps: template.steps }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Template could not be created");
      setToast("Operational workflow draft created"); load();
    } catch (error) { setError(error instanceof Error ? error.message : "Template could not be created"); }
    finally { setSaving(false); }
  }

  const triggerLabel = (wf: Workflow) => {
    const event = (wf.trigger as Record<string, string>)?.event ?? "manual";
    return TRIGGER_EVENTS.find(t => t.value === event)?.label ?? event;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Automation</h1>
              <div className="flex items-center gap-1 rounded-full bg-violet-500/15 border border-violet-500/25 px-2 py-0.5">
                <Bot size={11} className="text-violet-400" />
                <span className="text-[10px] font-semibold text-violet-400">AI Powered</span>
              </div>
            </div>
            <p className="text-sm text-surface-500 mt-0.5">
              {activeCount} active workflow{activeCount !== 1 ? "s" : ""}{totalEnrolled > 0 ? ` · ${totalEnrolled.toLocaleString()} contacts enrolled` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={Sparkles} onClick={() => setShowAiModal(true)}>AI Generate</Button>
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>New Workflow</Button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active Workflows", value: activeCount, icon: Zap, color: "text-brand-400", bg: "bg-brand-500/10" },
            { label: "Contacts Enrolled", value: totalEnrolled.toLocaleString(), icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Completions", value: totalCompleted.toLocaleString(), icon: CheckCircle2, color: "text-cyan-400", bg: "bg-cyan-500/10" },
            { label: "Avg Completion", value: formatPercent(avgCompletion), icon: Target, color: "text-amber-400", bg: "bg-amber-500/10" },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${stat.bg}`}>
                    <Icon size={14} className={stat.color} />
                  </div>
                  <span className="text-xs text-surface-500">{stat.label}</span>
                </div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
            <input type="text" placeholder="Search workflows..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-8 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex items-center rounded-lg border border-surface-700 bg-surface-900 p-0.5">
            {["all", "active", "paused", "draft"].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn("px-3 py-1 rounded-md text-xs capitalize transition-all", activeTab === tab ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300")}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Workflow list */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-12 flex flex-col items-center justify-center gap-3 text-center">
            <Zap size={32} className="text-surface-600" />
            <p className="text-sm font-semibold text-surface-300">
              {workflows.length === 0 ? "No workflows yet" : "No workflows match your filter"}
            </p>
            <p className="text-xs text-surface-500">
              {workflows.length === 0 ? "Create your first automation workflow to get started" : "Try changing your search or filter"}
            </p>
            {workflows.length === 0 && (
              <Button variant="outline" size="sm" icon={Plus} onClick={() => setShowModal(true)}>New Workflow</Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(wf => (
              <div key={wf.id} onClick={() => router.push(`/automation/workflows/${wf.id}`)} className="rounded-xl border border-surface-800 bg-surface-900/50 hover:border-surface-700 transition-all cursor-pointer group">
                <div className="flex items-center gap-4 p-4">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", wf.status === "active" ? "bg-emerald-500/15" : "bg-surface-800")}>
                    <Zap size={18} className={wf.status === "active" ? "text-emerald-400" : "text-surface-500"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-surface-100">{wf.name}</p>
                      <StatusBadge status={wf.status} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Zap size={11} className="text-surface-600" />
                      <span className="text-xs text-surface-500">{triggerLabel(wf)}</span>
                      <span className="text-surface-700">·</span>
                      <GitBranch size={11} className="text-surface-600" />
                      <span className="text-xs text-surface-500">{(wf.steps as unknown[])?.length ?? 0} steps</span>
                    </div>
                  </div>
                  <div className="hidden lg:grid grid-cols-3 gap-8">
                    <div className="text-center">
                      <p className="text-sm font-bold text-surface-100">{(wf.enrolledCount ?? 0).toLocaleString()}</p>
                      <p className="text-[10px] text-surface-600 mt-0.5">Enrolled</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-emerald-400">{(wf.completedCount ?? 0).toLocaleString()}</p>
                      <p className="text-[10px] text-surface-600 mt-0.5">Completed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-brand-400">{formatPercent(workflowCompletionRate(wf))}</p>
                      <p className="text-[10px] text-surface-600 mt-0.5">Completion</p>
                    </div>
                  </div>
                  <div className="hidden xl:block w-32">
                    <div className="flex items-center justify-between text-[10px] text-surface-500 mb-1">
                      <span>Active</span>
                      <span>{(wf.enrolledCount ?? 0) - (wf.completedCount ?? 0)}</span>
                    </div>
                    <Progress value={wf.completedCount ?? 0} max={wf.enrolledCount || 1} color={workflowCompletionRate(wf) >= 70 ? "green" : workflowCompletionRate(wf) >= 40 ? "brand" : "amber"} />
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <button onClick={e => { e.stopPropagation(); toggleStatus(wf); }}
                      className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-all", wf.status === "active" ? "text-amber-400 hover:bg-amber-500/10" : "text-emerald-400 hover:bg-emerald-500/10")}>
                      {wf.status === "active" ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); setStatsWorkflow(wf); }} className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-all">
                      <BarChart3 size={13} />
                    </button>
                    <span onClick={e => e.stopPropagation()}><ConfirmAction label="Archive" onConfirm={() => handleDelete(wf.id)} /></span>
                    <ChevronRight size={14} className="text-surface-700 group-hover:text-surface-500 transition-colors ml-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Template Library */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-surface-200">Workflow Templates</h2>
              <Badge variant="purple" size="sm">Operational templates</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/automation/templates"; }}>Browse library →</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {TEMPLATES.map(template => {
              const Icon = template.icon;
              return (
                <div key={template.name} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4 cursor-pointer hover:border-surface-700 transition-all group">
                  <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${template.color} flex items-center justify-center mb-3`}>
                    <Icon size={16} className="text-white" />
                  </div>
                  <p className="text-xs font-semibold text-surface-100">{template.name}</p>
                  <p className="text-[11px] text-surface-500 mt-1 leading-relaxed">{template.desc}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] text-surface-600">{template.steps.length} steps</span>
                    <span className="text-[10px] bg-surface-800 text-surface-400 rounded px-1.5 py-0.5">{template.category}</span>
                  </div>
                  <button
                    onClick={() => createFromTemplate(template)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 h-7 rounded-lg border border-dashed border-surface-700 text-xs text-surface-500 hover:border-brand-500/40 hover:text-brand-400 transition-all">
                    <Plus size={12} /> Use template
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* New Workflow Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-surface-800">
              <h2 className="text-sm font-semibold text-surface-100">New Workflow</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-surface-400">Workflow Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  placeholder="e.g. Lead Nurture Sequence"
                  className="mt-1 w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-400">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this workflow do?"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-400">Trigger Event</label>
                <select value={form.triggerEvent} onChange={e => setForm(f => ({ ...f, triggerEvent: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                  {TRIGGER_EVENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" variant="gradient" size="sm" loading={saving}>Create Workflow</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Modal open={showAiModal} onClose={() => setShowAiModal(false)} title="Generate workflow with AI"><div className="space-y-4 p-5"><div><label className="text-xs font-medium text-surface-400">Describe the automation</label><textarea rows={6} value={aiDescription} onChange={e => setAiDescription(e.target.value)} placeholder="When a high-score lead is created, send a welcome email, wait one day, and create a follow-up task." className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"/></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAiModal(false)}>Cancel</Button><Button variant="gradient" icon={Sparkles} loading={saving} onClick={generateWithAi}>Generate with AI</Button></div></div></Modal>
      <Modal open={!!statsWorkflow} onClose={() => setStatsWorkflow(null)} title={`${statsWorkflow?.name ?? "Workflow"} performance`} width="max-w-2xl">{statsWorkflow && <div className="space-y-5 p-5"><div className="grid grid-cols-3 gap-3">{[{label:"Enrolled",value:statsWorkflow.enrolledCount||0},{label:"Completed",value:statsWorkflow.completedCount||0},{label:"Completion",value:formatPercent(workflowCompletionRate(statsWorkflow))}].map(item => <div key={item.label} className="rounded-xl border border-surface-800 bg-surface-950 p-4"><p className="text-[10px] uppercase text-surface-500">{item.label}</p><p className="mt-1 text-xl font-bold text-surface-100">{item.value}</p></div>)}</div><div className="rounded-xl border border-surface-800 bg-surface-950 p-5 text-xs text-surface-400">Completion is calculated from persisted enrollments and completed executions. It is not a customer or revenue conversion metric. No estimated or synthetic weekly series is displayed.</div></div>}</Modal>
      {toast && <Toast message={toast}/>}
    </AppLayout>
  );
}

"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { timeAgo, cn } from "@/lib/utils";
import { Plus, Mail, Phone, Calendar, FileText, MessageSquare, Clock, CheckCircle, X, Loader2, Activity } from "lucide-react";
import { useState, useEffect } from "react";

type ActivityRow = {
  id: string; type: string; subject: string; body: string | null;
  outcome: string | null; duration: number | null;
  scheduledAt: string | null; completedAt: string | null; createdAt: string;
};

const TYPE_CONFIG: Record<string, { icon: typeof Mail; color: string; bg: string; label: string }> = {
  email:   { icon: Mail,           color: "text-blue-400",    bg: "bg-blue-500/10",    label: "Email" },
  call:    { icon: Phone,          color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Call" },
  meeting: { icon: Calendar,       color: "text-violet-400",  bg: "bg-violet-500/10",  label: "Meeting" },
  note:    { icon: FileText,       color: "text-amber-400",   bg: "bg-amber-500/10",   label: "Note" },
  sms:     { icon: MessageSquare,  color: "text-cyan-400",    bg: "bg-cyan-500/10",    label: "SMS" },
};

const TYPE_KEYS = Object.keys(TYPE_CONFIG);

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: "call", subject: "", body: "", outcome: "", duration: "" });

  const load = () => {
    setLoading(true);
    fetch("/api/activities").then(r => r.json())
      .then(j => { setActivities(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = activities.filter(a => typeFilter === "all" || a.type === typeFilter);
  const countByType = (t: string) => activities.filter(a => a.type === t).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim()) return;
    setSaving(true);
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        subject: form.subject,
        body: form.body || null,
        outcome: form.outcome || null,
        duration: form.duration ? parseInt(form.duration) : null,
        completedAt: new Date().toISOString(),
      }),
    });
    setSaving(false);
    setShowModal(false);
    setForm({ type: "call", subject: "", body: "", outcome: "", duration: "" });
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Activities</h1>
            <p className="text-sm text-surface-500 mt-0.5">{activities.length} total interactions</p>
          </div>
          <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>Log Activity</Button>
        </div>

        {/* Type tiles */}
        <div className="grid grid-cols-5 gap-3">
          {TYPE_KEYS.map(key => {
            const conf = TYPE_CONFIG[key];
            const Icon = conf.icon;
            return (
              <button key={key} onClick={() => setTypeFilter(t => t === key ? "all" : key)}
                className={cn("rounded-xl border p-4 text-left cursor-pointer transition-all",
                  typeFilter === key ? "border-brand-500 bg-brand-500/10" : `border-surface-800 ${conf.bg} hover:border-surface-700`)}>
                <Icon size={20} className={conf.color} />
                <p className="text-sm font-bold text-surface-100 mt-2">{countByType(key)}</p>
                <p className="text-xs text-surface-500">{conf.label}s</p>
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-surface-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-xl border border-surface-800 bg-surface-900/50">
            <Activity size={32} className="text-surface-600" />
            <p className="text-sm font-medium text-surface-400">No activities yet</p>
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>Log your first activity</Button>
          </div>
        ) : (
          <Card padding="none">
            <div className="divide-y divide-surface-800/60">
              {filtered.map(activity => {
                const conf = TYPE_CONFIG[activity.type] ?? TYPE_CONFIG.note;
                const Icon = conf.icon;
                return (
                  <div key={activity.id} className="flex items-start gap-4 px-4 py-4 hover:bg-surface-800/30 cursor-pointer transition-colors group">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", conf.bg)}>
                      <Icon size={16} className={conf.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-100">{activity.subject}</p>
                      {activity.body && <p className="text-xs text-surface-500 mt-0.5 truncate">{activity.body}</p>}
                      {activity.outcome && <p className="text-xs text-surface-500 mt-1 italic">{activity.outcome}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {activity.scheduledAt ? (
                        <span className="flex items-center gap-1 text-xs text-amber-400"><Clock size={11} /> Scheduled</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={11} /> {timeAgo(new Date(activity.completedAt ?? activity.createdAt))}</span>
                      )}
                      {activity.duration && <p className="text-[11px] text-surface-600 mt-0.5">{activity.duration}m</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
              <h2 className="text-sm font-bold text-surface-100">Log Activity</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Type</label>
                <div className="flex gap-2 flex-wrap">
                  {TYPE_KEYS.map(k => (
                    <button key={k} type="button" onClick={() => setForm(p => ({...p, type: k}))}
                      className={cn("px-3 h-8 rounded-lg text-xs font-semibold border transition-all",
                        form.type === k ? "border-brand-500 bg-brand-500/20 text-brand-300" : "border-surface-700 text-surface-400 hover:border-surface-600")}>
                      {TYPE_CONFIG[k].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Subject *</label>
                <input required value={form.subject} onChange={e => setForm(p => ({...p, subject: e.target.value}))}
                  placeholder="e.g. Follow-up call with prospect"
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Notes</label>
                <textarea value={form.body} onChange={e => setForm(p => ({...p, body: e.target.value}))} rows={3}
                  placeholder="What was discussed…"
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Outcome</label>
                  <input value={form.outcome} onChange={e => setForm(p => ({...p, outcome: e.target.value}))} placeholder="Result / next step"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Duration (min)</label>
                  <input type="number" value={form.duration} onChange={e => setForm(p => ({...p, duration: e.target.value}))} placeholder="30"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-9 px-4 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="h-9 px-4 rounded-lg bg-gradient-to-r from-brand-500 to-blue-500 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {saving ? "Saving…" : "Log Activity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

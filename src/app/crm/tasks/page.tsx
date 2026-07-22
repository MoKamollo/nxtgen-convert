"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, CheckSquare, Clock, CheckCircle2, X, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

type Task = {
  id: string; title: string; description: string | null;
  status: string; priority: string; dueDate: string | null; completedAt: string | null;
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  urgent: { label: "Urgent", color: "text-red-400",    dot: "bg-red-400" },
  high:   { label: "High",   color: "text-amber-400",  dot: "bg-amber-400" },
  medium: { label: "Medium", color: "text-blue-400",   dot: "bg-blue-500" },
  low:    { label: "Low",    color: "text-surface-500", dot: "bg-surface-500" },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", dueDate: "" });

  const load = () => {
    setLoading(true);
    fetch("/api/tasks").then(r => r.json())
      .then(j => { setTasks(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const todo = tasks.filter(t => t.status === "todo" || t.status === "in_progress");
  const done = tasks.filter(t => t.status === "completed");

  const toggleDone = async (task: Task) => {
    const newStatus = task.status === "completed" ? "todo" : "completed";
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        dueDate: form.dueDate || null,
        status: "todo",
      }),
    });
    setSaving(false);
    setShowModal(false);
    setForm({ title: "", description: "", priority: "medium", dueDate: "" });
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Tasks</h1>
            <p className="text-sm text-surface-500 mt-0.5">{todo.length} open · {done.length} completed</p>
          </div>
          <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>New Task</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Open",        value: tasks.filter(t => t.status === "todo").length,        icon: CheckSquare,  color: "text-brand-400" },
            { label: "In Progress", value: tasks.filter(t => t.status === "in_progress").length, icon: Clock,        color: "text-amber-400" },
            { label: "Completed",   value: tasks.filter(t => t.status === "completed").length,   icon: CheckCircle2, color: "text-emerald-400" },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <div className="flex items-center gap-2">
                  <Icon size={16} className={stat.color} />
                  <span className="text-xs text-surface-500">{stat.label}</span>
                </div>
                <p className={cn("text-2xl font-bold mt-2", stat.color)}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-surface-500" /></div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-xl border border-surface-800 bg-surface-900/50">
            <CheckSquare size={32} className="text-surface-600" />
            <p className="text-sm font-medium text-surface-400">No tasks yet</p>
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>Create your first task</Button>
          </div>
        ) : (
          <Card padding="none">
            {todo.length > 0 && (
              <>
                <div className="px-4 py-3 border-b border-surface-800">
                  <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Active Tasks</p>
                </div>
                <div className="divide-y divide-surface-800/50">
                  {todo.map(task => {
                    const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
                    return (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-800/30 transition-colors group">
                        <button onClick={() => toggleDone(task)}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-surface-600 hover:border-brand-500 transition-colors">
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-100">{task.title}</p>
                          {task.description && <p className="text-xs text-surface-500 mt-0.5 truncate">{task.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={cn("flex items-center gap-1 text-[11px]", priority.color)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
                            {priority.label}
                          </div>
                          {task.dueDate && (
                            <span className="text-xs text-surface-500">{new Date(task.dueDate).toLocaleDateString("en-US", { month:"short", day:"numeric" })}</span>
                          )}
                          <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:underline transition-opacity">Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {done.length > 0 && (
              <>
                <div className="px-4 py-3 border-t border-b border-surface-800">
                  <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Completed</p>
                </div>
                <div className="divide-y divide-surface-800/50 opacity-60">
                  {done.map(task => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-3.5 group">
                      <button onClick={() => toggleDone(task)}>
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      </button>
                      <p className="text-sm text-surface-400 line-through flex-1">{task.title}</p>
                      <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:underline transition-opacity">Delete</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
              <h2 className="text-sm font-bold text-surface-100">New Task</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Task title *</label>
                <input required value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="e.g. Follow up with lead"
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} rows={2}
                  placeholder="Additional details…"
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e => setForm(p => ({...p, priority: e.target.value}))}
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Due date</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(p => ({...p, dueDate: e.target.value}))}
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-9 px-4 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="h-9 px-4 rounded-lg bg-gradient-to-r from-brand-500 to-blue-500 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {saving ? "Saving…" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

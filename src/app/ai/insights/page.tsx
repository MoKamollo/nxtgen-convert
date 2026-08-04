"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  Sparkles, TrendingUp, AlertTriangle, ArrowUpRight, Zap,
  ListChecks, Target, Users, UserMinus, RefreshCcw, Star, BarChart3,
  MessageSquare, Play, Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

type Contact = {
  id: string; firstName: string; lastName: string | null;
  email: string | null; status: string; score: number;
  jobTitle: string | null;
};

type Insight = {
  id: string; type: "opportunity" | "churn" | "expansion" | "campaign";
  title: string; body: string; priority: string;
  contact?: string; impact?: string; action: string; contactIds?: string[];
};

type Task = {
  id: string; title: string; priority: string; status: string;
  dueDate: string | null; description: string | null;
};

const TASK_ICONS: Record<string, typeof Zap> = {
  urgent: Zap,
  high:   AlertTriangle,
  medium: MessageSquare,
  low:    BarChart3,
};

const INSIGHT_ROUTES: Record<string, string> = {
  "churn-recent":  "/crm/contacts?status=churned",
  "hot-leads":     "/crm/contacts?status=lead",
  "vip-expansion": "/crm/deals",
  "stuck-deals":   "/crm/deals?stage=negotiation",
  "overdue-tasks": "/crm/tasks",
};

export default function AIInsightsPage() {
  const router = useRouter();
  const [contacts, setContacts]   = useState<Contact[]>([]);
  const [insights, setInsights]   = useState<Insight[]>([]);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsRes, insightsRes, tasksRes] = await Promise.all([
        apiFetch(apiUrl("/api/contacts")).then(r => r.json()),
        apiFetch(apiUrl("/api/ai-insights")).then(r => r.json()),
        apiFetch(apiUrl("/api/tasks")).then(r => r.json()),
      ]);
      const contactList: Contact[] = (contactsRes.data ?? []).map((c: Contact) => ({ ...c, score: c.score ?? 0 }));
      setContacts(contactList);
      setInsights(insightsRes.data ?? []);
      const now = new Date();
      const overdue = (tasksRes.data ?? []).filter((t: Task) => t.status !== "completed" && t.dueDate && new Date(t.dueDate) < now);
      setTasks(overdue.slice(0, 4));
      setSelectedContact([...contactList].sort((a: Contact, b: Contact) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const triggerAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      await load();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const topContacts   = [...contacts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 4);
  const churnInsights = insights.filter(i => i.type === "churn");
  const expandInsights = insights.filter(i => i.type === "expansion");
  const allChurnContacts = contacts.filter(c => c.status === "churned");
  const churnContacts = allChurnContacts.slice(0, 3);
  const expansionIds = new Set(expandInsights.flatMap((insight) => insight.contactIds ?? []));
  const vipNoDeals = contacts.filter((contact) => expansionIds.has(contact.id)).slice(0, 3);

  // Score distribution histogram
  const scoreBuckets = [
    { range: "0–20",  count: contacts.filter(c => c.score <= 20).length },
    { range: "21–40", count: contacts.filter(c => c.score > 20 && c.score <= 40).length },
    { range: "41–60", count: contacts.filter(c => c.score > 40 && c.score <= 60).length },
    { range: "61–80", count: contacts.filter(c => c.score > 60 && c.score <= 80).length },
    { range: "81–100",count: contacts.filter(c => c.score > 80).length },
  ];


  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-brand-500">
              <ListChecks size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Operational Signals</h1>
              <p className="text-sm text-surface-500 mt-0.5">Explainable rule matches from current CRM records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Rule Engine Active</span>
            </div>
            <Button variant="gradient" size="sm" icon={RefreshCcw} loading={isAnalyzing} onClick={triggerAnalysis}>
              Refresh Signals
            </Button>
          </div>
        </div>

        {/* Current CRM evidence */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Contacts",       value: loading ? "—" : contacts.length.toLocaleString(),  sub: "In your CRM",           color: "text-brand-400",   bg: "bg-brand-500/10",   icon: ListChecks },
            { label: "Active Signals",      value: loading ? "—" : insights.length,                   sub: "From your data",        color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Target },
            { label: "Churned Contacts",  value: loading ? "—" : allChurnContacts.length,              sub: "Status: churned",       color: "text-amber-400",   bg: "bg-amber-500/10",   icon: UserMinus },
            { label: "High Score Leads",     value: loading ? "—" : contacts.filter(c => c.status === "lead" && c.score >= 70).length, sub: "Score ≥ 70", color: "text-violet-400",  bg: "bg-violet-500/10",  icon: Sparkles },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className={`rounded-xl border border-surface-800 ${stat.bg} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={15} className={stat.color} />
                  <span className="text-xs text-surface-400">{stat.label}</span>
                </div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-surface-600 mt-0.5">{stat.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-3 gap-5">
          {/* Action queue from overdue tasks */}
          <div className="col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-surface-200">Action Queue</h2>
                {!loading && tasks.length > 0 && (
                  <Badge variant="purple" size="sm">{tasks.length} overdue</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => router.push("/crm/tasks")}>View all</Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
            ) : tasks.length === 0 ? (
              <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-8 flex flex-col items-center justify-center gap-2 text-center">
                <Target size={24} className="text-surface-600" />
                <p className="text-sm text-surface-400">No overdue tasks</p>
                <p className="text-xs text-surface-600">All tasks are on track</p>
              </div>
            ) : (
              tasks.map(task => {
                const Icon = TASK_ICONS[task.priority] ?? MessageSquare;
                return (
                  <div key={task.id} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4 hover:border-surface-700 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
                        <Icon size={15} className="text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-semibold text-surface-100">{task.title}</p>
                          <Badge variant={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "info"} size="sm">
                            {task.priority}
                          </Badge>
                        </div>
                        {task.description && <p className="text-[11px] text-surface-500 leading-relaxed">{task.description}</p>}
                        {task.dueDate && (
                          <div className="flex items-center gap-1 mt-2">
                            <Star size={11} className="text-red-400" />
                            <span className="text-[11px] text-red-400">Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="gradient" size="sm" icon={Play} onClick={() => router.push("/crm/tasks")}>Review</Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Rule-based recommendations */}
            {!loading && insights.filter(i => i.type === "opportunity" || i.type === "campaign").length > 0 && (
              <div className="space-y-3 pt-1">
                <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Recommended Actions</h2>
                {insights.filter(i => i.type === "opportunity" || i.type === "campaign").map(insight => (
                  <div key={insight.id} className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 hover:border-brand-500/40 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
                        {insight.type === "opportunity" ? <TrendingUp size={15} className="text-emerald-400" /> : <Zap size={15} className="text-amber-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-surface-100 mb-1">{insight.title}</p>
                        <p className="text-[11px] text-surface-500 leading-relaxed">{insight.body}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { const r = INSIGHT_ROUTES[insight.id]; if (r) router.push(r); }}>{insight.action}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lead Scoring Panel */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-surface-200">Configured Lead Scoring</h2>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-surface-500" /></div>
            ) : topContacts.length === 0 ? (
              <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-6 flex flex-col items-center justify-center gap-2 text-center">
                <Users size={20} className="text-surface-600" />
                <p className="text-xs text-surface-400">Add contacts to see lead scores</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {topContacts.map(contact => (
                    <button key={contact.id} onClick={() => setSelectedContact(contact)}
                      className={cn("w-full flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all",
                        selectedContact?.id === contact.id ? "border-brand-500/40 bg-brand-500/8" : "border-surface-800 bg-surface-900/50 hover:border-surface-700")}>
                      <Avatar name={`${contact.firstName} ${contact.lastName ?? ""}`} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-surface-100 truncate">{contact.firstName} {contact.lastName ?? ""}</p>
                        <p className="text-[10px] text-surface-500 truncate">{contact.jobTitle ?? contact.status}</p>
                      </div>
                      <div className={cn("flex h-7 w-8 items-center justify-center rounded-lg text-xs font-bold",
                        (contact.score ?? 0) >= 85 ? "bg-emerald-500/15 text-emerald-400" :
                        (contact.score ?? 0) >= 70 ? "bg-brand-500/15 text-brand-400" : "bg-amber-500/15 text-amber-400")}>
                        {contact.score ?? 0}
                      </div>
                    </button>
                  ))}
                </div>

                {selectedContact && (
                  <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                    <p className="text-xs font-semibold text-surface-200">{selectedContact.firstName} {selectedContact.lastName ?? ""}</p>
                    <p className="text-[10px] text-surface-500 mb-3">{selectedContact.jobTitle ?? selectedContact.status}</p>
                    <div className="space-y-2">
                      {[
                        { label: "Score",       value: `${selectedContact.score ?? 0}/100` },
                        { label: "Status",      value: selectedContact.status },
                        { label: "Email",       value: selectedContact.email ?? "—" },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between">
                          <span className="text-[10px] text-surface-500">{row.label}</span>
                          <span className="text-[10px] font-semibold text-surface-200 truncate max-w-28">{row.value}</span>
                        </div>
                      ))}
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] text-surface-500 mb-1">
                          <span>Score</span>
                          <span>{selectedContact.score ?? 0}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-800">
                          <div className={cn("h-full rounded-full", (selectedContact.score ?? 0) >= 80 ? "bg-emerald-500" : (selectedContact.score ?? 0) >= 60 ? "bg-brand-500" : "bg-amber-500")}
                            style={{ width: `${selectedContact.score ?? 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Current customer status and expansion candidates */}
        <div className="grid grid-cols-2 gap-5">
          {/* Recorded churn */}
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-surface-200">Recorded Churn</h3>
                <p className="text-xs text-surface-500 mt-0.5">Contacts with churned status</p>
              </div>
              {churnContacts.length > 0 && (
                <Badge variant="danger" size="sm">{churnContacts.length} recorded</Badge>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-surface-500" /></div>
            ) : churnContacts.length === 0 && churnInsights.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                <AlertTriangle size={20} className="text-surface-600" />
                <p className="text-xs text-surface-400">No contacts are currently marked churned</p>
              </div>
            ) : (
              <div className="space-y-2">
                {churnInsights.map(insight => (
                  <div key={insight.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold text-surface-100 mb-1">{insight.title}</p>
                    <p className="text-[11px] text-surface-500 leading-relaxed">{insight.body}</p>
                    <Button variant="danger" size="xs" className="mt-2" onClick={() => router.push("/crm/contacts?status=churned")}>Review contacts</Button>
                  </div>
                ))}
                {churnContacts.map(c => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border border-surface-800 p-3">
                    <Avatar name={`${c.firstName} ${c.lastName ?? ""}`} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-surface-100">{c.firstName} {c.lastName ?? ""}</p>
                      <p className="text-[10px] text-surface-500">{c.email ?? c.status}</p>
                      <div className="mt-1.5 h-1 rounded-full bg-surface-800">
                        <div className="h-full rounded-full bg-red-500" style={{ width: "100%" }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-red-400">Churned</p>
                    </div>
                    <Button variant="outline" size="xs" onClick={() => router.push(`/crm/contacts/${c.id}`)}>Open profile</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expansion Opportunities */}
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-surface-200">Expansion Opportunities</h3>
                <p className="text-xs text-surface-500 mt-0.5">VIP contacts without active deals</p>
              </div>
              {vipNoDeals.length > 0 && (
                <Badge variant="success" size="sm">{vipNoDeals.length} VIP</Badge>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-surface-500" /></div>
            ) : vipNoDeals.length === 0 && expandInsights.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                <ArrowUpRight size={20} className="text-surface-600" />
                <p className="text-xs text-surface-400">No expansion opportunities yet</p>
                <p className="text-[11px] text-surface-600">Mark contacts as VIP and close deals to track expansions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {expandInsights.map(insight => (
                  <div key={insight.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-xs font-semibold text-surface-100 mb-1">{insight.title}</p>
                    <p className="text-[11px] text-surface-500 leading-relaxed">{insight.body}</p>
                    <Button variant="success" size="xs" className="mt-2" onClick={() => router.push("/crm/deals")}>Review candidates</Button>
                  </div>
                ))}
                {vipNoDeals.map(c => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border border-surface-800 p-3">
                    <Avatar name={`${c.firstName} ${c.lastName ?? ""}`} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-surface-100">{c.firstName} {c.lastName ?? ""}</p>
                      <p className="text-[10px] text-surface-500">{c.jobTitle ?? "VIP Contact"}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-emerald-400 font-semibold">No active deal</span>
                      </div>
                    </div>
                    <Button variant="success" size="xs" onClick={() => router.push("/crm/deals")}>Open deals</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Score evidence */}
        {contacts.length > 0 && (
          <div className="grid grid-cols-2 gap-5">
            {/* Score Distribution */}
            <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
              <h3 className="text-sm font-semibold text-surface-200 mb-1">Score Distribution</h3>
              <p className="text-xs text-surface-500 mb-4">Contacts by configured score range</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreBuckets} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="range" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#94a3b8" }} />
                    <Bar dataKey="count" name="Contacts" fill="#6366f1" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Scoring methodology */}
            <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
              <h3 className="text-sm font-semibold text-surface-200 mb-1">Scoring Methodology</h3>
              <p className="text-xs text-surface-500 mb-4">The displayed score is produced by the tenant-configured deterministic scoring model.</p>
              <div className="space-y-3 text-xs">
                <div className="rounded-lg border border-surface-800 bg-surface-950/40 p-3">
                  <p className="font-semibold text-surface-200">What it means</p>
                  <p className="mt-1 text-surface-500">A higher score means more configured positive factors matched. It is not a purchase probability, forecast, or machine-learning prediction.</p>
                </div>
                <div className="rounded-lg border border-surface-800 bg-surface-950/40 p-3">
                  <p className="font-semibold text-surface-200">Current evidence</p>
                  <p className="mt-1 text-surface-500">Status, available contact details, and approved custom-field rules contribute only when they are present in the contact record.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push("/ai/scoring")}>Review scoring model</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

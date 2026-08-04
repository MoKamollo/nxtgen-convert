"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConfirmAction, Toast } from "@/components/modules/ModulePrimitives";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatNumber, formatPercent, timeAgo, cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  Plus,
  Search,
  Mail,
  BarChart3,
  Send,
  Clock,
  MousePointerClick,
  Eye,
  Users,
  Zap,
  MessageSquare,
  ChevronRight,
  MoreHorizontal,
  X,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type Campaign = {
  id: string; name: string; type: string; status: string; subject: string | null;
  sentAt: string | null; scheduledAt: string | null; audienceSize?: number;
  stats: { sent: number; delivered: number; opened: number; clicked: number; bounced: number; unsubscribed: number; revenue: number };
};

const campaignTypeIcons = {
  email: Mail,
  sms: MessageSquare,
  push: Zap,
  whatsapp: MessageSquare,
};

export default function CampaignsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "email", subject: "", fromName: "", fromEmail: "" });
  const [actionError, setActionError] = useState("");

  const load = useCallback(() => {
    apiFetch(apiUrl("/api/campaigns"))
      .then((r) => r.json())
      .then((j) => setAllCampaigns(j.data ?? []));
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await apiFetch(apiUrl("/api/campaigns"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        subject: form.subject || null,
        fromName: form.fromName || null,
        fromEmail: form.fromEmail || null,
      }),
    });
    setSaving(false);
    setShowModal(false);
    setForm({ name: "", type: "email", subject: "", fromName: "", fromEmail: "" });
    load();
  };

  const handleLaunch = async (campaignId: string) => {
    setLaunching(campaignId);
    const res = await apiFetch(apiUrl(`/api/campaigns/${campaignId}/send`), { method: "POST" });
    const j = await res.json();
    setLaunching(null);
    if (res.ok) {
      load();
    } else {
      setActionError(j.error ?? "Failed to send campaign");
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(apiUrl(`/api/campaigns/${id}`), { method: "DELETE" });
    setAllCampaigns(prev => prev.filter(c => c.id !== id));
    setActiveMenu(null);
  };

  const TAB_STATUS_MAP: Record<string, string[]> = {
    All: [],
    Active: ["sending", "scheduled"],
    Draft: ["draft"],
    Sent: ["sent"],
  };

  const filtered = allCampaigns.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    const allowed = TAB_STATUS_MAP[activeTab] ?? [];
    if (allowed.length > 0 && !allowed.includes(c.status)) return false;
    return true;
  });

  const getOpenRate = (c: Campaign) => {
    if (!c.stats.delivered) return 0;
    return (c.stats.opened / c.stats.delivered) * 100;
  };

  const getClickRate = (c: Campaign) => {
    if (!c.stats.opened) return 0;
    return (c.stats.clicked / c.stats.opened) * 100;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">
              Email Campaigns
            </h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {allCampaigns.length} campaign{allCampaigns.length !== 1 ? "s" : ""}
              {allCampaigns.filter(c => c.status === "sent").length > 0 ? ` · ${allCampaigns.filter(c => c.status === "sent").length} sent` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={BarChart3} onClick={() => router.push("/email/analytics")}>
              Analytics
            </Button>
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>
              New Campaign
            </Button>
          </div>
        </div>

        {/* Summary Stats — derived from real campaign data */}
        {(() => {
          const sent = allCampaigns.reduce((s, c) => s + (c.stats?.sent ?? 0), 0);
          const sentCampaigns = allCampaigns.filter(c => (c.stats?.sent ?? 0) > 0);
          const avgOpen = sentCampaigns.length > 0
            ? sentCampaigns.reduce((s, c) => s + (c.stats.delivered > 0 ? (c.stats.opened / c.stats.delivered) * 100 : 0), 0) / sentCampaigns.length
            : 0;
          const avgClick = sentCampaigns.length > 0
            ? sentCampaigns.reduce((s, c) => s + (c.stats.opened > 0 ? (c.stats.clicked / c.stats.opened) * 100 : 0), 0) / sentCampaigns.length
            : 0;
          return (
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Emails Sent", value: formatNumber(sent), icon: Send, color: "text-brand-400", bg: "bg-brand-500/10" },
                { label: "Avg Open Rate", value: sent > 0 ? formatPercent(avgOpen) : "—", icon: Eye, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                { label: "Avg Click Rate", value: sent > 0 ? formatPercent(avgClick) : "—", icon: MousePointerClick, color: "text-violet-400", bg: "bg-violet-500/10" },
                { label: "Confirmed Delivered", value: formatNumber(allCampaigns.reduce((sum, campaign) => sum + (campaign.stats?.delivered ?? 0), 0)), icon: Mail, color: "text-amber-400", bg: "bg-amber-500/10" },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bg}`}>
                        <Icon size={15} className={stat.color} />
                      </div>
                      <span className="text-xs text-surface-500">{stat.label}</span>
                    </div>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex items-center rounded-lg border border-surface-700 bg-surface-900 p-0.5">
            {["All", "Active", "Draft", "Sent"].map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs transition-all",
                  activeTab === t
                    ? "bg-surface-700 text-surface-100 font-medium"
                    : "text-surface-500 hover:text-surface-200"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1" />
        </div>

        {/* Campaign List */}
        {allCampaigns.length === 0 ? (
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-12 flex flex-col items-center justify-center gap-3 text-center">
            <Mail size={32} className="text-surface-600" />
            <p className="text-sm font-semibold text-surface-300">No campaigns yet</p>
            <p className="text-xs text-surface-500">Create your first email campaign to start reaching your audience</p>
            <Button variant="outline" size="sm" icon={Plus} onClick={() => setShowModal(true)}>New Campaign</Button>
          </div>
        ) : (
        <div className="space-y-3">
          {filtered.map((campaign) => {
            const TypeIcon = campaignTypeIcons[campaign.type as keyof typeof campaignTypeIcons] || Mail;
            const openRate = getOpenRate(campaign);
            const clickRate = getClickRate(campaign);

            return (
              <div
                key={campaign.id}
                className="rounded-xl border border-surface-800 bg-surface-900/50 hover:border-surface-700 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Icon & Type */}
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    campaign.status === "sending" ? "bg-amber-500/15" :
                    campaign.status === "sent" ? "bg-emerald-500/15" :
                    campaign.status === "scheduled" ? "bg-blue-500/15" : "bg-surface-800"
                  )}>
                    <TypeIcon size={18} className={cn(
                      campaign.status === "sending" ? "text-amber-400" :
                      campaign.status === "sent" ? "text-emerald-400" :
                      campaign.status === "scheduled" ? "text-blue-400" : "text-surface-400"
                    )} />
                  </div>

                  {/* Name & Subject */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-surface-100 truncate">
                        {campaign.name}
                      </p>
                      <StatusBadge status={campaign.status} />
                    </div>
                    {campaign.subject && (
                      <p className="text-xs text-surface-500 truncate mt-0.5">
                        {campaign.subject}
                      </p>
                    )}
                  </div>

                  {/* Stats */}
                  {campaign.stats.sent > 0 ? (
                    <div className="hidden lg:grid grid-cols-4 gap-6">
                      <div className="text-center">
                        <p className="text-xs font-bold text-surface-200">
                          {formatNumber(campaign.stats.sent)}
                        </p>
                        <p className="text-[10px] text-surface-600 mt-0.5">Sent</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-emerald-400">
                          {formatPercent(openRate)}
                        </p>
                        <p className="text-[10px] text-surface-600 mt-0.5">Open</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-brand-400">
                          {formatPercent(clickRate)}
                        </p>
                        <p className="text-[10px] text-surface-600 mt-0.5">Click</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-amber-400">
                          {formatNumber(campaign.stats.delivered)}
                        </p>
                        <p className="text-[10px] text-surface-600 mt-0.5">Delivered</p>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden lg:flex items-center gap-2 text-xs text-surface-500">
                      <Users size={13} />
                      {(campaign.audienceSize ?? 0).toLocaleString()} recipients
                      {campaign.scheduledAt && (
                        <>
                          <span className="text-surface-700">·</span>
                          <Clock size={13} />
                          Scheduled {timeAgo(campaign.scheduledAt)}
                        </>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 ml-2 relative">
                    {campaign.status === "draft" && (
                      <div onClick={(event) => event.stopPropagation()}>
                        <ConfirmAction
                          label={launching === campaign.id ? "Sending…" : "Launch"}
                          disabled={launching === campaign.id}
                          onConfirm={() => handleLaunch(campaign.id)}
                        />
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === campaign.id ? null : campaign.id); }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-all">
                      <MoreHorizontal size={14} />
                    </button>
                    {activeMenu === campaign.id && (
                      <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-surface-700 bg-surface-900 shadow-xl py-1">
                        <div className="px-2 py-1"><ConfirmAction onConfirm={() => handleDelete(campaign.id)} /></div>
                      </div>
                    )}
                    <ChevronRight size={14} className="text-surface-700 group-hover:text-surface-500 transition-colors ml-1" />
                  </div>
                </div>

                {/* Progress bar for sending campaigns */}
                {campaign.status === "sending" && (
                  <div className="px-4 pb-3">
                    <div className="flex items-center justify-between text-[11px] text-surface-500 mb-1.5">
                      <span>Sending progress</span>
                      <span>
                        {formatNumber(campaign.stats.delivered)} / {formatNumber(campaign.audienceSize ?? 0)} delivered
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-surface-800">
                      <div
                        className="h-full rounded-full bg-brand-500 animate-pulse"
                        style={{ width: `${campaign.audienceSize ? Math.min(100, (campaign.stats.delivered / campaign.audienceSize) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        )}

      </div>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
              <h2 className="text-sm font-bold text-surface-100">New Campaign</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Campaign name *</label>
                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Summer Launch 2026"
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="rounded-lg border border-surface-800 bg-surface-950/40 p-3">
                <div className="flex items-center gap-2"><Mail size={13} className="text-brand-400" /><span className="text-xs font-semibold text-surface-200">Email channel</span></div>
                <p className="mt-1 text-[10px] text-surface-500">SMS and push delivery remain unavailable until verified provider connectors are configured.</p>
              </div>
              {form.type === "email" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-surface-400 mb-1.5">Subject line</label>
                    <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                      placeholder="e.g. Don't miss this offer 🎯"
                      className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-surface-400 mb-1.5">From name</label>
                      <input value={form.fromName} onChange={e => setForm(p => ({ ...p, fromName: e.target.value }))}
                        placeholder="Your Name"
                        className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-surface-400 mb-1.5">From email</label>
                      <input type="email" value={form.fromEmail} onChange={e => setForm(p => ({ ...p, fromEmail: e.target.value }))}
                        placeholder="you@company.com"
                        className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                    </div>
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-9 px-4 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="h-9 px-4 rounded-lg bg-gradient-to-r from-brand-500 to-blue-500 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {saving ? "Creating…" : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {actionError && <Toast message={actionError} type="error" />}
    </AppLayout>
  );
}

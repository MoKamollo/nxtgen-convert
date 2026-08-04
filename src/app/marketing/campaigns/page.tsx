"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import { Plus, Megaphone, TrendingUp, BarChart3, Mail, MessageSquare, Zap, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Campaign = {
  id: string; name: string; type: string; status: string;
  subject: string | null; scheduledAt: string | null; sentAt: string | null;
  stats: { sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number; unsubscribed: number };
};

const TYPE_ICONS: Record<string, typeof Mail> = {
  email: Mail, sms: MessageSquare, push: Zap, whatsapp: MessageSquare, social: TrendingUp,
};

const STATUS_COLORS: Record<string, string> = {
  sending:   "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  sent:      "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  scheduled: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  draft:     "text-surface-400 bg-surface-800 border-surface-700",
  paused:    "text-amber-400 bg-amber-500/10 border-amber-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(apiUrl("/api/campaigns"))
      .then(r => r.json())
      .then(j => { setCampaigns(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const active    = campaigns.filter(c => c.status === "sending" || c.status === "sent").length;
  const totalSent = campaigns.reduce((s, c) => s + (c.stats?.sent ?? 0), 0);
  const delivered = campaigns.reduce((sum, campaign) => sum + (campaign.stats?.delivered ?? 0), 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Marketing Campaigns</h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}{active > 0 ? ` · ${active} active` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={BarChart3} onClick={() => router.push("/analytics/campaigns")}>Campaign Analytics</Button>
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => router.push("/email/campaigns")}>New Email Campaign</Button>
          </div>
        </div>

        {/* Stats derived from real data */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active Campaigns",    value: active,                          icon: Megaphone,  color: "text-brand-400" },
            { label: "Total Emails Sent",   value: formatNumber(totalSent),         icon: TrendingUp, color: "text-emerald-400" },
            { label: "Confirmed Delivered", value: formatNumber(delivered), icon: TrendingUp, color: "text-amber-400" },
            { label: "Total Campaigns",     value: campaigns.length,                icon: BarChart3,  color: "text-violet-400" },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className={stat.color} />
                  <span className="text-xs text-surface-500">{stat.label}</span>
                </div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-12 flex flex-col items-center justify-center gap-3 text-center">
            <Megaphone size={32} className="text-surface-600" />
            <p className="text-sm font-semibold text-surface-300">No campaigns yet</p>
            <p className="text-xs text-surface-500">Create your first campaign to start reaching your audience</p>
            <Button variant="outline" size="sm" icon={Plus} onClick={() => router.push("/email/campaigns")}>New Email Campaign</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(campaign => {
              const Icon = TYPE_ICONS[campaign.type] ?? Mail;
              const openRate = campaign.stats.delivered > 0 ? Math.round((campaign.stats.opened / campaign.stats.delivered) * 100) : 0;
              return (
                <div key={campaign.id} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4 hover:border-surface-700 transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10">
                      <Icon size={18} className="text-brand-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-surface-100">{campaign.name}</p>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[campaign.status] ?? STATUS_COLORS.draft}`}>
                          {campaign.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-surface-500 capitalize">{campaign.type}</span>
                        {campaign.subject && (
                          <>
                            <span className="text-surface-700">·</span>
                            <span className="text-xs text-surface-600 truncate max-w-64">{campaign.subject}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {(campaign.stats?.sent ?? 0) > 0 && (
                      <div className="hidden lg:grid grid-cols-3 gap-6">
                        <div className="text-center">
                          <p className="text-xs font-bold text-surface-100">{formatNumber(campaign.stats.sent)}</p>
                          <p className="text-[10px] text-surface-600">Sent</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-emerald-400">{openRate}%</p>
                          <p className="text-[10px] text-surface-600">Open Rate</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-amber-400">{formatNumber(campaign.stats.delivered)}</p>
                          <p className="text-[10px] text-surface-600">Delivered</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

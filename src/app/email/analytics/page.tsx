"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  ErrorState,
  LoadingState,
  ModuleHeader,
  SearchField,
  StatGrid,
  StatusBadge,
} from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  AlertTriangle,
  Eye,
  MailCheck,
  MousePointerClick,
  Send,
  UserMinus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
type Data = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
  dailySends: Array<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
  }>;
  topLinks: Array<{ url: string; clicks: number }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    sentAt: string | null;
    computedStats: {
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
    };
  }>;
};
export default function EmailAnalytics() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(apiUrl("/api/email/analytics"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load email analytics",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const campaigns = useMemo(
    () =>
      data?.campaigns
        .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
          const ar = a.computedStats.delivered
              ? a.computedStats.opened / a.computedStats.delivered
              : 0,
            br = b.computedStats.delivered
              ? b.computedStats.opened / b.computedStats.delivered
              : 0;
          return br - ar;
        }) || [],
    [data, search],
  );
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Email Analytics"
          description="Delivery, engagement, and link performance across email campaigns"
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              columns={6}
              stats={[
                { label: "Total Sent", value: data.sent, icon: Send },
                {
                  label: "Delivered Rate",
                  value: `${data.sent ? ((data.delivered / data.sent) * 100).toFixed(1) : 0}%`,
                  icon: MailCheck,
                  tone: "green",
                },
                {
                  label: "Open Rate",
                  value: `${data.avgOpenRate}%`,
                  icon: Eye,
                  tone: "violet",
                },
                {
                  label: "Click Rate",
                  value: `${data.avgClickRate}%`,
                  icon: MousePointerClick,
                  tone: "amber",
                },
                {
                  label: "Bounce Rate",
                  value: `${data.avgBounceRate}%`,
                  icon: AlertTriangle,
                  tone: "red",
                },
                {
                  label: "Unsubscribe Rate",
                  value: `${data.delivered ? ((data.unsubscribed / data.delivered) * 100).toFixed(1) : 0}%`,
                  icon: UserMinus,
                  tone: "red",
                },
              ]}
            />
            <div className="h-80 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
              <p className="mb-4 text-sm font-semibold text-surface-200">
                Last 30 days
              </p>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={data.dailySends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#64748b", fontSize: 9 }}
                  />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sent"
                    stroke="#6366f1"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="opened"
                    stroke="#10b981"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="clicked"
                    stroke="#f59e0b"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 rounded-xl border border-surface-800 bg-surface-900/50">
                <div className="flex items-center justify-between border-b border-surface-800 p-4">
                  <p className="text-sm font-semibold text-surface-200">
                    Campaign comparison
                  </p>
                  <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Search campaigns..."
                  />
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {[
                        "Campaign",
                        "Status",
                        "Sent",
                        "Open rate",
                        "Click rate",
                      ].map((h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {campaigns.map((c) => {
                      const s = c.computedStats;
                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-3 font-semibold text-surface-100">
                            {c.name}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge value={c.status} />
                          </td>
                          <td className="px-4 py-3 text-surface-300">
                            {s.sent}
                          </td>
                          <td className="px-4 py-3 text-emerald-400">
                            {s.delivered
                              ? ((s.opened / s.delivered) * 100).toFixed(1)
                              : 0}
                            %
                          </td>
                          <td className="px-4 py-3 text-violet-400">
                            {s.opened
                              ? ((s.clicked / s.opened) * 100).toFixed(1)
                              : 0}
                            %
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-900/50">
                <div className="border-b border-surface-800 p-4 text-sm font-semibold text-surface-200">
                  Top performing links
                </div>
                {data.topLinks.length === 0 ? (
                  <p className="p-4 text-xs text-surface-500">
                    No link click data yet.
                  </p>
                ) : (
                  <div className="divide-y divide-surface-800">
                    {data.topLinks.slice(0, 12).map((l) => (
                      <div
                        key={l.url}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <p className="min-w-0 truncate text-[11px] text-surface-300">
                          {l.url}
                        </p>
                        <span className="rounded bg-brand-500/10 px-2 py-1 text-[10px] text-brand-400">
                          {l.clicks}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

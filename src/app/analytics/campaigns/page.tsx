"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  ErrorState,
  LoadingState,
  ModuleHeader,
  StatGrid,
  StatusBadge,
} from "@/components/modules/ModulePrimitives";
import { apiUrl } from "@/lib/org";
import { BarChart3, Eye, Mail, MousePointerClick, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
type Data = {
  campaigns: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    sentAt: string | null;
    normalizedStats: {
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      unsubscribed: number;
      revenue: number;
    };
  }>;
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    revenue: number;
  };
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
};
export default function CampaignAnalytics() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/analytics/campaigns"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Campaign Analytics"
          description="Performance across all marketing campaigns"
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              columns={5}
              stats={[
                { label: "Total Sent", value: data.totals.sent, icon: Send },
                {
                  label: "Delivered",
                  value: data.totals.delivered,
                  icon: Mail,
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
                  icon: BarChart3,
                  tone: "red",
                },
              ]}
            />
            <div className="h-80 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
              <p className="mb-4 text-sm font-semibold text-surface-200">
                Campaign Comparison
              </p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart
                  data={data.campaigns
                    .slice(0, 12)
                    .map((c) => ({
                      name: c.name.slice(0, 18),
                      opened: c.normalizedStats.opened,
                      clicked: c.normalizedStats.clicked,
                    }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                    }}
                  />
                  <Bar dataKey="opened" fill="#6366f1" />
                  <Bar dataKey="clicked" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                    {[
                      "Campaign",
                      "Type",
                      "Status",
                      "Sent",
                      "Open Rate",
                      "Click Rate",
                      "Bounce Rate",
                    ].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {data.campaigns.map((c) => {
                    const s = c.normalizedStats;
                    const rate = (n: number, d: number) =>
                      d ? `${((n / d) * 100).toFixed(1)}%` : "—";
                    return (
                      <tr key={c.id} className="hover:bg-surface-800/30">
                        <td className="px-4 py-3 font-semibold text-surface-100">
                          {c.name}
                        </td>
                        <td className="px-4 py-3 capitalize text-surface-400">
                          {c.type}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={c.status} />
                        </td>
                        <td className="px-4 py-3 text-surface-300">{s.sent}</td>
                        <td className="px-4 py-3 text-emerald-400">
                          {rate(s.opened, s.delivered || s.sent)}
                        </td>
                        <td className="px-4 py-3 text-violet-400">
                          {rate(s.clicked, s.opened)}
                        </td>
                        <td className="px-4 py-3 text-red-400">
                          {rate(s.bounced, s.sent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import { TrendingUp, TrendingDown, DollarSign, Target, Loader2, BarChart3 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type KPIs = {
  mrr: { value: number; change: number; trend: string };
  arr: { value: number; change: number; trend: string };
  churnRate: { value: number; available?: boolean; change: number; trend: string };
  ltv: { value: number; change: number; trend: string };
  winRate: { value: number; change: number; trend: string };
  pipelineValue: { value: number; change: number; trend: string };
};

type RevenueRow = { month: string; mrr: number; arr: number; new: number; churned: number; net: number };

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>;
  label?: string;
}) => {
  if (active && payload?.length) {
    return (
      <div className="rounded-xl border border-surface-700 bg-surface-900 p-3 shadow-xl min-w-44">
        <p className="text-xs font-semibold text-surface-300 mb-2">{label}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs mb-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-surface-400 capitalize">{p.name}</span>
            </div>
            <span className="font-semibold text-surface-100">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};


export default function RevenueAnalyticsPage() {
  const [period, setPeriod] = useState("12m");
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    // Map UI period labels to API period params (keys must match button values)
    const periodMap: Record<string, string> = { "3m": "90d", "6m": "180d", "12m": "1y", "YTD": "ytd", "All": "all" };
    const apiPeriod = periodMap[period] ?? "1y";
    apiFetch(apiUrl("/api/analytics", { type: "overview", period: apiPeriod }))
      .then(r => r.json())
      .then(j => {
        if (j.data?.kpis) setKpis(j.data.kpis);
        if (j.data?.revenue) setRevenueData(j.data.revenue);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const mrrGrowthData = revenueData.map((d, i) => ({
    ...d,
    growth: i === 0 ? 0 : Math.round(((d.mrr - revenueData[i - 1].mrr) / (revenueData[i - 1].mrr || 1)) * 100 * 10) / 10,
  }));

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 size={24} className="animate-spin text-surface-500" />
        </div>
      </AppLayout>
    );
  }

  const metrics = kpis ? [
    { label: "MRR",        value: formatCurrency(kpis.mrr.value),       change: kpis.mrr.change,       desc: "Monthly Recurring Revenue",  color: "text-emerald-400", Icon: DollarSign,  invertPositive: false },
    { label: "ARR",        value: formatCurrency(kpis.arr.value),       change: kpis.arr.change,       desc: "Annual Recurring Revenue",   color: "text-brand-400",   Icon: TrendingUp,  invertPositive: false },
    { label: "Churn Rate", value: kpis.churnRate.available === false ? "Not available" : formatPercent(kpis.churnRate.value), change: kpis.churnRate.change, desc: kpis.churnRate.available === false ? "Requires subscription history" : "Monthly customer churn", color: "text-amber-400", Icon: TrendingDown, invertPositive: true },
    { label: "Win Rate",   value: formatPercent(kpis.winRate.value),    change: kpis.winRate.change,   desc: "Closed won / total closed",  color: "text-violet-400",  Icon: Target,       invertPositive: false },
  ] : [];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Revenue Analytics</h1>
            <p className="text-sm text-surface-500 mt-0.5">Calculated from recorded subscriptions and closed deal activity</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-surface-700 bg-surface-900 p-0.5">
              {["3m","6m","12m","YTD","All"].map(p => (
                <button key={p} onClick={() => setPeriod(p)} className={cn("px-2.5 py-1 rounded-md text-xs transition-all", period === p ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300")}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map(metric => {
            const Icon = metric.Icon;
            const isPositive = metric.change > 0;
            const isGood = metric.invertPositive ? !isPositive : isPositive;
            return (
              <div key={metric.label} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">{metric.label}</span>
                  <Icon size={14} className={metric.color} />
                </div>
                <p className="text-2xl font-bold text-surface-50">{metric.value}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {metric.change !== 0 ? (
                    <span className={cn("text-xs font-semibold", isGood ? "text-emerald-400" : "text-red-400")}>
                      {isPositive ? "↑" : "↓"} {Math.abs(metric.change)}%
                    </span>
                  ) : (
                    <span className="text-xs text-surface-600">No prior data</span>
                  )}
                  <span className="text-xs text-surface-600">{metric.desc}</span>
                </div>
              </div>
            );
          })}
        </div>

        {revenueData.length === 0 ? (
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-12 flex flex-col items-center justify-center gap-3 text-center">
            <BarChart3 size={32} className="text-surface-600" />
            <p className="text-sm font-semibold text-surface-300">No revenue data yet</p>
            <p className="text-xs text-surface-500">Add active subscription records to populate recurring revenue charts.</p>
          </div>
        ) : (
          <>
            {/* MRR Charts */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 rounded-xl border border-surface-800 bg-surface-900/50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-surface-200">MRR Breakdown</h3>
                    <p className="text-xs text-surface-500 mt-0.5">New · Expansion · Churn</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {[{ label:"New", color:"bg-emerald-500" }, { label:"Net", color:"bg-brand-500" }, { label:"MRR", color:"bg-violet-500" }].map(l => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${l.color}`} />
                        <span className="text-surface-400">{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={revenueData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="new" name="New" fill="#10b981" radius={[3,3,0,0]} fillOpacity={0.8} />
                      <Bar dataKey="net" name="Net" fill="#6366f1" radius={[3,3,0,0]} fillOpacity={0.8} />
                      <Line type="monotone" dataKey="mrr" name="MRR" stroke="#818cf8" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
                <h3 className="text-sm font-semibold text-surface-200 mb-4">Monthly Growth</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mrrGrowthData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip formatter={v => [`${v}%`, "Growth"]} contentStyle={{ background:"#1e293b", border:"1px solid #334155", borderRadius: 8, fontSize: 12 }} labelStyle={{ color:"#94a3b8" }} />
                      <Bar dataKey="growth" radius={[3,3,0,0]}>
                        {mrrGrowthData.map((entry, i) => <Cell key={i} fill={entry.growth >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.85} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ARR Trajectory */}
            <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-surface-200">ARR Trajectory</h3>
                  <p className="text-xs text-surface-500 mt-0.5">Cumulative annualized run rate</p>
                </div>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="arrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill:"#64748b", fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:"#64748b", fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                    <Tooltip formatter={v => [formatCurrency(Number(v)), "ARR"]} contentStyle={{ background:"#1e293b", border:"1px solid #334155", borderRadius:8, fontSize:12 }} labelStyle={{ color:"#94a3b8" }} />
                    <Area type="monotone" dataKey="arr" name="ARR" stroke="#8b5cf6" fill="url(#arrGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* Team Performance — placeholder until team quota tracking is implemented */}
        <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
          <h3 className="text-sm font-semibold text-surface-200 mb-4">Team Revenue Performance</h3>
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <Target size={24} className="text-surface-600" />
            <p className="text-xs text-surface-400">Assign deal owners to track individual quota attainment</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

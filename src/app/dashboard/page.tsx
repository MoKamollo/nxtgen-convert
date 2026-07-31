"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { MetricCard } from "@/components/ui/Card";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { PipelineChart, TrafficSourcesChart, ConversionFunnelChart } from "@/components/dashboard/PipelineChart";
import { AIInsightsPanel } from "@/components/dashboard/AIInsights";
import { RecentActivityFeed, TopDeals } from "@/components/dashboard/RecentActivity";
import {
  TrendingUp, Users, DollarSign, BarChart3, Target, Trophy,
  HeartPulse, Ticket, Percent, ArrowUpRight,
} from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import { apiUrl } from "@/lib/org";
import { useState, useEffect } from "react";

const DEFAULT_KPIS = {
  mrr: { value: 0, change: 0, trend: "up" as const },
  arr: { value: 0, change: 0, trend: "up" as const },
  totalContacts: { value: 0, change: 0, trend: "up" as const },
  activeDeals: { value: 0, change: 0, trend: "up" as const },
  pipelineValue: { value: 0, change: 0, trend: "up" as const },
  avgDealSize: { value: 0, change: 0, trend: "up" as const },
  winRate: { value: 0, change: 0, trend: "up" as const },
  churnRate: { value: 0, change: 0, trend: "up" as const },
  cac: { value: 0, change: 0, trend: "up" as const },
  ltv: { value: 0, change: 0, trend: "up" as const },
  nps: { value: 0, change: 0, trend: "up" as const },
  openTickets: { value: 0, change: 0, trend: "up" as const },
  activeWorkflows: { value: 0, enrolled: 0 },
};

export default function DashboardPage() {
  const [kpis, setKpis] = useState(DEFAULT_KPIS);
  const [period, setPeriod] = useState("30d");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [quota, setQuota] = useState<Array<{ userId: string; name: string; avatar: string | null; wonDeals: number; wonValue: number; quota: number }>>([]);

  useEffect(() => {
    fetch(apiUrl("/api/team/quota")).then(r => r.json()).then(j => setQuota(j.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(apiUrl("/api/analytics", { type: "overview", period }))
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j.data?.kpis) setKpis({ ...DEFAULT_KPIS, ...j.data.kpis });
          setLastUpdated(new Date());
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [period]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Revenue Intelligence</h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · All systems operational
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5" title={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading…"}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Live</span>
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-8 rounded-lg border border-surface-700 bg-surface-900 text-xs text-surface-300 px-2.5 focus:outline-none focus:border-brand-500"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">This year</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>

        {/* Primary KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <MetricCard label="Monthly Recurring Revenue" value={formatCurrency(kpis.mrr.value)} change={kpis.mrr.change} trend={kpis.mrr.trend} icon={<DollarSign size={18} />} colorClass="text-emerald-400" subValue={`ARR ${formatCurrency(kpis.arr.value)}`} />
          <MetricCard label="Total Contacts" value={formatNumber(kpis.totalContacts.value)} change={kpis.totalContacts.change} trend={kpis.totalContacts.trend} icon={<Users size={18} />} colorClass="text-brand-400" />
          <MetricCard label="Pipeline Value" value={formatCurrency(kpis.pipelineValue.value)} change={kpis.pipelineValue.change} trend={kpis.pipelineValue.trend} icon={<BarChart3 size={18} />} colorClass="text-violet-400" subValue={`${kpis.activeDeals.value} active deals`} />
          <MetricCard label="Win Rate" value={formatPercent(kpis.winRate.value)} change={kpis.winRate.change} trend={kpis.winRate.trend} icon={<Trophy size={18} />} colorClass="text-amber-400" subValue={`Avg deal ${formatCurrency(kpis.avgDealSize.value)}`} />
          <MetricCard label="NPS Score" value={kpis.nps.value} change={kpis.nps.change} trend={kpis.nps.trend} icon={<HeartPulse size={18} />} colorClass="text-pink-400" subValue={`Churn ${formatPercent(kpis.churnRate.value)}`} />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">LTV</span>
              <ArrowUpRight size={14} className="text-emerald-400" />
            </div>
            <p className="text-xl font-bold text-surface-50">{formatCurrency(kpis.ltv.value)}</p>
            <p className="text-xs text-surface-500 mt-1">CAC: {formatCurrency(kpis.cac.value)}</p>
            <p className="text-xs font-semibold text-emerald-400 mt-1">LTV:CAC = {kpis.cac.value > 0 ? (kpis.ltv.value / kpis.cac.value).toFixed(1) : "—"}x</p>
          </div>
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Open Tickets</span>
              <Ticket size={14} className="text-red-400" />
            </div>
            <p className="text-xl font-bold text-surface-50">{kpis.openTickets.value}</p>
            <p className="text-xs text-emerald-400 mt-1">{kpis.openTickets.change !== 0 ? `${kpis.openTickets.change > 0 ? "↑" : "↓"} ${Math.abs(kpis.openTickets.change)}% vs last week` : "No change data yet"}</p>
            <div className="mt-2 h-1 rounded-full bg-surface-800">
              <div className="h-full rounded-full bg-red-500/60" style={{ width: `${Math.min((kpis.openTickets.value / 50) * 100, 100)}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Churn Rate</span>
              <Percent size={14} className="text-amber-400" />
            </div>
            <p className="text-xl font-bold text-surface-50">{formatPercent(kpis.churnRate.value)}</p>
            <p className="text-xs text-emerald-400 mt-1">{kpis.churnRate.change !== 0 ? `${kpis.churnRate.change > 0 ? "↑" : "↓"} ${Math.abs(kpis.churnRate.change)}% from last month` : "Tracking monthly"}</p>
            <div className="mt-2 h-1 rounded-full bg-surface-800">
              <div className="h-full rounded-full bg-amber-500/80" style={{ width: `${Math.min(kpis.churnRate.value * 5, 100)}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Active Workflows</span>
              <Target size={14} className="text-brand-400" />
            </div>
            <p className="text-xl font-bold text-surface-50">{kpis.activeWorkflows.value}</p>
            <p className="text-xs text-surface-500 mt-1">{kpis.activeWorkflows.enrolled.toLocaleString()} contacts enrolled</p>
          </div>
        </div>

        {/* AI Insights */}
        <AIInsightsPanel />

        {/* Main Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <RevenueChart period={period} />
          <PipelineChart />
        </div>

        {/* Secondary Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <TrafficSourcesChart />
          <ConversionFunnelChart />
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
            <h3 className="text-sm font-semibold text-surface-200 mb-4">Team Quota Attainment</h3>
            {quota.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-center gap-2"><Target size={24} className="text-surface-600"/><p className="text-xs text-surface-500">No team quota data yet.</p><p className="text-xs text-surface-600">Set a quota in each user's preferences and assign won deals.</p></div> : <div className="space-y-4">{quota.slice(0,6).map(member => { const attainment = member.quota > 0 ? Math.min(100, member.wonValue / member.quota * 100) : 0; return <div key={member.userId}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium text-surface-300">{member.name}</span><span className="text-surface-500">{member.quota > 0 ? `${attainment.toFixed(0)}%` : "No quota"}</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-800"><div className="h-full rounded-full bg-brand-500" style={{width:`${attainment}%`}}/></div><div className="mt-1 flex justify-between text-[10px] text-surface-600"><span>{formatCurrency(member.wonValue)} won</span><span>{member.wonDeals} deals</span></div></div>})}</div>}
          </div>
        </div>

        {/* Activity Feed + Top Deals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentActivityFeed />
          <TopDeals />
        </div>
      </div>
    </AppLayout>
  );
}

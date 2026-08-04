"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState, LoadingState, ModuleHeader, SearchField, StatGrid, StatusBadge } from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import { Crown, DollarSign, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Data = {
  totals: { totalCustomers: number; newThisMonth: number; recognizedRevenuePerCurrentCustomer: number; churnRate: null; churnAvailable: false; churnReason: string; vipCount: number };
  newCustomersByMonth: Array<{ month: string; label: string; count: number }>;
  sourceBreakdown: Array<{ source: string; count: number }>;
  topCustomers: Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null; status: string | null; source: string | null; recognizedRevenue: number }>;
  statusDistribution: { leads: number; prospects: number; customers: number; churnedStatus: number };
  methodology: string;
};
const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const maxStatusCount = (distribution: Data["statusDistribution"]): number => Math.max(...Object.values(distribution), 1);

export default function CustomersAnalytics() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl("/api/analytics/customers"));
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setData(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load customer analytics");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const rows = useMemo(() => data?.topCustomers.filter((customer) => `${customer.firstName || ""} ${customer.lastName || ""} ${customer.email || ""}`.toLowerCase().includes(search.toLowerCase())) || [], [data, search]);

  return <AppLayout><div className="space-y-5 p-6">
    <ModuleHeader title="Customer Analytics" description="Customer counts, current lifecycle status, acquisition sources, and recognized closed deal revenue" />
    {error && <ErrorState message={error} retry={load} />}
    {loading || !data ? <LoadingState /> : <>
      <StatGrid columns={5} stats={[
        { label: "Current Customers", value: data.totals.totalCustomers, icon: Users },
        { label: "Added This Month", value: data.totals.newThisMonth, icon: UserPlus, tone: "green" },
        { label: "Closed Deal Revenue per Current Customer", value: usd(data.totals.recognizedRevenuePerCurrentCustomer), icon: DollarSign, tone: "violet" },
        { label: "Customer Churn", value: "Not available", icon: Users },
        { label: "VIP Customers", value: data.totals.vipCount, icon: Crown, tone: "amber" },
      ]} />
      <p className="rounded-lg border border-surface-800 bg-surface-900/50 px-3 py-2 text-[11px] text-surface-500">{data.methodology} {data.totals.churnReason}</p>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-80 rounded-xl border border-surface-800 bg-surface-900/50 p-4"><p className="mb-4 text-sm font-semibold text-surface-200">Current customers added by month</p><ResponsiveContainer width="100%" height="90%"><BarChart data={data.newCustomersByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} /><YAxis tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} /><Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} /><Bar dataKey="count" fill="#6366f1" /></BarChart></ResponsiveContainer></div>
        <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4"><p className="text-sm font-semibold text-surface-200">Current lifecycle status</p><div className="mt-5 space-y-4">{Object.entries(data.statusDistribution).map(([label, count]) => { const max = maxStatusCount(data.statusDistribution); return <div key={label}><div className="mb-1 flex justify-between text-xs"><span className="capitalize text-surface-400">{label.replace("churnedStatus", "churned status")}</span><b className="text-surface-100">{count}</b></div><div className="h-3 overflow-hidden rounded bg-surface-800"><div className="h-full gradient-brand" style={{ width: `${count === 0 ? 0 : Math.max(6, count / max * 100)}%` }} /></div></div>; })}</div><div className="mt-6 border-t border-surface-800 pt-4"><p className="mb-3 text-xs font-semibold text-surface-300">Source breakdown</p>{data.sourceBreakdown.slice(0, 6).map((source) => <div key={source.source} className="flex justify-between py-1 text-xs"><span className="capitalize text-surface-500">{source.source}</span><span className="text-surface-200">{source.count}</span></div>)}</div></div>
      </div>
      <div className="flex justify-end"><SearchField value={search} onChange={setSearch} placeholder="Search customers..." /></div>
      <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50"><table className="w-full text-xs"><thead><tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">{["Customer", "Status", "Source", "Recognized closed deal revenue"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-surface-800">{rows.map((customer) => <tr key={customer.id}><td className="px-4 py-3"><p className="font-semibold text-surface-100">{`${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.email}</p><p className="text-[10px] text-surface-500">{customer.email}</p></td><td className="px-4 py-3"><StatusBadge value={customer.status} /></td><td className="px-4 py-3 capitalize text-surface-400">{customer.source || "Unknown"}</td><td className="px-4 py-3 font-semibold text-emerald-400">{usd(customer.recognizedRevenue)}</td></tr>)}</tbody></table></div>
    </>}
  </div></AppLayout>;
}

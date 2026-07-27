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
import { apiUrl } from "@/lib/org";
import { Crown, DollarSign, TrendingDown, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  totals: {
    totalCustomers: number;
    newThisMonth: number;
    avgLtv: number;
    churnRate: number;
    vipCount: number;
  };
  cohorts: Array<{ month: string; label: string; count: number }>;
  sourceBreakdown: Array<{ source: string; count: number }>;
  topCustomers: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    status: string | null;
    source: string | null;
    revenue: number;
  }>;
  statusFlow: { leads: number; prospects: number; customers: number };
};
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
export default function CustomersAnalytics() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/analytics/customers"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load customer analytics",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const rows = useMemo(
    () =>
      data?.topCustomers.filter((c) =>
        `${c.firstName || ""} ${c.lastName || ""} ${c.email || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) || [],
    [data, search],
  );
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Customer Analytics"
          description="Customer growth, value, sources, and lifecycle movement"
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              columns={5}
              stats={[
                {
                  label: "Total Customers",
                  value: data.totals.totalCustomers,
                  icon: Users,
                },
                {
                  label: "New This Month",
                  value: data.totals.newThisMonth,
                  icon: UserPlus,
                  tone: "green",
                },
                {
                  label: "Average LTV",
                  value: usd(data.totals.avgLtv),
                  icon: DollarSign,
                  tone: "violet",
                },
                {
                  label: "Churn Rate",
                  value: `${data.totals.churnRate.toFixed(1)}%`,
                  icon: TrendingDown,
                  tone: "red",
                },
                {
                  label: "VIP Customers",
                  value: data.totals.vipCount,
                  icon: Crown,
                  tone: "amber",
                },
              ]}
            />
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 h-80 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <p className="mb-4 text-sm font-semibold text-surface-200">
                  New customers by month
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={data.cohorts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                      }}
                    />
                    <Bar dataKey="count" fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <p className="text-sm font-semibold text-surface-200">
                  Lifecycle funnel
                </p>
                <div className="mt-5 space-y-4">
                  {Object.entries(data.statusFlow).map(([label, count], i) => {
                    const max = Math.max(...Object.values(data.statusFlow), 1);
                    return (
                      <div key={label}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="capitalize text-surface-400">
                            {label}
                          </span>
                          <b className="text-surface-100">{count}</b>
                        </div>
                        <div className="h-8 overflow-hidden rounded-lg bg-surface-800">
                          <div
                            className="flex h-full items-center px-3 text-[10px] font-semibold text-white gradient-brand"
                            style={{
                              width: `${Math.max(12, (count / max) * 100)}%`,
                            }}
                          >
                            {i
                              ? `${Math.round((count / (Object.values(data.statusFlow)[i - 1] || 1)) * 100)}% conversion`
                              : "Entry"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 border-t border-surface-800 pt-4">
                  <p className="mb-3 text-xs font-semibold text-surface-300">
                    Source breakdown
                  </p>
                  {data.sourceBreakdown.slice(0, 6).map((s) => (
                    <div
                      key={s.source}
                      className="flex justify-between py-1 text-xs"
                    >
                      <span className="capitalize text-surface-500">
                        {s.source}
                      </span>
                      <span className="text-surface-200">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search top customers..."
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                    {["Customer", "Status", "Source", "Lifetime revenue"].map(
                      (h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-surface-100">
                          {`${c.firstName || ""} ${c.lastName || ""}`.trim() ||
                            c.email}
                        </p>
                        <p className="text-[10px] text-surface-500">
                          {c.email}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={c.status} />
                      </td>
                      <td className="px-4 py-3 capitalize text-surface-400">
                        {c.source || "Unknown"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-400">
                        {usd(c.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

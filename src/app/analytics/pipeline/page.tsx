"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  ErrorState,
  FilterTabs,
  LoadingState,
  ModuleHeader,
  SearchField,
  StatGrid,
  StatusBadge,
} from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import { CalendarClock, CircleDollarSign, Layers3, Scale } from "lucide-react";
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
type Deal = {
  id: string;
  name: string;
  value: string | null;
  currency: string | null;
  stage: string | null;
  ownerName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  companyName: string | null;
  expectedCloseDate: string | null;
};
type Data = {
  totals: {
    pipelineValue: number;
    openDeals: number;
    avgDealSize: number;
    expectedCloseThisMonth: number;
  };
  byStage: Array<{
    stage: string;
    count: number;
    value: number;
    avgDealSize: number;
    avgDaysInStage: number;
  }>;
  openDeals: Deal[];
  winLossReasons: Array<{ reason: string; count: number }>;
};
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
export default function PipelineAnalytics() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("all"),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(apiUrl("/api/analytics/pipeline"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const rows = useMemo(
    () =>
      data?.openDeals.filter(
        (d) =>
          (tab === "all" || d.stage === tab) &&
          `${d.name} ${d.ownerName || ""} ${d.companyName || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) || [],
    [data, tab, search],
  );
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Pipeline Analytics"
          description="Pipeline value, stage velocity, and expected closes"
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              stats={[
                {
                  label: "Pipeline Value",
                  value: usd(data.totals.pipelineValue),
                  icon: CircleDollarSign,
                },
                {
                  label: "Open Deals",
                  value: data.totals.openDeals,
                  icon: Layers3,
                  tone: "green",
                },
                {
                  label: "Average Deal Size",
                  value: usd(data.totals.avgDealSize),
                  icon: Scale,
                  tone: "violet",
                },
                {
                  label: "Closing This Month",
                  value: usd(data.totals.expectedCloseThisMonth),
                  icon: CalendarClock,
                  tone: "amber",
                },
              ]}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-80 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <p className="mb-4 text-sm font-semibold text-surface-200">
                  Deal count by stage
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={data.byStage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="stage"
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
              <div className="h-80 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <p className="mb-4 text-sm font-semibold text-surface-200">
                  Value by stage
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={data.byStage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="stage"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                      }}
                    />
                    <Bar dataKey="value" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: "all", label: "All" },
                  { value: "prospecting", label: "Prospecting" },
                  { value: "qualification", label: "Qualification" },
                  { value: "proposal", label: "Proposal" },
                  { value: "negotiation", label: "Negotiation" },
                ]}
              />
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search open deals..."
              />
            </div>
            <div className="max-h-[520px] overflow-auto rounded-xl border border-surface-800 bg-surface-900/50">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-900">
                  <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                    {[
                      "Deal",
                      "Stage",
                      "Value",
                      "Owner",
                      "Expected close",
                      "Age in stage",
                    ].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {rows.map((d) => {
                    const stage = data.byStage.find((s) => s.stage === d.stage);
                    return (
                      <tr key={d.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-surface-100">
                            {d.name}
                          </p>
                          <p className="text-[10px] text-surface-500">
                            {d.companyName ||
                              `${d.contactFirstName || ""} ${d.contactLastName || ""}`.trim()}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={d.stage} />
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-400">
                          {usd(Number(d.value || 0))}
                        </td>
                        <td className="px-4 py-3 text-surface-400">
                          {d.ownerName || "Unassigned"}
                        </td>
                        <td className="px-4 py-3 text-surface-400">
                          {d.expectedCloseDate
                            ? new Date(d.expectedCloseDate).toLocaleDateString(
                                "en-US",
                              )
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-surface-400">
                          {stage
                            ? `${stage.avgDaysInStage.toFixed(1)} days avg`
                            : "—"}
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

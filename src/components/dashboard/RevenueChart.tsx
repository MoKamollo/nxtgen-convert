"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-surface-700 bg-surface-900 p-3 shadow-xl">
        <p className="text-xs font-semibold text-surface-300 mb-2">{label}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-surface-400 capitalize">{p.name}:</span>
            <span className="font-semibold text-surface-100">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

type ViewType = "mrr" | "revenue";
type RevenuePoint = {
  month: string;
  mrr: number;
  new: number;
  churned: number;
  net: number;
};

export function RevenueChart({ period }: { period?: string }) {
  const [view, setView] = useState<ViewType>("mrr");
  const [data, setData] = useState<RevenuePoint[]>([]);

  useEffect(() => {
    apiFetch(apiUrl("/api/analytics", { type: "overview", ...(period ? { period } : {}) }))
      .then((r) => r.json())
      .then((j) => setData(j.data?.revenue ?? []));
  }, [period]);

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Revenue Growth</CardTitle>
        <div className="flex items-center gap-1 rounded-lg bg-surface-800 p-1">
          {(["mrr", "revenue"] as ViewType[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                view === v ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300"
              )}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </CardHeader>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {view === "mrr" ? (
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="mrr" name="MRR" stroke="#6366f1" fill="url(#mrrGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#6366f1" }} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 8 }} />
              <Bar dataKey="new" name="New" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="churned" name="Churned" fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="net" name="Net" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

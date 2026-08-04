"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { useEffect, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/org";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

type PipelineStage = { stage: string; count: number; value: number; color: string };
type LeadSource = { name: string; value: number; color: string };
type FunnelStage = { stage: string; count: number };

const PipelineTooltip = ({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: PipelineStage }>;
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-xl border border-surface-700 bg-surface-900 p-3 shadow-xl min-w-36">
        <p className="text-xs font-semibold text-surface-200 mb-2">{data.stage}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-4 text-xs">
            <span className="text-surface-500">Deals</span>
            <span className="font-semibold text-surface-100">{data.count}</span>
          </div>
          <div className="flex justify-between gap-4 text-xs">
            <span className="text-surface-500">Value</span>
            <span className="font-semibold text-surface-100">{formatCurrency(data.value)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function PipelineChart() {
  const [pipelineData, setPipelineData] = useState<PipelineStage[]>([]);

  useEffect(() => {
    apiFetch(apiUrl("/api/analytics", { type: "overview" }))
      .then((r) => r.json())
      .then((j) => setPipelineData(j.data?.pipeline ?? []));
  }, []);

  const total = pipelineData.reduce((sum, stage) => sum + stage.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline by Stage</CardTitle>
        <span className="text-xs text-surface-500">
          {formatCurrency(total)} total
        </span>
      </CardHeader>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={pipelineData}
            margin={{ top: 4, right: 0, left: -24, bottom: 0 }}
            layout="vertical"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
            />
            <YAxis
              type="category"
              dataKey="stage"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip content={<PipelineTooltip />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {pipelineData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const ChannelTooltip = ({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number }; value: number }>;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-surface-700 bg-surface-900 p-3 shadow-xl">
        <p className="text-xs font-semibold text-surface-200">
          {payload[0].payload.name}
        </p>
        <p className="text-sm font-bold text-surface-100 mt-0.5">
          {payload[0].value}%
        </p>
      </div>
    );
  }
  return null;
};

export function TrafficSourcesChart() {
  const [data, setData] = useState<LeadSource[]>([]);

  useEffect(() => {
    apiFetch(apiUrl("/api/analytics", { type: "overview" }))
      .then(r => r.json())
      .then(j => setData(j.data?.contactSources ?? []));
  }, []);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Lead Sources</CardTitle></CardHeader>
        <div className="flex items-center justify-center py-12 text-xs text-surface-500">No contacts yet</div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Lead Sources</CardTitle></CardHeader>
      <div className="flex items-center gap-4">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                {data.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
              </Pie>
              <Tooltip content={<ChannelTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {data.map(item => (
            <div key={item.name} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="flex-1 text-xs text-surface-400">{item.name}</span>
              <span className="text-xs font-semibold text-surface-200">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function ConversionFunnelChart() {
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);

  useEffect(() => {
    apiFetch(apiUrl("/api/analytics", { type: "overview" }))
      .then(r => r.json())
      .then(j => setFunnel(j.data?.conversionFunnel ?? []));
  }, []);

  const total = funnel[0]?.count || 1;
  const colors = ["bg-brand-500","bg-violet-500","bg-cyan-500","bg-emerald-500"];

  if (funnel.length === 0 || total === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Conversion Funnel</CardTitle></CardHeader>
        <div className="flex items-center justify-center py-12 text-xs text-surface-500">No contact data yet</div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion Funnel</CardTitle>
        <span className="text-xs text-surface-500">Contact stages</span>
      </CardHeader>
      <div className="space-y-2">
        {funnel.map((stage, i) => {
          const pct = Math.round((stage.count / total) * 100);
          return (
            <div key={stage.stage}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-surface-400">{stage.stage}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-surface-200">{formatNumber(stage.count)}</span>
                  <span className="text-[10px] text-surface-600">{pct}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-surface-800">
                <div className={`h-full rounded-full transition-all ${colors[i] ?? "bg-surface-500"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

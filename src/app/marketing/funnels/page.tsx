"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  ErrorState,
  Field,
  FilterTabs,
  inputClass,
  LoadingState,
  Modal,
  ModuleHeader,
  StatGrid,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiUrl } from "@/lib/org";
import { ArrowDown, BarChart3, Plus, Target, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
type Stage = {
  name: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
};
type Data = {
  stages: Stage[];
  sourceBreakdown: Array<{ source: string; count: number }>;
};
export default function Funnels() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [period, setPeriod] = useState("30d"),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(""),
    [form, setForm] = useState({ name: "", count: "0" });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/marketing/funnels", { period }));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load funnel");
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => {
    load();
  }, [load]);
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/marketing/funnels"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOpen(false);
      setForm({ name: "", count: "0" });
      setToast("Custom stage added");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add stage");
    } finally {
      setSaving(false);
    }
  };
  const max = Math.max(...(data?.stages.map((s) => s.count) || [1]), 1);
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Marketing Funnels"
          description="A live conversion path derived from contacts, deals, and analytics"
          action={
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              Add stage
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              stats={[
                {
                  label: "Visitors",
                  value: data.stages[0]?.count || 0,
                  icon: Users,
                },
                {
                  label: "Leads",
                  value:
                    data.stages.find((s) => s.name === "Leads")?.count || 0,
                  icon: Target,
                  tone: "green",
                },
                {
                  label: "Customers",
                  value:
                    data.stages.find((s) => s.name === "Customers")?.count || 0,
                  icon: BarChart3,
                  tone: "violet",
                },
                {
                  label: "Overall Conversion",
                  value: `${data.stages[0]?.count ? (((data.stages.at(-1)?.count || 0) / data.stages[0].count) * 100).toFixed(1) : 0}%`,
                  icon: ArrowDown,
                  tone: "amber",
                },
              ]}
            />
            <div className="flex justify-end">
              <FilterTabs
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "7d", label: "7 days" },
                  { value: "30d", label: "30 days" },
                  { value: "90d", label: "90 days" },
                  { value: "all", label: "All time" },
                ]}
              />
            </div>
            <div className="grid grid-cols-3 gap-5">
              <section className="col-span-2 rounded-xl border border-surface-800 bg-surface-900/50 p-5">
                <h2 className="text-sm font-semibold text-surface-100">
                  Default funnel
                </h2>
                <div className="mt-6 space-y-3">
                  {data.stages.map((s, i) => (
                    <div key={`${s.name}-${i}`} className="text-center">
                      <div
                        className="mx-auto rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-4"
                        style={{
                          width: `${Math.max(30, (s.count / max) * 100)}%`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs font-semibold text-surface-100">
                            {s.name}
                          </span>
                          <b className="text-brand-400">{s.count}</b>
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] text-surface-500">
                          <span>
                            {i
                              ? `${s.conversionRate.toFixed(1)}% from previous`
                              : "Entry stage"}
                          </span>
                          <span>
                            {i ? `${s.dropOffRate.toFixed(1)}% drop-off` : ""}
                          </span>
                        </div>
                      </div>
                      {i < data.stages.length - 1 && (
                        <ArrowDown
                          size={14}
                          className="mx-auto my-2 text-surface-600"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <aside className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <h2 className="text-sm font-semibold text-surface-100">
                  Lead sources
                </h2>
                <div className="mt-4 space-y-3">
                  {data.sourceBreakdown.map((s) => (
                    <div key={s.source}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="capitalize text-surface-400">
                          {s.source}
                        </span>
                        <span className="text-surface-200">{s.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-800">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{
                            width: `${Math.max(4, (s.count / Math.max(...data.sourceBreakdown.map((x) => x.count), 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Add custom funnel stage"
        >
          <div className="space-y-4 p-5">
            <Field label="Stage name">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Current count">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={save}>
                Add stage
              </Button>
            </div>
          </div>
        </Modal>
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

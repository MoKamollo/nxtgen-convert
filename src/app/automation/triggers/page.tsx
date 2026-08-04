"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ModuleHeader,
  SearchField,
  StatusBadge,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import { Activity, Beaker, Play, Plus, Radio, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Trigger = {
  event: string;
  description: string;
  activeWorkflowCount: number;
};
type Log = {
  id: string;
  event: string;
  status: string;
  triggeredAt: string;
  workflowId: string | null;
};
export default function Triggers() {
  const [data, setData] = useState<Trigger[]>([]),
    [activity, setActivity] = useState<Log[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(apiUrl("/api/automation/triggers"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
      setActivity(j.activity || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load triggers");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const filtered = useMemo(
    () =>
      data.filter((t) =>
        `${t.event} ${t.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data, search],
  );
  const create = async (t: Trigger) => {
    setBusy(t.event);
    try {
      const r = await apiFetch(apiUrl("/api/workflows"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${t.description} workflow`,
          description: `Triggered by ${t.event}`,
          trigger: { event: t.event },
          steps: [],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setToast("Draft workflow created");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workflow");
    } finally {
      setBusy("");
    }
  };
  const test = async () => {
    setBusy("manual-test");
    try {
      const r = await apiFetch(apiUrl("/api/automation/trigger"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "manual" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setToast("Manual trigger fired");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test trigger failed");
    } finally {
      setBusy("");
    }
  };
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Automation Triggers"
          description="System events and the workflows currently listening to them"
          action={
            <Button
              variant="outline"
              icon={Beaker}
              loading={busy === "manual-test"}
              onClick={test}
            >
              Test manual trigger
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2 space-y-4">
              <div className="flex justify-end">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder="Search trigger catalog..."
                />
              </div>
              {filtered.length === 0 ? (
                <EmptyState
                  icon={Radio}
                  title="No triggers found"
                  description="Change your search."
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {filtered.map((t) => (
                    <div
                      key={t.event}
                      className="rounded-xl border border-surface-800 bg-surface-900/50 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                          <Radio size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs font-semibold text-surface-100">
                            {t.event}
                          </p>
                          <p className="mt-1 text-xs text-surface-500">
                            {t.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-surface-800 pt-3">
                        <span className="flex items-center gap-1 text-[10px] text-surface-500">
                          <Workflow size={11} />
                          {t.activeWorkflowCount} active
                        </span>
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={Plus}
                          loading={busy === t.event}
                          onClick={() => create(t)}
                        >
                          Create workflow
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <aside className="rounded-xl border border-surface-800 bg-surface-900/50">
              <div className="flex items-center gap-2 border-b border-surface-800 px-4 py-3">
                <Activity size={15} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-surface-100">
                  Recent activity
                </h2>
              </div>
              {activity.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={Play}
                    title="No trigger activity"
                    description="Activate a workflow or fire a manual trigger."
                  />
                </div>
              ) : (
                <div className="divide-y divide-surface-800">
                  {activity.map((log) => (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-mono text-[11px] text-surface-200">
                          {log.event}
                        </p>
                        <StatusBadge value={log.status} />
                      </div>
                      <p className="mt-1 text-[10px] text-surface-600">
                        {new Date(log.triggeredAt).toLocaleString("en-US")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

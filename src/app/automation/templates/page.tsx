"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  Modal,
  ModuleHeader,
  SearchField,
  StatusBadge,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiUrl } from "@/lib/org";
import { ArrowRight, Clock3, Eye, Library, Plus, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Step = { type: string; action: string; delay?: string };
type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  estimatedTime: string;
  trigger: { event: string };
  steps: Step[];
  tags: string[];
};
export default function Templates() {
  const [data, setData] = useState<Template[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("all"),
    [preview, setPreview] = useState<Template | null>(null),
    [saving, setSaving] = useState(""),
    [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/automation/templates"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const categories = [...new Set(data.map((t) => t.category))];
  const filtered = useMemo(
    () =>
      data.filter(
        (t) =>
          (tab === "all" || t.category === tab) &&
          `${t.name} ${t.description} ${t.tags.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data, tab, search],
  );
  const useTemplate = async (t: Template) => {
    setSaving(t.id);
    try {
      const r = await fetch(apiUrl("/api/workflows"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          description: t.description,
          trigger: t.trigger,
          steps: t.steps,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setToast("Draft workflow created");
      window.setTimeout(() => {
        window.location.href = "/automation/workflows";
      }, 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create workflow");
    } finally {
      setSaving("");
    }
  };
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Automation Templates"
          description="Production-ready workflow blueprints for common revenue operations"
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: "all", label: "All", count: data.length },
                  ...categories.map((c) => ({
                    value: c,
                    label: c,
                    count: data.filter((t) => t.category === c).length,
                  })),
                ]}
              />
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search templates..."
              />
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={Library}
                title="No templates found"
                description="Change the search or category filter."
              />
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filtered.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-surface-800 bg-surface-900/50 p-4"
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl gradient-brand text-white">
                      <Workflow size={19} />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold text-surface-100">
                        {t.name}
                      </h2>
                      <StatusBadge value={t.category} />
                    </div>
                    <p className="mt-2 min-h-10 text-xs leading-5 text-surface-500">
                      {t.description}
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-[10px] text-surface-500">
                      <span className="flex items-center gap-1">
                        <Plus size={11} />
                        {t.steps.length} steps
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock3 size={11} />
                        {t.estimatedTime}
                      </span>
                    </div>
                    <div className="mt-4 flex gap-2 border-t border-surface-800 pt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={Eye}
                        onClick={() => setPreview(t)}
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        iconRight={ArrowRight}
                        loading={saving === t.id}
                        onClick={() => useTemplate(t)}
                      >
                        Use template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <Modal
          open={!!preview}
          onClose={() => setPreview(null)}
          title={preview?.name || "Template preview"}
          width="max-w-2xl"
        >
          {preview && (
            <div className="p-5">
              <p className="text-sm text-surface-400">{preview.description}</p>
              <div className="mt-5 rounded-lg border border-surface-800 bg-surface-950 p-3 text-xs">
                <span className="text-surface-500">Trigger</span>
                <p className="mt-1 font-mono text-brand-400">
                  {preview.trigger.event}
                </p>
              </div>
              <div className="mt-4 space-y-2">
                {preview.steps.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-surface-800 p-3"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-400">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold capitalize text-surface-200">
                        {s.action.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-surface-500">
                        {s.type}
                        {s.delay ? ` · ${s.delay}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  variant="primary"
                  loading={saving === preview.id}
                  onClick={() => useTemplate(preview)}
                >
                  Create draft workflow
                </Button>
              </div>
            </div>
          )}
        </Modal>
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

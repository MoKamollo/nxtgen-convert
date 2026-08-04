"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  ModuleHeader,
  SearchField,
  StatGrid,
} from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Gauge,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Item = {
  id: string;
  kind: "page" | "post";
  title: string;
  url: string;
  score: number;
  issues: string[];
  titleLength: number;
  descLength: number;
  wordCount: number;
};
type Data = {
  pages: Item[];
  overallScore: number;
  issuesFound: number;
  criticalIssues: number;
};
export default function SeoTools() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("all");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(apiUrl("/api/website/seo"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run SEO audit");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const rows = useMemo(
    () =>
      data?.pages.filter(
        (p) =>
          (tab === "all" || p.kind === tab) &&
          `${p.title} ${p.url} ${p.issues.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) || [],
    [data, tab, search],
  );
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="SEO Tools"
          description="On-page quality checks for every website page and blog post"
          action={
            <Button variant="primary" icon={RefreshCw} onClick={load}>
              Audit now
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-1 flex flex-col items-center justify-center rounded-xl border border-surface-800 bg-surface-900/50 p-5">
                <div className="flex h-28 w-28 items-center justify-center rounded-full border-8 border-brand-500/20 text-3xl font-bold text-brand-400">
                  {data.overallScore}
                </div>
                <p className="mt-3 text-xs text-surface-500">
                  Overall SEO score
                </p>
              </div>
              <div className="col-span-4">
                <StatGrid
                  stats={[
                    {
                      label: "Pages Audited",
                      value: data.pages.length,
                      icon: FileSearch,
                    },
                    {
                      label: "Average Score",
                      value: data.overallScore,
                      icon: Gauge,
                      tone: "green",
                    },
                    {
                      label: "Issues Found",
                      value: data.issuesFound,
                      icon: AlertTriangle,
                      tone: "amber",
                    },
                    {
                      label: "Critical Issues",
                      value: data.criticalIssues,
                      icon: Wrench,
                      tone: "red",
                    },
                  ]}
                />
                <div className="mt-4 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                  <p className="text-xs font-semibold text-surface-300">
                    Immediate priorities
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-surface-500">
                    <span>
                      1. Add every missing meta title and description.
                    </span>
                    <span>2. Remove duplicate titles.</span>
                    <span>3. Keep titles between 50 and 60 characters.</span>
                    <span>4. Expand thin content beyond 300 words.</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: "all", label: "All" },
                  { value: "page", label: "Pages" },
                  { value: "post", label: "Posts" },
                ]}
              />
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search audit results..."
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No audited content"
                description="Create a page or blog post, then run the audit."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {[
                        "Content",
                        "URL",
                        "Score",
                        "Issues",
                        "Metrics",
                        "Action",
                      ].map((h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {rows.map((p) => (
                      <tr key={`${p.kind}-${p.id}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-surface-100">
                            {p.title}
                          </p>
                          <span className="text-[10px] capitalize text-surface-500">
                            {p.kind}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-brand-400">
                          {p.url}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-800">
                              <div
                                className={
                                  p.score >= 80
                                    ? "h-full bg-emerald-500"
                                    : p.score >= 50
                                      ? "h-full bg-amber-500"
                                      : "h-full bg-red-500"
                                }
                                style={{ width: `${p.score}%` }}
                              />
                            </div>
                            <b>{p.score}</b>
                          </div>
                        </td>
                        <td className="max-w-md px-4 py-3 text-[10px] text-surface-400">
                          {p.issues.length ? p.issues.join(" · ") : "No issues"}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-surface-500">
                          Title {p.titleLength} · Description {p.descLength} ·{" "}
                          {p.wordCount} words
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              window.location.href =
                                p.kind === "post"
                                  ? "/website/blog"
                                  : "/website/pages";
                            }}
                          >
                            Fix
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

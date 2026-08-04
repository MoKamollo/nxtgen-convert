"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ModuleHeader,
  StatGrid,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import { formatCurrency } from "@/lib/utils";
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  Layers,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
type Report = {
  type: string;
  name: string;
  description: string;
  rowCount: number;
  summary?: number;
};
export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [downloading, setDownloading] = useState(""),
    [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(apiUrl("/api/analytics/reports"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setReports(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function download(type: string) {
    setDownloading(type);
    try {
      const r = await apiFetch(apiUrl("/api/analytics/reports/export"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, format: "csv" }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `convert-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast("CSV downloaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading("");
    }
  }
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Reports"
          description="Export operational data for analysis, finance, and audits"
        />
        <StatGrid
          stats={[
            {
              label: "Available Reports",
              value: reports.length,
              icon: FileSpreadsheet,
            },
            {
              label: "Total Exportable Rows",
              value: reports.reduce((s, r) => s + r.rowCount, 0),
              icon: Layers,
              tone: "green",
            },
            {
              label: "Contact Records",
              value: reports.find((r) => r.type === "contacts")?.rowCount ?? 0,
              icon: Users,
              tone: "violet",
            },
            {
              label: "Closed Revenue",
              value: formatCurrency(
                reports.find((r) => r.type === "revenue")?.summary ?? 0,
              ),
              icon: CalendarClock,
              tone: "amber",
            },
          ]}
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading ? (
          <LoadingState />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No report data"
            description="Reports become available as records are added."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {reports.map((report) => (
              <div
                key={report.type}
                className="rounded-xl border border-surface-800 bg-surface-900/50 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                    <FileSpreadsheet size={18} />
                  </div>
                  <span className="text-xs text-surface-500">
                    {report.rowCount.toLocaleString()} rows
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-surface-100">
                  {report.name}
                </h3>
                <p className="mt-1 text-xs text-surface-500">
                  {report.description}
                </p>
                {report.summary !== undefined && (
                  <p className="mt-3 text-lg font-bold text-emerald-400">
                    {formatCurrency(report.summary)}
                  </p>
                )}
                <Button
                  className="mt-5"
                  variant="outline"
                  size="sm"
                  icon={Download}
                  loading={downloading === report.type}
                  onClick={() => download(report.type)}
                >
                  Download CSV
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-surface-800 bg-surface-900/40 p-5 opacity-70">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-surface-200">
                Scheduled Reports
              </h3>
              <p className="mt-1 text-xs text-surface-500">
                Weekly and monthly report delivery is reserved for Pro plans.
              </p>
            </div>
            <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs text-violet-400">
              Upgrade to Pro
            </span>
          </div>
          <div className="mt-4 flex gap-6 text-xs text-surface-500">
            <label>
              <input type="checkbox" disabled className="mr-2" />
              Weekly delivery
            </label>
            <label>
              <input type="checkbox" disabled className="mr-2" />
              Monthly delivery
            </label>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} />}
    </AppLayout>
  );
}

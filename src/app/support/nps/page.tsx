"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  EmptyState,
  ErrorState,
  Field,
  FilterTabs,
  inputClass,
  LoadingState,
  Modal,
  ModuleHeader,
  StatGrid,
  StatusBadge,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import { Frown, Meh, Send, Smile, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
type ResponseRow = {
  id: string;
  score: number;
  feedback: string | null;
  submittedAt: string;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
};
type Stats = {
  avgScore: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
  responseRate: number;
  totalResponses: number;
  trend: Array<{ month: string; score: number }>;
};
type Contact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  status: string;
  tags: string[];
};
export default function NpsPage() {
  const [responses, setResponses] = useState<ResponseRow[]>([]),
    [stats, setStats] = useState<Stats | null>(null),
    [contacts, setContacts] = useState<Contact[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [open, setOpen] = useState(false),
    [target, setTarget] = useState("all"),
    [targetValue, setTargetValue] = useState(""),
    [sending, setSending] = useState(false),
    [toast, setToast] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        apiFetch(apiUrl("/api/nps")).then((r) => r.json()),
        apiFetch(apiUrl("/api/nps/stats")).then((r) => r.json()),
        apiFetch(apiUrl("/api/contacts", { limit: "200" })).then((r) => r.json()),
      ]);
      setResponses(a.data?.responses ?? []);
      setStats(b.data);
      setContacts(c.data ?? []);
    } catch {
      setError("Failed to load NPS data");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const category = (s: number) =>
    s >= 9 ? "promoter" : s >= 7 ? "passive" : "detractor";
  const filtered = useMemo(
    () =>
      responses.filter((r) => filter === "all" || category(r.score) === filter),
    [responses, filter],
  );
  async function send() {
    const selected = contacts.filter(
      (c) =>
        c.email &&
        (target === "all" ||
          (target === "status" && c.status === targetValue) ||
          (target === "tag" && (c.tags ?? []).includes(targetValue))),
    );
    if (!selected.length) {
      setError("No contacts match this audience");
      return;
    }
    setSending(true);
    let success = 0;
    for (const contact of selected) {
      const r = await apiFetch(apiUrl("/api/nps/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      if (r.ok) success++;
    }
    setSending(false);
    setOpen(false);
    setToast(`Survey sent to ${success} contact${success === 1 ? "" : "s"}`);
    await load();
  }
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="NPS and CSAT"
          description="Measure loyalty and surface customer feedback"
          action={
            <Button
              variant="gradient"
              size="sm"
              icon={Send}
              onClick={() => setOpen(true)}
            >
              Send NPS Survey
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading || !stats ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              columns={5}
              stats={[
                {
                  label: "NPS Score",
                  value: stats.npsScore,
                  icon: Star,
                  tone:
                    stats.npsScore >= 50
                      ? "green"
                      : stats.npsScore >= 0
                        ? "amber"
                        : "red",
                },
                {
                  label: "Total Responses",
                  value: stats.totalResponses,
                  icon: Send,
                },
                {
                  label: "Promoters",
                  value: stats.totalResponses
                    ? `${((stats.promoters / stats.totalResponses) * 100).toFixed(0)}%`
                    : "0%",
                  icon: Smile,
                  tone: "green",
                },
                {
                  label: "Passives",
                  value: stats.totalResponses
                    ? `${((stats.passives / stats.totalResponses) * 100).toFixed(0)}%`
                    : "0%",
                  icon: Meh,
                  tone: "amber",
                },
                {
                  label: "Detractors",
                  value: stats.totalResponses
                    ? `${((stats.detractors / stats.totalResponses) * 100).toFixed(0)}%`
                    : "0%",
                  icon: Frown,
                  tone: "red",
                },
              ]}
            />
            <div className="grid grid-cols-[1.3fr_1fr] gap-4">
              <div className="h-64 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <p className="mb-3 text-sm font-semibold text-surface-200">
                  NPS Trend
                </p>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={stats.trend}>
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                    />
                    <YAxis
                      domain={[-100, 100]}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#6366f1"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
                <p className="text-sm font-semibold text-surface-200">
                  Distribution
                </p>
                <div className="mt-5 flex h-5 overflow-hidden rounded-full">
                  <div
                    className="bg-emerald-500"
                    style={{
                      width: `${stats.totalResponses ? (stats.promoters / stats.totalResponses) * 100 : 0}%`,
                    }}
                  />
                  <div
                    className="bg-amber-500"
                    style={{
                      width: `${stats.totalResponses ? (stats.passives / stats.totalResponses) * 100 : 0}%`,
                    }}
                  />
                  <div
                    className="bg-red-500"
                    style={{
                      width: `${stats.totalResponses ? (stats.detractors / stats.totalResponses) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between text-emerald-400">
                    <span>Promoters</span>
                    <span>{stats.promoters}</span>
                  </div>
                  <div className="flex justify-between text-amber-400">
                    <span>Passives</span>
                    <span>{stats.passives}</span>
                  </div>
                  <div className="flex justify-between text-red-400">
                    <span>Detractors</span>
                    <span>{stats.detractors}</span>
                  </div>
                  <div className="flex justify-between border-t border-surface-800 pt-2 text-surface-400">
                    <span>Response Rate</span>
                    <span>{stats.responseRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
            <FilterTabs
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "promoter", label: "Promoters" },
                { value: "passive", label: "Passives" },
                { value: "detractor", label: "Detractors" },
              ]}
            />
            {filtered.length === 0 ? (
              <EmptyState
                icon={Star}
                title="No responses found"
                description="Send a survey to start measuring customer sentiment."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {[
                        "Contact",
                        "Score",
                        "Category",
                        "Feedback",
                        "Submitted",
                      ].map((h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-surface-100">
                            {r.contactFirstName} {r.contactLastName}
                          </p>
                          <p className="text-[10px] text-surface-500">
                            {r.contactEmail}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-lg font-bold text-surface-100">
                          {r.score}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={category(r.score)} />
                        </td>
                        <td className="max-w-md px-4 py-3 text-surface-400">
                          {r.feedback || "No written feedback"}
                        </td>
                        <td className="px-4 py-3 text-surface-500">
                          {new Date(r.submittedAt).toLocaleDateString()}
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
      <Modal open={open} onClose={() => setOpen(false)} title="Send NPS Survey">
        <div className="space-y-4 p-5">
          <Field label="Target Audience">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={inputClass}
            >
              <option value="all">All contacts with email</option>
              <option value="status">By status</option>
              <option value="tag">By tag</option>
            </select>
          </Field>
          {target === "status" && (
            <Field label="Status">
              <select
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className={inputClass}
              >
                <option value="customer">Customer</option>
                <option value="vip">VIP</option>
                <option value="prospect">Prospect</option>
              </select>
            </Field>
          )}
          {target === "tag" && (
            <Field label="Tag">
              <input
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
            <p className="text-sm font-semibold text-surface-100">
              Email Preview
            </p>
            <p className="mt-2 text-xs text-surface-400">
              How likely are you to recommend us to a friend or colleague?
            </p>
            <div className="mt-3 flex gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <span
                  key={i}
                  className="flex h-7 w-7 items-center justify-center rounded bg-surface-700 text-[10px] text-surface-300"
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="gradient"
              loading={sending}
              icon={Send}
              onClick={send}
            >
              Send Survey
            </Button>
          </div>
        </div>
      </Modal>
      {toast && <Toast message={toast} />}
    </AppLayout>
  );
}

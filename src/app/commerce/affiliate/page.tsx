"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  ConfirmAction,
  EmptyState,
  ErrorState,
  Field,
  FilterTabs,
  inputClass,
  LoadingState,
  Modal,
  ModuleHeader,
  SearchField,
  StatGrid,
  StatusBadge,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiUrl } from "@/lib/org";
import {
  BadgeDollarSign,
  Copy,
  Handshake,
  MousePointerClick,
  Plus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Contact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};
type Affiliate = {
  id: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  code: string;
  status: string | null;
  commissionRate: string;
  totalClicks: number | null;
  totalConversions: number | null;
  totalRevenue: string | null;
  totalEarnings: string | null;
  paidEarnings: string | null;
};
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
export default function AffiliatePage() {
  const [data, setData] = useState<Affiliate[]>([]),
    [contacts, setContacts] = useState<Contact[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(""),
    [form, setForm] = useState({
      contactId: "",
      commissionRate: "10",
      code: "",
    });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        fetch(apiUrl("/api/affiliates")),
        fetch(apiUrl("/api/contacts", { limit: "200" })),
      ]);
      const [j, cj] = await Promise.all([r.json(), c.json()]);
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
      setContacts(cj.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load affiliates");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const rows = useMemo(
    () =>
      data.filter(
        (a) =>
          (tab === "all" || a.status === tab) &&
          `${a.contactFirstName || ""} ${a.contactLastName || ""} ${a.contactEmail || ""} ${a.code}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data, tab, search],
  );
  const totalRevenue = data.reduce(
      (s, a) => s + Number(a.totalRevenue || 0),
      0,
    ),
    unpaid = data.reduce(
      (s, a) =>
        s +
        Math.max(0, Number(a.totalEarnings || 0) - Number(a.paidEarnings || 0)),
      0,
    ),
    avg = data.length
      ? data.reduce((s, a) => s + Number(a.commissionRate), 0) / data.length
      : 0;
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/affiliates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOpen(false);
      setForm({ contactId: "", commissionRate: "10", code: "" });
      setToast("Affiliate added");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add affiliate");
    } finally {
      setSaving(false);
    }
  };
  const patch = async (id: string, body: object) => {
    const r = await fetch(apiUrl(`/api/affiliates/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setToast("Affiliate updated");
    await load();
  };
  const del = async (id: string) => {
    await fetch(apiUrl(`/api/affiliates/${id}`), { method: "DELETE" });
    setToast("Affiliate removed");
    await load();
  };
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/?ref=${code}`,
    );
    setToast("Tracking link copied");
  };
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Affiliate Program"
          description="Partner performance, referral revenue, and commission liability"
          action={
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              Add affiliate
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: "Total Affiliates", value: data.length, icon: Users },
                {
                  label: "Revenue Generated",
                  value: usd(totalRevenue),
                  icon: BadgeDollarSign,
                  tone: "green",
                },
                {
                  label: "Unpaid Commissions",
                  value: usd(unpaid),
                  icon: Handshake,
                  tone: "amber",
                },
                {
                  label: "Average Commission",
                  value: `${avg.toFixed(1)}%`,
                  icon: MousePointerClick,
                  tone: "violet",
                },
              ]}
            />
            <div className="flex items-center justify-between">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={["all", "active", "inactive", "pending"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search affiliates..."
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={Handshake}
                title="No affiliates"
                description="Add your first partner and issue a tracking code."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {[
                        "Contact",
                        "Code",
                        "Status",
                        "Clicks",
                        "Conversions",
                        "Rate",
                        "Earnings",
                        "Unpaid",
                        "Actions",
                      ].map((h) => (
                        <th key={h} className="px-3 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {rows.map((a) => {
                      const unpaidAmount = Math.max(
                        0,
                        Number(a.totalEarnings || 0) -
                          Number(a.paidEarnings || 0),
                      );
                      return (
                        <tr key={a.id}>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-surface-100">
                              {`${a.contactFirstName || ""} ${a.contactLastName || ""}`.trim() ||
                                a.contactEmail}
                            </p>
                            <p className="text-[10px] text-surface-500">
                              {a.contactEmail}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              className="flex items-center gap-1 font-mono text-brand-400"
                              onClick={() => copy(a.code)}
                            >
                              {a.code}
                              <Copy size={11} />
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge value={a.status} />
                          </td>
                          <td className="px-3 py-3 text-surface-300">
                            {a.totalClicks || 0}
                          </td>
                          <td className="px-3 py-3 text-surface-300">
                            {a.totalConversions || 0}{" "}
                            <span className="text-[9px] text-surface-600">
                              (
                              {a.totalClicks
                                ? (
                                    ((a.totalConversions || 0) /
                                      a.totalClicks) *
                                    100
                                  ).toFixed(1)
                                : 0}
                              %)
                            </span>
                          </td>
                          <td className="px-3 py-3 text-surface-300">
                            {a.commissionRate}%
                          </td>
                          <td className="px-3 py-3 text-emerald-400">
                            {usd(Number(a.totalEarnings || 0))}
                          </td>
                          <td className="px-3 py-3 text-amber-400">
                            {usd(unpaidAmount)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center">
                              {unpaidAmount > 0 && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() =>
                                    patch(a.id, { markPaid: true })
                                  }
                                >
                                  Mark paid
                                </Button>
                              )}
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() =>
                                  patch(a.id, {
                                    status:
                                      a.status === "active"
                                        ? "inactive"
                                        : "active",
                                  })
                                }
                              >
                                {a.status === "active" ? "Disable" : "Enable"}
                              </Button>
                              <ConfirmAction onConfirm={() => del(a.id)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <Modal open={open} onClose={() => setOpen(false)} title="Add affiliate">
          <div className="space-y-4 p-5">
            <Field label="Contact">
              <select
                className={inputClass}
                value={form.contactId}
                onChange={(e) =>
                  setForm({ ...form, contactId: e.target.value })
                }
              >
                <option value="">Select contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.firstName || ""} ${c.lastName || ""}`.trim() ||
                      c.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Commission rate (%)">
              <input
                className={inputClass}
                type="number"
                min="0"
                max="100"
                value={form.commissionRate}
                onChange={(e) =>
                  setForm({ ...form, commissionRate: e.target.value })
                }
              />
            </Field>
            <Field
              label="Custom code"
              hint="Leave empty to generate an 8-character code"
            >
              <input
                className={inputClass}
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={save}>
                Add affiliate
              </Button>
            </div>
          </div>
        </Modal>
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

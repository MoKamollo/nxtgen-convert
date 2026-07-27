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
  CalendarClock,
  CircleDollarSign,
  PauseCircle,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Contact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};
type Product = {
  id: string;
  name: string;
  price: string;
  currency: string | null;
};
type Sub = {
  id: string;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  productId: string | null;
  productName: string | null;
  status: string | null;
  amount: string;
  currency: string | null;
  interval: string | null;
  currentPeriodEnd: string;
  createdAt: string;
};
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
export default function Subscriptions() {
  const [data, setData] = useState<Sub[]>([]),
    [contacts, setContacts] = useState<Contact[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(""),
    [form, setForm] = useState({
      contactId: "",
      productId: "",
      amount: "",
      interval: "month",
      currentPeriodEnd: "",
    });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, c, p] = await Promise.all([
        fetch(apiUrl("/api/subscriptions")),
        fetch(apiUrl("/api/contacts", { limit: "200" })),
        fetch(apiUrl("/api/products")),
      ]);
      const [j, cj, pj] = await Promise.all([r.json(), c.json(), p.json()]);
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
      setContacts(cj.data || []);
      setProducts(pj.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subscriptions");
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
        (s) =>
          (tab === "all" || s.status === tab) &&
          `${s.contactFirstName || ""} ${s.contactLastName || ""} ${s.contactEmail || ""} ${s.productName || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data, tab, search],
  );
  const active = data.filter((s) => s.status === "active");
  const mrr = active.reduce(
    (sum, s) =>
      sum +
      Number(s.amount) *
        (s.interval === "year" ? 1 / 12 : s.interval === "week" ? 52 / 12 : 1),
    0,
  );
  const churned = data.filter(
    (s) =>
      s.status === "cancelled" &&
      new Date(s.createdAt).getUTCMonth() === new Date().getUTCMonth(),
  ).length;
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl("/api/subscriptions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOpen(false);
      setForm({
        contactId: "",
        productId: "",
        amount: "",
        interval: "month",
        currentPeriodEnd: "",
      });
      setToast("Subscription created");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to create subscription",
      );
    } finally {
      setSaving(false);
    }
  };
  const patch = async (id: string, status: string) => {
    const r = await fetch(apiUrl(`/api/subscriptions/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setToast(`Subscription ${status}`);
    await load();
  };
  const del = async (id: string) => {
    const r = await fetch(apiUrl(`/api/subscriptions/${id}`), {
      method: "DELETE",
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setToast("Subscription deleted");
    await load();
  };
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Subscriptions"
          description="Recurring customer revenue and renewal status"
          action={
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              New subscription
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
                {
                  label: "Active Subscriptions",
                  value: active.length,
                  icon: RefreshCw,
                },
                {
                  label: "Subscription MRR",
                  value: usd(mrr),
                  icon: CircleDollarSign,
                  tone: "green",
                },
                {
                  label: "Churned This Month",
                  value: churned,
                  icon: PauseCircle,
                  tone: "red",
                },
                {
                  label: "Average Value",
                  value: usd(
                    active.length
                      ? active.reduce((s, x) => s + Number(x.amount), 0) /
                          active.length
                      : 0,
                  ),
                  icon: Users,
                  tone: "violet",
                },
              ]}
            />
            <div className="flex items-center justify-between">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  "all",
                  "active",
                  "paused",
                  "cancelled",
                  "past_due",
                ].map((v) => ({ value: v, label: v.replace("_", " ") }))}
              />
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search subscriptions..."
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={RefreshCw}
                title="No subscriptions"
                description="Create the first recurring customer subscription."
                action={
                  <Button size="sm" onClick={() => setOpen(true)}>
                    New subscription
                  </Button>
                }
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {[
                        "Contact",
                        "Product",
                        "Amount",
                        "Status",
                        "Period end",
                        "Actions",
                      ].map((h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-surface-100">
                            {`${s.contactFirstName || ""} ${s.contactLastName || ""}`.trim() ||
                              s.contactEmail}
                          </p>
                          <p className="text-[10px] text-surface-500">
                            {s.contactEmail}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-surface-300">
                          {s.productName || "Unknown product"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-400">
                          {usd(Number(s.amount))}/{s.interval}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={s.status} />
                        </td>
                        <td className="px-4 py-3 text-surface-400">
                          {new Date(s.currentPeriodEnd).toLocaleDateString(
                            "en-US",
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {s.status === "active" ? (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => patch(s.id, "paused")}
                              >
                                Pause
                              </Button>
                            ) : s.status === "paused" ? (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => patch(s.id, "active")}
                              >
                                Resume
                              </Button>
                            ) : null}
                            {s.status !== "cancelled" && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => patch(s.id, "cancelled")}
                              >
                                Cancel
                              </Button>
                            )}
                            <ConfirmAction onConfirm={() => del(s.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="New subscription"
        >
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
            <Field label="Product">
              <select
                className={inputClass}
                value={form.productId}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    productId: e.target.value,
                    amount: p?.price || form.amount,
                  });
                }}
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
              <Field label="Interval">
                <select
                  className={inputClass}
                  value={form.interval}
                  onChange={(e) =>
                    setForm({ ...form, interval: e.target.value })
                  }
                >
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </Field>
            </div>
            <Field label="Current period end">
              <input
                className={inputClass}
                type="date"
                value={form.currentPeriodEnd}
                onChange={(e) =>
                  setForm({ ...form, currentPeriodEnd: e.target.value })
                }
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={save}>
                Create subscription
              </Button>
            </div>
          </div>
        </Modal>
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

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
  StatusBadge,
  textareaClass,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  CalendarDays,
  Camera,
  Globe,
  Briefcase,
  List,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Post = {
  id: string;
  content: string;
  platforms: string[];
  status: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  mediaUrls: string[] | null;
  createdAt: string;
};
const CURRENT_MONTH_START = new Date();
CURRENT_MONTH_START.setDate(1);

const icons: Record<string, typeof X> = {
  twitter: X,
  linkedin: Briefcase,
  facebook: Globe,
  instagram: Camera,
};
const blank = {
  content: "",
  platforms: [] as string[],
  mode: "draft",
  scheduledAt: "",
  mediaUrls: "",
};
export default function Social() {
  const [data, setData] = useState<Post[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [platform, setPlatform] = useState("all"),
    [status, setStatus] = useState("all"),
    [view, setView] = useState<"calendar" | "list">("calendar"),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(""),
    [form, setForm] = useState({ ...blank });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(apiUrl("/api/social-posts"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load social content",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const rows = useMemo(
    () =>
      data.filter(
        (p) =>
          (platform === "all" || p.platforms.includes(platform)) &&
          (status === "all" || p.status === status) &&
          p.content.toLowerCase().includes(search.toLowerCase()),
      ),
    [data, platform, status, search],
  );
  const save = async () => {
    setSaving(true);
    try {
      const body = {
        content: form.content,
        platforms: form.platforms,
        status:
          form.mode === "publish"
            ? "published"
            : form.mode === "schedule"
              ? "scheduled"
              : "draft",
        scheduledAt: form.mode === "schedule" ? form.scheduledAt : null,
        mediaUrls: form.mediaUrls
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      };
      const r = await apiFetch(apiUrl("/api/social-posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOpen(false);
      setForm({ ...blank });
      setToast("Social post saved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save post");
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await apiFetch(apiUrl(`/api/social-posts/${id}`), { method: "DELETE" });
    setToast("Post deleted");
    await load();
  };
  const monthStart = CURRENT_MONTH_START;
  const days = Array.from(
    {
      length: new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0,
      ).getDate(),
    },
    (_, i) => i + 1,
  );
  const postsFor = (day: number) =>
    rows.filter((p) => {
      const d = new Date(p.scheduledAt || p.publishedAt || p.createdAt);
      return (
        d.getFullYear() === monthStart.getFullYear() &&
        d.getMonth() === monthStart.getMonth() &&
        d.getDate() === day
      );
    });
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Social Media"
          description="Draft and schedule a cross-platform content calendar"
          action={
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              New post
            </Button>
          }
        />
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
          This module is a content calendar. Connect social accounts in Settings
          before enabling platform publishing.
        </div>
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FilterTabs
                  value={platform}
                  onChange={setPlatform}
                  options={[
                    { value: "all", label: "All" },
                    { value: "twitter", label: "X" },
                    { value: "linkedin", label: "LinkedIn" },
                    { value: "facebook", label: "Facebook" },
                    { value: "instagram", label: "Instagram" },
                  ]}
                />
                <FilterTabs
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: "All" },
                    { value: "draft", label: "Draft" },
                    { value: "scheduled", label: "Scheduled" },
                    { value: "published", label: "Published" },
                    { value: "failed", label: "Failed" },
                  ]}
                />
              </div>
              <div className="flex items-center gap-2">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder="Search posts..."
                />
                <Button
                  size="sm"
                  variant={view === "calendar" ? "primary" : "outline"}
                  icon={CalendarDays}
                  onClick={() => setView("calendar")}
                />
                <Button
                  size="sm"
                  variant={view === "list" ? "primary" : "outline"}
                  icon={List}
                  onClick={() => setView("list")}
                />
              </div>
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={Send}
                title="No social posts"
                description="Create a draft or scheduled post."
              />
            ) : view === "calendar" ? (
              <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <h2 className="mb-4 text-sm font-semibold text-surface-100">
                  {monthStart.toLocaleString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-surface-800 bg-surface-800">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d) => (
                      <div
                        key={d}
                        className="bg-surface-900 p-2 text-center text-[10px] uppercase text-surface-500"
                      >
                        {d}
                      </div>
                    ),
                  )}
                  {Array.from({ length: monthStart.getDay() }, (_, i) => (
                    <div
                      key={`blank-${i}`}
                      className="min-h-28 bg-surface-950"
                    />
                  ))}
                  {days.map((day) => (
                    <div key={day} className="min-h-28 bg-surface-900 p-2">
                      <span className="text-[10px] text-surface-500">
                        {day}
                      </span>
                      <div className="mt-2 space-y-1">
                        {postsFor(day)
                          .slice(0, 3)
                          .map((p) => (
                            <div
                              key={p.id}
                              className="rounded bg-brand-500/10 px-2 py-1 text-[9px] text-brand-300"
                            >
                              <p className="truncate">{p.content}</p>
                              <span className="capitalize text-surface-500">
                                {p.status}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {[
                        "Content",
                        "Platforms",
                        "Status",
                        "Schedule",
                        "Actions",
                      ].map((h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td className="max-w-xl px-4 py-3 text-surface-200">
                          <p className="line-clamp-2">{p.content}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {p.platforms.map((name) => {
                              const Icon = icons[name] || Send;
                              return (
                                <Icon
                                  key={name}
                                  size={14}
                                  className="text-surface-400"
                                />
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={p.status} />
                        </td>
                        <td className="px-4 py-3 text-surface-400">
                          {p.scheduledAt
                            ? new Date(p.scheduledAt).toLocaleString("en-US")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <ConfirmAction onConfirm={() => del(p.id)} />
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
          title="New social post"
          width="max-w-2xl"
        >
          <div className="space-y-4 p-5">
            <Field label="Content">
              <textarea
                className={textareaClass}
                rows={8}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <div className="mt-1 flex justify-between text-[10px] text-surface-600">
                <span>Selected platforms determine limits</span>
                <span>{form.content.length} characters</span>
              </div>
            </Field>
            <Field label="Platforms">
              <div className="grid grid-cols-4 gap-2">
                {["twitter", "linkedin", "facebook", "instagram"].map(
                  (name) => {
                    const Icon = icons[name];
                    const checked = form.platforms.includes(name);
                    return (
                      <button
                        key={name}
                        onClick={() =>
                          setForm({
                            ...form,
                            platforms: checked
                              ? form.platforms.filter((x) => x !== name)
                              : [...form.platforms, name],
                          })
                        }
                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-xs capitalize ${checked ? "border-brand-500 bg-brand-500/10 text-brand-400" : "border-surface-700 text-surface-400"}`}
                      >
                        <Icon size={14} />
                        {name}
                      </button>
                    );
                  },
                )}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Delivery">
                <select
                  className={inputClass}
                  value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}
                >
                  <option value="draft">Save draft</option>
                  <option value="schedule">Schedule</option>
                  <option value="publish">Mark published</option>
                </select>
              </Field>
              {form.mode === "schedule" && (
                <Field label="Schedule date and time">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={form.scheduledAt}
                    onChange={(e) =>
                      setForm({ ...form, scheduledAt: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
            <Field label="Media URLs" hint="Comma separated">
              <input
                className={inputClass}
                value={form.mediaUrls}
                onChange={(e) =>
                  setForm({ ...form, mediaUrls: e.target.value })
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={save}>
                Save post
              </Button>
            </div>
          </div>
        </Modal>
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import {
  ConfirmAction,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  Modal,
  ModuleHeader,
  SearchField,
  StatusBadge,
  textareaClass,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { apiUrl } from "@/lib/org";
import { BookOpen, Edit3, Eye, Plus, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  tags: string[] | null;
  status: string | null;
  views: number | null;
  helpfulYes: number | null;
  helpfulNo: number | null;
  updatedAt: string;
};
const blank = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "General",
  tags: "",
  status: "draft",
};
export default function KnowledgeBase() {
  const [data, setData] = useState<Article[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [open, setOpen] = useState(false),
    [view, setView] = useState<Article | null>(null),
    [editing, setEditing] = useState<Article | null>(null),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(""),
    [form, setForm] = useState({ ...blank });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/kb-articles"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load knowledge base",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("create") === "true")
      begin();
  }, []);
  const categories = [...new Set(data.map((a) => a.category || "General"))];
  const rows = useMemo(
    () =>
      data.filter(
        (a) =>
          (category === "all" || a.category === category) &&
          `${a.title} ${a.excerpt || ""} ${(a.tags || []).join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data, category, search],
  );
  const begin = (a?: Article) => {
    setEditing(a || null);
    setForm(
      a
        ? {
            title: a.title,
            slug: a.slug,
            excerpt: a.excerpt || "",
            content: a.content || "",
            category: a.category || "General",
            tags: (a.tags || []).join(", "),
            status: a.status || "draft",
          }
        : { ...blank },
    );
    setOpen(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: form.tags
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      };
      const r = await fetch(
        apiUrl(editing ? `/api/kb-articles/${editing.id}` : "/api/kb-articles"),
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOpen(false);
      setToast(`Article ${editing ? "updated" : "created"}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  const vote = async (id: string, helpful: boolean) => {
    await fetch(apiUrl(`/api/kb-articles/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ helpful }),
    });
    setToast("Feedback recorded");
    await load();
  };
  const del = async (id: string) => {
    await fetch(apiUrl(`/api/kb-articles/${id}`), { method: "DELETE" });
    setToast("Article deleted");
    await load();
  };
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Knowledge Base"
          description="Create support content and measure article usefulness"
          action={
            <Button variant="primary" icon={Plus} onClick={() => begin()}>
              New article
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-4 gap-5">
            <aside className="rounded-xl border border-surface-800 bg-surface-900/50 p-3">
              <p className="px-2 py-2 text-[10px] font-semibold uppercase text-surface-500">
                Categories
              </p>
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${category === c ? "bg-brand-500/10 text-brand-400" : "text-surface-400 hover:bg-surface-800"}`}
                >
                  <span className="capitalize">{c}</span>
                  <span>
                    {c === "all"
                      ? data.length
                      : data.filter((a) => a.category === c).length}
                  </span>
                </button>
              ))}
            </aside>
            <main className="col-span-3 space-y-4">
              <div className="flex justify-end">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder="Search knowledge base..."
                />
              </div>
              {rows.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No articles found"
                  description="Create an article or change the filters."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                        {[
                          "Article",
                          "Category",
                          "Status",
                          "Views",
                          "Helpful",
                          "Updated",
                          "Actions",
                        ].map((h) => (
                          <th key={h} className="px-4 py-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800">
                      {rows.map((a) => {
                        const total = (a.helpfulYes || 0) + (a.helpfulNo || 0);
                        return (
                          <tr key={a.id}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-surface-100">
                                {a.title}
                              </p>
                              <p className="mt-1 max-w-xs truncate text-[10px] text-surface-500">
                                {a.excerpt}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-surface-400">
                              {a.category}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge value={a.status} />
                            </td>
                            <td className="px-4 py-3 text-surface-400">
                              {a.views || 0}
                            </td>
                            <td className="px-4 py-3 text-surface-400">
                              {total
                                ? `${Math.round(((a.helpfulYes || 0) / total) * 100)}%`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-surface-400">
                              {new Date(a.updatedAt).toLocaleDateString(
                                "en-US",
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  icon={Eye}
                                  onClick={() => setView(a)}
                                >
                                  View
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  icon={Edit3}
                                  onClick={() => begin(a)}
                                >
                                  Edit
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
            </main>
          </div>
        )}
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={`${editing ? "Edit" : "New"} article`}
          width="max-w-3xl"
        >
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title">
                <input
                  className={inputClass}
                  value={form.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                      slug: editing
                        ? form.slug
                        : e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, ""),
                    })
                  }
                />
              </Field>
              <Field label="Slug">
                <input
                  className={inputClass}
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Category">
                <input
                  className={inputClass}
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </Field>
              <Field label="Tags">
                <input
                  className={inputClass}
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </Field>
            </div>
            <Field label="Excerpt">
              <textarea
                className={textareaClass}
                rows={2}
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              />
            </Field>
            <Field label="Markdown content">
              <textarea
                className={textareaClass}
                rows={14}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={save}>
                Save article
              </Button>
            </div>
          </div>
        </Modal>
        <Modal
          open={!!view}
          onClose={() => setView(null)}
          title={view?.title || "Article"}
          width="max-w-3xl"
        >
          {view && (
            <article className="p-7">
              <p className="text-xs text-surface-500">
                {view.category} · Updated{" "}
                {new Date(view.updatedAt).toLocaleDateString("en-US")}
              </p>
              <h1 className="mt-3 text-2xl font-bold text-surface-50">
                {view.title}
              </h1>
              <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-surface-300">
                {view.content}
              </div>
              <div className="mt-8 flex items-center gap-2 border-t border-surface-800 pt-5 text-xs text-surface-500">
                <span>Was this helpful?</span>
                <Button
                  size="xs"
                  variant="outline"
                  icon={ThumbsUp}
                  onClick={() => vote(view.id, true)}
                >
                  Yes
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  icon={ThumbsDown}
                  onClick={() => vote(view.id, false)}
                >
                  No
                </Button>
              </div>
            </article>
          )}
        </Modal>
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

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
import { apiUrl } from "@/lib/org";
import { Edit3, Eye, FileText, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
type Item = {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  status: string | null;
  views: number | null;
  updatedAt: string;
  excerpt?: string | null;
  category?: string | null;
  featuredImage?: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};
type Config = {
  kind: "page" | "post";
  title: string;
  description: string;
  api: string;
};
const blank = {
  title: "",
  slug: "",
  excerpt: "",
  category: "General",
  featuredImage: "",
  content: "",
  status: "draft",
  metaTitle: "",
  metaDescription: "",
};
export function ContentManagerPage({ config }: { config: Config }) {
  const [data, setData] = useState<Item[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("all"),
    [open, setOpen] = useState(false),
    [preview, setPreview] = useState<Item | null>(null),
    [editing, setEditing] = useState<Item | null>(null),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(""),
    [form, setForm] = useState({ ...blank });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(apiUrl(config.api));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j.data || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Failed to load ${config.title.toLowerCase()}`,
      );
    } finally {
      setLoading(false);
    }
  }, [config.api, config.title]);
  useEffect(() => {
    load();
  }, [load]);
  const rows = useMemo(
    () =>
      data.filter(
        (x) =>
          (tab === "all" || x.status === tab) &&
          `${x.title} ${x.slug} ${x.category || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [data, tab, search],
  );
  const begin = (item?: Item) => {
    setEditing(item || null);
    setForm(
      item
        ? {
            title: item.title,
            slug: item.slug,
            excerpt: item.excerpt || "",
            category: item.category || "General",
            featuredImage: item.featuredImage || "",
            content: item.content || "",
            status: item.status || "draft",
            metaTitle: item.metaTitle || "",
            metaDescription: item.metaDescription || "",
          }
        : { ...blank },
    );
    setOpen(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(
        apiUrl(editing ? `${config.api}/${editing.id}` : config.api),
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOpen(false);
      setToast(
        `${config.kind === "page" ? "Page" : "Post"} ${editing ? "updated" : "created"}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  const patchStatus = async (item: Item) => {
    const r = await fetch(apiUrl(`${config.api}/${item.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: item.status === "published" ? "draft" : "published",
      }),
    });
    if (!r.ok) {
      const j = await r.json();
      setError(j.error);
      return;
    }
    setToast(item.status === "published" ? "Moved to draft" : "Published");
    await load();
  };
  const del = async (id: string) => {
    await fetch(apiUrl(`${config.api}/${id}`), { method: "DELETE" });
    setToast("Deleted");
    await load();
  };
  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title={config.title}
          description={config.description}
          action={
            <Button variant="primary" icon={Plus} onClick={() => begin()}>
              New {config.kind}
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}{" "}
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3 text-xs text-surface-400">
              Content is prepared here. Publish it after your public website
              domain and renderer are connected in Settings.
            </div>
            <div className="flex items-center justify-between">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: "all", label: "All" },
                  { value: "draft", label: "Draft" },
                  { value: "published", label: "Published" },
                ]}
              />
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder={`Search ${config.title.toLowerCase()}...`}
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={`No ${config.title.toLowerCase()}`}
                description={`Create the first ${config.kind}.`}
                action={
                  <Button size="sm" onClick={() => begin()}>
                    Create {config.kind}
                  </Button>
                }
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {[
                        "Title",
                        "URL",
                        "Status",
                        ...(config.kind === "post" ? ["Category"] : []),
                        "Views",
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
                    {rows.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-surface-100">
                            {item.title}
                          </p>
                          {item.excerpt && (
                            <p className="mt-1 max-w-sm truncate text-[10px] text-surface-500">
                              {item.excerpt}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-brand-400">
                          /{config.kind === "post" ? "blog/" : ""}
                          {item.slug}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={item.status} />
                        </td>
                        {config.kind === "post" && (
                          <td className="px-4 py-3 text-surface-400">
                            {item.category}
                          </td>
                        )}
                        <td className="px-4 py-3 text-surface-400">
                          {item.views || 0}
                        </td>
                        <td className="px-4 py-3 text-surface-400">
                          {new Date(item.updatedAt).toLocaleDateString("en-US")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              icon={Eye}
                              onClick={() => setPreview(item)}
                            >
                              Preview
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              icon={Edit3}
                              onClick={() => begin(item)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => patchStatus(item)}
                            >
                              {item.status === "published"
                                ? "Unpublish"
                                : "Publish"}
                            </Button>
                            <ConfirmAction onConfirm={() => del(item.id)} />
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
          title={`${editing ? "Edit" : "New"} ${config.kind}`}
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
            {config.kind === "post" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <input
                      className={inputClass}
                      value={form.category}
                      onChange={(e) =>
                        setForm({ ...form, category: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Featured image URL">
                    <input
                      className={inputClass}
                      value={form.featuredImage}
                      onChange={(e) =>
                        setForm({ ...form, featuredImage: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Excerpt">
                  <textarea
                    className={textareaClass}
                    rows={2}
                    value={form.excerpt}
                    onChange={(e) =>
                      setForm({ ...form, excerpt: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
            <Field
              label="Content"
              hint="Markdown is supported by the downstream website renderer"
            >
              <textarea
                className={textareaClass}
                rows={12}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Meta title">
                <input
                  className={inputClass}
                  value={form.metaTitle}
                  onChange={(e) =>
                    setForm({ ...form, metaTitle: e.target.value })
                  }
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
            <Field label="Meta description">
              <textarea
                className={textareaClass}
                rows={3}
                value={form.metaDescription}
                onChange={(e) =>
                  setForm({ ...form, metaDescription: e.target.value })
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={save}>
                {editing ? "Save changes" : `Create ${config.kind}`}
              </Button>
            </div>
          </div>
        </Modal>
        <Modal
          open={!!preview}
          onClose={() => setPreview(null)}
          title="Content preview"
          width="max-w-3xl"
        >
          {preview && (
            <article className="p-8">
              <div className="mb-6 rounded-lg border border-surface-800 bg-surface-950 px-4 py-2 font-mono text-[10px] text-surface-500">
                https://your-domain.com/{config.kind === "post" ? "blog/" : ""}
                {preview.slug}
              </div>
              <h1 className="text-3xl font-bold text-surface-50">
                {preview.title}
              </h1>
              {preview.excerpt && (
                <p className="mt-3 text-surface-400">{preview.excerpt}</p>
              )}
              <div className="mt-8 whitespace-pre-wrap text-sm leading-7 text-surface-300">
                {preview.content || "No content yet."}
              </div>
            </article>
          )}
        </Modal>
        {toast && <Toast message={toast} />}
      </div>
    </AppLayout>
  );
}

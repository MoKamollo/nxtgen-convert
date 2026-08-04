"use client";

import { AppLayout } from "@/components/layout/AppLayout";
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
  textareaClass,
  Toast,
} from "@/components/modules/ModulePrimitives";
import { Button } from "@/components/ui/Button";
import { apiFetch, apiUrl } from "@/lib/org";
import { Copy, FileCode2, Layers, Mail, Pencil, Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Template = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  htmlContent: string | null;
  category: string | null;
  tags: string[];
  isSystem: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type TemplateForm = {
  name: string;
  subject: string;
  preheader: string;
  htmlContent: string;
  category: string;
  tags: string;
};

async function fetchEmailTemplates(): Promise<Template[]> {
  const response = await apiFetch(apiUrl("/api/email-templates"));
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Failed to load templates");
  }
  return Array.isArray(json.data) ? json.data : [];
}

const blank: TemplateForm = {
  name: "",
  subject: "",
  preheader: "",
  htmlContent:
    '<h1>Hello, {{first_name}}</h1>\n<p>Write your message here.</p>\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  category: "newsletter",
  tags: "",
};

export default function EmailTemplatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("updated");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [preview, setPreview] = useState<Template | null>(null);
  const [form, setForm] = useState<TemplateForm>(blank);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchEmailTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchEmailTemplates()
      .then((templates) => {
        if (!active) return;
        setItems(templates);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Failed to load templates");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((item) => {
        const matchesSearch =
          !search ||
          `${item.name} ${item.subject}`.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === "all" || item.category === category;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        return (
          +new Date(b.updatedAt || b.createdAt || 0) -
          +new Date(a.updatedAt || a.createdAt || 0)
        );
      });
  }, [items, search, category, sort]);

  function edit(item?: Template) {
    setEditing(item ?? null);
    setForm(
      item
        ? {
            name: item.name,
            subject: item.subject,
            preheader: item.preheader ?? "",
            htmlContent: item.htmlContent ?? "",
            category: item.category ?? "other",
            tags: (item.tags ?? []).join(", "),
          }
        : { ...blank },
    );
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl(editing ? `/api/email-templates/${editing.id}` : "/api/email-templates"),
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            tags: form.tags
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          }),
        },
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to save template");
      setOpen(false);
      setToast(editing ? "Template updated" : "Template created");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const response = await apiFetch(apiUrl(`/api/email-templates/${id}`), {
      method: "DELETE",
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.error || "Failed to delete template");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    setToast("Template deleted");
  }

  function applyTemplate(item: Template) {
    sessionStorage.setItem("nxtgen-email-template", JSON.stringify(item));
    router.push(`/email/campaigns?templateId=${encodeURIComponent(item.id)}`);
  }

  return (
    <AppLayout>
      <div className="space-y-5 p-6 animate-fade-in">
        <ModuleHeader
          title="Email Templates"
          description="Reusable, brand-safe email content for campaigns and broadcasts"
          action={
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => edit()}>
              New Template
            </Button>
          }
        />

        <StatGrid
          stats={[
            { label: "All Templates", value: items.length, icon: Layers },
            {
              label: "Custom Templates",
              value: items.filter((item) => !item.isSystem).length,
              icon: FileCode2,
              tone: "green",
            },
            {
              label: "System Templates",
              value: items.filter((item) => item.isSystem).length,
              icon: Mail,
              tone: "violet",
            },
            {
              label: "Categories",
              value: new Set(items.map((item) => item.category)).size,
              icon: Send,
              tone: "amber",
            },
          ]}
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 gap-3">
            <SearchField value={search} onChange={setSearch} placeholder="Search templates..." />
            <FilterTabs
              value={category}
              onChange={setCategory}
              options={["all", "newsletter", "transactional", "campaign", "announcement", "other"].map(
                (value) => ({
                  value,
                  label: value === "all" ? "All" : value[0].toUpperCase() + value.slice(1),
                }),
              )}
            />
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className={`${inputClass} w-40`}
          >
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
          </select>
        </div>

        {error && <ErrorState message={error} retry={load} />}
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No templates found"
            description="Create a reusable template for your next campaign."
            action={
              <Button variant="outline" size="sm" icon={Plus} onClick={() => edit()}>
                Create Template
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="group rounded-xl border border-surface-800 bg-surface-900/50 p-4 hover:border-surface-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                    <Mail size={16} />
                  </div>
                  <div className="flex gap-1">
                    {!item.isSystem && (
                      <button
                        onClick={() => edit(item)}
                        className="rounded-md p-1.5 text-surface-500 hover:bg-surface-700 hover:text-surface-200"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {!item.isSystem && <ConfirmAction onConfirm={() => remove(item.id)} />}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-surface-100">{item.name}</h3>
                    {item.isSystem && <StatusBadge value="system" />}
                  </div>
                  <p className="mt-1 truncate text-xs text-surface-400">{item.subject}</p>
                  <p className="mt-2 line-clamp-2 text-[11px] text-surface-600">
                    {item.preheader || "No preheader"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {(item.tags ?? []).slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-surface-800 px-2 py-1 text-[10px] text-surface-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setPreview(item)}
                  >
                    Preview
                  </Button>
                  <Button
                    variant="gradient"
                    size="sm"
                    className="flex-1"
                    onClick={() => applyTemplate(item)}
                  >
                    Use
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Template" : "New Template"}
        width="max-w-4xl"
      >
        <form onSubmit={save} className="grid grid-cols-2 gap-5 p-5">
          <div className="space-y-4">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Subject">
              <input
                required
                value={form.subject}
                onChange={(event) => setForm((value) => ({ ...value, subject: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Preheader">
              <input
                value={form.preheader}
                onChange={(event) =>
                  setForm((value) => ({ ...value, preheader: event.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, category: event.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="newsletter">Newsletter</option>
                  <option value="transactional">Transactional</option>
                  <option value="campaign">Campaign</option>
                  <option value="announcement">Announcement</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Tags">
                <input
                  value={form.tags}
                  onChange={(event) => setForm((value) => ({ ...value, tags: event.target.value }))}
                  placeholder="welcome, onboarding"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field
              label="HTML Content"
              hint="Supported: {{name}}, {{first_name}}, {{unsubscribe_url}}"
            >
              <textarea
                rows={12}
                value={form.htmlContent}
                onChange={(event) =>
                  setForm((value) => ({ ...value, htmlContent: event.target.value }))
                }
                className={`${textareaClass} font-mono text-xs`}
              />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-surface-400">Live Preview</p>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={form.htmlContent}
              className="h-[520px] w-full rounded-xl border border-surface-700 bg-white"
            />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" loading={saving}>
              {editing ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name ?? "Preview"}
        width="max-w-3xl"
      >
        <div className="p-5">
          <iframe
            title="Template preview"
            sandbox=""
            srcDoc={(preview?.htmlContent ?? "")
              .replace(/\{\{first_name\}\}/gi, "Jordan")
              .replace(/\{\{name\}\}/gi, "Jordan Lee")
              .replace(/\{\{unsubscribe_url\}\}/gi, "#")}
            className="h-[600px] w-full rounded-xl border border-surface-700 bg-white"
          />
          <Button
            className="mt-4"
            variant="outline"
            icon={Copy}
            onClick={() => navigator.clipboard.writeText(preview?.htmlContent ?? "")}
          >
            Copy HTML
          </Button>
        </div>
      </Modal>

      {toast && <Toast message={toast} />}
    </AppLayout>
  );
}

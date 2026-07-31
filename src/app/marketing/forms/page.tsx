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
import { apiUrl } from "@/lib/org";
import {
  Clipboard,
  Code2,
  Eye,
  FileInput,
  GripVertical,
  ListChecks,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type FieldType = "text" | "email" | "phone" | "textarea" | "select" | "checkbox";
type FormField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
};
type MarketingForm = {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  status: string | null;
  submissions: number | null;
  embedCode: string | null;
  createdAt: string;
};
type Submission = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  customFields: { submission?: Record<string, string | boolean> } | null;
  createdAt: string;
};

function newField(): FormField {
  return { id: crypto.randomUUID(), label: "Email", type: "email", required: true };
}

export default function MarketingFormsPage() {
  const [data, setData] = useState<MarketingForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<MarketingForm | null>(null);
  const [submissionForm, setSubmissionForm] = useState<MarketingForm | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [toast, setToast] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", fields: [newField()] });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/forms"));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData(payload.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load forms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const rows = useMemo(
    () =>
      data.filter(
        (item) =>
          (tab === "all" || item.status === tab) &&
          `${item.name} ${item.description ?? ""}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [data, search, tab],
  );

  function updateField(index: number, patch: Partial<FormField>) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    }));
  }

  function moveField(from: number, to: number) {
    if (from === to || to < 0 || to >= form.fields.length) return;
    setForm((current) => {
      const fields = [...current.fields];
      const [moved] = fields.splice(from, 1);
      fields.splice(to, 0, moved);
      return { ...current, fields };
    });
  }

  async function save() {
    setModalError("");
    if (!form.name.trim()) {
      setModalError("Form name is required");
      return;
    }
    if (form.fields.length === 0 || form.fields.some((field) => !field.label.trim())) {
      setModalError("Every form needs at least one labeled field");
      return;
    }
    if (
      form.fields.some(
        (field) => field.type === "select" && (!field.options || field.options.length === 0),
      )
    ) {
      setModalError("Each select field needs at least one option");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(apiUrl("/api/forms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setOpen(false);
      setForm({ name: "", description: "", fields: [newField()] });
      setToast("Form created");
      await load();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : "Could not create form");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, status: string) {
    const response = await fetch(apiUrl(`/api/forms/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update form");
      return;
    }
    setToast("Form status updated");
    await load();
  }

  async function remove(id: string) {
    const response = await fetch(apiUrl(`/api/forms/${id}`), { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete form");
      return;
    }
    setToast("Form deleted");
    await load();
  }

  async function copy(code: string | null) {
    if (!code) {
      setError("Embed code is unavailable");
      return;
    }
    await navigator.clipboard.writeText(code);
    setToast("Embed code copied");
  }

  async function viewSubmissions(item: MarketingForm) {
    setSubmissionForm(item);
    setSubmissions([]);
    setSubmissionsLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/forms/${item.id}/submissions`));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setSubmissions(payload.data ?? []);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : "Failed to load submissions",
      );
      setSubmissionForm(null);
    } finally {
      setSubmissionsLoading(false);
    }
  }

  const totalSubmissions = data.reduce((sum, item) => sum + Number(item.submissions ?? 0), 0);
  const totalFields = data.reduce((sum, item) => sum + item.fields.length, 0);

  return (
    <AppLayout>
      <div className="relative min-h-full">
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ backgroundImage: "url('/convert-bg.png')", backgroundSize: "cover", backgroundPosition: "center right", opacity: 0.18 }} />
      <div className="relative z-10 space-y-5 p-6">
        <ModuleHeader
          title="Marketing Forms"
          description="Build and embed lead capture forms"
          action={
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              New Form
            </Button>
          }
        />
        {error && <ErrorState message={error} retry={load} />}
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: "Total Forms", value: data.length, icon: FileInput },
                {
                  label: "Active Forms",
                  value: data.filter((item) => item.status === "active").length,
                  icon: Send,
                  tone: "green",
                },
                { label: "Submissions", value: totalSubmissions, icon: ListChecks, tone: "violet" },
                { label: "Fields Built", value: totalFields, icon: GripVertical, tone: "amber" },
              ]}
            />
            <div className="flex items-center justify-between">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
              <SearchField value={search} onChange={setSearch} placeholder="Search forms..." />
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={FileInput}
                title="No forms"
                description="Create your first lead capture form."
                action={
                  <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
                    New Form
                  </Button>
                }
              />
            ) : (
              <div className="max-h-[560px] overflow-auto rounded-xl border border-surface-800 bg-surface-900/50">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-surface-900">
                    <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                      {["Form", "Status", "Fields", "Submissions", "Created", "Actions"].map(
                        (heading) => (
                          <th key={heading} className="px-4 py-3">
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {rows.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-surface-100">{item.name}</p>
                          <p className="mt-1 max-w-xs truncate text-[10px] text-surface-500">
                            {item.description}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={item.status} />
                        </td>
                        <td className="px-4 py-3 text-surface-400">{item.fields.length}</td>
                        <td className="px-4 py-3 text-surface-400">{item.submissions ?? 0}</td>
                        <td className="px-4 py-3 text-surface-400">
                          {new Date(item.createdAt).toLocaleDateString("en-US")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              icon={ListChecks}
                              onClick={() => viewSubmissions(item)}
                            >
                              Submissions
                            </Button>
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
                              icon={Code2}
                              onClick={() => copy(item.embedCode)}
                            >
                              Embed
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => patch(item.id, item.status === "active" ? "inactive" : "active")}
                            >
                              {item.status === "active" ? "Disable" : "Enable"}
                            </Button>
                            <ConfirmAction onConfirm={() => remove(item.id)} />
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
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Marketing Form" width="max-w-4xl">
        <div className="space-y-4 p-5">
          {modalError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {modalError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Description">
              <input
                className={inputClass}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-surface-300">Fields</p>
                <p className="mt-1 text-[10px] text-surface-600">Drag rows to change their order.</p>
              </div>
              <Button
                size="xs"
                variant="outline"
                icon={Plus}
                onClick={() =>
                  setForm({
                    ...form,
                    fields: [
                      ...form.fields,
                      {
                        id: crypto.randomUUID(),
                        label: "Field",
                        type: "text",
                        required: false,
                      },
                    ],
                  })
                }
              >
                Add Field
              </Button>
            </div>
            {form.fields.map((field, index) => (
              <div
                key={field.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) moveField(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className="rounded-lg border border-surface-800 bg-surface-950 p-3"
              >
                <div className="grid grid-cols-[24px_1fr_160px_100px_36px] gap-2">
                  <span className="flex cursor-grab items-center justify-center text-surface-600">
                    <GripVertical size={16} />
                  </span>
                  <input
                    className={inputClass}
                    value={field.label}
                    onChange={(event) => updateField(index, { label: event.target.value })}
                  />
                  <select
                    className={inputClass}
                    value={field.type}
                    onChange={(event) =>
                      updateField(index, {
                        type: event.target.value as FieldType,
                        ...(event.target.value === "select" && !field.options
                          ? { options: ["Option 1", "Option 2"] }
                          : {}),
                      })
                    }
                  >
                    {(["text", "email", "phone", "textarea", "select", "checkbox"] as FieldType[]).map(
                      (type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ),
                    )}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-surface-400">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) => updateField(index, { required: event.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    className="text-surface-500 hover:text-red-400"
                    onClick={() =>
                      setForm({
                        ...form,
                        fields: form.fields.filter((_, fieldIndex) => fieldIndex !== index),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {field.type === "select" && (
                  <Field label="Select options" hint="Separate options with commas">
                    <input
                      className={`${inputClass} mt-3`}
                      value={(field.options ?? []).join(", ")}
                      onChange={(event) =>
                        updateField(index, {
                          options: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Create Form
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Form Preview">
        {preview && (
          <div className="space-y-4 p-6">
            <h2 className="text-xl font-bold text-surface-50">{preview.name}</h2>
            <p className="text-sm text-surface-500">{preview.description}</p>
            {preview.fields.map((field) => (
              <Field key={field.id} label={`${field.label}${field.required ? " *" : ""}`}>
                {field.type === "textarea" ? (
                  <textarea className={textareaClass} rows={3} />
                ) : field.type === "checkbox" ? (
                  <input type="checkbox" />
                ) : field.type === "select" ? (
                  <select className={inputClass}>
                    <option value="">Select an option</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    type={field.type === "phone" ? "tel" : field.type}
                  />
                )}
              </Field>
            ))}
            <Button variant="primary" fullWidth>
              Submit
            </Button>
            <button
              className="flex items-center gap-1 text-[10px] text-surface-600"
              onClick={() => copy(preview.embedCode)}
            >
              <Clipboard size={11} /> Copy embed code
            </button>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(submissionForm)}
        onClose={() => setSubmissionForm(null)}
        title={`${submissionForm?.name ?? "Form"} Submissions`}
        width="max-w-4xl"
      >
        <div className="p-5">
          {submissionsLoading ? (
            <LoadingState />
          ) : submissions.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No submissions"
              description="Responses will appear here after the form is submitted."
            />
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-xl border border-surface-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-900">
                  <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                    {[
                      "Contact",
                      "Email",
                      "Phone",
                      "Submitted",
                      "Captured Values",
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {submissions.map((submission) => (
                    <tr key={submission.id}>
                      <td className="px-4 py-3 font-semibold text-surface-100">
                        {`${submission.firstName ?? ""} ${submission.lastName ?? ""}`.trim() ||
                          "Website Lead"}
                      </td>
                      <td className="px-4 py-3 text-surface-400">{submission.email ?? "—"}</td>
                      <td className="px-4 py-3 text-surface-400">{submission.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-surface-400">
                        {new Date(submission.createdAt).toLocaleString("en-US")}
                      </td>
                      <td className="max-w-sm px-4 py-3 text-[10px] text-surface-500">
                        {Object.values(submission.customFields?.submission ?? {})
                          .filter((value) => value !== "" && value !== false)
                          .slice(0, 4)
                          .map(String)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
      {toast && <Toast message={toast} />}
      </div>
      </div>
    </AppLayout>
  );
}

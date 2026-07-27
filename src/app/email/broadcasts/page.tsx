"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import {
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
  CalendarClock,
  Eye,
  FileUp,
  Mail,
  MousePointerClick,
  Plus,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Broadcast = {
  id: string;
  name: string;
  subject: string | null;
  status: string;
  fromName: string | null;
  fromEmail: string | null;
  audienceFilters: Record<string, unknown>;
  scheduledAt: string | null;
  sentAt: string | null;
  stats: {
    sent?: number;
    delivered?: number;
    opened?: number;
    clicked?: number;
  };
};

type UploadedRecipient = {
  email: string;
  firstName: string;
  lastName: string;
};

type BroadcastForm = {
  name: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  preheader: string;
  content: string;
  audience: "all" | "status" | "tag" | "upload";
  audienceValue: string;
  scheduleMode: "draft" | "send_now" | "schedule";
  scheduledAt: string;
};

const INITIAL_FORM: BroadcastForm = {
  name: "",
  fromName: "",
  fromEmail: "",
  subject: "",
  preheader: "",
  content: "<h1>Hello, {{first_name}}</h1><p>Write your broadcast here.</p>",
  audience: "all",
  audienceValue: "",
  scheduleMode: "draft",
  scheduledAt: "",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function readRecipients(text: string): UploadedRecipient[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV has no recipient rows");
  const headers = rows[0].map(normalizeHeader);
  const emailIndex = headers.indexOf("email");
  const firstNameIndex = headers.findIndex((header) =>
    ["first_name", "firstname", "name"].includes(header),
  );
  const lastNameIndex = headers.findIndex((header) =>
    ["last_name", "lastname"].includes(header),
  );
  if (emailIndex === -1) throw new Error('The CSV must contain an "email" column');

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set<string>();
  const recipients: UploadedRecipient[] = [];
  for (const row of rows.slice(1)) {
    const email = String(row[emailIndex] ?? "").trim().toLowerCase();
    if (!emailPattern.test(email) || seen.has(email)) continue;
    seen.add(email);
    const rawFirstName = firstNameIndex >= 0 ? String(row[firstNameIndex] ?? "").trim() : "";
    const rawLastName = lastNameIndex >= 0 ? String(row[lastNameIndex] ?? "").trim() : "";
    const splitName = firstNameIndex >= 0 && headers[firstNameIndex] === "name"
      ? rawFirstName.split(/\s+/)
      : [];
    recipients.push({
      email,
      firstName: splitName.length > 0 ? splitName[0] : rawFirstName || "Subscriber",
      lastName: rawLastName || (splitName.length > 1 ? splitName.slice(1).join(" ") : ""),
    });
    if (recipients.length >= 10_000) break;
  }
  if (recipients.length === 0) throw new Error("The CSV contains no valid email addresses");
  return recipients;
}

export default function BroadcastsPage() {
  const [items, setItems] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<BroadcastForm>(INITIAL_FORM);
  const [uploadedRecipients, setUploadedRecipients] = useState<UploadedRecipient[]>([]);
  const [uploadedFile, setUploadedFile] = useState("");
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/broadcasts"));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setItems(payload.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load broadcasts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("create") === "true") setOpen(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (tab === "all" || item.status === tab) &&
          (!search || `${item.name} ${item.subject}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [items, search, tab],
  );

  const totals = items.reduce(
    (accumulator, item) => ({
      sent: accumulator.sent + Number(item.stats?.sent ?? 0),
      opened: accumulator.opened + Number(item.stats?.opened ?? 0),
      clicked: accumulator.clicked + Number(item.stats?.clicked ?? 0),
      delivered: accumulator.delivered + Number(item.stats?.delivered ?? 0),
    }),
    { sent: 0, opened: 0, clicked: 0, delivered: 0 },
  );

  function rate(numerator: number, denominator: number) {
    return denominator ? `${((numerator / denominator) * 100).toFixed(1)}%` : "—";
  }

  function closeModal() {
    setOpen(false);
    setStep(1);
    setForm(INITIAL_FORM);
    setUploadedRecipients([]);
    setUploadedFile("");
    setModalError("");
  }

  function validateStep() {
    setModalError("");
    if (step === 1) {
      if (!form.fromName.trim() || !form.fromEmail.trim() || !form.subject.trim() || !form.content.trim()) {
        setModalError("Complete the sender, subject, and content fields");
        return false;
      }
    }
    if (step === 2) {
      if ((form.audience === "status" || form.audience === "tag") && !form.audienceValue.trim()) {
        setModalError("Complete the audience filter");
        return false;
      }
      if (form.audience === "upload" && uploadedRecipients.length === 0) {
        setModalError("Upload a CSV with at least one valid recipient");
        return false;
      }
    }
    return true;
  }

  async function handleCsv(file: File | undefined) {
    setModalError("");
    setUploadedRecipients([]);
    setUploadedFile("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setModalError("CSV files must be 5 MB or smaller");
      return;
    }
    try {
      const recipients = readRecipients(await file.text());
      setUploadedRecipients(recipients);
      setUploadedFile(file.name);
    } catch (csvError) {
      setModalError(csvError instanceof Error ? csvError.message : "Failed to read CSV");
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setModalError("");
    if (!validateStep()) return;
    if (form.scheduleMode === "schedule") {
      if (!form.scheduledAt) {
        setModalError("Choose a schedule date and time");
        return;
      }
      const scheduleDate = new Date(form.scheduledAt);
      if (Number.isNaN(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now()) {
        setModalError("Schedule date must be in the future");
        return;
      }
    }

    setSaving(true);
    try {
      const audienceFilters =
        form.audience === "all" || form.audience === "upload"
          ? {}
          : form.audience === "status"
            ? { status: form.audienceValue }
            : {
                tags: form.audienceValue
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              };
      const response = await fetch(apiUrl("/api/broadcasts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          audienceFilters,
          uploadedRecipients,
          scheduledAt:
            form.scheduleMode === "schedule" ? new Date(form.scheduledAt).toISOString() : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const successMessage =
        form.scheduleMode === "send_now"
          ? `Broadcast sent to ${Number(payload.delivery?.sent ?? 0)} recipients`
          : form.scheduleMode === "schedule"
            ? "Broadcast scheduled"
            : "Broadcast saved as draft";
      closeModal();
      setToast(successMessage);
      await load();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : "Failed to save broadcast");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setModalError("");
    try {
      const response = await fetch(apiUrl("/api/broadcasts/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: form.subject, content: form.content }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Test failed");
      setToast("Test email sent");
    } catch (testError) {
      setModalError(testError instanceof Error ? testError.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  const deliveryLabel =
    form.scheduleMode === "send_now"
      ? "Send Broadcast"
      : form.scheduleMode === "schedule"
        ? "Schedule Broadcast"
        : "Save Draft";

  return (
    <AppLayout>
      <div className="space-y-5 p-6">
        <ModuleHeader
          title="Broadcasts"
          description="One-time email sends to a defined audience"
          action={
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setOpen(true)}>
              New Broadcast
            </Button>
          }
        />
        <StatGrid
          stats={[
            { label: "Total Sent", value: totals.sent, icon: Send },
            {
              label: "Average Open Rate",
              value: rate(totals.opened, totals.delivered || totals.sent),
              icon: Eye,
              tone: "green",
            },
            {
              label: "Average Click Rate",
              value: rate(totals.clicked, totals.opened),
              icon: MousePointerClick,
              tone: "violet",
            },
            {
              label: "Scheduled",
              value: items.filter((item) => item.status === "scheduled").length,
              icon: CalendarClock,
              tone: "amber",
            },
          ]}
        />
        <div className="flex gap-3">
          <SearchField value={search} onChange={setSearch} placeholder="Search broadcasts..." />
          <FilterTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All" },
              { value: "draft", label: "Drafts" },
              { value: "scheduled", label: "Scheduled" },
              { value: "sent", label: "Sent" },
            ]}
          />
        </div>
        {error && <ErrorState message={error} retry={load} />}
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No broadcasts found"
            description="Compose a one-time email for your audience."
            action={
              <Button variant="outline" size="sm" icon={Plus} onClick={() => setOpen(true)}>
                New Broadcast
              </Button>
            }
          />
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-xl border border-surface-800 bg-surface-900/50">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-surface-900">
                <tr className="border-b border-surface-800 text-left text-[10px] uppercase text-surface-500">
                  {["Subject", "Status", "Audience", "Sent", "Open Rate", "Click Rate"].map(
                    (heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtered.map((item) => {
                  const stats = item.stats ?? {};
                  return (
                    <tr key={item.id} className="hover:bg-surface-800/30">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-surface-100">{item.subject || item.name}</p>
                        <p className="text-[10px] text-surface-500">
                          {item.fromName} &lt;{item.fromEmail}&gt;
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={item.status} />
                      </td>
                      <td className="px-4 py-3 text-surface-400">
                        {Object.keys(item.audienceFilters ?? {}).length ? "Filtered segment" : "All contacts"}
                      </td>
                      <td className="px-4 py-3 text-surface-300">{Number(stats.sent ?? 0)}</td>
                      <td className="px-4 py-3 text-emerald-400">
                        {rate(Number(stats.opened ?? 0), Number(stats.delivered ?? stats.sent ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-violet-400">
                        {rate(Number(stats.clicked ?? 0), Number(stats.opened ?? 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={closeModal} title={`New Broadcast · Step ${step} of 3`} width="max-w-2xl">
        <form onSubmit={save} className="space-y-5 p-5">
          {modalError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {modalError}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="From Name">
                  <input
                    required
                    value={form.fromName}
                    onChange={(event) => setForm((value) => ({ ...value, fromName: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="From Email">
                  <input
                    required
                    type="email"
                    value={form.fromEmail}
                    onChange={(event) => setForm((value) => ({ ...value, fromEmail: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Subject">
                <input
                  required
                  value={form.subject}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      subject: event.target.value,
                      name: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Preheader">
                <input
                  value={form.preheader}
                  onChange={(event) => setForm((value) => ({ ...value, preheader: event.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="HTML Content" hint="Merge tags: {{first_name}}, {{last_name}}, {{name}}, {{unsubscribe_url}}">
                <textarea
                  rows={12}
                  value={form.content}
                  onChange={(event) => setForm((value) => ({ ...value, content: event.target.value }))}
                  className={`${textareaClass} font-mono text-xs`}
                />
              </Field>
              <Button type="button" variant="outline" loading={testing} onClick={sendTest}>
                Send Test
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Audience">
                <select
                  value={form.audience}
                  onChange={(event) => {
                    const audience = event.target.value as BroadcastForm["audience"];
                    setForm((value) => ({ ...value, audience, audienceValue: "" }));
                    setUploadedRecipients([]);
                    setUploadedFile("");
                  }}
                  className={inputClass}
                >
                  <option value="all">All contacts</option>
                  <option value="status">Filter by status</option>
                  <option value="tag">Filter by tag</option>
                  <option value="upload">Upload CSV</option>
                </select>
              </Field>
              {form.audience === "status" && (
                <Field label="Contact Status">
                  <select
                    value={form.audienceValue}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, audienceValue: event.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">Select status</option>
                    <option value="lead">Lead</option>
                    <option value="prospect">Prospect</option>
                    <option value="customer">Customer</option>
                    <option value="vip">VIP</option>
                  </select>
                </Field>
              )}
              {form.audience === "tag" && (
                <Field label="Tags">
                  <input
                    value={form.audienceValue}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, audienceValue: event.target.value }))
                    }
                    placeholder="customer, newsletter"
                    className={inputClass}
                  />
                </Field>
              )}
              {form.audience === "upload" && (
                <Field label="Recipient CSV" hint='Required column: "email". Optional: "first_name", "last_name", or "name".'>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-surface-700 bg-surface-800/40 px-4 py-8 text-xs text-surface-400 hover:border-brand-500 hover:text-surface-200">
                    <FileUp size={18} />
                    <span>{uploadedFile || "Choose CSV file"}</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(event) => handleCsv(event.target.files?.[0])}
                    />
                  </label>
                </Field>
              )}
              {uploadedRecipients.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-300">
                  {uploadedRecipients.length.toLocaleString()} valid recipients loaded. Duplicate and invalid emails were removed.
                </div>
              )}
              <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4 text-xs text-surface-400">
                Contacts tagged as unsubscribed are always excluded. Uploaded recipients are deduplicated before sending.
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="Delivery">
                <select
                  value={form.scheduleMode}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      scheduleMode: event.target.value as BroadcastForm["scheduleMode"],
                    }))
                  }
                  className={inputClass}
                >
                  <option value="draft">Save as draft</option>
                  <option value="send_now">Send now</option>
                  <option value="schedule">Schedule for later</option>
                </select>
              </Field>
              {form.scheduleMode === "schedule" && (
                <Field label="Schedule Date and Time">
                  <input
                    required
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, scheduledAt: event.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>
              )}
              {form.scheduleMode === "send_now" && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-300">
                  This action sends immediately. Confirm the sender, audience, and content before continuing.
                </div>
              )}
              <div className="rounded-xl border border-surface-700 p-4">
                <p className="text-sm font-semibold text-surface-100">{form.subject}</p>
                <p className="mt-1 text-xs text-surface-500">
                  From {form.fromName} ·{" "}
                  {form.audience === "all"
                    ? "All contacts"
                    : form.audience === "upload"
                      ? `${uploadedRecipients.length.toLocaleString()} uploaded recipients`
                      : `Filtered by ${form.audience}`}
                </p>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 1 || saving}
              onClick={() => {
                setModalError("");
                setStep((value) => value - 1);
              }}
            >
              Back
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                variant="gradient"
                onClick={() => {
                  if (validateStep()) setStep((value) => value + 1);
                }}
              >
                Continue
              </Button>
            ) : (
              <Button type="submit" variant="gradient" loading={saving}>
                {deliveryLabel}
              </Button>
            )}
          </div>
        </form>
      </Modal>
      {toast && <Toast message={toast} />}
    </AppLayout>
  );
}

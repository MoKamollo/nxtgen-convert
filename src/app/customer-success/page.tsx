"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, HeartHandshake, Plus, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Field, FilterTabs, LoadingState, Modal, ModuleHeader, StatGrid, StatusBadge, Toast, inputClass, textareaClass } from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";

type Contact = { id: string; firstName: string; lastName: string | null; email: string | null };
type Playbook = { id: string; name: string; description: string | null; status: string; activeVersionId: string | null; activeVersion: number | null; definition: { milestones?: Array<{ title: string }> } | null; updatedAt: string };
type Plan = { id: string; contactId: string; contactFirstName: string; contactLastName: string | null; name: string; status: string; targetDate: string | null; ownerName?: string | null; updatedAt: string };
type Renewal = { id: string; contactId: string; contactFirstName?: string; contactLastName?: string | null; firstName?: string; lastName?: string | null; renewalDate: string; amount: string | null; currency: string; status: string; riskLevel: string; ownerName?: string | null };
type Alert = { id: string; contactId: string; contactFirstName: string; contactLastName: string | null; severity: string; status: string; title: string; description: string | null; createdAt: string };
type Milestone = { id: string; planId: string; title: string; status: string; dueAt: string | null };
type Dashboard = { summary: { assessedCustomers: number; healthy: number; watch: number; atRisk: number; insufficientData: number; openAlerts: number; renewalsDue90Days: number; activePlans: number; overdueMilestones: number }; alerts: Alert[]; renewals: Renewal[]; plans: Plan[]; milestones: Milestone[]; methodology: string };

type ModalName = "playbook" | "plan" | "renewal" | "health" | null;
function fullName(first?: string | null, last?: string | null) { return `${first ?? ""} ${last ?? ""}`.trim() || "Unnamed customer"; }
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "No date"; }
function money(value: string | null, currency = "USD") { return value === null ? "Not recorded" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); }

export default function CustomerSuccessPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState<ModalName>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type?: "success" | "error" } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all([
        apiFetch(apiUrl("/api/customer-success/dashboard")),
        apiFetch(apiUrl("/api/customer-success/playbooks")),
        apiFetch(apiUrl("/api/customer-success/plans")),
        apiFetch(apiUrl("/api/customer-success/renewals")),
        apiFetch(apiUrl("/api/contacts", { limit: "200" })),
      ]);
      const payloads = await Promise.all(responses.map((response) => response.json()));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(payloads[failed].error ?? "Customer Success data could not be loaded");
      setDashboard(payloads[0].data); setPlaybooks(payloads[1].data); setPlans(payloads[2].data); setRenewals(payloads[3].data); setContacts(payloads[4].data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Customer Success data could not be loaded"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const publishedPlaybooks = useMemo(() => playbooks.filter((item) => item.activeVersionId), [playbooks]);
  function open(name: ModalName) { setForm({}); setModal(name); }
  async function mutate(path: string, body: Record<string, unknown>, success: string) {
    setSaving(true);
    try {
      const response = await apiFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Action failed");
      setToast({ message: success }); setModal(null); await load(); return json;
    } catch (caught) { setToast({ message: caught instanceof Error ? caught.message : "Action failed", type: "error" }); return null; }
    finally { setSaving(false); }
  }
  async function patch(path: string, body: Record<string, unknown>, success: string) {
    setSaving(true);
    try {
      const response = await apiFetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Action failed");
      setToast({ message: success }); await load();
    } catch (caught) { setToast({ message: caught instanceof Error ? caught.message : "Action failed", type: "error" }); }
    finally { setSaving(false); }
  }

  async function createPlaybook() {
    const milestones = (form.milestones ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [title, due] = line.split("|").map((part) => part.trim());
      return { title, dueDays: due ? Number(due) : null };
    });
    await mutate("/api/customer-success/playbooks", { name: form.name, description: form.description, definition: { objectives: (form.objectives ?? "").split("\n").filter(Boolean), successCriteria: (form.criteria ?? "").split("\n").filter(Boolean), milestones } }, "Draft playbook created");
  }
  async function createPlan() {
    const selected = publishedPlaybooks.find((item) => item.id === form.playbookId);
    await mutate("/api/customer-success/plans", { contactId: form.contactId, name: form.name, playbookVersionId: selected?.activeVersionId ?? null, targetDate: form.targetDate || null }, "Customer success plan created");
  }
  async function createRenewal() {
    await mutate("/api/customer-success/renewals", { contactId: form.contactId, renewalDate: form.renewalDate, amount: form.amount || null, currency: form.currency || "USD", notes: form.notes }, "Renewal created");
  }
  async function recalculateHealth() { await mutate("/api/customer-success/health/recalculate", { contactId: form.contactId }, "Health assessment recorded"); }

  return <AppLayout><div className="space-y-5 p-6">
    <ModuleHeader title="Customer Success" description="Evidence based health, governed success plans, renewals, milestones, and customer risk operations." action={<div className="flex gap-2"><Button variant="outline" icon={RefreshCw} onClick={load}>Refresh</Button><Button variant="gradient" icon={Plus} onClick={() => open("plan")}>New plan</Button></div>} />
    {error && <ErrorState message={error} retry={load} />}
    {loading || !dashboard ? <LoadingState /> : <>
      <StatGrid columns={6} stats={[
        { label: "Active plans", value: dashboard.summary.activePlans, icon: ClipboardList },
        { label: "Assessed customers", value: dashboard.summary.assessedCustomers, icon: Activity, hint: "Latest recorded assessment" },
        { label: "Healthy", value: dashboard.summary.healthy, icon: ShieldCheck, tone: "green" },
        { label: "Needs review", value: dashboard.summary.watch, icon: AlertTriangle, tone: "amber" },
        { label: "At risk", value: dashboard.summary.atRisk, icon: AlertTriangle, tone: "red" },
        { label: "Renewals in 90 days", value: dashboard.summary.renewalsDue90Days, icon: CalendarClock, tone: "violet" },
      ]} />
      <div className="flex items-center justify-between gap-3">
        <FilterTabs value={tab} onChange={setTab} options={[{ value: "overview", label: "Overview" }, { value: "plans", label: "Success plans", count: plans.length }, { value: "renewals", label: "Renewals", count: renewals.length }, { value: "playbooks", label: "Playbooks", count: playbooks.length }]} />
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => open("health")}>Assess health</Button><Button size="sm" variant="outline" onClick={() => open("renewal")}>Add renewal</Button><Button size="sm" variant="outline" onClick={() => open("playbook")}>New playbook</Button></div>
      </div>

      {tab === "overview" && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50"><div className="flex items-center justify-between border-b border-surface-800 px-4 py-3"><div><h2 className="text-sm font-semibold text-surface-100">Open risk alerts</h2><p className="text-[11px] text-surface-500">Recorded from deterministic health evidence</p></div><span className="text-xs text-surface-500">{dashboard.alerts.length}</span></div>{dashboard.alerts.length === 0 ? <div className="p-4"><EmptyState icon={CheckCircle2} title="No open risk alerts" description="No assessed customer currently requires an open risk response." /></div> : <div className="divide-y divide-surface-800">{dashboard.alerts.map((alert) => <div key={alert.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Link href={`/crm/contacts/${alert.contactId}`} className="text-xs font-semibold text-surface-100 hover:text-brand-400">{fullName(alert.contactFirstName, alert.contactLastName)}</Link><StatusBadge value={alert.severity} /></div><p className="mt-1 text-[11px] text-surface-400">{alert.title}</p><p className="mt-0.5 text-[10px] text-surface-600">{alert.description ?? "Evidence recorded in the health assessment"}</p></div><Button size="xs" variant="outline" disabled={saving} onClick={() => patch(`/api/customer-success/alerts/${alert.id}`, { status: "acknowledged" }, "Alert acknowledged")}>Acknowledge</Button></div>)}</div>}</section>
        <section className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50"><div className="flex items-center justify-between border-b border-surface-800 px-4 py-3"><div><h2 className="text-sm font-semibold text-surface-100">Due milestones</h2><p className="text-[11px] text-surface-500">Open milestones due within 90 days</p></div><span className="text-xs text-surface-500">{dashboard.milestones.length}</span></div>{dashboard.milestones.length === 0 ? <div className="p-4"><EmptyState icon={ClipboardList} title="No due milestones" description="Open plan milestones will appear here when a due date is recorded." /></div> : <div className="divide-y divide-surface-800">{dashboard.milestones.slice(0, 12).map((milestone) => <div key={milestone.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-xs font-medium text-surface-200">{milestone.title}</p><p className="mt-1 text-[10px] text-surface-600">{dateLabel(milestone.dueAt)}</p></div><StatusBadge value={milestone.status} /></div>)}</div>}</section>
        <p className="xl:col-span-2 rounded-lg border border-surface-800 bg-surface-900/30 px-4 py-3 text-[11px] text-surface-500">{dashboard.methodology}</p>
      </div>}

      {tab === "plans" && <section className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">{plans.length === 0 ? <div className="p-4"><EmptyState icon={ClipboardList} title="No success plans" description="Create a plan directly or from a published playbook." action={<Button size="sm" onClick={() => open("plan")}>Create plan</Button>} /></div> : <div className="divide-y divide-surface-800">{plans.map((plan) => <div key={plan.id} className="flex items-center gap-4 px-4 py-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-xs font-semibold text-surface-100">{plan.name}</p><StatusBadge value={plan.status} /></div><p className="mt-1 text-[11px] text-surface-500"><Link href={`/crm/contacts/${plan.contactId}`} className="hover:text-brand-400">{fullName(plan.contactFirstName, plan.contactLastName)}</Link> · Target {dateLabel(plan.targetDate)}</p></div><select value={plan.status} disabled={saving} onChange={(event) => patch(`/api/customer-success/plans/${plan.id}`, { status: event.target.value }, "Plan status updated")} className="h-8 rounded-lg border border-surface-700 bg-surface-900 px-2 text-xs text-surface-300"><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>)}</div>}</section>}

      {tab === "renewals" && <section className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">{renewals.length === 0 ? <div className="p-4"><EmptyState icon={CalendarClock} title="No renewals" description="Record customer renewal dates and operational risk explicitly." action={<Button size="sm" onClick={() => open("renewal")}>Add renewal</Button>} /></div> : <div className="divide-y divide-surface-800">{renewals.map((renewal) => <div key={renewal.id} className="grid grid-cols-[1.3fr_.8fr_.7fr_.8fr_auto] items-center gap-3 px-4 py-3 text-xs"><Link href={`/crm/contacts/${renewal.contactId}`} className="font-semibold text-surface-100 hover:text-brand-400">{fullName(renewal.firstName ?? renewal.contactFirstName, renewal.lastName ?? renewal.contactLastName)}</Link><span className="text-surface-400">{dateLabel(renewal.renewalDate)}</span><span className="text-surface-300">{money(renewal.amount, renewal.currency)}</span><StatusBadge value={renewal.riskLevel} /><select value={renewal.status} disabled={saving} onChange={(event) => patch(`/api/customer-success/renewals/${renewal.id}`, { status: event.target.value }, "Renewal status updated")} className="h-8 rounded-lg border border-surface-700 bg-surface-900 px-2 text-xs text-surface-300"><option value="upcoming">Upcoming</option><option value="in_review">In review</option><option value="renewed">Renewed</option><option value="churned">Churned</option><option value="cancelled">Cancelled</option></select></div>)}</div>}</section>}

      {tab === "playbooks" && <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">{playbooks.length === 0 ? <div className="lg:col-span-2"><EmptyState icon={HeartHandshake} title="No governed playbooks" description="Create a draft, validate its milestones, then publish an immutable version." action={<Button size="sm" onClick={() => open("playbook")}>Create playbook</Button>} /></div> : playbooks.map((playbook) => <div key={playbook.id} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-surface-100">{playbook.name}</h2><StatusBadge value={playbook.status} /></div><p className="mt-1 text-[11px] text-surface-500">{playbook.description || "No description"}</p></div><span className="font-mono text-[10px] text-surface-600">{playbook.activeVersion ? `v${playbook.activeVersion}` : "unpublished"}</span></div><p className="mt-3 text-[11px] text-surface-400">{playbook.definition?.milestones?.length ?? 0} active milestones</p><div className="mt-4 flex gap-2">{!playbook.activeVersionId && <Button size="xs" variant="success" onClick={async () => { const detail = await apiFetch(`/api/customer-success/playbooks/${playbook.id}`); const json = await detail.json(); const draft = json.data?.versions?.find((item: { status: string }) => item.status === "draft"); if (draft) await mutate(`/api/customer-success/playbooks/${playbook.id}/publish`, { versionId: draft.id }, "Playbook published"); }}>Publish draft</Button>}<Button size="xs" variant="outline" icon={RotateCcw} onClick={() => { window.location.href = `/customer-success/playbooks/${playbook.id}`; }}>Version history</Button></div></div>)}</section>}
    </>}

    <Modal open={modal === "playbook"} onClose={() => setModal(null)} title="Create customer success playbook" width="max-w-2xl"><div className="space-y-4 p-5"><Field label="Name"><input className={inputClass} value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Description"><textarea className={textareaClass} rows={2} value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field><div className="grid grid-cols-2 gap-4"><Field label="Objectives" hint="One objective per line"><textarea className={textareaClass} rows={4} value={form.objectives ?? ""} onChange={(event) => setForm({ ...form, objectives: event.target.value })} /></Field><Field label="Success criteria" hint="One criterion per line"><textarea className={textareaClass} rows={4} value={form.criteria ?? ""} onChange={(event) => setForm({ ...form, criteria: event.target.value })} /></Field></div><Field label="Milestones" hint="One per line. Optional due day format: Connect account | 3"><textarea className={textareaClass} rows={6} value={form.milestones ?? ""} onChange={(event) => setForm({ ...form, milestones: event.target.value })} /></Field><Button variant="gradient" loading={saving} onClick={createPlaybook}>Create draft</Button></div></Modal>
    <Modal open={modal === "plan"} onClose={() => setModal(null)} title="Create customer success plan"><div className="space-y-4 p-5"><Field label="Customer"><select className={inputClass} value={form.contactId ?? ""} onChange={(event) => setForm({ ...form, contactId: event.target.value })}><option value="">Select customer</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{fullName(contact.firstName, contact.lastName)} · {contact.email ?? "no email"}</option>)}</select></Field><Field label="Plan name"><input className={inputClass} value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Published playbook"><select className={inputClass} value={form.playbookId ?? ""} onChange={(event) => setForm({ ...form, playbookId: event.target.value })}><option value="">No playbook</option>{publishedPlaybooks.map((playbook) => <option key={playbook.id} value={playbook.id}>{playbook.name} · v{playbook.activeVersion}</option>)}</select></Field><Field label="Target date"><input type="date" className={inputClass} value={form.targetDate ?? ""} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} /></Field><Button variant="gradient" loading={saving} onClick={createPlan}>Create plan</Button></div></Modal>
    <Modal open={modal === "renewal"} onClose={() => setModal(null)} title="Record customer renewal"><div className="space-y-4 p-5"><Field label="Customer"><select className={inputClass} value={form.contactId ?? ""} onChange={(event) => setForm({ ...form, contactId: event.target.value })}><option value="">Select customer</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{fullName(contact.firstName, contact.lastName)} · {contact.email ?? "no email"}</option>)}</select></Field><Field label="Renewal date"><input type="date" className={inputClass} value={form.renewalDate ?? ""} onChange={(event) => setForm({ ...form, renewalDate: event.target.value })} /></Field><div className="grid grid-cols-[1fr_100px] gap-3"><Field label="Amount"><input type="number" min="0" step="0.01" className={inputClass} value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field><Field label="Currency"><input className={inputClass} value={form.currency ?? "USD"} maxLength={3} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></Field></div><Field label="Notes"><textarea className={textareaClass} rows={3} value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><Button variant="gradient" loading={saving} onClick={createRenewal}>Create renewal</Button></div></Modal>
    <Modal open={modal === "health"} onClose={() => setModal(null)} title="Record evidence based health assessment"><div className="space-y-4 p-5"><p className="text-xs text-surface-500">The rules engine uses only available subscription, engagement, support, NPS, and email delivery evidence. It does not predict churn.</p><Field label="Customer"><select className={inputClass} value={form.contactId ?? ""} onChange={(event) => setForm({ ...form, contactId: event.target.value })}><option value="">Select customer</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{fullName(contact.firstName, contact.lastName)} · {contact.email ?? "no email"}</option>)}</select></Field><Button variant="gradient" loading={saving} onClick={recalculateHealth}>Run assessment</Button></div></Modal>
    {toast && <Toast message={toast.message} type={toast.type} />}
  </div></AppLayout>;
}

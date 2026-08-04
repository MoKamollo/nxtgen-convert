"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  Activity, ArrowLeft, Beaker, Clock3, GitBranch,
  Goal, Loader2, Mail, Plus, Save, Send, Square, Trash2, UserRoundCog,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/modules/ModulePrimitives";

type StepType = "create_activity" | "send_email" | "update_contact" | "wait" | "condition" | "experiment" | "goal" | "exit";
type Step = { type: StepType; config: Record<string, unknown> };
type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused" | "archived";
  trigger: { event?: string };
  steps: Step[];
  version: number;
};
type Version = { id: string; version: number; checksum: string; status: string; active: boolean; createdAt: string; publishedAt: string | null };
type Analytics = {
  totals: { enrolled: number; completed: number; exited: number; active: number; failed: number; completionRate: number };
  goals: Array<{ key: string; name: string; enrollments: number; attainmentRate: number }>;
  experiments: Array<{ experimentKey: string; variantId: string; variantName: string; assignments: number }>;
  steps: Array<{ stepIndex: number; stepType: string; status: string; executions: number }>;
  methodology: string;
};

const STEP_OPTIONS: Array<{ type: StepType; label: string; icon: typeof Activity }> = [
  { type: "create_activity", label: "Create activity", icon: Activity },
  { type: "send_email", label: "Send email", icon: Mail },
  { type: "update_contact", label: "Update contact", icon: UserRoundCog },
  { type: "wait", label: "Wait", icon: Clock3 },
  { type: "condition", label: "Condition branch", icon: GitBranch },
  { type: "experiment", label: "Experiment", icon: Beaker },
  { type: "goal", label: "Goal", icon: Goal },
  { type: "exit", label: "Exit", icon: Square },
];

const TRIGGERS = [
  { value: "manual", label: "Manual trigger" },
  { value: "contact.created", label: "Contact created" },
  { value: "deal.stage_changed", label: "Deal stage changed" },
];

const FIELDS: Record<string, string[]> = {
  contact: ["status", "score", "source", "email", "phone", "mobile", "jobTitle", "department", "companyId", "tags", "archivedAt"],
  deal: ["stage", "value", "probability", "currency", "contactId", "companyId", "expectedCloseDate", "wonAt", "lostAt", "tags"],
  enrollment: ["event", "attemptCount", "createdAt"],
};
const OPERATORS = ["equals", "not_equals", "greater_than", "greater_or_equal", "less_than", "less_or_equal", "contains", "not_contains", "exists", "not_exists", "in", "not_in"];

function defaultStep(type: StepType, index: number): Step {
  const terminal = index + 1;
  if (type === "create_activity") return { type, config: { type: "task", subject: "Follow up with customer", body: "" } };
  if (type === "send_email") return { type, config: { purpose: "marketing", subject: "Customer update", body: "" } };
  if (type === "update_contact") return { type, config: { status: "prospect" } };
  if (type === "wait") return { type, config: { amount: 1, unit: "days" } };
  if (type === "condition") return { type, config: { condition: { source: "contact", field: "status", operator: "equals", value: "customer" }, onTrueIndex: terminal, onFalseIndex: terminal } };
  if (type === "experiment") return { type, config: { experimentKey: `experiment-${index + 1}`, variants: [{ id: "a", name: "Variant A", weight: 50, targetIndex: terminal }, { id: "b", name: "Variant B", weight: 50, targetIndex: terminal }] } };
  if (type === "goal") return { type, config: { key: `goal-${index + 1}`, name: "Journey goal", exitOnMatch: false } };
  return { type, config: { exitType: "neutral", reason: "Journey completed by an explicit exit" } };
}

function targetOptions(stepIndex: number, stepCount: number): Array<{ value: number; label: string }> {
  const options: Array<{ value: number; label: string }> = [];
  for (let index = stepIndex + 1; index < stepCount; index++) options.push({ value: index, label: `Step ${index + 1}` });
  options.push({ value: stepCount, label: "End journey" });
  return options;
}

function repairTargets(steps: Step[]): Step[] {
  return steps.map((step, index) => {
    const config = { ...step.config };
    const fallback = Math.min(index + 1, steps.length);
    const repair = (value: unknown) => {
      const target = Number(value);
      return Number.isInteger(target) && target > index && target <= steps.length ? target : fallback;
    };
    if (step.type === "condition") {
      config.onTrueIndex = repair(config.onTrueIndex);
      config.onFalseIndex = repair(config.onFalseIndex);
    }
    if (step.type === "experiment" && Array.isArray(config.variants)) {
      config.variants = config.variants.map((variant) => ({ ...(variant as Record<string, unknown>), targetIndex: repair((variant as Record<string, unknown>).targetIndex) }));
    }
    return { ...step, config };
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-surface-500">{label}</span>{children}</label>;
}

const inputClass = "h-8 w-full rounded-lg border border-surface-700 bg-surface-950 px-2.5 text-xs text-surface-100 outline-none focus:border-brand-500";
const textareaClass = "w-full rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-2 text-xs text-surface-100 outline-none focus:border-brand-500";

function ConditionEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void }) {
  const source = String(value.source ?? "contact");
  const fieldOptions = FIELDS[source] ?? [];
  const operator = String(value.operator ?? "equals");
  return <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
    <Field label="Source"><select className={inputClass} value={source} onChange={(event) => {
      const nextSource = event.target.value;
      onChange({ ...value, source: nextSource, field: FIELDS[nextSource]?.[0] ?? "event" });
    }}><option value="contact">Contact</option><option value="deal">Deal</option><option value="context">Trigger context</option><option value="enrollment">Enrollment</option></select></Field>
    <Field label="Field">{source === "context"
      ? <input className={inputClass} value={String(value.field ?? "")} onChange={(event) => onChange({ ...value, field: event.target.value })} placeholder="source.channel" />
      : <select className={inputClass} value={String(value.field ?? fieldOptions[0] ?? "")} onChange={(event) => onChange({ ...value, field: event.target.value })}>{fieldOptions.map((field) => <option key={field} value={field}>{field}</option>)}</select>}</Field>
    <Field label="Operator"><select className={inputClass} value={operator} onChange={(event) => onChange({ ...value, operator: event.target.value })}>{OPERATORS.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></Field>
    <Field label="Value">{["exists", "not_exists"].includes(operator)
      ? <div className="flex h-8 items-center rounded-lg border border-surface-800 bg-surface-950 px-2.5 text-xs text-surface-600">No value required</div>
      : <input className={inputClass} value={Array.isArray(value.value) ? value.value.join(", ") : String(value.value ?? "")} onChange={(event) => onChange({ ...value, value: ["in", "not_in"].includes(operator) ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean) : event.target.value })} />}</Field>
  </div>;
}

function StepEditor({ step, index, stepCount, onChange, onDelete }: { step: Step; index: number; stepCount: number; onChange: (step: Step) => void; onDelete: () => void }) {
  const option = STEP_OPTIONS.find((item) => item.type === step.type)!;
  const Icon = option.icon;
  const setConfig = (key: string, value: unknown) => onChange({ ...step, config: { ...step.config, [key]: value } });
  const targets = targetOptions(index, stepCount);
  return <div className="relative rounded-xl border border-surface-800 bg-surface-900/70 p-4">
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10 text-brand-400"><Icon size={15} /></div>
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold text-surface-100">Step {index + 1}: {option.label}</p><p className="mt-0.5 text-[10px] text-surface-600">Stored in the immutable workflow definition when published</p></div>
          <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-600 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={13} /></button>
        </div>

        {step.type === "create_activity" && <div className="grid gap-2 md:grid-cols-3"><Field label="Activity type"><select className={inputClass} value={String(step.config.type ?? "task")} onChange={(event) => setConfig("type", event.target.value)}><option value="task">Task</option><option value="note">Note</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email record</option></select></Field><Field label="Subject"><input className={inputClass} value={String(step.config.subject ?? "")} onChange={(event) => setConfig("subject", event.target.value)} /></Field><Field label="Body"><input className={inputClass} value={String(step.config.body ?? "")} onChange={(event) => setConfig("body", event.target.value)} /></Field></div>}

        {step.type === "send_email" && <div className="space-y-2"><div className="grid gap-2 md:grid-cols-2"><Field label="Consent purpose"><select className={inputClass} value={String(step.config.purpose ?? "marketing")} onChange={(event) => setConfig("purpose", event.target.value)}><option value="marketing">Marketing</option><option value="customer_success">Customer success</option><option value="transactional">Transactional</option></select></Field><Field label="Subject"><input className={inputClass} value={String(step.config.subject ?? "")} onChange={(event) => setConfig("subject", event.target.value)} /></Field></div><Field label="Body"><textarea className={textareaClass} rows={4} value={String(step.config.body ?? "")} onChange={(event) => setConfig("body", event.target.value)} /></Field></div>}

        {step.type === "update_contact" && <div className="grid gap-2 md:grid-cols-2"><Field label="Lifecycle status"><select className={inputClass} value={String(step.config.status ?? "")} onChange={(event) => setConfig("status", event.target.value || undefined)}><option value="">Do not change</option>{["lead", "prospect", "customer", "churned", "vip"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Score"><input className={inputClass} type="number" min={0} max={100} value={step.config.score === undefined ? "" : Number(step.config.score)} onChange={(event) => setConfig("score", event.target.value === "" ? undefined : Number(event.target.value))} /></Field></div>}

        {step.type === "wait" && <div className="grid gap-2 md:grid-cols-2"><Field label="Amount"><input className={inputClass} type="number" min={1} max={365} value={Number(step.config.amount ?? 1)} onChange={(event) => setConfig("amount", Number(event.target.value))} /></Field><Field label="Unit"><select className={inputClass} value={String(step.config.unit ?? "days")} onChange={(event) => setConfig("unit", event.target.value)}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></Field></div>}

        {step.type === "condition" && <div className="space-y-3"><ConditionEditor value={(step.config.condition as Record<string, unknown>) ?? {}} onChange={(condition) => setConfig("condition", condition)} /><div className="grid gap-2 md:grid-cols-2"><Field label="True branch"><select className={inputClass} value={Number(step.config.onTrueIndex ?? index + 1)} onChange={(event) => setConfig("onTrueIndex", Number(event.target.value))}>{targets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</select></Field><Field label="False branch"><select className={inputClass} value={Number(step.config.onFalseIndex ?? index + 1)} onChange={(event) => setConfig("onFalseIndex", Number(event.target.value))}>{targets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</select></Field></div></div>}

        {step.type === "experiment" && <div className="space-y-3"><Field label="Experiment key"><input className={inputClass} value={String(step.config.experimentKey ?? "")} onChange={(event) => setConfig("experimentKey", event.target.value)} /></Field><div className="space-y-2">{((step.config.variants as Array<Record<string, unknown>>) ?? []).map((variant, variantIndex, variants) => <div key={String(variant.id)} className="grid grid-cols-2 gap-2 rounded-lg border border-surface-800 bg-surface-950/70 p-2 md:grid-cols-5"><Field label="ID"><input className={inputClass} value={String(variant.id ?? "")} onChange={(event) => setConfig("variants", variants.map((item, itemIndex) => itemIndex === variantIndex ? { ...item, id: event.target.value } : item))} /></Field><Field label="Name"><input className={inputClass} value={String(variant.name ?? "")} onChange={(event) => setConfig("variants", variants.map((item, itemIndex) => itemIndex === variantIndex ? { ...item, name: event.target.value } : item))} /></Field><Field label="Weight"><input className={inputClass} type="number" min={0.01} max={100} step="0.01" value={Number(variant.weight ?? 0)} onChange={(event) => setConfig("variants", variants.map((item, itemIndex) => itemIndex === variantIndex ? { ...item, weight: Number(event.target.value) } : item))} /></Field><div className="md:col-span-2"><Field label="Target"><select className={inputClass} value={Number(variant.targetIndex ?? index + 1)} onChange={(event) => setConfig("variants", variants.map((item, itemIndex) => itemIndex === variantIndex ? { ...item, targetIndex: Number(event.target.value) } : item))}>{targets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</select></Field></div></div>)}</div><div className="text-[10px] text-surface-500">Variant weights must total exactly 100. Assignment is deterministic and persisted once per enrollment.</div></div>}

        {step.type === "goal" && <div className="space-y-3"><div className="grid gap-2 md:grid-cols-2"><Field label="Goal key"><input className={inputClass} value={String(step.config.key ?? "")} onChange={(event) => setConfig("key", event.target.value)} /></Field><Field label="Goal name"><input className={inputClass} value={String(step.config.name ?? "")} onChange={(event) => setConfig("name", event.target.value)} /></Field></div><label className="flex items-center gap-2 text-xs text-surface-300"><input type="checkbox" checked={Boolean(step.config.exitOnMatch)} onChange={(event) => setConfig("exitOnMatch", event.target.checked)} /> Exit successfully when this goal is reached</label><div className="rounded-lg border border-surface-800 bg-surface-950/60 px-3 py-2 text-[10px] text-surface-500">This goal records attainment when the enrollment reaches this step. Conditional goals can be created through the API definition and are validated against the same governed condition model.</div></div>}

        {step.type === "exit" && <div className="grid gap-2 md:grid-cols-3"><Field label="Exit type"><select className={inputClass} value={String(step.config.exitType ?? "neutral")} onChange={(event) => setConfig("exitType", event.target.value)}><option value="success">Success</option><option value="neutral">Neutral</option><option value="disqualified">Disqualified</option></select></Field><div className="md:col-span-2"><Field label="Reason"><input className={inputClass} value={String(step.config.reason ?? "")} onChange={(event) => setConfig("reason", event.target.value)} /></Field></div></div>}
      </div>
    </div>
  </div>;
}

export default function WorkflowBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workflowId = params.id;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addType, setAddType] = useState<StepType>("create_activity");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [workflowResponse, versionsResponse, analyticsResponse] = await Promise.all([
        apiFetch(apiUrl(`/api/workflows/${workflowId}`)),
        apiFetch(apiUrl(`/api/workflows/${workflowId}/versions`)),
        apiFetch(apiUrl(`/api/workflows/${workflowId}/analytics`)),
      ]);
      const [workflowJson, versionsJson, analyticsJson] = await Promise.all([workflowResponse.json(), versionsResponse.json(), analyticsResponse.json()]);
      if (!workflowResponse.ok) throw new Error(workflowJson.error ?? "Workflow could not be loaded");
      setWorkflow({ ...workflowJson.data, steps: workflowJson.data.steps ?? [] });
      setVersions(versionsJson.data ?? []);
      setAnalytics(analyticsJson.data ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Workflow could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const experimentGroups = useMemo(() => {
    const groups: Record<string, Analytics["experiments"]> = {};
    for (const row of analytics?.experiments ?? []) (groups[row.experimentKey] ??= []).push(row);
    return groups;
  }, [analytics]);

  async function saveDraft(): Promise<boolean> {
    if (!workflow) return false;
    setSaving(true); setError("");
    try {
      const response = await apiFetch(apiUrl(`/api/workflows/${workflow.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workflow.name, description: workflow.description, trigger: workflow.trigger, steps: repairTargets(workflow.steps) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Draft could not be saved");
      setWorkflow({ ...json.data, steps: json.data.steps ?? [] });
      setToast(`Draft version ${json.draftVersion ?? "saved"}`);
      await load();
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Draft could not be saved"); return false; }
    finally { setSaving(false); }
  }

  async function publish() {
    const saved = await saveDraft();
    if (!saved) return;
    setSaving(true); setError("");
    try {
      const response = await apiFetch(apiUrl(`/api/workflows/${workflowId}/publish`), { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Workflow could not be published");
      setToast(`Version ${json.data.version} published`);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Workflow could not be published"); }
    finally { setSaving(false); }
  }

  async function rollback(targetVersion: number) {
    setSaving(true); setError("");
    try {
      const response = await apiFetch(apiUrl(`/api/workflows/${workflowId}/rollback`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetVersion }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Rollback failed");
      setToast(`Future enrollments now use version ${json.data.version}`);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Rollback failed"); }
    finally { setSaving(false); }
  }

  if (loading) return <AppLayout><div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="animate-spin text-brand-400" /></div></AppLayout>;
  if (!workflow) return <AppLayout><div className="p-6"><div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{error || "Workflow not found"}</div></div></AppLayout>;

  return <AppLayout>
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3"><button onClick={() => router.push("/automation/workflows")} className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-surface-800 text-surface-500 hover:text-surface-200"><ArrowLeft size={15} /></button><div><div className="flex items-center gap-2"><h1 className="text-xl font-bold text-surface-50">Journey Builder</h1><StatusBadge status={workflow.status} /><Badge variant="purple" size="sm">Version {workflow.version}</Badge></div><p className="mt-1 text-xs text-surface-500">Forward only orchestration with governed branches, experiments, goals, exits, versioning, and rollback.</p></div></div>
        <div className="flex items-center gap-2"><Button variant="outline" size="sm" icon={Save} loading={saving} onClick={saveDraft}>Save Draft</Button><Button variant="gradient" size="sm" icon={Send} loading={saving} onClick={publish}>Publish</Button></div>
      </div>

      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-4"><div className="grid gap-3 md:grid-cols-2"><Field label="Journey name"><input className={inputClass} value={workflow.name} onChange={(event) => setWorkflow({ ...workflow, name: event.target.value })} /></Field><Field label="Trigger"><select className={inputClass} value={workflow.trigger.event ?? "manual"} onChange={(event) => setWorkflow({ ...workflow, trigger: { event: event.target.value } })}>{TRIGGERS.map((trigger) => <option key={trigger.value} value={trigger.value}>{trigger.label}</option>)}</select></Field></div><div className="mt-3"><Field label="Description"><textarea className={textareaClass} rows={2} value={workflow.description ?? ""} onChange={(event) => setWorkflow({ ...workflow, description: event.target.value })} /></Field></div></div>

          <div className="space-y-3">
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-surface-100">Journey flow</h2><p className="text-[10px] text-surface-600">Branches may move forward or end the journey. Backward loops are rejected.</p></div><Badge variant="default" size="sm">{workflow.steps.length} steps</Badge></div>
            {workflow.steps.length === 0 && <div className="rounded-xl border border-dashed border-surface-700 bg-surface-900/30 p-8 text-center text-xs text-surface-500">Add the first operational step. A workflow with no steps may be published, but it only records enrollment completion.</div>}
            {workflow.steps.map((step, index) => <div key={`${index}-${step.type}`} className="relative"><StepEditor step={step} index={index} stepCount={workflow.steps.length} onChange={(next) => setWorkflow({ ...workflow, steps: workflow.steps.map((item, itemIndex) => itemIndex === index ? next : item) })} onDelete={() => setWorkflow({ ...workflow, steps: repairTargets(workflow.steps.filter((_, itemIndex) => itemIndex !== index)) })} />{index < workflow.steps.length - 1 && <div className="mx-auto h-3 w-px bg-surface-700" />}</div>)}
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-surface-700 bg-surface-900/30 p-3"><select className={inputClass} value={addType} onChange={(event) => setAddType(event.target.value as StepType)}>{STEP_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select><Button variant="outline" size="sm" icon={Plus} onClick={() => setWorkflow({ ...workflow, steps: [...workflow.steps, defaultStep(addType, workflow.steps.length)] })}>Add Step</Button></div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-4"><h2 className="text-xs font-semibold text-surface-100">Persisted outcomes</h2><div className="mt-3 grid grid-cols-2 gap-2">{[
            ["Enrolled", analytics?.totals.enrolled ?? 0], ["Completed", analytics?.totals.completed ?? 0], ["Exited", analytics?.totals.exited ?? 0], ["Active", analytics?.totals.active ?? 0], ["Failed", analytics?.totals.failed ?? 0], ["Completion", `${(analytics?.totals.completionRate ?? 0).toFixed(1)}%`],
          ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-surface-800 bg-surface-950 p-2.5"><p className="text-[9px] uppercase text-surface-600">{label}</p><p className="mt-1 text-sm font-bold text-surface-100">{value}</p></div>)}</div><p className="mt-3 text-[10px] leading-relaxed text-surface-600">{analytics?.methodology}</p></div>

          <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-4"><h2 className="flex items-center gap-2 text-xs font-semibold text-surface-100"><Goal size={13} className="text-emerald-400" /> Goal attainment</h2><div className="mt-3 space-y-2">{analytics?.goals.length ? analytics.goals.map((goal) => <div key={goal.key} className="rounded-lg border border-surface-800 bg-surface-950 p-2.5"><div className="flex items-center justify-between gap-3"><span className="text-xs text-surface-200">{goal.name}</span><span className="text-xs font-semibold text-emerald-400">{goal.attainmentRate.toFixed(1)}%</span></div><p className="mt-1 text-[10px] text-surface-600">{goal.enrollments} unique enrollments</p></div>) : <p className="text-[10px] text-surface-600">No goal events recorded.</p>}</div></div>

          <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-4"><h2 className="flex items-center gap-2 text-xs font-semibold text-surface-100"><Beaker size={13} className="text-violet-400" /> Experiment assignments</h2><div className="mt-3 space-y-3">{Object.keys(experimentGroups).length ? Object.entries(experimentGroups).map(([key, rows]) => <div key={key}><p className="mb-1 text-[10px] font-semibold text-surface-400">{key}</p>{rows.map((row) => <div key={row.variantId} className="flex items-center justify-between border-t border-surface-800 py-1.5 text-[10px]"><span className="text-surface-500">{row.variantName}</span><span className="text-surface-200">{row.assignments}</span></div>)}</div>) : <p className="text-[10px] text-surface-600">No assignments recorded.</p>}</div></div>

          <div className="rounded-xl border border-surface-800 bg-surface-900/60 p-4"><h2 className="text-xs font-semibold text-surface-100">Published history</h2><div className="mt-3 space-y-2">{versions.map((version) => <div key={version.id} className="rounded-lg border border-surface-800 bg-surface-950 p-2.5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-xs font-semibold text-surface-200">Version {version.version}</span>{version.active && <Badge variant="success" size="sm">Active</Badge>}</div>{version.status === "published" && !version.active && <button disabled={saving} onClick={() => rollback(version.version)} className="text-[10px] font-semibold text-brand-400 hover:text-brand-300">Rollback</button>}</div><p className="mt-1 font-mono text-[9px] text-surface-700">{version.checksum.slice(0, 14)}…</p></div>)}</div></div>
        </aside>
      </div>
    </div>
    {toast && <Toast message={toast} />}
  </AppLayout>;
}

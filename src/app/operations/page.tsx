"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import {
  ErrorState,
  Field,
  LoadingState,
  Modal,
  ModuleHeader,
  StatGrid,
  inputClass,
  textareaClass,
} from "@/components/modules/ModulePrimitives";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  Gauge,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type HealthResponse = {
  status: string;
  scope: string;
  generatedAt: string;
  queues: { webhooks?: Record<string, number>; workflows?: Record<string, number> };
  integrationFailures?: number;
  connectors?: Array<{ provider: string; status: string; healthStatus: string; lastVerifiedAt?: string | null; lastError?: string | null }>;
  recentErrors?: Array<{ severity: string; component: string; event: string; message: string; occurredAt: string }>;
  capabilities?: Record<string, unknown>;
};

type ValidationEvent = {
  id: string;
  result: "passed" | "failed" | "blocked" | null;
  environment: string;
  summary: string;
  evidenceReference: string | null;
  expiresAt: string | null;
  occurredAt: string;
};

type ValidationControl = {
  key: string;
  category: string;
  title: string;
  description: string;
  required: boolean;
  evidenceGuidance: string;
  status: "passed" | "failed" | "blocked" | "not_validated" | "expired" | "revoked";
  latestEvent: ValidationEvent | null;
};

type ReadinessResponse = {
  status: "ready" | "not_ready";
  scope: "recorded_validation_evidence";
  controls: ValidationControl[];
  requiredPassed: number;
  requiredTotal: number;
  blockers: ValidationControl[];
};

const statusVariant: Record<ValidationControl["status"], "success" | "danger" | "warning" | "ghost"> = {
  passed: "success",
  failed: "danger",
  blocked: "warning",
  expired: "warning",
  revoked: "ghost",
  not_validated: "ghost",
};

const emptyForm = {
  controlKey: "",
  result: "passed" as "passed" | "failed" | "blocked",
  environment: "staging",
  summary: "",
  evidenceReference: "",
  expiresAt: "",
};

function totalQueueItems(queue: Record<string, number> | undefined): number {
  return Object.values(queue ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

export default function OperationsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [healthResponse, readinessResponse] = await Promise.all([
        apiFetch(apiUrl("/api/operations/health"), { cache: "no-store" }),
        apiFetch(apiUrl("/api/operations/readiness"), { cache: "no-store" }),
      ]);
      const [healthJson, readinessJson] = await Promise.all([healthResponse.json(), readinessResponse.json()]);
      if (!healthResponse.ok) throw new Error(healthJson.error ?? "Operational health could not be loaded");
      if (!readinessResponse.ok) throw new Error(readinessJson.error ?? "Release readiness could not be loaded");
      setHealth(healthJson);
      setReadiness(readinessJson.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Operations could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      if (active) await load();
    }
    void initialLoad();
    return () => { active = false; };
  }, [load]);

  const deadLetters = useMemo(() => {
    if (!health) return 0;
    return Number(health.queues?.webhooks?.dead_letter ?? 0) + Number(health.queues?.workflows?.dead_letter ?? 0);
  }, [health]);

  async function recordEvidence() {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl("/api/operations/readiness"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          expiresAt: form.expiresAt || null,
          evidence: {},
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Evidence could not be recorded");
      setReadiness(json.readiness);
      setForm(emptyForm);
      setModalOpen(false);
      setMessage("Validation evidence recorded");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Evidence could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  async function revokeEvidence(control: ValidationControl) {
    if (!control.latestEvent || control.latestEvent.result === null) return;
    const summary = window.prompt("Why is this evidence no longer valid?");
    if (!summary || summary.trim().length < 10) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl(`/api/operations/readiness/${control.latestEvent.id}/revoke`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          environment: control.latestEvent.environment,
          summary,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Evidence could not be revoked");
      setMessage("Validation evidence revoked");
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Evidence could not be revoked");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <ModuleHeader
          title="Operations & Release Readiness"
          description="Recorded runtime signals and evidence-backed release gates. No status is inferred from missing external validation."
          action={<Button variant="outline" icon={RefreshCw} loading={loading} onClick={load}>Refresh</Button>}
        />

        {error && <ErrorState message={error} retry={load} />}
        {message && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">{message}</div>}

        {loading || !health || !readiness ? <LoadingState /> : <>
          <StatGrid stats={[
            { label: "Release gate", value: readiness.status === "ready" ? "Ready" : "Not ready", icon: ShieldCheck, tone: readiness.status === "ready" ? "green" : "amber", hint: "Recorded validation evidence only" },
            { label: "Required controls", value: `${readiness.requiredPassed}/${readiness.requiredTotal}`, icon: CheckCircle2, tone: "brand", hint: "Passed and non-expired" },
            { label: "Queue attention", value: totalQueueItems(health.queues?.webhooks) + totalQueueItems(health.queues?.workflows), icon: ServerCog, tone: deadLetters > 0 ? "red" : "green", hint: `${deadLetters} dead-letter item(s)` },
            { label: "Integration failures", value: Number(health.integrationFailures ?? 0), icon: AlertTriangle, tone: Number(health.integrationFailures ?? 0) > 0 ? "red" : "green", hint: "Recorded in the last 24 hours" },
          ]} />

          <section className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-surface-100">Release validation controls</h2>
                <p className="mt-1 text-xs text-surface-500">A control passes only when an administrator records concrete evidence. Evidence can expire or be revoked without deleting history.</p>
              </div>
              <Button variant="primary" icon={Database} onClick={() => setModalOpen(true)}>Record evidence</Button>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {readiness.controls.map((control) => (
                <article key={control.key} className="rounded-xl border border-surface-800 bg-surface-950/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-surface-100">{control.title}</h3>
                        <Badge variant={statusVariant[control.status]} size="sm" dot>{control.status.replaceAll("_", " ")}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-surface-500">{control.description}</p>
                    </div>
                    <span className="rounded-md bg-surface-800 px-2 py-1 font-mono text-[9px] text-surface-500">{control.category}</span>
                  </div>
                  <div className="mt-3 rounded-lg border border-surface-800 bg-surface-900/50 p-3">
                    {control.latestEvent ? <>
                      <p className="text-xs text-surface-300">{control.latestEvent.summary}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-surface-600">
                        <span>{control.latestEvent.environment}</span>
                        <span>{new Date(control.latestEvent.occurredAt).toLocaleString()}</span>
                        {control.latestEvent.expiresAt && <span>Expires {new Date(control.latestEvent.expiresAt).toLocaleDateString()}</span>}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        {control.latestEvent.evidenceReference ? <a href={control.latestEvent.evidenceReference} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300"><ExternalLink size={11} />Evidence reference</a> : <span />}
                        {control.latestEvent.result && <Button size="xs" variant="ghost" icon={RotateCcw} disabled={saving} onClick={() => revokeEvidence(control)}>Revoke</Button>}
                      </div>
                    </> : <p className="text-xs text-surface-600">No evidence recorded. Guidance: {control.evidenceGuidance}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
              <div className="mb-3 flex items-center gap-2"><Gauge size={16} className="text-brand-400" /><h2 className="text-sm font-semibold text-surface-100">Runtime signals</h2></div>
              <p className="text-xs text-surface-500">Scope: {health.scope.replaceAll("_", " ")}. Generated {new Date(health.generatedAt).toLocaleString()}.</p>
              <div className="mt-4 space-y-2">
                {(health.connectors ?? []).length === 0 ? <p className="text-xs text-surface-600">No connector records exist.</p> : health.connectors?.map((connector) => <div key={connector.provider} className="flex items-center justify-between rounded-lg border border-surface-800 bg-surface-950/50 px-3 py-2"><div><p className="text-xs font-medium text-surface-200">{connector.provider}</p><p className="text-[10px] text-surface-600">{connector.lastError || "No recorded connector error"}</p></div><Badge variant={connector.healthStatus === "healthy" ? "success" : connector.healthStatus === "error" ? "danger" : "warning"} size="sm">{connector.healthStatus}</Badge></div>)}
              </div>
            </div>
            <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-5">
              <div className="mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-400" /><h2 className="text-sm font-semibold text-surface-100">Recent recorded errors</h2></div>
              <div className="space-y-2">
                {(health.recentErrors ?? []).length === 0 ? <p className="text-xs text-surface-600">No critical or error events were recorded in this tenant window.</p> : health.recentErrors?.map((event, index) => <div key={`${event.occurredAt}-${index}`} className="rounded-lg border border-red-500/10 bg-red-500/5 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase text-red-400">{event.component} · {event.event}</span><span className="text-[10px] text-surface-600">{new Date(event.occurredAt).toLocaleString()}</span></div><p className="mt-1 text-xs text-surface-400">{event.message}</p></div>)}
              </div>
            </div>
          </section>
        </>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record release-validation evidence" width="max-w-2xl">
        <div className="space-y-4 p-5">
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">Record only completed validation. This form does not perform the test and cannot verify the referenced external system.</p>
          <Field label="Control">
            <select className={inputClass} value={form.controlKey} onChange={(event) => setForm((current) => ({ ...current, controlKey: event.target.value }))}>
              <option value="">Select a control</option>
              {readiness?.controls.map((control) => <option key={control.key} value={control.key}>{control.title}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Result"><select className={inputClass} value={form.result} onChange={(event) => setForm((current) => ({ ...current, result: event.target.value as typeof current.result }))}><option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked</option></select></Field>
            <Field label="Environment"><input className={inputClass} value={form.environment} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))} placeholder="staging, production-copy, provider-test" /></Field>
          </div>
          <Field label="Concrete evidence summary"><textarea className={textareaClass} rows={5} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} placeholder="What was tested, with which role/data/provider, and what was the exact result?" /></Field>
          <Field label="Evidence reference" hint="A governed ticket, report, artifact, or internal evidence URL."><input type="url" className={inputClass} value={form.evidenceReference} onChange={(event) => setForm((current) => ({ ...current, evidenceReference: event.target.value }))} placeholder="https://..." /></Field>
          <Field label="Expiry (optional)" hint="Use for evidence that must be repeated periodically."><input type="datetime-local" className={inputClass} value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" icon={ShieldCheck} loading={saving} onClick={recordEvidence}>Record evidence</Button></div>
        </div>
      </Modal>
    </AppLayout>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, GitBranch, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { ErrorState, Field, LoadingState, ModuleHeader, StatusBadge, Toast, textareaClass } from "@/components/modules/ModulePrimitives";
import { apiFetch } from "@/lib/org";

type Definition = { objectives: string[]; successCriteria: string[]; milestones: Array<{ title: string; description?: string | null; dueDays?: number | null; ownerRole?: string | null }> };
type Version = { id: string; version: number; definition: Definition; checksum: string; status: string; createdAt: string; publishedAt: string | null; active: boolean };
type Playbook = { id: string; name: string; description: string | null; status: string; activeVersionId: string | null; versions: Version[] };

function textDefinition(definition: Definition | undefined) {
  return {
    objectives: (definition?.objectives ?? []).join("\n"),
    criteria: (definition?.successCriteria ?? []).join("\n"),
    milestones: (definition?.milestones ?? []).map((item) => `${item.title}${item.dueDays === null || item.dueDays === undefined ? "" : ` | ${item.dueDays}`}`).join("\n"),
  };
}

export default function CustomerSuccessPlaybookPage() {
  const params = useParams<{ id: string }>();
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [form, setForm] = useState({ objectives: "", criteria: "", milestones: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type?: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await apiFetch(`/api/customer-success/playbooks/${params.id}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Playbook could not be loaded");
      setPlaybook(json.data);
      const latest = json.data.versions?.[0]?.definition as Definition | undefined;
      setForm(textDefinition(latest));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Playbook could not be loaded"); }
    finally { setLoading(false); }
  }, [params.id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const latestDraft = useMemo(() => playbook?.versions.find((item) => item.status === "draft") ?? null, [playbook]);

  async function action(path: string, body: Record<string, unknown>, message: string, method = "POST") {
    setSaving(true);
    try {
      const response = await apiFetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Action failed");
      setToast({ message }); await load();
    } catch (caught) { setToast({ message: caught instanceof Error ? caught.message : "Action failed", type: "error" }); }
    finally { setSaving(false); }
  }

  async function createDraft() {
    const milestones = form.milestones.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [title, due] = line.split("|").map((part) => part.trim());
      return { title, dueDays: due ? Number(due) : null };
    });
    await action(`/api/customer-success/playbooks/${params.id}`, { definition: { objectives: form.objectives.split("\n").map((item) => item.trim()).filter(Boolean), successCriteria: form.criteria.split("\n").map((item) => item.trim()).filter(Boolean), milestones } }, "New immutable draft version created", "PATCH");
  }

  return <AppLayout><div className="space-y-5 p-6">
    <Link href="/customer-success" className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-100"><ArrowLeft size={14} /> Back to Customer Success</Link>
    {loading ? <LoadingState /> : error || !playbook ? <ErrorState message={error || "Playbook not found"} retry={load} /> : <>
      <ModuleHeader title={playbook.name} description={playbook.description || "Versioned Customer Success playbook"} action={<div className="flex gap-2"><StatusBadge value={playbook.status} />{latestDraft && <Button variant="success" size="sm" icon={ShieldCheck} loading={saving} onClick={() => action(`/api/customer-success/playbooks/${playbook.id}/publish`, { versionId: latestDraft.id }, `Version ${latestDraft.version} published`)}>Publish latest draft</Button>}</div>} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-surface-800 bg-surface-900/50 p-5"><div className="mb-4 flex items-center gap-2"><Plus size={15} className="text-brand-400" /><div><h2 className="text-sm font-semibold text-surface-100">Create next draft</h2><p className="text-[11px] text-surface-500">Existing versions remain immutable.</p></div></div><div className="space-y-4"><Field label="Objectives" hint="One objective per line"><textarea className={textareaClass} rows={4} value={form.objectives} onChange={(event) => setForm({ ...form, objectives: event.target.value })} /></Field><Field label="Success criteria" hint="One criterion per line"><textarea className={textareaClass} rows={4} value={form.criteria} onChange={(event) => setForm({ ...form, criteria: event.target.value })} /></Field><Field label="Milestones" hint="One per line. Optional format: Milestone title | days from plan start"><textarea className={textareaClass} rows={7} value={form.milestones} onChange={(event) => setForm({ ...form, milestones: event.target.value })} /></Field><Button variant="gradient" icon={GitBranch} loading={saving} onClick={createDraft}>Create draft version</Button></div></section>
        <section className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50"><div className="border-b border-surface-800 px-4 py-3"><h2 className="text-sm font-semibold text-surface-100">Version history</h2><p className="text-[11px] text-surface-500">Published releases can be activated without altering historical plans.</p></div><div className="divide-y divide-surface-800">{playbook.versions.map((version) => <div key={version.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-surface-100">Version {version.version}</span><StatusBadge value={version.status} />{version.active && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 size={11} />Active</span>}</div><div className="mt-2 flex gap-3 text-[10px] text-surface-600"><span className="inline-flex items-center gap-1"><Clock3 size={11} />Created {new Date(version.createdAt).toLocaleString()}</span><span>{version.definition.milestones.length} milestones</span><span className="font-mono">{version.checksum.slice(0, 12)}</span></div></div>{version.status === "published" && !version.active && <Button size="xs" variant="outline" icon={RotateCcw} loading={saving} onClick={() => action(`/api/customer-success/playbooks/${playbook.id}/rollback`, { versionId: version.id }, `Version ${version.version} activated`)}>Activate</Button>}{version.status === "draft" && <Button size="xs" variant="success" loading={saving} onClick={() => action(`/api/customer-success/playbooks/${playbook.id}/publish`, { versionId: version.id }, `Version ${version.version} published`)}>Publish</Button>}</div><div className="mt-3 rounded-lg bg-surface-950/60 p-3"><p className="text-[10px] uppercase tracking-wider text-surface-600">Milestones</p><div className="mt-2 space-y-1.5">{version.definition.milestones.map((milestone, index) => <div key={`${version.id}-${index}`} className="flex items-center justify-between text-[11px]"><span className="text-surface-300">{index + 1}. {milestone.title}</span><span className="text-surface-600">{milestone.dueDays === null || milestone.dueDays === undefined ? "No due offset" : `Day ${milestone.dueDays}`}</span></div>)}</div></div></div>)}</div></section>
      </div>
    </>}
    {toast && <Toast message={toast.message} type={toast.type} />}
  </div></AppLayout>;
}

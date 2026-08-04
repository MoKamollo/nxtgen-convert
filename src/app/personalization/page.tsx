"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiFetch, apiUrl } from "@/lib/org";
import { Beaker, Filter, Loader2, Plus, Send, SlidersHorizontal, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal, Toast } from "@/components/modules/ModulePrimitives";

type Segment = { id: string; name: string; description: string | null; status: string; memberCount: number; version: number; definition: { combinator: string; conditions: Array<Record<string, unknown>> } };
type Experience = { id: string; key: string; name: string; description: string | null; channel: string; segmentId: string | null; status: string; version: number; definition: { variants: Array<Record<string, unknown>>; fallback: Record<string, unknown> } };

const inputClass = "h-9 w-full rounded-lg border border-surface-700 bg-surface-950 px-3 text-xs text-surface-100 outline-none focus:border-brand-500";
const textareaClass = "w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-surface-100 outline-none focus:border-brand-500";

export default function PersonalizationPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [segmentModal, setSegmentModal] = useState(false);
  const [experienceModal, setExperienceModal] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [segmentForm, setSegmentForm] = useState({ name: "", description: "", field: "status", operator: "equals", value: "customer" });
  const [experienceForm, setExperienceForm] = useState({ key: "", name: "", description: "", channel: "offer", segmentId: "", variantAName: "Control", variantAPayload: "{}", variantBName: "Personalized", variantBPayload: "{}" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [segmentsResponse, experiencesResponse] = await Promise.all([apiFetch(apiUrl("/api/segments")), apiFetch(apiUrl("/api/personalization"))]);
      const [segmentsJson, experiencesJson] = await Promise.all([segmentsResponse.json(), experiencesResponse.json()]);
      setSegments(segmentsJson.data ?? []); setExperiences(experiencesJson.data ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function createSegment() {
    setSaving(true); setError("");
    try {
      const value = ["in", "not_in"].includes(segmentForm.operator) ? segmentForm.value.split(",").map((item) => item.trim()).filter(Boolean) : segmentForm.value;
      const response = await apiFetch(apiUrl("/api/segments"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: segmentForm.name, description: segmentForm.description, definition: { combinator: "and", conditions: [{ field: segmentForm.field, operator: segmentForm.operator, value }] } }) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error ?? "Segment could not be created");
      setSegmentModal(false); setSegmentForm({ name: "", description: "", field: "status", operator: "equals", value: "customer" }); setToast("Segment draft created"); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Segment could not be created"); }
    finally { setSaving(false); }
  }

  async function createExperience() {
    setSaving(true); setError("");
    try {
      let payloadA: Record<string, unknown>; let payloadB: Record<string, unknown>;
      try { payloadA = JSON.parse(experienceForm.variantAPayload); payloadB = JSON.parse(experienceForm.variantBPayload); } catch { throw new Error("Variant payloads must be valid JSON objects"); }
      const response = await apiFetch(apiUrl("/api/personalization"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: experienceForm.key, name: experienceForm.name, description: experienceForm.description, channel: experienceForm.channel, segmentId: experienceForm.segmentId || null, definition: { fallback: {}, variants: [{ id: "control", name: experienceForm.variantAName, weight: 50, payload: payloadA }, { id: "personalized", name: experienceForm.variantBName, weight: 50, payload: payloadB }] } }) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error ?? "Experience could not be created");
      setExperienceModal(false); setExperienceForm({ key: "", name: "", description: "", channel: "offer", segmentId: "", variantAName: "Control", variantAPayload: "{}", variantBName: "Personalized", variantBPayload: "{}" }); setToast("Personalization draft created"); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Experience could not be created"); }
    finally { setSaving(false); }
  }

  async function publish(kind: "segments" | "personalization", id: string) {
    setSaving(true); setError("");
    try { const response = await apiFetch(apiUrl(`/api/${kind}/${id}/publish`), { method: "POST" }); const json = await response.json(); if (!response.ok) throw new Error(json.error ?? "Publish failed"); setToast(`Version ${json.data.version} published`); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Publish failed"); }
    finally { setSaving(false); }
  }

  return <AppLayout><div className="space-y-6 p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h1 className="text-xl font-bold text-surface-50">Audience & Personalization</h1><Badge variant="purple" size="sm">Governed decisioning</Badge></div><p className="mt-1 text-xs text-surface-500">Publish exact customer audiences and deterministic experiences. External channels consume decisions through the scoped API.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" icon={Filter} onClick={() => setSegmentModal(true)}>New Segment</Button><Button variant="gradient" size="sm" icon={Plus} onClick={() => setExperienceModal(true)}>New Experience</Button></div></div>
    {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
    {loading ? <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-brand-400" /></div> : <div className="grid gap-6 xl:grid-cols-2">
      <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-surface-100">Customer segments</h2><p className="text-[10px] text-surface-600">Counts are evaluated from current persisted contact data.</p></div><Badge variant="default" size="sm">{segments.length}</Badge></div><div className="space-y-3">{segments.length ? segments.map((segment) => <div key={segment.id} className="rounded-xl border border-surface-800 bg-surface-900/60 p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400"><Users size={15} /></div><div><div className="flex items-center gap-2"><p className="text-xs font-semibold text-surface-100">{segment.name}</p><StatusBadge status={segment.status} /></div><p className="mt-1 text-[10px] text-surface-500">{segment.description || `${segment.definition.conditions.length} governed conditions`}</p></div></div><div className="text-right"><p className="text-lg font-bold text-surface-100">{segment.memberCount}</p><p className="text-[9px] text-surface-600">current members</p></div></div><div className="mt-3 flex items-center justify-between border-t border-surface-800 pt-3"><span className="text-[10px] text-surface-600">Version {segment.version}</span>{segment.status !== "archived" && <Button variant="ghost" size="sm" icon={Send} loading={saving} onClick={() => publish("segments", segment.id)}>Publish</Button>}</div></div>) : <div className="rounded-xl border border-dashed border-surface-700 p-8 text-center text-xs text-surface-500">No customer segments.</div>}</div></section>
      <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-surface-100">Personalization experiences</h2><p className="text-[10px] text-surface-600">A published decision API, not a simulated channel connection.</p></div><Badge variant="default" size="sm">{experiences.length}</Badge></div><div className="space-y-3">{experiences.length ? experiences.map((experience) => <div key={experience.id} className="rounded-xl border border-surface-800 bg-surface-900/60 p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400"><Beaker size={15} /></div><div><div className="flex items-center gap-2"><p className="text-xs font-semibold text-surface-100">{experience.name}</p><StatusBadge status={experience.status} /></div><p className="mt-1 font-mono text-[10px] text-surface-600">{experience.key}</p></div></div><Badge variant="purple" size="sm">{experience.channel}</Badge></div><div className="mt-3 flex items-center justify-between border-t border-surface-800 pt-3"><span className="text-[10px] text-surface-600">{experience.definition.variants?.length ?? 0} variants · Version {experience.version}</span>{experience.status !== "archived" && <Button variant="ghost" size="sm" icon={Send} loading={saving} onClick={() => publish("personalization", experience.id)}>Publish</Button>}</div></div>) : <div className="rounded-xl border border-dashed border-surface-700 p-8 text-center text-xs text-surface-500">No personalization experiences.</div>}</div></section>
    </div>}

    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><div className="flex gap-3"><SlidersHorizontal size={16} className="mt-0.5 text-amber-400" /><div><p className="text-xs font-semibold text-amber-300">Connector boundary</p><p className="mt-1 text-[11px] leading-relaxed text-surface-400">Website, email, offer, and journey clients must call the decision API with a scoped API key and render the returned payload. This package does not claim that any external site or messaging provider is connected until its connector is installed and verified.</p></div></div></div>

    <Modal open={segmentModal} onClose={() => setSegmentModal(false)} title="Create customer segment"><div className="space-y-3 p-5"><input className={inputClass} placeholder="Segment name" value={segmentForm.name} onChange={(event) => setSegmentForm({ ...segmentForm, name: event.target.value })} /><textarea className={textareaClass} rows={2} placeholder="Description" value={segmentForm.description} onChange={(event) => setSegmentForm({ ...segmentForm, description: event.target.value })} /><div className="grid grid-cols-3 gap-2"><select className={inputClass} value={segmentForm.field} onChange={(event) => setSegmentForm({ ...segmentForm, field: event.target.value })}>{["status", "score", "source", "email", "phone", "jobTitle", "department", "companyId", "tags", "createdAt", "lastContactedAt"].map((field) => <option key={field} value={field}>{field}</option>)}</select><select className={inputClass} value={segmentForm.operator} onChange={(event) => setSegmentForm({ ...segmentForm, operator: event.target.value })}>{["equals", "not_equals", "contains", "not_contains", "greater_than", "greater_or_equal", "less_than", "less_or_equal", "exists", "not_exists", "in", "not_in"].map((operator) => <option key={operator} value={operator}>{operator.replaceAll("_", " ")}</option>)}</select><input className={inputClass} value={segmentForm.value} onChange={(event) => setSegmentForm({ ...segmentForm, value: event.target.value })} /></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSegmentModal(false)}>Cancel</Button><Button variant="gradient" loading={saving} onClick={createSegment}>Create Draft</Button></div></div></Modal>
    <Modal open={experienceModal} onClose={() => setExperienceModal(false)} title="Create personalization experience" width="max-w-2xl"><div className="space-y-3 p-5"><div className="grid grid-cols-2 gap-2"><input className={inputClass} placeholder="experience.key" value={experienceForm.key} onChange={(event) => setExperienceForm({ ...experienceForm, key: event.target.value.toLowerCase() })} /><input className={inputClass} placeholder="Experience name" value={experienceForm.name} onChange={(event) => setExperienceForm({ ...experienceForm, name: event.target.value })} /></div><textarea className={textareaClass} rows={2} placeholder="Description" value={experienceForm.description} onChange={(event) => setExperienceForm({ ...experienceForm, description: event.target.value })} /><div className="grid grid-cols-2 gap-2"><select className={inputClass} value={experienceForm.channel} onChange={(event) => setExperienceForm({ ...experienceForm, channel: event.target.value })}><option value="offer">Offer</option><option value="website">Website</option><option value="email">Email</option><option value="journey">Journey</option></select><select className={inputClass} value={experienceForm.segmentId} onChange={(event) => setExperienceForm({ ...experienceForm, segmentId: event.target.value })}><option value="">All contacts or anonymous subjects</option>{segments.filter((segment) => segment.status === "active").map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-surface-800 p-3"><input className={inputClass} value={experienceForm.variantAName} onChange={(event) => setExperienceForm({ ...experienceForm, variantAName: event.target.value })} /><textarea className={`${textareaClass} mt-2 font-mono`} rows={5} value={experienceForm.variantAPayload} onChange={(event) => setExperienceForm({ ...experienceForm, variantAPayload: event.target.value })} /></div><div className="rounded-lg border border-surface-800 p-3"><input className={inputClass} value={experienceForm.variantBName} onChange={(event) => setExperienceForm({ ...experienceForm, variantBName: event.target.value })} /><textarea className={`${textareaClass} mt-2 font-mono`} rows={5} value={experienceForm.variantBPayload} onChange={(event) => setExperienceForm({ ...experienceForm, variantBPayload: event.target.value })} /></div></div><p className="text-[10px] text-surface-600">The initial release uses a governed 50/50 allocation. Advanced weighting can be updated through the versioned API.</p><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setExperienceModal(false)}>Cancel</Button><Button variant="gradient" loading={saving} onClick={createExperience}>Create Draft</Button></div></div></Modal>
    {toast && <Toast message={toast} />}
  </div></AppLayout>;
}

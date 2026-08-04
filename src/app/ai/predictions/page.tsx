"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, FilterTabs, LoadingState, ModuleHeader, SearchField, StatGrid, StatusBadge } from "@/components/modules/ModulePrimitives";
import { apiFetch, apiUrl } from "@/lib/org";
import { AlertTriangle, ArrowRight, CircleDollarSign, ListChecks, Target, TrendingUp, UserRoundCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Contact = { id: string; firstName: string | null; lastName: string | null; email: string | null; score: number | null; status: string | null; daysSinceContact?: number | null; reasonCodes?: string[] };
type Deal = { id: string; name: string; value: string | null; currency: string | null; stage: string | null; expectedCloseDate: string | null; configuredProbability: number | null; reasonCodes?: string[] };
type Data = { retentionAttention: Contact[]; qualifiedLeadSignals: Contact[]; closingWindow: Deal[]; expansionCandidates: Contact[] };
const money = (value: string | null, currency: string | null = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(Number(value || 0));

export default function CustomerSignalsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl("/api/ai/predictions"));
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setData(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load customer signals");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const sections = useMemo(() => data ? [
    { key: "retention", title: "Retention Attention", description: "Customers matching low score and inactivity rules", icon: AlertTriangle, rows: data.retentionAttention, action: "Open contact", href: "/crm/contacts" },
    { key: "qualified", title: "Qualified Lead Signals", description: "Leads matching the configured score and contactability rules", icon: Target, rows: data.qualifiedLeadSignals, action: "Start deal", href: "/crm/deals" },
    { key: "closing", title: "Closing Window", description: "Open deals with an expected close date within 30 days", icon: CircleDollarSign, rows: data.closingWindow, action: "Schedule follow-up", href: "/crm/calendar" },
    { key: "expansion", title: "Expansion Candidates", description: "Customers matching the score rule without an open deal", icon: TrendingUp, rows: data.expansionCandidates, action: "Create expansion deal", href: "/crm/deals" },
  ] : [], [data]);
  const visible = sections.filter((section) => tab === "all" || section.key === tab);

  return <AppLayout><div className="space-y-5 p-6">
    <ModuleHeader title="Customer Signals" description="Explainable rule matches from current CRM records. No predictive model is used." action={<Button variant="outline" onClick={load}>Refresh analysis</Button>} />
    {error && <ErrorState message={error} retry={load} />}
    {loading || !data ? <LoadingState /> : <>
      <StatGrid stats={[
        { label: "Retention Attention", value: data.retentionAttention.length, icon: AlertTriangle, tone: "red" },
        { label: "Qualified Leads", value: data.qualifiedLeadSignals.length, icon: Target },
        { label: "Closing Window", value: data.closingWindow.length, icon: CircleDollarSign, tone: "green" },
        { label: "Expansion Candidates", value: data.expansionCandidates.length, icon: UserRoundCheck, tone: "violet" },
      ]} />
      <div className="flex items-center justify-between gap-3">
        <FilterTabs value={tab} onChange={setTab} options={[{ value: "all", label: "All" }, { value: "retention", label: "Retention" }, { value: "qualified", label: "Qualified" }, { value: "closing", label: "Closing" }, { value: "expansion", label: "Expansion" }]} />
        <SearchField value={search} onChange={setSearch} placeholder="Search signals..." />
      </div>
      <div className="grid grid-cols-2 gap-4">{visible.map((section) => {
        const rows = section.rows.filter((row: Contact | Deal) => `${"firstName" in row ? row.firstName || "" : ""} ${"lastName" in row ? row.lastName || "" : ""} ${"name" in row ? row.name || "" : ""} ${"email" in row ? row.email || "" : ""}`.toLowerCase().includes(search.toLowerCase()));
        const Icon = section.icon;
        return <section key={section.key} className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50">
          <div className="flex items-center gap-3 border-b border-surface-800 px-4 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400"><Icon size={17} /></div><div><h2 className="text-sm font-semibold text-surface-100">{section.title}</h2><p className="text-[11px] text-surface-500">{section.description}</p></div><span className="ml-auto rounded-full bg-surface-800 px-2 py-1 text-[10px] text-surface-400">{rows.length}</span></div>
          {rows.length === 0 ? <div className="p-4"><EmptyState icon={ListChecks} title="No matching records" description="Current records do not match this rule set." /></div> : <div className="divide-y divide-surface-800">{rows.slice(0, 8).map((row: Contact | Deal) => <div key={row.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-surface-100">{"name" in row ? row.name : `${row.firstName || ""} ${row.lastName || ""}`.trim() || row.email}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-surface-500">{"stage" in row && row.stage && <StatusBadge value={row.stage} />} {"score" in row && <span>Configured score {row.score ?? 0}</span>}{"daysSinceContact" in row && row.daysSinceContact !== undefined && <span>{row.daysSinceContact === null ? "Never contacted" : `${row.daysSinceContact} days inactive`}</span>}{"value" in row && row.value && <span>{money(row.value, row.currency)}</span>}{"configuredProbability" in row && row.configuredProbability !== null && <span>Owner probability {row.configuredProbability}%</span>}</div></div><Button size="xs" variant="ghost" iconRight={ArrowRight} onClick={() => { window.location.href = `${section.href}?selected=${row.id}`; }}>{section.action}</Button></div>)}</div>}
        </section>;
      })}</div>
    </>}
  </div></AppLayout>;
}

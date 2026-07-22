"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Plus, Search, Building2, Globe, Users, X, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

type Company = {
  id: string; name: string; domain: string | null; industry: string | null;
  size: string | null; website: string | null; phone: string | null;
  revenue: number; contactCount: number; tags: string[];
};

const INDUSTRY_OPTIONS = ["Technology","SaaS","E-commerce","Healthcare","Finance","Marketing","Education","Real Estate","Other"];
const SIZE_OPTIONS = ["1-10","11-50","51-200","201-500","500+"];

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", domain:"", industry:"", size:"", website:"", phone:"" });

  const load = () => {
    setLoading(true);
    fetch("/api/companies").then(r => r.json())
      .then(j => { setCompanies(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = companies.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.domain ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowModal(false);
    setForm({ name:"", domain:"", industry:"", size:"", website:"", phone:"" });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this company?")) return;
    await fetch(`/api/companies/${id}`, { method: "DELETE" });
    setCompanies(prev => prev.filter(c => c.id !== id));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Companies</h1>
            <p className="text-sm text-surface-500 mt-0.5">{companies.length} {companies.length === 1 ? "company" : "companies"}</p>
          </div>
          <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>Add Company</Button>
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
          <input type="text" placeholder="Search companies…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-sm text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-surface-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-xl border border-surface-800 bg-surface-900/50">
            <Building2 size={32} className="text-surface-600" />
            <p className="text-sm font-medium text-surface-400">{search ? "No companies match your search" : "No companies yet"}</p>
            {!search && <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>Add your first company</Button>}
          </div>
        ) : (
          <div className="rounded-xl border border-surface-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-800 bg-surface-900/60">
                  {["Company","Industry","Size","Contacts","Website",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800/60">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-surface-800/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-800 text-surface-400">
                          <Building2 size={14} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-surface-100">{c.name}</p>
                          {c.domain && <p className="text-xs text-surface-500">{c.domain}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-400">{c.industry ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-surface-400">{c.size ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-surface-400">
                        <Users size={12} />{c.contactCount}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.website
                        ? <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand-400 hover:underline"><Globe size={12} />Visit</a>
                        : <span className="text-xs text-surface-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(c.id)} className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:underline transition-opacity">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
              <h2 className="text-sm font-bold text-surface-100">Add Company</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Company name *</label>
                <input required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="Acme Corp"
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Domain</label>
                  <input value={form.domain} onChange={e => setForm(p => ({...p, domain: e.target.value}))} placeholder="acme.com"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="+1 555 000 0000"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Industry</label>
                  <select value={form.industry} onChange={e => setForm(p => ({...p, industry: e.target.value}))}
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                    <option value="">Select…</option>
                    {INDUSTRY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Size</label>
                  <select value={form.size} onChange={e => setForm(p => ({...p, size: e.target.value}))}
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                    <option value="">Select…</option>
                    {SIZE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Website</label>
                <input value={form.website} onChange={e => setForm(p => ({...p, website: e.target.value}))} placeholder="https://acme.com"
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-9 px-4 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="h-9 px-4 rounded-lg bg-gradient-to-r from-brand-500 to-blue-500 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {saving ? "Saving…" : "Add Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

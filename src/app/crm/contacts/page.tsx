"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Input, Select } from "@/components/ui/Input";
import { formatCurrency, timeAgo, cn } from "@/lib/utils";
import { apiUrl } from "@/lib/org";
import {
  Search,
  Plus,
  Filter,
  Download,
  Upload,
  MoreHorizontal,
  Mail,
  Phone,
  Star,
  ChevronDown,
  SlidersHorizontal,
  Grid3X3,
  List,
  Users,
  Tag,
  Building2,
  TrendingUp,
  RefreshCcw,
  ArrowUpDown,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { X, Loader2 } from "lucide-react";

type Contact = {
  id: string; firstName: string; lastName: string; email: string; phone: string;
  status: string; company: string; jobTitle: string; score: number; tags: string[];
  source: string; lastContactedAt: string | null; revenue: number;
};

const filterOptions = [
  { value: "all", label: "All Contacts" },
  { value: "lead", label: "Leads" },
  { value: "prospect", label: "Prospects" },
  { value: "customer", label: "Customers" },
  { value: "vip", label: "VIP" },
  { value: "churned", label: "Churned" },
];

export default function ContactsPage() {
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("score");
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName:"", lastName:"", email:"", phone:"", status:"lead", jobTitle:"", source:"" });

  const load = useCallback(() => {
    setLoading(true);
    fetch(apiUrl("/api/contacts"))
      .then((r) => r.json())
      .then((j) => { setAllContacts(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim()) return;
    setSaving(true);
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowModal(false);
    setForm({ firstName:"", lastName:"", email:"", phone:"", status:"lead", jobTitle:"", source:"" });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    setAllContacts(prev => prev.filter(c => c.id !== id));
  };

  const filtered = allContacts.filter((c) => {
    const matchesSearch =
      !search ||
      `${c.firstName} ${c.lastName} ${c.email} ${c.company}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  };

  const toggleAll = () => {
    if (selected.length === filtered.length) {
      setSelected([]);
    } else {
      setSelected(filtered.map((c) => c.id));
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">
              Contacts
            </h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {allContacts.length.toLocaleString()} total contacts · {allContacts.filter(c => c.status === "customer").length} customers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={Upload}>
              Import
            </Button>
            <Button variant="outline" size="sm" icon={Download}>
              Export
            </Button>
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>
              Add Contact
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Total", value: allContacts.length, color: "text-surface-200" },
            { label: "Leads", value: allContacts.filter(c => c.status === "lead").length, color: "text-surface-400" },
            { label: "Prospects", value: allContacts.filter(c => c.status === "prospect").length, color: "text-blue-400" },
            { label: "Customers", value: allContacts.filter(c => c.status === "customer").length, color: "text-emerald-400" },
            { label: "VIP", value: allContacts.filter(c => c.status === "vip").length, color: "text-violet-400" },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={() => setStatusFilter(stat.label.toLowerCase() === "total" ? "all" : stat.label.toLowerCase())}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                statusFilter === (stat.label.toLowerCase() === "total" ? "all" : stat.label.toLowerCase())
                  ? "border-brand-500/40 bg-brand-500/10"
                  : "border-surface-800 bg-surface-900/50 hover:border-surface-700"
              )}
            >
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-surface-500 mt-0.5">{stat.label}</p>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <button className="flex items-center gap-1.5 h-8 rounded-lg border border-surface-700 bg-surface-900 px-3 text-xs text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-all">
            <Filter size={13} />
            Filters
            <ChevronDown size={12} />
          </button>

          <button className="flex items-center gap-1.5 h-8 rounded-lg border border-surface-700 bg-surface-900 px-3 text-xs text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-all">
            <Tag size={13} />
            Tags
          </button>

          <div className="flex-1" />

          {selected.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-400">
                {selected.length} selected
              </span>
              <Button variant="outline" size="sm">
                Tag
              </Button>
              <Button variant="outline" size="sm">
                Assign
              </Button>
              <Button variant="danger" size="sm">
                Delete
              </Button>
            </div>
          )}

          <div className="flex items-center rounded-lg border border-surface-700 bg-surface-900 p-0.5">
            <button
              onClick={() => setView("table")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-sm transition-all",
                view === "table"
                  ? "bg-surface-700 text-surface-100"
                  : "text-surface-500 hover:text-surface-300"
              )}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-sm transition-all",
                view === "grid"
                  ? "bg-surface-700 text-surface-100"
                  : "text-surface-500 hover:text-surface-300"
              )}
            >
              <Grid3X3 size={14} />
            </button>
          </div>
        </div>

        {/* Table */}
        {view === "table" && (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-800">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.length === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-surface-600 bg-surface-800 accent-brand-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Last Contact
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                      Tags
                    </th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/60">
                  {filtered.map((contact) => (
                    <tr
                      key={contact.id}
                      className={cn(
                        "group transition-colors cursor-pointer",
                        selected.includes(contact.id)
                          ? "bg-brand-500/5"
                          : "hover:bg-surface-800/30"
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                          className="h-3.5 w-3.5 rounded border-surface-600 bg-surface-800 accent-brand-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={`${contact.firstName} ${contact.lastName}`}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-surface-100 truncate">
                              {contact.firstName} {contact.lastName}
                            </p>
                            <p className="text-[11px] text-surface-500 truncate">
                              {contact.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={contact.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={12} className="text-surface-600" />
                          <span className="text-xs text-surface-300">
                            {contact.company}
                          </span>
                        </div>
                        <p className="text-[11px] text-surface-600 mt-0.5">
                          {contact.jobTitle}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-surface-800">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                contact.score >= 85 ? "bg-emerald-500" :
                                contact.score >= 70 ? "bg-brand-500" :
                                contact.score >= 50 ? "bg-amber-500" : "bg-red-500"
                              )}
                              style={{ width: `${contact.score}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-surface-200">
                            {contact.score}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-surface-400">
                          {contact.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-xs font-semibold",
                          contact.revenue > 0 ? "text-emerald-400" : "text-surface-500"
                        )}>
                          {contact.revenue > 0 ? formatCurrency(contact.revenue) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-surface-500">
                          {contact.lastContactedAt
                            ? timeAgo(contact.lastContactedAt)
                            : "Never"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {contact.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="flex h-6 w-6 items-center justify-center rounded-md text-surface-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all">
                            <Mail size={12} />
                          </button>
                          <button className="flex h-6 w-6 items-center justify-center rounded-md text-surface-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">
                            <Phone size={12} />
                          </button>
                          <button onClick={() => handleDelete(contact.id)} className="flex h-6 w-6 items-center justify-center rounded-md text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users size={40} className="text-surface-700 mb-3" />
                <p className="text-sm font-semibold text-surface-300">No contacts found</p>
                <p className="text-xs text-surface-500 mt-1">
                  Try adjusting your search or filters
                </p>
                <Button variant="outline" size="sm" className="mt-4" icon={Plus}>
                  Add Contact
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-surface-800 px-4 py-3">
              <span className="text-xs text-surface-500">
                {loading ? "Loading..." : `Showing ${filtered.length} of ${allContacts.length} contacts`}
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, "...", 8].map((page, i) => (
                  <button
                    key={i}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md text-xs transition-all",
                      page === 1
                        ? "bg-brand-500 text-white"
                        : "text-surface-500 hover:text-surface-300 hover:bg-surface-800"
                    )}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Grid view */}
        {view === "grid" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((contact) => (
              <Card key={contact.id} hover className="cursor-pointer group">
                <div className="flex flex-col items-center text-center">
                  <Avatar
                    name={`${contact.firstName} ${contact.lastName}`}
                    size="xl"
                    className="mb-3"
                  />
                  <p className="text-sm font-semibold text-surface-100">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5 truncate w-full">
                    {contact.jobTitle} · {contact.company}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={contact.status} />
                  </div>
                  <div className="mt-3 w-full">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-surface-500">AI Score</span>
                      <span className="font-semibold text-surface-200">
                        {contact.score}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-surface-800">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          contact.score >= 85 ? "bg-emerald-500" :
                          contact.score >= 70 ? "bg-brand-500" : "bg-amber-500"
                        )}
                        style={{ width: `${contact.score}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs text-surface-300 transition-colors">
                      <Mail size={11} /> Email
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs text-surface-300 transition-colors">
                      <Phone size={11} /> Call
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
              <h2 className="text-sm font-bold text-surface-100">Add Contact</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">First name *</label>
                  <input required value={form.firstName} onChange={e => setForm(p => ({...p, firstName: e.target.value}))} placeholder="Jane"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Last name</label>
                  <input value={form.lastName} onChange={e => setForm(p => ({...p, lastName: e.target.value}))} placeholder="Doe"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-400 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} placeholder="jane@example.com"
                  className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} placeholder="+1 555 000 0000"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Job title</label>
                  <input value={form.jobTitle} onChange={e => setForm(p => ({...p, jobTitle: e.target.value}))} placeholder="VP of Sales"
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                    <option value="lead">Lead</option>
                    <option value="prospect">Prospect</option>
                    <option value="customer">Customer</option>
                    <option value="vip">VIP</option>
                    <option value="churned">Churned</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-400 mb-1.5">Source</label>
                  <select value={form.source} onChange={e => setForm(p => ({...p, source: e.target.value}))}
                    className="w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                    <option value="">Select…</option>
                    <option value="organic">Organic</option>
                    <option value="referral">Referral</option>
                    <option value="paid_ads">Paid Ads</option>
                    <option value="cold_outreach">Cold Outreach</option>
                    <option value="event">Event</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-9 px-4 rounded-lg border border-surface-700 text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="h-9 px-4 rounded-lg bg-gradient-to-r from-brand-500 to-blue-500 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {saving ? "Saving…" : "Add Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

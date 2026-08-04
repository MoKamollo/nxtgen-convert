"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/org";
import {
  Plus, Search, ShoppingBag, DollarSign, Package,
  RefreshCcw, Trash2, Loader2, X, ToggleLeft, ToggleRight,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type Product = {
  id: string; name: string; description: string | null;
  price: string; currency: string; type: string;
  recurring: boolean; interval: string | null;
  isActive: boolean; createdAt: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", price: "", type: "digital",
    recurring: false, interval: "month",
  });

  const load = useCallback(() => {
    apiFetch(apiUrl("/api/products"))
      .then(r => r.json())
      .then(j => { setProducts(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeProducts  = products.filter(p => p.isActive).length;
  const recurringProds  = products.filter(p => p.recurring && p.isActive).length;
  const totalProductMRR = products.filter(p => p.recurring && p.isActive)
    .reduce((s, p) => s + parseFloat(p.price ?? "0"), 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    const res = await apiFetch(apiUrl("/api/products"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(), description: form.description,
        price: form.price, type: form.type,
        recurring: form.recurring,
        interval: form.recurring ? form.interval : null,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      setProducts(prev => [j.data, ...prev]);
    }
    setForm({ name: "", description: "", price: "", type: "digital", recurring: false, interval: "month" });
    setShowModal(false);
    setSaving(false);
  }

  async function toggleActive(p: Product) {
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
    await apiFetch(apiUrl(`/api/products/${p.id}`), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
  }

  async function handleDelete(id: string) {
    setProducts(prev => prev.filter(p => p.id !== id));
    await apiFetch(apiUrl(`/api/products/${id}`), { method: "DELETE" });
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-50 tracking-tight">Products & Pricing</h1>
            <p className="text-sm text-surface-500 mt-0.5">
              {activeProducts} active product{activeProducts !== 1 ? "s" : ""}
              {recurringProds > 0 ? ` · ${recurringProds} subscription plan${recurringProds !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowModal(true)}>Add Product</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active Products",  value: activeProducts,                  icon: Package,    color: "text-brand-400",    bg: "bg-brand-500/10" },
            { label: "Subscription MRR", value: formatCurrency(totalProductMRR), icon: DollarSign, color: "text-emerald-400",  bg: "bg-emerald-500/10" },
            { label: "Recurring Plans",  value: recurringProds,                  icon: RefreshCcw, color: "text-violet-400",   bg: "bg-violet-500/10" },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-xl border border-surface-800 bg-surface-900/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${stat.bg}`}>
                    <Icon size={14} className={stat.color} />
                  </div>
                  <span className="text-xs text-surface-500">{stat.label}</span>
                </div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                {stat.label === "Subscription MRR" && totalProductMRR === 0 && (
                  <p className="text-[10px] text-surface-600 mt-0.5">Activate recurring products to track</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
          <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-8 rounded-lg border border-surface-700 bg-surface-900 pl-9 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
        </div>

        {/* Product List */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-surface-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-12 flex flex-col items-center justify-center gap-3 text-center">
            <ShoppingBag size={32} className="text-surface-600" />
            <p className="text-sm font-semibold text-surface-300">
              {products.length === 0 ? "No products yet" : "No products match your search"}
            </p>
            <p className="text-xs text-surface-500">
              {products.length === 0 ? "Add your first product or pricing plan" : "Try a different search term"}
            </p>
            {products.length === 0 && (
              <Button variant="outline" size="sm" icon={Plus} onClick={() => setShowModal(true)}>Add Product</Button>
            )}
          </div>
        ) : (
          <Card padding="none">
            <div className="divide-y divide-surface-800/60">
              {filtered.map(p => (
                <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-800/30 transition-colors group">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", p.isActive ? "bg-emerald-500/15" : "bg-surface-800")}>
                    {p.recurring ? <RefreshCcw size={16} className={p.isActive ? "text-emerald-400" : "text-surface-500"} /> : <Package size={16} className={p.isActive ? "text-emerald-400" : "text-surface-500"} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-surface-100">{p.name}</p>
                      {p.recurring && (
                        <Badge variant="purple" size="sm">Recurring · {p.interval ?? "month"}</Badge>
                      )}
                      {!p.isActive && <Badge variant="ghost" size="sm">Inactive</Badge>}
                    </div>
                    {p.description && (
                      <p className="text-xs text-surface-500 truncate mt-0.5">{p.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-surface-100">{formatCurrency(parseFloat(p.price))}</p>
                    <p className="text-xs text-surface-500">{p.recurring ? `/ ${p.interval ?? "month"}` : "one-time"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleActive(p)} title={p.isActive ? "Deactivate" : "Activate"}
                      className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-all", p.isActive ? "text-emerald-400 hover:bg-emerald-500/10" : "text-surface-500 hover:bg-surface-800")}>
                      {p.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Add Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-surface-800">
              <h2 className="text-sm font-semibold text-surface-100">Add Product</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-surface-400">Product Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  placeholder="e.g. Professional Plan"
                  className="mt-1 w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-400">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Product description..." rows={2}
                  className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-surface-400">Price *</label>
                  <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required
                    type="number" step="0.01" min="0" placeholder="0.00"
                    className="mt-1 w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-surface-400">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-700 bg-surface-800 px-3 text-sm text-surface-100 focus:outline-none focus:border-brand-500">
                    <option value="digital">Digital</option>
                    <option value="physical">Physical</option>
                    <option value="service">Service</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))}
                    className="rounded border-surface-600" />
                  <span className="text-xs text-surface-400">Recurring subscription</span>
                </label>
                {form.recurring && (
                  <select value={form.interval} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}
                    className="h-8 rounded-lg border border-surface-700 bg-surface-800 px-2 text-xs text-surface-100 focus:outline-none focus:border-brand-500">
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                    <option value="week">Weekly</option>
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" variant="gradient" size="sm" loading={saving}>Add Product</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

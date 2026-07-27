"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { apiUrl } from "@/lib/org";
import { formatCurrency } from "@/lib/utils";
import { ConfirmAction, EmptyState, ErrorState, Field, FilterTabs, inputClass, LoadingState, Modal, ModuleHeader, SearchField, StatGrid, StatusBadge, textareaClass, Toast } from "@/components/modules/ModulePrimitives";
import { CalendarDays, DollarSign, Eye, PackageCheck, Plus, ReceiptText, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type OrderItem = { productId?: string; name: string; quantity: number; price: number };
type Order = { id: string; orderNumber: string; contactId: string | null; contactFirstName: string | null; contactLastName: string | null; contactEmail: string | null; status: string; subtotal: string; tax: string; discount: string; total: string; currency: string; items: OrderItem[]; paymentMethod: string | null; paymentStatus: string; notes: string | null; createdAt: string };
type Contact = { id: string; firstName: string; lastName: string | null; email: string | null };
type Product = { id: string; name: string; price: string };

const emptyForm = { contactId: "", status: "pending", paymentMethod: "card", paymentStatus: "pending", tax: "0", discount: "0", notes: "", items: [{ productId: "", name: "", quantity: 1, price: 0 }] as OrderItem[] };

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async (nextPage = 1, append = false) => {
    setError(""); if (!append) setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/orders", { page: String(nextPage), limit: "25", status, q: search }));
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to load orders");
      setOrders(current => append ? [...current, ...(json.data ?? [])] : (json.data ?? []));
      setHasMore(Boolean(json.hasMore)); setTotal(Number(json.total ?? 0)); setPage(nextPage);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load orders"); }
    finally { setLoading(false); }
  }, [search, status]);

  useEffect(() => { const id = window.setTimeout(() => load(1), 200); return () => window.clearTimeout(id); }, [load]);
  useEffect(() => { Promise.all([fetch(apiUrl("/api/contacts", { limit: "200" })).then(r => r.json()), fetch(apiUrl("/api/products")).then(r => r.json())]).then(([c, p]) => { setContacts(c.data ?? []); setProducts(p.data ?? []); }).catch(() => {}); }, []);

  const displayed = useMemo(() => [...orders].sort((a, b) => sort === "oldest" ? +new Date(a.createdAt) - +new Date(b.createdAt) : sort === "highest" ? Number(b.total) - Number(a.total) : sort === "lowest" ? Number(a.total) - Number(b.total) : +new Date(b.createdAt) - +new Date(a.createdAt)), [orders, sort]);
  const month = new Date().toISOString().slice(0, 7);
  const revenueThisMonth = orders.filter(order => order.createdAt.slice(0, 7) === month && order.status === "completed").reduce((sum, order) => sum + Number(order.total), 0);
  const avgValue = orders.length ? orders.reduce((sum, order) => sum + Number(order.total), 0) / orders.length : 0;
  const subtotal = form.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const grandTotal = Math.max(0, subtotal + Number(form.tax || 0) - Number(form.discount || 0));

  function updateItem(index: number, patch: Partial<OrderItem>) { setForm(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })); }
  function selectProduct(index: number, productId: string) { const product = products.find(item => item.id === productId); updateItem(index, { productId, name: product?.name ?? "", price: Number(product?.price ?? 0) }); }

  async function createOrder(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(apiUrl("/api/orders"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error ?? "Failed to create order");
      setShowCreate(false); setForm(emptyForm); setToast("Order created"); await load(1);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create order"); }
    finally { setSaving(false); }
  }

  async function updateStatus(order: Order, nextStatus: string) {
    const previous = order.status; setOrders(current => current.map(item => item.id === order.id ? { ...item, status: nextStatus } : item));
    const response = await fetch(apiUrl(`/api/orders/${order.id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
    if (!response.ok) setOrders(current => current.map(item => item.id === order.id ? { ...item, status: previous } : item)); else setToast("Order updated");
  }

  async function remove(id: string) { const previous = orders; setOrders(current => current.filter(order => order.id !== id)); const response = await fetch(apiUrl(`/api/orders/${id}`), { method: "DELETE" }); if (!response.ok) setOrders(previous); else setToast("Order deleted"); }

  return <AppLayout><div className="space-y-5 p-6 animate-fade-in">
    <ModuleHeader title="Orders" description={`Showing ${orders.length} of ${total} orders`} action={<Button variant="gradient" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>New Order</Button>} />
    <StatGrid stats={[
      { label: "Total Orders", value: total, icon: ShoppingCart },
      { label: "Revenue This Month", value: formatCurrency(revenueThisMonth), icon: DollarSign, tone: "green" },
      { label: "Average Order Value", value: formatCurrency(avgValue), icon: ReceiptText, tone: "violet" },
      { label: "Pending Orders", value: orders.filter(order => order.status === "pending").length, icon: CalendarDays, tone: "amber" },
    ]} />
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><SearchField value={search} onChange={setSearch} placeholder="Search order or contact..." /><FilterTabs value={status} onChange={setStatus} options={["all", "pending", "completed", "refunded", "cancelled"].map(value => ({ value, label: value === "all" ? "All" : value[0].toUpperCase() + value.slice(1) }))} /></div><select value={sort} onChange={e => setSort(e.target.value)} className={inputClass + " w-40"}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest value</option><option value="lowest">Lowest value</option></select></div>
    {error && <ErrorState message={error} retry={() => load(1)} />}
    {loading ? <LoadingState /> : displayed.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders found" description="Create an order to start tracking revenue and fulfillment." action={<Button variant="outline" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>Create Order</Button>} /> : <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900/50"><div className="max-h-[560px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 z-10 bg-surface-900"><tr className="border-b border-surface-800 text-[10px] uppercase tracking-wider text-surface-500">{["Order", "Contact", "Date", "Items", "Total", "Payment", "Status", "Actions"].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-surface-800/60">{displayed.map(order => <tr key={order.id} className="hover:bg-surface-800/30"><td className="px-4 py-3 font-semibold text-surface-100">{order.orderNumber}</td><td className="px-4 py-3"><p className="text-surface-200">{[order.contactFirstName, order.contactLastName].filter(Boolean).join(" ") || "Unknown"}</p><p className="text-[10px] text-surface-500">{order.contactEmail}</p></td><td className="px-4 py-3 text-surface-400">{new Date(order.createdAt).toLocaleDateString()}</td><td className="px-4 py-3 text-surface-300">{Array.isArray(order.items) ? order.items.length : 0}</td><td className="px-4 py-3 font-semibold text-surface-100">{formatCurrency(Number(order.total))}</td><td className="px-4 py-3"><StatusBadge value={order.paymentStatus} /></td><td className="px-4 py-3"><select value={order.status} onChange={e => updateStatus(order, e.target.value)} className="rounded-md border border-surface-700 bg-surface-800 px-2 py-1 text-[11px] text-surface-200"><option value="pending">Pending</option><option value="completed">Completed</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option></select></td><td className="px-4 py-3"><div className="flex items-center gap-1"><button onClick={() => setSelected(order)} className="rounded-md p-1.5 text-surface-500 hover:bg-surface-700 hover:text-surface-200"><Eye size={13} /></button><ConfirmAction onConfirm={() => remove(order.id)} /></div></td></tr>)}</tbody></table></div>{hasMore && <div className="border-t border-surface-800 p-3 text-center"><Button variant="outline" size="sm" onClick={() => load(page + 1, true)}>Load More</Button></div>}</div>}
  </div>

  <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Order" width="max-w-2xl"><form onSubmit={createOrder} className="space-y-5 p-5">
    <div className="grid grid-cols-2 gap-4"><Field label="Contact"><select required value={form.contactId} onChange={e => setForm(current => ({ ...current, contactId: e.target.value }))} className={inputClass}><option value="">Select contact</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} {contact.email ? `(${contact.email})` : ""}</option>)}</select></Field><Field label="Status"><select value={form.status} onChange={e => setForm(current => ({ ...current, status: e.target.value }))} className={inputClass}><option value="pending">Pending</option><option value="completed">Completed</option></select></Field></div>
    <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-surface-300">Line Items</p><Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => setForm(current => ({ ...current, items: [...current.items, { productId: "", name: "", quantity: 1, price: 0 }] }))}>Add Item</Button></div>{form.items.map((item, index) => <div key={index} className="grid grid-cols-[1fr_90px_120px_40px] gap-2"><select value={item.productId ?? ""} onChange={e => selectProduct(index, e.target.value)} className={inputClass}><option value="">Custom item</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input type="number" min="1" value={item.quantity} onChange={e => updateItem(index, { quantity: Number(e.target.value) })} className={inputClass} /><input type="number" min="0" step="0.01" value={item.price} onChange={e => updateItem(index, { price: Number(e.target.value) })} className={inputClass} /><button type="button" onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} disabled={form.items.length === 1} className="text-surface-500 hover:text-red-400 disabled:opacity-30">×</button>{!item.productId && <input value={item.name} onChange={e => updateItem(index, { name: e.target.value })} placeholder="Custom item name" className={inputClass + " col-span-3"} />}</div>)}</div>
    <div className="grid grid-cols-3 gap-4"><Field label="Payment Method"><select value={form.paymentMethod} onChange={e => setForm(current => ({ ...current, paymentMethod: e.target.value }))} className={inputClass}><option value="card">Card</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="stripe">Stripe</option></select></Field><Field label="Tax"><input type="number" min="0" step="0.01" value={form.tax} onChange={e => setForm(current => ({ ...current, tax: e.target.value }))} className={inputClass} /></Field><Field label="Discount"><input type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm(current => ({ ...current, discount: e.target.value }))} className={inputClass} /></Field></div>
    <Field label="Notes"><textarea rows={2} value={form.notes} onChange={e => setForm(current => ({ ...current, notes: e.target.value }))} className={textareaClass} /></Field>
    <div className="flex items-center justify-between rounded-xl border border-surface-700 bg-surface-800/50 p-4"><span className="text-sm text-surface-400">Order total</span><span className="text-xl font-bold text-emerald-400">{formatCurrency(grandTotal)}</span></div>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button><Button type="submit" variant="gradient" loading={saving}>Create Order</Button></div>
  </form></Modal>

  <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.orderNumber ?? "Order Details"}><div className="space-y-4 p-5">{selected && <><div className="grid grid-cols-2 gap-3"><div><p className="text-[10px] uppercase text-surface-500">Customer</p><p className="text-sm text-surface-100">{selected.contactFirstName} {selected.contactLastName}</p><p className="text-xs text-surface-500">{selected.contactEmail}</p></div><div><p className="text-[10px] uppercase text-surface-500">Status</p><div className="mt-1"><StatusBadge value={selected.status} /></div></div></div><div className="space-y-2 rounded-xl border border-surface-800 p-3">{(selected.items ?? []).map((item, index) => <div key={index} className="flex justify-between text-xs"><span className="text-surface-300">{item.quantity} × {item.name}</span><span className="text-surface-100">{formatCurrency(item.quantity * item.price)}</span></div>)}</div><div className="flex justify-between border-t border-surface-800 pt-3"><span className="text-sm text-surface-400">Total</span><span className="text-lg font-bold text-surface-100">{formatCurrency(Number(selected.total))}</span></div>{selected.notes && <p className="rounded-lg bg-surface-800 p-3 text-xs text-surface-400">{selected.notes}</p>}</>}</div></Modal>
  {toast && <Toast message={toast} />}
  </AppLayout>;
}

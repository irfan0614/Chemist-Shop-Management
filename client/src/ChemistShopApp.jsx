import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Package, Receipt, History, Settings as SettingsIcon,
  Search, Plus, Trash2, X, Printer, RefreshCw, AlertTriangle,
} from "lucide-react";

// Point this at your Node.js API (see the /server project — works with local Postgres or Supabase).
// Set VITE_API_BASE in a .env file to override for production/deployed backends.
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} failed (${r.status})`);
  return r.json();
}
async function apiSend(method, path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let msg = `${method} ${path} failed (${r.status})`;
    try { const err = await r.json(); if (err.error) msg = err.error; } catch (e) { }
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d - today) / 86400000);
}
function expiryStatus(dateStr) {
  const days = daysUntil(dateStr);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "ok";
}
function fmtMoney(n) { return "₹" + Number(n || 0).toFixed(2); }
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Badge({ tone, children }) {
  const tones = {
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    alert: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, tone }) {
  const toneClass = tone === "alert" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{label}</div>
      <div className={`font-mono text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function Sidebar({ view, setView, shopName }) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "inventory", label: "Inventory", icon: Package },
    { key: "billing", label: "Billing", icon: Receipt },
    { key: "history", label: "Sales History", icon: History },
    { key: "settings", label: "Settings", icon: SettingsIcon },
  ];
  return (
    <div className="w-56 shrink-0 bg-emerald-900 text-emerald-50 flex flex-col py-5 print:hidden">
      <div className="flex items-center gap-2.5 px-5 pb-4 mb-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
          <Plus className="w-4 h-4 text-emerald-800" strokeWidth={3} />
        </div>
        <div>
          <div className="font-semibold text-sm leading-tight">{shopName || "Chemist Shop"}</div>
          <div className="text-[10px] text-emerald-300 uppercase tracking-wide">Shop Manager</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-2.5">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${view === key ? "bg-emerald-50 text-emerald-900 font-semibold" : "text-emerald-100 hover:bg-white/10"
              }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto px-5 pt-3 border-t border-white/10 text-[11px] text-emerald-300">
        Connected to your Postgres database via the API.
      </div>
    </div>
  );
}

function ConnectionError({ message, onRetry }) {
  return (
    <div className="max-w-lg mx-auto py-16 px-6">
      <div className="flex items-center gap-2 text-red-600 mb-2">
        <AlertTriangle className="w-5 h-5" />
        <h2 className="text-lg font-bold text-slate-900">Can't reach the database server</h2>
      </div>
      <p className="text-slate-500 text-sm mb-2">{message}</p>
      <p className="text-slate-500 text-xs mb-4">
        Make sure the Node.js API is running (<code className="font-mono">npm start</code> in the <code className="font-mono">server</code> folder)
        and that <code className="font-mono">API_BASE</code> at the top of this file points to it. Currently set to: <code className="font-mono">{API_BASE}</code>
      </p>
      <button onClick={onRetry} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800">
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );
}

function MedicineModal({ medicine, lowStockDefault, onClose, onSave }) {
  const isNew = medicine === "new";
  const base = isNew ? null : medicine;
  const [form, setForm] = useState({
    name: base?.name || "", generic: base?.generic || "", batch: base?.batch || "",
    expiry: base?.expiry || "", qty: base?.qty ?? 0, purchasePrice: base?.purchasePrice ?? "",
    sellingPrice: base?.sellingPrice ?? "", gst: base?.gst ?? 12, rack: base?.rack || "",
    lowStockThreshold: base?.lowStockThreshold ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.expiry || form.qty === "" || form.sellingPrice === "") {
      setError("Please fill in medicine name, expiry date, quantity, and MRP.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(), generic: form.generic.trim(), batch: form.batch.trim(), expiry: form.expiry,
      qty: Math.max(0, parseInt(form.qty) || 0),
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      gst: parseFloat(form.gst) || 0,
      rack: form.rack.trim(),
      lowStockThreshold: form.lowStockThreshold !== "" ? parseInt(form.lowStockThreshold) : null,
    };
    try {
      await onSave(isNew ? null : base.id, payload);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };


  const inputCls = "w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600";

  return (
    <div className="fixed inset-0 bg-emerald-950/40 flex items-start justify-center p-8 overflow-auto z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{isNew ? "Add Medicine" : "Edit Medicine"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Medicine name *"><input className={inputCls} value={form.name} onChange={set("name")} placeholder="Paracetamol 500mg" /></Field>
          <Field label="Generic name"><input className={inputCls} value={form.generic} onChange={set("generic")} placeholder="Acetaminophen" /></Field>
          <Field label="Batch no."><input className={inputCls} value={form.batch} onChange={set("batch")} placeholder="B4471" /></Field>
          <Field label="Expiry date *"><input type="date" className={inputCls} value={form.expiry} onChange={set("expiry")} /></Field>
          <Field label="Quantity in stock *"><input type="number" min="0" className={inputCls} value={form.qty} onChange={set("qty")} /></Field>
          <Field label={`Low stock alert below (default ${lowStockDefault})`}><input type="number" min="0" className={inputCls} value={form.lowStockThreshold} onChange={set("lowStockThreshold")} /></Field>
          <Field label="Purchase price (₹)"><input type="number" min="0" step="0.01" className={inputCls} value={form.purchasePrice} onChange={set("purchasePrice")} /></Field>
          <Field label="MRP / Selling price (₹) *"><input type="number" min="0" step="0.01" className={inputCls} value={form.sellingPrice} onChange={set("sellingPrice")} /></Field>
          <Field label="GST %"><input type="number" min="0" step="0.5" className={inputCls} value={form.gst} onChange={set("gst")} /></Field>
          <Field label="Rack / shelf"><input className={inputCls} value={form.rack} onChange={set("rack")} placeholder="A3" /></Field>
        </div>
        {error && <div className="text-red-600 text-xs mt-3">{error}</div>}
        <div className="flex gap-2 mt-5">
          <button disabled={saving} onClick={handleSave} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">
            {saving ? "Saving…" : isNew ? "Add Medicine" : "Save Changes"}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ medicines, bills, setView }) {
  const lowStock = medicines.filter((m) => Number(m.qty) <= Number(m.lowStockThreshold ?? 10));
  const expiring = medicines.filter((m) => expiryStatus(m.expiry) === "expiring");
  const expired = medicines.filter((m) => expiryStatus(m.expiry) === "expired");
  const today = todayStr();
  const todaysBills = bills.filter((b) => b.date === today);
  const todaysTotal = todaysBills.reduce((s, b) => s + Number(b.total || 0), 0);
  const flagged = medicines.filter((m) => lowStock.includes(m) || expiring.includes(m) || expired.includes(m));

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <div className="text-sm text-slate-500 mt-0.5">Snapshot for {fmtDate(today)}</div>
        </div>
        <button onClick={() => setView("billing")} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800">+ New Bill</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <StatCard label="Today's Sales" value={fmtMoney(todaysTotal)} tone="ok" />
        <StatCard label="Bills Today" value={todaysBills.length} />
        <StatCard label="Low Stock Items" value={lowStock.length} tone={lowStock.length ? "warn" : undefined} />
        <StatCard label="Expiring / Expired" value={expiring.length + expired.length} tone={expired.length ? "alert" : expiring.length ? "warn" : undefined} />
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-bold text-sm text-slate-900 mb-3">Needs attention</h3>
        {medicines.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-5">No medicines in inventory yet. Add your first item from the Inventory tab.</div>
        ) : flagged.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-5">All good — no low stock or expiry issues right now.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 font-semibold border-b border-slate-200">
                <th className="py-2">Medicine</th><th>Batch</th><th>Expiry</th><th className="text-right">Qty</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{m.name}</td>
                  <td className="font-mono">{m.batch || "—"}</td>
                  <td className="font-mono">{fmtDate(m.expiry)}</td>
                  <td className="text-right font-mono">{m.qty}</td>
                  <td className="space-x-1">
                    {expired.includes(m) && <Badge tone="alert">Expired</Badge>}
                    {!expired.includes(m) && expiring.includes(m) && <Badge tone="warn">Expiring soon</Badge>}
                    {lowStock.includes(m) && <Badge tone="warn">Low stock</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Inventory({ medicines, settings, onAdd, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [modalMed, setModalMed] = useState(null); // null | 'new' | medicine object

  const q = search.trim().toLowerCase();
  let list = [...medicines].sort((a, b) => a.name.localeCompare(b.name));
  if (q) list = list.filter((m) => m.name.toLowerCase().includes(q) || (m.batch || "").toLowerCase().includes(q));

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <div className="text-sm text-slate-500 mt-0.5">{medicines.length} medicine{medicines.length === 1 ? "" : "s"} on record</div>
        </div>
        <button onClick={() => setModalMed("new")} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Medicine
        </button>
      </div>

      <div className="relative max-w-xs mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" placeholder="Search by name or batch…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
        {list.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-6">{medicines.length === 0 ? 'No medicines yet. Click "Add Medicine" to start.' : "No medicines match your search."}</div>
        ) : (
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 font-semibold border-b border-slate-200">
                <th className="py-2">Name</th><th>Batch</th><th>Expiry</th><th className="text-right">Qty</th>
                <th className="text-right">Purchase</th><th className="text-right">MRP</th><th className="text-right">GST%</th><th>Rack</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const st = expiryStatus(m.expiry);
                const low = Number(m.qty) <= Number(m.lowStockThreshold ?? settings.lowStockDefault);
                return (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">
                      <div className="font-semibold">{m.name}</div>
                      {m.generic && <div className="text-xs text-slate-500">{m.generic}</div>}
                    </td>
                    <td className="font-mono">{m.batch || "—"}</td>
                    <td className="font-mono">{fmtDate(m.expiry)}</td>
                    <td className="text-right font-mono">{m.qty}</td>
                    <td className="text-right font-mono">{fmtMoney(m.purchasePrice)}</td>
                    <td className="text-right font-mono">{fmtMoney(m.sellingPrice)}</td>
                    <td className="text-right font-mono">{m.gst || 0}%</td>
                    <td className="font-mono">{m.rack || "—"}</td>
                    <td className="space-x-1 whitespace-nowrap">
                      {st === "expired" ? <Badge tone="alert">Expired</Badge> : st === "expiring" ? <Badge tone="warn">Expiring</Badge> : <Badge tone="ok">OK</Badge>}
                      {low && <Badge tone="warn">Low</Badge>}
                    </td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => setModalMed(m)} className="text-xs font-semibold text-emerald-800 border border-slate-300 rounded px-2 py-1 mr-1 hover:bg-emerald-50">Edit</button>
                      <button onClick={() => onDelete(m.id)} className="text-xs font-semibold text-red-600 border border-slate-300 rounded px-2 py-1 hover:bg-red-50">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalMed && (
        <MedicineModal
          medicine={modalMed}
          lowStockDefault={settings.lowStockDefault}
          onClose={() => setModalMed(null)}
          onSave={async (id, payload) => {
            if (id) await onEdit(id, payload); else await onAdd(payload);
            setModalMed(null);
          }}
        />
      )}
    </div>
  );
}

function Billing({ medicines, settings, onGenerateBill }) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // {medicineId, name, qty, price, gst, maxQty}
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const q = search.trim().toLowerCase();
  let list = [...medicines].sort((a, b) => a.name.localeCompare(b.name));
  if (q) list = list.filter((m) => m.name.toLowerCase().includes(q));

  const addToCart = (med) => {
    if (Number(med.qty) <= 0) return;
    setCart((c) => {
      const existing = c.find((x) => x.medicineId === med.id);
      if (existing) {
        if (existing.qty >= Number(med.qty)) return c;
        return c.map((x) => (x.medicineId === med.id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...c, { medicineId: med.id, name: med.name, qty: 1, price: Number(med.sellingPrice) || 0, gst: Number(med.gst) || 0, maxQty: Number(med.qty) }];
    });
  };
  const updateQty = (id, val, max) => {
    const clamped = Math.max(1, Math.min(parseInt(val) || 1, max));
    setCart((c) => c.map((x) => (x.medicineId === id ? { ...x, qty: clamped } : x)));
  };
  const removeFromCart = (id) => setCart((c) => c.filter((x) => x.medicineId !== id));

  const lines = cart.map((c) => {
    const lineTotal = c.qty * c.price;
    const gstAmt = lineTotal * (c.gst / 100);
    return { ...c, lineTotal, gstAmt };
  });
  const subtotal = lines.reduce((s, c) => s + c.lineTotal, 0);
  const gstTotal = lines.reduce((s, c) => s + c.gstAmt, 0);
  const discountNum = Number(discount) || 0;
  const grandTotal = Math.max(0, subtotal + gstTotal - discountNum);

  const generate = async () => {
    if (lines.length === 0) return;
    setBusy(true);
    setErr("");
    try {
      await onGenerateBill({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        discount: discountNum,
        items: cart.map((c) => ({ medicineId: c.medicineId, qty: c.qty })),
      });
      setCart([]); setDiscount(0); setCustomerName(""); setCustomerPhone("");
      setTimeout(() => window.print(), 150);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <div className="text-sm text-slate-500 mt-0.5">Create a new sale and print the receipt</div>
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 items-start print:hidden">
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-sm text-slate-900 mb-3">Find medicine</h3>
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" placeholder="Search medicine to add…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-96 overflow-auto space-y-2">
              {list.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-5">{medicines.length === 0 ? "No medicines in inventory yet." : "No matches."}</div>
              ) : list.map((m) => {
                const out = Number(m.qty) <= 0;
                return (
                  <div key={m.id} onClick={() => !out && addToCart(m)} className={`flex justify-between items-center p-2.5 border border-slate-200 rounded-lg bg-white ${out ? "opacity-40" : "cursor-pointer hover:border-emerald-600"}`}>
                    <div>
                      <div className="font-semibold text-sm">{m.name}</div>
                      <div className="text-xs text-slate-500 font-mono">Batch {m.batch || "—"} · Exp {fmtDate(m.expiry)} · Stock {m.qty}</div>
                    </div>
                    <div className="font-mono font-semibold text-sm">{fmtMoney(m.sellingPrice)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-sm text-slate-900 mb-3">Cart</h3>
            {lines.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-5">No items added yet. Click a medicine on the left to add it.</div>
            ) : lines.map((c) => (
              <div key={c.medicineId} className="flex items-center gap-2 mb-2">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{c.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{fmtMoney(c.price)} × {c.qty} = {fmtMoney(c.lineTotal)}</div>
                </div>
                <input type="number" min="1" max={c.maxQty} value={c.qty} onChange={(e) => updateQty(c.medicineId, e.target.value, c.maxQty)} className="w-14 text-center border border-slate-300 rounded-md py-1 text-sm font-mono" />
                <button onClick={() => removeFromCart(c.medicineId)} className="text-red-600 hover:text-red-700 px-1"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-sm text-slate-900 mb-3">Customer (optional)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Customer name</label>
                <input className="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in" /></div>
              <div><label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
                <input className="w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="98xxxxxxxx" /></div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-bold text-sm text-slate-900 mb-3">Bill summary</h3>
            <div className="flex justify-between text-sm font-mono mb-1"><span>Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
            <div className="flex justify-between text-sm font-mono mb-1"><span>GST</span><span>{fmtMoney(gstTotal)}</span></div>
            <div className="flex justify-between items-center text-sm font-mono mb-2">
              <span>Discount (₹)</span>
              <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 text-right border border-slate-300 rounded-md py-1 px-2 font-mono text-sm" />
            </div>
            <hr className="border-dashed border-slate-300 my-2" />
            <div className="flex justify-between font-mono font-bold text-base"><span>Total</span><span>{fmtMoney(grandTotal)}</span></div>
            {err && <div className="text-red-600 text-xs mt-2">{err}</div>}
            <div className="flex gap-2 mt-4">
              <button disabled={lines.length === 0 || busy} onClick={generate} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-40">
                {busy ? "Generating…" : "Generate Bill"}
              </button>
              <button disabled={lines.length === 0} onClick={() => { setCart([]); setDiscount(0); }} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Clear</button>
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Stock is deducted automatically when the bill is generated.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptPrint({ bill, settings }) {
  if (!bill) return null;
  return (
    <div className="hidden print:block max-w-xs mx-auto font-mono text-xs">
      <div className="text-center mb-2">
        <div className="font-bold text-base">{settings.shopName}</div>
        <div className="text-slate-500">{settings.address}{settings.phone ? ` · ${settings.phone}` : ""}</div>
        {settings.gstNumber && <div className="text-slate-500">GSTIN: {settings.gstNumber}</div>}
      </div>
      <hr className="border-dashed my-2" />
      <div className="flex justify-between"><span>Bill No.</span><span>{bill.billNo}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{fmtDate(bill.date)}</span></div>
      <div className="flex justify-between"><span>Customer</span><span>{bill.customerName || "Walk-in"}</span></div>
      <hr className="border-dashed my-2" />
      {bill.items.map((it, i) => (
        <div key={i} className="flex justify-between"><span>{it.name} ×{it.qty}</span><span>{fmtMoney(it.qty * it.price)}</span></div>
      ))}
      <hr className="border-dashed my-2" />
      <div className="flex justify-between"><span>Subtotal</span><span>{fmtMoney(bill.subtotal)}</span></div>
      <div className="flex justify-between"><span>GST</span><span>{fmtMoney(bill.gstTotal)}</span></div>
      {bill.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmtMoney(bill.discount)}</span></div>}
      <div className="flex justify-between font-bold text-sm border-t border-slate-300 mt-1 pt-1"><span>Total</span><span>{fmtMoney(bill.total)}</span></div>
      <div className="text-center text-slate-500 mt-3">Thank you. Get well soon.</div>
    </div>
  );
}

function HistoryView({ bills, onPrint }) {
  const sorted = [...bills].sort((a, b) => (b.id > a.id ? 1 : -1));
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Sales History</h1>
        <div className="text-sm text-slate-500 mt-0.5">{bills.length} bill{bills.length === 1 ? "" : "s"} recorded</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-6">No bills yet. Generate one from the Billing tab.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-slate-500 font-semibold border-b border-slate-200">
              <th className="py-2">Bill No.</th><th>Date</th><th>Customer</th><th className="text-right">Items</th><th className="text-right">Total</th><th></th>
            </tr></thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-mono">{b.billNo}</td>
                  <td className="font-mono">{fmtDate(b.date)}</td>
                  <td>{b.customerName || "Walk-in"}</td>
                  <td className="text-right font-mono">{b.itemCount ?? b.items?.length ?? "—"}</td>
                  <td className="text-right font-mono">{fmtMoney(b.total)}</td>
                  <td><button onClick={() => onPrint(b.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 border border-slate-300 rounded px-2 py-1 hover:bg-emerald-50"><Printer className="w-3.5 h-3.5" /> Print</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SettingsView({ settings, onSave }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(settings), [settings]);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        shopName: form.shopName.trim() || "My Chemist Shop",
        phone: form.phone.trim(), address: form.address.trim(), gstNumber: form.gstNumber.trim(),
        billPrefix: form.billPrefix.trim() || "INV", lowStockDefault: parseInt(form.lowStockDefault) || 10,
      });
    } finally { setSaving(false); }
  };
  const inputCls = "w-full px-2.5 py-2 border border-slate-300 rounded-md text-sm";

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <div className="text-sm text-slate-500 mt-0.5">Shop details used on printed receipts</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shop name"><input className={inputCls} value={form.shopName || ""} onChange={set("shopName")} /></Field>
          <Field label="Phone"><input className={inputCls} value={form.phone || ""} onChange={set("phone")} /></Field>
          <Field label="Address"><input className={inputCls} value={form.address || ""} onChange={set("address")} /></Field>
          <Field label="GST number"><input className={inputCls} value={form.gstNumber || ""} onChange={set("gstNumber")} /></Field>
          <Field label="Bill number prefix"><input className={inputCls} value={form.billPrefix || ""} onChange={set("billPrefix")} /></Field>
          <Field label="Default low-stock threshold"><input type="number" min="0" className={inputCls} value={form.lowStockDefault ?? 10} onChange={set("lowStockDefault")} /></Field>
        </div>
        <button disabled={saving} onClick={save} className="mt-4 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

export default function ChemistShopApp() {
  const [view, setView] = useState("dashboard");
  const [settings, setSettings] = useState({ shopName: "My Chemist Shop", address: "", phone: "", gstNumber: "", billPrefix: "INV", billCounter: 1, lowStockDefault: 10 });
  const [medicines, setMedicines] = useState([]);
  const [bills, setBills] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [connError, setConnError] = useState(null);
  const [lastBill, setLastBill] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, m, b] = await Promise.all([apiGet("/settings"), apiGet("/medicines"), apiGet("/bills")]);
      setSettings(s); setMedicines(m); setBills(b); setConnError(null);
    } catch (e) {
      setConnError(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAddMedicine = async (payload) => {
    const created = await apiSend("POST", "/medicines", payload);
    setMedicines((m) => [...m, created]);
  };
  const handleEditMedicine = async (id, payload) => {
    const updated = await apiSend("PUT", `/medicines/${id}`, payload);
    setMedicines((m) => m.map((x) => (x.id === id ? updated : x)));
  };
  const handleDeleteMedicine = async (id) => {
    if (!window.confirm("Delete this medicine from inventory? This cannot be undone.")) return;
    try {
      await apiSend("DELETE", `/medicines/${id}`);
      setMedicines((m) => m.filter((x) => x.id !== id));
    } catch (e) {
      window.alert("Could not delete: " + e.message);
    }
  };
  const handleGenerateBill = async (payload) => {
    const bill = await apiSend("POST", "/bills", payload);
    const [m, b, s] = await Promise.all([apiGet("/medicines"), apiGet("/bills"), apiGet("/settings")]);
    setMedicines(m); setBills(b); setSettings(s);
    setLastBill(bill);
  };
  const handlePrintBill = async (id) => {
    try {
      const bill = await apiGet(`/bills/${id}`);
      setLastBill(bill);
      setTimeout(() => window.print(), 150);
    } catch (e) {
      window.alert("Could not load bill: " + e.message);
    }
  };
  const handleSaveSettings = async (payload) => {
    const updated = await apiSend("PUT", "/settings", payload);
    setSettings(updated);
  };

  if (!loaded) {
    return <div className="min-h-[400px] flex items-center justify-center text-slate-500 text-sm">Loading your shop data…</div>;
  }

  return (
    <div className="flex min-h-[600px] bg-slate-50 font-sans">
      <Sidebar view={view} setView={setView} shopName={settings.shopName} />
      <div className="flex-1 p-6 min-w-0 print:p-0">
        {connError ? (
          <ConnectionError message={connError} onRetry={loadAll} />
        ) : (
          <>
            <div className="print:hidden">
              {view === "dashboard" && <Dashboard medicines={medicines} bills={bills} setView={setView} />}
              {view === "inventory" && <Inventory medicines={medicines} settings={settings} onAdd={handleAddMedicine} onEdit={handleEditMedicine} onDelete={handleDeleteMedicine} />}
              {view === "billing" && <Billing medicines={medicines} settings={settings} onGenerateBill={handleGenerateBill} />}
              {view === "history" && <HistoryView bills={bills} onPrint={handlePrintBill} />}
              {view === "settings" && <SettingsView settings={settings} onSave={handleSaveSettings} />}
            </div>
            <ReceiptPrint bill={lastBill} settings={settings} />
          </>
        )}
      </div>
    </div>
  );
}

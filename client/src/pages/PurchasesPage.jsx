import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, Plus, Trash2, Search, FileText, Eye, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { fmtMoney, fmtDate } from '../utils/formatters';

export function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const { showSuccess, showError } = useToast();

  // New Purchase Form
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('NEFT/RTGS');
  const [notes, setNotes] = useState('');

  // Purchase Items Grid
  const [items, setItems] = useState([
    {
      medicineId: '',
      batchNo: '',
      expiryDate: '',
      qty: 10,
      freeQty: 0,
      purchaseCost: 0,
      mrp: 0,
      sellingPrice: 0,
      discountPercent: 0,
      gstRate: 12,
    },
  ]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [purs, sups, meds] = await Promise.all([
        api.get('/purchases'),
        api.get('/suppliers'),
        api.get('/medicines'),
      ]);
      setPurchases(purs);
      setSuppliers(sups);
      setMedicines(meds);
      if (sups.length > 0) setSupplierId(sups[0].id);
    } catch (err) {
      showError('Failed to load purchase invoices: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        medicineId: medicines[0]?.id || '',
        batchNo: '',
        expiryDate: '',
        qty: 10,
        freeQty: 0,
        purchaseCost: 0,
        mrp: 0,
        sellingPrice: 0,
        discountPercent: 0,
        gstRate: 12,
      },
    ]);
  };

  const handleRemoveItemRow = (idx) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx, field, val) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [field]: val };
        if (field === 'medicineId') {
          const med = medicines.find((m) => m.id === val);
          if (med) {
            updated.gstRate = med.gst_rate || 12;
            updated.mrp = med.mrp || 0;
            updated.sellingPrice = med.sellingPrice || 0;
          }
        }
        return updated;
      })
    );
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let gstTotal = 0;
    for (const it of items) {
      const cost = (parseFloat(it.purchaseCost) || 0) * (parseInt(it.qty) || 0);
      const disc = cost * ((parseFloat(it.discountPercent) || 0) / 100);
      const taxable = cost - disc;
      const gst = taxable * ((parseFloat(it.gstRate) || 0) / 100);
      subtotal += taxable;
      gstTotal += gst;
    }
    const discAmt = parseFloat(discountAmount) || 0;
    const total = Math.max(0, subtotal + gstTotal - discAmt);
    return { subtotal, gstTotal, total };
  };

  const totals = calculateTotals();

  const handleSavePurchase = async () => {
    if (!supplierInvoiceNo.trim()) {
      showError('Supplier Invoice Number is required');
      return;
    }

    const invalidRow = items.find((it) => !it.medicineId || !it.batchNo || !it.expiryDate);
    if (invalidRow) {
      showError('All items must have a medicine, batch number, and expiry date selected');
      return;
    }

    try {
      const payload = {
        supplierId,
        supplierInvoiceNo: supplierInvoiceNo.trim(),
        supplierInvoiceDate,
        purchaseDate,
        discountAmount: parseFloat(discountAmount) || 0,
        paidAmount: parseFloat(paidAmount) || 0,
        paymentMode,
        notes,
        items,
      };

      const res = await api.post('/purchases', payload);
      showSuccess(`Purchase Inward #${res.purchase_no} recorded successfully!`);
      setIsAddModalOpen(false);
      loadData();
    } catch (err) {
      showError(err.message);
    }
  };

  const columns = [
    {
      header: 'Purchase #',
      key: 'purchaseNo',
      render: (p) => <span className="font-mono font-bold text-slate-900">{p.purchaseNo}</span>,
    },
    {
      header: 'Supplier',
      key: 'supplierName',
      render: (p) => (
        <div>
          <div className="font-bold text-slate-900">{p.supplierName}</div>
          <div className="text-[10px] text-slate-400">Inv: {p.supplierInvoiceNo} ({fmtDate(p.supplierInvoiceDate)})</div>
        </div>
      ),
    },
    {
      header: 'Date',
      key: 'purchaseDate',
      render: (p) => <span className="font-mono">{fmtDate(p.purchaseDate)}</span>,
    },
    {
      header: 'Items',
      key: 'itemCount',
      align: 'center',
      render: (p) => <span className="font-mono font-bold">{p.itemCount} items</span>,
    },
    {
      header: 'Total Amount',
      key: 'totalAmount',
      align: 'right',
      render: (p) => (
        <div className="text-right font-mono">
          <div className="font-bold text-slate-900">{fmtMoney(p.totalAmount)}</div>
          <div className="text-[10px] text-slate-400">Paid: {fmtMoney(p.paidAmount)}</div>
        </div>
      ),
    },
    {
      header: 'Payment Status',
      key: 'paymentStatus',
      align: 'center',
      render: (p) => {
        const tone = p.paymentStatus === 'PAID' ? 'ok' : p.paymentStatus === 'PARTIAL' ? 'warn' : 'alert';
        return <Badge tone={tone}>{p.paymentStatus}</Badge>;
      },
    },
    {
      header: 'View',
      key: 'actions',
      align: 'center',
      sortable: false,
      exportable: false,
      render: (p) => (
        <button
          onClick={() => setViewInvoice(p)}
          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
          title="View Detail"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Purchase Inward Management</h1>
          <p className="text-xs text-slate-400">Record supplier purchase bills, 10+1 free schemes, and batch stock entries</p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Inward Purchase Entry</span>
        </button>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={purchases}
        searchPlaceholder="Search purchases by supplier, invoice number, or purchase ID…"
        searchFields={['purchaseNo', 'supplierName', 'supplierInvoiceNo']}
        exportFilename="purchase_inward_register"
      />

      {/* Inward Purchase Entry Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record Supplier Inward Purchase Bill"
        subtitle="Auto-creates new medicine batches and updates supplier ledger balance"
        maxWidth="max-w-5xl"
      >
        <div className="space-y-4 text-xs">
          {/* Supplier Header Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Supplier *</label>
              <select
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.companyName || s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Supplier Invoice No. *</label>
              <input
                type="text"
                placeholder="e.g. INV-9948"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Supplier Bill Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                value={supplierInvoiceDate}
                onChange={(e) => setSupplierInvoiceDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Receiving Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>

          {/* Items Entry Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Inward Medicine Batches</h3>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Row
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-48">Medicine</th>
                    <th className="p-2 w-28">Batch No</th>
                    <th className="p-2 w-28">Expiry</th>
                    <th className="p-2 w-16 text-center">Qty</th>
                    <th className="p-2 w-16 text-center">Free (10+1)</th>
                    <th className="p-2 w-20 text-right">Cost (₹)</th>
                    <th className="p-2 w-20 text-right">MRP (₹)</th>
                    <th className="p-2 w-16 text-center">GST%</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2">
                        <select
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          value={it.medicineId}
                          onChange={(e) => updateItemRow(idx, 'medicineId', e.target.value)}
                        >
                          <option value="">Select Medicine…</option>
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.strength})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          placeholder="Batch"
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold text-xs"
                          value={it.batchNo}
                          onChange={(e) => updateItemRow(idx, 'batchNo', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                          value={it.expiryDate}
                          onChange={(e) => updateItemRow(idx, 'expiryDate', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-mono text-center text-xs"
                          value={it.qty}
                          onChange={(e) => updateItemRow(idx, 'qty', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          className="w-full p-1.5 bg-emerald-50 border border-emerald-200 rounded-lg font-mono text-center text-xs font-bold text-emerald-800"
                          value={it.freeQty}
                          onChange={(e) => updateItemRow(idx, 'freeQty', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Cost"
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-mono text-right text-xs"
                          value={it.purchaseCost}
                          onChange={(e) => updateItemRow(idx, 'purchaseCost', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="MRP"
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-mono text-right text-xs"
                          value={it.mrp}
                          onChange={(e) => updateItemRow(idx, 'mrp', e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-semibold">{it.gstRate}%</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleRemoveItemRow(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financials & Settlement Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Mode</label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  <option value="NEFT/RTGS">NEFT / Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CREDIT">Supplier Credit (Pay Later)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount Paid Now (₹)</label>
                <input
                  type="number"
                  step="10"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1 text-xs font-mono text-right">
              <div className="flex justify-between text-slate-500">
                <span>Taxable Subtotal:</span>
                <span>{fmtMoney(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>GST Total:</span>
                <span>{fmtMoney(totals.gstTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm border-t border-slate-300 pt-1 text-slate-900">
                <span>Invoice Total:</span>
                <span>{fmtMoney(totals.total)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-amber-700 font-semibold pt-1">
                <span>Payable Balance Remaining:</span>
                <span>{fmtMoney(Math.max(0, totals.total - (parseFloat(paidAmount) || 0)))}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePurchase}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20"
            >
              Save Inward Purchase
            </button>
          </div>
        </div>
      </Modal>

      {/* View Detail Modal */}
      <Modal
        isOpen={!!viewInvoice}
        onClose={() => setViewInvoice(null)}
        title={`Purchase Inward — ${viewInvoice?.purchaseNo || ''}`}
        subtitle={`Supplier: ${viewInvoice?.supplierName || ''} · Invoice #${viewInvoice?.supplierInvoiceNo || ''}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4 text-xs font-mono">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border">
            <div><span className="text-slate-400 block text-[10px]">Purchase Date</span><strong>{fmtDate(viewInvoice?.purchaseDate)}</strong></div>
            <div><span className="text-slate-400 block text-[10px]">Total Amount</span><strong>{fmtMoney(viewInvoice?.totalAmount)}</strong></div>
            <div><span className="text-slate-400 block text-[10px]">Paid Amount</span><strong>{fmtMoney(viewInvoice?.paidAmount)}</strong></div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs">
            Batch inventory and stock levels updated atomically upon inward purchase confirmation.
          </div>
        </div>
      </Modal>
    </div>
  );
}

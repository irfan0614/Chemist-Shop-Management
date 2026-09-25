import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Plus, Search, Eye, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { fmtMoney, fmtDate } from '../utils/formatters';

export function ReturnsPage() {
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'purchases'
  const [salesReturns, setSalesReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSalesReturnModalOpen, setIsSalesReturnModalOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  // Sales Return form
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [foundInvoice, setFoundInvoice] = useState(null);
  const [returnItems, setReturnItems] = useState({}); // { [medicineId_batchId]: returnQty }
  const [refundMode, setRefundMode] = useState('CASH');
  const [returnReason, setReturnReason] = useState('Customer unused / unneeded medicine');

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, pr] = await Promise.all([
        api.get('/returns/sales'),
        api.get('/returns/purchases'),
      ]);
      setSalesReturns(sr);
      setPurchaseReturns(pr);
    } catch (err) {
      showError('Failed to load return records: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  const handleLookupInvoice = async () => {
    if (!invoiceSearch.trim()) return;
    try {
      const inv = await api.get(`/pos/bills/${invoiceSearch.trim()}`);
      setFoundInvoice(inv);
      const initialQtys = {};
      (inv.items || []).forEach((it) => {
        initialQtys[`${it.medicineId}_${it.batchId}`] = 0;
      });
      setReturnItems(initialQtys);
    } catch (err) {
      showError(`Original invoice "${invoiceSearch}" not found`);
      setFoundInvoice(null);
    }
  };

  const handleProcessSalesReturn = async () => {
    if (!foundInvoice) return;

    const itemsToReturn = [];
    for (const it of foundInvoice.items || []) {
      const key = `${it.medicineId}_${it.batchId}`;
      const qty = parseInt(returnItems[key]) || 0;
      if (qty > 0) {
        itemsToReturn.push({
          medicineId: it.medicineId,
          batchId: it.batchId,
          returnQty: qty,
          restockCondition: 'RESTOCKED',
        });
      }
    }

    if (itemsToReturn.length === 0) {
      showError('Please specify return quantity for at least one item');
      return;
    }

    try {
      const res = await api.post('/returns/sales', {
        invoiceNo: foundInvoice.invoice_no,
        refundMode,
        reason: returnReason,
        items: itemsToReturn,
      });

      showSuccess(`Sales Return #${res.return_no} processed. Refund: ${fmtMoney(res.refund_amount)}`);
      setIsSalesReturnModalOpen(false);
      setFoundInvoice(null);
      setInvoiceSearch('');
      loadReturns();
    } catch (err) {
      showError(err.message);
    }
  };

  const salesReturnColumns = [
    {
      header: 'Return #',
      key: 'return_no',
      render: (r) => <span className="font-mono font-bold text-slate-900">{r.return_no}</span>,
    },
    {
      header: 'Orig Invoice #',
      key: 'invoice_no',
      render: (r) => <span className="font-mono text-emerald-700 font-bold">{r.invoice_no}</span>,
    },
    {
      header: 'Patient Name',
      key: 'customer_name',
      render: (r) => <span className="font-bold text-slate-900">{r.customer_name || 'Walk-in'}</span>,
    },
    {
      header: 'Date',
      key: 'return_date',
      render: (r) => <span className="font-mono">{fmtDate(r.return_date)}</span>,
    },
    {
      header: 'Refund Mode',
      key: 'refund_mode',
      render: (r) => <Badge tone="neutral">{r.refund_mode}</Badge>,
    },
    {
      header: 'Refund Amount',
      key: 'refund_amount',
      align: 'right',
      render: (r) => <span className="font-mono font-bold text-rose-700">{fmtMoney(r.refund_amount)}</span>,
    },
  ];

  const purchReturnColumns = [
    {
      header: 'Return #',
      key: 'return_no',
      render: (r) => <span className="font-mono font-bold text-slate-900">{r.return_no}</span>,
    },
    {
      header: 'Debit Note #',
      key: 'debit_note_no',
      render: (r) => <span className="font-mono font-bold text-rose-700">{r.debit_note_no}</span>,
    },
    {
      header: 'Supplier Name',
      key: 'supplier_name',
      render: (r) => <span className="font-bold text-slate-900">{r.supplier_name}</span>,
    },
    {
      header: 'Return Date',
      key: 'return_date',
      render: (r) => <span className="font-mono">{fmtDate(r.return_date)}</span>,
    },
    {
      header: 'Reason',
      key: 'reason',
      render: (r) => <Badge tone="warn">{r.reason}</Badge>,
    },
    {
      header: 'Debit Total',
      key: 'total_amount',
      align: 'right',
      render: (r) => <span className="font-mono font-bold text-slate-900">{fmtMoney(r.total_amount)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Returns & Supplier Debit Notes</h1>
          <p className="text-xs text-slate-400">Manage patient medicine returns, refunds, supplier returns, and expiry write-offs</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'sales'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Patient Returns
            </button>
            <button
              onClick={() => setActiveTab('purchases')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'purchases'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Supplier Debit Notes
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={RotateCcw}
            onClick={() => setIsSalesReturnModalOpen(true)}
          >
            Process Patient Return
          </Button>
        </div>
      </div>

      {/* Main Table */}
      {activeTab === 'sales' ? (
        <DataTable
          columns={salesReturnColumns}
          data={salesReturns}
          searchPlaceholder="Search customer sales returns by return #, invoice #, or customer…"
          searchFields={['return_no', 'invoice_no', 'customer_name']}
          exportFilename="sales_returns_register"
        />
      ) : (
        <DataTable
          columns={purchReturnColumns}
          data={purchaseReturns}
          searchPlaceholder="Search supplier debit notes by return #, debit note #, or supplier…"
          searchFields={['return_no', 'debit_note_no', 'supplier_name', 'reason']}
          exportFilename="supplier_debit_notes"
        />
      )}

      {/* Process Sales Return Modal */}
      <Modal
        isOpen={isSalesReturnModalOpen}
        onClose={() => setIsSalesReturnModalOpen(false)}
        title="Process Patient Sales Return"
        subtitle="Lookup original sales invoice and select items to restock and refund"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4 text-xs">
          {/* Lookup Input */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
              placeholder="Enter Original Invoice No (e.g. INV-1001)…"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={handleLookupInvoice}
              icon={Search}
            >
              Lookup Invoice
            </Button>
          </div>

          {/* Invoice Items & Return Selection */}
          {foundInvoice && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <div>
                  <strong>Invoice #{foundInvoice.invoice_no}</strong> ({fmtDate(foundInvoice.invoice_date)})
                </div>
                <div>Patient: <strong>{foundInvoice.customer_name || 'Walk-in'}</strong></div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                      <th className="py-1">Medicine (Batch)</th>
                      <th className="text-center">Sold Qty</th>
                      <th className="text-right">Unit Rate</th>
                      <th className="text-center w-28">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(foundInvoice.items || []).map((it) => {
                      const key = `${it.medicineId}_${it.batchId}`;
                      return (
                        <tr key={key}>
                          <td className="py-2">
                            <div className="font-bold text-slate-900">{it.medicineName}</div>
                            <div className="text-[10px] font-mono text-slate-400">Batch: {it.batchNo}</div>
                          </td>
                          <td className="text-center font-mono font-bold">{it.qty}</td>
                          <td className="text-right font-mono">{fmtMoney(it.unitPrice)}</td>
                          <td className="text-center">
                            <input
                              type="number"
                              min="0"
                              max={it.qty}
                              className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-mono font-bold"
                              value={returnItems[key] || 0}
                              onChange={(e) =>
                                setReturnItems({ ...returnItems, [key]: Math.min(it.qty, parseInt(e.target.value) || 0) })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Refund Method</label>
                  <select
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    value={refundMode}
                    onChange={(e) => setRefundMode(e.target.value)}
                  >
                    <option value="CASH">Cash Refund</option>
                    <option value="CREDIT_NOTE">Store Credit / Note</option>
                    <option value="LEDGER_ADJUSTMENT">Adjust Against Khata Due</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Return Reason</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setIsSalesReturnModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleProcessSalesReturn}
                >
                  Confirm Restock & Refund
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

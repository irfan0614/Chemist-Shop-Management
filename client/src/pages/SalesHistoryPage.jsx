import React, { useState, useEffect, useCallback } from 'react';
import { History, Printer, Eye, Search, FileText } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useShop } from '../context/ShopContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { fmtMoney, fmtDate } from '../utils/formatters';

export function SalesHistoryPage() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewBill, setViewBill] = useState(null);
  const { showError, showSuccess } = useToast();
  const { settings, triggerPrint } = useShop();

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/pos/bills');
      setBills(data);
    } catch (err) {
      showError('Failed to load sales history: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const handleReprint = (bill, format = null) => {
    triggerPrint(bill, format);
    showSuccess(`Printing invoice #${bill.invoice_no}`);
  };

  const columns = [
    {
      header: 'Invoice #',
      key: 'invoice_no',
      render: (b) => <span className="font-mono font-bold text-slate-900">{b.invoice_no}</span>,
    },
    {
      header: 'Date & Time',
      key: 'invoice_date',
      render: (b) => (
        <div>
          <div className="font-mono font-bold text-slate-800">{fmtDate(b.invoice_date)}</div>
          <div className="text-[10px] text-slate-400 font-mono">{new Date(b.created_at).toLocaleTimeString()}</div>
        </div>
      ),
    },
    {
      header: 'Patient / Customer',
      key: 'customer_name',
      render: (b) => (
        <div>
          <div className="font-bold text-slate-900">{b.customer_name || 'Walk-in'}</div>
          {b.customer_phone && <div className="text-[10px] text-slate-400 font-mono">Ph: {b.customer_phone}</div>}
        </div>
      ),
    },
    {
      header: 'Doctor Prescribed',
      key: 'doctor_name',
      render: (b) => <span className="text-xs text-slate-600">{b.doctor_name || '—'}</span>,
    },
    {
      header: 'Payment Mode',
      key: 'payment_mode',
      render: (b) => <Badge tone={b.payment_mode === 'UPI' ? 'ok' : b.payment_mode === 'CREDIT' ? 'warn' : 'neutral'}>{b.payment_mode}</Badge>,
    },
    {
      header: 'Bill Amount',
      key: 'total_amount',
      align: 'right',
      render: (b) => <span className="font-mono font-bold text-emerald-700">{fmtMoney(b.total_amount)}</span>,
    },
    {
      header: 'Print / View',
      key: 'actions',
      align: 'center',
      sortable: false,
      exportable: false,
      render: (b) => (
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => handleReprint(b)}
            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Reprint Thermal Receipt"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewBill(b)}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Sales Register & Invoicing History</h1>
          <p className="text-xs text-slate-400">Complete archive of counter sales, thermal duplicates, and patient records</p>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={bills}
        searchPlaceholder="Search invoices by bill #, customer name, phone, or doctor…"
        searchFields={['invoice_no', 'customer_name', 'customer_phone', 'doctor_name']}
        exportFilename="sales_invoicing_history"
      />

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={!!viewBill}
        onClose={() => setViewBill(null)}
        title={`Invoice #${viewBill?.invoice_no || ''}`}
        subtitle={`Patient: ${viewBill?.customer_name || 'Walk-in'} · Date: ${fmtDate(viewBill?.invoice_date)}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-3 text-xs">
          <table className="w-full text-left border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2">Batch</th>
                <th className="p-2 text-center">Qty</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {(viewBill?.items || []).map((it, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-2 font-sans font-semibold">{it.medicineName}</td>
                  <td className="p-2 text-slate-600">{it.batchNo}</td>
                  <td className="p-2 text-center font-bold">{it.qty}</td>
                  <td className="p-2 text-right">{fmtMoney(it.unitPrice)}</td>
                  <td className="p-2 text-right font-bold">{fmtMoney(it.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="space-y-0.5">
              <div>Payment Mode: <strong className="uppercase">{viewBill?.payment_mode}</strong></div>
              <div>Prescribing Dr: <strong>{viewBill?.doctor_name || '—'}</strong></div>
            </div>
            <div className="text-right font-mono">
              <div className="text-slate-400 text-[10px]">Net Grand Total</div>
              <div className="text-lg font-black text-emerald-700">{fmtMoney(viewBill?.total_amount)}</div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={() => handleReprint(viewBill, '80mm')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Thermal Receipt (80mm)</span>
            </button>
            <button
              onClick={() => handleReprint(viewBill, 'A4')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>A4 GST Tax Invoice</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

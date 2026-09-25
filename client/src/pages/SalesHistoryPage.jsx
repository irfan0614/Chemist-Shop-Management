import React, { useState, useEffect, useCallback } from 'react';
import { History, Printer, Eye, Search, FileText } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useShop } from '../context/ShopContext';
import { DataTable } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { fmtMoney, fmtDate } from '../utils/formatters';
import { InvoicePreviewModal } from '../components/pos/InvoicePreviewModal';

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
          <Button
            size="icon-sm"
            variant="ghost"
            icon={Printer}
            onClick={() => handleReprint(b)}
            className="text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
            title="Reprint Receipt"
          />
          <Button
            size="icon-sm"
            variant="ghost"
            icon={Eye}
            onClick={() => setViewBill(b)}
            className="text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            title="View & Print Preview"
          />
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

      {/* Invoice Live Preview & Print Modal */}
      <InvoicePreviewModal
        isOpen={!!viewBill}
        onClose={() => setViewBill(null)}
        invoice={viewBill}
      />
    </div>
  );
}

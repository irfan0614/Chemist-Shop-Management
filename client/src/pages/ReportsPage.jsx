import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Download, TrendingUp, Calendar, FileSpreadsheet, PieChart, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Badge } from '../components/common/Badge';
import { fmtMoney } from '../utils/formatters';

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState('gst'); // 'gst' | 'hsn' | 'kpis'
  const [gstData, setGstData] = useState({ rates: [], hsnSummary: [] });
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showError } = useToast();

  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      const [gst, dash] = await Promise.all([
        api.get('/reports/gst-summary'),
        api.get('/reports/dashboard-summary'),
      ]);
      setGstData(gst);
      setDashboardData(dash);
    } catch (err) {
      showError('Failed to load reports: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  const gstColumns = [
    {
      header: 'GST Rate Slab',
      key: 'rate',
      render: (r) => <span className="font-bold text-slate-900 font-mono">{r.rate}% Slab</span>,
    },
    {
      header: 'Taxable Turnover',
      key: 'taxable',
      align: 'right',
      render: (r) => <span className="font-mono font-bold text-slate-800">{fmtMoney(r.taxable)}</span>,
    },
    {
      header: 'CGST (Central)',
      key: 'cgst',
      align: 'right',
      render: (r) => <span className="font-mono text-slate-600">{fmtMoney(r.cgst)}</span>,
    },
    {
      header: 'SGST (State)',
      key: 'sgst',
      align: 'right',
      render: (r) => <span className="font-mono text-slate-600">{fmtMoney(r.sgst)}</span>,
    },
    {
      header: 'Total GST Liability',
      key: 'totalTax',
      align: 'right',
      render: (r) => <span className="font-mono font-bold text-emerald-700">{fmtMoney(r.totalTax)}</span>,
    },
  ];

  const hsnColumns = [
    {
      header: 'HSN Code',
      key: 'hsnCode',
      render: (h) => <span className="font-mono font-bold text-slate-900">{h.hsnCode}</span>,
    },
    {
      header: 'Description',
      key: 'description',
      render: (h) => <span className="text-xs text-slate-600">{h.description}</span>,
    },
    {
      header: 'Total Qty Sold',
      key: 'totalQty',
      align: 'center',
      render: (h) => <span className="font-mono font-bold">{h.totalQty} Units</span>,
    },
    {
      header: 'Taxable Value',
      key: 'taxableAmount',
      align: 'right',
      render: (h) => <span className="font-mono font-bold text-slate-900">{fmtMoney(h.taxableAmount)}</span>,
    },
    {
      header: 'Total Tax',
      key: 'totalTax',
      align: 'right',
      render: (h) => <span className="font-mono font-bold text-emerald-700">{fmtMoney(h.totalTax)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Tax, Accounting & Compliance Reports</h1>
          <p className="text-xs text-slate-400">GSTR-1 tax rate summaries, HSN code breakdowns, and profit margins</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('gst')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'gst' ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              GSTR-1 Summary
            </button>
            <button
              onClick={() => setActiveTab('hsn')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'hsn' ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              HSN Summary
            </button>
          </div>
        </div>
      </div>

      {/* Tax Report Data */}
      {activeTab === 'gst' ? (
        <div className="space-y-4">
          <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-300 font-bold">Total Sales Turnover</div>
              <div className="text-2xl font-black font-mono tracking-tight mt-1">{fmtMoney(gstData.totalSales || 0)}</div>
            </div>
            <div className="text-right font-mono text-xs text-emerald-200">
              {gstData.totalInvoices || 0} Invoices Generated
            </div>
          </div>

          <DataTable
            columns={gstColumns}
            data={gstData.rates || []}
            searchPlaceholder="Search GST tax rate slabs…"
            searchFields={['rate']}
            exportFilename="GSTR1_Tax_Slab_Summary"
          />
        </div>
      ) : (
        <DataTable
          columns={hsnColumns}
          data={gstData.hsnSummary || []}
          searchPlaceholder="Search by HSN code or description…"
          searchFields={['hsnCode', 'description']}
          exportFilename="HSN_Wise_Summary_Report"
        />
      )}
    </div>
  );
}
